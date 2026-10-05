import { cardRank, cardSuit } from '../../../game/cards.ts';
import { actionId } from '../../../game/rules.ts';
import type { Card, Seat, Suit } from '../../../game/kernel/types.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import type { DecisionFacts } from '../../../strategy/types.ts';

export type PartnerOffer = {
  partner: Seat;
  suit: Suit;
  entry: Card;
  trumpFloor: number;
  actionIds: string[];
};
export type PartnerResources = {
  offer: PartnerOffer | null;
  conserve: { partner: Seat; actionIds: string[] } | null;
  /** Public guard names, never fixture labels or concealed cards. */
  checks: { id: string; holds: boolean }[];
};

/** PR-01: conservative lower bounds from own/public card domains and public hand sizes. */
export function assessPartnerResources(obs: SeatObservation, facts: DecisionFacts): PartnerResources {
  const result: PartnerResources = { offer: null, conserve: null, checks: [] };
  if (obs.phase !== 'play' || obs.mode !== 'spades-partners' || facts.partner === null) return result;
  const partner = facts.partner;
  const opponents = ([0, 1, 2, 3] as Seat[]).filter((seat) => seat !== obs.seat && seat !== partner);
  const check = (id: string, holds: boolean) => {
    result.checks.push({ id, holds });
    return holds;
  };
  const complete = check('complete-public-history', facts.knowledgeComplete);
  const ownPositive = check('own-positive', (obs.bids[obs.seat] ?? 0) > 0);
  const partnerPositive = check('partner-positive', (obs.bids[partner] ?? 0) > 0);
  const noLiveOpponentNil = check(
    'no-live-opponent-nil',
    !opponents.some((seat) => obs.bids[seat] === 0 && obs.tricks[seat] === 0),
  );
  const needed = check('contract-needed', (facts.contractNeeded ?? 0) > 0);
  if (!complete || !ownPositive || !partnerPositive || !noLiveOpponentNil || !needed) return result;
  if (obs.trick.length) {
    // Leaving a secure positive partner in control spends no extra trump or honor.
    const ids = facts.cardOutcomes
      .filter((outcome) => facts.currentWinner === partner && outcome.guaranteedWinner === partner)
      .map((outcome) => outcome.actionId);
    if (ids.length && obs.legalActions.length > ids.length) result.conserve = { partner, actionIds: ids };
    check('partner-secure', result.conserve !== null);
    return result;
  }
  const entry = obs.hand.find(
    (card) =>
      cardSuit(card) === 'S' &&
      !facts.outstandingCards.some((other) => cardSuit(other) === 'S' && cardRank(other) > cardRank(card)),
  );
  const hasEntry = check('retained-master-entry', entry !== undefined);
  const possible = (seat: Seat) => facts.possibleOwners.filter((owner) => owner.seats.includes(seat));
  const mustHold = (seat: Seat, suit: Suit) =>
    possible(seat).some((owner) => cardSuit(owner.card) === suit && owner.seats.length === 1) ||
    obs.handSizes[seat] > possible(seat).filter((owner) => cardSuit(owner.card) !== suit).length;
  const trumps = possible(partner)
    .filter((owner) => cardSuit(owner.card) === 'S')
    .toSorted((a, b) => cardRank(a.card) - cardRank(b.card));
  const forcedTrumpCount = Math.max(
    0,
    obs.handSizes[partner] - possible(partner).filter((owner) => cardSuit(owner.card) !== 'S').length,
  );
  const exactTrump = trumps.filter((owner) => owner.seats.length === 1).map((owner) => cardRank(owner.card));
  // If n trump are needed to fill the hand, its highest must be at least the nth lowest possible one.
  const floor = Math.max(
    0,
    ...exactTrump,
    forcedTrumpCount > 0 ? cardRank(trumps[forcedTrumpCount - 1].card) : 0,
  );
  const provenTrump = check('partner-trump-proved', floor > 0);
  const sideSuits = [...new Set(obs.hand.map(cardSuit))].filter((suit) => suit !== 'S');
  const voidSuits = sideSuits.filter((suit) => facts.voids[suit].includes(partner));
  check('partner-void-proved', voidSuits.length > 0);
  for (const suit of voidSuits) {
    const safe = opponents.every(
      (seat) =>
        mustHold(seat, suit) ||
        !possible(seat).some((owner) => cardSuit(owner.card) === 'S' && cardRank(owner.card) >= floor),
    );
    check(`ruff-safe-${suit}`, floor > 0 && safe);
    if (!hasEntry || !provenTrump || !safe || result.offer) continue;
    const actionIds = obs.legalActions
      .filter((action) => action.kind === 'play' && cardSuit(action.card) === suit)
      .map(actionId);
    if (actionIds.length) result.offer = { partner, suit, entry: entry!, trumpFloor: floor, actionIds };
  }
  return result;
}
