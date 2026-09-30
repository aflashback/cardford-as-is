import { scoreHearts } from '../../../game/hearts/score.ts';
import type { Card, Play, PrivateGame, Seat, Trick } from '../../../game/kernel/types.ts';

/**
 * GP-06: compact Hearts play-phase state for bounded playouts. It mirrors the frozen
 * rule profile's legality and trick resolution; scoring always calls the production
 * scorer. Parity with the production engine is asserted in tests, never assumed.
 * The sealed pass is not modelled: a world always starts at or after the opening lead.
 */
export const HEARTS_KERNEL_VERSION = 'hearts-kernel-1.0.0';

const SUIT_LETTERS = ['C', 'D', 'H', 'S'] as const;
const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export const CLUBS = 0;
export const DIAMONDS = 1;
export const HEARTS = 2;
export const SPADES = 3;
export const FULL_SUIT = 0x1fff;
export const QUEEN_BIT = 1 << 10;
export const KING_BIT = 1 << 11;
export const ACE_BIT = 1 << 12;
export const TWO_OF_CLUBS = 0;
export const QUEEN_OF_SPADES = SPADES * 13 + 10;
/** Points carried by one hand before the all-points reversal is applied by the scorer. */
export const HAND_POINTS = 26;
const QUEEN_POINTS = 13;
const NOT_HEARTS = (1 << CLUBS) | (1 << DIAMONDS) | (1 << SPADES);
const FIRST_TRICK_SAFE_SIDE = (1 << CLUBS) | (1 << DIAMONDS);
export const PHASE_PLAY = 1;
export const PHASE_DONE = 2;

export type HeartsWorld = {
  /** hands[seat * 4 + suit] is a 13-bit mask; bit r is rank r + 2. */
  hands: Uint16Array;
  /** Match score of each seat at the start of this hand. */
  scores: Int32Array;
  /** Public: points captured by each seat in completed tricks of this hand, before any reversal. */
  points: Uint8Array;
  /** Public: rank masks of the hearts each seat has captured. */
  heartsTaken: Uint16Array;
  /** Public: seat that captured the queen of spades, or -1. */
  queenTaker: number;
  phase: number;
  turn: number;
  leader: number;
  trickLen: number;
  trickSeat: Int8Array;
  trickCard: Int8Array;
  ledSuit: number;
  winPos: number;
  heartsBroken: boolean;
  completed: number;
  /** Public: rank masks already played in each suit, including the current trick. */
  played: Uint16Array;
  /** Public: bitmask of suits each seat is known not to hold. */
  voids: Uint8Array;
  /** Seat whose stance may be fixed for the rest of the round, or -1. Never read for another seat. */
  focal: number;
  /** 0 follows the stance derived from exact facts; otherwise a fixed intent for the focal seat. */
  focalIntent: number;
};

export const cardIndex = (card: Card): number => {
  const suit = SUIT_LETTERS.indexOf(card[0] as (typeof SUIT_LETTERS)[number]);
  const rank = RANK_LABELS.indexOf(card.slice(1) as (typeof RANK_LABELS)[number]);
  if (suit < 0 || rank < 0) throw new Error('Invalid card.');
  return suit * 13 + rank;
};
export const cardName = (index: number): Card => {
  if (!Number.isInteger(index) || index < 0 || index > 51) throw new Error('Invalid card index.');
  return `${SUIT_LETTERS[Math.floor(index / 13)]}${RANK_LABELS[index % 13]}`;
};
export const suitOf = (card: number) => (card / 13) | 0;
export const rankOf = (card: number) => card % 13;
export const highestRank = (mask: number) => 31 - Math.clz32(mask);
export const lowestRank = (mask: number) => 31 - Math.clz32(mask & -mask);
export const popcount = (mask: number) => {
  let count = 0;
  for (let rest = mask; rest; rest &= rest - 1) count++;
  return count;
};
/** Points a single card carries when captured. */
export const pointsOf = (card: number) =>
  card === QUEEN_OF_SPADES ? QUEEN_POINTS : suitOf(card) === HEARTS ? 1 : 0;

export function emptyWorld(): HeartsWorld {
  return {
    hands: new Uint16Array(16),
    scores: new Int32Array(4),
    points: new Uint8Array(4),
    heartsTaken: new Uint16Array(4),
    queenTaker: -1,
    phase: PHASE_PLAY,
    turn: 0,
    leader: 0,
    trickLen: 0,
    trickSeat: new Int8Array(4).fill(-1),
    trickCard: new Int8Array(4).fill(-1),
    ledSuit: -1,
    winPos: -1,
    heartsBroken: false,
    completed: 0,
    played: new Uint16Array(4),
    voids: new Uint8Array(4),
    focal: -1,
    focalIntent: 0,
  };
}

