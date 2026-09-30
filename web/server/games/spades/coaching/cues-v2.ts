import { cardLabel, cardRank, cardSuit, fullDeck, sorted } from '../../../game/cards.ts';
import { competitionFor, teammatesOf } from '../../../game/kernel/competition.ts';
import type { Card, GameAction, Seat, Suit } from '../../../game/kernel/types.ts';
import { actionId, trickWinner } from '../../../game/rules.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import { COPY_BUDGET, type Advice, type CuePack } from '../../../coaching/types.ts';
import { suggestBid } from '../../../strategy/baseline.ts';
import type { PlanGoal } from '../../../strategy/plan/types.ts';
import type {
  DecisionAnalysis,
  DecisionAnalysisV11,
  DecisionEvidence,
  ReasonClaim,
} from '../../../strategy/types.ts';
import { claim, planStanceClaim, type SpadesClaimRelation } from '../plan/claims.ts';

/**
 * Cue version 2 for the Spades plan profiles (`spades-plan-3.*`).
 *
 * COACH-12: every sentence at every level comes from one template below. A template's
 * predicate is evaluated on the seat observation, the analysis and the SELECTED action,
 * and the sentence is shown only when the predicate holds. Nothing here reads a concealed
 * card. When no explaining template holds, the cue shows exact facts only.
 *
 * COACH-13: exact goal progress appears at Notice; the stance appears from Consider onward
 * as "One plan: ...". Templates that mention a partner or a team require a partnership.
 *
 * COACH-14: `several-reasonable` names no single action. Considered choices are named only
 * when at most three distinct choices remain after merging interchangeable cards.
 *
 * COACH-15: every factual sentence carries typed claims from the closed vocabulary in
 * ../plan/claims.ts, which documents the arguments of each predicate. Sentences that only
 * state how the choice was made, or that other choices exist, carry no claim.
 */
export const SPADES_PLAN_CUE_VERSION = 'spades-cues-2.0.0';

export type CueParams = Record<string, string | number | boolean | null>;
export type CueLevel = keyof typeof COPY_BUDGET;
export type CueSlot = 'heading' | 'fact' | 'claim' | 'plan' | 'evidence' | 'lead-in' | 'tradeoff' | 'closing';

export type PlayView = {
  card: Card;
  suit: Suit;
  lead: boolean;
  led: Suit | null;
  /** Seat winning the incomplete trick before this card, or null on a lead. */
  winnerBefore: Seat | null;
  winsNow: boolean;
  /** Players still to act after this seat in the current trick. */
  after: number;
  coversTeammateNil: boolean;
  master: boolean;
  position: 'only' | 'lowest' | 'highest' | 'middle';
  held: number;
  lowestWinner: boolean;
  discard: boolean;
  /** Lead only: the teammate has publicly failed to follow this side suit and may still hold a spade. */
  teammateMayRuff: boolean;
};

export type BidView = {
  bid: number;
  teammateBid: number | null;
  spades: number;
  topRun: number;
  structureCount: number;
};

export type CueContext = {
  observation: SeatObservation;
  analysis: DecisionAnalysisV11;
  action: GameAction;
  actionId: string;
  partnership: boolean;
  teammate: Seat | null;
  forced: boolean;
  /** The action was selected by playouts on sampled deals. */
  searched: boolean;
  /** The analysis recorded a supported explanation for the selected action. */
  supported: boolean;
  planSupported: boolean;
  several: boolean;
  /** Distinct choices the evidence does not separate, selected action included, equivalents merged. */
  choices: GameAction[];
  reasonIds: readonly string[];
  play: PlayView | null;
  bid: BidView | null;
};

export type CueTemplate = {
  id: string;
  level: CueLevel;
  slot: CueSlot;
  budgetWords: number;
  /** True when the sentence gives a reason or evidence rather than exact context. */
  explains?: boolean;
  /** Returns the sentence parameters when the cue holds for the selected action, otherwise null. */
  predicate(context: CueContext): CueParams | null;
  render(params: CueParams): string;
  claims(params: CueParams): ReasonClaim[];
};

export type RenderedCue = {
  templateId: string;
  level: CueLevel;
  slot: CueSlot;
  text: string;
  params: CueParams;
  claims: ReasonClaim[];
};

/** Slot budgets. Each level's slots sum to at most the level budget in COPY_BUDGET. */
const BUDGET = {
  claim: 16,
  plan: 9,
  considerEvidence: 10,
  leadIn: 6,
  severalLeadIn: 16,
  suggestEvidence: 25,
  tradeoff: 19,
  closing: 6,
} as const;

const SEAT_NAMES = ['South', 'West', 'North', 'East'] as const;
const SUIT_NAMES: Record<Suit, string> = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };

export const countWords = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;
const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
const text = (value: CueParams[string]) => String(value);
const number = (value: CueParams[string]) => Number(value);
const lowerFirst = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);
const bidWord = (bid: number) => (bid === 0 ? 'Nil' : String(bid));
const none = (): ReasonClaim[] => [];

const nilStatus = (observation: SeatObservation, seat: Seat): 'none' | 'live' | 'failed' =>
  observation.bids[seat] === 0 ? (observation.tricks[seat] === 0 ? 'live' : 'failed') : 'none';

const seatLabel = (context: CueContext, seat: Seat): string =>
  seat === context.teammate ? 'your partner' : SEAT_NAMES[seat];
const relationOf = (context: CueContext, seat: Seat): SpadesClaimRelation =>
  seat === context.observation.seat ? 'self' : seat === context.teammate ? 'teammate' : 'opponent';

function publicCards(observation: SeatObservation): Set<Card> {
  return new Set([...observation.history.flatMap((trick) => trick.plays), ...observation.trick].map((play) => play.card));
}

