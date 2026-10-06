// Scoped native acceptance capture, not a performance comparison.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const out = fileURLToPath(new URL('./', import.meta.url));
const checks = {
  'go-full': ['go', 'test', './server/...', '-count=1', '-json'],
  'go-race': ['go', 'test', './server/...', '-race', '-short', '-count=1', '-json'],
  'go-vet': ['go', 'vet', './server/...'],
  'go-contracts': ['node', 'scripts/m02a-contracts.mjs', '--check'],
  'public-contracts': ['npm', 'run', 'contracts:check'],
  'oracle-check': ['node', 'qa/implementation/multi-game/m04b/generate-reference.ts', '--check'],
  'boundary-check': ['node', 'qa/implementation/multi-game/m04b/generate-boundaries.ts', '--check'],
  'edge-check': ['node', 'qa/implementation/multi-game/m04b/generate-edges.ts', '--check'],
  'node-reference': ['node', '--test', '--test-isolation=none',
    'web/server/tests/module-parity.test.ts',
    'web/server/tests/hearts-module-validation.test.ts',
    'web/server/tests/coach-legacy-parity.test.ts',
    'web/server/tests/frozen-baseline.test.ts'],
};
const name = process.argv[2];
if (!Object.hasOwn(checks, name)) throw Error(`Choose ${Object.keys(checks).join(' | ')}`);
if (process.platform !== 'win32') throw Error('This evidence requires the selected native Windows host.');
const sha = value => createHash('sha256').update(value).digest('hex');
function walk(path) {
  return readdirSync(resolve(root, path), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(`${path}/${entry.name}`) : [`${path}/${entry.name}`]);
}
function sources() {
  const files = [
    'go.mod', 'go.sum', 'package-lock.json', 'scripts/windows-env.mjs', 'scripts/windows-tools.json',
    'scripts/m03-migrations.mjs', 'scripts/m02a-contracts.mjs',
    ...walk('server').filter(p => p.endsWith('.go')),
    ...walk('web/server').filter(p => /\.(ts|json|sql)$/.test(p)),
    ...walk('web/shared').filter(p => /\.(ts|json)$/.test(p)),
    ...walk('web/scripts').filter(p => p.endsWith('.mjs')),
    ...walk(relative(root, out).replaceAll('\\', '/')).filter(p => /\.(mjs|go|ts)$/.test(p) || /corpus.*\.json$/.test(p)),
    'qa/implementation/multi-game/m02a/corpus/original-expectations.json',
  ];
  return [...new Set(files)].sort().map(path => ({ path, sha256: sha(readFileSync(resolve(root, path))) }));
}
const before = sources();
const startedAt = new Date().toISOString(), started = performance.now();
const result = spawnSync(process.execPath, ['scripts/windows-env.mjs', ...checks[name]], {
  cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 << 20,
});
let output = (result.stdout ?? '') + (result.stderr ?? '');
// Never archive a local database password if a driver includes one in a failure.
const credentialsPath = resolve(root, '.local/windows-postgres/credentials.json');
if (existsSync(credentialsPath)) {
  const { password } = JSON.parse(readFileSync(credentialsPath, 'utf8'));
  if (password) output = output.replaceAll(password, '[redacted]');
}
const outputName = `${name}-native.${checks[name].includes('-json') ? 'jsonl' : 'txt'}`;
const sourceUnchanged = JSON.stringify(before) === JSON.stringify(sources());
const report = {
  name, command: `node scripts/windows-env.mjs ${checks[name].join(' ')}`,
  startedAt, completedAt: new Date().toISOString(), elapsedMs: performance.now() - started,
  platform: process.platform, node: process.version, exitCode: result.status,
  signal: result.signal, error: result.error?.code ?? null, sourceUnchanged,
  source: before, sourceSHA256: sha(JSON.stringify(before)),
  output: outputName, outputSHA256: sha(output),
  provider: { mode: 'off', requests: 0, observedModel: null },
};
writeFileSync(resolve(out, outputName), output);
writeFileSync(resolve(out, `${name}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ name, exitCode: result.status, sourceUnchanged, output: outputName,
  elapsedMs: report.elapsedMs, error: report.error }));
if (result.status !== 0 || !sourceUnchanged) process.exitCode = 1;
