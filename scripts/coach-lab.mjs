// LAB-01/03/09/16: one local operator entry point. No live app, database or browser.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runBoundedNative } from './bounded-native-run.mjs';
import { sourceDigest, preserveBuild, resolveBuild } from './coach-lab-builds.mjs';
export { sourceDigest };

const root = fileURLToPath(new URL('../', import.meta.url));
const home = resolve(root, '.local/evaluation/coach-lab');
const binaryPath = resolve(home, process.platform === 'win32' ? 'coachlab.exe' : 'coachlab');
const webRequire = createRequire(new URL('../web/package.json', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/** Pin source bytes, including uncommitted files, without reading private runs or secrets. */
export function collectSourceHashes() {
  const paths = ['go.mod', 'go.sum', 'package.json', 'package-lock.json', 'web/package.json', 'web/tsconfig.json', 'web/tsconfig.server.json', 'scripts/coach-lab.mjs', 'scripts/coach-lab-builds.mjs', 'scripts/coach-lab-study.mjs', 'scripts/windows-env.mjs', 'scripts/windows-tools.json', 'scripts/bounded-native-run.mjs', 'web/scripts/generate-contracts.mjs'];
  const walk = (directory, extensions) => {
    for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isSymbolicLink()) throw Error(`Source symlink is not admitted: ${path}`);
      if (entry.isDirectory()) walk(path, extensions);
      else if (extensions.some(extension => path.endsWith(extension))) paths.push(path);
    }
  };
  walk('server', ['.go', '.json']);
  walk('web/server/evaluation/multi-game', ['.ts', '.mjs', '.md', '.json']);
  walk('contracts/evaluation-lab', ['.json']);
  walk('web/shared', ['.json', '.ts', '.mjs']);
  return Object.fromEntries([...new Set(paths)].sort().map(path => [path, sha(readFileSync(resolve(root, path)))]));
}

