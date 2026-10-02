import { cardRank, cardSuit } from '../../../game/cards.ts';
import { competitionFor, opponentsOf, teammatesOf } from '../../../game/kernel/competition.ts';
import { actionId } from '../../../game/rules.ts';
import type { Card, Seat, Suit } from '../../../game/kernel/types.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import type { DecisionFacts } from '../../../strategy/types.ts';

export type PartnerResource = { partner: Seat; suit: Suit; entry: Card; actionIds: string[] };
export type NoEntry = { suit: Suit };
export type PublicSweep = { winner: Seat; suit: Suit; remainingTricks: number; actionIds: string[] };
export type ObservedCases = { partnerResource: PartnerResource | null; noEntry: NoEntry | null; sweep: PublicSweep | null };

/** A factual winning lead must not replace a live own or partner Nil cue. */
export const unbeatableLeadCue = (obs: SeatObservation, facts: DecisionFacts, selectedId: string): boolean =>
  obs.legalActions.length > 1 && !obs.trick.length && facts.ownNil !== 'live' && facts.partnerNil !== 'live' &&
  facts.cardOutcomes.some((outcome) => outcome.actionId === selectedId && outcome.guaranteedWinner === obs.seat);

/** CASE-01..03: own cards and exact public exclusions only, without sampled deals. */
export function assessObservedCases(obs: SeatObservation, facts: DecisionFacts): ObservedCases {
  const result: ObservedCases = { partnerResource: null, noEntry: null, sweep: null };
  if (obs.phase !== 'play' || !facts.knowledgeComplete || !obs.hand.length) return result;
  const held = new Set(obs.hand);
  const onlySide = [...new Set(obs.hand.map(cardSuit))];
  if (onlySide.length === 1 && onlySide[0] !== 'S' && facts.ledSuit !== null && facts.ledSuit !== onlySide[0] &&
      facts.outstandingCards.filter((card) => cardSuit(card) === onlySide[0]).every((card) => held.has(card)))
    result.noEntry = { suit: onlySide[0] };

  const competition = competitionFor(obs.mode);
  const partner = teammatesOf(competition, obs.seat)[0];
  const sideSuits = onlySide.filter((suit) => suit !== 'S');
  const ownsMasterSpade = obs.hand.find((card) => cardSuit(card) === 'S' &&
    !facts.outstandingCards.some((other) => cardSuit(other) === 'S' && cardRank(other) > cardRank(card)));
  const outsideSpades = facts.possibleOwners.filter((entry) => cardSuit(entry.card) === 'S' && !held.has(entry.card));
  if (obs.mode === 'spades-partners' && partner !== undefined && !obs.trick.length &&
      obs.bids.every((bid) => bid !== null && bid > 0) && (facts.contractNeeded ?? 0) > 0 &&
      sideSuits.length === 1 && ownsMasterSpade && facts.voids[sideSuits[0]].includes(partner) &&
      opponentsOf(competition, obs.seat).every((seat) => !outsideSpades.some((entry) => entry.seats.includes(seat))) &&
      outsideSpades.length > 0 && outsideSpades.every((entry) => entry.seats.length === 1 && entry.seats[0] === partner)) {
    const suit = sideSuits[0];
    const actionIds = obs.legalActions.filter((action) => action.kind === 'play' && cardSuit(action.card) === suit).map(actionId);
    if (actionIds.length) result.partnerResource = { partner, suit, entry: ownsMasterSpade, actionIds };
  }

  // All candidate continuations must have the same next leader. Merely being unable
  // to win again does not prove that the other three seats' outcomes are equivalent.
  const winner = facts.cardOutcomes[0]?.guaranteedWinner;
  if (winner === null || winner === undefined || winner === obs.seat ||
      facts.cardOutcomes.length !== obs.legalActions.length ||
      !facts.cardOutcomes.every((outcome) => outcome.guaranteedWinner === winner)) return result;
  for (const suit of ['C', 'D', 'H'] as const) {
    const remainingSuit = facts.outstandingCards.filter((card) => cardSuit(card) === suit);
    const possibleForWinner = facts.possibleOwners.filter((entry) => entry.seats.includes(winner));
    // The leader must fill their public hand capacity using exactly this suit.
    // Equality of counts then forces every remaining suit card into that hand.
    if (!remainingSuit.length || remainingSuit.some((card) => held.has(card)) ||
        remainingSuit.length !== obs.handSizes[winner] ||
        possibleForWinner.some((entry) => cardSuit(entry.card) !== suit)) continue;
    const noTrumpAfterEveryAction = obs.legalActions.every((action) => action.kind === 'play' &&
      facts.outstandingCards.every((card) => card === action.card || cardSuit(card) !== 'S'));
    if (!noTrumpAfterEveryAction) continue;
    result.sweep = { winner, suit, remainingTricks: 13 - obs.history.length, actionIds: obs.legalActions.map(actionId) };
    break;
  }
  return result;
}
