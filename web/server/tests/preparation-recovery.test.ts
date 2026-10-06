import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { Pool, PoolClient } from 'pg';
import { testDatabase } from '../billing/database-test.ts';
import { newIdentity, hashToken } from '../records/repository.ts';
import { GameService, type StrategyOptions } from '../http/game-service.ts';
import { createApp } from '../http/app.ts';
import { readConfig } from '../config.ts';
import { loadDevScenarios } from '../dev-scenarios.ts';
import { analyzeDecision } from '../strategy/index.ts';
import { apply, collectTrick, legalActions } from '../game/index.ts';
import type { GameDocument } from '../records/types.ts';
import type { SessionView, ReviewTrial } from '../../shared/contracts.ts';

const scenarios = await loadDevScenarios(fileURLToPath(new URL('../../../examples/dev-deals.json', import.meta.url)));
const envelope = (view: SessionView) => ({ commandId: randomUUID(), gameId: view.game.id,
  expectedRevision: view.revision, controlLeaseToken: view.controlLeaseToken });
function barrier() {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  return { entered, release, wait: async () => { enter(); await released; } };
}
async function fixture(pool: Pool, options: StrategyOptions = {}, mode: 'spades-partners' | 'hearts' = 'spades-partners') {
  const context = { token: await newIdentity(pool), tab: randomUUID() };
  const service = new GameService(pool, options, scenarios);
  const first = await service.session(context);
  const opening = await service.newSession(context, { commandId: randomUUID(), mode,
    expectedActiveGameId: first.game.id, scenarioId: `${mode}-opening-a` });
  const view = mode === 'hearts' ? opening : await service.action(context,
    { ...envelope(opening), action: { kind: 'bid', bid: 5 } });
  const owner = (await pool.query<{ player_id: string }>('SELECT player_id FROM sessions WHERE token_hash=$1',
    [hashToken(context.token)])).rows[0]!.player_id;
  return { context, service, opening, view, owner };
}
async function stored(pool: Pool, gameId: string) {
  return (await pool.query<{ revision: number; document: GameDocument }>('SELECT revision,document FROM games WHERE id=$1', [gameId])).rows[0]!;
}
const code = (expected: string) => (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === expected;

test('SYS-04: two service instances claim once, reuse immutable ready result/expiry, and accept once', async t => {
  const pool = await testDatabase(t); if (!pool) return;
  const gate = barrier(); t.after(gate.release);
  let firstCalls = 0, secondCalls = 0;
  const f = await fixture(pool, { beforePrepare: gate.wait, analyze(obs, policy) {
    if (obs.seat !== 0) firstCalls++;
    return analyzeDecision(obs, policy);
  } });
  const replica = new GameService(pool, { analyze(obs, policy) {
    secondCalls++;
    const analysis = analyzeDecision(obs, policy);
    return { ...analysis, action: obs.legalActions.at(-1)! };
  } });
  const body = envelope(f.view);
  const pending = f.service.prepare(f.context, body);
  await gate.entered;
  // A separate owner request can finish while the prepared computation is paused.
  await replica.account(f.context);
  await assert.rejects(replica.prepare(f.context, envelope(f.view)), code('SERVICE_UNAVAILABLE'));
  assert.equal(secondCalls, 0);
  gate.release();
  const ready = await pending;
  const original = (await pool.query('SELECT * FROM jobs WHERE id=$1', [ready.preparedDecisionId])).rows[0];
  assert.deepEqual(await replica.prepare(f.context, envelope(f.view)), ready);
  assert.deepEqual(await replica.prepare(f.context, body), ready);
  assert.deepEqual((await pool.query('SELECT * FROM jobs WHERE id=$1', [ready.preparedDecisionId])).rows[0], original);
  assert.equal(firstCalls, 1); assert.equal(secondCalls, 0);
  const advance = { ...envelope(f.view), kind: 'bot' as const, preparedDecisionId: ready.preparedDecisionId };
  const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? replica : f.service).advance(f.context, advance)));
  for (const response of responses) assert.deepEqual(response, responses[0]);
  const game = await stored(pool, f.view.game.id);
  assert.equal(game.revision, f.view.revision + 1);
  assert.deepEqual(game.document.botDecisionAudits![f.view.decisionId]!.analysis, original.result.analysis);
  assert.deepEqual(await replica.prepare(f.context, body), ready);
  assert.equal((await pool.query('SELECT 1 FROM jobs WHERE game_id=$1 AND revision=$2', [f.view.game.id, f.view.revision])).rowCount, 1);
});

