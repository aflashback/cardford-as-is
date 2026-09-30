import { DEAL_GENERATOR, shuffleItems, streamSeed } from '../../../evaluation/gate/deals.ts';
import type {
  GateAdapter,
  RoundOutcome,
  RoundStart,
  SeatPolicy,
} from '../../../evaluation/gate/contracts.ts';
import {
  createGame,
  fullDeck,
  nextHand,
  type Card,
  type GameAction,
  type PrivateGame,
  type Seat,
  type Trick,
} from '../../../game/index.ts';
import { competitionFor, competitorOf } from '../../../game/kernel/competition.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import { getReasoningProfile } from '../../../strategy/registry.ts';
import {
  SPADES_GATE_MODES,
  SPADES_MARGIN_DEFINITION,
  SPADES_METRIC_NAMES,
  isSpadesRoundResult,
  measureSpadesRound,
  requireSpadesMode,
  scoreMismatches,
  spadesMeasurable,
  type SpadesGateMode,
  type SpadesRoundResult,
} from './metrics.ts';
import { spadesPlacements } from './placements.ts';
import { spadesShadow, walkSpadesRound } from './shadow.ts';
import { D0_STYLE_ID, findSpadesStyle, spadesStyle, spadesStyles, type SpadesSeatPolicy } from './styles.ts';

/**
 * SG-05: the Spades adapter of the strength gate. The shared runner owns seeds, pairing,
 * clustering, intervals and the decision rule; this file owns deals, engine stepping,
 * policies, margins and thresholds for the two Spades modes.
 */
export const SPADES_GATE_ADAPTER_VERSION = 'spades-gate-adapter-1.0.0';
/** The shared generator orders the deck; this adapter only supplies the 52 cards. */
export const SPADES_DEAL_GENERATOR = DEAL_GENERATOR;

type Policy = SeatPolicy<SeatObservation, GameAction>;

/**
 * Deal `k` of a stream is a function of (seed, k) only, so every arm and every reference
 * policy receives the same deck at the same position whatever happened before it.
 */
export const spadesZeroDeal = (seed: number): Card[] => shuffleItems(fullDeck(), seed);
export const spadesStreamDeal = (seed: number, k: number): Card[] => shuffleItems(fullDeck(), streamSeed(seed, k));
export const dealerOf = (seed: number): Seat => (seed % 4) as Seat;

/** Declared triggers on a start. Pure functions of public state: carried bags and scores. */
export const BAG_BOUNDARY = 7;
export const MATCH_THRESHOLD = 400;
export function strataOf(state: Pick<PrivateGame, 'bags' | 'scores'>): string[] {
  const strata: string[] = [];
  if (state.bags.some((bags) => bags >= BAG_BOUNDARY)) strata.push('bag-boundary');
  if (state.scores.some((score) => score >= MATCH_THRESHOLD)) strata.push('match-threshold');
  return strata;
}

/**
 * The event log is presentation only. Legality reads mode, phase, turn, the trick in
 * progress, history, broken flags and the hand (`legalActions` in game/index.ts); scoring
 * reads bids, tricks, scores and bags (`scoreHand`); `apply` only appends to the log.
 * No selector reads `observation.events`, and the canonical decision key leaves them out.
 * The evaluation copy therefore starts each hand with an empty log, which keeps the cost
 * of cloning a state flat over a long stream. The adapter test replays every stream with
 * the full log and requires the same states.
 */
const withoutEvents = (state: PrivateGame): PrivateGame => ({ ...state, events: [] });

function zeroStart(mode: string, seed: number): RoundStart<PrivateGame> {
  const spadesMode = requireSpadesMode(mode);
  const state = withoutEvents(
    createGame({ id: `gate:${spadesMode}:${seed}`, mode: spadesMode, dealer: dealerOf(seed) }, spadesZeroDeal(seed)),
  );
  return { state, population: 'zero-start', index: 0, strata: strataOf(state) };
}

export type StreamJournal = {
  starts: RoundStart<PrivateGame>[];
  /** Action IDs of each completed hand, by stream position. The last start may be unplayed. */
  actions: string[][];
  ended: boolean;
  winner: Seat | null;
  finalScores: number[];
};

/**
 * Plays one stream in the production engine: deal `k` comes from `streamSeed(seed, k)`
 * and the dealer moves one seat per hand. Stops when the match ends, or when `maxRounds`
 * starts exist and `playLast` is false.
 */
