import type { Card, Suit } from '../../shared/contracts';
export const cardSuit = (card: Card): Suit => card[0] as Suit;
export const cardRank = (card: Card): number => ({ A: 14, K: 13, Q: 12, J: 11 }[card.slice(1)] ?? Number(card.slice(1)));
export const cardLabel = (card: Card): string => `${({ A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack' }[card.slice(1)] ?? card.slice(1))} of ${{ C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' }[cardSuit(card)]}`;
