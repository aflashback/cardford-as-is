import type { Competition } from '../../game/kernel/registry.ts';
import type { Seat } from '../../game/kernel/types.ts';

/**
 * SG-05: game-agnostic strength-gate contracts. The shared runner owns seeds, pairing,
 * clustering, intervals and the decision rule. A game supplies an adapter with its own
 * engine stepping, policies, styles, margins, metrics and thresholds.
 * Nothing in this directory names a game's vocabulary.
 */
export const GATE_SCHEMA_VERSION = '1.0.0';

/** A selector for one seat. It receives only that seat's observation. */
export type SeatPolicy<Obs, Action> = {
  id: string;
  /** `diagnostic` policies never enter a decision rule or a match experiment. */
  role: 'reference' | 'candidate' | 'style' | 'diagnostic';
  choose(observation: Obs): Action;
};

export type Placement = {
  /** Stable name, for example `one-seat`, `both-teammates`, `unfamiliar-teammate`. */
  configuration: string;
  /** Seats whose policy differs between the reference and candidate arms. */
  evaluated: Seat[];
  /** Style ID for every non-evaluated seat; `null` marks an evaluated seat. */
  others: (string | null)[];
  /** Rotation index inside the seed group. */
  rotation: number;
};

export type RoundStart<State> = {
  state: State;
  /** Where this start came from: a zero start, a match stream at hand k, or a declared stress generator. */
  population: 'zero-start' | 'in-match' | 'stress';
  /** Stream position, or 0 for a zero start. */
  index: number;
  /** Declared trigger names that hold at this start. Pure functions of public state. */
  strata: string[];
};

/** One completed round for one evaluated competitor, as produced by the adapter. */
export type RoundRow = {
  seed: number;
  mode: string;
  population: RoundStart<unknown>['population'];
  index: number;
  strata: string[];
  style: string;
  configuration: string;
  rotation: number;
  arm: 'reference' | 'candidate';
  policyBySeat: string[];
  competitorId: string;
  /** Higher is better for the evaluated competitor, already normalised by the game. */
  margin: number;
  /** The competitor's own score change, in the game's own direction-normalised points. */
  own: number;
  /** Unconditional per-round figures named by the adapter. */
  metrics: Record<string, number>;
  /** Hash of the full action sequence, for determinism and divergence checks. */
  actionsHash: string;
  roundEndedSession: boolean;
};

/** Shadow comparison on the reference trajectory: same observation, both selectors. */
export type ShadowRow = {
  seed: number;
  mode: string;
  style: string;
  configuration: string;
  rotation: number;
  eligible: number;
  changed: number;
  unforced: number;
  /** Coach outcomes on every unforced evaluated-seat decision of the candidate arm. */
  coach: {
    suggestions: number;
    severalReasonable: number;
    factsOnly: number;
    claimsChecked: number;
    claimsFalse: number;
    claimsNotCheckable: number;
    falseClaimIds: string[];
  };
};

