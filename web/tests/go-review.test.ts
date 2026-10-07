import assert from 'node:assert/strict';
import test from 'node:test';
import { goTrial, loadOriginalAdvice, originalAdviceMode } from '../src/api/goReview.ts';
import type { AccessDecision, PlatformAdviceView, PlatformReviewAccessView } from '../shared/local-service.contracts.ts';
import { readGoPending, storeGoPending } from '../src/api/goPendingCommands.ts';
import { clearLeases, retainLease } from '../src/api/controlLease.ts';

function environment(context:test.TestContext) {
  const originals=['localStorage','sessionStorage'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
  for(const [name] of originals){const values=new Map<string,string>();Object.defineProperty(globalThis,name,{configurable:true,value:{
    getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),
    removeItem:(key:string)=>values.delete(key),get length(){return values.size;},key:(index:number)=>[...values.keys()][index]??null,
  }});}
  const originalFetch=globalThis.fetch;
  context.after(()=>{clearLeases();globalThis.fetch=originalFetch;for(const [name,original]of originals){
    if(original)Object.defineProperty(globalThis,name,original);else Reflect.deleteProperty(globalThis,name);
  }});
}

test('a queued continuation remains recoverable and saved completion needs no original lease',async context=>{
  environment(context);
  const path='/api/platform/reviews/game-a%3Adecision%3A3/trials';
  const body={commandId:'command-a',gameId:'game-a',expectedRevision:3,controlLeaseToken:'a'.repeat(40),
    decisionId:'game-a:decision:3',trialId:'trial-a',alternativeCandidateId:'play:C2'};
  await retainLease('owner-a','game-a',body.controlLeaseToken,1);
  const pending=await storeGoPending('review',path,body,'owner-a','game-a');
  let mutations=0,reads=0;
  globalThis.fetch=async(request,options)=>{
    if(request==='/api/platform/commands/reconcile')return Response.json({status:'unknown'});
    if(request===path){mutations++;assert.deepEqual(JSON.parse(options!.body as string),body);
      // A queued receipt must keep the original durable record, even if later
      // writes fail while polling. It must never clear and recreate that intent.
      localStorage.setItem=()=>{throw new Error('quota changed after acceptance');};
      return Response.json({commandId:'command-a',status:'queued',result:null});}
    reads++;
    return reads===1 ? Response.json({code:'NOT_FOUND',message:'Unknown.'},{status:404}) :
      Response.json({code:'SERVICE_UNAVAILABLE',message:'Connection interrupted.'},{status:503});
  };
  await assert.rejects(goTrial(pending,false));
  assert.ok(readGoPending('review','owner-a'));
  assert.equal(mutations,1);
  clearLeases();
  const trial={trialId:'trial-a',decisionId:body.decisionId,label:'Possible continuation',liveRevision:3,frames:[]};
  globalThis.fetch=async request=>{
    assert.equal(request,'/api/platform/review-trials/command-a');
    return Response.json({commandId:'command-a',status:'completed',result:trial});
  };
  assert.deepEqual(await goTrial(pending,true),trial);
  assert.equal(readGoPending('review','owner-a'),null);
  assert.equal(mutations,1);
});

test('definite continuation retry failures release the old intent while unknown outcomes retain it',async context=>{
  environment(context);
  const path='/api/platform/reviews/game-a%3Adecision%3A3/trials';
  const body={commandId:'command-a',gameId:'game-a',expectedRevision:3,controlLeaseToken:'a'.repeat(40),
    decisionId:'game-a:decision:3',trialId:'trial-a',alternativeCandidateId:'play:C2'};
  await retainLease('owner-a','game-a',body.controlLeaseToken,1);
  for (const status of ['expired','unavailable']) for (const failure of [403,409,408,429,500,503,'network']) {
    const pending=await storeGoPending('review',path,body,'owner-a','game-a');
    let posts=0;
    globalThis.fetch=async(request,options)=>{
      if(request===path) {
        posts++;assert.deepEqual(JSON.parse(options!.body as string),body);
        if(failure==='network')throw new TypeError('response lost');
        return Response.json({code:'SERVICE_UNAVAILABLE',message:'Could not retry.'},{status:failure as number});
      }
      return Response.json({commandId:body.commandId,status,result:null});
    };
    await assert.rejects(goTrial(pending,true));
    assert.equal(posts,1);
    assert.equal(readGoPending('review','owner-a')!==null, failure!==403 && failure!==409,`${status}/${failure}`);
  }
});

test('saved full advice remains readable after expiry but partial delivery and revocation cannot reveal a new level',()=>{
  const denied:AccessDecision={allowed:false,reason:'expired',remaining:0,accessGeneration:1,applied:[],continuation:'pause-at-expiry'};
  const access:PlatformReviewAccessView={sourceUnitId:'unit-a',unlocked:true,advice:denied,reviewAlternative:denied,savedAdviceLevels:[3]};
  assert.equal(originalAdviceMode(access),'saved');
  assert.equal(originalAdviceMode({...access,savedAdviceLevels:[1,2]}),'unavailable');
  assert.equal(originalAdviceMode({...access,savedAdviceLevels:[],unlocked:false,
    advice:{...access.advice,reason:'revoked'}}),'unavailable');
  assert.equal(originalAdviceMode({...access,savedAdviceLevels:[1],advice:{...access.advice,allowed:true,reason:'existing-unlock'}}),'new');
  assert.equal(originalAdviceMode(null),'unavailable');
});

test('saved full advice uses the read-only route without constructing a lease or new-work command',async context=>{
  environment(context);
  const denied:AccessDecision={allowed:false,reason:'expired',remaining:0,accessGeneration:1,applied:[],continuation:'pause-at-expiry'};
  const access:PlatformReviewAccessView={sourceUnitId:'unit-a',unlocked:true,advice:denied,reviewAlternative:denied,savedAdviceLevels:[3]};
  const saved:PlatformAdviceView={sourceUnitId:'unit-a',unlocked:true,advice:{decisionId:'game-a:decision:3',
    requestedLevel:3,focus:'Original focus',notice:'Original notice',reason:'Original reason',suggestion:'Original suggestion',source:'code'}};
  let calls=0;
  globalThis.fetch=async(path,options)=>{
    calls++;assert.equal(path,'/api/platform/reviews/game-a%3Adecision%3A3/advice');
    assert.equal(options!.method,'GET');assert.equal(options!.body,undefined);
    return calls===1 ? Response.json(saved) : Response.json({code:'FORBIDDEN',message:'Source grant revoked.'},{status:403});
  };
  assert.deepEqual(await loadOriginalAdvice(access,'game-a:decision:3',()=>{throw new Error('must not construct a mutation');}),saved);
  await assert.rejects(loadOriginalAdvice(access,'game-a:decision:3',()=>{throw new Error('must not construct a mutation');}),
    error=>error instanceof Error && error.message==='Source grant revoked.');
  assert.equal(calls,2);
  await assert.rejects(loadOriginalAdvice({...access,savedAdviceLevels:[]},'game-a:decision:3',
    ()=>{throw new Error('must not publish without permission');}),/Coaching is unavailable/);
  assert.equal(calls,2);
});
