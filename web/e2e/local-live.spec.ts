import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import type { Mode, SessionView } from '../shared/contracts';
import { assertContract } from '../shared/validation';

const origin = process.env.TRICKS_LIVE_URL || 'http://127.0.0.1:4173';
const evidence = fileURLToPath(new URL('../../qa/implementation/', import.meta.url));
test.setTimeout(150_000);
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
async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  return errors;
}
async function newGame(page: Page, mode: Mode) {
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page
    .locator('.game-option')
    .filter({ has: page.locator(`.game-art-${mode}`) })
    .click();
  await expect.poll(async () => (await current(page)).game.mode).toBe(mode);
}
async function waitHuman(page: Page) {
  await expect
    .poll(
      async () => {
        const view = await current(page);
        return view.game.turn === 0 && view.game.phase === 'play';
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}
async function playHuman(page: Page) {
  await waitHuman(page);
  const before = await current(page);
  const card = page.locator('.hand-card:not(:disabled)').first();
  await card.dblclick();
  await expect.poll(async () => (await current(page)).game.hand.length).toBe(before.game.hand.length - 1);
}

for (const mode of ['hearts', 'spades-solo', 'spades-partners'] as const) {
  test(`live ${mode}: legal setup, help, accepted play and durable paused review`, async ({ page }) => {
    const errors = await open(page);
    await newGame(page, mode);
    if (mode === 'hearts') {
      await expect(page.getByRole('heading', { name: 'Pass three cards left' })).toBeVisible();
      for (let index = 0; index < 3; index++) await page.locator('.hand-card').nth(index).click();
      const before = await current(page);
      expect(before.game.phase).toBe('pass');
      await page.getByRole('button', { name: 'Pass 3 of 3', exact: true }).click();
      await expect.poll(async () => (await current(page)).game.phase).toBe('play');
      expect((await current(page)).game.received).toHaveLength(3);
    } else {
      await expect(page.getByRole('button', { name: 'Bid 3', exact: true })).toBeEnabled({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Bid 3', exact: true }).click();
      await expect.poll(async () => (await current(page)).game.bids[0]).toBe(3);
    }
    await waitHuman(page);
    await page.getByRole('button', { name: 'Give me a cue' }).click();
    await expect(page.locator('.hint-stage')).toContainText('Notice');
    await page.getByRole('button', { name: 'More context', exact: true }).click();
    await expect(page.locator('.hint-stage')).toContainText('Consider');
    await page.getByRole('button', { name: 'Suggest a move', exact: true }).click();
    await expect(page.locator('.hint-stage')).toContainText('A suggestion');
    await playHuman(page);
    await expect
      .poll(async () => (await current(page)).game.history.length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
    const paused = await current(page);
    await page.waitForTimeout(500);
    expect((await current(page)).revision).toBe(paused.revision);
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
    const reloaded = await current(page);
    expect(reloaded.revision).toBe(paused.revision);
    await page.waitForTimeout(500);
    expect((await current(page)).revision).toBe(paused.revision);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.getByRole('button', { name: 'Review current game', exact: true }).click();
    const live = await current(page);
    await page.locator('.review-choices button').first().click();
    await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible();
    await page.waitForTimeout(500);
    expect((await current(page)).revision).toBe(live.revision);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    expect((await current(page)).game.id).toBe(live.game.id);
    expect(errors).toEqual([]);
  });
}

test('live account previews cancellation and renewal, with a private family panel', async ({ page }) => {
  await page.goto(`${origin}/#account`);
  await expect(page.getByRole('heading', { name: 'Account and subscription' })).toBeVisible();
  await expect(page.getByLabel('Local account ID', { exact: true })).toHaveValue(/[a-f0-9-]{36}/);
  await page.getByRole('button', { name: 'Cancel renewal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cancel renewal?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm test change', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume renewal', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume renewal', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm test change', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel renewal', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Manage family', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create test family', exact: true })).toBeVisible();
  await expect(page.getByText('no invitation email is sent.', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Account and subscription' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/local-live-account-phone.png`, fullPage: true });
});

test('live desktop and landscape phone render with self-hosted fonts', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors = await open(page);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Card table' })).toBeVisible();
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return (
        document.fonts.check('14px "DM Sans Variable"') && document.fonts.check('14px "Manrope Variable"')
      );
    }),
  ).toBe(true);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/local-live-desktop.png` });
  await page.setViewportSize({ width: 667, height: 375 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${evidence}/local-live-landscape-phone.png` });
  expect(errors).toEqual([]);
});

