import { apply, collectTrick } from '../../../game/index.ts';
import { actionId } from '../../../game/rules.ts';
import type { GameAction, PrivateGame, Seat } from '../../../game/kernel/types.ts';
import { assertObservation, observe, type SeatObservation } from '../../../observations/index.ts';
import { chooseBaselineAction } from '../../../strategy/baseline.ts';
import { sampleWorld, SAMPLER_VERSION, SampleUnavailableError } from '../../../strategy/sampler.ts';

export const CONTINUATION_VERSION = 'late-hand-baseline-1.0.0';
export type ContinuationBudget = { worlds: number; maxPlies: number };
export type ContinuationComparison =
  | { status: 'unavailable'; reason: string }
  | {
      status: 'available';
      version: string;
      samplerVersion: string;
      seed: number;
      budget: ContinuationBudget;
      candidates: {
        actionId: string;
        completed: number;
        truncated: number;
        meanScoreMargin: number | null;
        matchWins: number;
      }[];
      limitations: string[];
    };

function scoreMargin(state: PrivateGame, seat: Seat): number {
  const team = state.mode === 'spades-partners' ? ([seat, ((seat + 2) % 4) as Seat] as Seat[]) : [seat];
  const other = ([0, 1, 2, 3] as Seat[]).filter((s) => !team.includes(s));
  return state.scores[seat] - Math.max(...other.map((s) => state.scores[s]));
}

/** A fixed, small information-set experiment. The actual concealed deal is never an input. */
export function compareContinuations(
  observation: SeatObservation,
  actions: GameAction[],
  seed: number,
  budget: ContinuationBudget,
): ContinuationComparison {
  assertObservation(observation);
  if (observation.mode === 'hearts' || observation.phase !== 'play' || observation.turn !== observation.seat)
    return { status: 'unavailable', reason: 'A Spades play decision is required.' };
  if (
    !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff ||
    !Number.isInteger(budget.worlds) || budget.worlds < 1 || budget.worlds > 8 ||
    !Number.isInteger(budget.maxPlies) || budget.maxPlies < 1 || budget.maxPlies > 16 ||
    observation.handSizes.some((size) => size > 4)
  ) return { status: 'unavailable', reason: 'Outside the bounded late-hand work budget.' };
  const legal = new Set(observation.legalActions.map(actionId));
  if (!actions.length || new Set(actions.map(actionId)).size !== actions.length ||
      actions.some((action) => action.kind !== 'play' || !legal.has(actionId(action))))
    return { status: 'unavailable', reason: 'Only distinct legal plays may be compared.' };
  const worlds: PrivateGame[] = [];
  try {
    for (let index = 0; index < budget.worlds; index++)
      worlds.push(sampleWorld(observation, (seed + Math.imul(index, 0x9e3779b9)) >>> 0));
  } catch (error) {
    if (error instanceof SampleUnavailableError) return { status: 'unavailable', reason: error.reason };
    throw error;
  }
  const candidates = actions.map((action) => {
    let completed = 0;
    let truncated = 0;
    let marginTotal = 0;
    let matchWins = 0;
    for (const world of worlds) {
      let state = apply(world, action as Extract<GameAction, { kind: 'play' }>);
      let plies = 1;
      while (!state.handResult && plies < budget.maxPlies) {
        if (state.phase === 'trick-end') {
          state = collectTrick(state);
          continue;
        }
        if (state.phase !== 'play' || state.turn === null) break;
        // Each actor acts on its own observation of this synthetic world.
        state = apply(state, chooseBaselineAction(observe(state, state.turn)) as Extract<GameAction, { kind: 'play' }>);
        plies++;
      }
      if (state.handResult) {
        completed++;
        marginTotal += scoreMargin(state, observation.seat);
        if (state.handResult.winner === observation.seat ||
            (observation.mode === 'spades-partners' &&
             state.handResult.winner === ((observation.seat + 2) % 4))) matchWins++;
      } else truncated++;
    }
    return {
      actionId: actionId(action), completed, truncated,
      meanScoreMargin: truncated ? null : marginTotal / completed,
      matchWins,
    };
  });
  return {
    status: 'available', version: CONTINUATION_VERSION, samplerVersion: SAMPLER_VERSION,
    seed, budget: { ...budget }, candidates,
    limitations: [
      'Uniform feasible hidden-card samples and a fixed baseline continuation; no behavioral likelihood or calibrated win probability.',
      'Mean score margin is exact only within each completed synthetic hand, not a claim about the real concealed deal.',
      'No candidate is ranked from truncated hands.',
    ],
  };
}
