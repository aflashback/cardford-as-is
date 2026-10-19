import { test, expect, type Page } from '@playwright/test';
import type { DevScenarioView, SessionView } from '../shared/contracts';
import { faceSignatures, sameFaces } from './card-face-contract';
import { landscapeReviewSizes, landscapeDevices } from './landscape-devices';
import { freezeThrows, verifyThrow } from './card-throws';
import { verifyHandDrag } from './hand-gestures';

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

for (const mode of ['spades-partners', 'spades-solo', 'hearts'] as const) {
  test(`${mode}: confirmed card throws from the hand and preserves the final pile position`, async ({ page }) => {
    const value = fixture(); value.game.mode = mode;
    await mount(page, value);
    await expect(page.locator('.card-throw')).toHaveCount(0);
    await freezeThrows(page);
    await page.locator('[data-hand-card="C2"]').press('Enter');
    await verifyThrow(page, 'C2', 0);
  });
  test(`${mode}: corner score totals use the correct competitors and winning direction`, async ({ page }) => {
    const value = fixture();
    value.game.mode = mode;
    value.game.scores = mode === 'spades-partners' ? [9999, -9999, 9999, -9999] : [30, 10, 40, 20];
    await mount(page, value);
    const totals = page.getByRole('complementary', { name: 'Game score totals', exact: true });
    await expect(totals.locator('.table-total')).toHaveCount(4);
    await expect(totals.locator('button,.table-totals-scope')).toHaveCount(0);
    await expect(totals.locator('.total-seat')).toHaveCount(0);
    await expect(totals.locator('.table-total strong')).toHaveText(mode === 'spades-partners' ? ['9999', '-9999', '-9999', '9999'] : ['40', '10', '20', '30']);
    expect(await totals.locator('.total-leading').evaluateAll(chips => chips.map(chip => chip.getAttribute('data-seat'))))
      .toEqual(mode === 'hearts' ? ['1'] : mode === 'spades-partners' ? ['2', '0'] : ['2']);
    await expect(totals.locator('.total-trailing')).toHaveCount(mode === 'spades-partners' ? 2 : 3);
    const fit = await totals.locator('strong').evaluateAll(numbers => numbers.every(number => number.scrollWidth <= number.clientWidth));
    expect(fit).toBe(true);
    await expect(page.locator('.player-0 .player-detail')).toContainText(mode === 'hearts' ? '0 tricks' : '0 tricks, bid 3');
  });
}

for (const mode of ['spades-partners', 'spades-solo', 'hearts'] as const) {
  test(`${mode}: hand, trick and last-trick cards keep the same proportional face`, async ({ page }) => {
    const value = fixture();
    value.game.mode = mode;
    value.game.history = [{ plays: [{ seat: 0, card: 'C3' }, { seat: 1, card: 'C4' }, { seat: 2, card: 'C5' }, { seat: 3, card: 'C6' }], winner: 3 }];
    value.game.trick = [{ seat: 3, card: 'H7' }];
    value.game.currentWinner = 3;
    await mount(page, value);
    await expect(page.locator('.last-trick-card')).toHaveCount(4);
    const reference = (await faceSignatures(page))[0];
    sameFaces(await faceSignatures(page), reference);
    await page.setViewportSize({ width: landscapeDevices[1].width, height: landscapeDevices[1].height });
    sameFaces(await faceSignatures(page), reference);
  });
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
            phase: state.game.phase === 'pass' ? 'play' : state.game.phase,
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
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
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
    await expect(page.getByRole('button', { name: 'Resume game', exact: true })).toBeVisible();
    expect(requests[0]).toBe('/api/session');
    expect(requests.indexOf('/api/identity')).toBeGreaterThan(requests.indexOf('/api/session'));
    expect(mutations).toHaveLength(0);
    expect(
      await page.evaluate(() => localStorage.getItem('cardford-pending-v1:tab-identity-bootstrap:session')),
    ).toBeNull();
  });
}

test('single card activation does nothing; fresh double activation commits one server command', async ({
  page,
}) => {
  const { commands } = await mount(page);
  await expect(page).toHaveTitle('Spades — CardFord');
  await expect(page.getByRole('link', { name: 'CardFord choose game' })).toBeVisible();
  await expect(page.locator('.brand-symbol')).toBeVisible();
  await expect(page.getByText('Tricks Coach')).toHaveCount(0);
  const card = page.getByRole('button', { name: '2 of clubs', exact: true });
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'false');
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

test('off-turn queued card plays once on the human turn after resume', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect.poll(() => harness.commands.length).toBe(1);
  expect(harness.commands[0]).toMatchObject({ action: { kind: 'play', card: 'C2' } });
});

