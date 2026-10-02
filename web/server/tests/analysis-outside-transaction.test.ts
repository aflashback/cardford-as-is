import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Pool, PoolClient } from 'pg';
import { testDatabase } from '../billing/database-test.ts';
import { newIdentity } from '../records/repository.ts';
import type { GameDocument } from '../records/types.ts';
import { GameService } from '../http/game-service.ts';
import { readConfig } from '../config.ts';
import { analyzeDecision, costOf, getReasoningProfile } from '../strategy/index.ts';
import type { SessionView } from '../../shared/contracts.ts';

const SEARCHED = 'spades-plan-3.4.0';
const envelope = (view: SessionView) => ({
  commandId: randomUUID(),
  gameId: view.game.id,
  expectedRevision: view.revision,
  controlLeaseToken: view.controlLeaseToken,
});

/** Counts transactions that are open on this pool at any moment. */
function instrument(pool: Pool) {
  const counter = { open: 0 };
  const wrapped = new WeakSet<object>();
  const watch = (client: PoolClient) => {
    if (wrapped.has(client)) return client;
    wrapped.add(client);
    const query = client.query.bind(client) as (...args: unknown[]) => unknown;
    (client as unknown as { query: (...args: unknown[]) => unknown }).query = (...args: unknown[]) => {
      if (args[0] === 'BEGIN') counter.open++;
      if (args[0] === 'COMMIT' || args[0] === 'ROLLBACK') counter.open--;
      return query(...args);
    };
    return client;
  };
  const connect = pool.connect.bind(pool) as (...args: unknown[]) => unknown;
  // The driver also calls connect(callback) internally for pool.query; keep that form intact.
  (pool as unknown as { connect: (...args: unknown[]) => unknown }).connect = (...args: unknown[]) =>
    args.length ? connect(...args) : (connect() as Promise<PoolClient>).then(watch);
  return counter;
}

async function playHand(service: GameService, context: { token: string; tab: string }, first: SessionView) {
  let view = first;
  let human = 0;
  for (let step = 0; !['hand-end', 'match-end'].includes(view.game.phase) && step < 100; step++) {
    if (view.game.legalActions.length) {
      view = await service.action(context, { ...envelope(view), action: view.game.legalActions[0]! });
      human++;
    } else if (view.game.phase === 'trick-end')
      view = await service.advance(context, { ...envelope(view), kind: 'collect-trick' });
    else {
      const prepared = await service.prepare(context, envelope(view));
      view = await service.advance(context, {
        ...envelope(view),
        kind: 'bot',
        preparedDecisionId: prepared.preparedDecisionId,
      });
    }
  }
  return { view, human };
}

for (const mode of ['spades-solo', 'spades-partners'] as const)
  test(`STRAT-12: ${mode} bounded-search analysis never runs while a transaction is open`, async (t) => {
    const pool = await testDatabase(t);
    if (!pool) return;
    assert.equal(costOf(getReasoningProfile(SEARCHED, mode)), 'bounded-search');
    const transactions = instrument(pool);
    const calls = { searched: 0, inTransaction: 0 };
    const service = new GameService(pool, {
      policies: { 'spades-solo': SEARCHED, 'spades-partners': SEARCHED },
      analyze(observation, policyVersion) {
        if (policyVersion === SEARCHED) {
          calls.searched++;
          if (transactions.open !== 0) calls.inTransaction++;
        }
        return analyzeDecision(observation, policyVersion);
      },
    });
    const context = { token: await newIdentity(pool), tab: randomUUID() };
    const first = await service.session(context);
    const started = await service.newSession(context, {
      commandId: randomUUID(),
      mode,
      expectedActiveGameId: first.game.id,
    });
    // Advice at the first human decision uses the frozen searched analysis.
    if (started.game.legalActions.length) {
      const advice = await service.advice(context, {
        ...envelope(started),
        decisionId: started.decisionId,
        requestedLevel: 3,
      });
      assert.equal(advice.decisionId, started.decisionId);
    }
    const { view, human } = await playHand(service, context, await service.session(context));
    assert.equal(view.game.phase, 'hand-end');
    assert.equal(human, 14);
    assert.ok(calls.searched >= 14 + 39, 'human and computer decisions both use the named policy');
    assert.equal(calls.inTransaction, 0, 'searched analysis ran inside an open transaction');
    const document = (
      await pool.query<{ document: GameDocument }>('SELECT document FROM games WHERE id=$1', [view.game.id])
    ).rows[0]!.document;
    const analyses = Object.values(document.decisionAnalyses ?? {});
    assert.equal(analyses.length, 14, 'every human decision has its frozen analysis');
    for (const saved of analyses) {
      assert.equal(saved.analysis.policyVersion, SEARCHED);
      assert.equal(saved.analysis.schemaVersion, '1.1.0');
      assert.equal(saved.adviceSnapshot.policyVersion, SEARCHED);
    }
    assert.equal(transactions.open, 0);
  });

test('STRAT-12: the live default stays inline and an unknown named policy is rejected at startup', async (t) => {
  const pool = await testDatabase(t);
  if (!pool) return;
  assert.throws(() => new GameService(pool, { policies: { 'spades-solo': 'spades-plan-9.9.9' } }), /profile/);
  assert.throws(() => new GameService(pool, { policies: { hearts: SEARCHED } }), /profile/);
  const service = new GameService(pool);
  assert.equal(service.strategy.inline('spades-partners'), true);
  assert.equal(service.strategy.inline('spades-partners'), true);
  const base = {
    APP_ENV: 'local', IDENTITY_MODE: 'local-test', BILLING_MODE: 'fixture',
    DATABASE_URL: 'postgres://test@127.0.0.1/tricks', HOST: '127.0.0.1', PORT: '4173',
    APP_ORIGIN: 'http://127.0.0.1:4173',
  };
  assert.equal(readConfig(base).spadesPolicy, null);
  assert.equal(readConfig({ ...base, SPADES_POLICY: SEARCHED }).spadesPolicy, SEARCHED);
  assert.throws(() => readConfig({ ...base, SPADES_POLICY: 'Not A Policy!' }), /SPADES_POLICY/);
});
