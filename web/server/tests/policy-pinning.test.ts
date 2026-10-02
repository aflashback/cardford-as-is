import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { Pool, PoolClient } from 'pg';
import { testDatabase } from '../billing/database-test.ts';
import { readConfig } from '../config.ts';
import { loadDevScenarios } from '../dev-scenarios.ts';
import { createApp } from '../http/app.ts';
import { GameService, type StrategyOptions } from '../http/game-service.ts';
import { TrialService } from '../http/trial-service.ts';
import { actionId } from '../game/index.ts';
import { assertObservation } from '../observations/index.ts';
import { newIdentity } from '../records/repository.ts';
import type { GameDocument } from '../records/types.ts';
import { analyzeDecision } from '../strategy/index.ts';
import type { PrepareView, SessionView, TrialRequest } from '../../shared/contracts.ts';

const DEFAULT = 'spades-tactics-2.1.0';
const INLINE = 'spades-plan-3.0.0';
const SEARCHED = 'spades-plan-3.1.0';
const scenarioFile = fileURLToPath(new URL('../../../examples/dev-deals.json', import.meta.url));
const scenarios = await loadDevScenarios(scenarioFile);
type AuditDocument = GameDocument & {
  reasoningPolicy?: { policyVersion: string; attribution: string };
  botDecisionAudits?: Record<string, {
    schemaVersion: string; decisionId: string; revision: number; handNumber: number; seat: number;
    policyVersion: string | null; action: { kind: string; seat: number }; originalAnalysis: string;
    observation: Parameters<typeof analyzeDecision>[0] | null;
    analysis: ReturnType<typeof analyzeDecision> | null;
  }>;
};
const envelope = (view: SessionView) => ({
  commandId: randomUUID(), gameId: view.game.id, expectedRevision: view.revision,
  controlLeaseToken: view.controlLeaseToken,
});
async function document(pool: Pool, id: string): Promise<AuditDocument> {
  return (await pool.query<{ document: AuditDocument }>('SELECT document FROM games WHERE id=$1', [id])).rows[0]!.document;
}
async function fixture(pool: Pool, policy = INLINE, options: StrategyOptions = {}) {
  const context = { token: await newIdentity(pool), tab: randomUUID() };
  const service = new GameService(pool, { policies: { 'spades-partners': policy }, ...options }, scenarios);
  const first = await service.session(context);
  const view = await service.newSession(context, {
    commandId: randomUUID(), mode: 'spades-partners', expectedActiveGameId: first.game.id,
    scenarioId: 'spades-partners-opening-a',
  });
  return { context, service, view };
}
async function botTurn(f: Awaited<ReturnType<typeof fixture>>) {
  return f.service.action(f.context, { ...envelope(f.view), action: { kind: 'bid', bid: 5 } });
}
function safe(value: unknown): void {
  if (Array.isArray(value)) for (const item of value) safe(item);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    assert.ok(!['botDecisionAudits', 'reasoningPolicy', 'decisionAnalyses', 'observation', 'analysis', 'deck', 'deals', 'hands'].includes(key), key);
    safe(item);
  }
}
function instrument(pool: Pool) {
  const count = { open: 0 };
  const seen = new WeakSet<object>();
  const watch = (client: PoolClient) => {
    if (seen.has(client)) return client;
    seen.add(client);
    const query = client.query.bind(client) as (...args: unknown[]) => unknown;
    (client as unknown as { query: (...args: unknown[]) => unknown }).query = (...args) => {
      if (args[0] === 'BEGIN') count.open++;
      if (args[0] === 'COMMIT' || args[0] === 'ROLLBACK') count.open--;
      return query(...args);
    };
    return client;
  };
  const connect = pool.connect.bind(pool) as (...args: unknown[]) => unknown;
  (pool as unknown as { connect: (...args: unknown[]) => unknown }).connect = (...args) =>
    args.length ? connect(...args) : (connect() as Promise<PoolClient>).then(watch);
  return count;
}