export function createDevelopmentManifest({ game = 'spades-partners', runId, familyCount = 1, seed = randomUUID(), sourceHashes, binaryDigest, candidatePolicy, referencePolicy, maxWallMs = 600_000, maxActions = 10_000, maxRounds = 100 }) {
  assert.match(runId, /^[a-z0-9][a-z0-9-]{0,63}$/, 'Use a short lowercase run id');
  assert.ok(Number.isInteger(familyCount) && familyCount >= 1 && familyCount <= 8, 'Development batch supports one to eight families');
  assert.ok(Number.isSafeInteger(maxWallMs) && maxWallMs >= 1 && maxWallMs <= 1_140_000, 'Work cap must be 1-1140000 ms; one minute is reserved for startup and shutdown');
  assert.ok(Number.isInteger(maxActions) && maxActions >= 1 && maxActions <= 10_000, 'Action cap must be 1-10000');
  assert.ok(Number.isInteger(maxRounds) && maxRounds >= 1 && maxRounds <= 100, 'Round cap must be 1-100');
  assert.ok(typeof seed === 'string' && seed.length > 0 && seed.length <= 200, 'A bounded literal seed is required');
  const profiles = {
    'spades-partners': ['spades', 'partners', 'spades-training-1.0.0', 'spades-partner-resource-5.0.0', '5.0.0', 'spades-tactics-2.1.0', '2.1.0', 'spades-partnership-score'],
    'spades-solo': ['spades', 'solo', 'spades-solo-training-1.0.0', 'spades-tactics-2.1.0', '2.1.0', 'spades-tactics-2.1.0', '2.1.0', 'spades-individual-score'],
    'hearts-solo': ['hearts', 'solo', 'hearts-training-1.0.0', 'hearts-baseline-1.0.0', '1.0.0', 'hearts-baseline-1.0.0', '1.0.0', 'hearts-low-penalty'],
  };
  for (const variant of ['basic-solo', 'basic-partners', 'complex-solo', 'complex-partners']) {
    profiles[`trix-${variant}`] = ['trix', variant, `trix-${variant}-${variant.endsWith('partners') ? '1.1.0' : '1.0.0'}`, 'trix-reasoning-1.0.0', '1.0.0', 'trix-deterministic-1.0.0', '1.0.0', variant.endsWith('partners') ? 'trix-team-session-score' : 'trix-individual-session-score'];
  }
  const selected = profiles[game];
  if (!selected) throw Error(`Native lab adapter not installed for ${game}. See the lab coverage table.`);
  const [gameId, variantId, ruleProfileId, defaultCandidate, _candidateVersion, defaultReference, referenceVersion, objective] = selected;
  if (candidatePolicy !== undefined || referencePolicy !== undefined) {
    assert.equal(gameId, 'trix', 'Explicit policy selection is installed for Trix only');
    for (const id of [candidatePolicy, referencePolicy].filter(id => id !== undefined)) assert.ok(['trix-deterministic-1.0.0', 'trix-reasoning-1.0.0', 'trix-history-1.0.0', 'trix-frontier-1.0.0', 'trix-ownership-1.0.0', 'trix-ownership-comparison-1.0.0'].includes(id), 'Uninstalled Trix policy');
  }
  const candidate = candidatePolicy ?? defaultCandidate, reference = referencePolicy ?? defaultReference;
  const moduleVersion = gameId === 'trix' ? '2.2.0' : '2.0.0';
  assert.ok(sourceHashes && Object.keys(sourceHashes).length > 0 && Object.values(sourceHashes).every(h => /^[a-f0-9]{64}$/.test(h)), 'Source byte hashes required');
  assert.match(binaryDigest, /^[a-f0-9]{64}$/);
  const digest = sourceDigest(sourceHashes);
  // The source graph is the transitive code pin; policy/profile IDs distinguish
  // installed interpretations inside that exact binary. No hypothetical hashes.
  const pin = id => ({ id, hash: digest });
  const families = Array.from({ length: familyCount }, (_, i) => ({ id: `${runId}-family-${i + 1}`, split: 'discovery', seed: i === 0 ? seed : `${seed}:family:${i + 1}`, sealed: false }));
  return {
    schemaVersion: gameId === 'trix' ? 'coach-lab-run-2.0.0' : 'coach-lab-run-1.0.0', runId,
    base: {
      schemaVersion: gameId === 'trix' ? 'multi-game-evaluation-2.0.0' : 'multi-game-evaluation-1.0.0', id: runId, purpose: 'development', variant: game,
      ruleProfile: pin(ruleProfileId), candidate: pin(candidate), reference: pin(reference), sourceHashes,
      objective, horizon: 'complete-match', corpus: null, families, rotations: [0],
      seatAssignments: { candidate: [0], reference: [0] }, environments: ['fixed-seat-policies-1.0.0'],
      primaryEstimand: 'Paired complete-match outcome at seat 0; development mechanics only',
      usefulGain: null, maximumHarm: null, powerRationale: null, multiplicityAdjustment: null, sampleSize: null,
      stoppingRule: 'One fixed batch; never extend after inspecting results.',
      missingRunHandling: 'Retain every incomplete/failed paired arm; no strength verdict.',
      maxWallMs, maxDecisionMs: 30_000, maxDecisions: maxActions, promotionAuthority: null,
    },
    lab: {
      sourceIdentity: { sourceDigest: digest, binaryDigest },
      selector: { gameId, variantId, moduleVersion, ruleProfileId }, config: gameId === 'trix' ? { id: runId, variant: variantId } : { id: runId, dealer: 3 },
      seatPolicies: [0, 1, 2, 3].map(seat => ({ seat, id: reference, version: referenceVersion })),
      caps: { maxRounds, maxActions, maxTransitions: 30_000, maxWallMs }, judge: { mode: 'fixture', authorizedUsd: 0 },
      familyRoles: families.map(f => ({ id: f.id, role: 'development' })),
    },
  };
}

