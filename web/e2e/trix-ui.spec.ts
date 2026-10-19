import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { TrixObservation, TrixTrick } from '../shared/local-service.contracts';
import type { TrixCandidate } from '../src/games/trix/adapter';
import type { TrixUIFixture } from './trix-ui-fixture';
import { faceSignatures, sameFaces } from './card-face-contract';
import { landscapeReviewSizes, landscapeDevices } from './landscape-devices';
import { freezeThrows, verifyThrow } from './card-throws';
import { holdCard, verifyHandDrag } from './hand-gestures';

declare global { interface Window { trixFixture: TrixUIFixture } }
const evidence = resolve('qa/implementation/trix/shared-table');
const variants = ['basic-solo', 'basic-partners', 'complex-solo', 'complex-partners'] as const;
async function mount(page: Page, query = '') {
  await page.goto(`/e2e/trix-ui.html${query ? `?${query}` : ''}`);
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
}
async function update(page: Page, patch: Partial<TrixObservation>, candidates?: TrixCandidate[]) {
  await page.evaluate(({ patch, candidates }) => window.trixFixture.update(patch, candidates), { patch, candidates });
}
async function pauseClock(page: Page) {
  await page.clock.install({ time: new Date('2026-10-08T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-08T13:00:00Z'));
}
const trick: TrixTrick = { number: 1, leader: 2, winner: 1, plays: [
  { seat: 2, card: 'H7' }, { seat: 3, card: 'H6' }, { seat: 0, card: 'H3' }, { seat: 1, card: 'HK' },
] };

for (const variant of ['basic-partners', 'complex-partners'] as const) {
  test(`${variant}: twos announcements follow only the public reveal and original owners`, async ({ page }) => {
    await pauseClock(page);
    await mount(page, `variant=${variant}&phase=layout`);
    await update(page, { twoAnnouncements: { status: 'hidden', counts: [2, 1, 0, 1] } });
    const announcements = page.locator('.trix-two-announcements');
    await expect(announcements).toHaveCount(3);
    await expect(page.locator('.player-0 .announced-two-back')).toHaveCount(2);
    await expect(page.locator('.player-2 .trix-two-announcements')).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Your 2 announced twos, face down', exact: true })).toBeVisible();
    await expect(announcements.locator('.card-face')).toHaveCount(0);
    expect(await announcements.evaluateAll(nodes => nodes.map(n => n.outerHTML).join(''))).not.toMatch(/C2|D2|H2|S2|card-corner|card-pip/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.hand-cards .hand-card')).toHaveCount(13);
    await expect(page.locator('.player-0 .remaining-cards')).toHaveAttribute('aria-label', '13 cards left');
    await page.clock.runFor(5000);
    await expect(announcements.locator('.card-face')).toHaveCount(0);
    expect(await page.evaluate(() => window.trixFixture.commands)).toEqual([]);
    await update(page, { twoAnnouncements: { status: 'revealed', cards: [
      { seat: 0, card: 'C2' }, { seat: 0, card: 'H2' }, { seat: 1, card: 'D2' }, { seat: 3, card: 'S2' },
    ] } });
    await expect(page.locator('.announced-two-back')).toHaveCount(0);
    await expect(announcements.locator('.card-face')).toHaveCount(4);
    await expect(page.locator('.player-0').getByRole('img', { name: 'Announced 2 of clubs', exact: true })).toBeVisible();
    await expect(page.locator('.player-1').getByRole('img', { name: 'Announced 2 of diamonds', exact: true })).toBeVisible();
    expect(await announcements.evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')).join(''))).not.toContain('doubled');
    await expect(page.locator('.hand-cards .hand-card')).toHaveCount(13);
    await expect(page.locator('.player-0 .remaining-cards')).toHaveAttribute('aria-label', '13 cards left');
    await update(page, { board: [
      { suit: 'C', low: 2, high: 11 }, { suit: 'D', low: 0, high: 0 },
      { suit: 'H', low: 0, high: 0 }, { suit: 'S', low: 0, high: 0 },
    ] });
    await expect(announcements.locator('.card-face')).toHaveCount(3);
    await expect(page.locator('.player-0 .trix-two-announcements').getByRole('img', { name: 'Announced 2 of clubs', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.trixFixture.commands)).toEqual([]);
  });
}

test('twos announcement exact counts and shared faces fit desktop and phone landscape', async ({ page }) => {
  await pauseClock(page);
  await mount(page, 'variant=complex-partners&phase=layout');
  for (const viewport of [...landscapeReviewSizes, { name: 'annotated preview', width: 876, height: 668 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const count of [0, 1, 2, 3, 4]) {
      // Count-four is a renderer boundary fixture, not a claim that the rule enables a one-team split.
      const counts = [0, 4 - count, count, 0];
      await update(page, { twoAnnouncements: { status: 'hidden', counts } });
      for (const seat of [0, 1, 2, 3]) await expect(page.locator(`.player-${seat} .announced-two-back`)).toHaveCount(counts[seat]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight)).toBe(false);
      const boxes = await page.locator('.trix-two-announcements > span').evaluateAll(nodes => nodes.map(n => {
        const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }));
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(viewport.width);
        expect(box.top).toBeGreaterThanOrEqual(0); expect(box.bottom).toBeLessThanOrEqual(viewport.height);
      }
      const north = page.locator('.player-2 .trix-two-announcements');
      if (count) {
        const cards = (await north.boundingBox())!, badge = (await page.locator('.player-2').boundingBox())!;
        const board = (await page.locator('.trix-layout').boundingBox())!;
        expect(cards.x).toBeGreaterThanOrEqual(badge.x + badge.width + 13);
        expect(cards.y + cards.height).toBeLessThanOrEqual(badge.y + badge.height);
        expect(cards.x >= board.x + board.width || cards.x + cards.width <= board.x ||
          cards.y >= board.y + board.height || cards.y + cards.height <= board.y).toBe(true);
      }
    }
    await update(page, { twoAnnouncements: { status: 'hidden', counts: [1, 1, 1, 1] } });
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, `twos-hidden-${viewport.width}.png`) });
    await update(page, { twoAnnouncements: { status: 'revealed', cards: [
      { seat: 0, card: 'C2' }, { seat: 1, card: 'D2' }, { seat: 2, card: 'H2' }, { seat: 3, card: 'S2' },
    ] } });
    await expect(page.locator('.trix-two-announcements .card-face')).toHaveCount(4);
    const northFace = (await page.locator('.player-2 .trix-two-announcements').boundingBox())!;
    const northBadge = (await page.locator('.player-2').boundingBox())!;
    expect(northFace.x).toBeGreaterThanOrEqual(northBadge.x + northBadge.width + 13);
    expect(northFace.y + northFace.height).toBeLessThanOrEqual(northBadge.y + northBadge.height);
    const signatures = await faceSignatures(page); sameFaces(signatures, signatures[0]);
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, `twos-announcements-${viewport.width}.png`) });
  }
});

