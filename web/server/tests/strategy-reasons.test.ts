import assert from 'node:assert/strict';
import test from 'node:test';
import { fullDeck, type Four, type Card } from '../game/index.ts';
import { observe } from '../observations/index.ts';
import { analyzeDecision } from '../strategy/index.ts';
import { bidAll, playSequence, spadesDeal } from './support/spades-fixtures.ts';

test('P09: fourth-seat forced overtake does not invent a later opponent', () => {
  const state = playSequence(
    bidAll(spadesDeal([['HK', 'HA'], ['H2'], ['HQ'], ['H3']], 'spades-partners', 0), [3, 3, 3, 3]),
    ['H2', 'HQ', 'H3'],
  );
  const analysis = analyzeDecision(observe(state, 0));
  assert.deepEqual(analysis.facts.actorsAfter, []);
  const reason = analysis.reasons.find((item) => item.id === 'P09.partner-security');
  assert.equal(reason?.kind, 'fact');
  assert.match(reason!.text, /Every legal card overtakes your partner/);
  assert.doesNotMatch(reason!.text, /later/);
});

test('S02: being void in led spades describes only cards actually available', () => {
  const hands = ['S', 'C', 'D', 'H'].map((suit) => fullDeck().filter((card) => card[0] === suit)) as Four<
    Card[]
  >;
  const state = playSequence(bidAll(spadesDeal(hands, 'spades-solo'), [3, 3, 3, 3]), ['S2']);
  const analysis = analyzeDecision(observe(state, 1));
  assert.equal(analysis.facts.ledSuit, 'S');
  assert.equal(analysis.facts.suitLengths.S, 0);
  assert.equal(
    analysis.reasons.find((item) => item.id === 'S02.void')?.text,
    'You have no card of the led suit, so any card in your hand is legal.',
  );
});

test('S08: losing the highest held follower does not claim higher cards were preserved', () => {
  const state = playSequence(
    bidAll(spadesDeal([['H2', 'HK'], ['H3'], ['HA'], ['H4']], 'spades-solo', 0), [3, 3, 3, 3]),
    ['H3', 'HA', 'H4'],
  );
  const observation = observe(state, 0);
  assert.ok(!observation.hand.includes('HA'));
  const analysis = analyzeDecision(observation);
  const reason = analysis.reasons.find((item) => item.id === 'S08.preserve-control');
  assert.ok(reason?.actionIds?.includes('play:HK'));
  assert.match(reason!.text, /does not take the current lead/);
  assert.doesNotMatch(reason!.text, /preserves higher/);
});
