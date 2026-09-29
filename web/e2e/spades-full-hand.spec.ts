import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Mode, SessionView } from '../shared/contracts';
import { assertContract } from '../shared/validation';

const origin = process.env.TRICKS_LIVE_URL || 'http://127.0.0.1:4173';
test.setTimeout(120_000);

// Only the browser's public, seat-scoped session is read. Every mutation goes through the UI.
async function current(page: Page): Promise<SessionView> {
  const value: unknown = await page.evaluate(async () => {
    const response = await fetch('/api/session', {
      credentials: 'same-origin',
      headers: { 'x-tricks-tab': sessionStorage.getItem('tricks-tab') || '' },
    });
    if (!response.ok) throw new Error(`Session HTTP ${response.status}`);
    return response.json();
  });
  assertContract('SessionView', value);
  return value;
}

async function quietGame(page: Page, mode: Mode) {
  await page.goto(origin);
  await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'After the hand', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page.getByRole('button', { name: '1.4×', exact: true }).click();
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page
    .locator('.game-option')
    .filter({ has: page.locator(`.game-art-${mode}`) })
    .click();
  await expect.poll(async () => (await current(page)).game.mode).toBe(mode);
  await expect.poll(async () => (await current(page)).preferences.coachMode).toBe('after');
  await expect(page.getByRole('button', { name: 'Bid 3', exact: true })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Bid 3', exact: true }).click();
  await expect.poll(async () => (await current(page)).game.bids[0]).toBe(3);
}

for (const mode of ['spades-solo', 'spades-partners'] as const) {
  test(`live ${mode}: quiet full hand, exact recap and saved decision review`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await quietGame(page, mode);
    let countedDecisions = 1; // The bid is meaningful; forced single-card turns are excluded from recap statistics.
    for (let remaining = 13; remaining > 0; remaining--) {
      await expect
        .poll(
          async () => {
            const view = await current(page);
            return view.game.turn === 0 && view.game.phase === 'play';
          },
          { timeout: 15_000, intervals: [200, 350, 500] },
        )
        .toBe(true);
      const before = await current(page);
      expect(before.game.hand).toHaveLength(remaining);
      if (before.game.legalActions.length > 1) countedDecisions++;
      expect(before.stats.helped).toBe(0);
      await expect(page.getByRole('button', { name: 'Give me a cue', exact: true })).toHaveCount(0);
      await page.locator('.hand-card:not(:disabled)').first().dblclick();
      await expect.poll(async () => (await current(page)).game.hand.length).toBe(remaining - 1);
    }
    await expect.poll(async () => (await current(page)).game.phase, { timeout: 15_000 }).toBe('hand-end');
    const completed = await current(page);
    expect(completed.game.hand).toEqual([]);
    expect(completed.game.handCounts).toEqual([0, 0, 0, 0]);
    expect(completed.game.history).toHaveLength(13);
    expect(completed.game.history.every((trick) => trick.plays.length === 4)).toBe(true);
    expect(
      new Set(completed.game.history.flatMap((trick) => trick.plays.map((play) => play.card))).size,
    ).toBe(52);
    expect(completed.game.tricks.reduce((sum, count) => sum + count, 0)).toBe(13);
    expect(completed.stats).toEqual({ decisions: countedDecisions, helped: 0, suggestions: 0 });
    expect(completed.game.handResult).not.toBeNull();
    expect(completed.game.scores).toEqual(completed.game.handResult!.points);

    const recap = page.getByRole('dialog', { name: 'Hand 1 results', exact: true });
    await expect(recap).toBeVisible();
    await expect(recap.locator('.recap-score > strong')).toHaveText(String(completed.game.scores[0]));
    const delta = completed.game.handResult!.points[0];
    await expect(recap.locator('.recap-score > span').last()).toHaveText(
      `${delta >= 0 ? '+' : ''}${delta} this hand`,
    );
    const others = mode === 'spades-partners' ? [1] : [1, 2, 3];
    await expect(recap.locator('.recap-standings b')).toHaveText(
      others.map((seat) => String(completed.game.scores[seat])),
    );
    await expect(recap.locator('.decision-summary b')).toHaveText([String(countedDecisions), '0']);
    await page.getByRole('button', { name: 'Back to table', exact: true }).click();
    await expect(page.locator('.hand-card')).toHaveCount(0);
    await page.getByRole('button', { name: 'Review current game', exact: true }).click();
    await expect(page.locator('.review-choices button')).toHaveCount(14);
    await expect(page.locator('.review-choices')).not.toContainText('help issued');
    const reviewedIds: string[] = [];
    for (const choice of [0, 1]) {
      const reviewResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          /\/api\/session\/reviews\/[^/?]+\?step=0$/.test(response.url()),
      );
      await page.locator('.review-choices button').nth(choice).click();
      const original: unknown = await (await reviewResponse).json();
      assertContract('ReviewView', original);
      reviewedIds.push(original.decisionId);
      await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'What you knew', exact: true })).toBeVisible();
      const adviceRegion = page.getByRole('region', { name: 'Original coach advice', exact: true });
      await expect(
        adviceRegion.getByRole('heading', { name: 'Advice at your decision', exact: true }),
      ).toHaveCount(0);
      const adviceResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().endsWith('/api/coaching/hand-unlocks'),
      );
      await page.getByRole('button', { name: 'Show original coach advice', exact: true }).click();
      const unlock = page.getByRole('button', { name: 'Use coached hand', exact: true });
      const adviceHeading = adviceRegion.getByRole('heading', {
        name: 'Advice at your decision',
        exact: true,
      });
      await expect
        .poll(async () => (await unlock.isVisible()) || (await adviceHeading.isVisible()))
        .toBe(true);
      if (await unlock.isVisible()) await unlock.click();
      const saved: unknown = await (await adviceResponse).json();
      assertContract('HandUnlockView', saved);
      expect(saved.advice.decisionId).toBe(original.decisionId);
      await expect(adviceHeading).toBeVisible();
      await expect(adviceRegion.locator('p')).toHaveText([
        `${saved.advice.focus}: ${saved.advice.notice}`,
        saved.advice.reason,
        saved.advice.suggestion,
      ]);
    }
    expect(new Set(reviewedIds).size).toBe(2);
    const afterReview = await current(page);
    expect(afterReview.revision).toBe(completed.revision);
    expect(afterReview.game.history).toEqual(completed.game.history);
    expect(afterReview.stats).toEqual(completed.stats);
    if (mode === 'spades-partners') {
      const evidence = fileURLToPath(new URL('../../qa/implementation/', import.meta.url));
      await mkdir(evidence, { recursive: true });
      await page.getByRole('region', { name: 'Original coach advice', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${evidence}/spades-partners-saved-advice.png`, fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}
