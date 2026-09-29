import assert from 'node:assert/strict';
import test from 'node:test';
import { observe } from '../observations/index.ts';
import { buildFacts } from '../games/spades/reasoning/knowledge.ts';
import { assessEntryRoute } from '../games/spades/reasoning/entries.ts';
import { analyzeDecision } from '../strategy/index.ts';
import { actionId } from '../game/index.ts';
import { explain } from '../coaching/templates.ts';
import { bidAll, playSequence, spadesDeal } from './support/spades-fixtures.ts';

test('P11 recognizes a reachable win-now then offer-partner-ruff route', () => {
  const state = playSequence(bidAll(spadesDeal([
    ['CA', 'CK', 'C5', 'C6', 'D2'],
    ['C2', 'C3', 'DA'],
    ['H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', 'D3', 'S2', 'S3', 'S4'],
    ['C4', 'C7', 'D4'],
  ]), [3, 3, 3, 3]), [
    'CA', 'C3', 'H2', 'C4',
    'D2', 'DA', 'D3', 'D4',
    'C2', 'H3', 'C7',
  ]);
  const obs = observe(state, 0);
  const facts = buildFacts(obs);
  const winning = obs.legalActions.find((action) => action.kind === 'play' && action.card === 'CK')!;
  const route = assessEntryRoute(obs, facts, winning);
  assert.ok(route);
  assert.equal(route?.offerSuit, 'C');
  assert.ok(route!.weight > 0);
  const analysis = analyzeDecision(obs);
  assert.ok(analysis.trace?.candidates.find((candidate) => candidate.actionId === actionId(winning))
    ?.effects.some((effect) => effect.id === 'P11.route-to-ruff'));
  assert.ok(analysis.trace?.candidates.find((candidate) => candidate.actionId === actionId(analysis.action))
    ?.effects.some((effect) => effect.id === 'P11.route-to-ruff'));
  assert.equal(explain(obs, analysis).focus, 'Plan the next lead');
  const low = obs.legalActions.find((action) => action.kind === 'play' && action.card === 'C5')!;
  assert.equal(assessEntryRoute(obs, facts, low), null);
});