/** Exact properties of one legal card, from the seat observation only. */
export function viewPlay(observation: SeatObservation, teammate: Seat | null, card: Card): PlayView {
  const seat = observation.seat;
  const suit = cardSuit(card);
  const lead = observation.trick.length === 0;
  const led = lead ? null : cardSuit(observation.trick[0].card);
  const winnerBefore = lead ? null : trickWinner(observation.trick, observation.mode);
  const winnerAfter = trickWinner([...observation.trick, { seat, card }], observation.mode);
  const winsNow = winnerAfter === seat;
  const played = publicCards(observation);
  const unplayed = fullDeck().filter((entry) => !played.has(entry) && cardSuit(entry) === suit);
  const own = observation.hand.filter((entry) => cardSuit(entry) === suit).map(cardRank);
  const rank = cardRank(card);
  const winners = observation.legalActions.flatMap((action) =>
    action.kind === 'play' &&
    trickWinner([...observation.trick, { seat, card: action.card }], observation.mode) === seat
      ? [cardRank(action.card)]
      : [],
  );
  const shownOut = (member: Seat, of: Suit) =>
    observation.memory.some((entry) => entry.suit === of && entry.voidSeats.includes(member));
  const spadesElsewhere = fullDeck().some(
    (entry) => cardSuit(entry) === 'S' && !played.has(entry) && !observation.hand.includes(entry),
  );
  return {
    card,
    suit,
    lead,
    led,
    winnerBefore,
    winsNow,
    after: 3 - observation.trick.length,
    coversTeammateNil:
      teammate !== null &&
      nilStatus(observation, teammate) === 'live' &&
      winnerBefore === teammate &&
      winnerAfter !== teammate,
    master: !unplayed.some((entry) => cardRank(entry) > rank),
    position:
      own.length === 1
        ? 'only'
        : rank === Math.min(...own)
          ? 'lowest'
          : rank === Math.max(...own)
            ? 'highest'
            : 'middle',
    held: own.length,
    lowestWinner: winsNow && winners.length >= 2 && rank === Math.min(...winners),
    discard: !lead && suit !== led && suit !== 'S',
    teammateMayRuff:
      lead &&
      teammate !== null &&
      suit !== 'S' &&
      shownOut(teammate, suit) &&
      !shownOut(teammate, 'S') &&
      spadesElsewhere &&
      observation.handSizes[teammate] > 0,
  };
}

function viewBid(observation: SeatObservation, teammate: Seat | null, bid: number): BidView {
  const spades = new Set(observation.hand.filter((card) => cardSuit(card) === 'S').map(cardRank));
  let topRun = 0;
  for (let rank = 14; rank >= 2 && spades.has(rank); rank--) topRun++;
  return {
    bid,
    teammateBid: teammate === null ? null : observation.bids[teammate],
    spades: spades.size,
    topRun,
    structureCount: suggestBid(observation.hand),
  };
}

export function buildCueContext(observation: SeatObservation, analysis: DecisionAnalysisV11): CueContext {
  const action = analysis.action;
  const id = actionId(action);
  const teammate = teammatesOf(competitionFor(observation.mode), observation.seat)[0] ?? null;
  const candidate = analysis.candidates.find((entry) => actionId(entry.action) === id);
  const forced = observation.legalActions.length === 1;
  const legal = new Map(observation.legalActions.map((entry) => [actionId(entry), entry]));
  const comparable = [...new Set(analysis.decision.comparableActionIds)].filter(
    (entry) => entry !== id && legal.has(entry),
  );
  const several = !forced && analysis.decision.coach.outcome === 'several-reasonable' && comparable.length > 0;
  return {
    observation,
    analysis,
    action,
    actionId: id,
    partnership: teammate !== null,
    teammate,
    forced,
    searched:
      !forced && (analysis.decision.selectedBy === 'search' || analysis.decision.selectedBy === 'search-tiebreak'),
    supported: !forced && analysis.decision.coach.explanation === 'supported',
    planSupported: analysis.decision.planSupported,
    several,
    choices: several ? [action, ...comparable.map((entry) => legal.get(entry)!)] : [action],
    reasonIds: candidate?.reasonIds ?? [],
    play: action.kind === 'play' ? viewPlay(observation, teammate, action.card) : null,
    bid: action.kind === 'bid' ? viewBid(observation, teammate, action.bid) : null,
  };
}

const goalNamed = (context: CueContext, id: string): PlanGoal | undefined =>
  context.analysis.plan.goals.find((goal) => goal.id === id || goal.id.startsWith(`${id}:`));
const headlineGoal = (context: CueContext): PlanGoal | undefined =>
  [...context.analysis.plan.goals].sort((a, b) => a.priority - b.priority)[0];
/** Same arguments as `goalProgressClaim` in ../plan/claims.ts, carried as sentence parameters. */
const progressClaim = (goal: PlanGoal): CueParams => ({
  goalId: goal.id,
  status: goal.status,
  unit: goal.progress?.unit ?? null,
  comparator: goal.progress?.comparator ?? null,
  target: goal.progress?.target ?? null,
  current: goal.progress?.current ?? null,
  remaining: goal.progress?.remainingOpportunities ?? null,
});
const goalProgress = (params: CueParams): ReasonClaim =>
  claim('goal-progress', {
    goalId: params.goalId,
    status: params.status,
    unit: params.unit,
    comparator: params.comparator,
    target: params.target,
    current: params.current,
    remaining: params.remaining,
  });
const nilClaim = (seat: CueParams[string], status: 'live' | 'failed', relation: SpadesClaimRelation): ReasonClaim =>
  claim('nil-status', { seat, status, relation });

type Holds = (context: CueContext) => CueParams | null;
const playing = (context: CueContext) => context.play !== null;

/** One exact situation gives the heading and the Notice sentence, so the two never disagree. */
function situation(
  id: string,
  predicate: Holds,
  heading: (params: CueParams) => string,
  fact: (params: CueParams) => string,
  claims: (params: CueParams) => ReasonClaim[],
): CueTemplate[] {
  return [
    { id: `${id}.heading`, level: 'focus', slot: 'heading', budgetWords: COPY_BUDGET.focus, predicate, render: heading, claims },
    { id: `${id}.fact`, level: 'notice', slot: 'fact', budgetWords: COPY_BUDGET.notice, predicate, render: fact, claims },
  ];
}

