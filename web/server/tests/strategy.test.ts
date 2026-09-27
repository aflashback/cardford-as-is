import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, fullDeck, type PrivateGame, type Card, type Play } from '../game/index.ts';
import { observe } from '../observations/index.ts';
import { chooseAction, POLICY_VERSION } from '../strategy/index.ts';
import { explain } from '../coaching/templates.ts';
function position(hand: Card[], trick: Play[] = []): PrivateGame {
  const state = createGame({ id: 'strategy', mode: 'spades-partners', dealer: 3 }, fullDeck());
  state.phase = 'play';
  state.turn = 0;
  state.bids = [3, 3, 3, 3];
  state.trick = trick;
  state.hands[0] = hand;
  return state;
}
const own = ['H2', 'HA', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4', 'S2', 'S3', 'S4', 'S5', 'S6'];
const trick: Play[] = [
  { seat: 2, card: 'HK' },
  { seat: 3, card: 'H3' },
];
test('POLICY: coach and bot cover live Nil after positive contract met', () => {
  const state = position(own, trick);
  state.bids = [3, 3, 0, 3];
  state.tricks = [3, 0, 0, 0];
  const obs = observe(state, 0);
  assert.deepEqual(chooseAction(obs), { kind: 'play', seat: 0, card: 'HA' });
  const advice = explain(obs);
  assert.equal(advice.card, 'HA');
  assert.match(advice.reason, /still/);
  assert.match(advice.suggestion, /off your partner/);
  assert.equal(advice.policyVersion, POLICY_VERSION);
});
test('POLICY: solo mode has no partner objective or wording', () => {
  const state = position(own, trick);
  state.mode = 'spades-solo';
  state.ruleProfileId = 'spades-solo-training-1.0.0';
  state.bids = [3, 3, 0, 3];
  state.tricks = [3, 0, 0, 0];
  const obs = observe(state, 0);
  assert.deepEqual(chooseAction(obs), { kind: 'play', seat: 0, card: 'H2' });
  assert.doesNotMatch(JSON.stringify(explain(obs)), /partner|your team/);
});
test('POLICY: own live Nil underplays, failed Nil excludes contract-credit claims', () => {
  const state = position(own, trick);
  state.bids[0] = 0;
  assert.equal(explain(observe(state, 0)).card, 'H2');
  assert.match(explain(observe(state, 0)).focus, /Nil/);
  state.tricks[0] = 1;
  state.mode = 'spades-solo';
  state.ruleProfileId = 'spades-solo-training-1.0.0';
  assert.doesNotMatch(explain(observe(state, 0)).reason, /partner/);
  assert.match(explain(observe(state, 0)).reason, /bags/);
});
test('POLICY: no legal cover is stated factually; unfinished ordinary partner trick stays uncertain', () => {
  const state = position(
    own.map((c) => (c === 'HA' ? 'HQ' : c)),
    trick,
  );
  state.bids[2] = 0;
  assert.match(explain(observe(state, 0)).reason, /No legal card/);
  state.bids[2] = 3;
  const advice = explain(observe(state, 0));
  assert.match(advice.reason, /still/);
  assert.doesNotMatch(advice.reason, /team wins|has won/);
});
test('POLICY: only a singleton complete legal set receives forced provenance', () => {
  const state = position(['C2', 'D2']);
  state.mode = 'hearts';
  state.ruleProfileId = 'hearts-training-1.0.0';
  const obs = observe(state, 0);
  assert.equal(obs.legalActions.length, 1);
  assert.equal(explain(obs).provenance, 'forced');
  assert.equal(explain(obs).card, 'C2');
  const pass = createGame({ id: 'pass', mode: 'hearts', dealer: 3 }, fullDeck());
  assert.equal(explain(observe(pass, 0)).provenance, 'code');
  assert.equal(explain(observe(pass, 0)).pass?.length, 3);
});
test('POLICY: bid and pass recommendations are exactly shared with bot policy', () => {
  for (const mode of ['hearts', 'spades-solo', 'spades-partners'] as const) {
    const obs = observe(createGame({ id: 'shared', mode, dealer: 3 }, fullDeck()), 0);
    const a = chooseAction(obs);
    const advice = explain(obs);
    if (a.kind === 'pass') assert.deepEqual(advice.pass, a.cards);
    else if (a.kind === 'bid') assert.equal(advice.bid, a.bid);
    assert.equal(advice.provenance, 'code');
  }
});
test('POLICY: no recommendation for another active seat; receiving cards changes own legal facts', () => {
  const state = position(own);
  state.turn = 1;
  const advice = explain(observe(state, 0));
  assert.equal(advice.card, undefined);
  assert.equal(advice.pass, undefined);
  assert.equal(advice.bid, undefined);
  state.turn = 0;
  state.mode = 'hearts';
  state.ruleProfileId = 'hearts-training-1.0.0';
  state.hands[0] = ['C2', ...own.filter((c) => c !== 'C2')];
  state.passes[0].incoming = ['C2'];
  assert.equal(explain(observe(state, 0)).card, 'C2');
  assert.doesNotMatch(explain(observe(state, 0)).notice, /no clubs/i);
});
test('POLICY: pass reference preserves queen-protection and possible moon alternatives', () => {
  const state = createGame({ id: 'alternatives', mode: 'hearts', dealer: 3 }, fullDeck());
  state.hands[0] = ['S2', 'S3', 'SQ', 'SK', 'SA', 'HA', 'HK', 'HQ', 'HJ', 'H10', 'CA', 'DA', 'D2'];
  const obs = observe(state, 0);
  assert.equal(obs.legalActions.length, 286);
  assert.ok(
    obs.legalActions.some(
      (a) =>
        a.kind === 'pass' && a.cards.includes('D2') && !a.cards.some((c) => ['S2', 'S3', 'SQ'].includes(c)),
    ),
  );
  assert.match(explain(obs).reason, /queen protection.*moon/);
});
