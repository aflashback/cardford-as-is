import { cardSuit, cardRank, sorted } from './cards.ts';
import type { Card, Mode, Seat, Play, LegalContext, GameAction } from './kernel/types.ts';
export function legalCards(context: LegalContext, seat: Seat): Card[] {
  if (context.phase !== 'play' || context.turn !== seat) return [];
  const hand = sorted(context.hand);
  if (context.trick.length) {
    const following = hand.filter((c) => cardSuit(c) === cardSuit(context.trick[0].card));
    if (following.length) return following;
    if (context.mode === 'hearts' && !context.history.length) {
      const safe = hand.filter((c) => cardSuit(c) !== 'H' && c !== 'SQ');
      if (safe.length) return safe;
    }
    return hand;
  }
  if (context.mode === 'hearts' && !context.history.length) return hand.filter((c) => c === 'C2');
  const suit = context.mode === 'hearts' ? 'H' : 'S';
  const broken = context.mode === 'hearts' ? context.heartsBroken : context.spadesBroken;
  const others = hand.filter((c) => cardSuit(c) !== suit);
  return !broken && others.length ? others : hand;
}
export function actionsFor(context: LegalContext, seat: Seat): GameAction[] {
  if (context.phase === 'pass' && context.mode === 'hearts') {
    const hand = sorted(context.hand);
    const result: GameAction[] = [];
    for (let a = 0; a < hand.length - 2; a++)
      for (let b = a + 1; b < hand.length - 1; b++)
        for (let c = b + 1; c < hand.length; c++)
          result.push({ kind: 'pass', seat, cards: [hand[a], hand[b], hand[c]] });
    return result;
  }
  if (context.phase === 'bid' && context.turn === seat)
    return Array.from({ length: 14 }, (_, bid) => ({ kind: 'bid', seat, bid }));
  return legalCards(context, seat).map((card) => ({ kind: 'play', seat, card }));
}
export function actionId(action: GameAction): string {
  return action.kind === 'pass'
    ? `pass:${sorted(action.cards).join(',')}`
    : action.kind === 'bid'
      ? `bid:${action.bid}`
      : `play:${action.card}`;
}
export function trickWinner(plays: Play[], mode: Mode): Seat {
  if (!plays.length) throw new Error('An empty trick has no winner.');
  const suit =
    mode !== 'hearts' && plays.some((p) => cardSuit(p.card) === 'S') ? 'S' : cardSuit(plays[0].card);
  return plays
    .filter((p) => cardSuit(p.card) === suit)
    .reduce((best, p) => (cardRank(p.card) > cardRank(best.card) ? p : best)).seat;
}
