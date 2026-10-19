import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateCoachUIStartRequest, validateCoachUIItemRequest, validateCoachUIFeedbackRequest,
  validateCoachUIProvider, validateCoachUIRatingPreview, validateCoachUIReplayView } from '../shared/local-service.validators.mjs';

const envelope = { commandId: 'command', gameId: 'game', expectedRevision: 2,
  controlLeaseToken: 'lease', decisionId: 'decision' };
const provider = { source: 'mock', version: 'ui-preview-v1', mock: true, preview: true, language: 'en' };

test('Coach mutations reject client ownership, entitlements and generated evidence', () => {
  const start = { ...envelope, kind: 'cue' };
  assert.ok(validateCoachUIStartRequest(start));
  for (const extra of [{ owner: 'other' }, { unlimited: true }, { frames: [] }, { body: 'advice' }, { clock: 'tomorrow' }]) {
    assert.equal(validateCoachUIStartRequest({ ...start, ...extra }), false);
  }
  assert.equal(validateCoachUIStartRequest({ ...start, kind: 'selection' }), false);
});

test('pending selections and confirmed public actions cannot be interchanged', () => {
  const selected = { ...envelope, sessionId: 'session', kind: 'selection', selectedCards: ['HQ'] };
  const confirmed = { ...envelope, sessionId: 'session', kind: 'confirmed', action: { kind: 'play', card: 'HQ' } };
  assert.ok(validateCoachUIItemRequest(selected));
  assert.ok(validateCoachUIItemRequest({ ...selected, selectedCards: [] }));
  assert.ok(validateCoachUIItemRequest(confirmed));
  assert.equal(validateCoachUIItemRequest({ ...selected, action: confirmed.action }), false);
  assert.equal(validateCoachUIItemRequest({ ...confirmed, selectedCards: ['HQ'] }), false);
  assert.equal(validateCoachUIItemRequest({ ...selected, selectedCards: ['HQ', 'HQ'] }), false);
  assert.equal(validateCoachUIItemRequest({ ...selected, selectedCards: ['H1'] }), false);
  assert.equal(validateCoachUIItemRequest({ ...selected, selectedCards: Array(14).fill('HQ') }), false);
  assert.equal(validateCoachUIItemRequest({ ...confirmed, action: { ...confirmed.action, hiddenHands: [] } }), false);
});

test('feedback is bounded and explicitly targets an item revision', () => {
  const vote = { commandId: 'feedback-command', itemId: 'item', expectedFeedbackRevision: 0, value: 'helpful' };
  assert.ok(validateCoachUIFeedbackRequest(vote));
  assert.ok(validateCoachUIFeedbackRequest({ ...vote, reason: 'Clear', text: 'x'.repeat(2000) }));
  assert.equal(validateCoachUIFeedbackRequest({ ...vote, text: 'x'.repeat(2001) }), false);
  assert.equal(validateCoachUIFeedbackRequest({ ...vote, reason: 'x'.repeat(201) }), false);
  assert.equal(validateCoachUIFeedbackRequest({ ...vote, expectedFeedbackRevision: -1 }), false);
  assert.equal(validateCoachUIFeedbackRequest({ ...vote, value: 'expert' }), false);
});

test('mock provider and fictional cohort labels cannot claim real calibration', () => {
  assert.ok(validateCoachUIProvider(provider));
  assert.equal(validateCoachUIProvider({ ...provider, mock: false }), false);
  assert.equal(validateCoachUIProvider({ ...provider, source: 'real' }), false);
  const rating = { fictional: true, cohortLabel: 'Fictional preview cohort', percentile: 50, sampleSize: 100, label: 'Sample only' };
  assert.ok(validateCoachUIRatingPreview(rating));
  assert.equal(validateCoachUIRatingPreview({ ...rating, fictional: false }), false);
  assert.equal(validateCoachUIRatingPreview({ ...rating, percentile: 101 }), false);
});

test('Why permits bounded actor-visible frames and rejects private context', () => {
  const fixtures = JSON.parse(readFileSync(new URL('../../server/internal/contracts/testdata/validation-fixtures.json', import.meta.url), 'utf8')) as { id: string; raw: string }[];
  const frame = JSON.parse(fixtures.find(f => f.id === 'witness-ReviewFrame')!.raw);
  const replay = { itemId: 'item', sourceRevision: 2, decisionId: 'decision', label: 'Saved actor view', provider, frames: [frame], explanation: 'Preview' };
  assert.ok(validateCoachUIReplayView(replay));
  assert.equal(validateCoachUIReplayView({ ...replay, frames: [] }), false);
  assert.equal(validateCoachUIReplayView({ ...replay, frames: Array(121).fill(frame) }), false);
  assert.equal(validateCoachUIReplayView({ ...replay, frames: [{ ...frame, seed: 'private' }] }), false);
  assert.equal(validateCoachUIReplayView({ ...replay, frames: [{ ...frame, game: { ...frame.game, hands: [['SA']] } }] }), false);
});
