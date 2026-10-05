import { array, canonical, integer, json, object, string } from '../../game/kernel/codec.ts';
import type { Codec } from '../../game/kernel/module.ts';
import { assertSeat, SEATS } from '../../game/kernel/seats.ts';
import type { Card, Four, PassMemory, Play, Seat, Trick } from '../../game/kernel/types.ts';
import { cardSuit, validateDeal } from '../../game/cards.ts';
import { scoreHearts } from '../../game/hearts/score.ts';
import {
  heartsActionsFor,
  heartsFour,
  heartsSeatAfter,
  heartsTrickWinner,
  matchHeartsWinner,
} from './engine.ts';
import {
  HEARTS_RULE_PROFILE,
  type HeartsChance,
  type HeartsConfig,
  type HeartsEvent,
  type HeartsHandResult,
  type HeartsPhase,
  type HeartsState,
} from './state.ts';

export function exactObject(
  raw: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): asserts raw is Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) throw new TypeError('Invalid object.');
  object(raw, [...required, ...optional.filter((key) => Object.hasOwn(raw, key))]);
}
export function fourValues<T>(raw: unknown, parse: (raw: unknown) => T): Four<T> {
  array(raw);
  if (raw.length !== 4) throw new TypeError('Expected four seats.');
  return [parse(raw[0]), parse(raw[1]), parse(raw[2]), parse(raw[3])];
}
export function parseNumber(raw: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  integer(raw, min);
  if (raw > max) throw new TypeError('Invalid Hearts number.');
  return raw;
}
export function parseBoolean(raw: unknown): boolean {
  if (typeof raw !== 'boolean') throw new TypeError('Invalid boolean.');
  return raw;
}
export function parseCard(raw: unknown): Card {
  if (typeof raw !== 'string') throw new TypeError('Invalid card.');
  cardSuit(raw);
  return raw;
}
export function parseCards(raw: unknown, max = 13): Card[] {
  array(raw);
  if (raw.length > max || new Set(raw).size !== raw.length) throw new TypeError('Invalid card holding.');
  return raw.map(parseCard);
}
export function parsePhase(raw: unknown): HeartsPhase {
  if (
    raw !== 'pass' &&
    raw !== 'play' &&
    raw !== 'trick-end' &&
    raw !== 'hand-end' &&
    raw !== 'match-end' &&
    raw !== 'awaiting-deal'
  )
    throw new TypeError('Invalid Hearts phase.');
  return raw;
}
export function parseDirection(raw: unknown): HeartsState['passDirection'] {
  if (raw !== 'left' && raw !== 'right' && raw !== 'across' && raw !== 'hold')
    throw new TypeError('Invalid pass direction.');
  return raw;
}
export function parseSeatOrNull(raw: unknown): Seat | null {
  if (raw === null) return null;
  assertSeat(raw);
  return raw;
}
export function parsePlays(raw: unknown, complete = false): Play[] {
  array(raw);
  if (raw.length > 4 || (complete && raw.length !== 4)) throw new TypeError('Invalid trick length.');
  const plays = raw.map((entry) => {
    object(entry, ['seat', 'card']);
    assertSeat(entry.seat);
    return { seat: entry.seat, card: parseCard(entry.card) };
  });
  if (
    new Set(plays.map((play) => play.seat)).size !== plays.length ||
    new Set(plays.map((play) => play.card)).size !== plays.length ||
    plays.some((play, index) => index > 0 && play.seat !== heartsSeatAfter(plays[index - 1].seat))
  )
    throw new TypeError('Invalid trick order.');
  return plays;
}
export function parseHistory(raw: unknown): Trick[] {
  array(raw);
  if (raw.length > 13) throw new TypeError('Too many tricks.');
  const history = raw.map((entry) => {
    object(entry, ['plays', 'winner']);
    assertSeat(entry.winner);
    const plays = parsePlays(entry.plays, true);
    if (heartsTrickWinner(plays) !== entry.winner) throw new TypeError('Incorrect trick winner.');
    return { plays, winner: entry.winner };
  });
  if (history.some((trick, index) => index > 0 && trick.plays[0].seat !== history[index - 1].winner))
    throw new TypeError('Incorrect trick leader.');
  return history;
}
export function parsePass(raw: unknown): PassMemory {
  object(raw, ['outgoing', 'incoming', 'to', 'from']);
  const result = {
    outgoing: parseCards(raw.outgoing, 3),
    incoming: parseCards(raw.incoming, 3),
    to: parseSeatOrNull(raw.to),
    from: parseSeatOrNull(raw.from),
  };
  if (
    (result.to === null) !== (result.from === null) ||
    result.outgoing.length !== result.incoming.length ||
    (result.to === null ? result.outgoing.length !== 0 : result.outgoing.length !== 3)
  )
    throw new TypeError('Invalid pass memory.');
  return result;
}
export function parseResult(raw: unknown): HeartsHandResult {
  exactObject(raw, ['points'], ['winner']);
  const result: HeartsHandResult = { points: fourValues(raw.points, (value) => parseNumber(value, 0, 26)) };
  if (Object.hasOwn(raw, 'winner')) {
    assertSeat(raw.winner);
    result.winner = raw.winner;
  }
  return result;
}
export function parseEvent(raw: unknown): HeartsEvent {
  exactObject(raw, ['id', 'type', 'message'], ['seat', 'card']);
  const id = parseNumber(raw.id, 1);
  const type = raw.type;
  if (
    type !== 'hand-started' &&
    type !== 'card-played' &&
    type !== 'cards-passed' &&
    type !== 'trick-resolved' &&
    type !== 'trick-collected' &&
    type !== 'moon-shot' &&
    type !== 'hand-scored'
  )
    throw new TypeError('Invalid Hearts event.');
  if (typeof raw.message !== 'string' || raw.message.length > 4000)
    throw new TypeError('Invalid event message.');
  const result: HeartsEvent = { id, type, message: raw.message };
  if (Object.hasOwn(raw, 'seat')) {
    assertSeat(raw.seat);
    result.seat = raw.seat;
  }
  if (Object.hasOwn(raw, 'card')) result.card = parseCard(raw.card);
  if (
    (type === 'card-played' && (result.seat === undefined || result.card === undefined)) ||
    (type !== 'card-played' && result.card !== undefined) ||
    ((type === 'trick-resolved') !== (result.seat !== undefined) && type !== 'card-played')
  )
    throw new TypeError('Inconsistent Hearts event.');
  return result;
}
export function parseEvents(raw: unknown): HeartsEvent[] {
  array(raw);
  if (raw.length > 100000) throw new TypeError('Too many events.');
  const events = raw.map(parseEvent);
  if (events.some((event, index) => event.id !== index + 1)) throw new TypeError('Invalid event sequence.');
  return events;
}
export const heartsConfigurationCodec: Codec<HeartsConfig> = {
  parse(raw) {
    object(raw, ['id', 'dealer']);
    string(raw.id);
    assertSeat(raw.dealer);
    return { id: raw.id, dealer: raw.dealer };
  },
  encode: json,
};
export const heartsChanceCodec: Codec<HeartsChance> = {
  parse(raw) {
    exactObject(raw, ['kind'], ['roundNumber', 'deck']);
    if (raw.kind === 'request-deal') {
      object(raw, ['kind', 'roundNumber']);
      return { kind: 'request-deal', roundNumber: parseNumber(raw.roundNumber, 1) };
    }
    if (raw.kind === 'deal') {
      object(raw, ['kind', 'deck']);
      const deck = parseCards(raw.deck, 52);
      validateDeal(deck);
      return { kind: 'deal', deck };
    }
    throw new TypeError('Invalid Hearts chance material.');
  },
  encode: json,
};
export const heartsEventCodec: Codec<HeartsEvent> = { parse: parseEvent, encode: json };