test('Hearts pass cards use intentional selection and still require separate confirmation', async ({ page }) => {
  const value = fixture(); value.game.mode = 'hearts'; value.game.phase = 'pass'; value.game.passDirection = 'left';
  value.game.turn = null;
  value.game.legalActions = [{ kind: 'pass', cards: ['C2', 'D3', 'H4'] }];
  const harness = await mount(page, value);
  await page.locator('[data-hand-card="C2"]').click();
  await expect(page.locator('.hand-card.selected')).toHaveCount(0);
  for (const card of ['C2', 'D3', 'H4']) await page.locator(`[data-hand-card="${card}"]`).dblclick();
  await expect(page.locator('.hand-card.selected')).toHaveCount(3);
  expect(harness.commands).toHaveLength(0);
  await page.locator('.play-button').click();
  await expect.poll(() => harness.commands.length).toBe(1);
  expect(harness.commands[0]).toMatchObject({ action: { kind: 'pass', cards: ['C2', 'D3', 'H4'] } });
});

for (const mode of ['hearts', 'spades-solo', 'spades-partners'] as const) {
  test(`${mode}: single click and hover do nothing; delayed double-click plays once`, async ({ page }) => {
    const session = fixture();
    session.game.mode = mode;
    const harness = await mount(page, session);
    const card = page.getByRole('button', { name: '2 of clubs', exact: true });
    const before = (await card.boundingBox())!;
    // Near the bottom edge: moving the button itself used to lose the second click.
    const point = { x: before.x + before.width / 2, y: before.y + before.height - 3 };
    await page.mouse.click(point.x, point.y);
    await expect(card).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(200);
    expect(await card.boundingBox()).toEqual(before);
    await expect(card.locator('.card-face')).toHaveCSS('transform', 'none');
    await expect(card.locator('.card-face')).toHaveCSS('outline-style', 'none');
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => harness.commands.length).toBe(1);
    expect(harness.commands[0]).toMatchObject({ action: { kind: 'play', card: 'C2' } });
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  });

  test(`${mode}: long hold drags above the hand, returns nearby and plays toward the table`, async ({ page }) => {
    const session = fixture(); session.game.mode = mode;
    const harness = await mount(page, session);
    await verifyHandDrag(page, 'C2', async () => harness.commands.length);
  });

  test(`${mode}: public counts and trick depth follow the confirmed winner`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const session = fixture();
    session.game.mode = mode;
    session.game.handCounts = [4, 3, 2, 1];
    const harness = await mount(page, session);
    await expect(page.locator('.empty-card')).toHaveCount(0);
    for (const [seat, count] of [[0, 4], [1, 3], [2, 2], [3, 1]]) {
      const player = seat === 0 ? page.locator('.you-label') : page.locator(`.player-${seat}`);
      await expect(player.getByLabel(`${count} ${count === 1 ? 'card' : 'cards'} left`, { exact: true })).toBeVisible();
    }
    const plays = [
      { seat: 2, card: 'HA' }, { seat: 3, card: 'H8' },
      { seat: 0, card: 'S2' }, { seat: 1, card: 'S3' },
    ] as const;
    for (let length = 1; length <= 4; length++) {
      await page.getByRole('button', { name: 'Pause game', exact: true }).click();
      const next = structuredClone(session);
      next.revision = length + 1;
      next.decisionId = `pile-${length}`;
      next.game.trick = plays.slice(0, length);
      next.game.currentWinner = mode === 'hearts' || length < 3 ? 2 : length === 3 ? 0 : 1;
      harness.setState(next);
      await page.getByRole('button', { name: 'Resume game', exact: true }).click();
      await expect(page.locator('.trick-slot')).toHaveCount(length);
      const winner = page.locator(`.trick-slot-${next.game.currentWinner}`);
      await expect(winner).toHaveCSS('z-index', '5');
      await expect(page.locator('.winning-card')).toHaveCount(1);
      for (const card of await page.locator('.trick-slot:not(.winning-card)').all())
        expect(Number(await card.evaluate(node => getComputedStyle(node).zIndex))).toBeLessThan(5);
    }
    await page.locator('.trick-slot .card-face').evaluateAll(async nodes => {
      await Promise.all(nodes.flatMap(node => node.getAnimations().map(animation => animation.finished)));
    });
    const cards = await page.locator('.trick-slot').evaluateAll(nodes => nodes.map(node => {
      const b = node.getBoundingClientRect(); return { x:b.x, y:b.y, width:b.width, height:b.height };
    }));
    expect(cards[0].width).toBeCloseTo(57.6, 0);
    expect(cards[1].x - cards[3].x).toBeCloseTo(cards[0].width * 1.2, 0);
    expect(cards[3].x + cards[3].width).toBeLessThan(cards[1].x);
    expect(cards[1].y - cards[0].y).toBeCloseTo(cards[0].height * .92, 0);
    // Check that every rank sits below the overlap strip rather than being covered.
    for (const slot of await page.locator('.trick-slot').all()) {
      const cardBox = (await slot.boundingBox())!;
      const rankBox = (await slot.locator('.card-corner b').boundingBox())!;
      expect(rankBox.y - cardBox.y).toBeGreaterThan(cardBox.height * .08);
      const rankIsVisible = await slot.locator('.card-corner b').evaluate(node => {
        const box = node.getBoundingClientRect();
        const ownCard = node.closest('.trick-slot');
        return [box.x + 1, box.right - 1].every(x =>
          document.elementFromPoint(x, box.y + box.height / 2)?.closest('.trick-slot') === ownCard);
      });
      expect(rankIsVisible).toBe(true);
    }
    const layer = async (seat: number) => Number(await page.locator(`.trick-slot-${seat}`).evaluate(node => getComputedStyle(node).zIndex));
    expect(await layer(2)).toBeGreaterThan(await layer(3)); // Ace above the eight of the led suit.
    if (mode !== 'hearts') expect(await layer(0)).toBeGreaterThan(await layer(2)); // Trump above a non-trump.
    await page.screenshot({ path: testInfo.outputPath(`${mode}-pile-desktop.png`) });
    await page.setViewportSize({ width: landscapeDevices[0].width, height: landscapeDevices[0].height });
    await expect(page.locator('.trick-slot')).toHaveCount(4);
    await page.screenshot({ path: testInfo.outputPath(`${mode}-pile-phone.png`) });
    await page.setViewportSize({ width: 754, height: 668 });
    await expect.poll(() => page.evaluate(() => parseFloat(document.documentElement.style.getPropertyValue('--app-height')))).toBe(668);
    const left = (await page.locator('.trick-slot-1').boundingBox())!;
    const right = (await page.locator('.trick-slot-3').boundingBox())!;
    expect(left.x + left.width).toBeLessThan(right.x);
    await page.screenshot({ path: testInfo.outputPath(`${mode}-pile-comment-viewport.png`) });
    expect(harness.commands).toHaveLength(0);
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  });

  test(`${mode}: remaining-card fans are countable for four and eight, dense for thirteen`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 854, height: 668 });
    const session = fixture();
    session.game.mode = mode;
    session.game.handCounts = [4, 4, 8, 13];
    const harness = await mount(page, session);
    for (const [seat, count] of [[0, 4], [1, 4], [2, 8], [3, 13]]) {
      const player = seat === 0 ? page.locator('.you-label') : page.locator(`.player-${seat}`);
      const backs = player.locator('.count-card-back');
      await expect(player.getByRole('img', { name: `${count} cards left`, exact: true })).toBeVisible();
      await expect(backs).toHaveCount(count);
      await expect(player.locator('.remaining-cards')).toHaveText('');
      const first = (await backs.nth(0).boundingBox())!, second = (await backs.nth(1).boundingBox())!;
      const exposed = second.x - first.x;
      const width = await backs.first().evaluate(node => parseFloat(getComputedStyle(node).width));
      if (count <= 8) expect(exposed).toBeGreaterThanOrEqual(width / 2);
      else expect(exposed).toBeLessThan(width / 2);
      expect(await backs.first().evaluate(node => getComputedStyle(node).transform))
        .not.toBe(await backs.last().evaluate(node => getComputedStyle(node).transform));
    }
    await page.screenshot({ path: testInfo.outputPath(`${mode}-visual-card-counts.png`) });
    await page.setViewportSize({ width: landscapeDevices[0].width, height: landscapeDevices[0].height });
    await expect.poll(() => page.evaluate(() => parseFloat(document.documentElement.style.getPropertyValue('--app-height')))).toBe(landscapeDevices[0].height);
    await page.screenshot({ path: testInfo.outputPath(`${mode}-visual-card-counts-phone.png`) });
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
    const next = structuredClone(session);
    next.revision = 2;
    next.decisionId = 'last-card-count';
    next.game.handCounts = [4, 0, 1, 5];
    harness.setState(next);
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
    await expect(page.locator('.player-1 .count-card-back')).toHaveCount(0);
    await expect(page.locator('.player-2').getByRole('img', { name: '1 card left', exact: true })).toBeVisible();
    await expect(page.locator('.player-2 .count-card-back')).toHaveCount(1);
    await expect(page.locator('.player-3 .count-card-back')).toHaveCount(5);
    expect(harness.commands).toHaveLength(0);
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  });

  test(`${mode}: history box reserves space before the first trick without visible text`, async ({ page }) => {
    await page.setViewportSize({ width: 854, height: 668 });
    const session = fixture();
    session.game.mode = mode;
    const harness = await mount(page, session);
    const history = page.getByRole('complementary', { name: 'Last trick', exact: true });
    await expect(history).toBeVisible();
    await expect(history).toHaveText('');
    await expect(history.getByRole('img')).toHaveCount(0);
    const emptyBox = await history.boundingBox();
    const coachBefore = await page.locator('.coach-panel').boundingBox();
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
    const next = structuredClone(session);
    next.revision = 2;
    next.decisionId = 'first-trick-complete';
    next.game.history = [{ plays: [
      { seat: 0, card: 'C2' }, { seat: 1, card: 'C4' },
      { seat: 2, card: 'C7' }, { seat: 3, card: 'CQ' },
    ], winner: 3 }];
    harness.setState(next);
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
    await expect(history.getByRole('img')).toHaveCount(4);
    await expect(history).toHaveText(/^[A-Z0-9♣\s]*$/);
    expect(await history.boundingBox()).toEqual(emptyBox);
    expect(await page.locator('.coach-panel').boundingBox()).toEqual(coachBefore);
    expect(harness.commands).toHaveLength(0);
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  });
}