/**
 * One exact statement about the selected action. Consider describes it without naming the
 * card or bid; the suggestion restates it once the action has been named.
 */
function actionClaim(
  id: string,
  predicate: Holds,
  phrase: (params: CueParams) => string,
  claims: (params: CueParams) => ReasonClaim[],
  explains = false,
): CueTemplate[] {
  return [
    {
      id: `${id}.consider`, level: 'reason', slot: 'claim', budgetWords: BUDGET.claim, explains,
      predicate, render: (params) => `One option ${phrase(params)}.`, claims,
    },
    {
      id: `${id}.suggest`, level: 'suggestion', slot: 'claim', budgetWords: BUDGET.claim, explains,
      predicate: (context) =>
        context.forced || context.several || context.searched ? null : predicate(context),
      render: (params) => `It ${phrase(params)}.`, claims,
    },
  ];
}

const contractOwner = (params: CueParams) => (params.partnership ? 'Your team contract' : 'Your contract');
const winsClaim = (params: CueParams, wins: boolean) => claim('action-wins-now', { actionId: params.actionId, wins });
const stillToAct = (params: CueParams) =>
  `${count(number(params.after), 'player still acts', 'players still act')} after you`;

const SITUATIONS: CueTemplate[] = [
  ...situation(
    'forced',
    (context) =>
      context.forced && context.play ? { actionId: context.actionId, card: cardLabel(context.play.card) } : null,
    () => 'One legal play',
    (params) => `${text(params.card)} is your only legal card.`,
    (params) => [claim('forced-action', { actionId: params.actionId }), claim('legal-count', { count: 1 })],
  ),
  ...situation(
    'bid.partner-bid',
    (context) =>
      context.bid && context.teammate !== null && context.bid.teammateBid !== null
        ? { seat: context.teammate, bid: context.bid.teammateBid }
        : null,
    () => 'Choose your bid',
    (params) => `Your partner has bid ${bidWord(number(params.bid))}.`,
    (params) => [claim('public-bid', { seat: params.seat, bid: params.bid, relation: 'teammate' })],
  ),
  ...situation(
    'bid.spades-held',
    (context) => (context.bid ? { count: context.bid.spades } : null),
    () => 'Choose your bid',
    (params) =>
      number(params.count) === 0
        ? 'You hold no spades, the trump suit.'
        : `You hold ${count(number(params.count), 'spade', 'spades')}, the trump suit.`,
    (params) => [claim('own-suit-count', { suit: 'S', count: params.count })],
  ),
  ...situation(
    'nil.both-live',
    (context) =>
      playing(context) &&
      context.teammate !== null &&
      nilStatus(context.observation, context.observation.seat) === 'live' &&
      nilStatus(context.observation, context.teammate) === 'live'
        ? { seat: context.observation.seat, teammate: context.teammate }
        : null,
    () => 'Two Nils are live',
    () => 'Your Nil and your partner’s Nil are both still live.',
    (params) => [nilClaim(params.seat, 'live', 'self'), nilClaim(params.teammate, 'live', 'teammate')],
  ),
  ...situation(
    'nil.own-live',
    (context) =>
      playing(context) && nilStatus(context.observation, context.observation.seat) === 'live'
        ? { seat: context.observation.seat }
        : null,
    () => 'Your Nil is live',
    () => 'Your Nil is still live: you have taken no tricks this hand.',
    (params) => [nilClaim(params.seat, 'live', 'self')],
  ),
  ...situation(
    'nil.partner-winning',
    (context) =>
      context.play &&
      context.teammate !== null &&
      nilStatus(context.observation, context.teammate) === 'live' &&
      context.play.winnerBefore === context.teammate
        ? { seat: context.teammate }
        : null,
    () => 'Your partner’s Nil is live',
    () => 'Your Nil partner is winning this trick so far.',
    (params) => [
      nilClaim(params.seat, 'live', 'teammate'),
      claim('current-winner', { seat: params.seat, relation: 'teammate' }),
    ],
  ),
  ...situation(
    'nil.partner-live',
    (context) =>
      playing(context) && context.teammate !== null && nilStatus(context.observation, context.teammate) === 'live'
        ? { seat: context.teammate }
        : null,
    () => 'Your partner’s Nil is live',
    () => 'Your partner’s Nil is still live: no tricks taken so far.',
    (params) => [nilClaim(params.seat, 'live', 'teammate')],
  ),
  ...situation(
    'contract.failed',
    (context) => {
      const goal = playing(context) ? goalNamed(context, 'spades.contract') : undefined;
      if (!goal?.progress || goal.status !== 'failed') return null;
      return {
        ...progressClaim(goal),
        partnership: context.partnership,
        need: (goal.progress.target ?? 0) - (goal.progress.current ?? 0),
      };
    },
    () => 'Contract out of reach',
    (params) =>
      `${contractOwner(params)} is out of reach: it needs ${count(number(params.need), 'more trick', 'more tricks')} and only ${params.remaining} remain.`,
    (params) => [goalProgress(params)],
  ),
  ...situation(
    'opposing-contract.tight',
    (context) => {
      if (!playing(context) || context.analysis.plan.stance.id !== 'spades.set-opponents') return null;
      const goal = context.analysis.plan.goals.find(
        (entry) =>
          entry.id.startsWith('spades.hold-opposing-contract:') &&
          entry.status === 'open' &&
          entry.progress !== null &&
          (entry.progress.target ?? 0) + 1 - (entry.progress.current ?? 0) >=
            (entry.progress.remainingOpportunities ?? 0),
      );
      if (!goal?.progress) return null;
      return {
        ...progressClaim(goal),
        partnership: context.partnership,
        need: (goal.progress.target ?? 0) + 1 - (goal.progress.current ?? 0),
      };
    },
    (params) => (params.partnership ? 'The opposing contract' : 'An opposing contract'),
    (params) =>
      `${params.partnership ? 'The' : 'An'} opposing contract needs ${count(number(params.need), 'more trick', 'more tricks')}; ${count(number(params.remaining), 'trick remains', 'tricks remain')} in this hand.`,
    (params) => [goalProgress(params)],
  ),
  ...situation(
    'contract.open',
    (context) => {
      const goal = playing(context) ? headlineGoal(context) : undefined;
      if (!goal?.progress || goal.id !== 'spades.contract' || goal.status !== 'open') return null;
      const contract = goal.progress.target ?? 0;
      const credited = goal.progress.current ?? 0;
      return { ...progressClaim(goal), partnership: context.partnership, contract, credited, need: contract - credited };
    },
    (params) => (params.partnership ? 'Your team contract' : 'Your own contract'),
    (params) =>
      `${contractOwner(params)} needs ${count(number(params.need), 'more trick', 'more tricks')}; ${count(number(params.remaining), 'trick remains', 'tricks remain')} in this hand.`,
    (params) => [
      claim('contract-need', {
        needed: params.need,
        contract: params.contract,
        credited: params.credited,
        scope: params.partnership ? 'team' : 'individual',
      }),
      goalProgress(params),
    ],
  ),
  ...situation(
    'contract.made',
    (context) => {
      const goal = playing(context) ? headlineGoal(context) : undefined;
      if (!goal?.progress || goal.id !== 'spades.contract' || goal.status !== 'secured') return null;
      return {
        ...progressClaim(goal),
        partnership: context.partnership,
        contract: goal.progress.target ?? 0,
        credited: goal.progress.current ?? 0,
      };
    },
    () => 'Contract made',
    (params) => `${contractOwner(params)} of ${params.contract} is made.`,
    (params) => [claim('contract-met', { contract: params.contract, credited: params.credited }), goalProgress(params)],
  ),
  ...situation(
    'bags.after-contract',
    (context) => {
      const goal = playing(context) ? headlineGoal(context) : undefined;
      const contract = goalNamed(context, 'spades.contract');
      if (!goal?.progress || goal.id !== 'spades.bag-limit' || !contract?.progress || contract.status !== 'secured')
        return null;
      return {
        ...progressClaim(goal),
        partnership: context.partnership,
        contract: contract.progress.target ?? 0,
        credited: contract.progress.current ?? 0,
        added: goal.progress.current ?? 0,
      };
    },
    () => 'Contract made',
    (params) =>
      `${contractOwner(params)} of ${params.contract} is made; this hand has added ${count(number(params.added), 'bag', 'bags')} so far.`,
    (params) => [claim('contract-met', { contract: params.contract, credited: params.credited }), goalProgress(params)],
  ),
  ...situation(
    'bags.count',
    (context) => {
      const goal = playing(context) ? headlineGoal(context) : undefined;
      if (!goal?.progress || goal.id !== 'spades.bag-limit') return null;
      return {
        ...progressClaim(goal),
        partnership: context.partnership,
        bags: context.observation.bags[context.observation.seat],
        added: goal.progress.current ?? 0,
      };
    },
    () => 'Bags so far',
    (params) =>
      `${params.partnership ? 'Your team holds' : 'You hold'} ${count(number(params.bags), 'bag', 'bags')} from earlier hands; this hand has added ${params.added} so far.`,
    (params) => [goalProgress(params)],
  ),
  ...situation(
    'opposing-contract.progress',
    (context) => {
      const goal = playing(context) ? headlineGoal(context) : undefined;
      if (!goal?.progress || !goal.id.startsWith('spades.hold-opposing-contract:')) return null;
      return {
        ...progressClaim(goal),
        partnership: context.partnership,
        need: (goal.progress.target ?? 0) + 1 - (goal.progress.current ?? 0),
      };
    },
    (params) => (params.partnership ? 'The opposing contract' : 'An opposing contract'),
    (params) => {
      const subject = `${params.partnership ? 'The' : 'An'} opposing contract`;
      if (params.status === 'failed') return `${subject} is already made.`;
      if (params.status === 'secured') return `${subject} can no longer be made this hand.`;
      return `${subject} needs ${count(number(params.need), 'more trick', 'more tricks')}; ${count(number(params.remaining), 'trick remains', 'tricks remain')} in this hand.`;
    },
    (params) => [goalProgress(params)],
  ),
  ...situation(
    'opposing-nil.status',
    (context) => {
      const goal = playing(context) ? headlineGoal(context) : undefined;
      if (!goal || !goal.id.startsWith('spades.break-opposing-nil:')) return null;
      const seat = Number(goal.id.slice(goal.id.indexOf(':') + 1));
      if (![0, 1, 2, 3].includes(seat) || seat === context.teammate) return null;
      const status = nilStatus(context.observation, seat as Seat);
      if (status === 'none') return null;
      return { ...progressClaim(goal), seat, name: SEAT_NAMES[seat as Seat], live: status === 'live' };
    },
    () => 'An opposing Nil',
    (params) => (params.live ? `${text(params.name)}’s Nil is still live.` : `${text(params.name)}’s Nil has broken.`),
    (params) =>
      params.live
        ? [claim('opposing-nil-live', { seat: params.seat }), goalProgress(params)]
        : [nilClaim(params.seat, 'failed', 'opponent'), goalProgress(params)],
  ),
  ...situation(
    'nil.own-failed',
    (context) => {
      const goal = playing(context) ? headlineGoal(context) : undefined;
      if (!goal || goal.id !== 'spades.own-nil' || nilStatus(context.observation, context.observation.seat) !== 'failed')
        return null;
      return { seat: context.observation.seat, tricks: context.observation.tricks[context.observation.seat] };
    },
    () => 'Your Nil has broken',
    (params) => `Your Nil has broken: you have taken ${count(number(params.tricks), 'trick', 'tricks')}.`,
    (params) => [nilClaim(params.seat, 'failed', 'self')],
  ),
  ...situation(
    'nil.partner-failed',
    (context) => {
      const goal = playing(context) ? headlineGoal(context) : undefined;
      if (
        !goal ||
        goal.id !== 'spades.teammate-nil' ||
        context.teammate === null ||
        nilStatus(context.observation, context.teammate) !== 'failed'
      )
        return null;
      return { seat: context.teammate };
    },
    () => 'Your partner’s Nil has broken',
    () => 'Your partner’s Nil has broken.',
    (params) => [nilClaim(params.seat, 'failed', 'teammate')],
  ),
  ...situation(
    'match.target',
    (context) => {
      const goal = playing(context) ? headlineGoal(context) : undefined;
      if (!goal?.progress || goal.id !== 'spades.reach-target') return null;
      return { ...progressClaim(goal), partnership: context.partnership };
    },
    () => 'The match target',
    (params) =>
      `${params.partnership ? 'Your team has' : 'You have'} ${params.current} points; the match target is ${params.target}.`,
    (params) => [goalProgress(params)],
  ),
  ...situation(
    'legal.count',
    (context) => (playing(context) ? { count: context.observation.legalActions.length } : null),
    () => 'Your turn',
    (params) => `You have ${count(number(params.count), 'legal card', 'legal cards')} this turn.`,
    (params) => [claim('legal-count', { count: params.count })],
  ),
];

