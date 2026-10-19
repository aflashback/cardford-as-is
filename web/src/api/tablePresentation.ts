import type { GameView, Seat } from '../../shared/contracts';
import type { PublicPlay } from '../table/CardPrimitives';
import { cardRank, cardSuit } from './display';

/** Visual depth for public cards only; the confirmed winner always comes from the server. */
export function trickLayers(game: Pick<GameView, 'trick' | 'mode' | 'currentWinner'>): Map<Seat, number> {
  return publicTrickLayers(game.trick, game.currentWinner, game.mode === 'hearts' ? undefined : 'S');
}

export function publicTrickLayers(plays: readonly PublicPlay[], winner: Seat | null, trump?: string): Map<Seat, number> {
  const lead = plays[0] && cardSuit(plays[0].card);
  const ordered = [...plays].sort((a, b) => {
    const depth = (card: typeof a.card) => {
      const suit = cardSuit(card);
      const group = trump && suit === trump ? 2 : suit === lead ? 1 : 0;
      return group * 100 + cardRank(card);
    };
    return depth(a.card) - depth(b.card);
  });
  return new Map(ordered.map((play, index) => [play.seat, play.seat === winner ? 5 : index + 1]));
}
