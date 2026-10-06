import { test, expect, type Page } from '@playwright/test';
import type { DevScenarioView, SessionView } from '../shared/contracts';

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
function accountFixture(value = fixture(), ownerId = '11111111-1111-4111-8111-111111111111') {
  return {
    authMode: 'local-test',
    player: { id: ownerId, displayName: 'Local player' },
    access: value.access,
    subscription: {
      status: 'local-mock',
      plan: 'unlimited',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      billingAvailable: false,
    },
    offers: [],
  };
}
async function mount(page: Page, value: SessionView = fixture(), scenarios: DevScenarioView[] = []) {
  let state = structuredClone(value);
  const commands: Record<string, unknown>[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      expect(route.request().headers()['x-tricks-tab']).toBeTruthy();
      if (url.pathname === '/api/account') return route.fulfill({ json: accountFixture(state) });
      if (url.pathname === '/api/identity')
        return route.fulfill({ json: { playerId: '11111111-1111-4111-8111-111111111111' } });
      if (url.pathname.startsWith('/api/commands/')) return route.fulfill({ json: { status: 'unknown' } });
      if (url.pathname.startsWith('/api/review-trials/'))
        return route.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: 'Not ready.' } });
      if (url.pathname === '/api/dev/scenarios') return route.fulfill({ json: { scenarios } });
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

test('connection screen shows CardFord logo when the table cannot load', async ({ page }, testInfo) => {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill({ status: 503, json: { error: 'Unavailable' } }),
  );
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'CardFord' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('cardford-loading.png') });
});

for (const loseOpeningResponse of [false, true]) {
  test(`anonymous ${loseOpeningResponse ? 'reconnect after lost opening response' : 'first visit'} establishes a session before identity verification`, async ({
    page,
  }) => {
    const requests: string[] = [];
    const mutations: unknown[] = [];
    let sessionReads = 0;
    await page.addInitScript(() => {
      const now = Date.now();
      sessionStorage.setItem('tricks-tab', 'tab-identity-bootstrap');
      localStorage.setItem(
        'cardford-pending-v1:tab-identity-bootstrap:session',
        JSON.stringify({
          version: 1,
          ownerId: '11111111-1111-4111-8111-111111111111',
          gameId: 'ui-fixture',
          createdAt: now,
          expiresAt: now + 24 * 60 * 60 * 1000,
          operation: {
            path: '/api/sessions',
            body: {
              commandId: '00000000-0000-4000-8000-000000000001',
              mode: 'hearts',
              expectedActiveGameId: 'ui-fixture',
            },
          },
        }),
      );
    });
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) => {
        const path = new URL(route.request().url()).pathname;
        requests.push(path);
        if (route.request().method() !== 'GET') {
          mutations.push(route.request().postDataJSON());
          return route.abort();
        }
        if (path === '/api/identity') {
          if (!route.request().headers().cookie?.includes('tc_session=bootstrap-fixture'))
            return route.fulfill({
              status: 401,
              json: { code: 'UNAUTHENTICATED', message: 'Start a local session to continue.' },
            });
          return route.fulfill({ json: { playerId: '22222222-2222-4222-8222-222222222222' } });
        }
        if (path === '/api/session') {
          sessionReads++;
          if (loseOpeningResponse && sessionReads === 1) return route.abort('failed');
          return route.fulfill({
            headers: { 'set-cookie': 'tc_session=bootstrap-fixture; HttpOnly; Path=/; SameSite=Strict' },
            json: fixture(),
          });
        }
        if (path === '/api/dev/scenarios') return route.fulfill({ json: { scenarios: [] } });
        return route.fulfill({ json: fixture() });
      },
    );
    await page.goto('/');
    if (loseOpeningResponse) {
      await expect(page.getByRole('status')).not.toHaveText('Opening your table…');
      await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
    }
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    expect(requests[0]).toBe('/api/session');
    expect(requests.indexOf('/api/identity')).toBeGreaterThan(requests.indexOf('/api/session'));
    expect(mutations).toHaveLength(0);
    expect(
      await page.evaluate(() => localStorage.getItem('cardford-pending-v1:tab-identity-bootstrap:session')),
    ).toBeNull();
  });
}