for (const variant of ['basic-partners', 'complex-partners']) {
  test(`${variant}: player name tags show individual round points while corner totals stay combined`, async ({ page }) => {
    await mount(page, `variant=${variant}`);
    await update(page, { dealNumber: 2, ledger: [], requestSeatTotals: [-50, 0, -25, 0],
    requestTotals: [{ id: 'NS', seats: [0, 2], total: -50 }, { id: 'EW', seats: [1, 3], total: -50 }],
    totals: [{ id: 'NS', seats: [0, 2], total: 150 }, { id: 'EW', seats: [1, 3], total: -50 }] });
    for (const [seat, value] of ['-50', '0', '-25', '0'].entries())
      await expect(page.locator(`.player-${seat} .trix-seat-score`)).toHaveText(value);
    await expect(page.locator('.table-total strong')).toHaveText(['150', '-50', '-50', '150']);
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, `${variant}-individual-scores.png`) });
    await update(page, { dealNumber: 3, requestSeatTotals: [0, 0, 0, 0] });
    await expect(page.locator('.trix-seat-score')).toHaveText(['0', '0', '0', '0']);
  });
}

test('smaller felt preserves the size and position of seats, held, played and announced cards', async ({ page }) => {
  await pauseClock(page);
  await mount(page, 'variant=complex-partners');
  await update(page, {
    trick: [{ seat: 1, card: 'C3' }, { seat: 2, card: 'C4' }],
    declarations: [{ seat: 0, cards: ['HQ'], ref: 'south' }, { seat: 1, cards: ['DQ'], ref: 'west' },
      { seat: 2, cards: ['CQ'], ref: 'north' }, { seat: 3, cards: ['SQ'], ref: 'east' }],
  });
  const geometry = await page.evaluate(() => {
    const felt = document.querySelector<HTMLElement>('.table-felt')!;
    const elements = [...document.querySelectorAll('.player, .hand-card, .announced-cards .card-face, .trick-slot .card-face, .last-trick')];
    const rectangles = () => elements.map(e => e.getBoundingClientRect().toJSON());
    const scaled = felt.getBoundingClientRect().toJSON(), before = rectangles();
    felt.style.transform = 'none';
    const original = felt.getBoundingClientRect().toJSON(), after = rectangles();
    felt.style.removeProperty('transform');
    return { scaled, original, before, after };
  });
  expect(geometry.before).toEqual(geometry.after);
  expect(geometry.scaled.width / geometry.original.width).toBeCloseTo(.9, 4);
  expect(geometry.scaled.height / geometry.original.height).toBeCloseTo(.9, 4);
});

test('Trix Jacks request naming and absent announcements preserve all four game headers', async ({ page }) => {
  await pauseClock(page);
  for (const variant of variants) {
    await mount(page, `variant=${variant}&phase=layout`);
    await expect(page.locator('.game-switch b')).toHaveText('Trix');
    await expect(page.locator('.trix-two-announcements')).toHaveCount(0);
    await update(page, { phase: 'choose-request', request: null }, [{ id: 'choose-trix', public: { kind: 'choose-request', request: 'trix' } }]);
    await expect(page.getByRole('button', { name: /Trix Jacks/ })).toBeVisible();
    if (variant.endsWith('solo')) {
      await update(page, { phase: 'layout', request: 'trix', twoAnnouncements: { status: 'hidden', counts: [1, 1, 1, 1] } });
      await expect(page.locator('.trix-two-announcements')).toHaveCount(0);
    } else {
      await update(page, { phase: 'playing', request: 'queens', twoAnnouncements: { status: 'hidden', counts: [1, 1, 1, 1] } });
      await expect(page.locator('.trix-two-announcements')).toHaveCount(0);
    }
  }
});

for (const variant of variants) {
  test(`${variant}: corner score totals have no heading or switch; kingdom totals stay in Scores`, async ({ page }) => {
    await mount(page, `variant=${variant}`);
    const groups: TrixObservation['totals'] = variant.endsWith('partners')
      ? [{ id: 'NS', seats: [0, 2], total: -125 }, { id: 'EW', seats: [1, 3], total: -75 }]
      : [0, 1, 2, 3].map((seat, i) => ({ id: `seat-${seat}`, seats: [seat as 0 | 1 | 2 | 3], total: [-125, -75, 50, -25][i] }));
    await update(page, { totals: groups, kingdomTotals: groups.map((score, i) => ({ ...score, total: [250, 125, 50, 25][i] })) });
    const totals = page.locator('.table-totals');
    await expect(totals).toHaveAttribute('aria-label', 'Game score totals');
    await expect(totals.locator('.table-total')).toHaveCount(4);
    await expect(totals.locator('.total-seat')).toHaveCount(0);
    expect(await totals.locator('.total-leading').evaluateAll(chips => chips.map(chip => chip.getAttribute('data-seat'))))
      .toEqual(variant.endsWith('partners') ? ['1', '3'] : ['2']);
    await expect(totals.locator('.total-trailing')).toHaveCount(variant.endsWith('partners') ? 2 : 3);
    await expect(totals.locator('button,.table-totals-scope')).toHaveCount(0);
    await expect(page.locator('.trix-seat-score')).toHaveText(['0', '0', '0', '0']);
    await page.getByRole('button', { name: 'Scores', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: 'Kingdom', exact: true })).toBeVisible();
    await expect(page.locator('.trix-score-sheet tbody tr').first()).toContainText('250');
    await page.keyboard.press('Escape');
    await update(page, { totals: groups.map(score => ({ ...score, total: 0 })) });
    await expect(totals.locator('.total-tied')).toHaveCount(4);
    await expect(totals.locator('.total-leading,.total-trailing')).toHaveCount(0);
  });
}

