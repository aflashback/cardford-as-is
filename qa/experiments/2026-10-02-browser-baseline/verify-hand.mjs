import assert from 'node:assert/strict';
import { parseDevScenarios } from '../../../web/server/dev-scenarios.ts';
import { createGame, apply, collectTrick, actionId } from '../../../web/server/game/index.ts';
import { observe } from '../../../web/server/observations/index.ts';

// Invoked only after the browser hand ends. It is never an input to the player.
export function verifyHand(run, audit, playerRecord, catalog) {
  const fixture = parseDevScenarios(catalog).find(s => s.metadata.id === run.scenarioId);
  assert.ok(fixture);
  assert.deepEqual(audit.deals[0], fixture.deck, 'Actual private deck must equal the frozen paired fixture');
  assert.equal(audit.openingScenario.dealer, fixture.dealer);
  assert.deepEqual(audit.openingScenario.metadata, fixture.metadata);
  assert.equal(audit.reasoningPolicy.policyVersion, run.policy);
  let state = createGame({ id: audit.gameId, mode: run.mode, dealer: fixture.dealer }, fixture.deck);
  assert.deepEqual(state.scores, [0, 0, 0, 0]); assert.deepEqual(state.bags, [0, 0, 0, 0]);
  const bots = Object.values(audit.botDecisionAudits).sort((a, b) => a.revision - b.revision);
  let human = 0, bot = 0, actions = 0;
  for (const entry of audit.actions) {
    if (entry.kind === 'collect') { state = collectTrick(state); continue; }
    assert.equal(entry.kind, 'action');
    const obs = observe(state, state.turn);
    if (state.turn === 0) {
      const choice = playerRecord.playerDecisions[human], saved = audit.humanDecisions[human++];
      assert.ok(choice); assert.equal(choice.before.decisionId, saved.id);
      assert.equal(actionId(choice.action), actionId(entry.action));
      assert.equal(choice.dom.enabled, true); assert.deepEqual(saved.observation, obs);
      assert.equal(saved.assisted, false);
    } else {
      const saved = bots[bot++]; assert.ok(saved);
      assert.deepEqual(saved.observation, obs); assert.deepEqual(saved.action, entry.action);
      assert.deepEqual(saved.analysis.action, entry.action); assert.equal(saved.policyVersion, run.policy);
    }
    state = apply(state, entry.action); actions++;
  }
  assert.equal(human, 14); assert.equal(bot, 42); assert.equal(actions, 56);
  assert.equal(state.history.length, 13); assert.deepEqual(state, audit.state);
  return { fixture: 'exact', replay: 'exact', humanChoices: human, botChoices: bot, openingScores: 'zero', openingBags: 'zero' };
}
