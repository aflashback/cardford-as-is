import type { Competition } from '../../game/kernel/registry.ts';
import { evaluateCandidates } from './evaluate.ts';
import { hashText } from './random.ts';
import type { GamePlan, NoiseBand, PlayoutModel, SearchSummary } from './types.ts';

/**
 * GP-05: the one seam every game goes through. A pack owns its observation, moves,
 * worlds, stances and authored text; the shared orchestrator owns budgets, pairing,
 * the comparable set and the selection rule.
 */
export type Candidate<Move> = { id: string; move: Move };

export interface PlanningPack<Obs, Move, World> {
  readonly id: string;
  readonly version: string;
  readonly modes: readonly string[];
  /** The variant's declared partition of the four seats. */
  competition(mode: string): Competition;
  /** Stable text of everything the decision may depend on. It seeds the playouts. */
  observationKey(observation: Obs): string;
  /** The complete legal set in the pack's tactical order; the first entry is the tactical preference. */
  candidates(observation: Obs): Candidate<Move>[];
  /** Groups of candidate IDs that are interchangeable for every later purpose. Optional. */
  equivalent?(observation: Obs, candidates: readonly Candidate<Move>[]): string[][];
  /** Plan from exact facts. At a commitment decision this is the plan before committing. */
  plan(observation: Obs): GamePlan;
  /** Stances the focal seat may follow from here. The first is the plan's own stance. */
  stances(observation: Obs, plan: GamePlan): string[];
  /** Continuation model for this decision. */
  playout(observation: Obs): PlayoutModel<World, Move>;
  /** A first move that also fixes the focal seat's stance for the rest of the round. */
  withStance(move: Move, stanceId: string): Move;
  /** Exact predicate: does this candidate serve this stance? */
  supports(observation: Obs, stanceId: string, candidate: Candidate<Move>): boolean;
  /** Commitment decisions only: the stance a candidate would create. */
  resultingStance?(observation: Obs, candidate: Candidate<Move>): string;
}

export type DecisionBudget = {
  /** Sampled worlds; every searched candidate is played on the same worlds. */
  maxWorlds: number;
  /** Candidates (after merging equivalents) that receive playouts, in tactical order. */
  maxSearchedCandidates: number;
  /** Stances evaluated for the focal seat. */
  maxStances: number;
  /** Total playout steps for the decision. */
  maxSteps: number;
};

export const SELECTION_RULE_VERSION = 'selection-rule-1.0.0';
export type SelectionRule = {
  version: typeof SELECTION_RULE_VERSION;
  noiseBand: NoiseBand;
  /** Below this many effective worlds the search is not trusted and the tactical order decides. */
  minEffectiveWorlds: number;
  /** How the comparable set is resolved. */
  tieBreak: 'leader' | 'tactical-order';
  /**
   * Largest shortfall in the pack's utility unit at which a distinct choice counts as
   * practically tied with the selected one. It alone decides whether guidance names one choice.
   */
  practicalTie: number;
};
export const DEFAULT_SELECTION_RULE: SelectionRule = {
  version: SELECTION_RULE_VERSION,
  noiseBand: { z: 1.5, floor: 1 },
  minEffectiveWorlds: 8,
  tieBreak: 'leader',
  practicalTie: 1,
};

/** `tactical-order` means no playouts were requested; `tactical-fallback` means they were requested but unusable. */
export type SelectedBy = 'forced' | 'tactical-order' | 'search' | 'search-tiebreak' | 'tactical-fallback';

export type Decision = {
  plan: GamePlan;
  selectedId: string;
  selectedBy: SelectedBy;
  /** Stance the selected action was evaluated under. */
  stanceId: string;
  /** Whether the selected action serves the plan's own stance. False suppresses the plan cue. */
  planSupported: boolean;
  /** Candidate IDs the evidence cannot separate from the selected one, equivalents merged. */
  comparableIds: string[];
  /** The subset of comparable candidates whose estimated value is practically tied with the selected one. */
  tiedIds: string[];
  /** Candidates that received no playouts. They are not judged inferior. */
  notSearchedIds: string[];
  /** Equivalence groups that were merged, keyed by the representative's ID. */
  merged: Record<string, string[]>;
  /** Commitment decisions: stance each candidate would create. */
  resultingStances: Record<string, string>;
  search: SearchSummary | null;
  selectionRule: SelectionRule;
  limitations: string[];
};

const STANCE_SEPARATOR = ' @ ';