test('single card activation selects; fresh double activation commits one server command', async ({
  page,
}) => {
  const { commands } = await mount(page);
  await expect(page).toHaveTitle('Spades — CardFord');
  await expect(page.getByRole('link', { name: 'CardFord choose game' })).toBeVisible();
  await expect(page.locator('.brand-symbol')).toBeVisible();
  await expect(page.getByText('Tricks Coach')).toHaveCount(0);
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
  let active = initial;
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      if (new URL(route.request().url()).pathname === '/api/account')
        return route.fulfill({ json: accountFixture(active) });
      if (new URL(route.request().url()).pathname === '/api/identity')
        return route.fulfill({ json: { playerId: '11111111-1111-4111-8111-111111111111' } });
      if (new URL(route.request().url()).pathname === '/api/sessions') {
        active = next;
        return route.fulfill({ json: next });
      }
      if (new URL(route.request().url()).pathname === '/api/dev/scenarios')
        return route.fulfill({ json: { scenarios: [] } });
      reads++;
      if (reads === 3) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return route.fulfill({ json: initial });
      }
      return route.fulfill({ json: active });
    },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect.poll(() => reads).toBe(3);
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page
    .locator('.game-option')
    .filter({ has: page.locator('.game-art-hearts') })
    .click();
  await expect(page.locator('.game-switch')).toContainText('Hearts');
  release?.();
  await page.waitForTimeout(250);
  await expect(page.locator('.game-switch')).toContainText('Hearts');
});

test('new game wizard saves pace and starts from the chosen card', async ({ page }, testInfo) => {
  const initial = fixture();
  const harness = await mount(page, initial);
  const requests: unknown[] = [];
  await page.route('**/api/preferences', (route) => {
    const body = route.request().postDataJSON() as { preferences: SessionView['preferences'] };
    requests.push(body);
    const updated = { ...initial, preferences: body.preferences };
    harness.setState(updated);
    return route.fulfill({ json: updated });
  });
  await page.route('**/api/sessions', (route) => {
    requests.push(route.request().postDataJSON());
    const next = fixture();
    next.game.mode = 'hearts';
    next.game.id = 'wizard-game';
    next.preferences.gameSpeed = 1.2;
    harness.setState(next);
    return route.fulfill({ json: next });
  });
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await expect(page.getByRole('main', { name: 'New game setup' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Choose game' })).toHaveCount(0);
  await page.getByRole('button', { name: '1.2×' }).click();
  await expect(page.getByRole('button', { name: '1.2×' })).toHaveAttribute('aria-pressed', 'true');
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Close new game setup' }).click();
  await expect(page.getByRole('main', { name: 'New game setup' })).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await expect(page.getByRole('button', { name: '1×', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '1.2×' }).click();
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await expect(page.getByText('You and three trained players.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start game' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('cardford-wizard.png') });
  await page
    .locator('.game-option')
    .filter({ has: page.locator('.game-art-hearts') })
    .click();
  await expect(page.getByRole('main', { name: 'New game setup' })).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatchObject({ preferences: { gameSpeed: 1.2 } });
  expect(requests[1]).toMatchObject({ mode: 'hearts', expectedActiveGameId: initial.game.id });
});

test('retry after lost response keeps exactly the original mutation envelope', async ({ page }) => {
  const harness = await mount(page);
  const bodies: unknown[] = [];
  const next = fixture();
  next.revision = 2;
  next.decisionId = 'accepted';
  next.game.hand = ['D3', 'H4', 'S5'];
  await page.route('**/api/session/actions', async (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) return route.abort('failed');
    harness.setState(next);
    return route.fulfill({ json: next });
  });
  await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.hand-card')).toHaveCount(3);
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
});

for (const mode of ['hearts', 'spades-solo', 'spades-partners'] as const) {
  test(`${mode}: lost accepted move survives paused reload and reconciles without another mutation`, async ({
    page,
  }) => {
    const initial = fixture();
    initial.game.mode = mode;
    const harness = await mount(page, initial);
    const bodies: unknown[] = [];
    const next = structuredClone(initial);
    next.revision++;
    next.decisionId = 'after-accepted';
    next.game.hand = ['D3', 'H4', 'S5'];
    await page.route('**/api/session/actions', (route) => {
      bodies.push(route.request().postDataJSON());
      harness.setState(next);
      return route.abort('failed');
    });
    await page.route('**/api/commands/*', (route) => route.fulfill({ json: { status: 'accepted' } }));
    await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.reload();
    await expect(
      page.getByText('A previous request has an unconfirmed outcome.', { exact: false }),
    ).toBeVisible();
    await page.waitForTimeout(100);
    expect(bodies).toHaveLength(1);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.hand-card')).toHaveCount(3);
    expect(bodies).toHaveLength(1);
  });
}

test('lost unaccepted new-game request survives reload and retries its original body', async ({ page }) => {
  const harness = await mount(page);
  const bodies: unknown[] = [];
  await page.route('**/api/sessions', (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) return route.abort('failed');
    const next = fixture();
    next.game.id = 'retried-new-game';
    next.game.mode = 'hearts';
    harness.setState(next);
    return route.fulfill({ json: next });
  });
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page
    .locator('.game-option')
    .filter({ has: page.locator('.game-art-hearts') })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.game-switch')).toContainText('Hearts');
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
});

test('pending command still reconciles when identity verification fails during opening', async ({ page }) => {
  const harness = await mount(page);
  const bodies: unknown[] = [];
  const next = fixture();
  next.revision++;
  next.game.hand = ['D3', 'H4', 'S5'];
  next.game.legalActions = [{ kind: 'play', card: 'D3' }];
  await page.route('**/api/session/actions', (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length > 1) {
      const fresh = structuredClone(next);
      fresh.revision++;
      fresh.game.hand = ['H4', 'S5'];
      fresh.game.legalActions = [];
      harness.setState(fresh);
      return route.fulfill({ json: fresh });
    }
    harness.setState(next);
    return route.abort('failed');
  });
  await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.route('**/api/identity', (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Opening unavailable.',
      },
    }),
  );
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Opening unavailable.');
  await page.route('**/api/identity', (route) =>
    route.fulfill({ json: { playerId: '11111111-1111-4111-8111-111111111111' } }),
  );
  await page.route('**/api/commands/*', (route) => route.fulfill({ json: { status: 'accepted' } }));
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('.hand-card')).toHaveCount(3);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(bodies).toHaveLength(1);
  await page.getByRole('button', { name: '3 of diamonds', exact: true }).dblclick();
  await expect.poll(() => bodies.length).toBe(2);
  expect((bodies[1] as { commandId: string }).commandId).not.toBe(
    (bodies[0] as { commandId: string }).commandId,
  );
  await expect(page.locator('.hand-card')).toHaveCount(2);
});

