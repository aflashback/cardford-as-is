import { cardSuit } from '../../../game/cards.ts';
import { competitionFor, opponentsOf, teammatesOf } from '../../../game/kernel/competition.ts';
import type { Seat, Suit } from '../../../game/kernel/types.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import type { PlanGoal } from '../../../strategy/plan/types.ts';
import type { CardOutcome, DecisionFacts, DecisionReason, ReasonClaim } from '../../../strategy/types.ts';

/**
 * COACH-15: closed vocabulary of machine-checkable Spades claims.
 *
 * Classes:
 * - `state-exact`: recomputed from public state and the actor's own hand.
 * - `rule-profile`: a statement of the frozen rules.
 * - `all-consistent-worlds`: must hold in every hidden deal that fits the seat observation.
 *
 * Checkers live in evaluation code and never import the fact builder.
 *
 * Arguments are listed beside each predicate. `relation` is always optional and names how
 * the sentence describes the seat: `self`, `teammate` or `opponent`. `actionId` is a legal
 * action of the acting seat, written as `play:<card>`.
 */
export const SPADES_CLAIM_PREDICATES = {
  /** { suit } own single side-suit monopoly cannot regain the lead. */
  'case-no-entry': 'all-consistent-worlds',
  /** { winner, suit } every legal defender play leaves the same proved remaining sweep. */
  'case-public-sweep': 'all-consistent-worlds',
  /** { partner, suit, entry } exact resources supporting the conditional partner preference. */
  'case-partner-resource': 'all-consistent-worlds',
  /** { count } legal actions of the acting seat. */
  'legal-count': 'state-exact',
  /** { actionId? } exactly one legal action exists. */
  'forced-action': 'state-exact',
  /** { suit } the led suit is `suit` and the actor holds none of it. */
  'own-void-in-led-suit': 'state-exact',
  /** { count } seats still to play to the current trick after the actor. */
  'actors-after': 'state-exact',
  /** { seat, relation? } winner of the trick in progress before the actor plays. */
  'current-winner': 'state-exact',
  /** { seat, status: 'none' | 'live' | 'failed', relation? }; `none` means a positive bid. */
  'nil-status': 'state-exact',
  /** { needed, contract?, credited?, scope?: 'individual' | 'team' } for the actor's competitor. */
  'contract-need': 'state-exact',
  /** { contract?, credited? } a positive contract exists and is already met. */
  'contract-met': 'state-exact',
  /** { delta } score change of this hand caused by one more ordinary bag. */
  'next-bag-delta': 'state-exact',
  /** { seat } an opposing seat bid Nil and has taken no trick. */
  'opposing-nil-live': 'state-exact',
  /** { actionId, wins } whether the action makes the actor the current winner. */
  'action-wins-now': 'state-exact',
  /** { actionId, covers } whether the action takes the current trick off a live Nil teammate. */
  'action-covers-teammate-nil': 'state-exact',
  /** { seat, suit } public play proves the seat holds no card of the suit. */
  'public-void': 'state-exact',
  /** { stanceId } the stance that follows from exact public counts. */
  'plan-stance': 'state-exact',
  /** { goalId, status?, target?, current?, remaining?, comparator?, unit? } exact goal counters. */
  'goal-progress': 'state-exact',
  /** {} nobody is obliged to trump or overtrump. */
  'trump-optional': 'rule-profile',
  /** {} positive bids of one partnership form one contract with pooled tricks. */
  'team-contract-rule': 'rule-profile',
  /** { competition: 'individual' | 'partnership', teammate } how this table groups seats for scoring. */
  'mode-objective': 'rule-profile',
  /** { actionId, winner, relation? } after the action, `winner` takes the trick whatever follows. */
  'guaranteed-winner': 'all-consistent-worlds',
  /** { teammate } whatever the actor plays, the teammate takes the trick whatever follows. */
  'no-legal-cover': 'all-consistent-worlds',
  /** { seat, suit } no deal that fits the seat observation gives the seat a card of the suit. */
  'cannot-hold-suit': 'all-consistent-worlds',
  /** { actionId, winner, relation? } current winner of the trick right after the action. */
  'winner-after-action': 'state-exact',
  /** { seat, relation? } the seat still has to play to the current trick after the actor. */
  'acts-later': 'state-exact',
  /** { actionId, master } whether no unplayed card of the suit ranks higher, own hand included. */
  'action-is-master': 'state-exact',
  /** { actionId, suit } after the action the actor still holds a card of the suit. */
  'retains-suit': 'state-exact',
  /** { seat, trick, event: 'off-suit' | 'failed-to-follow' | 'led-and-won', suit, relation? } public history. */
  'trick-event': 'state-exact',
  /** { seat, relation? } the seat has played at least one card in this hand. */
  'has-played': 'state-exact',
  /** { count } bids already placed in this hand. */
  'bids-placed': 'state-exact',
  /** { count } unbroken run of trumps the actor holds from the ace down. */
  'top-trump-held': 'state-exact',
  /** { total } sum of the bids placed by opposing seats. */
  'opposing-bid-total': 'state-exact',
  /** { count } unplayed cards held by the other three seats. */
  'concealed-cards-remain': 'state-exact',
  /** {} tricks of a Nil bidder never count toward a positive contract. */
  'nil-tricks-no-credit': 'rule-profile',
  /** { made, failed } Nil award and penalty, decided for each Nil bidder alone. */
  'nil-award': 'rule-profile',
  /** {} a Nil bid pays only when its bidder takes no trick in the hand. */
  'nil-bid-rule': 'rule-profile',
  /** {} tricks of a failed Nil add bags and no overtrick points. */
  'failed-nil-bags': 'rule-profile',
  /** {} the match result is decided only when a complete hand has been scored. */
  'match-after-hand': 'rule-profile',
  /** { total } tricks in one hand. */
  'hand-trick-total': 'rule-profile',
  /** {} any trump beats any side-suit card, and the higher trump beats the lower. */
  'trump-beats-side-suit': 'rule-profile',
  // Appended by cue version 2 (web/server/games/spades/coaching/cues-v2.ts).
  /** { actionId, position: 'only' | 'lowest' | 'highest' | 'middle', held } rank of the card among the actor's cards of its suit. */
  'action-suit-position': 'state-exact',
  /** { actionId } at least two legal cards currently win and this one has the lowest rank of them. */
  'action-lowest-winner': 'state-exact',
  /** { seat, bid, relation? } the seat has placed this bid in the current hand. */
  'public-bid': 'state-exact',
  /** { suit, count } cards of the suit in the actor's hand. */
  'own-suit-count': 'state-exact',
  /** { bid, teammateBid, total, within } the bid plus the teammate's positive bid; `within` means total <= 13. */
  'bid-contract-total': 'state-exact',
  /** { bid, count } the bid equals the retained hand-structure count of the actor's own hand. */
  'bid-matches-count': 'state-exact',
} as const;
export type SpadesClaimPredicate = keyof typeof SPADES_CLAIM_PREDICATES;
export type SpadesClaimClass = (typeof SPADES_CLAIM_PREDICATES)[SpadesClaimPredicate];
export type SpadesClaimRelation = 'self' | 'teammate' | 'opponent';

