import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  ContractName,
  ContractTypes,
  PlatformSession,
  PlatformSessionView,
  TrixObservation,
} from '../shared/local-service.contracts.ts';
import { validateContract } from '../shared/local-service.validation.ts';
const origin = process.env.CARDFORD_TRIX_ORIGIN;
const evidence = resolve(process.env.CARDFORD_EVIDENCE_DIR ?? 'qa/implementation/trix/browser');
const tabs = new WeakMap<Page, string>();

async function request<N extends ContractName>(
  page: Page,
  path: string,
  name: N,
  body?: unknown,
): Promise<ContractTypes[N]> {
  let tab = tabs.get(page);
  if (tab === undefined) {
    tab = await page.evaluate(() => sessionStorage.getItem('tricks-tab') ?? '');
    tabs.set(page, tab);
  }
  const response = await page.request.fetch(`${origin}${path}`, {
    timeout: 15_000,
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-tricks-tab': tab, ...(body === undefined ? {} : { 'x-tricks-client': '1' }) },
    ...(body === undefined ? {} : { data: body }),
  });
  const value: unknown = await response.json();
  expect(response.ok(), `${path}: HTTP ${response.status()} ${JSON.stringify(value)}`).toBe(true);
  if (!validateContract(name, value)) throw new Error(`Invalid ${name} from actual Go ${path}`);
  return value;
}
async function current(page: Page): Promise<PlatformSessionView> {
  return request(page, '/api/platform/session', 'PlatformSessionView');
}
function observation(session: PlatformSession): TrixObservation {
  if (!('gameId' in session.presentation) || session.presentation.gameId !== 'trix')
    throw new Error('Expected the registered Trix presentation.');
  return session.presentation.observation;
}
async function lease(page: Page, view: PlatformSessionView): Promise<string> {
  const value = await page.evaluate(
    ({ ownerId, gameId }) => {
      for (const key of Object.keys(sessionStorage)) {
        if (!key.startsWith('cardford-lease-v1:')) continue;
        const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
        if (
          stored &&
          typeof stored === 'object' &&
          'ownerId' in stored &&
          stored.ownerId === ownerId &&
          'gameId' in stored &&
          stored.gameId === gameId &&
          'token' in stored &&
          typeof stored.token === 'string'
        )
          return stored.token;
      }
      return null;
    },
    { ownerId: view.playerId, gameId: view.session!.gameId },
  );
  if (!value) throw new Error('The actual browser control lease is missing.');
  return value;
}
async function captureResponsive(page: Page, mode: string, phase: string) {
  const previous = page.viewportSize();
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${mode} ${phase} ${viewport.width}: page overflow`,
    ).toBe(true);
    await page.screenshot({
      path: resolve(evidence, `${mode}-${phase}-${viewport.width}.png`),
      fullPage: true,
    });
  }
  if (previous) await page.setViewportSize(previous);
}
async function choose(page: Page, mode: string) {
  await page.goto(origin!);
  const paused = page.getByRole('dialog', { name: 'Paused', exact: true });
  await expect
    .poll(async () => (await paused.isVisible()) || (await page.locator('.trix-app').isVisible()))
    .toBe(true);
  if (await paused.isVisible()) await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  const pace = page.getByRole('heading', { name: 'Set the pace' });
  await expect
    .poll(
      async () =>
        (await pace.isVisible()) ||
        (await page.getByRole('dialog', { name: 'Choose a game', exact: true }).isVisible()),
    )
    .toBe(true);
  if (await pace.isVisible()) await page.getByRole('button', { name: 'Choose game', exact: true }).click();
  const label = `${mode.includes('complex') ? 'Complex' : 'Basic'} · ${mode.endsWith('partners') ? 'Partners' : 'Solo'}`;
  await page.locator('.game-option,.trix-catalog button').filter({ hasText: label }).click();
  await expect(page.getByRole('region', { name: 'Trix four player table' })).toBeVisible();
  await expect.poll(async () => observation((await current(page)).session!).variantId).toBe(mode.slice(5));
}

for (const mode of [
  'trix-basic-solo',
  'trix-basic-partners',
  'trix-complex-solo',
  'trix-complex-partners',
] as const) {
  test(`actual Go ${mode}: complete session, original hints, responsive table and reload`, async ({
    page,
  }) => {
    if (!origin) throw new Error('Run with the actual native Trix browser harness.');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await choose(page, mode);
    let state = await current(page);
    const token = await lease(page, state),
      gameId = state.session!.gameId;
    // Initial entry/reload remains paused while the actor-safe HTTP driver runs.
    if (await page.getByRole('button', { name: 'Pause', exact: true }).isVisible())
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Game paused' })).toBeVisible();
    const records: {
      decisionId: string;
      deal: number;
      phase: string;
      candidateId: string;
      origin: string;
      hint?: string;
      exposedLevel: 0 | 3;
    }[] = [];
    const sampledHints = new Set<string>(),
      hintedDecisions: string[] = [],
      started = Date.now();
    await mkdir(evidence, { recursive: true });
    const completed: {
      deal: number;
      kingdom: number;
      owner: number;
      request: string | null;
      totals: TrixObservation['totals'];
    }[] = [];
    const actions: Record<string, number> = {};
    let uiAction = false,
      uiLayout = false,
      uiDoubles = false,
      uiRequest = false,
      denseBoard = false;
    async function completedDeal(s: PlatformSession, o: TrixObservation) {
      if (completed.at(-1)?.deal !== o.dealNumber)
        completed.push({
          deal: o.dealNumber,
          kingdom: o.kingdom,
          owner: o.owner,
          request: o.request,
          totals: o.requestTotals,
        });
      const receipt = {
        mode,
        gameId,
        revision: s.revision,
        deal: o.dealNumber,
        kingdom: o.kingdom,
        request: o.request,
        elapsedMs: Date.now() - started,
        completed,
        records,
        actions,
        hintedDecisions,
      };
      console.info(
        'TRIX_DEAL ' +
          JSON.stringify({
            mode,
            gameId,
            deal: o.dealNumber,
            kingdom: o.kingdom,
            request: o.request,
            elapsedMs: receipt.elapsedMs,
          }),
      );
      await writeFile(resolve(evidence, `${mode}-progress.json`), JSON.stringify(receipt, null, 2));
    }
    for (let accepted = 0; accepted < 1800; accepted++) {
      const s = state.session!;
      const o = observation(s);
      if (o.phase === 'session-complete') {
        await completedDeal(s, o);
        break;
      }
      const envelope = {
        commandId: crypto.randomUUID(),
        gameId,
        expectedRevision: s.revision,
        controlLeaseToken: token,
      };
      if (s.node.kind === 'round-complete' || s.node.kind === 'chance') {
        if (s.node.kind === 'round-complete') await completedDeal(s, o);
        await request(page, '/api/session/next-hand', 'LocalServiceCommandReceipt', envelope);
      } else if (s.node.kind === 'automatic')
        await request(page, '/api/session/advance', 'LocalServiceCommandReceipt', {
          ...envelope,
          kind: 'automatic',
          transitionId: s.node.transitionId,
        });
      else {
        const human = s.actor?.gameId === 'trix';
        const work = await request(page, '/api/session/prepare', 'LocalServicePrepareView', {
          gameId,
          expectedRevision: s.revision,
          controlLeaseToken: token,
          purpose: human ? 'human-analysis' : 'bot-action',
        });
        const deadline = Date.now() + 20_000;
        for (;;) {
          const statuses = await Promise.all(
            work.workIds.map((id) =>
              request(page, `/api/work/${encodeURIComponent(id)}`, 'LocalServicePrepareView'),
            ),
          );
          if (statuses.some((x) => x.status === 'rejected' || x.status === 'canceled'))
            throw new Error('Actual Go preparation stopped.');
          if (statuses.every((x) => x.status === 'completed')) break;
          if (Date.now() > deadline) throw new Error('Actual Go preparation exceeded the 20 second bound.');
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        if (human && s.actor?.gameId === 'trix') {
          let candidate = s.actor.candidates[0];
          if (!candidate) throw new Error('The actual human actor packet has no issued candidates.');
          const sampleKey = `${candidate.public.kind}:${o.request ?? 'selection'}:${o.kingdom === 4 ? 'late' : 'initial'}`;
          let sampled: ContractTypes['TrixAdvice'] | undefined;
          if (!sampledHints.has(sampleKey)) {
            const delivered = await request(page, '/api/platform/advice', 'PlatformAdviceView', {
              ...envelope,
              commandId: crypto.randomUUID(),
              decisionId: s.decisionId,
              requestedLevel: 3,
              unlock: true,
            });
            const hint = delivered.advice;
            if (!('gameId' in hint) || hint.gameId !== 'trix')
              throw new Error('Actual saved advice is not Trix.');
            expect(hint.decisionId).toBe(s.decisionId);
            expect(hint.variantId).toBe(o.variantId);
            const id =
              hint.recommendedCandidateId ??
              hint.alternatives?.[0] ??
              (s.actor.candidates.length === 1 ? s.actor.candidates[0].id : undefined);
            const issued = s.actor.candidates.find((c) => c.id === id);
            if (!issued) throw new Error('Delivered code hint did not bind an issued human candidate.');
            candidate = issued;
            sampled = hint;
            sampledHints.add(sampleKey);
            hintedDecisions.push(s.decisionId);
          }
          records.push({
            decisionId: s.decisionId,
            deal: o.dealNumber,
            phase: o.phase,
            candidateId: candidate.id,
            origin: sampled?.origin ?? work.source ?? 'code',
            ...(sampled ? { hint: sampled.text } : {}),
            exposedLevel: sampled ? 3 : 0,
          });
          actions[candidate.public.kind] = (actions[candidate.public.kind] ?? 0) + 1;
          // Check real human DOM actions once in each applicable phase. Reload
          // first to display the driver’s latest confirmed position.
          const dense =
            o.phase === 'layout' &&
            !denseBoard &&
            o.board.reduce((n, r) => n + (r.low ? r.high - r.low + 1 : 0), 0) >= 32;
          const ui =
            dense ||
            (candidate.public.kind === 'play-card' && !uiAction) ||
            (candidate.public.kind === 'layout-card' && !uiLayout) ||
            (candidate.public.kind === 'declare-doubles' && !uiDoubles) ||
            (candidate.public.kind === 'choose-request' && !uiRequest);
          if (ui) {
            await page.reload();
            await expect(page.getByRole('heading', { name: 'Game paused' })).toBeVisible();
            await page.getByRole('button', { name: 'Resume game', exact: true }).click();
            await captureResponsive(page, mode, dense ? 'dense-layout' : o.phase);
            if (dense) denseBoard = true;
            if (candidate.public.kind === 'choose-request') {
              const label = (
                {
                  diamonds: 'Diamonds',
                  lutoosh: 'Lutoosh',
                  queens: 'Queens',
                  king: 'The King',
                  complex: 'All combined',
                  trix: 'Trix',
                } as const
              )[candidate.public.request];
              await page.locator('.trix-request-options button').filter({ hasText: label }).click();
              uiRequest = true;
            } else if (candidate.public.kind === 'declare-doubles') {
              for (const card of candidate.public.cards ?? [])
                await page.getByRole('button', { name: cardName(card), exact: true }).click();
              await page
                .getByRole('button', {
                  name: (candidate.public.cards ?? []).length
                    ? 'Double'
                    : 'Skip',
                  exact: true,
                })
                .click();
              uiDoubles = true;
            } else if (candidate.public.kind === 'play-card' || candidate.public.kind === 'layout-card') {
              await page.getByRole('button', { name: cardName(candidate.public.card), exact: true }).click();
              await page
                .getByRole('button', {
                  name: candidate.public.kind === 'layout-card' ? 'Place card' : 'Play card',
                  exact: true,
                })
                .click();
              if (candidate.public.kind === 'layout-card') uiLayout = true;
              else uiAction = true;
            } else if (candidate.public.kind === 'layout-pass')
              await page.getByRole('button', { name: 'Pass · forced', exact: true }).click();
            await expect
              .poll(async () => (await current(page)).session!.revision, { timeout: 20_000 })
              .toBeGreaterThan(s.revision);
            await page.getByRole('button', { name: 'Pause', exact: true }).click();
          } else
            await request(page, '/api/session/actions', 'LocalServiceCommandReceipt', {
              ...envelope,
              candidateId: candidate.id,
              preparedDecisionId: work.preparedDecisionId ?? work.workId,
              preparedWorkIds: work.workIds,
            });
        } else
          await request(page, '/api/session/advance', 'LocalServiceCommandReceipt', {
            ...envelope,
            kind: 'bot',
            preparedDecisionId: work.preparedDecisionId ?? work.workId,
          });
      }
      state = await current(page);
    }
    const terminal = observation(state.session!);
    expect(terminal.phase).toBe('session-complete');
    expect(terminal.dealNumber).toBe(mode.includes('basic') ? 20 : 8);
    expect(completed.map((deal) => deal.deal)).toEqual(
      Array.from({ length: terminal.dealNumber }, (_, index) => index + 1),
    );
    expect(terminal.kingdom).toBe(4);
    expect(terminal.winners.length).toBeGreaterThan(0);
    expect(uiAction).toBe(true);
    expect(uiLayout).toBe(true);
    expect(uiRequest).toBe(true);
    expect(denseBoard).toBe(true);
    expect(actions['layout-card']).toBeGreaterThan(0);
    expect(actions['declare-doubles']).toBeGreaterThan(0);
    const penaltyTotal = terminal.totals.reduce((n, s) => n + s.total, 0),
      withheld = terminal.withheldBonuses.reduce((n, w) => n + w.bonusValue, 0);
    expect(penaltyTotal).toBe(mode.endsWith('partners') ? 0 : 0 - withheld);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Game paused' })).toBeVisible();
    expect(observation((await current(page)).session!).phase).toBe('session-complete');
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Game complete', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Saved Trix decisions' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Decision' }).locator('option')).not.toHaveCount(1);
    expect(hintedDecisions.length).toBeGreaterThan(0);
    await page.getByRole('combobox', { name: 'Decision' }).selectOption(hintedDecisions[0]);
    await page.getByRole('button', { name: 'Show saved coach cue', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Original saved coach cue' })).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await mkdir(evidence, { recursive: true });
    await captureResponsive(page, mode, 'complete');
    expect(errors).toEqual([]);
    await writeFile(
      resolve(evidence, `${mode}-session.json`),
      JSON.stringify(
        {
          purpose: 'actual-native-random-lifecycle-and-ui',
          mode,
          gameId,
          terminal,
          completed,
          actions,
          records,
          hintedDecisions,
          pageErrors: errors,
        },
        null,
        2,
      ),
    );
  });
}
function cardName(card: string): string {
  return `${({ A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack' } as Record<string, string>)[card.slice(1)] ?? card.slice(1)} of ${({ C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' } as Record<string, string>)[card[0]]}`;
}