export interface GateAdapter<State, Obs, Action> {
  readonly gameId: string;
  readonly modes: readonly string[];
  competition(mode: string): Competition;
  /** Points of margin treated as the non-inferiority bound, per mode. */
  nonInferiorityMargin(mode: string): number;
  /** Smallest margin difference treated as material for a subgroup, per mode. */
  materiality(mode: string): number;
  styles(mode: string): SeatPolicy<Obs, Action>[];
  placements(mode: string, styles: readonly string[]): Placement[];
  /** Deterministic round start from a seed. The same seed always gives the same deal and dealer. */
  zeroStart(mode: string, seed: number): RoundStart<State>;
  /** Plays a reference session from a stream seed and returns the start of each round. */
  streamStarts(mode: string, seed: number, policy: SeatPolicy<Obs, Action>, maxRounds: number): RoundStart<State>[];
  /** Plays one round from a start with the given seat policies. */
  playRound(start: RoundStart<State>, policies: readonly SeatPolicy<Obs, Action>[]): RoundOutcome;
  /** Margin and metrics for one competitor of a completed round. */
  measure(outcome: RoundOutcome, competitorId: string): Pick<RoundRow, 'margin' | 'own' | 'metrics' | 'roundEndedSession'>;
  metricNames(mode: string): string[];
  /**
   * Shadow comparison: plays the round with `policies` (the reference arm) and, at every
   * decision of an evaluated seat, also asks `candidate` on the identical observation.
   * Coach figures describe the candidate's rendered advice at those same decisions.
   */
  shadow(
    start: RoundStart<State>,
    policies: readonly SeatPolicy<Obs, Action>[],
    evaluated: readonly Seat[],
    candidate: SeatPolicy<Obs, Action>,
  ): Pick<ShadowRow, 'eligible' | 'changed' | 'unforced' | 'coach'>;
  /**
   * Resolves a reference, candidate, previous or floor policy by its version ID. The shared
   * runner calls this inside each worker, so a policy never crosses a thread boundary.
   */
  policy(id: string, mode: string): SeatPolicy<Obs, Action>;
  /**
   * Whether a figure can be read as a policy outcome in a population. When absent, every
   * figure is treated as measurable. `strata` narrows the question to starts holding those triggers.
   */
  measurable?(metric: string, population: Population, strata?: readonly string[]): boolean;
  /** Declared stress starts for a seed. Needed only when a run asks for the `stress` population. */
  stressStarts?(mode: string, seed: number): RoundStart<State>[];
}

export type RoundOutcome = {
  mode: string;
  /** Opaque to the shared runner; the adapter measures it. */
  result: unknown;
  actions: string[];
  illegalActions: number;
  scoreMismatches: number;
  /** Count of seat views that held concealed data, when the adapter checks for it. */
  informationBreaches?: number;
};

export type Interval = {
  estimate: number;
  lower: number;
  upper: number;
  method: 'percentile' | 'bca' | 'wilson';
  clusters: number;
  resamples: number;
};

export type GateStatus = 'blocked' | 'worse' | 'improved' | 'non-inferior' | 'inconclusive' | 'unchanged';

export type GateManifest = {
  schemaVersion: typeof GATE_SCHEMA_VERSION;
  id: string;
  purpose: 'development' | 'confirmation';
  gameId: string;
  modes: string[];
  reference: string;
  candidate: string;
  /** Previously accepted profile, for the incremental contrast. */
  previous: string | null;
  dealGenerator: string;
  seeds: { from: number; count: number; ledgerEntry: string };
  population: RoundStart<unknown>['population'];
  styles: string[];
  heldOutStyles: string[];
  primary: Record<string, { configuration: string; estimand: string }>;
  thresholds: {
    nonInferiority: Record<string, number>;
    minSeedsWithChange: number;
    minChangedDecisions: number;
    confidence: number;
  };
  bootstrap: { seed: number; resamples: number };
  notes: string[];
};

/* Additive exports used by the shared runner and report (SG-05). */

export type Population = RoundStart<unknown>['population'];

/** `previous` is the last accepted profile; `floor` is the harm-floor comparison policy. */
export type Arm = 'reference' | 'candidate' | 'previous' | 'floor';

export type RowSafety = {
  illegalActions: number;
  scoreMismatches: number;
  /** `null` when the adapter did not check seat views in this round. */
  informationBreaches: number | null;
};

/** The line written to a shard for one completed round of one evaluated competitor. */
export type GateRoundRow = Omit<RoundRow, 'arm'> & { arm: Arm; safety: RowSafety };

/** The line written to a shard for one shadow comparison. */
export type GateShadowRow = ShadowRow & {
  population: Population;
  index: number;
  /** The arm whose trajectory was followed while the candidate was asked. */
  against: 'reference' | 'previous';
};

/** A manifest as read by the runner. The extra fields are optional and predeclared with the rest. */
export type GateRunManifest = GateManifest & {
  /** Module path from the repository root, and the export holding the adapter or its factory. */
  adapter?: { module: string; export: string };
  /** Bounds for the `in-match` population. */
  stream?: { maxRounds: number; startsPerSeed?: number };
  /** Policy for the harm-floor arm, when one is declared. */
  floor?: string | null;
};
