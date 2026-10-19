/** Rally presentation geometry. Inputs are dimensions and public rank ranges only. */
export type Rect = { left: number; right: number; top: number; bottom: number };
type Point = { x: number; y: number };
type Padding = { left: number; right: number; top: number; bottom: number };
type FitOptions = { bounds: Rect; obstacles?: readonly Rect[]; center: Point; maxCardWidth: number; margin?: number };
export const CARD_ASPECT = 82.4 / 57.6;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const tenth = (value: number) => Math.floor(value * 10) / 10;

export function rallyFrameMetrics({ width, height, padding = { left: 12, right: 12, top: 4, bottom: 4 }, overlapHandLift = false }:
  { width: number; height: number; padding?: Padding; overlapHandLift?: boolean }) {
  const compact = height <= 520;
  const contentWidth = Math.max(0, width - padding.left - padding.right);
  const handInsetLeft = compact ? 72 : 92, handInsetRight = compact ? 8 : 24;
  const handAvailable = Math.max(0, contentWidth - handInsetLeft - handInsetRight);
  // Thirteen canonical cards at the maximum 62% overlap occupy 5.56 widths.
  const handWidth = tenth(Math.max(24, Math.min(clamp(height * .17, 50, 154), (handAvailable - 14) / 5.56)));
  const handLift = Math.ceil(handWidth * .31 + 4);
  // Jacks uses the lifted-card area as table space; the stationary hand stays fixed.
  const handHeight = handWidth * CARD_ASPECT + (overlapHandLift ? 0 : handLift);
  const rowGap = compact ? 2 : 6;
  const tableHeight = Math.max(0, height - padding.top - padding.bottom - handHeight - rowGap);
  const preferredWidth = Math.min(contentWidth, Math.max(Math.min(420, contentWidth), tableHeight * 1.8 + 140));
  const previewCard = tenth(clamp(height * .064, 22, 48));
  return { compact, contentWidth, handInsetLeft, handInsetRight, handAvailable, handWidth, handLift, handHeight, rowGap, tableHeight, preferredWidth,
    maxTableCard: tenth(clamp(height * .15, 40, 136)), maxJacksCard: tenth(clamp(height * .12, 36, 96)),
    previewCard, previewWidth: Math.ceil(previewCard * 3.3), previewHeight: Math.ceil(previewCard * CARD_ASPECT * 2.1),
    avatar: tenth(clamp(height * .055, 28, 44)), nameSize: tenth(clamp(height * .019, 12, 16)), detailSize: tenth(clamp(height * .016, 10, 13)) };
}

const positive = (r: Rect) => r.right > r.left && r.bottom > r.top;
const contains = (a: Rect, b: Rect) => a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom;
export function clearLayoutSpaces(bounds: Rect, obstacles: readonly Rect[] = [], margin = 6): Rect[] {
  if (!positive(bounds)) return [];
  let spaces = [bounds];
  for (const item of obstacles) {
    const obstacle = { left: item.left - margin, right: item.right + margin, top: item.top - margin, bottom: item.bottom + margin };
    spaces = spaces.flatMap(space => {
      if (obstacle.right <= space.left || obstacle.left >= space.right || obstacle.bottom <= space.top || obstacle.top >= space.bottom) return [space];
      return [{ ...space, right: obstacle.left }, { ...space, left: obstacle.right }, { ...space, bottom: obstacle.top }, { ...space, top: obstacle.bottom }].filter(positive);
    });
    spaces = [...new Map(spaces.map(space => [Object.values(space).join(','), space])).values()];
    spaces = spaces.filter((space, index) => !spaces.some((other, j) => j !== index && contains(other, space)));
  }
  return spaces;
}