const following = (context: CueContext) => (context.play && !context.play.lead && !context.forced ? context.play : null);
const leading = (context: CueContext) => (context.play && context.play.lead && !context.forced ? context.play : null);
const bidding = (context: CueContext) => (context.bid && !context.forced ? context.bid : null);

const ACTION_CLAIMS: CueTemplate[] = [
  {
    id: 'play.forced.consider', level: 'reason', slot: 'claim', budgetWords: BUDGET.claim,
    predicate: (context) => (context.forced && context.play ? { actionId: context.actionId } : null),
    render: () => 'Only one card is legal, so the rules leave no choice this turn.',
    claims: (params) => [claim('forced-action', { actionId: params.actionId }), claim('legal-count', { count: 1 })],
  },
  ...actionClaim(
    'play.covers-nil',
    (context) => {
      const play = following(context);
      return play?.coversTeammateNil ? { actionId: context.actionId, after: play.after } : null;
    },
    (params) =>
      number(params.after) === 0
        ? 'takes this trick off your Nil partner, because you play last'
        : 'takes this trick off your Nil partner for now',
    (params) => [
      claim('action-covers-teammate-nil', { actionId: params.actionId, covers: true }),
      claim('actors-after', { count: params.after }),
    ],
  ),
  ...actionClaim(
    'play.wins-last',
    (context) => {
      const play = following(context);
      return play?.winsNow && play.after === 0 ? { actionId: context.actionId } : null;
    },
    () => 'wins this trick outright, because you play last',
    (params) => [winsClaim(params, true), claim('actors-after', { count: 0 })],
  ),
  ...actionClaim(
    'play.lowest-winner',
    (context) => {
      const play = following(context);
      return play?.lowestWinner ? { actionId: context.actionId, after: play.after } : null;
    },
    (params) => `is your lowest card that takes the lead; ${stillToAct(params)}`,
    (params) => [
      winsClaim(params, true),
      claim('action-lowest-winner', { actionId: params.actionId }),
      claim('actors-after', { count: params.after }),
    ],
  ),
  ...actionClaim(
    'play.takes-lead',
    (context) => {
      const play = following(context);
      return play?.winsNow ? { actionId: context.actionId, after: play.after } : null;
    },
    (params) => `takes the lead for now; ${stillToAct(params)}`,
    (params) => [winsClaim(params, true), claim('actors-after', { count: params.after })],
  ),
  ...actionClaim(
    'play.discard',
    (context) => {
      const play = following(context);
      return play && !play.winsNow && play.discard && play.led
        ? { actionId: context.actionId, led: play.led }
        : null;
    },
    () => 'is off suit and not a spade, so it cannot win this trick',
    (params) => [winsClaim(params, false), claim('own-void-in-led-suit', { suit: params.led })],
  ),
  ...actionClaim(
    'play.stays-below',
    (context) => {
      const play = following(context);
      return play && !play.winsNow && play.winnerBefore !== null
        ? {
            actionId: context.actionId,
            seat: play.winnerBefore,
            winner: seatLabel(context, play.winnerBefore),
            relation: relationOf(context, play.winnerBefore),
          }
        : null;
    },
    (params) => `stays below ${text(params.winner)}’s card, so it cannot win this trick`,
    (params) => [winsClaim(params, false), claim('current-winner', { seat: params.seat, relation: params.relation })],
  ),
  ...actionClaim(
    'lead.partner-shown-out',
    (context) => {
      const play = leading(context);
      return play?.teammateMayRuff && context.supported && context.teammate !== null
        ? { actionId: context.actionId, seat: context.teammate, suit: play.suit }
        : null;
    },
    () => 'leads a suit your partner has shown out of, so a ruff is possible',
    (params) => [claim('public-void', { seat: params.seat, suit: params.suit })],
    true,
  ),
  ...actionClaim(
    'lead.master-spade',
    (context) => {
      const play = leading(context);
      return play?.master && play.suit === 'S' ? { actionId: context.actionId } : null;
    },
    () => 'leads the highest unplayed spade, which no card can beat',
    (params) => [
      claim('action-is-master', { actionId: params.actionId, master: true }),
      claim('trump-beats-side-suit', {}),
    ],
  ),
  ...actionClaim(
    'lead.master',
    (context) => {
      const play = leading(context);
      return play?.master ? { actionId: context.actionId } : null;
    },
    () => 'leads the highest unplayed card of its suit; only a spade can beat it',
    (params) => [
      claim('action-is-master', { actionId: params.actionId, master: true }),
      claim('trump-beats-side-suit', {}),
    ],
  ),
  ...actionClaim(
    'lead.only',
    (context) => {
      const play = leading(context);
      return play?.position === 'only' ? { actionId: context.actionId, position: play.position, held: play.held } : null;
    },
    () => 'leads your only card in its suit, leaving you void there',
    (params) => [
      claim('action-suit-position', { actionId: params.actionId, position: params.position, held: params.held }),
    ],
  ),
  ...actionClaim(
    'lead.lowest',
    (context) => {
      const play = leading(context);
      return play?.position === 'lowest'
        ? { actionId: context.actionId, position: play.position, held: play.held }
        : null;
    },
    () => 'leads your lowest card in its suit and keeps your higher ones',
    (params) => [
      claim('action-suit-position', { actionId: params.actionId, position: params.position, held: params.held }),
    ],
  ),
  ...actionClaim(
    'lead.highest',
    (context) => {
      const play = leading(context);
      return play?.position === 'highest' && !play.master
        ? { actionId: context.actionId, position: play.position, held: play.held }
        : null;
    },
    () => 'leads your highest card in its suit and keeps your lower ones',
    (params) => [
      claim('action-suit-position', { actionId: params.actionId, position: params.position, held: params.held }),
    ],
  ),
  ...actionClaim(
    'lead.middle',
    (context) => {
      const play = leading(context);
      return play?.position === 'middle'
        ? { actionId: context.actionId, position: play.position, held: play.held }
        : null;
    },
    () => 'leads from the middle of a suit, keeping cards above and below it',
    (params) => [
      claim('action-suit-position', { actionId: params.actionId, position: params.position, held: params.held }),
    ],
  ),
  ...actionClaim(
    'bid.nil-blocked',
    (context) => {
      const bid = bidding(context);
      return bid && bid.bid === 0 && bid.topRun > 0 ? { count: bid.topRun } : null;
    },
    () => 'is Nil, yet your ace of spades must win a trick',
    (params) => [
      claim('top-trump-held', { count: params.count }),
      claim('trump-beats-side-suit', {}),
      claim('nil-bid-rule', {}),
    ],
  ),
  ...actionClaim(
    'bid.nil',
    (context) => (bidding(context)?.bid === 0 ? {} : null),
    () => 'is Nil, which pays only if you take no tricks this hand',
    () => [claim('nil-bid-rule', {})],
  ),
  ...actionClaim(
    'bid.over-thirteen',
    (context) => {
      const bid = bidding(context);
      return bid && context.partnership && (bid.teammateBid ?? 0) > 0 && bid.bid + bid.teammateBid! > 13
        ? { bid: bid.bid, teammateBid: bid.teammateBid, total: bid.bid + bid.teammateBid!, within: false }
        : null;
    },
    () => 'lifts the team contract above the 13 tricks in a hand',
    (params) => [
      claim('bid-contract-total', {
        bid: params.bid, teammateBid: params.teammateBid, total: params.total, within: params.within,
      }),
      claim('hand-trick-total', { total: 13 }),
    ],
  ),
  ...actionClaim(
    'bid.matches-count',
    (context) => {
      const bid = bidding(context);
      return bid &&
        context.supported &&
        !context.searched &&
        bid.bid === bid.structureCount &&
        context.reasonIds.includes('S13.structure')
        ? { bid: bid.bid, count: bid.structureCount }
        : null;
    },
    () => 'matches a simple count of your high cards and spades',
    (params) => [claim('bid-matches-count', { bid: params.bid, count: params.count })],
    true,
  ),
  ...actionClaim(
    'bid.partner-nil',
    (context) => {
      const bid = bidding(context);
      return bid && context.teammate !== null && bid.teammateBid === 0
        ? { seat: context.teammate, bid: bid.bid }
        : null;
    },
    () => 'is a contract you make alone: a Nil partner adds no tricks to it',
    (params) => [
      claim('public-bid', { seat: params.seat, bid: 0, relation: 'teammate' }),
      claim('nil-tricks-no-credit', {}),
    ],
  ),
  ...actionClaim(
    'bid.team-total',
    (context) => {
      const bid = bidding(context);
      return bid && context.partnership && (bid.teammateBid ?? 0) > 0
        ? { bid: bid.bid, teammateBid: bid.teammateBid, total: bid.bid + bid.teammateBid!, within: true }
        : null;
    },
    () => 'adds to your partner’s bid to form one team contract',
    (params) => [
      claim('bid-contract-total', {
        bid: params.bid, teammateBid: params.teammateBid, total: params.total, within: params.within,
      }),
      claim('team-contract-rule', {}),
    ],
  ),
  ...actionClaim(
    'bid.before-partner',
    (context) => (bidding(context) && context.partnership ? {} : null),
    () => 'starts the team contract; your partner’s bid is added to it',
    () => [claim('team-contract-rule', {})],
  ),
  ...actionClaim(
    'bid.own-contract',
    (context) => (bidding(context) ? { competition: 'individual', teammate: context.teammate } : null),
    () => 'is a contract met only by tricks you win yourself',
    (params) => [claim('mode-objective', { competition: params.competition, teammate: params.teammate })],
  ),
];