test.describe('touch card preparation', () => {
  test.use({ hasTouch: true, viewport: { width: landscapeDevices[0].width, height: landscapeDevices[0].height } });
  test('double-tap plays once on turn and holds a card while waiting', async ({ page }) => {
    const harness = await mount(page);
    const card = page.getByRole('button', { name: '2 of clubs', exact: true });
    const before = (await card.boundingBox())!;
    const x = before.x + before.width / 2, y = before.y + before.height - 3;
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(180);
    await page.touchscreen.tap(x, y);
    await expect.poll(() => harness.commands.length).toBe(1);
    const waitingCard = page.getByRole('button', { name: '3 of diamonds', exact: true });
    await waitingCard.tap();
    await waitingCard.tap();
    await expect(waitingCard).toHaveAttribute('aria-pressed', 'true');
    expect(harness.commands).toHaveLength(1);
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  });
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

// Completed tricks include the final card's landing allowance before the reading interval.
for (const [speed, botDelay, trickDelay] of [[1, 692, 1730], [1.2, 576, 1442], [1.4, 494, 1236]] as const) {
  for (const phase of ['play', 'trick-end'] as const) {
    test(`${speed}x: ${phase} advances at the boosted pace and never before its delay`, async ({ page }) => {
      await page.clock.install({ time: new Date('2026-10-07T12:00:00Z') });
      await page.clock.pauseAt(new Date('2026-10-07T13:00:00Z'));
      const session = fixture();
      session.preferences.gameSpeed = speed;
      session.game.phase = phase;
      session.game.turn = 1;
      session.game.legalActions = [];
      await mount(page, session);
      const advances: Record<string, unknown>[] = [];
      await page.route('**/api/session/advance', route => {
        advances.push(route.request().postDataJSON() as Record<string, unknown>);
        const next = fixture();
        next.revision = 2;
        next.decisionId = 'boosted-human-turn';
        return route.fulfill({ json: next });
      });
      // Let the paused-clock table's refresh complete before advancing simulated time.
      await page.waitForTimeout(100);
      const delay = phase === 'play' ? botDelay : trickDelay;
      await page.clock.runFor(delay - 1);
      expect(advances).toHaveLength(0);
      await page.clock.runFor(2);
      await expect.poll(() => advances.length).toBe(1);
      expect(advances[0]).toMatchObject({ kind: phase === 'play' ? 'bot' : 'collect-trick' });
      await page.getByRole('button', { name: 'Pause game', exact: true }).click();
    });
  }
}

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
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect.poll(() => reads).toBe(3);
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
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
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  await expect(page.getByRole('main', { name: 'New game setup' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Choose game' })).toHaveCount(0);
  await page.getByRole('button', { name: '1.2×' }).click();
  await expect(page.getByRole('button', { name: '1.2×' })).toHaveAttribute('aria-pressed', 'true');
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Close new game setup' }).click();
  await expect(page.getByRole('main', { name: 'New game setup' })).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  await expect(page.getByRole('button', { name: '1×', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '1.2×' }).click();
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  await expect(page.getByText('You and three computer players.')).toBeVisible();
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
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
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
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  await page
    .locator('.game-option')
    .filter({ has: page.locator('.game-art-hearts') })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
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
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
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
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
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
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
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
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
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
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  const picker = page.getByLabel('Practice deal');
  await picker.selectOption(scenario.id);
  expect(requests).toHaveLength(0);
  await expect(page.locator('.game-option').filter({ has: page.locator('.game-art-hearts') })).toBeDisabled();
  await expect(
    page.locator('.game-option').filter({ has: page.locator('.game-art-spades-solo') }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Close new game setup' }).click();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
  await page.getByRole('button', { name: /^Choose game(?:$|:)/ }).click();
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
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
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

for (const mode of ['hearts', 'spades-solo', 'spades-partners'] as const) {
test(`${mode}: named landscape devices keep the human at South with a separate readable hand`, async ({ page }, testInfo) => {
  const session = fixture();
  session.game.mode = mode;
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
  for (const profile of [...landscapeReviewSizes, { name: 'review panel', width: 712, height: 668 }]) {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await expect.poll(() => page.evaluate(() => parseFloat(document.documentElement.style.getPropertyValue('--app-height')))).toBe(profile.height);
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, center: r.left + r.width / 2 };
      };
      const ranks = [...document.querySelectorAll('.hand-card')].map(card => {
        const rank = card.querySelector('.card-corner b')!.getBoundingClientRect();
        return [rank.left + rank.width * .25, rank.left + rank.width * .75].every(x =>
          card.contains(document.elementFromPoint(x, rank.top + rank.height / 2)));
      });
      const scoresClear = [...document.querySelectorAll('.table-total,.table-totals-scope')].every(chip => {
        const scores = chip.getBoundingClientRect();
        return ['.player-2', '.player-1 .avatar', '.player-1 .player-info'].every(selector => {
          const player = box(selector);
          return scores.right <= player.left || scores.left >= player.right || scores.bottom <= player.top || scores.top >= player.bottom;
        });
      });
      return { table: box('.table-zone'), south: box('.player-0'), hand: box('.hand-cards'), ranks, scoresClear,
        overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
    });
    expect(geometry.overflow, profile.name).toBe(false);
    expect(geometry.scoresClear, profile.name).toBe(true);
    expect(geometry.south.center, profile.name).toBeCloseTo(geometry.table.center, 0);
    expect(geometry.south.bottom, profile.name).toBeCloseTo(geometry.table.bottom, 0);
    expect(geometry.hand.top, profile.name).toBeGreaterThanOrEqual(geometry.south.bottom);
    expect(geometry.hand.left, profile.name).toBeGreaterThanOrEqual(0);
    expect(geometry.hand.right, profile.name).toBeLessThanOrEqual(profile.width);
    expect(geometry.ranks, profile.name).toEqual(Array(13).fill(true));
    await expect(page.locator('.table-zone .player-0 .avatar')).toBeVisible();
    await expect(page.locator('.partner-label')).toHaveCount(0);
    await expect(page.locator('.player-0.player-active .avatar')).toHaveCSS('box-shadow', /rgb\(180, 133, 60\)/);
    await expect(page.locator('.hand-section .player')).toHaveCount(0);
    await expect(page.locator('.hand-card')).toHaveCount(13);
    await page.screenshot({ path: testInfo.outputPath(`${mode}-${profile.name.replaceAll(' ', '-')}.png`) });
  }
  const lastCard = page.locator('.hand-card').last();
  await page.locator('.hand-card').first().focus();
  for (let index = 1; index < 13; index++) await page.keyboard.press('Tab');
  await expect(lastCard).toBeFocused();
  await expect(lastCard).toBeInViewport({ ratio: 1 });
  await page.locator('.hand-card').first().focus();
  expect((await page.locator('.hand-card').first().boundingBox())!.x).toBeGreaterThanOrEqual(0);
});
}

for (const mode of ['spades-partners', 'spades-solo', 'hearts'] as const) {
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
    await expect(blocked.locator('.unavailable-mark')).toHaveCount(0);
    await expect(blocked.locator('.card-face')).toHaveCSS('opacity', '1');
    await expect(blocked.locator('.card-face')).toHaveCSS('background-color', 'rgb(214, 215, 214)');
    await expect(blocked.locator('.card-face')).toHaveCSS('color', mode === 'hearts' ? 'rgb(181, 75, 97)' : 'rgb(37, 62, 77)');
    await expect(blocked.locator('.card-face')).toHaveCSS('filter', 'none');
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
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
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
  await page.getByRole('button', { name: '5 of spades', exact: true }).dblclick();
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  const next = fixture();
  next.revision = 2;
  next.decisionId = 'restricted-human-turn';
  next.game.spadesBroken = false;
  next.game.legalActions = [{ kind: 'play', card: 'C2' }];
  harness.setState(next);
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  const blocked = page.getByRole('button', { name: '5 of spades, unavailable this turn', exact: true });
  await expect(blocked).toBeDisabled();
  await expect(blocked).toHaveAttribute('aria-pressed', 'false');
  expect(harness.commands).toHaveLength(0);
});

test('last trick stays above the coach with seat positions, no names and no notes request', async ({
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
  const selectedCard = page.getByRole('button', { name: '8 of diamonds', exact: true });
  await selectedCard.click();
  await expect(selectedCard).toHaveAttribute('aria-pressed', 'false');
  await expect(last.getByRole('img')).toHaveCount(4);
  await expect(last.getByRole('img', { name: 'Joe: Queen of clubs, won the trick' })).toBeVisible();
  expect(await last.innerText()).not.toMatch(/You|Leo|Maya|Joe/);
  await expect(page.getByRole('button', { name: 'Last trick' })).toHaveCount(0);
  for (const { width, height, name } of [
    { width: 1920, height: 1080, name: 'wide-desktop' },
    ...landscapeReviewSizes,
  ]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => parseFloat(document.documentElement.style.getPropertyValue('--app-height')))).toBe(height);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(last).toBeVisible();
    const memory = await last.boundingBox();
    const current = await page.locator('.trick-area').boundingBox();
    const table = await page.getByRole('region', { name: 'Card table' }).boundingBox();
    const west = await page.locator('.player-1').boundingBox();
    expect(memory).not.toBeNull();
    expect(current).not.toBeNull();
    expect(west).not.toBeNull();
    expect(table).not.toBeNull();
    const coach = await page.locator('.coach-panel').boundingBox();
    expect(memory!.y + memory!.height).toBeLessThanOrEqual(coach!.y);
    if (height < width) {
      expect(memory!.x).toBeGreaterThan(table!.x + table!.width);
    }
    expect(memory!.x).toBeGreaterThanOrEqual(0);
    expect(memory!.y).toBeGreaterThanOrEqual(0);
    expect(memory!.y + memory!.height).toBeLessThan(height);
    for (const selector of ['.trick-area', '.player-1', '.player-2', '.player-3', '.coach-panel']) {
      const box = await page.locator(selector).boundingBox();
      expect(
        box!.x >= memory!.x + memory!.width ||
          box!.x + box!.width <= memory!.x ||
          box!.y >= memory!.y + memory!.height ||
          box!.y + box!.height <= memory!.y,
        `${name}: ${selector} ${JSON.stringify(box)} must not overlap last trick ${JSON.stringify(memory)}`,
      ).toBe(true);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`cues-${name}.png`), fullPage: true });
  }
  expect(notesCalls).toEqual([]);
  expect(harness.commands).toHaveLength(0);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  const next = fixture();
  next.revision = 2;
  next.decisionId = 'next-hand';
  next.game.handNumber = 2;
  harness.setState(next);
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect(last).toBeVisible();
  await expect(last.getByRole('img')).toHaveCount(0);
  await expect(last).toHaveText('');
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
