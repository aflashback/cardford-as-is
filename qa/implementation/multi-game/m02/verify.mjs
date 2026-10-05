import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const evidenceRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const root = path.resolve(process.argv[3] ?? evidenceRoot);
const stage = process.argv[2] ?? 'final';
if (!['baseline', 'final'].includes(stage)) throw new Error('Use baseline or final.');
const isolation = process.env.M02_TEST_ISOLATION ?? 'none';
if (!['none', 'process'].includes(isolation)) throw new Error('Use none or process test isolation.');
const testPlatform = process.env.M02_TEST_PLATFORM ?? 'windows';
if (!['windows', 'podman-wsl', 'podman-wsl-native'].includes(testPlatform))
  throw new Error('Use windows, podman-wsl or podman-wsl-native test platform.');
const vm = testPlatform !== 'windows';
const nativeSnapshot =
  testPlatform === 'podman-wsl-native'
    ? JSON.parse(readFileSync(path.join(root, '.local/m02-native-snapshot.json'), 'utf8'))
    : null;
if (nativeSnapshot && !/^\/tmp\/cardford-m02-[A-Za-z0-9-]+\/checkout$/.test(nativeSnapshot.guestRoot))
  throw new Error('Use a task-owned temporary VM checkout.');
const guestRoot = nativeSnapshot?.guestRoot ?? '/mnt/c/repos/test-jev';
const guestNode = '/mnt/c/repos/test-jev/.local/m02-linux-node/node-v24.19.0-linux-x64/bin/node';
const guestPrefix = ['-d', 'podman-machine-default', '--cd', guestRoot, '--', guestNode];
if (vm && root.toLowerCase() !== 'c:\\repos\\test-jev')
  throw new Error('The local test VM route is pinned to this checkout.');
const out = path.join(evidenceRoot, 'qa/implementation/multi-game/m02');
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Git inventory failed.');
  return result.stdout.trim();
};
const digest = (file) =>
  createHash('sha256')
    .update(readFileSync(path.join(root, file)))
    .digest('hex');
const testFiles = ['web/tests', 'web/server/tests']
  .flatMap((directory) =>
    readdirSync(path.join(root, directory))
      .filter((file) => file.endsWith('.test.ts'))
      .map((file) => `${directory}/${file}`),
  )
  .toSorted();
