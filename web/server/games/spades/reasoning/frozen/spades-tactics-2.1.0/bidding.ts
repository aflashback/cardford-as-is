import type { SeatObservation } from '../../../../../observations/index.ts';
import { cardRank, cardSuit } from '../../../../../game/cards.ts';
import { SEATS, type Seat } from '../../../../../game/kernel/types.ts';
import { suggestBid } from './retained-bidder.ts';

export type BidAssessment = {
  selectedBid: number;
  baselineBid: number;
  candidates: BidCandidateAssessment[];
  reasons: string[];
  limitations: string[];
};

export type BidCandidateAssessment = {
  bid: number;
  /** Team's positive contract can fit within thirteen tricks; this is not a success forecast. */
  contractFeasible: boolean;
  /** False only when a known spade guarantees this seat at least one trick. */
  nilFeasible: boolean;
  heuristicDistance: number;
};

/** A consecutive top-spade run cannot be overtaken in the frozen profile. */
function certainOwnTricks(obs: SeatObservation): number {
  const spades = new Set(obs.hand.filter((card) => cardSuit(card) === 'S').map(cardRank));
  let count = 0;
  for (let rank = 14; rank >= 2 && spades.has(rank); rank--) count++;
  return count;
}

function requireBidObservation(obs: SeatObservation): void {
  if (obs.phase !== 'bid' || (obs.mode !== 'spades-solo' && obs.mode !== 'spades-partners'))
    throw new Error('Contextual bids require a Spades bidding observation.');
  const legal = obs.legalActions.filter((a) => a.kind === 'bid');
  if (legal.length !== 14 || legal.some((a, i) => a.bid !== i || a.seat !== obs.seat))
    throw new Error('Spades bid assessment requires the complete legal set.');
}

/** GR-04/S13: exact feasibility first, otherwise a small declared heuristic adjustment. */
export function assessBids(obs: SeatObservation): BidAssessment {
  requireBidObservation(obs);
  const baselineBid = suggestBid(obs.hand);
  const partner = obs.mode === 'spades-partners' ? (((obs.seat + 2) % 4) as Seat) : null;
  const partnerBid = partner === null ? null : obs.bids[partner];
  const opponents = SEATS.filter((seat) => seat !== obs.seat && seat !== partner);
  const opponentClaims = opponents.reduce<number>((sum, seat) => sum + (obs.bids[seat] ?? 0), 0);
  const guaranteed = certainOwnTricks(obs);
  const reasons: string[] = [
    `Hand structure suggests bid ${baselineBid}; this is an uncalibrated heuristic.`,
  ];
  let target = Math.max(baselineBid, guaranteed);
  if (guaranteed > 0 && baselineBid === 0)
    reasons.push('A held top spade guarantees at least one own trick, so Nil cannot succeed.');
  if (partnerBid !== null && partnerBid > 0 && target + partnerBid > 13) {
    target = Math.max(0, 13 - partnerBid);
    reasons.push('The public positive team bids cannot total more than 13 tricks and remain makeable.');
  }
  // Opposing commitments are public, but may fail. At most one uncertain step is used.
  const availableIfOpponentsMake = 13 - opponentClaims;
  if (opponentClaims >= 9 && target > 1 && target > availableIfOpponentsMake) {
    target--;
    reasons.push('High public opponent bids conflict with this hand estimate if those contracts are made; one cautious bid step is heuristic.');
  }
  if (partnerBid === 0)
    reasons.push('Partner Nil gives no positive contract credit; whether it succeeds is unknown.');
  if (obs.bags[obs.seat] === 9)
    reasons.push('The next ordinary bag would cross the ten-bag penalty, but trick count remains uncertain at bidding.');
  if (obs.scores.some((score) => score >= 400))
    reasons.push('Current scores are public; match victory is assessed after all players finish the hand.');
  const candidates = obs.legalActions.map((action): BidCandidateAssessment => {
    if (action.kind !== 'bid') throw new Error('Expected a bid action.');
    return {
      bid: action.bid,
      contractFeasible: action.bid === 0 || partnerBid === null || partnerBid === 0 || action.bid + partnerBid <= 13,
      nilFeasible: action.bid !== 0 || guaranteed === 0,
      heuristicDistance: Math.abs(action.bid - target),
    };
  });
  const eligible = candidates.filter((candidate) => candidate.contractFeasible && candidate.nilFeasible);
  const noSupportedSuccess = eligible.length === 0;
  // If a partner's 13 bid makes every positive contract impossible while a held
  // top spade makes Nil fail, the smallest positive bid has the least certain
  // contract loss (-140 versus partner's -130 plus failed Nil's -100).
  const selected = noSupportedSuccess && partnerBid === 13 && guaranteed > 0
    ? candidates.find((candidate) => candidate.bid === 1)!
    : (eligible.length ? eligible : candidates)
      .toSorted((a, b) => a.heuristicDistance - b.heuristicDistance || a.bid - b.bid)[0];
  return {
    selectedBid: selected.bid,
    baselineBid,
    candidates,
    reasons,
    limitations: [
      'Public bids are unverified commitments, not proof of concealed cards or future tricks.',
      'Bag and match context are recorded, but do not change a bid without a supported trick estimate.',
      'Nil feasibility only excludes a proven winner; all other Nil outcomes remain uncertain.',
      ...(noSupportedSuccess ? ['Neither a successful Nil nor a makeable positive team contract is supported by the known constraints.'] : []),
    ],
  };
}

export function assessBid(obs: SeatObservation, bid: number): BidCandidateAssessment {
  const result = assessBids(obs).candidates.find((candidate) => candidate.bid === bid);
  if (!result) throw new Error('Bid is not in the complete legal set.');
  return result;
}