const choiceWins = (context: CueContext): boolean[] =>
  context.choices.flatMap((choice) =>
    choice.kind === 'play' ? [viewPlay(context.observation, context.teammate, choice.card).winsNow] : [],
  );
const choiceClaims = (context: CueContext): CueParams => {
  const wins = choiceWins(context);
  return Object.fromEntries(context.choices.map((choice, index) => [actionId(choice), wins[index] ?? null]));
};
const winsClaims = (params: CueParams): ReasonClaim[] =>
  Object.entries(params).map(([id, wins]) => claim('action-wins-now', { actionId: id, wins }));
const playChoices = (context: CueContext) =>
  context.several && context.play !== null && context.choices.every((choice) => choice.kind === 'play');

const OTHER_TEMPLATES: CueTemplate[] = [
  {
    id: 'plan.stance', level: 'reason', slot: 'plan', budgetWords: BUDGET.plan, explains: true,
    // COACH-13: the stance is one plan among others and is shown only while the selected action serves it.
    predicate: (context) =>
      context.supported &&
      context.planSupported &&
      context.analysis.plan.decisionKind === 'play' &&
      context.analysis.decision.stanceId === context.analysis.plan.stance.id
        ? { stanceId: context.analysis.plan.stance.id, title: lowerFirst(context.analysis.plan.stance.title) }
        : null,
    render: (params) => `One plan: ${text(params.title)}.`,
    claims: (params) => [planStanceClaim(text(params.stanceId))],
  },
  {
    id: 'sampled.consider', level: 'reason', slot: 'evidence', budgetWords: BUDGET.considerEvidence, explains: true,
    predicate: (context) => (context.supported && context.searched ? {} : null),
    render: () => 'Sampled deals informed this; treat it as an estimate.',
    claims: none,
  },
  {
    id: 'lead-in.forced', level: 'suggestion', slot: 'lead-in', budgetWords: BUDGET.leadIn,
    predicate: (context) =>
      context.forced && context.play ? { actionId: context.actionId, card: cardLabel(context.play.card) } : null,
    render: (params) => `Play the ${text(params.card)}.`,
    claims: (params) => [claim('forced-action', { actionId: params.actionId })],
  },
  {
    id: 'lead-in.several-sampled', level: 'suggestion', slot: 'lead-in', budgetWords: BUDGET.severalLeadIn,
    predicate: (context) => (context.several && context.searched ? { plays: context.play !== null } : null),
    render: (params) =>
      `Several ${params.plays ? 'plays' : 'bids'} are reasonable: sampled deals that fit what you can see did not separate them.`,
    claims: none,
  },
  {
    id: 'lead-in.several', level: 'suggestion', slot: 'lead-in', budgetWords: BUDGET.leadIn,
    predicate: (context) => (context.several ? { plays: context.play !== null } : null),
    render: (params) => `Several ${params.plays ? 'plays' : 'bids'} are reasonable here.`,
    claims: none,
  },
  {
    id: 'lead-in.nil', level: 'suggestion', slot: 'lead-in', budgetWords: BUDGET.leadIn,
    predicate: (context) => (context.bid?.bid === 0 ? {} : null),
    render: () => 'Consider Nil.',
    claims: none,
  },
  {
    id: 'lead-in.bid', level: 'suggestion', slot: 'lead-in', budgetWords: BUDGET.leadIn,
    predicate: (context) => (context.bid ? { bid: context.bid.bid } : null),
    render: (params) => `Consider a bid of ${params.bid}.`,
    claims: none,
  },
  {
    id: 'lead-in.card', level: 'suggestion', slot: 'lead-in', budgetWords: BUDGET.leadIn,
    predicate: (context) => (context.play ? { card: cardLabel(context.play.card) } : null),
    render: (params) => `Consider the ${text(params.card)}.`,
    claims: none,
  },
  {
    id: 'sampled.suggest', level: 'suggestion', slot: 'evidence', budgetWords: BUDGET.suggestEvidence, explains: true,
    predicate: (context) => (context.searched && !context.several ? {} : null),
    render: () =>
      'On sampled deals that fit what you can see, no option tried clearly did better. Play was simulated simply, so treat this as an estimate.',
    claims: none,
  },
  {
    id: 'tradeoff.bid-nil', level: 'suggestion', slot: 'tradeoff', budgetWords: BUDGET.tradeoff,
    predicate: (context) =>
      context.several && context.bid && context.choices.some((choice) => choice.kind === 'bid' && choice.bid === 0)
        ? {}
        : null,
    render: () => 'Nil pays only with no tricks taken; a positive bid must be reached in tricks.',
    claims: () => [claim('nil-bid-rule', {})],
  },
  {
    id: 'tradeoff.bid', level: 'suggestion', slot: 'tradeoff', budgetWords: BUDGET.tradeoff,
    predicate: (context) => (context.several && context.bid ? {} : null),
    render: () => 'A higher bid scores more when made; a lower bid is easier to make but can add bags.',
    claims: none,
  },
  {
    id: 'tradeoff.lead-suits', level: 'suggestion', slot: 'tradeoff', budgetWords: BUDGET.tradeoff,
    predicate: (context) =>
      playChoices(context) &&
      context.play!.lead &&
      new Set(context.choices.map((choice) => (choice.kind === 'play' ? cardSuit(choice.card) : ''))).size > 1
        ? {}
        : null,
    render: () => 'They differ in the suit you open and the cards you keep for later.',
    claims: none,
  },
  {
    id: 'tradeoff.lead-height', level: 'suggestion', slot: 'tradeoff', budgetWords: BUDGET.tradeoff,
    predicate: (context) => (playChoices(context) && context.play!.lead ? {} : null),
    render: () => 'They open the same suit; they differ in how high you lead.',
    claims: none,
  },
  {
    id: 'tradeoff.take-or-duck', level: 'suggestion', slot: 'tradeoff', budgetWords: BUDGET.tradeoff,
    predicate: (context) => {
      if (!playChoices(context)) return null;
      const wins = choiceWins(context);
      return wins.includes(true) && wins.includes(false) ? choiceClaims(context) : null;
    },
    render: () => 'The tradeoff is taking the lead now or staying below the current winner.',
    claims: winsClaims,
  },
  {
    id: 'tradeoff.all-take', level: 'suggestion', slot: 'tradeoff', budgetWords: BUDGET.tradeoff,
    predicate: (context) => (playChoices(context) && choiceWins(context).every(Boolean) ? choiceClaims(context) : null),
    render: () => 'Each takes the lead for now; they differ in the card you keep for later.',
    claims: winsClaims,
  },
  {
    id: 'tradeoff.none-take', level: 'suggestion', slot: 'tradeoff', budgetWords: BUDGET.tradeoff,
    predicate: (context) => (playChoices(context) ? choiceClaims(context) : null),
    render: () => 'None can win this trick; they differ in the card you keep for later.',
    claims: winsClaims,
  },
  {
    id: 'closing.other-choices', level: 'suggestion', slot: 'closing', budgetWords: BUDGET.closing,
    predicate: (context) =>
      context.forced || context.several || context.searched ? null : { plays: context.play !== null },
    render: (params) => `Other ${params.plays ? 'plays' : 'bids'} can be reasonable too.`,
    claims: none,
  },
];

