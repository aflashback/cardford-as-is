// TSC-01/06/07/11: offline request orchestration. No provider or production hooks.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { relative } from 'node:path';
import { preserveBuild, resolveBuild, sourceDigest } from '../coach-lab-builds.mjs';
import { projectPlayerPacket, renderPrompt, resolveResponse, validateCampaign } from './contracts.mjs';
import { appendEvent, getBlob, jsonBytes, putBlob, readJournal, safePath, sha, withRunLock, writeImmutable } from './journal.mjs';
import { inspectHostInvocation, verifyHostReceipt, verifyResponseBytes } from './bridge.mjs';
import { curate } from './curate.mjs';
import { verifyCurrentBranchEngine } from './current-branch-engine.mjs';

export const repository = fileURLToPath(new URL('../../', import.meta.url));
export const defaultHome = resolve(repository, '.local/evaluation/trix-scenarios');
const templateDirectory = 'planning/implementation/coach-lab/trix-scenario-collection';
const runIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Internal continuation seam. The caller must bind an explicit policy to its
// immutable owner-amendment audit; the original manifest/plan stays unchanged.
export function effectiveExecutionPolicy(collector) {
  const policy=collector.executionPolicy;
  if(policy===undefined)return {maxActiveSegmentWallMs:collector.manifest.plan.workCaps.maxActiveSegmentWallMs,selectionDeferred:false};
  assert.ok(policy!==null&&typeof policy==='object'&&Object.getPrototypeOf(policy)===Object.prototype,'Invalid execution policy object');
  const keys=Reflect.ownKeys(policy);
  assert.ok(keys.every(key=>typeof key==='string'),'Invalid execution policy keys');
  assert.deepEqual(keys.sort(),['maxActiveSegmentWallMs','selectionDeferred'],'Invalid execution policy keys');
  assert.equal(policy.maxActiveSegmentWallMs,null,'Execution policy must explicitly remove the aggregate wall cap');
  assert.equal(policy.selectionDeferred,true,'Execution policy must explicitly defer selection');
  return {maxActiveSegmentWallMs:null,selectionDeferred:true};
}
export function sourceHashes(root = repository) {
  const files = ['go.mod', 'go.sum', 'package.json', 'package-lock.json', 'web/package.json', 'scripts/trix-scenario-collection.mjs', 'scripts/coach-lab-builds.mjs', 'scripts/bounded-native-run.mjs', 'scripts/windows-env.mjs', 'scripts/windows-tools.json'];
  const walk = (name, allowed) => {
    for (const item of readdirSync(safePath(root, name), { withFileTypes: true })) {
      assert.ok(!item.isSymbolicLink(), 'Source symlink rejected');
      const next = `${name}/${item.name}`;
      if (item.isDirectory()) walk(next, allowed); else if (allowed.some(ext => next.endsWith(ext))) files.push(next);
    }
  };
  walk('server', ['.go', '.json']); walk('scripts/trix-scenario-collection', ['.mjs', '.mts']);
  walk('web/shared', ['.mjs', '.json']);
  walk('contracts/trix-scenario-collection', ['.json']); walk(templateDirectory, ['.json', '.md']);
  // Keep runtime validators and their exact installed dependency graph local
  // to the frozen source. A later npm update cannot change an old experiment.
  const packages=new Set();
  const bundlePackage=(name,from)=>{
    const path=createRequire(from).resolve(`${name}/package.json`);
    if(packages.has(path))return;packages.add(path);
    const directory=relative(root,dirname(path)).replaceAll('\\','/');safePath(root,directory);
    walk(directory,['.js','.cjs','.mjs','.json']);
    for(const license of ['LICENSE','LICENSE.md','LICENSE.txt'])if(existsSync(safePath(root,`${directory}/${license}`)))files.push(`${directory}/${license}`);
    const metadata=JSON.parse(readFileSync(path,'utf8'));
    for(const dependency of Object.keys(metadata.dependencies??{}))bundlePackage(dependency,path);
  };
  bundlePackage('ajv',resolve(root,'package.json'));
  return Object.fromEntries([...new Set(files)].sort().map(name => [name, sha(readFileSync(safePath(root, name)))]));
}
export function nativeCall(binary, command, input) {
  const result = spawnSync(binary, [command], { input: JSON.stringify(input), encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 16 << 20 });
  assert.ok(!result.error && result.status === 0, `Native ${command} failed: ${result.error?.message ?? result.stderr}`);
  return JSON.parse(result.stdout);
}
const deck = () => ['C', 'D', 'H', 'S'].flatMap(s => ['2','3','4','5','6','7','8','9','10','J','Q','K','A'].map(r => s+r));
export function seededDeck(seed) {
  const cards = deck(); let counter = 0;
  const draw = limit => {
    const ceiling = Math.floor(0x100000000 / limit) * limit;
    for (;;) { const n = createHash('sha256').update(`${seed}:${counter++}`).digest().readUInt32BE(0); if (n < ceiling) return n % limit; }
  };
  for (let i=cards.length-1;i>0;i--) { const j=draw(i+1); [cards[i],cards[j]]=[cards[j],cards[i]]; }
  return cards;
}
export function physicalDealFamily(cards) {
  assert.equal(cards.length,52);assert.equal(new Set(cards).size,52);
  const hands=Array.from({length:4},(_,s)=>cards.slice(s*13,(s+1)*13).sort().join(','));
  // Seat rotations of a physical deal belong to one family.
  return sha(hands.map((_,i)=>[...hands.slice(i),...hands.slice(0,i)].join(';')).sort()[0]);
}
export function makeSchedule(plan, seed) {
  const replacements=plan.workCaps.maxAttemptedEpisodes-plan.phases.reduce((n,p)=>n+p.maxCompletedRequests,0);
  return plan.phases.flatMap(phase => Array.from({length:phase.maxCompletedRequests+replacements}, (_,index) => {
    const owner=(Math.floor(index/phase.requests.length)+index%phase.requests.length)%4, attempts=[]; let cards, draw=0;
    do { const candidateSeed=sha(`${seed}:${phase.variant}:${index}:${draw++}`); cards=seededDeck(candidateSeed); attempts.push({seed:candidateSeed,owner:Math.floor(cards.indexOf('H7')/13)}); assert.ok(draw<=100,'Opening-seat admission exhausted'); } while (Math.floor(cards.indexOf('H7')/13)!==owner);
    return {episodeId:`${phase.variant}-${index+1}`,familyId:physicalDealFamily(cards),variant:phase.variant,request:phase.requests[index%phase.requests.length],deck:cards,admission:attempts,authored:false};
  }));
}
export function initializeRun({runId, plan, binaryPath, home=defaultHome, seed=randomUUID(), fixture=false, archive=true}) {
  assert.match(runId,runIdPattern); validateCampaign(plan);
  const root=safePath(home,runId); assert.ok(!existsSync(root),'Run exists; choose a new run ID');
  mkdirSync(root,{recursive:true});
  return withRunLock(root,()=>{
    let build=null, hashes={};
    if (archive) { hashes=sourceHashes(); const pins={sourceDigest:sourceDigest(hashes),binaryDigest:sha(readFileSync(binaryPath))}; const saved=preserveBuild(root,repository,hashes,pins,binaryPath); build={...pins,sourceArchive:saved.sourceRoot,binaryPath:saved.binaryPath}; }
    else assert.equal(fixture,true,'Live runs require archived source and binary');
    const schedule=makeSchedule(plan,seed), scheduleRef=putBlob(root,schedule);
    const manifest={schemaVersion:'trix-scenario-run-1.0.0',runId,corpusId:plan.corpusId,mode:fixture?'fixture':'live',nodeRuntime:{version:process.version,platform:process.platform,arch:process.arch},plan,planHash:sha(jsonBytes(plan)),sourceHashes:hashes,build,scheduleRef,createdAt:new Date().toISOString()};
    writeImmutable(safePath(root,'manifest.json'),jsonBytes(manifest));
    appendEvent(root,'initialized',{manifestHash:sha(jsonBytes(manifest))});
    return {runId,root,mode:manifest.mode};
  });
}
export class Collector {
  constructor(root, {native, inspector=inspectHostInvocation, currentBranchEngine}={}) {
    this.root=resolve(root); this.manifest=JSON.parse(readFileSync(safePath(root,'manifest.json'),'utf8'));
    assert.equal(this.manifest.schemaVersion,'trix-scenario-run-1.0.0');validateCampaign(this.manifest.plan);
    assert.deepEqual(this.manifest.nodeRuntime,{version:process.version,platform:process.platform,arch:process.arch},'Use the original Node runtime to resume this run');
    assert.equal(this.manifest.planHash,sha(jsonBytes(this.manifest.plan)));
    if(currentBranchEngine !== undefined) {
      this.currentBranchEngine=verifyCurrentBranchEngine(currentBranchEngine);
      this.native=(command,input)=>nativeCall(currentBranchEngine.executablePath,command,input);
      this.sourceRoot=currentBranchEngine.sourceRoot;this.templateRoot=resolve(this.sourceRoot,templateDirectory,'prompts');
    } else if(this.manifest.build) {
      const b=resolveBuild(root,this.manifest.sourceHashes,{sourceDigest:this.manifest.build.sourceDigest,binaryDigest:this.manifest.build.binaryDigest});
      this.native=(command,input)=>nativeCall(b.binaryPath,command,input);this.sourceRoot=b.sourceRoot;this.templateRoot=resolve(b.sourceRoot,templateDirectory,'prompts');
    } else { assert.equal(this.manifest.mode,'fixture');assert.equal(typeof native,'function');this.native=native;this.templateRoot=resolve(repository,templateDirectory,'prompts'); }
    this.inspector=inspector;
    this.schedule=getBlob(root,this.manifest.scheduleRef);
  }
  state() {
    const rows=readJournal(this.root);
    assert.equal(rows[0]?.kind,'initialized');assert.equal(rows[0].data.manifestHash,sha(jsonBytes(this.manifest)));
    const s={rows,episode:null,frameRef:null,pending:null,claimed:null,response:null,intent:null,paused:false,segmentStartedAt:null,attempts:0,acceptedPlays:0,episodes:[],closedPhases:[],reviews:[],commits:[],outcomes:[]};
    for(const e of rows) {
      const d=e.data;
      if(e.kind==='episode-started'){s.episode=d.episode;s.frameRef=d.frameRef;s.pending=null;s.claimed=null;s.response=null;s.intent=null;s.episodes.push(d.episode);}
      if(e.kind==='job-prepared'){s.pending=d;s.claimed=null;s.response=null;}
      if(e.kind==='dispatch-claimed'){s.claimed=d;s.attempts++;}
      if(e.kind==='segment-started')s.segmentStartedAt=e.at;
      if(e.kind==='attempt-settled'){s.claimed=null;s.pending=null;if(d.fatal)s.paused=true;}
      if(e.kind==='response-saved')s.response=d;
      if(e.kind==='commit-intent')s.intent=d;
      if(e.kind==='move-committed'){s.frameRef=d.frameRef;s.commits.push(d);if(d.phase==='playing')s.acceptedPlays++;s.pending=null;s.claimed=null;s.response=null;s.intent=null;}
      if(e.kind==='episode-completed'){s.outcomes.push(d);s.episode=null;s.frameRef=null;s.pending=null;}
      if(e.kind==='episode-abandoned'){s.episode=null;s.frameRef=null;s.pending=null;s.claimed=null;s.response=null;s.intent=null;}
      if(e.kind==='pause')s.paused=true;
      if(e.kind==='resume'){s.paused=false;s.segmentStartedAt=null;}
      if(e.kind==='phase-closed')s.closedPhases.push(d.variant);
      if(e.kind==='review-imported')s.reviews.push(d);
    }
    return s;
  }
  status() { const s=this.state();return {runId:this.manifest.runId,mode:this.manifest.mode,status:s.paused?'paused':s.claimed?'awaiting-response':s.episode?'active':'ready',episodeId:s.episode?.episodeId??null,pendingJobId:s.pending?.jobId??null,counters:{attempts:s.attempts,acceptedPlays:s.acceptedPlays,completedRequests:s.outcomes.length},closedPhases:s.closedPhases}; }
  frame(s=this.state()){return getBlob(this.root,s.frameRef);}
  next() {return withRunLock(this.root,()=>{
    const policy=effectiveExecutionPolicy(this);
    this.recoverIntent(); let s=this.state(); const caps=this.manifest.plan.workCaps;
    // Recording an already-earned native result spends no new invocation. Do
    // it before pause/attempt/time gates, including the last permitted attempt.
    if(s.episode){const finished=this.frame(s);if(finished.outcome){appendEvent(this.root,'episode-completed',{episodeId:s.episode.episodeId,familyId:s.episode.familyId,variant:s.episode.variant,request:s.episode.request,outcomeRef:putBlob(this.root,finished.outcome),frameRef:s.frameRef});return {stop:'request-completed',episodeId:s.episode.episodeId,outcome:finished.outcome};}}
    if(s.paused)return {stop:'paused'};
    if(policy.maxActiveSegmentWallMs!==null&&s.segmentStartedAt&&Date.now()-Date.parse(s.segmentStartedAt)>=policy.maxActiveSegmentWallMs){appendEvent(this.root,'pause',{reason:'active-segment-wall-cap'});return {stop:'active-segment-wall-cap'};}
    if(s.pending)return {job:s.pending,claimed:s.claimed!==null};
    if(s.attempts>=caps.maxPlayerAttemptsCampaign)return {stop:'attempt-cap'};
    if(!s.episode){
      const phase=this.manifest.plan.phases.find(p=>!s.closedPhases.includes(p.variant));
      if(!phase)return {stop:'campaign-complete'};
      const completed=s.outcomes.filter(o=>o.variant===phase.variant).length;
      if(completed>0&&completed%caps.batchRequests===0) {
        const marker=s.rows.findLast(e=>e.kind==='batch-reviewed'&&e.data.variant===phase.variant&&e.data.completed===completed);
        if(!marker)return {stop:'batch-review-required',variant:phase.variant,completed};
      }
      if(this.manifest.mode==='live'&&!policy.selectionDeferred){
        const selected=curate(this).coverage.byVariant[phase.variant]??0;
        if(selected>=phase.targetCases){
          if(completed===0)appendEvent(this.root,'phase-closed',{variant:phase.variant,selected,target:phase.targetCases,shortfall:0,reason:'Existing reviewed corpus already meets this phase target'});
          return {stop:'phase-target-met',variant:phase.variant,selected};
        }
      }
      if(completed>=phase.maxCompletedRequests)return {stop:'phase-cap-reached',variant:phase.variant};
      if(s.episodes.length>=caps.maxAttemptedEpisodes)return {stop:'episode-cap'};
      const used=new Set(s.episodes.map(e=>e.episodeId)); const episode=this.schedule.find(e=>e.variant===phase.variant&&!used.has(e.episodeId)&&s.outcomes.filter(o=>o.variant===phase.variant&&o.request===e.request).length<phase.maxRequestsPerContract);
      if(!episode)return {stop:'phase-cap-reached',variant:phase.variant};
      const frame=this.native('start',{variant:episode.variant,request:episode.request,id:episode.episodeId,deck:episode.deck});
      this.checkFrame(frame,episode);
      // Only private journal receives full deals/snapshots. Pending prompts never do.
      appendEvent(this.root,'episode-started',{episode,frameRef:putBlob(this.root,frame)});s=this.state();
    }
    const frame=this.frame(s);
    if(frame.outcome){appendEvent(this.root,'episode-completed',{episodeId:s.episode.episodeId,familyId:s.episode.familyId,variant:s.episode.variant,request:s.episode.request,outcomeRef:putBlob(this.root,frame.outcome),frameRef:s.frameRef});return {stop:'request-completed',episodeId:s.episode.episodeId,outcome:frame.outcome};}
    const prior=s.rows.filter(e=>e.kind==='job-prepared'&&e.data.episodeId===s.episode.episodeId&&e.data.revision===frame.revision);
    if(prior.length>=caps.maxPlayerAttemptsPerDecision){appendEvent(this.root,'pause',{reason:'decision-attempt-cap'});return {stop:'decision-attempt-cap'};}
    const jobId=randomUUID();const packet=projectPlayerPacket(frame.nativeActorPacket,frame.pin,frame.revision,jobId,frame.rules);
    const rendered=renderPrompt(packet,frame.node.phase,{templateRoot:this.templateRoot});
    const repair=prior.length?'\nYour previous response could not be parsed or did not match an enumerated legal option. Return only the required JSON with exactly the requested fields and a legal card or declaration subset.\n':'';
    const promptBytes=Buffer.concat([rendered.bytes,Buffer.from(repair)]);
    const schemaFile=frame.node.phase==='declare-doubles'?'declaration-response.schema.json':'play-response.schema.json';
    const schemaRoot=resolve(this.sourceRoot??repository,'contracts/trix-scenario-collection');
    const job={schemaVersion:'trix-player-job-1.0.0',jobId,runId:this.manifest.runId,episodeId:s.episode.episodeId,decisionId:`${s.episode.episodeId}:${frame.revision}:${packet.actor}`,actor:packet.actor,revision:frame.revision,phase:frame.node.phase,pin:frame.pin,packetRef:putBlob(this.root,packet),nativePacketRef:putBlob(this.root,frame.nativeActorPacket),promptRef:putBlob(this.root,promptBytes),promptHash:sha(promptBytes),responseSchemaHash:sha(readFileSync(resolve(schemaRoot,schemaFile))),sharedRulesHash:packet.sharedRulesHash,attempt:prior.length+1,requestedModel:'gpt-6-luna',requestedEffort:'max'};
    writeImmutable(safePath(this.root,`outbox/${jobId}.json`),jsonBytes(job));writeImmutable(safePath(this.root,`outbox/${jobId}.prompt.txt`),promptBytes);
    appendEvent(this.root,'job-prepared',job);return {job,promptPath:`outbox/${jobId}.prompt.txt`};
  });}
  checkFrame(frame,episode) {
    assert.equal(frame.schemaVersion,'trix-collection-native-1.0.0');assert.equal(frame.pin.gameId,'trix');assert.equal(frame.pin.variantId,episode.variant);
    const p=this.manifest.plan.phases.find(p=>p.variant===episode.variant);assert.equal(frame.pin.ruleProfileId,p.ruleProfileId);
    for(const [k,v] of Object.entries(this.manifest.plan.pins))assert.equal(frame.pin[k],v,`Native pin ${k} mismatch`);
    assert.ok(frame.node.phase!=='layout');
    if(frame.nativeActorPacket)assert.equal(frame.nativeActorPacket.observation.request,episode.request);
    if(frame.outcome){assert.equal(frame.outcome.completedTricks,13);assert.equal(frame.outcome.acceptedPlays,52);assert.equal(frame.outcome.nativeTerminalPhase,'round-complete');}
  }
  claim(jobId, parentThreadId) {return withRunLock(this.root,()=>{
    const policy=effectiveExecutionPolicy(this);
    const s=this.state();assert.ok(!s.paused&&!s.claimed,'Run is paused or has an uncertain/outstanding dispatch');assert.equal(s.pending?.jobId,jobId);
    assert.ok(s.attempts<this.manifest.plan.workCaps.maxPlayerAttemptsCampaign,'Attempt cap');
    assert.ok(policy.maxActiveSegmentWallMs===null||!s.segmentStartedAt||Date.now()-Date.parse(s.segmentStartedAt)<policy.maxActiveSegmentWallMs,'Active segment wall cap');
    if(!s.segmentStartedAt)appendEvent(this.root,'segment-started',{});
    const claimedAt=new Date().toISOString(),segmentEnd=policy.maxActiveSegmentWallMs===null?Infinity:Date.parse(this.state().segmentStartedAt)+policy.maxActiveSegmentWallMs;
    const claim={jobId,dispatchToken:randomUUID(),parentThreadId:parentThreadId??null,taskName:`trix_player_${jobId.replaceAll('-','')}`,claimedAt,deadlineAt:new Date(Math.min(Date.parse(claimedAt)+this.manifest.plan.workCaps.maxInvocationWallMs,segmentEnd)).toISOString()};
    appendEvent(this.root,'dispatch-claimed',claim);writeImmutable(safePath(this.root,`outbox/${jobId}.claim.json`),jsonBytes(claim));return {...s.pending,...claim};
  });}
  settle(jobId,reason,{verifiedNotRunning=false}={}) {return withRunLock(this.root,()=>{
    const s=this.state();assert.equal(s.pending?.jobId,jobId);assert.ok(s.claimed);
    // Without host reconciliation a possibly running invocation must never be replaced.
    assert.equal(verifiedNotRunning,true,'Dispatch must be reconciled with trusted host evidence before retry');
    appendEvent(this.root,'attempt-settled',{jobId,dispatchToken:s.claimed.dispatchToken,reason,fatal:true});return this.status();
  });}
  accept(jobId,bytes,receipt) {return withRunLock(this.root,()=>{
    this.recoverIntent();let s=this.state();const responseHash=sha(bytes);
    const previous=s.commits.find(c=>c.jobId===jobId);
    if(previous){assert.equal(previous.responseHash,responseHash,'Conflicting duplicate response');assert.equal(previous.receiptHash,sha(jsonBytes(receipt)),'Conflicting duplicate receipt');return previous;}
    assert.equal(s.pending?.jobId,jobId);assert.ok(s.claimed&&!s.paused,'Unclaimed or paused response');
    const job={...s.pending,...s.claimed};const rawRef=putBlob(this.root,Buffer.from(bytes)),receiptRef=putBlob(this.root,receipt);
    appendEvent(this.root,'attempt-output',{jobId,rawRef,receiptRef});
    const evidence=this.inspector(job,receipt,this.root);
    if(!evidence?.available){appendEvent(this.root,'pause',{reason:'host-bridge-unavailable',detail:evidence?.reason??'uninspectable'});throw Error('Host bridge unavailable: '+(evidence?.reason??'uninspectable'));}
    const admission=verifyHostReceipt(job,receipt,evidence.events,evidence.baseContext);
    if(!admission.admitted){appendEvent(this.root,'pause',{reason:'host-admission-rejected',admission});throw Error(admission.errors.join('; '));}
    try{verifyResponseBytes(receipt,bytes);}catch(error){appendEvent(this.root,'pause',{reason:'response-byte-mismatch'});throw error;}
    let response,candidateId;
    try {response=JSON.parse(Buffer.from(bytes).toString('utf8'));candidateId=resolveResponse(getBlob(this.root,job.nativePacketRef),response);} catch(error){appendEvent(this.root,'attempt-settled',{jobId,reason:error.message,fatal:job.attempt>=this.manifest.plan.workCaps.maxPlayerAttemptsPerDecision});throw error;}
    const saved={jobId,job,rawRef,receiptRef,responseHash,receiptHash:sha(jsonBytes(receipt)),candidateId,response,admission};appendEvent(this.root,'response-saved',saved);
    appendEvent(this.root,'commit-intent',{jobId,beforeFrameRef:s.frameRef,savedRef:putBlob(this.root,saved)});
    this.recoverIntent();return this.state().commits.at(-1);
  });}
  recoverIntent() {
    let s=this.state();
    // An admitted response is already final, even if the process stopped before
    // persisting its intent. Recover it before accepting a replacement response.
    if(!s.intent&&s.response){
      appendEvent(this.root,'commit-intent',{jobId:s.response.jobId,beforeFrameRef:s.frameRef,savedRef:putBlob(this.root,s.response)});
      s=this.state();
    }
    if(!s.intent)return;
    const saved=getBlob(this.root,s.intent.savedRef),before=getBlob(this.root,s.intent.beforeFrameRef),job=saved.job;
    assert.equal(before.revision,job.revision);assert.equal(job.actor,before.nativeActorPacket.seat);
    const after=this.native('commit',{pin:before.pin,snapshot:before.snapshot,expectedRevision:job.revision,actor:job.actor,candidateId:saved.candidateId});this.checkFrame(after,s.episode);
    const commit={jobId:job.jobId,decisionId:job.decisionId,episodeId:job.episodeId,familyId:s.episode.familyId,variant:s.episode.variant,request:s.episode.request,revision:job.revision,nextRevision:after.revision,actor:job.actor,phase:job.phase,forced:before.nativeActorPacket.candidates.length===1,selectedCandidateId:saved.candidateId,responseHash:saved.responseHash,receiptHash:saved.receiptHash,savedRef:s.intent.savedRef,frameRef:putBlob(this.root,after),nativeBeforeDigest:sha(jsonBytes(before.snapshot)),nativeAfterDigest:sha(jsonBytes(after.snapshot))};
    appendEvent(this.root,'move-committed',commit);
  }
  pause(reason='operator-request'){return withRunLock(this.root,()=>{appendEvent(this.root,'pause',{reason});return this.status();});}
  abandon(reason){return withRunLock(this.root,()=>{
    this.recoverIntent();const s=this.state();assert.ok(s.episode,'No active episode');assert.ok(!s.claimed,'Reconcile outstanding dispatch first');
    assert.ok(typeof reason==='string'&&reason.trim(),'Abandonment reason required');assert.ok(!this.frame(s).outcome,'Completed request must be recorded, not abandoned');
    appendEvent(this.root,'episode-abandoned',{episodeId:s.episode.episodeId,variant:s.episode.variant,request:s.episode.request,frameRef:s.frameRef,reason});
    return this.status();
  });}
  resume(){return withRunLock(this.root,()=>{this.recoverIntent();const s=this.state();assert.ok(!s.claimed,'Reconcile outstanding dispatch first');appendEvent(this.root,'resume',{});return this.status();});}
  replay() {
    const s=this.state();return s.outcomes.map(o=>{
      const episode=s.episodes.find(e=>e.episodeId===o.episodeId),commits=s.commits.filter(c=>c.episodeId===o.episodeId);
      const frame=this.native('replay',{variant:episode.variant,request:episode.request,id:episode.episodeId,deck:episode.deck,choices:commits.map(c=>({actor:c.actor,candidateId:c.selectedCandidateId}))});
      assert.deepEqual(frame.outcome,getBlob(this.root,o.outcomeRef));return {episodeId:o.episodeId,status:'passed',completedTricks:frame.outcome.completedTricks};
    });
  }
}
