import type { CSSProperties, ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { Card, Seat } from '../../shared/contracts';
import { cardLabel, cardRank, cardSuit } from '../api/display';
import './card-face.css';

export const playerNames = ['You', 'Leo', 'Maya', 'Theo'] as const;
export const suitSymbols: Record<string, string> = { C: '♣', D: '♦', H: '♥', S: '♠' };
export type PublicPlay = { seat: Seat; card: Card };
export type PublicTrick = { plays: readonly PublicPlay[]; winner: Seat };

export function CardFace({ card, className = '', children }: {
  card: Card; className?: string; children?: ReactNode;
}) {
  const rank = cardRank(card), suit = cardSuit(card);
  const face = rank === 14 ? 'A' : rank === 13 ? 'K' : rank === 12 ? 'Q' : rank === 11 ? 'J' : `${rank}`;
  return <span aria-hidden="true" className={`card-face ${suit === 'H' || suit === 'D' ? 'red-card' : ''} ${className}`}>
    <span className="card-corner"><b>{face}</b><span>{suitSymbols[suit]}</span></span>
    <span className="card-pip">{suitSymbols[suit]}</span>{children}
  </span>;
}

export function RemainingCards({ count }: { count: number }) {
  const density = count <= 4 ? 'few' : count <= 8 ? 'pack' : 'many';
  return <span className={`remaining-cards cards-${density}`} role="img"
    aria-label={`${count} ${count === 1 ? 'card' : 'cards'} left`}
    style={{ '--remaining': count } as CSSProperties}>
    {Array.from({ length: count }, (_, index) => {
      const offset = index - (count - 1) / 2;
      return <span key={index} className="count-card-back" aria-hidden="true" style={{
        '--back-index': index, '--back-offset': offset, '--back-drop': Math.abs(offset),
      } as CSSProperties} />;
    })}
  </span>;
}

/** The game supplies scores/status; this badge never infers competition or scoring. */
export function PlayerBadge({ seat, active, partner = false, children, announcement, cards, cardAnnouncements }: {
  seat: Seat; active: boolean; partner?: boolean; children: ReactNode;
  announcement?: ReactNode; cards?: readonly Card[]; cardAnnouncements?: ReactNode;
}) {
  return <div data-player-seat={seat} className={`player player-${seat} ${seat === 0 ? `you-label ${active ? 'you-active' : ''}` : ''} ${active ? 'player-active' : ''}`}>
    <div className={`avatar avatar-${seat} ${seat === 0 ? 'you-avatar' : ''}`}>
      <span>{playerNames[seat][0]}</span>
      {partner && <span className="partner-dot" role="img" aria-label="Your partner" title="Your partner"><Check size={10} aria-hidden="true" /></span>}
      {announcement}
    </div>
    <div className="player-info">
      <div className="player-name">{playerNames[seat]}</div>
      {children}
    </div>
    {cardAnnouncements ?? (cards?.length ? <div className="announced-cards" aria-label={`${seat === 0 ? 'Your' : playerNames[seat] + '’s'} doubled cards`}>
      {cards.map(card => <span key={card} role="img" aria-label={`Doubled ${cardLabel(card)}`}><CardFace card={card} /></span>)}
    </div> : null)}
    {active && <span className={`turn-dot ${seat === 0 ? 'your-turn-mark' : ''}`} role="img" aria-label="Current player" />}
  </div>;
}

export function TrickCards({ plays, winner, layers, cueSeats = [] }: {
  plays: readonly PublicPlay[]; winner: Seat | null; layers: ReadonlyMap<Seat, number>; cueSeats?: readonly Seat[];
}) {
  return <>{plays.map(play => <div key={`${play.seat}:${play.card}`} data-played-card={play.card} data-play-seat={play.seat}
    className={`trick-slot trick-slot-${play.seat} ${winner === play.seat ? 'winning-card' : ''} ${cueSeats.includes(play.seat) ? 'cue-card' : ''}`}
    style={{ zIndex: layers.get(play.seat) }} role="img"
    aria-label={`${playerNames[play.seat]}: ${cardLabel(play.card)}${winner === play.seat ? ', currently winning' : ''}`}>
    <CardFace card={play.card} />
  </div>)}</>;
}

export function LastTrickCards({ last }: { last?: PublicTrick }) {
  return <aside className="last-trick" aria-label="Last trick"><div className="last-trick-layout">
    {last?.plays.map(play => <div key={play.seat}
      className={`last-trick-card last-trick-seat-${play.seat} ${last.winner === play.seat ? 'last-trick-winner' : ''}`}
      role="img" aria-label={`${playerNames[play.seat]}: ${cardLabel(play.card)}${last.winner === play.seat ? ', won the trick' : ''}`}>
      <CardFace card={play.card} />
      {last.winner === play.seat && <Check className="last-trick-check" size={10} aria-hidden="true" />}
    </div>)}
  </div></aside>;
}
