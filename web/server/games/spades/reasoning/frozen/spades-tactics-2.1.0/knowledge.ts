import { cardRank, cardSuit, fullDeck, sorted } from '../../../../../game/cards.ts';
import { SEATS, SUITS, nextSeat, type Card, type Seat, type Suit } from '../../../../../game/kernel/types.ts';
import { actionId, trickWinner } from '../../../../../game/rules.ts';
import { getMemory, type SeatObservation } from '../../../../../observations/index.ts';
import type { DecisionFacts, NilStatus } from '../../../../../strategy/types.ts';

const nil = (bid: number | null, tricks: number): NilStatus =>
  bid === 0 ? (tricks === 0 ? 'live' : 'failed') : 'none';

/** Conservative ownership domains: no bid, rank choice or declined trump removes an owner. */
export function buildFacts(obs: SeatObservation): DecisionFacts {
  const partner = obs.mode === 'spades-partners' ? (((obs.seat + 2) % 4) as Seat) : null;
  const ownBid = obs.bids[obs.seat];
  const ownNil = nil(ownBid, obs.tricks[obs.seat]);
  const partnerNil = partner === null ? null : nil(obs.bids[partner], obs.tricks[partner]);
  const ledSuit = obs.trick.length ? cardSuit(obs.trick[0].card) : null;
  const currentWinner = obs.trick.length ? trickWinner(obs.trick, obs.mode) : null;
  const actorsAfter: Seat[] = [];
  if (obs.phase === 'play') {
    let actor = nextSeat(obs.seat);
    for (let i = obs.trick.length + 1; i < 4; i++) {
      actorsAfter.push(actor);
      actor = nextSeat(actor);
    }
  }
  const publicPlays = [...obs.history.flatMap((t) => t.plays), ...obs.trick];
  const publicCards = new Set(publicPlays.map((p) => p.card));
  const playedCards = sorted([...publicCards]);
  const outstandingCards = fullDeck().filter((c) => !publicCards.has(c));
  const ownCards = new Set(obs.hand);
  const completeHistory =
    publicCards.size === publicPlays.length &&
    obs.hand.every((card) => !publicCards.has(card)) &&
    SEATS.every(
      (seat) => obs.handSizes[seat] + publicPlays.filter((play) => play.seat === seat).length === 13,
    );
  const voids: Record<Suit, Seat[]> = { C: [], D: [], H: [], S: [] };
  for (const memory of getMemory(obs)) voids[memory.suit] = [...memory.voidSeats];
  // Only a complete timeline proves the lead occurred before Spades broke.
  if (obs.mode !== 'hearts' && completeHistory) {
    let broken = false;
    for (const trick of [...obs.history.map((t) => t.plays), obs.trick]) {
      if (!trick.length) continue;
      if (!broken && cardSuit(trick[0].card) === 'S') {
        for (const suit of ['C', 'D', 'H'] as const)
          if (!voids[suit].includes(trick[0].seat)) voids[suit].push(trick[0].seat);
      }
      if (trick.some((p) => cardSuit(p.card) === 'S')) broken = true;
    }
  }
  for (const suit of SUITS) voids[suit].sort();
  let knowledgeComplete = completeHistory;
  const possibleOwners = outstandingCards.map((card) => {
    if (ownCards.has(card)) return { card, seats: [obs.seat] };
    const retained = obs.knownHoldings.filter((h) => h.card === card);
    if (retained.length > 1) knowledgeComplete = false;
    const seats = SEATS.filter(
      (seat) =>
        seat !== obs.seat &&
        obs.handSizes[seat] > 0 &&
        !voids[cardSuit(card)].includes(seat) &&
        (!retained.length || retained.some((h) => h.seat === seat)),
    );
    if (!seats.length) knowledgeComplete = false;
    return { card, seats };
  });
  // Capacity constraints are used only as an inconsistency check, never speculative ownership.
  for (const seat of SEATS) {
    const certain = possibleOwners.filter((p) => p.seats.length === 1 && p.seats[0] === seat).length;
    const possible = possibleOwners.filter((p) => p.seats.includes(seat)).length;
    if (certain > obs.handSizes[seat] || possible < obs.handSizes[seat]) knowledgeComplete = false;
  }
  if (!knowledgeComplete) {
    // Incomplete fixture/history cannot prove concealed ownership or guaranteed future winners.
    for (const entry of possibleOwners)
      if (!ownCards.has(entry.card))
        entry.seats = SEATS.filter((s) => s !== obs.seat && !voids[cardSuit(entry.card)].includes(s));
  }
  const possibleAt = (seat: Seat, suit: Suit) =>
    possibleOwners.some((p) => cardSuit(p.card) === suit && p.seats.includes(seat));
  const certainlyHas = (seat: Seat, suit: Suit) =>
    knowledgeComplete &&
    possibleOwners.some((p) => cardSuit(p.card) === suit && p.seats.length === 1 && p.seats[0] === seat);
  const members = partner === null ? [obs.seat] : [obs.seat, partner];
  const biddingComplete = members.every((s) => obs.bids[s] !== null);
  const isSpades = obs.mode !== 'hearts';
  const contractBid =
    isSpades && biddingComplete ? members.reduce<number>((n, s) => n + (obs.bids[s] ?? 0), 0) : null;
  const creditedTricks =
    contractBid === null
      ? null
      : members.reduce<number>((n, s) => n + ((obs.bids[s] ?? 0) > 0 ? obs.tricks[s] : 0), 0);
  const contractNeeded =
    contractBid === null || creditedTricks === null ? null : Math.max(0, contractBid - creditedTricks);
  const failedNilTricks = members.reduce<number>((n, s) => n + (obs.bids[s] === 0 ? obs.tricks[s] : 0), 0);
  const ordinaryBags =
    contractBid === null || creditedTricks === null ? 0 : Math.max(0, creditedTricks - contractBid);
  const projectedBags = obs.bags[obs.seat] + ordinaryBags + failedNilTricks;
  const facts: DecisionFacts = {
    mode: obs.mode,
    seat: obs.seat,
    legalCount: obs.legalActions.length,
    ledSuit,
    currentWinner,
    actorsAfter,
    tricksRemaining: 13 - obs.history.length,
    ownBid,
    ownTricks: obs.tricks[obs.seat],
    ownNil,
    partner,
    partnerNil,
    contractBid,
    creditedTricks,
    contractNeeded,
    oldBags: isSpades ? obs.bags[obs.seat] : null,
    bagRoom: isSpades ? 10 - (projectedBags % 10) : null,
    nextOrdinaryBagDelta:
      isSpades && contractNeeded === 0 && (contractBid ?? 0) > 0
        ? projectedBags % 10 === 9
          ? -99
          : 1
        : null,
    scoreToTarget: isSpades ? Math.max(0, 500 - obs.scores[obs.seat]) : null,
    suitLengths: { C: 0, D: 0, H: 0, S: 0 },
    voids,
    playedCards,
    outstandingCards,
    possibleOwners,
    knowledgeComplete,
    cardOutcomes: [],
  };
  for (const card of obs.hand) facts.suitLengths[cardSuit(card)]++;
  for (const action of obs.legalActions) {
    if (action.kind !== 'play') continue;
    const plays = [...obs.trick, { seat: obs.seat, card: action.card }];
    const winner = trickWinner(plays, obs.mode);
    const winningCard = plays.find((p) => p.seat === winner)!.card;
    const lead = cardSuit(plays[0].card);
    const canBeOvertakenBy = actorsAfter.filter((seat) =>
      possibleOwners.some(({ card, seats }) => {
        if (!seats.includes(seat)) return false;
        // Following a suit known to be in hand makes off-suit responses impossible.
        if (cardSuit(card) !== lead && certainlyHas(seat, lead)) return false;
        return trickWinner([...plays, { seat, card }], obs.mode) === seat;
      }),
    );
    const trumpRisk =
      obs.mode === 'hearts' || cardSuit(winningCard) === 'S'
        ? []
        : actorsAfter.filter((seat) => possibleAt(seat, 'S') && !certainlyHas(seat, lead));
    facts.cardOutcomes.push({
      actionId: actionId(action),
      currentWinner: winner,
      guaranteedWinner:
        actorsAfter.length === 0 || (knowledgeComplete && canBeOvertakenBy.length === 0) ? winner : null,
      canBeOvertakenBy,
      coversPartnerNil:
        partner !== null && partnerNil === 'live' && currentWinner === partner && winner !== partner,
      trumpRisk,
      isMaster: !outstandingCards.some(
        (c) => cardSuit(c) === cardSuit(action.card) && cardRank(c) > cardRank(action.card),
      ),
    });
  }
  return facts;
}
