import { test, expect, type Page } from '@playwright/test';
import type { PlatformSessionView, RealtimeMessage, TrixPresentation } from '../shared/local-service.contracts.ts';
import { validateContract } from '../shared/local-service.validation.ts';

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const response = await fetch('/api/realtime/snapshot', {
        headers: { 'x-tricks-tab': sessionStorage.getItem('tricks-tab') ?? '' },
      });
      // A snapshot can race several immediate bot commits. Respect the same
      // bounded recovery response as the app instead of treating 429 as state.
      if (response.status === 429 && Date.now() < deadline) {
        const retry = Number(response.headers.get('Retry-After') ?? '1');
        await new Promise(resolve => setTimeout(resolve, Math.min(2000, Math.max(100, retry * 1000))));
        continue;
      }
      if (!response.ok) throw Error(`snapshot ${response.status}`);
      return response.json();
    }
  });
}
async function observe(page: Page) {
  const messages: RealtimeMessage[] = [];
  const commands: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (request) => {
    if (request.method() === 'POST') commands.push(request.url().split('/api/')[1] ?? '');
  });
  page.on('websocket', (socket) =>
    socket.on('framereceived', (frame) => {
      const value: unknown = JSON.parse(String(frame.payload));
      expect(validateContract('RealtimeMessage', value)).toBe(true);
      messages.push(value as RealtimeMessage);
    }),
  );
  await page.addInitScript(() => {
    const Original = window.WebSocket;
    (window as any).__sockets = [];
    window.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        (window as any).__sockets.push(this);
      }
    };
  });
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
  return { messages, commands, errors };
}

async function takeControlFromSecondTab(page: Page, dialogName: string, resumeName: string) {
  const saved = (await snapshot(page)).view.session;
  const other = await page.context().newPage();
  const errors: string[] = [];
  other.on('pageerror', error => errors.push(error.message));
  try {
    await other.goto('/');
    const dialog = other.getByRole('dialog', {name:dialogName,exact:true});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', {name:'Take control',exact:true})).toBeVisible();
    await dialog.getByRole('button', {name:'Close dialog'}).click();
    await expect(dialog).toBeVisible();
    await expect.poll(async () => (await snapshot(other)).view.session.control.owned).toBe(false);
    await dialog.getByRole('button', {name:'Take control',exact:true}).click();
    await expect.poll(async () => (await snapshot(other)).view.session.control.owned).toBe(true);
    await expect(dialog).toBeVisible();
    await expect.poll(async () => (await snapshot(other)).playback.running).toBe(false);
    const claimed = (await snapshot(other)).view.session;
    expect(claimed.gameId).toBe(saved.gameId);
    expect(claimed.revision).toBe(saved.revision);
    await dialog.getByRole('button', {name:resumeName,exact:true}).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await snapshot(other)).playback.running).toBe(true);
    expect(errors).toEqual([]);
  } finally { await other.close(); }
}

test('real socket: server bots, command updates, pause, reconnect and reload', async ({ page }) => {
  const seen = await observe(page);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  const bid = page.getByRole('button', { name: 'Bid 3', exact: true });
  await expect(bid).toBeEnabled();
  await bid.click();
  await expect
    .poll(async () => {
      const s = (await snapshot(page)).view as PlatformSessionView;
      return s.session?.presentation.phase;
    })
    .toBe('play');
  await expect.poll(() => seen.messages.filter((m) => m.type === 'session.view').length).toBeGreaterThan(2);
  await expect(page.getByRole('region', { name: 'Your hand' }).getByRole('status')).toHaveText('Your turn');
  await expect(page.locator('.hand-card:not(:disabled)').first()).toBeEnabled();
  const before = (await snapshot(page)).view.session.revision;
  await page.locator('.hand-card:not(:disabled)').first().dblclick();
  await expect
    .poll(() => seen.messages.some((m) => m.type === 'session.view' && m.view.session!.revision > before))
    .toBe(true);
  expect(seen.commands.filter((path) => path === 'session/advance')).toEqual([]);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).playback.running).toBe(false);
  const paused = (await snapshot(page)).view.session.revision;
  await page.evaluate(() => {
    for (const socket of (window as any).__sockets) socket.close();
  });
  await expect
    .poll(() => seen.commands.filter((path) => path === 'realtime/negotiate').length)
    .toBeGreaterThan(1);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
  expect((await snapshot(page)).view.session.revision).toBe(paused);
  await takeControlFromSecondTab(page, 'Paused', 'Resume');
  expect(seen.errors).toEqual([]);
});

test('Trix adapter receives backend bot updates without advance commands', async ({ page }) => {
  const seen = await observe(page);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: /^Choose game:/ }).click();
  await expect(page.getByRole('heading', { name: 'Set the pace' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page.locator('.game-option,.trix-catalog button').filter({ hasText: 'Basic · Solo' }).click();
  await expect(page.getByRole('region', { name: 'Trix four player table' })).toBeVisible();
  const resume = page.getByRole('button', { name: 'Resume game', exact: true });
  if (await resume.isVisible()) await resume.click();
  const game = (await snapshot(page)).view.session.gameId;
  for (let i = 0; i < 30; i++) {
    const current = (await snapshot(page)).view.session;
    const observation = (current.presentation as TrixPresentation).observation;
    // The human may own the first kingdom and lead immediately after choosing
    // its request. Bots must wait at that boundary, regardless of revision.
    if (observation.turn === 0 && ['playing', 'layout'].includes(observation.phase)) break;
    const request = page.locator('.trix-request-options button').first();
    if ((await request.isVisible()) && (await request.isEnabled())) {
      const before = (await snapshot(page)).view.session.revision;
      await request.click();
      await expect.poll(async () => (await snapshot(page)).view.session.revision).toBeGreaterThan(before);
      continue;
    }
    const pass = page.getByRole('button', { name: 'Pass', exact: true });
    if ((await pass.isVisible()) && (await pass.isEnabled())) {
      const before = (await snapshot(page)).view.session.revision;
      await pass.click();
      await expect.poll(async () => (await snapshot(page)).view.session.revision).toBeGreaterThan(before);
      continue;
    }
    await page.waitForTimeout(250);
  }
  expect(seen.commands.filter((path) => path === 'session/advance')).toEqual([]);
  await expect(page.getByRole('region', { name: 'Your hand' }).getByRole('status')).toHaveText('Your turn');
  const card = page.locator('.hand-card:not(:disabled)').first();
  await expect(card).toBeEnabled();
  const accepted = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/api/session/actions'),
  );
  await card.dblclick();
  const receipt = await (await accepted).json();
  await expect
    .poll(() =>
      seen.messages.some(
        (m) =>
          m.type === 'session.view' &&
          m.view.session?.gameId === game &&
          m.view.session.revision > receipt.revision,
      ),
    )
    .toBe(true);
  expect(seen.commands.filter((path) => path === 'session/advance')).toEqual([]);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).playback.running).toBe(false);
  await takeControlFromSecondTab(page, 'Game paused', 'Resume game');
  expect(seen.errors).toEqual([]);
});