function placement(space: Rect, widthUnits: number, heightUnits: number, maxCardWidth: number, center: Point, centered: boolean, centeredY = false) {
  const span = centered ? 2 * Math.min(center.x - space.left, space.right - center.x) : space.right - space.left;
  const verticalSpan = centeredY ? 2 * Math.min(center.y - space.top, space.bottom - center.y) : space.bottom - space.top;
  const cardWidth = tenth(Math.min(maxCardWidth, span / widthUnits, verticalSpan / heightUnits));
  if (!(cardWidth > 0)) return null;
  const width = cardWidth * widthUnits, height = cardWidth * heightUnits;
  const x = centered ? center.x : clamp(center.x, space.left + width / 2, space.right - width / 2);
  const y = centeredY ? center.y : clamp(center.y, space.top + height / 2, space.bottom - height / 2);
  return { cardWidth, width, height, x, y, left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2,
    distance: Math.abs(x - center.x) + Math.abs(y - center.y) };
}

export function fitRallyTrick({ bounds, obstacles = [], center, maxCardWidth, margin = 6 }: FitOptions) {
  const candidates = clearLayoutSpaces(bounds, obstacles, margin)
    .map(space => placement(space, 2.2, CARD_ASPECT * 2.84, maxCardWidth, center, true))
    .filter((value): value is NonNullable<typeof value> => value !== null);
  candidates.sort((a, b) => b.cardWidth - a.cardWidth || a.distance - b.distance);
  return candidates[0] ?? null;
}

export function fitRallyJacks({ bounds, obstacles = [], center, maxCardWidth, margin = 6 }:
  FitOptions & { rows: readonly { low: number; high: number }[] }) {
  // Reserve every rank before the first play; occupancy must not change geometry.
  const low = 2, high = 14, firstRow = 0, rankSpan = 12;
  // One overlapping stack per suit, including short screens and saved playback.
  // A three-column fan changes the reading order even if it fits larger faces.
  const modes = [{ spread: 0, step: .58, gap: .4 }];
  const candidates = modes.flatMap(mode => {
    const widthUnits = 4 * (1 + 2 * mode.spread) + 3 * mode.gap, heightUnits = rankSpan * mode.step + CARD_ASPECT;
    return clearLayoutSpaces(bounds, obstacles, margin).flatMap(space => {
      // Center is a layout invariant, not a tie-breaker after face size.
      const fit = placement(space, widthUnits, heightUnits, maxCardWidth, center, true, true);
      return fit ? [{ ...fit, ...mode, firstRow, low, high, widthUnits, heightUnits }] : [];
    });
  });
  candidates.sort((a, b) => b.cardWidth - a.cardWidth || a.distance - b.distance || a.spread - b.spread);
  return candidates[0] ?? null;
}

/** Keep a public announcement near its owner without covering any player tag.
 * The felt rim is decorative and may run through the cards. */
export function fitRallyAnnouncement({bounds,obstacles=[],center,width,height,margin=4}:
  {bounds:Rect;obstacles?:readonly Rect[];center:Point;width:number;height:number;margin?:number}) {
  const candidates=clearLayoutSpaces(bounds,obstacles,margin).filter(space=>
    space.right-space.left>=width&&space.bottom-space.top>=height).map(space=>{
      const x=clamp(center.x,space.left+width/2,space.right-width/2);
      const y=clamp(center.y,space.top+height/2,space.bottom-height/2);
      return {x,y,left:x-width/2,right:x+width/2,top:y-height/2,bottom:y+height/2,
        distance:Math.abs(x-center.x)+Math.abs(y-center.y)};
    });
  candidates.sort((a,b)=>a.distance-b.distance);
  return candidates[0]??null;
}

/** Invisible, stable clearance around content-sized Jacks tags. Measuring the
 * visible tag would resize the board whenever its remaining-card fan shrinks. */
export function rallyJacksPlayerSlots({zone,compact,avatarSize,playerWidth}:
  {zone:Rect;compact:boolean;avatarSize:number;playerWidth?:number}): Rect[] {
  const width=playerWidth??(compact?160:208),height=avatarSize+8;
  const centerX=(zone.left+zone.right)/2,centerY=(zone.top+zone.bottom)/2;
  const slot=(left:number,top:number):Rect=>({left,right:left+width,top,bottom:top+height});
  return [slot(centerX-width/2,zone.bottom-height),slot(zone.left,centerY-height/2),
    slot(centerX-width/2,zone.top),slot(zone.right-width,centerY-height/2)];
}

