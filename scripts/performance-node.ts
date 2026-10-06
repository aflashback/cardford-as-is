// Native Windows benchmark worker. Public source imports happen dynamically so
// their preparation time is visible and never mixed into warm job timings.
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {args,assertWindowsNode,protocol,sha256,verifyFrame} from './performance-common.mjs';

assertWindowsNode();
const options=args();
if(typeof options.workload!=='string')throw new Error('--workload required');
const workerStart=performance.now(),inputStart=performance.now();
const inputBytes=readFileSync(options.workload),workload=JSON.parse(inputBytes.toString('utf8'));
const inputPreparationMs=performance.now()-inputStart;
if(workload.protocol!==protocol)throw new Error('protocol mismatch');
const importStart=performance.now();
const {apply,collectTrick,nextHand,actionId}=await import('../web/server/game/index.ts');
const {observe}=await import('../web/server/observations/index.ts');
const {validateStoredGameState}=await import('../web/server/records/state-validation.ts');
const {observationView}=await import('../web/server/http/views.ts');
const {validateGameView}=await import('../web/shared/validators.mjs');
const importPreparationMs=performance.now()-importStart;
const warmups=Number(options.warmups??3),samples=Number(options.samples??1);
if(!Number.isInteger(warmups)||warmups<0||!Number.isInteger(samples)||samples<1)throw new Error('invalid repetitions');
const verify=options.verify===true;

function runJob() {
  const counts={jobs:1,initialStateDecodes:0,commandDecodes:0,checkpointValidations:0,transitions:0,checkpoints:0,observations:0,publicViews:0,candidateSets:0,candidates:0,publicOutputValidations:0,stateSerializations:0,observationSerializations:0,viewSerializations:0,frameSerializations:0,stateBytes:0,observationBytes:0,viewBytes:0,frameBytes:0};
  const framesHash=createHash('sha256'),finalStateRawHashes:string[]=[];
  for(const saved of workload.cases) {
    const initialBytes=Buffer.byteLength(saved.initialStateJSON);
    if(saved.commandJSONs.length>256||initialBytes>256*1024)throw new Error('input budget');
    let inputBytes=Buffer.byteLength(saved.mode)+initialBytes+2;
    for(const raw of saved.commandJSONs){const bytes=Buffer.byteLength(raw);if(bytes>256*1024)throw new Error('command byte budget');inputBytes+=bytes+1;}
    if(inputBytes>1024*1024)throw new Error('input byte budget');
    let state=JSON.parse(saved.initialStateJSON);counts.initialStateDecodes++;
    validateStoredGameState({id:state.id,revision:0,document:{state}});counts.checkpointValidations++;
    const capture=(index:number)=> {
      const stateJSON=JSON.stringify(state),stateBytes=Buffer.byteLength(stateJSON);counts.stateSerializations++;counts.stateBytes+=stateBytes;
      if(stateBytes>256*1024)throw new Error('state byte budget');
      let frameRemaining=512*1024-stateBytes;
      const observations=[],views=[],candidateIds=[],observationJSONs=[],viewJSONs=[];
      for(let seat=0;seat<4;seat++) {
        const observation=observe(state,seat as 0|1|2|3),view=observationView(state.id,observation),ids=observation.legalActions.map(actionId);
        counts.observations++;counts.publicViews++;counts.candidateSets++;counts.candidates+=ids.length;
        const observationJSON=JSON.stringify(observation),viewJSON=JSON.stringify(view);
        counts.observationSerializations++;counts.viewSerializations++;
        const observationBytes=Buffer.byteLength(observationJSON),viewBytes=Buffer.byteLength(viewJSON);
        counts.observationBytes+=observationBytes;counts.viewBytes+=viewBytes;
        frameRemaining-=observationBytes+viewBytes;
        if(frameRemaining<0||ids.length>Math.floor(frameRemaining/3))throw new Error('projection byte budget');
        for(const id of ids){const bytes=Buffer.byteLength(id);if(frameRemaining<3||bytes>Math.floor((frameRemaining-3)/6))throw new Error('candidate byte budget');frameRemaining-=3+6*bytes;}
        if(!validateGameView(JSON.parse(viewJSON)))throw new Error('invalid public output');counts.publicOutputValidations++;
        observations.push(observation);views.push(view);candidateIds.push(ids);observationJSONs.push(observationJSON);viewJSONs.push(viewJSON);
      }
      // The pre-serialized children are emitted once, matching Go RawMessages.
      const frameJSON='{"commandIndex":'+index+',"state":'+stateJSON+',"observations":['+observationJSONs.join(',')+'],"views":['+viewJSONs.join(',')+'],"candidateIds":'+JSON.stringify(candidateIds)+'}';
      const frameBytes=Buffer.byteLength(frameJSON);counts.frameSerializations++;counts.checkpoints++;counts.frameBytes+=frameBytes;
      if(frameBytes>512*1024)throw new Error('frame byte budget');framesHash.update(frameJSON);
      if(verify)verifyFrame({commandIndex:index,state,observations,views,candidateIds},saved.expected[index+1]);
      if(index===saved.commandJSONs.length-1)finalStateRawHashes.push(sha256(stateJSON));
    };
    if(saved.commandJSONs.length>256)throw new Error('command budget');capture(-1);
    for(const [index,raw] of saved.commandJSONs.entries()) {
      const command=JSON.parse(raw);counts.commandDecodes++;
      if(command.type==='action')state=apply(state,command.action);
      else if(command.type==='collect-trick')state=collectTrick(state);
      else if(command.type==='next-hand')state=nextHand(state,command.deal);
      else throw new Error('unsupported recorded command');
      validateStoredGameState({id:state.id,revision:index+1,document:{state}});counts.checkpointValidations++;
      counts.transitions++;capture(index);
    }
  }
  return {counts,frameRawSHA256:framesHash.digest('hex'),finalStateRawHashes};
}
function measured() {const cpu=process.cpuUsage(),start=performance.now(),work=runJob();const wallMs=performance.now()-start,delta=process.cpuUsage(cpu);return {wallMs,cpuUserMs:delta.user/1000,cpuKernelMs:delta.system/1000,processLifetimePeakWorkingSetKiB:process.resourceUsage().maxRSS,work};}
const preparationMs=performance.now()-workerStart;
let coldJob;for(let i=0;i<warmups;i++){const result=measured();if(i===0)coldJob=result;}
const measuredSamples=[];for(let i=0;i<samples;i++)measuredSamples.push(measured());
console.log(JSON.stringify({protocol,variant:'node',runtime:process.version,platform:process.platform,arch:process.arch,uv:process.versions.uv,cwd:process.cwd(),workloadSHA256:sha256(inputBytes),warmups,verificationOnly:verify,inputPreparationMs,importPreparationMs,preparationMs,coldJob,samples:measuredSamples,workerWallMs:performance.now()-workerStart,operationCounterScope:'Declared semantic boundaries; internal TS reader performs additional projections, clones and repeated checks. No claim of equal low-level instructions.'}));
