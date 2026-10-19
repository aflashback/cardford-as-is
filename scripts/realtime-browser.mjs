// Focused actual-browser acceptance; owns only a loopback listener and test identities.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
const root = resolve(import.meta.dirname, '..');
process.chdir(root);
if (process.platform !== 'win32' || !process.env.TEST_DATABASE_URL) throw Error('Run through windows-env.');
const database = new URL(process.env.TEST_DATABASE_URL);
if (database.hostname !== '127.0.0.1' || !database.pathname.endsWith('_test'))
  throw Error('Isolated test database required.');
const output = resolve('.local/realtime-acceptance');
mkdirSync(output, { recursive: true });
const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, VITE_BACKEND: 'go' };
delete env.CARDFORD_REALTIME;
delete env.CARDFORD_TRIX_FIXTURE_FILE;
async function run(exe, args) {
  const child = spawn(exe, args, { cwd: root, env, windowsHide: true, stdio: 'inherit' });
  const code = await new Promise((done, fail) => {
    child.once('error', fail);
    child.once('exit', done);
  });
  if (code !== 0) throw Error(`Realtime browser step exited ${code}`);
}
await run('go', ['build', '-o', resolve(output, 'cardford.exe'), './server/cmd/cardford']);
await run(process.execPath, [
  resolve(process.execPath, '../node_modules/npm/bin/npm-cli.js'),
  'run',
  'build',
]);
const port = await new Promise((done, fail) => {
  const probe = createServer();
  probe.once('error', fail);
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(() => done(port));
  });
});
const origin = `http://127.0.0.1:${port}`;
Object.assign(env, { PORT: String(port), APP_ORIGIN: origin, CARDFORD_REALTIME_ORIGIN: origin });
const server = spawn(
  resolve(output, 'cardford.exe'),
  ['--migrations', 'web/server/records/migrations', '--web', 'web/dist'],
  { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
server.stdout.on('data', (v) => process.stdout.write(v));
server.stderr.on('data', (v) => process.stderr.write(v));
const closed = new Promise((done) => server.once('close', done));
try {
  let ready = false;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      ready = (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {}
    if (ready) break;
    if (server.exitCode !== null) throw Error('Owned listener exited');
    await new Promise((done) => setTimeout(done, 150));
  }
  if (!ready) throw Error('Owned listener startup timeout');
  await run(process.execPath, [
    'node_modules/@playwright/test/cli.js',
    'test',
    '-c',
    'web/playwright.realtime.config.ts',
  ]);
  const report = JSON.parse(readFileSync(resolve(output, 'browser-report.json'), 'utf8'));
  if (report.stats.expected !== 2 || report.stats.unexpected || report.stats.skipped || report.stats.flaky)
    throw Error('Both browser cases must pass without skips/retries.');
  console.log(JSON.stringify({ realtimeBrowser: report.stats }));
} finally {
  if (server.exitCode === null) server.kill();
  await closed;
}