export const claim = (predicate: SpadesClaimPredicate, args: ReasonClaim['args']): ReasonClaim => ({
  predicate,
  args,
});

/** Stable identity of a claim: predicate plus arguments in key order. */
export const claimKey = (entry: ReasonClaim): string =>
  `${entry.predicate}|${Object.keys(entry.args)
    .sort()
    .map((key) => `${key}=${String(entry.args[key])}`)
    .join('|')}`;

/** COACH-13: the claim behind a sentence that shows exact goal progress. */
export const goalProgressClaim = (goal: PlanGoal): ReasonClaim =>
  claim('goal-progress', {
    goalId: goal.id,
    status: goal.status,
    unit: goal.progress?.unit ?? null,
    comparator: goal.progress?.comparator ?? null,
    target: goal.progress?.target ?? null,
    current: goal.progress?.current ?? null,
    remaining: goal.progress?.remainingOpportunities ?? null,
  });

/** COACH-13: the claim behind a sentence that names the stance. */
export const planStanceClaim = (stanceId: string): ReasonClaim => claim('plan-stance', { stanceId });

type Context = {
  observation: SeatObservation;
  facts: DecisionFacts;
  seat: Seat;
  teammate: Seat | null;
  opponents: Seat[];
  outcomes: readonly CardOutcome[];
  relation(seat: Seat): SpadesClaimRelation;
};
type Builder = (context: Context, reason: DecisionReason) => ReasonClaim[];

