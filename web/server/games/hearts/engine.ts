import { cardLabel, cardRank, cardSuit, sorted, validateDeal } from '../../game/cards.ts';
import { scoreHearts } from '../../game/hearts/score.ts';
import { assertSeat, SEATS } from '../../game/kernel/seats.ts';
import type { Card, Four, Play, Seat } from '../../game/kernel/types.ts';
import {
  HEARTS_RULE_PROFILE,
  type HeartsAcceptedAction,
  type HeartsAction,
  type HeartsConfig,
  type HeartsEvent,
  type HeartsLegalContext,
  type HeartsState,
} from './state.ts';

export const heartsSeatAfter = (seat: Seat, offset = 1): Seat => SEATS[(seat + offset) % 4];
export const heartsFour = <T>(make: () => T): Four<T> => [make(), make(), make(), make()];
export const heartsActionId = (action: HeartsAction): string =>
  action.kind === 'play' ? `play:${action.card}` : `pass:${sorted(action.cards).join(',')}`;
const seatName = (seat: Seat) => ['You', 'West', 'North', 'East'][seat];
export function heartsTrickWinner(plays: Play[]): Seat {
  if (!plays.length) throw new Error('An empty trick has no winner.');
  const suit = cardSuit(plays[0].card);
  return plays
    .filter((play) => cardSuit(play.card) === suit)
    .reduce((best, play) => (cardRank(play.card) > cardRank(best.card) ? play : best)).seat;
}
export function heartsActionsFor(context: HeartsLegalContext, seat: Seat): HeartsAction[] {
  assertSeat(seat);
  const hand = sorted(context.hand);
  if (context.phase === 'pass') {
    const actions: HeartsAction[] = [];
    for (let a = 0; a < hand.length - 2; a++)
      for (let b = a + 1; b < hand.length - 1; b++)
        for (let c = b + 1; c < hand.length; c++)
          actions.push({ kind: 'pass', seat, cards: [hand[a], hand[b], hand[c]] });
    return actions;
  }
  if (context.phase !== 'play' || context.turn !== seat) return [];
  let cards: Card[];
  if (context.trick.length) {
    const following = hand.filter((card) => cardSuit(card) === cardSuit(context.trick[0].card));
    const safe = hand.filter((card) => cardSuit(card) !== 'H' && card !== 'SQ');
    cards = following.length ? following : !context.history.length && safe.length ? safe : hand;
  } else if (!context.history.length) cards = hand.filter((card) => card === 'C2');
  else {
    const other = hand.filter((card) => cardSuit(card) !== 'H');
    cards = !context.heartsBroken && other.length ? other : hand;
  }
  return cards.map((card) => ({ kind: 'play', seat, card }));
}
function emit(
  state: HeartsState,
  type: HeartsEvent['type'],
  message: string,
  details: Pick<HeartsEvent, 'seat' | 'card'> = {},
) {
  state.events.push({ id: (state.events.at(-1)?.id ?? 0) + 1, type, message, ...details });
}
function openingSeat(hands: Four<Card[]>): Seat {
  const seat = hands.findIndex((hand) => hand.includes('C2'));
  assertSeat(seat);
  return seat;
}
function deal(state: HeartsState, deck: Card[]): HeartsState {
  validateDeal(deck);
  const next = structuredClone(state);
  next.hands = heartsFour(() => []);
  const first = heartsSeatAfter(next.dealer);
  deck.forEach((card, index) => next.hands[heartsSeatAfter(first, index)].push(card));
  next.hands = [sorted(next.hands[0]), sorted(next.hands[1]), sorted(next.hands[2]), sorted(next.hands[3])];
  next.tricks = heartsFour(() => 0);
  next.trick = [];
  next.history = [];
  next.passes = heartsFour(() => ({ outgoing: [], incoming: [], to: null, from: null }));
  next.heartsBroken = false;
  next.v1Compatibility.spadesBroken = false;
  delete next.handResult;
  next.passDirection = (['left', 'right', 'across', 'hold'] as const)[(next.handNumber - 1) % 4];
  next.phase = next.passDirection === 'hold' ? 'play' : 'pass';
  next.turn = next.phase === 'pass' ? null : openingSeat(next.hands);
  emit(
    next,
    'hand-started',
    `Hand ${next.handNumber} dealt. ${next.passDirection === 'hold' ? 'No pass this hand.' : `Pass three cards ${next.passDirection}.`}`,
  );
  return next;
}
export function createHeartsGame(config: HeartsConfig, deck: Card[]): HeartsState {
  if (typeof config.id !== 'string' || !config.id) throw new Error('Invalid game configuration.');
  assertSeat(config.dealer);
  return deal(
    {
      id: config.id,
      moduleVersion: '2.0.0',
      stateSchemaVersion: '2.0.0',
      ruleProfileId: HEARTS_RULE_PROFILE,
      eventSchemaVersion: '2.0.0',
      phase: 'pass',
      hands: heartsFour(() => []),
      tricks: heartsFour(() => 0),
      scores: heartsFour(() => 0),
      trick: [],
      history: [],
      turn: null,
      dealer: config.dealer,
      handNumber: 1,
      heartsBroken: false,
      events: [],
      passDirection: 'left',
      passes: heartsFour(() => ({ outgoing: [], incoming: [], to: null, from: null })),
      v1Compatibility: { moduleVersion: '1.0.0', eventSchemaVersion: '1.0.0', spadesBroken: false },
    },
    deck,
  );
}
export function legalHeartsActions(state: HeartsState, seat: Seat): HeartsAction[] {
  return heartsActionsFor(
    {
      phase: state.phase,
      turn: state.turn,
      hand: state.hands[seat],
      trick: state.trick,
      history: state.history,
      heartsBroken: state.heartsBroken,
    },
    seat,
  );
}
export function matchHeartsWinner(scores: number[]): Seat | undefined {
  if (Math.max(...scores) < 100) return undefined;
  const best = Math.min(...scores);
  const winners = SEATS.filter((seat) => scores[seat] === best);
  return winners.length === 1 ? winners[0] : undefined;
}
function scoreHand(state: HeartsState) {
  const points = scoreHearts(state.history);
  for (const seat of SEATS) state.scores[seat] += points[seat];
  const winner = matchHeartsWinner(state.scores);
  state.handResult = { points };
  if (winner !== undefined) state.handResult.winner = winner;
  emit(
    state,
    'hand-scored',
    `Hand ${state.handNumber} scored. ${winner !== undefined ? 'Match complete.' : 'Review the result before the next deal.'}`,
  );
}
export function applyHeartsAction(state: HeartsState, action: HeartsAcceptedAction): HeartsState {
  if (
    state.moduleVersion !== '2.0.0' ||
    state.stateSchemaVersion !== '2.0.0' ||
    state.eventSchemaVersion !== '2.0.0' ||
    state.ruleProfileId !== HEARTS_RULE_PROFILE
  )
    throw new Error('Unsupported stored rules version.');
  if (action.kind === 'pass-bundle') {
    if (state.phase !== 'pass' || state.passDirection === 'hold' || action.passes.length !== 4)
      throw new Error('There is no pass to make.');
    for (const seat of SEATS) {
      const cards = action.passes[seat];
      if (
        !Array.isArray(cards) ||
        cards.length !== 3 ||
        new Set(cards).size !== 3 ||
        cards.some((card) => !state.hands[seat].includes(card))
      )
        throw new Error('Invalid sealed pass.');
    }
    const next = structuredClone(state);
    const offset = { left: 1, right: 3, across: 2 }[state.passDirection];
    const retained = (seat: Seat) => state.hands[seat].filter((card) => !action.passes[seat].includes(card));
    next.hands = [retained(0), retained(1), retained(2), retained(3)];
    for (const seat of SEATS) {
      const to = heartsSeatAfter(seat, offset),
        from = heartsSeatAfter(seat, 4 - offset);
      next.hands[to].push(...action.passes[seat]);
      next.passes[seat] = {
        outgoing: sorted(action.passes[seat]),
        incoming: sorted(action.passes[from]),
        to,
        from,
      };
    }
    next.hands = [sorted(next.hands[0]), sorted(next.hands[1]), sorted(next.hands[2]), sorted(next.hands[3])];
    next.phase = 'play';
    next.turn = openingSeat(next.hands);
    emit(
      next,
      'cards-passed',
      `Three cards passed ${next.passDirection}. ${seatName(next.turn)} lead with the 2 of Clubs.`,
    );
    return next;
  }
  if (action.kind !== 'play') throw new Error('Unsupported action.');
  assertSeat(action.seat);
  if (
    !legalHeartsActions(state, action.seat).some((legal) => heartsActionId(legal) === heartsActionId(action))
  )
    throw new Error('Action is not legal for this seat and phase.');
  const next = structuredClone(state),
    seat = action.seat;
  next.hands[seat] = next.hands[seat].filter((card) => card !== action.card);
  next.trick.push({ seat, card: action.card });
  if (cardSuit(action.card) === 'H') next.heartsBroken = true;
  if (cardSuit(action.card) === 'S') next.v1Compatibility.spadesBroken = true;
  emit(next, 'card-played', `${seatName(seat)} played ${cardLabel(action.card)}.`, {
    seat,
    card: action.card,
  });
  if (next.trick.length === 4) {
    const winner = heartsTrickWinner(next.trick);
    next.phase = 'trick-end';
    next.turn = winner;
    next.history.push({ plays: structuredClone(next.trick), winner });
    next.tricks[winner]++;
    emit(next, 'trick-resolved', `${seatName(winner)} won trick ${next.history.length}.`, { seat: winner });
    if (next.history.length === 13) scoreHand(next);
  } else next.turn = heartsSeatAfter(seat);
  return next;
}
export function collectHeartsTrick(state: HeartsState): HeartsState {
  if (state.phase !== 'trick-end' || state.trick.length !== 4) throw new Error('The trick is not complete.');
  const next = structuredClone(state);
  next.trick = [];
  next.phase = next.handResult ? (next.handResult.winner === undefined ? 'hand-end' : 'match-end') : 'play';
  emit(next, 'trick-collected', 'Completed trick cleared from the table.');
  return next;
}
export function nextHeartsHand(state: HeartsState, deck: Card[]): HeartsState {
  if (state.phase !== 'hand-end' && state.phase !== 'awaiting-deal')
    throw new Error('Finish and review this hand before dealing another.');
  return deal({ ...state, dealer: heartsSeatAfter(state.dealer), handNumber: state.handNumber + 1 }, deck);
}
