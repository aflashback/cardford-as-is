import { cardRank, cardSuit, type PrivateGame, type Seat } from '../../../../game/index.ts';
import { observe } from '../../../../observations/index.ts';
import type { ReasonClaim } from '../../../../strategy/types.ts';
import { feasible, seatKnowledge, type Requirement, type SeatKnowledge } from './worlds.ts';

/** PR-03: independent public-feasibility proof; no runtime facts or policy imports. */
export function checkPartnerResource(
  state: PrivateGame,
  seat: Seat,
  args: ReasonClaim['args'],
  bound: number,
) {
  let spent = 0;
  const exhausted = Symbol('partner-resource-work-bound');
  const fits = (knowledge: SeatKnowledge, requirement: Requirement = {}) => {
    if (++spent > bound) throw exhausted;
    return feasible(knowledge, requirement);
  };
  const evaluate = () => {
    const failed = (reason: string) => ({ verdict: 'false' as const, reason });
    const suit = args.suit;
    const entry = args.entry;
    const floor = args.trumpFloor;
    const partner = ((seat + 2) % 4) as Seat;
    if (
      state.mode !== 'spades-partners' ||
      state.phase !== 'play' ||
      state.turn !== seat ||
      state.trick.length ||
      args.partner !== partner ||
      (suit !== 'C' && suit !== 'D' && suit !== 'H') ||
      typeof entry !== 'string' ||
      typeof floor !== 'number' ||
      !Number.isInteger(floor) ||
      floor < 2 ||
      floor > 14
    )
      return failed('malformed-args');
    const obs = observe(state, seat);
    const knowledge = seatKnowledge(obs);
    if (!knowledge.consistent || !fits(knowledge))
      return { verdict: 'not-checkable' as const, reason: 'inconsistent-observation' };
    const opponents = knowledge.others.filter((member) => member !== partner);
    if (
      (obs.bids[seat] ?? 0) <= 0 ||
      (obs.bids[partner] ?? 0) <= 0 ||
      opponents.some((member) => obs.bids[member] === 0 && obs.tricks[member] === 0) ||
      obs.bids[seat]! + obs.bids[partner]! - obs.tricks[seat] - obs.tricks[partner] <= 0
    )
      return failed('objective-exception');
    if (
      !obs.hand.includes(entry) ||
      cardSuit(entry) !== 'S' ||
      !obs.hand.some((card) => cardSuit(card) === suit) ||
      [...obs.hand, ...knowledge.unknown].some(
        (card) => cardSuit(card) === 'S' && cardRank(card) > cardRank(entry),
      )
    )
      return failed('entry-not-proved');
    const canHold = (member: Seat, card: string) => fits(knowledge, { holds: [{ seat: member, card }] });
    if (knowledge.unknown.some((card) => cardSuit(card) === suit && canHold(partner, card)))
      return failed('void-not-proved');
    const available = knowledge.unknown.filter((card) => canHold(partner, card));
    const highTrump = available.filter((card) => cardSuit(card) === 'S' && cardRank(card) >= floor);
    const forcedHigh = highTrump.some((card) =>
      knowledge.others.filter((member) => member !== partner).every((member) => !canHold(member, card)),
    );
    const capacityHigh =
      knowledge.capacity[partner] >
      available.filter((card) => cardSuit(card) !== 'S' || cardRank(card) < floor).length;
    if (!forcedHigh && !capacityHigh) return failed('partner-trump-not-proved');
    for (const member of opponents)
      for (const card of knowledge.unknown) {
        if (
          cardSuit(card) === 'S' &&
          cardRank(card) >= floor &&
          fits(knowledge, { holds: [{ seat: member, card }], lacks: [{ seat: member, suit }] })
        )
          return failed('opposing-ruff-not-excluded');
      }
    return { verdict: 'confirmed' as const, reason: 'independent-public-feasibility' };
  };
  try {
    return evaluate();
  } catch (error) {
    if (error === exhausted) return { verdict: 'not-checkable' as const, reason: 'work-bound-exceeded' };
    throw error;
  }
}
