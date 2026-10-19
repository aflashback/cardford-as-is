// TSC-03/06/08: one fresh, host-verified decision at a time; no bot fallback.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appendEvent, getBlob, jsonBytes, safePath, sha, withRunLock, writeImmutable } from './journal.mjs';
import { startClient, probeCapability, invoke, inspectAppServerEvidence, defaultExecutable } from './app-server-bridge.mjs';
import { makeReviewPacket, importHostReview } from './review.mjs';
import { importNormalizedHostReview } from './review-envelope.mjs';
import { closeBatch, exportCases, report } from './export.mjs';
import { verifyHostReceipt } from './bridge.mjs';
import { effectiveExecutionPolicy } from './runner.mjs';

export function receiptFromEvidence(job,evidence) {
  assert.equal(evidence.available,true,evidence.reason);const e=evidence.events;
  const receipt={schemaVersion:'trix-host-receipt-1.0.0',jobId:job.jobId,dispatchToken:job.dispatchToken,promptHash:job.promptHash,responseHash:e.responseHash,hostAgentId:e.agentId,requestedModel:'gpt-6-luna',requestedEffort:'max',reportedModelId:e.reportedModelId??null,startedAt:e.startedAt,finishedAt:e.finishedAt,dispatchStatus:'completed',usage:null};
  assert.ok(Number.isFinite(Date.parse(e.startedAt))&&Number.isFinite(Date.parse(e.finishedAt))&&Date.parse(e.startedAt)>=Date.parse(job.claimedAt),'Missing or invalid trusted host timestamps');
  const admission=verifyHostReceipt(job,receipt,e,evidence.baseContext);assert.equal(admission.admitted,true,admission.errors.join('; '));return receipt;
}

export async function dispatchHostJob(collector,job,{inventory,cwd='C:/Windows/Temp',executable=defaultExecutable}) {
  const root=safePath(collector.root,`private/invocations/${job.jobId}`);
  assert.ok(!existsSync(safePath(root,'private/app-server/wire.jsonl')),'Invocation already exists; reconcile it before retrying');
  writeImmutable(safePath(root,'job.json'),jsonBytes(job));
  writeImmutable(safePath(root,job.promptRef.path),getBlob(collector.root,job.promptRef,false));
  writeImmutable(safePath(root,'host-base-context-admission.json'),jsonBytes(inventory));
  const remaining=Date.parse(job.deadlineAt)-Date.now();assert.ok(remaining>0,'Dispatch deadline expired');
  const client=startClient({root,cwd,executable,timeoutMs:Math.min(30000,remaining)});
  // One absolute deadline includes catalog/configuration RPCs, not just inference.
  let expired=false;
  const deadlineTimer=setTimeout(()=>{expired=true;void client.stop();},remaining);
  try {
    const capability=await probeCapability(client,{cwd});
    const timeoutMs=Date.parse(job.deadlineAt)-Date.now();assert.ok(timeoutMs>0,'Dispatch setup exhausted deadline');
    await invoke(client,capability,job,{auditedContextDigest:inventory.approvedDigests[0],timeoutMs});
    assert.equal(expired,false,'Invocation exceeded its absolute deadline');
    const evidence=inspectAppServerEvidence(root,job);assert.equal(evidence.available,true,evidence.reason);
    const receipt=receiptFromEvidence(job,evidence);
    writeImmutable(safePath(root,'response.txt'),evidence.responseBytes);writeImmutable(safePath(root,'receipt.json'),jsonBytes(receipt));
    return {bytes:evidence.responseBytes,receipt};
  } finally {const stopped=await client.stop();clearTimeout(deadlineTimer);assert.equal(stopped.stoppedVerified,true,'Host process termination is uncertain');}
}

function capReached(collector) {
  const s=collector.state(),cap=effectiveExecutionPolicy(collector).maxActiveSegmentWallMs;
  return cap!==null&&s.segmentStartedAt&&Date.now()-Date.parse(s.segmentStartedAt)>=cap;
}
function record(collector,kind,data){return withRunLock(collector.root,()=>appendEvent(collector.root,kind,data));}

