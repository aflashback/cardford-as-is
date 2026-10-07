import assert from 'node:assert/strict';
import test from 'node:test';
import { executeGo, readGoPending, restoreGoPending, storeGoPending } from '../src/api/goPendingCommands.ts';
import { clearLeases, retainLease } from '../src/api/controlLease.ts';
import { validateContract } from '../shared/local-service.validation.ts';

function environment(context:test.TestContext) {
  const maps = {localStorage:new Map<string,string>(), sessionStorage:new Map<string,string>()};
  const originals = Object.keys(maps).map(name => [name, Object.getOwnPropertyDescriptor(globalThis,name)] as const);
  for (const [name, values] of Object.entries(maps)) Object.defineProperty(globalThis,name,{configurable:true,value:{
    getItem:(key:string)=>values.get(key)??null, setItem:(key:string,value:string)=>values.set(key,value),
    removeItem:(key:string)=>values.delete(key),get length(){return values.size;},key:(index:number)=>[...values.keys()][index]??null,
  }});
  const fetchOriginal = globalThis.fetch;
  context.after(()=>{clearLeases();globalThis.fetch=fetchOriginal;for(const [name,original] of originals){
    if(original)Object.defineProperty(globalThis,name,original);else Reflect.deleteProperty(globalThis,name);
  }});
  return maps;
}
const body = {commandId:'request-a',gameId:'game-a',expectedRevision:3,
  controlLeaseToken:'a'.repeat(40),candidateId:'play:C2',preparedDecisionId:'work-a',preparedWorkIds:['work-a']};

test('Go pending envelopes reject mixed versions/private fields and retain no lease in durable storage',async context=>{
  const maps=environment(context);
  await retainLease('owner-a','game-a',body.controlLeaseToken,1);
  await storeGoPending('session','/api/session/actions',body,'owner-a','game-a');
  assert.ok(![...maps.localStorage.values()].some(value=>value.includes(body.controlLeaseToken)));
  const saved=readGoPending('session','owner-a')!;
  assert.deepEqual(await restoreGoPending(saved),body);
  assert.equal(readGoPending('session','owner-b'),null);
  for(const extra of [{action:{kind:'play',card:'C2'}},{hands:[['SA']]},{publicSchemaVersion:'1.0.0'}])
    await assert.rejects(storeGoPending('session','/api/session/actions',{...body,...extra},'owner-a','game-a'));
});

test('an ambiguous accepted Go command reconciles its original lease after a later retained lease',async context=>{
  environment(context);
  await retainLease('owner-a','game-a',body.controlLeaseToken,1);
  let mutations=0;
  globalThis.fetch=async()=>{mutations++;throw new TypeError('response lost');};
  await assert.rejects(executeGo('session','/api/session/actions','LocalServiceCommandReceipt',body,'owner-a','game-a'));
  await retainLease('owner-a','game-a','b'.repeat(40),2);
  globalThis.fetch=async(path,options)=>{
    assert.equal(path,'/api/platform/commands/reconcile');
    const sent=JSON.parse(options!.body as string);
    assert.deepEqual(sent.request,body);
    return Response.json({status:'accepted',receipt:{commandId:body.commandId,gameId:'game-a',revision:4}});
  };
  assert.equal((await executeGo('session','/api/session/actions','LocalServiceCommandReceipt',body,'owner-a','game-a')).revision,4);
  assert.equal(mutations,1);
  assert.equal(readGoPending('session','owner-a'),null);
});

test('HTTP timeout/capacity outcomes keep pending Go commands and unknown receipts resend exact input',async context=>{
  environment(context);
  await retainLease('owner-a','game-a',body.controlLeaseToken,1);
  globalThis.fetch=async()=>Response.json({code:'SERVICE_UNAVAILABLE',message:'Reconcile.'},{status:429});
  await assert.rejects(executeGo('session','/api/session/actions','LocalServiceCommandReceipt',body,'owner-a','game-a'));
  assert.ok(readGoPending('session','owner-a'));
  let reconciled=false;
  globalThis.fetch=async(path,options)=>{
    if(path==='/api/platform/commands/reconcile'){reconciled=true;return Response.json({status:'unknown'});}
    assert.ok(reconciled);assert.deepEqual(JSON.parse(options!.body as string),body);
    return Response.json({commandId:body.commandId,gameId:'game-a',revision:4});
  };
  await executeGo('session','/api/session/actions','LocalServiceCommandReceipt',body,'owner-a','game-a');
  assert.equal(readGoPending('session','owner-a'),null);
});

