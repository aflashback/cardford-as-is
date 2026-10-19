import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, cpus, totalmem, release } from 'node:os';

// Run through scripts/windows-env.mjs so the existing native, isolated test DB
// and pinned Go runtime are supplied. No URL, password or raw fixture is saved.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');
const options = { games: 32, clients: 4, rounds: 3 };
for (const arg of process.argv.slice(2)) {
  const match = /^--(games|clients|rounds)=(\d+)$/.exec(arg);
  if (!match) throw Error('Use --games=1..128 --clients=1..8 --rounds=1..4');
  options[match[1]] = Number(match[2]);
}
for (const [name, max] of [['games', 128], ['clients', 8], ['rounds', 4]]) {
  if (!Number.isInteger(options[name]) || options[name] < 1 || options[name] > max) throw Error(`${name} outside bounded range`);
}
if (!process.env.TEST_DATABASE_URL || process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw Error('A separate TEST_DATABASE_URL is required; use scripts/windows-env.mjs node <this script>');
}
const testURL = new URL(process.env.TEST_DATABASE_URL);
const applicationURL = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (testURL.protocol !== 'postgres:' && testURL.protocol !== 'postgresql:') throw Error('PostgreSQL test URL required');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(testURL.hostname) || !/^\/[^/]+_test$/.test(testURL.pathname)) {
  throw Error('Only loopback databases ending _test are allowed');
}
if (applicationURL && testURL.pathname === applicationURL.pathname) {
  throw Error('Test target must differ from the application target');
}
const sourceFiles = [
  'qa/implementation/rally/pause-session-lifecycle/capacity/run.mjs',
  'qa/implementation/rally/pause-session-lifecycle/capacity/pause_capacity_test.go.txt',
  'server/internal/records/realtime_playback.go',
  'server/internal/records/session_lifecycle.go',
  'server/internal/records/session_retention.go',
  'server/internal/records/store.go',
  'server/internal/service/bot_playback.go',
  'server/internal/service/session_lifecycle.go',
  'server/internal/service/realtime.go',
  ...readdirSync(join(root, 'web/server/records/migrations')).filter(name => name.endsWith('.sql')).sort().map(name => `web/server/records/migrations/${name}`),
].filter(path => existsSync(join(root, path)));
const hashSource = path => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map(path => [path, hashSource(path)]));
const hashRecords = () => createHash('sha256').update(readdirSync(join(root, 'server/internal/records')).filter(name => name.endsWith('.go')).sort().map(name => `${name}\0${hashSource(`server/internal/records/${name}`)}`).join('\n')).digest('hex');
const recordsPackageSHA256 = hashRecords();
const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
if (git.status !== 0) throw Error('Cannot identify source checkout');
const temporary = mkdtempSync(join(tmpdir(), 'cardford-pause-capacity-'));
const overlay = join(temporary, 'overlay.json');
let result;
try {
  writeFileSync(overlay, JSON.stringify({ Replace: {
    [join(root, 'server/internal/records/zz_pause_capacity_overlay_test.go')]: join(here, 'pause_capacity_test.go.txt'),
  } }));
  result = spawnSync('go', [
    'test', `-overlay=${overlay}`, './server/internal/records', '-run=^TestPauseCapacityBounded$', '-count=1', '-timeout=100s', '-json',
  ], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 110_000, maxBuffer: 8 << 20,
    env: { ...process.env, CARDFORD_PAUSE_CAPACITY: '1', PAUSE_CAPACITY_GAMES: String(options.games), PAUSE_CAPACITY_CLIENTS: String(options.clients), PAUSE_CAPACITY_ROUNDS: String(options.rounds) },
  });
} finally {
  if (existsSync(overlay)) unlinkSync(overlay);
  rmdirSync(temporary);
}
const clean = value => String(value ?? '').replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-database-url]');
if (result.error || result.status !== 0) {
  process.stderr.write(clean(result.stdout) + clean(result.stderr));
  throw Error(`Bounded lifecycle harness failed${result.error ? `: ${result.error.code}` : `: exit ${result.status}`}; no passing report written`);
}
const changedSources = sourceFiles.filter(path => !existsSync(join(root, path)) || hashSource(path) !== sourceHashes[path]);
if (hashRecords() !== recordsPackageSHA256 || changedSources.some(path => !path.startsWith('server/internal/service/'))) {
  throw Error('Audited source changed during measurement; rerun after implementation settles. No passing report written');
}
const marker = 'PAUSE_CAPACITY_JSON=';
let combinedOutput = '';
for (const line of result.stdout.split(/\r?\n/)) {
  if (!line) continue;
  const event = JSON.parse(line);
  if (event.Output) combinedOutput += event.Output;
}
const markerIndex = combinedOutput.indexOf(marker);
if (markerIndex < 0) throw Error('No measurement emitted; a skipped Go test is not capacity evidence');
const measured = JSON.parse(combinedOutput.slice(markerIndex + marker.length).split(/\r?\n/, 1)[0].trim());
const report = {
  status: 'passed-bounded-records-fixture', recordedAt: new Date().toISOString(),
  source: { head: git.stdout.trim(), sha256: sourceHashes, recordsPackageSHA256, contextServiceFilesChangedDuringRun: changedSources },
  machine: { platform: process.platform, arch: process.arch, osRelease: release(), cpu: cpus()[0]?.model, logicalCPUs: cpus().length, hostRAMBytes: totalmem(), node: process.version },
  ...measured,
  limitations: ['Not an HTTP, WebSocket, bot, coach, browser or production benchmark', 'No per-server capacity or 100000-game claim', 'Burst operations without five-second client pacing', 'Expiry deadlines injected only in a random throwaway test schema', 'Heap metrics describe the Go test process; SQL relation bytes include schema/index overhead', 'SQL statement counts, process CPU, WAL, network and service worker cancellation are not measured'],
};
mkdirSync(join(here, 'evidence'), { recursive: true });
const output = join(here, 'evidence', `${report.recordedAt.replaceAll(/[:.]/g, '-')}-g${options.games}-c${options.clients}.json`);
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ evidence: output, ...report }, null, 2));