test('transport deadline frees the table and keeps a recoverable same-command retry', async ({ page }) => {
  await page.clock.install();
  await mount(page);
  const bodies: unknown[] = [];
  await page.route('**/api/session/actions', (route) => {
    bodies.push(route.request().postDataJSON());
  });
  await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  await expect.poll(() => bodies.length).toBe(1);
  await page.clock.fastForward(15_001);
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed');
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled();
  expect(bodies).toHaveLength(1);
});

test('a different signed-in owner discards a pending command instead of replaying it', async ({ page }) => {
  await mount(page);
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/api/session/actions', (route) => {
    bodies.push(route.request().postDataJSON());
    return route.abort('failed');
  });
  await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.route('**/api/account', (route) =>
    route.fulfill({ json: accountFixture(fixture(), '22222222-2222-4222-8222-222222222222') }),
  );
  await page.route('**/api/identity', (route) =>
    route.fulfill({ json: { playerId: '22222222-2222-4222-8222-222222222222' } }),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(bodies).toHaveLength(1);
  await page.getByRole('button', { name: '2 of clubs', exact: true }).dblclick();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1].commandId).not.toEqual(bodies[0].commandId);
});

test('in-place owner switch removes the prior table and fences a late refresh before preferences can resume', async ({
  page,
}) => {
  const harness = await mount(page);
  const old = fixture();
  const next = fixture();
  next.game.id = 'owner-b-game';
  next.game.hand = ['CA', 'DA', 'HA', 'SA'];
  next.game.legalActions = next.game.hand.map((card) => ({ kind: 'play', card }));
  next.preferences = { coachMode: 'after', gameSpeed: 1.4 };
  const preferences: unknown[] = [];
  let release: (() => void) | undefined;
  let delayed = false;
  await page.route('**/api/preferences', (route) => {
    preferences.push(route.request().postDataJSON());
    return route.fulfill({ json: next });
  });
  await page.route('**/api/session', async (route) => {
    if (!delayed) {
      delayed = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return route.fulfill({ json: old });
    }
    return route.fulfill({ json: next });
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(() => delayed).toBe(true);
  await page.route('**/api/account', (route) =>
    route.fulfill({ json: accountFixture(next, '22222222-2222-4222-8222-222222222222') }),
  );
  await page.route('**/api/identity', (route) =>
    route.fulfill({ json: { playerId: '22222222-2222-4222-8222-222222222222' } }),
  );
  harness.setState(next);
  await page.getByRole('button', { name: 'Occasional cues', exact: true }).click();
  await expect(page.locator('.hand-card')).toHaveCount(0);
  release?.();
  await expect(page.getByRole('status')).toContainText('signed-in player changed');
  await expect(page.locator('.hand-card')).toHaveCount(0);
  expect(preferences).toHaveLength(0);
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ace of clubs', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '2 of clubs', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Occasional cues', exact: true }).click();
  await expect.poll(() => preferences.length).toBe(1);
  expect(preferences[0]).toMatchObject({ preferences: { coachMode: 'nudges', gameSpeed: 1.4 } });
});

