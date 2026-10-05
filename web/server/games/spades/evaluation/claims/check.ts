import {
  actionId,
  cardRank,
  cardSuit,
  legalActions,
  trickWinner,
  type Card,
  type GameAction,
  type Play,
  type PrivateGame,
  type Seat,
  type Suit,
} from '../../../../game/index.ts';
import {
  competitionFor,
  competitorOf,
  opponentsOf,
  opposingCompetitors,
  teammatesOf,
} from '../../../../game/kernel/competition.ts';
import { scoreCompetitor } from '../../../../game/spades/score.ts';
import { observe } from '../../../../observations/index.ts';
import { suggestBid } from '../../../../strategy/baseline.ts';
import type { ReasonClaim } from '../../../../strategy/types.ts';
import { SPADES_CLAIM_PREDICATES } from '../../plan/claims.ts';
import { checkRule, type SpadesMode } from './rules.ts';
import { checkObservedCase } from './observed.ts';
import { checkPartnerResource } from './partner-resource.ts';
import {
  CLAIM_WORLD_BOUND,
  dealViolation,
  feasible,
  publicTricks,
  searchTrick,
  seatKnowledge,
  seatsAfter,
  type SeatKnowledge,
} from './worlds.ts';

/**
 * COACH-15: evaluation-only checkers for typed Spades claims.
 *
 * A checker re-derives its claim from the authoritative state with engine functions. It
 * never reads the fact builder, the analysis or authored text.
 *
 * - `state-exact`: recomputed from public state and the actor's own hand.
 * - `rule-profile`: decided by the engine and scorer on constructed hands.
 * - `all-consistent-worlds`: false when the real deal breaks it; false as `not-knowable`
 *   when the real deal agrees but another deal that fits the seat's view breaks it;
 *   confirmed only from the public trick when the actor plays fourth, or by an exact
 *   decision over every deal that fits the seat's view; otherwise not checkable.
 */
export const CLAIM_CHECK_VERSION = 'spades-claim-check-1.0.0';

export type ClaimVerdict = 'confirmed' | 'false' | 'not-checkable';
export type ClaimOutcome = { verdict: ClaimVerdict; reason: string };
export type ClaimResult = ClaimOutcome & { claim: ReasonClaim };
export type PredicateTally = { checked: number; false: number; notCheckable: number };
export type ClaimCheck = {
  /** Claims confirmed true. Disjoint from `falseClaims` and `notCheckable`. */
  checked: number;
  falseClaims: ReasonClaim[];
  notCheckable: number;
  byPredicate: Record<string, PredicateTally>;
  /** One entry per input claim, in input order, with the reason for its verdict. */
  results: ClaimResult[];
};
export type ClaimCheckOptions = {
  /** Ceiling on feasibility decisions for one claim. Defaults to the declared bound. */
  bound?: number;
};

type Args = ReasonClaim['args'];
type Context = {
  state: PrivateGame;
  seat: Seat;
  mode: SpadesMode;
  partnership: boolean;
  teammate: Seat | null;
  members: Seat[];
  opponents: Seat[];
  legal: GameAction[];
  acting: boolean;
  bound: number;
  knowledge(): SeatKnowledge;
};
export type ClaimChecker = (context: Context, args: Args) => ClaimOutcome;

class ClaimFault extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}
const malformed = (): never => {
  throw new ClaimFault('malformed-args');
};

const SEATS: Seat[] = [0, 1, 2, 3];
const SUITS: Suit[] = ['C', 'D', 'H', 'S'];
const MATCH_TARGET = 500;
const TRICKS_IN_HAND = 13;

const confirmed = (reason: string): ClaimOutcome => ({ verdict: 'confirmed', reason });
const wrong = (reason: string): ClaimOutcome => ({ verdict: 'false', reason });
const unknown = (reason: string): ClaimOutcome => ({ verdict: 'not-checkable', reason });
const exact = (holds: boolean): ClaimOutcome => (holds ? confirmed('state-exact') : wrong('state-mismatch'));

