import { SUITS, type Card, type Suit } from './kernel/types.ts';
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export function cardSuit(card: Card): Suit {
  if (typeof card !== 'string' || !/^[CDHS](?:[2-9]|10|J|Q|K|A)$/.test(card))
    throw new Error('Invalid card.');
  return card[0] as Suit;
}
export function cardRank(card: Card): number {
  cardSuit(card);
  return RANKS.indexOf(card.slice(1)) + 2;
}
export function cardLabel(card: Card): string {
  return `${({ J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' } as Record<string, string>)[card.slice(1)] ?? card.slice(1)} of ${{ C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' }[cardSuit(card)]}`;
}
export const sorted = (cards: Card[]): Card[] =>
  [...cards].sort(
    (a, b) => SUITS.indexOf(cardSuit(a)) - SUITS.indexOf(cardSuit(b)) || cardRank(a) - cardRank(b),
  );
export const fullDeck = (): Card[] => SUITS.flatMap((s) => RANKS.map((r) => s + r));
export function validateDeal(deck: Card[]): void {
  if (!Array.isArray(deck) || deck.length !== 52 || new Set(deck).size !== 52)
    throw new Error('A deal requires 52 unique cards.');
  deck.forEach(cardSuit);
}
