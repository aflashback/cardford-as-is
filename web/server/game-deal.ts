import { randomInt } from 'node:crypto';
import type { Card, Seat } from './game/index.ts';
export function shuffledDeck(): Card[] {
  const deck = ['C', 'D', 'H', 'S'].flatMap((suit) =>
    ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map((rank) => suit + rank),
  );
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
export const randomDealer = (): Seat => randomInt(4) as Seat;
