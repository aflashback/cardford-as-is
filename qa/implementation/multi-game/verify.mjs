import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const evidenceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const root = process.argv[3] ? path.resolve(process.argv[3]) : evidenceRoot;
const stage = process.argv[2] ?? 'final';
if (!['baseline', 'final'].includes(stage)) throw new Error('Use baseline or final.');
const out = path.join(evidenceRoot, 'qa/implementation/multi-game');
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Git inventory failed.');
  return result.stdout.trim();
};
const digest = (file) =>
  createHash('sha256')
    .update(readFileSync(path.join(root, file)))
    .digest('hex');
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
  checks: [],
};
writeFileSync(path.join(out, `${stage}.json`), JSON.stringify(report, null, 2) + '\n');
for (const script of ['contracts:check', 'typecheck', 'test:all', 'build']) {
  const started = Date.now();
  console.log(`${stage}: npm run ${script}`);
  const result = spawnSync(
    process.execPath,
    [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'run', script],
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
    command: `npm run ${script}`,
    exitCode: result.status,
    elapsedMs: Date.now() - started,
    counts,
    log: `${stage}-${script.replaceAll(':', '-')}.log`,
  };
  report.checks.push(check);
  writeFileSync(path.join(out, `${stage}.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(check));
  if (result.status !== 0) console.log(output.slice(-3500));
}
process.exitCode = report.checks.some((check) => check.exitCode !== 0) ? 1 : 0;
