import {
  FULL_SUIT,
  HEARTS,
  QUEEN_BIT,
  QUEEN_OF_SPADES,
  SPADES,
  legalMoves,
  pointsOf,
  popcount,
  rankOf,
  suitOf,
  trickPoints,
  type HeartsWorld,
} from './kernel.ts';
import { F_INTENT, F_RUNNER, INTENT_RUN, INTENT_STOP, STANCE_FIELDS, deriveStance } from './stance.ts';

/**
 * GP-04 / GP-06: continuation model for bounded Hearts playouts. It reads only the
 * acting seat's own holdings and public state (played cards, the trick in progress,
 * captured points, shown voids). It is a named assumption about how play continues,
 * not a claim of good play.
 */
export const HEARTS_PLAYOUT_POLICY_VERSION = 'hearts-playout-1.0.0';

const QUEEN_RANK = 10;
const stance = new Int16Array(STANCE_FIELDS);
const moves: number[] = new Array(13);
const winners: number[] = new Array(13);
const losers: number[] = new Array(13);

/** Unplayed cards of a suit that this seat does not hold: they are in some other hand. */
const elsewhere = (world: HeartsWorld, seat: number, suit: number) =>
  ~(world.played[suit] | world.hands[seat * 4 + suit]) & FULL_SUIT;
const lowerElsewhere = (world: HeartsWorld, seat: number, card: number) =>
  popcount(elsewhere(world, seat, suitOf(card)) & ((1 << rankOf(card)) - 1));
const higherElsewhere = (world: HeartsWorld, seat: number, card: number) =>
  popcount(elsewhere(world, seat, suitOf(card)) >> (rankOf(card) + 1));
/** The queen of spades is unplayed and in another hand, as far as this seat can tell. */
const queenElsewhere = (world: HeartsWorld, seat: number) =>
  (elsewhere(world, seat, SPADES) & QUEEN_BIT) !== 0;

function pick(cards: number[], count: number, key: (card: number) => number): number {
  let best = cards[0],
    bestKey = key(cards[0]);
  for (let i = 1; i < count; i++) {
    const value = key(cards[i]);
    // Ties keep the earlier card, so the result never depends on anything but the key.
    if (value > bestKey) {
      bestKey = value;
      best = cards[i];
    }
  }
  return best;
}

/** How much this seat wants a card out of its hand when it cannot win the trick with it. */
function burden(world: HeartsWorld, seat: number, card: number): number {
  if (card === QUEEN_OF_SPADES) return 1000;
  const suit = suitOf(card),
    rank = rankOf(card);
  if (suit === SPADES && rank > QUEEN_RANK && queenElsewhere(world, seat)) return 500 + rank;
  const lower = lowerElsewhere(world, seat, card);
  return lower * 10 + rank + (suit === HEARTS ? (lower > 0 ? 16 : 1) : 0);
}

function runnerState(world: HeartsWorld, runner: number): { winning: boolean; toPlay: boolean } {
  let played = false;
  for (let index = 0; index < world.trickLen; index++) if (world.trickSeat[index] === runner) played = true;
  return { winning: world.trickLen > 0 && world.trickSeat[world.winPos] === runner, toPlay: !played };
}

function lead(world: HeartsWorld, seat: number, count: number, intent: number): number {
  if (intent === INTENT_RUN) {
    // Cash certain winners first, drawing out the longest remaining holdings.
    let master = -1,
      masterKey = -1;
    for (let i = 0; i < count; i++) {
      const card = moves[i];
      if (higherElsewhere(world, seat, card) > 0) continue;
      const key = popcount(elsewhere(world, seat, suitOf(card))) * 16 + rankOf(card);
      if (key > masterKey) {
        masterKey = key;
        master = card;
      }
    }
    if (master >= 0) return master;
    return pick(moves, count, (card) => popcount(world.hands[seat * 4 + suitOf(card)]) * 16 + rankOf(card));
  }
  if (intent === INTENT_STOP)
    // A heart that nothing can beat takes a point for this seat and ends the run.
    for (let i = 0; i < count; i++)
      if (suitOf(moves[i]) === HEARTS && higherElsewhere(world, seat, moves[i]) === 0) return moves[i];
  const flush = queenElsewhere(world, seat) && world.hands[seat * 4 + SPADES] >> (QUEEN_RANK + 1) === 0;
  return pick(moves, count, (card) => {
    const suit = suitOf(card),
      rank = rankOf(card);
    const others = elsewhere(world, seat, suit);
    let risk = lowerElsewhere(world, seat, card) * 10 - higherElsewhere(world, seat, card) * 2 + rank;
    // Nobody else can follow: the lead wins and collects every discard.
    if (!others) risk += 400;
    if (card === QUEEN_OF_SPADES) risk += 900;
    else if (suit === SPADES && rank > QUEEN_RANK && queenElsewhere(world, seat)) risk += 500;
    // A low spade from a hand without the top spades invites the queen out.
    else if (suit === SPADES && flush) risk -= 15;
    for (let other = 0; other < 4; other++)
      if (other !== seat && world.voids[other] & (1 << suit)) risk += 6;
    return -risk;
  });
}