export function playSpadesStream(
  mode: string,
  seed: number,
  policies: readonly Policy[],
  maxRounds: number,
  playLast = false,
): StreamJournal {
  const spadesMode = requireSpadesMode(mode);
  if (!Number.isInteger(maxRounds) || maxRounds < 1) throw new Error('A stream needs at least one round.');
  let state = withoutEvents(
    createGame({ id: `gate-stream:${spadesMode}:${seed}`, mode: spadesMode, dealer: dealerOf(seed) }, spadesStreamDeal(seed, 0)),
  );
  const journal: StreamJournal = { starts: [], actions: [], ended: false, winner: null, finalScores: [...state.scores] };
  for (let k = 0; k < maxRounds; k++) {
    journal.starts.push({ state, population: 'in-match', index: k, strata: strataOf(state) });
    if (k + 1 === maxRounds && !playLast) break;
    const walk = walkSpadesRound(state, policies);
    if (walk.illegalActions) throw new Error(`A stream policy selected an illegal action: ${spadesMode}/${seed}/${k}`);
    journal.actions.push(walk.actions);
    journal.finalScores = [...walk.end.scores];
    if (walk.end.phase === 'match-end') {
      journal.ended = true;
      journal.winner = walk.end.handResult?.winner ?? null;
      break;
    }
    if (k + 1 < maxRounds) state = withoutEvents(nextHand(walk.end, spadesStreamDeal(seed, k + 1)));
  }
  return journal;
}

function streamStarts(mode: string, seed: number, policy: Policy, maxRounds: number): RoundStart<PrivateGame>[] {
  return playSpadesStream(mode, seed, [policy, policy, policy, policy], maxRounds).starts;
}

/** Independent recount: the highest spade wins, otherwise the highest card of the led suit. */
function recountTricks(history: readonly Trick[]): number[] {
  const rank = (card: Card) => ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(card.slice(1));
  const tricks = [0, 0, 0, 0];
  for (const trick of history) {
    const spades = trick.plays.filter((play) => play.card[0] === 'S');
    const pool = spades.length ? spades : trick.plays.filter((play) => play.card[0] === trick.plays[0].card[0]);
    const best = pool.reduce((winner, play) => (rank(play.card) > rank(winner.card) ? play : winner));
    tricks[best.seat]++;
  }
  return tricks;
}

function playRound(start: RoundStart<PrivateGame>, policies: readonly Policy[]): RoundOutcome {
  const mode = requireSpadesMode(start.state.mode);
  const walk = walkSpadesRound(start.state, policies);
  const end = walk.end;
  if (!end.handResult || end.bids.some((bid) => bid === null)) throw new Error('The hand ended without a score.');
  const played = end.history.flatMap((trick) => trick.plays.map((play) => play.card));
  const result: SpadesRoundResult = {
    kind: 'spades-round-result',
    mode,
    handNumber: end.handNumber,
    startScores: [...start.state.scores],
    startBags: [...start.state.bags],
    bids: end.bids.map((bid) => bid ?? 0),
    tricks: [...end.tricks],
    points: [...end.handResult.points],
    scores: [...end.scores],
    bags: [...end.bags],
    ended: end.phase === 'match-end' ? 'match-end' : 'hand-end',
    winner: end.handResult.winner ?? null,
    decisions: walk.actions.length,
    cardsPlayed: new Set(played).size,
  };
  let mismatches = scoreMismatches(result, recountTricks(end.history));
  // Conservation: every card of the deck is played exactly once and no hand keeps a card.
  if (played.length !== 52 || result.cardsPlayed !== 52 || end.hands.some((hand) => hand.length)) mismatches++;
  return { mode, result, actions: walk.actions, illegalActions: walk.illegalActions, scoreMismatches: mismatches };
}

function measure(outcome: RoundOutcome, competitorId: string) {
  if (!isSpadesRoundResult(outcome.result)) throw new Error('The outcome was not produced by the Spades adapter.');
  return measureSpadesRound(outcome.result, competitorId);
}

const NON_INFERIORITY: Record<SpadesGateMode, number> = { 'spades-partners': 5, 'spades-solo': 2.5 };
const MATERIALITY: Record<SpadesGateMode, number> = { 'spades-partners': 10, 'spades-solo': 5 };

