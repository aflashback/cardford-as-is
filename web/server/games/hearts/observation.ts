import { canonical, json, string } from '../../game/kernel/codec.ts';
import type { Codec } from '../../game/kernel/module.ts';
import { assertSeat } from '../../game/kernel/seats.ts';
import type { Card, Four, PassMemory, Play, Seat, Trick } from '../../game/kernel/types.ts';
import { cardSuit } from '../../game/cards.ts';
import { scoreHearts } from '../../game/hearts/score.ts';
import {
  assertObservation,
  getMemory,
  type SeatObservation,
  type SuitMemory,
} from '../../observations/index.ts';
import type { HeartsObservation as PublicHeartsObservation } from '../../../shared/contracts.ts';
import {
  exactObject,
  fourValues,
  parseBoolean,
  parseCards,
  parseDirection,
  parseEvents,
  parseHistory,
  parseNumber,
  parsePass,
  parsePhase,
  parsePlays,
  parseResult,
  parseSeatOrNull,
  assertHeartsFirstHandScores,
} from './codec.ts';
import { heartsActionsFor, heartsFour, matchHeartsWinner } from './engine.ts';
import type { HeartsAction, HeartsEvent, HeartsHandResult, HeartsPhase, HeartsState } from './state.ts';
import {
  copyHeartsEvent,
  copyHeartsHistory,
  copyHeartsPass,
  copyHeartsPlay,
  copyHeartsResult,
} from './projection.ts';

