// Specific public-information fact checks, not an optimal-play solver.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const base = new URL('.', import.meta.url);
const packet = (id, seq) => JSON.parse(readFileSync(new URL(`records/${id}.json`, base), 'utf8')).decisions.find(d => d.seq === seq).packet;
const publicCards = p => [...p.completedTricks.flatMap(t => t.plays.map(x => x.card)), ...p.currentTrick.map(x => x.card)];
const report = [];
let p = packet('partners-void-partner-leads', 31);
assert.ok(publicCards(p).includes('SA'));
assert.ok(p.currentTrick.some(x => x.card === 'SK'));
report.push({ episode: 'partners-void-partner-leads', seq: 31, fact: 'SA has already been played. No spade can overtake the current SK.', input: 'seat packet only' });
p = packet('partners-void-partner-leads', 35);
assert.ok(p.completedTricks.some(t => t.plays[0].card[0] === 'S' && t.plays.some(x => x.seat === 3 && x.card[0] !== 'S')));
report.push({ episode: 'partners-void-partner-leads', seq: 35, fact: 'Sarah has publicly failed to follow a spade lead, so she cannot trump this trick.', input: 'seat packet only' });
for (const seq of [33, 37]) {
  p = packet('solo-void-trumps-at-jason', seq);
  assert.equal(new Set(publicCards(p).filter(card => card[0] === 'S')).size, 13);
  report.push({ episode: 'solo-void-trumps-at-jason', seq, fact: 'All thirteen spades have been played. Nobody can trump a later lead.', input: 'seat packet only' });
}
p = packet('solo-void-trumps-at-jason', 35);
assert.ok(p.hand.every(card => card[0] === 'H'));
assert.equal(new Set(publicCards(p).filter(card => card[0] === 'S')).size, 13);
assert.equal(new Set([...publicCards(p), ...p.hand].filter(card => card[0] === 'H')).size, 13);
assert.ok(p.currentTrick.length && p.currentTrick[0].card[0] !== 'H');
report.push({ episode: 'solo-void-trumps-at-jason', seq: 35, fact: 'Maya owns every remaining heart, has only hearts and cannot win the current other-suit trick. Others cannot lead a heart, so she cannot regain the lead this hand.', input: 'seat packet only' });
p = packet('partners-void-trumps-at-jason', 21);
for (const seat of [1, 3]) assert.ok(p.completedTricks.some(t => t.plays[0].card[0] === 'S' && t.plays.some(x => x.seat === seat && x.card[0] !== 'S')));
assert.ok(p.completedTricks.some(t => t.plays[0].card[0] === 'H' && t.plays.some(x => x.seat === 2 && x.card[0] !== 'H')));
const accounted = new Set([...publicCards(p), ...p.hand]);
const unknownSpades = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'].map(rank => 'S' + rank).filter(card => !accounted.has(card));
assert.deepEqual(unknownSpades, ['S5', 'S6', 'S7']);
report.push({ episode: 'partners-void-trumps-at-jason', seq: 21, fact: 'Both opponents have proved they hold no spades; Jason has proved he holds no hearts. All three spades outside Maya own hand must belong to Jason. Leading another spade makes her partner spend one.', input: 'seat packet only', implication: 'Compare a heart lead and a later return of the lead; no optimal-action claim.' });
mkdirSync(new URL('analysis/', base), { recursive: true });
writeFileSync(new URL('analysis/public-fact-checks.json', base), JSON.stringify({ status: 'passed', checks: report, scope: 'Six specific public-information checks; no general error rate or strategic ranking.' }, null, 2) + '\n');
console.log('Passed six specific public-information checks.');
