import {
  BID_BASE,
  FULL_SUIT,
  PHASE_BID,
  TRUMP,
  legalMoves,
  rankOf,
  suitOf,
  wouldWin,
  type SpadesWorld,
} from './kernel.ts';
import {
  F_MATE_NIL,
  F_OPPOSING_NIL,
  F_OWN_NIL,
  F_WANT_TRICK,
  STANCE_FIELDS,
  deriveStance,
} from '../plan/stance.ts';

const stance = new Int16Array(STANCE_FIELDS);

/**
 * SG-02: continuation model for bounded playouts. It reads only the acting seat's own
 * holdings and public state (bids, tricks, played cards, shown voids, scores, bags).
 * It is a named assumption about how play continues, not a claim of good play.
 */
export const SPADES_PLAYOUT_POLICY_VERSION = 'spades-playout-1.0.0';

const popcount = (mask: number) => {
  let count = 0;
  for (let rest = mask; rest; rest &= rest - 1) count++;
  return count;
};

/** Uncalibrated hand-structure estimate of tricks; heuristic weights, never probabilities. */
export function estimateTricks(hands: Uint16Array, seat: number): number {
  const base = seat * 4;
  const spades = hands[base + TRUMP];
  const spadeCount = popcount(spades);
  let estimate = 0;
  for (let rank = 0; rank < 13; rank++)
    if (spades & (1 << rank)) estimate += rank >= 10 ? 1 : rank >= 8 ? 0.65 : 0.25;
  if (spadeCount > 4) estimate += (spadeCount - 4) * 0.4;
  for (let suit = 0; suit < 3; suit++) {
    const cards = hands[base + suit];
    const length = popcount(cards);
    if (cards & (1 << 12)) estimate += 1;
    if (length >= 2 && cards & (1 << 11)) estimate += 0.55;
    if (length >= 3 && cards & (1 << 10)) estimate += 0.2;
    if (spadeCount >= 3 && length <= 1) estimate += length === 0 ? 0.5 : 0.25;
  }
  return estimate;
}

export function playoutBid(world: SpadesWorld, seat: number): number {
  const estimate = estimateTricks(world.hands, seat);
  const spades = world.hands[seat * 4 + TRUMP];
  if (estimate < 0.9 && popcount(spades) <= 2 && spades >> 8 === 0) return 0;
  let bid = Math.max(1, Math.min(13, Math.round(estimate)));
  const mate = world.mate[seat];
  if (mate >= 0 && world.bids[mate] > 0 && bid + world.bids[mate] > 13) bid = Math.max(1, 13 - world.bids[mate]);
  return bid;
}

const moves: number[] = new Array(14);

function isMaster(world: SpadesWorld, seat: number, card: number): boolean {
  const suit = suitOf(card);
  const elsewhere = ~(world.played[suit] | world.hands[seat * 4 + suit]) & FULL_SUIT;
  return elsewhere >> (rankOf(card) + 1) === 0;
}

/** Lower rank first; among equal ranks keep trump and shed from the longer side suit. */
function cheapest(world: SpadesWorld, seat: number, cards: number[], count: number): number {
  let best = cards[0],
    bestKey = Infinity;
  for (let i = 0; i < count; i++) {
    const card = cards[i],
      suit = suitOf(card);
    const key =
      rankOf(card) * 8 + (suit === TRUMP ? 7 : 6 - Math.min(6, popcount(world.hands[seat * 4 + suit])));
    if (key < bestKey) {
      bestKey = key;
      best = card;
    }
  }
  return best;
}

function dearest(cards: number[], count: number, trumpBonus: number): number {
  let best = cards[0],
    bestKey = -Infinity;
  for (let i = 0; i < count; i++) {
    const card = cards[i];
    const key = rankOf(card) + (suitOf(card) === TRUMP ? trumpBonus : 0);
    if (key > bestKey) {
      bestKey = key;
      best = card;
    }
  }
  return best;
}

const winners: number[] = new Array(13);
const losers: number[] = new Array(13);

