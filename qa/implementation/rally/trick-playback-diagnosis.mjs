// Offline diagnosis only: actual hook and queue source with fake React effects
// and timers. This is not a browser/rendering test or proof of the live incident.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {playbackDelay} from '../../../web/src/table/playback.ts';
const require=createRequire(new URL('../../../web/package.json',import.meta.url));
const ts=require('typescript');
const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8');
const hookSource=ts.createSourceFile('useTrickPlayback.ts',read('web/src/games/trix/useTrickPlayback.ts'),ts.ScriptTarget.Latest,true);
const hook=hookSource.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='useTrickPlayback');
assert.ok(hook);
const hookCode=ts.transpileModule(`${hook.getText(hookSource).replace(/^export\s+/,'')};exports.hook=useTrickPlayback;`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const queueSource=ts.createSourceFile('useGoSession.ts',read('web/src/api/useGoSession.ts'),ts.ScriptTarget.Latest,true);
let queue;
function find(node){
  if(ts.isBinaryExpression(node)&&node.left.getText(queueSource)==='drainDisplay.current')queue=node.right;
  ts.forEachChild(node,find);
}
find(queueSource);assert.ok(queue);
const queueCode=ts.transpileModule(`drainDisplay.current=${queue.getText(queueSource)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

function clock(){
  let now=0,serial=0;const timers=new Map();
  const value={get now(){return now;},after(){},
    setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,time:now+delay});return id;},
    clearTimeout(id){timers.delete(id);},
    advance(ms){const end=now+ms;for(;;){
      const next=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time||a[0]-b[0])[0];
      if(!next)break;now=next[1].time;timers.delete(next[0]);next[1].fn();value.after();
    }now=end;value.after();},
  };return value;
}
function playbackHarness(time,speed=1){
  let cursor=0,dirty=false,observation,paused=false,result;
  const cells=[],pending=[];
  const context={exports:{},playbackDelay,performance:{now:()=>time.now},window:time,
    useState(initial){const index=cursor++;if(!cells[index])cells[index]={value:initial};
      return[cells[index].value,value=>{cells[index].value=typeof value==='function'?value(cells[index].value):value;dirty=true;}];},
    useRef(initial){const index=cursor++;return cells[index]??(cells[index]={current:initial});},
    useEffect(fn,deps){const index=cursor++,old=cells[index];
      if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))pending.push({index,fn,deps});},
  };
  runInNewContext(hookCode,context);
  function flush(){let loops=0;do{
    dirty=false;cursor=0;result=context.exports.hook(observation,paused,speed);
    for(const effect of pending.splice(0)){
      cells[effect.index]?.cleanup?.();
      cells[effect.index]={deps:effect.deps,cleanup:effect.fn()};
    }
    assert.ok(++loops<10,'Effects settle');
  }while(dirty);return result;}
  time.after=()=>{if(dirty)flush();};
  return {render(value,blocked=false){observation=value;paused=blocked;return flush();},get held(){return result;}};
}
const plays=[{seat:0,card:'S9'},{seat:3,card:'S2'},{seat:2,card:'S7'},{seat:1,card:'S8'}];
const earlier={number:1,winner:1,plays:[{seat:1,card:'C2'},{seat:0,card:'C3'},{seat:3,card:'C4'},{seat:2,card:'C5'}]};
const base={id:'offline-diagnosis',dealNumber:2,phase:'playing',turn:1,tricks:[earlier],trick:plays.slice(0,3)};
const completed={...base,turn:0,trick:[],tricks:[earlier,{number:2,winner:0,plays}]};
const results=[];
for(const speed of [1,1.2,1.4]){
  const time=clock(),h=playbackHarness(time,speed);h.render(base);
  assert.equal(h.render(completed)?.plays.length,4);
  time.advance(playbackDelay('trick',speed)-1);assert.equal(h.held?.plays.length,4);
  time.advance(1);assert.equal(h.held,undefined);
  results.push({case:'continuous mount, human winner',speed,visibleHoldMs:playbackDelay('trick',speed),fourCardsHeld:true});
}
{
  const time=clock(),h=playbackHarness(time);h.render(base);h.render(completed,true);
  time.advance(5000);assert.equal(h.held?.plays.length,4);
  h.render(completed,false);time.advance(playbackDelay('trick',1)-1);assert.equal(h.held?.plays.length,4);
  results.push({case:'completion while paused, then resume',fourCardsPreserved:true});
}
{
  const h=playbackHarness(clock());assert.equal(h.render(completed),undefined);
  results.push({case:'fresh mount into completed human-winner snapshot',fourCardHoldSkipped:true,reason:'initial seen number equals latest number'});
}
{
  const time=clock(),h=playbackHarness(time);h.render(base);
  const botCompleted={...completed,turn:1,tricks:[earlier,{number:2,winner:1,plays}]};
  const nextLead={...botCompleted,turn:0,trick:[{seat:1,card:'D2'}]};
  const shown=[];
  const context={playback:{current:{running:true}},displayTimer:{current:null},drainDisplay:{current:null},
    displayQueue:{current:[botCompleted,nextLead].map(observation=>({game:{gameId:'trix',observation},preferences:{gameSpeed:1}}))},
    show(model){h.render(model.game.observation);shown.push({at:time.now,heldCards:h.held?.plays.length??0});},
    setTimeout:time.setTimeout,playbackDelay};
  runInNewContext(queueCode,context);context.drainDisplay.current();
  time.advance(playbackDelay('turn',1));assert.equal(h.held?.plays.length,4);
  time.advance(playbackDelay('turn',1));assert.equal(h.held,undefined);
  results.push({case:'actual Trix display queue delivers a next lead',shown,intendedHoldMs:playbackDelay('trick',1),actualHoldMs:shown[1].at-shown[0].at});
}
console.log(JSON.stringify({kind:'offline state/timing diagnosis',productionFilesModified:false,results},null,2));