async function trialFixture(pool: Pool, policy = INLINE) {
  for (const file of ['004-analysis-jobs.sql', '005-analysis-attempt-fence.sql'])
    await pool.query(await readFile(new URL(`../records/migrations/${file}`, import.meta.url), 'utf8'));
  const f = await fixture(pool, policy);
  await f.service.advice(f.context, { ...envelope(f.view), decisionId: f.view.decisionId, requestedLevel: 1 });
  let view = await botTurn(f);
  for (let step = 0; !view.game.legalActions.length && step < 8; step++) {
    const ready = await f.service.prepare(f.context, envelope(view));
    view = await f.service.advance(f.context, { ...envelope(view), kind: 'bot', preparedDecisionId: ready.preparedDecisionId });
  }
  const chosen = view.game.legalActions[0]!;
  assert.equal(chosen.kind, 'play');
  if (chosen.kind !== 'play') throw new Error('Expected a recorded human play.');
  const sourceId = view.decisionId;
  await f.service.advice(f.context, { ...envelope(view), decisionId: sourceId, requestedLevel: 1 });
  view = await f.service.action(f.context, { ...envelope(view), action: chosen });
  const body: TrialRequest = { ...envelope(view), decisionId: sourceId, trialId: randomUUID(), alternative: chosen };
  return { ...f, body };
}

for (const policy of [INLINE, SEARCHED])
  test(`AUDIT-01: continuation under a restarted default retains source policy ${policy} outside transactions`, async (t) => {
    const pool = await testDatabase(t); if (!pool) return;
    const f = await trialFixture(pool, policy);
    const original = await document(pool, f.body.gameId);
    const transactions = instrument(pool);
    const trials = new TrialService(pool, { 'spades-partners': DEFAULT }); t.after(() => trials.close());
    let calls = 0;
    trials.workers.run = async (observation, _alternative, seed, version) => {
      calls++;
      assert.equal(version, policy);
      assert.equal(transactions.open, 0);
      return { status: 'available', label: 'Possible continuation', frames: [observation], plays: [],
        seed, samplerVersion: 'fixture', policyVersion: version!, limitations: [] };
    };
    const result = await trials.run(f.context, f.body);
    assert.deepEqual(await trials.run(f.context, f.body), result);
    assert.equal(calls, 1);
    const after = await document(pool, f.body.gameId);
    assert.deepEqual(after.decisionAnalyses, original.decisionAnalyses);
    assert.deepEqual(after.reasoningPolicy, original.reasoningPolicy);
    assert.deepEqual(after.actions, original.actions);
    safe(result);
  });

for (const sourceAvailable of [true, false])
  test(`AUDIT-01: continuation resolves ${sourceAvailable ? 'issued original advice before a different future game pin' : 'the game pin when original source analysis is absent'}`, async (t) => {
    const pool = await testDatabase(t); if (!pool) return;
    const f = await trialFixture(pool);
    const legacy = await document(pool, f.body.gameId);
    delete legacy.decisionAnalyses![f.body.decisionId];
    if (sourceAvailable) legacy.reasoningPolicy!.policyVersion = DEFAULT;
    else for (const [key, advice] of Object.entries(legacy.savedAdvice))
      if (advice.decisionId === f.body.decisionId) delete legacy.savedAdvice[key];
    await pool.query('UPDATE games SET document=$1 WHERE id=$2', [legacy, f.body.gameId]);
    const trials = new TrialService(pool, { 'spades-partners': SEARCHED }); t.after(() => trials.close());
    trials.workers.run = async (observation, _alternative, seed, version) => {
      assert.equal(version, INLINE);
      return { status: 'available', label: 'Possible continuation', frames: [observation], plays: [],
        seed, samplerVersion: 'fixture', policyVersion: version!, limitations: [] };
    };
    await trials.run(f.context, f.body);
    const after = await document(pool, f.body.gameId);
    assert.deepEqual(after.decisionAnalyses, legacy.decisionAnalyses);
    assert.deepEqual(after.savedAdvice, legacy.savedAdvice);
    assert.deepEqual(after.reasoningPolicy, legacy.reasoningPolicy);
  });

