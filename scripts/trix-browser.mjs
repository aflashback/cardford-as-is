// Called inside windows-env by the bounded Trix acceptance runner.
// Owns one temporary Go listener and new browser identities on the test database.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const [family = 'all', ...extra] = process.argv.slice(2);
if (extra.length || !['all', 'basic', 'complex', 'twos'].includes(family))
  throw Error('Use trix-browser.mjs [all|basic|complex|twos] through the bounded Trix runner.');
const expectedCases = family === 'all' ? 4 : 2;
if (process.platform !== 'win32' || !process.env.TEST_DATABASE_URL)
  throw Error('Run through scripts/windows-env.mjs with the native test database available.');
const database = new URL(process.env.TEST_DATABASE_URL);
if (database.hostname !== '127.0.0.1' || !database.pathname.endsWith('_test'))
  throw Error('Trix acceptance requires the guarded loopback test database.');
const output = resolve('.local/trix-acceptance');
mkdirSync(output, { recursive: true });
const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, VITE_BACKEND: 'go' };
// This lane verifies normal deals. The private fixture launcher is separate.
delete env.CARDFORD_TRIX_FIXTURE_FILE;
if (family === 'twos') {
  // Trusted startup fixture: owner opens CJ, then pass / C10 / CQ. All four
  // twos stay held, one per seat; normal adjacency must work before reveal.
  const hands = [['H7', 'CJ', 'DJ', 'HJ', 'SJ', 'C9', 'C2'], ['CQ', 'S2'], ['C10', 'H2'], ['D2']];
  const reserved = new Set(hands.flat());
  const available = ['C', 'D', 'H', 'S']
    .flatMap((suit) =>
      ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map((rank) => suit + rank),
    )
    .filter((card) => !reserved.has(card));
  for (const hand of hands) while (hand.length < 13) hand.push(available.shift());
  const fixturePath = resolve(output, 'twos-deals.json');
  writeFileSync(
    fixturePath,
    JSON.stringify({ id: 'trix-twos-opening', deals: Array.from({ length: 20 }, () => hands.flat()) }),
  );
  env.CARDFORD_TRIX_FIXTURE_FILE = fixturePath;
}

async function run(executable, args) {
  const child = spawn(executable, args, { cwd: root, env, windowsHide: true, stdio: 'inherit' });
  const result = await new Promise((done, fail) => {
    child.once('error', fail);
    child.once('exit', (code, signal) => done({ code, signal }));
  });
  if (result.code !== 0) throw Error(`Trix browser command exited ${result.code ?? result.signal}`);
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
    const address = probe.address();
    probe.close(() => done(address.port));
  });
});
const origin = `http://127.0.0.1:${port}`;
env.PORT = String(port);
env.APP_ORIGIN = origin;
env.CARDFORD_TRIX_ORIGIN = origin;
env.CARDFORD_EVIDENCE_DIR = resolve(
  family === 'twos' ? 'qa/implementation/trix/twos' : 'qa/implementation/trix/browser',
);
const server = spawn(
  resolve(output, 'cardford.exe'),
  ['--migrations', 'web/server/records/migrations', '--web', 'web/dist'],
  { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverError;
server.once('error', (error) => {
  serverError = error;
});
server.stdout.on('data', (value) => process.stdout.write(value));
server.stderr.on('data', (value) => process.stderr.write(value));
const closed = new Promise((done) => server.once('close', done));
try {
  const deadline = performance.now() + 30_000;
  let healthy = false;
  while (performance.now() < deadline) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw Error('Owned Trix Go listener exited before becoming ready.');
    try {
      healthy = (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1_000) })).ok;
    } catch {
      /* PostgreSQL startup is bounded by the readiness deadline. */
    }
    if (healthy) break;
    await new Promise((done) => setTimeout(done, 200));
  }
  if (!healthy) throw Error('Owned Trix Go listener did not become ready within 30 seconds.');
  await run(process.execPath, [
    'node_modules/@playwright/test/cli.js',
    'test',
    '-c',
    family === 'twos' ? 'web/playwright.trix-twos-go.config.ts' : 'web/playwright.trix-go.config.ts',
    ...(['all', 'twos'].includes(family) ? [] : ['--grep', `trix-${family}-`]),
  ]);
  const report = JSON.parse(readFileSync(resolve(output, 'browser-report.json'), 'utf8'));
  if (
    !report.stats ||
    report.stats.expected !== expectedCases ||
    report.stats.unexpected ||
    report.stats.skipped ||
    report.stats.flaky
  )
    throw Error('Native browser acceptance requires executed passing cases, without skips or flaky retries.');
  console.log(
    JSON.stringify({
      trixBrowser: { family, passed: report.stats.expected, durationMs: report.stats.duration },
    }),
  );
} finally {
  if (server.exitCode === null) server.kill();
  await closed;
}
