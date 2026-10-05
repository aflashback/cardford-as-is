import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPilotReport, type ReportPair } from '../evaluation/spades-pack/report.ts';
import type { PilotManifest } from '../evaluation/spades-pack/pilot.ts';

const manifest: PilotManifest = { schemaVersion: 'spades-match-pilot-1.0.0', purpose: 'development-pilot',
  reference: 'spades-tactics-2.1.0', candidate: 'spades-cases-4.0.0', modes: ['spades-solo'],
  seeds: { ledgerEntry: 'matches-development', from: 8_000_001, count: 2 }, maxHands: 1,
  environments: [{ id: 'fixture', byMode: { 'spades-solo': [null, 'bag-dodger', 'bag-dodger', 'bag-dodger'],
    'spades-partners': [null, 'bag-dodger', 'bag-dodger', 'bag-dodger'] } }], rotations: [0],
  sourceCommit: 'synthetic-report-test', sourceHashes: {} };
const stream = { completed: true, censored: false, focalWon: false, hands: 1, finalMargin: 10,
  totalOwn: 20, metrics: { positiveContract: 1 }, actionHash: 'same', decisions: 56,
  evaluatedDecisions: 14, evaluatedUnforcedDecisions: 12 };
const pair = (seed: number): ReportPair => ({ id: String(seed), seed, mode: 'spades-solo', environmentId: 'fixture',
  evaluatedSeat: 0, reference: { ...stream }, candidate: { ...stream } });

test('EVALPACK-04: missing/capped outcomes retain bounds rather than becoming losses or winners', () => {
  const row = pair(8_000_001);
  row.candidate = { ...stream, completed: false, censored: true, focalWon: null };
  const result = buildPilotReport(manifest, [row]);
  assert.deepEqual(result.modes[0].plannedCellEventualWinDifferenceBounds.lower, -0.5);
  assert.deepEqual(result.modes[0].plannedCellEventualWinDifferenceBounds.upper, 1);
  assert.equal(result.modes[0].arms[1].terminalWins, 0);
  assert.equal(result.modes[0].pendingPairs, 1);
});
test('EVALPACK-04: unchanged trajectories and tiny family variance never imply promotion or a confirmation N', () => {
  const result = buildPilotReport(manifest, [pair(8_000_001), pair(8_000_002)]);
  assert.equal(result.modes[0].observedFamilyStandardDeviation, 0);
  assert.equal(result.modes[0].familiesWithTrajectoryChange, 0);
  assert.equal(result.promotion, false);
  assert.equal(result.samplePlanning.status, 'not-established');
  assert.equal(result.humanActionQuality, 'pending-independent-review');
});
test('EVALPACK-04: rotations remain one family and duplicate rows reject', () => {
  const first = pair(8_000_001), rotated = { ...pair(8_000_001), id: 'rotation', evaluatedSeat: 1 as const };
  rotated.candidate = { ...stream, finalMargin: 30, actionHash: 'changed' };
  const result = buildPilotReport({ ...manifest, rotations: [0, 1] }, [first, rotated]);
  assert.equal(result.modes[0].completeAllocationFamilies, 1);
  assert.equal(result.modes[0].pairedBoundedFinalMarginMean, 10);
  assert.equal(result.modes[0].observedFamilyStandardDeviation, null);
  assert.throws(() => buildPilotReport(manifest, [first, first]), /Duplicate/);
});
