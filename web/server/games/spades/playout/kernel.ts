import { scoreCompetitor } from '../../../game/spades/score.ts';
import type { Card, PrivateGame, Seat } from '../../../game/kernel/types.ts';

/**
 * SG-02: compact Spades state for bounded playouts. It mirrors the frozen rule
 * profile's legality and trick resolution; scoring always calls the production scorer.
 * Parity with the production engine is asserted in tests, never assumed.
 */
export const SPADES_KERNEL_VERSION = 'spades-kernel-1.0.0';

const SUIT_LETTERS = ['C', 'D', 'H', 'S'] as const;
const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export const TRUMP = 3;
export const FULL_SUIT = 0x1fff;
const SIDE_SUITS = 0b0111;
/** Bid moves are 64 + bid so that they never collide with a card index 0..51. */
export const BID_BASE = 64;
export const PHASE_BID = 0;
export const PHASE_PLAY = 1;
export const PHASE_DONE = 2;

export type SpadesWorld = {
  /** Teammate per seat, or -1 when the seat is scored alone. Supplied from competition data. */
  mate: Int8Array;
  /** hands[seat * 4 + suit] is a 13-bit mask; bit r is rank r + 2. */
  hands: Uint16Array;
  bids: Int8Array;
  tricks: Uint8Array;
  /** Score and bags at the start of this hand, repeated on every seat of a competitor. */
  scores: Int32Array;
  bags: Uint8Array;
  phase: number;
  turn: number;
  leader: number;
  trickLen: number;
  trickSeat: Int8Array;
  trickCard: Int8Array;
  ledSuit: number;
  winPos: number;
  spadesBroken: boolean;
  completed: number;
  /** Public: rank masks already played in each suit, including the current trick. */
  played: Uint16Array;
  /** Public: bitmask of suits each seat has failed to follow. */
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

export function emptyWorld(mate: readonly number[]): SpadesWorld {
  if (mate.length !== 4) throw new Error('Four seats are required.');
  return {
    mate: Int8Array.from(mate),
    hands: new Uint16Array(16),
    bids: new Int8Array(4).fill(-1),
    tricks: new Uint8Array(4),
    scores: new Int32Array(4),
    bags: new Uint8Array(4),
    phase: PHASE_BID,
    turn: 0,
    leader: 0,
    trickLen: 0,
    trickSeat: new Int8Array(4).fill(-1),
    trickCard: new Int8Array(4).fill(-1),
    ledSuit: -1,
    winPos: -1,
    spadesBroken: false,
    completed: 0,
    played: new Uint16Array(4),
    voids: new Uint8Array(4),
    focal: -1,
    focalIntent: 0,
  };
}

export function copyWorld(target: SpadesWorld, source: SpadesWorld): SpadesWorld {
  target.mate.set(source.mate);
  target.hands.set(source.hands);
  target.bids.set(source.bids);
  target.tricks.set(source.tricks);
  target.scores.set(source.scores);
  target.bags.set(source.bags);
  target.phase = source.phase;
  target.turn = source.turn;
  target.leader = source.leader;
  target.trickLen = source.trickLen;
  target.trickSeat.set(source.trickSeat);
  target.trickCard.set(source.trickCard);
  target.ledSuit = source.ledSuit;
  target.winPos = source.winPos;
  target.spadesBroken = source.spadesBroken;
  target.completed = source.completed;
  target.played.set(source.played);
  target.voids.set(source.voids);
  target.focal = source.focal;
  target.focalIntent = source.focalIntent;
  return target;
}
export const cloneWorld = (source: SpadesWorld): SpadesWorld =>
  copyWorld(emptyWorld([...source.mate]), source);

function beats(card: number, winner: number): boolean {
  const suit = suitOf(card),
    winningSuit = suitOf(winner);
  return suit === winningSuit ? card > winner : suit === TRUMP;
}
/** Whether this card would become the current winner of the trick in progress. */
export function wouldWin(world: SpadesWorld, card: number): boolean {
  return world.trickLen === 0 || beats(card, world.trickCard[world.winPos]);
}

/** Writes the legal moves for the acting seat into `out` and returns their count. */
export function legalMoves(world: SpadesWorld, out: number[]): number {
  let count = 0;
  if (world.phase === PHASE_BID) {
    for (let bid = 0; bid <= 13; bid++) out[count++] = BID_BASE + bid;
    return count;
  }
  if (world.phase !== PHASE_PLAY) return 0;
  const base = world.turn * 4;
  const push = (suit: number) => {
    let mask = world.hands[base + suit];
    while (mask) {
      const bit = mask & -mask;
      out[count++] = suit * 13 + (31 - Math.clz32(bit));
      mask ^= bit;
    }
  };
  if (world.trickLen > 0) {
    if (world.hands[base + world.ledSuit]) push(world.ledSuit);
    else for (let suit = 0; suit < 4; suit++) push(suit);
    return count;
  }
  const sideCards = world.hands[base] | world.hands[base + 1] | world.hands[base + 2];
  const spadesAllowed = world.spadesBroken || sideCards === 0;
  for (let suit = 0; suit < 4; suit++) if (suit !== TRUMP || spadesAllowed) push(suit);
  return count;
}

export function applyMove(world: SpadesWorld, move: number): void {
  const seat = world.turn;
  if (world.phase === PHASE_BID) {
    const bid = move - BID_BASE;
    if (bid < 0 || bid > 13 || world.bids[seat] !== -1) throw new Error('Illegal playout bid.');
    world.bids[seat] = bid;
    world.turn = (seat + 1) & 3;
    if (world.bids[world.turn] !== -1) {
      world.phase = PHASE_PLAY;
      world.turn = world.leader;
    }
    return;
  }
  if (world.phase !== PHASE_PLAY) throw new Error('The playout hand is complete.');
  const suit = suitOf(move),
    bit = 1 << rankOf(move);
  if (!(world.hands[seat * 4 + suit] & bit)) throw new Error('Playout card is not in hand.');
  world.hands[seat * 4 + suit] ^= bit;
  world.played[suit] |= bit;
  // Leading trump before it is broken is legal only from an all-trump hand: a public side-suit void.
  if (world.trickLen === 0 && suit === TRUMP && !world.spadesBroken) world.voids[seat] |= SIDE_SUITS;
  if (suit === TRUMP) world.spadesBroken = true;
  if (world.trickLen === 0) {
    world.ledSuit = suit;
    world.winPos = 0;
  } else {
    if (suit !== world.ledSuit) world.voids[seat] |= 1 << world.ledSuit;
    if (beats(move, world.trickCard[world.winPos])) world.winPos = world.trickLen;
  }
  world.trickSeat[world.trickLen] = seat;
  world.trickCard[world.trickLen] = move;
  world.trickLen++;
  if (world.trickLen < 4) {
    world.turn = (seat + 1) & 3;
    return;
  }
  const winner = world.trickSeat[world.winPos];
  world.tricks[winner]++;
  world.completed++;
  world.trickLen = 0;
  world.ledSuit = -1;
  world.winPos = -1;
  world.leader = winner;
  world.turn = winner;
  if (world.completed === 13) world.phase = PHASE_DONE;
}

export type HandScore = { delta: number[]; bags: number[]; score: number[] };

/** Exact frozen-profile scoring of a completed playout hand, per seat. */
export function scoreWorld(world: SpadesWorld): HandScore {
  if (world.phase !== PHASE_DONE) throw new Error('Only a completed hand can be scored.');
  const delta = [0, 0, 0, 0],
    bags = [0, 0, 0, 0],
    score = [0, 0, 0, 0];
  for (let seat = 0; seat < 4; seat++) {
    const mate = world.mate[seat];
    if (mate >= 0 && mate < seat) {
      delta[seat] = delta[mate];
      bags[seat] = bags[mate];
      score[seat] = score[mate];
      continue;
    }
    const members = mate >= 0 ? [seat, mate] : [seat];
    const result = scoreCompetitor({
      bids: members.map((member) => world.bids[member]),
      tricks: members.map((member) => world.tricks[member]),
      oldBags: world.bags[seat],
    });
    delta[seat] = result.delta;
    bags[seat] = result.bags;
    score[seat] = world.scores[seat] + result.delta;
  }
  return { delta, bags, score };
}

/**
 * Converts an authoritative or sampled engine state. `mate` comes from the mode's
 * declared competition, never from seat arithmetic here.
 */
export type KernelSource = Pick<
  PrivateGame,
  'mode' | 'phase' | 'hands' | 'bids' | 'tricks' | 'scores' | 'bags' | 'dealer' | 'history' | 'trick' | 'turn'
>;

export function worldFromState(state: KernelSource, mate: readonly number[]): SpadesWorld {
  if (state.mode !== 'spades-solo' && state.mode !== 'spades-partners')
    throw new Error('A Spades state is required.');
  if (state.phase !== 'bid' && state.phase !== 'play' && state.phase !== 'trick-end')
    throw new Error('Playouts start from a bidding or playing position.');
  const world = emptyWorld(mate);
  for (let seat = 0; seat < 4; seat++) {
    for (const card of state.hands[seat]) {
      const index = cardIndex(card);
      world.hands[seat * 4 + suitOf(index)] |= 1 << rankOf(index);
    }
    world.bids[seat] = state.bids[seat] ?? -1;
    world.tricks[seat] = state.tricks[seat];
    world.scores[seat] = state.scores[seat];
    world.bags[seat] = state.bags[seat];
  }
  const first = ((state.dealer + 1) & 3) as Seat;
  const note = (plays: { seat: Seat; card: Card }[]) => {
    if (!plays.length) return;
    const led = suitOf(cardIndex(plays[0].card));
    if (led === TRUMP && !world.spadesBroken) world.voids[plays[0].seat] |= SIDE_SUITS;
    for (const play of plays) {
      const index = cardIndex(play.card),
        suit = suitOf(index);
      world.played[suit] |= 1 << rankOf(index);
      if (suit !== led) world.voids[play.seat] |= 1 << led;
      if (suit === TRUMP) world.spadesBroken = true;
    }
  };
  for (const trick of state.history) note(trick.plays);
  world.completed = state.history.length;
  world.leader = state.history.length ? state.history.at(-1)!.winner : first;
  if (state.phase === 'bid') {
    world.phase = PHASE_BID;
    world.leader = first;
    world.turn = state.turn ?? first;
    return world;
  }
  world.phase = world.completed === 13 ? PHASE_DONE : PHASE_PLAY;
  if (state.phase === 'trick-end') {
    // The completed trick is already in history; the winner leads next.
    world.turn = world.leader;
    return world;
  }
  note(state.trick);
  for (const play of state.trick) {
    const index = cardIndex(play.card);
    if (world.trickLen === 0) {
      world.ledSuit = suitOf(index);
      world.winPos = 0;
      world.leader = play.seat;
    } else if (beats(index, world.trickCard[world.winPos])) world.winPos = world.trickLen;
    world.trickSeat[world.trickLen] = play.seat;
    world.trickCard[world.trickLen] = index;
    world.trickLen++;
  }
  world.turn = state.turn ?? world.leader;
  return world;
}

export const moveFromAction = (action: { kind: 'bid'; bid: number } | { kind: 'play'; card: Card }): number =>
  action.kind === 'bid' ? BID_BASE + action.bid : cardIndex(action.card);
export const actionIdOfMove = (move: number): string =>
  move >= BID_BASE ? `bid:${move - BID_BASE}` : `play:${cardName(move)}`;