export function claimReviewInvocation(collector,job){return withRunLock(collector.root,()=>{
  const s=collector.state();if(s.paused)return {stop:'paused'};
  if(capReached(collector)){appendEvent(collector.root,'pause',{reason:'active-segment-wall-cap'});return {stop:'active-segment-wall-cap'};}
  const segmentStartedAt=s.segmentStartedAt??appendEvent(collector.root,'segment-started',{}).at;
  const cap=effectiveExecutionPolicy(collector).maxActiveSegmentWallMs;
  const segmentEnd=cap===null?Infinity:Date.parse(segmentStartedAt)+cap;
  const claimedAt=new Date().toISOString();
  const transportJob={jobId:randomUUID(),dispatchToken:randomUUID(),promptHash:job.promptHash,promptRef:job.promptRef,claimedAt,deadlineAt:new Date(Math.min(Date.parse(claimedAt)+collector.manifest.plan.workCaps.maxInvocationWallMs,segmentEnd)).toISOString()};
  appendEvent(collector.root,'review-dispatch-claimed',{reviewId:job.id,stage:job.stage,job:transportJob});return {job:transportJob};
});}

async function reviewCompleted(collector,options,progress) {
  for(const stage of ['decision','game'])for(;;){
    if(collector.state().paused)return 'paused';
    if(capReached(collector)){collector.pause('active-segment-wall-cap');return 'active-segment-wall-cap';}
    const s=collector.state();
    // An interrupted request must finish before review begins.
    if(s.episode)return null;
    const packet=makeReviewPacket(collector,stage);if(packet.stop)break;
    const job=packet.job;
    const attempts=s.rows.filter(r=>r.kind==='review-dispatch-claimed'&&r.data.reviewId===job.id);
    const unresolved=attempts.find(r=>!s.rows.some(x=>x.kind==='review-attempt-settled'&&x.data.jobId===r.data.job.jobId));
    if(unresolved)return 'uncertain-review-dispatch';
    if(attempts.length>=2)return 'review-attempt-cap';
    const claimed=claimReviewInvocation(collector,job);if(claimed.stop)return claimed.stop;
    const transportJob=claimed.job;
    try {
      const result=await dispatchHostJob(collector,transportJob,options);
      const proposal=JSON.parse(Buffer.from(result.bytes).toString('utf8'));
      if(job.stage==='decision'&&typeof proposal?.packetHash==='string'&&proposal.packetHash!==job.packetHash){
        const processingAudit={originalSourceDigest:collector.manifest.build.sourceDigest,reviewSourceDigest:collector.manifest.build.sourceDigest,nativeBinaryDigest:collector.manifest.build.binaryDigest};
        importNormalizedHostReview(collector,job,transportJob,result.bytes,result.receipt,{processingAudit});
      }else importHostReview(collector,job,transportJob,result.bytes,result.receipt);
      record(collector,'review-attempt-settled',{jobId:transportJob.jobId,status:'accepted'});
      progress({event:'reviewed',stage,subjectId:job.subjectId});
    }catch(error){
      const stoppedPath=safePath(collector.root,`private/invocations/${transportJob.jobId}/private/app-server/stopped.json`);
      if(existsSync(stoppedPath)&&JSON.parse(readFileSync(stoppedPath,'utf8')).stoppedVerified)record(collector,'review-attempt-settled',{jobId:transportJob.jobId,status:'rejected',reason:error.message});
      collector.pause('review-failed');throw error;
    }
  }
  return null;
}

