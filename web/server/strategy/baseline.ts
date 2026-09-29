import { cardRank, cardSuit, sorted } from '../game/cards.ts';
import { SUITS, type Card, type GameAction, type Seat } from '../game/kernel/types.ts';
import { trickWinner } from '../game/rules.ts';
import { assertObservation, type SeatObservation } from '../observations/index.ts';
export const BASELINE_POLICY_VERSION = 'local-baseline-1.0.0';
/** Retained prototype bidder. Weights are uncalibrated heuristics, never probabilities. */
export function suggestBid(hand: Card[]): number {
  let estimate = 0;
  for (const suit of SUITS) {
    const cards = hand.filter((c) => cardSuit(c) === suit);
    if (suit === 'S') {
      for (const c of cards) estimate += cardRank(c) >= 12 ? 1 : cardRank(c) >= 10 ? 0.65 : 0.25;
      if (cards.length > 4) estimate += (cards.length - 4) * 0.4;
    } else {
      if (cards.some((c) => cardRank(c) === 14)) estimate++;
      if (cards.length >= 2 && cards.some((c) => cardRank(c) === 13)) estimate += 0.55;
      if (cards.length >= 3 && cards.some((c) => cardRank(c) === 12)) estimate += 0.2;
    }
  }
  if (
    estimate < 0.9 &&
    !hand.some((c) => cardSuit(c) === 'S' && cardRank(c) > 9) &&
    hand.filter((c) => cardSuit(c) === 'S').length <= 2
  )
    return 0;
  return Math.max(1, Math.min(13, Math.round(estimate)));
}
function passPriority(card: Card): number {
  return card === 'SQ'
    ? 100
    : cardSuit(card) === 'S' && cardRank(card) > 12
      ? 80 + cardRank(card)
      : cardRank(card) + (cardRank(card) >= 11 ? 20 : 0) + (cardSuit(card) === 'H' ? 5 : 0);
}
export function chooseBaselineAction(obs: SeatObservation): GameAction {
  assertObservation(obs);
  const legal = obs.legalActions;
  if (!legal.length) throw new Error('No decision is available for this seat.');
  if (legal.length === 1) return structuredClone(legal[0]);
  if (obs.phase === 'bid') {
    const bid = suggestBid(obs.hand);
    const found = legal.find((a) => a.kind === 'bid' && a.bid === bid);
    if (!found) throw new Error('Bid missing from legal set.');
    return structuredClone(found);
  }
  if (obs.phase === 'pass') {
    // Rank all complete triples, retaining the entire legal reference set for human choice.
    const ranked = legal
      .filter((a) => a.kind === 'pass')
      .map((a) => ({ action: a, score: a.cards.reduce((sum, c) => sum + passPriority(c), 0) }))
      .sort((a, b) => b.score - a.score);
    return structuredClone(ranked[0].action);
  }
  const cards = legal.flatMap((a) => (a.kind === 'play' ? [a.card] : []));
  const low = sorted(cards).sort((a, b) => cardRank(a) - cardRank(b));
  let card = low[0];
  if (obs.trick.length) {
    const winning = trickWinner(obs.trick, obs.mode);
    const losers = low.filter(
      (c) => trickWinner([...obs.trick, { seat: obs.seat, card: c }], obs.mode) !== obs.seat,
    );
    const winners = low.filter((c) => !losers.includes(c));
    if (obs.mode === 'hearts')
      card = [...losers].sort((a, b) => passPriority(b) - passPriority(a))[0] ?? low[0];
    else {
      const partner = ((obs.seat + 2) % 4) as Seat;
      const bid = obs.bids[obs.seat] ?? 0;
      if (bid === 0) card = losers.at(-1) ?? low[0];
      else if (
        obs.mode === 'spades-partners' &&
        winning === partner &&
        obs.bids[partner] === 0 &&
        obs.tricks[partner] === 0 &&
        winners.length
      )
        card = winners[0];
      else if (obs.mode === 'spades-partners' && winning === partner && obs.bids[partner] !== 0)
        card = losers[0] ?? low[0];
      else {
        const needed =
          obs.mode === 'spades-partners'
            ? bid +
              (obs.bids[partner] ?? 0) -
              obs.tricks[obs.seat] -
              (obs.bids[partner] === 0 ? 0 : obs.tricks[partner])
            : bid - obs.tricks[obs.seat];
        card =
          needed > 0 && winners.length
            ? (winners.find((c) => cardSuit(c) !== 'S') ?? winners[0])
            : (losers[0] ?? low[0]);
      }
    }
  }
  const selected = legal.find((a) => a.kind === 'play' && a.card === card);
  if (!selected) throw new Error('Policy produced no legal action.');
  return structuredClone(selected);
}
