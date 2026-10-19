// CFL-11: source-bound, actor-only sampled request diagnostics. No runtime policy.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { collectSourceHashes } from './coach-lab.mjs';
import { preserveBuild, sourceDigest } from './coach-lab-builds.mjs';
import { runBoundedNative } from './bounded-native-run.mjs';
import { summarizeEndingCase } from './coach-lab-jacks-endings.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const privateRoot = resolve(root, '.local/evaluation/coach-lab/release-timing-work');
const sha = value => createHash('sha256').update(value).digest('hex');
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const streams = ['timing-primary', 'timing-confirmation'];

export function timingConfiguration() {
  const h = 'trix-history-1.0.0', o = 'trix-ownership-1.0.0';
  const profiles = [];
  for (const [name, x] of [['baseline', 'trix-deterministic-1.0.0'], ['reasoning', 'trix-reasoning-1.0.0']]) {
    profiles.push({ id: `${name}-history`, policies: [h, x, h, x] },
      { id: `${name}-one-ownership`, policies: [o, x, h, x] },
      { id: `${name}-both-ownership`, policies: [o, x, o, x] });
  }
  profiles.push({ id: 'all-history', policies: [h, h, h, h] }, { id: 'all-ownership', policies: [o, o, o, o] });
  return { version: 'trix-jacks-timing-1.0.0', worldsPerStream: 16, maxSamplerOperations: 16000000, maxSteps: 2000000, profiles };
}

/** Allowlist only the original actor packet. Outcome/review fields never enter Go. */
export function bindTimingCase(spec, manifest, decision) {
  assert.match(spec.id, /^[a-z0-9][a-z0-9-]{0,63}$/);
  assert.equal(decision.decisionId, spec.decisionId, 'Wrong archived decision');
  assert.match(spec.inputDigest, /^[a-f0-9]{64}$/);
  assert.equal(decision.inputDigest, spec.inputDigest, 'Changed archive input digest');
  assert.equal(decision.executionStatus, 'committed', 'Only committed archived choices');
  assert.equal(decision.actor, 0, 'Fixed continuation profiles require actor zero');
  assert.equal(decision.phase, 'layout');
  const p = decision.actorPacket, s = manifest.lab?.selector;
  assert.equal(s?.gameId, 'trix');
  assert.ok(['basic-partners', 'complex-partners'].includes(s.variantId));
  assert.equal(s.moduleVersion, '2.2.0');
  assert.equal(s.ruleProfileId, `trix-${s.variantId}-1.1.0`);
  assert.equal(p.publicSchemaVersion, '1.2.0');
  assert.equal(p.gameId, s.gameId); assert.equal(p.variantId, s.variantId);
  assert.equal(p.seat, decision.actor); assert.equal(p.observation.seat, decision.actor);
  assert.equal(p.phase, 'layout'); assert.equal(p.observation.phase, 'layout');
  assert.deepEqual(decision.legalCandidates, p.candidates.map(c => ({ id: c.id, action: c.public })));
  assert.ok(p.candidates.some(c => c.id === spec.referenceCandidateId), 'Reference must be legal');
  assert.ok(decision.episodeId?.startsWith('episode-') && manifest.runId === manifest.base.id, 'Invalid archive identity');
  return { id: spec.id, pin: { ...s, stateSchemaVersion: '1.2.0', observationSchemaVersion: '1.2.0', publicSchemaVersion: '1.2.0', eventSchemaVersion: '1.0.0' }, actorPacket: structuredClone(p), configuration: timingConfiguration() };
}

export async function readTimingDecision(path, decisionId) {
  const hash = createHash('sha256'), input = createReadStream(path);
  input.on('data', bytes => hash.update(bytes));
  const lines = createInterface({ input, crlfDelay: Infinity });
  let match = null, matches = 0, line = 0, selectedLine = 0, recordDigest = null;
  for await (const raw of lines) {
    line++;
    // Do not deserialize unrelated saved observations, outcomes or analysis.
    if (!raw.includes(decisionId)) continue;
    const value = JSON.parse(raw);
    if (value.decisionId !== decisionId) continue;
    match = value; matches++; selectedLine = line; recordDigest = sha(raw);
  }
  assert.equal(matches, 1, 'Named decision must occur exactly once');
  return { decision: match, archiveDigest: hash.digest('hex'), recordDigest, line: selectedLine };
}

