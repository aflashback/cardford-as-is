import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Mode } from '../shared/contracts';
import type { PlatformSessionView, PlatformExportView } from '../shared/local-service.contracts';
import { validateContract } from '../shared/local-service.validation';

const origin = process.env.CARDFORD_M04E_ORIGIN;
const evidence = process.env.CARDFORD_EVIDENCE_DIR ? resolve(process.env.CARDFORD_EVIDENCE_DIR) : fileURLToPath(new URL('../../qa/implementation/multi-game/m04e/', import.meta.url));
test.skip(!origin, 'Requires the isolated native Go M04E browser harness.');
test.setTimeout(240_000);

// Read only the public actor-safe projection. Successful responses always come
// from the real Go listener; no game states or successful APIs are mocked here.
async function current(page: Page): Promise<PlatformSessionView> {
  const value: unknown = await page.evaluate(async () => {
    const response = await fetch('/api/platform/session', {
      credentials: 'same-origin',
      headers: { 'x-tricks-tab': sessionStorage.getItem('tricks-tab') ?? '' },
    });
    if (!response.ok) throw new Error(`Platform session HTTP ${response.status}`);
    return response.json();
  });
  expect(validateContract('PlatformSessionView', value)).toBe(true);
  return value as PlatformSessionView;
}
async function open(page: Page) {
  await page.goto(origin!);
  await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
}
async function choose(page: Page, mode: Mode) {
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page.getByRole('button', { name: '1.4×', exact: true }).click();
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  await page
    .locator('.game-option')
    .filter({ has: page.locator(`.game-art-${mode}`) })
    .click();
  await expect.poll(async () => (await current(page)).session?.presentation.mode).toBe(mode);
  await expect.poll(async () => (await current(page)).preferences.preferences.gameSpeed).toBe(1.4);
}
async function waitHuman(page: Page) {
  await expect
    .poll(
      async () => {
        const s = (await current(page)).session;
        return !!s && s.presentation.phase === 'play' && s.presentation.turn === 0 && !!s.actor;
      },
      { timeout: 30_000, intervals: [150, 300, 500] },
    )
    .toBe(true);
}
async function playCard(page: Page) {
  await waitHuman(page);
  const before = (await current(page)).session!;
  await page.locator('.hand-card:not(:disabled)').first().dblclick();
  await expect
    .poll(async () => (await current(page)).session!.presentation.hand.length, { timeout: 30_000 })
    .toBe(before.presentation.hand.length - 1);
}
async function resumeIfPaused(page: Page) {
  const resume = page.getByRole('button', { name: 'Resume', exact: true });
  if (await resume.isVisible()) await resume.click();
}