const has = (args: Args, key: string) => Object.hasOwn(args, key) && args[key] !== undefined;
function integer(args: Args, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) return malformed();
  return value;
}
function text(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value) return malformed();
  return value;
}
function flag(args: Args, key: string): boolean {
  const value = args[key];
  if (typeof value !== 'boolean') return malformed();
  return value;
}
function seatArg(args: Args, key: string): Seat {
  const value = integer(args, key);
  if (!SEATS.includes(value as Seat)) return malformed();
  return value as Seat;
}
function suitArg(args: Args, key: string): Suit {
  const value = text(args, key);
  if (!SUITS.includes(value as Suit)) return malformed();
  return value as Suit;
}
/** An optional value: absent is accepted, present must equal the recomputed value. */
const agrees = (args: Args, key: string, expected: string | number | boolean | null) =>
  !has(args, key) || args[key] === expected;

const relationOf = (context: Context, seat: Seat) =>
  seat === context.seat ? 'self' : seat === context.teammate ? 'teammate' : 'opponent';
const relationAgrees = (context: Context, args: Args, seat: Seat) =>
  !has(args, 'relation') || args.relation === null || args.relation === relationOf(context, seat);

const nilStatus = (state: PrivateGame, seat: Seat) => {
  const bid = state.bids[seat];
  if (bid === null) return 'unbid';
  return bid === 0 ? (state.tricks[seat] === 0 ? 'live' : 'failed') : 'none';
};

type Tally = { complete: boolean; positive: boolean; contract: number; credited: number; failedNilTricks: number };
function tally(state: PrivateGame, seats: readonly Seat[]): Tally {
  const result: Tally = { complete: true, positive: false, contract: 0, credited: 0, failedNilTricks: 0 };
  for (const seat of seats) {
    const bid = state.bids[seat];
    if (bid === null) result.complete = false;
    else if (bid > 0) {
      result.positive = true;
      result.contract += bid;
      result.credited += state.tricks[seat];
    } else result.failedNilTricks += state.tricks[seat];
  }
  return result;
}

const unplayed = (state: PrivateGame): Set<Card> => new Set(state.hands.flat());

type ResolvedPlay = { card: Card; plays: Play[]; winner: Seat };
/** The named action must be a legal card of the acting seat in the authoritative state. */
function resolvePlay(context: Context, args: Args): ResolvedPlay {
  const id = text(args, 'actionId');
  const action = context.legal.find((entry) => actionId(entry) === id);
  if (!context.acting || context.state.phase !== 'play' || !action || action.kind !== 'play')
    throw new ClaimFault('action-not-legal');
  const plays = [...context.state.trick, { seat: context.seat, card: action.card }];
  return { card: action.card, plays, winner: trickWinner(plays, context.mode) };
}
const inTrick = (context: Context) => context.acting && context.state.phase === 'play';

/** Exact decision for one card: does `winner` take the trick whatever the later seats hold and play? */
function guaranteed(context: Context, play: ResolvedPlay, winner: Seat): ClaimOutcome {
  const later = seatsAfter(context.seat, context.state.trick.length);
  const accept = (seat: Seat) => seat === winner;
  if (!later.length) return play.winner === winner ? confirmed('public-trick') : wrong('counterexample-in-deal');
  if (dealViolation(context.state, play.plays, later, accept)) return wrong('counterexample-in-deal');
  const knowledge = context.knowledge();
  if (!knowledge.consistent) return unknown('inconsistent-observation');
  let spent = 0;
  // While the claimed seat is ahead, only a single later card that beats it can change the result.
  const searches = play.winner === winner ? later.map((seat) => [seat]) : [later];
  for (const seats of searches) {
    const search = searchTrick(knowledge, play.plays, seats, accept, context.bound - spent);
    spent += search.evaluations;
    if (search.outcome === 'violation') return wrong('not-knowable');
    if (search.outcome === 'bound-exceeded') return unknown('work-bound-exceeded');
  }
  return confirmed('every-consistent-deal');
}

/** Worst outcome first: a false part makes the whole claim false, an open part leaves it open. */
function combine(outcomes: readonly ClaimOutcome[], whenEmpty: ClaimOutcome): ClaimOutcome {
  if (!outcomes.length) return whenEmpty;
  return (
    outcomes.find((entry) => entry.verdict === 'false' && entry.reason !== 'not-knowable') ??
    outcomes.find((entry) => entry.verdict === 'false') ??
    outcomes.find((entry) => entry.verdict === 'not-checkable') ??
    (outcomes.every((entry) => entry.reason === 'public-trick')
      ? confirmed('public-trick')
      : confirmed('every-consistent-deal'))
  );
}

