import { test, expect, type Page } from '@playwright/test';
import type { NotesView, SessionView } from '../shared/contracts';

function fixture(): SessionView {
  return {
    game: {
      id: 'ui-fixture',
      mode: 'spades-partners',
      phase: 'play',
      hand: ['C2', 'D3', 'H4', 'S5'],
      handCounts: [4, 4, 4, 4],
      bids: [3, 2, 3, 2],
      tricks: [0, 0, 0, 0],
      scores: [0, 0, 0, 0],
      bags: [0, 0, 0, 0],
      trick: [],
      history: [],
      turn: 0,
      dealer: 3,
      handNumber: 1,
      heartsBroken: false,
      spadesBroken: true,
      passDirection: 'hold',
      received: [],
      outgoing: [],
      handResult: null,
      currentWinner: null,
      legalActions: [
        { kind: 'play', card: 'C2' },
        { kind: 'play', card: 'D3' },
        { kind: 'play', card: 'H4' },
        { kind: 'play', card: 'S5' },
      ],
    },
    revision: 1,
    decisionId: 'decision-1',
    preferences: { coachMode: 'asked', gameSpeed: 1 },
    access: {
      plan: 'unlimited',
      coverage: 'active',
      canPlay: true,
      canCoach: true,
      remainingHands: null,
      resetsAt: null,
      handUnlocked: true,
      canStartWork: true,
      localMock: true,
    },
    source: 'code',
    controlLeaseToken: 'lease-ui',
    stats: { decisions: 0, helped: 0, suggestions: 0 },
  };
}
async function mount(page: Page, value: SessionView = fixture()) {
  let state = structuredClone(value);
  const commands: Record<string, unknown>[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      expect(route.request().headers()['x-tricks-tab']).toBeTruthy();
      if (route.request().method() !== 'GET') expect(route.request().headers()['x-tricks-client']).toBe('1');
      if (url.pathname === '/api/session/actions') {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        commands.push(body);
        state = {
          ...state,
          revision: state.revision + 1,
          decisionId: 'decision-2',
          game: {
            ...state.game,
            turn: 1,
            hand: state.game.hand.filter((card) => card !== 'C2'),
            trick: [{ seat: 0, card: 'C2' }],
            legalActions: [],
          },
        };
        return route.fulfill({ json: state });
      }
      if (url.pathname === '/api/session/advice')
        return route.fulfill({
          json: {
            focus: 'Look at your options',
            notice: 'You may lead any legal card.',
            reason: 'The visible position gives you several choices.',
            suggestion: 'Consider your lowest club.',
            card: 'C2',
            source: 'code',
            decisionId: state.decisionId,
            requestedLevel: route.request().postDataJSON().requestedLevel,
          },
        });
      if (url.pathname === '/api/session/exposures') return route.fulfill({ json: { accepted: true } });
      if (url.pathname === '/api/session/prepare')
        return route.fulfill({
          json: {
            preparedDecisionId: 'prepared-1',
            decisionId: state.decisionId,
            revision: state.revision,
            source: 'code',
          },
        });
      return route.fulfill({ json: state });
    },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  return {
    commands,
    setState: (next: SessionView) => {
      state = next;
    },
  };
}

test('single card activation selects; fresh double activation commits one server command', async ({
  page,
}) => {
  const { commands } = await mount(page);
  const card = page.getByRole('button', { name: '2 of clubs', exact: true });
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  expect(commands).toHaveLength(0);
  await page.waitForTimeout(400);
  await card.dblclick();
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0]).toMatchObject({
    gameId: 'ui-fixture',
    expectedRevision: 1,
    action: { kind: 'play', card: 'C2' },
  });
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
});

