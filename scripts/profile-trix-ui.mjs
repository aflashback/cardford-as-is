// Owned production-build listener for Chrome profiling, isolated from the watched owner table.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { runBoundedNative } from './bounded-native-run.mjs';
const [label] = process.argv.slice(2);
if (!['before', 'after'].includes(label) || process.argv.length !== 3) throw Error('Use profile-trix-ui.mjs before|after.');
const database = new URL(process.env.TEST_DATABASE_URL ?? '');
if (process.platform !== 'win32' || database.hostname !== '127.0.0.1' || !database.pathname.endsWith('_test'))
  throw Error('Run through windows-env with the guarded native test database.');
const port = await new Promise((done, fail) => {
  const probe = createServer(); probe.once('error', fail);
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(() => done(port));
  });
});
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, PORT: String(port), APP_ORIGIN: origin };
delete env.CARDFORD_TRIX_FIXTURE_FILE;
const server = spawn(resolve('.local/cardford-ui-dev.exe'), [
  '--migrations', 'web/server/records/migrations', '--web', label === 'before' ? '.local/ui-before-dist' : 'web/dist',
  '--reasoning', 'partner-resources',
], { env, cwd: resolve(import.meta.dirname, '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', data => process.stdout.write(data)); server.stderr.on('data', data => process.stderr.write(data));
const closed = new Promise(done => server.once('close', done));
const stop = () => server.kill();
process.once('SIGINT', stop); process.once('SIGTERM', stop);
try {
  let healthy = false;
  for (let i = 0; i < 100 && server.exitCode === null; i++) {
    try { healthy = (await fetch(`${origin}/api/health`, {signal:AbortSignal.timeout(1000)})).ok; } catch { /* bounded readiness */ }
    if (healthy) break;
    await new Promise(done => setTimeout(done, 200));
  }
  if (!healthy) throw Error('Owned profiling listener did not become ready.');
  const result = await runBoundedNative(process.execPath, ['scripts/profile-card-table.mjs', label, origin], {
    env, cwd: resolve(import.meta.dirname, '..'), milliseconds: 180_000, onData: data => process.stdout.write(data),
  });
  if (result.status !== 'passed') throw Error(`Chrome profile ${result.status}`);
} finally { stop(); await closed; }