function stanceOf(context: Context): string {
  const { state } = context;
  if (state.phase === 'bid') return 'spades.choose-commitment';
  const ownNil = nilStatus(state, context.seat) === 'live';
  const mateNil = context.teammate !== null && nilStatus(state, context.teammate) === 'live';
  if (ownNil) return mateNil ? 'spades.protect-both-nils' : 'spades.protect-own-nil';
  if (mateNil) return 'spades.protect-teammate-nil';
  const remaining = TRICKS_IN_HAND - state.history.length;
  const own = tally(state, context.members);
  const need = own.contract - own.credited;
  if (need > 0) return need > remaining ? 'spades.salvage-hand' : 'spades.make-contract';
  const canSet = opposingCompetitors(competitionFor(state.mode), context.seat).some((entry) => {
    const theirs = tally(state, entry.seats);
    const theirNeed = theirs.contract - theirs.credited;
    return theirNeed > 0 && theirNeed >= remaining;
  });
  return canSet ? 'spades.set-opponents' : 'spades.limit-bags';
}

type GoalFigures = {
  status: string;
  unit: string | null;
  comparator: string | null;
  target: number | null;
  current: number | null;
  remaining: number | null;
};
function goalOf(context: Context, goalId: string): GoalFigures | null {
  const { state, seat } = context;
  const bidding = state.phase === 'bid';
  const remaining = TRICKS_IN_HAND - state.history.length;
  const own = tally(state, context.members);
  const figures = (
    status: string,
    unit: string,
    comparator: string,
    target: number,
    current: number,
    left: number | null = remaining,
  ): GoalFigures => ({ status, unit, comparator, target, current, remaining: left });
  const nilGoal = (member: Seat): GoalFigures | null =>
    state.bids[member] === 0
      ? figures(
          state.tricks[member] > 0 ? 'failed' : remaining === 0 ? 'secured' : 'open',
          'tricks',
          'exactly',
          0,
          state.tricks[member],
        )
      : null;
  if (goalId === 'spades.choose-commitment')
    return bidding
      ? { status: 'open', unit: null, comparator: null, target: null, current: null, remaining: null }
      : null;
  if (goalId === 'spades.contract') {
    if (bidding || !own.positive) return null;
    const status =
      own.credited >= own.contract ? 'secured' : own.contract - own.credited > remaining ? 'failed' : 'open';
    return figures(status, 'tricks', 'at-least', own.contract, own.credited);
  }
  if (goalId === 'spades.own-nil') return nilGoal(seat);
  if (goalId === 'spades.teammate-nil') return context.teammate === null ? null : nilGoal(context.teammate);
  if (goalId === 'spades.bag-limit') {
    if (bidding) return null;
    const added = Math.max(0, own.credited - own.contract) + own.failedNilTricks;
    const room = 9 - state.bags[seat];
    return figures(added > room ? 'failed' : 'open', 'bags', 'at-most', room, added);
  }
  if (goalId === 'spades.reach-target') {
    const best = Math.max(
      ...opposingCompetitors(competitionFor(state.mode), seat).map((entry) => state.scores[entry.seats[0]]),
    );
    if (state.scores[seat] < MATCH_TARGET - 130 && best < MATCH_TARGET - 130) return null;
    return figures('open', 'points', 'at-least', MATCH_TARGET, state.scores[seat], null);
  }
  const [family, subject] = goalId.split(':');
  if (bidding || subject === undefined) return null;
  const opposing = opposingCompetitors(competitionFor(state.mode), seat);
  if (family === 'spades.hold-opposing-contract') {
    const entry = opposing.find((candidate) => candidate.id === subject);
    if (!entry) return null;
    const theirs = tally(state, entry.seats);
    if (!theirs.positive) return null;
    const status =
      theirs.credited >= theirs.contract
        ? 'failed'
        : theirs.contract - theirs.credited > remaining
          ? 'secured'
          : 'open';
    return figures(status, 'tricks', 'at-most', theirs.contract - 1, theirs.credited);
  }
  if (family === 'spades.break-opposing-nil') {
    const member = SEATS.find((candidate) => String(candidate) === subject);
    if (member === undefined || !opposing.some((entry) => entry.seats.includes(member))) return null;
    if (state.bids[member] !== 0) return null;
    const status = state.tricks[member] > 0 ? 'secured' : remaining === 0 ? 'failed' : 'open';
    return figures(status, 'tricks', 'at-least', 1, state.tricks[member]);
  }
  return null;
}