const SIDE_SUITS: readonly Suit[] = ['C', 'D', 'H'];
const TRUMP_RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
/** Trumps held in an unbroken run from the ace down. */
export function topTrumpRun(hand: readonly string[]): number {
  let run = 0;
  while (run < TRUMP_RANKS.length && hand.includes(`S${TRUMP_RANKS[run]}`)) run++;
  return run;
}
const says = (reason: DecisionReason, pattern: RegExp) => pattern.test(reason.text);
const cardOf = (id: string) => id.slice('play:'.length);
const live = (context: Context, seat: Seat) =>
  context.observation.bids[seat] === 0 && context.observation.tricks[seat] === 0;

const nilStatus = (context: Context, seat: Seat, status: 'none' | 'live' | 'failed') =>
  claim('nil-status', { seat, status, relation: context.relation(seat) });
const teammateNil = (context: Context, status: 'none' | 'live' | 'failed') =>
  context.teammate === null ? [] : [nilStatus(context, context.teammate, status)];
const teammateWinning = (context: Context) =>
  context.teammate === null
    ? []
    : [claim('current-winner', { seat: context.teammate, relation: 'teammate' })];
const winsNow = (id: string, wins: boolean) => claim('action-wins-now', { actionId: id, wins });
const covers = (id: string, value: boolean) => claim('action-covers-teammate-nil', { actionId: id, covers: value });
const winnerAfter = (context: Context, id: string, winner: Seat, relation = context.relation(winner)) =>
  claim('winner-after-action', { actionId: id, winner, relation });
const guaranteed = (context: Context, id: string, winner: Seat, relation = context.relation(winner)) =>
  claim('guaranteed-winner', { actionId: id, winner, relation });
const publicVoid = (seat: Seat, suit: Suit) => claim('public-void', { seat, suit });
const legalCount = (count: number) => claim('legal-count', { count });
const opposingNils = (context: Context) =>
  context.opponents.filter((seat) => live(context, seat)).map((seat) => claim('opposing-nil-live', { seat }));
const perAction = (reason: DecisionReason, build: (id: string) => ReasonClaim[]) =>
  (reason.actionIds ?? []).flatMap(build);
const outcomeOf = (context: Context, id: string) => context.outcomes.find((entry) => entry.actionId === id);

/** Sentences inside the joined contextual-bid reason, each with the claims it makes. */
const BID_SENTENCES: readonly { pattern: RegExp; build: (context: Context) => ReasonClaim[] }[] = [
  {
    pattern: /A held top spade guarantees at least one own trick/,
    build: (context) => [
      claim('top-trump-held', { count: topTrumpRun(context.observation.hand) }),
      claim('trump-beats-side-suit', {}),
    ],
  },
  {
    pattern: /cannot total more than 13 tricks/,
    build: () => [claim('hand-trick-total', { total: 13 })],
  },
  {
    pattern: /High public opponent bids conflict/,
    build: (context) => [
      claim('opposing-bid-total', {
        total: context.opponents.reduce<number>((sum, seat) => sum + (context.observation.bids[seat] ?? 0), 0),
      }),
    ],
  },
  {
    pattern: /Partner Nil gives no positive contract credit/,
    build: (context) => [...teammateNil(context, 'live'), claim('nil-tricks-no-credit', {})],
  },
  {
    pattern: /next ordinary bag would cross the ten-bag penalty/,
    build: () => [claim('next-bag-delta', { delta: -99 })],
  },
  {
    pattern: /match victory is assessed after all players finish the hand/,
    build: () => [claim('match-after-hand', {})],
  },
];

/**
 * One builder per reason ID of the tactical policy and the plan profiles. A builder reads
 * the variant from the shown sentence and the argument values from the observation and
 * facts. IDs that state only a preference have no builder and keep an empty claim list.
 */
