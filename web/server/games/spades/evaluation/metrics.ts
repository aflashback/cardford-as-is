import type { RoundRow, RoundStart } from '../../../evaluation/gate/contracts.ts';
import { competitionFor, type Competitor } from '../../../game/kernel/competition.ts';
import type { Seat } from '../../../game/kernel/types.ts';
import { scoreCompetitor } from '../../../game/spades/score.ts';

/**
 * SG-05: Spades margins and per-deal figures for the strength gate.
 *
 * Every figure is unconditional: it is defined on every deal, so a policy cannot raise
 * it by choosing when the figure applies. `positiveContractMade` is 0 on a deal without
 * a positive contract and `positiveContract` is reported beside it as its own figure.
 * Conditional rates are left to descriptive reports, which must show both denominators.
 */
export const SPADES_METRICS_VERSION = 'spades-gate-metrics-1.0.0';

export type SpadesGateMode = 'spades-solo' | 'spades-partners';
export const SPADES_GATE_MODES: readonly SpadesGateMode[] = ['spades-solo', 'spades-partners'];

export function requireSpadesMode(mode: string): SpadesGateMode {
  if (mode !== 'spades-solo' && mode !== 'spades-partners')
    throw new Error(`The Spades gate does not cover mode: ${mode}`);
  return mode;
}

/** The opaque `RoundOutcome.result` of the Spades adapter. Plain data, no engine state. */
export type SpadesRoundResult = {
  kind: 'spades-round-result';
  mode: SpadesGateMode;
  handNumber: number;
  startScores: number[];
  startBags: number[];
  bids: number[];
  tricks: number[];
  /** Score change of this hand per seat; both seats of a team repeat the team's change. */
  points: number[];
  scores: number[];
  bags: number[];
  ended: 'hand-end' | 'match-end';
  winner: Seat | null;
  decisions: number;
  cardsPlayed: number;
};

export const SPADES_METRIC_NAMES = [
  'marginVsMax',
  'contractPoints',
  'nilPoints',
  'overtrickPoints',
  'bagsAdded',
  'bagPenalty',
  'bagPenaltyPoints',
  'opposingContractsSet',
  'opposingNilsBroken',
  'positiveContract',
  'positiveContractMade',
  'bidMinusCredited',
  'nilBid',
  'nilKept',
  'doubleNilBid',
] as const;
export type SpadesMetricName = (typeof SPADES_METRIC_NAMES)[number];

export const SPADES_MARGIN_DEFINITION: Record<SpadesGateMode, string> = {
  'spades-solo': 'own hand points minus the mean hand points of the other three seats',
  'spades-partners': 'team hand points minus the opposing team hand points, counted once per team',
};

/** Figures fixed by a scripted bid prefix say nothing about a policy's own bidding. */
const BID_CHOICE_METRICS: readonly string[] = ['positiveContract', 'nilBid', 'doubleNilBid', 'bidMinusCredited'];
/** Stress strata whose start state already holds scripted bids. */
export const SCRIPTED_BID_STRATA: readonly string[] = ['double-nil', 'opposing-nil'];

/**
 * Whether a figure can be read as a policy outcome in a population. Without strata a
 * stress start is assumed to hold scripted bids, which is the cautious reading.
 */
export function spadesMeasurable(
  metric: string,
  population: RoundStart<unknown>['population'],
  strata?: readonly string[],
): boolean {
  if (metric !== 'margin' && metric !== 'own' && !(SPADES_METRIC_NAMES as readonly string[]).includes(metric))
    return false;
  if (population !== 'stress') return true;
  if (!BID_CHOICE_METRICS.includes(metric)) return true;
  if (strata === undefined) return false;
  return !strata.some((name) => SCRIPTED_BID_STRATA.includes(name));
}

export type CompetitorBreakdown = {
  competitorId: string;
  seats: Seat[];
  contract: number;
  credited: number;
  made: boolean;
  overtricks: number;
  failedNilTricks: number;
  nilBids: number;
  nilKept: number;
  nilPoints: number;
  contractPoints: number;
  bagsAdded: number;
  penalties: number;
  /** contractPoints + nilPoints + overtricks - 100 * penalties. */
  delta: number;
  bagsAfter: number;
};

