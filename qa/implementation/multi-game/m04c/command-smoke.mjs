// Native command acceptance. Owns only a newly-created fixed schema in _test.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import pg from 'pg';

if (process.platform !== 'win32') throw Error('Native Windows required');
const url = new URL(process.env.TEST_DATABASE_URL);
if (url.hostname !== '127.0.0.1' || url.port !== '54331' || url.pathname !== '/cardford_windows_test')
  throw Error('Requires isolated native test database');
const db = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000, query_timeout: 5000 });
const schema = 'cardford_go_local';
const binary = resolve('.local/m04c/cardford.exe');
mkdirSync(resolve('.local/m04c'), { recursive: true });
const build = spawnSync('go', ['build', '-o', binary, './server/cmd/cardford'], { encoding: 'utf8', windowsHide: true });
if (build.status !== 0) throw Error('Command build failed: ' + build.stderr);
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((done, reject) => reservation.close(e => e ? reject(e) : done()));
const origin = `http://127.0.0.1:${port}`;
let child, log = '', cookie = '', created = false;
const delay = ms => new Promise(r => setTimeout(r, ms));
async function request(method, path, body) {
  const response = await fetch(origin + path, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Tricks-Client': '1', 'X-Tricks-Tab': 'm04c-command-smoke', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(6000),
  });
  assert.ok([200, 202].includes(response.status), `${method} ${path} failed ${response.status}`);
  const set = response.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return response.json();
}
async function start() {
  child = spawn(binary, ['--migrations', 'web/server/records/migrations'], {
    env: { ...process.env, DATABASE_URL: url.href, HOST: '127.0.0.1', PORT: String(port), APP_ORIGIN: origin },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', b => { log += b; });
  child.stderr.on('data', b => { log += b; });
  child.on('error', e => { log += e.code; });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error('Command exited during startup: ' + log);
    try {
      const health = await request('GET', '/api/health');
      assert.equal(health.provider, 'off');
      assert.equal(health.identity, 'local-test');
      return;
    } catch { await delay(50); }
  }
  throw Error('Command did not become ready: ' + log);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const closed = once(child, 'exit');
  // Windows terminates this child; this intentionally tests recovery after exit,
  // not graceful signal delivery. No active computation remains at this point.
  child.kill();
  await closed;
  child = undefined;
}
try {
  await db.connect();
  const old = await db.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema]);
  if (old.rowCount) throw Error('Refusing to touch an existing local-service test schema');
  created = true;
  await start();
  const identity = await request('POST', '/api/local/session', {});
  assert.ok(identity.playerId);
  const opening = { commandId: 'm04c-command-opening', selector: { gameId: 'hearts', variantId: 'solo', moduleVersion: '2.0.0', ruleProfileId: 'hearts-training-1.0.0' }, expectedActiveGameId: null, expectedRevision: null, controlLeaseToken: null };
  const receipt = await request('POST', '/api/sessions', opening);
  const work = await request('POST', '/api/session/prepare', { gameId: receipt.gameId, expectedRevision: receipt.revision, controlLeaseToken: receipt.controlLeaseToken, purpose: 'coach-advice' });
  let ready;
  for (const id of work.workIds) {
    let completed;
    for (let i = 0; i < 200; i++) {
      completed = await request('GET', '/api/work/' + id);
      if (completed.status === 'completed') break;
      assert.ok(['queued', 'running'].includes(completed.status), 'Preparation rejected');
      await delay(25);
    }
    assert.equal(completed.status, 'completed');
    if (id === work.workId) ready = completed;
  }
  assert.equal(ready.status, 'completed');
  const advice = await request('GET', '/api/decisions/' + ready.decisionId);
  assert.equal(advice.decisionId, ready.decisionId);
  await stop();
  await start();
  assert.deepEqual(await request('POST', '/api/sessions', opening), receipt);
  assert.deepEqual(await request('GET', '/api/decisions/' + ready.decisionId), advice);
  assert.equal((await request('GET', '/api/session')).activeGameId, receipt.gameId);
  await request('POST', '/api/account/delete', {});
  const remaining = await db.query('SELECT count(*)::int AS n FROM cardford_go_local.m04_sessions');
  assert.equal(remaining.rows[0].n, 0);
  console.log(JSON.stringify({ nativeCommand: 'passed', checks: ['startup', 'canonical-migrations', 'opaque-identity', 'durable-opening', 'original-coach-preparation', 'process-restart', 'identical-receipt', 'identical-saved-advice', 'active-session', 'owner-erasure'], provider: 'off', requests: 0 }));
} finally {
  await stop();
  if (created) await db.query('DROP SCHEMA IF EXISTS cardford_go_local CASCADE');
  await db.end();
}