test('SYS-04: ready legacy action-only singleton retains forced provenance without recomputation', async t => {
  const pool = await testDatabase(t); if (!pool) return;
  const f = await fixture(pool);
  const game = await stored(pool, f.view.game.id);
  // Reach an actual forced bot choice through legal reducers, preserving its journal.
  let choices = legalActions(game.document.state, game.document.state.turn!);
  for (let step = 0; (game.document.state.turn === 0 || choices.length !== 1) && step < 100; step++) {
    if (game.document.state.phase === 'trick-end') {
      game.document.state = collectTrick(game.document.state);
      game.document.actions.push({ kind: 'collect' });
    } else {
      const action = choices[0]!;
      if (action.kind === 'pass') throw new Error('The Spades fixture cannot enter sealed passing.');
      game.document.state = apply(game.document.state, action);
      game.document.actions.push({ kind: 'action', action });
    }
    game.revision++;
    choices = game.document.state.turn === null ? [] : legalActions(game.document.state, game.document.state.turn);
  }
  assert.equal(choices.length, 1);
  assert.notEqual(game.document.state.turn, 0);
  await pool.query('UPDATE games SET revision=$1,document=$2 WHERE id=$3', [game.revision, game.document, f.view.game.id]);
  const id = randomUUID();
  await pool.query(`INSERT INTO jobs(id,player_id,game_id,revision,access_generation,status,result,expires_at)
    VALUES($1,$2,$3,$4,1,'ready',$5,clock_timestamp()+interval '10 minutes')`, [id, f.owner, f.view.game.id, game.revision, choices[0]]);
  const original = (await pool.query('SELECT * FROM jobs WHERE id=$1', [id])).rows[0];
  const replica = new GameService(pool, { analyze() { throw new Error('Cached legacy decision must not compute.'); } });
  const receipt = await replica.prepare(f.context, { ...envelope(f.view), expectedRevision: game.revision });
  assert.equal(receipt.source, 'forced');
  assert.equal(receipt.preparedDecisionId, id);
  assert.deepEqual((await pool.query('SELECT * FROM jobs WHERE id=$1', [id])).rows[0], original);
});

for (const interruption of ['revoke/regrant', 'control', 'replacement', 'revision', 'expiry'] as const)
  test(`SYS-04: ${interruption} during preparation cannot publish old work or an audit`, async t => {
    const pool = await testDatabase(t); if (!pool) return;
    const gate = barrier(); t.after(gate.release);
    const f = await fixture(pool, { beforePrepare: gate.wait });
    const original = await stored(pool, f.view.game.id);
    const pending = f.service.prepare(f.context, envelope(f.view));
    const rejected = assert.rejects(pending);
    await gate.entered;
    const replica = new GameService(pool);
    if (interruption === 'revoke/regrant') {
      await pool.query('UPDATE players SET access_generation=access_generation+1 WHERE id=$1', [f.owner]);
      await pool.query('UPDATE players SET access_generation=access_generation+1 WHERE id=$1', [f.owner]);
    } else if (interruption === 'control') {
      await replica.control({ ...f.context, tab: randomUUID() }, envelope(f.view));
    } else if (interruption === 'replacement') {
      await replica.newSession(f.context, { commandId: randomUUID(), mode: 'hearts', expectedActiveGameId: f.view.game.id });
    } else if (interruption === 'revision') {
      await pool.query('UPDATE games SET revision=revision+1 WHERE id=$1', [f.view.game.id]);
    } else {
      await pool.query("UPDATE preparation_attempts SET expires_at=now()-interval '1 second' WHERE game_id=$1", [f.view.game.id]);
    }
    const afterInterruption = await stored(pool, f.view.game.id);
    gate.release(); await rejected;
    assert.deepEqual(await stored(pool, f.view.game.id), afterInterruption);
    assert.deepEqual(afterInterruption.document.botDecisionAudits, original.document.botDecisionAudits);
    assert.equal((await pool.query('SELECT 1 FROM jobs WHERE game_id=$1', [f.view.game.id])).rowCount, 0);
    assert.equal((await pool.query("SELECT 1 FROM preparation_attempts WHERE game_id=$1 AND status='ready'", [f.view.game.id])).rowCount, 0);
  });

