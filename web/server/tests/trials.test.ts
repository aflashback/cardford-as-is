import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGame,
  fullDeck,
  apply,
  type PrivateGame,
  type Seat,
  type Four,
  type Card,
} from '../game/index.ts';
import { observe, assertObservation } from '../observations/index.ts';
import { chooseAction } from '../strategy/index.ts';
import { simulateTrial } from '../coaching/trials.ts';
function starting(mode: 'hearts' | 'spades-solo' | 'spades-partners'): PrivateGame {
  let state = createGame({ id: 'never-leak-id', mode, dealer: 3 }, fullDeck());
  if (mode === 'hearts') {
    const passes = state.hands.map((h) => h.slice(0, 3)) as Four<Card[]>;
    state = apply(state, { kind: 'pass-bundle', passes });
  } else for (const seat of [0, 1, 2, 3] as Seat[]) state = apply(state, { kind: 'bid', seat, bid: 3 });
  return state;
}
test('TRIAL: isolated one-trick illustrations end at completed trick in every mode', () => {
  for (const mode of ['hearts', 'spades-solo', 'spades-partners'] as const) {
    const state = starting(mode),
      original = structuredClone(state),
      obs = observe(state, state.turn!),
      before = structuredClone(obs);
    const alternative = chooseAction(obs),
      trial = simulateTrial(obs, alternative, 177);
    assert.equal(trial.status, 'available');
    if (trial.status !== 'available') continue;
    assert.equal(trial.label, 'Possible continuation');
    assert.equal(
      trial.policyVersion,
      mode === 'hearts' ? 'hearts-baseline-1.0.0' : 'spades-tactics-2.0.0',
    );
    assert.equal(trial.frames.length, 5);
    assert.equal(trial.plays.length, 4);
    assert.equal(trial.frames.at(-1)?.phase, 'trick-end');
    assert.equal(trial.frames.at(-1)?.history.length, 1);
    for (const frame of trial.frames) {
      assertObservation(frame);
      assert.equal(frame.seat, obs.seat);
      assert.equal('hands' in frame, false);
      assert.equal('seed' in frame, false);
      assert.equal('id' in frame, false);
    }
    assert.deepEqual(obs, before);
    assert.deepEqual(state, original);
    assert.deepEqual(simulateTrial(obs, alternative, 177), trial);
    assert.match(trial.limitations.join(' '), /not.*quality grade/);
  }
});
test('TRIAL: same decision knowledge under different actual hidden deals has identical continuation', () => {
  const state = starting('spades-solo'),
    actor = state.turn!,
    alternate = structuredClone(state),
    others = ([0, 1, 2, 3] as Seat[]).filter((s) => s !== actor);
  [alternate.hands[others[0]], alternate.hands[others[1]]] = [
    alternate.hands[others[1]],
    alternate.hands[others[0]],
  ];
  const obs = observe(state, actor),
    otherObs = observe(alternate, actor);
  assert.deepEqual(obs, otherObs);
  const action = chooseAction(obs);
  assert.deepEqual(simulateTrial(obs, action, 42), simulateTrial(otherObs, action, 42));
});
test('TRIAL: simulated seats use their own legal hand, and partial tricks stop after remaining seats', () => {
  let state = starting('spades-partners');
  for (let i = 0; i < 2; i++) {
    const a = chooseAction(observe(state, state.turn!));
    if (a.kind === 'play') state = apply(state, a);
  }
  const obs = observe(state, state.turn!),
    a = chooseAction(obs);
  const trial = simulateTrial(obs, a, 61);
  assert.equal(trial.status, 'available');
  if (trial.status === 'available') {
    assert.equal(trial.plays.length, 2);
    assert.equal(trial.frames.length, 3);
    const end = trial.frames.at(-1)!;
    assert.equal(end.trick.length, 4);
    assert.equal(new Set(end.trick.map((p) => p.card)).size, 4);
  }
});
test('TRIAL: illegal alternative or non-playing phase returns unavailable without applying', () => {
  const state = starting('spades-solo'),
    obs = observe(state, 0);
  const before = structuredClone(obs);
  assert.equal(simulateTrial(obs, { kind: 'play', seat: 0, card: 'not-card' }, 1).status, 'unavailable');
  assert.equal(simulateTrial(obs, { kind: 'bid', seat: 0, bid: 3 }, 1).status, 'unavailable');
  const pass = observe(createGame({ id: 'pass', mode: 'hearts', dealer: 3 }, fullDeck()), 0);
  assert.equal(simulateTrial(pass, chooseAction(pass), 1).status, 'unavailable');
  assert.deepEqual(obs, before);
});
