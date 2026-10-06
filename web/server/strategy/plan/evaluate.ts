import { createRandom } from './random.ts';
import {
  PLAN_BUDGET_CEILING,
  type CandidateResult,
  type NoiseBand,
  type PlayoutModel,
  type SearchBudget,
  type SearchSummary,
} from './types.ts';

const LIMITATIONS = [
  'Sampled worlds follow a named allocation model; they are not the concealed deal.',
  'Continuations follow a named playout policy for every seat, so values are model-dependent.',
  'Utilities order candidates. They are not probabilities of winning and are never shown as percentages.',
];

/** SYS-02: attribution for guarded root/candidate/world budget boundaries. */
export const PLAN_EVALUATOR_VERSION = 'plan-evaluator-1.1.0';

/**
 * GP-04: bounded information-set playouts on common sampled worlds.
 * Deterministic for a given model, candidate list, budget and seed. No clock.
 */
export function evaluateCandidates<World, Move>(
  model: PlayoutModel<World, Move>,
  candidates: readonly Move[],
  budget: SearchBudget,
  seed: number,
  noiseBand: NoiseBand = { z: 1.5, floor: 1 },
): SearchSummary {
  if (!candidates.length) throw new Error('At least one candidate is required.');
  const ids = candidates.map((move) => model.moveId(move));
  if (new Set(ids).size !== ids.length) throw new Error('Candidates must be distinct.');
  if (
    !Number.isInteger(budget.worlds) || budget.worlds < 1 || budget.worlds > PLAN_BUDGET_CEILING.worlds ||
    !Number.isInteger(budget.maxSteps) || budget.maxSteps < 1 || budget.maxSteps > PLAN_BUDGET_CEILING.maxSteps
  )
    throw new Error('Search budget is outside the declared ceiling.');
  if (!(noiseBand.z >= 0) || !(noiseBand.floor >= 0)) throw new Error('Invalid noise band.');
  const base = {
    schemaVersion: '1.0.0' as const,
    evaluatorVersion: PLAN_EVALUATOR_VERSION,
    modelId: model.id,
    modelVersion: model.version,
    allocationModel: model.allocationModel,
    continuationPolicy: model.continuationPolicy,
    seed,
    budget: { ...budget },
    noiseBand: { ...noiseBand },
  };
  const seeds = createRandom(seed >>> 0, 1);
  const weights: number[] = [];
  const values: number[][] = candidates.map(() => []);
  const eventTotals: Record<string, number>[] = candidates.map(() => ({}));
  let steps = 0,
    truncated = false,
    unavailable = 0;
  worlds: for (let index = 0; index < budget.worlds; index++) {
    // Do not sample another world when no root operation can be reserved.
    if (steps >= budget.maxSteps) {
      truncated = true;
      break;
    }
    const sampled = model.sample(seeds.next());
    if (!sampled || !(sampled.weight > 0)) {
      unavailable++;
      continue;
    }
    const row: number[] = [];
    const rowEvents: Record<string, number>[] = [];
    for (const candidate of candidates) {
      // A preceding terminal line can exhaust the cap without entering its continuation loop.
      if (steps >= budget.maxSteps) {
        truncated = true;
        break worlds;
      }
      const world = model.clone(sampled.world);
      steps++;
      model.apply(world, candidate);
      while (model.actor(world) !== null) {
        if (steps >= budget.maxSteps) {
          truncated = true;
          break worlds;
        }
        steps++;
        model.apply(world, model.defaultMove(world));
      }
      row.push(model.utility(world));
      rowEvents.push(model.events(world));
    }
    // A world counts only when every candidate finished on it, keeping comparisons paired.
    weights.push(sampled.weight);
    row.forEach((value, candidate) => values[candidate].push(value));
    rowEvents.forEach((events, candidate) => {
      for (const [name, value] of Object.entries(events))
        eventTotals[candidate][name] = (eventTotals[candidate][name] ?? 0) + value * sampled.weight;
    });
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!weights.length || !(total > 0))
    return {
      ...base,
      status: 'unavailable',
      reason: truncated ? 'budget-exhausted-before-first-world' : 'no-consistent-world',
      worldsUsed: 0, effectiveWorlds: 0, steps, leaderId: null, comparableIds: [], candidates: [],
      limitations: LIMITATIONS,
    };
  const squares = weights.reduce((sum, weight) => sum + weight * weight, 0);
  const mean = (series: number[]) => series.reduce((sum, value, i) => sum + value * weights[i], 0) / total;
  const spread = (series: number[], center: number) =>
    weights.length < 2
      ? null
      : Math.sqrt(series.reduce((sum, value, i) => sum + (weights[i] * (value - center)) ** 2, 0)) / total;
  const means = values.map(mean);
  let leader = 0;
  for (let i = 1; i < means.length; i++) if (means[i] > means[leader]) leader = i;
  const results: CandidateResult[] = candidates.map((_, i) => {
    const difference = values[leader].map((value, world) => value - values[i][world]);
    const behind = mean(difference);
    const behindError = i === leader ? 0 : spread(difference, behind);
    const band = behindError === null ? noiseBand.floor : Math.max(noiseBand.floor, noiseBand.z * behindError);
    return {
      moveId: ids[i],
      mean: means[i],
      standardError: spread(values[i], means[i]),
      behindLeader: behind,
      behindLeaderStandardError: behindError,
      comparable: i === leader || behind <= band,
      events: Object.fromEntries(Object.entries(eventTotals[i]).map(([name, value]) => [name, value / total])),
    };
  });
  return {
    ...base,
    status: truncated ? 'truncated' : 'completed',
    ...(truncated ? { reason: 'step-budget-exhausted' } : {}),
    worldsUsed: weights.length,
    effectiveWorlds: (total * total) / squares,
    steps,
    leaderId: ids[leader],
    comparableIds: results.filter((result) => result.comparable).map((result) => result.moveId),
    candidates: results,
    limitations: [
      ...LIMITATIONS,
      ...(unavailable ? [`${unavailable} requested worlds could not be sampled.`] : []),
      ...(truncated ? ['The step budget ended before every requested world was played.'] : []),
    ],
  };
}