/** Order matters: within a level and slot the first template whose predicate holds is shown. */
export const SPADES_CUE_TEMPLATES: readonly CueTemplate[] = [...SITUATIONS, ...ACTION_CLAIMS, ...OTHER_TEMPLATES];

const SLOT_ORDER: Record<CueLevel, CueSlot[]> = {
  focus: ['heading'],
  notice: ['fact'],
  reason: ['claim', 'plan', 'evidence'],
  suggestion: ['lead-in', 'claim', 'evidence', 'tradeoff', 'closing'],
};

function attempt(template: CueTemplate, context: CueContext): RenderedCue | null {
  const params = template.predicate(context);
  if (!params) return null;
  const rendered = template.render(params);
  // Fail closed: a sentence that would break its budget is never shown.
  if (!rendered || countWords(rendered) > template.budgetWords) return null;
  return {
    templateId: template.id,
    level: template.level,
    slot: template.slot,
    text: rendered,
    params,
    claims: template.claims(params),
  };
}

function firstHolding(
  context: CueContext,
  level: CueLevel,
  slot: CueSlot,
  accept: (template: CueTemplate) => boolean = () => true,
): RenderedCue | null {
  for (const template of SPADES_CUE_TEMPLATES) {
    if (template.level !== level || template.slot !== slot || !accept(template)) continue;
    const rendered = attempt(template, context);
    if (rendered) return rendered;
  }
  return null;
}