test('live family invitation binds the invited local account and preserves separate players', async ({
  browser,
}) => {
  const payerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    const payer = await payerContext.newPage();
    const member = await memberContext.newPage();
    await payer.goto(`${origin}/#account`);
    await member.goto(`${origin}/#account`);
    const memberId = await member.getByLabel('Local account ID', { exact: true }).inputValue();
    const familyOffer = payer
      .locator('.plan-options article')
      .filter({ has: payer.getByRole('heading', { name: 'Family', exact: true }) });
    await familyOffer.getByRole('button', { name: 'Preview test plan' }).click();
    await payer.getByRole('button', { name: 'Confirm test change', exact: true }).click();
    await payer.getByRole('button', { name: 'Manage family', exact: true }).click();
    await payer.getByRole('button', { name: 'Create test family', exact: true }).click();
    await payer.getByLabel('Existing test account ID', { exact: true }).fill(memberId);
    await payer.getByRole('button', { name: 'Create invitation', exact: true }).click();
    const token = await payer.getByLabel('Invitation token', { exact: true }).inputValue();
    await member.getByRole('button', { name: 'Manage family', exact: true }).click();
    await member.getByLabel('Invitation token', { exact: true }).fill(token);
    await member.getByRole('checkbox').check();
    await member.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(member.getByText('Paid by Local player', { exact: true })).toBeVisible();
    await expect(member.getByRole('button', { name: 'Create invitation', exact: true })).toHaveCount(0);
    expect(await member.getByLabel('Local account ID', { exact: true }).inputValue()).toBe(memberId);
    await member.getByRole('button', { name: 'Leave family', exact: true }).click();
    await member.locator('.family-confirm').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(member.getByRole('button', { name: 'Accept invitation', exact: true })).toBeVisible();
  } finally {
    await payerContext.close();
    await memberContext.close();
  }
});

test('live safe export and typed local-account deletion', async ({ page }) => {
  await page.goto(`${origin}/#account`);
  const oldId = await page.getByLabel('Local account ID', { exact: true }).inputValue();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my local data', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('tricks-coach-local-export.json');
  expect(await download.failure()).toBeNull();
  await page.getByText('Delete local test account', { exact: true }).click();
  const button = page.getByRole('button', { name: 'Delete my local account', exact: true });
  await expect(button).toBeDisabled();
  await page.getByLabel('Type DELETE LOCAL ACCOUNT', { exact: true }).fill('DELETE LOCAL ACCOUNT');
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole('heading', { name: 'Local account deleted', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start a new local account', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
  await page.goto(`${origin}/#account`);
  expect(await page.getByLabel('Local account ID', { exact: true }).inputValue()).not.toBe(oldId);
});

test('live alternative trial stays separate from the accepted table', async ({ page }) => {
  await open(page);
  await newGame(page, 'spades-partners');
  await expect(page.getByRole('button', { name: 'Bid 3', exact: true })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Bid 3', exact: true }).click();
  let found = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    await waitHuman(page);
    const view = await current(page);
    const choices = view.game.legalActions.filter((action) => action.kind === 'play');
    await playHuman(page);
    if (choices.length > 1) {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
  await page.getByRole('button', { name: 'Review current game', exact: true }).click();
  const before = await current(page);
  await page.locator('.review-choices button').last().click();
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible();
  await page.getByText('Explore another card', { exact: true }).click();
  await page.locator('.review-alternatives button').last().click();
  const unlock = page.getByRole('button', { name: 'Use coached hand', exact: true });
  if (await unlock.isVisible()) await unlock.click();
  await expect(page.getByRole('heading', { name: 'Possible continuation', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const after = await current(page);
  expect(after.revision).toBe(before.revision);
  expect(after.game.hand).toEqual(before.game.hand);
  expect(after.game.scores).toEqual(before.game.scores);
  await page.getByRole('button', { name: 'Back to Original', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible();
});
