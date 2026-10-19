import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCoachMessage } from '../shared/validation.ts';

const schema = JSON.parse(readFileSync(new URL('../shared/contracts.schema.json', import.meta.url), 'utf8'));
test('coach message schema requires a complete saved reason and rejects hidden extensions', () => {
  assert.ok(schema.$defs.CoachMessage, 'versioned coach message contract is missing');
  const valid = validateCoachMessage;
  const message = {
    presentationVersion: 'coach-advice-2.0.0', decisionId: 'decision-1', policyVersion: 'test-policy',
    cueVersion: 'contextual-cues-1.0.0', status: 'tactical', selectedAction: 'play:C3',
    cue: 'Play 3 of Clubs to avoid the queen.',
    reason: { summary: 'You are last; the king wins this trick.', support: [{ id: 'trick', kind: 'exact', text: 'King of Clubs is winning.' }], alternatives: ['The ace takes 13 points.'], limitations: [] },
  };
  assert.equal(valid(message), true, JSON.stringify(valid.errors));
  for (const bad of [ { ...message, reason: undefined }, { ...message, hiddenHands: [] }, { ...message, status: 'best' }, { ...message, cue: '' }, { ...message, reason: { ...message.reason, summary: '' } } ])
    assert.equal(valid(bad), false);
});
