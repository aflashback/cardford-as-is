import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { actionId, apply, collectTrick, createGame, legalActions, nextHand } from '../../../../web/server/game/index.ts';
import { assertObservation, observe } from '../../../../web/server/observations/index.ts';
import { getReasoningProfile } from '../../../../web/server/strategy/registry.ts';
import { dealerOf, spadesGateAdapter, spadesStreamDeal } from '../../../../web/server/games/spades/evaluation/adapter.ts';
import { assertPilotManifest, pilotCanonicalJson, pilotSourceHashes } from '../../../../web/server/evaluation/spades-pack/pilot.ts';

// Supplemental development reanalysis. No archived advice, pinned source, manifest,
// action row, checkpoint, or original pilot result is rewritten.
const outDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(outDir, '../../../..');
const MAX_WALL_MS = 5 * 60 * 1000;
const started = performance.now();
const hashText = (text) => createHash('sha256').update(text).digest('hex');
const hash = (value) => hashText(pilotCanonicalJson(value));
const fileHash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const manifest = JSON.parse(readFileSync(join(outDir, 'pilot-manifest.json'), 'utf8'));
assertPilotManifest(manifest);
const run = JSON.parse(readFileSync(join(outDir, 'run.json'), 'utf8'));
const rowText = readFileSync(join(outDir, 'pilot-pairs.jsonl'), 'utf8');
const rows = rowText.trimEnd().split('\n').map((line) => JSON.parse(line));
const checkpoint = JSON.parse(readFileSync(join(outDir, 'pilot-checkpoint.json'), 'utf8'));
const CASE_IDS = ['CASE-01', 'CASE-02', 'CASE-03', 'CASE-04'];
const parentId = 'spades-plan-3.0.0';
const bump = (map, key) => { map[key] = (map[key] ?? 0) + 1; };
const withoutEvents = (state) => ({ ...state, events: [] });
const checkTime = () => {
  if (performance.now() - started >= MAX_WALL_MS) throw new Error('Supplemental reanalysis reached its five-minute wall cap.');
};
function snapshot() {
  const required = pilotSourceHashes();
  for (const path of Object.keys(required)) assert.ok(Object.hasOwn(manifest.sourceHashes, path), `Missing source pin: ${path}`);
  const sources = Object.fromEntries(Object.keys(manifest.sourceHashes).sort().map((path) => [path, fileHash(join(root, path))]));
  for (const [path, expected] of Object.entries(manifest.sourceHashes)) assert.equal(sources[path], expected, `Source drift: ${path}`);
  return {
    files: Object.fromEntries(['pilot-manifest.json', 'pilot-pairs.jsonl', 'pilot-checkpoint.json', 'run.json', 'results.json', 'results.md'].map((name) => [name, fileHash(join(outDir, name))])),
    sourcePinsHash: hash(sources), sourceFiles: Object.keys(sources).length, sourcePinsMatch: true,
    canonicalManifestHash: hash(manifest), scriptHash: fileHash(fileURLToPath(import.meta.url)),
  };
}
const before = snapshot();
assert.equal(before.canonicalManifestHash, run.manifestHash);
assert.equal(before.files['pilot-pairs.jsonl'], run.rowsHash);
assert.equal(checkpoint.manifestHash, run.manifestHash);
assert.equal(checkpoint.rowsHash, run.rowsHash);
assert.equal(hashText(checkpoint.rows.map((row) => `${pilotCanonicalJson(row)}\n`).join('')), run.rowsHash);
assert.equal(rows.length, run.completedPairs);
assert.equal(run.completedPairs, run.totalPairs);
assert.equal(run.status, 'complete');

