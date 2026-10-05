import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHumanLabels } from '../evaluation/spades-pack/labels.ts';
import { buildReviewPack } from '../evaluation/spades-pack/review.ts';

const cases = buildReviewPack().cases.slice(0, 2);
const blank = () => ({ schemaVersion: 'spades-review-human-labels-1.0.0', cases: cases.map(reviewCase => ({
  id: reviewCase.id, packetHash: reviewCase.packetHash, reviewerId: null, reviewedAt: null, status: 'unknown',
  acceptableActions: [] as string[], unacceptableActions: [] as string[], alternatives: [] as string[], rationale: null as string | null,
})) });

test('EVALPACK-05: blank labels are pending and never scored as independent truth', () => {
  const result = validateHumanLabels(cases, blank());
  assert.equal(result.pending, 2);
  assert.equal(result.supported, 0);
  assert.deepEqual(result.reviewerIds, []);
  assert.equal(result.independentAgreementEvaluated, false);
});
test('EVALPACK-05: changed packets, duplicate cases, illegal and contradictory verdicts reject', () => {
  const changed = blank(); changed.cases[0].packetHash = 'changed';
  assert.throws(() => validateHumanLabels(cases, changed), /changed packet/);
  const duplicated = blank(); duplicated.cases[1] = duplicated.cases[0];
  assert.throws(() => validateHumanLabels(cases, duplicated), /Duplicate/);
  const illegal = blank(); illegal.cases[0].acceptableActions = ['play:imaginary'];
  assert.throws(() => validateHumanLabels(cases, illegal), /Invalid action/);
  const conflicting = blank();
  conflicting.cases[0].acceptableActions = [cases[0].packet.legalActions[0]];
  conflicting.cases[0].unacceptableActions = [...conflicting.cases[0].acceptableActions];
  assert.throws(() => validateHumanLabels(cases, conflicting), /Conflicting/);
});
test('EVALPACK-05: a supported verdict needs actual supplied reviewer metadata and a legal acceptable action', () => {
  const input = blank();
  Object.assign(input.cases[0], { status: 'supported', reviewerId: 'test-fixture-reviewer',
    reviewedAt: '2026-10-04T12:00:00Z', rationale: 'Synthetic validator fixture only.',
    acceptableActions: [cases[0].packet.legalActions[0]] });
  const result = validateHumanLabels(cases, input);
  assert.equal(result.supported, 1);
  assert.equal(result.pending, 1);
  assert.equal(result.independentAgreementEvaluated, false);
  input.cases[0].acceptableActions = [];
  assert.throws(() => validateHumanLabels(cases, input), /acceptable actions/);
});