const family = (templateId: string) => templateId.slice(0, templateId.lastIndexOf('.'));

export type SpadesCueResult = { advice: Advice; cues: RenderedCue[]; context: CueContext };

/** Renders the advice together with the templates behind every sentence, for audit and tests. */
export function renderSpadesCues(observation: SeatObservation, analysis: DecisionAnalysis): SpadesCueResult {
  if (analysis.schemaVersion !== '1.1.0')
    throw new Error('Cue version 2 renders plan-layer analyses only.');
  if (analysis.action.kind === 'pass') throw new Error('Spades has no pass.');
  const context = buildCueContext(observation, analysis);

  const fact = firstHolding(context, 'notice', 'fact');
  if (!fact) throw new Error('No exact fact is available for this decision.');
  const heading = firstHolding(context, 'focus', 'heading', (template) => family(template.id) === family(fact.templateId));
  if (!heading) throw new Error('No heading is available for this decision.');
  const consider = firstHolding(context, 'reason', 'claim');
  if (!consider) throw new Error('No exact statement is available for the selected action.');

  const level = (name: CueLevel, fixed: RenderedCue[]): RenderedCue[] => {
    const parts = [...fixed];
    for (const slot of SLOT_ORDER[name]) {
      if (parts.some((part) => part.slot === slot)) continue;
      const part = firstHolding(
        context,
        name,
        slot,
        // The suggestion restates the very statement shown at Consider, never another one.
        (template) => slot !== 'claim' || family(template.id) === family(consider.templateId),
      );
      if (part) parts.push(part);
    }
    parts.sort((a, b) => SLOT_ORDER[name].indexOf(a.slot) - SLOT_ORDER[name].indexOf(b.slot));
    // Fail closed on the level budget as well: drop the last optional sentence until the text fits.
    while (parts.length > 1 && countWords(parts.map((part) => part.text).join(' ')) > COPY_BUDGET[name]) parts.pop();
    return parts;
  };
  const reason = level('reason', [consider]);
  const suggestion = level('suggestion', []);
  if (!suggestion.length) throw new Error('No suggestion wording is available for this decision.');
  const cues = [heading, fact, ...reason, ...suggestion];
  const join = (parts: RenderedCue[]) => parts.map((part) => part.text).join(' ');

  const explaining = new Set(
    SPADES_CUE_TEMPLATES.filter((template) => template.explains).map((template) => template.id),
  );
  const explanation: NonNullable<Advice['explanation']> =
    context.supported && reason.some((part) => explaining.has(part.templateId)) ? 'supported' : 'facts-only';
  const outcome: NonNullable<Advice['outcome']> = context.several ? 'several-reasonable' : 'suggestion';
  const evidence: DecisionEvidence = context.forced ? 'exact' : context.searched ? 'sampled-estimate' : 'heuristic';

  const claims: ReasonClaim[] = [];
  const seen = new Set<string>();
  for (const part of cues)
    for (const entry of part.claims) {
      const key = JSON.stringify([entry.predicate, Object.entries(entry.args).sort(([a], [b]) => a.localeCompare(b))]);
      if (seen.has(key)) continue;
      seen.add(key);
      claims.push(entry);
    }

  // COACH-14: considered choices are named only when at most three distinct choices remain.
  const named = context.several && context.choices.length <= 3 ? context.choices : [];
  const consideredCards = sorted(named.flatMap((choice) => (choice.kind === 'play' ? [choice.card] : [])));
  const consideredBids = named.flatMap((choice) => (choice.kind === 'bid' ? [choice.bid] : [])).sort((a, b) => a - b);
  const action = analysis.action;
  const candidate = analysis.candidates.find((entry) => actionId(entry.action) === context.actionId);

  const advice: Advice = {
    provenance: context.forced ? 'forced' : 'code',
    policyVersion: analysis.policyVersion,
    reasonIds: [...(candidate?.reasonIds ?? [])],
    evidence,
    ...(outcome === 'suggestion' && action.kind === 'play' ? { card: action.card } : {}),
    ...(outcome === 'suggestion' && action.kind === 'bid' ? { bid: action.bid } : {}),
    ...(context.play?.led ? { highlightSuit: context.play.led } : {}),
    focus: heading.text,
    notice: fact.text,
    reason: join(reason),
    suggestion: join(suggestion),
    cueVersion: SPADES_PLAN_CUE_VERSION,
    outcome,
    explanation,
    ...(consideredCards.length >= 2 ? { consideredCards } : {}),
    ...(consideredBids.length >= 2 ? { consideredBids } : {}),
    claims,
  };
  return { advice, cues, context };
}

export const spadesPlanCues: CuePack = {
  id: 'spades-cues-plan',
  cueVersion: SPADES_PLAN_CUE_VERSION,
  renders: (policyVersion) => policyVersion.startsWith('spades-plan-3.'),
  render: (observation, analysis) => renderSpadesCues(observation, analysis).advice,
};

export { SUIT_NAMES as SPADES_SUIT_NAMES };
