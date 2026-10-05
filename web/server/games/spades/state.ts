import Ajv2020 from 'ajv/dist/2020.js';
import schema from './schema.json' with { type: 'json' };
import { canonical, json } from '../../game/kernel/codec.ts';
import type { Codec } from '../../game/kernel/module.ts';
import { SEATS, type Seat } from '../../game/kernel/seats.ts';
import type { Card, Four, HandResult, PassMemory, Play, Trick } from '../../game/kernel/types.ts';
import { spadesActionsFor, spadesMatchWinner, spadesTrickWinner } from './rules.ts';
import { scoreCompetitor } from '../../game/spades/score.ts';

export type SpadesVariant = 'solo' | 'partners';
export type SpadesMode = 'spades-solo' | 'spades-partners';
export type SpadesPhase = 'bid' | 'play' | 'trick-end' | 'hand-end' | 'match-end';
export type SpadesAction =
  { kind: 'bid'; seat: Seat; bid: number } | { kind: 'play'; seat: Seat; card: Card };
export type SpadesEvent = {
  id: number;
  type: 'hand-started' | 'bid-placed' | 'card-played' | 'trick-resolved' | 'trick-collected' | 'hand-scored';
  message: string;
  seat?: Seat;
  card?: Card;
  bid?: number;
};
export const SPADES_RULE_PROFILES = {
  'spades-solo': 'spades-solo-training-1.0.0',
  'spades-partners': 'spades-training-1.0.0',
} as const;
export type SpadesState = {
  id: string;
  mode: SpadesMode;
  moduleVersion: '2.0.0';
  stateSchemaVersion: '2.0.0';
  ruleProfileId: string;
  eventSchemaVersion: '2.0.0';
  phase: SpadesPhase;
  hands: Four<Card[]>;
  bids: Four<number | null>;
  tricks: Four<number>;
  scores: Four<number>;
  bags: Four<number>;
  trick: Play[];
  history: Trick[];
  turn: Seat | null;
  dealer: Seat;
  handNumber: number;
  spadesBroken: boolean;
  events: SpadesEvent[];
  handResult?: HandResult;
  /** Confirmation precedes chance; the finished hand remains available until the deal. */
  awaitingDeal: boolean;
  /** Private historical round-trip data; never used for Spades rules or native observations. */
  compatibility: {
    heartsBroken: boolean;
    passDirection: 'left' | 'right' | 'across' | 'hold';
    passes: Four<PassMemory>;
  };
};
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(schema);
const validateState = ajv.compile<SpadesState>({ $ref: `${schema.$id}#/$defs/SpadesState` });
const validateEvent = ajv.compile<SpadesEvent>({ $ref: `${schema.$id}#/$defs/SpadesEvent` });

