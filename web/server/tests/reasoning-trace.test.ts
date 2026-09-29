import assert from 'node:assert/strict';
import test from 'node:test';
import { actionId } from '../game/rules.ts';
import { createGame, fullDeck } from '../game/index.ts';
import { observe } from '../observations/index.ts';
import { analyzeDecision } from '../strategy/index.ts';
import { contractMadeNil } from './support/spades-fixtures.ts';

test('GR-03: Spades trace reconstructs each candidate rank and chosen action', () => {
  const state = contractMadeNil();
  const analysis = analyzeDecision(observe(state, state.turn!));
  const trace = analysis.trace;
  assert.ok(trace);
  assert.equal(trace.schemaVersion, '1.0.0');
  assert.equal(trace.policyVersion, analysis.policyVersion);
  assert.deepEqual(
    trace.candidates.map((candidate) => candidate.actionId).sort(),
    analysis.candidates.map((candidate) => actionId(candidate.action)).sort(),
  );
  for (const candidate of trace.candidates) {
    if (candidate.score === null) continue;
    assert.equal(
      candidate.score,
      candidate.effects.reduce((sum, effect) => sum + effect.delta, 0),
    );
  }
  assert.equal(trace.selectedActionId, actionId(analysis.action));
  assert.ok(trace.candidates.some((candidate) => candidate.effects.some((e) => e.id.startsWith('P02'))));
});

test('GR-03: Hearts has its own private baseline trace with the full legal pass set', () => {
  const obs = observe(createGame({ id: 'hearts-trace', mode: 'hearts', dealer: 3 }, fullDeck()), 0);
  const analysis = analyzeDecision(obs);
  assert.equal(analysis.trace?.selectedBy, 'baseline');
  assert.equal(analysis.trace?.policyVersion, 'hearts-baseline-1.0.0');
  assert.equal(analysis.trace?.candidates.length, 286);
  assert.equal(analysis.trace?.selectedActionId, actionId(analysis.action));
});