test('AUDIT-01: Hearts sealed bot passes use the pinned policy outside transactions', async (t) => {
  const pool = await testDatabase(t); if (!pool) return;
  const transactions = instrument(pool);
  const calls: { seat: number; version: string | undefined; open: number }[] = [];
  const context = { token: await newIdentity(pool), tab: randomUUID() };
  const service = new GameService(pool, { policies: { hearts: 'hearts-plan-1.0.0' }, analyze(observation, version) {
    calls.push({ seat: observation.seat, version, open: transactions.open }); return analyzeDecision(observation, version);
  } }, scenarios);
  const first = await service.session(context);
  const view = await service.newSession(context, { commandId: randomUUID(), mode: 'hearts', expectedActiveGameId: first.game.id, scenarioId: 'hearts-opening-a' });
  assert.equal(view.game.phase, 'pass');
  const body = { ...envelope(view), action: view.game.legalActions[0]! };
  const next = await service.action(context, body);
  assert.deepEqual(await service.action(context, body), next);
  const botCalls = calls.filter(call => call.seat !== 0);
  assert.equal(botCalls.length, 3);
  assert.ok(botCalls.every(call => call.version === 'hearts-plan-1.0.0' && call.open === 0), JSON.stringify(botCalls));
  const audits = Object.values((await document(pool, view.game.id)).botDecisionAudits ?? {});
  assert.equal(audits.length, 3);
  for (const audit of audits) {
    assert.equal(audit.decisionId, `${view.decisionId}:pass:${audit.seat}`);
    assert.equal(audit.originalAnalysis, 'available');
    assert.equal(audit.action.kind, 'pass');
    assert.deepEqual(audit.action, audit.analysis!.action);
    assert.equal(audit.policyVersion, 'hearts-plan-1.0.0');
    assertObservation(audit.observation);
  }
  safe(next);
});

test('AUDIT-02: an accepted sealed pass replays across hands and changed-body reuse rejects without new bot evidence', async (t) => {
  const pool = await testDatabase(t); if (!pool) return;
  const context = { token: await newIdentity(pool), tab: randomUUID() };
  const service = new GameService(pool, {}, scenarios);
  const first = await service.session(context);
  const opening = await service.newSession(context, { commandId: randomUUID(), mode: 'hearts', expectedActiveGameId: first.game.id, scenarioId: 'hearts-opening-a' });
  const body = { ...envelope(opening), action: opening.game.legalActions[0]! };
  const accepted = await service.action(context, body);
  let view = accepted;
  for (let step = 0; !['hand-end', 'match-end'].includes(view.game.phase) && step < 90; step++) {
    if (view.game.legalActions.length)
      view = await service.action(context, { ...envelope(view), action: view.game.legalActions[0]! });
    else if (view.game.phase === 'trick-end')
      view = await service.advance(context, { ...envelope(view), kind: 'collect-trick' });
    else {
      const prepared = await service.prepare(context, envelope(view));
      view = await service.advance(context, { ...envelope(view), kind: 'bot', preparedDecisionId: prepared.preparedDecisionId });
    }
  }
  assert.equal(view.game.phase, 'hand-end');
  view = await service.nextHand(context, envelope(view));
  assert.equal(view.game.phase, 'pass');
  const before = await document(pool, view.game.id);
  assert.deepEqual(await service.action(context, body), accepted);
  await assert.rejects(service.action(context, { ...body, action: opening.game.legalActions[1]! }), /request ID was already used/i);
  assert.deepEqual(await document(pool, view.game.id), before);
});

