import type { Seat } from '../../game/kernel/types.ts';

/**
 * GP-02..GP-04: game-agnostic plan and playout contracts. Nothing here names a
 * game's vocabulary. Each game pack supplies goals, objective, continuation model
 * and authored text; the shared layer supplies structure, budgets and arithmetic.
 */
export const PLAN_SCHEMA_VERSION = '1.0.0';

export type Evidence = 'exact' | 'heuristic' | 'sampled-estimate' | 'unsupported';

export type PlanGoal = {
  /** Pack-namespaced stable identifier. */
  id: string;
  /** Authored short label. */
  title: string;
  /** `team` is used only when the variant's competition groups this seat with teammates. */
  beneficiary: 'self' | 'team';
  /** Who the goal works against, or null when it concerns only the beneficiary. */
  against: { competitorIds: string[]; seats: Seat[] } | null;
  horizon: PlanHorizon;
  /** Ordinal, 1 first. Never a probability or a strength score. */
  priority: number;
  status: 'open' | 'secured' | 'failed' | 'dropped';
  evidence: Evidence;
  /** Exact counters in a pack-defined unit, or null when the goal has none. */
  progress: {
    unit: string;
    comparator: 'at-least' | 'at-most' | 'exactly';
    target: number | null;
    current: number | null;
    remainingOpportunities: number | null;
  } | null;
  /** Authored conditions under which this goal is abandoned. */
  cancelWhen: string[];
};

export type PlanHorizon = 'step' | 'round' | 'match';

export type PlanStance = { id: string; title: string; evidence: Evidence };

export type PlanRevision = {
  /** Index of the public step (0-based) after which the stance changed. */
  step: number;
  trigger: string;
  from: string;
  to: string;
};

/** EV-02: every numerical estimate names its event, information, assumptions and population. */
export type PlanEstimate = {
  id: string;
  event: string;
  /** A frequency of a named 0/1 outcome, or a mean in the stated unit. */
  kind: 'frequency' | 'mean';
  unit: string;
  horizon: PlanHorizon;
  /** Estimates are never calibrated in this milestone and are never shown to players. */
  calibrated: false;
  information: 'seat-observation';
  allocationModel: string;
  continuationPolicy: string;
  population: string;
  worlds: number;
  effectiveWorlds: number;
  seed: number;
  value: number;
  standardError: number | null;
  evidence: 'sampled-estimate';
};

export type GamePlan = {
  schemaVersion: typeof PLAN_SCHEMA_VERSION;
  plannerVersion: string;
  mode: string;
  seat: Seat;
  competitorId: string;
  teammates: Seat[];
  /** Pack-namespaced phase of the game at this decision. */
  phaseId: string;
  /** A commitment (bid, declaration, exchange) fixes later goals; a play works toward them. */
  decisionKind: 'commitment' | 'play';
  stance: PlanStance;
  goals: PlanGoal[];
  /** Other stances that were considered, with the authored reason each was not chosen. */
  competing: { stanceId: string; whyNot: string }[];
  revisions: PlanRevision[];
  estimates: PlanEstimate[];
  limitations: string[];
};

/**
 * A pack's continuation model for one decision. Worlds are complete hidden-information
 * assignments consistent with the actor's observation; the true deal is never an input.
 */
export interface PlayoutModel<World, Move> {
  readonly id: string;
  readonly version: string;
  readonly allocationModel: string;
  readonly continuationPolicy: string;
  /** Returns null when no consistent world can be produced for this seed. */
  sample(seed: number): { world: World; weight: number } | null;
  clone(world: World): World;
  /** Acting seat, or null when the round is complete. */
  actor(world: World): Seat | null;
  apply(world: World, move: Move): void;
  /** MUST depend only on the acting seat's own holdings and public state. */
  defaultMove(world: World): Move;
  moveId(move: Move): string;
  /** Round-terminal value for the focal competitor under this variant's objective. */
  utility(world: World): number;
  /** Named round outcomes as 0 or 1, for the focal competitor's estimates. */
  events(world: World): Record<string, number>;
}

export type SearchBudget = {
  /** Sampled worlds requested; every candidate is played on the same worlds. */
  worlds: number;
  /** Ceiling on playout steps across the whole decision. Exhaustion is reported, never hidden. */
  maxSteps: number;
};

export type NoiseBand = {
  /** Multiplier on the paired standard error. */
  z: number;
  /** Minimum utility difference treated as meaningful. */
  floor: number;
};

export type CandidateResult = {
  moveId: string;
  mean: number;
  /** Null when a single world leaves the spread undefined. */
  standardError: number | null;
  /** Leader mean minus this candidate's mean on the same worlds. */
  behindLeader: number;
  behindLeaderStandardError: number | null;
  comparable: boolean;
  /** Weighted frequency of each named outcome. */
  events: Record<string, number>;
};

export type SearchSummary = {
  schemaVersion: '1.0.0';
  status: 'completed' | 'truncated' | 'unavailable';
  reason?: string;
  modelId: string;
  modelVersion: string;
  allocationModel: string;
  continuationPolicy: string;
  seed: number;
  budget: SearchBudget;
  noiseBand: NoiseBand;
  worldsUsed: number;
  effectiveWorlds: number;
  steps: number;
  leaderId: string | null;
  comparableIds: string[];
  candidates: CandidateResult[];
  limitations: string[];
};

export const PLAN_BUDGET_CEILING: SearchBudget = { worlds: 256, maxSteps: 400_000 };
