import assert from 'node:assert/strict';
import test from 'node:test';
import {api} from '../src/api/client.ts';
import {authEpoch,invalidateAuth,onAuthInvalidated} from '../src/api/authLifecycle.ts';
import {coachPendingKey,packCoachPending} from '../src/rally/coachCommands.ts';

function storage(context:test.TestContext) {
  const original=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  const previousFetch=globalThis.fetch;
  const values=new Map<string,string>();
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{
    setItem:(key:string,value:string)=>values.set(key,value),getItem:(key:string)=>values.get(key)??null,
    removeItem:(key:string)=>values.delete(key),key:(index:number)=>[...values.keys()][index]??null,get length(){return values.size;},
  }});
  context.after(()=>{
    globalThis.fetch=previousFetch;
    if(original)Object.defineProperty(globalThis,'sessionStorage',original);else Reflect.deleteProperty(globalThis,'sessionStorage');
  });
  return values;
}

async function seed(values:Map<string,string>) {
  const pending=await packCoachPending('owner-a',{kind:'feedback',body:{commandId:'vote-a',itemId:'item-a',expectedFeedbackRevision:0,value:'helpful',text:'Private note'}});
  values.set(coachPendingKey,JSON.stringify(pending));values.set('unrelated','keep');
}

test('actual logout transport clears Coach storage before even an unsuccessful response without a mounted Coach',async context=>{
  const values=storage(context);await seed(values);
  globalThis.fetch=async path=>{
    assert.equal(path,'/api/logout');
    assert.equal(values.has(coachPendingKey),false,'cleanup precedes transport');
    return Response.json({code:'SERVICE_UNAVAILABLE',message:'Response lost.'},{status:503});
  };
  await assert.rejects(api('/api/logout','AcceptedView',{}));
  assert.equal(values.has(coachPendingKey),false);
  assert.equal(values.get('unrelated'),'keep');
});

test('an actual 401 clears Coach pending storage without a mounted Coach listener',async context=>{
  const values=storage(context);await seed(values);
  const before=authEpoch();
  globalThis.fetch=async()=>Response.json({code:'UNAUTHENTICATED',message:'Session ended.'},{status:401});
  await assert.rejects(api('/api/platform/coach','CoachUIStatusView'));
  assert.equal(authEpoch(),before+1);
  assert.equal(values.has(coachPendingKey),false);
  assert.equal(values.get('unrelated'),'keep');
});

test('standalone invalidation used by erasure clears Coach intent before notifying mounted consumers',async context=>{
  const values=storage(context);await seed(values);
  const unsubscribe=onAuthInvalidated(()=>{assert.equal(values.has(coachPendingKey),false);});
  context.after(unsubscribe);
  invalidateAuth();
  assert.equal(values.has(coachPendingKey),false);
  assert.equal(values.get('unrelated'),'keep');
});

test('confirmed erasure transport invalidates auth and clears Coach storage for either backend',async context=>{
  const values=storage(context);
  for(const path of ['/api/platform/account/delete','/api/account/delete']) {
    await seed(values);
    const before=authEpoch();
    globalThis.fetch=async request=>{
      assert.equal(request,path);
      assert.equal(values.has(coachPendingKey),true,'retain until deletion is confirmed');
      return Response.json({deleted:true,mode:'local-test',message:'Deleted.'});
    };
    const result=await api(path,'AccountDeleteView',{commandId:'delete-a',confirmation:'DELETE LOCAL ACCOUNT'});
    assert.equal(result.deleted,true);
    assert.equal(authEpoch(),before+1);
    assert.equal(values.has(coachPendingKey),false);
    assert.equal(values.get('unrelated'),'keep');
  }
});

test('unconfirmed or invalid erasure response retains pending intent and auth identity',async context=>{
  const values=storage(context);await seed(values);
  const before=authEpoch();
  for(const response of [Response.json({code:'SERVICE_UNAVAILABLE',message:'Unknown outcome.'},{status:503}),Response.json({deleted:false})]) {
    globalThis.fetch=async()=>response;
    await assert.rejects(api('/api/platform/account/delete','AccountDeleteView',{commandId:'delete-a',confirmation:'DELETE LOCAL ACCOUNT'}));
    assert.equal(authEpoch(),before);
    assert.equal(values.has(coachPendingKey),true);
  }
});