test('Go commands are never sent when recovery storage cannot retain the intent',async context=>{
  environment(context);
  await retainLease('owner-a','game-a',body.controlLeaseToken,1);
  let requests=0;
  globalThis.fetch=async()=>{requests++;throw new Error('must not send');};
  for (const setItem of [()=>{throw new Error('quota exceeded');},()=>{}]) {
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
      getItem:()=>null,setItem,removeItem:()=>{},
    }});
    await assert.rejects(executeGo('session','/api/session/actions','LocalServiceCommandReceipt',body,'owner-a','game-a'),/could not be saved for recovery/);
    assert.equal(requests,0);
  }
});

test('family invitation recovery keeps its token in owner-bound tab storage',async context=>{
  const maps=environment(context);
  const request={commandId:'family-a',action:'accept',token:'a'.repeat(48),acknowledgeIndividualCoverage:true};
  await storeGoPending('account','/api/family',request,'owner-a','account');
  assert.ok(![...maps.localStorage.values()].some(value=>value.includes(request.token)));
  const saved=readGoPending('account','owner-a')!;
  assert.deepEqual(await restoreGoPending(saved),request);
  await assert.rejects(restoreGoPending({...saved,ownerId:'owner-b'}),/token is unavailable/);
  clearLeases();
  await assert.rejects(restoreGoPending(saved),/remains unconfirmed/);
});

test('native48-character family invitation preserves the exact accepted receipt after a lost reply',async context=>{
  const maps=environment(context);
  const ownerId='a'.repeat(48),inviteeId='b'.repeat(48),familyId='c'.repeat(48),invitationId='d'.repeat(48),token='e'.repeat(48);
  const request={commandId:'family-invite-a',action:'invite',inviteeId,seatClass:'limited'};
  assert.equal(validateContract('FamilyCommand',request),false,'Node reference keeps its original UUID account contract');
  assert.equal(validateContract('PlatformFamilyCommand',request),true);
  assert.equal(validateContract('PlatformFamilyCommand',{...request,inviteeId:crypto.randomUUID()}),false);
  const receipt={familyId,role:'payer',payer:{playerId:ownerId,displayName:'Local player'},members:[],
    invitations:[{invitationId,inviteeId,seatClass:'limited',expiresAt:'2026-10-13T00:00:00Z',token}],
    periodEnd:'2026-11-01T00:00:00Z',localMock:true};
  let mutations=0;
  globalThis.fetch=async(path,options)=>{
    mutations++;assert.equal(path,'/api/family');assert.deepEqual(JSON.parse(options!.body as string),request);
    throw new TypeError('accepted reply lost');
  };
  await assert.rejects(executeGo('account','/api/family','FamilyView',request,ownerId,'account'),/accepted reply lost/);
  assert.equal(readGoPending('account',ownerId)?.body.inviteeId,inviteeId);
  assert.ok(![...maps.localStorage.values()].some(value=>value.includes(token)));
  globalThis.fetch=async(path,options)=>{
    assert.equal(path,'/api/platform/commands/reconcile');
    assert.deepEqual(JSON.parse(options!.body as string),{commandId:request.commandId,operation:'platform-family-command',request});
    return Response.json({status:'accepted',receipt});
  };
  assert.deepEqual(await executeGo('account','/api/family','FamilyView',request,ownerId,'account'),receipt);
  assert.equal(mutations,1);assert.equal(readGoPending('account',ownerId),null);
});

test('native family acceptance recovers the original48-character token without storing it durably',async context=>{
  const maps=environment(context);
  const ownerId='b'.repeat(48),token='e'.repeat(48);
  const request={commandId:'family-accept-a',action:'accept',token,acknowledgeIndividualCoverage:true};
  const receipt={familyId:'c'.repeat(48),role:'member',payer:{playerId:'a'.repeat(48),displayName:'Local payer'},
    members:[{assignmentId:'f'.repeat(48),playerId:ownerId,displayName:'Local member',seatClass:'limited',status:'active',periodEnd:'2026-11-01T00:00:00Z'}],
    invitations:[],periodEnd:'2026-11-01T00:00:00Z',localMock:true};
  globalThis.fetch=async()=>{throw new TypeError('accepted reply lost');};
  await assert.rejects(executeGo('account','/api/family','FamilyView',request,ownerId,'account'));
  assert.ok(![...maps.localStorage.values()].some(value=>value.includes(token)));
  globalThis.fetch=async(path,options)=>{
    assert.equal(path,'/api/platform/commands/reconcile');
    assert.deepEqual(JSON.parse(options!.body as string).request,request);
    return Response.json({status:'accepted',receipt});
  };
  assert.deepEqual(await executeGo('account','/api/family','FamilyView',request,ownerId,'account'),receipt);
  assert.equal(readGoPending('account',ownerId),null);
});