function parseOptions(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    assert.ok(/^--[a-z-]+$/.test(key), `Invalid option ${key}`);
    assert.ok(!Object.hasOwn(result, key.slice(2)), `Repeated option ${key}`);
    if (key === '--resume') result.resume = true;
    else { assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), `Missing value for ${key}`); result[key.slice(2)] = args[++i]; }
  }
  return result;
}
async function checked(args, milliseconds = 600_000) {
  const receipt = await runBoundedNative(process.execPath, args, { cwd: root, milliseconds, maxBytes: 16 << 20, onData: value => process.stdout.write(value) });
  const { output, ...summary } = receipt;
  if (receipt.status !== 'passed') throw Error(`Lab command did not pass: ${JSON.stringify(summary)}`);
  return summary;
}

export async function main(args = process.argv.slice(2)) {
  const command = args.shift() ?? 'help';
  if (command === 'help' || command === '--help') {
    console.log('Coach lab (local, headless, paid review off)\n\n  init --run-id ID [--game spades-partners|spades-solo|hearts-solo|trix-basic-solo|trix-basic-partners|trix-complex-solo|trix-complex-partners] [--candidate-policy TRIX_ID] [--reference-policy TRIX_ID] [--families 1] [--seed TEXT]\n    Trix policies: trix-ownership-comparison-1.0.0, trix-ownership-1.0.0, trix-frontier-1.0.0, trix-history-1.0.0, trix-reasoning-1.0.0 or trix-deterministic-1.0.0\n  run --manifest FILE [--out DIRECTORY] [--resume]\n  evaluate --manifest FILE --config FILE [--out DIRECTORY] [--max-decisions 8]\n  audit|estimate|review|export-human|import-human|export-model|import-model|export-gap-review|import-gap-review|calibrate|report|gaps|candidate --manifest FILE [--out DIRECTORY] [--input FILE] [--packet FILE] [--evaluation-config-hash SHA256]\n  check\n\nSee qa/evaluation/coach-lab/README.md.'); return;
  }
  const options = parseOptions(args);
  assert.ok(['init', 'check', 'run', 'evaluate', 'audit', 'estimate', 'review', 'export-human', 'import-human', 'export-model', 'import-model', 'export-gap-review', 'import-gap-review', 'calibrate', 'report', 'gaps', 'candidate'].includes(command), 'Unknown lab command');
  const allowed = command === 'init' ? ['run-id', 'game', 'families', 'seed', 'manifest', 'candidate-policy', 'reference-policy', 'max-wall-ms', 'max-actions', 'max-rounds'] : command === 'check' ? [] : command === 'run' ? ['manifest', 'out', 'resume'] : command === 'evaluate' ? ['manifest', 'out', 'config', 'max-decisions'] : ['manifest', 'out', 'input', 'packet', 'evaluation-config-hash'];
  for (const key of Object.keys(options)) assert.ok(allowed.includes(key), `Unknown option --${key}`);
  if (command === 'init') {
    assert.ok(options['run-id'], '--run-id is required');
    const manifestPath = resolve(root, options.manifest ?? `.local/evaluation/coach-lab/manifests/${options['run-id']}.json`);
    assert.ok(!existsSync(manifestPath), 'Manifest exists; choose a new run id.');
    mkdirSync(dirname(binaryPath), { recursive: true });
    const beforeBuild = sourceDigest(collectSourceHashes());
    await checked(['scripts/windows-env.mjs', 'go', 'build', '-trimpath', '-o', binaryPath, './server/cmd/coachlab'], 300_000);
    const sourceHashes = collectSourceHashes();
    assert.equal(sourceDigest(sourceHashes), beforeBuild, 'Sources changed during build; freeze only after edits settle.');
    const manifest = createDevelopmentManifest({ game: options.game, runId: options['run-id'], familyCount: options.families ? Number(options.families) : 1, seed: options.seed, sourceHashes, binaryDigest: sha(readFileSync(binaryPath)), candidatePolicy: options['candidate-policy'], referencePolicy: options['reference-policy'], maxWallMs: options['max-wall-ms'] ? Number(options['max-wall-ms']) : undefined, maxActions: options['max-actions'] ? Number(options['max-actions']) : undefined, maxRounds: options['max-rounds'] ? Number(options['max-rounds']) : undefined });
    const { freezeLabRun } = await import('../web/server/evaluation/multi-game/lab/freeze.ts');
    freezeLabRun(manifest);
    preserveBuild(home, root, sourceHashes, manifest.lab.sourceIdentity, binaryPath);
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    console.log(`Created private development manifest: ${manifestPath}\nNext: npm run lab:run -- --manifest "${manifestPath}"`);
    return;
  }
  if (command === 'check') {
    const started = performance.now(); const steps = []; const initialSources = sourceDigest(collectSourceHashes());
    const testFiles = ['web/tests', 'web/server/tests'].flatMap(dir => readdirSync(resolve(root, dir)).filter(name => /^(coach-lab-|coach-message-).*\.test\.ts$/.test(name)).map(name => `${dir}/${name}`));
    testFiles.push('web/tests/trix-layout-history-contract.test.ts');
    const commands = [
      ['web/scripts/generate-contracts.mjs', '--check'],
      ['web/server/evaluation/multi-game/lab/generate.mjs', '--check'],
      ['--test', '--test-isolation=none', ...testFiles],
      ['scripts/windows-env.mjs', 'go', 'test', './server/internal/evaluation/coachlab/...', './server/cmd/coachlab', './server/internal/coaching', './server/internal/games/trix', './server/internal/games/spades/reasoning/beliefs/...', './server/internal/games/cardcontinuation', './server/internal/contracts', '-count=1', '-timeout=500s'],
      [webRequire.resolve('typescript/bin/tsc'), '-p', 'web/tsconfig.json'],
      [webRequire.resolve('typescript/bin/tsc'), '-p', 'web/tsconfig.server.json'],
    ];
    let error;
    for (const args of commands) { try { steps.push({ command: ['node', ...args], result: await checked(args, Math.max(1, 600_000 - (performance.now() - started))) }); } catch (e) { error = String(e); steps.push({ command: ['node', ...args], error }); break; } }
    const finalSources = sourceDigest(collectSourceHashes());
    if (initialSources !== finalSources) error = `${error ?? ''} Source files changed during the check; rerun after edits settle.`.trim();
    const path = resolve(home, 'checks', `${new Date().toISOString().replaceAll(':', '-')}.json`); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ status: error ? 'failed' : 'passed', elapsedMs: performance.now() - started, sourceDigest: initialSources, finalSourceDigest: finalSources, steps, error: error ?? null }, null, 2) + '\n', { flag: 'wx' });
    console.log(`Check receipt: ${path}`); if (error) throw Error(error); return;
  }
  assert.ok(options.manifest, '--manifest is required');
  const manifestPath = resolve(root, options.manifest); const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const out = resolve(root, options.out ?? `.local/evaluation/coach-lab/runs/${manifest.runId}`);
  if (command === 'run') {
    const { runLab } = await import('../web/server/evaluation/multi-game/run.ts');
    const bundle = resolveBuild(home, manifest.base.sourceHashes, manifest.lab.sourceIdentity);
    const result = await runLab(manifestPath, out, 'development', { ...bundle, resume: options.resume === true });
    console.log(JSON.stringify(result.receipt, null, 2));
    if (result.exitCode !== 0) throw Error(`Native run returned ${result.exitCode ?? 'no exit status'}; inspect its receipt and preserved journal.`);
  } else if (command === 'evaluate') {
    assert.ok(options.config, '--config is required; start with qa/evaluation/coach-lab/evaluation-smoke.json for Spades.');
    const configPath = resolve(root, options.config); const configBytes = readFileSync(configPath); const config = JSON.parse(configBytes.toString('utf8'));
    const maxDecisions = options['max-decisions'] ? Number(options['max-decisions']) : 8;
    assert.ok(Number.isInteger(maxDecisions) && maxDecisions >= 1 && maxDecisions <= 128, '--max-decisions must be 1-128');
    assert.ok(Number.isInteger(config.maxWallMs) && config.maxWallMs > 0 && config.maxWallMs <= 1_200_000, 'Evaluation wall cap must be 1-1200000 ms');
    const { freezeLabRun } = await import('../web/server/evaluation/multi-game/lab/freeze.ts');
    const { verifyExecutionPins, labWatchdogMilliseconds } = await import('../web/server/evaluation/multi-game/run.ts');
    const { immutableJson } = await import('../web/server/evaluation/multi-game/lab/storage.ts');
    freezeLabRun(manifest);
    const bundle = resolveBuild(home, manifest.base.sourceHashes, manifest.lab.sourceIdentity);
    verifyExecutionPins(manifest, bundle.binaryPath, bundle.sourceRoot);
    assert.ok(existsSync(out), 'Evaluation requires an existing collected archive');
    const startedAt = new Date().toISOString();
    const result = await runBoundedNative(bundle.binaryPath, ['--manifest', manifestPath, '--out', out, '--source-root', bundle.sourceRoot, '--evaluate-config', configPath, '--max-decisions', String(maxDecisions)], { cwd: root, milliseconds: labWatchdogMilliseconds(config.maxWallMs), maxBytes: 16 << 20 });
    const { output, ...watchdog } = result;
    const invocation = { schemaVersion: 'coach-lab-evaluation-invocation-1.0.0', runId: manifest.runId, manifestHash: sha(readFileSync(manifestPath)), configHash: sha(configBytes), maxDecisions, startedAt, watchdog, outputBytes: Buffer.byteLength(output), outputHash: sha(output), modelTokens: 0, providerUsd: 0 };
    immutableJson(resolve(out, 'invocations', `evaluation-${sha(JSON.stringify(invocation))}.json`), invocation);
    if (result.status !== 'passed') throw Error(`Archive evaluation did not pass: ${JSON.stringify(watchdog)}\n${output}`);
    assert.equal(sha(readFileSync(configPath)), sha(configBytes), 'Evaluation config changed during execution');
    verifyExecutionPins(manifest, bundle.binaryPath, bundle.sourceRoot);
    console.log(output.trim());
  } else {
    const phaseArgs = ['web/server/evaluation/multi-game/lab/cli.ts', command, '--manifest', manifestPath, '--out', out];
    for (const key of ['input', 'packet']) if (options[key]) phaseArgs.push(`--${key}`, resolve(root, options[key]));
    if (options['evaluation-config-hash']) phaseArgs.push('--evaluation-config-hash', options['evaluation-config-hash']);
    const startedAt = new Date().toISOString();
    const result = await runBoundedNative(process.execPath, phaseArgs, { cwd: root, milliseconds: 1_200_000, maxBytes: 16 << 20 });
    const { output, ...watchdog } = result;
    const invocation = { schemaVersion: 'coach-lab-phase-invocation-1.0.0', runId: manifest.runId, phase: command, startedAt, watchdog, outputBytes: Buffer.byteLength(output), outputHash: sha(output), providerUsd: 0 };
    const { immutableJson } = await import('../web/server/evaluation/multi-game/lab/storage.ts');
    immutableJson(resolve(existsSync(out) ? out : out + '.phase-invocations', 'phase-invocations', `${command}-${sha(JSON.stringify(invocation))}.json`), invocation);
    if (result.status !== 'passed') throw Error(`Lab ${command} did not pass: ${JSON.stringify(watchdog)}\n${output}`);
    console.log(output.trim());
  }
  console.log(`Lab ${command}: ${out}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
