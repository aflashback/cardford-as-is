// Execution amendment only. All original semantic/history/host/native gates are delegated.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {Collector,repository} from './runner.mjs';
import {resolveBuild} from '../coach-lab-builds.mjs';
import {jsonBytes,sha,safePath,appendEvent,withRunLock} from './journal.mjs';
import {verifyPriorPlayer} from './review-worker.mjs';
import {createValidationExecutionProvider} from './validation-execution-provider.mjs';
import {loadValidationExecutionOriginal,readLatestValidationExecutionAmendment,assertValidationExecutionState,verifyExecutionStaticInputs,acquireValidationExecutionDriverLease} from './validation-execution-amendment.mjs';
import {bindValidationExecutionInvocation,assertValidationExecutionInvocation,publishValidationExecutionEpoch,validationExecutionGameClaims} from './validation-execution-epoch.mjs';
export const validationExecutionRuntimeSourceHash=sha(readFileSync(new URL(import.meta.url)));
const sync=x=>{assert.ok(!x||typeof x.then!=='function','Execution callback must be synchronous');return x};
const head=c=>sha(readFileSync(safePath(c.root,'private/journal.jsonl')));
const bind=r=>({sequence:r.sequence,hash:r.hash});
export async function awaitValidationExecutionDispatch(view,dispatch,verifyAfter){
  assert.equal(typeof dispatch,'function');assert.equal(typeof verifyAfter,'function');let result,dispatchError;
  try{result=await dispatch();}catch(error){dispatchError=error;}
  try{sync(verifyAfter());}catch(error){if(dispatchError)error.cause=dispatchError;throw view.failStop(error);}
  if(dispatchError)throw dispatchError;return result;
}
export function callValidationExecutionImporter(view,bare,execution,job,work){
  try{return sync(work());}catch(error){if(bare.state().rows.some(row=>row.kind==='review-imported'&&row.sequence>execution.authorization.sequence&&row.data.stage===job.stage&&row.data.subjectId===job.subjectId))view.failStop(error);throw error;}
}
export function createValidationExecutionView(bare,original,frozen,execution,{provider=createValidationExecutionProvider(bare,original,frozen,execution)}={}){
  let failure=null;const assertReady=()=>{if(failure)throw failure;},failStop=error=>{failure??=error;return failure};
  const facade=frozen.reviewStartupRpcFacade(bare,original,{loadLatest:provider.loadLatest});facade.state=()=>{assertReady();return provider.state(bare)};
  const criticalOwner=(owner,{reviewJob,invocationId}={})=>{provider.checkOwner(owner);const guarded=Object.create(owner);guarded.state=()=>{assertReady();const state=provider.validateCurrent(owner).state;if(invocationId)assertValidationExecutionInvocation(bare,invocationId,execution,{state});if(reviewJob){assert.equal(typeof reviewJob.id,'string');assert.ok(['decision','game'].includes(reviewJob.stage));assert.ok(state.rows.filter(r=>r.kind==='review-dispatch-claimed'&&r.data.reviewId===reviewJob.id).length<2,'Review attempt cap prevents another claim');assert.ok(!state.rows.some(r=>r.kind==='review-imported'&&r.data.stage===reviewJob.stage&&r.data.subjectId===reviewJob.subjectId),'Accepted review cannot be claimed again');}return state};return guarded};
  // State is evaluated INSIDE each unchanged method's original lock, before claimedAt.
  for(const method of ['claim','next','accept','recoverIntent'])if(typeof bare[method]==='function')facade[method]=(...args)=>bare[method].apply(criticalOwner(facade,method==='accept'?{invocationId:args[0]}:{}),args);
  const originalInspector=facade.inspector;
  facade.inspector=(job,...args)=>{assertReady();provider.validateCurrent(facade);assertValidationExecutionInvocation(bare,job.jobId,execution);return originalInspector(job,...args)};
  return{facade,provider,loadLatest:owner=>{assertReady();return provider.loadLatest(owner)},criticalOwner,failStop,assertReady};
}
export async function preflightValidationExecutionRuntime(bare,original,frozen,{candidateAmendment}={}){
  assert.ok(candidateAmendment,'Reviewed preparation candidate required');const before=head(bare);
  verifyExecutionStaticInputs(bare,candidateAmendment,{deep:true,sourceRoot:repository});
  // This is report-only. No fake authorization, active facade or callable API is returned.
  const snapshot=bare.state(),view=Object.create(bare);view.state=()=>snapshot;
  assert.deepEqual(frozen.readLatestReviewStartupRpcRecovery(view),original);assert.equal(frozen.assertReviewStartupRpcState(view,original,snapshot).paused,false);
  const verified=await frozen.verifyReviewStartupRpcHistory(bare,{latest:original});
  const runtime=await frozen.buildReviewStartupRpcApis(bare,verified,original,{loadLatest:owner=>{const state=bare.state(),v=Object.create(bare);v.state=()=>state;const latest=frozen.readLatestReviewStartupRpcRecovery(v);assert.deepEqual(latest,original);assert.equal(frozen.assertReviewStartupRpcState(v,original,state).paused,false);return latest}});
  for(const name of ['claimReviewInvocation','dispatchHostJob','verifyPriorHost','validateSavedContent','importHostReview','importNormalizedHostReview','exportRawGame'])assert.equal(typeof runtime.api[name],'function');
  verifyExecutionStaticInputs(bare,candidateAmendment,{deep:true,sourceRoot:repository});assert.equal(head(bare),before,'Journal changed during read-only preparation preflight');
  return{modelCalls:0,journalMutation:false,history:verified.previousVerified.history,apiNames:Object.keys(runtime.api).sort()};
}
export async function buildValidationExecutionRuntime(bare,original,frozen,execution,{provider=createValidationExecutionProvider(bare,original,frozen,execution),verified}={}){
  provider.validateCurrent(bare);
  // Full original history is evaluated against the bare physical collector, never a recursive guard.
  verified??=await frozen.verifyReviewStartupRpcHistory(bare,{latest:original});provider.validateCurrent(bare);
  const runtime=await frozen.buildReviewStartupRpcApis(bare,verified,original,{loadLatest:provider.loadLatest});provider.validateCurrent(bare);
  const prior=await verified.previousArchive.module.buildPlayerArchiveCancellationApis(bare,verified.previousVerified,verified.previous);provider.validateCurrent(bare);
  const view=createValidationExecutionView(bare,original,frozen,execution,{provider}),api={...runtime.api};
  const marker=(owner,jobId)=>{provider.validateCurrent(owner);const state=provider.state(owner),claim=state.rows.find(r=>['dispatch-claimed','review-dispatch-claimed'].includes(r.kind)&&(r.data.job?.jobId??r.data.jobId)===jobId);assert.ok(claim,'Physical claim missing');if(claim.sequence>execution.authorization.sequence)assertValidationExecutionInvocation(bare,jobId,execution,{state});};
  const inspectOriginal=(owner,claim)=>{const id=claim.data.job?.jobId??claim.data.jobId;if(claim.kind==='review-dispatch-claimed')return runtime.api.verifyPriorHost(owner,claim,original.recovery.inventory);const player=Object.create(owner);player.inspector=()=>view.facade.inspector({...claim.data,jobId:id});verifyPriorPlayer(player,claim,original.recovery.inventory);};
  // Historical new-epoch evidence must retain both the original host proof and exact execution marker.
  for(const claim of bare.state().rows.filter(r=>['dispatch-claimed','review-dispatch-claimed'].includes(r.kind)&&r.sequence>execution.authorization.sequence))assertValidationExecutionInvocation(bare,claim.data.job?.jobId??claim.data.jobId,execution,{inspectOriginal});
  api.claimReviewInvocation=(owner,job,...args)=>runtime.api.claimReviewInvocation(view.criticalOwner(owner,{reviewJob:job}),job,...args);
  if(typeof runtime.api.makeReviewPacket==='function')api.makeReviewPacket=(owner,...args)=>runtime.api.makeReviewPacket(view.criticalOwner(owner),...args);
  api.dispatchHostJob=async(owner,job,options)=>{view.assertReady();provider.checkOwner(owner);bindValidationExecutionInvocation(bare,job,execution,{validateCurrent:provider.validateCurrent});provider.validateCurrent(owner);assertValidationExecutionInvocation(bare,job.jobId,execution);return awaitValidationExecutionDispatch(view,()=>runtime.api.dispatchHostJob(owner,job,options),()=>{provider.validateCurrent(owner);assertValidationExecutionInvocation(bare,job.jobId,execution)});};
  for(const name of ['verifyPriorHost','validateSavedContent','importHostReview','importNormalizedHostReview'])api[name]=(owner,...args)=>{view.assertReady();const id=name==='verifyPriorHost'?(args[0].data.job?.jobId??args[0].data.jobId):args[1].jobId;marker(owner,id);const work=()=>{const row=runtime.api[name](name.startsWith('import')?view.criticalOwner(owner,{invocationId:id}):owner,...args);if(name.startsWith('import'))marker(owner,id);return row};return name.startsWith('import')?callValidationExecutionImporter(view,bare,execution,args[0],work):work();};
  api.exportRawGame=(owner,episodeId,options={})=>{view.assertReady();provider.validateCurrent(owner);for(const claim of validationExecutionGameClaims(bare,episodeId,bare.state(),execution.authorization.sequence))assertValidationExecutionInvocation(bare,claim.data.job?.jobId??claim.data.jobId,execution,{inspectOriginal});
    // Explicit old TSC25 function + distinct prior TSC24 exporter. Never self-delegate.
    const result=frozen.exportReviewStartupRpcRawGame(owner,episodeId,{latest:original,verified,exportRawGame:prior.api.exportRawGame,processingAudit:options.processingAudit,loadLatest:provider.loadLatest});
    return publishValidationExecutionEpoch(bare,episodeId,{latest:execution,rawResult:result,validateCurrent:provider.validateCurrent,inspectOriginal});};
  return{...view,verified,runtime:{...runtime,api}};
}
export function validateValidationExecutionOptions(original,options){assert.equal(typeof (options.checkOnly??false),'boolean');if(!options.checkOnly)assert.ok(typeof options.executable==='string'&&options.executable,'Explicit audited host executable required for live execution');if(options.contextAdmission!==undefined)assert.deepEqual(JSON.parse(readFileSync(options.contextAdmission)),original.recovery.inventory);if(options.cwd!==undefined)assert.equal(options.cwd,original.recovery.inventory.audit.cwd);if(options.executable!==undefined)assert.equal(resolve(options.executable),resolve(original.recovery.inventory.audit.hostExecutable));}
export async function runValidationExecutionCampaign(root,{checkOnly=false,contextAdmission,cwd,executable,progress=value=>process.stdout.write(JSON.stringify(value)+'\n')}={}){
  const bare=new Collector(root),execution=readLatestValidationExecutionAmendment(bare,{deep:true});assert.ok(execution,'Execution amendment authorization required');
  assert.equal(resolve(fileURLToPath(new URL(import.meta.url))),resolve(root,'builds',execution.amendment.processingBuild.sourceDigest,execution.amendment.processingBuild.binaryDigest,'source',execution.amendment.helperPins.runtime.path),'Runtime must execute from admitted frozen graph');
  const {latest:original,frozen}=await loadValidationExecutionOriginal(bare);validateValidationExecutionOptions(original,{checkOnly,contextAdmission,cwd,executable});
  const release=acquireValidationExecutionDriverLease(bare,execution);let started=false;
  try{const built=await buildValidationExecutionRuntime(bare,original,frozen,execution);built.provider.validateCurrent(bare);
    if(checkOnly)return{stop:'validation-execution-admission-passed',modelCalls:0,amendmentHash:execution.amendmentHash,executionSourceDigest:execution.amendment.processingBuild.sourceDigest,originalSourceDigest:original.recovery.processingBuild.sourceDigest,remainingTargetCalls:assertValidationExecutionState(bare,execution,bare.state()).remainingTargetCalls,history:built.verified.previousVerified.history};
    withRunLock(root,()=>{built.provider.validateCurrent(bare);appendEvent(root,'validation-execution-worker-started',{amendmentHash:execution.amendmentHash,executionSourceDigest:execution.amendment.processingBuild.sourceDigest,originalRecoveryHash:original.recoveryHash})});started=true;
    const result=await frozen.runReviewStartupRpcSecond(built.facade,original,built.runtime,built.verified,{cwd,executable,progress,loadLatest:built.loadLatest});
    if(result.stage!=='complete'){const stop=result.stage==='exhausted'?'review-attempt-cap':'uncertain-review-dispatch';withRunLock(root,()=>{appendEvent(root,'pause',{reason:stop});appendEvent(root,'validation-execution-worker-stopped',{amendmentHash:execution.amendmentHash,stop})});return{stop};}
    const failures=new Map(built.verified.previousVerified.reconciledReviewFailures);failures.set(built.verified.proof.jobId,built.verified.proof);
    const collected=await built.runtime.runFullCampaign(built.facade,{inventory:original.recovery.inventory,originalInventory:built.verified.previousVerified.originalInventory,originalThroughSequence:built.verified.previousVerified.prior.amendment.previousBoundary.sequence,reconciledReviewFailures:failures,processingAudit:built.runtime.processingAudit,apis:built.runtime.api,cwd,executable,progress});
    withRunLock(root,()=>appendEvent(root,'validation-execution-worker-stopped',{amendmentHash:execution.amendmentHash,stop:collected.stop}));return collected;
  }catch(error){if(started)withRunLock(root,()=>{if(!bare.state().rows.some(r=>r.sequence>execution.authorization.sequence&&r.kind==='pause'))appendEvent(root,'pause',{reason:'validation-execution-failed',detail:error.message});appendEvent(root,'validation-execution-worker-stopped',{amendmentHash:execution.amendmentHash,stop:'validation-execution-failed',reason:error.message})});throw error;}finally{release();}
}
export async function dispatchValidationExecutionCampaign(c,options={}){const latest=readLatestValidationExecutionAmendment(c);assert.ok(latest,'Execution amendment authorization required');verifyExecutionStaticInputs(c,latest);const build=resolveBuild(c.root,latest.amendment.sourceHashes,latest.amendment.processingBuild),module=await import(pathToFileURL(resolve(build.sourceRoot,latest.amendment.helperPins.runtime.path)).href);return module.runValidationExecutionCampaign(c.root,options);}