for (const variant of variants) {
  test(`${variant}: shared trick, hand, seats and permanent last-trick slot`, async ({ page }) => {
    await page.setViewportSize({ width: 854, height: 668 });
    await mount(page, `variant=${variant}`);
    const history = page.locator('.last-trick');
    const before = await history.boundingBox();
    await expect(history).toBeVisible();
    await expect(history).toHaveText('');
    await expect(page.locator('.remaining-cards')).toHaveCount(4);
    await expect(page.locator('.hand-cards .hand-card')).toHaveCount(13);
    await expect(page.locator('.player-0 .trix-kingdom-owner')).toHaveAttribute('aria-label', 'You: kingdom owner');
    await expect(page.locator('.trix-kingdom-owner')).toHaveCount(1);
    await expect(page.locator('.trix-context,.trix-score-sidebar,.trix-hand-card')).toHaveCount(0);
    await expect(page.locator('.partner-label')).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Your partner', exact: true })).toHaveCount(variant.endsWith('partners') ? 1 : 0);
    for (const turn of [0, 1, 2, 3] as const) {
      await update(page, { turn });
      await expect(page.locator('.player-active')).toHaveCount(1);
      await expect(page.locator(`.player-${turn} .turn-dot`)).toHaveAttribute('aria-label', 'Current player');
      await expect(page.locator(`.player-${turn} .avatar`)).toHaveCSS('box-shadow', /rgb\(180, 133, 60\)/);
    }
    await update(page, { owner: 2, turn: 0, trick: trick.plays, handCounts: [4, 3, 2, 1] });
    await expect(page.locator('.player-2 .trix-kingdom-owner')).toHaveAttribute('aria-label', 'Maya: kingdom owner');
    await expect(page.locator('.trix-kingdom-owner')).toHaveCount(1);
    await expect(page.locator('.trick-slot')).toHaveCount(4);
    await expect(page.locator('.winning-card')).toHaveAttribute('aria-label', /Leo: King of hearts, currently winning/);
    const layout = await page.locator('.trick-area').evaluate(area => {
      const cards = [...area.querySelectorAll<HTMLElement>('.trick-slot')];
      const left = area.querySelector<HTMLElement>('.trick-slot-1')!.getBoundingClientRect();
      const right = area.querySelector<HTMLElement>('.trick-slot-3')!.getBoundingClientRect();
      const face = cards[0].querySelector<HTMLElement>('.card-face')!;
      return { width: face.offsetWidth, gap: right.left - left.right,
        winner: getComputedStyle(area.querySelector('.winning-card')!).zIndex,
        depths: cards.filter(c => !c.classList.contains('winning-card')).map(c => +getComputedStyle(c).zIndex) };
    });
    expect(layout.width).toBeLessThan(55);
    expect(layout.gap).toBeGreaterThan(0);
    expect(+layout.winner).toBeGreaterThan(Math.max(...layout.depths));
    for (const profile of [...landscapeReviewSizes, { name: 'review panel', width: 712, height: 668 }]) {
      await page.setViewportSize({ width: profile.width, height: profile.height });
      await expect.poll(() => page.evaluate(() => parseFloat(document.documentElement.style.getPropertyValue('--app-height')))).toBe(profile.height);
      const boxes = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON();
        const scoresClear = [...document.querySelectorAll('.table-total,.table-totals-scope')].every(chip => {
          const scores = chip.getBoundingClientRect();
          return ['.player-2', '.player-1 .avatar', '.player-1 .player-info'].every(selector => {
            const player = box(selector);
            return scores.right <= player.left || scores.left >= player.right || scores.bottom <= player.top || scores.top >= player.bottom;
          });
        });
        return { table: box('.table-zone'), north: box('.player-2'), south: box('.player-0'), hand: box('.hand-cards'), trick: box('.trick-area'),
          scoresClear, overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
      });
      expect(boxes.overflow, profile.name).toBe(false);
      expect(boxes.scoresClear, profile.name).toBe(true);
      expect(boxes.south.x + boxes.south.width / 2, profile.name).toBeCloseTo(boxes.table.x + boxes.table.width / 2, 0);
      expect(boxes.hand.y, profile.name).toBeGreaterThanOrEqual(boxes.south.bottom);
      expect(boxes.trick.y, profile.name).toBeGreaterThanOrEqual(boxes.north.bottom);
      expect(boxes.trick.bottom, profile.name).toBeLessThanOrEqual(boxes.south.y);
      await expect(page.locator('.player-0 .avatar')).toBeVisible();
      const badge = await page.locator('.player-0').evaluate(player => ({
        bottom: player.getBoundingClientRect().bottom,
        backs: [...player.querySelectorAll('.count-card-back')].map(card => card.getBoundingClientRect().bottom),
      }));
      expect(Math.max(...badge.backs), profile.name).toBeLessThan(badge.bottom);
      await expect(page.locator('.hand-section .player')).toHaveCount(0);
    }
    await page.setViewportSize({ width: 854, height: 668 });
    await update(page, { trick: [], tricks: [trick] });
    await expect(page.locator('.last-trick-card')).toHaveCount(4);
    expect(await history.boundingBox()).toEqual(before);
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, `${variant}-trick.png`) });
  });
}

