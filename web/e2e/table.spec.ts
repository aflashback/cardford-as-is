import { test, expect, type Page } from '@playwright/test';
import type { SessionView } from '../shared/contracts';

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
      spadesBroken: false,
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
});
