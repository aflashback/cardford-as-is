// Offline named-case diagnostic. Only the frozen actor packet enters Go.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { runBoundedNative } from './bounded-native-run.mjs';
import { collectSourceHashes } from './coach-lab.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixturePath = resolve(root, 'server/internal/games/trix/testdata/layout-jacks-jd-s10.json');
const studyRoot = resolve(root, '.local/evaluation/coach-lab/studies/cfl-complex-development-20261009');
const defaultManifest = resolve(studyRoot, 'manifests/cell-b331aaa44576635353f8.json');
const defaultDecisions = resolve(studyRoot, 'runs/cell-b331aaa44576635353f8/exports/aae59bae98b96af3f8d55756/decisions.jsonl');
const sha = value => createHash('sha256').update(value).digest('hex');

export function bindLayoutCase(fixture, manifest, decisions) {
  assert.equal(fixture.schemaVersion, 'trix-layout-case-fixture-1.0.0', 'Unknown named fixture');
  assert.equal(manifest.runId, fixture.runId, 'Wrong archive run');
  const selector = manifest.lab?.selector;
  for (const key of ['gameId', 'variantId', 'moduleVersion', 'ruleProfileId'])
    assert.equal(selector?.[key], fixture.pin[key], `Archived pin mismatch: ${key}`);
  const matches = decisions.filter(d => d.decisionId === fixture.caseId);
  assert.equal(matches.length, 1, 'Named case must be unique');
  const decision = matches[0];
  assert.equal(decision.actor, fixture.actor, 'Actor mismatch');
  assert.equal(decision.revision, fixture.revision, 'Revision mismatch');
  assert.equal(decision.phase, 'layout', 'Wrong phase');
  assert.equal(decision.inputDigest, fixture.archiveInputDigest, 'Archived input digest mismatch');
  assert.equal(decision.policyPin?.id, fixture.originalPolicyId, 'Original policy mismatch');
  assert.equal(decision.selectedCandidateId, fixture.originalCandidateId, 'Original action mismatch');
  assert.deepEqual(decision.actorPacket, fixture.actorPacket, 'Changed frozen actor packet');
  assert.deepEqual(decision.legalCandidates, fixture.actorPacket.candidates.map(c => ({ id: c.id, action: c.public })), 'Changed legal alternative payload');
  // Allowlist; analysis, actual aggregate, outcomes and deal seed are excluded.
  return structuredClone(fixture);
}

function sourceSnapshot() {
  const hashes = collectSourceHashes();
  for (const path of ['scripts/coach-lab-layout-case.mjs', 'scripts/coach-lab-layout-case.d.mts'])
    hashes[path] = sha(readFileSync(resolve(root, path)));
  return hashes;
}

export async function main(args = process.argv.slice(2)) {
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(['--manifest', '--decisions', '--out'].includes(args[i]) && args[i + 1], 'Use --manifest FILE --decisions JSONL --out DIRECTORY');
    assert.ok(!options.has(args[i]), 'Duplicate argument');
    options.set(args[i], args[i + 1]);
  }
  const manifestPath = resolve(options.get('--manifest') ?? defaultManifest);
  const decisionsPath = resolve(options.get('--decisions') ?? defaultDecisions);
  const privateRoot = resolve(root, '.local/evaluation/coach-lab/layout-history-work');
  const out = resolve(options.get('--out') ?? resolve(privateRoot, 'jacks-jd-s10-study'));
  assert.ok(out.startsWith(privateRoot + sep), 'Study output must be a new private directory under layout-history-work');
  assert.ok(!existsSync(out), 'Refusing to overwrite retained study; choose a new output directory');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const decisions = readFileSync(decisionsPath, 'utf8').split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  const input = bindLayoutCase(fixture, manifest, decisions);
  mkdirSync(out, { recursive: true });
  const before = sourceSnapshot();
  const inputPath = resolve(out, 'actor-input.json');
  writeFileSync(inputPath, JSON.stringify(input, null, 2) + '\n');
  writeFileSync(resolve(out, 'source-before.json'), JSON.stringify(before, null, 2) + '\n');
  const binary = resolve(out, 'layout-study.exe');
  const build = await runBoundedNative(process.execPath, ['scripts/windows-env.mjs', 'go', 'test', '-c', '-o', binary, './server/internal/games/trix'], { cwd: root, milliseconds: 300_000 });
  writeFileSync(resolve(out, 'build.log'), build.output);
  let invocation = null;
  if (build.status === 'passed') {
    invocation = await runBoundedNative(binary, ['-test.run=^TestLayoutCaseStudyInvestigate$', '-test.v', '-test.timeout=15m'], {
      cwd: root, milliseconds: 900_000, env: { ...process.env, TRIX_LAYOUT_STUDY_INPUT: inputPath, TRIX_LAYOUT_STUDY_OUTPUT: resolve(out, 'study.json') }, onData: value => process.stdout.write(value)
    });
    writeFileSync(resolve(out, 'study.log'), invocation.output);
  }
  const after = sourceSnapshot();
  const sourceUnchanged = isDeepStrictEqual(before, after);
  writeFileSync(resolve(out, 'source-after.json'), JSON.stringify(after, null, 2) + '\n');
  const withoutOutput = result => result && Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'output'));
  const receipt = { schemaVersion: 'trix-layout-case-invocation-1.0.0', caseId: fixture.caseId, archive: { manifestPath, manifestDigest: sha(readFileSync(manifestPath)), decisionsPath, decisionsDigest: sha(readFileSync(decisionsPath)) }, fixedWork: { worldsPerStream: 32, streams: ['comparison', 'layout-confirmation'], populations: 4, maxSamplerOperations: 16_000_000, maxSteps: 1_000_000, maxWallMs: 900_000 }, inputDigest: sha(readFileSync(inputPath)), binaryDigest: existsSync(binary) ? sha(readFileSync(binary)) : null, nativeCommand: [binary, '-test.run=^TestLayoutCaseStudyInvestigate$', '-test.v', '-test.timeout=15m'], nativeEnvironment: { TRIX_LAYOUT_STUDY_INPUT: inputPath, TRIX_LAYOUT_STUDY_OUTPUT: resolve(out, 'study.json') }, sourceUnchanged, build: withoutOutput(build), invocation: withoutOutput(invocation), status: sourceUnchanged && build.status === 'passed' && invocation?.status === 'passed' ? 'passed' : 'pending-unverified' };
  writeFileSync(resolve(out, 'invocation.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ output: out, status: receipt.status, sourceUnchanged }));
  if (receipt.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