const perMode = Object.fromEntries(manifest.modes.map((mode) => [mode, {
  referenceStreams: 0, referenceHands: 0, recordedActionsReplayed: 0,
  focalDecisions: 0, focalForcedSkipped: 0, focalUnforcedAnalyzed: 0,
  unforcedByPhase: { bid: 0, play: 0 },
  observedPolicyVersionIds: { reference: {}, candidate: {}, case01Parent: {} },
  observedTraceVersionIds: { reference: {}, candidate: {}, case01Parent: {} },
  observedCandidateCatalogIds: {},
  candidateVsReferenceActionDifferences: 0,
  referenceVsRecordedActionDifferences: 0,
  casesMatched: Object.fromEntries(CASE_IDS.map((id) => [id, 0])),
  casesWithReferenceActionDifference: Object.fromEntries(CASE_IDS.map((id) => [id, 0])),
  case01Preference: { matched: 0, withPositivePreferenceEffect: 0, parentAnalyzed: 0, changedParentAction: 0, retainedParentAction: 0, parentActionAlreadyPreferred: 0 },
} ]));
let processedPairs = 0;
let status = 'complete';
let error = null;
try {
  for (const pair of rows) {
    checkTime();
    assert.equal(pair.reference.trajectoryHash, pair.candidate.trajectoryHash, 'Diagnostic expects the observed identity trajectories.');
    const counts = perMode[pair.mode];
    const reference = spadesGateAdapter.policy(manifest.reference, pair.mode);
    const candidate = spadesGateAdapter.policy(manifest.candidate, pair.mode);
    const parent = getReasoningProfile(parentId, pair.mode);
    assert.equal(reference.id, manifest.reference);
    assert.equal(candidate.id, manifest.candidate);
    assert.equal(parent.policyVersion, parentId);
    assert.equal(typeof reference.analyze, 'function');
    assert.equal(typeof candidate.analyze, 'function');
    let state = withoutEvents(createGame({ id: `pilot:${pair.id}`, mode: pair.mode, dealer: dealerOf(pair.seed) }, spadesStreamDeal(pair.seed, 0)));
    counts.referenceStreams++;
    for (let handIndex = 0; handIndex < pair.reference.journal.length; handIndex++) {
      checkTime();
      const saved = pair.reference.journal[handIndex];
      assert.equal(hash(saved.deck), hash(spadesStreamDeal(pair.seed, handIndex)));
      assert.deepEqual(saved.actions, pair.candidate.journal[handIndex].actions);
      counts.referenceHands++;
      for (const recorded of saved.actions) {
        checkTime();
        if (state.phase === 'trick-end') state = collectTrick(state);
        const seat = state.turn;
        assert.notEqual(seat, null);
        const legal = legalActions(state, seat);
        const selected = legal.find((action) => `${seat}:${actionId(action)}` === recorded);
        assert.ok(selected && selected.kind !== 'pass', 'Recorded reference action must still be legal.');
        if (seat === pair.evaluatedSeat) {
          counts.focalDecisions++;
          if (legal.length === 1) counts.focalForcedSkipped++;
          else {
            // Only this actor's allowlisted observation enters a strategic analyzer.
            const observation = observe(state, seat);
            assertObservation(observation);
            const a = reference.analyze(structuredClone(observation));
            const b = candidate.analyze(structuredClone(observation));
            for (const [arm, analysis, expected] of [['reference', a, manifest.reference], ['candidate', b, manifest.candidate]]) {
              assert.equal(analysis.policyVersion, expected, `${arm} analyzer version mismatch`);
              assert.equal(analysis.trace?.policyVersion, expected, `${arm} trace version mismatch`);
              assert.equal(analysis.action.seat, seat);
              assert.ok(legal.some((action) => actionId(action) === actionId(analysis.action)), 'Reanalysis selected an illegal action.');
              bump(counts.observedPolicyVersionIds[arm], analysis.policyVersion);
              bump(counts.observedTraceVersionIds[arm], analysis.trace.policyVersion);
            }
            assert.equal(b.trace.catalogVersion, 'spades-cases-1.0.0');
            bump(counts.observedCandidateCatalogIds, b.trace.catalogVersion);
            counts.focalUnforcedAnalyzed++;
            counts.unforcedByPhase[observation.phase]++;
            const aId = actionId(a.action), bId = actionId(b.action);
            if (aId !== actionId(selected)) counts.referenceVsRecordedActionDifferences++;
            if (aId !== bId) counts.candidateVsReferenceActionDifferences++;
            for (const id of CASE_IDS) if (b.scenarioIds.includes(id)) {
              counts.casesMatched[id]++;
              if (aId !== bId) counts.casesWithReferenceActionDifference[id]++;
            }
            if (b.scenarioIds.includes('CASE-01')) {
              const details = counts.case01Preference;
              details.matched++;
              if (b.trace.candidates.some((entry) => entry.effects.some((effect) => effect.id === 'CASE-01.preserve-partner-trump' && effect.delta > 0))) details.withPositivePreferenceEffect++;
              const c = parent.analyze(structuredClone(observation));
              assert.equal(c.policyVersion, parentId);
              assert.equal(c.trace?.policyVersion, parentId);
              assert.ok(legal.some((action) => actionId(action) === actionId(c.action)));
              bump(counts.observedPolicyVersionIds.case01Parent, c.policyVersion);
              bump(counts.observedTraceVersionIds.case01Parent, c.trace.policyVersion);
              details.parentAnalyzed++;
              if (actionId(c.action) === bId) details.retainedParentAction++;
              else details.changedParentAction++;
              const preference = b.reasons.find((reason) => reason.id === 'CASE-01.preserve-partner-trump');
              if (preference?.actionIds?.includes(actionId(c.action))) details.parentActionAlreadyPreferred++;
            }
          }
        }
        state = apply(state, selected);
        counts.recordedActionsReplayed++;
      }
      if (state.phase === 'trick-end') state = collectTrick(state);
      assert.deepEqual(state.scores, saved.result.scores);
      assert.deepEqual(state.bags, saved.result.bags);
      assert.deepEqual(state.tricks, saved.result.tricks);
      assert.deepEqual(state.bids, saved.result.bids);
      if (handIndex + 1 < pair.reference.journal.length) state = withoutEvents(nextHand(state, spadesStreamDeal(pair.seed, handIndex + 1)));
    }
    assert.deepEqual(state.scores, pair.reference.scores);
    processedPairs++;
    if (processedPairs % 16 === 0) process.stdout.write(`Supplemental parity reanalysis: ${processedPairs}/${rows.length} reference streams\n`);
  }
  for (const mode of manifest.modes) {
    const expected = rows.filter((row) => row.mode === mode).reduce((sum, row) => sum + row.reference.evaluatedUnforcedDecisions, 0);
    assert.equal(perMode[mode].focalUnforcedAnalyzed, expected, 'Focal unforced coverage differs from the original journal.');
  }
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
  status = error.includes('wall cap') ? 'wall-cap' : 'failed';
}
const after = snapshot();
const unchanged = hash(before) === hash(after);
if (!unchanged) { status = 'failed'; error = 'Pinned source/archive/script hashes changed during supplemental reanalysis.'; }
const diagnostic = {
  schemaVersion: 'spades-parity-diagnostic-1.0.0', purpose: 'supplemental-development-reanalysis', status, error,
  originalAdvice: false, originalPilotRowsRewritten: false, providerMode: 'offline', observedModelId: null,
  manifestHash: run.manifestHash, rowsHash: run.rowsHash, sourceCommit: manifest.sourceCommit,
  scriptSHA256: before.scriptHash,
  reference: manifest.reference, candidate: manifest.candidate, case01Parent: parentId,
  archivePairs: rows.length, processedReferenceStreams: processedPairs,
  maxWallMs: MAX_WALL_MS, elapsedMs: Math.round(performance.now() - started),
  before, after, unchanged, modes: perMode,
  factsAccuracy: 'not-measured', cueQuality: 'not-measured', humanAcceptableActionLabels: 'not-measured', strength: 'not-estimated',
  interpretation: 'Policy/trace IDs and action comparisons are supplemental reanalysis on original focal information sets. Case matches do not establish factual validity, cue quality, action quality, learning, or formal decision parity outside these sampled trajectories.',
};
writeFileSync(join(outDir, 'diagnostic.json'), `${JSON.stringify(diagnostic, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status, processedReferenceStreams: processedPairs, elapsedMs: diagnostic.elapsedMs, unchanged, modes: perMode }, null, 2)}\n`);
if (status !== 'complete') process.exitCode = 1;
