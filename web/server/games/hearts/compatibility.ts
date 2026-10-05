import type { LegacyPrivateGame } from '../../game/legacy/v1.ts';
import { json } from '../../game/kernel/codec.ts';
import type { Four } from '../../game/kernel/types.ts';
import { heartsFour } from './engine.ts';
import { exactObject, heartsStateCodec } from './codec.ts';
import type { HeartsState } from './state.ts';

/** Trusted V1 reducer bridge only. Saved documents must use the strict fromV1Hearts entry point. */
export function projectV1HeartsState(state: LegacyPrivateGame): HeartsState {
  if (state.phase === 'bid') throw new TypeError('Unsupported V1 Hearts phase.');
  const next: HeartsState = {
    id: state.id,
    moduleVersion: '2.0.0',
    stateSchemaVersion: '2.0.0',
    ruleProfileId: 'hearts-training-1.0.0',
    eventSchemaVersion: '2.0.0',
    phase: state.phase,
    hands: structuredClone(state.hands),
    tricks: [...state.tricks],
    scores: [...state.scores],
    trick: structuredClone(state.trick),
    history: structuredClone(state.history),
    turn: state.turn,
    dealer: state.dealer,
    handNumber: state.handNumber,
    heartsBroken: state.heartsBroken,
    events: state.events.map((event) => {
      if (event.type === 'bid-placed') throw new TypeError('Unexpected Hearts bid event.');
      const next = { id: event.id, type: event.type, message: event.message };
      return {
        ...next,
        ...(event.seat === undefined ? {} : { seat: event.seat }),
        ...(event.card === undefined ? {} : { card: event.card }),
      };
    }),
    passDirection: state.passDirection,
    passes: structuredClone(state.passes),
    v1Compatibility: {
      moduleVersion: state.moduleVersion,
      eventSchemaVersion: state.eventSchemaVersion,
      spadesBroken: state.spadesBroken,
    },
  };
  if (state.handResult) {
    next.handResult = {
      points: [
        state.handResult.points[0],
        state.handResult.points[1],
        state.handResult.points[2],
        state.handResult.points[3],
      ],
      ...(state.handResult.winner === undefined ? {} : { winner: state.handResult.winner }),
    };
  }
  return next;
}
/** Allowlisted trusted state conversion; validation belongs to saved/native bound-state boundaries. */
export function projectHeartsStateToV1(checked: HeartsState): LegacyPrivateGame {
  const zero: Four<number> = heartsFour(() => 0);
  return {
    id: checked.id,
    mode: 'hearts',
    moduleVersion: '1.0.0',
    ruleProfileId: checked.ruleProfileId,
    eventSchemaVersion: '1.0.0',
    phase: checked.phase === 'awaiting-deal' ? 'hand-end' : checked.phase,
    hands: structuredClone(checked.hands),
    bids: heartsFour(() => null),
    tricks: [...checked.tricks],
    scores: [...checked.scores],
    bags: [...zero],
    trick: structuredClone(checked.trick),
    history: structuredClone(checked.history),
    turn: checked.turn,
    dealer: checked.dealer,
    handNumber: checked.handNumber,
    heartsBroken: checked.heartsBroken,
    spadesBroken: checked.v1Compatibility.spadesBroken,
    events: structuredClone(checked.events),
    passDirection: checked.passDirection,
    passes: structuredClone(checked.passes),
    ...(checked.handResult
      ? {
          handResult: {
            points: [...checked.handResult.points],
            bags: [...zero],
            ...(checked.handResult.winner === undefined ? {} : { winner: checked.handResult.winner }),
          },
        }
      : {}),
  };
}
/** Exact validated data conversion is explicit; the native Hearts reducer does not delegate to V1. */
export function fromV1Hearts(state: LegacyPrivateGame): HeartsState {
  json(state);
  exactObject(
    state,
    [
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
    ],
    ['handResult'],
  );
  if (
    state.mode !== 'hearts' ||
    state.moduleVersion !== '1.0.0' ||
    state.eventSchemaVersion !== '1.0.0' ||
    state.ruleProfileId !== 'hearts-training-1.0.0' ||
    state.phase === 'bid' ||
    state.bids.length !== 4 ||
    state.bids.some((bid) => bid !== null) ||
    state.bags.length !== 4 ||
    state.bags.some((bag) => bag !== 0) ||
    state.events.some((event) => event.type === 'bid-placed' || event.bid !== undefined)
  )
    throw new TypeError('Unsupported V1 Hearts data.');
  if (
    state.handResult &&
    (state.handResult.bags.length !== 4 ||
      state.handResult.bags.some((bag) => bag !== 0) ||
      state.handResult.points.length !== 4)
  )
    throw new TypeError('Unexpected Hearts hand result.');
  // Retain the original nested data during strict validation. Trusted projections intentionally
  // omit unknown fields, so they cannot validate a saved V1 snapshot without losing evidence.
  const {
    mode: _mode,
    bids: _bids,
    bags: _bags,
    spadesBroken,
    handResult,
    moduleVersion,
    eventSchemaVersion,
    ...hearts
  } = structuredClone(state);
  let result: Omit<NonNullable<LegacyPrivateGame['handResult']>, 'bags'> | undefined;
  if (handResult) {
    const { bags: _resultBags, ...pointsAndWinner } = handResult;
    result = pointsAndWinner;
  }
  return heartsStateCodec.parse(
    json({
      ...hearts,
      moduleVersion: '2.0.0',
      stateSchemaVersion: '2.0.0',
      eventSchemaVersion: '2.0.0',
      v1Compatibility: { moduleVersion, eventSchemaVersion, spadesBroken },
      ...(result === undefined ? {} : { handResult: result }),
    }),
  );
}
export function toV1Hearts(state: HeartsState): LegacyPrivateGame {
  return projectHeartsStateToV1(heartsStateCodec.parse(json(state)));
}