const rule =
  (predicate: string): ClaimChecker =>
  (context, args) => {
    const verdict = checkRule(predicate, context.mode, args);
    if (!verdict) return wrong('unknown-predicate');
    return verdict.holds ? confirmed('engine-behaviour') : wrong('rule-mismatch');
  };

/** One checker per predicate of the closed vocabulary. */
export const SPADES_CLAIM_CHECKERS: Record<string, ClaimChecker> = {
  'partner-safe-ruff-resource': (context, args) => checkPartnerResource(context.state,context.seat,args,context.bound),
  'case-no-entry': (context, args) => checkObservedCase(context.state, context.seat, 'case-no-entry', args, context.bound),
  'case-public-sweep': (context, args) => checkObservedCase(context.state, context.seat, 'case-public-sweep', args, context.bound),
  'case-partner-resource': (context, args) => checkObservedCase(context.state, context.seat, 'case-partner-resource', args, context.bound),
  'legal-count': (context, args) => exact(context.legal.length === integer(args, 'count')),
  'forced-action': (context, args) =>
    exact(
      context.legal.length === 1 &&
        (!has(args, 'actionId') || args.actionId === null || args.actionId === actionId(context.legal[0])),
    ),
  'own-void-in-led-suit': (context, args) => {
    const suit = suitArg(args, 'suit');
    const { trick, hands } = context.state;
    return exact(
      inTrick(context) &&
        trick.length > 0 &&
        cardSuit(trick[0].card) === suit &&
        !hands[context.seat].some((card) => cardSuit(card) === suit),
    );
  },
  'actors-after': (context, args) =>
    exact(inTrick(context) && 3 - context.state.trick.length === integer(args, 'count')),
  'acts-later': (context, args) => {
    const seat = seatArg(args, 'seat');
    return exact(
      inTrick(context) &&
        seatsAfter(context.seat, context.state.trick.length).includes(seat) &&
        relationAgrees(context, args, seat),
    );
  },
  'current-winner': (context, args) => {
    const seat = seatArg(args, 'seat');
    const { trick } = context.state;
    return exact(
      inTrick(context) &&
        trick.length > 0 &&
        trickWinner(trick, context.mode) === seat &&
        relationAgrees(context, args, seat),
    );
  },
  'nil-status': (context, args) => {
    const seat = seatArg(args, 'seat');
    return exact(nilStatus(context.state, seat) === text(args, 'status') && relationAgrees(context, args, seat));
  },
  'public-bid': (context, args) => {
    const seat = seatArg(args, 'seat');
    return exact(context.state.bids[seat] === integer(args, 'bid') && relationAgrees(context, args, seat));
  },
  'bids-placed': (context, args) =>
    exact(context.state.bids.filter((bid) => bid !== null).length === integer(args, 'count')),
  'opposing-bid-total': (context, args) =>
    exact(
      context.opponents.reduce<number>((sum, seat) => sum + (context.state.bids[seat] ?? 0), 0) ===
        integer(args, 'total'),
    ),
  'contract-need': (context, args) => {
    const needed = integer(args, has(args, 'needed') ? 'needed' : 'need');
    const own = tally(context.state, context.members);
    if (!own.complete) return wrong('bidding-incomplete');
    const scope = has(args, 'scope') ? text(args, 'scope') : null;
    if (scope !== null && scope !== 'team' && scope !== 'individual') return malformed();
    return exact(
      Math.max(0, own.contract - own.credited) === needed &&
        agrees(args, 'contract', own.contract) &&
        agrees(args, 'credited', own.credited) &&
        (scope === null || (scope === 'team') === context.partnership),
    );
  },
  'contract-met': (context, args) => {
    const own = tally(context.state, context.members);
    if (!own.complete) return wrong('bidding-incomplete');
    return exact(
      own.contract > 0 &&
        own.credited >= own.contract &&
        agrees(args, 'contract', own.contract) &&
        agrees(args, 'credited', own.credited),
    );
  },
  'next-bag-delta': (context, args) => {
    const delta = integer(args, 'delta');
    const { state } = context;
    const own = tally(state, context.members);
    const oldBags = state.bags[context.seat];
    const bidder = context.members.find((member) => (state.bids[member] ?? 0) > 0);
    if (own.complete && bidder !== undefined && own.credited >= own.contract) {
      // The contract is met: one more trick for a positive bidder is one more ordinary bag.
      const bids = context.members.map((member) => state.bids[member]!);
      const now = scoreCompetitor({ bids, tricks: context.members.map((member) => state.tricks[member]), oldBags });
      const next = scoreCompetitor({
        bids,
        tricks: context.members.map((member) => state.tricks[member] + (member === bidder ? 1 : 0)),
        oldBags,
      });
      return exact(next.delta - now.delta === delta);
    }
    // No ordinary bag can be taken yet: the scorer decides from the bags carried so far.
    const carried = (oldBags + own.failedNilTricks) % 10;
    const made = scoreCompetitor({ bids: [1], tricks: [1], oldBags: carried });
    const over = scoreCompetitor({ bids: [1], tricks: [2], oldBags: carried });
    return exact(over.delta - made.delta === delta);
  },
  'opposing-nil-live': (context, args) => {
    const seat = seatArg(args, 'seat');
    return exact(context.opponents.includes(seat) && nilStatus(context.state, seat) === 'live');
  },
  'action-wins-now': (context, args) => {
    const wins = flag(args, 'wins');
    return exact((resolvePlay(context, args).winner === context.seat) === wins);
  },
  'winner-after-action': (context, args) => {
    const winner = seatArg(args, 'winner');
    return exact(resolvePlay(context, args).winner === winner && relationAgrees(context, args, winner));
  },
  'action-covers-teammate-nil': (context, args) => {
    const claimed = flag(args, 'covers');
    const play = resolvePlay(context, args);
    const mate = context.teammate;
    const { trick } = context.state;
    const covers =
      mate !== null &&
      nilStatus(context.state, mate) === 'live' &&
      trick.length > 0 &&
      trickWinner(trick, context.mode) === mate &&
      play.winner !== mate;
    return exact(covers === claimed);
  },
  'action-is-master': (context, args) => {
    const master = flag(args, 'master');
    const { card } = resolvePlay(context, args);
    const higher = [...unplayed(context.state)].some(
      (other) => cardSuit(other) === cardSuit(card) && cardRank(other) > cardRank(card),
    );
    return exact(!higher === master);
  },
  'action-suit-position': (context, args) => {
    const position = text(args, 'position');
    const held = integer(args, 'held');
    const { card } = resolvePlay(context, args);
    const ranks = context.state.hands[context.seat]
      .filter((other) => cardSuit(other) === cardSuit(card))
      .map(cardRank);
    const rank = cardRank(card);
    const actual =
      ranks.length === 1
        ? 'only'
        : rank === Math.min(...ranks)
          ? 'lowest'
          : rank === Math.max(...ranks)
            ? 'highest'
            : 'middle';
    return exact(actual === position && ranks.length === held);
  },
  'action-lowest-winner': (context, args) => {
    const play = resolvePlay(context, args);
    const winners = context.legal.flatMap((action) =>
      action.kind === 'play' &&
      trickWinner([...context.state.trick, { seat: context.seat, card: action.card }], context.mode) ===
        context.seat
        ? [cardRank(action.card)]
        : [],
    );
    return exact(
      play.winner === context.seat && winners.length >= 2 && cardRank(play.card) === Math.min(...winners),
    );
  },
  'retains-suit': (context, args) => {
    const suit = suitArg(args, 'suit');
    const { card } = resolvePlay(context, args);
    return exact(context.state.hands[context.seat].some((other) => other !== card && cardSuit(other) === suit));
  },
  'own-suit-count': (context, args) => {
    const suit = suitArg(args, 'suit');
    return exact(
      context.state.hands[context.seat].filter((card) => cardSuit(card) === suit).length ===
        integer(args, 'count'),
    );
  },
  'top-trump-held': (context, args) => {
    const count = integer(args, 'count');
    const held = new Set(
      context.state.hands[context.seat].filter((card) => cardSuit(card) === 'S').map(cardRank),
    );
    let run = 0;
    for (let rank = 14; rank >= 2 && held.has(rank); rank--) run++;
    return exact(run === count);
  },
  'concealed-cards-remain': (context, args) =>
    exact(
      SEATS.filter((seat) => seat !== context.seat).reduce<number>(
        (sum, seat) => sum + context.state.hands[seat].length,
        0,
      ) === integer(args, 'count'),
    ),
  'bid-contract-total': (context, args) => {
    const bid = integer(args, 'bid');
    const teammateBid = integer(args, 'teammateBid');
    const total = integer(args, 'total');
    const within = flag(args, 'within');
    const mate = context.teammate;
    return exact(
      context.acting &&
        context.state.phase === 'bid' &&
        context.legal.some((action) => action.kind === 'bid' && action.bid === bid) &&
        mate !== null &&
        context.state.bids[mate] === teammateBid &&
        teammateBid > 0 &&
        total === bid + teammateBid &&
        within === (total <= TRICKS_IN_HAND),
    );
  },
  'bid-matches-count': (context, args) => {
    const bid = integer(args, 'bid');
    const count = integer(args, 'count');
    return exact(
      context.acting &&
        context.state.phase === 'bid' &&
        context.legal.some((action) => action.kind === 'bid' && action.bid === bid) &&
        count === suggestBid(context.state.hands[context.seat]) &&
        bid === count,
    );
  },
  'trick-event': (context, args) => {
    const seat = seatArg(args, 'seat');
    const suit = suitArg(args, 'suit');
    const number = integer(args, 'trick');
    const event = text(args, 'event');
    if (!['off-suit', 'failed-to-follow', 'led-and-won'].includes(event)) return malformed();
    const plays = publicTricks(context.state)[number - 1];
    const played = plays?.find((entry) => entry.seat === seat);
    if (!plays || !played || !relationAgrees(context, args, seat)) return wrong('state-mismatch');
    const led = cardSuit(plays[0].card);
    if (event === 'off-suit') return exact(cardSuit(played.card) === suit && suit !== led);
    if (event === 'failed-to-follow') return exact(led === suit && cardSuit(played.card) !== led);
    const finished = context.state.history[number - 1];
    return exact(plays[0].seat === seat && led === suit && finished !== undefined && finished.winner === seat);
  },
  'has-played': (context, args) => {
    const seat = seatArg(args, 'seat');
    return exact(
      publicTricks(context.state).some((plays) => plays.some((entry) => entry.seat === seat)) &&
        relationAgrees(context, args, seat),
    );
  },
  'public-void': (context, args) => {
    const seat = seatArg(args, 'seat');
    const suit = suitArg(args, 'suit');
    const holds = context.state.hands[seat].some((card) => cardSuit(card) === suit);
    if (context.knowledge().excluded[seat].has(suit))
      return holds ? wrong('counterexample-in-deal') : confirmed('public-history');
    // True in the deal without public evidence is a leak of concealed cards, never a fact.
    return wrong(holds ? 'counterexample-in-deal' : 'not-knowable');
  },
  'plan-stance': (context, args) => exact(stanceOf(context) === text(args, 'stanceId')),
  'goal-progress': (context, args) => {
    const goal = goalOf(context, text(args, 'goalId'));
    if (!goal) return wrong('no-such-goal');
    const keys = ['status', 'unit', 'comparator', 'target', 'current', 'remaining'] as const;
    if (!keys.some((key) => has(args, key))) return malformed();
    return exact(keys.every((key) => agrees(args, key, goal[key])));
  },
  'trump-optional': rule('trump-optional'),
  'team-contract-rule': rule('team-contract-rule'),
  'nil-tricks-no-credit': rule('nil-tricks-no-credit'),
  'nil-bid-rule': rule('nil-bid-rule'),
  'failed-nil-bags': rule('failed-nil-bags'),
  'match-after-hand': rule('match-after-hand'),
  'trump-beats-side-suit': rule('trump-beats-side-suit'),
  'nil-award': (context, args) => {
    integer(args, 'made');
    integer(args, 'failed');
    return rule('nil-award')(context, args);
  },
  'hand-trick-total': (context, args) => {
    integer(args, 'total');
    return rule('hand-trick-total')(context, args);
  },
  'mode-objective': (context, args) => {
    if (!has(args, 'mode') && !has(args, 'competition')) return malformed();
    const competition = competitionFor(context.mode).mode;
    const engine = checkRule('mode-objective', context.mode, { competition });
    if (!engine?.holds) return wrong('rule-mismatch');
    const agreed =
      agrees(args, 'mode', context.mode) &&
      agrees(args, 'competition', competition) &&
      agrees(args, 'teammate', context.teammate);
    return agreed ? confirmed('engine-behaviour') : wrong('rule-mismatch');
  },
  'guaranteed-winner': (context, args) => {
    const winner = seatArg(args, 'winner');
    const play = resolvePlay(context, args);
    if (!relationAgrees(context, args, winner)) return wrong('relation-mismatch');
    return guaranteed(context, play, winner);
  },
  'no-legal-cover': (context, args) => {
    const mate = seatArg(args, 'teammate');
    const { trick } = context.state;
    if (mate !== context.teammate || !inTrick(context) || !trick.length) return wrong('state-mismatch');
    if (trickWinner(trick, context.mode) !== mate) return wrong('state-mismatch');
    return combine(
      context.legal.map((action) =>
        guaranteed(context, resolvePlay(context, { actionId: actionId(action) }), mate),
      ),
      wrong('state-mismatch'),
    );
  },
  'cannot-hold-suit': (context, args) => {
    const seat = seatArg(args, 'seat');
    const suit = suitArg(args, 'suit');
    if (context.state.hands[seat].some((card) => cardSuit(card) === suit)) return wrong('counterexample-in-deal');
    if (seat === context.seat) return confirmed('own-hand');
    const knowledge = context.knowledge();
    if (!knowledge.consistent) return unknown('inconsistent-observation');
    const possible = knowledge.unknown.some(
      (card) => cardSuit(card) === suit && feasible(knowledge, { holds: [{ seat, card }] }),
    );
    return possible ? wrong('not-knowable') : confirmed('every-consistent-deal');
  },
};