test('in-place review owner switch removes old choices, frames and advice before another trial', async ({
  page,
}) => {
  const value = fixture();
  await mount(page, value);
  await page.route('**/api/session/reviews?scope=match', (route) =>
    route.fulfill({
      json: {
        cases: [
          {
            decisionId: 'owner-a-record',
            handNumber: 1,
            action: { kind: 'play', card: 'C2' },
            assisted: false,
            status: 'not-assessed',
            summary: 'Owner A decision',
          },
        ],
      },
    }),
  );
  await page.route('**/api/session/reviews/owner-a-record?step=0', (route) =>
    route.fulfill({
      json: {
        decisionId: 'owner-a-record',
        label: 'Original',
        liveRevision: value.revision,
        frames: [{ game: value.game, action: null, decisionId: 'owner-a-record', notes: [] }],
      },
    }),
  );
  await page.route('**/api/coaching/access?*', (route) => route.fulfill({ json: value.access }));
  await page.route('**/api/coaching/hand-unlocks', (route) =>
    route.fulfill({
      json: {
        access: value.access,
        advice: {
          focus: 'Owner A advice',
          notice: 'Old private advice.',
          reason: 'Original recorded reason.',
          suggestion: 'Original recorded suggestion.',
          source: 'code',
          decisionId: 'owner-a-record',
          requestedLevel: 3,
        },
      },
    }),
  );
  const trials: unknown[] = [];
  await page.route('**/api/session/reviews/owner-a-record/trials', (route) => {
    trials.push(route.request().postDataJSON());
    return route.abort();
  });
  await page.getByRole('button', { name: 'Review current game', exact: true }).click();
  await page.getByRole('button', { name: 'Hand 1: Owner A decision', exact: true }).click();
  await page.getByRole('button', { name: 'Show original coach advice', exact: true }).click();
  await expect(page.getByText('Old private advice.', { exact: false })).toBeVisible();
  await page.route('**/api/account', (route) =>
    route.fulfill({ json: accountFixture(value, '22222222-2222-4222-8222-222222222222') }),
  );
  await page.route('**/api/identity', (route) =>
    route.fulfill({ json: { playerId: '22222222-2222-4222-8222-222222222222' } }),
  );
  await page.getByText('Explore another card', { exact: true }).click();
  await page
    .locator('.review-alternatives')
    .getByRole('button', { name: '3 of diamonds', exact: true })
    .click();
  await expect(page.locator('.review-evidence')).toHaveCount(0);
  await expect(page.getByText('Old private advice.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hand 1: Owner A decision', exact: true })).toHaveCount(0);
  expect(trials).toHaveLength(0);
});

