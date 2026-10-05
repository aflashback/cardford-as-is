import { array, json, object, integer, string, freeze } from '../kernel/codec.ts';
import { assertSeat } from '../kernel/seats.ts';
import { cardSuit } from '../cards.ts';
import type { LegacyPrivateGame, Four, GameEvent, PassMemory, Play, Mode } from './types.ts';
import { RULE_PROFILES } from './types.ts';
import { fromV1Hearts } from '../../games/hearts/compatibility.ts';
import { heartsStateCodec } from '../../games/hearts/codec.ts';
import { fromV1Spades } from '../../games/spades/compatibility.ts';
import { spadesStateCodec } from '../../games/spades/state.ts';

const tuple = <T>(raw: unknown, parse: (value: unknown) => T): Four<T> => {
  array(raw);
  if (raw.length !== 4) throw new TypeError('A legacy tuple requires four seats.');
  return [parse(raw[0]), parse(raw[1]), parse(raw[2]), parse(raw[3])];
};
const number = (raw: unknown): number => {
  integer(raw, Number.MIN_SAFE_INTEGER);
  return raw;
};
const cards = (raw: unknown): string[] => {
  array(raw);
  return raw.map((value) => {
    string(value);
    cardSuit(value);
    return value;
  });
};
const seat = (raw: unknown) => {
  assertSeat(raw);
  return raw;
};
const nullableSeat = (raw: unknown) => (raw === null ? null : seat(raw));
const boolean = (raw: unknown): boolean => {
  if (typeof raw !== 'boolean') throw new TypeError('Invalid legacy flag.');
  return raw;
};
const text = (raw: unknown): string => {
  string(raw);
  return raw;
};
const play = (raw: unknown): Play => {
  object(raw, ['seat', 'card']);
  const card = text(raw.card);
  cardSuit(card);
  return { seat: seat(raw.seat), card };
};
const pass = (raw: unknown): PassMemory => {
  object(raw, ['outgoing', 'incoming', 'to', 'from']);
  return {
    outgoing: cards(raw.outgoing),
    incoming: cards(raw.incoming),
    to: nullableSeat(raw.to),
    from: nullableSeat(raw.from),
  };
};
const event = (raw: unknown): GameEvent => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    throw new TypeError('Invalid legacy event.');
  object(raw, ['id', 'type', 'message', ...['seat', 'card', 'bid'].filter((key) => Object.hasOwn(raw, key))]);
  const type = raw.type;
  if (
    type !== 'hand-started' &&
    type !== 'bid-placed' &&
    type !== 'card-played' &&
    type !== 'cards-passed' &&
    type !== 'trick-resolved' &&
    type !== 'trick-collected' &&
    type !== 'moon-shot' &&
    type !== 'hand-scored'
  )
    throw new TypeError('Unsupported legacy event.');
  const result: GameEvent = { id: number(raw.id), type, message: text(raw.message) };
  if (Object.hasOwn(raw, 'seat')) result.seat = seat(raw.seat);
  if (Object.hasOwn(raw, 'card')) {
    result.card = text(raw.card);
    cardSuit(result.card);
  }
  if (Object.hasOwn(raw, 'bid')) result.bid = number(raw.bid);
  return result;
};

