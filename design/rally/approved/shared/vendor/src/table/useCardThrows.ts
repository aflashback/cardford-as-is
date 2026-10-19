import { useLayoutEffect, useRef } from 'react';
import type { Seat } from '../../shared/contracts';
import { playbackDelay } from './playback';

type Origins = { hand: Map<string, DOMRect>; seats: Map<number, DOMRect> };
type Snapshot = Origins & { deal: string; cards: Set<string>; turn: Seat | null; active: boolean };

/** Animate one confirmed public play. Hand/fan geometry is visual only, never game state. */
export function useCardThrows({ deal, turn, active, speed }: {
  deal: string; turn: Seat | null; active: boolean; speed: number;
}) {
  const root = useRef<HTMLElement>(null);
  const previous = useRef<Snapshot | null>(null);
  const flights = useRef(new Set<() => void>());
  const handOrigins = useRef(new Map<string, DOMRect>());

  function origins(): Origins {
    const hand = new Map<string, DOMRect>(), seats = new Map<number, DOMRect>();
    root.current?.querySelectorAll<HTMLElement>('[data-hand-card]').forEach(control => {
      const face = control.querySelector('.card-face');
      if (face) hand.set(control.dataset.handCard!, face.getBoundingClientRect());
    });
    root.current?.querySelectorAll<HTMLElement>('[data-player-seat]').forEach(player => {
      // Opponents have public card backs only. Use the middle of their visible fan.
      const fan = player.querySelector('.remaining-cards');
      const backs = fan?.querySelectorAll('.count-card-back');
      const source = backs?.length ? backs[Math.floor(backs.length / 2)] : player.querySelector('.avatar');
      if (source) seats.set(Number(player.dataset.playerSeat), source.getBoundingClientRect());
    });
    return { hand, seats };
  }
  function settle() { for (const finish of flights.current) finish(); }

  useLayoutEffect(() => {
    const container = root.current;
    if (!container) { previous.current = null; settle(); return; }
    const targets = [...container.querySelectorAll<HTMLElement>('[data-played-card]')];
    const cards = new Set(targets.map(target => target.dataset.playedCard!));
    const before = previous.current;
    const added = targets.filter(target => !before?.cards.has(target.dataset.playedCard!));
    if (!active || before?.deal !== deal) { settle(); handOrigins.current.clear(); }
    if (active && before?.active && before.deal === deal && added.length === 1 &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const target = added[0], card = target.dataset.playedCard!;
      const seat = target.dataset.playSeat === undefined ? before.turn : Number(target.dataset.playSeat);
      const face = target.querySelector<HTMLElement>('.card-face');
      const source = seat === 0 ? handOrigins.current.get(card) ?? before.hand.get(card) : seat === null ? undefined : before.seats.get(seat);
      handOrigins.current.delete(card);
      // Initial loads, new deals, history and catch-up batches never throw cards.
      if (face && source && seat === before.turn && source.width > 0) {
        const destination = face.getBoundingClientRect();
        if (destination.width > 0) {
          const flight = document.createElement('div');
          flight.className = 'card-throw';
          flight.setAttribute('aria-hidden', 'true');
          flight.dataset.card = card;
          flight.dataset.fromSeat = String(seat);
          Object.assign(flight.style, { position: 'fixed', pointerEvents: 'none', zIndex: '90',
            left: `${destination.x}px`, top: `${destination.y}px`, width: `${destination.width}px`,
            height: `${destination.height}px`, transformOrigin: 'center', willChange: 'transform' });
          flight.style.setProperty('--card-width', `${destination.width}px`);
          flight.append(face.cloneNode(true));
          document.body.append(flight);
          const visibility = face.style.visibility;
          face.style.visibility = 'hidden';
          const dx = source.x + source.width / 2 - destination.x - destination.width / 2;
          const dy = source.y + source.height / 2 - destination.y - destination.height / 2;
          const animation = flight.animate([
            { transform: `translate(${dx}px, ${dy}px) rotate(${seat === 1 ? -10 : seat === 3 ? 10 : -6}deg) scale(${source.width / destination.width}, ${source.height / destination.height})` },
            { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
          ], { duration: playbackDelay('throw', speed), easing: 'cubic-bezier(.2,.65,.3,1)' });
          animation.id = 'card-throw';
          const finish = () => {
            if (!flights.current.delete(finish)) return;
            face.style.visibility = visibility;
            flight.remove();
            animation.cancel();
          };
          flights.current.add(finish);
          void animation.finished.then(finish, finish);
        }
      }
    }
    previous.current = { deal, turn, active, cards, ...origins() };
  });

  useLayoutEffect(() => {
    // Capture a picked/queued card immediately before interaction, and keep
    // cached origins aligned after resizing without replaying any confirmed play.
    const capture = () => { if (previous.current) Object.assign(previous.current, origins()); };
    const lifted = (event: Event) => {
      if (!(event.target instanceof HTMLElement) || !root.current?.contains(event.target)) return;
      const { card, rect } = (event as CustomEvent<{ card: string; rect: DOMRect }>).detail;
      if (event.target.dataset.handCard === card) handOrigins.current.set(card, rect);
    };
    const resize = () => { settle(); handOrigins.current.clear(); capture(); };
    window.addEventListener('hand-play-origin', lifted);
    window.addEventListener('pointerup', capture, true);
    window.addEventListener('keydown', capture, true);
    window.addEventListener('resize', resize);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    motion.addEventListener('change', settle);
    return () => {
      settle();
      window.removeEventListener('pointerup', capture, true);
      window.removeEventListener('keydown', capture, true);
      window.removeEventListener('resize', resize);
      window.removeEventListener('hand-play-origin', lifted);
      motion.removeEventListener('change', settle);
    };
  }, []);
  return root;
}
