import assert from 'node:assert/strict';
import test from 'node:test';
import { apply, collectTrick, createGame, fullDeck, legalActions } from '../game/legacy/v1.ts';
import { json } from '../game/kernel/codec.ts';
import { fromV1Hearts, toV1Hearts } from '../games/hearts/compatibility.ts';
import { heartsStateCodec } from '../games/hearts/codec.ts';
import { heartsModule } from '../games/hearts/module.ts';
import { heartsObservationCodec, observeHearts } from '../games/hearts/observation.ts';
import type { HeartsState } from '../games/hearts/state.ts';

function completedHeartsHand(): HeartsState {
  let state = createGame({ id: 'hearts-validation', mode: 'hearts', dealer: 3 }, fullDeck());
  while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
    if (state.phase === 'pass')
      state = apply(state, {
        kind: 'pass-bundle',
        passes: [
          state.hands[0].slice(0, 3),
          state.hands[1].slice(0, 3),
          state.hands[2].slice(0, 3),
          state.hands[3].slice(0, 3),
        ],
      });
    else if (state.phase === 'trick-end') state = collectTrick(state);
    else {
      assert.notEqual(state.turn, null);
      const action = legalActions(state, state.turn!)[0];
      assert.equal(action.kind, 'play');
      if (action.kind !== 'play') throw new Error('Unexpected Hearts action.');
      state = apply(state, action);
    }
  }
  return fromV1Hearts(state);
}

test('MG-02: a scored Hearts hand cannot be decoded as an actionable private state', () => {
  const completed = completedHeartsHand();
  assert.equal(completed.history.length, 13);
  assert.equal(completed.phase, 'hand-end');
  assert.deepEqual(heartsStateCodec.parse(json(completed)), completed);
  assert.equal(heartsModule.node(completed).kind, 'round-complete');
  for (const phase of ['play', 'pass'] as const)
    assert.throws(
      () => heartsStateCodec.parse(json({ ...completed, phase })),
      /hand boundary|Completed hand|sealed phase/,
    );
  const awaiting = heartsModule.reduce(completed, { kind: 'continue-round' }).state;
  assert.deepEqual(heartsStateCodec.parse(json(awaiting)), awaiting);
  assert.equal(heartsModule.node(awaiting).kind, 'chance');
});

test('MG-02: a scored Hearts observation cannot be relabeled as a player decision', () => {
  const observation = observeHearts(completedHeartsHand(), 0);
  assert.deepEqual(heartsObservationCodec.parse(json(observation)), observation);
  for (const phase of ['play', 'pass'] as const)
    assert.throws(() => heartsObservationCodec.parse(json({ ...observation, phase })), /hand boundary/);
});

test('MG-02: private Hearts decoding rejects malformed versions, fields, flags and conservation', () => {
  const completed = completedHeartsHand();
  for (const bad of [
    { ...completed, moduleVersion: '1.0.0' },
    { ...completed, stateSchemaVersion: '1.0.0' },
    { ...completed, eventSchemaVersion: '1.0.0' },
    { ...completed, ruleProfileId: 'unknown' },
    { ...completed, bids: [null, null, null, null] },
    { ...completed, deck: fullDeck() },
    { ...completed, heartsBroken: false },
    { ...completed, scores: [NaN, 0, 0, 0] },
    { ...completed, history: completed.history.slice(1) },
    { ...completed, v1Compatibility: { ...completed.v1Compatibility, spadesBroken: false } },
  ])
    assert.throws(() => heartsStateCodec.parse(bad));
});

test('MG-02: nested Hearts projection allowlists exclude injected aggregate canaries', () => {
  const state = completedHeartsHand();
  const safe = observeHearts(state, 0);
  for (const container of [
    state,
    state.events[0],
    state.history[0],
    state.history[0].plays[0],
    state.passes[0],
    state.handResult!,
  ])
    Object.assign(container, { secret: 'HEARTS_PRIVATE_CANARY' });
  assert.throws(() => heartsStateCodec.parse(state));
  assert.deepEqual(observeHearts(state, 0), safe);
  assert.equal(JSON.stringify(observeHearts(state, 0)).includes('HEARTS_PRIVATE_CANARY'), false);
});

for (const location of ['root', 'event', 'handResult'] as const) {
  test(`MG-09: strict V1 Hearts conversion rejects extra ${location} fields before projection`, () => {
    const original = toV1Hearts(completedHeartsHand());
    const container =
      location === 'root' ? original : location === 'event' ? original.events[0] : original.handResult!;
    Object.assign(container, { secret: 'V1_HEARTS_CANARY' });
    assert.throws(() => fromV1Hearts(original), /field/);
  });
}

test('MG-02: a first Hearts hand cannot carry fabricated prior scores', () => {
  const fresh = fromV1Hearts(
    createGame({ id: 'first-score-validation', mode: 'hearts', dealer: 3 }, fullDeck()),
  );
  assert.deepEqual(fresh.scores, [0, 0, 0, 0]);
  assert.throws(() => heartsStateCodec.parse({ ...fresh, scores: [50, 50, 50, 50] }), /first hand score/i);
});

test('MG-02: first Hearts scoring must update totals to the exact hand result', () => {
  const completed = completedHeartsHand();
  assert.equal(completed.handNumber, 1);
  assert.ok(completed.handResult);
  assert.ok(completed.handResult.points.some((points) => points > 0));
  assert.deepEqual(completed.scores, completed.handResult.points);
  assert.throws(() => heartsStateCodec.parse({ ...completed, scores: [0, 0, 0, 0] }), /first hand score/i);
});