export function copyWorld(target: HeartsWorld, source: HeartsWorld): HeartsWorld {
  target.hands.set(source.hands);
  target.scores.set(source.scores);
  target.points.set(source.points);
  target.heartsTaken.set(source.heartsTaken);
  target.queenTaker = source.queenTaker;
  target.phase = source.phase;
  target.turn = source.turn;
  target.leader = source.leader;
  target.trickLen = source.trickLen;
  target.trickSeat.set(source.trickSeat);
  target.trickCard.set(source.trickCard);
  target.ledSuit = source.ledSuit;
  target.winPos = source.winPos;
  target.heartsBroken = source.heartsBroken;
  target.completed = source.completed;
  target.played.set(source.played);
  target.voids.set(source.voids);
  target.focal = source.focal;
  target.focalIntent = source.focalIntent;
  return target;
}
export const cloneWorld = (source: HeartsWorld): HeartsWorld => copyWorld(emptyWorld(), source);

/** Points lying in the trick in progress. */
export function trickPoints(world: HeartsWorld): number {
  let total = 0;
  for (let index = 0; index < world.trickLen; index++) total += pointsOf(world.trickCard[index]);
  return total;
}

/** Whether this card would become the current winner of the trick in progress. */
export function wouldWin(world: HeartsWorld, card: number): boolean {
  return world.trickLen === 0 || (suitOf(card) === world.ledSuit && card > world.trickCard[world.winPos]);
}

/** Writes the legal moves for the acting seat into `out` and returns their count. */
export function legalMoves(world: HeartsWorld, out: number[]): number {
  if (world.phase !== PHASE_PLAY) return 0;
  let count = 0;
  const base = world.turn * 4;
  const push = (suit: number, cards: number) => {
    let mask = cards;
    while (mask) {
      const bit = mask & -mask;
      out[count++] = suit * 13 + (31 - Math.clz32(bit));
      mask ^= bit;
    }
  };
  const clubs = world.hands[base + CLUBS],
    diamonds = world.hands[base + DIAMONDS],
    hearts = world.hands[base + HEARTS],
    spades = world.hands[base + SPADES];
  if (world.trickLen > 0) {
    const following = world.hands[base + world.ledSuit];
    if (following) {
      push(world.ledSuit, following);
      return count;
    }
    if (world.completed === 0) {
      // First trick: no point card may be discarded while a safe card is held.
      const safeSpades = spades & ~QUEEN_BIT;
      if (clubs | diamonds | safeSpades) {
        push(CLUBS, clubs);
        push(DIAMONDS, diamonds);
        push(SPADES, safeSpades);
        return count;
      }
    }
    push(CLUBS, clubs);
    push(DIAMONDS, diamonds);
    push(HEARTS, hearts);
    push(SPADES, spades);
    return count;
  }
  if (world.completed === 0) {
    // The opening lead is the two of clubs and nothing else.
    if (clubs & 1) out[count++] = TWO_OF_CLUBS;
    return count;
  }
  push(CLUBS, clubs);
  push(DIAMONDS, diamonds);
  if (world.heartsBroken || !(clubs | diamonds | spades)) push(HEARTS, hearts);
  push(SPADES, spades);
  return count;
}

export function applyMove(world: HeartsWorld, move: number): void {
  if (world.phase !== PHASE_PLAY) throw new Error('The playout hand is complete.');
  if (!Number.isInteger(move) || move < 0 || move > 51) throw new Error('Invalid playout card.');
  const seat = world.turn;
  const suit = suitOf(move),
    bit = 1 << rankOf(move);
  if (!(world.hands[seat * 4 + suit] & bit)) throw new Error('Playout card is not in hand.');
  world.hands[seat * 4 + suit] ^= bit;
  world.played[suit] |= bit;
  if (world.trickLen === 0) {
    // Leading a heart before hearts are broken is legal only from an all-heart hand.
    if (suit === HEARTS && !world.heartsBroken) world.voids[seat] |= NOT_HEARTS;
    world.ledSuit = suit;
    world.winPos = 0;
  } else if (suit !== world.ledSuit) {
    world.voids[seat] |= 1 << world.ledSuit;
    // A point card discarded on the first trick shows that no safe card was held.
    if (world.completed === 0 && pointsOf(move) > 0) world.voids[seat] |= FIRST_TRICK_SAFE_SIDE;
  } else if (move > world.trickCard[world.winPos]) world.winPos = world.trickLen;
  if (suit === HEARTS) world.heartsBroken = true;
  world.trickSeat[world.trickLen] = seat;
  world.trickCard[world.trickLen] = move;
  world.trickLen++;
  if (world.trickLen < 4) {
    world.turn = (seat + 1) & 3;
    return;
  }
  const winner = world.trickSeat[world.winPos];
  for (let index = 0; index < 4; index++) {
    const card = world.trickCard[index];
    if (card === QUEEN_OF_SPADES) {
      world.queenTaker = winner;
      world.points[winner] += QUEEN_POINTS;
    } else if (suitOf(card) === HEARTS) {
      world.heartsTaken[winner] |= 1 << rankOf(card);
      world.points[winner]++;
    }
  }
  world.completed++;
  world.trickLen = 0;
  world.ledSuit = -1;
  world.winPos = -1;
  world.leader = winner;
  world.turn = winner;
  if (world.completed === 13) world.phase = PHASE_DONE;
}