/** Private V1 snapshot reader; it never changes version or supplies a policy default. */
export function parseV1Game(input: unknown): LegacyPrivateGame {
  const raw = json(input);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    throw new TypeError('Invalid legacy state.');
  object(raw, [
    'id',
    'mode',
    'moduleVersion',
    'ruleProfileId',
    'eventSchemaVersion',
    'phase',
    'hands',
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
    'passes',
    ...(Object.hasOwn(raw, 'handResult') ? ['handResult'] : []),
  ]);
  const mode = raw.mode;
  if (mode !== 'hearts' && mode !== 'spades-solo' && mode !== 'spades-partners')
    throw new TypeError('Unsupported legacy mode.');
  if (
    raw.moduleVersion !== '1.0.0' ||
    raw.eventSchemaVersion !== '1.0.0' ||
    raw.ruleProfileId !== RULE_PROFILES[mode]
  )
    throw new TypeError('Unsupported legacy rule pin.');
  const phase = raw.phase;
  if (
    phase !== 'pass' &&
    phase !== 'bid' &&
    phase !== 'play' &&
    phase !== 'trick-end' &&
    phase !== 'hand-end' &&
    phase !== 'match-end'
  )
    throw new TypeError('Invalid legacy phase.');
  const direction = raw.passDirection;
  if (direction !== 'left' && direction !== 'right' && direction !== 'across' && direction !== 'hold')
    throw new TypeError('Invalid legacy pass direction.');
  array(raw.trick);
  array(raw.history);
  array(raw.events);
  const state: LegacyPrivateGame = {
    id: text(raw.id),
    mode,
    moduleVersion: '1.0.0',
    ruleProfileId: RULE_PROFILES[mode],
    eventSchemaVersion: '1.0.0',
    phase,
    hands: tuple(raw.hands, cards),
    bids: tuple(raw.bids, (value) => (value === null ? null : number(value))),
    tricks: tuple(raw.tricks, number),
    scores: tuple(raw.scores, number),
    bags: tuple(raw.bags, number),
    trick: raw.trick.map(play),
    history: raw.history.map((value) => {
      object(value, ['plays', 'winner']);
      array(value.plays);
      return { plays: value.plays.map(play), winner: seat(value.winner) };
    }),
    turn: nullableSeat(raw.turn),
    dealer: seat(raw.dealer),
    handNumber: number(raw.handNumber),
    heartsBroken: boolean(raw.heartsBroken),
    spadesBroken: boolean(raw.spadesBroken),
    events: raw.events.map(event),
    passDirection: direction,
    passes: tuple(raw.passes, pass),
  };
  if (Object.hasOwn(raw, 'handResult')) {
    const result = raw.handResult;
    if (result === null || typeof result !== 'object' || Array.isArray(result))
      throw new TypeError('Invalid legacy result.');
    object(result, ['points', 'bags', ...(Object.hasOwn(result, 'winner') ? ['winner'] : [])]);
    state.handResult = { points: tuple(result.points, number), bags: tuple(result.bags, number) };
    if (Object.hasOwn(result, 'winner')) state.handResult.winner = seat(result.winner);
  }
  // Game-owned structural/conservation validation, without replacing the original V1 result.
  if (state.mode === 'hearts') heartsStateCodec.parse(json(fromV1Hearts(state)));
  else spadesStateCodec.parse(json(fromV1Spades(state)));
  return freeze(state);
}

export type LegacyReadResult =
  | { kind: 'playable'; mode: Mode; state: LegacyPrivateGame }
  | { kind: 'read-only'; reason: 'missing-version' | 'unsupported-version' };
export function readLegacyGame(input: unknown): LegacyReadResult {
  const raw = json(input);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    throw new TypeError('Invalid legacy state.');
  object(raw, Object.keys(raw));
  if (
    !Object.hasOwn(raw, 'moduleVersion') ||
    !Object.hasOwn(raw, 'eventSchemaVersion') ||
    !Object.hasOwn(raw, 'ruleProfileId')
  )
    return freeze({ kind: 'read-only', reason: 'missing-version' });
  const mode = raw.mode;
  if (mode !== 'hearts' && mode !== 'spades-solo' && mode !== 'spades-partners')
    throw new TypeError('Unsupported legacy mode.');
  if (
    raw.moduleVersion !== '1.0.0' ||
    raw.eventSchemaVersion !== '1.0.0' ||
    raw.ruleProfileId !== RULE_PROFILES[mode]
  )
    return freeze({ kind: 'read-only', reason: 'unsupported-version' });
  const state = parseV1Game(raw);
  return freeze({ kind: 'playable', mode: state.mode, state });
}
