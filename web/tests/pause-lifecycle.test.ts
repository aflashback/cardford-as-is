import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {PauseIntent,pauseBeforeTableExit,registerTableExitGuard} from '../src/table/pauseLifecycle.ts';
import {createLifecycle,reduceLifecycle,canResumeLifecycle} from '../src/table/sessionLifecycle.ts';
import {IdlePresence} from '../src/table/idlePresence.ts';

function component(path:string,name:string,scope:Record<string,unknown>) {
  const source=ts.createSourceFile(path,readFileSync(new URL(path,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const node=source.statements.find((value):value is ts.FunctionDeclaration=>ts.isFunctionDeclaration(value)&&value.name?.text===name);
  assert.ok(node);
  const context={...scope,exports:{} as {component:(props?:unknown)=>unknown}};
  const code=ts.transpileModule(`${node.getText(source)}; exports.component=${name};`,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React},
  }).outputText;
  runInNewContext(code,context);return context.exports.component;
}
type Element={tag:unknown;props:Record<string,unknown>;children:Element[]};
const React={createElement:(tag:unknown,props:Record<string,unknown>|null,...children:Element[]):Element=>({tag,props:props??{},children:children.flat().filter(Boolean)})};
const nodes=(value:Element):Element[]=>value&&typeof value==='object'?[value,...value.children.flatMap(nodes)]:[];

test('manual pause dialog cannot resume through X, Escape or backdrop dismissal',()=>{
  const listeners=new Map<string,(event:{key:string;preventDefault():void})=>void>();
  let closed=0;
  const el={contains:()=>false,querySelector:()=>({focus(){}})};
  const Dialog=component('../src/table/Dialog.tsx','Dialog',{React,X:'X',
    useRef:(value:unknown)=>({current:value===null?el:value}),useEffect:(effect:()=>void)=>effect(),
    HTMLElement:class {},document:{activeElement:null,addEventListener:(name:string,fn:(event:{key:string;preventDefault():void})=>void)=>listeners.set(name,fn)},
  });
  const tree=Dialog({title:'Game paused',onClose:()=>closed++,dismissible:false}) as Element;
  assert.equal(nodes(tree).filter(node=>node.props['aria-label']==='Close dialog').length,0,'Manual pause must not display an ambiguous X');
  listeners.get('keydown')!({key:'Escape',preventDefault(){}});
  const target={};(tree.props.onMouseDown as (event:unknown)=>void)({target,currentTarget:target});
  assert.equal(closed,0,'Only the explicit Resume control may restart manual pause');
});

for(const confirmed of [true,false])test(`Account navigation waits for pause confirmation and ${confirmed?'proceeds on success':'stays at the paused table on failure'}`,async()=>{
  let route='#',release!:(ok:boolean)=>void;
  const listeners=new Map<string,()=>unknown>();
  const pending=new Promise<boolean>(resolve=>{release=resolve;});
  const location={hash:'#'};
  const App=component('../src/App.tsx','App',{React,AuthGate:'auth-gate',LiveTable:'table',DemoPage:'demo',AccountPage:'account',
    useState:()=>[route,(value:string)=>{route=value;}],useRef:(value:unknown)=>({current:value}),
    useEffect:(effect:()=>void)=>effect(),pauseBeforeTableExit:()=>pending,
    isTableRoute:(value:string)=>value!=='#account'&&value!=='#demo',
    window:{location,addEventListener:(name:string,fn:()=>unknown)=>listeners.set(name,fn)},
    history:{replaceState(){}},
  });
  App(); location.hash='#account';const navigation=listeners.get('hashchange')!();
  assert.equal(route,'#','Account must wait for the stop acknowledgment');
  release(confirmed);await navigation;assert.equal(route,confirmed?'#account':'#');
});

test('a later pause invalidates an in-flight Resume until the player explicitly tries again',()=>{
  const states:boolean[]=[];const intent=new PauseIntent(value=>states.push(value));
  const first=intent.beginResume();intent.pause();
  assert.equal(intent.finishResume(first),false);
  assert.deepEqual(states,[true]);
  const second=intent.beginResume();assert.equal(intent.finishResume(second),true);
  assert.deepEqual(states,[true,false]);
});

test('exit guard exposes failed confirmation and stale cleanup cannot remove a newer table guard',async()=>{
  const removeOld=registerTableExitGuard(async()=>true);
  const removeNew=registerTableExitGuard(async()=>false);
  removeOld();assert.equal(await pauseBeforeTableExit(),false);
  removeNew();assert.equal(await pauseBeforeTableExit(),true);
});

function lifecycle(canStop=true) {
  let paused=true,stops=0;
  const windowListeners=new Map<string,()=>void>(),documentListeners=new Map<string,()=>void>();
  const document={hidden:false,addEventListener:(name:string,fn:()=>void)=>documentListeners.set(name,fn),
    removeEventListener:(name:string)=>documentListeners.delete(name)};
  const cleanups:(()=>void)[]=[];
  const usePause=component('../src/table/useGamePause.ts','useGamePause',{
    PauseIntent,registerTableExitGuard,createLifecycle,reduceLifecycle,canResumeLifecycle,IdlePresence,
    useState:(initial:unknown)=>{const value=typeof initial==='function'?(initial as ()=>unknown)():initial;return [value,(next:unknown)=>{if(typeof next==='object'&&next!==null&&'paused' in next)paused=(next as {paused:boolean}).paused;}];},useRef:(value:unknown)=>({current:value}),
    useCallback:(fn:unknown)=>fn,useEffect:(effect:()=>void|(()=>void))=>{const cleanup=effect();if(cleanup)cleanups.push(cleanup);},document,
    navigator:{onLine:true},window:{addEventListener:(name:string,fn:()=>void)=>windowListeners.set(name,fn),removeEventListener:(name:string)=>windowListeners.delete(name),setTimeout:()=>0,clearTimeout(){}},
  });
  const api=usePause({canStop,stop:async()=>{stops++;return true;}}) as {
    pause():Promise<boolean>;beginResume():number;canResume(ticket:number):boolean;finishResume(ticket:number):boolean;
  };
  return {api,document,windowListeners,documentListeners,get paused(){return paused;},get stops(){return stops;},cleanup:()=>cleanups.forEach(fn=>fn())};
}

for(const event of ['blur','pagehide','pageshow','visibilitychange'])test(`${event} stops the owned game and foreground does not clear the pause`,async()=>{
  const h=lifecycle();h.api.finishResume(h.api.beginResume());assert.equal(h.paused,false);
  if(event==='visibilitychange'){h.document.hidden=true;h.documentListeners.get(event)!();}
  else h.windowListeners.get(event)!();
  assert.equal(h.paused,true);assert.equal(h.stops,1);
  h.document.hidden=false;h.documentListeners.get('visibilitychange')!();
  assert.equal(h.paused,true);assert.equal(h.stops,1);
  h.api.finishResume(h.api.beginResume());assert.equal(h.paused,false);
  h.cleanup();
});

test('offline latches and stops every table just like visibility loss',async()=>{
  const h=lifecycle();h.api.finishResume(h.api.beginResume());
  h.windowListeners.get('offline')!();assert.equal(h.paused,true);assert.equal(h.stops,1);h.cleanup();
});

test('view-only lifecycle latches locally without stopping the table owned elsewhere',async()=>{
  const h=lifecycle(false);assert.equal(await h.api.pause(),true);
  assert.equal(h.stops,0);assert.equal(h.paused,true);h.cleanup();assert.equal(h.stops,0);
});

test('unmount retires its guard, listeners and owned server playback',async()=>{
  const h=lifecycle();h.api.finishResume(h.api.beginResume());const pendingResume=h.api.beginResume();h.cleanup();
  assert.equal(h.stops,1);assert.equal(h.documentListeners.size,0);assert.equal(h.windowListeners.size,0);
  assert.equal(h.api.finishResume(pendingResume),false,'An unmounted table must never finish an old Resume');
  assert.equal(await pauseBeforeTableExit(),true);
});
