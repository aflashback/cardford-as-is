import type { SpadesObservation as SpadesPublicObservation } from '../../../shared/contracts.ts';
import { assertContract } from '../../../shared/validation.ts';
import { cardSuit } from '../../game/cards.ts';
import { array, json, object } from '../../game/kernel/codec.ts';
import type { Codec } from '../../game/kernel/module.ts';
import { assertSeat, type Seat } from '../../game/kernel/seats.ts';
import type { HandResult, Play } from '../../game/kernel/types.ts';
import { assertObservation } from '../../game/legacy/observation.ts';
import type { SeatObservation, SuitMemory } from '../../observations/types.ts';
import {
  assertSpadesEvent,
  type SpadesEvent,
  type SpadesPhase,
  type SpadesState,
  type SpadesVariant,
  SPADES_RULE_PROFILES,
} from './state.ts';
import { spadesActionsFor } from './rules.ts';

/** Game-owned safe input. No aggregate, compatibility metadata or other hands. */
export type SpadesObservation = {
  observationSchemaVersion: '2.0.0';
  variantId: SpadesVariant;
  seat: Seat;
  phase: SpadesPhase | 'deal';
  table: SpadesPublicObservation;
  events: SpadesEvent[];
  handResult?: HandResult;
};
const play = (value: Play): Play => ({ seat: value.seat, card: value.card });
function projectEvent(event: SpadesEvent): SpadesEvent {
  const value: SpadesEvent = { id: event.id, type: event.type, message: event.message };
  if (event.seat !== undefined) value.seat = event.seat;
  if (event.card !== undefined) value.card = event.card;
  if (event.bid !== undefined) value.bid = event.bid;
  return value;
}
export function observeSpades(state: SpadesState, seat: Seat): SpadesObservation {
  assertSeat(seat);
  const observation: SpadesObservation = {
    observationSchemaVersion: '2.0.0',
    variantId: state.mode === 'spades-solo' ? 'solo' : 'partners',
    seat,
    phase: state.awaitingDeal ? 'deal' : state.phase,
    table: {
      hand: [...state.hands[seat]],
      handCounts: state.hands.map((hand) => hand.length),
      scores: [...state.scores],
      turn: state.turn,
      dealer: state.dealer,
      roundNumber: state.handNumber,
      trick: state.trick.map(play),
      history: state.history.map((trick) => ({ plays: trick.plays.map(play), winner: trick.winner })),
      spadesBroken: state.spadesBroken,
      bids: [...state.bids],
      tricks: [...state.tricks],
      bags: [...state.bags],
    },
    events: state.events.map(projectEvent),
  };
  if (state.handResult)
    observation.handResult = {
      points: [...state.handResult.points],
      bags: [...state.handResult.bags],
      ...(state.handResult.winner === undefined ? {} : { winner: state.handResult.winner }),
    };
  return observation;
}
function memoryFor(table: SpadesPublicObservation): SuitMemory[] {
  const suits = ['C', 'D', 'H', 'S'] as const;
  const seen = new Set<string>();
  const voids = new Map(suits.map((suit) => [suit, new Set<Seat>()]));
  for (const trick of [...table.history.map((item) => item.plays), table.trick]) {
    if (!trick.length) continue;
    const led = cardSuit(trick[0].card);
    for (const item of trick) {
      seen.add(item.card);
      if (cardSuit(item.card) !== led) voids.get(led)!.add(item.seat);
    }
  }
  return suits.map((suit) => {
    const played = [...seen].filter((card) => cardSuit(card) === suit).length;
    return { suit, played, remaining: 13 - played, voidSeats: [...voids.get(suit)!].sort() };
  });
}
/** Compatibility policy projection accepts only a validated single-seat native input. */
export function originalSpadesObservation(input: SpadesObservation): SeatObservation {
  assertSpadesObservation(input);
  return originalFromChecked(input);
}
function originalFromChecked(input: SpadesObservation): SeatObservation {
  const { table, seat } = input;
  const mode = input.variantId === 'solo' ? 'spades-solo' : 'spades-partners';
  const phase = input.phase === 'deal' ? 'hand-end' : input.phase;
  const result: SeatObservation = {
    mode,
    seat,
    moduleVersion: '1.0.0',
    ruleProfileId: SPADES_RULE_PROFILES[mode],
    observationSchemaVersion: '1.0.0',
    featureVersion: '1.0.0',
    phase,
    hand: [...table.hand],
    handSizes: [...table.handCounts],
    bids: [...table.bids],
    tricks: [...table.tricks],
    scores: [...table.scores],
    bags: [...table.bags],
    trick: table.trick.map(play),
    history: table.history.map((trick) => ({ plays: trick.plays.map(play), winner: trick.winner })),
    turn: table.turn,
    dealer: table.dealer,
    handNumber: table.roundNumber,
    heartsBroken: [...table.history.flatMap((trick) => trick.plays), ...table.trick].some(
      (item) => cardSuit(item.card) === 'H',
    ),
    spadesBroken: table.spadesBroken,
    events: input.events.map(projectEvent),
    passDirection: (['left', 'right', 'across', 'hold'] as const)[(table.roundNumber - 1) % 4],
    pass: { outgoing: [], incoming: [], to: null, from: null },
    legalActions: spadesActionsFor(
      {
        phase,
        turn: table.turn,
        hand: [...table.hand],
        trick: table.trick.map(play),
        spadesBroken: table.spadesBroken,
      },
      seat,
    ),
    memory: memoryFor(table),
    knownHoldings: [],
  };
  if (input.handResult) result.handResult = structuredClone(input.handResult);
  return result;
}
/** Oracle-facing V1 projection preserves the exact original seat-visible shape. */
export function observeV1Spades(state: SpadesState, seat: Seat): SeatObservation {
  // Typed V1 callers may supply partial fixtures. Public fields are still allowlisted here;
  // policy entry points validate the reconstructed safe input independently.
  const result = originalFromChecked(observeSpades(state, seat));
  // These public historical flags are retained only here, outside policy inputs.
  result.heartsBroken = state.compatibility.heartsBroken;
  result.passDirection = state.compatibility.passDirection;
  return result;
}
export function assertSpadesObservation(raw: unknown): asserts raw is SpadesObservation {
  json(raw);
  if (raw === null || typeof raw !== 'object') throw new TypeError('Invalid Spades observation.');
  object(raw, [
    'observationSchemaVersion',
    'variantId',
    'seat',
    'phase',
    'table',
    'events',
    ...(Object.hasOwn(raw, 'handResult') ? ['handResult'] : []),
  ]);
  if (raw.observationSchemaVersion !== '2.0.0' || (raw.variantId !== 'solo' && raw.variantId !== 'partners'))
    throw new TypeError('Unsupported Spades observation.');
  assertSeat(raw.seat);
  if (
    raw.phase !== 'bid' &&
    raw.phase !== 'play' &&
    raw.phase !== 'trick-end' &&
    raw.phase !== 'hand-end' &&
    raw.phase !== 'match-end' &&
    raw.phase !== 'deal'
  )
    throw new TypeError('Unsupported Spades phase.');
  assertContract('SpadesObservation', raw.table);
  array(raw.events);
  const events = raw.events.map((event) => {
    assertSpadesEvent(event);
    return event;
  });
  if (raw.handResult !== undefined) assertContract('HandResult', raw.handResult);
  const checked: SpadesObservation = {
    observationSchemaVersion: raw.observationSchemaVersion,
    variantId: raw.variantId,
    seat: raw.seat,
    phase: raw.phase,
    table: raw.table,
    events,
    ...(raw.handResult === undefined ? {} : { handResult: raw.handResult }),
  };
  // Reuse the frozen strict safe-input checks without trusting a native aggregate.
  assertObservation(originalFromChecked(checked));
}
export const spadesObservationCodec: Codec<SpadesObservation> = {
  parse(raw) {
    assertSpadesObservation(raw);
    return structuredClone(raw);
  },
  encode(value) {
    assertSpadesObservation(value);
    return json(value);
  },
};
