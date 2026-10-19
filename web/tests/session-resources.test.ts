import assert from 'node:assert/strict';
import test from 'node:test';
import {RealtimeStream} from '../src/api/realtimeStream.ts';
import {IdlePresence} from '../src/table/idlePresence.ts';

function harness(t:test.TestContext) {
  const names=['window','document','navigator','sessionStorage','fetch'] as const;
  const previous=names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
  const listeners=new Map<string,Set<()=>void>>();
  const add=(name:string,fn:()=>void)=>{const all=listeners.get(name)??new Set();all.add(fn);listeners.set(name,all);};
  const remove=(name:string,fn:()=>void)=>listeners.get(name)?.delete(fn);
  const document={hidden:false,addEventListener:add,removeEventListener:remove};
  const navigator={onLine:true};let requests=0,disconnects=0;
  for(const [name,value] of Object.entries({window:{addEventListener:add,removeEventListener:remove},document,navigator,
    sessionStorage:{getItem:()=>null,setItem(){}},fetch:async(path:unknown)=>{
      requests++;
      return Response.json(String(path).includes('negotiate')?{enabled:false,mode:'http',streamId:null,url:null}:{
        schemaVersion:'1.0.0',streamId:null,sequence:0,works:[],playback:{running:true,generation:1},
        view:{platformSchemaVersion:'1.0.0',playerId:'owner',activeGameId:null,session:null,catalog:[],preferences:{schemaVersion:'1.0.0',revision:0,preferences:{coachMode:'asked',gameSpeed:1}}},
      });
    }}))Object.defineProperty(globalThis,name,{configurable:true,value});
  const stream=new RealtimeStream({snapshot:async()=>undefined,message:async()=>undefined,disconnected:()=>{disconnects++;}});
  t.after(()=>{stream.close();for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}});
  return {stream,document,navigator,fire:(name:string)=>listeners.get(name)?.forEach(fn=>fn()),get requests(){return requests;},get disconnects(){return disconnects;}};
}
test('a hidden page cancels an already scheduled HTTP fallback and online cannot revive it',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const h=harness(t);await h.stream.start();
  assert.equal(h.requests,2);h.document.hidden=true;h.fire('visibilitychange');h.fire('online');
  t.mock.timers.tick(60_000);await Promise.resolve();await Promise.resolve();
  assert.equal(h.requests,2,'No hidden timer may start HTTP work');
  assert.equal(h.disconnects,0,'Deliberate suspension is not an outage');
});
test('persistent pause stops fallback immediately and foreground grace eventually suspends transport',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const h=harness(t);await h.stream.start();
  h.stream.setPaused(true);t.mock.timers.tick(29_999);await Promise.resolve();
  assert.equal(h.requests,2);t.mock.timers.tick(1);await Promise.resolve();
  assert.equal(h.stream.mode,'suspended');assert.equal(h.disconnects,0);
});

test('confirmed Resume cancels an earlier pause grace deadline after quick interruption recovery',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const h=harness(t);await h.stream.start();
  h.stream.setPaused(true);t.mock.timers.tick(20_000);h.stream.setPaused(false);
  t.mock.timers.tick(15_000);await Promise.resolve();assert.notEqual(h.stream.mode,'suspended');
  assert.equal(h.disconnects,0);
});

test('repeated paused server views retain the original foreground grace deadline',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const h=harness(t);await h.stream.start();
  h.stream.setPaused(true);t.mock.timers.tick(10_000);h.stream.setPaused(true);t.mock.timers.tick(19_999);
  assert.notEqual(h.stream.mode,'suspended');t.mock.timers.tick(1);assert.equal(h.stream.mode,'suspended');
});

test('engagement restarts idle warning, then 120 seconds plus 30 seconds pauses exactly once',t=>{
  t.mock.timers.enable({apis:['setTimeout']});let eligible=true,warning=false,pauses=0;
  const policy=new IdlePresence(()=>eligible,value=>{warning=value;},()=>{pauses++;});t.after(()=>policy.stop());
  policy.engage();t.mock.timers.tick(120_000);assert.equal(warning,true);policy.engage();
  assert.equal(warning,false);t.mock.timers.tick(120_000);assert.equal(warning,true);
  t.mock.timers.tick(30_000);assert.equal(pauses,1);eligible=false;policy.engage();t.mock.timers.tick(200_000);assert.equal(pauses,1);
});
