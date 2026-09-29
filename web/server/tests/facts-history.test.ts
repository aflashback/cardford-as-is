import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeDecision } from '../strategy/index.ts';
import { getMemory, observe } from '../observations/index.ts';
import { bidAll, playSequence, spadesDeal } from './support/spades-fixtures.ts';

test('KNOW-05: omitted breaking trick cannot turn a later spade lead into proved side-suit voids', () => {
  const state = playSequence(
    bidAll(
      spadesDeal([
        ['C2'],
        ['S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'SJ', 'SQ', 'SK', 'H2'],
        ['C3'],
        ['C4'],
      ]),
      [3, 3, 3, 3],
    ),
    ['C2', 'S2', 'C3', 'C4', 'S3'],
  );
  assert.ok(state.hands[1].includes('H2'), 'the legal spade leader actually retains a heart');
  const complete = observe(state, 2);
  assert.equal(analyzeDecision(complete).facts.knowledgeComplete, true);
  const incomplete = structuredClone(complete);
  incomplete.history = [];
  incomplete.events = incomplete.events.slice(-1);
  incomplete.memory = getMemory(incomplete);
  const facts = analyzeDecision(incomplete).facts;
  assert.equal(facts.knowledgeComplete, false);
  assert.equal(
    facts.voids.H.includes(1),
    false,
    'missing history cannot prove the spade lead was restricted',
  );
  assert.equal(facts.voids.D.includes(1), false);
  assert.ok(facts.possibleOwners.find((entry) => entry.card === 'H2')?.seats.includes(1));
});

test('KNOW-05: complete first-trick spade lead still proves the leader has only spades', () => {
  const state = playSequence(
    bidAll(
      spadesDeal(
        [
          ['C2'],
          ['S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'SJ', 'SQ', 'SK', 'SA'],
          ['C3'],
          ['C4'],
        ],
        'spades-partners',
        0,
      ),
      [3, 3, 3, 3],
    ),
    ['S2'],
  );
  const facts = analyzeDecision(observe(state, 2)).facts;
  assert.equal(facts.knowledgeComplete, true);
  for (const suit of ['C', 'D', 'H'] as const) assert.ok(facts.voids[suit].includes(1));
});