export type HandScore = { points: number[]; score: number[] };

/**
 * Exact frozen-profile scoring of a completed playout hand, per seat. The production
 * scorer reads captured cards by trick winner, so it is given each seat's captured
 * point cards; cards without points never change its result.
 */
export function scoreWorld(world: HeartsWorld): HandScore {
  if (world.phase !== PHASE_DONE) throw new Error('Only a completed hand can be scored.');
  const captured: Trick[] = [];
  for (let seat = 0; seat < 4; seat++) {
    const plays: Play[] = [];
    for (let rank = 0; rank < 13; rank++)
      if (world.heartsTaken[seat] & (1 << rank))
        plays.push({ seat: seat as Seat, card: cardName(HEARTS * 13 + rank) });
    if (world.queenTaker === seat) plays.push({ seat: seat as Seat, card: cardName(QUEEN_OF_SPADES) });
    captured.push({ plays, winner: seat as Seat });
  }
  const points = [...scoreHearts(captured)];
  return { points, score: points.map((value, seat) => world.scores[seat] + value) };
}

/** An authoritative, sampled or seat-view engine state at or after the opening lead. */
export type KernelSource = Pick<
  PrivateGame,
  'mode' | 'phase' | 'hands' | 'scores' | 'history' | 'trick' | 'turn' | 'handResult'
>;

/**
 * Converts an engine state by replaying its public plays through `applyMove`, so every
 * derived field (captured points, shown voids, broken hearts) comes from one code path.
 * Hands may be incomplete: a seat view supplies its own cards and leaves the others empty.
 * `onBoundary` is called at the start of the hand (0) and after each completed trick of the replay.
 */
export function worldFromState(
  state: KernelSource,
  onBoundary?: (world: HeartsWorld, completed: number) => void,
): HeartsWorld {
  if (state.mode !== 'hearts') throw new Error('A Hearts state is required.');
  if (state.phase !== 'play' && state.phase !== 'trick-end')
    throw new Error('Playouts start from a playing position; the sealed pass is not modelled.');
  const world = emptyWorld();
  const give = (seat: number, card: Card) => {
    const index = cardIndex(card);
    const bit = 1 << rankOf(index);
    for (let other = 0; other < 4; other++)
      if (world.hands[other * 4 + suitOf(index)] & bit) throw new Error('A card appears twice.');
    world.hands[seat * 4 + suitOf(index)] |= bit;
  };
  // The completed trick shown during `trick-end` is already the last entry of the history.
  const open = state.phase === 'trick-end' ? [] : state.trick;
  const plays = [...state.history.flatMap((trick) => trick.plays), ...open];
  for (let seat = 0; seat < 4; seat++) {
    for (const card of state.hands[seat]) give(seat, card);
    // Once the engine has scored the hand its scores already include it; the world keeps the score before it.
    world.scores[seat] = state.scores[seat] - (state.handResult?.points[seat] ?? 0);
  }
  for (const play of plays) give(play.seat, play.card);
  let first: number | null = plays.length ? plays[0].seat : state.turn;
  if (first === null)
    for (let seat = 0; seat < 4; seat++) if (world.hands[seat * 4 + CLUBS] & 1) first = seat;
  if (first === null) throw new Error('The opening seat is unknown.');
  world.turn = first;
  world.leader = first;
  onBoundary?.(world, 0);
  for (let index = 0; index < plays.length; index++) {
    const play = plays[index];
    if (world.turn !== play.seat) throw new Error('The play history is out of turn order.');
    applyMove(world, cardIndex(play.card));
    if (world.trickLen === 0) {
      if (state.history[world.completed - 1].winner !== world.leader)
        throw new Error('The play history names a different trick winner.');
      onBoundary?.(world, world.completed);
    }
  }
  if (world.phase === PHASE_PLAY && state.turn !== null && state.turn !== world.turn)
    throw new Error('The acting seat does not follow from the play history.');
  return world;
}

export const moveFromAction = (action: { kind: 'play'; card: Card }): number => cardIndex(action.card);
export const actionIdOfMove = (move: number): string => `play:${cardName(move)}`;
