import assert from 'node:assert/strict';
import test from 'node:test';
import { RealtimeStream } from '../src/api/realtimeStream.ts';
import {suspendAuthAccess} from '../src/api/authLifecycle.ts';
import type { RealtimeMessage, RealtimeSnapshot } from '../shared/local-service.contracts.ts';

const view = {
  platformSchemaVersion:'1.0.0', playerId:'owner', activeGameId:null, session:null,
  preferences:{schemaVersion:'1.0.0',revision:0,preferences:{coachMode:'asked',gameSpeed:1}},
  catalog:[],
} as const;
const playback = {running:true,generation:1};
function message(sequence:number):RealtimeMessage {
  return {schemaVersion:'1.0.0',messageId:`message-${sequence}`,streamId:'stream-one',
    sequence,type:'session.view',view,playback};
}
function snapshot(sequence:number):RealtimeSnapshot {
  return {schemaVersion:'1.0.0',streamId:'stream-one',sequence,view,works:[],playback};
}

class FakeSocket {
  static readonly OPEN = 1;
  static readonly sockets:FakeSocket[] = [];
  static failNext = false;
  readyState = 0;
  onopen:(() => void)|null = null;
  onclose:(() => void)|null = null;
  onerror:(() => void)|null = null;
  onmessage:((event:{data:string}) => void)|null = null;
  sent = 0;
  readonly url:string;
  constructor(url:string) {
    this.url = url;
    FakeSocket.sockets.push(this);
    const fail = FakeSocket.failNext;
    FakeSocket.failNext = false;
    queueMicrotask(() => {
      if (fail) { this.readyState = 3; this.onclose?.(); }
      else { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
    });
  }
  send() { this.sent++; }
  close() { this.readyState = 3; this.onclose?.(); }
  emit(value:RealtimeMessage) { this.onmessage?.({data:JSON.stringify(value)}); }
}

test('socket opens before snapshot, buffered frames apply in order, and healthy recovery reuses the binding', async t => {
  const previous = {
    window:globalThis.window, document:globalThis.document, navigator:globalThis.navigator,
    WebSocket:globalThis.WebSocket, sessionStorage:globalThis.sessionStorage, fetch:globalThis.fetch,
  };
  let stream:RealtimeStream|null = null;
  const listeners = new Map<string,Set<() => void>>();
  const add = (name:string, listener:() => void) => {
    if (!listeners.has(name)) listeners.set(name,new Set());
    listeners.get(name)!.add(listener);
  };
  const remove = (name:string, listener:() => void) => listeners.get(name)?.delete(listener);
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{href:'http://127.0.0.1:4173/',host:'127.0.0.1:4173',protocol:'http:'},addEventListener:add,removeEventListener:remove}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false,addEventListener:add,removeEventListener:remove}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
  Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:FakeSocket});
  const stored = new Map<string,string>();
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(key:string)=>stored.get(key)??null,setItem:(key:string,value:string)=>stored.set(key,value)}});
  t.after(() => {
    stream?.close();
    for (const [name,value] of Object.entries(previous))
      Object.defineProperty(globalThis,name,{configurable:true,value});
    FakeSocket.sockets.length = 0;
    FakeSocket.failNext = false;
  });
  let negotiated = 0;
  let snapshots = 0;
  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path === '/api/realtime/negotiate') {
      negotiated++;
      return Response.json({enabled:true,mode:'local',streamId:'stream-one',url:'/api/realtime/connect?streamId=stream-one'});
    }
    assert.match(path,/^\/api\/realtime\/snapshot\?streamId=stream-one$/);
    snapshots++;
    assert.equal(FakeSocket.sockets[0]?.readyState,FakeSocket.OPEN);
    if (snapshots === 1) {
      FakeSocket.sockets[0].emit(message(11));
      FakeSocket.sockets[0].emit(message(12));
      return Response.json(snapshot(10));
    }
    if (snapshots === 2) {
      FakeSocket.sockets[0].emit(message(13));
      return Response.json(snapshot(12));
    }
    if (snapshots === 3) {
      FakeSocket.sockets[0].emit({schemaVersion:'1.0.0',messageId:'control-14',
        streamId:'stream-one',sequence:14,type:'control.changed',controlGeneration:2});
      return Response.json(snapshot(13));
    }
    return Response.json(snapshot(14));
  };
  const applied:number[] = [];
  let followup:Promise<RealtimeSnapshot>|null = null;
  stream = new RealtimeStream({
    snapshot:async value => { applied.push(value.sequence); },
    message:async value => {
      await new Promise(resolve=>setTimeout(resolve,5));
      applied.push(value.sequence);
      if (value.type === 'control.changed') followup = stream!.recoverAfterCurrent();
    },
    disconnected:()=>undefined,
  });
  stream.setPaused(false);await stream.start();
  assert.deepEqual(applied,[10,11,12]);
  assert.equal(stream.sequence,12);
  await stream.recover();
  assert.deepEqual(applied,[10,11,12,12,13]);
  assert.equal(stream.sequence,13);
  assert.equal(negotiated,1);
  assert.equal(FakeSocket.sockets.length,1);
  assert.equal(FakeSocket.sockets[0].sent,0);
  await stream.recover();
  assert.ok(followup);
  await followup;
  assert.deepEqual(applied,[10,11,12,12,13,13,14,14]);
  assert.equal(snapshots,4);
});

