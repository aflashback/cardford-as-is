// Documentation examples only. No production strategy or provider is invoked.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { collectTrick, fullDeck } from '../../web/server/game/index.ts';
import { observe } from '../../web/server/observations/index.ts';
import { buildFacts } from '../../web/server/games/spades/reasoning/knowledge.ts';
import { scoreCompetitor } from '../../web/server/game/spades/score.ts';
import { spadesDeal, bidAll, playSequence, assertSpadesConservation } from '../../web/server/tests/support/spades-fixtures.ts';

const base = [
  ['DA', 'DQ', 'DK', 'D10', 'D8', 'C2', 'C3', 'C4', 'C5', 'H2', 'H3', 'S3', 'S4'],
  ['D2', 'DJ', 'C6', 'C7', 'C8', 'H4', 'H5', 'H6', 'H7', 'S2', 'S5', 'S6', 'S7'],
  ['D3', 'D6', 'D9', 'C9', 'C10', 'CJ', 'H8', 'H9', 'H10', 'S8', 'S9', 'S10', 'SJ'],
  ['D4', 'D5', 'D7', 'CQ', 'CK', 'CA', 'HJ', 'HQ', 'HK', 'HA', 'SQ', 'SK', 'SA'],
];
const prefix = ['DA', 'D2', 'D3', 'D4', 'DQ', 'DJ', 'D6', 'D5'];
const definitions = [
  { id: 'DG-A', swap: null, kingSeat: 0, eastDiamonds: [], third: ['DK', 'S2', 'D9', 'D7'], winner: 1 },
  { id: 'DG-B', swap: [0, 'DK', 1, 'C6'], kingSeat: 1, eastDiamonds: ['DK'], third: ['D10', 'DK', 'D9', 'D7'], winner: 1 },
  { id: 'DG-C', swap: [0, 'D10', 1, 'C7'], kingSeat: 0, eastDiamonds: ['D10'], third: ['DK', 'D10', 'D9', 'D7'], winner: 0 },
  { id: 'DG-D', swap: [0, 'DK', 3, 'CQ'], kingSeat: 3, eastDiamonds: [], third: ['D10', 'S2', 'D9', 'DK'], winner: 1 },
];

function replay(definition) {
  const hands = structuredClone(base);
  if (definition.swap) {
    const [a, cardA, b, cardB] = definition.swap;
    hands[a][hands[a].indexOf(cardA)] = cardB;
    hands[b][hands[b].indexOf(cardB)] = cardA;
  }
  assert.deepEqual(hands.flat().toSorted(), fullDeck().toSorted());
  return collectTrick(playSequence(bidAll(spadesDeal(hands), [3, 3, 3, 3]), prefix));
}

test('DG-A through DG-D: four complete legal deals reach the documented two tricks', () => {
  for (const definition of definitions) {
    const state = replay(definition);
    assertSpadesConservation(state);
    assert.equal(state.ruleProfileId, 'spades-training-1.0.0');
    assert.equal(state.history.length, 2);
    assert.deepEqual(state.history.map((trick) => trick.winner), [0, 0]);
    assert.equal(state.turn, 0, 'Partner, not the observing player, leads next.');
    assert.deepEqual(state.hands[1].filter((card) => card.startsWith('D')), definition.eastDiamonds);
    assert.ok(state.hands[definition.kingSeat].includes('DK'));
    assert.deepEqual(state.hands.map((hand) => hand.length), [11, 11, 11, 11]);
  }
});

test('Identical South observations do not prove king ownership or an East diamond void', () => {
  const observations = definitions.map((definition) => observe(replay(definition), 2));
  const facts = observations.map(buildFacts);
  for (let i = 1; i < observations.length; i++) {
    assert.deepEqual(observations[i], observations[0]);
    assert.deepEqual(facts[i], facts[0]);
  }
  assert.equal(facts[0].knowledgeComplete, true, 'History is complete; hidden ownership is not.');
  assert.deepEqual(facts[0].possibleOwners.find((row) => row.card === 'DK').seats, [0, 1, 3]);
  assert.deepEqual(facts[0].voids.D, []);
  assert.equal(observations[0].legalActions.length, 0, 'South is observing, not choosing the next lead.');
});

test('Legal third diamond continuations distinguish ruff, retained king and continued follow', () => {
  for (const definition of definitions) {
    const state = playSequence(replay(definition), definition.third);
    assertSpadesConservation(state);
    assert.equal(state.history.length, 3);
    assert.equal(state.history[2].winner, definition.winner);
    const facts = buildFacts(observe(state, 2));
    assert.equal(facts.voids.D.includes(1), definition.eastDiamonds.length === 0);
  }
});

test('Guide arithmetic: Nil tradeoff and tenth ordinary bag use the frozen scorer', () => {
  // Complete focal-team outcomes with bid 0+11; opponents take the remaining tricks.
  assert.equal(scoreCompetitor({ bids: [0, 11], tricks: [0, 10], oldBags: 0 }).delta, -10);
  assert.equal(scoreCompetitor({ bids: [0, 11], tricks: [1, 11], oldBags: 0 }).delta, 10);
  assert.equal(scoreCompetitor({ bids: [3, 3], tricks: [3, 3], oldBags: 9 }).delta, 60);
  assert.equal(scoreCompetitor({ bids: [3, 3], tricks: [4, 3], oldBags: 9 }).delta, -39);
});

test('Guide has 60 distinct subcases; guide and plan local links resolve', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const paths = [
    'docs/superpowers/specs/2026-09-29-spades-partnership-reasoning-guide.md',
    'docs/superpowers/plans/2026-09-29-partnership-inference.md',
    'planning/decisions/CR-STRAT-007-partnership-inference-guide.md',
    'qa/implementation/partnership-guide-validation.md',
  ];
  const guide = readFileSync(resolve(root, paths[0]), 'utf8');
  const ids = [...guide.matchAll(/^\| (SP-[HLWTENBOX]\d{2}) \|/gm)].map((match) => match[1]);
  assert.equal(ids.length, 60);
  assert.equal(new Set(ids).size, 60);
  for (const path of paths) {
    const absolute = resolve(root, path);
    const text = readFileSync(absolute, 'utf8');
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^https?:/.test(target)) continue;
      assert.ok(existsSync(resolve(dirname(absolute), target)), `${path}: missing ${target}`);
    }
  }
});
