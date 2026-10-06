// MG-15 browser acceptance against the compiled native Go service and trusted
// built React assets. Owns only a schema it creates in the separate _test DB.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import pg from 'pg';

if (process.platform !== 'win32') throw Error('Native Windows required');
const root = fileURLToPath(new URL('../../../../', import.meta.url));
process.chdir(root);
const database = new URL(process.env.TEST_DATABASE_URL);
if (database.hostname !== '127.0.0.1' || database.port !== '54331' || database.pathname !== '/cardford_windows_test')
  throw Error('Requires the isolated native cardford_windows_test database');
const schema = 'cardford_go_local';
const binary = resolve('.local/m04d-cardford.exe');
const dist = resolve('web/dist');
if (!existsSync(binary) || !existsSync(resolve(dist, 'index.html')))
  throw Error('Build the M04D Go command and React web/dist before browser acceptance');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function buildFiles(folder) {
  return readdirSync(resolve(folder), {withFileTypes:true}).flatMap(entry =>
    entry.isDirectory() ? buildFiles(`${folder}/${entry.name}`) : [{path:`${folder}/${entry.name}`,sha256:sha(readFileSync(resolve(folder,entry.name)))}]);
}
const artifacts = [{path:'.local/m04d-cardford.exe',sha256:sha(readFileSync(binary))},...buildFiles('web/dist')];
console.log(JSON.stringify({artifacts}));
const db = new pg.Client({
  connectionString: database.href, connectionTimeoutMillis: 5000, query_timeout: 5000,
  options: '-c statement_timeout=5000 -c lock_timeout=1000',
});
const secret = decodeURIComponent(database.password);
const redact = value => String(value).replaceAll(database.href, '[test-database]').replaceAll(secret, '[redacted]');
let output = '', serverLog = '', server, browser, created = false, connected = false, passed = false;
const log = value => { const clean = redact(value); output += clean; process.stdout.write(clean); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bounded(promise, milliseconds, name) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(`${name} exceeded ${milliseconds}ms`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
async function stop(child, name) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'close');
  child.kill(); // Exact spawned child only; no image-wide process termination.
  await bounded(closed, 5000, `${name} shutdown`);
}
async function reservePort() {
  const reservation = createServer();
  const listening = once(reservation, 'listening');
  reservation.listen(0, '127.0.0.1');
  await bounded(listening, 5000, 'loopback port reservation');
  const port = reservation.address().port;
  await bounded(new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve())), 5000, 'port reservation close');
  return port;
}
async function start(origin, port) {
  server = spawn(binary, ['--migrations', 'web/server/records/migrations', '--web', 'web/dist', '--access-policy', 'server/internal/access/launch.json'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: database.href, APP_ENV: 'test', IDENTITY_MODE: 'local-test', BILLING_MODE: 'fixture', JEV_MODE: 'off', JEV_MAX_REQUESTS: '0', HOST: '127.0.0.1', PORT: String(port), APP_ORIGIN: origin },
  });
  let spawnError;
  const collect = bytes => { serverLog += redact(bytes.toString('utf8')); if (serverLog.length > 65536) serverLog = serverLog.slice(-65536); };
  server.stdout.on('data', collect);
  server.stderr.on('data', collect);
  server.on('error', error => { spawnError = error.code; });
  const deadline = performance.now() + 20000;
  while (performance.now() < deadline) {
    if (spawnError || server.exitCode !== null) throw Error(`Go startup failed (${spawnError ?? server.exitCode}): ${serverLog}`);
    try {
      const response = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(500) });
      assert.equal(response.status, 200);
      const health = await response.json();
      assert.equal(health.status, 'ready');
      assert.equal(health.provider, 'off');
      assert.equal(health.identity, 'local-test');
      assert.equal(health.payments, 'fixture');
      log(serverLog);
      return;
    } catch { await delay(100); }
  }
  throw Error(`Go readiness exceeded 20000ms: ${serverLog}`);
}

try {
  await db.connect(); connected = true;
  const current = await db.query('SELECT current_database() AS name');
  assert.equal(current.rows[0].name, 'cardford_windows_test');
  const existing = await db.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema]);
  if (existing.rowCount) throw Error('Refusing to touch an existing cardford_go_local schema');
  // CREATE (without IF NOT EXISTS) establishes ownership even if another
  // process raced the preceding read. A failed CREATE never authorizes DROP.
  await db.query('CREATE SCHEMA cardford_go_local'); created = true;
  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  await start(origin, port);
  log(`Native Go browser origin: ${origin}\n`);
  browser = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '-c', 'web/playwright.m04d.config.ts', '--global-timeout=180000'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: database.href, CARDFORD_M04D_ORIGIN: origin },
  });
  let browserError;
  browser.on('error', error => { browserError = error.code; });
  const collectBrowser = bytes => {
    if (output.length > 4 << 20) { browser.kill(); return; }
    log(bytes.toString('utf8'));
  };
  browser.stdout.on('data', collectBrowser);
  browser.stderr.on('data', collectBrowser);
  const [status, signal] = await bounded(once(browser, 'close'), 195000, 'Playwright child');
  assert.equal(browserError, undefined, `Browser spawn failed: ${browserError}`);
  assert.equal(signal, null, `Browser ended by signal ${signal}`);
  assert.equal(status, 0, `Browser acceptance exited ${status}`);
  // Authored demo requests must create no identity, game, engine preparation,
  // provider attempt, trial, admission, or coached-allowance record.
  const emptyTables = ['players', 'sessions', 'games', 'jobs', 'provider_attempts', 'm04_sessions', 'm04_service_commands', 'm03_games', 'm03_commands', 'm03_work', 'm03_decisions', 'm03_access_trials', 'm03_unit_admissions', 'm03_allowance_charges', 'm04_coaching_unlocks'];
  for (const table of emptyTables) {
    const rows = await db.query(`SELECT count(*)::int AS n FROM cardford_go_local.${table}`);
    assert.equal(rows.rows[0].n, 0, `Demo unexpectedly wrote ${table}`);
  }
  passed = true;
  log(JSON.stringify({ browserDemo: 'passed', provider: 'off', observedModel: null, emptyTables, checks: ['real-Go-listener', 'same-origin-built-React', 'all-authored-edges', 'failed-open-choice-replay', 'reconnect-exact-request', 'delayed-response-after-reload', 'invented-input-rejection', 'zero-live-API', 'zero-persisted-training-provider-allowance-work'] }) + '\n');
} catch (error) {
  log(`Browser demo failed: ${redact(error?.stack ?? error)}\n`);
  if (serverLog && !output.includes(serverLog)) log(serverLog);
  process.exitCode = 1;
} finally {
  try {
    await stop(browser, 'Playwright');
    await stop(server, 'Go listener');
    if (created) {
      await db.query('DROP SCHEMA cardford_go_local CASCADE');
      created = false;
      assert.equal((await db.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema])).rowCount, 0);
      log('Owned test schema dropped after exact child shutdown.\n');
    }
  } catch (error) {
    log(`Cleanup failed: ${redact(error?.stack ?? error)}\n`);
    process.exitCode = 1;
  }
  if (connected) await bounded(db.end(), 5000, 'database client close').catch(error => { log(`Database close failed: ${redact(error)}\n`); process.exitCode = 1; });
  mkdirSync(resolve('.local'), { recursive: true });
  writeFileSync(resolve('.local/m04d-browser.txt'), output);
  if (!passed) process.exitCode = 1;
}
