import assert from 'node:assert/strict';
import test from 'node:test';
import { actionId } from '../game/index.ts';
import { observe } from '../observations/index.ts';
import { analyzeDecision } from '../strategy/index.ts';
import { explain } from '../coaching/templates.ts';
import { buildFacts } from '../games/spades/reasoning/knowledge.ts';
import { assessDoubleNil } from '../games/spades/reasoning/nil.ts';
import { bidAll, playSequence, spadesDeal } from './support/spades-fixtures.ts';

test('P04 distinguishes a guaranteed opponent winner from sacrificing either live Nil', () => {
  const state = playSequence(bidAll(spadesDeal([
    ['H2', 'HA'], ['HK'], ['H4'], ['H3'],
  ], 'spades-partners', 0), [0, 2, 0, 2]), ['HK', 'H4', 'H3']);
  const obs = observe(state, 0);
  const facts = buildFacts(obs);
  const results = assessDoubleNil(obs, facts);
  assert.equal(results.find((result) => result.actionId === actionId({ kind: 'play', seat: 0, card: 'H2' }))?.result, 'both-survive-this-trick');
  assert.equal(results.find((result) => result.actionId === actionId({ kind: 'play', seat: 0, card: 'HA' }))?.result, 'own-nil-fails');
  const analysis = analyzeDecision(obs);
  if (analysis.action.kind !== 'play') throw new Error('Expected a card play.');
  assert.equal(analysis.action.card, 'H2');
  assert.ok(analysis.trace?.candidates.find((candidate) => candidate.actionId === actionId(analysis.action))
    ?.effects.some((effect) => effect.id === 'P04.keep-both-live'));
  assert.equal(explain(obs, analysis).focus, 'Keep both Nils live');
});