function follow(world: HeartsWorld, seat: number, count: number, intent: number, runner: number): number {
  const winning = world.trickCard[world.winPos];
  let winCount = 0,
    loseCount = 0;
  for (let i = 0; i < count; i++)
    if (moves[i] > winning) winners[winCount++] = moves[i];
    else losers[loseCount++] = moves[i];
  const last = world.trickLen === 3;
  const notQueen = (card: number) => (card === QUEEN_OF_SPADES ? -100 : 0);

  if (intent === INTENT_RUN) {
    if (!winCount) return pick(losers, loseCount, (card) => -rankOf(card));
    // The queen is kept until it wins by itself; otherwise win as cheaply as the seat order allows.
    return last
      ? pick(winners, winCount, (card) => notQueen(card) - rankOf(card))
      : pick(winners, winCount, (card) => notQueen(card) + rankOf(card));
  }
  if (intent === INTENT_STOP && runner >= 0) {
    const state = runnerState(world, runner);
    const atStake = trickPoints(world) > 0 || world.ledSuit === HEARTS;
    // Take a trick that carries points while the runner could still win it.
    if (winCount && atStake && (state.winning || state.toPlay))
      return last
        ? pick(winners, winCount, (card) => notQueen(card) - rankOf(card))
        : pick(winners, winCount, (card) => notQueen(card) + rankOf(card));
    // Never hand the queen to the runner while another card of the suit is held.
    if (loseCount && state.winning) return pick(losers, loseCount, (card) => notQueen(card) + rankOf(card));
  }
  if (loseCount) return pick(losers, loseCount, (card) => burden(world, seat, card));
  if (last || world.completed === 0) return pick(winners, winCount, (card) => notQueen(card) + rankOf(card));
  return pick(winners, winCount, (card) => notQueen(card) - rankOf(card));
}

function discard(world: HeartsWorld, seat: number, count: number, intent: number, runner: number): number {
  if (intent === INTENT_RUN) {
    // The trick is lost: keep certain winners and point cards, release the smallest other card.
    return pick(
      moves,
      count,
      (card) =>
        -(pointsOf(card) > 0 ? 200 : 0) - (higherElsewhere(world, seat, card) === 0 ? 50 : 0) - rankOf(card),
    );
  }
  if (intent === INTENT_STOP && runner >= 0) {
    const state = runnerState(world, runner);
    const holder = world.trickCard[world.winPos];
    const secure = !state.winning && (!state.toPlay || higherElsewhere(world, seat, holder) === 0);
    // A point card on a trick the runner cannot win ends the run at once.
    if (secure) {
      let point = -1;
      for (let i = 0; i < count; i++)
        if (pointsOf(moves[i]) > 0 && (point < 0 || burden(world, seat, moves[i]) > burden(world, seat, point)))
          point = moves[i];
      if (point >= 0) return point;
    } else
      return pick(moves, count, (card) => (pointsOf(card) > 0 ? -2000 - pointsOf(card) * 10 : 0) + burden(world, seat, card));
  }
  return pick(moves, count, (card) => burden(world, seat, card));
}

export function playoutMove(world: HeartsWorld): number {
  const seat = world.turn;
  const count = legalMoves(world, moves);
  if (count === 0) throw new Error('No legal playout move.');
  if (count === 1) return moves[0];
  // The continuation follows the same exact-fact stance the planner reports.
  deriveStance(world, seat, stance);
  const intent = stance[F_INTENT];
  const runner = stance[F_RUNNER];
  if (world.trickLen === 0) return lead(world, seat, count, intent);
  if (world.hands[seat * 4 + world.ledSuit]) return follow(world, seat, count, intent, runner);
  return discard(world, seat, count, intent, runner);
}
