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
// The outer native watchdog covers startup, browser descendants and cleanup.
// Leave cleanup time inside the owner's total thirty-minute test-run ceiling.
const harnessDeadline = performance.now() + 1800000;
const cleanupReserveMs = 45000;
const root = fileURLToPath(new URL('../../../../', import.meta.url));
process.chdir(root);
const database = new URL(process.env.TEST_DATABASE_URL);
if (database.hostname !== '127.0.0.1' || database.port !== '54331' || database.pathname !== '/cardford_windows_test')
  throw Error('Requires the isolated native cardford_windows_test database');
const schema = 'cardford_go_local';
const binary = resolve(process.env.CARDFORD_GO_BINARY ?? '.local/m04e-cardford.exe');
const reasoningProfile = process.env.CARDFORD_REASONING_PROFILE ?? 'original';
if (!['original','partner-resources','actor-rollout'].includes(reasoningProfile)) throw Error('Unsupported browser reasoning profile');
const dist = resolve('web/dist');
if (!existsSync(binary) || !existsSync(resolve(dist, 'index.html')))
  throw Error('Build the M04E Go command and React web/dist before browser acceptance');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function buildFiles(folder) {
  return readdirSync(resolve(folder), {withFileTypes:true}).flatMap(entry =>
    entry.isDirectory() ? buildFiles(`${folder}/${entry.name}`) : [{path:`${folder}/${entry.name}`,sha256:sha(readFileSync(resolve(folder,entry.name)))}]);
}
const artifacts = [{path:process.env.CARDFORD_GO_BINARY ?? '.local/m04e-cardford.exe',sha256:sha(readFileSync(binary))},...buildFiles('web/dist')];
if (existsSync('.local/m04e-terminal-fixture.exe')) artifacts.push({
  path:'.local/m04e-terminal-fixture.exe',sha256:sha(readFileSync('.local/m04e-terminal-fixture.exe')),
});
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
  server = spawn(binary, ['--migrations', 'web/server/records/migrations', '--web', 'web/dist', '--reasoning', reasoningProfile, ...(process.env.M04E_CONFIGURED ? ['--access-policy', 'server/internal/access/launch.json'] : [])], {
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
  const browserTimeout = Math.floor(Math.min(1740000, harnessDeadline - performance.now() - cleanupReserveMs));
  if (browserTimeout <= 0) throw Error('Browser test budget expired; acceptance remains pending/unverified');
  browser = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '-c', 'web/playwright.m04e.config.ts', `--global-timeout=${browserTimeout}`, '--max-failures=1', ...(process.env.M04E_GREP ? ['--grep',process.env.M04E_GREP] : [])], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: database.href, CARDFORD_M04E_ORIGIN: origin },
  });
  let browserError;
  browser.on('error', error => { browserError = error.code; });
  const collectBrowser = bytes => {
    if (output.length > 4 << 20) { browser.kill(); return; }
    log(bytes.toString('utf8'));
  };
  browser.stdout.on('data', collectBrowser);
  browser.stderr.on('data', collectBrowser);
  const [status, signal] = await bounded(once(browser, 'close'), browserTimeout + 10000, 'Playwright child');
  assert.equal(browserError, undefined, `Browser spawn failed: ${browserError}`);
  assert.equal(signal, null, `Browser ended by signal ${signal}`);
  assert.equal(status, 0, `Browser acceptance exited ${status}`);
  passed = true;
  log(JSON.stringify({platformBrowser:"passed",provider:"off",backend:"go",policy:process.env.M04E_CONFIGURED ? "configured" : "fixture"}) + "\n");
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
  writeFileSync(resolve(process.env.CARDFORD_BROWSER_LOG ?? '.local/m04e-browser.txt'), output);
  if (!passed) process.exitCode = 1;
}