export function playoutMove(world: SpadesWorld): number {
  const seat = world.turn;
  if (world.phase === PHASE_BID) return BID_BASE + playoutBid(world, seat);
  const count = legalMoves(world, moves);
  if (count === 1) return moves[0];
  const mate = world.mate[seat];
  // The continuation follows the same exact-fact stance the planner reports.
  deriveStance(world, seat, stance);
  const ownNil = stance[F_OWN_NIL] === 1;
  const mateNil = stance[F_MATE_NIL] === 1;
  const opposingNil = stance[F_OPPOSING_NIL];
  const wantTrick = stance[F_WANT_TRICK] === 1;

  if (world.trickLen === 0) {
    if (ownNil) return cheapest(world, seat, moves, count);
    let master = -1,
      masterKey = -Infinity;
    for (let i = 0; i < count; i++) {
      const card = moves[i],
        suit = suitOf(card);
      if (!isMaster(world, seat, card)) continue;
      // A side-suit master can still be ruffed by an opponent who has publicly shown that void.
      let ruffable = false;
      if (suit !== TRUMP)
        for (let other = 0; other < 4; other++)
          if (
            other !== seat &&
            other !== mate &&
            world.voids[other] & (1 << suit) &&
            !(world.voids[other] & (1 << TRUMP))
          )
            ruffable = true;
      if (ruffable) continue;
      const key = (suit === TRUMP ? 0 : 20) + rankOf(card);
      if (key > masterKey) {
        masterKey = key;
        master = card;
      }
    }
    if (mateNil) return master >= 0 ? master : dearest(moves, count, -6);
    if (wantTrick) {
      if (master >= 0) return master;
      // Offer a teammate a possible ruff in a suit they have publicly shown void.
      if (mate >= 0 && !(world.voids[mate] & (1 << TRUMP)))
        for (let i = 0; i < count; i++) {
          const suit = suitOf(moves[i]);
          if (suit !== TRUMP && world.voids[mate] & (1 << suit)) {
            let low = moves[i];
            for (let j = 0; j < count; j++)
              if (suitOf(moves[j]) === suit && moves[j] < low) low = moves[j];
            return low;
          }
        }
      // Otherwise lead low from the shortest side suit to develop a void.
      let best = -1,
        bestLength = 99;
      for (let i = 0; i < count; i++) {
        const suit = suitOf(moves[i]);
        if (suit === TRUMP) continue;
        const length = popcount(world.hands[seat * 4 + suit]);
        if (length < bestLength || (length === bestLength && moves[i] % 13 < best % 13)) {
          bestLength = length;
          best = moves[i];
        }
      }
      if (best >= 0) {
        for (let j = 0; j < count; j++)
          if (suitOf(moves[j]) === suitOf(best) && moves[j] < best) best = moves[j];
        return best;
      }
    }
    return cheapest(world, seat, moves, count);
  }

  let winCount = 0,
    loseCount = 0;
  for (let i = 0; i < count; i++)
    if (wouldWin(world, moves[i])) winners[winCount++] = moves[i];
    else losers[loseCount++] = moves[i];
  const winSeat = world.trickSeat[world.winPos];
  const last = world.trickLen === 3;
  const mateToPlay = mate >= 0 && world.trickLen <= 1;

  if (ownNil) {
    if (loseCount) return dearest(losers, loseCount, 4);
    return last ? dearest(winners, winCount, 4) : cheapest(world, seat, winners, winCount);
  }
  if (mateNil) {
    if (winSeat === mate) return winCount ? cheapest(world, seat, winners, winCount) : cheapest(world, seat, moves, count);
    if (mateToPlay && winCount) return dearest(winners, winCount, -6);
  }
  if (opposingNil >= 0 && winSeat === opposingNil && loseCount) return dearest(losers, loseCount, -6);

  if (wantTrick) {
    if (winSeat === mate && !mateNil) {
      // A teammate is ahead. Seen from this seat, no unplayed higher card of that suit is held elsewhere.
      if (last || isMaster(world, seat, world.trickCard[world.winPos]) || !winCount)
        return loseCount ? cheapest(world, seat, losers, loseCount) : cheapest(world, seat, moves, count);
    }
    if (winCount) {
      if (last) return cheapest(world, seat, winners, winCount);
      let secure = -1;
      for (let i = 0; i < winCount; i++)
        if (isMaster(world, seat, winners[i]) && (secure < 0 || rankOf(winners[i]) < rankOf(secure)))
          secure = winners[i];
      if (secure >= 0) return secure;
      return suitOf(winners[0]) === TRUMP && world.ledSuit !== TRUMP
        ? cheapest(world, seat, winners, winCount)
        : dearest(winners, winCount, 0);
    }
    return cheapest(world, seat, losers, loseCount);
  }
  if (loseCount) return dearest(losers, loseCount, -6);
  return last ? dearest(winners, winCount, 0) : cheapest(world, seat, winners, winCount);
}