test('off-turn prepared card never autoplays on the human turn', async ({ page }) => {
  const initial = fixture();
  initial.game.turn = 1;
  initial.game.legalActions = [];
  const harness = await mount(page, initial);
  await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  const next = fixture();
  next.revision = 2;
  next.decisionId = 'human-turn';
  harness.setState(next);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('button', { name: '2 of clubs', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.waitForTimeout(1100);
  expect(harness.commands).toHaveLength(0);
});

test('suggestion never commits or hides legal cards', async ({ page }) => {
  const { commands } = await mount(page);
  await page.getByRole('button', { name: 'Give me a cue' }).click();
  await expect(page.getByText('You may lead any legal card.')).toBeVisible();
  await page.getByRole('button', { name: 'Suggest a move', exact: true }).click();
  await expect(page.getByText('Consider your lowest club.')).toBeVisible();
  expect(commands).toHaveLength(0);
  await expect(page.locator('.hand-card')).toHaveCount(4);
});

test('finite demo makes zero API requests and reaches a terminal replay', async ({ page }) => {
  const calls: string[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      calls.push(route.request().url());
      return route.abort();
    },
  );
  await page.goto('/#demo');
  await page.getByRole('button', { name: 'Play the 4 of clubs' }).click();
  await page.getByRole('button', { name: 'Show the original' }).click();
  await page.getByRole('button', { name: 'Finish example' }).click();
  await expect(page.getByRole('heading', { name: 'Example complete' })).toBeVisible();
  expect(calls).toEqual([]);
});

test('phone portrait account bypasses table rotation gate', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = fixture();
  await page.route('**/api/account', (route) =>
    route.fulfill({
      json: {
        authMode: 'local-test',
        player: { id: '11111111-1111-4111-8111-111111111111', displayName: 'Local player' },
        access: session.access,
        subscription: {
          status: 'local-mock',
          plan: 'unlimited',
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
          billingAvailable: false,
        },
        offers: [
          { id: 'practice', name: 'Practice', description: 'Test coverage', price: null, currency: null },
        ],
      },
    }),
  );
  await page.goto('/#account');
  await expect(page.getByRole('heading', { name: 'Account and subscription' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel renewal' })).toBeVisible();
  await expect(page.getByText('Turn your phone')).toHaveCount(0);
});

test('late refresh cannot overwrite a newly accepted game', async ({ page }) => {
  let release: (() => void) | undefined;
  let reads = 0;
  const initial = fixture();
  initial.game.turn = 1;
  initial.game.legalActions = [];
  const next = fixture();
  next.game.id = 'new-game';
  next.game.mode = 'hearts';
  next.decisionId = 'new-game-decision';
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      if (new URL(route.request().url()).pathname === '/api/sessions') return route.fulfill({ json: next });
      reads++;
      if (reads === 3) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return route.fulfill({ json: initial });
      }
      return route.fulfill({ json: initial });
    },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect.poll(() => reads).toBe(3);
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page
    .locator('.game-option')
    .filter({ has: page.locator('.game-art-hearts') })
    .click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.locator('.game-switch')).toContainText('Hearts');
  release?.();
  await page.waitForTimeout(250);
  await expect(page.locator('.game-switch')).toContainText('Hearts');
});

test('retry after lost response keeps exactly the original mutation envelope', async ({ page }) => {
  await mount(page);
  const bodies: unknown[] = [];
  const next = fixture();
  next.revision = 2;
  next.decisionId = 'accepted';
  next.game.hand = ['D3', 'H4', 'S5'];
  await page.route('**/api/session/actions', async (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) return route.abort('failed');
    return route.fulfill({ json: next });
  });
  await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.hand-card')).toHaveCount(3);
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
});

test('billing preview is server-defined and requires explicit confirmation', async ({ page }) => {
  const session = fixture();
  const changes: unknown[] = [];
  const account = {
    authMode: 'local-test',
    player: { id: '11111111-1111-4111-8111-111111111111', displayName: 'Local player' },
    access: session.access,
    subscription: {
      status: 'local-mock',
      plan: 'unlimited',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      billingAvailable: false,
    },
    offers: [{ id: 'practice', name: 'Practice', description: 'Test coverage', price: null, currency: null }],
  };
  await page.route('**/api/account', (route) => route.fulfill({ json: account }));
  await page.route('**/api/subscription/preview', (route) =>
    route.fulfill({
      json: {
        previewId: 'server-preview',
        action: 'select-plan',
        plan: 'practice',
        effectiveAt: '2026-10-01T00:00:00Z',
        expiresAt: '2026-09-28T00:00:00Z',
        amountDueNow: null,
        currency: null,
        mode: 'fixture',
        notice: 'Your current coverage continues until the effective date.',
      },
    }),
  );
  await page.route('**/api/subscription/change', (route) => {
    changes.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        operationId: 'operation-1',
        status: 'scheduled',
        effectiveAt: '2026-10-01T00:00:00Z',
        plan: 'practice',
        cancelAtPeriodEnd: false,
        mode: 'fixture',
        message: 'Test change scheduled.',
      },
    });
  });
  await page.goto('/#account');
  await page.getByRole('button', { name: 'Preview test plan' }).click();
  await expect(page.getByText('Your current coverage continues until the effective date.')).toBeVisible();
  expect(changes).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirm test change' }).click();
  await expect(page.getByText('Test change scheduled.')).toBeVisible();
  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({ previewId: 'server-preview' });
});