const BUILDERS: Record<string, Builder> = {
  'S01.legal-set': (context) => [legalCount(context.observation.legalActions.length)],
  'S01.forced': (context) => [
    claim('forced-action', {
      actionId: context.outcomes[0]?.actionId ?? null,
    }),
    legalCount(1),
  ],
  'S02.void': (context) => [
    claim('own-void-in-led-suit', { suit: context.facts.ledSuit }),
    legalCount(context.observation.hand.length),
  ],
  'S03.ownership': (context) => [
    claim('concealed-cards-remain', {
      count: context.facts.outstandingCards.length - context.observation.hand.length,
    }),
    claim('trump-optional', {}),
  ],
  'S04.turn-order': (context, reason) => [
    claim('actors-after', { count: says(reason, /^You play fourth/) ? 0 : context.facts.actorsAfter.length }),
  ],
  'S05.live-nil': (context) => [
    nilStatus(context, context.seat, 'live'),
    ...context.outcomes
      .filter((entry) => entry.currentWinner !== context.seat)
      .map((entry) => winsNow(entry.actionId, false)),
  ],
  'S05.shed-risk': (context, reason) => [
    nilStatus(context, context.seat, 'live'),
    ...perAction(reason, (id) => [winsNow(id, false)]),
  ],
  'S06.no-underplay': (context, reason) => [
    nilStatus(context, context.seat, 'live'),
    legalCount(context.outcomes.length),
    ...context.outcomes.map((entry) =>
      says(reason, /guarantees you this trick/)
        ? guaranteed(context, entry.actionId, context.seat, 'self')
        : winsNow(entry.actionId, true),
    ),
  ],
  'S06.guaranteed-failure': (context, reason) => [
    nilStatus(context, context.seat, 'live'),
    ...perAction(reason, (id) => [guaranteed(context, id, context.seat, 'self')]),
  ],
  'S07.failed-nil': (context) => [
    nilStatus(context, context.seat, 'failed'),
    claim('failed-nil-bags', {}),
    claim('nil-tricks-no-credit', {}),
  ],
  'S08.contract': (context, reason) => [
    claim('contract-need', {
      needed: context.facts.contractNeeded,
      contract: context.facts.contractBid,
      credited: context.facts.creditedTricks,
      scope: says(reason, /team contract/) ? 'team' : 'individual',
    }),
    claim('nil-tricks-no-credit', {}),
  ],
  'S08.economical-winner': (_context, reason) => perAction(reason, (id) => [winsNow(id, true)]),
  'S08.preserve-control': (_context, reason) => perAction(reason, (id) => [winsNow(id, false)]),
  'S09.contract-met': (context, reason) =>
    says(reason, /There is no positive contract/)
      ? [
          claim('contract-need', { needed: 0, contract: 0, credited: 0 }),
          claim('nil-award', { made: 100, failed: -100 }),
          claim('failed-nil-bags', {}),
        ]
      : [
          claim('contract-met', {
            contract: context.facts.contractBid,
            credited: context.facts.creditedTricks,
          }),
          claim('next-bag-delta', { delta: says(reason, /-99 at the ten-bag boundary/) ? -99 : 1 }),
        ],
  'S10.lead-choice': () => [claim('trump-beats-side-suit', {})],
  'S10.cash-control': (_context, reason) =>
    perAction(reason, (id) => [claim('action-is-master', { actionId: id, master: true })]),
  'S11.trump-choice': () => [claim('trump-optional', {})],
  'S12.opponent-nil': (context) => [...opposingNils(context), claim('nil-award', { made: 100, failed: -100 })],
  'S12.leave-nil-winning': (context, reason) => {
    const winner = context.facts.currentWinner;
    if (winner === null) return [];
    const completed = says(reason, /completed trick/);
    return [
      claim('opposing-nil-live', { seat: winner }),
      ...(completed ? [] : [claim('actors-after', { count: context.facts.actorsAfter.length })]),
      ...perAction(reason, (id) => [
        completed ? guaranteed(context, id, winner, 'opponent') : winnerAfter(context, id, winner, 'opponent'),
      ]),
    ];
  },
  'S12.nil-pressure-lead': (context) => opposingNils(context),
  'S13.contextual-bid': (context, reason) =>
    BID_SENTENCES.filter((sentence) => says(reason, sentence.pattern)).flatMap((sentence) =>
      sentence.build(context),
    ),
  'S13.public-bids': (context) => [
    claim('bids-placed', { count: context.observation.bids.filter((bid) => bid !== null).length }),
  ],
  'S14.late-score': () => [claim('match-after-hand', {})],
  'P01.partner-current': (context) => [...teammateWinning(context), ...teammateNil(context, 'none')],
  'P01.conserve-under-partner': (context, reason) => {
    const mate = context.teammate;
    if (mate === null) return [];
    const secure = says(reason, /no remaining opponent response can overtake/);
    return [
      ...(secure
        ? []
        : context.facts.actorsAfter
            .filter((seat) => context.opponents.includes(seat))
            .map((seat) => claim('acts-later', { seat, relation: 'opponent' }))),
      ...perAction(reason, (id) => [
        winnerAfter(context, id, mate, 'teammate'),
        ...(secure ? [guaranteed(context, id, mate, 'teammate')] : []),
      ]),
    ];
  },
  'P02.live-nil-cover': (context) => [
    ...teammateNil(context, 'live'),
    ...teammateWinning(context),
    ...context.outcomes.filter((entry) => entry.coversPartnerNil).map((entry) => covers(entry.actionId, true)),
  ],
  'P02.cover-action': (context, reason) => [
    ...teammateNil(context, 'live'),
    ...perAction(reason, (id) => [covers(id, true)]),
  ],
  'P02.cover-before-partner': (context, reason) => [
    ...teammateNil(context, 'live'),
    ...(context.teammate === null ? [] : [claim('acts-later', { seat: context.teammate, relation: 'teammate' })]),
    ...perAction(reason, (id) => [winsNow(id, true)]),
  ],
  'P02.covering-lead': (context) => teammateNil(context, 'live'),
  'P03.no-cover': (context, reason) => [
    ...teammateNil(context, 'live'),
    ...teammateWinning(context),
    legalCount(context.outcomes.length),
    ...context.outcomes.map((entry) => covers(entry.actionId, false)),
    ...(says(reason, /guaranteed this trick/) && context.teammate !== null
      ? [claim('no-legal-cover', { teammate: context.teammate })]
      : []),
  ],
  'P04.bidding-nil': (context) => [...teammateNil(context, 'live'), claim('nil-tricks-no-credit', {})],
  'P04.double-nil': (context) => [nilStatus(context, context.seat, 'live'), ...teammateNil(context, 'live')],
  'P04.keep-both-live': (context, reason) => [
    nilStatus(context, context.seat, 'live'),
    ...teammateNil(context, 'live'),
    ...perAction(reason, (id) => {
      const outcome = outcomeOf(context, id);
      if (!outcome) return [];
      return [guaranteed(context, id, outcome.guaranteedWinner ?? outcome.currentWinner, 'opponent')];
    }),
  ],
  'P04.cover-tradeoff': (context, reason) => [
    nilStatus(context, context.seat, 'live'),
    ...perAction(reason, (id) => [covers(id, true), winsNow(id, true)]),
  ],
  'P05.failed-partner': (context) => [
    ...teammateNil(context, 'failed'),
    claim('failed-nil-bags', {}),
    claim('nil-tricks-no-credit', {}),
  ],
  'P06.partner-void': (context, reason) => {
    const mate = context.teammate;
    if (mate === null) return [];
    const relevant = context.facts.ledSuit
      ? [context.facts.ledSuit]
      : [...new Set(context.observation.hand.map(cardSuit))];
    return [
      ...relevant
        .filter((suit) => suit !== 'S' && context.facts.voids[suit].includes(mate))
        .map((suit) => publicVoid(mate, suit)),
      ...(says(reason, /no remaining spade is possible/)
        ? [claim('cannot-hold-suit', { seat: mate, suit: 'S' })]
        : []),
    ];
  },
  'P06.offer-ruff': (context, reason) => {
    const mate = context.teammate;
    if (mate === null) return [];
    return perAction(reason, (id) => [publicVoid(mate, cardSuit(cardOf(id)))]);
  },
  'P07.no-partner-trump': (context) =>
    context.teammate === null
      ? []
      : [publicVoid(context.teammate, 'S'), claim('cannot-hold-suit', { seat: context.teammate, suit: 'S' })],
  'P08.public-hints': (context, reason) => {
    const mate = context.teammate;
    if (mate === null) return [];
    const event = (kind: string, found: RegExpExecArray) =>
      claim('trick-event', {
        seat: mate,
        trick: Number(found[2]),
        event: kind,
        suit: found[1],
        relation: 'teammate',
      });
    const failed = /Partner failed to follow ([CDHS]) in trick (\d+)\./.exec(reason.text);
    if (failed) return [event('failed-to-follow', failed), publicVoid(mate, failed[1] as Suit)];
    const discarded = /Partner discarded ([CDHS]) in trick (\d+)\./.exec(reason.text);
    if (discarded) return [event('off-suit', discarded)];
    const led = /Partner led and won ([CDHS]) in trick (\d+)\./.exec(reason.text);
    if (led) return [event('led-and-won', led)];
    return says(reason, /Partner has played publicly/)
      ? [claim('has-played', { seat: mate, relation: 'teammate' })]
      : [];
  },
  'P09.partner-security': (context, reason) => {
    const mate = context.teammate;
    if (mate === null) return [];
    if (says(reason, /leaves your partner the guaranteed winner/))
      return context.outcomes
        .filter((entry) => entry.guaranteedWinner === mate)
        .map((entry) => guaranteed(context, entry.actionId, mate, 'teammate'));
    if (says(reason, /Every legal card overtakes your partner/))
      return [legalCount(context.outcomes.length), ...context.outcomes.map((entry) => winsNow(entry.actionId, true))];
    return [claim('actors-after', { count: context.facts.actorsAfter.length })];
  },
  'P10.team-contract': () => [claim('team-contract-rule', {}), claim('nil-tricks-no-credit', {})],
  'P11.route-to-ruff': (context, reason) => {
    const mate = context.teammate;
    const offered = /You retain ([CDHS]) to offer/.exec(reason.text);
    if (mate === null || !offered) return [];
    const suit = offered[1] as Suit;
    return [
      publicVoid(mate, suit),
      ...(says(reason, /known overruff risk/)
        ? context.opponents.filter((seat) => context.facts.voids[suit].includes(seat)).map((seat) => publicVoid(seat, suit))
        : []),
      ...perAction(reason, (id) => [
        winnerAfter(context, id, context.seat, 'self'),
        ...(says(reason, /secures the next lead/) ? [guaranteed(context, id, context.seat, 'self')] : []),
        claim('retains-suit', { actionId: id, suit }),
      ]),
    ];
  },
  'P11.preserve-ruff': (context) => {
    const mate = context.teammate;
    if (mate === null) return [];
    return SIDE_SUITS.filter((suit) => context.facts.voids[suit].includes(mate)).map((suit) => publicVoid(mate, suit));
  },
  'P12.mode-objective': (context) => [
    claim('mode-objective', {
      competition: competitionFor(context.observation.mode).mode,
      teammate: context.teammate,
    }),
  ],
};

