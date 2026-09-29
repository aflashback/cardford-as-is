import assert from 'node:assert/strict';
import test from 'node:test';
import { collectTrick } from '../game/index.ts';
import { observe } from '../observations/index.ts';
import { bidAll, playSequence, spadesDeal } from './support/spades-fixtures.ts';
import { inferPartnerBehavior } from '../games/spades/reasoning/signals.ts';

test('a partner king lead that wins is a soft control hint, never proof of the unseen ace', () => {
  const initial = bidAll(spadesDeal([
    ['H3', 'C2'], ['H2', 'HA'], ['HK', 'H5'], ['H4', 'C3'],
  ], 'spades-partners', 1), [2, 2, 2, 2]);
  const state = collectTrick(playSequence(initial, ['HK', 'H4', 'H3', 'H2']));
  const hints = inferPartnerBehavior(observe(state, 0));
  assert.ok(hints.some((hint) => hint.kind === 'possible-control' && hint.suit === 'H'));
  assert.ok(hints.every((hint) => !('owner' in hint)));
  assert.ok(hints.some((hint) => hint.counterexample.includes('higher')));
});

test('an off-suit partner discard is hard void evidence but only a soft preference hint', () => {
  const state = playSequence(bidAll(spadesDeal([
    ['CA'], ['C3'], ['H2'], ['C4'],
  ], 'spades-partners'), [2, 2, 2, 2]), ['CA', 'C3', 'H2']);
  const hints = inferPartnerBehavior(observe(state, 0));
  assert.ok(hints.some((hint) => hint.kind === 'public-void' && hint.suit === 'C' && hint.certainty === 'fact'));
  assert.ok(hints.some((hint) => hint.kind === 'possible-preference' && hint.suit === 'H' && hint.certainty === 'hypothesis'));
});
