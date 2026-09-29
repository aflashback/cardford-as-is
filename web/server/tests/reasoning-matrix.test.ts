import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REASONING_MATRIX_MANIFEST,
  runReasoningMatrix,
} from '../evaluation/reasoning-matrix.ts';

test('GR-08: matrix compares paired arms under each style with original deal seeds grouped', () => {
  const report = runReasoningMatrix({ seeds: [840001, 840002] });
  assert.equal(report.schemaVersion, '1.0.0');
  assert.deepEqual(report.seedGroups.map((group) => group.seed), [840001, 840002]);
  assert.equal(report.hands.length, 30);
  assert.equal(report.pairedDifferences.length, 18);
  for (const group of report.seedGroups) {
    assert.equal(group.handCount, 15);
    assert.equal(group.comparisonCount, 9);
  }
  for (const pair of report.pairedDifferences) {
    const candidate = report.hands.find((hand) => hand.id === pair.candidateId);
    const reference = report.hands.find((hand) => hand.id === pair.referenceId);
    assert.ok(candidate && reference);
    assert.equal(candidate.seed, reference.seed);
    assert.equal(candidate.mode, reference.mode);
    assert.equal(candidate.style, reference.style);
    assert.equal(candidate.dealer, reference.dealer);
    assert.equal(pair.scoreMarginDifference, candidate.scoreMargin - reference.scoreMargin);
  }
  assert.ok(report.hands.every((hand) => hand.transitions <= REASONING_MATRIX_MANIFEST.maxTransitionsPerHand));
  assert.ok(report.hands.every((hand) => hand.decisions === 56));
  assert.ok(report.hands.every((hand) => hand.selectedActions.length === 56));
  assert.ok(report.hands.every((hand) => hand.providerCalls === 0));
  assert.ok(report.summaries.every((summary) => summary.fallbackCount === 0));
  assert.ok(report.summaries.every((summary) => summary.candidateMatchCompletions === 0));
  assert.equal(report.independentActionLabels, 0);
  assert.equal(report.strengthStatus, 'exploratory-only');
});

test('GR-08: duplicate or non-fresh configured deal seeds fail closed', () => {
  assert.throws(() => runReasoningMatrix({ seeds: [] }), /at least one/);
  assert.throws(() => runReasoningMatrix({ seeds: [840001, 840001] }), /Duplicate seed/);
  assert.throws(() => runReasoningMatrix({ seeds: [72001] }), /Reserved seed/);
  assert.throws(() => runReasoningMatrix({ seeds: [840001], analyzer: () => { throw new Error('unused'); } }), /explicit policy version/);
});