for (const viewport of [...landscapeReviewSizes, { name: 'annotated preview', width: 876, height: 668 }, { name: 'narrow annotated preview', width: 730, height: 668 }]) {
  test(`vertical Jack lanes fit and expose ranks with a front suit on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mount(page, 'phase=layout');
    await expect(page.locator('.trix-empty-lane')).toHaveCount(0);
    await expect(page.locator('.trix-layout')).toHaveText('');
    await update(page, { board: ['C', 'D', 'H', 'S'].map(suit => ({ suit: suit as 'C'|'D'|'H'|'S', low: 2, high: 14 })) });
    await expect(page.locator('.trix-layout-row')).toHaveCount(4);
    await expect(page.locator('.trix-lane-label')).toHaveCount(0);
    await expect(page.locator('.trix-lane-cards > [role=img]')).toHaveCount(52);
    const geometry = await page.locator('.trix-layout').evaluate(board => {
      const rect = board.getBoundingClientRect(), zone = board.closest('.table-zone')!.getBoundingClientRect();
      const lanes = [...board.querySelectorAll('.trix-layout-row')].map(lane => {
        const cards = [...lane.querySelectorAll<HTMLElement>('[role=img]')];
        const exposed = (card: HTMLElement, glyph: Element) => {
          const g = glyph.getBoundingClientRect();
          return [.25, .75].every(dx => [.25, .75].every(dy => {
            const hit = document.elementFromPoint(g.left + g.width * dx, g.top + g.height * dy);
            return !!hit && card.contains(hit);
          }));
        };
        const front = cards.reduce((a, b) => +getComputedStyle(a).zIndex > +getComputedStyle(b).zIndex ? a : b);
        return { frontSuitVisible: exposed(front, front.querySelector('.card-pip')!), cards: cards.map(card => {
          const r = card.getBoundingClientRect();
          return { x: r.left, y: r.top, unobstructed: exposed(card, card.querySelector('.card-corner b')!) };
        }) };
      });
      const north = board.closest('.table-zone')!.querySelector('.player-2')!.getBoundingClientRect();
      const south = board.closest('.table-zone')!.querySelector('.player-0')!.getBoundingClientRect();
      return { rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        zone: { top: zone.top, bottom: zone.bottom, left: zone.left, right: zone.right }, lanes,
        northBottom: north.bottom, southTop: south.top,
        pageOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
    });
    await mkdir(evidence, { recursive: true });
    await writeFile(resolve(evidence, `vertical-layout-${viewport.width}.json`), JSON.stringify(geometry, null, 2));
    expect(geometry.pageOverflow).toBe(false);
    expect(geometry.rect.top).toBeGreaterThanOrEqual(geometry.zone.top);
    expect(geometry.rect.bottom).toBeLessThanOrEqual(geometry.zone.bottom);
    expect(geometry.rect.left).toBeGreaterThan(geometry.zone.left);
    expect(geometry.rect.right).toBeLessThan(geometry.zone.right);
    expect(geometry.rect.top).toBeGreaterThanOrEqual(geometry.northBottom);
    expect(geometry.rect.bottom).toBeLessThanOrEqual(geometry.southTop);
    for (const lane of geometry.lanes) {
      expect(lane.frontSuitVisible).toBe(true);
      for (let i = 0; i < lane.cards.length; i++) {
        if (viewport.height > 520) expect(lane.cards[i].x).toBe(lane.cards[0].x);
        expect(lane.cards[i].unobstructed).toBe(true);
        if (i) expect(lane.cards[i].y).toBeGreaterThan(lane.cards[i - 1].y);
      }
    }
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, `vertical-layout-${viewport.width}.png`) });
  });
}

test('forced layout pass is automatic and appears above the avatar until a card changes the board', async ({ page }) => {
  await pauseClock(page);
  await mount(page, 'phase=layout');
  await update(page, { hand: ['C2'], handCounts: [1, 2, 3, 4] }, [{ id: 'forced-pass', public: { kind: 'layout-pass' } }]);
  await page.clock.runFor(700);
  await expect(page.locator('.you-avatar .player-pass')).toHaveText('Pass');
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([
    { kind: 'candidate', candidateId: 'forced-pass' },
  ]);
  await update(page, { board: [{ suit: 'C', low: 11, high: 11 }, { suit: 'D', low: 0, high: 0 }, { suit: 'H', low: 0, high: 0 }, { suit: 'S', low: 0, high: 0 }] });
  await expect(page.locator('.player-pass')).toHaveCount(0);
});

for (const variant of variants) {
  test(`${variant}: compact doubling highlights only eligible cards and settles after confirmation`, async ({ page }) => {
    await mount(page, `variant=${variant}&phase=declare-doubles`);
    const prompt = page.locator('.trix-double-picker');
    await expect(prompt).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.trix-app')).not.toHaveAttribute('inert', '');
    await expect(prompt.locator('p,small,table,.card-face')).toHaveCount(0);
    await expect(page.locator('.hand-card:not(:disabled)')).toHaveCount(variant.startsWith('complex') ? 5 : 4);
    await expect(page.locator('.hand-card.recommended')).toHaveCount(0);
    await expect(prompt.getByRole('button', { name: 'Double', exact: true })).toBeDisabled();
    await expect(prompt.getByRole('button', { name: 'Pass', exact: true })).toBeEnabled();
    const colours = await page.locator('.hand-card:not(:disabled) .card-face').evaluateAll(cards => cards.map(card => {
      const css = getComputedStyle(card);
      return { opacity: css.opacity, filter: css.filter };
    }));
    expect(colours.every(c => c.opacity === '1' && c.filter === 'none')).toBe(true);
    const unavailable = page.locator('.hand-card.unplayable');
    await expect(unavailable).toHaveCount(variant.startsWith('complex') ? 8 : 9);
    for (const card of await unavailable.all()) {
      await expect(card).toBeDisabled();
      await expect(card.locator('.card-face')).toHaveCSS('opacity', '1');
      await expect(card.locator('.card-face')).toHaveCSS('filter', 'none');
      await expect(card.locator('.card-face')).toHaveCSS('background-color', 'rgb(214, 215, 214)');
      const face = card.locator('.card-face');
      await expect(face).toHaveCSS('color', (await face.getAttribute('class'))!.includes('red-card') ? 'rgb(181, 75, 97)' : 'rgb(37, 62, 77)');
    }
    const queen = page.getByRole('button', { name: 'Queen of hearts', exact: true });
    await queen.dblclick();
    await expect(queen).toHaveAttribute('aria-pressed', 'true');
    if (variant.startsWith('complex')) await page.getByRole('button', { name: 'King of hearts', exact: true }).dblclick();
    await expect(prompt.locator('.card-face')).toHaveCount(variant.startsWith('complex') ? 2 : 1);
    await expect(prompt.locator('.trix-double-preview button')).toHaveCount(0);
    await expect(prompt.getByRole('img', { name: 'Queen of hearts', exact: true })).toBeVisible();
    await prompt.getByRole('button', { name: 'Double', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await expect(page.locator('.hand-card.selected')).toHaveCount(0);
    const announced = page.locator('.you-label .announced-cards');
    await expect(announced.locator('[role=img]')).toHaveCount(variant.startsWith('complex') ? 2 : 1);
    await expect(announced.locator('button')).toHaveCount(0);
    const doubled = await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'));
    expect(doubled).toHaveLength(1);
    expect(doubled[0].cards).toEqual(variant.startsWith('complex') ? ['HQ', 'HK'] : ['HQ']);
    await update(page, { phase: 'playing', turn: 0 });
    await expect(page.locator('.hand-card.selected')).toHaveCount(0);
    await expect(queen).toHaveAttribute('aria-pressed', 'false');
    const size = await announced.locator('.card-face').first().boundingBox();
    expect(size?.width).toBeCloseTo(36, 1);
    expect(await announced.locator('.card-face').first().evaluate(card => getComputedStyle(card).transform)).toBe('none');
    await page.getByRole('button', { name: 'Queen of hearts', exact: true }).dblclick();
    await expect(announced.getByRole('img', { name: 'Doubled Queen of hearts' })).toHaveCount(0);
    if (variant.startsWith('complex')) await expect(announced.getByRole('img', { name: 'Doubled King of hearts' })).toBeVisible();
  });
}

test('table doubling prompt and all five previews clear the badge and hand on named landscape devices', async ({ page }) => {
  await mount(page, 'variant=complex-partners&phase=declare-doubles');
  for (const card of ['CQ', 'DQ', 'HQ', 'HK', 'SQ']) await page.locator(`[data-hand-card="${card}"]`).dblclick();
  for (const viewport of landscapeReviewSizes) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const prompt = page.locator('.trix-double-picker');
    await expect(prompt.locator('.card-face')).toHaveCount(5);
    const p = (await prompt.boundingBox())!, badge = (await page.locator('.player-0').boundingBox())!;
    const table = (await page.locator('.table-zone').boundingBox())!;
    expect(p.y).toBeGreaterThan(table.y);
    expect(p.y + p.height).toBeLessThan(badge.y);
    expect(p.x).toBeGreaterThan(table.x); expect(p.x + p.width).toBeLessThan(table.x + table.width);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.hand-card:not(:disabled)')).toHaveCount(5);
  }
  await page.setViewportSize({ width: 838, height: 390 });
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: resolve(evidence, 'table-doubling-five-phone.png') });
});

for (const variant of variants) for (const phase of ['playing', 'layout']) {
  test(`${variant} ${phase}: long hold drags above the hand, returns nearby and plays toward the table`, async ({ page }) => {
    await mount(page, `variant=${variant}&phase=${phase}`);
    await verifyHandDrag(page, phase === 'layout' ? 'CJ' : 'C2',
      () => page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate').length),
      variant === 'complex-partners' && phase === 'playing' ? resolve(evidence, 'picked-card-desktop.png') : undefined);
  });

  test(`${variant}: confirmed card throws from hand to ${phase === 'layout' ? 'Jacks' : 'trick'} without moving its destination`, async ({ page }) => {
    await mount(page, `variant=${variant}&phase=${phase}`);
    await expect(page.locator('.card-throw')).toHaveCount(0);
    await freezeThrows(page);
    const card = phase === 'layout' ? 'CJ' : 'C2';
    const source = page.locator(`[data-hand-card="${card}"] .card-face`);
    const origin = (await source.boundingBox())!;
    await page.locator(`[data-hand-card="${card}"]`).press('Enter');
    const flight = page.locator('.card-throw');
    await expect(flight).toHaveCount(1);
    const start = (await flight.boundingBox())!;
    expect(start.x + start.width / 2).toBeCloseTo(origin.x + origin.width / 2, 1);
    expect(start.y + start.height / 2).toBeCloseTo(origin.y + origin.height * .4, 1);
    await verifyThrow(page, card, 0);
    await expect(page.locator(`[data-hand-card="${card}"]`)).toHaveCount(0);
    await expect(page.locator('.last-trick .card-throw')).toHaveCount(0);
  });
}

for (const phase of ['playing', 'layout']) {
  test(`opponent card throws follow the public seat fan in ${phase}`, async ({ page }) => {
    await mount(page, `phase=${phase}`);
    await freezeThrows(page);
    await update(page, { turn: 1 });
    let plays: TrixObservation['trick'] = [];
    const board: TrixObservation['board'] = ['C', 'D', 'H', 'S'].map(suit => ({ suit: suit as 'C' | 'D' | 'H' | 'S', low: 0, high: 0 }));
    for (const seat of [1, 2, 3] as const) {
      const card = (phase === 'layout' ? ['CJ', 'DJ', 'HJ'][seat - 1] : ['C3', 'C4', 'C5'][seat - 1]) as 'CJ' | 'DJ' | 'HJ' | 'C3' | 'C4' | 'C5';
      const backs = page.locator(`.player-${seat} .count-card-back`);
      const source = (await backs.nth(Math.floor(await backs.count() / 2)).boundingBox())!;
      plays = [...plays, { seat, card }];
      board[seat - 1] = { ...board[seat - 1], low: 11, high: 11 };
      await update(page, { turn: seat === 3 ? 0 : (seat + 1) as 2 | 3, ...(phase === 'layout' ? { board } : { trick: plays }) });
      const flight = page.locator('.card-throw');
      await expect(flight).toHaveCount(1);
      const start = (await flight.boundingBox())!;
      expect(start.x + start.width / 2).toBeCloseTo(source.x + source.width / 2, 1);
      expect(start.y + start.height / 2).toBeCloseTo(source.y + source.height / 2, 1);
      await verifyThrow(page, card, seat);
    }
  });
}

test('card throws settle naturally and clean up on resize and rotation', async ({ page }) => {
  await mount(page);
  await page.locator('[data-hand-card="C2"]').press('Enter');
  await expect(page.locator('[data-played-card="C2"] .card-face')).toBeVisible();
  await expect(page.locator('.card-throw')).toHaveCount(0);
  await freezeThrows(page);
  await update(page, { turn: 2, trick: [{ seat: 0, card: 'C2' }, { seat: 1, card: 'C3' }] });
  await expect(page.locator('.card-throw')).toHaveCount(1);
  await page.setViewportSize({ width: 838, height: 390 });
  await expect(page.locator('.card-throw')).toHaveCount(0);
  await expect(page.locator('[data-played-card="C3"] .card-face')).toBeVisible();
  await update(page, { turn: 3, trick: [{ seat: 0, card: 'C2' }, { seat: 1, card: 'C3' }, { seat: 2, card: 'C4' }] });
  await expect(page.locator('.card-throw')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 838 });
  await expect(page.locator('.game-shell')).toHaveCount(0);
  await expect(page.locator('.card-throw')).toHaveCount(0);
  await page.setViewportSize({ width: 838, height: 390 });
  await expect(page.locator('[data-played-card="C4"] .card-face')).toBeVisible();
  await expect(page.locator('.card-throw')).toHaveCount(0);
});

test('card throws respect reduced motion, skip catch-up and new deals, and settle on pause', async ({ page }) => {
  await mount(page);
  await freezeThrows(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-hand-card="C2"]').press('Enter');
  await expect(page.locator('[data-played-card="C2"] .card-face')).toBeVisible();
  await expect(page.locator('.card-throw')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await update(page, { turn: 3, trick: [{ seat: 0, card: 'C2' }, { seat: 1, card: 'C3' }, { seat: 2, card: 'C4' }] });
  await expect(page.locator('[data-played-card]')).toHaveCount(3);
  await expect(page.locator('.card-throw')).toHaveCount(0);
  await update(page, { turn: 0, trick: [], tricks: [{ number: 1, leader: 0, winner: 3,
    plays: [{ seat: 0, card: 'C2' }, { seat: 1, card: 'C3' }, { seat: 2, card: 'C4' }, { seat: 3, card: 'C5' }] }] });
  await expect(page.locator('.card-throw[data-card="C5"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('.card-throw')).toHaveCount(0);
  await expect(page.locator('[data-played-card="C5"] .card-face')).toHaveCSS('visibility', 'visible');
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect(page.locator('.card-throw')).toHaveCount(0);
  await update(page, { dealNumber: 2, trick: [{ seat: 0, card: 'D2' }], tricks: [] });
  await expect(page.locator('[data-played-card="D2"]')).toHaveCount(1);
  await expect(page.locator('.card-throw')).toHaveCount(0);
});

test('King request offers only King of hearts and pass stays available after selection', async ({ page }) => {
  await mount(page, 'phase=declare-doubles&request=king');
  await expect(page.locator('.hand-card:not(:disabled)')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'King of hearts', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Queen of hearts', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'King of hearts', exact: true }).dblclick();
  await expect(page.getByRole('button', { name: 'Double', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Pass', exact: true }).click();
  expect(await page.evaluate(() => window.trixFixture.commands[0].cards)).toEqual([]);
  await expect(page.locator('.hand-card.selected')).toHaveCount(0);
});

for (const variant of variants) test(`${variant}: doubling without eligible cards passes once without a prompt after resume`, async ({ page }) => {
  await pauseClock(page);
  await mount(page, `variant=${variant}&phase=declare-doubles`);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await update(page, { hand: ['C2', 'H2'], handCounts: [2, 13, 13, 13] }, [
    { id: 'no-doubles', public: { kind: 'declare-doubles', cards: [] } },
  ]);
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.trixFixture.commands)).toEqual([]);
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect(page.locator('.trix-double-picker')).toHaveCount(0);
  await page.clock.runFor(1);
  expect(await page.evaluate(() => window.trixFixture.commands)).toEqual([
    { kind: 'candidate', candidateId: 'no-doubles', cards: [] },
  ]);
  await page.clock.runFor(300);
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toHaveLength(1);
});

test.describe('touch doubling', () => {
  test.use({ hasTouch: true });
  test('a double-tap keeps the queen selected without sending before confirmation', async ({ page }) => {
    await mount(page, 'phase=declare-doubles');
    const queen = page.getByRole('button', { name: 'Queen of hearts', exact: true });
    await queen.tap();
    await queen.tap();
    await expect(queen).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.trixFixture.commands.length)).toBe(0);
    await page.getByRole('button', { name: 'Double', exact: true }).click();
    expect(await page.evaluate(() => window.trixFixture.commands[0].cards)).toEqual(['HQ']);
  });
});

for (const speed of [1, 1.2, 1.4] as const) {
  test(`${speed}x: Trix collection uses the same boosted delay before the next human decision`, async ({ page }) => {
    await pauseClock(page);
    await mount(page);
    await page.evaluate(speed => window.trixFixture.speed(speed), speed);
    await update(page, { turn: 0, trick: [], tricks: [trick] });
    const delay = 2100 / (speed * 1.3);
    await page.clock.runFor(Math.floor(delay) - 10);
    await expect(page.locator('.trick-slot')).toHaveCount(4);
    await expect(page.locator('.hand-card').first()).toBeDisabled();
    await page.clock.runFor(20);
    await expect(page.locator('.trick-slot')).toHaveCount(0);
    await expect(page.locator('.hand-card').first()).toBeEnabled();
  });
}

for (const final of [false, true]) {
  test(`fourth card stays through collection hold${final ? ' on the final trick' : ''}; pause preserves the remaining time`, async ({ page }) => {
    await pauseClock(page);
    await mount(page);
    await update(page, { turn: 0, trick: trick.plays.slice(0, 3) });
    await expect(page.locator('.trick-slot')).toHaveCount(3);
    await update(page, { phase: final ? 'round-complete' : 'playing', turn: final ? null : 1, trick: [], tricks: [trick] });
    await expect(page.locator('.trick-slot')).toHaveCount(4);
    await expect(page.locator('.hand-card').first()).toBeDisabled();
    await page.clock.runFor(600);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.clock.runFor(4000);
    await expect(page.locator('.trick-slot')).toHaveCount(4);
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
    await page.clock.runFor(900);
    await expect(page.locator('.trick-slot')).toHaveCount(4);
    await page.clock.runFor(150);
    await expect(page.locator('.trick-slot')).toHaveCount(0);
    if (final) {
      await expect(page.locator('.trix-result')).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(await page.evaluate(() => window.trixFixture.commands.length)).toBe(0);
      await page.clock.runFor(700);
      expect(await page.evaluate(() => window.trixFixture.commands)).toEqual([{ kind: 'mutate', path: '/api/session/next-hand' }]);
    } else {
      expect(await page.evaluate(() => window.trixFixture.commands.length)).toBe(0);
      await page.clock.runFor(700);
      expect(await page.evaluate(() => window.trixFixture.commands.map(c => c.kind))).toEqual(['prepare', 'mutate']);
    }
  });
}

test('resume immediately restores the existing hand while refresh is pending; cancels and restarts bot preparation', async ({ page }) => {
  await pauseClock(page);
  await mount(page);
  await page.evaluate(() => { window.trixFixture.slowRefresh(true); window.trixFixture.slowPreparation(true); });
  await update(page, { turn: 1 });
  await page.clock.runFor(700);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(await page.evaluate(() => window.trixFixture.commands.map(c => c.kind))).toEqual(['prepare', 'abort']);
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.trix-app')).not.toHaveAttribute('inert', '');
  await expect(page.locator('.hand-card').first()).toBeEnabled();
  await page.clock.runFor(700);
  expect(await page.evaluate(() => window.trixFixture.commands.map(c => c.kind))).toEqual(['prepare', 'abort', 'prepare']);
});

test('off-turn double-click queues without sending; the next legal turn sends once', async ({ page }) => {
  await mount(page);
  await update(page, { turn: 1 });
  const card = page.getByRole('button', { name: 'Queen of hearts', exact: true });
  await card.dblclick();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toHaveLength(0);
  await update(page, { turn: 0 });
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([{ kind: 'candidate', candidateId: 'card-HQ' }]);
});

test('drag corridor clamps movement and outside release or a turn change cancels the pick', async ({ page }) => {
  await mount(page);
  const p = await holdCard(page, 'C2');
  const length = Math.hypot(p.dx, p.dy), ux = p.dx / length, uy = p.dy / length;
  await page.mouse.move(p.x + p.dx * .7 - uy * length * .5, p.y + p.dy * .7 + ux * length * .5);
  const floating = (await page.locator('.hand-drag-card').boundingBox())!;
  const x = floating.x - p.face.x, y = floating.y - p.face.y;
  expect((-x * uy + y * ux) / length).toBeCloseTo(.1, 2);
  await expect(page.locator('.hand-drag-card')).toHaveAttribute('data-ready', 'false');
  await page.mouse.up();
  await expect(page.locator('.hand-drag-card')).toHaveCount(0);
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([]);
  await holdCard(page, 'C2');
  await update(page, { turn: 1 });
  await expect(page.locator('.hand-drag-card')).toHaveCount(0);
  await page.mouse.up();
  const control = page.locator('[data-hand-card="C2"]');
  await expect(control.locator('.card-face')).toHaveCSS('visibility', 'visible');
  const offTurn = await holdCard(page, 'C2');
  await page.mouse.move(offTurn.x + offTurn.dx, offTurn.y + offTurn.dy); await page.mouse.up();
  await expect(page.locator('.hand-drag-card')).toHaveCount(0);
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([]);
});

test('a double activation spanning bot decisions still queues the held card', async ({ page }) => {
  await pauseClock(page); await mount(page); await update(page, { turn: 1 });
  const control = page.locator('[data-hand-card="CQ"]');
  await control.click();
  await page.clock.runFor(70);
  await update(page, { turn: 2 });
  await control.click();
  expect(await control.getAttribute('aria-pressed')).toBe('true');
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([]);
  await page.clock.runFor(180);
  await page.screenshot({ path: resolve(evidence, 'queued-card-across-bot-turn.png') });
});

test('bot preparation does not disable local next-turn card selection', async ({ page }) => {
  await pauseClock(page); await mount(page); await update(page, { turn: 1 });
  const control = page.locator('[data-hand-card="CQ"]');
  await control.click();
  await page.evaluate(() => window.trixFixture.busy(true));
  expect(await control.isEnabled()).toBe(true);
  await page.clock.runFor(70); await control.click();
  expect(await control.getAttribute('aria-pressed')).toBe('true');
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([]);
  await update(page, { turn: 0 });
  await page.evaluate(() => window.trixFixture.busy(false));
  await expect(control).toHaveCount(0);
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toHaveLength(1);
});

test('double-click still plays when the first stationary press crosses the hold threshold', async ({ page }) => {
  await pauseClock(page); await mount(page);
  const control = page.locator('[data-hand-card="C2"]');
  const box = (await control.boundingBox())!;
  const x = box.x + 10, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.clock.runFor(223); await page.mouse.up();
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([]);
  await page.clock.runFor(106);
  await page.mouse.down(); await page.clock.runFor(105); await page.mouse.up();
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([{ kind: 'candidate', candidateId: 'card-C2' }]);
});

test('a small movement during the 200ms hold still lifts at the deadline', async ({ page }) => {
  await pauseClock(page); await mount(page);
  const control = page.locator('[data-hand-card="C2"]');
  const box = (await control.boundingBox())!;
  const x = box.x + 10, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.clock.runFor(80);
  await page.mouse.move(x, y - 14);
  await page.clock.runFor(119);
  expect(await page.locator('.hand-drag-card').count()).toBe(0);
  await page.clock.runFor(1);
  expect(await page.locator('.hand-drag-card').count()).toBe(1);
  await page.mouse.up(); await page.clock.runFor(150);
  expect(await page.locator('.hand-drag-card').count()).toBe(0);
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([]);
});

test('queued cards cancel on repeated double-click, illegal turn, or a new deal', async ({ page }) => {
  await pauseClock(page); await mount(page); await update(page, { turn: 1 });
  const control = page.locator('[data-hand-card="CQ"]');
  await control.dblclick(); await expect(control).toHaveAttribute('aria-pressed', 'true');
  await control.dblclick(); await expect(control).toHaveAttribute('aria-pressed', 'false');
  await control.dblclick();
  await update(page, { turn: 0 }, [{ id: 'only-C2', public: { kind: 'play-card', card: 'C2' } }]);
  await page.clock.runFor(150);
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([]);
  await update(page, { turn: 1 }); await control.dblclick();
  await update(page, { dealNumber: 2, turn: 0 }); await page.clock.runFor(150);
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([]);
});

test('resize cancels a pick; pause hides a pending play without resending it', async ({ page }) => {
  await mount(page);
  await holdCard(page, 'C2');
  await page.setViewportSize({ width: 838, height: 390 });
  await expect(page.locator('.hand-drag-card')).toHaveCount(0);
  await page.mouse.up();
  await pauseClock(page);
  await page.evaluate(() => window.trixFixture.deferAction(true));
  await page.locator('[data-hand-card="C2"]').press('Enter');
  await expect(page.locator('.hand-drag-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('.hand-drag-card')).toHaveCount(0);
  await page.clock.runFor(200);
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toHaveLength(1);
  await page.evaluate(() => window.trixFixture.finishAction(true));
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await page.clock.runFor(200);
  expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toHaveLength(1);
  await expect(page.locator('[data-hand-card="C2"]')).toHaveCount(0);
});

for (const phase of ['playing', 'layout']) {
  test(`${phase}: double activation responds immediately and stays lifted through server work`, async ({ page }) => {
    await pauseClock(page); await mount(page, `phase=${phase}`);
    await page.evaluate(() => window.trixFixture.deferAction(true));
    await freezeThrows(page);
    const card = phase === 'layout' ? 'CJ' : 'C2';
    const control = page.locator(`[data-hand-card="${card}"]`);
    await control.dblclick();
    // No clock advancement: request and feedback must start in the activation task.
    expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toHaveLength(1);
    await expect(page.locator('.hand-drag-card')).toHaveCount(1);
    await expect(control.locator('.card-face')).toHaveCSS('visibility', 'hidden');
    await page.clock.runFor(600);
    await expect(page.locator('.hand-drag-card')).toHaveCount(1);
    await expect(control.locator('.card-face')).toHaveCSS('visibility', 'hidden');
    expect(await page.locator('.card-throw').count()).toBe(0);
    const lifted = (await page.locator('.hand-drag-card').boundingBox())!;
    await page.evaluate(() => window.trixFixture.finishAction(true));
    await expect(page.locator('.hand-drag-card')).toHaveCount(0);
    const flight = (await page.locator('.card-throw').boundingBox())!;
    expect(flight.y + flight.height / 2).toBeCloseTo(lifted.y + lifted.height / 2, 1);
    await verifyThrow(page, card, 0);
  });
}

test('a rejected pending play returns the held card without a throw', async ({ page }) => {
  await pauseClock(page); await mount(page);
  await page.evaluate(() => window.trixFixture.deferAction(true));
  const control = page.locator('[data-hand-card="C2"]');
  await control.dblclick();
  await expect(page.locator('.hand-drag-card')).toHaveCount(1);
  await page.evaluate(() => window.trixFixture.finishAction(false));
  await expect(page.locator('.hand-drag-card,.card-throw')).toHaveCount(0);
  await expect(control.locator('.card-face')).toHaveCSS('visibility', 'visible');
  await expect(control).toBeEnabled();
});

test.describe('touch long-hold dragging', () => {
  test.use({ hasTouch: true, viewport: { width: 838, height: 390 } });
  test('touch double-tap still plays after a stationary 200ms pickup', async ({ page }) => {
    await pauseClock(page); await mount(page, 'phase=layout');
    const control = (await page.locator('[data-hand-card="CJ"]').boundingBox())!;
    const touch = await page.context().newCDPSession(page);
    const x = control.x + 9, y = control.y + control.height / 2;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.clock.runFor(223);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([]);
    await page.clock.runFor(106);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.clock.runFor(105);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([{ kind: 'candidate', candidateId: 'card-CJ' }]);
    await touch.detach();
  });
  test('touch hold lifts and releasing toward the table plays once', async ({ page }) => {
    await mount(page, 'phase=layout');
    const control = (await page.locator('[data-hand-card="CJ"]').boundingBox())!;
    const face = (await page.locator('[data-hand-card="CJ"] .card-face').boundingBox())!;
    const table = (await page.locator('.table-felt').boundingBox())!;
    const touch = await page.context().newCDPSession(page);
    const x = control.x + 9, y = control.y + control.height / 2;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(230);
    expect(await page.locator('.hand-drag-card').count()).toBe(1);
    await page.screenshot({ path: resolve(evidence, 'picked-card-touch-phone.png') });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(page.locator('.hand-drag-card')).toHaveCount(0);
    expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([]);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(230);
    const dx = table.x + table.width / 2 - face.x - face.width / 2;
    const dy = table.y + table.height / 2 - face.y - face.height / 2;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * .7, y: y + dy * .7 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('[data-hand-card="CJ"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.trixFixture.commands.filter(c => c.kind === 'candidate'))).toEqual([{ kind: 'candidate', candidateId: 'card-CJ' }]);
    await touch.detach();
  });
});

test('portrait phone shows the shared rotation gate', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/trix-ui.html');
  await expect(page.getByRole('heading', { name: /Turn your phone/ })).toBeVisible();
  await expect(page.getByRole('img', { name: 'CardFord' })).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(0);
});

test('choosing a game keeps the whole hand readable without permitting card selection', async ({ page }) => {
  await mount(page);
  await update(page, { phase: 'choose-request', turn: 0 }, [{ id: 'queens', public: { kind: 'choose-request', request: 'queens' } }]);
  await expect(page.locator('.hand-card')).toHaveCount(13);
  await expect(page.locator('.hand-card:not(:disabled),.hand-card.unplayable,.hand-card.selected')).toHaveCount(0);
  const colours = await page.locator('.hand-card .card-face').evaluateAll(cards => cards.map(card => ({
    opacity: getComputedStyle(card).opacity, filter: getComputedStyle(card).filter,
  })));
  expect(colours.every(c => c.opacity === '1' && c.filter === 'none')).toBe(true);
});

test('scores open only on click; history is disabled until completion and fetched only on request', async ({ page }) => {
  await pauseClock(page);
  const requests: string[] = [];
  const saved = { id: 'trix-ui:trix-request:1', dealNumber: 1, kingdom: 1, request: 'queens' as const };
  const totals: TrixObservation['totals'] = ([0, 1, 2, 3] as const).map(seat => ({ id: `seat-${seat}`, seats: [seat], total: seat === 1 ? -25 : 0 }));
  await page.route('**/api/platform/rounds**', route => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    return route.fulfill({ json: path.endsWith('/rounds') ? { gameId: 'trix-ui', rounds: [saved] } : {
      gameId: 'trix-ui', round: saved, totals, kingdomTotals: totals, requestTotals: totals,
      ledger: [{ dealNumber: 1, kingdom: 1, request: 'queens', trick: 1, finish: 0,
        recipient: { kind: 'seat', seat: 1 }, component: 'queen', card: 'HQ', delta: -25 }], withheldBonuses: [],
    } });
  });
  await mount(page);
  await expect(page.getByRole('button', { name: 'Score history', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'You current score 0; show scores' }).click();
  const scores = page.getByRole('dialog', { name: 'Scores', exact: true });
  await expect(scores.getByRole('columnheader')).toHaveText(['Player', 'Current', 'Kingdom', 'Total']);
  await expect(scores.locator('details,p')).toHaveCount(0);
  expect(requests).toEqual([]);
  await scores.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await update(page, { phase: 'round-complete', turn: null, requestTotals: totals, kingdomTotals: totals, totals });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.trix-result,.trix-score-sheet')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Score history', exact: true })).toBeEnabled();
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Score history', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'Score history', exact: true });
  await expect(history.getByRole('button', { name: 'Round 1 · Queens', exact: true })).toBeVisible();
  expect(requests).toEqual(['/api/platform/rounds']);
  await history.getByRole('button', { name: 'Round 1 · Queens', exact: true }).click();
  await expect(history.getByRole('table', { name: 'Score breakdown' })).toContainText('Queen of hearts');
  expect(requests).toEqual(['/api/platform/rounds', '/api/platform/rounds/trix-ui%3Atrix-request%3A1']);
  await page.clock.runFor(5000);
  expect(await page.evaluate(() => window.trixFixture.commands.length)).toBe(0);
});

test('layout completion continues once at the shared pace; pausing prevents automatic continuation', async ({ page }) => {
  await pauseClock(page);
  await mount(page, 'phase=layout');
  await update(page, { phase: 'round-complete', turn: null });
  await expect(page.locator('.trix-result')).toHaveCount(0);
  await page.clock.runFor(1000);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.clock.runFor(6000);
  expect(await page.evaluate(() => window.trixFixture.commands.length)).toBe(0);
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await page.clock.runFor(1620);
  expect(await page.evaluate(() => window.trixFixture.commands)).toEqual([{ kind: 'mutate', path: '/api/session/next-hand' }]);
  await page.clock.runFor(5000);
  expect(await page.evaluate(() => window.trixFixture.commands.length)).toBe(1);
  await update(page, { phase: 'session-complete' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play again', exact: true })).toBeVisible();
  await page.clock.runFor(5000);
  expect(await page.evaluate(() => window.trixFixture.commands.length)).toBe(1);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: landscapeDevices[1].width, height: landscapeDevices[1].height }]) {
  test(`all Trix card locations use one proportional face at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await pauseClock(page);
    await page.setViewportSize(viewport);
    await mount(page);
    await update(page, { turn: 0, declarations: [{ seat: 0, cards: ['HQ'], ref: 'double-0' }],
      trick: [{ seat: 1, card: 'H7' }], tricks: [trick] });
    await expect(page.locator('.announced-cards .card-face')).toHaveCount(1);
    await expect(page.locator('.last-trick-card .card-face')).toHaveCount(4);
    const reference = (await faceSignatures(page))[0];
    sameFaces(await faceSignatures(page), reference);
    await update(page, { phase: 'layout', request: 'trix', trick: [], board: [
      { suit: 'C', low: 10, high: 14 }, { suit: 'D', low: 10, high: 14 },
      { suit: 'H', low: 10, high: 14 }, { suit: 'S', low: 10, high: 14 },
    ] });
    await page.clock.runFor(1620);
    await expect(page.locator('.trix-layout [role=img]')).toHaveCount(20);
    sameFaces(await faceSignatures(page), reference);
    expect(await page.locator('.announced-cards .card-face').first().evaluate(card => parseFloat(getComputedStyle(card).width)))
      .toBeCloseTo(viewport.height <= 520 ? 26.4 : 36, 1);
  });
}
