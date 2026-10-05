import { cardRank, cardSuit, sorted } from '../../game/cards.ts';
import { assertSeat, type Seat } from '../../game/kernel/seats.ts';
import type { Card, Play } from '../../game/kernel/types.ts';
import type { SpadesAction, SpadesMode, SpadesPhase } from './state.ts';

export type SpadesLegalContext = {
  phase: SpadesPhase;
  turn: Seat | null;
  hand: Card[];
  trick: Play[];
  spadesBroken: boolean;
};
/** Spades legality is independent of the frozen combined V1 engine. */
export function spadesActionsFor(context: SpadesLegalContext, seat: Seat): SpadesAction[] {
  assertSeat(seat);
  if (context.turn !== seat) return [];
  if (context.phase === 'bid') return Array.from({ length: 14 }, (_, bid) => ({ kind: 'bid', seat, bid }));
  if (context.phase !== 'play') return [];
  const hand = sorted(context.hand);
  let cards: Card[];
  if (context.trick.length) {
    const following = hand.filter((card) => cardSuit(card) === cardSuit(context.trick[0].card));
    cards = following.length ? following : hand;
  } else {
    const plain = hand.filter((card) => cardSuit(card) !== 'S');
    cards = !context.spadesBroken && plain.length ? plain : hand;
  }
  return cards.map((card) => ({ kind: 'play', seat, card }));
}
export function spadesActionId(action: SpadesAction): string {
  return action.kind === 'bid' ? `bid:${action.bid}` : `play:${action.card}`;
}
export function spadesTrickWinner(plays: Play[]): Seat {
  if (!plays.length) throw new Error('An empty trick has no winner.');
  const suit = plays.some((play) => cardSuit(play.card) === 'S') ? 'S' : cardSuit(plays[0].card);
  return plays
    .filter((play) => cardSuit(play.card) === suit)
    .reduce((best, play) => (cardRank(play.card) > cardRank(best.card) ? play : best)).seat;
}
export function spadesMatchWinner(mode: SpadesMode, scores: number[]): Seat | undefined {
  if (Math.max(...scores) < 500) return undefined;
  const best = Math.max(...scores);
  const contenders: readonly Seat[] = mode === 'spades-partners' ? [0, 1] : [0, 1, 2, 3];
  const winners = contenders.filter((seat) => scores[seat] === best);
  return winners.length === 1 ? winners[0] : undefined;
}