const profilePolicies = new Map<string, SpadesSeatPolicy>();
/** Resolves `d0`, `baseline`, every declared style and every registered policy version. */
function policy(id: string, mode: string): SpadesSeatPolicy {
  const spadesMode = requireSpadesMode(mode);
  const style = findSpadesStyle(id);
  if (style) return style;
  const key = `${spadesMode}/${id}`;
  let found = profilePolicies.get(key);
  if (!found) {
    const pack = getReasoningProfile(id, spadesMode);
    found = {
      id,
      role: 'candidate',
      choose: (observation) => structuredClone(pack.analyze(observation).action),
      analyze: (observation) => pack.analyze(observation),
    };
    profilePolicies.set(key, found);
  }
  return found;
}

export type SpadesGateAdapter = GateAdapter<PrivateGame, SeatObservation, GameAction> & {
  readonly version: string;
  readonly dealGenerator: string;
  policy(id: string, mode: string): SpadesSeatPolicy;
  measurable(metric: string, population: RoundStart<unknown>['population'], strata?: readonly string[]): boolean;
  marginDefinition(mode: string): string;
};

export const spadesGateAdapter: SpadesGateAdapter = {
  gameId: 'spades',
  version: SPADES_GATE_ADAPTER_VERSION,
  dealGenerator: SPADES_DEAL_GENERATOR,
  modes: SPADES_GATE_MODES,
  competition: (mode) => competitionFor(requireSpadesMode(mode)),
  nonInferiorityMargin: (mode) => NON_INFERIORITY[requireSpadesMode(mode)],
  materiality: (mode) => MATERIALITY[requireSpadesMode(mode)],
  styles: (mode) => spadesStyles(mode),
  placements: (mode, styles) => spadesPlacements(mode, styles),
  zeroStart,
  streamStarts,
  playRound,
  measure,
  metricNames: (mode) => {
    requireSpadesMode(mode);
    return [...SPADES_METRIC_NAMES];
  },
  shadow: (start, policies, evaluated, candidate) => spadesShadow(start, policies, evaluated, candidate),
  policy,
  measurable: spadesMeasurable,
  marginDefinition: (mode) => SPADES_MARGIN_DEFINITION[requireSpadesMode(mode)],
};

/** SG-05 admission bands for D0's match win rate against a style, per mode. */
export const ADMISSION_BAND: Record<SpadesGateMode, { lower: number; upper: number }> = {
  'spades-solo': { lower: 0.15, upper: 0.6 },
  'spades-partners': { lower: 0.35, upper: 0.8 },
};
export const ADMISSION_MAX_ROUNDS = 100;

export type StyleAdmission = {
  mode: SpadesGateMode;
  style: string;
  seeds: { from: number; count: number };
  attempted: number;
  completed: number;
  /** Streams that reached the round cap without a winner. They stay in the denominator. */
  censored: number;
  d0Wins: number;
  /** D0 wins over attempted streams; a censored stream is not a win. */
  rate: number;
  band: { lower: number; upper: number };
  admitted: boolean;
};

/**
 * Plays complete matches with D0 as one competitor and the style in every other seat.
 * The D0 competitor moves one position per stream, so no seat is favoured. The numbers
 * that decide admission come from the gate run on development match seeds; this helper
 * only computes them.
 */
export function styleAdmission(
  mode: string,
  style: string,
  seeds: { from: number; count: number },
  maxRounds = ADMISSION_MAX_ROUNDS,
): StyleAdmission {
  const spadesMode = requireSpadesMode(mode);
  const competition = competitionFor(spadesMode);
  const reference = spadesStyle(D0_STYLE_ID);
  const other = spadesStyle(style);
  let completed = 0,
    censored = 0,
    d0Wins = 0;
  for (let i = 0; i < seeds.count; i++) {
    const seed = seeds.from + i;
    const competitor = competition.competitors[i % competition.competitors.length];
    const seats = ([0, 1, 2, 3] as Seat[]).map((seat) => (competitor.seats.includes(seat) ? reference : other));
    const journal = playSpadesStream(spadesMode, seed, seats, maxRounds, true);
    if (!journal.ended || journal.winner === null) {
      censored++;
      continue;
    }
    completed++;
    if (competitorOf(competition, journal.winner).id === competitor.id) d0Wins++;
  }
  const rate = seeds.count ? d0Wins / seeds.count : 0;
  const band = ADMISSION_BAND[spadesMode];
  return {
    mode: spadesMode,
    style,
    seeds: { ...seeds },
    attempted: seeds.count,
    completed,
    censored,
    d0Wins,
    rate,
    band,
    admitted: seeds.count > 0 && rate >= band.lower && rate <= band.upper,
  };
}
