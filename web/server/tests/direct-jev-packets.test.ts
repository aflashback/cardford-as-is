import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDirectJevPacket } from '../evaluation/multi-game/direct-jev-packets.ts';
import { sourceState } from './support/observed-spades.ts';
import { observe } from '../observations/index.ts';
import { actionId,cardSuit,createGame,fullDeck } from '../game/index.ts';

test('M11 new direct J0/J1 keep the complete legal set and J1 adds exact facts only',()=>{
  for(const fixture of ['partner-resource','no-entry','sweep','bid-lower-bound']) {
    const state=sourceState(fixture),obs=observe(state,state.turn!);
    for(const arm of ['J0','J1'] as const) {
      const packet=buildDirectJevPacket(obs,arm);assert.equal(packet.dispatchAuthorized,false);assert.equal(packet.observedModel,null);assert.ok(packet.request);
      assert.deepEqual(Object.keys(packet.request.questions.move.criteria),obs.legalActions.map(actionId));
      for(const forbidden of ['policyVersion','selectedActionId','reasonIds','case-partner-resource','ordering weights','"hands"','"seed"','"stance"','"effects"'])assert.equal(JSON.stringify(packet).includes(forbidden),false,forbidden);
      assert.equal(Object.hasOwn(packet.request.state,'exactFacts'),arm==='J1');
    }
  }
});
test('M11 direct arms ignore compatible concealed changes and explicitly withhold unsupported Hearts pass',()=>{
  const state=sourceState('partner-resource'),obs=observe(state,state.turn!);
  const altered=structuredClone(state);
  const swap=altered.hands[1].flatMap((left,i)=>altered.hands[3].map((right,j)=>({left,right,i,j}))).find(pair=>cardSuit(pair.left)===cardSuit(pair.right));
  assert.ok(swap,'two unobserved opponent cards of the same suit preserve public voids and hand capacities');
  [altered.hands[1][swap.i],altered.hands[3][swap.j]]=[swap.right,swap.left];
  for(const arm of ['J0','J1'] as const)assert.deepEqual(buildDirectJevPacket(obs,arm),buildDirectJevPacket(observe(altered,obs.seat),arm));
  const pass=observe(createGame({id:'hearts-pass-readiness',mode:'hearts',dealer:3},fullDeck()),0);
  assert.equal(buildDirectJevPacket(pass,'J0').request,null);assert.equal(buildDirectJevPacket(pass,'J1').eligibility.kind,'unsupported-action-space');
});