/** Permanent presentation pockets for up to three public twos per seat.
 * Empty/revealed/played announcements all reserve the same board clearance. */
export function rallyJacksAnnouncementSlots({zone,felt,players,cardWidth,compact}:
  {zone:Rect;felt:Rect;players:readonly Rect[];cardWidth:number;compact:boolean}): (Rect|null)[] {
  if(players.length!==4) return [null,null,null,null];
  const width=cardWidth*2.1,height=cardWidth*CARD_ASPECT;
  const slot=(left:number,bottom:number):Rect=>({left,right:left+width,top:bottom-height,bottom});
  const south=slot(compact?players[0].left-width-8:players[0].right+8,players[0].bottom-8);
  const north=slot(players[2].right+14,Math.max(zone.top+height,players[2].bottom-8));
  const slots:(Rect|null)[]=[south,null,north,null];
  for(const seat of [1,3]) {
    const owner=players[seat];
    slots[seat]=fitRallyAnnouncement({
      bounds:{left:seat===1?zone.left:Math.max(zone.left,owner.left-width-8),
        right:seat===1?Math.min(zone.right,owner.right+width+8):zone.right,top:zone.top,bottom:zone.bottom},
      obstacles:[...players,south,north],center:{x:seat===1?felt.left:felt.right,y:owner.bottom+4+height/2},width,height,
    });
  }
  return slots;
}

export function lastTrickPocket({ contentWidth, preferredWidth, feltRightInset, previewWidth, gap = 30, maxGap = 100, minTableWidth = 278 }:
  { contentWidth: number; preferredWidth: number; feltRightInset: number; previewWidth: number; gap?: number; maxGap?: number; minTableWidth?: number }) {
  const minimum = Math.min(contentWidth, minTableWidth);
  const natural = Math.min(contentWidth, Math.max(minimum, preferredWidth));
  const tableWidth = Math.min(natural, Math.max(minimum, contentWidth - previewWidth - gap + feltRightInset));
  const inset = Math.max(feltRightInset, tableWidth - contentWidth + previewWidth + gap);
  const centeredLeft = (contentWidth - tableWidth) / 2;
  const cornerLeft = Math.max(0, contentWidth - previewWidth);
  const centeredFeltRight = centeredLeft + tableWidth - inset;
  const previewLeft = cornerLeft - centeredFeltRight > maxGap ? centeredFeltRight + maxGap : cornerLeft;
  const tableLeft = Math.min(centeredLeft, Math.max(0, previewLeft - gap - tableWidth + inset));
  return { tableWidth, tableLeft, previewLeft, feltRightInset: inset, gap: previewLeft - (tableLeft + tableWidth - inset) };
}

export function clearPreviewCards(cards: readonly Rect[], obstacles: readonly Rect[], maxShift: number, clearance = 2) {
  let shift = 0;
  for (let iteration = 0; iteration < cards.length * obstacles.length + 1; iteration++) {
    let next = shift;
    for (const card of cards) for (const obstacle of obstacles) {
      if (card.left >= obstacle.right || card.right <= obstacle.left) continue;
      if (card.bottom <= obstacle.top + shift || card.top >= obstacle.bottom + shift) continue;
      next = Math.max(next, card.bottom + clearance - obstacle.top);
    }
    if (next === shift) return { shift, fits: true };
    if (next > maxShift) return { shift: maxShift, fits: false };
    shift = next;
  }
  return { shift, fits: false };
}

export function emptyPreviewCards(rect: Rect & { width: number; height: number }, cardWidth: number): Rect[] {
  const height = cardWidth * CARD_ASPECT, center = (rect.width - cardWidth) / 2, sideTop = (rect.height - height) / 2;
  return [[center, 0], [0, sideTop], [rect.width - cardWidth, sideTop], [center, rect.height - height]]
    .map(([x, y]) => ({ left: rect.left + x, right: rect.left + x + cardWidth, top: rect.top + y, bottom: rect.top + y + height }));
}