export function verifyTimingArchiveBytes(spec, manifestBytes, recordDigest) {
  assert.match(spec.manifestDigest, /^[a-f0-9]{64}$/); assert.match(spec.recordDigest, /^[a-f0-9]{64}$/);
  assert.equal(sha(manifestBytes), spec.manifestDigest, 'Changed pinned archive manifest bytes');
  assert.equal(recordDigest, spec.recordDigest, 'Changed pinned archived decision bytes');
}

function validateTimingRecords(finish, observation) {
  assert.ok(Array.isArray(finish.turns) && Array.isArray(finish.releaseTimes));
  const available = new Map(), placements = new Map();
  const rankNames = ['', '', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  for (const row of observation.board) {
    if (row.low === 0) available.set(`${row.suit}J`, 0);
    else {
      if (row.low > 2) available.set(row.suit + rankNames[row.low - 1], 0);
      if (row.high < 14) available.set(row.suit + rankNames[row.high + 1], 0);
    }
  }
  finish.turns.forEach((turn, index) => {
    assert.equal(turn.offset, index + 1, 'Invalid native turn offset');
    if (turn.action.kind === 'layout-card') {
      assert.ok(!placements.has(turn.action.card), 'Repeated native placement');
      assert.ok(available.has(turn.action.card) && available.get(turn.action.card) < turn.offset, 'Placement without prior availability');
      placements.set(turn.action.card, { card: turn.action.card, seat: turn.seat, firstPlayableOffset: available.get(turn.action.card), placementOffset: turn.offset });
    } else assert.equal(turn.action.kind, 'layout-pass');
    for (const card of turn.newlyPlayable) { assert.ok(!available.has(card), 'Repeated availability'); available.set(card, turn.offset); }
  });
  assert.equal(finish.releaseTimes.length, placements.size, 'Missing placement timing');
  const seen = new Set();
  for (const timing of finish.releaseTimes) {
    assert.ok(!seen.has(timing.card), 'Repeated timing record'); seen.add(timing.card);
    assert.ok(Number.isInteger(timing.firstPlayableOffset) && Number.isInteger(timing.placementOffset));
    assert.ok(timing.firstPlayableOffset >= 0 && timing.firstPlayableOffset < timing.placementOffset && timing.placementOffset <= finish.turns.length);
    assert.deepEqual(timing, placements.get(timing.card), 'Timing must match recorded placement and availability');
  }
}

export function summarizeTimingCase(c, referenceCandidateId) {
  const e = c.evaluation;
  const result = { id: c.id, objective: e.objective, status: e.status, samplingComplete: e.samplingComplete,
    sampledWorlds: e.rows?.length ?? 0, uniqueAllocations: e.uniqueAllocations, repeatedSamples: e.repeatedSamples,
    referenceCandidateId, streams: [] };
  if (e.status !== 'completed' || e.samplingComplete !== true) return result;
  assert.deepEqual(e.streams, streams);
  assert.equal(e.rows.length, 2 * e.configuration.worldsPerStream, 'Incomplete sample');
  assert.equal(new Set(e.rows.map(r => `${r.stream}:${r.ordinal}`)).size, e.rows.length, 'Duplicate sampled ordinal');
  assert.equal(new Set(e.rows.map(r => r.allocationDigest)).size, e.uniqueAllocations, 'Incorrect distinct world count');
  assert.equal(e.repeatedSamples, e.rows.length - e.uniqueAllocations);
  for (const stream of streams) {
    const rows = e.rows.filter(r => r.stream === stream);
    assert.equal(rows.length, e.configuration.worldsPerStream, 'Incomplete stream');
    // Reuse only structural pairing/native-award validation and arithmetic.
    // The synthetic adapter is never persisted as exhaustive enumeration evidence.
    const validated = summarizeEndingCase({ ...c, variant: c.pin.variantId, referenceCandidateId,
      evaluation: { ...e, rows, enumerationComplete: true } });
    for (const row of rows) for (const profile of row.profiles) for (const finish of profile.roots) validateTimingRecords(finish, c.actorObservation);
    const timingChanges = [];
    for (const profile of e.configuration.profiles) for (const candidateId of e.candidateIds) {
      if (candidateId === referenceCandidateId) continue;
      const byCard = new Map();
      for (const row of rows) {
        const roots = row.profiles.find(p => p.profileId === profile.id).roots;
        const chosen = roots.find(r => r.candidateId === candidateId), reference = roots.find(r => r.candidateId === referenceCandidateId);
        for (const timing of chosen.releaseTimes ?? []) {
          const other = reference.releaseTimes?.find(t => t.card === timing.card && t.seat === timing.seat);
          if (!other || !timing.card.endsWith('2')) continue;
          const key = `${timing.seat}:${timing.card}`;
          const total = byCard.get(key) ?? { card: timing.card, seat: timing.seat, samples: 0, availableEarlier: 0, playedEarlier: 0, availabilityDelta: 0, placementDelta: 0 };
          total.samples++; total.availableEarlier += Number(timing.firstPlayableOffset < other.firstPlayableOffset);
          total.playedEarlier += Number(timing.placementOffset < other.placementOffset);
          total.availabilityDelta += timing.firstPlayableOffset - other.firstPlayableOffset;
          total.placementDelta += timing.placementOffset - other.placementOffset; byCard.set(key, total);
        }
      }
      timingChanges.push({ profileId: profile.id, candidateId, twos: [...byCard.values()] });
    }
    result.streams.push({ stream, comparisons: validated.comparisons, timingChanges });
  }
  return result;
}

export function assessTimingRun({ build, invocation, sourceUnchanged, study }) {
  return build?.status === 'passed' && invocation?.status === 'passed' && sourceUnchanged === true &&
    study?.schemaVersion === 'trix-jacks-timing-study-1.0.0' && study.status === 'completed' &&
    Array.isArray(study.cases) && study.cases.length > 0 && study.cases.every(c => c.evaluation?.status === 'completed' && c.evaluation.samplingComplete === true)
    ? 'passed' : 'pending-unverified';
}

function snapshot() {
  const hashes = collectSourceHashes();
  for (const path of ['scripts/coach-lab-jacks-timing.mjs', 'scripts/coach-lab-jacks-timing.d.mts', 'scripts/coach-lab-jacks-endings.mjs', 'web/tests/coach-lab-jacks-timing.test.ts', 'planning/implementation/coach-lab/trix-release-timing.md', 'planning/implementation/coach-lab/trix-release-timing-cases.json']) hashes[path] = sha(readFileSync(resolve(root, path)));
  return hashes;
}

function report(summaries, status) {
  const lines = ['# Sampled Trix Jacks timing diagnostic', '', `Execution: ${status}.`, '',
    'Selected consumed cases; no calibrated probabilities, optimal-play claim, new independent validation or policy promotion. Samples weight constraint-compatible allocations under the declared sampler and fixed continuations. Each stream is reported separately. Deltas are request points, not score margins.', ''];
  for (const c of summaries) {
    lines.push(`## ${c.id}`, '', `${c.status}: ${c.sampledWorlds} sampled worlds; ${c.uniqueAllocations} distinct; ${c.repeatedSamples} repeated. Reference: ${c.referenceCandidateId}.`, '');
    for (const s of c.streams) {
      lines.push(`### ${s.stream}`, '', '| Continuation | Root | Mean team-point delta | Worse / equal / better |', '| --- | --- | ---: | --- |');
      for (const r of s.comparisons) if (r.candidateId !== c.referenceCandidateId) lines.push(`| ${r.profileId} | ${r.candidateId} | ${r.meanDeltaPoints} | ${r.worse} / ${r.equal} / ${r.better} |`);
      lines.push('');
    }
  }
  lines.push('See summary.json for paired two availability/placement changes and study.json for full native hypothetical continuations. Earlier availability does not establish earlier placement or a better team finish.', '');
  return lines.join('\n');
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') { console.log('node scripts/coach-lab-jacks-timing.mjs --out .local/evaluation/coach-lab/release-timing-work/UNUSED-NAME [--cases planning/implementation/coach-lab/trix-release-timing-cases.json]'); return; }
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(['--out', '--cases'].includes(args[i]) && args[i + 1] && !options.has(args[i]), 'Use --out NEW-DIRECTORY [--cases CONFIG]');
    options.set(args[i], args[i + 1]);
  }
  assert.ok(options.has('--out'), 'A new output directory is required');
  const out = resolve(root, options.get('--out'));
  assert.equal(dirname(out), privateRoot, 'Output must be a direct child of private release-timing-work');
  assert.ok(!existsSync(out), 'Refusing to overwrite saved evidence');
  const configPath = resolve(root, options.get('--cases') ?? 'planning/implementation/coach-lab/trix-release-timing-cases.json');
  const configBytes = readFileSync(configPath), config = JSON.parse(configBytes);
  assert.equal(config.schemaVersion, 'trix-jacks-timing-archive-cases-1.0.0');
  assert.ok(Array.isArray(config.cases) && config.cases.length > 0 && config.cases.length <= 8);
  assert.equal(new Set(config.cases.map(c => c.id)).size, config.cases.length);
  const cases = [], provenance = [];
  for (const spec of config.cases) {
    const manifestPath = resolve(root, spec.manifest), decisionsPath = resolve(root, spec.decisions);
    const manifestBytes = readFileSync(manifestPath), bound = await readTimingDecision(decisionsPath, spec.decisionId);
    verifyTimingArchiveBytes(spec, manifestBytes, bound.recordDigest);
    cases.push(bindTimingCase(spec, JSON.parse(manifestBytes), bound.decision));
    provenance.push({ ...spec, manifestDigest: sha(manifestBytes), decisionsDigest: bound.archiveDigest, recordDigest: bound.recordDigest, line: bound.line });
  }
  mkdirSync(out, { recursive: true });
  const before = snapshot(), inputPath = resolve(out, 'actor-input.json'), output = resolve(out, 'study.json');
  const binary = resolve(out, process.platform === 'win32' ? 'timing-study.exe' : 'timing-study');
  const protocol = { schemaVersion: 'trix-jacks-timing-protocol-1.0.0', configDigest: sha(configBytes), provenance, configuration: timingConfiguration(), streams, buildWallMs: 300000, studyWallMs: 300000, strengthClaim: false, promotionEligible: false };
  save(resolve(out, 'protocol.json'), protocol); save(resolve(out, 'source-before.json'), before);
  save(inputPath, { schemaVersion: 'trix-jacks-timing-study-input-1.0.0', cases });
  let build = null, invocation = null, study = null, error = null, bundle = null;
  try {
    build = await runBoundedNative(process.execPath, ['scripts/windows-env.mjs', 'go', 'test', '-c', '-o', binary, './server/internal/games/trix'], { cwd: root, milliseconds: protocol.buildWallMs });
    writeFileSync(resolve(out, 'build.log'), build.output, { flag: 'wx' });
    if (build.status === 'passed') {
      bundle = preserveBuild(out, root, before, { sourceDigest: sourceDigest(before), binaryDigest: sha(readFileSync(binary)) }, binary);
      invocation = await runBoundedNative(bundle.binaryPath, ['-test.run=^TestJacksTimingStudy$', '-test.v', '-test.timeout=290s'], { cwd: resolve(bundle.sourceRoot, 'server/internal/games/trix'), milliseconds: protocol.studyWallMs, maxBytes: 16 << 20, env: { ...process.env, TRIX_JACKS_TIMING_STUDY_INPUT: inputPath, TRIX_JACKS_TIMING_STUDY_OUTPUT: output } });
      writeFileSync(resolve(out, 'study.log'), invocation.output, { flag: 'wx' });
      if (existsSync(output)) study = JSON.parse(readFileSync(output, 'utf8'));
    }
  } catch (e) { error = String(e); }
  const after = snapshot(), sourceUnchanged = isDeepStrictEqual(before, after);
  save(resolve(out, 'source-after.json'), after);
  let status = assessTimingRun({ build, invocation, sourceUnchanged, study });
  try {
    if (study && status === 'passed') {
      assert.deepEqual(study.cases.map(c => c.id), cases.map(c => c.id), 'Changed returned cases');
      study.cases.forEach((c, i) => { assert.deepEqual(c.evaluation.configuration, cases[i].configuration); assert.deepEqual(c.pin, cases[i].pin); assert.deepEqual(c.actorObservation, cases[i].actorPacket.observation); });
      const summaries = study.cases.map((c, i) => summarizeTimingCase(c, config.cases[i].referenceCandidateId));
      save(resolve(out, 'summary.json'), { status, strengthClaim: false, promotionEligible: false, cases: summaries });
      writeFileSync(resolve(out, 'report.md'), report(summaries, status), { flag: 'wx' });
    }
  } catch (e) { error = String(e); }
  if (error) status = 'pending-unverified';
  const withoutOutput = value => value && Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'output'));
  save(resolve(out, 'invocation.json'), { schemaVersion: 'trix-jacks-timing-invocation-1.0.0', status, sourceDigest: sourceDigest(before), finalSourceDigest: sourceDigest(after), sourceUnchanged, inputDigest: sha(readFileSync(inputPath)), binaryDigest: existsSync(binary) ? sha(readFileSync(binary)) : null, retainedBuild: bundle, studyDigest: existsSync(output) ? sha(readFileSync(output)) : null, build: withoutOutput(build), invocation: withoutOutput(invocation), error, strengthClaim: false, promotionEligible: false });
  console.log(JSON.stringify({ output: out, status, sourceUnchanged, error }));
  if (status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