function createContext(state: PrivateGame, seat: Seat, bound: number): Context {
  if (state.mode !== 'spades-solo' && state.mode !== 'spades-partners')
    throw new Error('Spades claims need a Spades state.');
  if (!SEATS.includes(seat)) throw new Error('Invalid seat.');
  const competition = competitionFor(state.mode);
  let knowledge: SeatKnowledge | null = null;
  return {
    state,
    seat,
    mode: state.mode,
    partnership: competition.mode === 'partnership',
    teammate: teammatesOf(competition, seat)[0] ?? null,
    members: [...competitorOf(competition, seat).seats],
    opponents: opponentsOf(competition, seat),
    legal: legalActions(state, seat),
    acting: state.turn === seat && (state.phase === 'bid' || state.phase === 'play'),
    bound,
    // The seat's own view comes from the production projection, so knowledge checks are seat-safe.
    knowledge: () => (knowledge ??= seatKnowledge(observe(state, seat))),
  };
}

function decide(context: Context, entry: ReasonClaim): ClaimOutcome {
  if (!Object.hasOwn(SPADES_CLAIM_PREDICATES, entry.predicate)) return wrong('unknown-predicate');
  if (!Object.hasOwn(SPADES_CLAIM_CHECKERS, entry.predicate)) return wrong('no-checker');
  if (typeof entry.args !== 'object' || entry.args === null) return wrong('malformed-args');
  try {
    return SPADES_CLAIM_CHECKERS[entry.predicate](context, entry.args);
  } catch (error) {
    if (error instanceof ClaimFault) return wrong(error.reason);
    throw error;
  }
}

