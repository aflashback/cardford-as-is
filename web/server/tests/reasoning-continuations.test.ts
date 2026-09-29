import assert from 'node:assert/strict';
import test from 'node:test';
import { apply, collectTrick } from '../game/index.ts';
import { observe } from '../observations/index.ts';
import { chooseBaselineAction } from '../strategy/baseline.ts';
import { compareContinuations } from '../games/spades/reasoning/continuations.ts';
import { bidAll, seededSpadesDeck } from './support/spades-fixtures.ts';
import { createGame } from '../game/index.ts';

function lateObservation() {
  let state = bidAll(createGame({ id: 'late-continuation', mode: 'spades-partners', dealer: 3 }, seededSpadesDeck(719)), [2, 2, 2, 2]);
  while (state.history.length < 11) {
    if (state.phase === 'trick-end') state = collectTrick(state);
    else {
      assert.equal(state.phase, 'play');
      const choice = chooseBaselineAction(observe(state, state.turn!));
      assert.equal(choice.kind, 'play');
      state = apply(state, choice as Extract<typeof choice, { kind: 'play' }>);
    }
  }
  if (state.phase === 'trick-end') state = collectTrick(state);
  assert.equal(state.phase, 'play');
  return observe(state, state.turn!);
}

test('late continuation compares legal candidates on common reproducible worlds through exact hand scoring', () => {
  const obs = lateObservation();
  const result = compareContinuations(obs, obs.legalActions, 19, { worlds: 3, maxPlies: 8 });
  assert.equal(result.status, 'available');
  if (result.status !== 'available') return;
  assert.equal(result.candidates.length, obs.legalActions.length);
  assert.deepEqual(result, compareContinuations(obs, obs.legalActions, 19, { worlds: 3, maxPlies: 8 }));
  for (const candidate of result.candidates) {
    assert.equal(candidate.completed, 3);
    assert.equal(candidate.truncated, 0);
    assert.ok(Number.isFinite(candidate.meanScoreMargin));
  }
});

test('continuation rejects unbounded or nonlegal work and early-hand exact-score claims', () => {
  const obs = lateObservation();
  assert.equal(compareContinuations(obs, obs.legalActions, 19, { worlds: 9, maxPlies: 8 }).status, 'unavailable');
  assert.equal(compareContinuations(obs, [], 19, { worlds: 3, maxPlies: 8 }).status, 'unavailable');
  const early = observe(bidAll(createGame({ id: 'early', mode: 'spades-solo', dealer: 3 }, seededSpadesDeck(719)), [2, 2, 2, 2]), 0);
  assert.equal(compareContinuations(early, early.legalActions, 19, { worlds: 3, maxPlies: 8 }).status, 'unavailable');
});
