import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { playbackDelay, completedTrickDelay } from '../src/table/playback.ts';
import { PresentationQueue, type PresentationClock } from '../src/api/presentationQueue.ts';
import type { ClientSession, ClientTrixSession } from '../src/api/sessionModel.ts';

// Execute the actual hook with deterministic React effect/clock adapters; no browser renderer.
function clock() {
  let now = 0, serial = 0;
  const timers = new Map<number, {fn: () => void; time: number}>();
  const value = {get now() {return now;}, after() {},
    setTimeout(fn: () => void, delay: number) {const id = ++serial; timers.set(id, {fn, time: now + delay}); return id;},
    clearTimeout(id: number) {timers.delete(id);},
    requestAnimationFrame(fn: () => void) {return value.setTimeout(fn, 16);},
    cancelAnimationFrame(id: number) {value.clearTimeout(id);},
    advance(ms: number) {const end = now + ms; for (;;) {
      const next = [...timers].filter(([,v]) => v.time <= end).sort((a,b) => a[1].time-b[1].time || a[0]-b[0])[0];
      if (!next) break; now = next[1].time; timers.delete(next[0]); next[1].fn(); value.after();
    } now = end; value.after();},
  }; return value;
}
function hookHarness(time: ReturnType<typeof clock>, speed = 1) {
  const source = ts.createSourceFile('hook.ts', readFileSync(new URL('../src/games/trix/useTrickPlayback.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const hook = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'useTrickPlayback');
  assert.ok(hook);
  const code = ts.transpileModule(`${hook.getText(source).replace(/^export\s+/, '')};exports.hook=useTrickPlayback;`, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  let cursor = 0, dirty = false, observation: unknown, paused = false, nativeHeld: boolean | undefined, result: {plays: unknown[]; number: number} | undefined;
  const cells: any[] = [], pending: {index: number; fn: () => unknown; deps: unknown[]}[] = [];
  const context = {exports: {} as {hook: (...args: any[]) => typeof result}, playbackDelay,
    completedTrickDelay: (pace: number) => playbackDelay('throw', pace) + playbackDelay('trick', pace),
    performance: {now: () => time.now}, window: time,
    useState(initial: unknown) {const index = cursor++; if (!cells[index]) cells[index] = {value: initial};
      return [cells[index].value, (v: any) => {cells[index].value = typeof v === 'function' ? v(cells[index].value) : v; dirty = true;}];},
    useRef(initial: unknown) {const index = cursor++; return cells[index] ?? (cells[index] = {current: initial});},
    useEffect(fn: () => unknown, deps: unknown[]) {const index = cursor++, old = cells[index];
      if (!old || deps.some((v,i) => !Object.is(v, old.deps[i]))) pending.push({index, fn, deps});},
  };
  runInNewContext(code, context);
  function flush() {let loops = 0; do {
    dirty = false; cursor = 0; result = context.exports.hook(observation, paused, speed, nativeHeld);
    for (const effect of pending.splice(0)) {cells[effect.index]?.cleanup?.(); cells[effect.index] = {deps: effect.deps, cleanup: effect.fn()};}
    assert.ok(++loops < 10, 'Effects settle');
  } while (dirty); return result;}
  time.after = () => {if (dirty) flush();};
  return {render(value: unknown, blocked = false, pace = speed, externalHold?: boolean) {observation = value; paused = blocked; speed = pace; nativeHeld = externalHold; return flush();}, get held() {return result;}};
}
const plays = [{seat:0,card:'S9'},{seat:3,card:'S2'},{seat:2,card:'S7'},{seat:1,card:'S8'}];
const base = {id:'test',dealNumber:2,phase:'playing',turn:1,tricks:[],trick:plays.slice(0,3)};
const completed = {...base,turn:0,trick:[],tricks:[{number:1,winner:0,plays}]};
const nextLead = {...completed,turn:3,trick:[{seat:0,card:'D2'}]};
for (const speed of [1,1.2,1.4]) test(`fourth card gets paint, landing and full hold at ${speed}x`, () => {
  const time = clock(), h = hookHarness(time, speed); h.render(base); h.render(completed);
  const total = 32 + playbackDelay('throw',speed) + playbackDelay('trick',speed);
  time.advance(total - 1); assert.equal(h.held?.plays.length, 4);
  time.advance(2); assert.equal(h.held, undefined);
});
test('snapshot with next lead cannot erase a newly completed trick', () => {
  const h = hookHarness(clock()); h.render(base); assert.equal(h.render(nextLead)?.plays.length, 4);
});
test('initial completed snapshot does not replay historical tricks', () => {
  assert.equal(hookHarness(clock()).render(completed), undefined);
});
test('pause and a faster preference preserve the unfinished hold', () => {
  const time = clock(), h = hookHarness(time); h.render(base); h.render(completed);
  time.advance(300); h.render(nextLead,true); time.advance(10000); assert.equal(h.held?.plays.length,4);
  h.render(nextLead,false,1.4); time.advance(1000); assert.equal(h.held?.plays.length,4);
  time.advance(1000); assert.equal(h.held,undefined);
});

type Model = ClientSession | ClientTrixSession;
type Mode = 'trix' | 'hearts' | 'spades-solo' | 'spades-partners';
function model(mode: Mode, revision: number, stage: 'three' | 'complete' | 'lead', speed: 1 | 1.2 | 1.4 = 1): Model {
  const observation = stage === 'three' ? base : stage === 'complete' ? completed : nextLead;
  const game = mode === 'trix' ? {id:'test',gameId:'trix',variantId:'basic-solo',seat:0,observation} : {
    id:'test', mode, handNumber:2, phase:stage === 'complete' ? 'trick-end' : 'play',
    trick:stage === 'three' ? plays.slice(0,3) : stage === 'complete' ? plays : nextLead.trick,
    history:stage === 'three' ? [] : [{winner:0,plays}],
    turn:stage === 'three' ? 1 : stage === 'complete' ? 0 : 3, legalActions:[],
  };
  // Only public fields consumed by this presentation helper; not a transport fixture.
  return {game, revision, decisionId:`d${revision}`, preferences:{gameSpeed:speed,coachMode:'asked'}, candidates:[]} as Model;
}
function queueClock(time: ReturnType<typeof clock>): PresentationClock {
  return {now: () => time.now,
    setTimeout: (callback, ms) => time.setTimeout(callback, ms) as unknown as ReturnType<typeof setTimeout>,
    clearTimeout: timer => time.clearTimeout(timer as unknown as number)};
}
function queueHarness() {
  const time = clock(), shown: Model[] = [], holds: boolean[] = [];
  const queue = new PresentationQueue(value => {if (value) shown.push(value);}, queueClock(time),
    value => holds.push(value));
  return {time,shown,holds,queue, get visible() {return shown[shown.length-1];},
    ack() {queue.notePresented(shown[shown.length-1].revision);}};
}
for (const mode of ['trix','hearts','spades-solo','spades-partners'] as const) {
  for (const speed of [1,1.2,1.4] as const) test(`${mode} ${speed}x: delayed fourth paints before full outgoing dwell`, () => {
    const h = queueHarness(); h.queue.accept(model(mode,10,'three',speed)); h.ack(); h.queue.setRunning(true);
    h.time.advance(5000); // Network/bot think time must not consume the completed frame's dwell.
    h.queue.accept(model(mode,11,'complete',speed)); assert.equal(h.visible.revision,11);
    h.queue.accept(model(mode,12,'lead',speed)); h.time.advance(5000);
    assert.equal(h.visible.revision,11,'No collection until the rendered fourth frame acknowledges paint');
    assert.equal(h.queue.isHolding(),true); h.ack();
    h.time.advance(completedTrickDelay(speed)-1); assert.equal(h.visible.revision,11);
    h.time.advance(2); assert.equal(h.visible.revision,12); assert.equal(h.queue.isHolding(),false);
  });
  test(`${mode}: receipt catch-up and repeated snapshot preserve completion`, () => {
    const h = queueHarness(); h.queue.accept(model(mode,10,'three')); h.ack(); h.queue.setRunning(true);
    const complete = model(mode,11,'complete'), lead = model(mode,12,'lead');
    h.queue.accept(complete); h.queue.accept(lead); h.queue.expedite(12);
    assert.equal(h.visible.revision,11,'Receipt cannot splice past an unseen completed trick');
    h.queue.accept({...lead}); h.queue.expedite(12); h.time.advance(5000);
    assert.equal(h.visible.revision,11); h.ack();
    h.time.advance(completedTrickDelay(1)+1); assert.equal(h.visible.revision,12);
  });
  test(`${mode}: same-hand recovery reconstructs four public cards before next lead`, () => {
    const h = queueHarness(); h.queue.accept(model(mode,10,'three')); h.ack(); h.queue.setRunning(true); h.time.advance(5000);
    const snapshot = model(mode,12,'lead'), original = JSON.stringify(snapshot); h.queue.accept(snapshot);
    assert.equal(h.queue.isHolding(),true);
    if ('gameId' in h.visible.game) {assert.equal(h.visible.game.observation.trick.length,0); assert.equal(h.visible.game.observation.tricks[0].plays.length,4);}
    else {assert.equal(h.visible.game.phase,'trick-end'); assert.equal(h.visible.game.trick.length,4); assert.deepEqual(h.visible.game.legalActions,[]);}
    assert.equal(JSON.stringify(snapshot),original,'Public display projection cannot mutate authoritative input');
    h.ack(); h.time.advance(completedTrickDelay(1)+1); assert.equal(h.visible,snapshot);
    h.ack(); h.queue.accept({...snapshot}); h.time.advance(5000); assert.equal(h.queue.isHolding(),false);
  });
}
test('pause, repeated snapshot and faster settings retain the exact unfinished native dwell', () => {
  const h = queueHarness(); h.queue.accept(model('trix',10,'three')); h.ack(); h.queue.setRunning(true); h.time.advance(5000);
  h.queue.accept(model('trix',11,'complete')); h.ack(); h.time.advance(300);
  h.queue.setRunning(false); h.queue.accept(model('trix',11,'complete',1.4)); h.queue.accept(model('trix',12,'lead',1.4));
  h.time.advance(20000); assert.equal(h.visible.revision,11); assert.equal(h.queue.isHolding(),true);
  h.queue.setRunning(true); h.time.advance(completedTrickDelay(1)-301); assert.equal(h.visible.revision,11);
  h.time.advance(2); assert.equal(h.visible.revision,12);
});
test('native held cards, controls and queued next deal share one clock across pause', () => {
  const time = clock(), hook = hookHarness(time); let visible = model('trix',10,'three') as ClientTrixSession, held = false;
  const render = () => hook.render(visible.game.observation,false,1,held);
  const queue = new PresentationQueue(value => {if (value) {visible = value as ClientTrixSession; render();}},
    queueClock(time), value => {held=value; render();});
  queue.accept(visible); queue.notePresented(10); queue.setRunning(true); time.advance(5000);
  queue.accept(model('trix',11,'complete')); queue.notePresented(11); time.advance(300);
  queue.setRunning(false);
  const newDeal = model('trix',12,'three') as ClientTrixSession;
  newDeal.game.observation = {...newDeal.game.observation,dealNumber:3}; queue.accept(newDeal);
  time.advance(10000); assert.equal(hook.held?.plays.length,4); assert.equal(visible.revision,11);
  queue.setRunning(true); time.advance(completedTrickDelay(1)-301);
  assert.equal(hook.held?.plays.length,4); assert.equal(queue.isHolding(),true); assert.equal(visible.revision,11);
  time.advance(2); assert.equal(hook.held,undefined); assert.equal(queue.isHolding(),false); assert.equal(visible.revision,12);
});
test('initial Trix history and a security/game reset do not replay historical completions', () => {
  const h = queueHarness(); const initial = model('trix',11,'lead'); h.queue.accept(initial); h.ack(); h.queue.setRunning(true);
  h.time.advance(5000); assert.deepEqual(h.shown,[initial]); assert.equal(h.queue.isHolding(),false);
  h.queue.accept(model('trix',10,'three'),true); h.queue.accept(model('trix',11,'complete')); h.queue.expedite(11);
  assert.equal(h.queue.isHolding(),true); h.queue.reset(null); assert.equal(h.queue.isHolding(),false);
  h.queue.accept(initial); h.ack(); h.time.advance(5000); assert.equal(h.visible,initial); assert.equal(h.queue.isHolding(),false);
});
test('bounded catch-up never coalesces away completed-trick frames', () => {
  const h = queueHarness(); h.queue.accept(model('hearts',1,'three')); h.ack();
  for (let revision=2; revision<40; revision++) {
    const value = model('hearts',revision,revision<3?'complete':'lead'); h.queue.accept(value);
  }
  h.queue.setRunning(true); h.queue.expedite(39); assert.equal(h.visible.revision,2);
  h.ack(); h.time.advance(completedTrickDelay(1)+1); assert.ok(h.visible.revision>2);
});
test('multiple recovered completions with one revision each require a fresh paint acknowledgement', () => {
  const h = queueHarness(); h.queue.accept(model('hearts',10,'three')); h.ack(); h.queue.setRunning(true); h.time.advance(5000);
  const recovered = model('hearts',20,'lead') as ClientSession;
  const second = {winner:1 as const, plays:plays.map(play => ({...play,card:play.card.replace('S','H')}))};
  recovered.game.history = [recovered.game.history[0], second];
  h.queue.accept(recovered); assert.equal((h.visible as ClientSession).game.history.length,1);
  h.ack(); h.time.advance(completedTrickDelay(1)+1);
  assert.equal((h.visible as ClientSession).game.history.length,2); assert.equal(h.queue.isHolding(),true);
  h.time.advance(10000); assert.notEqual(h.visible,recovered,'Second synthetic frame cannot inherit the first acknowledgement');
  h.ack(); h.time.advance(completedTrickDelay(1)+1); assert.equal(h.visible,recovered);
});

// Exercise the production authority/intent closures too, rather than testing
// only the presentation helper's public methods.
const sessionSource = ts.createSourceFile('useGoSession.ts',readFileSync(new URL('../src/api/useGoSession.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const sessionFunction = sessionSource.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'useGoSession');
assert.ok(sessionFunction?.body);
function sessionClosures<T>(names: string[], scope: Record<string,unknown>): T {
  const definitions = names.map(name => {
    for (const statement of sessionFunction!.body!.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      const declaration = statement.declarationList.declarations.find(item => item.name.getText(sessionSource) === name);
      if (declaration?.initializer && ts.isCallExpression(declaration.initializer))
        return `const ${name} = ${declaration.initializer.arguments[0].getText(sessionSource)};`;
    }
    throw new Error(`Missing production closure: ${name}`);
  });
  const code = ts.transpileModule(`${definitions.join('\n')}\nexports.result={${names.join(',')}};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const context = {...scope,exports:{result:undefined as T | undefined}};runInNewContext(code,context);return context.exports.result!;
}
function intentScope(pending: Promise<unknown> | null = null) {
  const interruptions: boolean[] = [], queueRuns: boolean[] = [], errors: string[] = [];
  const scope = {
    playbackRequest:{current:pending},playback:{current:{running:true,generation:1}},playbackGame:{current:'game'},
    requestedRunning:{current:false},presentationPaused:{current:true},
    playbackIntent:{current:{gameId:'game',intent:'pause',reason:'manual',epoch:0}},eligibilityEpoch:{current:0},foregroundEligible:{current:true},disposed:{current:false},
    presenceTimer:{current:null},presenceRequest:{current:null},document:{hidden:false},navigator:{onLine:true},clearTimeout,
    preparationRequests:{current:new Set()},
    retainStopIntent(){},readStopIntent:()=>null,clearStopIntent(){},setLifecycle(){},setInterruptionReason(){},validateContract:()=>true,
    presentationQueue:{current:{setRunning(value:boolean){queueRuns.push(value);}}},
    owner:{current:'owner'},ownerGeneration:{current:0},
    wire:{current:{session:{gameId:'game',control:{controlGeneration:1}}}},current:{current:{controlLeaseToken:'token'}},
    readGoPending:()=>null,verifyOwner:async()=> 'owner',executeGo:async()=>({running:true,generation:3}),
    crypto:{randomUUID:()=> 'id'},realtime:{current:{notePlayback(){},setPaused(){},suspend(){}}},setPlaybackRunning(){},
    setPlaybackInterrupted(value:boolean){interruptions.push(value);},setError(value:string){errors.push(value);},read:async()=>{},
  }; return {scope,interruptions,queueRuns,errors};
}
type PlaybackAPI = {setPlayback(running:boolean):Promise<boolean>;updatePlayback(value:{running:boolean;generation:number;phase?:string;pauseReason?:string;serverNow?:string;expiresAt?:string},gameId:string):void};
test('already-running resume clears a failed pause intent before the next shared view', async () => {
  const h = intentScope(), api = sessionClosures<PlaybackAPI>(['updatePlayback','setPlayback'],h.scope);
  assert.equal(await api.setPlayback(true),true); assert.equal(h.scope.requestedRunning.current,true);
  api.updatePlayback({running:true,generation:4},'game'); assert.deepEqual(h.queueRuns,[false,false,true,true]);
  assert.equal(h.interruptions.includes(true),false);
});
test('overlapping pause then resume does not mislabel the pause receipt as an interruption', async () => {
  let release!:()=>void;const pending = new Promise<void>(resolve=>{release=resolve;});
  const h = intentScope(pending), api = sessionClosures<PlaybackAPI>(['updatePlayback','setPlayback'],h.scope);
  const resuming = api.setPlayback(true); assert.equal(h.scope.requestedRunning.current,false,'In-flight pause retains receipt attribution');
  api.updatePlayback({running:false,generation:2},'game'); assert.equal(h.interruptions.includes(true),false);
  release(); assert.equal(await resuming,true); assert.equal(h.scope.playback.current.running,true);
  assert.equal(h.interruptions.includes(true),false); assert.equal(h.queueRuns[h.queueRuns.length-1],true);
});
test('a local pause stays paused while an earlier server-running update arrives', () => {
  const h = intentScope(); h.scope.requestedRunning.current = true;
  const api = sessionClosures<PlaybackAPI>(['updatePlayback','setPlayback'],h.scope);
  api.updatePlayback({running:true,generation:2},'game'); assert.deepEqual(h.queueRuns,[false]);
});
test('a held lease expiring latches interruption even though playback was already stopped',()=>{
  const h=intentScope();Object.assign(h.scope.playback.current,{running:false,phase:'held'});h.scope.playbackIntent.current.intent='hold';
  const api=sessionClosures<PlaybackAPI>(['updatePlayback'],h.scope);
  api.updatePlayback({running:false,generation:2,phase:'paused',pauseReason:'lease_expired'},'game');
  assert.equal(h.interruptions.includes(true),true);
});
test('normal game completion is not described as a connection interruption',()=>{
  const h=intentScope();h.scope.requestedRunning.current=true;
  const api=sessionClosures<PlaybackAPI>(['updatePlayback'],h.scope);
  api.updatePlayback({running:false,generation:2,phase:'completed'},'game');assert.equal(h.interruptions.includes(true),false);
});
test('lifecycle receipt clock survives identical receipts and is retained outside dialog mounting',()=>{
  const h=intentScope();let now=1000,captured:unknown=null;
  Object.assign(h.scope,{performance:{now:()=>now},setLifecycle:(next:unknown)=>{captured=typeof next==='function'?(next as (previous:unknown)=>unknown)(captured):next;}});
  const api=sessionClosures<PlaybackAPI>(['updatePlayback'],h.scope);
  const value={running:false,generation:2,phase:'paused',serverNow:'2026-10-15T12:00:00Z',expiresAt:'2026-10-15T12:05:00Z'};
  api.updatePlayback(value,'game');assert.equal((captured as {receivedAt:number}).receivedAt,1000);
  now=60_000;api.updatePlayback({...value},'game');assert.equal((captured as {receivedAt:number}).receivedAt,1000,'An old receipt cannot grant more displayed retention');
  api.updatePlayback({...value,serverNow:'2026-10-15T12:01:00Z'},'game');assert.equal((captured as {receivedAt:number}).receivedAt,60_000);
});
test('command envelope uses authoritative revision and rejects a held or lagging display', () => {
  const live = {game:{id:'game'},revision:12,decisionId:'d12',controlLeaseToken:'token'};
  let holding = false;
  const scope = {current:{current:live},displayed:{current:{...live}},presentationQueue:{current:{isHolding:()=>holding}},crypto:{randomUUID:()=> 'id'}};
  const api = sessionClosures<{envelope():{expectedRevision:number}}>(['envelope'],scope);
  assert.equal(api.envelope().expectedRevision,12);
  holding=true; assert.throws(()=>api.envelope(),/catching up/);
  holding=false; scope.displayed.current.revision=11; assert.throws(()=>api.envelope(),/catching up/);
  assert.equal(scope.current.current.revision,12,'Presentation lag never rolls authority back');
});