/** No prior round exists at hand 1: its running total is either zero or this scored hand's points. */
export function assertHeartsFirstHandScores(
  input: Pick<HeartsState, 'handNumber' | 'scores' | 'handResult'>,
): void {
  if (
    input.handNumber === 1 &&
    canonical(input.scores) !== canonical(input.handResult?.points ?? [0, 0, 0, 0])
  )
    throw new TypeError('Incorrect first hand score.');
}

function validateState(state: HeartsState): void {
  if (state.passDirection !== (['left', 'right', 'across', 'hold'] as const)[(state.handNumber - 1) % 4])
    throw new TypeError('Pass cycle mismatch.');
  const duplicatedTrick = state.phase === 'trick-end';
  if (
    duplicatedTrick &&
    (state.trick.length !== 4 || canonical(state.trick) !== canonical(state.history.at(-1)?.plays))
  )
    throw new TypeError('Completed table trick mismatch.');
  if (!duplicatedTrick && state.trick.length === 4) throw new TypeError('Uncollected complete trick.');
  const played = [...state.history.flatMap((trick) => trick.plays), ...(duplicatedTrick ? [] : state.trick)];
  validateDeal([...state.hands.flat(), ...played.map((play) => play.card)]);
  const actualTricks = heartsFour(() => 0),
    playedBySeat = heartsFour(() => 0);
  for (const trick of state.history) actualTricks[trick.winner]++;
  for (const play of played) playedBySeat[play.seat]++;
  if (
    canonical(actualTricks) !== canonical(state.tricks) ||
    SEATS.some((seat) => state.hands[seat].length !== 13 - playedBySeat[seat])
  )
    throw new TypeError('Card/trick count mismatch.');
  if (
    state.heartsBroken !== played.some((play) => cardSuit(play.card) === 'H') ||
    state.v1Compatibility.spadesBroken !== played.some((play) => cardSuit(play.card) === 'S')
  )
    throw new TypeError('Broken-suit flag mismatch.');
  if (state.phase === 'pass' && (state.passDirection === 'hold' || state.turn !== null || played.length))
    throw new TypeError('Invalid sealed phase.');
  if (state.phase !== 'pass' && state.turn === null) throw new TypeError('Missing retained turn.');
  const complete = state.history.length === 13;
  if (
    complete !== !!state.handResult ||
    (['hand-end', 'match-end', 'awaiting-deal'].includes(state.phase) && (!complete || state.trick.length))
  )
    throw new TypeError('Incorrect hand boundary.');
  if (complete && (state.phase === 'play' || state.phase === 'pass'))
    throw new TypeError('Completed hand cannot remain actionable.');
  if (
    state.handResult &&
    (canonical(state.handResult.points) !== canonical(scoreHearts(state.history)) ||
      state.handResult.winner !== matchHeartsWinner(state.scores))
  )
    throw new TypeError('Incorrect hand result.');
  assertHeartsFirstHandScores(state);
  if (
    (state.phase === 'match-end') !==
    (!!state.handResult && state.phase !== 'trick-end' && state.handResult.winner !== undefined)
  )
    throw new TypeError('Incorrect match boundary.');
  const openingHand = (seat: Seat) => [
    ...state.hands[seat],
    ...played.filter((play) => play.seat === seat).map((play) => play.card),
  ];
  const openingHands: Four<Card[]> = [openingHand(0), openingHand(1), openingHand(2), openingHand(3)];
  for (const seat of SEATS) {
    const pass = state.passes[seat];
    if (state.phase === 'pass' || state.passDirection === 'hold') {
      if (pass.to !== null) throw new TypeError('Unexpected pass memory.');
    } else {
      const offset = { left: 1, right: 3, across: 2 }[state.passDirection];
      const to = heartsSeatAfter(seat, offset),
        from = heartsSeatAfter(seat, 4 - offset);
      if (
        pass.to !== to ||
        pass.from !== from ||
        canonical(pass.incoming) !== canonical(state.passes[from].outgoing) ||
        pass.outgoing.some((card) => !openingHands[to].includes(card)) ||
        pass.incoming.some((card) => !openingHands[seat].includes(card))
      )
        throw new TypeError('Pass ownership mismatch.');
    }
  }
  if (played.length) {
    let broken = false;
    const resolved: Trick[] = [];
    let current: Play[] = [];
    for (const play of played) {
      const legal = heartsActionsFor(
        {
          phase: 'play',
          turn: play.seat,
          hand: openingHands[play.seat],
          history: resolved,
          trick: current,
          heartsBroken: broken,
        },
        play.seat,
      );
      if (!legal.some((action) => action.kind === 'play' && action.card === play.card))
        throw new TypeError('Illegal saved Hearts play.');
      openingHands[play.seat] = openingHands[play.seat].filter((card) => card !== play.card);
      current.push(play);
      broken ||= cardSuit(play.card) === 'H';
      if (current.length === 4) {
        resolved.push({ plays: current, winner: heartsTrickWinner(current) });
        current = [];
      }
    }
  }
  if (state.phase !== 'pass') {
    const expected =
      state.trick.length && !duplicatedTrick
        ? heartsSeatAfter(state.trick.at(-1)!.seat)
        : (state.history.at(-1)?.winner ?? SEATS.find((seat) => state.hands[seat].includes('C2')));
    if (
      state.turn !== expected ||
      (!duplicatedTrick &&
        state.trick.length &&
        state.history.length &&
        state.trick[0].seat !== state.history.at(-1)?.winner)
    )
      throw new TypeError('Incorrect next actor.');
  }
}
export const heartsStateCodec: Codec<HeartsState> = {
  parse(raw) {
    exactObject(
      raw,
      [
        'id',
        'moduleVersion',
        'stateSchemaVersion',
        'ruleProfileId',
        'eventSchemaVersion',
        'phase',
        'hands',
        'tricks',
        'scores',
        'trick',
        'history',
        'turn',
        'dealer',
        'handNumber',
        'heartsBroken',
        'events',
        'passDirection',
        'passes',
        'v1Compatibility',
      ],
      ['handResult'],
    );
    string(raw.id);
    assertSeat(raw.dealer);
    if (
      raw.moduleVersion !== '2.0.0' ||
      raw.stateSchemaVersion !== '2.0.0' ||
      raw.eventSchemaVersion !== '2.0.0' ||
      raw.ruleProfileId !== HEARTS_RULE_PROFILE
    )
      throw new TypeError('Unsupported Hearts state version.');
    object(raw.v1Compatibility, ['moduleVersion', 'eventSchemaVersion', 'spadesBroken']);
    if (raw.v1Compatibility.moduleVersion !== '1.0.0' || raw.v1Compatibility.eventSchemaVersion !== '1.0.0')
      throw new TypeError('Unsupported V1 bridge version.');
    const state: HeartsState = {
      id: raw.id,
      moduleVersion: raw.moduleVersion,
      stateSchemaVersion: raw.stateSchemaVersion,
      ruleProfileId: raw.ruleProfileId,
      eventSchemaVersion: raw.eventSchemaVersion,
      phase: parsePhase(raw.phase),
      hands: fourValues(raw.hands, (hand) => parseCards(hand)),
      tricks: fourValues(raw.tricks, (value) => parseNumber(value, 0, 13)),
      scores: fourValues(raw.scores, (value) => parseNumber(value)),
      trick: parsePlays(raw.trick),
      history: parseHistory(raw.history),
      turn: parseSeatOrNull(raw.turn),
      dealer: raw.dealer,
      handNumber: parseNumber(raw.handNumber, 1),
      heartsBroken: parseBoolean(raw.heartsBroken),
      events: parseEvents(raw.events),
      passDirection: parseDirection(raw.passDirection),
      passes: fourValues(raw.passes, parsePass),
      v1Compatibility: {
        moduleVersion: '1.0.0',
        eventSchemaVersion: '1.0.0',
        spadesBroken: parseBoolean(raw.v1Compatibility.spadesBroken),
      },
    };
    if (Object.hasOwn(raw, 'handResult')) state.handResult = parseResult(raw.handResult);
    validateState(state);
    return state;
  },
  encode(value) {
    return json(this.parse(json(value)));
  },
};
