import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {CoachMutationGate} from '../src/rally/coachCommands.ts';
import {remainingRetention} from '../src/table/sessionLifecycle.ts';

function evaluate(path:string,names:string[],scope:Record<string,unknown>,effectIncludes?:string) {
  const source=ts.createSourceFile(path,readFileSync(new URL(path,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const definitions:string[]=[];
  const visit=(node:ts.Node)=>{
    if(ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text))definitions.push(node.getText(source));
    if(ts.isVariableDeclaration(node)&&names.includes(node.name.getText(source)))definitions.push(`const ${node.getText(source)};`);
    if(effectIncludes&&ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'&&node.arguments[0]?.getText(source).includes(effectIncludes))definitions.push(`const cleanup=(${node.arguments[0].getText(source)})();`);
    ts.forEachChild(node,visit);
  };visit(source);
  const context={...scope,exports:{} as Record<string,unknown>};
  runInNewContext(ts.transpileModule(`${definitions.join('\n')};exports.result={${[...names,...(effectIncludes?['cleanup']:[])].join(',')}};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
  return context.exports.result as Record<string,unknown>;
}
test('visual keyboard viewport changes preserve the landscape layout eligibility',()=>{
  let size:unknown;const listeners=new Map<string,()=>void>();
  const visualViewport={height:300,addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener(){}};
  const hooks=evaluate('../src/table/useViewport.ts',['useViewport'],{
    window:{innerWidth:592,innerHeight:579,visualViewport,addEventListener(){},removeEventListener(){}},
    document:{documentElement:{style:{setProperty(){}}}},
    useState:(initial:()=>unknown)=>[initial(),(next:unknown)=>{size=next;}],useEffect:(fn:()=>unknown)=>fn(),
  });
  (hooks.useViewport as ()=>unknown)();assert.equal((size as {height:number}).height,579);
  visualViewport.height=250;listeners.get('resize')!();assert.equal((size as {height:number}).height,579);
});
for(const event of ['blur','offline','pagehide','visibilitychange'])test(`${event} discards an unsent queued card without sending a move`,()=>{
  let queued:unknown=null,plays=0;const listeners=new Map<string,()=>void>();const document={hidden:false,addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener(){}};
  const hooks=evaluate('../src/table/useHandGestures.ts',['useHandGestures'],{
    document,window:{clearTimeout(){},addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener(){}},
    useRef:(current:unknown)=>({current}),useState:()=>[null,(value:unknown)=>{queued=value;}],useLayoutEffect:(fn:()=>unknown)=>fn(),useEffect:(fn:()=>unknown)=>fn(),
  });
  const gesture=(hooks.useHandGestures as (options:unknown)=>{activate:(card:string,control:unknown)=>void})({
    cards:['S2'],decisionId:'d1',queueKey:'game:hand',disabled:false,blocked:false,myTurn:false,canPlay:false,playMode:true,selectionOnly:false,
    isLegal:()=>true,isReadOnly:()=>false,onSelect(){},onPlay(){plays++;},
  });
  gesture.activate('S2',{});assert.ok(queued);if(event==='visibilitychange')document.hidden=true;listeners.get(event)!();
  assert.equal(queued,null);assert.equal(plays,0);
});

test('away cancels Coach reads, keeps uncertain mutations recoverable, and held foreground Why reads remain available',async()=>{
  const listeners=new Map<string,()=>void>(),signals:AbortSignal[]=[];
  const ref=<T,>(current:T)=>({current});const controllers=ref(new Map<AbortController,boolean>());
  const document={hidden:false,addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener(){}};
  const hooks=evaluate('../src/rally/useCoachExperience.ts',['request','abortRequests'],{
    document,window:{addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener(){}},AbortController,DOMException,
    controllers,foregroundEligible:ref(true),readEnabled:ref(true),interruptionEpoch:ref(0),mounted:ref(false),generation:ref(0),readSequence:ref(0),statusSequence:ref(0),
    gate:ref({pending:null,settle(){}}),setBusy(){},setUncertain(){},setLoading(){},onAuthInvalidated:()=>()=>{},reload:async()=>{},
    useCallback:(fn:unknown)=>fn,api:async(_path:string,_type:string,_body:unknown,_method:string,signal:AbortSignal)=>{signals.push(signal);return new Promise(()=>{});},
  },'const away=');
  const request=hooks.request as (path:string,type:string,body?:unknown)=>Promise<unknown>;
  void request('/why','CoachUIReplayView');void request('/feedback','CoachUIFeedbackView',{commandId:'same-command'});
  assert.equal(signals.length,2);listeners.get('blur')!();assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,false);
  await assert.rejects(request('/while-away','CoachUIStatusView'),/page is away/);assert.equal(signals.length,2);
  listeners.get('focus')!();void request('/why-while-held','CoachUIReplayView');assert.equal(signals.length,3,'Temporary table holds never block explicit foreground Why reads');
  (hooks.abortRequests as ()=>void)();
});

test('foreground renewals remain single flight and monotonically sequenced across a hold within one generation',async()=>{
  const ref=<T,>(current:T)=>({current}),timers=new Map<number,()=>void>();let timerId=0;
  const requests:{sequence:number}[]=[];
  const scope={activeGameId:'game-a',lifecycle:{generation:1,phase:'running'},presenceSequence:ref({gameId:'game-a',generation:1,sequence:8}),
    presenceTimer:ref<number|null>(null),presenceRequest:ref<AbortController|null>(null),disposed:ref(false),foregroundEligible:ref(true),document:{hidden:false},navigator:{onLine:true},
    wire:ref({session:{gameId:'game-a',control:{controlGeneration:1}}}),playback:ref({generation:1,phase:'running'}),playbackIntent:ref({intent:'resume'}),current:ref({controlLeaseToken:'secret'}),
    AbortController,setTimeout:(fn:()=>void)=>{timers.set(++timerId,fn);return timerId;},clearTimeout:(id:number)=>timers.delete(id),
    api:async(_path:string,_type:string,body:{sequence:number})=>{requests.push(body);return {generation:1,phase:'running'};},updatePlayback(){},setPlayback(){},
  };
  const run=()=>evaluate('../src/api/useGoSession.ts',[],scope,'const gameId=activeGameId');
  let effect=run();assert.equal(timers.size,1);
  const fire=async()=>{const [id,fn]=timers.entries().next().value!;timers.delete(id);fn();await Promise.resolve();await Promise.resolve();};
  await fire();assert.equal(requests[0].sequence,9);assert.equal(timers.size,1);
  (effect.cleanup as ()=>void)();scope.lifecycle.phase='held';scope.playback.current.phase='held';scope.playbackIntent.current.intent='hold';
  effect=run();await fire();assert.equal(requests[1].sequence,10,'A temporary hold must not reuse an already accepted renewal sequence');
  (effect.cleanup as ()=>void)();scope.lifecycle.generation=2;scope.playback.current.generation=2;
  effect=run();await fire();assert.equal(requests[2].sequence,1,'Only a new server generation restarts renewal numbering');(effect.cleanup as ()=>void)();
});

for(const kind of ['start','item'])for(const interruption of ['blur','hidden','offline','coach-close','away-and-return'])test(`Coach ${interruption} during intent hashing discards an unsent ${kind} before persistence or POST`,async()=>{
  const ref=<T,>(current:T)=>({current});let release!:(value:unknown)=>void,persisted=0,posts=0;
  const scope={owner:ref('owner'),hydratedOwner:ref('owner'),mounted:ref(true),generation:ref(0),readSequence:ref(0),statusSequence:ref(0),
    foregroundEligible:ref(true),readEnabled:ref(true),interruptionEpoch:ref(0),document:{hidden:false},gate:ref(new CoachMutationGate()),
    useCallback:(fn:unknown)=>fn,packCoachPending:()=>new Promise(resolve=>{release=resolve;}),saveCoachPending(){persisted++;},
    setLoading(){},setBusy(){},setError(){},setUncertain(){},clearPending(){},saved:null,openSaved(){},reload(){},sessionStorage:{},
    request:async()=>{posts++;return {session:{gameId:'game-a'},access:{}};},setSaved(){},live:ref({gameId:'game-a'}),publishAccess(){},definiteFailure:()=>false,
  };
  const write=evaluate('../src/rally/useCoachExperience.ts',['write'],scope).write as (operation?:unknown)=>Promise<boolean>;
  const started=write({kind,body:{commandId:`new-${kind}`}});await Promise.resolve();
  if(interruption==='coach-close')scope.readEnabled.current=false;
  else if(interruption==='hidden')scope.document.hidden=true;
  else scope.foregroundEligible.current=false;
  scope.interruptionEpoch.current++;
  if(interruption==='away-and-return')scope.foregroundEligible.current=true;
  release({});assert.equal(await started,false);assert.equal(persisted,0);assert.equal(posts,0);assert.equal(scope.gate.current.pending,null);
});

test('interrupted hashing preserves an already uncertain Coach command for exact receipt recovery',async()=>{
  const ref=<T,>(current:T)=>({current});let release!:(value:unknown)=>void,cleared=0,posts=0;
  const gate=new CoachMutationGate();gate.pending={kind:'feedback',body:{commandId:'old-sent',itemId:'item-a',expectedFeedbackRevision:0,value:'helpful',text:''}};
  const original=gate.pending;
  const scope={owner:ref('owner'),hydratedOwner:ref('owner'),mounted:ref(true),generation:ref(0),readSequence:ref(0),statusSequence:ref(0),
    foregroundEligible:ref(true),readEnabled:ref(true),interruptionEpoch:ref(0),document:{hidden:false},gate:ref(gate),
    useCallback:(fn:unknown)=>fn,packCoachPending:()=>new Promise(resolve=>{release=resolve;}),saveCoachPending(){},
    setLoading(){},setBusy(){},setError(){},setUncertain(){},clearPending(){cleared++;},saved:null,openSaved(){},reload(){},sessionStorage:{},
    request:async()=>{posts++;return {};},setSaved(){},live:ref({gameId:'game-a'}),publishAccess(){},definiteFailure:()=>false,
  };
  const write=evaluate('../src/rally/useCoachExperience.ts',['write'],scope).write as ()=>Promise<boolean>;
  const recovery=write();await Promise.resolve();scope.interruptionEpoch.current++;scope.foregroundEligible.current=false;
  release({});assert.equal(await recovery,false);assert.equal(posts,0);assert.equal(cleared,0);assert.strictEqual(gate.pending,original);assert.equal(gate.busy,false);
});

test('a Coach write already sent before interruption still settles its exact receipt',async()=>{
  const ref=<T,>(current:T)=>({current});let release!:(value:unknown)=>void,posted!:()=>void,posts=0,cleared=0;
  const sent=new Promise<void>(resolve=>{posted=resolve;});
  const scope={owner:ref('owner'),hydratedOwner:ref('owner'),mounted:ref(true),generation:ref(0),readSequence:ref(0),statusSequence:ref(0),
    foregroundEligible:ref(true),readEnabled:ref(true),interruptionEpoch:ref(0),document:{hidden:false},gate:ref(new CoachMutationGate()),
    useCallback:(fn:unknown)=>fn,packCoachPending:async()=>({}),saveCoachPending(){},setLoading(){},setBusy(){},setError(){},setUncertain(){},
    clearPending(){cleared++;},saved:null,openSaved(){},reload(){},sessionStorage:{},request:async()=>{posts++;return new Promise(resolve=>{release=resolve;posted();});},
    setSaved(){},live:ref({gameId:'game-a'}),publishAccess(){},definiteFailure:()=>false,
  };
  const write=evaluate('../src/rally/useCoachExperience.ts',['write'],scope).write as (operation:unknown)=>Promise<boolean>;
  const pending=write({kind:'feedback',body:{commandId:'one-post'}});await sent;assert.equal(posts,1);
  scope.interruptionEpoch.current++;scope.foregroundEligible.current=false;release({session:{gameId:'game-a'},access:{}});
  assert.equal(await pending,true);assert.equal(posts,1);assert.equal(cleared,1);assert.equal(scope.gate.current.pending,null);
});

test('Pause countdown retires its timer on visible blur and resumes from the original elapsed anchor',()=>{
  const listeners=new Map<string,()=>void>(),timers=new Map<number,()=>void>(),elapsed:number[]=[];let now=0,id=0,focused=true;
  const document={hidden:false,hasFocus:()=>focused,addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name)};
  const hooks=evaluate('../src/table/PauseDialog.tsx',[],{
    lifecycle:{expiresAt:'2026-10-15T12:05:00Z',serverNow:'2026-10-15T12:00:00Z'},performance:{now:()=>now},setElapsed:(value:number)=>elapsed.push(value),document,
    window:{addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name)},
    setTimeout:(fn:()=>void)=>{timers.set(++id,fn);return id;},clearTimeout:(timer:number)=>timers.delete(timer),
  },'const received=');
  assert.equal(timers.size,1);focused=false;listeners.get('blur')!();assert.equal(timers.size,0);
  now=45_000;focused=true;listeners.get('focus')!();assert.equal(timers.size,1);assert.equal(elapsed.at(-1),45_000);
  document.hidden=true;listeners.get('visibilitychange')!();assert.equal(timers.size,0);
  now=90_000;document.hidden=false;listeners.get('visibilitychange')!();assert.equal(elapsed.at(-1),90_000);assert.equal(timers.size,1);
  (hooks.cleanup as ()=>void)();assert.equal(timers.size,0);assert.equal(listeners.size,0);
});

test('Settings dialog remount cannot restart the retained game countdown',()=>{
  const elapsed:number[]=[];let now=1000;
  const scope={lifecycle:{expiresAt:'2026-10-15T12:05:00Z',serverNow:'2026-10-15T12:00:00Z',receivedAt:0},
    performance:{now:()=>now},setElapsed:(value:number)=>elapsed.push(value),
    document:{hidden:false,hasFocus:()=>true,addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}},
    setTimeout:()=>1,clearTimeout(){},
  };
  const mount=()=>evaluate('../src/table/PauseDialog.tsx',[],scope,'const received=');
  let mounted=mount();assert.equal(remainingRetention(scope.lifecycle.expiresAt,scope.lifecycle.serverNow,elapsed.at(-1)!),299);
  (mounted.cleanup as ()=>void)();now=299_000;mounted=mount();
  assert.equal(remainingRetention(scope.lifecycle.expiresAt,scope.lifecycle.serverNow,elapsed.at(-1)!),1);
  (mounted.cleanup as ()=>void)();now=360_000;mounted=mount();
  assert.equal(remainingRetention(scope.lifecycle.expiresAt,scope.lifecycle.serverNow,elapsed.at(-1)!),0,'Reopening after the deadline shows zero until an authoritative expiry read');
  (mounted.cleanup as ()=>void)();
});