test('HTTP-only fallback snapshots without repeated negotiation', async t => {
  const names = ['window','document','navigator','WebSocket','sessionStorage','fetch'] as const;
  const previous = names.map(name => [name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
  const noop = () => undefined;
  const set = (name:string,value:unknown) =>
    Object.defineProperty(globalThis,name,{configurable:true,value});
  set('window',{addEventListener:noop,removeEventListener:noop});
  set('document',{hidden:false,addEventListener:noop,removeEventListener:noop});
  set('navigator',{onLine:true});
  set('WebSocket',FakeSocket);
  set('sessionStorage',{getItem:()=>null,setItem:noop});
  let negotiated = 0, snapshots = 0;
  set('fetch',async (input:unknown) => {
    if (String(input) === '/api/realtime/negotiate') {
      negotiated++;
      return Response.json({enabled:false,mode:'http',streamId:null,url:null});
    }
    assert.equal(String(input),'/api/realtime/snapshot');
    snapshots++;
    return Response.json({...snapshot(snapshots),streamId:null,playback:{running:false,generation:0}});
  });
  const stream = new RealtimeStream({snapshot:async()=>undefined,message:async()=>undefined,disconnected:noop});
  t.after(() => {
    stream.close();
    for (const [name,descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis,name,descriptor);
      else Reflect.deleteProperty(globalThis,name);
    }
  });
  stream.setPaused(false);await stream.start();
  await stream.recover();
  assert.equal(stream.mode,'http');
  assert.equal(negotiated,1);
  assert.equal(snapshots,2);
  assert.equal(FakeSocket.sockets.length,0);
});

test('failed initial socket handshake still yields an HTTP bootstrap snapshot', async t => {
  const names = ['window','document','navigator','WebSocket','sessionStorage','fetch'] as const;
  const previous = names.map(name => [name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
  const noop = () => undefined;
  const set = (name:string,value:unknown) =>
    Object.defineProperty(globalThis,name,{configurable:true,value});
  set('window',{location:{href:'http://127.0.0.1:4173/',host:'127.0.0.1:4173',protocol:'http:'},addEventListener:noop,removeEventListener:noop});
  set('document',{hidden:false,addEventListener:noop,removeEventListener:noop});
  set('navigator',{onLine:true});
  set('WebSocket',FakeSocket);
  set('sessionStorage',{getItem:()=>null,setItem:noop});
  FakeSocket.failNext = true;
  let snapshots = 0;
  set('fetch',async (input:unknown) => {
    if (String(input) === '/api/realtime/negotiate')
      return Response.json({enabled:true,mode:'local',streamId:'stream-one',url:'/api/realtime/connect?streamId=stream-one'});
    assert.equal(String(input),'/api/realtime/snapshot');
    snapshots++;
    return Response.json({...snapshot(0),streamId:null});
  });
  const stream = new RealtimeStream({snapshot:async()=>undefined,message:async()=>undefined,disconnected:noop});
  t.after(() => {
    stream.close();
    FakeSocket.sockets.length = 0;
    FakeSocket.failNext = false;
    for (const [name,descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis,name,descriptor);
      else Reflect.deleteProperty(globalThis,name);
    }
  });
  stream.setPaused(false);const value = await stream.start();
  assert.equal(value.streamId,null);
  assert.equal(snapshots,1);
});

test('closing during negotiation cannot create a late socket or publish a snapshot', async t => {
  const names = ['window','document','navigator','WebSocket','sessionStorage','fetch'] as const;
  const previous = names.map(name => [name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
  const noop = () => undefined;
  const set = (name:string,value:unknown) =>
    Object.defineProperty(globalThis,name,{configurable:true,value});
  set('window',{location:{href:'http://127.0.0.1:4173/',host:'127.0.0.1:4173',protocol:'http:'},addEventListener:noop,removeEventListener:noop});
  set('document',{hidden:false,addEventListener:noop,removeEventListener:noop});
  set('navigator',{onLine:true});
  set('WebSocket',FakeSocket);
  set('sessionStorage',{getItem:()=>null,setItem:noop});
  let resolveNegotiation:(value:Response)=>void = () => undefined;
  let snapshots = 0;
  set('fetch',async (input:unknown) => {
    if (String(input) === '/api/realtime/negotiate')
      return new Promise<Response>(resolve => { resolveNegotiation = resolve; });
    snapshots++;
    return Response.json({...snapshot(0),streamId:null});
  });
  const stream = new RealtimeStream({snapshot:async()=>undefined,message:async()=>undefined,disconnected:noop});
  t.after(() => {
    stream.close();
    FakeSocket.sockets.length = 0;
    for (const [name,descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis,name,descriptor);
      else Reflect.deleteProperty(globalThis,name);
    }
  });
  stream.setPaused(false);const starting = stream.start();
  await Promise.resolve();
  stream.close();
  resolveNegotiation(Response.json({enabled:true,mode:'local',streamId:'stream-one',url:'/api/realtime/connect?streamId=stream-one'}));
  await assert.rejects(starting,/stream changed|stream closed/i);
  assert.equal(FakeSocket.sockets.length,0);
  assert.equal(snapshots,0);
});

test('offline immediately retires its socket and an old close after Resume cannot pause the recovered binding',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const names=['window','document','navigator','WebSocket','sessionStorage','fetch'] as const;
  const previous=names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
  const listeners=new Map<string,Set<()=>void>>();
  const add=(name:string,fn:()=>void)=>{const all=listeners.get(name)??new Set();all.add(fn);listeners.set(name,all);};
  const remove=(name:string,fn:()=>void)=>listeners.get(name)?.delete(fn);
  const navigator={onLine:true};let negotiated=0,disconnects=0;
  const set=(name:string,value:unknown)=>Object.defineProperty(globalThis,name,{configurable:true,value});
  set('window',{location:{href:'http://127.0.0.1:4173/',host:'127.0.0.1:4173',protocol:'http:'},addEventListener:add,removeEventListener:remove});
  set('document',{hidden:false,addEventListener:add,removeEventListener:remove});set('navigator',navigator);set('WebSocket',FakeSocket);
  set('sessionStorage',{getItem:()=>null,setItem(){}});
  set('fetch',async(input:unknown)=>{
    if(String(input)==='/api/realtime/negotiate'){
      const streamId=`stream-${++negotiated}`;return Response.json({enabled:true,mode:'local',streamId,url:`/api/realtime/connect?streamId=${streamId}`});
    }
    return Response.json({...snapshot(0),streamId:`stream-${negotiated}`});
  });
  const stream=new RealtimeStream({snapshot:async()=>undefined,message:async()=>undefined,disconnected:()=>{disconnects++;}});
  t.after(()=>{stream.close();FakeSocket.sockets.length=0;for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}});
  stream.setPaused(false);await stream.start();stream.setPaused(false);const retired=FakeSocket.sockets[0];
  navigator.onLine=false;listeners.get('offline')?.forEach(fn=>fn());
  assert.equal(retired.readyState,3,'The offline binding must close immediately rather than survive the pause grace');
  assert.equal(stream.mode,'suspended');assert.equal(disconnects,0);
  navigator.onLine=true;listeners.get('online')?.forEach(fn=>fn());stream.setPaused(false);await stream.recover();
  assert.equal(negotiated,2);assert.equal(stream.mode,'live');
  retired.close();assert.equal(disconnects,0,'A late close from the retired binding must not interrupt Resume');
  t.mock.timers.tick(35_000);assert.equal(stream.mode,'live','No grace timer from the interrupted run may suspend the resumed binding');
  const active=FakeSocket.sockets.at(-1)!;suspendAuthAccess();assert.equal(active.readyState,3);
  assert.equal(stream.mode,'suspended');listeners.get('online')?.forEach(fn=>fn());
  t.mock.timers.tick(35_000);assert.equal(negotiated,2,'An expired access lease cannot reopen on timers or return');
});


test('paused initial/recovery snapshots never negotiate and focus never opens a socket',async t=>{
 const names=['window','document','navigator','fetch'] as const;
 const previous=names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
 const listeners=new Map<string,()=>void>();
 const set=(name:string,value:unknown)=>Object.defineProperty(globalThis,name,{configurable:true,value});
 set('window',{addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener(){}});
 set('document',{hidden:false,addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener(){}});
 set('navigator',{onLine:true});let requests=0;
 set('fetch',async(input:unknown)=>{requests++;assert.equal(String(input),'/api/realtime/snapshot');return Response.json({...snapshot(0),streamId:null,playback:{running:false,generation:0}});});
 const stream=new RealtimeStream({snapshot:async()=>undefined,message:async()=>undefined,disconnected(){}});
 t.after(()=>{stream.close();for(const [name,d] of previous){if(d)Object.defineProperty(globalThis,name,d);else Reflect.deleteProperty(globalThis,name);}});
 await stream.start();listeners.get('visibilitychange')?.();await Promise.resolve();
 assert.equal(requests,1);await stream.recover();assert.equal(requests,2);assert.equal(stream.connected,false);
});