test('AUDIT-01: restarting with another default retains the original policy and authored advice', async (t) => {
  const pool = await testDatabase(t); if (!pool) return;
  const f = await fixture(pool);
  const original = await document(pool, f.view.game.id);
  assert.deepEqual(original.reasoningPolicy, { policyVersion: INLINE, attribution: 'new-session' });
  const view = await botTurn(f);
  const versions: (string | undefined)[] = [];
  const restarted = new GameService(pool, { analyze(obs, version) {
    versions.push(version); return analyzeDecision(obs, version);
  } });
  const ready = await restarted.prepare(f.context, envelope(view));
  const next = await restarted.advance(f.context, { ...envelope(view), kind: 'bot', preparedDecisionId: ready.preparedDecisionId });
  assert.deepEqual(versions, [INLINE]);
  assert.deepEqual((await document(pool, view.game.id)).decisionAnalyses?.[f.view.decisionId], original.decisionAnalyses?.[f.view.decisionId]);
  safe(next);
});

test('AUDIT-01: a searched game resumed under an inline default freezes human and bot analysis outside transactions', async (t) => {
  const pool = await testDatabase(t); if (!pool) return;
  const f = await fixture(pool, SEARCHED);
  await pool.query("UPDATE games SET document=document-'decisionAnalyses' WHERE id=$1", [f.view.game.id]);
  const transactions = instrument(pool);
  const calls: { version: string | undefined; open: number }[] = [];
  const restarted = new GameService(pool, { analyze(obs, version) {
    calls.push({ version, open: transactions.open }); return analyzeDecision(obs, version);
  } });
  const human = await restarted.session(f.context);
  assert.ok((await document(pool, human.game.id)).decisionAnalyses?.[human.decisionId]);
  const bot = await restarted.action(f.context, { ...envelope(human), action: { kind: 'bid', bid: 5 } });
  await restarted.prepare(f.context, envelope(bot));
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.version === SEARCHED && call.open === 0), JSON.stringify(calls));
});

test('AUDIT-01: legacy single-policy evidence migrates a future pin; absent evidence is explicitly attributed', async (t) => {
  const pool = await testDatabase(t); if (!pool) return;
  const f = await fixture(pool);
  await pool.query("UPDATE games SET document=document-'reasoningPolicy' WHERE id=$1", [f.view.game.id]);
  const restarted = new GameService(pool);
  await restarted.session(f.context);
  assert.deepEqual((await document(pool, f.view.game.id)).reasoningPolicy, { policyVersion: INLINE, attribution: 'legacy-saved-analysis' });
  await pool.query("UPDATE games SET document=document-'reasoningPolicy'-'decisionAnalyses'-'savedAdvice' WHERE id=$1", [f.view.game.id]);
  await restarted.session(f.context);
  assert.deepEqual((await document(pool, f.view.game.id)).reasoningPolicy, { policyVersion: DEFAULT, attribution: 'legacy-default' });
});

test('AUDIT-01: conflicting or unsupported legacy policy evidence fails closed without rewriting history', async (t) => {
  const pool = await testDatabase(t); if (!pool) return;
  for (const alternate of [DEFAULT, 'unknown-policy']) {
    const f = await fixture(pool);
    const original = await document(pool, f.view.game.id);
    delete original.reasoningPolicy;
    const saved = structuredClone(original.decisionAnalyses![f.view.decisionId]!);
    saved.analysis.policyVersion = alternate;
    saved.adviceSnapshot.policyVersion = alternate;
    if (alternate === DEFAULT) original.decisionAnalyses!.other = saved;
    else original.decisionAnalyses = { [f.view.decisionId]: saved };
    await pool.query('UPDATE games SET document=$1 WHERE id=$2', [original, f.view.game.id]);
    await assert.rejects(new GameService(pool).session(f.context), /policy/i);
    assert.deepEqual(await document(pool, f.view.game.id), original);
  }
});

