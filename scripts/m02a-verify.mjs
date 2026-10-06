// Local Linux/WSL evidence runner; do not serve its private fixtures to a browser.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import os from 'node:os';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const out = resolve(root, 'qa/implementation/multi-game/m02a');
mkdirSync(out, { recursive: true });
const go = process.env.M02A_GO ?? resolve(root, '.local/m02a-toolchain/go/bin/go');
const env = {
  ...process.env,
  GOTOOLCHAIN: 'local',
  GOMODCACHE: process.env.GOMODCACHE ?? '/tmp/cardford-m02a-modcache',
  GOCACHE: process.env.GOCACHE ?? '/tmp/cardford-m02a-gocache',
};
const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${cmd} failed (${result.status}): ${result.stdout}\n${result.stderr}`);
  return result;
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
const files = [];
for (const base of ['server', 'scripts']) {
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, entry.name);
      if (entry.isDirectory()) visit(p);
      else if (base === 'server' || entry.name.startsWith('m02a-')) files.push(p);
    }
  }
  visit(resolve(root, base));
}
files.push(resolve(root, 'go.mod'), resolve(root, 'go.sum'));
const manifest = () =>
  Object.fromEntries(
    files.sort().map((p) => [relative(root, p).replaceAll('\\', '/'), sha(readFileSync(p))]),
  );
const before = manifest();
if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    'TEST_DATABASE_URL required; use a distinct _test database, never the saved application database',
  );
const tests = run(go, ['test', './server/...', '-count=1', '-json']);
writeFileSync(resolve(out, 'go-tests.jsonl'), tests.stdout);
const events = tests.stdout
  .trim()
  .split('\n')
  .map((s) => JSON.parse(s));
assert(
  !events.some((e) => (e.Action === 'skip' && e.Test) || e.Action === 'fail'),
  'No skipped/failed Go evidence checks allowed',
);
const vet = run(go, ['vet', './server/...']);
const modules = run(go, ['mod', 'verify']);
run(process.execPath, ['scripts/m02a-contracts.mjs', '--check'], {
  env: { ...env, M02A_GOFMT_COMMAND: JSON.stringify([go.replace(/\/go$/, '/gofmt')]) },
});
const corpus = run(process.execPath, ['scripts/m02a-corpus.ts', '--check']);
run(go, ['build', '-o', '.local/m02a-toolchain/m02a', './server/cmd/m02a']);
const native = JSON.parse(run(resolve(root, '.local/m02a-toolchain/m02a'), []).stdout);
const node = JSON.parse(run(process.execPath, ['scripts/m02a-benchmark.ts']).stdout);
assert.deepEqual(native.work, node.work, 'Runtime work/output totals differ');
const measured = [...native.samples, ...node.samples];
const budgets = { wallMs: 10000, processPeakRSSKiB: 256 * 1024 };
const withinBudgets = measured.every(
  (s) => s.wallMs < budgets.wallMs && s.processPeakRSSKiB < budgets.processPeakRSSKiB,
);
assert.deepEqual(manifest(), before, 'Source changed during verification');
const migrations = Object.fromEntries(
  readdirSync('web/server/records/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => [f, sha(readFileSync(`web/server/records/migrations/${f}`))]),
);
assert.equal(Object.keys(migrations).length, 6);
const report = {
  scope: 'Private local M02A seam; no strategy search, providers or production activation',
  baseCommit: 'b476914',
  sourceHashes: before,
  sourceManifestSha256: sha(JSON.stringify(before)),
  migrations,
  hardware: {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model,
    logicalCPUs: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
  checks: {
    goTests: {
      passed: events.filter((e) => e.Action === 'pass' && e.Test).length,
      packages: events.filter((e) => e.Action === 'pass' && !e.Test).length,
      skipped: 0,
      failed: 0,
    },
    vet: vet.status,
    moduleVerification: modules.stdout.trim(),
    contracts: 'checked',
    corpus: JSON.parse(corpus.stdout),
  },
  budgets,
  withinBudgets,
  go: native,
  node,
  limits:
    'Measured replay excludes durable store and unported strategy. Process RSS includes warmup and runtime initialization. This is not a throughput/capacity test.',
};
writeFileSync(resolve(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    goTests: report.checks.goTests,
    work: native.work,
    withinBudgets,
    goWallMs: native.samples.map((s) => s.wallMs),
    nodeWallMs: node.samples.map((s) => s.wallMs),
  }),
);
if (!withinBudgets) process.exitCode = 1;
