import assert from 'node:assert/strict';
import test from 'node:test';
import { apply, actionId } from '../game/index.ts';
import { observe } from '../observations/index.ts';
import { analyzeDecision } from '../strategy/index.ts';
import { spadesDeal } from './support/spades-fixtures.ts';

test('production pack applies contextual team bidding and records the reason', () => {
  let state = spadesDeal([[], [], ['SA'], []]);
  state = apply(state, { kind: 'bid', seat: 0, bid: 13 });
  state = apply(state, { kind: 'bid', seat: 1, bid: 1 });
  const analysis = analyzeDecision(observe(state, 2));
  assert.deepEqual(analysis.action, { kind: 'bid', seat: 2, bid: 1 });
  assert.ok(analysis.reasons.some((reason) => reason.id === 'S13.contextual-bid'));
  assert.equal(analysis.trace?.selectedActionId, actionId(analysis.action));
  assert.ok(analysis.trace?.candidates.some((candidate) => candidate.effects.some((effect) => effect.id === 'S13.feasibility')));
  const ranked = analysis.trace!.candidates.toSorted((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.tieOrder - b.tieOrder);
  assert.equal(ranked[0].actionId, actionId(analysis.action));
});