test('AUDIT-02: preparing captures original evidence; only accepted commit writes one immutable audit', async (t) => {
  const pool = await testDatabase(t); if (!pool) return;
  const f = await fixture(pool);
  const view = await botTurn(f);
  const prepared = await f.service.prepare(f.context, envelope(view));
  const stored = (await pool.query<{ result: Record<string, unknown> }>('SELECT result FROM jobs WHERE id=$1', [prepared.preparedDecisionId])).rows[0]!.result;
  assert.equal(stored.kind, 'bot-decision');
  assert.equal(stored.schemaVersion, '1.0.0');
  assert.equal(stored.policyVersion, INLINE);
  assert.equal(stored.decisionId, view.decisionId);
  assert.equal(stored.revision, view.revision);
  assert.equal(stored.seat, view.game.turn);
  assertObservation(stored.observation);
  assert.equal(Object.keys((await document(pool, view.game.id)).botDecisionAudits ?? {}).length, 0);
  const body = { ...envelope(view), kind: 'bot' as const, preparedDecisionId: prepared.preparedDecisionId };
  const next = await f.service.advance(f.context, body);
  assert.deepEqual(await f.service.advance(f.context, body), next);
  await assert.rejects(f.service.advance(f.context, { ...body, commandId: randomUUID() }), /table changed/i);
  const original = await document(pool, view.game.id);
  const audit = original.botDecisionAudits![view.decisionId]!;
  assert.equal(Object.keys(original.botDecisionAudits!).length, 1);
  assert.equal(audit.originalAnalysis, 'available');
  assert.equal(audit.action.seat, view.game.turn);
  assert.deepEqual(audit.observation, stored.observation);
  assert.deepEqual(audit.analysis, stored.analysis);
  assert.deepEqual(audit.action, stored.action);
  assert.equal(audit.revision, view.revision);
  assert.equal(audit.policyVersion, INLINE);
  assert.deepEqual(await document(pool, view.game.id), original);
  safe(next);
});

test('AUDIT-02: malformed or mismatched prepared envelopes reject atomically', async (t) => {
  const pool = await testDatabase(t); if (!pool) return;
  const f = await fixture(pool);
  const view = await botTurn(f);
  const prepared = await f.service.prepare(f.context, envelope(view));
  const originalJob = (await pool.query<{ result: Record<string, unknown> }>('SELECT result FROM jobs WHERE id=$1', [prepared.preparedDecisionId])).rows[0]!.result;
  const before = await document(pool, view.game.id);
  const action = originalJob.action as Record<string, unknown>;
  const analysis = originalJob.analysis as Record<string, unknown>;
  for (const patch of [
    { schemaVersion: '99.0.0' }, { revision: view.revision + 1 }, { decisionId: 'wrong' },
    { seat: 0 }, { policyVersion: DEFAULT }, { action: { ...action, bid: 13 } },
    { analysis: { ...analysis, policyVersion: DEFAULT } },
    { observation: { ...(originalJob.observation as Record<string, unknown>), hands: [['SA']] } },
  ]) {
    await pool.query('UPDATE jobs SET result=$1 WHERE id=$2', [{ ...originalJob, ...patch }, prepared.preparedDecisionId]);
    await assert.rejects(f.service.advance(f.context, { ...envelope(view), kind: 'bot', preparedDecisionId: prepared.preparedDecisionId }));
    assert.deepEqual(await document(pool, view.game.id), before);
    assert.equal((await pool.query('SELECT status FROM jobs WHERE id=$1', [prepared.preparedDecisionId])).rows[0]!.status, 'ready');
  }
});

