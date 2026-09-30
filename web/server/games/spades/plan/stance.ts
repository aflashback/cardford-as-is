import { PHASE_BID, type SpadesWorld } from '../playout/kernel.ts';

/**
 * SG-03 / GP-02: a Spades stance is derived from exact public facts only
 * (bids, tricks taken, tricks remaining). The planner and the playout
 * continuation share this one function, so the plan is what every simulated
 * seat actually follows.
 */
export const STANCE_CHOOSE = 0;
export const STANCE_OWN_NIL = 1;
export const STANCE_BOTH_NILS = 2;
export const STANCE_COVER_NIL = 3;
export const STANCE_MAKE = 4;
export const STANCE_SALVAGE = 5;
export const STANCE_LIMIT = 6;
export const STANCE_SET = 7;
/** Alternative to limiting bags: keep taking tricks although no contract needs them. */
export const STANCE_DENY = 8;

export const SPADES_STANCE_IDS = [
  'spades.choose-commitment',
  'spades.protect-own-nil',
  'spades.protect-both-nils',
  'spades.protect-teammate-nil',
  'spades.make-contract',
  'spades.salvage-hand',
  'spades.limit-bags',
  'spades.set-opponents',
  'spades.deny-tricks',
] as const;
export type SpadesStanceId = (typeof SPADES_STANCE_IDS)[number];
export const stanceCode = (id: string): number => {
  const code = SPADES_STANCE_IDS.indexOf(id as SpadesStanceId);
  if (code < 0) throw new Error(`Unknown Spades stance: ${id}`);
  return code;
};

/** Fixed intents a focal seat may hold for the rest of the round. 0 follows the derived stance. */
export const INTENT_DERIVED = 0;
export const INTENT_TAKE = 1;
export const INTENT_DUCK = 2;
export const intentOfStance = (code: number): number =>
  code === STANCE_DENY || code === STANCE_SET ? INTENT_TAKE : code === STANCE_LIMIT ? INTENT_DUCK : INTENT_DERIVED;

/** Indices into the scratch array filled by `deriveStance`. */
export const F_STANCE = 0;
export const F_NEED = 1;
export const F_CONTRACT = 2;
export const F_CREDIT = 3;
export const F_REMAINING = 4;
export const F_OWN_NIL = 5;
export const F_MATE_NIL = 6;
export const F_CAN_SET = 7;
export const F_OPPOSING_NIL = 8;
export const F_OPPOSING_NEED = 9;
export const F_WANT_TRICK = 10;
export const STANCE_FIELDS = 11;

/** Fills `out` without allocating. Reads bids, tricks and completed tricks only. */
export function deriveStance(world: SpadesWorld, seat: number, out: Int16Array): void {
  const mate = world.mate[seat];
  const bid = world.bids[seat];
  const remaining = 13 - world.completed;
  const ownNil = bid === 0 && world.tricks[seat] === 0;
  const mateNil = mate >= 0 && world.bids[mate] === 0 && world.tricks[mate] === 0;
  let contract = bid > 0 ? bid : 0,
    credit = bid > 0 ? world.tricks[seat] : 0;
  if (mate >= 0 && world.bids[mate] > 0) {
    contract += world.bids[mate];
    credit += world.tricks[mate];
  }
  const need = contract - credit;
  let opposingNil = -1,
    canSet = 0,
    opposingNeed = 0;
  for (let other = 0; other < 4; other++) {
    if (other === seat || other === mate) continue;
    const otherBid = world.bids[other];
    if (otherBid === 0 && world.tricks[other] === 0) opposingNil = other;
    const otherMate = world.mate[other];
    let otherContract = otherBid > 0 ? otherBid : 0,
      otherCredit = otherBid > 0 ? world.tricks[other] : 0;
    if (otherMate >= 0 && world.bids[otherMate] > 0) {
      otherContract += world.bids[otherMate];
      otherCredit += world.tricks[otherMate];
    }
    const otherNeed = otherContract - otherCredit;
    if (otherNeed > opposingNeed) opposingNeed = otherNeed;
    // One more trick for this side makes that opposing contract impossible.
    if (otherNeed > 0 && otherNeed >= remaining) canSet = 1;
  }
  let stance: number;
  if (world.phase === PHASE_BID) stance = STANCE_CHOOSE;
  else if (ownNil) stance = mateNil ? STANCE_BOTH_NILS : STANCE_OWN_NIL;
  else if (mateNil) stance = STANCE_COVER_NIL;
  else if (need > 0) stance = need > remaining ? STANCE_SALVAGE : STANCE_MAKE;
  else stance = canSet ? STANCE_SET : STANCE_LIMIT;
  let wantTrick = !ownNil && (need > 0 || canSet === 1) ? 1 : 0;
  if (seat === world.focal && world.focalIntent !== INTENT_DERIVED && !ownNil)
    wantTrick = world.focalIntent === INTENT_TAKE ? 1 : 0;
  out[F_STANCE] = stance;
  out[F_NEED] = need;
  out[F_CONTRACT] = contract;
  out[F_CREDIT] = credit;
  out[F_REMAINING] = remaining;
  out[F_OWN_NIL] = ownNil ? 1 : 0;
  out[F_MATE_NIL] = mateNil ? 1 : 0;
  out[F_CAN_SET] = canSet;
  out[F_OPPOSING_NIL] = opposingNil;
  out[F_OPPOSING_NEED] = opposingNeed;
  out[F_WANT_TRICK] = wantTrick;
}
