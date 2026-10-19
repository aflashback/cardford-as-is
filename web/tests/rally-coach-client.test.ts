import assert from 'node:assert/strict';
import test from 'node:test';
import {CoachMutationGate,coachPendingKey,coachSessionLabel,packCoachPending,readCoachPending,restoreCoachPending,saveCoachPending,type CoachOperation} from '../src/rally/coachCommands.ts';
import {api,ApiFailure,definiteFailure} from '../src/api/client.ts';
import {clearLeases,readLease,retainLease} from '../src/api/controlLease.ts';
import {validateCoachUIStartRequest,validateCoachUIItemRequest,validateCoachUIFeedbackRequest} from '../shared/local-service.validators.mjs';

const envelope={commandId:'coach-command',gameId:'game-a',expectedRevision:3,controlLeaseToken:'private-lease',decisionId:'decision-a'};
const start:CoachOperation={kind:'start',body:{...envelope,kind:'cue'}};

test('local-fixture presentation reflects finite allowance rather than granting unlimited',()=>{
  assert.equal(coachSessionLabel({unlimited:false,remaining:1,mode:'local-fixture'}),'1 of 2 sessions left today · local preview');
  assert.equal(coachSessionLabel({unlimited:false,remaining:0,mode:'local-fixture'}),'0 of 2 sessions left today · local preview');
  assert.equal(coachSessionLabel({unlimited:true,remaining:null,mode:'local-fixture'}),'Unlimited coaching · local preview');
  assert.equal(coachSessionLabel({unlimited:true,remaining:null,mode:'paid'}),'Unlimited coaching');
});

test('stored intents are owner/TTL scoped, secret-free and strictly validated',async()=>{
  const now=Date.now(); const packed=await packCoachPending('owner-a',start,now);
  const raw=JSON.stringify(packed);
  assert.equal(raw.includes(envelope.controlLeaseToken),false);
  assert.equal(raw.includes('controlLeaseToken'),false);
  assert.match(packed.leaseHash!,/^[a-f0-9]{64}$/);
  assert.deepEqual(readCoachPending(raw,'owner-a',now),packed);
  assert.equal(readCoachPending(raw,'owner-b',now),null);
  assert.equal(readCoachPending(raw,'owner-a',now-1),null);
  assert.equal(readCoachPending(raw,'owner-a',now+86400000),null);
  assert.equal(readCoachPending(raw,'owner-a',Number.NaN),null);
  for(const addition of [{token:'secret'},{owner:'other'},{advice:'made up'},{frames:[]},{controlLeaseToken:'secret'}]) {
    assert.equal(readCoachPending(JSON.stringify({...packed,body:{...packed.body,...addition}}),'owner-a',now),null);
  }
  assert.equal(readCoachPending(JSON.stringify({...packed,secret:'hidden'}),'owner-a',now),null);
  await assert.rejects(packCoachPending('owner-a',{kind:'start',body:{...start.body,owner:'other'}} as unknown as CoachOperation));
  await assert.rejects(packCoachPending('',start));
});

test('restoration requires the same game and original lease, including after asynchronous packing',async()=>{
  const operation:CoachOperation={kind:'item',body:{...envelope,sessionId:'session-a',kind:'selection',selectedCards:['HQ']}};
  const packing=packCoachPending('owner-a',operation);
  operation.body.selectedCards![0]='SA';
  const packed=await packing;
  assert.deepEqual(packed.body.selectedCards,['HQ']);
  assert.equal(await restoreCoachPending(packed,'game-b',envelope.controlLeaseToken),null);
  assert.equal(await restoreCoachPending(packed,'game-a','new-lease'),null);
  const restored=await restoreCoachPending(packed,'game-a',envelope.controlLeaseToken);
  assert.ok(restored && restored.kind==='item');
  assert.deepEqual(restored.body.selectedCards,['HQ']);
  assert.equal(validateCoachUIItemRequest(restored.body),true);
  assert.equal(restored.body.commandId,envelope.commandId);
  assert.equal(await restoreCoachPending({...packed,body:{...packed.body,owner:'other'}},'game-a',envelope.controlLeaseToken),null);
});

test('feedback recovery needs no live lease and retains its exact revision and text',async()=>{
  const operation:CoachOperation={kind:'feedback',body:{commandId:'vote-command',itemId:'item-a',expectedFeedbackRevision:2,value:'not-helpful',reason:'Unclear',text:'Explain the constraint.'}};
  const packed=await packCoachPending('owner-a',operation);
  assert.equal(packed.leaseHash,undefined);
  const restored=await restoreCoachPending(packed,'different-game','');
  assert.deepEqual(restored,operation);
  assert.ok(validateCoachUIFeedbackRequest(restored!.body));
  assert.equal(readCoachPending(JSON.stringify({...packed,leaseHash:'a'.repeat(64)}),'owner-a'),null);
});