/** Reason IDs that state only a preference, a general rule of thumb or the analysis method. */
export const SPADES_UNCLAIMED_REASONS: readonly string[] = [
  'S06.rescue',
  'S09.limit-bags',
  'S09.low-lead',
  'S10.develop-suit',
  'S13.structure',
  'P09.protect-partner',
  'P11.entries',
  'PLAN.sampled',
  'PLAN.fallback',
];

/** Reason IDs whose claims are attached where the reason is written. */
export const SPADES_PRECLAIMED_REASONS: readonly string[] = ['PLAN.stance'];

/** Every reason ID this module knows how to read. */
export const SPADES_CLAIMED_REASONS: readonly string[] = Object.keys(BUILDERS);

function unique(claims: readonly ReasonClaim[]): ReasonClaim[] {
  const seen = new Set<string>();
  return claims.filter((entry) => {
    const key = claimKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Attaches typed claims to the reasons of a schema 1.1.0 analysis. Every factual
 * sentence carries at least one claim, whatever the reason's kind. Reasons that make
 * no checkable statement keep an empty claim list.
 *
 * Seat-safe: the only inputs are the seat observation, the facts built from it and the
 * reasons written from both. Claims already present on a reason are kept.
 */
export function attachSpadesClaims(
  observation: SeatObservation,
  facts: DecisionFacts,
  reasons: readonly DecisionReason[],
): DecisionReason[] {
  const competition = competitionFor(observation.mode);
  const seat = observation.seat;
  const teammate = teammatesOf(competition, seat)[0] ?? null;
  const context: Context = {
    observation,
    facts,
    seat,
    teammate,
    opponents: opponentsOf(competition, seat),
    outcomes: facts.cardOutcomes,
    relation: (other) => (other === seat ? 'self' : other === teammate ? 'teammate' : 'opponent'),
  };
  return reasons.map((reason) => {
    const build = Object.hasOwn(BUILDERS, reason.id) ? BUILDERS[reason.id] : null;
    return { ...reason, claims: unique([...(reason.claims ?? []), ...(build ? build(context, reason) : [])]) };
  });
}

/**
 * Claims behind the reasons shown for one action: every claim about the position, and
 * only those claims about an action that name the shown action.
 */
export function claimsShownFor(
  reasons: readonly DecisionReason[],
  reasonIds: readonly string[],
  shownActionId: string,
): ReasonClaim[] {
  const shown = new Set(reasonIds);
  return unique(
    reasons
      .filter((reason) => shown.has(reason.id))
      .flatMap((reason) => reason.claims ?? [])
      .filter((entry) => entry.args.actionId === undefined || entry.args.actionId === null || entry.args.actionId === shownActionId),
  );
}