const testManifest = Object.fromEntries(testFiles.map((file) => [file, digest(file)]));
const checkNativeSnapshot = () => {
  const result = spawnSync(process.execPath, ['.local/m02-check-native-snapshot.mjs'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error('Native VM/original source integrity check failed.');
  const integrity = JSON.parse(result.stdout);
  if (
    !integrity.verified ||
    integrity.guestRoot !== nativeSnapshot.guestRoot ||
    integrity.testFileCount !== testFiles.length
  )
    throw new Error('Native VM inventory does not match the selected tests.');
  return integrity;
};
const snapshotBefore = nativeSnapshot ? checkNativeSnapshot() : null;
let guestRuntime;
if (vm) {
  const probe = spawnSync(
    'wsl',
    [
      ...guestPrefix,
      '--env-file=.env.local',
      '--env-file=.local/m00-test.env',
      '--input-type=module',
      '-e',
      "const url = new URL(process.env.TEST_DATABASE_URL); console.log(JSON.stringify({ node: process.version, dedicatedTestDatabase: url.pathname.endsWith('_test') && process.env.TEST_DATABASE_URL !== process.env.DATABASE_URL, expectedDatabase: url.pathname === '/cardford_m00_test' && url.port === '54330', loopback: url.hostname === '127.0.0.1', sourceOverridesAbsent: !process.env.BILLING_BASELINE_ROOT && !process.env.PROVIDER_LEDGER_TEST_ROOT }));",
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  if (probe.status !== 0) throw new Error('Local VM runtime/environment check failed.');
  guestRuntime = JSON.parse(probe.stdout);
  if (
    guestRuntime.node !== process.version ||
    !guestRuntime.dedicatedTestDatabase ||
    !guestRuntime.expectedDatabase ||
    !guestRuntime.loopback ||
    !guestRuntime.sourceOverridesAbsent ||
    digest('.local/node-v24.19.0-linux-x64.tar.xz') !==
      '14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647'
  )
    throw new Error('Local VM acceptance environment does not match the declared route.');
}
const trackedPaths = git(
  'ls-files',
  'web/shared/*.json',
  'web/server/games/*/reasoning/frozen/*',
  'web/server/games/*/reasoning/frozen/**/*',
  'web/server/evaluation/spades-pack/*',
  'qa/experiments/2026-10-04-spades-evaluation-pack/*',
  'qa/experiments/2026-10-04-spades-evaluation-pack/**/*',
)
  .split(/\r?\n/)
  .filter(Boolean);
const archiveHash = createHash('sha256');
for (const file of trackedPaths.toSorted())
  archiveHash.update(file).update('\0').update(digest(file)).update('\n');
const report = {
  stage,
  recordedAt: new Date().toISOString(),
  sourceRevision: git('rev-parse', 'HEAD'),
  sourceTree: git('rev-parse', 'HEAD^{tree}'),
  branch: git('branch', '--show-current'),
  initialChanges: git('status', '--short'),
  worktrees: git('worktree', 'list'),
  node: process.version,
  installed: Object.fromEntries(
    ['typescript', 'react', 'vite', 'fastify', 'pg', 'ajv'].map((name) => {
      const rootFile = path.join(root, 'node_modules', name, 'package.json');
      const file = existsSync(rootFile)
        ? rootFile
        : path.join(root, 'web/node_modules', name, 'package.json');
      return [name, existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).version : null];
    }),
  ),
  hashes: {
    lockfile: digest('package-lock.json'),
    publicSchema: digest('web/shared/contracts.schema.json'),
    publicTypes: digest('web/shared/contracts.ts'),
    frozenAndPilotArchive: archiveHash.digest('hex'),
    archiveFileCount: trackedPaths.length,
  },
  provider: { mode: 'off', requests: 0, observedModel: null },
  testIsolation: isolation,
  testPlatform,
  hostOperatingSystem: process.platform,
  ...(nativeSnapshot ? { snapshotIntegrity: { before: snapshotBefore, after: null } } : {}),
  testSelection: {
    globs: ['web/tests/*.test.ts', 'web/server/tests/*.test.ts'],
    files: testManifest,
    fileCount: testFiles.length,
    manifestSha256: createHash('sha256').update(JSON.stringify(testManifest)).digest('hex'),
  },
  ...(vm
    ? {
        testRuntime: {
          ...guestRuntime,
          distribution: 'podman-machine-default',
          operatingSystem: 'linux',
          runtime: guestNode,
          provenance: 'https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz',
          archiveSha256: digest('.local/node-v24.19.0-linux-x64.tar.xz'),
          database: 'Existing VM loopback test database; .local/m00-test.env; no new listener.',
          sourceLocation: guestRoot,
          filesystem: nativeSnapshot
            ? 'VM-native temporary byte-identical copy'
            : 'Windows checkout mounted via /mnt/c',
          ...(nativeSnapshot
            ? {
                copiedInputs: {
                  sourceFiles: nativeSnapshot.sourceFileCount,
                  sourceManifestSha256: nativeSnapshot.sourceManifestSha256,
                  dependencyEntries: nativeSnapshot.dependencyEntryCount,
                  dependencyManifestSha256: nativeSnapshot.dependencyManifestSha256,
                  dependencyCopyBehavior: nativeSnapshot.dependencyCopyBehavior,
                  environment: nativeSnapshot.environment,
                },
              }
            : {}),
        },
      }
    : {}),
  checks: [],
};
writeFileSync(path.join(out, `${stage}.json`), JSON.stringify(report, null, 2) + '\n');
for (const script of ['contracts:check', 'typecheck', 'test:all', 'build']) {
  const started = Date.now();
  const isolated = script === 'test:all' && isolation === 'process';
  const guest = script === 'test:all' && vm;
  const testArgs = [
    '--env-file=.env.local',
    ...(guest ? ['--env-file=.local/m00-test.env'] : []),
    '--test',
    `--test-isolation=${isolation}`,
    ...(isolation === 'process' ? ['--test-concurrency=1'] : []),
    '--test-reporter=spec',
    'web/tests/*.test.ts',
    'web/server/tests/*.test.ts',
  ];
  const command = guest
    ? `wsl ${[...guestPrefix, ...testArgs].join(' ')}`
    : isolated
      ? `node ${testArgs.join(' ')}`
      : `npm run ${script}`;
  console.log(`${stage}: ${command}`);
  const result = spawnSync(
    guest ? 'wsl' : process.execPath,
    guest
      ? [...guestPrefix, ...testArgs]
      : isolated
        ? testArgs
        : [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'run', script],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  writeFileSync(path.join(out, `${stage}-${script.replaceAll(':', '-')}.log`), output);
  const counts = Object.fromEntries(
    [...output.matchAll(/^ℹ (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)].map((m) => [
      m[1],
      Number(m[2]),
    ]),
  );
  const check = {
    command,
    operatingSystem: guest ? 'linux' : process.platform,
    exitCode: result.status,
    elapsedMs: Date.now() - started,
    counts,
    log: `${stage}-${script.replaceAll(':', '-')}.log`,
  };
  report.checks.push(check);
  if (script === 'test:all' && nativeSnapshot) report.snapshotIntegrity.after = checkNativeSnapshot();
  writeFileSync(path.join(out, `${stage}.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(check));
  if (result.status !== 0) console.log(output.slice(-3500));
}
const fullCheck = report.checks.find((check) => check.command.includes('--test '));
const incompleteGuestRun =
  vm && (!fullCheck || ['fail', 'skipped', 'cancelled', 'todo'].some((key) => fullCheck.counts[key] !== 0));
process.exitCode = report.checks.some((check) => check.exitCode !== 0) || incompleteGuestRun ? 1 : 0;