export function assertSpadesEvent(raw: unknown): asserts raw is SpadesEvent {
  json(raw);
  if (!validateEvent(raw)) throw new TypeError('Invalid Spades event.');
  const seatRequired = ['bid-placed', 'card-played', 'trick-resolved'].includes(raw.type);
  if (
    (raw.seat !== undefined) !== seatRequired ||
    (raw.card !== undefined) !== (raw.type === 'card-played') ||
    (raw.bid !== undefined) !== (raw.type === 'bid-placed')
  )
    throw new TypeError('Invalid Spades event details.');
}
/** Reconstruct the original private hands and prove each saved play was legal when made. */
function assertLegalPlayHistory(state: SpadesState, plays: Play[]): void {
  const hands = state.hands.map((hand, seat) => [
    ...hand,
    ...plays.filter((play) => play.seat === seat).map((play) => play.card),
  ]);
  let broken = false;
  let leader: Seat = ((state.dealer + 1) % 4) as Seat;
  const tricks = [
    ...state.history.map((trick) => trick.plays),
    ...(state.phase === 'trick-end' || !state.trick.length ? [] : [state.trick]),
  ];
  for (const trick of tricks) {
    const current: Play[] = [];
    for (const played of trick) {
      const actor = ((leader + current.length) % 4) as Seat;
      if (
        played.seat !== actor ||
        !spadesActionsFor(
          { phase: 'play', turn: actor, hand: hands[actor], trick: current, spadesBroken: broken },
          actor,
        ).some((action) => action.kind === 'play' && action.card === played.card)
      )
        throw new TypeError('Illegal play in Spades history.');
      hands[actor] = hands[actor].filter((card) => card !== played.card);
      current.push(played);
      if (played.card.startsWith('S')) broken = true;
    }
    if (current.length === 4) leader = spadesTrickWinner(current);
  }
  if (broken !== state.spadesBroken) throw new TypeError('Spades broken flag mismatch.');
}
/** The prior bag remainder is uniquely recoverable from this round's earned bags. */
function assertScoredResult(state: SpadesState): void {
  if (!state.handResult) {
    if (
      state.handNumber === 1 &&
      (state.scores.some((score) => score !== 0) || state.bags.some((bags) => bags !== 0))
    )
      throw new TypeError('Spades first hand must begin with zero scores and bags.');
    return;
  }
  const groups: readonly (readonly Seat[])[] =
    state.mode === 'spades-partners'
      ? [
          [0, 2],
          [1, 3],
        ]
      : SEATS.map((seat) => [seat]);
  for (const group of groups) {
    const bids = group.map((seat) => {
      const bid = state.bids[seat];
      if (bid === null) throw new TypeError('Missing scored Spades bid.');
      return bid;
    });
    const tricks = group.map((seat) => state.tricks[seat]);
    const contract = bids.reduce((sum, bid) => sum + bid, 0);
    const credit = bids.reduce((sum, bid, index) => sum + (bid === 0 ? 0 : tricks[index]), 0);
    const failedNilTricks = bids.reduce((sum, bid, index) => sum + (bid === 0 ? tricks[index] : 0), 0);
    const earnedBags = Math.max(0, credit - contract) + failedNilTricks;
    const previousBags = state.handNumber === 1 ? 0 : (((state.bags[group[0]] - earnedBags) % 10) + 10) % 10;
    const scored = scoreCompetitor({ bids, tricks, oldBags: previousBags });
    for (const seat of group) {
      if (
        state.handResult.points[seat] !== scored.delta ||
        state.bags[seat] !== scored.bags ||
        state.handResult.bags[seat] !== scored.bags
      )
        throw new TypeError('Spades hand score mismatch.');
      if (state.handNumber === 1 && state.scores[seat] !== scored.delta)
        throw new TypeError('Spades first-hand cumulative score mismatch.');
      if (!Number.isSafeInteger(state.scores[seat] - scored.delta))
        throw new TypeError('Unsafe prior Spades score.');
    }
  }
  const winner = spadesMatchWinner(state.mode, state.scores);
  if (state.handResult.winner !== winner) throw new TypeError('Spades match winner mismatch.');
  if (state.phase !== 'trick-end' && state.phase !== (winner === undefined ? 'hand-end' : 'match-end'))
    throw new TypeError('Spades scored phase mismatch.');
}
export function assertSpadesState(raw: unknown): asserts raw is SpadesState {
  json(raw);
  if (!validateState(raw)) throw new TypeError('Invalid Spades state.');
  if (
    ![
      raw.handNumber,
      ...raw.scores,
      ...raw.events.map((event) => event.id),
      ...(raw.handResult?.points ?? []),
    ].every(Number.isSafeInteger)
  )
    throw new TypeError('Unsafe Spades numeric value.');
  if (raw.ruleProfileId !== SPADES_RULE_PROFILES[raw.mode]) throw new TypeError('Unsupported Spades rules.');
  if (raw.awaitingDeal && raw.phase !== 'hand-end') throw new TypeError('Unexpected pending deal.');
  if (raw.phase === 'trick-end') {
    if (raw.trick.length !== 4 || canonical(raw.trick) !== canonical(raw.history.at(-1)?.plays))
      throw new TypeError('Completed Spades trick mismatch.');
  } else if (raw.trick.length > 3 || (raw.phase !== 'play' && raw.trick.length)) {
    throw new TypeError('Unexpected Spades trick.');
  }
  const plays = [
    ...raw.history.flatMap((trick) => trick.plays),
    ...(raw.phase === 'trick-end' ? [] : raw.trick),
  ];
  const allCards = [...raw.hands.flat(), ...plays.map((play) => play.card)];
  if (allCards.length !== 52 || new Set(allCards).size !== 52)
    throw new TypeError('Spades card conservation failed.');
  for (const seat of SEATS) {
    if (raw.hands[seat].length + plays.filter((play) => play.seat === seat).length !== 13)
      throw new TypeError('Spades seat card count mismatch.');
    if (raw.tricks[seat] !== raw.history.filter((trick) => trick.winner === seat).length)
      throw new TypeError('Spades trick count mismatch.');
  }
  for (const trick of raw.history) {
    if (
      new Set(trick.plays.map((play) => play.seat)).size !== 4 ||
      spadesTrickWinner(trick.plays) !== trick.winner
    )
      throw new TypeError('Spades trick winner mismatch.');
  }
  let leader: Seat = ((raw.dealer + 1) % 4) as Seat;
  for (const trick of raw.history) {
    if (trick.plays.some((play, index) => play.seat !== (leader + index) % 4))
      throw new TypeError('Spades history turn order mismatch.');
    leader = trick.winner;
  }
  if (raw.phase !== 'trick-end' && raw.trick.some((play, index) => play.seat !== (leader + index) % 4))
    throw new TypeError('Spades current trick turn order mismatch.');
  assertLegalPlayHistory(raw, plays);
  if (new Set(raw.trick.map((play) => play.seat)).size !== raw.trick.length)
    throw new TypeError('Duplicate Spades trick actor.');
  if (raw.phase !== 'bid' && raw.bids.some((bid) => bid === null))
    throw new TypeError('Missing Spades bids.');
  if (raw.turn === null) throw new TypeError('Spades requires a current actor or last trick winner.');
  if (raw.phase === 'bid') {
    if (raw.history.length || raw.bids.every((bid) => bid !== null) || raw.bids[raw.turn] !== null)
      throw new TypeError('Invalid Spades bidding phase.');
    const count = raw.bids.filter((bid) => bid !== null).length;
    if (
      raw.turn !== (raw.dealer + 1 + count) % 4 ||
      SEATS.some((offset) => (raw.bids[(raw.dealer + 1 + offset) % 4] !== null) !== offset < count)
    )
      throw new TypeError('Spades bid order mismatch.');
  } else if (raw.turn !== (raw.phase === 'play' ? (leader + raw.trick.length) % 4 : leader)) {
    throw new TypeError('Spades turn mismatch.');
  }
  if ((raw.handResult !== undefined) !== (raw.history.length === 13))
    throw new TypeError('Spades score boundary mismatch.');
  if (raw.history.length === 13 && (raw.phase === 'bid' || raw.phase === 'play'))
    throw new TypeError('Completed Spades hand still accepting actions.');
  if (raw.handResult && canonical(raw.handResult.bags) !== canonical(raw.bags))
    throw new TypeError('Spades scored bags mismatch.');
  if ((raw.phase === 'hand-end' || raw.phase === 'match-end') && !raw.handResult)
    throw new TypeError('Unscored Spades hand.');
  if (raw.phase === 'hand-end' && raw.handResult?.winner !== undefined)
    throw new TypeError('Completed Spades match cannot redeal.');
  if (raw.phase === 'match-end' && raw.handResult?.winner === undefined)
    throw new TypeError('Spades match winner is missing.');
  if (
    raw.mode === 'spades-partners' &&
    (raw.scores[0] !== raw.scores[2] ||
      raw.scores[1] !== raw.scores[3] ||
      raw.bags[0] !== raw.bags[2] ||
      raw.bags[1] !== raw.bags[3])
  )
    throw new TypeError('Spades partnership score mismatch.');
  assertScoredResult(raw);
  raw.events.forEach((event, index) => {
    assertSpadesEvent(event);
    if (event.id !== index + 1) throw new TypeError('Spades event order mismatch.');
  });
}
export const spadesStateCodec: Codec<SpadesState> = {
  parse(raw) {
    assertSpadesState(raw);
    return structuredClone(raw);
  },
  encode(value) {
    assertSpadesState(value);
    return json(value);
  },
};
export const spadesEventCodec: Codec<SpadesEvent> = {
  parse(raw) {
    assertSpadesEvent(raw);
    return structuredClone(raw);
  },
  encode(value) {
    assertSpadesEvent(value);
    return json(value);
  },
};
export { fromV1Spades, toV1Spades, projectV1SpadesState, renderV1SpadesState } from './compatibility.ts';