/** Recomputed from bids, tricks and carried bags only. It never reads the engine's hand result. */
export function breakdownOf(
  competitor: Competitor,
  bids: readonly number[],
  tricks: readonly number[],
  startBags: readonly number[],
): CompetitorBreakdown {
  let contract = 0,
    credited = 0,
    failedNilTricks = 0,
    nilBids = 0,
    nilKept = 0;
  for (const seat of competitor.seats) {
    if (bids[seat] === 0) {
      nilBids++;
      if (tricks[seat] === 0) nilKept++;
      failedNilTricks += tricks[seat];
    } else {
      contract += bids[seat];
      credited += tricks[seat];
    }
  }
  const made = credited >= contract;
  const overtricks = made ? credited - contract : 0;
  const bagsAdded = overtricks + failedNilTricks;
  const total = startBags[competitor.seats[0]] + bagsAdded;
  const penalties = Math.floor(total / 10);
  const nilPoints = 100 * nilKept - 100 * (nilBids - nilKept);
  const contractPoints = (made ? 10 : -10) * contract;
  return {
    competitorId: competitor.id,
    seats: [...competitor.seats],
    contract,
    credited,
    made,
    overtricks,
    failedNilTricks,
    nilBids,
    nilKept,
    nilPoints,
    contractPoints,
    bagsAdded,
    penalties,
    delta: contractPoints + nilPoints + overtricks - 100 * penalties,
    bagsAfter: total % 10,
  };
}

/**
 * Independent check of one scored hand. The production scorer is called again from the
 * bids, the recounted tricks and the bags carried into the hand, and the additive
 * breakdown above must agree with it. Every disagreement counts once.
 */
export function scoreMismatches(result: SpadesRoundResult, recountedTricks: readonly number[]): number {
  let mismatches = 0;
  const competition = competitionFor(result.mode);
  for (const seat of [0, 1, 2, 3]) if (recountedTricks[seat] !== result.tricks[seat]) mismatches++;
  if (recountedTricks.reduce((sum, value) => sum + value, 0) !== 13) mismatches++;
  for (const competitor of competition.competitors) {
    const first = competitor.seats[0];
    const expected = scoreCompetitor({
      bids: competitor.seats.map((seat) => result.bids[seat]),
      tricks: competitor.seats.map((seat) => recountedTricks[seat]),
      oldBags: result.startBags[first],
    });
    const parts = breakdownOf(competitor, result.bids, recountedTricks, result.startBags);
    if (parts.delta !== expected.delta || parts.bagsAfter !== expected.bags) mismatches++;
    for (const seat of competitor.seats) {
      if (result.points[seat] !== expected.delta) mismatches++;
      if (result.bags[seat] !== expected.bags) mismatches++;
      if (result.scores[seat] !== result.startScores[seat] + expected.delta) mismatches++;
      if (result.startScores[seat] !== result.startScores[first] || result.startBags[seat] !== result.startBags[first])
        mismatches++;
    }
  }
  return mismatches;
}

export function isSpadesRoundResult(value: unknown): value is SpadesRoundResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'spades-round-result' &&
    Array.isArray((value as { points?: unknown }).points)
  );
}

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Margin, own points and unconditional figures for one competitor of one completed hand. */
export function measureSpadesRound(
  result: SpadesRoundResult,
  competitorId: string,
): Pick<RoundRow, 'margin' | 'own' | 'metrics' | 'roundEndedSession'> {
  const competition = competitionFor(result.mode);
  const competitor = competition.competitors.find((entry) => entry.id === competitorId);
  if (!competitor) throw new Error(`Unknown competitor for ${result.mode}: ${competitorId}`);
  // One figure per competitor: a team's points appear on both of its seats and are read once.
  const pointsOf = (entry: Competitor) => result.points[entry.seats[0]];
  const opposing = competition.competitors.filter((entry) => entry !== competitor);
  const own = pointsOf(competitor);
  const others = opposing.map(pointsOf);
  const parts = breakdownOf(competitor, result.bids, result.tricks, result.startBags);
  const opposingParts = opposing.map((entry) => breakdownOf(entry, result.bids, result.tricks, result.startBags));
  const metrics: Record<SpadesMetricName, number> = {
    marginVsMax: own - Math.max(...others),
    contractPoints: parts.contractPoints,
    nilPoints: parts.nilPoints,
    overtrickPoints: parts.overtricks,
    bagsAdded: parts.bagsAdded,
    bagPenalty: parts.penalties > 0 ? 1 : 0,
    bagPenaltyPoints: -100 * parts.penalties,
    opposingContractsSet: opposingParts.filter((entry) => entry.contract > 0 && !entry.made).length,
    opposingNilsBroken: opposingParts.reduce((sum, entry) => sum + entry.nilBids - entry.nilKept, 0),
    positiveContract: parts.contract > 0 ? 1 : 0,
    positiveContractMade: parts.contract > 0 && parts.made ? 1 : 0,
    bidMinusCredited: parts.contract > 0 ? parts.contract - parts.credited : 0,
    nilBid: parts.nilBids,
    nilKept: parts.nilKept,
    doubleNilBid: competitor.seats.length > 1 && parts.nilBids === competitor.seats.length ? 1 : 0,
  };
  return { margin: own - mean(others), own, metrics, roundEndedSession: result.ended === 'match-end' };
}
