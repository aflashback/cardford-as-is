// Post-game observer check only. Does not modify deals, accepted decisions or runtime code.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGame, apply, collectTrick, legalActions, actionId } from '../../../web/server/game/index.ts';
import { observe } from '../../../web/server/observations/index.ts';

const config = JSON.parse(readFileSync(new URL('./deals.json', import.meta.url), 'utf8'));
const episode = config.episodes.find(e => e.id === 'partners-nil-race-01');
const record = JSON.parse(readFileSync(new URL('./records/partners-nil-race-01.json', import.meta.url), 'utf8'));
assert.ok(episode);
const alternative = structuredClone(episode);
const mayaIndex = alternative.hands[0].indexOf('S5');
const jasonIndex = alternative.hands[2].indexOf('C2');
assert.ok(mayaIndex >= 0 && jasonIndex >= 0);
alternative.hands[0][mayaIndex] = 'C2';
alternative.hands[2][jasonIndex] = 'S5';

function replay(e) {
  const first = (e.dealer + 1) % 4;
  const deck = Array.from({ length: 52 }, (_, i) => e.hands[(first + i) % 4][Math.floor(i / 4)]);
  let state = createGame({ id: e.id, mode: e.mode, dealer: e.dealer }, deck);
  state.scores = [...e.scores];
  state.bags = [...e.bags];
  let accepted = 0;
  for (const decision of record.decisions.filter(d => d.seq <= 44)) {
    assert.equal(state.turn, decision.seat);
    assert.ok(legalActions(state, state.turn).some(a => actionId(a) === actionId(decision.action)), `Illegal at seq ${decision.seq}`);
    state = apply(state, decision.action);
    if (state.phase === 'trick-end') state = collectTrick(state);
    accepted++;
  }
  assert.equal(accepted, 44);
  return state;
}
function packet(s) {
  const o = observe(s, s.turn);
  return { game: s.mode, ruleProfile: s.ruleProfileId, name: config.names[s.turn], seat: s.turn, names: config.names, dealer: s.dealer, competition: [[0,2],[1,3]], phase: s.phase, hand: o.hand, bids: o.bids, tricks: o.tricks, scores: o.scores, bags: o.bags, completedTricks: o.history, currentTrick: o.trick, spadesBroken: s.spadesBroken, legalActions: legalActions(s, s.turn).map(actionId).sort() };
}
const actual = replay(episode);
const counterexample = replay(alternative);
assert.equal(actual.turn, 3);
assert.equal(counterexample.turn, 3);
assert.deepEqual(packet(actual), record.decisions.find(d => d.seq === 45).packet);
assert.deepEqual(packet(counterexample), packet(actual));
assert.notDeepEqual(counterexample.hands[2], actual.hands[2]);
assert.ok(counterexample.hands[2].includes('S5'));
assert.ok(!counterexample.hands[2].includes('C2'));
const hash = object => createHash('sha256').update(JSON.stringify(object)).digest('hex');
const result = {
  episodeId: episode.id,
  targetDecision: 45,
  status: 'passed',
  purpose: 'Counterexample to claimed exact ownership; not a strategic acceptance label',
  swap: { fromJasonToMaya: 'C2', fromMayaToJason: 'S5' },
  replayedDecisionsPerDeal: 44,
  productionReducerReplaysLegal: true,
  sarahPacketMatchesSavedDecision: true,
  sarahPacketIdenticalAcrossDeals: true,
  originalPacketHash: hash(packet(actual)),
  alternativePacketHash: hash(packet(counterexample)),
  observerOnlyActualRemaining: { Maya: actual.hands[0], Jason: actual.hands[2] },
  observerOnlyAlternativeRemaining: { Maya: counterexample.hands[0], Jason: counterexample.hands[2] },
  conclusion: 'Sarah cannot deduce from her seq45 packet that Jason holds C2, H2 and exactly one spade.'
};
writeFileSync(new URL('./records/partners-nil-race-01.counterexample.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
