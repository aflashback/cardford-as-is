import { cardLabel, cardSuit, sorted, validateDeal } from '../../game/cards.ts';
import { scoreCompetitor } from '../../game/spades/score.ts';
import { assertSeat, SEATS, type Seat } from '../../game/kernel/seats.ts';
import type { AcceptedAction, Card, Four } from '../../game/kernel/types.ts';
import { SPADES_RULE_PROFILES, type SpadesEvent, type SpadesMode, type SpadesState } from './state.ts';
import {
  spadesActionId,
  spadesActionsFor,
  spadesTrickWinner,
  spadesMatchWinner as matchSpadesWinner,
} from './rules.ts';
export { spadesMatchWinner as matchSpadesWinner } from './rules.ts';

const four = <T>(make: () => T): Four<T> => [make(), make(), make(), make()];
const nextSeat = (seat: Seat): Seat => ((seat + 1) % 4) as Seat;
const seatName = (seat: Seat) => ['You', 'West', 'North', 'East'][seat];
function emit(
  state: SpadesState,
  type: SpadesEvent['type'],
  message: string,
  details: Pick<SpadesEvent, 'seat' | 'card' | 'bid'> = {},
) {
  state.events.push({ id: (state.events.at(-1)?.id ?? 0) + 1, type, message, ...details });
}
function deal(state: SpadesState, deck: Card[]): SpadesState {
  validateDeal(deck);
  const next = structuredClone(state);
  next.hands = four(() => [] as Card[]);
  const first = nextSeat(next.dealer);
  deck.forEach((card, index) => next.hands[(first + index) % 4].push(card));
  next.hands = next.hands.map(sorted) as Four<Card[]>;
  next.bids = four(() => null);
  next.tricks = four(() => 0);
  next.trick = [];
  next.history = [];
  next.spadesBroken = false;
  next.compatibility = {
    heartsBroken: false,
    passDirection: (['left', 'right', 'across', 'hold'] as const)[(next.handNumber - 1) % 4],
    passes: four(() => ({ outgoing: [], incoming: [], to: null, from: null })),
  };
  next.awaitingDeal = false;
  delete next.handResult;
  next.phase = 'bid';
  next.turn = first;
  emit(next, 'hand-started', `Hand ${next.handNumber} dealt. ${seatName(first)} bid first.`);
  return next;
}
export function createSpadesGame(
  config: { id: string; mode: SpadesMode; dealer: Seat },
  deck: Card[],
): SpadesState {
  if (!Object.hasOwn(SPADES_RULE_PROFILES, config.mode) || typeof config.id !== 'string' || !config.id)
    throw new Error('Invalid game configuration.');
  assertSeat(config.dealer);
  return deal(
    {
      id: config.id,
      mode: config.mode,
      moduleVersion: '2.0.0',
      stateSchemaVersion: '2.0.0',
      ruleProfileId: SPADES_RULE_PROFILES[config.mode],
      eventSchemaVersion: '2.0.0',
      phase: 'bid',
      hands: four(() => []),
      bids: four(() => null),
      tricks: four(() => 0),
      scores: four(() => 0),
      bags: four(() => 0),
      trick: [],
      history: [],
      turn: null,
      dealer: config.dealer,
      handNumber: 1,
      spadesBroken: false,
      events: [],
      awaitingDeal: false,
      compatibility: {
        heartsBroken: false,
        passDirection: 'left',
        passes: four(() => ({ outgoing: [], incoming: [], to: null, from: null })),
      },
    },
    deck,
  );
}
export function legalSpadesActions(state: SpadesState, seat: Seat) {
  assertSeat(seat);
  if (state.awaitingDeal) return [];
  return spadesActionsFor(
    {
      phase: state.phase,
      turn: state.turn,
      hand: state.hands[seat],
      trick: state.trick,
      spadesBroken: state.spadesBroken,
    },
    seat,
  );
}
function scoreHand(state: SpadesState): void {
  const points = four(() => 0);
  const groups: Seat[][] =
    state.mode === 'spades-partners'
      ? [
          [0, 2],
          [1, 3],
        ]
      : SEATS.map((seat) => [seat]);
  for (const group of groups) {
    const bids = group.map((seat) => {
      const bid = state.bids[seat];
      if (bid === null) throw new Error('Missing bid.');
      return bid;
    });
    const result = scoreCompetitor({
      bids,
      tricks: group.map((seat) => state.tricks[seat]),
      oldBags: state.bags[group[0]],
    });
    const score = state.scores[group[0]] + result.delta;
    for (const seat of group) {
      points[seat] = result.delta;
      state.scores[seat] = score;
      state.bags[seat] = result.bags;
    }
  }
  state.handResult = { points, bags: [...state.bags] };
  const winner = matchSpadesWinner(state.mode, state.scores);
  if (winner !== undefined) state.handResult.winner = winner;
  emit(
    state,
    'hand-scored',
    `Hand ${state.handNumber} scored. ${winner !== undefined ? 'Match complete.' : 'Review the result before the next deal.'}`,
  );
}
export function applySpadesAction(state: SpadesState, action: AcceptedAction): SpadesState {
  if (
    state.moduleVersion !== '2.0.0' ||
    state.stateSchemaVersion !== '2.0.0' ||
    state.eventSchemaVersion !== '2.0.0' ||
    state.ruleProfileId !== SPADES_RULE_PROFILES[state.mode]
  )
    throw new Error('Unsupported stored rules version.');
  if (action.kind !== 'play' && action.kind !== 'bid') throw new Error('Unsupported Spades action.');
  if (action.kind === 'bid' && (!Number.isInteger(action.bid) || action.bid < 0 || action.bid > 13))
    throw new Error('Invalid bid.');
  assertSeat(action.seat);
  if (
    !legalSpadesActions(state, action.seat).some(
      (candidate) => spadesActionId(candidate) === spadesActionId(action),
    )
  )
    throw new Error('Action is not legal for this seat and phase.');
  const next = structuredClone(state);
  const seat = action.seat;
  if (action.kind === 'bid') {
    next.bids[seat] = action.bid;
    emit(next, 'bid-placed', `${seatName(seat)} bid ${action.bid === 0 ? 'Nil' : action.bid}.`, {
      seat,
      bid: action.bid,
    });
    next.turn = nextSeat(seat);
    if (next.bids.every((bid) => bid !== null)) {
      next.phase = 'play';
      next.turn = nextSeat(next.dealer);
    }
    return next;
  }
  next.hands[seat] = next.hands[seat].filter((card) => card !== action.card);
  next.trick.push({ seat, card: action.card });
  if (cardSuit(action.card) === 'H') next.compatibility.heartsBroken = true;
  if (cardSuit(action.card) === 'S') next.spadesBroken = true;
  emit(next, 'card-played', `${seatName(seat)} played ${cardLabel(action.card)}.`, {
    seat,
    card: action.card,
  });
  if (next.trick.length === 4) {
    const winner = spadesTrickWinner(next.trick);
    next.phase = 'trick-end';
    next.turn = winner;
    next.history.push({ plays: structuredClone(next.trick), winner });
    next.tricks[winner]++;
    emit(next, 'trick-resolved', `${seatName(winner)} won trick ${next.history.length}.`, { seat: winner });
    if (next.history.length === 13) scoreHand(next);
  } else next.turn = nextSeat(seat);
  return next;
}
export function collectSpadesTrick(state: SpadesState): SpadesState {
  if (state.phase !== 'trick-end' || state.trick.length !== 4) throw new Error('The trick is not complete.');
  const next = structuredClone(state);
  next.trick = [];
  next.phase = next.handResult ? (next.handResult.winner === undefined ? 'hand-end' : 'match-end') : 'play';
  emit(next, 'trick-collected', 'Completed trick cleared from the table.');
  return next;
}
export function nextSpadesHand(state: SpadesState, deck: Card[]): SpadesState {
  if (state.phase !== 'hand-end') throw new Error('Finish and review this hand before dealing another.');
  return deal({ ...state, dealer: nextSeat(state.dealer), handNumber: state.handNumber + 1 }, deck);
}
