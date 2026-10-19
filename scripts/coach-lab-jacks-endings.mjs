// CFL-09: fixed, private native ending comparisons; no browser or model provider.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { collectSourceHashes } from './coach-lab.mjs';
import { preserveBuild, sourceDigest } from './coach-lab-builds.mjs';
import { runBoundedNative } from './bounded-native-run.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const privateRoot = resolve(root, '.local/evaluation/coach-lab/tempo-work');
const sha = value => createHash('sha256').update(value).digest('hex');
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });

export function prepareEndingOutput(path, base = privateRoot) {
  const out = resolve(path), parent = resolve(base);
  assert.equal(dirname(out), parent, 'Output must be a new direct child of the private ending-work directory');
  assert.ok(!existsSync(out), 'Refusing to overwrite existing ending evidence');
  mkdirSync(parent, { recursive: true });
  mkdirSync(out);
  return out;
}

export function assessEndingRun({ build, invocation, sourceUnchanged, study }) {
  return build?.status === 'passed' && invocation?.status === 'passed' && sourceUnchanged === true &&
    study?.schemaVersion === 'trix-jacks-ending-study-1.0.0' && study.status === 'completed' &&
    Array.isArray(study.cases) && study.cases.length > 0 &&
    study.cases.every(c => c.evaluation?.status === 'completed' && c.evaluation.enumerationComplete === true)
    ? 'passed' : 'pending-unverified';
}

export function summarizeEndingCase(c) {
  const e = c.evaluation;
  const summary = { id: c.id, variant: c.variant, objective: e.objective, status: e.status, allocations: e.rows?.length ?? 0, referenceCandidateId: c.referenceCandidateId, comparisons: [] };
  if (e.status !== 'completed' || e.enumerationComplete !== true) return summary;
  assert.ok(e.rows.length > 0, 'Complete comparison requires allocations');
  const actor = c.actorObservation.seat, partner = (actor + 2) % 4;
  assert.ok(Number.isInteger(actor) && actor >= 0 && actor < 4, 'Invalid actor');
  const partners = c.variant.endsWith('-partners');
  assert.equal(e.objective, partners ? 'combined-team-request-points' : 'own-request-points');
  const candidates = e.candidateIds, profiles = e.configuration.profiles.map(p => p.id);
  assert.equal(new Set(candidates).size, candidates.length, 'Duplicate candidate');
  assert.equal(new Set(profiles).size, profiles.length, 'Duplicate profile');
  assert.ok(candidates.includes(c.referenceCandidateId), 'Reference root must be legal');
  assert.ok(candidates.length && profiles.length, 'Missing candidates or profiles');
  const ordinals = new Set();
  for (const allocation of e.rows) {
    assert.ok(!ordinals.has(allocation.ordinal), 'Duplicate allocation ordinal'); ordinals.add(allocation.ordinal);
    assert.deepEqual(allocation.profiles.map(p => p.profileId), profiles, 'Incomplete paired profiles');
    for (const profile of allocation.profiles) {
      assert.deepEqual(profile.roots.map(r => r.candidateId), candidates, 'Incomplete paired root candidates');
      for (const r of profile.roots) {
        assert.deepEqual([...r.finishOrder].sort(), [0, 1, 2, 3], 'Invalid finish order');
        assert.equal(r.seatPoints.length, 4, 'Four seat awards required');
        r.finishOrder.forEach((seat, i) => assert.equal(r.seatPoints[seat], 200 - 50 * i, 'Native finish award mismatch'));
        assert.equal(r.ownPoints, r.seatPoints[actor], 'Own points mismatch');
        if (partners) {
          assert.equal(r.partnerPoints, r.seatPoints[partner], 'Partner points mismatch');
          assert.equal(r.teamPoints, r.ownPoints + r.partnerPoints, 'Team points mismatch');
        } else {
          assert.equal(r.partnerPoints, undefined, 'Solo cannot acquire partner points');
          assert.equal(r.teamPoints, undefined, 'Solo cannot acquire team points');
        }
        assert.equal(r.objectivePoints, partners ? r.teamPoints : r.ownPoints, 'Objective points mismatch');
        assert.ok(Number.isInteger(r.unforcedFutureDecisions) && r.unforcedFutureDecisions >= 0, 'Invalid future-choice count');
      }
    }
  }
  for (const profileId of profiles) for (const candidateId of candidates) {
    const paired = e.rows.map(a => {
      const roots = a.profiles.find(p => p.profileId === profileId).roots;
      return [roots.find(r => r.candidateId === candidateId), roots.find(r => r.candidateId === c.referenceCandidateId)];
    });
    const deltas = paired.map(([a, b]) => a.objectivePoints - b.objectivePoints);
    const average = values => values.reduce((a, b) => a + b, 0) / values.length;
    summary.comparisons.push({ profileId, candidateId, allocations: paired.length,
      meanObjectivePoints: average(paired.map(([a]) => a.objectivePoints)), meanOwnPoints: average(paired.map(([a]) => a.ownPoints)),
      meanPartnerPoints: partners ? average(paired.map(([a]) => a.partnerPoints)) : null,
      minimumDeltaPoints: Math.min(...deltas), maximumDeltaPoints: Math.max(...deltas), meanDeltaPoints: average(deltas),
      worse: deltas.filter(n => n < 0).length, equal: deltas.filter(n => n === 0).length, better: deltas.filter(n => n > 0).length,
      allFutureForced: paired.every(([a, b]) => a.unforcedFutureDecisions === 0 && b.unforcedFutureDecisions === 0)
    });
  }
  return summary;
}

