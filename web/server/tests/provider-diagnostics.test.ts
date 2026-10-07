import assert from 'node:assert/strict';
import test from 'node:test';
import { responseFieldCategories } from '../providers/diagnostics.ts';
import { JEV_MODEL,RESOLVED_MODELS,selectWithJevV2 as selectWithJev,OPENROUTER_ADAPTER_VERSION } from '../providers/openrouter-v2.ts';
import { createGame,fullDeck } from '../game/index.ts';
import { observe } from '../observations/index.ts';

const valid=()=>({model:JEV_MODEL,answers:{move:{type:'choice',choice:'bid:1',probabilities:{'bid:0':0.25,'bid:1':0.75},confidence:0.5}},usage:{input_tokens:1,output_tokens:1,cost:0}});
test('M11 field diagnostics use static categories for strict invalid fixtures',()=>{
  assert.deepEqual(responseFieldCategories(valid(),['bid:0','bid:1'],RESOLVED_MODELS),[]);
  const fixtures:[unknown,string][]=[
    [null,'envelope'],[{...valid(),model:'secret-canary-unapproved'},'model'],
    [{...valid(),answers:{}},'answer-set'],
    [{...valid(),answers:{move:{...valid().answers.move,choice:'outside'}}},'choice'],
    [{...valid(),answers:{move:{...valid().answers.move,confidence:Infinity}}},'confidence'],
    [{...valid(),answers:{move:{...valid().answers.move,probabilities:{'bid:1':1}}}},'distribution-keys'],
    [{...valid(),answers:{move:{...valid().answers.move,probabilities:{'bid:0':-0.1,'bid:1':1.1}}}},'probability'],
    [{...valid(),answers:{move:{...valid().answers.move,probabilities:{'bid:0':0.1,'bid:1':0.1}}}},'distribution-total'],
    [{...valid(),answers:{move:{...valid().answers.move,choice:'bid:0'}}},'choice-ranking'],
    [{...valid(),usage:{input_tokens:-1}},'usage'],[{...valid(),usage:{cost:-1}},'cost'],[{...valid(),id:[]},'metadata'],
  ];
  for(const [body,category] of fixtures)assert.ok(responseFieldCategories(body,['bid:0','bid:1'],RESOLVED_MODELS).includes(category as ReturnType<typeof responseFieldCategories>[number]));
});
test('M11 malformed provider fixture returns and hands accounting sanitized categories without sensitive error values',async()=>{
  const obs=observe(createGame({id:'diagnostic-fixture',mode:'spades-solo',dealer:3},fullDeck()),0);
  const records:unknown[]=[];
  const response={...valid(),model:'secret-canary-model',answers:{move:{...valid().answers.move,choice:'private-canary-choice'}},error:{message:'secret-canary-response'}};
  const result=await selectWithJev({observation:obs,candidateIds:['bid:0','bid:1'],mode:'shadow',experiment:{id:'offline-fixture',maxRequests:1,maxCostUsd:0.01,adapterVersion:OPENROUTER_ADAPTER_VERSION},deadlineAt:Date.now()+1000},{
    loadKey:async()=> 'fixture-secret-canary',attempts:{adapterVersion:OPENROUTER_ADAPTER_VERSION,reserve:async(experiment)=>{assert.equal(experiment.adapterVersion,OPENROUTER_ADAPTER_VERSION);return 'fixture-attempt';},finish:async(_id,record)=>{assert.equal(record.adapterVersion,OPENROUTER_ADAPTER_VERSION);records.push(record);}},
    fetch:async()=>new Response(JSON.stringify(response)),
  });
  assert.equal(result.status,'unavailable');
  assert.equal(result.adapterVersion,OPENROUTER_ADAPTER_VERSION);
  if(result.status==='unavailable'){assert.equal(result.reason,'invalid-response');assert.deepEqual(result.diagnosticCategories,['choice','model']);}
  assert.equal(JSON.stringify([result,records]).includes('canary'),false);
});
