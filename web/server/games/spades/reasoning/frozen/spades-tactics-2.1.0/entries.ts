import { cardSuit } from '../../../../../game/cards.ts';
import { actionId } from '../../../../../game/rules.ts';
import type { GameAction, Seat, Suit } from '../../../../../game/kernel/types.ts';
import type { SeatObservation } from '../../../../../observations/index.ts';
import type { DecisionFacts } from '../../../../../strategy/types.ts';

export type EntryRoute = {
  offerSuit: Suit;
  weight: number;
  certainNextLead: boolean;
  overruffRisk: boolean;
};

/** Public/own-card two-step route: win this trick, then offer a known partner void. */
export function assessEntryRoute(
  obs: SeatObservation,
  facts: DecisionFacts,
  action: GameAction,
): EntryRoute | null {
  if (obs.mode !== 'spades-partners' || obs.phase !== 'play' || action.kind !== 'play' ||
      facts.partner === null || facts.partnerNil !== 'none' ||
      (facts.contractNeeded ?? 0) <= 0 || (facts.ownBid ?? 0) <= 0 ||
      obs.trick.length === 0) return null;
  const outcome = facts.cardOutcomes.find((entry) => entry.actionId === actionId(action));
  if (!outcome || outcome.currentWinner !== obs.seat) return null;
  const canHoldTrump = (seat: Seat) => facts.possibleOwners.some(
    (possible) => cardSuit(possible.card) === 'S' && possible.seats.includes(seat),
  );
  if (!canHoldTrump(facts.partner)) return null;
  const retained = obs.hand.filter((card) => card !== action.card);
  const suit = (['C', 'D', 'H'] as Suit[]).find((candidate) =>
    facts.voids[candidate].includes(facts.partner!) && retained.some((card) => cardSuit(card) === candidate),
  );
  if (!suit) return null;
  const opponents = ([0, 1, 2, 3] as Seat[]).filter((seat) => seat !== obs.seat && seat !== facts.partner);
  const overruffRisk = opponents.some((seat) => facts.voids[suit].includes(seat) && canHoldTrump(seat));
  const certainNextLead = outcome.guaranteedWinner === obs.seat;
  return {
    offerSuit: suit,
    weight: (certainNextLead ? 45 : 15) - (overruffRisk ? 20 : 0),
    certainNextLead,
    overruffRisk,
  };
}