function reportMarkdown(study, summaries, status) {
  const text = value => String(value).replaceAll('|', '/').replaceAll('\n', ' ');
  const number = value => value === null ? '—' : Number(value.toFixed(3));
  const lines = ['# Trix Jacks ending comparisons', '', `Execution: ${status}. Corpus: ${study.schemaVersion}.`, '',
    'Selected reachable diagnostic cases; no prevalence, calibrated probability, complete-session strength or promotion claim. Averages weight compatible remaining allocations equally. Conditional policy results are not optimal-play values. All deltas below use objective points, not score-margin points.', ''];
  for (const c of summaries) {
    lines.push(`## ${text(c.id)} (${text(c.variant)})`, '', `Coverage: ${c.status}; allocations: ${c.allocations}; objective: ${c.objective}; reference root: ${c.referenceCandidateId}.`, '');
    if (!c.comparisons.length) { lines.push('Comparison incomplete/outside scope. No averages or paired ranking are reported.', ''); continue; }
    lines.push('| Continuation | Root | Own average | Partner average | Objective average | Paired delta min / max | Worse / equal / better | All future moves forced |', '| --- | --- | ---: | ---: | ---: | --- | --- | --- |');
    for (const r of c.comparisons) lines.push(`| ${text(r.profileId)} | ${text(r.candidateId)} | ${number(r.meanOwnPoints)} | ${number(r.meanPartnerPoints)} | ${number(r.meanObjectivePoints)} | ${r.minimumDeltaPoints} / ${r.maximumDeltaPoints} | ${r.worse} / ${r.equal} / ${r.better} | ${r.allFutureForced ? 'yes' : 'no'} |`);
    lines.push('');
  }
  lines.push('Full per-allocation finish order, seat awards, native actions, legal-choice counts, passes, board-opening times and placement times remain in study.json. These are hypothetical future diagnostics, not additional facts available to the original actor.', '');
  return lines.join('\n');
}

function snapshot() {
  const hashes = collectSourceHashes();
  for (const path of ['scripts/coach-lab-jacks-endings.mjs', 'scripts/coach-lab-jacks-endings.d.mts', 'web/tests/coach-lab-jacks-endings.test.ts']) hashes[path] = sha(readFileSync(resolve(root, path)));
  return hashes;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') { console.log('node scripts/coach-lab-jacks-endings.mjs --out .local/evaluation/coach-lab/tempo-work/UNUSED-RUN-NAME'); return; }
  assert.ok(args.length === 2 && args[0] === '--out' && args[1], 'Use --out with a new private run directory; see --help');
  const out = prepareEndingOutput(resolve(root, args[1]));
  const before = snapshot(), binary = resolve(out, process.platform === 'win32' ? 'ending-study.exe' : 'ending-study');
  const output = resolve(out, 'study.json');
  const protocol = { schemaVersion: 'trix-jacks-ending-protocol-1.0.0', scope: 'Fixed source-pinned diagnostic corpus; no adaptive extra cases or games', buildWallMs: 300000, studyWallMs: 180000, nativeTest: '^TestJacksEndingStudy$', strengthClaim: false, promotionEligible: false };
  save(resolve(out, 'protocol.json'), protocol); save(resolve(out, 'source-before.json'), before);
  let build = null, invocation = null, study = null, error = null, bundle = null;
  try {
    build = await runBoundedNative(process.execPath, ['scripts/windows-env.mjs', 'go', 'test', '-c', '-o', binary, './server/internal/games/trix'], { cwd: root, milliseconds: protocol.buildWallMs });
    writeFileSync(resolve(out, 'build.log'), build.output, { flag: 'wx' });
    if (build.status === 'passed') {
      const pins = { sourceDigest: sourceDigest(before), binaryDigest: sha(readFileSync(binary)) };
      bundle = preserveBuild(out, root, before, pins, binary);
      invocation = await runBoundedNative(bundle.binaryPath, ['-test.run=^TestJacksEndingStudy$', '-test.v', '-test.timeout=170s'], { cwd: resolve(bundle.sourceRoot, 'server/internal/games/trix'), milliseconds: protocol.studyWallMs, maxBytes: 16 << 20, env: { ...process.env, TRIX_JACKS_ENDING_STUDY_OUTPUT: output } });
      writeFileSync(resolve(out, 'study.log'), invocation.output, { flag: 'wx' });
      if (existsSync(output)) study = JSON.parse(readFileSync(output, 'utf8'));
    }
  } catch (e) { error = String(e); }
  const after = snapshot(), sourceUnchanged = isDeepStrictEqual(before, after);
  save(resolve(out, 'source-after.json'), after);
  let status = assessEndingRun({ build, invocation, sourceUnchanged, study });
  try {
    if (study) {
      const summaries = study.cases.map(summarizeEndingCase);
      save(resolve(out, 'summary.json'), { status, strengthClaim: false, promotionEligible: false, cases: summaries });
      writeFileSync(resolve(out, 'report.md'), reportMarkdown(study, summaries, status), { flag: 'wx' });
    }
  } catch (e) { error = String(e); }
  if (error) status = 'pending-unverified';
  const withoutOutput = value => value && Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'output'));
  save(resolve(out, 'invocation.json'), { schemaVersion: 'trix-jacks-ending-invocation-1.0.0', status, sourceDigest: sourceDigest(before), finalSourceDigest: sourceDigest(after), sourceUnchanged, binaryDigest: existsSync(binary) ? sha(readFileSync(binary)) : null, retainedBuild: bundle, protocol, studyDigest: existsSync(output) ? sha(readFileSync(output)) : null, build: withoutOutput(build), invocation: withoutOutput(invocation), error, strengthClaim: false, promotionEligible: false });
  console.log(JSON.stringify({ output: out, status, sourceUnchanged, error }));
  if (status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
