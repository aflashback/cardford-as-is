import type { GameView, Seat } from '../../shared/contracts';
import { cardRank, cardSuit } from './display';

/** Visual depth for public cards only; the confirmed winner always comes from the server. */
export function trickLayers(game: Pick<GameView, 'trick' | 'mode' | 'currentWinner'>): Map<Seat, number> {
  const lead = game.trick[0] && cardSuit(game.trick[0].card);
  const ordered = [...game.trick].sort((a, b) => {
    const depth = (card: typeof a.card) => {
      const suit = cardSuit(card);
      const group = game.mode !== 'hearts' && suit === 'S' ? 2 : suit === lead ? 1 : 0;
      return group * 100 + cardRank(card);
    };
    return depth(a.card) - depth(b.card);
  });
  return new Map(ordered.map((play, index) => [play.seat, play.seat === game.currentWinner ? 5 : index + 1]));
}
