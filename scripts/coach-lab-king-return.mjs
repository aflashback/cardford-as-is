// CFL-13: actor-bound comparison of a partner return; no runtime selector.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { collectSourceHashes } from './coach-lab.mjs';
import { preserveBuild, resolveBuild, sourceDigest } from './coach-lab-builds.mjs';
import { runBoundedNative } from './bounded-native-run.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const privateRoot = resolve(root, '.local/evaluation/coach-lab/king-return-work');
const archiveRoot = resolve(root, '.local/evaluation/coach-lab/king-scenario-work');
const version = 'trix-king-return-1.0.0';
const archiveDigest = 'cdf334d3a1f1f7aa257421cadaab1404d15a7414f73d44c7ddb2b3382267edf1';
const variants = ['basic-partners', 'complex-partners'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const pin = variant => ({ gameId: 'trix', variantId: variant, moduleVersion: '2.2.0', ruleProfileId: `trix-${variant}-1.1.0`, stateSchemaVersion: '1.2.0', observationSchemaVersion: '1.2.0', publicSchemaVersion: '1.2.0', eventSchemaVersion: '1.0.0' });

export function kingReturnConfiguration() {
  const b = 'trix-deterministic-1.0.0', c = 'trix-ownership-comparison-1.0.0';
  return { worldsPerStream: 16, maxSamplerOperations: 16000000, maxSteps: 200000,
    profiles: [{ id: 'all-baseline', policies: [b, b, b, b] }, { id: 'all-comparison', policies: [c, c, c, c] },
      { id: 'ns-comparison', policies: [c, b, c, b] }, { id: 'ns-baseline', policies: [b, c, b, c] }],
    streams: ['king-return-primary', 'king-return-confirmation'] };
}

/** Only this seat's original observation crosses the native input boundary. */
export function bindKingReturnCase(variant, run) {
  assert.ok(variants.includes(variant));
  assert.equal(run.variant, variant); assert.deepEqual(run.pin, pin(variant));
  assert.equal(run.status, 'completed'); assert.equal(run.arm, 'controlled-HK-double');
  assert.equal(run.profileId, 'trix-deterministic-1.0.0');
  assert.equal(run.witnessId, 'partner-return-to-publicly-known-void');
  const matches = run.actorRecords.filter(r => r.ordinal === 14);
  assert.equal(matches.length, 1); const record = matches[0], o = record.observation;
  assert.equal(record.seat, 2); assert.equal(o.seat, 2); assert.equal(o.turn, 2);
  assert.equal(o.gameId, 'trix'); assert.equal(o.variantId, variant); assert.equal(o.phase, 'playing');
  assert.equal(o.request, variant.startsWith('basic') ? 'king' : 'complex');
  assert.equal(o.tricks.length, 2); assert.deepEqual(o.trick, []); assert.equal(o.hand.length, 11);
  assert.deepEqual(o.handCounts, [11, 11, 11, 11]);
  assert.ok(o.hand.includes('S2') && o.hand.includes('D3'));
  assert.equal(record.policySuggestedCandidateId, 'play:S2'); assert.equal(record.executedCandidateId, 'play:D3');
  // Reject unknown top-level observation fields; Go also rejects nested unknowns.
  const allowed = new Set(['id', 'gameId', 'variantId', 'seat', 'phase', 'turn', 'kingdom', 'dealNumber', 'owner', 'request', 'remainingRequests', 'hand', 'handCounts', 'trick', 'tricks', 'declarations', 'board', 'finishOrder', 'passes', 'ledger', 'withheldBonuses', 'lastExternalLeader', 'totals', 'requestTotals', 'kingdomTotals', 'winners', 'twoAnnouncements', 'layoutHistory']);
  for (const key of Object.keys(o)) assert.ok(allowed.has(key), `Unknown actor field ${key}`);
  const observation = Object.fromEntries(Object.keys(o).map(key => [key, structuredClone(o[key])]));
  return { caseId: `king-return-${variant}`, rulePin: pin(variant), observation, referenceCandidateId: 'play:S2', alternativeCandidateId: 'play:D3' };
}

function validateRoot(r, observation) {
  assert.equal(r.completedTricks, 13); assert.deepEqual(r.withheldBonuses, []);
  const components = { NS: {}, EW: {} }; let kingNet = 0;
  for (const e of r.ledger) {
    assert.ok(Number.isInteger(e.delta)); assert.ok(['king', 'queen', 'diamond', 'trick', 'double-bonus'].includes(e.component));
    assert.ok(['seat', 'competitor'].includes(e.recipient.kind));
    let recipient = e.recipient.competitor;
    if (e.recipient.kind === 'seat') {
      assert.ok(Number.isInteger(e.recipient.seat) && e.recipient.seat >= 0 && e.recipient.seat < 4);
      recipient = e.recipient.seat % 2 === 0 ? 'NS' : 'EW';
    }
    assert.ok(recipient === 'NS' || recipient === 'EW');
    components[recipient][e.component] = (components[recipient][e.component] ?? 0) + e.delta;
    if (recipient === 'NS' && e.card === 'HK') kingNet += e.delta;
  }
  assert.deepEqual(r.componentTotals, components); assert.equal(r.kingNetPoints, kingNet);
  assert.deepEqual(r.requestTotals.map(t => t.id), ['NS', 'EW']);
  for (const t of r.requestTotals) {
    assert.deepEqual(t.seats, t.id === 'NS' ? [0, 2] : [1, 3]);
    assert.equal(t.total, Object.values(components[t.id]).reduce((a, b) => a + b, 0));
  }
  assert.equal(r.teamPoints, r.requestTotals[0].total);
  assert.equal(r.requestTotals[0].total + r.requestTotals[1].total, observation.variantId.startsWith('basic') ? -75 : -500);
  const capture = r.kingCapture, release = r.kingRelease;
  assert.equal(capture.doubled, true); assert.equal(capture.withheld, false);
  assert.ok(Number.isInteger(capture.seat) && capture.seat >= 0 && capture.seat < 4);
  const penalty = r.ledger.filter(e => e.card === 'HK' && e.component === 'king');
  const bonus = r.ledger.filter(e => e.card === 'HK' && e.component === 'double-bonus');
  assert.equal(penalty.length, 1); assert.equal(penalty[0].delta, -150);
  assert.deepEqual(penalty[0].recipient, { kind: 'seat', seat: capture.seat });
  assert.equal(bonus.length, 1); assert.equal(bonus[0].delta, 75);
  assert.deepEqual(bonus[0].recipient, { kind: 'competitor', competitor: capture.seat % 2 === 0 ? 'EW' : 'NS' });
  assert.deepEqual(capture.bonusRecipient, bonus[0].recipient);
  assert.equal(release.seat, 0); assert.equal(release.trick, capture.trick);
  assert.ok(Number.isInteger(release.playOrdinal) && release.playOrdinal >= 9 && release.playOrdinal <= 52);
  assert.equal(release.continuationPlayOrdinal, release.playOrdinal - 8);
  assert.equal(release.trick, Math.floor((release.playOrdinal - 1) / 4) + 1);
  const first = r.firstTrick;
  assert.equal(first.number, 3); assert.equal(first.leader, 2);
  assert.deepEqual(first.plays.map(p => p.seat), [2, 1, 0, 3]);
  assert.equal(`play:${first.plays[0].card}`, r.candidateId);
  assert.equal(new Set(first.plays.map(p => p.card)).size, 4);
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  for (const p of first.plays) assert.match(p.card, /^[CDHS](?:[2-9]|10|J|Q|K|A)$/);
  const winner = first.plays.filter(p => p.card[0] === first.plays[0].card[0]).reduce((a, b) => ranks.indexOf(a.card.slice(1)) > ranks.indexOf(b.card.slice(1)) ? a : b).seat;
  assert.equal(first.winner, winner);
  const immediate = first.plays[2].card === 'HK';
  assert.equal(release.trick === 3, immediate);
  if (immediate) { assert.equal(release.playOrdinal, 11); assert.equal(capture.seat, winner); assert.equal(capture.leader, 2); }
  return { immediate, opponentKingCapture: capture.seat % 2 === 1 };
}

export function summarizeKingReturnCase(result, input, configuration) {
  assert.equal(result.version, version); assert.equal(result.caseId, input.caseId);
  assert.deepEqual(result.rulePin, input.rulePin); assert.deepEqual(result.actorObservation, input.observation);
  assert.equal(result.referenceCandidateId, input.referenceCandidateId); assert.equal(result.alternativeCandidateId, input.alternativeCandidateId);
  assert.equal(result.objective, 'combined-team-request-points');
  assert.match(result.inputDigest, /^[a-f0-9]{64}$/);
  const summary = { caseId: result.caseId, variant: input.rulePin.variantId, status: result.status, sampledWorlds: result.rows.length, uniqueAllocations: result.uniqueAllocations, repeatedSamples: result.repeatedSamples, streams: [] };
  if (result.status !== 'completed' || result.samplingComplete !== true) return summary;
  assert.deepEqual(configuration, kingReturnConfiguration()); assert.deepEqual(result.streams, configuration.streams);
  assert.deepEqual(result.candidateIds, input.observation.hand.map(card => `play:${card}`));
  assert.equal(result.rows.length, 2 * configuration.worldsPerStream);
  assert.equal(result.work.worlds, result.rows.length);
  assert.ok(result.work.steps <= configuration.maxSteps && result.work.samplerOperations <= configuration.maxSamplerOperations);
  assert.equal(result.work.steps, result.rows.length * configuration.profiles.length * result.candidateIds.length * 44);
  assert.equal(new Set(result.rows.map(r => r.allocationDigest)).size, result.uniqueAllocations);
  assert.equal(result.repeatedSamples, result.rows.length - result.uniqueAllocations);
  assert.deepEqual(result.policySelections.map(s => s.profileId), configuration.profiles.map(p => p.id));
  for (const s of result.policySelections) assert.ok(result.candidateIds.includes(s.candidateId));
  for (const stream of configuration.streams) {
    const rows = result.rows.filter(r => r.stream === stream);
    assert.deepEqual(rows.map(r => r.ordinal), Array.from({ length: configuration.worldsPerStream }, (_, i) => i + 1));
    for (const row of rows) {
      assert.match(row.allocationDigest, /^[a-f0-9]{64}$/);
      assert.deepEqual(row.profiles.map(p => p.profileId), configuration.profiles.map(p => p.id));
      for (const profile of row.profiles) {
        assert.deepEqual(profile.roots.map(r => r.candidateId), result.candidateIds);
        for (const r of profile.roots) validateRoot(r, input.observation);
      }
    }
    const comparisons = [];
    for (const p of configuration.profiles) {
      const current = result.policySelections.find(s => s.profileId === p.id).candidateId;
      for (const candidateId of result.candidateIds) {
        let points = 0, king = 0, immediateReleases = 0, opposingCaptures = 0;
        const deltas = [], currentDeltas = [];
        for (const row of rows) {
          const roots = row.profiles.find(r => r.profileId === p.id).roots;
          const candidate = roots.find(r => r.candidateId === candidateId);
          const reference = roots.find(r => r.candidateId === input.referenceCandidateId);
          const selected = roots.find(r => r.candidateId === current);
          points += candidate.teamPoints; king += candidate.kingNetPoints;
          immediateReleases += Number(candidate.firstTrick.plays[2].card === 'HK');
          opposingCaptures += Number(candidate.kingCapture.seat % 2 === 1);
          deltas.push(candidate.teamPoints - reference.teamPoints); currentDeltas.push(candidate.teamPoints - selected.teamPoints);
        }
        comparisons.push({ profileId: p.id, candidateId, currentCandidateId: current, samples: rows.length, meanTeamPoints: points / rows.length,
          meanKingNetPoints: king / rows.length, meanDeltaVsReference: deltas.reduce((a, b) => a + b, 0) / rows.length,
          meanDeltaVsCurrent: currentDeltas.reduce((a, b) => a + b, 0) / rows.length,
          minimumDelta: Math.min(...deltas), maximumDelta: Math.max(...deltas), worse: deltas.filter(n => n < 0).length,
          equal: deltas.filter(n => n === 0).length, better: deltas.filter(n => n > 0).length, immediateReleases, opposingCaptures });
      }
    }
    summary.streams.push({ stream, comparisons });
  }
  return summary;
}

export function assessKingReturnRun({ build, invocation, sourceUnchanged, study }) {
  return build?.status === 'passed' && invocation?.status === 'passed' && sourceUnchanged === true && study?.version === version && study.status === 'completed' && study.cases?.length === 2 && study.cases.every(c => c.status === 'completed' && c.samplingComplete === true) ? 'passed' : 'pending-unverified';
}

function snapshot() {
  const hashes = collectSourceHashes();
  for (const path of ['scripts/coach-lab-king-return.mjs', 'scripts/coach-lab-king-return.d.mts', 'web/tests/coach-lab-king-return.test.ts', 'planning/implementation/coach-lab/trix-king-return.md']) hashes[path] = sha(readFileSync(resolve(root, path)));
  return hashes;
}
function report(cases) {
  const lines = ['# King partner-return comparison', '', 'All legal leads are compared on common feasible hands within each case and stream. Basic and Complex are separate samples. Results depend on the declared continuation policies; they are not calibrated probabilities, optimal-play proof or strength validation.', ''];
  for (const c of cases) {
    lines.push(`## ${c.variant}`, '', `${c.sampledWorlds} sampled worlds, ${c.uniqueAllocations} distinct allocations. Historical reference: 2♠; proposed return: 3♦.`, '',
      '| Stream | Continuation | Current lead | D3 mean team points | D3 − S2 | D3 − current | Worse / equal / better vs S2 | South releases K♥ immediately |',
      '| --- | --- | --- | ---: | ---: | ---: | --- | --- |');
    for (const s of c.streams) for (const r of s.comparisons.filter(r => r.candidateId === 'play:D3')) lines.push(`| ${s.stream} | ${r.profileId} | ${r.currentCandidateId} | ${r.meanTeamPoints} | ${r.meanDeltaVsReference} | ${r.meanDeltaVsCurrent} | ${r.worse} / ${r.equal} / ${r.better} | ${r.immediateReleases} / ${r.samples} |`);
    lines.push('');
  }
  lines.push('summary.json retains every legal lead, profile, stream, observed losses and partner response counts. study.json contains hypothetical public first-trick plays and full native score ledgers. North’s own-hand deductions cannot become facts in South’s coach explanation. No partner discard was forced.', '');
  return lines.join('\n');
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') { console.log('node scripts/coach-lab-king-return.mjs --out .local/evaluation/coach-lab/king-return-work/UNUSED [--source .local/evaluation/coach-lab/king-scenario-work/king-20261010-v3]'); return; }
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) { assert.ok(['--out', '--source'].includes(args[i]) && args[i + 1] && !options.has(args[i])); options.set(args[i], args[i + 1]); }
  assert.ok(options.has('--out')); const out = resolve(root, options.get('--out'));
  assert.equal(dirname(out), privateRoot); assert.ok(!existsSync(out), 'Refusing to overwrite evidence');
  const source = resolve(root, options.get('--source') ?? '.local/evaluation/coach-lab/king-scenario-work/king-20261010-v3');
  assert.equal(dirname(source), archiveRoot);
  const archiveBytes = readFileSync(resolve(source, 'study.json')); assert.equal(sha(archiveBytes), archiveDigest, 'This protocol requires the frozen CFL-12 study');
  const receipt = JSON.parse(readFileSync(resolve(source, 'invocation.json'))), hashes = JSON.parse(readFileSync(resolve(source, 'source-before.json')));
  assert.equal(receipt.status, 'passed'); assert.equal(receipt.sourceUnchanged, true); assert.equal(receipt.studyDigest, archiveDigest);
  assert.equal(receipt.sourceDigest, receipt.finalSourceDigest);
  assert.deepEqual(hashes, JSON.parse(readFileSync(resolve(source, 'source-after.json'))));
  resolveBuild(source, hashes, { sourceDigest: receipt.sourceDigest, binaryDigest: receipt.binaryDigest });
  const archive = JSON.parse(archiveBytes);
  const fixture = archive.cases.filter(c => c.id === 'six-low-hearts-outside-ace-east'); assert.equal(fixture.length, 1);
  const cases = variants.map(variant => {
    const runs = fixture[0].runs.filter(r => r.variant === variant && r.profileId === 'trix-deterministic-1.0.0' && r.arm === 'controlled-HK-double' && r.witnessId === 'partner-return-to-publicly-known-void');
    assert.equal(runs.length, 1); return bindKingReturnCase(variant, runs[0]);
  });
  mkdirSync(out, { recursive: true });
  const before = snapshot(), inputPath = resolve(out, 'actor-input.json'), output = resolve(out, 'study.json');
  const binary = resolve(out, process.platform === 'win32' ? 'king-return.exe' : 'king-return');
  save(inputPath, { version, cases });
  const inputDigest = sha(readFileSync(inputPath));
  const protocol = { version, source, archiveDigest, actorInputDigest: inputDigest, caseIds: cases.map(c => c.caseId), configuration: kingReturnConfiguration(), buildWallMs: 300000, studyWallMs: 300000, maxOutputBytes: 128 << 20, strengthClaim: false, promotionEligible: false };
  save(resolve(out, 'protocol.json'), protocol); save(resolve(out, 'source-before.json'), before);
  let build = null, invocation = null, bundle = null, study = null, error = null;
  try {
    build = await runBoundedNative(process.execPath, ['scripts/windows-env.mjs', 'go', 'test', '-c', '-o', binary, './server/internal/games/trix'], { cwd: root, milliseconds: protocol.buildWallMs });
    writeFileSync(resolve(out, 'build.log'), build.output, { flag: 'wx' });
    if (build.status === 'passed') {
      bundle = preserveBuild(out, root, before, { sourceDigest: sourceDigest(before), binaryDigest: sha(readFileSync(binary)) }, binary);
      invocation = await runBoundedNative(bundle.binaryPath, ['-test.run=^TestKingReturnStudy$', '-test.v', '-test.timeout=290s'], { cwd: resolve(bundle.sourceRoot, 'server/internal/games/trix'), milliseconds: protocol.studyWallMs, maxBytes: 16 << 20, env: { ...process.env, TRIX_KING_RETURN_INPUT: inputPath, TRIX_KING_RETURN_OUTPUT: output } });
      writeFileSync(resolve(out, 'study.log'), invocation.output, { flag: 'wx' });
      assert.equal(sha(readFileSync(inputPath)), inputDigest, 'Actor input changed during execution');
      if (existsSync(output)) { assert.ok(statSync(output).size <= protocol.maxOutputBytes); study = JSON.parse(readFileSync(output)); }
    }
  } catch (e) { error = String(e); }
  const after = snapshot(), sourceUnchanged = isDeepStrictEqual(before, after); save(resolve(out, 'source-after.json'), after);
  let status = assessKingReturnRun({ build, invocation, sourceUnchanged, study });
  try {
    if (status === 'passed') {
      assert.deepEqual(study.configuration, protocol.configuration);
      assert.deepEqual(study.cases.map(c => c.caseId), protocol.caseIds);
      const summaries = study.cases.map((c, i) => summarizeKingReturnCase(c, cases[i], study.configuration));
      save(resolve(out, 'summary.json'), { version, status, strengthClaim: false, promotionEligible: false, cases: summaries });
      writeFileSync(resolve(out, 'report.md'), report(summaries), { flag: 'wx' });
    }
  } catch (e) { error = String(e); }
  if (error) status = 'pending-unverified';
  const compact = x => x && Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'output'));
  save(resolve(out, 'invocation.json'), { version, status, archiveDigest, actorInputDigest: inputDigest, sourceDigest: sourceDigest(before), finalSourceDigest: sourceDigest(after), sourceUnchanged, binaryDigest: existsSync(binary) ? sha(readFileSync(binary)) : null, studyDigest: existsSync(output) ? sha(readFileSync(output)) : null, retainedBuild: bundle, build: compact(build), invocation: compact(invocation), error, strengthClaim: false, promotionEligible: false });
  console.log(JSON.stringify({ output: out, status, sourceUnchanged, error })); if (status !== 'passed') process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