for (const mode of ['hearts', 'spades-solo', 'spades-partners'] as const) {
  test(`actual Go ${mode}: full hand, saved advice, review alternative and next hand`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page);
    await choose(page, mode);
    if (mode === 'hearts') {
      await expect(page.getByRole('heading', { name: 'Pass three cards left' })).toBeVisible();
      for (let n = 0; n < 3; n++) await page.locator('.hand-card').nth(n).click();
      await page.getByRole('button', { name: 'Pass 3 of 3', exact: true }).click();
      await expect.poll(async () => (await current(page)).session!.presentation.received.length).toBe(3);
    } else {
      await expect(page.getByRole('button', { name: 'Bid 3', exact: true })).toBeEnabled({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Bid 3', exact: true }).click();
      await expect.poll(async () => (await current(page)).session!.presentation.bids[0]).toBe(3);
    }
    await waitHuman(page);
    // A forced opening C2 is deliberately excluded from assistance statistics.
    // Exercise coaching on a real choice, retaining the original count rule.
    for (let forced = 0; forced < 13; forced++) {
      const position = (await current(page)).session!;
      if (position.presentation.legalActions.length > 1) break;
      await playCard(page);
      await waitHuman(page);
    }
    const hintedPosition = (await current(page)).session!;
    expect(hintedPosition.presentation.legalActions.length).toBeGreaterThan(1);
    const hintedIndex = 1 + 13 - hintedPosition.presentation.hand.length;
    await page.getByRole('button', { name: 'Give me a cue', exact: true }).click();
    const unlock = page.getByRole('button', { name: 'Use coached hand', exact: true });
    await expect
      .poll(async () => (await unlock.isVisible()) || (await page.locator('.hint-stage').isVisible()))
      .toBe(true);
    if (await unlock.isVisible()) await unlock.click();
    await expect(page.locator('.hint-stage')).toContainText('Notice', { timeout: 30_000 });
    await page.getByRole('button', { name: 'More context', exact: true }).click();
    await expect(page.locator('.hint-stage')).toContainText('Consider');
    await page.getByRole('button', { name: 'Suggest a move', exact: true }).click();
    await expect(page.locator('.hint-stage')).toContainText('A suggestion');
    expect((await current(page)).session!.access.handUnlocked).toBe(true);
    await playCard(page);

    // Foreground and reload must revalidate the saved table without advancing
    // a paused game, and the original tab's retained lease remains usable.
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
    const paused = (await current(page)).session!;
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
    expect((await current(page)).session!.revision).toBe(paused.revision);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(async () => (await current(page)).session!.revision).toBe(paused.revision);
    await resumeIfPaused(page);
    for (let n = hintedPosition.presentation.hand.length - 1; n > 0; n--) await playCard(page);
    await expect
      .poll(async () => (await current(page)).session!.presentation.phase, { timeout: 30_000 })
      .toBe('hand-end');
    const completed = (await current(page)).session!;
    expect(completed.presentation.handCounts).toEqual([0, 0, 0, 0]);
    expect(completed.presentation.history).toHaveLength(13);
    expect(new Set(completed.presentation.history.flatMap((t) => t.plays.map((p) => p.card))).size).toBe(52);
    expect(completed.stats.helped).toBeGreaterThan(0);
    await expect(page.getByRole('dialog', { name: 'Hand 1 results', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to table', exact: true }).click();
    await page.getByRole('button', { name: 'Review current game', exact: true }).click();
    const choices = page.locator('.review-choices button');
    await expect(choices).toHaveCount(14);
    // First source is pass/bid; the next is the original human card decision.
    await choices.nth(hintedIndex).click();
    await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible();
    const saved = page.getByRole('region', { name: 'Original coach advice', exact: true });
    const reveal = page.getByRole('button', { name: 'Show original coach advice', exact: true });
    // Source access arrives after the replay frame. Wait for the actual
    // reveal control instead of sampling visibility before that read finishes.
    await reveal.click();
    if (await unlock.isVisible()) await unlock.click();
    await expect(saved.getByRole('heading', { name: 'Advice at your decision', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // A random first turn can be forced. Find a source with multiple legal
    // cards before asking the registered continuation job to try another card.
    let alternatives = 0;
    for (let source = 1; source < 14; source++) {
      if (source > 1) await choices.nth(source).click();
      const explore = page.getByText('Explore another card', { exact: true });
      await expect(explore).toBeVisible();
      await explore.click();
      alternatives = await page.locator('.review-alternatives button').count();
      if (alternatives > 1) break;
    }
    expect(alternatives).toBeGreaterThan(1);
    await page.locator('.review-alternatives button').last().click();
    if (await unlock.isVisible()) await unlock.click();
    await expect(page.getByRole('heading', { name: 'Possible continuation', exact: true })).toBeVisible({
      timeout: 60_000,
    });
    expect((await current(page)).session!.revision).toBe(completed.revision);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Play again', exact: true }).click();
    await expect
      .poll(async () => (await current(page)).session!.presentation.handNumber, { timeout: 30_000 })
      .toBe(2);
    const next = (await current(page)).session!;
    expect(next.gameId).toBe(completed.gameId);
    expect(next.presentation.hand).toHaveLength(13);
    expect(next.presentation.scores).toEqual(completed.presentation.scores);
    expect(next.revision).toBeGreaterThan(completed.revision);
    const exported = await page.evaluate(async () => {
      const response = await fetch('/api/account/export', {
        credentials: 'same-origin',
        headers: { 'x-tricks-tab': sessionStorage.getItem('tricks-tab') ?? '' },
      });
      if (!response.ok) throw new Error(`Export HTTP ${response.status}`);
      return response.json();
    });
    expect(validateContract('PlatformExportView', exported)).toBe(true);
    expect(exported.games.some((game: any) => game.id === completed.gameId)).toBe(true);
    expect(exported.decisions.length).toBeGreaterThan(0);
    for (const decision of exported.decisions) expect(decision.packetVersion).toBe('2.0.0');
    if (mode === 'spades-partners' && process.env.CARDFORD_REASONING_PROFILE === 'partner-resources') {
      const currentDecisions = exported.decisions.filter((decision: any) => decision.gameId === completed.gameId);
      expect(currentDecisions.length).toBeGreaterThan(0);
      for (const decision of currentDecisions) expect(decision.policy.version).toBe('spades-partner-resource-5.0.0');
    }
    if (process.env.CARDFORD_REASONING_PROFILE === 'actor-rollout') {
      const currentDecisions = exported.decisions.filter((decision: any) => decision.gameId === completed.gameId);
      expect(currentDecisions.length).toBeGreaterThan(0);
      for (const decision of currentDecisions) expect(decision.policy.version).toBe('actor-rollout-2.0.0');
    }
    expect(errors).toEqual([]);
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: `${evidence}/${mode}-next-hand.png` });
  });
}

test('actual Go account: lost accepted billing reply, same receipt recovery, export and portrait deletion', async ({
  page,
}) => {
  await page.goto(`${origin}/#account`);
  const id = page.getByLabel('Local account ID', { exact: true });
  await expect(id).toHaveValue(/^[a-f0-9]{48}$/);
  const owner = await id.inputValue();
  await page.getByRole('button', { name: 'Cancel renewal', exact: true }).click();
  let accepted: unknown;
  await page.route(
    '**/api/subscription/change',
    async (route) => {
      // Forward to Go, keep its exact accepted body, then lose only the reply.
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      accepted = await response.json();
      await route.abort('connectionreset');
    },
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Confirm test change', exact: true }).click();
  const pendingPreview = page.getByRole('region', { name: 'Confirm subscription change', exact: true });
  await expect(pendingPreview.getByRole('button', { name: 'Retry same change', exact: true })).toBeVisible();
  // The retry label appears when intent is saved, before the original HTTP
  // response arrives. Wait for the lost-reply attempt to settle first.
  await expect(pendingPreview.getByRole('button', { name: 'Retry same change', exact: true })).toBeEnabled();
  expect(validateContract('BillingOperation', accepted)).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry same change', exact: true })).toBeVisible();
  const receipt = page.waitForResponse(
    (r) => r.url().endsWith('/api/platform/commands/reconcile') && r.status() === 200,
  );
  await page.getByRole('button', { name: 'Retry same change', exact: true }).click();
  expect((await (await receipt).json()).receipt).toEqual(accepted);
  await expect(page.getByRole('button', { name: 'Resume renewal', exact: true })).toBeVisible();
  expect(await id.inputValue()).toBe(owner);
  const persisted = await page.evaluate(() =>
    Object.entries(localStorage).filter(([k]) => k.startsWith('cardford-go-pending-v1:')),
  );
  expect(persisted).toEqual([]);
  await page.getByRole('button', { name: 'Resume renewal', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm test change', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel renewal', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my local data', exact: true }).click();
  const downloaded = await download;
  const exported = JSON.parse(await readFile((await downloaded.path())!, 'utf8')) as PlatformExportView;
  expect(validateContract('PlatformExportView', exported)).toBe(true);
  expect(exported.account.player.id).toBe(owner);
  expect(exported.account.preferences.preferences).toEqual({ coachMode: 'asked', gameSpeed: 1 });
  expect(exported.billing).toHaveLength(2);
  const raw = JSON.stringify(exported);
  for (const privateField of [
    'controlLeaseToken',
    'token_hash',
    'sealedCommitments',
    'privateDeal',
    'sessionHash',
  ])
    expect(raw).not.toContain(privateField);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/account-portrait.png`, fullPage: true });
  await page.getByText('Delete local test account', { exact: true }).click();
  await page.getByLabel('Type DELETE LOCAL ACCOUNT', { exact: true }).fill('DELETE LOCAL ACCOUNT');
  await page.getByRole('button', { name: 'Delete my local account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Local account deleted', exact: true })).toBeVisible();
});

test('actual Go family: verified local players, private member view and held removal', async ({
  browser,
}) => {
  const payerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    const payer = await payerContext.newPage(),
      member = await memberContext.newPage();
    await payer.goto(`${origin}/#account`);
    await member.goto(`${origin}/#account`);
    await expect(member.getByLabel('Local account ID', { exact: true })).toHaveValue(/^[a-f0-9]{48}$/);
    const memberId = await member.getByLabel('Local account ID', { exact: true }).inputValue();
    await payer
      .locator('.plan-options article')
      .filter({ has: payer.getByRole('heading', { name: 'Family', exact: true }) })
      .getByRole('button', { name: 'Preview test plan' })
      .click();
    await payer.getByRole('button', { name: 'Confirm test change', exact: true }).click();
    await payer.getByRole('button', { name: 'Manage family', exact: true }).click();
    await payer.getByRole('button', { name: 'Create test family', exact: true }).click();
    await payer.getByLabel('Existing test account ID', { exact: true }).fill(memberId);
    await payer.getByRole('button', { name: 'Create invitation', exact: true }).click();
    await expect(payer.getByLabel('Invitation token', { exact: true })).toHaveValue(/^[a-f0-9]{48}$/);
    const token = await payer.getByLabel('Invitation token', { exact: true }).inputValue();
    await member.getByRole('button', { name: 'Manage family', exact: true }).click();
    await member.getByLabel('Invitation token', { exact: true }).fill(token);
    await member.getByRole('checkbox').check();
    await member.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(member.getByText('Paid by Local player', { exact: true })).toBeVisible();
    await expect(member.getByRole('button', { name: 'Create invitation', exact: true })).toHaveCount(0);
    expect(await member.getByLabel('Local account ID', { exact: true }).inputValue()).toBe(memberId);
    await member.getByRole('button', { name: 'Leave family', exact: true }).click();
    await member.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(member.getByRole('button', { name: 'Create test family', exact: true })).toBeVisible();
    await payer.reload();
    await payer.getByRole('button', { name: 'Manage family', exact: true }).click();
    await expect(payer.getByText('held', { exact: false })).toBeVisible();
  } finally {
    await payerContext.close();
    await memberContext.close();
  }
});

for (const mode of ['hearts', 'spades-solo', 'spades-partners'] as const) {
  test(`actual Go replay-validated ${mode} fixture finishes through the preserved terminal React table`, async ({ page }) => {
    await open(page);
    await choose(page, mode);
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
    const opening = await current(page);
    expect(opening.session!.revision).toBe(0);
    // Test-only archive installation preserves this real random opening and
    // validates every subsequent legal transition before touching its owned
    // test schema. No runtime route, rule, score or policy is overridden.
    const installed = await promisify(execFile)(
      fileURLToPath(new URL('../../.local/m04e-terminal-fixture.exe', import.meta.url)),
      ['-test.run=^TestM04ETerminalFixtureInstall$', '-test.v'],
      {
        cwd: fileURLToPath(new URL('../../', import.meta.url)), windowsHide: true,
        timeout: 120_000, maxBuffer: 1 << 20,
        env: { ...process.env, M04E_FIXTURE_GAME: opening.session!.gameId,
          M04E_FIXTURE_OWNER: opening.playerId, M04E_FIXTURE_MODE: mode },
      },
    );
    const line = installed.stdout.split(/\r?\n/).find(value => value.startsWith('M04E_TERMINAL_FIXTURE '));
    if (!line) throw new Error('The terminal fixture installer returned no public receipt.');
    const fixture = JSON.parse(line.slice('M04E_TERMINAL_FIXTURE '.length));
    expect(fixture.kind).toBe('reachable-terminal-fixture');
    expect(fixture.mode).toBe(mode);
    expect(fixture.gameId).toBe(opening.session!.gameId);
    expect(fixture.analysisRecordsImported).toBe(false);
    expect(fixture.archiveSHA256).toMatch(/^[a-f0-9]{64}$/);
    expect(fixture.terminalRevision).toBe(fixture.revision + 1);
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
    const before = (await current(page)).session!;
    expect(before.revision).toBe(fixture.revision);
    expect(before.node).toMatchObject({kind:'automatic',transitionId:fixture.transitionId});
    await resumeIfPaused(page);
    await expect.poll(async () => (await current(page)).session!.presentation.phase).toBe('match-end');
    let terminal = (await current(page)).session!;
    expect(terminal.revision).toBe(fixture.terminalRevision);
    expect(terminal.presentation.scores).toEqual(fixture.terminalScores);
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
    terminal = (await current(page)).session!;
    expect(terminal.revision).toBe(fixture.terminalRevision);
    expect(terminal.presentation.phase).toBe('match-end');
    await resumeIfPaused(page);
    await expect(page.getByRole('dialog').filter({ has: page.locator('.recap-score') })).toBeVisible();
    await page.getByRole('button', { name: 'Back to table', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Game complete', exact: true })).toBeVisible();
    const rejected = await page.evaluate(async ({gameId,revision}) => {
      const retained = Object.entries(sessionStorage)
        .filter(([key])=>key.startsWith('cardford-lease-v1:')).map(([,value])=>JSON.parse(value))
        .find(value=>value.gameId===gameId);
      if (!retained) throw new Error('The browser control lease is missing.');
      const response = await fetch('/api/session/next-hand', {method:'POST',
        headers:{'Content-Type':'application/json','x-tricks-client':'1','x-tricks-tab':sessionStorage.getItem('tricks-tab')!},
        body:JSON.stringify({commandId:crypto.randomUUID(),gameId,expectedRevision:revision,controlLeaseToken:retained.token}),
      });
      return response.status;
    }, {gameId:terminal.gameId,revision:terminal.revision});
    expect(rejected).toBe(409);
    expect((await current(page)).session!.revision).toBe(fixture.terminalRevision);
    await mkdir(evidence, {recursive:true});
    await writeFile(`${evidence}/${mode}-terminal-fixture.json`, JSON.stringify({
      capturedAt:new Date().toISOString(), purpose:'terminal-http-and-ui-only', ...fixture,
    }, null, 2)+'\n');
    await page.screenshot({path:`${evidence}/${mode}-terminal-fixture.png`});
  });
}

for (const mode of ['hearts', 'spades-solo', 'spades-partners'] as const) {
  test(`actual Go normal random ${mode} match reaches the preserved terminal React table`, async ({
    page,
  }) => {
    test.skip(!process.env.M04E_SOAK, 'Optional bounded normal-match soak, separate from terminal fixture acceptance.');
    test.setTimeout(1_200_000);
    page.on('console', message => {
      if (message.type() === 'info' && message.text().startsWith('M04E_MATCH '))
        console.log(message.text());
    });
    await open(page);
    await choose(page, mode);
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
    // Exercise the public command protocol while UI bot timers remain paused.
    // Random deals come from the server. The simulated human follows delivered
    // actor-safe advice (first supplied alternative for ties), never hidden
    // analysis. Every bot action uses its actual completed Go work receipt.
    const terminal = await page.evaluate(async () => {
      const headers = {
        'Content-Type': 'application/json',
        'x-tricks-client': '1',
        'x-tricks-tab': sessionStorage.getItem('tricks-tab') ?? '',
      };
      async function request(path: string, body?: unknown): Promise<any> {
        const response = await fetch(path, {
          credentials: 'same-origin',
          headers,
          method: body === undefined ? 'GET' : 'POST',
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const value = await response.json();
        if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(value)}`);
        return value;
      }
      const sleep = () => new Promise((resolve) => setTimeout(resolve, 100));
      let state = await request('/api/platform/session');
      const initialId = state.session.gameId;
      const retained = Object.entries(sessionStorage)
        .filter(([key]) => key.startsWith('cardford-lease-v1:'))
        .map(([, value]) => JSON.parse(value))
        .find((value) => value.ownerId === state.playerId && value.gameId === initialId);
      if (!retained) throw new Error('The real browser control lease is missing.');
      const lease = retained.token;
      const deadline = Date.now() + 1_150_000;
      for (let accepted = 0; accepted < 5000 && Date.now() < deadline; accepted++) {
        const s = state.session;
        if (s.presentation.phase === 'match-end')
          return {
            gameId: s.gameId,
            hands: s.presentation.handNumber,
            revision: s.revision,
            scores: s.presentation.scores,
            accepted,
          };
        if (s.gameId !== initialId || s.presentation.handNumber > 100)
          throw new Error('Match bound exceeded.');
        const envelope = {
          commandId: crypto.randomUUID(),
          gameId: s.gameId,
          expectedRevision: s.revision,
          controlLeaseToken: lease,
        };
        if (s.node.kind === 'round-complete' || s.node.kind === 'chance') {
          if (s.node.kind === 'round-complete') console.info('M04E_MATCH ' + JSON.stringify({
            mode:s.presentation.mode,hand:s.presentation.handNumber,revision:s.revision,scores:s.presentation.scores,
          }));
          await request('/api/session/next-hand', envelope);
        } else if (s.node.kind === 'automatic') {
          await request('/api/session/advance', {
            ...envelope,
            kind: 'automatic',
            transitionId: s.node.transitionId,
          });
        } else {
          const human = !!s.actor;
          const work = await request('/api/session/prepare', {
            gameId: s.gameId,
            expectedRevision: s.revision,
            controlLeaseToken: lease,
            purpose: human ? 'human-analysis' : 'bot-action',
          });
          const workDeadline = Date.now() + 35_000;
          for (;;) {
            const status = await Promise.all(
              work.workIds.map((id: string) => request(`/api/work/${encodeURIComponent(id)}`)),
            );
            if (status.some((item: any) => item.status === 'rejected' || item.status === 'canceled'))
              throw new Error('Actual Go preparation stopped.');
            if (status.every((item: any) => item.status === 'completed')) break;
            if (Date.now() > workDeadline) throw new Error('Actual Go preparation exceeded its bound.');
            await sleep();
          }
          if (human) {
            let candidate = s.actor.candidates.length === 1 ? s.actor.candidates[0] : undefined;
            if (!candidate) {
              const { advice } = await request('/api/platform/advice', {
                ...envelope,
                commandId: crypto.randomUUID(),
                decisionId: s.decisionId,
                requestedLevel: 3,
                unlock: true,
              });
              const bid = advice.bid ?? advice.consideredBids?.[0];
              const card = advice.card ?? advice.consideredCards?.[0];
              const matches = s.actor.candidates.filter((item: any) => {
                const action = item.public;
                if (action.kind === 'bid') return bid !== undefined && action.bid === bid;
                if (action.kind === 'play') return card !== undefined && action.card === card;
                return action.kind === 'pass' && advice.pass?.length === 3 &&
                  action.cards.length === 3 && advice.pass.every((value: string) => action.cards.includes(value));
              });
              if (matches.length !== 1) throw new Error('Delivered advice did not identify one issued human candidate.');
              candidate = matches[0];
            }
            await request('/api/session/actions', {
              ...envelope,
              candidateId: candidate.id,
              preparedDecisionId: work.workId,
              preparedWorkIds: work.workIds,
            });
          } else
            await request('/api/session/advance', {
              ...envelope,
              kind: 'bot',
              preparedDecisionId: work.workId,
            });
        }
        state = await request('/api/platform/session');
      }
      throw new Error('Normal random terminal match did not finish within the declared bound.');
    });
    expect(terminal.hands).toBeGreaterThan(1);
    if (mode === 'hearts') expect(Math.max(...terminal.scores)).toBeGreaterThanOrEqual(100);
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
    expect((await current(page)).session!.presentation.phase).toBe('match-end');
    await resumeIfPaused(page);
    await expect(page.getByRole('dialog').filter({ has: page.locator('.recap-score') })).toBeVisible();
    await page.getByRole('button', { name: 'Back to table', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Game complete', exact: true })).toBeVisible();
    await mkdir(evidence, { recursive: true });
    await writeFile(`${evidence}/${mode}-terminal-match.json`, JSON.stringify({
      capturedAt: new Date().toISOString(), policy: 'public-coach-suggestion-first-supplied-tie',
      purpose: 'lifecycle-only', mode, ...terminal,
    }, null, 2) + '\n');
    await page.screenshot({ path: `${evidence}/${mode}-terminal-match.png` });
    await test
      .info()
      .attach('normal-random-terminal-match', {
        body: JSON.stringify(terminal),
        contentType: 'application/json',
      });
  });
}
