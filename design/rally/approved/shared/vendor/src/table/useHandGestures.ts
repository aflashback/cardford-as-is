import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Card } from '../../shared/contracts';

type Options = {
  cards: readonly Card[]; decisionId: string; queueKey: string; disabled: boolean; blocked: boolean;
  myTurn: boolean; canPlay: boolean; playMode: boolean; selectionOnly: boolean;
  isLegal: (card: Card) => boolean; isReadOnly: (card: Card) => boolean;
  onSelect: (card: Card, keep?: boolean) => void; onPlay: (card: Card) => void | Promise<unknown>;
};
type Visual = { node: HTMLDivElement; face: HTMLElement; visibility: string; source: DOMRect };
type Press = {
  card: Card; control: HTMLButtonElement; pointer: number; x: number; y: number;
  decision: string; held: boolean; timer: number; source: DOMRect;
  dx: number; dy: number; length: number; progress: number; inside: boolean;
};
const HOLD_MS = 200;

/** Public hand gestures only. The adapter still checks the current server action. */
export function useHandGestures(options: Options) {
  const latest = useRef(options); latest.current = options;
  const hand = useRef<HTMLDivElement>(null);
  const [queued, setQueued] = useState<{ card: Card; key: string } | null>(null);
  const press = useRef<Press | null>(null), visual = useRef<Visual | null>(null);
  const pending = useRef<{ card: Card; decision: string; key: string; sent: boolean } | null>(null);
  const tap = useRef<{ card: Card; key: string; at: number } | null>(null);
  const suppressClick = useRef(false), returnTimer = useRef<number | undefined>(undefined);

  function allowed(card: Card) {
    const o = latest.current;
    return !o.disabled && !document.hidden && o.cards.includes(card) && !o.isReadOnly(card) && (!o.myTurn || o.isLegal(card));
  }
  function tapKey() {
    const o = latest.current;
    return o.playMode ? `${o.queueKey}:play` : o.decisionId;
  }
  function clearVisual() {
    window.clearTimeout(returnTimer.current);
    const v = visual.current;
    if (v) { v.face.style.visibility = v.visibility; v.node.remove(); }
    visual.current = null;
  }
  function releasePress() {
    const p = press.current; press.current = null;
    if (!p) return;
    window.clearTimeout(p.timer);
    if (p.control.hasPointerCapture(p.pointer)) p.control.releasePointerCapture(p.pointer);
  }
  function cancel() {
    releasePress(); clearVisual(); tap.current = null;
    if (pending.current && !pending.current.sent) pending.current = null;
  }
  function createVisual(control: HTMLButtonElement, card: Card): Visual | null {
    clearVisual();
    const face = control.querySelector<HTMLElement>('.card-face');
    if (!face) return null;
    const source = face.getBoundingClientRect(), node = document.createElement('div');
    node.className = 'hand-drag-card'; node.dataset.card = card; node.setAttribute('aria-hidden', 'true');
    Object.assign(node.style, { left: `${source.x}px`, top: `${source.y}px`, width: `${source.width}px`, height: `${source.height}px` });
    node.style.setProperty('--card-width', `${source.width}px`);
    node.append(face.cloneNode(true)); document.body.append(node);
    const v = { node, face, visibility: face.style.visibility, source };
    face.style.visibility = 'hidden'; visual.current = v;
    return v;
  }
  function returnCard() {
    const v = visual.current;
    if (!v) return;
    v.node.classList.add('returning'); v.node.style.transform = 'translate(0, 0)';
    returnTimer.current = window.setTimeout(clearVisual, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140);
  }
  function submit(card: Card, control: HTMLButtonElement) {
    const o = latest.current, intent = pending.current;
    if (!intent || !allowed(card) || !o.canPlay || intent.decision !== o.decisionId || intent.key !== o.queueKey) {
      pending.current = null; returnCard(); return;
    }
    intent.sent = true;
    // The shared confirmed-play flight starts at the actual lifted/drop position.
    const origin = visual.current?.node.getBoundingClientRect();
    if (origin) control.dispatchEvent(new CustomEvent('hand-play-origin', { bubbles: true, detail: { card, rect: origin } }));
    void Promise.resolve(o.onPlay(card)).catch(() => undefined).finally(() => {
      if (pending.current === intent) { pending.current = null; clearVisual(); }
    });
  }
  function play(card: Card, control: HTMLButtonElement, dropped = false) {
    const o = latest.current;
    if (pending.current || !allowed(card) || !o.canPlay) return;
    setQueued(null); tap.current = null;
    pending.current = { card, decision: o.decisionId, key: o.queueKey, sent: false };
    if (dropped) { submit(card, control); return; }
    const v = createVisual(control, card);
    if (v) {
      v.node.classList.add('popping');
      // Acknowledge the double activation now; server preparation runs concurrently.
      v.node.style.transform = `translateY(${-v.source.height * .1}px)`;
    }
    submit(card, control);
  }
  function activate(card: Card, control: HTMLButtonElement, keep = true) {
    const o = latest.current;
    if (!allowed(card) || pending.current) return;
    if (o.selectionOnly) { o.onSelect(card, keep); return; }
    if (!o.playMode) return;
    if (o.canPlay) play(card, control);
    else if (!o.myTurn) setQueued(previous => previous?.card === card && previous.key === o.queueKey ? null : { card, key: o.queueKey });
  }
  function click(card: Card, control: HTMLButtonElement, detail: number, at: number) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (detail === 0) { activate(card, control); return; } // Assistive activation.
    const previous = tap.current;
    const double = previous?.card === card && previous.key === tapKey() && (detail === 2 || at - previous.at < 350);
    tap.current = double ? null : { card, key: tapKey(), at };
    if (double) activate(card, control);
  }
  function pointerDown(card: Card, event: ReactPointerEvent<HTMLButtonElement>) {
    const o = latest.current;
    if (!event.isPrimary) { cancel(); return; }
    if (event.button !== 0 || !allowed(card) || pending.current) return;
    const previousTap = tap.current;
    cancel(); tap.current = previousTap; suppressClick.current = false;
    const control = event.currentTarget, source = control.querySelector('.card-face')!.getBoundingClientRect();
    const table = control.closest('.game-shell')?.querySelector('.table-felt')?.getBoundingClientRect();
    if (!table || (!o.canPlay && !o.selectionOnly)) return;
    const dx = table.x + table.width / 2 - source.x - source.width / 2;
    const dy = table.y + table.height / 2 - source.y - source.height / 2;
    const p: Press = { card, control, pointer: event.pointerId, x: event.clientX, y: event.clientY,
      decision: o.decisionId, held: false, timer: 0, source, dx, dy, length: Math.hypot(dx, dy), progress: 0, inside: true };
    control.setPointerCapture(event.pointerId); press.current = p;
    p.timer = window.setTimeout(() => {
      if (press.current !== p || !allowed(card) || latest.current.decisionId !== p.decision) return;
      p.held = true; suppressClick.current = true;
      if (latest.current.selectionOnly) { latest.current.onSelect(card); return; }
      if (!latest.current.canPlay) return;
      setQueued(null);
      const v = createVisual(control, card);
      if (v) v.node.style.transform = `translateY(${-source.height * .22}px)`;
    }, HOLD_MS);
  }
  function pointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const p = press.current;
    if (!p || p.pointer !== event.pointerId) return;
    const x = event.clientX - p.x, pointerY = event.clientY - p.y;
    if (!p.held) {
      // Tolerate a little finger/mouse travel while the hold timer completes.
      const slop = Math.max(16, Math.min(p.source.width * .4, p.length * .1));
      if (Math.hypot(x, pointerY) > slop) { suppressClick.current = true; tap.current = null; releasePress(); }
      return;
    }
    const v = visual.current;
    if (!v || !p.length) return;
    event.preventDefault();
    const y = pointerY - p.source.height * .22;
    const ux = p.dx / p.length, uy = p.dy / p.length;
    const along = (x * ux + y * uy) / p.length, across = (-x * uy + y * ux) / p.length;
    p.progress = Math.max(-.1, Math.min(1.1, along));
    p.inside = along >= -.1 && along <= 1.1 && Math.abs(across) <= .1;
    const side = Math.max(-.1, Math.min(.1, across)) * p.length;
    v.node.style.transform = `translate(${p.progress * p.dx - side * uy}px, ${p.progress * p.dy + side * ux}px)`;
    v.node.dataset.ready = String(p.progress >= .5 && p.inside);
  }
  function pointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const p = press.current;
    if (!p || p.pointer !== event.pointerId) return;
    releasePress();
    if (!p.held) return;
    // A stationary hold can be the first press of a double-click. Only a drag
    // consumes the click; otherwise keep pairing clicks normally on release.
    suppressClick.current = p.progress !== 0;
    if (p.progress !== 0) tap.current = null;
    if (visual.current && p.progress >= .5 && p.inside && allowed(p.card) && latest.current.canPlay && p.decision === latest.current.decisionId)
      play(p.card, p.control, true);
    else returnCard();
  }

  useLayoutEffect(() => {
    const o = latest.current, p = press.current, intent = pending.current;
    // Busy disables further input, but must not drop the acknowledged card back
    // into the hand while the same server command is still being confirmed.
    if (o.blocked || (o.disabled && !intent?.sent) || (p && (p.decision !== o.decisionId || !allowed(p.card))) ||
        (intent && (intent.decision !== o.decisionId || intent.key !== o.queueKey || !o.cards.includes(intent.card)))) cancel();
  });
  useEffect(() => {
    const o = latest.current;
    if (!queued) return;
    if (!o.playMode || queued.key !== o.queueKey || !o.cards.includes(queued.card)) { setQueued(null); return; }
    if (!o.myTurn || o.disabled || document.hidden) return;
    if (!o.isLegal(queued.card)) { setQueued(null); return; }
    if (o.canPlay && !pending.current) {
      const control = [...(hand.current?.querySelectorAll<HTMLButtonElement>('[data-hand-card]') ?? [])].find(c => c.dataset.handCard === queued.card);
      if (control) play(queued.card, control);
    }
  });
  useEffect(() => { if (tap.current?.key !== tapKey()) tap.current = null; }, [options.decisionId, options.queueKey, options.playMode]);
  useEffect(() => {
    const blur = () => cancel();
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', blur); window.addEventListener('resize', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => { cancel(); window.removeEventListener('blur', blur); window.removeEventListener('resize', blur); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  return { hand, queued: queued?.key === options.queueKey ? queued.card : null,
    click, activate, pointerDown, pointerMove, pointerUp,
    cancel: () => { suppressClick.current = true; cancel(); },
    lostCapture: () => { if (press.current) { suppressClick.current = true; cancel(); } },
    escape: () => { cancel(); setQueued(null); },
  };
}
