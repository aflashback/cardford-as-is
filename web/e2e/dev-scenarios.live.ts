import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { loadDevScenarios } from '../server/dev-scenarios.ts';
import { createGame } from '../server/game/index.ts';
import type { SessionView } from '../shared/contracts';
import { assertContract } from '../shared/validation';

const scenarios = await loadDevScenarios(
  fileURLToPath(new URL('../../examples/dev-deals.json', import.meta.url)),
);
async function request(page: Page, path = '/api/session', body?: unknown): Promise<unknown> {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        headers: {
          'x-tricks-tab': sessionStorage.getItem('tricks-tab') || '',
          ...(body === undefined ? {} : { 'content-type': 'application/json', 'x-tricks-client': '1' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error(`Scenario HTTP ${response.status}: ${await response.text()}`);
      return response.json();
    },
    { path, body },
  );
}
async function current(page: Page) {
  const value = await request(page);
  assertContract('SessionView', value);
  return value;
}
const envelope = (view: SessionView) => ({
  commandId: crypto.randomUUID(),
  gameId: view.game.id,
  expectedRevision: view.revision,
  controlLeaseToken: view.controlLeaseToken,
});
async function choose(page: Page, id: string, mode: string) {
  const previousId = (await current(page)).game.id;
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page.getByLabel('Practice deal').selectOption(id);
  await page
    .locator('.game-option')
    .filter({ has: page.locator(`.game-art-${mode}`) })
    .click();
  await expect.poll(async () => (await current(page)).game.id).not.toBe(previousId);
  await expect(page.getByRole('main', { name: 'New game setup' })).toHaveCount(0);
  await expect.poll(async () => (await current(page)).scenario?.id).toBe(id);
}

for (const scenario of scenarios)
  test(`built ${scenario.metadata.mode}: chosen cards persist and restart identically`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await choose(page, scenario.metadata.id, scenario.metadata.mode);
    const first = await current(page);
    const expected = createGame(
      { id: first.game.id, mode: scenario.metadata.mode, dealer: scenario.dealer },
      scenario.deck,
    );
    expect(first.game.hand).toEqual(expected.hands[0]);
    expect(first.game.dealer).toBe(scenario.dealer);
    await expect(page.locator('.scenario-badge')).toHaveText(`Selected deal: ${scenario.metadata.label}`);
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
    const restored = await current(page);
    expect(restored.game.id).toBe(first.game.id);
    expect(restored.game.hand).toEqual(first.game.hand);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await choose(page, scenario.metadata.id, scenario.metadata.mode);
    const fresh = await current(page);
    expect(fresh.game.id).not.toBe(first.game.id);
    expect(fresh.game.hand).toEqual(first.game.hand);
    expect(fresh.game.dealer).toBe(first.game.dealer);
    expect(errors).toEqual([]);
  });

test('built table: Replay this deal starts the saved Spades opening after a complete hand', async ({
  page,
}, testInfo) => {
  const scenario = scenarios.find((item) => item.metadata.mode === 'spades-partners')!;
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await choose(page, scenario.metadata.id, scenario.metadata.mode);
  const first = await current(page);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  let view = first;
  for (let step = 0; step < 100 && !['hand-end', 'match-end'].includes(view.game.phase); step++) {
    let result: unknown;
    if (view.game.phase === 'trick-end')
      result = await request(page, '/api/session/advance', { ...envelope(view), kind: 'collect-trick' });
    else if (view.game.legalActions.length)
      result = await request(page, '/api/session/actions', {
        ...envelope(view),
        action: view.game.legalActions[0],
      });
    else {
      const ready = await request(page, '/api/session/prepare', envelope(view));
      assertContract('PrepareView', ready);
      result = await request(page, '/api/session/advance', {
        ...envelope(view),
        kind: 'bot',
        preparedDecisionId: ready.preparedDecisionId,
      });
    }
    assertContract('SessionView', result);
    view = result;
  }
  expect(view.game.history).toHaveLength(13);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Replay this deal', exact: true }).click();
  await expect.poll(async () => (await current(page)).game.id).not.toBe(view.game.id);
  const fresh = await current(page);
  expect(fresh.game.hand).toEqual(first.game.hand);
  expect(fresh.game.dealer).toBe(first.game.dealer);
  expect(fresh.game.scores).toEqual([0, 0, 0, 0]);
  expect(fresh.game.history).toEqual([]);
  expect(fresh.scenario).toEqual(first.scenario);
  await expect(page.locator('.scenario-badge')).toHaveText('Selected deal: Opening A');
  await page.screenshot({ path: testInfo.outputPath('built-selected-deal-replay.png') });
});