test('family member view exposes only own seat and leave control', async ({ page }) => {
  const session = fixture();
  await page.route('**/api/account', (route) =>
    route.fulfill({
      json: {
        authMode: 'local-test',
        player: { id: '11111111-1111-4111-8111-111111111111', displayName: 'Member' },
        access: session.access,
        subscription: {
          status: 'none',
          plan: null,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
          billingAvailable: false,
        },
        offers: [],
      },
    }),
  );
  await page.route('**/api/family', (route) =>
    route.fulfill({
      json: {
        familyId: 'family-1',
        role: 'member',
        payer: { playerId: 'payer-1', displayName: 'Payer' },
        members: [
          {
            assignmentId: 'assignment-1',
            playerId: 'member-1',
            displayName: 'Member',
            seatClass: 'limited',
            status: 'active',
            periodEnd: '2026-10-01T00:00:00Z',
          },
        ],
        invitations: [],
        periodEnd: '2026-10-01T00:00:00Z',
        localMock: true,
      },
    }),
  );
  await page.goto('/#account');
  await page.getByRole('button', { name: 'Manage family' }).click();
  await expect(page.getByText('Paid by Payer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leave family', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create invitation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove member' })).toHaveCount(0);
});

test('desktop and landscape phone preserve table geometry and card targets', async ({ page }, testInfo) => {
  const session = fixture();
  session.game.hand = ['C3', 'C10', 'CK', 'D8', 'D9', 'H2', 'H8', 'S2', 'S6', 'S8', 'S9', 'SK', 'SA'];
  session.game.handCounts = [13, 13, 13, 13];
  session.game.legalActions = session.game.hand.map((card) => ({ kind: 'play', card }));
  await page.setViewportSize({ width: 1280, height: 800 });
  await mount(page, session);
  await expect(page.getByRole('region', { name: 'Card table' })).toBeVisible();
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return (
        document.fonts.check('14px "DM Sans Variable"') && document.fonts.check('14px "Manrope Variable"')
      );
    }),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('desktop.png') });
  await page.setViewportSize({ width: 667, height: 375 });
  await expect(page.locator('.hand-card')).toHaveCount(13);
  const cards = await page.locator('.hand-card').evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, width: r.width };
    }),
  );
  for (let index = 0; index < cards.length - 1; index++)
    expect(cards[index + 1].x - cards[index].x).toBeGreaterThanOrEqual(43.9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('phone.png') });
  await page.setViewportSize({ width: 568, height: 320 });
  await expect(page.locator('.hand-cards')).toHaveCSS('overflow-x', 'auto');
  const lastCard = page.locator('.hand-card').last();
  await page.locator('.hand-card').first().focus();
  for (let index = 1; index < 13; index++) await page.keyboard.press('Tab');
  await expect(lastCard).toBeFocused();
  await expect(lastCard).toBeInViewport({ ratio: 1 });
  expect(await page.locator('.hand-cards').evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await page.locator('.hand-card').first().focus();
  expect((await page.locator('.hand-card').first().boundingBox())!.x).toBeGreaterThanOrEqual(0);
});

