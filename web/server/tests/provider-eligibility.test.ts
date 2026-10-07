import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, fullDeck, actionId } from '../game/index.ts';
import { observe } from '../observations/index.ts';
import { providerEligibility } from '../providers/eligibility.ts';
import { selectWithJevV2 as selectWithJev,OPENROUTER_ADAPTER_VERSION, type AttemptPort } from '../providers/openrouter-v2.ts';

test('M11 Hearts pass legal space is explicitly unsupported without trimming',()=>{
  const packet=observe(createGame({id:'hearts-pass',mode:'hearts',dealer:3},fullDeck()),0);
  assert.equal(packet.legalActions.length,286);
  assert.equal(providerEligibility(packet).kind,'unsupported-action-space');
  assert.equal(providerEligibility({legalActions:packet.legalActions.slice(0,255)}).kind,'supported');
});
test('M11 unsupported, off, zero-cap and forced requests reserve and dispatch zero attempts',async()=>{
  const pass=observe(createGame({id:'hearts-pass',mode:'hearts',dealer:3},fullDeck()),0);
  for(const override of [
    {},{mode:'off' as const},{experiment:{id:'fixture',maxRequests:0,maxCostUsd:0.01,adapterVersion:OPENROUTER_ADAPTER_VERSION}},
  ]) {
    let reserved=0,dispatched=0,credentials=0;
    const port:AttemptPort={adapterVersion:OPENROUTER_ADAPTER_VERSION,reserve:async()=>{reserved++;return 'unexpected';},finish:async()=>{throw new Error('unexpected finish');}};
    const result=await selectWithJev({observation:pass,candidateIds:pass.legalActions.map(actionId),mode:'shadow',
      experiment:{id:'fixture',maxRequests:1,maxCostUsd:0.01,adapterVersion:OPENROUTER_ADAPTER_VERSION},deadlineAt:Date.now()+1000,...override}, {
      attempts:port,loadKey:async()=>{credentials++;return 'fixture';},fetch:async()=>{dispatched++;throw new Error('unexpected network');}});
    assert.equal(reserved,0);assert.equal(dispatched,0);assert.equal(credentials,0);
    assert.ok(result.status==='disabled'||(result.status==='unavailable'&&result.reason==='unsupported-action-space'));
  }
  assert.equal(providerEligibility({legalActions:[pass.legalActions[0]]}).kind,'forced');
});
test('M11 V2 rejects missing adapter ledger pins before credentials or reservation',async()=>{
  const packet=observe(createGame({id:'v2-pin',mode:'spades-solo',dealer:3},fullDeck()),0);
  const request={observation:packet,candidateIds:packet.legalActions.map(actionId),mode:'shadow' as const,
    experiment:{id:'fixture',maxRequests:1,maxCostUsd:0.01,adapterVersion:OPENROUTER_ADAPTER_VERSION},deadlineAt:Date.now()+1000};
  const attempts:AttemptPort={adapterVersion:OPENROUTER_ADAPTER_VERSION,reserve:async()=>{throw new Error('must not reserve');},finish:async()=>{throw new Error('must not finish');}};
  const dependencies={attempts,loadKey:async()=>{throw new Error('must not load');}};
  await assert.rejects(()=>selectWithJev({...request,experiment:{...request.experiment,adapterVersion:undefined as unknown as typeof OPENROUTER_ADAPTER_VERSION}},dependencies),/Invalid provider experiment/);
  await assert.rejects(()=>selectWithJev(request,{...dependencies,attempts:{...attempts,adapterVersion:undefined as unknown as typeof OPENROUTER_ADAPTER_VERSION}}),/Invalid provider experiment/);
});
