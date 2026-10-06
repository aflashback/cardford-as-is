import { test, expect, type Page, type Response } from '@playwright/test';
import type { DemoFrame, DemoFrameRequest } from '../shared/contracts';

const contentVersion = 'spades-example-1.0.0';
const path = '/api/demo/frame';
const titles: Record<string, string> = {
  opening: 'A short example game',
  notice: 'Notice',
  original: 'Original',
  continuation: 'Possible continuation',
  complete: 'Example complete',
};
const liveOrigin = process.env.CARDFORD_M04D_ORIGIN;

test.describe('MG-15 authored demo against the native Go listener', () => {
  // The original Node UI suite may discover this file, but cannot close this
  // gate. Only an explicitly started Go listener supplies successful frames.
  test.skip(!liveOrigin, 'Set CARDFORD_M04D_ORIGIN to the actual Go listener with --web');

  function trackAPI(page: Page) {
    const requests: { path: string; body: DemoFrameRequest | null }[] = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith('/api/')) {
        let body: DemoFrameRequest | null = null;
        try {
          body = request.postDataJSON() as DemoFrameRequest | null;
        } catch {
          /* Malformed negative requests still count as API traffic. */
        }
        requests.push({ path: pathname, body });
      }
    });
    return requests;
  }

  async function confirmedResponse(response: Response, node: string) {
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
    const frame = (await response.json()) as DemoFrame;
    expect(frame).toMatchObject({
      contentVersion,
      nodeId: node,
      label: 'demo',
      complete: node === 'complete',
    });
    expect(frame.cards).toEqual(['C4', 'CK', 'CA']);
    return frame;
  }

  async function choose(page: Page, label: string, node: string) {
    const reply = page.waitForResponse(
      (response) => new URL(response.url()).pathname === path && response.status() === 200,
    );
    await page.getByRole('button', { name: label, exact: true }).click();
    await confirmedResponse(await reply, node);
    await expect(page.getByRole('heading', { name: titles[node], exact: true })).toBeVisible();
  }

  async function open(page: Page) {
    const reply = page.waitForResponse(
      (response) => new URL(response.url()).pathname === path && response.status() === 200,
    );
    await page.goto(`${liveOrigin}/#demo`);
    await confirmedResponse(await reply, 'opening');
    await expect(page.getByRole('button', { name: 'Play the 4 of clubs', exact: true })).toBeEnabled();
  }

  test('all authored edges require confirmed demo frames and issue no live API work', async ({
    page,
    context,
  }, testInfo) => {
    const requests = trackAPI(page);
    await open(page);
    await choose(page, 'Play the 4 of clubs', 'notice');
    await choose(page, 'Show the original', 'original');
    await choose(page, 'Compare another choice', 'continuation');
    await choose(page, 'Show the original', 'original');
    await choose(page, 'Finish example', 'complete');
    await choose(page, 'Replay example', 'opening');
    await choose(page, 'Play the king of clubs', 'notice');
    await choose(page, 'Compare another choice', 'continuation');
    await choose(page, 'Finish example', 'complete');
    await choose(page, 'Replay example', 'opening');
    expect(requests.every((request) => request.path === path)).toBe(true);
    expect(requests.map((request) => request.body)).toContainEqual({ kind: 'replay', contentVersion });
    expect(await context.cookies()).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('online-authored-demo.png') });
  });

  for (const kind of ['open', 'choose', 'replay'] as const) {
    test(`failed ${kind} retains an inert confirmed frame until the exact request reconnects`, async ({
      page,
    }) => {
      const requests = trackAPI(page);
      let blocked = kind === 'open';
      await page.route(`**${path}`, (route) =>
        blocked ? route.abort('internetdisconnected') : route.continue(),
      );
      if (kind === 'open') {
        await page.goto(`${liveOrigin}/#demo`);
      } else {
        await open(page);
        if (kind === 'replay') {
          await choose(page, 'Play the 4 of clubs', 'notice');
          await choose(page, 'Show the original', 'original');
          await choose(page, 'Finish example', 'complete');
        }
        blocked = true;
        await page
          .getByRole('button', {
            name: kind === 'replay' ? 'Replay example' : 'Play the 4 of clubs',
            exact: true,
          })
          .click();
      }
      await expect(page.getByRole('alert')).toContainText(
        'Connection lost. Reconnect to continue the example.',
      );
      const unchanged = await page.locator('.account-section').textContent();
      const pending = requests.at(-1)!.body!;
      expect(pending.kind).toBe(kind);
      if (kind === 'open') {
        await expect(page.locator('.demo-actions button')).toHaveCount(0);
        await expect(page.locator('.demo-cards')).toHaveCount(0);
      } else {
        const controls = page.locator('.demo-actions button');
        for (const control of await controls.all()) await expect(control).toBeDisabled();
        await expect(
          page.getByRole('heading', {
            name: kind === 'replay' ? titles.complete : titles.opening,
            exact: true,
          }),
        ).toBeVisible();
      }
      await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      expect(requests.at(-1)!.body).toEqual(pending);
      expect(await page.locator('.account-section').textContent()).toBe(unchanged);
      blocked = false;
      const reply = page.waitForResponse(
        (response) => new URL(response.url()).pathname === path && response.status() === 200,
      );
      await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
      const destination = kind === 'choose' ? 'notice' : 'opening';
      await confirmedResponse(await reply, destination);
      await expect(page.getByRole('heading', { name: titles[destination], exact: true })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      expect(requests.at(-1)!.body).toEqual(pending);
      expect(requests.every((request) => request.path === path)).toBe(true);
    });
  }

  test('an unavailable demo route explains activation without offering connection retry', async ({
    page,
  }) => {
    const requests = trackAPI(page);
    // This is an error-only legacy-service fixture; no successful frame is fabricated.
    await page.route(`**${path}`, (route) =>
      route.fulfill({
        status: 404,
        json: { code: 'NOT_FOUND', message: 'The requested resource is unavailable.' },
      }),
    );
    await page.goto(`${liveOrigin}/#demo`);
    await expect(page.getByRole('alert')).toHaveText(
      'The online example is not available on this service yet.',
    );
    await expect(page.getByRole('button', { name: 'Reconnect', exact: true })).toHaveCount(0);
    await expect(page.locator('.demo-actions button')).toHaveCount(0);
    await expect(page.locator('.demo-cards')).toHaveCount(0);
    await expect(page.getByText('Connection lost. Reconnect to continue the example.')).toHaveCount(0);
    expect(requests.every((request) => request.path === path)).toBe(true);
  });

  for (const rejection of ['malformed', 'unknown-node'] as const) {
    test(`a server-confirmed ${rejection} choice rejection cannot advance the client frame`, async ({
      page,
    }) => {
      const requests = trackAPI(page);
      await open(page);
      const originalBody = await page.locator('.account-section > p').textContent();
      let corrupt = true;
      await page.route(`**${path}`, async (route) => {
        if (corrupt) {
          corrupt = false;
          const postData =
            rejection === 'malformed'
              ? '{"kind":"choose"'
              : JSON.stringify({ kind: 'choose', contentVersion, nodeId: 'invented', choiceId: 'play-four' });
          // Keep the response real: only mutate the outgoing request, which the
          // actual Go frozen-contract/graph boundary must reject.
          await route.continue({ postData });
        } else await route.continue();
      });
      const rejected = page.waitForResponse(
        (response) => new URL(response.url()).pathname === path && response.status() === 400,
      );
      await page.getByRole('button', { name: 'Play the 4 of clubs', exact: true }).click();
      const response = await rejected;
      expect(response.headers()['cache-control']).toBe('no-store');
      expect(await response.json()).toMatchObject({ code: 'INVALID_COMMAND' });
      await expect(page.getByRole('alert')).toContainText(
        'Connection lost. Reconnect to continue the example.',
      );
      await expect(page.getByRole('heading', { name: titles.opening, exact: true })).toBeVisible();
      expect(await page.locator('.account-section > p').textContent()).toBe(originalBody);
      await expect(page.getByRole('button', { name: 'Play the 4 of clubs', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Play the king of clubs', exact: true })).toBeDisabled();
      await choose(page, 'Reconnect', 'notice');
      await expect(page.getByRole('alert')).toHaveCount(0);
      expect(requests.at(-1)!.body).toEqual({
        kind: 'choose',
        contentVersion,
        nodeId: 'opening',
        choiceId: 'play-four',
      });
      expect(requests.every((request) => request.path === path)).toBe(true);
    });
  }

  test('a delayed old Go choice response cannot overwrite a later reloaded frame', async ({ page }) => {
    const requests = trackAPI(page);
    await open(page);
    let release: (() => void) | undefined;
    let held = false;
    let delivered = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**${path}`, async (route) => {
      const request = route.request().postDataJSON() as DemoFrameRequest;
      if (!held && request.kind === 'choose' && request.nodeId === 'opening') {
        const response = await route.fetch(); // Actual Go DTO; no fabricated success.
        held = true;
        expect(response.status()).toBe(200);
        expect(((await response.json()) as DemoFrame).nodeId).toBe('notice');
        await gate;
        try {
          await route.fulfill({ response });
        } catch {
          /* Old page may have canceled its request. */
        }
        delivered = true;
      } else await route.continue();
    });
    try {
      await page.getByRole('button', { name: 'Play the 4 of clubs', exact: true }).click();
      await expect.poll(() => held).toBe(true);
      await expect(page.getByRole('heading', { name: titles.opening, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Play the 4 of clubs', exact: true })).toBeDisabled();
      const reply = page.waitForResponse(
        (response) => new URL(response.url()).pathname === path && response.status() === 200,
      );
      await page.reload();
      await confirmedResponse(await reply, 'opening');
      await choose(page, 'Play the king of clubs', 'notice');
      await choose(page, 'Show the original', 'original');
      release!();
      await expect.poll(() => delivered).toBe(true);
      // Let delivery and React rendering settle before checking the newer frame.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      await expect(page.getByRole('heading', { name: titles.original, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Finish example', exact: true })).toBeEnabled();
      expect(requests.every((request) => request.path === path)).toBe(true);
    } finally {
      release?.();
    }
  });

  test('the actual demo route rejects invented content and mixed live requests', async ({ page }) => {
    const requests = trackAPI(page);
    await open(page);
    const confirmedSection = await page.locator('.account-section').textContent();
    const invalid = [
      { kind: 'open', contentVersion: 'invented' },
      { kind: 'choose', contentVersion, nodeId: 'invented', choiceId: 'play-four' },
      { kind: 'choose', contentVersion, nodeId: 'opening', choiceId: 'finish' },
      {
        kind: 'choose',
        contentVersion,
        nodeId: 'opening',
        choiceId: 'play-four',
        position: { hand: ['CA'] },
      },
      { kind: 'open', contentVersion, seed: 1 },
      { kind: 'replay', contentVersion, commandId: 'client-command', expectedRevision: 1 },
    ];
    for (const body of invalid) {
      const result = await page.evaluate(
        async ({ body, path }) => {
          const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Tricks-Client': '1' },
            body: JSON.stringify(body),
          });
          return {
            status: response.status,
            cache: response.headers.get('cache-control'),
            body: (await response.json()) as unknown,
          };
        },
        { body, path },
      );
      expect(result.status).toBe(400);
      expect(result.cache).toBe('no-store');
      expect(result.body).toMatchObject({ code: 'INVALID_COMMAND' });
      expect(await page.locator('.account-section').textContent()).toBe(confirmedSection);
    }
    await expect(page.getByRole('heading', { name: titles.opening, exact: true })).toBeVisible();
    expect(requests.every((request) => request.path === path)).toBe(true);
  });
});
