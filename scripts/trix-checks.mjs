// One process-tree deadline covers every selected build/test step together.
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { runBoundedNative, MAX_TEST_RUN_MS } from './bounded-native-run.mjs';

const root = resolve(import.meta.dirname, '..');
const started = performance.now();
const [lane = 'core', ...options] = process.argv.slice(2);
const checks = {
  contracts: [
    ['node', 'web/scripts/generate-contracts.mjs', '--check'],
    ['node', 'scripts/m02a-contracts.mjs', '--check'],
    ['npm', 'run', 'typecheck'],
  ],
  'ui-unit': [['node', '--test', '--test-isolation=none', 'web/tests/trix-adapter.test.ts']],
  rules: [['go', 'test', './server/internal/games/trix/...', '-count=1', '-timeout=100s', '-json']],
  service: [
    [
      'go',
      'test',
      './server/internal/service',
      './server/internal/records',
      './server/internal/access',
      './server/cmd/cardford',
      '-run',
      '^TestTrix',
      '-count=1',
      '-timeout=220s',
      '-json',
    ],
  ],
  regression: [['node', 'scripts/m04-focused-checks.mjs', 'fast', '--fresh', '--deadline-seconds=240']],
  build: [
    ['npm', 'run', 'build'],
    ['node', 'web/scripts/check-artifacts.mjs'],
  ],
  browser: [['node', 'scripts/trix-browser.mjs']],
  'browser-basic': [['node', 'scripts/trix-browser.mjs', 'basic']],
  'browser-complex': [['node', 'scripts/trix-browser.mjs', 'complex']],
  'browser-twos': [['node', 'scripts/trix-browser.mjs', 'twos']],
};
if (lane === '--list') {
  console.log(
    'core (default): contracts, UI units, full-session rules, service, current-game regression, Go-targeted client build\n' +
      'all: core checks plus the full four-variant native browser campaign (resource gate)\n' +
      Object.keys(checks).join(' | ') +
      '\nOptional --seconds=N (default/max 1800).',
  );
  process.exit(0);
}
if (
  (!['all', 'core'].includes(lane) && !Object.hasOwn(checks, lane)) ||
  options.length > 1 ||
  (options.length && !/^--seconds=\d+$/.test(options[0]))
)
  throw Error(
    'Use node scripts/trix-checks.mjs [core|all|contracts|ui-unit|rules|service|regression|build|browser|browser-basic|browser-complex|browser-twos|--list] [--seconds=1800]',
  );
const budget = options.length ? Number(options[0].slice('--seconds='.length)) * 1000 : MAX_TEST_RUN_MS;
if (budget < 10_000 || budget > MAX_TEST_RUN_MS) throw Error('Trix test budget must be 10–1800 seconds.');
const selected = ['all', 'core'].includes(lane)
  ? Object.entries(checks).filter(([group]) =>
      lane === 'core' ? !group.startsWith('browser') : group !== 'build' && !group.startsWith('browser-'),
    )
  : [[lane, checks[lane]]];
const id = new Date().toISOString().replace(/[:.]/g, '-');
const evidence = resolve(root, `.local/trix-checks/${id}-${lane}`);
mkdirSync(evidence, { recursive: true });
function sourceFiles(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(path) : /\.(go|json|ts|tsx|mjs|css)$/.test(path) ? [path] : [];
  });
}
const fingerprint = () =>
  Object.fromEntries(
    [
      ...['server', 'web/src', 'web/shared', 'web/e2e', 'web/tests', 'web/server', 'scripts'].flatMap(
        sourceFiles,
      ),
      'web/playwright.trix-go.config.ts',
      'web/playwright.trix-twos-go.config.ts',
      'package.json',
      'go.mod',
      'go.sum',
    ]
      .sort()
      .map((path) => [
        path,
        createHash('sha256')
          .update(readFileSync(resolve(root, path)))
          .digest('hex'),
      ]),
  );
const source = fingerprint();
const reports = [];
for (const [group, commands] of selected) {
  for (const args of commands) {
    const remaining = budget - (performance.now() - started);
    if (remaining <= 5_000) {
      process.exitCode = 124;
      break;
    }
    console.log(`Trix ${group}: ${args.join(' ')}`);
    const { output, ...receipt } = await runBoundedNative(
      process.execPath,
      ['scripts/windows-env.mjs', ...args],
      {
        cwd: root,
        env: { ...process.env, VITE_BACKEND: 'go' },
        milliseconds: remaining,
        onData: group.startsWith('browser') ? (value) => process.stdout.write(value) : undefined,
      },
    );
    const log = `${reports.length + 1}-${group}.log`;
    writeFileSync(resolve(evidence, log), output);
    const events = output.split(/\r?\n/).flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
    const passed = events.filter((e) => e.Action === 'pass' && e.Test).length;
    const skipped = events.filter((e) => e.Action === 'skip' && e.Test).map((e) => e.Test);
    const missingTests = args.includes('-json') && passed === 0;
    reports.push({ group, args, ...receipt, log, passed, skipped, missingTests });
    console.log(
      JSON.stringify({
        group,
        status: receipt.status,
        elapsedMs: Math.round(receipt.elapsedMs),
        passed,
        skipped,
        missingTests,
      }),
    );
    if (receipt.status !== 'passed' || skipped.length || missingTests) {
      console.error(output.slice(-10_000));
      process.exitCode = receipt.timedOut ? 124 : 1;
      break;
    }
  }
  if (process.exitCode) break;
}
const sourceUnchanged = JSON.stringify(source) === JSON.stringify(fingerprint());
if (!sourceUnchanged && !process.exitCode) process.exitCode = 1;
const report = {
  startedAt: id,
  lane,
  ceilingMs: budget,
  elapsedMs: performance.now() - started,
  source,
  sourceUnchanged,
  status: process.exitCode === 124 ? 'pending-unverified' : process.exitCode ? 'failed' : 'passed',
  provider: { mode: 'off', calls: 0 },
  reports,
};
writeFileSync(resolve(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ evidence, status: report.status, elapsedMs: Math.round(report.elapsedMs) }));
