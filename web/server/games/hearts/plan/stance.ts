import {
  ACE_BIT,
  FULL_SUIT,
  HAND_POINTS,
  KING_BIT,
  QUEEN_BIT,
  SPADES,
  highestRank,
  popcount,
  type HeartsWorld,
} from './kernel.ts';

/**
 * GP-02 / GP-06: a Hearts stance is derived from exact facts only: points captured in
 * completed tricks, cards already played, and the seat's own cards. The planner and
 * the playout continuation share this one function, so the plan is what every
 * simulated seat actually follows. Nothing here reads another seat's cards.
 */
export const STANCE_AVOID = 0;
export const STANCE_SHED = 1;
export const STANCE_STOP = 2;
export const STANCE_RUN = 3;
/** The sealed pass. It is never derived from a playout world, which starts after the pass. */
export const STANCE_PASS = 4;

export const HEARTS_STANCE_IDS = [
  'hearts.avoid-points',
  'hearts.shed-dangerous-cards',
  'hearts.stop-a-runner',
  'hearts.run-every-point',
  'hearts.choose-pass',
] as const;
export type HeartsStanceId = (typeof HEARTS_STANCE_IDS)[number];
export const stanceCode = (id: string): number => {
  const code = HEARTS_STANCE_IDS.indexOf(id as HeartsStanceId);
  if (code < 0) throw new Error(`Unknown Hearts stance: ${id}`);
  return code;
};

/** Fixed intents a focal seat may hold for the rest of the round. 0 follows the derived stance. */
export const INTENT_DERIVED = 0;
export const INTENT_AVOID = 1;
export const INTENT_STOP = 2;
export const INTENT_RUN = 3;
export const intentOfStance = (code: number): number =>
  code === STANCE_RUN ? INTENT_RUN : code === STANCE_STOP ? INTENT_STOP : INTENT_AVOID;

/**
 * Named heuristic constant, not a rule: a run counts as live once one seat holds every
 * point captured so far and that is at least half of the hand's points.
 */
export const RUN_LIVE_POINTS = 13;

/** Indices into the scratch array filled by `deriveStance`. */
export const F_STANCE = 0;
/** What the continuation does for this seat: the derived stance, or the focal seat's fixed intent. */
export const F_INTENT = 1;
export const F_TAKEN = 2;
export const F_OWN = 3;
export const F_REMAINING = 4;
/** Seat holding every captured point while a run is live, or -1. */
export const F_RUNNER = 5;
/** Own cards that no unplayed card held elsewhere can beat in their suit. */
export const F_MASTERS = 6;
export const F_CARDS = 7;
/** 1 when this seat holds the queen of spades, or a higher spade while the queen is unplayed. */
export const F_DANGER = 8;
export const STANCE_FIELDS = 9;

/** Fills `out` without allocating. Reads captured points, played cards and the seat's own cards only. */
export function deriveStance(world: HeartsWorld, seat: number, out: Int16Array): void {
  let taken = 0;
  for (let other = 0; other < 4; other++) taken += world.points[other];
  const own = world.points[seat];
  const remaining = HAND_POINTS - taken;
  let runner = -1;
  if (taken >= RUN_LIVE_POINTS && remaining > 0)
    for (let other = 0; other < 4; other++) if (world.points[other] === taken) runner = other;
  let cards = 0,
    masters = 0;
  for (let suit = 0; suit < 4; suit++) {
    const mine = world.hands[seat * 4 + suit];
    if (!mine) continue;
    cards += popcount(mine);
    const elsewhere = ~(world.played[suit] | mine) & FULL_SUIT;
    masters += elsewhere ? popcount(mine >> (highestRank(elsewhere) + 1)) : popcount(mine);
  }
  const spades = world.hands[seat * 4 + SPADES];
  const queenUnplayed = !(world.played[SPADES] & QUEEN_BIT);
  const danger = queenUnplayed && (spades & (QUEEN_BIT | KING_BIT | ACE_BIT)) !== 0;

  let stance: number;
  if (runner === seat && masters * 2 >= cards) stance = STANCE_RUN;
  else if (runner >= 0 && runner !== seat) stance = STANCE_STOP;
  else if (danger) stance = STANCE_SHED;
  else stance = STANCE_AVOID;

  let intent = intentOfStance(stance);
  if (seat === world.focal && world.focalIntent !== INTENT_DERIVED) {
    // A fixed intent holds only while exact facts still allow it.
    if (world.focalIntent === INTENT_RUN) {
      if (own === taken && remaining > 0) intent = INTENT_RUN;
    } else if (world.focalIntent === INTENT_STOP) {
      intent = runner >= 0 && runner !== seat ? INTENT_STOP : INTENT_AVOID;
    } else intent = INTENT_AVOID;
  }
  out[F_STANCE] = stance;
  out[F_INTENT] = intent;
  out[F_TAKEN] = taken;
  out[F_OWN] = own;
  out[F_REMAINING] = remaining;
  out[F_RUNNER] = runner;
  out[F_MASTERS] = masters;
  out[F_CARDS] = cards;
  out[F_DANGER] = danger ? 1 : 0;
}