export type HeartsActorObservation = {
  moduleVersion: '2.0.0';
  observationSchemaVersion: '2.0.0';
  ruleProfileId: 'hearts-training-1.0.0';
  featureVersion: '1.0.0';
  seat: Seat;
  phase: HeartsPhase;
  hand: Card[];
  handCounts: Four<number>;
  tricks: Four<number>;
  scores: Four<number>;
  trick: Play[];
  history: Trick[];
  turn: Seat | null;
  dealer: Seat;
  handNumber: number;
  heartsBroken: boolean;
  events: HeartsEvent[];
  handResult?: HeartsHandResult;
  passDirection: HeartsState['passDirection'];
  pass: PassMemory;
  unitId: string;
};
/** Coached units are session scoped by the platform; the safe identity carries no session identifier. */
export const heartsUnitId = (_id: string, handNumber: number): string => `hand:${handNumber}`;
export function observeHearts(state: HeartsState, seat: Seat): HeartsActorObservation {
  assertSeat(seat);
  return {
    moduleVersion: '2.0.0',
    observationSchemaVersion: '2.0.0',
    ruleProfileId: state.ruleProfileId,
    featureVersion: '1.0.0',
    seat,
    phase: state.phase,
    hand: [...state.hands[seat]],
    handCounts: [state.hands[0].length, state.hands[1].length, state.hands[2].length, state.hands[3].length],
    tricks: [...state.tricks],
    scores: [...state.scores],
    trick: state.trick.map(copyHeartsPlay),
    history: copyHeartsHistory(state.history),
    turn: state.phase === 'pass' ? null : state.turn,
    dealer: state.dealer,
    handNumber: state.handNumber,
    heartsBroken: state.heartsBroken,
    events: state.events.map(copyHeartsEvent),
    passDirection: state.passDirection,
    pass: copyHeartsPass(state.passes[seat]),
    unitId: heartsUnitId(state.id, state.handNumber),
    ...(state.handResult ? { handResult: copyHeartsResult(state.handResult) } : {}),
  };
}
export function observeV1Hearts(state: HeartsState, seat: Seat): SeatObservation {
  return toV1HeartsObservation(observeHearts(state, seat));
}
export function heartsObservationActions(input: HeartsActorObservation): HeartsAction[] {
  return heartsActionsFor({ ...input, hand: input.hand }, input.seat);
}
/** Construct only the original player's safe input. No authoritative state or sibling input is needed. */
export function toV1HeartsObservation(input: HeartsActorObservation): SeatObservation {
  const seen = new Set([
    ...input.history.flatMap((trick) => trick.plays.map((play) => play.card)),
    ...input.trick.map((play) => play.card),
  ]);
  const memory: SuitMemory[] = getMemory(input);
  const output: SeatObservation = {
    mode: 'hearts',
    seat: input.seat,
    moduleVersion: '1.0.0',
    ruleProfileId: input.ruleProfileId,
    observationSchemaVersion: '1.0.0',
    featureVersion: '1.0.0',
    phase: input.phase === 'awaiting-deal' ? 'hand-end' : input.phase,
    hand: [...input.hand],
    handSizes: [...input.handCounts],
    bids: heartsFour(() => null),
    tricks: [...input.tricks],
    scores: [...input.scores],
    bags: heartsFour(() => 0),
    trick: input.trick.map(copyHeartsPlay),
    history: copyHeartsHistory(input.history),
    turn: input.turn,
    dealer: input.dealer,
    handNumber: input.handNumber,
    heartsBroken: input.heartsBroken,
    spadesBroken: [...seen].some((card) => cardSuit(card) === 'S'),
    events: input.events.map(copyHeartsEvent),
    passDirection: input.passDirection,
    pass: copyHeartsPass(input.pass),
    legalActions: heartsObservationActions(input),
    memory,
    knownHoldings:
      input.pass.to === null
        ? []
        : input.pass.outgoing
            .filter((card) => !seen.has(card))
            .map((card) => ({ seat: input.pass.to!, card })),
  };
  if (input.handResult)
    output.handResult = {
      points: [...input.handResult.points],
      bags: heartsFour(() => 0),
      ...(input.handResult.winner === undefined ? {} : { winner: input.handResult.winner }),
    };
  assertObservation(output);
  return output;
}
export function publicHeartsObservation(input: HeartsActorObservation): PublicHeartsObservation {
  return {
    hand: [...input.hand],
    handCounts: [...input.handCounts],
    scores: [...input.scores],
    turn: input.turn,
    dealer: input.dealer,
    roundNumber: input.handNumber,
    trick: input.trick.map(copyHeartsPlay),
    history: copyHeartsHistory(input.history),
    heartsBroken: input.heartsBroken,
    passDirection: input.passDirection,
    pass: copyHeartsPass(input.pass),
  };
}
export const heartsObservationCodec: Codec<HeartsActorObservation> = {
  parse(raw) {
    exactObject(
      raw,
      [
        'moduleVersion',
        'observationSchemaVersion',
        'ruleProfileId',
        'featureVersion',
        'seat',
        'phase',
        'hand',
        'handCounts',
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
        'pass',
        'unitId',
      ],
      ['handResult'],
    );
    assertSeat(raw.seat);
    assertSeat(raw.dealer);
    string(raw.unitId);
    if (
      raw.moduleVersion !== '2.0.0' ||
      raw.observationSchemaVersion !== '2.0.0' ||
      raw.featureVersion !== '1.0.0' ||
      raw.ruleProfileId !== 'hearts-training-1.0.0'
    )
      throw new TypeError('Unsupported Hearts observation version.');
    const result: HeartsActorObservation = {
      moduleVersion: raw.moduleVersion,
      observationSchemaVersion: raw.observationSchemaVersion,
      featureVersion: raw.featureVersion,
      ruleProfileId: raw.ruleProfileId,
      seat: raw.seat,
      phase: parsePhase(raw.phase),
      hand: parseCards(raw.hand),
      handCounts: fourValues(raw.handCounts, (value) => parseNumber(value, 0, 13)),
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
      pass: parsePass(raw.pass),
      unitId: raw.unitId,
    };
    if (Object.hasOwn(raw, 'handResult')) result.handResult = parseResult(raw.handResult);
    assertHeartsFirstHandScores(result);
    if (result.hand.length !== result.handCounts[result.seat])
      throw new TypeError('Own hand count mismatch.');
    const plays = [
      ...result.history.flatMap((trick) => trick.plays),
      ...(result.phase === 'trick-end' ? [] : result.trick),
    ];
    const allPublic = plays.map((play) => play.card);
    if (
      new Set([...allPublic, ...result.hand]).size !== allPublic.length + result.hand.length ||
      (result.phase === 'trick-end' && canonical(result.trick) !== canonical(result.history.at(-1)?.plays))
    )
      throw new TypeError('Duplicate public card.');
    if (result.heartsBroken !== allPublic.some((card) => cardSuit(card) === 'H'))
      throw new TypeError('Incorrect Hearts flag.');
    const expectedTricks: Four<number> = [0, 0, 0, 0];
    for (const trick of result.history) expectedTricks[trick.winner]++;
    if (
      canonical(expectedTricks) !== canonical(result.tricks) ||
      result.handCounts.some(
        (count, seat) => count !== 13 - plays.filter((play) => play.seat === seat).length,
      )
    )
      throw new TypeError('Incorrect observed counts.');
    if (
      result.passDirection !== (['left', 'right', 'across', 'hold'] as const)[(result.handNumber - 1) % 4] ||
      result.unitId !== `hand:${result.handNumber}`
    )
      throw new TypeError('Incorrect observed round.');
    const complete = result.history.length === 13;
    if (
      complete !== !!result.handResult ||
      (complete && (result.phase === 'play' || result.phase === 'pass')) ||
      (['hand-end', 'match-end', 'awaiting-deal'].includes(result.phase) &&
        (!complete || result.trick.length))
    )
      throw new TypeError('Incorrect observed hand boundary.');
    if (
      result.handResult &&
      (canonical(result.handResult.points) !== canonical(scoreHearts(result.history)) ||
        result.handResult.winner !== matchHeartsWinner(result.scores))
    )
      throw new TypeError('Incorrect observed hand result.');
    if (
      (result.phase === 'match-end') !==
      (!!result.handResult && result.phase !== 'trick-end' && result.handResult.winner !== undefined)
    )
      throw new TypeError('Incorrect observed match boundary.');
    if (result.phase === 'pass' || result.passDirection === 'hold') {
      if (
        result.pass.to !== null ||
        (result.phase === 'pass' && (result.passDirection === 'hold' || plays.length || result.turn !== null))
      )
        throw new TypeError('Incorrect observed pass phase.');
    } else {
      const offset = { left: 1, right: 3, across: 2 }[result.passDirection];
      const to = ([0, 1, 2, 3] as const)[(result.seat + offset) % 4],
        from = ([0, 1, 2, 3] as const)[(result.seat + 4 - offset) % 4];
      const ownOpening = [
        ...result.hand,
        ...plays.filter((play) => play.seat === result.seat).map((play) => play.card),
      ];
      if (
        result.pass.to !== to ||
        result.pass.from !== from ||
        result.pass.incoming.some((card) => !ownOpening.includes(card)) ||
        result.pass.outgoing.some(
          (card) => ownOpening.includes(card) || plays.some((play) => play.card === card && play.seat !== to),
        )
      )
        throw new TypeError('Incorrect observed pass ownership.');
    }
    // The retained V1 strategic boundary also checks legal actions and exact public suit memory.
    toV1HeartsObservation(result);
    return result;
  },
  encode(value) {
    return json(this.parse(json(value)));
  },
};
