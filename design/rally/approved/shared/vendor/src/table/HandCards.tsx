import { type CSSProperties, type ReactNode } from 'react';
import type { Card } from '../../shared/contracts';
import { cardLabel, cardSuit } from '../api/display';
import { CardFace } from './CardPrimitives';
import { useHandGestures } from './useHandGestures';
import './hand-gestures.css';

/** Stable hit targets and the same pointer/touch/keyboard gestures in every game. */
export function HandCards({ cards, selected, decisionId, queueKey, playMode, selectionOnly = false, disabled, blocked, myTurn, canPlay, isLegal,
  onSelect, onPlay, label = cardLabel, decoration, extraClass = () => '', isReadOnly = () => false }: {
  cards: readonly Card[]; selected: readonly Card[]; decisionId: string; disabled: boolean; blocked: boolean;
  queueKey: string; playMode: boolean; selectionOnly?: boolean;
  myTurn: boolean; canPlay: boolean; isLegal: (card: Card) => boolean;
  onSelect: (card: Card, keepSelected?: boolean) => void; onPlay: (card: Card) => void | Promise<unknown>;
  label?: (card: Card) => string; decoration?: (card: Card) => ReactNode;
  extraClass?: (card: Card) => string;
  isReadOnly?: (card: Card) => boolean;
}) {
  // A next-turn choice is local intent. Opponent network work must not disable it.
  const inputDisabled = blocked || (disabled && (myTurn || !playMode));
  const gesture = useHandGestures({ cards, decisionId, queueKey, playMode, selectionOnly,
    disabled: inputDisabled, blocked, myTurn, canPlay, isLegal, isReadOnly, onSelect, onPlay });
  return <div ref={gesture.hand} className="hand-cards" style={{ '--cards': cards.length } as CSSProperties}>
    {cards.map((card, index) => {
      const legal = !myTurn || isLegal(card);
      return <button key={card} data-hand-card={card}
        className={`hand-card ${selectionOnly && selected.includes(card) ? 'selected' : ''} ${gesture.queued === card ? 'queued' : ''} ${!legal ? 'unplayable' : ''} ${extraClass(card)} ${index > 0 && cardSuit(card) !== cardSuit(cards[index - 1]) ? 'suit-start' : ''}`}
        disabled={inputDisabled || !legal || isReadOnly(card)} aria-disabled={!legal || isReadOnly(card) || undefined} aria-label={label(card)}
        aria-pressed={(selectionOnly && selected.includes(card)) || gesture.queued === card} aria-describedby="card-controls" aria-keyshortcuts="Enter Space Escape"
        draggable={false} onDragStart={event => event.preventDefault()} onContextMenu={event => event.preventDefault()}
        onFocus={event => {
          const control = event.currentTarget, hand = control.parentElement;
          if (hand && hand.scrollWidth > hand.clientWidth && control.matches(':focus-visible'))
            control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }}
        onClick={event => gesture.click(card, event.currentTarget, event.detail, event.timeStamp)}
        onDoubleClick={event => event.preventDefault()}
        onPointerDown={event => gesture.pointerDown(card, event)}
        onPointerMove={gesture.pointerMove} onPointerUp={gesture.pointerUp}
        onPointerCancel={gesture.cancel} onLostPointerCapture={gesture.lostCapture}
        onKeyDown={event => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            if (!event.repeat) gesture.activate(card, event.currentTarget, event.key === 'Enter');
          }
          if (event.key === 'Escape') { event.preventDefault(); gesture.escape(); }
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            const controls = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
            const i = controls.indexOf(event.currentTarget);
            controls[(i + (event.key === 'ArrowRight' ? 1 : -1) + controls.length) % controls.length]?.focus();
          }
        }}>
        <CardFace card={card} />{decoration?.(card)}
      </button>;
    })}
    <span className="sr-only" aria-live="polite">{gesture.queued ? `${cardLabel(gesture.queued)} queued for your turn. Double-tap again or press Escape to cancel.` : ''}</span>
  </div>;
}
