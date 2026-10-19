import type { TrixObservation } from '../../../shared/local-service.contracts.ts';
import { boardCards } from './adapter.ts';
import { TrixCard } from './Card.tsx';
import { cardLabel } from '../../api/display.ts';
import { cardRank } from '../../api/display.ts';
import type { CSSProperties } from 'react';
import { useLayoutFit } from './useLayoutFit';
const suitNames: Record<string, string> = { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' };
export function LayoutBoard({ board, partners = false }: { board: TrixObservation['board']; partners?: boolean }) {
  const layout = useLayoutFit(board, partners);
  return (
    <section ref={layout} className="trix-layout rally-jacks-layout" aria-label="Jack layout board">
      {board.map((row) => {
        const cards = boardCards(row);
        return (
          <div
            className={`trix-layout-row ${row.suit === 'D' || row.suit === 'H' ? 'red-card' : ''}`}
            key={row.suit}
            role="group"
            aria-label={`${suitNames[row.suit]} lane`}
          >
            <div className="trix-lane-cards">
              {[...cards].reverse().map((card) => (
                <span key={card} data-played-card={card} role="img" aria-label={cardLabel(card)} style={{
                  '--layout-row': 14 - cardRank(card),
                } as CSSProperties}>
                  <TrixCard card={card} />
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
