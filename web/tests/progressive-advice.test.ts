import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdviceView } from '../shared/contracts.ts';
import { ProgressiveAdviceRequests } from '../src/api/progressiveAdvice.ts';

function deferred<T>() {
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(done=>{resolve=done;});
  return {promise,resolve};
}
function advice(level:1|2|3, decisionId='decision-a'):AdviceView {
  return {decisionId,requestedLevel:level,focus:'Focus',notice:'Notice',reason:'Reason',suggestion:'Suggestion',source:'code'};
}

test('delayed progressive advice and its exposure block repeated clicks without promoting the displayed level early',async()=>{
  const requests=new ProgressiveAdviceRequests();
  const notice=deferred<AdviceView>(),exposure=deferred<void>();
  let displayed:AdviceView|null=null,loads=0;
  const first=requests.request('decision-a',1,()=>{loads++;return notice.promise;},async value=>{
    displayed=value;await exposure.promise;
  });
  assert.equal(await requests.request('decision-a',2,async()=>{loads++;return advice(2);},async()=>{}),false);
  assert.equal(await requests.request('decision-a',3,async()=>{loads++;return advice(3);},async()=>{}),false);
  assert.equal(displayed,null);assert.equal(loads,1);
  notice.resolve(advice(1));await Promise.resolve();
  assert.equal((displayed as AdviceView|null)?.requestedLevel,1);
  assert.equal(await requests.request('decision-a',2,async()=>{loads++;return advice(2);},async()=>{}),false);
  exposure.resolve();assert.equal(await first,true);
  const consider=deferred<AdviceView>();
  const second=requests.request('decision-a',2,()=>{loads++;return consider.promise;},async value=>{displayed=value;});
  assert.equal((displayed as AdviceView|null)?.requestedLevel,1);
  assert.equal(await requests.request('decision-a',3,async()=>{loads++;return advice(3);},async()=>{}),false);
  consider.resolve(advice(2));assert.equal(await second,true);
  assert.equal((displayed as AdviceView|null)?.requestedLevel,2);
  assert.equal(await requests.request('decision-a',3,async()=>{loads++;return advice(3);},async value=>{displayed=value;}),true);
  assert.equal((displayed as AdviceView|null)?.requestedLevel,3);assert.equal(loads,3);
});

test('a mismatched decision or level never changes confirmed advice and releases the request for retry',async()=>{
  const requests=new ProgressiveAdviceRequests();
  let accepted=0;
  for(const response of [advice(3,'decision-b'),advice(2)])
    await assert.rejects(requests.request('decision-a',3,async()=>response,async()=>{accepted++;}),/does not match/);
  assert.equal(accepted,0);assert.equal(requests.pending,false);
  assert.equal(await requests.request('decision-a',3,async()=>advice(3),async()=>{accepted++;}),true);
  assert.equal(accepted,1);
});
