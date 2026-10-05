import type { LegacyPrivateGame } from '../../game/legacy/v1.ts';
import type { Four, GameEvent, HandResult, PassMemory, Play } from '../../game/legacy/types.ts';
import { json, object } from '../../game/kernel/codec.ts';
import { assertSpadesState, type SpadesEvent, type SpadesState } from './state.ts';

const tuple = <T, R>(values: Four<T>, project: (value: T) => R): Four<R> => [
  project(values[0]),
  project(values[1]),
  project(values[2]),
  project(values[3]),
];
const play = (value: Play): Play => ({ seat: value.seat, card: value.card });
const pass = (value: PassMemory): PassMemory => ({
  outgoing: [...value.outgoing],
  incoming: [...value.incoming],
  to: value.to,
  from: value.from,
});
const result = (value: HandResult): HandResult => ({
  points: [...value.points],
  bags: [...value.bags],
  ...(value.winner === undefined ? {} : { winner: value.winner }),
});
function event(value: GameEvent): SpadesEvent {
  if (value.type === 'cards-passed' || value.type === 'moon-shot')
    throw new TypeError('Expected a Spades event.');
  return {
    id: value.id,
    type: value.type,
    message: value.message,
    ...(value.seat === undefined ? {} : { seat: value.seat }),
    ...(value.card === undefined ? {} : { card: value.card }),
    ...(value.bid === undefined ? {} : { bid: value.bid }),
  };
}
/** Trusted low-level V1 facade only: explicit projection, without full-state semantic validation. */
export function projectV1SpadesState(state: LegacyPrivateGame): SpadesState {
  if ((state.mode !== 'spades-solo' && state.mode !== 'spades-partners') || state.phase === 'pass')
    throw new TypeError('Expected legacy Spades.');
  if (state.moduleVersion !== '1.0.0' || state.eventSchemaVersion !== '1.0.0')
    throw new TypeError('Unsupported legacy Spades version.');
  return {
    id: state.id,
    mode: state.mode,
    moduleVersion: '2.0.0',
    stateSchemaVersion: '2.0.0',
    ruleProfileId: state.ruleProfileId,
    eventSchemaVersion: '2.0.0',
    phase: state.phase,
    hands: tuple(state.hands, (hand) => [...hand]),
    bids: [...state.bids],
    tricks: [...state.tricks],
    scores: [...state.scores],
    bags: [...state.bags],
    trick: state.trick.map(play),
    history: state.history.map((trick) => ({ plays: trick.plays.map(play), winner: trick.winner })),
    turn: state.turn,
    dealer: state.dealer,
    handNumber: state.handNumber,
    spadesBroken: state.spadesBroken,
    events: state.events.map(event),
    ...(state.handResult === undefined ? {} : { handResult: result(state.handResult) }),
    awaitingDeal: false,
    compatibility: {
      heartsBroken: state.heartsBroken,
      passDirection: state.passDirection,
      passes: tuple(state.passes, pass),
    },
  };
}
/** Trusted low-level V1 facade only. Saved payloads must go through toV1Spades/stateCodec. */
export function renderV1SpadesState(state: SpadesState): LegacyPrivateGame {
  return {
    id: state.id,
    mode: state.mode,
    moduleVersion: '1.0.0',
    ruleProfileId: state.ruleProfileId,
    eventSchemaVersion: '1.0.0',
    phase: state.phase,
    hands: tuple(state.hands, (hand) => [...hand]),
    bids: [...state.bids],
    tricks: [...state.tricks],
    scores: [...state.scores],
    bags: [...state.bags],
    trick: state.trick.map(play),
    history: state.history.map((trick) => ({ plays: trick.plays.map(play), winner: trick.winner })),
    turn: state.turn,
    dealer: state.dealer,
    handNumber: state.handNumber,
    heartsBroken: state.compatibility.heartsBroken,
    spadesBroken: state.spadesBroken,
    events: state.events.map(event),
    ...(state.handResult === undefined ? {} : { handResult: result(state.handResult) }),
    passDirection: state.compatibility.passDirection,
    passes: tuple(state.compatibility.passes, pass),
  };
}
/** Strict lossless conversion for decoded historical states and registered modules. */
export function fromV1Spades(state: LegacyPrivateGame): SpadesState {
  json(state);
  object(state, [
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
    ...(Object.hasOwn(state, 'handResult') ? ['handResult'] : []),
  ]);
  // Validate the original nested objects too: trusted projections intentionally omit extra fields.
  const { heartsBroken, passDirection, passes, ...legacy } = structuredClone(state);
  const raw = {
    ...legacy,
    moduleVersion: '2.0.0',
    stateSchemaVersion: '2.0.0',
    eventSchemaVersion: '2.0.0',
    awaitingDeal: false,
    compatibility: { heartsBroken, passDirection, passes },
  };
  if (
    (state.mode !== 'spades-solo' && state.mode !== 'spades-partners') ||
    state.phase === 'pass' ||
    state.moduleVersion !== '1.0.0' ||
    state.eventSchemaVersion !== '1.0.0'
  )
    throw new TypeError('Unsupported legacy Spades identity.');
  assertSpadesState(raw);
  return raw;
}
export function toV1Spades(state: SpadesState): LegacyPrivateGame {
  assertSpadesState(state);
  return renderV1SpadesState(state);
}