/**
 * Checks typed claims made for `seat` at the decision in `state`, the authoritative state
 * before the action. `checked`, `falseClaims` and `notCheckable` are disjoint and add up
 * to the number of claims. A predicate outside the vocabulary, a predicate without a
 * checker and malformed arguments all count as false.
 */
export function checkSpadesClaims(
  state: PrivateGame,
  seat: Seat,
  claims: ReasonClaim[],
  options: ClaimCheckOptions = {},
): ClaimCheck {
  const bound = options.bound ?? CLAIM_WORLD_BOUND;
  if (!Number.isInteger(bound) || bound < 1 || bound > CLAIM_WORLD_BOUND)
    throw new Error(`The work bound must be an integer from 1 to ${CLAIM_WORLD_BOUND}.`);
  const context = createContext(state, seat, bound);
  const result: ClaimCheck = { checked: 0, falseClaims: [], notCheckable: 0, byPredicate: {}, results: [] };
  for (const entry of claims) {
    const outcome = decide(context, entry);
    const counts = (result.byPredicate[entry.predicate] ??= { checked: 0, false: 0, notCheckable: 0 });
    if (outcome.verdict === 'confirmed') {
      result.checked++;
      counts.checked++;
    } else if (outcome.verdict === 'false') {
      result.falseClaims.push(entry);
      counts.false++;
    } else {
      result.notCheckable++;
      counts.notCheckable++;
    }
    result.results.push({ claim: entry, ...outcome });
  }
  return result;
}
