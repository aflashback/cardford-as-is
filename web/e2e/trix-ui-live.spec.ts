import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateContract } from '../shared/local-service.validation';
import type { PlatformSessionView, TrixObservation } from '../shared/local-service.contracts';
import { cardLabel } from '../src/api/display';
const evidence = resolve('qa/implementation/trix/shared-table');
async function current(page: Page): Promise<PlatformSessionView> {
  const value: unknown = await page.evaluate(async () => {
    const response = await fetch('/api/platform/session', {
      headers: { 'x-tricks-tab': sessionStorage.getItem('tricks-tab') ?? '' }, credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`Platform state HTTP ${response.status}`);
    return response.json();
  });
  if (!validateContract('PlatformSessionView', value)) throw new Error('Invalid native public session.');
  return value;
}

test('native round completion continues without a result popup and reloads saved score history on demand', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [], historyRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/platform/rounds')) historyRequests.push(path);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  await page.getByRole('button', { name: '1.4×', exact: true }).click();
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  await page.locator('.game-option').filter({ hasText: 'Basic · Solo' }).click();
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  const deadline = Date.now() + 115_000;
  let view = await current(page), o = observation(view);
  const gameId = view.session!.gameId;
  let humanPlays = 0;
  while (Date.now() < deadline && o.dealNumber === 1) {
    await expect(page.locator('.trix-result')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (o.turn === 0 && o.phase === 'choose-request') {
      const queens = page.locator('.trix-request-options button').filter({ hasText: 'Queens' });
      if (await queens.isEnabled()) await queens.click();
    } else if (o.turn === 0 && o.phase === 'declare-doubles') {
      const confirm = page.locator('.trix-double-picker button');
      if (await confirm.isVisible() && await confirm.isEnabled()) await confirm.click();
    } else if (o.turn === 0 && o.phase === 'playing' && await page.locator('.you-active').isVisible()) {
      const legal = page.locator('.hand-card:not(:disabled)').first();
      if (await legal.isVisible() && await legal.isEnabled()) { await legal.dblclick(); humanPlays++; }
    }
    await page.waitForTimeout(180);
    view = await current(page); o = observation(view);
  }
  expect(o.dealNumber).toBe(2);
  expect(view.session!.gameId).toBe(gameId);
  expect(humanPlays).toBeGreaterThan(0);
  expect(historyRequests).toEqual([]);
  expect(o.ledger).toEqual([]);
  const indexResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/platform/rounds');
  await page.getByRole('button', { name: 'Score history', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'Score history', exact: true });
  await expect(history.getByRole('button', { name: 'Round 1 · Queens', exact: true })).toBeVisible();
  const index: unknown = await (await indexResponse).json();
  if (!validateContract('TrixRoundIndex', index)) throw new Error('Invalid saved round index.');
  const detailResponse = page.waitForResponse(response => decodeURIComponent(new URL(response.url()).pathname) === `/api/platform/rounds/${gameId}:trix-request:1`);
  await history.getByRole('button', { name: 'Round 1 · Queens', exact: true }).click();
  const saved: unknown = await (await detailResponse).json();
  if (!validateContract('TrixRoundHistory', saved)) throw new Error('Invalid saved round history.');
  await expect(history.getByRole('table', { name: 'Score breakdown' })).toBeVisible();
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: resolve(evidence, 'native-round-history.png') });
  await history.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await page.getByRole('button', { name: 'Score history', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Score history', exact: true });
  const restoredResponse = page.waitForResponse(response => decodeURIComponent(new URL(response.url()).pathname) === `/api/platform/rounds/${gameId}:trix-request:1`);
  await restored.getByRole('button', { name: 'Round 1 · Queens', exact: true }).click();
  expect(await (await restoredResponse).json()).toEqual(saved);
  expect(errors).toEqual([]);
  await writeFile(resolve(evidence, 'native-round-history.json'), JSON.stringify({
    gameId, humanPlays, autoContinuedTo: o.dealNumber, historyRequests, saved, errors,
    provider: 'off; deterministic code', scope: 'one completed native Basic Solo request and saved history reload',
  }, null, 2));
});
function observation(view: PlatformSessionView): TrixObservation {
  const presentation = view.session?.presentation;
  if (!presentation || !('gameId' in presentation) || presentation.gameId !== 'trix') throw new Error('Expected native Trix.');
  return presentation.observation;
}
for (const variant of ['basic-solo', 'basic-partners', 'complex-solo', 'complex-partners']) {
  test(`native Go ${variant}: real double/play receipt, shared table and paused reload`, async ({ page }) => {
    const errors: string[] = [], actions: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (new URL(r.url()).pathname === '/api/session/actions') actions.push(r.postData() ?? ''); });
    await page.goto('/');
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
    await page.getByRole('button', { name: '1.4×', exact: true }).click();
    await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
    const label = `${variant.startsWith('complex') ? 'Complex' : 'Basic'} · ${variant.endsWith('partners') ? 'Partners' : 'Solo'}`;
    await page.locator('.game-option').filter({ hasText: label }).click();
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
    await expect(page.locator('.last-trick')).toBeVisible();
    await expect(page.locator('.last-trick')).toHaveText('');
    const deadline = Date.now() + 40_000;
    let state = await current(page), o = observation(state);
    while (Date.now() < deadline) {
      if (o.turn === 0 && o.phase === 'choose-request') {
        const request = page.locator('.trix-request-options button').filter({ hasText: 'Lutoosh' });
        const option = await request.count() ? request : page.locator('.trix-request-options button').first();
        if (await option.isVisible() && await option.isEnabled()) await option.click({timeout:1000});
      } else if (o.turn === 0 && o.phase === 'declare-doubles') {
        const eligible = page.locator('.hand-card:not(:disabled)').first();
        const confirm = page.locator('.trix-double-picker .primary-button');
        if (await confirm.isVisible() && await confirm.isEnabled()) {
          if (await eligible.isVisible() && await eligible.isEnabled()) await eligible.dblclick();
          await confirm.click({timeout:1000});
        }
      } else if (o.turn === 0 && ['playing', 'layout'].includes(o.phase) &&
        state.session!.actor?.candidates.some(c => c.public.kind === 'play-card' || c.public.kind === 'layout-card') &&
        await page.locator('.you-active').isVisible()) break;
      await page.waitForTimeout(300);
      state = await current(page); o = observation(state);
    }
    expect(o.turn).toBe(0);
    expect(['playing', 'layout']).toContain(o.phase);
    const gameId = state.session!.gameId, beforeHand = o.hand.length;
    const candidate = state.session!.actor?.candidates.find(c => c.public.kind === 'play-card' || c.public.kind === 'layout-card');
    if (!candidate || (candidate.public.kind !== 'play-card' && candidate.public.kind !== 'layout-card')) throw new Error('Native human card candidate missing.');
    const playedCard = candidate.public.card;
    const beforeCommands = actions.length;
    await page.getByRole('button', { name: cardLabel(playedCard), exact: true }).dblclick();
    await expect.poll(async () => observation(await current(page)).hand.length, { timeout: 15_000 }).toBe(beforeHand - 1);
    expect(actions.length - beforeCommands).toBe(1);
    if (o.phase === 'playing') {
      await expect(page.locator('.trick-slot')).toHaveCount(4, { timeout: 15_000 });
      await expect(page.locator('.last-trick-card')).toHaveCount(4);
    } else await expect(page.locator('.trix-layout [role=img]')).not.toHaveCount(0);
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, `native-${variant}.png`) });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.locator('.hand-card')).toHaveCount(beforeHand - 1);
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Game paused' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible();
    state = await current(page); o = observation(state);
    expect(state.session!.gameId).toBe(gameId);
    expect(o.hand).not.toContain(playedCard);
    expect(errors).toEqual([]);
    await writeFile(resolve(evidence, `native-${variant}.json`), JSON.stringify({
      variant, gameId, request: o.request, phase: o.phase, playedCard, remaining: o.hand.length,
      humanCommands: actions.length, sharedTrickCards: o.tricks.length > 0, reloadPaused: true, errors,
      provider: 'off; deterministic code', scope: 'first request only, normal random deal; no mocked success responses',
    }, null, 2));
  });
}
