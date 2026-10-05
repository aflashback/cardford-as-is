import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { assertObservation, type SeatObservation } from '../observations/index.ts';
import { spadesGateAdapter } from '../games/spades/evaluation/adapter.ts';
import {
  assertPilotManifest, auditPilot, pilotCanonicalJson, pilotSourceHashes, runPilot,
  PILOT_SCHEMA_VERSION, PilotReplayDeadlineError, type PilotManifest, type PilotPair,
} from '../evaluation/spades-pack/pilot.ts';

const fixture = (identity = false): PilotManifest => ({
  schemaVersion: PILOT_SCHEMA_VERSION,
  purpose: 'development-pilot',
  reference: 'spades-tactics-2.1.0',
  candidate: identity ? 'spades-tactics-2.1.0' : 'spades-cases-4.0.0',
  modes: ['spades-solo', 'spades-partners'],
  seeds: { ledgerEntry: 'matches-development', from: 8_000_001, count: 1 },
  maxHands: 1,
  environments: [
    { id: 'contrasting-a', byMode: {
      'spades-solo': [null, 'aggressive-setter', 'bag-dodger', 'cautious-contract'],
      'spades-partners': [null, 'aggressive-setter', 'cautious-contract', 'bag-dodger'],
    } },
    { id: 'contrasting-b', byMode: {
      'spades-solo': [null, 'cautious-contract', 'nil-seeker', 'aggressive-setter'],
      'spades-partners': [null, 'cautious-contract', 'nil-seeker', 'aggressive-setter'],
    } },
  ],
  rotations: [0, 1, 2, 3],
  // A structural fixture pin, not a claim that these tests were run at a real commit.
  sourceCommit: '0'.repeat(40),
  sourceHashes: pilotSourceHashes(),
});
function inArchive(run: (outDir: string) => void): void {
  const outDir = mkdtempSync(join(tmpdir(), 'spades-pilot-test-'));
  try { run(outDir); } finally {
    const absolute = resolve(outDir);
    assert.ok(absolute.startsWith(`${resolve(tmpdir())}${sep}spades-pilot-test-`));
    rmSync(absolute, { recursive: true, force: true });
  }
}
function freeze(outDir: string, manifest: PilotManifest): void {
  writeFileSync(join(outDir, 'pilot-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

test('SG-05 identical policies yield identical paired trajectories; capped matches have no winner', (t) => inArchive((outDir) => {
  const manifest = fixture(true);
  freeze(outDir, manifest);
  const progress: number[] = [];
  const result = runPilot(manifest, { outDir, onProgress: (done, total) => { assert.equal(total, 16); progress.push(done); } });
  assert.equal(result.completedPairs, 16);
  assert.equal(result.totalStreams, 32);
  assert.equal(result.status, 'complete');
  assert.deepEqual(progress, Array.from({ length: 17 }, (_, index) => index));
  for (const pair of result.rows) {
    const a = pair.reference, b = pair.candidate;
    assert.equal(a.trajectoryHash, b.trajectoryHash);
    assert.equal(a.actionHash, b.actionHash);
    assert.equal(a.observationHash, b.observationHash);
    assert.equal(a.dealHash, b.dealHash);
    assert.deepEqual(a.scores, b.scores);
    assert.deepEqual(a.metrics, b.metrics);
    assert.equal(a.completed, false);
    assert.equal(a.censored, true);
    assert.equal(a.censorReason, 'hand-cap');
    assert.equal(a.winner, null);
    assert.equal(a.winnerCompetitorId, null);
    assert.equal(a.focalWon, null);
    assert.equal(a.cueChecks, 'not-run');
    assert.equal(a.journal[0].actions.length, 56);
    assert.equal(new Set(a.journal[0].deck).size, 52);
  }
  const before = readdirSync(outDir).map((name) => [name, readFileSync(join(outDir, name), 'utf8')]);
  t.mock.method(spadesGateAdapter, 'policy', (id: string, mode: string) => {
    const found = originalPolicy(id, mode);
    return { ...found, choose() { throw new Error('An audit must never call a strategic policy.'); } };
  });
  assert.equal(auditPilot(manifest, outDir).rowsHash, result.rowsHash);
  assert.deepEqual(readdirSync(outDir).map((name) => [name, readFileSync(join(outDir, name), 'utf8')]), before);
  const resumed = runPilot(manifest, { outDir });
  assert.equal(resumed.resumedPairs, 16);
  assert.equal(resumed.rowsHash, result.rowsHash);
}));
const originalPolicy = spadesGateAdapter.policy.bind(spadesGateAdapter);

test('SG-05 each production pair changes only the evaluated seat and counts a team once', () => inArchive((outDir) => {
  const manifest = fixture();
  freeze(outDir, manifest);
  const result = runPilot(manifest, { outDir });
  assert.equal(result.completedPairs, 16);
  for (const pair of result.rows) {
    assert.equal(pair.reference.policy, manifest.reference);
    assert.equal(pair.candidate.policy, manifest.candidate);
    for (const seat of [0, 1, 2, 3]) {
      if (seat === pair.evaluatedSeat) assert.notEqual(pair.reference.seatPolicies[seat], pair.candidate.seatPolicies[seat]);
      else assert.equal(pair.reference.seatPolicies[seat], pair.candidate.seatPolicies[seat]);
    }
    for (const arm of [pair.reference, pair.candidate]) {
      const focal = arm.competitorSeats[0];
      assert.equal(arm.totalOwn, arm.scores[focal]);
      assert.equal(arm.totalHandMargin, arm.finalMargin);
      if (pair.mode === 'spades-partners') {
        assert.equal(arm.competitorSeats.length, 2);
        assert.equal(arm.scores[arm.competitorSeats[0]], arm.scores[arm.competitorSeats[1]]);
        const credited = arm.journal[0].measured.own;
        assert.equal(arm.totalOwn, credited);
      } else assert.equal(arm.competitorSeats.length, 1);
    }
  }
}));

test('SG-05 validation rejects sealed/out-of-range seeds, reserved styles, extra fields, and cap expansion', () => {
  const manifest = fixture();
  assertPilotManifest(manifest);
  const wrongStyle = structuredClone(manifest);
  wrongStyle.environments[0].byMode['spades-partners'][2] = 'high-leader';
  assert.throws(() => assertPilotManifest(wrongStyle), /development styles/);
  const wrongSeed = structuredClone(manifest);
  wrongSeed.seeds.from = 8_100_001;
  assert.throws(() => assertPilotManifest(wrongSeed), /matches-development/);
  assert.throws(() => assertPilotManifest({ ...manifest, seeds: { ...manifest.seeds, ledgerEntry: 'matches-confirmation-1' } }), /matches-development/);
  assert.throws(() => assertPilotManifest({ ...manifest, maxHands: 101 }), /hand cap/);
  assert.throws(() => assertPilotManifest({ ...manifest, seeds: { ...manifest.seeds, count: 9 } }), /eight/);
  assert.throws(() => assertPilotManifest({ ...manifest, hiddenOverride: true }), /fields/);
  assert.throws(() => assertPilotManifest({ ...manifest, rotations: [0, 2] }), /four seats/);
});

test('SG-05 illegal selector output fails closed and cannot produce a completed pair row', (t) => inArchive((outDir) => {
  const manifest = fixture();
  freeze(outDir, manifest);
  t.mock.method(spadesGateAdapter, 'policy', (id: string, mode: string) => ({ ...originalPolicy(id, mode), choose(observation: SeatObservation) {
    return { kind: 'bid', seat: observation.seat, bid: 99 };
  } }));
  assert.throws(() => runPilot(manifest, { outDir }), /illegal action/);
  const audited = auditPilot(manifest, outDir);
  assert.equal(audited.rows.length, 0);
  assert.equal(readFileSync(join(outDir, 'pilot-pairs.jsonl'), 'utf8'), '');
  const diagnostic = JSON.parse(readFileSync(join(outDir, 'pilot-error.json'), 'utf8')) as { completedPairs: number; cell: { seed: number } };
  assert.equal(diagnostic.completedPairs, 0);
  assert.equal(diagnostic.cell.seed, manifest.seeds.from);
}));

test('SG-05 every policy input passes the closed actor observation allowlist', (t) => inArchive((outDir) => {
  const manifest = fixture();
  freeze(outDir, manifest);
  let seen = 0;
  t.mock.method(spadesGateAdapter, 'policy', (id: string, mode: string) => ({ ...originalPolicy(id, mode), choose(observation: SeatObservation) {
    assertObservation(observation);
    assert.equal(observation.seat, observation.turn);
    for (const hidden of ['hands', 'deck', 'seed', 'aggregate', 'sourceHashes', 'policies', 'id']) assert.equal(Object.hasOwn(observation, hidden), false);
    assert.equal(observation.hand.length, observation.handSizes[observation.seat]);
    seen++;
    return observation.legalActions[0];
  } }));
  const result = runPilot(manifest, { outDir });
  assert.equal(result.completedPairs, 16);
  assert.equal(seen, 16 * 2 * 56);
}));

test('SG-05 a mid-hand wall cap archives its last state and saves neither half of the pair', (t) => inArchive((outDir) => {
  const manifest = fixture();
  freeze(outDir, manifest);
  let seen = 0;
  t.mock.method(spadesGateAdapter, 'policy', (id: string, mode: string) => ({ ...originalPolicy(id, mode), choose(observation: SeatObservation) {
    seen++;
    if (seen === 3) {
      const deadline = performance.now() + 75;
      while (performance.now() < deadline) { /* Deliberate synchronous fixture delay. */ }
    }
    return observation.legalActions[0];
  } }));
  const result = runPilot(manifest, { outDir, maxWallMs: 50 });
  assert.equal(result.status, 'wall-cap');
  assert.equal(result.completedPairs, 0);
  assert.equal(result.interruption?.completedHands, 0);
  assert.equal(result.interruption?.completedReference, null);
  assert.equal(result.interruption?.lastState.bids.filter((bid) => bid !== null).length, 2);
  assert.equal(readFileSync(join(outDir, 'pilot-pairs.jsonl'), 'utf8'), '');
  const interruption = readFileSync(join(outDir, 'pilot-interruption.json'), 'utf8');
  assert.equal(auditPilot(manifest, outDir).rows.length, 0);
  assert.equal(readFileSync(join(outDir, 'pilot-interruption.json'), 'utf8'), interruption);
}));

test('SG-05 a candidate wall stop retains the finished reference arm outside completed-pair rows', (t) => inArchive((outDir) => {
  const manifest = fixture();
  freeze(outDir, manifest);
  let seen = 0;
  t.mock.method(spadesGateAdapter, 'policy', (id: string, mode: string) => ({ ...originalPolicy(id, mode), choose(observation: SeatObservation) {
    seen++;
    if (seen === 59) {
      const deadline = performance.now() + 150;
      while (performance.now() < deadline) { /* Deliberate fixture delay after the reference arm. */ }
    }
    return observation.legalActions[0];
  } }));
  const result = runPilot(manifest, { outDir, maxWallMs: 100 });
  assert.equal(result.status, 'wall-cap');
  assert.equal(result.completedPairs, 0);
  assert.equal(result.interruption?.arm, 'candidate');
  assert.equal(result.interruption?.completedHands, 0);
  assert.equal(result.interruption?.lastState.bids.filter((bid) => bid !== null).length, 2);
  const reference = result.interruption?.completedReference;
  assert.ok(reference);
  assert.equal(reference.arm, 'reference');
  assert.equal(reference.hands, 1);
  assert.equal(reference.journal[0].actions.length, 56);
  assert.equal(reference.journal[0].result.ended, 'hand-end');
  assert.equal(readFileSync(join(outDir, 'pilot-pairs.jsonl'), 'utf8'), '');
  assert.equal(auditPilot(manifest, outDir).rows.length, 0);
}));

test('SG-05 an expired checkpoint replay rejects promptly without rewriting any archive file', () => inArchive((outDir) => {
  const manifest = fixture(true);
  freeze(outDir, manifest);
  runPilot(manifest, { outDir });
  writeFileSync(join(outDir, 'pilot-interruption.json'), '{"retainedDiagnostic":true}\n', 'utf8');
  const before = readdirSync(outDir).map((name) => [name, readFileSync(join(outDir, name), 'utf8')]);
  let progress = 0;
  const started = performance.now();
  assert.throws(() => runPilot(manifest, { outDir, maxWallMs: 0, onProgress: () => { progress++; } }), PilotReplayDeadlineError);
  assert.ok(performance.now() - started < 1000, 'An expired replay must fail before replaying the archive.');
  assert.equal(progress, 0);
  assert.deepEqual(readdirSync(outDir).map((name) => [name, readFileSync(join(outDir, name), 'utf8')]), before);
}));

test('SG-05 stale pins and tampered complete-pair actions cannot resume', () => inArchive((outDir) => {
  const manifest = fixture(true);
  freeze(outDir, manifest);
  runPilot(manifest, { outDir });
  const path = join(outDir, 'pilot-checkpoint.json');
  const original = readFileSync(path, 'utf8');
  const stale = JSON.parse(original) as { manifestHash: string };
  stale.manifestHash = '0'.repeat(64);
  writeFileSync(path, JSON.stringify(stale), 'utf8');
  assert.throws(() => runPilot(manifest, { outDir }), /Stale/);
  writeFileSync(path, original, 'utf8');
  const alteredSource = structuredClone(manifest);
  alteredSource.sourceHashes['web/server/game/index.ts'] = '0'.repeat(64);
  assert.throws(() => auditPilot(alteredSource, outDir), /source changed/);
  const altered = JSON.parse(original) as { rows: PilotPair[]; rowsHash: string };
  altered.rows[0].reference.journal[0].actions[0] = '0:bid:99';
  altered.rowsHash = sha256(altered.rows.map((row) => `${pilotCanonicalJson(row)}\n`).join(''));
  writeFileSync(path, JSON.stringify(altered), 'utf8');
  assert.throws(() => auditPilot(manifest, outDir), /illegal|wrong seat/);
}));