test('receipt recovery can retain an original lease after a newer lease is issued',async context=>{
  context.after(clearLeases);
  const original='a'.repeat(40), renewed='b'.repeat(40);
  const operation:CoachOperation={kind:'start',body:{...envelope,controlLeaseToken:original,kind:'cue'}};
  await retainLease('owner-a','game-a',original,1);
  const packed=await packCoachPending('owner-a',operation);
  await retainLease('owner-a','game-a',renewed,2);
  const retained=await readLease('owner-a','game-a',packed.leaseHash);
  assert.equal(retained?.token,original);
  assert.equal(await readLease('owner-b','game-a',packed.leaseHash),null);
  assert.deepEqual(await restoreCoachPending(packed,retained!.gameId,retained!.token),operation);
});

test('one mutation gate freezes duplicate intents and retries unknown outcomes with the same command',()=>{
  const gate=new CoachMutationGate();
  const operation=structuredClone(start);
  const original=gate.begin(operation)!;
  operation.body.commandId='changed';
  assert.equal(original.body.commandId,'coach-command');
  assert.equal(gate.begin(),null);
  assert.equal(gate.begin(start),null);
  for(const failure of [new TypeError('lost'),new ApiFailure('timeout',408,'TIMEOUT'),new ApiFailure('busy',429,'BUSY'),new ApiFailure('failed',503,'UNAVAILABLE')]) {
    gate.settle(definiteFailure(failure));
    assert.equal(gate.begin(start),null,'new requests cannot replace uncertainty');
    assert.equal(gate.begin()!.body.commandId,'coach-command');
  }
  gate.settle(false); // Effect cleanup releases busy, retaining persisted identity.
  assert.equal(gate.begin()!.body.commandId,'coach-command');
  gate.settle(definiteFailure(new ApiFailure('revision conflict',409,'CONFLICT')));
  assert.equal(gate.pending,null);
  assert.ok(gate.begin(start));
  gate.clear(); // Owner invalidation retires every in-memory intention.
  assert.equal(gate.begin(),null);
});

test('failed or silently discarded persistence cannot establish a recoverable write',async()=>{
  const packed=await packCoachPending('owner-a',start);
  assert.throws(()=>saveCoachPending(packed,{setItem(){throw new Error('quota');},getItem(){return null;}}),/recovery/);
  assert.throws(()=>saveCoachPending(packed,{setItem(){},getItem(){return null;}}),/recovery/);
  const values=new Map<string,string>();
  saveCoachPending(packed,{setItem(key,value){values.set(key,value);},getItem(key){return values.get(key)??null;}});
  assert.deepEqual(readCoachPending(values.get(coachPendingKey)!,'owner-a'),packed);
});

test('restored new-session request roundtrips through the real transport and response validator',async context=>{
  const previous=globalThis.fetch;
  context.after(()=>{globalThis.fetch=previous;});
  const packed=await packCoachPending('owner-a',start);
  const restored=await restoreCoachPending(packed,'game-a',envelope.controlLeaseToken);
  assert.ok(restored && restored.kind==='start' && validateCoachUIStartRequest(restored.body));
  const provider={source:'mock',version:'ui-preview-v1',mock:true,preview:true,language:'en'};
  const identity={sessionId:'session-a',gameId:'game-a',gameType:'spades',variantId:'partners',sourceUnitId:'hand-a',decisionId:'decision-a',sourceRevision:3,createdAt:'2026-10-13T12:00:00Z',kind:'cue',provider};
  const view={session:{...identity,items:[{itemId:'item-a',sessionId:'session-a',kind:'cue',title:'Preview',body:'Preview cue.',explanation:'Not assessed.',createdAt:identity.createdAt,sourceRevision:3,decisionId:'decision-a',provider,replayAvailable:true,feedbackRevision:0}]},access:{canRequest:true,remaining:1,unlimited:false,resetAt:'2026-10-14T00:00:00Z',timezone:'UTC',mode:'free'}};
  let sends=0;
  globalThis.fetch=async(path,options)=>{
    sends++;assert.equal(path,'/api/platform/coach/sessions');
    assert.equal(options!.method,'POST');
    assert.deepEqual(JSON.parse(options!.body as string),restored.body);
    return Response.json(view);
  };
  assert.deepEqual(await api('/api/platform/coach/sessions','CoachUISessionView',restored.body),view);
  assert.equal(sends,1);
});
