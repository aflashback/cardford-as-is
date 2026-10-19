import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateContract } from '../shared/local-service.validation';
import type { PlatformSessionView, TrixObservation } from '../shared/local-service.contracts';

const evidence = resolve(process.env.CARDFORD_EVIDENCE_DIR ?? 'qa/implementation/trix/twos');

async function current(page: Page): Promise<PlatformSessionView> {
  const response = await page.request.get('/api/platform/session', {
    headers: { 'x-tricks-tab': await page.evaluate(() => sessionStorage.getItem('tricks-tab') ?? '') },
    timeout: 15_000,
  });
  expect(response.ok()).toBe(true);
  const value: unknown = await response.json();
  if (!validateContract('PlatformSessionView', value)) throw new Error('Invalid native Trix session.');
  return value;
}

function observation(view: PlatformSessionView): TrixObservation {
  const presentation = view.session?.presentation;
  if (!presentation || !('gameId' in presentation) || presentation.gameId !== 'trix')
    throw new Error('Expected native Trix presentation.');
  return presentation.observation;
}

for (const variant of ['basic-partners', 'complex-partners'] as const) {
  test(`native ${variant}: automatic concealed twos, ordinary opening and persisted reveal`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
    await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
    await page
      .locator('.game-option')
      .filter({ hasText: `${variant.startsWith('basic') ? 'Basic' : 'Complex'} · Partners` })
      .click();
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
    await page.locator('.trix-request-options button').filter({ hasText: 'Trix Jacks' }).click();
    await expect.poll(async () => observation(await current(page)).twoAnnouncements?.status).toBe('hidden');
    const hiddenView = await current(page),
      hidden = observation(hiddenView);
    expect(hidden.twoAnnouncements).toEqual({ status: 'hidden', counts: [1, 1, 1, 1] });
    expect(hidden.handCounts).toEqual([13, 13, 13, 13]);
    expect(hidden.turn).toBe(0);
    for (const card of ['D2', 'H2', 'S2']) expect(JSON.stringify(hiddenView)).not.toContain(`"${card}"`);
    await expect(page.locator('.trix-two-announcements[data-state="hidden"]')).toHaveCount(4);
    await expect(page.locator('.announced-two-back')).toHaveCount(4);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, `${variant}-native-hidden.png`) });

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Game paused' })).toBeVisible();
    expect(observation(await current(page)).twoAnnouncements).toEqual(hidden.twoAnnouncements);
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
    await page.getByRole('button', { name: 'Jack of clubs', exact: true }).dblclick();
    await expect
      .poll(async () => observation(await current(page)).twoAnnouncements?.status, { timeout: 30_000 })
      .toBe('revealed');
    const revealedView = await current(page),
      revealed = observation(revealedView);
    expect(revealed.turn).toBe(0);
    expect(revealed.board.find((row) => row.suit === 'C')).toEqual({ suit: 'C', low: 10, high: 12 });
    expect(revealed.passes).toHaveLength(1);
    expect(revealed.passes[0].seat).toBe(3);
    expect(revealed.handCounts).toEqual([12, 12, 12, 13]);
    expect(revealed.hand).toContain('C2');
    expect(revealed.twoAnnouncements).toEqual({
      status: 'revealed',
      cards: [
        { seat: 0, card: 'C2' },
        { seat: 3, card: 'D2' },
        { seat: 2, card: 'H2' },
        { seat: 1, card: 'S2' },
      ],
    });
    await expect(page.locator('.trix-two-announcements[data-state="revealed"]')).toHaveCount(4);
    await expect(page.locator('.announced-two-back')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: resolve(evidence, `${variant}-native-revealed.png`) });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Game paused' })).toBeVisible();
    const restored = await current(page);
    expect(restored.session!.gameId).toBe(revealedView.session!.gameId);
    expect(observation(restored).twoAnnouncements).toEqual(revealed.twoAnnouncements);
    expect(errors).toEqual([]);
    await writeFile(
      resolve(evidence, `${variant}-native.json`),
      JSON.stringify(
        {
          variant,
          gameId: revealedView.session!.gameId,
          pin: revealedView.session!.pin,
          hidden: hidden.twoAnnouncements,
          revealed: revealed.twoAnnouncements,
          opening: {
            owner: hidden.owner,
            passes: revealed.passes,
            board: revealed.board,
            handCounts: revealed.handCounts,
          },
          reload: 'passed',
          pageErrors: errors,
        },
        null,
        2,
      ),
    );
  });
}
