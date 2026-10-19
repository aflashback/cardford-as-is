import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {retainStopIntent,readStopIntent,clearStopIntent} from '../src/api/stopIntent.ts';

function playback(scope:Record<string,unknown>) {
  const source=ts.createSourceFile('useGoSession.ts',readFileSync(new URL('../src/api/useGoSession.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
  let found:ts.VariableDeclaration|undefined;
  const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='setPlayback')found=node;ts.forEachChild(node,visit);};visit(source);assert.ok(found);
  const context={...scope,exports:{} as {setPlayback:(running:boolean,intent?:string,reason?:string)=>Promise<boolean>}};
  runInNewContext(ts.transpileModule(`const ${found.getText(source)};exports.setPlayback=setPlayback;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
  return context.exports.setPlayback;
}
function disconnected(scope:Record<string,unknown>) {
  const source=ts.createSourceFile('useGoSession.ts',readFileSync(new URL('../src/api/useGoSession.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
  let found:ts.PropertyAssignment|undefined;
  const visit=(node:ts.Node)=>{if(ts.isNewExpression(node)&&node.expression.getText(source)==='RealtimeStream'){
    const events=node.arguments?.[0];if(events&&ts.isObjectLiteralExpression(events))found=events.properties.find((property):property is ts.PropertyAssignment=>ts.isPropertyAssignment(property)&&property.name.getText(source)==='disconnected');
  }ts.forEachChild(node,visit);};visit(source);assert.ok(found);
  const context={...scope,exports:{} as {handler:()=>void}};
  runInNewContext(ts.transpileModule(`exports.handler=${found.initializer.getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
  return context.exports.handler;
}
function harness(t:test.TestContext) {
  const original=['localStorage','sessionStorage','document','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
  const values=new Map<string,string>();const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)};
  for(const [name,value] of Object.entries({localStorage:storage,sessionStorage:storage,document:{hidden:false},navigator:{onLine:true}}))Object.defineProperty(globalThis,name,{configurable:true,value});
  t.after(()=>{for(const [name,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}});
  const ref=<T,>(current:T)=>({current});
  const state={owner:ref('owner'),ownerGeneration:ref(0),wire:ref({session:{gameId:'game-a',control:{controlGeneration:1}}}),current:ref({game:{id:'game-a'},controlLeaseToken:'secret'}),
    playback:ref({running:true,generation:1,phase:'running'}),playbackRequest:ref<Promise<boolean>|null>(null),presentationPaused:ref(false),requestedRunning:ref<boolean|null>(null),
    playbackIntent:ref({gameId:'game-a',intent:'resume',reason:'manual',epoch:0}),eligibilityEpoch:ref(0),foregroundEligible:ref(true),disposed:ref(false),presenceTimer:ref<ReturnType<typeof setTimeout>|null>(null),
    presenceRequest:ref<AbortController|null>(null),preparationRequests:ref(new Set<AbortController>()),presentationQueue:ref({setRunning(){}}),realtime:ref({setPaused(){},suspend(){},async recover(){},async recoverAfterCurrent(){}})};
  const requests:unknown[]=[];let checks=0;
  const scope={...state,authMode:'fixture',useCallback:(fn:unknown)=>fn,retainStopIntent,readStopIntent,clearStopIntent,document:globalThis.document,navigator:globalThis.navigator,crypto,
    readGoPending:()=>null,restoreGoPending:async()=>({}),clearTimeout,validateContract:()=>true,clearGoPending(){},recoverGoPending:async()=>null,
    verifyOwner:async()=>{checks++;return 'owner';},setPlaybackInterrupted(){},setInterruptionReason(){},setError(){},read:async()=>{},
    updatePlayback:(value:typeof state.playback.current)=>{state.playback.current=value;},
    executeGo:async(_scope:string,_path:string,_output:string,body:Record<string,unknown>)=>{requests.push(body);return {running:body.running,generation:state.playback.current.generation+1,phase:body.intent==='hold'?'held':body.running?'running':'paused'};}};
  return {state,scope,requests,values,get checks(){return checks;}};
}
test('pause bypasses identity preflight and stores the stop before the POST',async t=>{
  const h=harness(t);const original=h.scope.executeGo;
  h.scope.executeGo=async(...args)=>{assert.equal(readStopIntent('owner','game-a')?.reason,'away');return original(...args);};
  const change=playback(h.scope);assert.equal(await change(false,'pause','away'),true);
  assert.equal(h.checks,0);assert.equal(h.requests.length,1);assert.equal(readStopIntent('owner','game-a'),null);
});
test('an interruption during Resume authentication prevents the late start and confirms the queued pause',async t=>{
  const h=harness(t);h.state.playback.current={running:false,generation:2,phase:'paused'};
  let release!:(value:string)=>void;
  h.scope.verifyOwner=()=>new Promise<string>(resolve=>{release=resolve;});
  const change=playback(h.scope);const starting=change(true,'resume');
  await Promise.resolve();const stopping=change(false,'pause','away');release('owner');
  assert.equal(await starting,false);assert.equal(await stopping,true);
  assert.equal(h.requests.some(body=>(body as {running:boolean}).running),false);
});
test('stop intent is owner and game bound and contains no control credential or private cards',t=>{
  const h=harness(t);retainStopIntent('owner','game-a','connection_lost');
  assert.equal(readStopIntent('other','game-a'),null);assert.equal(readStopIntent('owner','other'),null);
  const raw=[...h.values.values()].find(value=>value.includes('connection_lost'))!;
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(),['gameId','ownerId','reason','version']);
});
test('a paused or expired Resume response cannot release local presentation',async t=>{
  const h=harness(t);h.scope.executeGo=async()=>({running:false,generation:2,phase:'paused'});
  const change=playback(h.scope);assert.equal(await change(true,'resume'),false);
  assert.equal(h.state.presentationPaused.current,true);
});
test('explicit Resume always establishes a fresh server generation even when the old snapshot says running',async t=>{
  const h=harness(t);const change=playback(h.scope);assert.equal(await change(true,'resume'),true);
  assert.equal(h.requests.length,1);assert.equal(h.state.playback.current.generation,2);
});
test('unknown receipt for superseded Resume is reconciled without retransmitting the old start',async t=>{
  const h=harness(t);
  Object.assign(h.scope,{readGoPending:()=>({gameId:'game-a'}),restoreGoPending:async()=>({running:true,commandId:'old-start'})});
  const change=playback(h.scope);assert.equal(await change(false,'pause','away'),true);
  assert.equal(h.requests.length,1);assert.equal((h.requests[0] as {running:boolean}).running,false);
});
test('a stale manual table effect cannot replace the actual disconnected pause reason sent to the server',async t=>{
  const h=harness(t),queued:(()=>void)[]=[],change=playback(h.scope);
  disconnected({...h.scope,setStreamStatus(){},queueMicrotask:(fn:()=>void)=>queued.push(fn),
    reconcileStop:{current:()=>change(false,'pause',h.state.playbackIntent.current.reason)}})();
  assert.equal(h.state.playbackIntent.current.reason,'connection_lost');
  assert.equal(await change(false,'pause','manual'),true);
  queued.forEach(fn=>fn());await Promise.resolve();
  assert.ok(h.requests.length>0);assert.ok(h.requests.every(body=>(body as {reason:string}).reason==='connection_lost'));
  assert.equal(await change(true,'resume'),true);assert.equal(await change(false,'pause','manual'),true);
  assert.equal((h.requests.at(-1) as {reason:string}).reason,'manual','A later manual pause after explicit Resume remains manual');
});


test('Resume authorizes running transport only after accepted POST and a later Pause fences socket recovery',async t=>{
 const h=harness(t);const calls:string[]=[];let release!:()=>void;
 h.state.realtime.current={setPaused:(paused?:boolean)=>{calls.push(paused?'stop':'allow');},suspend(){},async recover(){calls.push('http');},async recoverAfterCurrent(){calls.push('socket');await new Promise<void>(resolve=>{release=resolve;});}};
 const original=h.scope.executeGo;h.scope.executeGo=async(...args)=>{calls.push('post');return original(...args);};
 const change=playback(h.scope),start=change(true,'resume');
 await new Promise<void>(resolve=>setImmediate(resolve));
 assert.deepEqual(calls.slice(0,4),['http','post','allow','socket']);
 const stop=change(false,'pause','manual');assert.equal(calls.at(-1),'stop');release();
 assert.equal(await start,false);assert.equal(await stop,true);
 assert.equal(calls.filter(value=>value==='allow').length,1);
});