test('AUDIT-03: an old action-only job commits with original analysis explicitly unavailable', async (t) => {
  const pool = await testDatabase(t); if (!pool) return;
  const f = await fixture(pool);
  const view = await botTurn(f);
  const prepared = await f.service.prepare(f.context, envelope(view));
  await pool.query('UPDATE jobs SET result=$1 WHERE id=$2', [{ kind: 'bid', seat: view.game.turn, bid: 1 }, prepared.preparedDecisionId]);
  const next = await f.service.advance(f.context, { ...envelope(view), kind: 'bot', preparedDecisionId: prepared.preparedDecisionId });
  const audit = (await document(pool, view.game.id)).botDecisionAudits![view.decisionId]!;
  assert.equal(audit.originalAnalysis, 'unavailable-legacy-job');
  assert.equal(audit.policyVersion, null);
  assert.equal(audit.observation, null);
  assert.equal(audit.analysis, null);
  assert.deepEqual(audit.action, { kind: 'bid', seat: view.game.turn, bid: 1 });
  safe(next);
});

for (const mode of ['spades-solo', 'spades-partners'] as const)
  test(`AUDIT-01..03: one complete ${mode} API hand retains 42 original bot audits and 14 human analyses`, async (t) => {
    const pool = await testDatabase(t); if (!pool) return;
    const config = readConfig({ ...process.env, APP_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL,
      SPADES_POLICY: INLINE, DEV_SCENARIOS_FILE: scenarioFile });
    const app = await createApp(config, pool); t.after(() => app.close());
    let cookie = '';
    const tab = randomUUID();
    const request = async (method: 'GET' | 'POST', url: string, body?: unknown) => {
      const response = await app.inject({ method, url,
        headers: { cookie, 'x-tricks-tab': tab, 'x-tricks-client': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { payload: JSON.stringify(body) }) });
      const set = response.headers['set-cookie']; if (typeof set === 'string') cookie = set.split(';')[0]!;
      assert.equal(response.statusCode, 200, response.body);
      safe(response.json()); return response.json();
    };
    const first = await request('GET', '/api/session') as SessionView;
    let view = await request('POST', '/api/sessions', { commandId: randomUUID(), mode,
      expectedActiveGameId: first.game.id, scenarioId: `${mode}-opening-a` }) as SessionView;
    for (let step = 0; !['hand-end', 'match-end'].includes(view.game.phase) && step < 90; step++) {
      if (view.game.legalActions.length)
        view = await request('POST', '/api/session/actions', { ...envelope(view), action: view.game.legalActions[0]! });
      else if (view.game.phase === 'trick-end')
        view = await request('POST', '/api/session/advance', { ...envelope(view), kind: 'collect-trick' });
      else {
        const prepared = await request('POST', '/api/session/prepare', envelope(view)) as PrepareView;
        view = await request('POST', '/api/session/advance', { ...envelope(view), kind: 'bot', preparedDecisionId: prepared.preparedDecisionId });
      }
    }
    assert.equal(view.game.phase, 'hand-end');
    assert.equal(view.game.history.length, 13);
    const finished = await document(pool, view.game.id);
    const audits = Object.values(finished.botDecisionAudits ?? {});
    assert.equal(audits.length, 42);
    assert.equal(Object.keys(finished.decisionAnalyses ?? {}).length, 14);
    assert.equal(finished.actions.filter(action => action.kind === 'action').length, 56);
    for (const seat of [1, 2, 3]) assert.equal(audits.filter(audit => audit.seat === seat).length, 14);
    for (const audit of audits) {
      assert.equal(audit.policyVersion, INLINE);
      assert.equal(audit.originalAnalysis, 'available');
      assertObservation(audit.observation);
      assert.deepEqual(audit.action, audit.analysis!.action);
      assert.equal(audit.action.seat, audit.seat);
      assert.ok(audit.observation!.legalActions.some(action => actionId(action) === actionId(audit.analysis!.action)));
    }
    const next = await request('POST', '/api/session/next-hand', envelope(view)) as SessionView;
    assert.equal(next.game.handNumber, 2);
    assert.deepEqual((await document(pool, next.game.id)).reasoningPolicy, finished.reasoningPolicy);
    assert.deepEqual((await document(pool, next.game.id)).botDecisionAudits, finished.botDecisionAudits);
  });
