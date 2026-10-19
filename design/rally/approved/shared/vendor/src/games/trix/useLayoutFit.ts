import { useLayoutEffect, useRef } from 'react';

/** Fit the public Jack lanes between the existing seats and announcements. */
export function useLayoutFit() {
  const ref = useRef<HTMLElement>(null);
  function fit() {
    const board = ref.current, table = board?.closest<HTMLElement>('.table-zone');
    if (!board || !table) return; // Saved review boards keep their compact CSS sizing.
    const zone = table.getBoundingClientRect();
    const felt = table.querySelector('.table-felt')!.getBoundingClientRect();
    const players = [0, 1, 2, 3].map(seat => table.querySelector(`.player-${seat}`)!.getBoundingClientRect());
    const spread = Number(getComputedStyle(board).getPropertyValue('--layout-spread'));
    const step = spread ? .25 : .58, gap = spread ? .28 : .4;
    const widthUnits = 4 * (1 + 2 * spread) + 3 * gap;
    const heightUnits = 12 * step + 82.4 / 57.6;
    const centerX = zone.left + zone.width / 2;
    type Space = { left: number; right: number; top: number; bottom: number };
    const bounds: Space = {
      left: Math.max(felt.left + 12, players[1].right + 10),
      right: Math.min(felt.right - 12, players[3].left - 10),
      top: Math.max(felt.top + 12, players[2].bottom + 10),
      bottom: Math.min(felt.bottom - 12, players[0].top - 10),
    };
    const centerY = (bounds.top + bounds.bottom) / 2;
    // Find the largest clear rectangle without moving any announced card.
    // A small sideways adjustment can avoid a North announcement while keeping
    // the useful height of the table, rather than shrinking every lane below it.
    let spaces = [bounds];
    for (const element of table.querySelectorAll('.announced-cards')) {
      const r = element.getBoundingClientRect();
      const obstacle = { left: r.left - 8, right: r.right + 8, top: r.top - 8, bottom: r.bottom + 8 };
      spaces = spaces.flatMap(space => {
        if (obstacle.right <= space.left || obstacle.left >= space.right ||
            obstacle.bottom <= space.top || obstacle.top >= space.bottom) return [space];
        return [
          { ...space, right: obstacle.left }, { ...space, left: obstacle.right },
          { ...space, bottom: obstacle.top }, { ...space, top: obstacle.bottom },
        ].filter(s => s.right > s.left && s.bottom > s.top);
      });
    }
    const placements = spaces.map(space => {
      const width = Math.max(0, Math.floor(Math.min(56,
        (space.right - space.left) / widthUnits, (space.bottom - space.top) / heightUnits) * 10) / 10);
      const x = Math.max(space.left + width * widthUnits / 2, Math.min(centerX, space.right - width * widthUnits / 2));
      const y = Math.max(space.top + width * heightUnits / 2, Math.min(centerY, space.bottom - width * heightUnits / 2));
      return { width, x, y, distance: Math.abs(x - centerX) + Math.abs(y - centerY) };
    });
    placements.sort((a, b) => b.width - a.width || a.distance - b.distance);
    const placement = placements[0];
    if (!placement) return;
    const { width, x, y } = placement;
    if (!width) return;
    board.style.setProperty('--layout-width', `${width}px`);
    board.style.setProperty('--layout-step', `${width * step}px`);
    board.style.setProperty('--layout-gap', `${width * gap}px`);
    board.style.left = `${x - zone.left}px`;
    board.style.top = `${y - zone.top}px`;
  }
  // Layout effects run before the shared throw effect measures its destination.
  useLayoutEffect(fit);
  useLayoutEffect(() => {
    const table = ref.current?.closest('.table-zone');
    if (!table) return;
    const observer = new ResizeObserver(fit);
    observer.observe(table);
    table.querySelectorAll('.player').forEach(player => observer.observe(player));
    return () => observer.disconnect();
  }, []);
  return ref;
}