test('queued review retry and lost-response reload recover the same trial and command', async ({ page }) => {
  const value = fixture();
  await mount(page, value);
  await page.route('**/api/session/reviews?scope=match', (route) =>
    route.fulfill({
      json: {
        cases: [
          {
            decisionId: 'record-retry',
            handNumber: 1,
            action: { kind: 'play', card: 'C2' },
            assisted: false,
            status: 'not-assessed',
            summary: 'Retry decision',
          },
        ],
      },
    }),
  );
  await page.route('**/api/session/reviews/record-retry?step=0', (route) =>
    route.fulfill({
      json: {
        decisionId: 'record-retry',
        label: 'Original',
        liveRevision: value.revision,
        frames: [
          { game: value.game, action: { kind: 'play', card: 'C2' }, decisionId: 'record-retry', notes: [] },
        ],
      },
    }),
  );
  await page.route('**/api/coaching/access?*', (route) => route.fulfill({ json: value.access }));
  const bodies: Record<string, unknown>[] = [];
  let ready = false;
  await page.route('**/api/session/reviews/record-retry/trials', (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1)
      return route.fulfill({
        status: 503,
        json: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'This continuation is still being prepared. Retry the same request.',
        },
      });
    ready = true;
    return route.abort('failed');
  });
  await page.route('**/api/review-trials/*', (route) =>
    ready
      ? route.fulfill({
          json: {
            trialId: bodies[0].trialId,
            decisionId: 'record-retry',
            label: 'Possible continuation',
            liveRevision: value.revision,
            frames: [
              { game: value.game, action: null, decisionId: 'record-retry', notes: ['Same sampled branch.'] },
            ],
          },
        })
      : route.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: 'Not ready.' } }),
  );
  await page.getByRole('button', { name: 'Review current game', exact: true }).click();
  await page.getByRole('button', { name: 'Hand 1: Retry decision', exact: true }).click();
  await page.getByText('Explore another card', { exact: true }).click();
  await page
    .locator('.review-alternatives')
    .getByRole('button', { name: '3 of diamonds', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Retry same continuation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry same continuation', exact: true }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual(bodies[0]);
  await page.reload();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Review current game', exact: true }).click();
  await page.getByRole('button', { name: 'Retry same continuation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Possible continuation', exact: true })).toBeVisible();
  expect(bodies).toHaveLength(2);
});

test('selected deals stage locally, restrict the game and label the resulting table', async ({
  page,
}, testInfo) => {
  const scenario: DevScenarioView = {
    id: 'partners-opening-a',
    version: '1.0.0',
    label: 'Opening A',
    mode: 'spades-partners',
  };
  const initial = fixture();
  const controls = await mount(page, initial, [scenario]);
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/sessions', (route) => {
    requests.push(route.request().postDataJSON());
    const next = { ...fixture(), scenario };
    next.game.id = 'selected-game';
    controls.setState(next);
    return route.fulfill({ json: next });
  });
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  const picker = page.getByLabel('Practice deal');
  await picker.selectOption(scenario.id);
  expect(requests).toHaveLength(0);
  await expect(page.locator('.game-option').filter({ has: page.locator('.game-art-hearts') })).toBeDisabled();
  await expect(
    page.locator('.game-option').filter({ has: page.locator('.game-art-spades-solo') }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Close new game setup' }).click();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await expect(picker).toHaveValue('');
  await picker.selectOption(scenario.id);
  await page.screenshot({ path: testInfo.outputPath('selected-deal-picker.png') });
  await page
    .locator('.game-option')
    .filter({ has: page.locator('.game-art-spades-partners') })
    .click();
  await expect(page.locator('.scenario-badge')).toHaveText('Selected deal: Opening A');
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    mode: scenario.mode,
    scenarioId: scenario.id,
    expectedActiveGameId: initial.game.id,
  });
  expect(Object.keys(requests[0]).sort()).toEqual([
    'commandId',
    'expectedActiveGameId',
    'mode',
    'scenarioId',
  ]);
  await page.screenshot({ path: testInfo.outputPath('selected-deal-table.png') });
});

test('Replay this deal requests the saved setup and creates a fresh table', async ({ page }) => {
  const scenario: DevScenarioView = {
    id: 'partners-opening-a',
    version: '1.0.0',
    label: 'Opening A',
    mode: 'spades-partners',
  };
  const initial = { ...fixture(), scenario };
  const controls = await mount(page, initial, [scenario]);
  const end = structuredClone(initial);
  end.game.phase = 'hand-end';
  end.game.hand = [];
  end.game.handCounts = [0, 0, 0, 0];
  end.game.turn = null;
  end.game.legalActions = [];
  end.game.handResult = { points: [30, 20, 30, 20], bags: [0, 0, 0, 0] };
  controls.setState(end);
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/sessions', (route) => {
    requests.push(route.request().postDataJSON());
    const fresh = { ...fixture(), scenario };
    fresh.game.id = 'replayed-game';
    controls.setState(fresh);
    return route.fulfill({ json: fresh });
  });
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Replay this deal', exact: true }).click();
  await expect(page.locator('.scenario-badge')).toHaveText('Selected deal: Opening A');
  await expect(page.getByRole('button', { name: 'Replay this deal', exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    replayScenario: true,
    mode: scenario.mode,
    expectedActiveGameId: initial.game.id,
  });
  expect(requests[0]).not.toHaveProperty('scenarioId');
});