test('SYS-04: expired claim is reclaimed; late first worker cannot replace the second result', async t => {
  const pool = await testDatabase(t); if (!pool) return;
  const gate = barrier(); t.after(gate.release);
  const f = await fixture(pool, { beforePrepare: gate.wait });
  const pending = f.service.prepare(f.context, envelope(f.view));
  const rejected = assert.rejects(pending, code('STALE_REVISION'));
  await gate.entered;
  await pool.query("UPDATE preparation_attempts SET expires_at=now()-interval '1 second' WHERE game_id=$1", [f.view.game.id]);
  const replica = new GameService(pool, { analyze(obs, policy) {
    return { ...analyzeDecision(obs, policy), action: obs.legalActions.at(-1)! };
  } });
  const ready = await replica.prepare(f.context, envelope(f.view));
  const original = (await pool.query('SELECT * FROM jobs WHERE id=$1', [ready.preparedDecisionId])).rows[0];
  gate.release(); await rejected;
  assert.deepEqual((await pool.query('SELECT * FROM jobs WHERE id=$1', [ready.preparedDecisionId])).rows[0], original);
  assert.equal(original.result.action.bid, 13);
});

test('SYS-04: a claim expiring while publication waits for the player lock cannot publish', async t => {
  const pool = await testDatabase(t); if (!pool) return;
  const compute = barrier(), publication = barrier();
  t.after(() => { compute.release(); publication.release(); });
  const f = await fixture(pool, { beforePrepare: compute.wait });
  const before = await stored(pool, f.view.game.id);
  const body = envelope(f.view);
  const pending = f.service.prepare(f.context, body);
  const rejected = assert.rejects(pending, code('STALE_REVISION'));
  await compute.entered;
  const claim = (await pool.query<{ id: string }>("SELECT id FROM preparation_attempts WHERE game_id=$1 AND status='computing'", [f.view.game.id])).rows[0]!;
  const blocker = await pool.connect();
  let activeBlock = false;

  // Pause the second post-computation player lock: the first is receipt lookup,
  // the second is the publication transaction whose start time must not grant TTL.
  let locks = 0, publicationPid = 0;
  const seen = new WeakSet<PoolClient>();
  const connect = pool.connect.bind(pool) as (...args: unknown[]) => unknown;
  const watch = (client: PoolClient) => {
    if (seen.has(client)) return client;
    seen.add(client);
    const query = client.query.bind(client) as (...args: unknown[]) => unknown;
    (client as unknown as { query: (...args: unknown[]) => unknown }).query = (...args) => {
      if (typeof args[0] === 'string' && args[0].startsWith('SELECT * FROM players ') && ++locks === 2)
        return (async () => {
          const result = await query('SELECT pg_backend_pid() AS pid') as { rows: { pid: number }[] };
          publicationPid = result.rows[0]!.pid;
          await publication.wait();
          return query(...args);
        })();
      return query(...args);
    };
    return client;
  };
  (pool as unknown as { connect: (...args: unknown[]) => unknown }).connect = (...args) =>
    args.length ? connect(...args) : (connect() as Promise<PoolClient>).then(watch);
  try {
    compute.release();
    await publication.entered;
    await blocker.query('BEGIN'); activeBlock = true;
    await blocker.query('SELECT id FROM players WHERE id=$1 FOR UPDATE', [f.owner]);
    await pool.query("UPDATE preparation_attempts SET expires_at=clock_timestamp()+interval '200 milliseconds' WHERE id=$1", [claim.id]);
    publication.release();
    let blocked = false;
    for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
      blocked = Boolean((await pool.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'", [publicationPid])).rowCount);
      if (!blocked) await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(blocked, true, 'publication must actually wait for the PostgreSQL player lock');
    await pool.query(`SELECT pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM (expires_at-clock_timestamp())))+0.03)
      FROM preparation_attempts WHERE id=$1`, [claim.id]);
    await blocker.query('COMMIT'); activeBlock = false;
    await rejected;
    assert.deepEqual(await stored(pool, f.view.game.id), before);
    assert.equal((await pool.query('SELECT 1 FROM jobs WHERE game_id=$1', [f.view.game.id])).rowCount, 0);
    assert.equal((await pool.query('SELECT 1 FROM commands WHERE player_id=$1 AND command_id=$2', [f.owner, body.commandId])).rowCount, 0);
  } finally {
    if (activeBlock) await blocker.query('ROLLBACK');
    blocker.release();
  }
});

for (const invalidate of ['expiry', 'access', 'control'] as const)
  test(`SYS-04: ${invalidate} creates a fresh receipt, retaining the original result and expiry`, async t => {
    const pool = await testDatabase(t); if (!pool) return;
    const f = await fixture(pool);
    const first = await f.service.prepare(f.context, envelope(f.view));
    const original = (await pool.query('SELECT * FROM preparation_attempts WHERE id=$1', [first.preparedDecisionId])).rows[0];
    let context = f.context, view = f.view;
    if (invalidate === 'expiry') await pool.query("UPDATE jobs SET expires_at=now()-interval '1 second' WHERE id=$1", [first.preparedDecisionId]);
    if (invalidate === 'access') await pool.query('UPDATE players SET access_generation=access_generation+1 WHERE id=$1', [f.owner]);
    if (invalidate === 'control') {
      context = { ...context, tab: randomUUID() };
      view = await f.service.control(context, envelope(view));
    }
    await assert.rejects(f.service.advance(context, { ...envelope(view), kind: 'bot', preparedDecisionId: first.preparedDecisionId }), code('STALE_REVISION'));
    const next = await f.service.prepare(context, envelope(view));
    assert.notEqual(next.preparedDecisionId, first.preparedDecisionId);
    assert.deepEqual((await pool.query('SELECT * FROM preparation_attempts WHERE id=$1', [first.preparedDecisionId])).rows[0], original);
    await assert.rejects(f.service.advance(context, { ...envelope(view), kind: 'bot', preparedDecisionId: first.preparedDecisionId }), code('STALE_REVISION'));
    await f.service.advance(context, { ...envelope(view), kind: 'bot', preparedDecisionId: next.preparedDecisionId });
  });

test('SYS-04: Hearts revoke/regrant during sealed preparation leaves all four passes unapplied', async t => {
  const pool = await testDatabase(t); if (!pool) return;
  const gate = barrier(); t.after(gate.release);
  const f = await fixture(pool, { beforePrepare: gate.wait }, 'hearts');
  const original = await stored(pool, f.view.game.id);
  const pending = f.service.action(f.context, { ...envelope(f.view), action: f.view.game.legalActions[0]! });
  const rejected = assert.rejects(pending, code('STALE_REVISION'));
  await gate.entered;
  await pool.query('UPDATE players SET access_generation=access_generation+2 WHERE id=$1', [f.owner]);
  gate.release(); await rejected;
  assert.deepEqual(await stored(pool, f.view.game.id), original);
  assert.equal((await pool.query('SELECT 1 FROM game_events WHERE game_id=$1', [f.view.game.id])).rowCount, 0);
});

test('SYS-05: accepted action/advice/unlock recover after replacement and expired coverage; new work stays denied', async t => {
  const pool = await testDatabase(t); if (!pool) return;
  const f = await fixture(pool, {}, 'hearts');
  const adviceBody = { ...envelope(f.view), decisionId: f.view.decisionId, requestedLevel: 1 as const };
  const advice = await f.service.advice(f.context, adviceBody);
  const unlockBody = { requestId: randomUUID(), gameId: f.view.game.id, handId: `${f.view.game.id}:1`,
    decisionId: f.view.decisionId, expectedRevision: f.view.revision, requestedLevel: 1 as const,
    controlLeaseToken: f.view.controlLeaseToken };
  const unlock = await f.service.unlock(f.context, unlockBody);
  const body = { ...envelope(f.view), action: f.view.game.legalActions[0]! };
  const accepted = await f.service.action(f.context, body);
  const replaced = await f.service.newSession(f.context, { commandId: randomUUID(), mode: 'hearts', expectedActiveGameId: f.view.game.id });
  await pool.query("UPDATE players SET access_generation=access_generation+1,profile=jsonb_set(profile,'{currentPeriodEnd}',to_jsonb('2000-01-01T00:00:00.000Z'::text)) WHERE id=$1", [f.owner]);
  const original = await stored(pool, replaced.game.id);
  const restarted = new GameService(pool, { analyze() { throw new Error('No computation is allowed during receipt recovery.'); } });
  const otherTab = { ...f.context, tab: randomUUID() };
  assert.deepEqual(await restarted.action(otherTab, body), accepted);
  assert.deepEqual(await restarted.advice(otherTab, adviceBody), advice);
  assert.deepEqual(await restarted.unlock(otherTab, unlockBody), unlock);
  assert.deepEqual(await stored(pool, replaced.game.id), original);
  await assert.rejects(f.service.action(f.context, { ...envelope(replaced), action: replaced.game.legalActions[0]! }), code('FORBIDDEN'));
  await assert.rejects(f.service.action(f.context, { ...body, action: f.view.game.legalActions[1]! }), code('IDEMPOTENCY_CONFLICT'));
  const foreign = { token: await newIdentity(pool), tab: randomUUID() };
  await assert.rejects(f.service.action(foreign, body), code('NOT_FOUND'));
  await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1', [hashToken(f.context.token)]);
  await assert.rejects(f.service.action(f.context, body), code('UNAUTHENTICATED'));
});

test('SYS-05: owned status and ready trial reads survive unsupported current state without disclosing foreign receipts', async t => {
  const pool = await testDatabase(t); if (!pool) return;
  for (const file of ['004-analysis-jobs.sql', '005-analysis-attempt-fence.sql'])
    await pool.query(await readFile(new URL(`../records/migrations/${file}`, import.meta.url), 'utf8'));
  const f = await fixture(pool);
  const body = envelope(f.view);
  await f.service.prepare(f.context, body);
  const trialId = randomUUID();
  const trial: ReviewTrial = { trialId, decisionId: f.view.decisionId, label: 'Possible continuation',
    liveRevision: f.view.revision, frames: [] };
  await pool.query(`INSERT INTO analysis_jobs(id,player_id,game_id,command_id,digest,revision,access_generation,seed,status,result,expires_at)
    VALUES($1,$2,$3,$4,'fixture',0,1,1,'ready',$5,now())`, [randomUUID(), f.owner, f.view.game.id, trialId, trial]);
  const app = await createApp(readConfig({ ...process.env, APP_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL }), pool);
  t.after(() => app.close());
  await pool.query("UPDATE games SET document=jsonb_set(document,'{state,mode}','\"unknown-game\"') WHERE id=$1", [f.view.game.id]);
  const request = (path: string, token = f.context.token) => app.inject({ method: 'GET', url: path,
    headers: { cookie: `tc_session=${token}`, 'x-tricks-tab': f.context.tab } });
  const status = await request(`/api/commands/${body.commandId}`);
  assert.equal(status.statusCode, 200, status.body); assert.deepEqual(status.json(), { status: 'accepted' });
  const unknown = await request(`/api/commands/${randomUUID()}`);
  assert.deepEqual(unknown.json(), { status: 'unknown' });
  const other = await newIdentity(pool);
  assert.deepEqual((await request(`/api/commands/${body.commandId}`, other)).json(), { status: 'unknown' });
  const ready = await request(`/api/review-trials/${trialId}`);
  assert.equal(ready.statusCode, 200, ready.body); assert.deepEqual(ready.json(), trial);
  assert.equal((await request(`/api/review-trials/${trialId}`, other)).statusCode, 404);
  await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1', [hashToken(f.context.token)]);
  assert.equal((await request(`/api/commands/${body.commandId}`)).statusCode, 401);
});

test('SYS-05: owner-only identity survives quarantined state and preserves live session boundaries', async t => {
  const pool = await testDatabase(t); if (!pool) return;
  const f = await fixture(pool);
  const original = await stored(pool, f.view.game.id);
  const app = await createApp(readConfig({ ...process.env, APP_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL }), pool);
  t.after(() => app.close());
  const request = (token?: string, url = '/api/identity', origin?: string) => app.inject({ method: 'GET', url,
    headers: { ...(token ? { cookie: `tc_session=${token}` } : {}), 'x-tricks-tab': f.context.tab,
      ...(origin ? { origin } : {}) } });
  for (const state of [null, { ...original.document.state, mode: 'unknown-game' }]) {
    const quarantined = { ...original.document, state };
    await pool.query('UPDATE games SET document=$1 WHERE id=$2', [quarantined, f.view.game.id]);
    const response = await request(f.context.token);
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { playerId: f.owner });
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['set-cookie'], undefined);
    assert.deepEqual((await stored(pool, f.view.game.id)).document, quarantined);
    assert.equal((await request(f.context.token, '/api/account')).statusCode, 409,
      'the owner-only route must not weaken AccountView validation');
  }
  const other = await newIdentity(pool);
  const otherOwner = (await pool.query<{ player_id: string }>('SELECT player_id FROM sessions WHERE token_hash=$1', [hashToken(other)])).rows[0]!.player_id;
  assert.notEqual(otherOwner, f.owner);
  assert.deepEqual((await request(other)).json(), { playerId: otherOwner });
  assert.equal((await request(other, `/api/identity?playerId=${f.owner}`)).statusCode, 400);
  assert.equal((await request(f.context.token, '/api/identity', 'https://foreign.invalid')).statusCode, 403);
  const count = (await pool.query('SELECT count(*) FROM players')).rows[0];
  assert.equal((await request()).statusCode, 401);
  assert.deepEqual((await pool.query('SELECT count(*) FROM players')).rows[0], count);
  await pool.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [hashToken(f.context.token)]);
  assert.equal((await request(f.context.token)).statusCode, 401);
  await pool.query("UPDATE sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1", [hashToken(other)]);
  assert.equal((await request(other)).statusCode, 401);
});
