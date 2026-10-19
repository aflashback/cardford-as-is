import { useLayoutEffect, useRef } from 'react';
import type { TrixObservation } from '../../../shared/local-service.contracts';
import { fitRallyJacks, rallyJacksAnnouncementSlots, rallyJacksPlayerSlots, type Rect } from '../../table/responsiveGeometry';

/** Fit the public Jack lanes between the existing seats and announcements. */
export function useLayoutFit(publicBoard: TrixObservation['board'], partners = false) {
  const ref = useRef<HTMLElement>(null);
  function fit() {
    const board = ref.current, table = board?.closest<HTMLElement>('.table-zone');
    if (!board || !table) return; // Saved review boards keep their compact CSS sizing.
    const zone = table.getBoundingClientRect();
    const felt = table.querySelector('.table-felt')!.getBoundingClientRect();
    const main = table.closest<HTMLElement>('.rally-game-shell');
    if (main) {
      const players=[0,1,2,3].map(seat=>table.querySelector<HTMLElement>(`.player-${seat}`)!);
      const style=getComputedStyle(main),compact=main.dataset.rallyCompact==='true';
      const avatarSize=parseFloat(style.getPropertyValue('--rally-avatar'))||28;
      const detailSize=parseFloat(style.getPropertyValue('--rally-detail-size'))||12;
      const measure=document.createElement('canvas').getContext('2d');
      if(measure) measure.font=`${detailSize}px ${style.fontFamily}`;
      // Names/font size stay fixed for a deal. Reserve a full opponent fan and
      // the largest Jacks award, even while the actor count and scores are hidden.
      // Never measure the changing visible tag or the shrinking card-count fan.
      const nameWidth=Math.max(...players.map(player=>player.querySelector('.player-name')!.getBoundingClientRect().width));
      const scoreWidth=measure?.measureText('200').width??detailSize*3;
      const playerWidth=Math.ceil(avatarSize+nameWidth+scoreWidth+(compact?42:52)+6+
        (compact?8:16)+3*(compact?4:6));
      const playerBounds=rallyJacksPlayerSlots({zone,compact,avatarSize,playerWidth});
      // Solo has no two announcements. Partners keep their pockets even when
      // empty so reveal/consumption cannot resize or move the rank columns.
      const slots=partners?rallyJacksAnnouncementSlots({zone,felt,players:playerBounds,
        cardWidth:parseFloat(getComputedStyle(main).getPropertyValue('--rally-two-width'))||43.2,
        compact}):[null,null,null,null];
      // Position visible twos inside their permanent pockets. Their removal
      // or reveal changes only content, never the space available to the board.
      for(const seat of [0,1,2,3]) {
        const player=players[seat];
        const twos=player?.querySelector<HTMLElement>('.trix-two-announcements');
        const slot=slots[seat];
        if(!player||!twos||!slot) continue;
        const owner=player.getBoundingClientRect(), cards=twos.getBoundingClientRect();
        twos.style.left=`${(slot.left+slot.right-cards.width)/2-owner.left}px`;
        twos.style.top=`${slot.top-owner.top}px`;
        twos.style.right='auto';twos.style.bottom='auto';twos.style.transform='none';
      }
      const obstacles = [...playerBounds,...slots.filter((slot):slot is Rect=>slot!==null)];
      const result = fitRallyJacks({ bounds: { left: felt.left + 8, right: felt.right - 8, top: felt.top + 6, bottom: felt.bottom - 6 },
        obstacles, center: { x: (felt.left + felt.right) / 2, y: (felt.top + felt.bottom) / 2 },
        maxCardWidth: Number(getComputedStyle(main).getPropertyValue('--rally-jacks-max')) || 48, rows: publicBoard });
      board.dataset.fit = result ? 'clear' : 'limited';
      board.style.visibility = result ? 'visible' : 'hidden';
      if (!result) {
        for (const property of ['--layout-width', '--layout-step', '--layout-gap', '--layout-spread', '--layout-first-row', '--layout-rank-span', '--rally-layout-stack', 'left', 'top']) board.style.removeProperty(property);
        return;
      }
      for (const [name, value] of Object.entries({
        '--layout-width': `${result.cardWidth}px`, '--layout-step': `${result.cardWidth * result.step}px`,
        '--layout-gap': `${result.cardWidth * result.gap}px`, '--layout-spread': String(result.spread),
        '--layout-first-row': String(result.firstRow), '--layout-rank-span': String(result.high - result.low),
        '--rally-layout-stack': result.spread ? '20' : '0', left: `${result.x - zone.left}px`, top: `${result.y - zone.top}px`,
      })) board.style.setProperty(name, value);
      return;
    }
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
    table.querySelectorAll('.player,.announced-cards').forEach(player => observer.observe(player));
    const main = table.closest('.rally-game-shell');
    main?.addEventListener('rally-fit', fit);
    return () => { observer.disconnect(); main?.removeEventListener('rally-fit', fit); };
  }, [publicBoard, partners]);
  return ref;
}