test('a saved selected hand continues normally when the scenario catalog is disabled', async ({ page }) => {
  const ended = fixture();
  ended.scenario = { id: 'opening-a', version: '1.0.0', label: 'Opening A', mode: ended.game.mode };
  ended.game.phase = 'hand-end';
  ended.game.hand = [];
  ended.game.handCounts = [0, 0, 0, 0];
  ended.game.turn = null;
  ended.game.legalActions = [];
  ended.game.handResult = { points: [30, 20, 30, 20], bags: [0, 0, 0, 0] };
  const harness = await mount(page, ended);
  const requests: unknown[] = [];
  const next = fixture();
  next.game.handNumber = 2;
  await page.route('**/api/session/next-hand', (route) => {
    requests.push(route.request().postDataJSON());
    harness.setState(next);
    return route.fulfill({ json: next });
  });
  await expect(page.locator('.scenario-badge')).toHaveText('Selected deal: Opening A');
  await expect(page.getByRole('button', { name: 'Replay this deal', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await expect(page.locator('.scenario-badge')).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ gameId: ended.game.id, expectedRevision: ended.revision });
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
    await expect(page.locator('.rotate-watermark')).toBeVisible();
    await expect(page.locator('.rotate-logo')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Card table' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) await page.screenshot({ path: testInfo.outputPath('cardford-portrait.png') });
  }
});

for (const phase of ['hand-end', 'match-end'] as const) {
  test(`${phase}: Play again continues a hand or restarts the same game`, async ({ page }) => {
    const ended = fixture();
    ended.game.phase = phase;
    ended.game.turn = null;
    ended.game.hand = [];
    ended.game.legalActions = [];
    ended.game.history = [
      {
        winner: 2,
        plays: [
          { seat: 0, card: 'C2' },
          { seat: 1, card: 'C3' },
          { seat: 2, card: 'CA' },
          { seat: 3, card: 'C4' },
        ],
      },
    ];
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
    if (phase === 'match-end') {
      await recap.getByText('Final hand: trick winners', { exact: true }).click();
      await expect(recap.getByText(/Trick 1: Maya/)).toBeVisible();
    } else {
      await expect(recap.getByText('Final hand: trick winners')).toHaveCount(0);
    }
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

test('table stays minimal and coach settings do not contain game speed', async ({ page }, testInfo) => {
  const harness = await mount(page);
  await expect(page.getByRole('button', { name: 'Table notes' })).toHaveCount(0);
  await expect(page.getByText(/Hand 1|Trick 1 of 13|Low score wins/)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Game score' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByRole('button', { name: 'When I ask', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Occasional cues', exact: true })).toBeVisible();
  await expect(dialog.getByText('Game speed')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('cues-settings.png') });
  expect(harness.commands).toHaveLength(0);
});

test('review explains exhausted allowance without offering an unusable coached-hand unlock', async ({
  page,
}) => {
  const value = fixture();
  value.access = {
    ...value.access,
    plan: 'practice',
    remainingHands: 0,
    handUnlocked: false,
    canCoach: false,
    canStartWork: false,
  };
  await mount(page, value);
  await page.route('**/api/session/reviews?scope=match', (route) =>
    route.fulfill({
      json: {
        cases: [
          {
            decisionId: 'record-1',
            handNumber: 1,
            action: { kind: 'play', card: 'C2' },
            assisted: false,
            status: 'not-assessed',
            summary: 'Original decision',
          },
        ],
      },
    }),
  );
  await page.route('**/api/session/reviews/record-1?step=0', (route) =>
    route.fulfill({
      json: {
        decisionId: 'record-1',
        label: 'Original',
        liveRevision: value.revision,
        frames: [
          { game: value.game, action: { kind: 'play', card: 'C2' }, decisionId: 'record-1', notes: [] },
        ],
      },
    }),
  );
  await page.route('**/api/coaching/access?*', (route) => route.fulfill({ json: value.access }));
  const unlockRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/coaching/hand-unlocks')) unlockRequests.push(request.url());
  });
  await page.getByRole('button', { name: 'Review current game', exact: true }).click();
  await page.getByRole('button', { name: 'Hand 1: Original decision', exact: true }).click();
  await page.getByRole('button', { name: 'Show original coach advice', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'All coached hands are used today. You can still review your original play.',
  );
  await expect(page.getByRole('button', { name: 'Use coached hand', exact: true })).toHaveCount(0);
  expect(unlockRequests).toEqual([]);
});