for (const mode of ['spades-partners', 'hearts'] as const) {
  test(`${mode}: unavailable-card cues follow server legality and clear on a new turn`, async ({ page }) => {
    const restricted = mode === 'hearts' ? 'H4' : 'S5';
    const label = mode === 'hearts' ? '4 of hearts' : '5 of spades';
    const initial = fixture();
    initial.game.mode = mode;
    initial.game.spadesBroken = false;
    initial.game.legalActions = [{ kind: 'play', card: 'C2' }];
    const harness = await mount(page, initial);
    const blocked = page.getByRole('button', { name: `${label}, unavailable this turn`, exact: true });
    await expect(blocked).toBeDisabled();
    await expect(blocked).toHaveAttribute('aria-disabled', 'true');
    await expect(blocked.locator('.unavailable-mark')).toBeVisible();
    await expect(page.getByRole('button', { name: '2 of clubs', exact: true })).toBeEnabled();
    expect(harness.commands).toHaveLength(0);
    await expect(page.locator('.you-active .your-turn-mark')).toBeVisible();
    expect(await page.locator('.you-label').ariaSnapshot()).toContain(
      mode === 'hearts' ? '0 tricks' : '0 tricks, bid 3',
    );
    await expect(page.getByRole('status')).toHaveText('Your turn');
    const announcement = await page.getByRole('status').boundingBox();
    expect(announcement?.width).toBe(1);
    expect(announcement?.height).toBe(1);
    expect(await page.locator('.app-shell').innerText()).not.toMatch(
      /Spades (?:un)?broken|Hearts (?:un)?broken|bid is covered|Double-tap/,
    );

    // A legal exception must stay available even when the restricted-suit flag is false.
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
    const next = fixture();
    next.game.mode = mode;
    next.revision = 2;
    next.decisionId = 'legal-exception';
    next.game.hand = [restricted];
    next.game.spadesBroken = false;
    next.game.legalActions = [{ kind: 'play', card: restricted }];
    harness.setState(next);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(page.getByRole('button', { name: label, exact: true })).toBeEnabled();
    await expect(page.locator('.unavailable-mark')).toHaveCount(0);
    expect(harness.commands).toHaveLength(0);
  });
}

test('a prepared card becomes unavailable without autoplay when the server excludes it', async ({ page }) => {
  const initial = fixture();
  initial.game.turn = 1;
  initial.game.legalActions = [];
  const harness = await mount(page, initial);
  await page.getByRole('button', { name: '5 of spades', exact: true }).click();
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  const next = fixture();
  next.revision = 2;
  next.decisionId = 'restricted-human-turn';
  next.game.spadesBroken = false;
  next.game.legalActions = [{ kind: 'play', card: 'C2' }];
  harness.setState(next);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  const blocked = page.getByRole('button', { name: '5 of spades, unavailable this turn', exact: true });
  await expect(blocked).toBeDisabled();
  await expect(blocked).toHaveAttribute('aria-pressed', 'false');
  expect(harness.commands).toHaveLength(0);
});

