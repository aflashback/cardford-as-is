import { useCallback, useLayoutEffect, useRef } from 'react';
import { rallyFrameMetrics, fitRallyTrick, lastTrickPocket, clearPreviewCards, emptyPreviewCards } from './responsiveGeometry';

export type TablePresentationPhase = 'play' | 'jacks' | 'bid' | 'pass' | 'double' | 'request' | 'results' | 'waiting';
type Options = {
  game: 'spades' | 'hearts' | 'trix'; phase: TablePresentationPhase; lastTrickVisible: boolean;
  onHandClearance?: (pixels: number) => void;
};

/** Sizes presentation containers only; never changes a hand, decision or server phase.
 * Call before useCardThrows so it measures the final public-card destination. */
export function useResponsiveTableFit({ game, phase, lastTrickVisible, onHandClearance }: Options) {
  const root = useRef<HTMLElement | null>(null), clearance = useRef(-1);
  const report = useRef(onHandClearance);
  report.current = onHandClearance;
  const ref = useCallback((element: HTMLElement | null) => { root.current = element; }, []);
  const fit = useCallback(() => {
    const main = root.current, table = main?.querySelector<HTMLElement>('.table-zone');
    const hand = main?.querySelector<HTMLElement>('.hand-section');
    if (!main || !table || !hand || main.clientWidth <= 0 || main.clientHeight <= 0) return;
    // Apply the height breakpoint before reading its padding in this same pass.
    main.dataset.rallyCompact = String(main.clientHeight <= 520);
    main.dataset.rallyPhase = phase;
    main.dataset.game = game;
    const style = getComputedStyle(main);
    const padding = { left: parseFloat(style.paddingLeft) || 0, right: parseFloat(style.paddingRight) || 0,
      top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
    const metrics = rallyFrameMetrics({ width: main.clientWidth, height: main.clientHeight, padding, overlapHandLift: phase === 'jacks' });
    const put = (node: HTMLElement, key: string, value: string) => {
      if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value);
    };
    for (const [name, value] of Object.entries({
      'hand-width': metrics.handWidth, 'hand-lift': metrics.handLift, 'hand-left': metrics.handInsetLeft, 'hand-right': metrics.handInsetRight,
      'row-gap': metrics.rowGap, 'preview-card': metrics.previewCard, 'preview-width': metrics.previewWidth, 'preview-height': metrics.previewHeight,
      avatar: metrics.avatar, 'name-size': metrics.nameSize, 'detail-size': metrics.detailSize,
    })) put(main, `--rally-${name}`, `${value}px`);
    put(main, '--rally-jacks-max', String(metrics.maxJacksCard));
    const preview = main.querySelector<HTMLElement>('.rally-last');
    table.classList.toggle('rally-pocket-table', lastTrickVisible);
    let placement = { tableWidth: metrics.preferredWidth, tableLeft: (metrics.contentWidth - metrics.preferredWidth) / 2 };
    put(table, '--rally-east-offset', '0px');
    table.style.removeProperty('--rally-pocket-felt-right');
    if (preview && lastTrickVisible) {
      const inset = parseFloat(getComputedStyle(table).getPropertyValue('--rally-felt-right')) || 30;
      const pocket = lastTrickPocket({ contentWidth: metrics.contentWidth, preferredWidth: metrics.preferredWidth,
        feltRightInset: inset, previewWidth: metrics.previewWidth });
      placement = pocket;
      put(table, '--rally-pocket-felt-right', `${pocket.feltRightInset}px`);
      put(preview, 'left', `${padding.left + pocket.previewLeft}px`);
      put(preview, 'top', `${padding.top}px`);
    }
    put(table, 'width', `${placement.tableWidth}px`);
    put(table, 'margin-left', `${placement.tableLeft}px`);
    const zone = table.getBoundingClientRect(), felt = table.querySelector<HTMLElement>('.table-felt')?.getBoundingClientRect();
    if (!felt) return;
    if (preview && lastTrickVisible) {
      const actual = [...preview.querySelectorAll<HTMLElement>('.last-trick-card')].map(node => node.getBoundingClientRect());
      const cards = actual.length ? actual : emptyPreviewCards(preview.getBoundingClientRect(), metrics.previewCard);
      const east = [...table.querySelectorAll<HTMLElement>('.player-3 .avatar,.player-3 .player-info')].map(node => node.getBoundingClientRect());
      const south = table.querySelector<HTMLElement>('.player-0')?.getBoundingClientRect();
      const maxBottom = Math.max(...east.map(rect => rect.bottom), 0);
      const lower = south && east.some(rect => rect.left < south.right && rect.right > south.left)
        ? Math.min(zone.bottom - 6, south.top - 4) : zone.bottom - 6;
      const avoid = clearPreviewCards(cards, east, Math.max(0, lower - maxBottom), 4);
      put(table, '--rally-east-offset', `${avoid.shift}px`);
      preview.dataset.fit = avoid.fits ? 'clear' : 'limited';
    }
    const trick = table.querySelector<HTMLElement>('.trick-area');
    // Hearts/Spades reuse this element for prompts; do not fit those as a pile.
    if (trick && phase === 'play') {
      const obstacles = [...table.querySelectorAll<HTMLElement>('.player,.announced-cards')].map(node => node.getBoundingClientRect());
      const result = fitRallyTrick({ bounds: { left: felt.left + 8, right: felt.right - 8, top: felt.top + 6, bottom: felt.bottom - 6 },
        obstacles, center: { x: zone.left + zone.width / 2, y: zone.top + zone.height / 2 }, maxCardWidth: metrics.maxTableCard });
      if (result) {
        put(table, '--table-card-width', `${result.cardWidth}px`);
        put(trick, 'left', `${result.x - zone.left}px`); put(trick, 'top', `${result.y - zone.top}px`);
      } else {
        table.style.removeProperty('--table-card-width'); trick.style.removeProperty('left'); trick.style.removeProperty('top');
      }
      put(trick, 'visibility', result ? 'visible' : 'hidden');
    } else if (trick) {
      for (const property of ['left', 'top', 'visibility']) trick.style.removeProperty(property);
    }
    main.dispatchEvent(new Event('rally-fit'));
    const value = Math.ceil(Math.max(0, Math.min(main.clientHeight, main.getBoundingClientRect().bottom - hand.getBoundingClientRect().top +
      (phase === 'jacks' ? metrics.handLift : 0) + 4)));
    if (Number.isFinite(value) && value !== clearance.current) { clearance.current = value; report.current?.(value); }
  }, [game, phase, lastTrickVisible]);

  useLayoutEffect(fit);
  useLayoutEffect(() => {
    const main = root.current;
    if (!main) return;
    let scheduled = 0;
    const queue = () => { if (!scheduled) scheduled = requestAnimationFrame(() => { scheduled = 0; fit(); }); };
    const observer = new ResizeObserver(queue);
    observer.observe(main);
    main.querySelectorAll('.player,.announced-cards').forEach(node => observer.observe(node));
    window.addEventListener('resize', queue);
    return () => { cancelAnimationFrame(scheduled); observer.disconnect(); window.removeEventListener('resize', queue); };
  }, [fit]);
  return ref;
}