export function decide<Obs, Move, World>(
  pack: PlanningPack<Obs, Move, World>,
  observation: Obs,
  budget: DecisionBudget,
  rule: SelectionRule = DEFAULT_SELECTION_RULE,
): Decision {
  const candidates = pack.candidates(observation);
  if (!candidates.length) throw new Error('No decision is available.');
  if (new Set(candidates.map((entry) => entry.id)).size !== candidates.length)
    throw new Error('Candidate IDs must be distinct.');
  const plan = pack.plan(observation);
  const stances = pack.stances(observation, plan);
  if (!stances.length || stances[0] !== plan.stance.id)
    throw new Error("The first stance must be the plan's own stance.");
  if (stances.some((stance) => stance.includes(STANCE_SEPARATOR))) throw new Error('Invalid stance ID.');
  const resultingStances: Record<string, string> = {};
  if (pack.resultingStance)
    for (const candidate of candidates) resultingStances[candidate.id] = pack.resultingStance(observation, candidate);
  const base = { plan, resultingStances, selectionRule: rule };
  const supported = (id: string) =>
    pack.supports(observation, plan.stance.id, candidates.find((entry) => entry.id === id)!);
  if (candidates.length === 1)
    return {
      ...base, selectedId: candidates[0].id, selectedBy: 'forced', stanceId: plan.stance.id,
      planSupported: supported(candidates[0].id), comparableIds: [], tiedIds: [], notSearchedIds: [], merged: {},
      search: null, limitations: [],
    };

  // Merge interchangeable candidates so they neither cost playouts nor look like a real choice.
  const groups = pack.equivalent?.(observation, candidates) ?? [];
  const representative = new Map<string, string>();
  for (const group of groups) {
    const members = candidates.filter((entry) => group.includes(entry.id)).map((entry) => entry.id);
    for (const member of members) representative.set(member, members[0]);
  }
  const representatives = candidates.filter((entry) => (representative.get(entry.id) ?? entry.id) === entry.id);
  const merged: Record<string, string[]> = {};
  for (const [member, head] of representative) if (member !== head) (merged[head] ??= []).push(member);
  const searched = representatives.slice(0, Math.max(1, budget.maxSearchedCandidates));
  const notSearchedIds = representatives.slice(searched.length).map((entry) => entry.id);
  const usedStances = stances.slice(0, Math.max(1, budget.maxStances));

  const fallback = (reason: string, search: SearchSummary | null): Decision => ({
    ...base, selectedId: candidates[0].id, selectedBy: 'tactical-fallback', stanceId: plan.stance.id,
    planSupported: supported(candidates[0].id), comparableIds: [], tiedIds: [], notSearchedIds, merged, search,
    limitations: [reason],
  });
  if (searched.length < 2 && usedStances.length < 2)
    return {
      ...fallback('Every legal action is interchangeable; the tactical order decides.', null),
      selectedBy: 'tactical-order',
    };

  const model = pack.playout(observation);
  const composite = usedStances.flatMap((stance) =>
    searched.map((entry) => ({ candidate: entry, stance, move: pack.withStance(entry.move, stance) })),
  );
  const labels = new Map<Move, string>();
  for (const entry of composite) {
    if (labels.has(entry.move)) throw new Error('withStance must return a distinct move for every stance.');
    labels.set(entry.move, entry.candidate.id + STANCE_SEPARATOR + entry.stance);
  }
  const labelled: PlayoutModel<World, Move> = {
    ...model,
    sample: (seed) => model.sample(seed),
    clone: (world) => model.clone(world),
    actor: (world) => model.actor(world),
    apply: (world, move) => model.apply(world, move),
    defaultMove: (world) => model.defaultMove(world),
    utility: (world) => model.utility(world),
    events: (world) => model.events(world),
    moveId: (move) => labels.get(move) ?? model.moveId(move),
  };
  const search = evaluateCandidates(
    labelled,
    composite.map((entry) => entry.move),
    { worlds: budget.maxWorlds, maxSteps: budget.maxSteps },
    // The policy version is excluded so every profile and both competition twins share sampled worlds.
    hashText(`${pack.id}|${pack.observationKey(observation)}`),
    rule.noiseBand,
  );
  if (search.status !== 'completed' || !search.leaderId)
    return fallback(
      search.status === 'truncated'
        ? 'The playout budget ended early; the tactical order decides.'
        : 'No consistent world could be sampled; the tactical order decides.',
      search,
    );
  if (search.effectiveWorlds < rule.minEffectiveWorlds)
    return fallback('Too few effective sampled worlds; the tactical order decides.', search);

  const parse = (id: string) => {
    const at = id.lastIndexOf(STANCE_SEPARATOR);
    return { candidateId: id.slice(0, at), stanceId: id.slice(at + STANCE_SEPARATOR.length) };
  };
  const comparable = search.comparableIds.map(parse);
  // Keep the plan's own stance whenever the evidence cannot separate it from an alternative.
  const ownStance = comparable.some((entry) => entry.stanceId === plan.stance.id);
  const leader = parse(search.leaderId);
  const stanceId = ownStance ? plan.stance.id : leader.stanceId;
  const inStance = comparable.filter((entry) => entry.stanceId === stanceId).map((entry) => entry.candidateId);
  const order = searched.map((entry) => entry.id);
  const best = search.candidates
    .filter((entry) => parse(entry.moveId).stanceId === stanceId)
    .reduce((top, entry) => (entry.mean > top.mean ? entry : top));
  const stanceLeader = parse(best.moveId).candidateId;
  const selectedId =
    rule.tieBreak === 'leader' ? stanceLeader : order.find((id) => inStance.includes(id)) ?? stanceLeader;
  return {
    ...base,
    selectedId,
    selectedBy: selectedId === leader.candidateId && stanceId === leader.stanceId ? 'search' : 'search-tiebreak',
    stanceId,
    planSupported: stanceId === plan.stance.id && supported(selectedId),
    comparableIds: [...new Set(inStance)].filter((id) => id !== selectedId),
    tiedIds: search.candidates
      .filter((entry) => parse(entry.moveId).stanceId === stanceId)
      .filter((entry) => Math.abs(best.mean - entry.mean) <= rule.practicalTie)
      .map((entry) => parse(entry.moveId).candidateId)
      .filter((id) => id !== selectedId && inStance.includes(id)),
    notSearchedIds,
    merged,
    search,
    limitations: [
      ...(notSearchedIds.length
        ? [`${notSearchedIds.length} legal actions received no playouts and are not judged.`]
        : []),
    ],
  };
}