test('last trick stays beside the table with seat positions, no names and no notes request', async ({
  page,
}, testInfo) => {
  const session = fixture();
  session.game.hand = ['C3', 'C10', 'CK', 'D8', 'D9', 'H2', 'H8', 'S2', 'S6', 'S8', 'SK', 'SA'];
  session.game.handCounts = [12, 12, 12, 11];
  session.game.spadesBroken = false;
  session.game.history = [
    {
      plays: [
        { seat: 0, card: 'C2' },
        { seat: 1, card: 'C4' },
        { seat: 2, card: 'C7' },
        { seat: 3, card: 'CQ' },
      ],
      winner: 3,
    },
  ];
  session.game.tricks = [0, 0, 0, 1];
  session.game.trick = [{ seat: 3, card: 'D6' }];
  session.game.currentWinner = 3;
  session.game.legalActions = [
    { kind: 'play', card: 'D8' },
    { kind: 'play', card: 'D9' },
  ];
  const notesCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/session/notes') || request.url().includes('/api/coaching/hand-unlocks'))
      notesCalls.push(request.url());
  });
  const harness = await mount(page, session);
  const last = page.getByRole('complementary', { name: 'Last trick', exact: true });
  await expect(last.getByRole('img')).toHaveCount(4);
  await expect(last.getByRole('img', { name: 'Theo: Queen of clubs, won the trick' })).toBeVisible();
  expect(await last.innerText()).not.toMatch(/You|Leo|Maya|Theo/);
  await expect(page.getByRole('button', { name: 'Last trick' })).toHaveCount(0);
  for (const [width, height, name] of [
    [1920, 1080, 'wide-desktop'],
    [1280, 800, 'desktop'],
    [1024, 768, 'tablet-landscape'],
    [800, 600, 'compact-window'],
    [700, 700, 'square-window'],
    [768, 1024, 'tablet'],
    [700, 701, 'short-tablet'],
    [844, 390, 'wide-phone'],
    [667, 375, 'phone'],
    [667, 320, 'short-phone'],
    [568, 320, 'small-phone'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(last).toBeVisible();
    const memory = await last.boundingBox();
    const current = await page.locator('.trick-area').boundingBox();
    const table = await page.getByRole('region', { name: 'Card table' }).boundingBox();
    const west = await page.locator('.player-1').boundingBox();
    expect(memory).not.toBeNull();
    expect(current).not.toBeNull();
    expect(west).not.toBeNull();
    expect(table).not.toBeNull();
    expect(memory!.x + memory!.width).toBeLessThan(table!.x);
    expect(memory!.x).toBeGreaterThanOrEqual(0);
    expect(memory!.y).toBeGreaterThanOrEqual(0);
    expect(memory!.x + memory!.width).toBeLessThanOrEqual(current!.x);
    expect(memory!.y + memory!.height).toBeLessThan(height);
    for (const selector of ['.trick-area', '.player-1', '.player-2', '.player-3', '.coach-panel']) {
      const box = await page.locator(selector).boundingBox();
      expect(
        box!.x >= memory!.x + memory!.width ||
          box!.y >= memory!.y + memory!.height ||
          box!.y + box!.height <= memory!.y,
        `${name}: ${selector} must not overlap last trick`,
      ).toBe(true);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`cues-${name}.png`), fullPage: true });
    if (name === 'square-window' || name === 'short-tablet') {
      const hand = page.locator('.hand-card').first();
      await hand.scrollIntoViewIfNeeded();
      await expect(hand).toBeInViewport({ ratio: 1 });
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  }
  expect(notesCalls).toEqual([]);
  expect(harness.commands).toHaveLength(0);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  const next = fixture();
  next.revision = 2;
  next.decisionId = 'next-hand';
  next.game.handNumber = 2;
  harness.setState(next);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(last).toHaveCount(0);
  for (const [width, height] of [
    [320, 568],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('heading', { name: /Turn your phone/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Card table' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

for (const phase of ['hand-end', 'match-end'] as const) {
  test(`${phase}: Play again continues a hand or restarts the same game`, async ({ page }) => {
    const ended = fixture();
    ended.game.phase = phase;
    ended.game.turn = null;
    ended.game.hand = [];
    ended.game.legalActions = [];
    const harness = await mount(page, ended);
    const requests: unknown[] = [];
    const next = fixture();
    next.revision = 2;
    next.decisionId = 'playing-again';
    next.game.handNumber = phase === 'hand-end' ? 2 : 1;
    next.game.id = phase === 'hand-end' ? ended.game.id : 'restarted-game';
    await page.route(phase === 'hand-end' ? '**/api/session/next-hand' : '**/api/sessions', (route) => {
      requests.push(route.request().postDataJSON());
      harness.setState(next);
      return route.fulfill({ json: next });
    });
    const recap = page.getByRole('dialog');
    await expect(recap.getByRole('button', { name: 'Play again', exact: true })).toBeVisible();
    await expect(recap.getByText('Turns with cues or table notes open. No skill rating.')).not.toBeVisible();
    await recap.getByRole('button', { name: 'Play again', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject(
      phase === 'hand-end'
        ? { gameId: ended.game.id, expectedRevision: ended.revision }
        : { mode: ended.game.mode, expectedActiveGameId: ended.game.id },
    );
    await expect(page.locator('.hand-card')).toHaveCount(4);
  });
}

test('compact notes keep rules expandable by keyboard and settings use short labels', async ({
  page,
}, testInfo) => {
  const harness = await mount(page);
  const notes: NotesView = {
    memory: [
      { suit: 'C', played: 4, remaining: 9, voidSeats: [], playedCards: ['C2', 'C4', 'C7', 'CQ'] },
      { suit: 'D', played: 0, remaining: 13, voidSeats: [] },
      { suit: 'H', played: 0, remaining: 13, voidSeats: [] },
      { suit: 'S', played: 0, remaining: 13, voidSeats: [] },
    ],
    outgoing: [],
    received: [],
    history: [],
  };
  await page.route('**/api/session/notes', (route) => route.fulfill({ json: notes }));
  await page.getByRole('button', { name: 'Table notes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Table notes', exact: true });
  await expect(dialog.getByText('9 unplayed')).toBeVisible();
  await expect(dialog.getByText('Last trick', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Your pass · private', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/Nil: ±100/)).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('cues-notes.png') });
  await page.keyboard.press('Tab');
  await expect(dialog.getByText('Played cards', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByText('Table rules', { exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog.getByText(/Nil: ±100/)).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Table notes', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'When I ask', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Occasional cues', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '1.2×', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('cues-settings.png') });
  expect(harness.commands).toHaveLength(0);
});
