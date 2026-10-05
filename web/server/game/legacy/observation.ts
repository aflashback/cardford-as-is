import {
  assertSeat,
  SUITS,
  type PrivateGame,
  type GameEvent,
  type Play,
  type Seat,
  type Card,
} from './types.ts';
import { cardSuit } from '../cards.ts';
import { actionsFor, actionId } from './rules.ts';
import { RULE_PROFILES } from './types.ts';
import { legalActions } from './v1.ts';
import type { SeatObservation, SuitMemory } from '../../observations/types.ts';
export * from '../../observations/types.ts';
const play = (p: Play): Play => ({ seat: p.seat, card: p.card });
export function projectEvent(event: GameEvent): GameEvent {
  const result: GameEvent = { id: event.id, type: event.type, message: event.message };
  if (event.seat !== undefined) result.seat = event.seat;
  if (event.card !== undefined) result.card = event.card;
  if (event.bid !== undefined) result.bid = event.bid;
  return result;
}
export function getMemory(context: Pick<SeatObservation, 'history' | 'trick'>): SuitMemory[] {
  const seen = new Set<Card>();
  const voids = new Map(SUITS.map((s) => [s, new Set<Seat>()]));
  for (const trick of [...context.history.map((t) => t.plays), context.trick]) {
    if (!trick.length) continue;
    const led = cardSuit(trick[0].card);
    for (const p of trick) {
      seen.add(p.card);
      if (cardSuit(p.card) !== led) voids.get(led)!.add(p.seat);
    }
  }
  return SUITS.map((suit) => {
    const played = [...seen].filter((c) => cardSuit(c) === suit).length;
    return { suit, played, remaining: 13 - played, voidSeats: [...voids.get(suit)!].sort() };
  });
}
export function observe(state: PrivateGame, seat: Seat): SeatObservation {
  assertSeat(seat);
  const memory = state.passes[seat];
  const seen = new Set([
    ...state.history.flatMap((t) => t.plays.map((p) => p.card)),
    ...state.trick.map((p) => p.card),
  ]);
  const result: SeatObservation = {
    mode: state.mode,
    seat,
    moduleVersion: state.moduleVersion,
    ruleProfileId: state.ruleProfileId,
    observationSchemaVersion: '1.0.0',
    featureVersion: '1.0.0',
    phase: state.phase,
    hand: [...state.hands[seat]],
    handSizes: state.hands.map((h) => h.length),
    bids: [...state.bids],
    tricks: [...state.tricks],
    scores: [...state.scores],
    bags: [...state.bags],
    trick: state.trick.map(play),
    history: state.history.map((t) => ({ plays: t.plays.map(play), winner: t.winner })),
    turn: state.phase === 'pass' ? null : state.turn,
    dealer: state.dealer,
    handNumber: state.handNumber,
    heartsBroken: state.heartsBroken,
    spadesBroken: state.spadesBroken,
    events: state.events.map(projectEvent),
    passDirection: state.passDirection,
    pass: {
      outgoing: [...memory.outgoing],
      incoming: [...memory.incoming],
      to: memory.to,
      from: memory.from,
    },
    legalActions: legalActions(state, seat),
    memory: getMemory(state),
    knownHoldings:
      memory.to === null
        ? []
        : memory.outgoing.filter((c) => !seen.has(c)).map((card) => ({ seat: memory.to as Seat, card })),
  };
  if (state.handResult) {
    result.handResult = { points: [...state.handResult.points], bags: [...state.handResult.bags] };
    if (state.handResult.winner !== undefined) result.handResult.winner = state.handResult.winner;
  }
  return result;
}
/** Deep, closed validation at the strategic boundary. Unknown fields are rejected, never stripped. */
function object(
  value: unknown,
  required: string[],
  optional: string[] = [],
): asserts value is Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some((k) => !required.includes(k) && !optional.includes(k)) ||
    required.some((k) => !Object.hasOwn(value, k))
  )
    throw new Error('Invalid or unexpected observation field.');
}
function array(value: unknown, min = 0, max = 52): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    throw new Error('Invalid observation array.');
}
function integer(
  value: unknown,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new Error('Invalid observation number.');
}
function text(value: unknown, max = 2000): asserts value is string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid observation text.');
}
function enumeration(value: unknown, choices: readonly unknown[]): void {
  if (!choices.includes(value)) throw new Error('Invalid observation enum.');
}
function cards(value: unknown, max = 13): void {
  array(value, 0, max);
  if (new Set(value).size !== value.length) throw new Error('Duplicate observation card.');
  for (const card of value) {
    text(card, 3);
    cardSuit(card);
  }
}
function plays(value: unknown): void {
  array(value, 0, 4);
  const seats = new Set<unknown>(),
    seen = new Set<unknown>();
  for (const item of value) {
    object(item, ['seat', 'card']);
    assertSeat(item.seat);
    text(item.card, 3);
    cardSuit(item.card);
    if (seats.has(item.seat) || seen.has(item.card)) throw new Error('Duplicate play.');
    seats.add(item.seat);
    seen.add(item.card);
  }
}
export function assertObservation(value: unknown): asserts value is SeatObservation {
  object(
    value,
    [
      'mode',
      'seat',
      'moduleVersion',
      'ruleProfileId',
      'observationSchemaVersion',
      'featureVersion',
      'phase',
      'hand',
      'handSizes',
      'bids',
      'tricks',
      'scores',
      'bags',
      'trick',
      'history',
      'turn',
      'dealer',
      'handNumber',
      'heartsBroken',
      'spadesBroken',
      'events',
      'passDirection',
      'pass',
      'legalActions',
      'memory',
      'knownHoldings',
    ],
    ['handResult'],
  );
  enumeration(value.mode, ['hearts', 'spades-solo', 'spades-partners']);
  assertSeat(value.seat);
  assertSeat(value.dealer);
  if (value.turn !== null) assertSeat(value.turn);
  enumeration(value.moduleVersion, ['1.0.0']);
  enumeration(value.observationSchemaVersion, ['1.0.0']);
  enumeration(value.featureVersion, ['1.0.0']);
  text(value.ruleProfileId, 80);
  if (value.ruleProfileId !== RULE_PROFILES[value.mode as SeatObservation['mode']])
    throw new Error('Unsupported observation rule profile.');
  enumeration(value.phase, ['pass', 'bid', 'play', 'trick-end', 'hand-end', 'match-end']);
  enumeration(value.passDirection, ['left', 'right', 'across', 'hold']);
  integer(value.handNumber, 1);
  enumeration(value.heartsBroken, [true, false]);
  enumeration(value.spadesBroken, [true, false]);
  cards(value.hand);
  for (const key of ['handSizes', 'tricks', 'bags', 'scores', 'bids']) {
    const items = value[key];
    array(items, 4, 4);
    for (const item of items) {
      if (key === 'bids' && item === null) continue;
      integer(
        item,
        key === 'scores' ? Number.MIN_SAFE_INTEGER : 0,
        key === 'bags' ? 9 : key === 'scores' ? Number.MAX_SAFE_INTEGER : 13,
      );
    }
  }
  if ((value.hand as unknown[]).length !== (value.handSizes as number[])[value.seat])
    throw new Error('Own hand size mismatch.');
  plays(value.trick);
  array(value.history, 0, 13);
  for (const trick of value.history) {
    object(trick, ['plays', 'winner']);
    plays(trick.plays);
    assertSeat(trick.winner);
  }
  object(value.pass, ['outgoing', 'incoming', 'to', 'from']);
  cards(value.pass.outgoing, 3);
  cards(value.pass.incoming, 3);
  if (value.pass.to !== null) assertSeat(value.pass.to);
  if (value.pass.from !== null) assertSeat(value.pass.from);
  array(value.events, 0, 100000);
  for (const event of value.events) {
    object(event, ['id', 'type', 'message'], ['seat', 'card', 'bid']);
    integer(event.id, 1);
    enumeration(event.type, [
      'hand-started',
      'bid-placed',
      'card-played',
      'cards-passed',
      'trick-resolved',
      'trick-collected',
      'moon-shot',
      'hand-scored',
    ]);
    text(event.message);
    if (event.seat !== undefined) assertSeat(event.seat);
    if (event.card !== undefined) {
      text(event.card, 3);
      cardSuit(event.card);
    }
    if (event.bid !== undefined) integer(event.bid, 0, 13);
  }
  array(value.memory, 4, 4);
  const suits = new Set<unknown>();
  for (const memory of value.memory) {
    object(memory, ['suit', 'played', 'remaining', 'voidSeats']);
    enumeration(memory.suit, SUITS);
    if (suits.has(memory.suit)) throw new Error('Duplicate memory suit.');
    suits.add(memory.suit);
    integer(memory.played, 0, 13);
    integer(memory.remaining, 0, 13);
    if (memory.played + memory.remaining !== 13) throw new Error('Inconsistent suit count.');
    array(memory.voidSeats, 0, 4);
    for (const seat of memory.voidSeats) assertSeat(seat);
    if (new Set(memory.voidSeats).size !== memory.voidSeats.length) throw new Error('Duplicate void seat.');
  }
  array(value.knownHoldings, 0, 3);
  for (const known of value.knownHoldings) {
    object(known, ['seat', 'card']);
    assertSeat(known.seat);
    text(known.card, 3);
    cardSuit(known.card);
  }
  array(value.legalActions, 0, 286);
  for (const action of value.legalActions) {
    object(action, ['kind', 'seat'], ['card', 'bid', 'cards']);
    assertSeat(action.seat);
    if (action.seat !== value.seat) throw new Error('Wrong action actor.');
    enumeration(action.kind, ['play', 'bid', 'pass']);
    if (action.kind === 'play') {
      object(action, ['kind', 'seat', 'card']);
      text(action.card, 3);
      cardSuit(action.card);
    } else if (action.kind === 'bid') {
      object(action, ['kind', 'seat', 'bid']);
      integer(action.bid, 0, 13);
    } else {
      object(action, ['kind', 'seat', 'cards']);
      cards(action.cards, 3);
      if ((action.cards as unknown[]).length !== 3) throw new Error('A pass has three cards.');
    }
  }
  if (value.handResult !== undefined) {
    object(value.handResult, ['points', 'bags'], ['winner']);
    for (const key of ['points', 'bags']) {
      const items = value.handResult[key];
      array(items, 4, 4);
      for (const item of items)
        integer(
          item,
          key === 'bags' ? 0 : Number.MIN_SAFE_INTEGER,
          key === 'bags' ? 9 : Number.MAX_SAFE_INTEGER,
        );
    }
    if (value.handResult.winner !== undefined) assertSeat(value.handResult.winner);
  }
  // After every field has been validated, require the complete legal reference set and derived memory.
  const observation = value as unknown as SeatObservation;
  const expected = actionsFor(observation, observation.seat).map(actionId).sort();
  const actual = observation.legalActions.map(actionId).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error('Observation legal reference set mismatch.');
  if (JSON.stringify(getMemory(observation)) !== JSON.stringify(observation.memory))
    throw new Error('Observation public memory mismatch.');
  if (observation.phase === 'pass' && observation.turn !== null)
    throw new Error('Sealed pass cannot expose the opening seat.');
}