export async function runSequential(collector,options={}) {
  const lock=safePath(collector.root,'private/driver.lock');
  if(existsSync(lock)){
    const owner=JSON.parse(readFileSync(lock,'utf8'));assert.ok(Number.isInteger(owner.pid)&&owner.pid>0);
    let alive=true;try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}
    assert.equal(alive,false,'A collection driver is already active');unlinkSync(lock);
  }
  const fd=openSync(lock,'wx');
  try{writeFileSync(fd,jsonBytes({pid:process.pid,startedAt:new Date().toISOString()}));fsyncSync(fd);return await drive(collector,options);}
  finally{closeSync(fd);unlinkSync(lock);}
}
async function drive(collector,{requests=4,contextAdmission,cwd='C:/Windows/Temp',executable=defaultExecutable,progress=value=>process.stdout.write(JSON.stringify(value)+'\n')}={}) {
  assert.equal(collector.manifest.mode,'live','Live driver cannot run fixture manifests');
  assert.ok(Number.isInteger(requests)&&requests>0&&requests<=collector.manifest.plan.workCaps.batchRequests,'Run at most one approved batch');
  const inventory=JSON.parse(readFileSync(contextAdmission,'utf8'));
  assert.equal(inventory.schemaVersion,'trix-host-base-context-admission-1.0.0');assert.equal(inventory.approvedDigests?.length,1,'Select exactly one inspected context');assert.match(inventory.approvedDigests[0],/^[a-f0-9]{64}$/);
  writeImmutable(safePath(collector.root,'host-base-context-admission.json'),jsonBytes(inventory));
  const startCount=collector.state().outcomes.length,options={inventory,cwd,executable};
  for(;;){
    if(collector.state().paused)return {stop:'paused',status:collector.status()};
    if(collector.state().claimed)return {stop:'uncertain-player-dispatch',status:collector.status()};
    const reviewStop=await reviewCompleted(collector,options,progress);
    if(reviewStop)return {stop:reviewStop,status:collector.status()};
    const current=collector.state();
    if(current.outcomes.length-startCount>=requests){
      closeBatch(collector);const publication=exportCases(collector);return {stop:'batch-completed',publication,report:report(collector)};
    }
    const next=collector.next();
    if(next.stop==='request-completed'){progress({event:next.stop,episodeId:next.episodeId,scores:next.outcome.scoreTotals});continue;}
    if(next.stop==='batch-review-required'){closeBatch(collector);continue;}
    if(next.stop==='phase-target-met'||next.stop==='phase-cap-reached'){
      if(!collector.state().closedPhases.includes(next.variant))closeBatch(collector,{closePhase:true,reason:next.stop});continue;
    }
    if(next.stop)return {stop:next.stop,status:collector.status()};
    assert.ok(!next.claimed,'Outstanding dispatch');
    const job=collector.claim(next.job.jobId);
    progress({event:'player-started',episodeId:job.episodeId,actor:job.actor,revision:job.revision,attempt:job.attempt});
    try {
      const schemaFile=job.phase==='declare-doubles'?'declaration-response':'play-response';
      assert.equal(job.responseSchemaHash,sha(readFileSync(resolve(collector.sourceRoot,'contracts/trix-scenario-collection',`${schemaFile}.schema.json`))),'Frozen response schema mismatch');
      const result=await dispatchHostJob(collector,job,options);
      collector.accept(job.jobId,result.bytes,result.receipt);
      progress({event:'player-accepted',episodeId:job.episodeId,actor:job.actor,revision:job.revision,counters:collector.status().counters});
    }catch(error){
      const state=collector.state();
      // Schema-invalid output has already been settled by Collector.accept.
      if(!state.claimed&&!state.paused){progress({event:'player-response-rejected',reason:error.message});continue;}
      const stoppedPath=safePath(collector.root,`private/invocations/${job.jobId}/private/app-server/stopped.json`);
      if(state.claimed&&existsSync(stoppedPath)&&JSON.parse(readFileSync(stoppedPath,'utf8')).stoppedVerified)collector.settle(job.jobId,error.message,{verifiedNotRunning:true});
      else collector.pause('player-dispatch-failed');throw error;
    }
  }
}
