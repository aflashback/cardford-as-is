// A separately audited context amendment admits one exact preserved response.
// Neither the original invocation nor any historical admission is rewritten.
import assert from 'node:assert/strict';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { preserveBuild, resolveBuild, sourceDigest } from '../coach-lab-builds.mjs';
import { Collector, repository, sourceHashes } from './runner.mjs';
import { appendEvent, getBlob, jsonBytes, putBlob, safePath, sha, withRunLock, writeImmutable } from './journal.mjs';
import { assertDerivationQuiescent } from './derived-export.mjs';
import { campaignInventoryPath, readCampaignAmendment, verifyBehaviorCompatibility, verifySettledHistory } from './campaign-continuation.mjs';
import { readLatestCampaignRecovery } from './campaign-recovery.mjs';
import { verifyPriorHost, verifyPriorPlayer } from './review-worker.mjs';
import { verifyFailedReviewInvocation } from './failed-invocation.mjs';
import { contextFailureReason, verifyContextEvidence } from './context-evidence.mjs';

const schemaVersion='trix-context-recovery-1.0.0';
const readJson=(root,path)=>JSON.parse(readFileSync(safePath(root,path),'utf8'));
const keys=(value,names)=>assert.deepEqual(Object.keys(value).sort(),[...names].sort());

function contexts(collector,amendment,audit,contextAdmission) {
  const originalInventory=readJson(collector.root,'host-base-context-admission.json'),previousInventory=readJson(collector.root,campaignInventoryPath),inventory=audit.newInventory;
  for(const value of [originalInventory,previousInventory,inventory]){
    assert.equal(value.schemaVersion,'trix-host-base-context-admission-1.0.0');assert.ok(Array.isArray(value.approvedDigests)&&value.approvedDigests.length===1);assert.match(value.approvedDigests[0],/^[a-f0-9]{64}$/);
  }
  assert.equal(sha(jsonBytes(originalInventory)),amendment.originalContextInventoryHash);
  assert.equal(sha(jsonBytes(previousInventory)),amendment.currentContextInventoryHash);
  assert.equal(audit.previousInventoryHash,amendment.currentContextInventoryHash,'Context amendment changed prior inventory');
  assert.deepEqual(previousInventory.approvedDigests,[audit.previousDigest]);assert.deepEqual(inventory.approvedDigests,[audit.actualDigest]);assert.notEqual(audit.actualDigest,audit.previousDigest);
  if(contextAdmission!==undefined)assert.deepEqual(JSON.parse(readFileSync(contextAdmission,'utf8')),inventory,'Context recovery requires its newly audited inventory');
  return {originalInventory,previousInventory,inventory};
}

function targetClaim(collector,audit) {
  const claims=collector.state().rows.filter(row=>row.kind==='review-dispatch-claimed'&&row.data.job.jobId===audit.jobId);
  assert.equal(claims.length,1,'Missing or ambiguous context response claim');assert.equal(claims[0].hash,audit.claimHash);assert.equal(claims[0].data.stage,'decision');return claims[0];
}

function checkProof(checked,claim,audit,expectedProof) {
  const proof=checked.proof;
  keys(proof,['schemaVersion','jobId','claimHash','auditHash','previousDigest','actualDigest','responseHash','threadId','promptHash','evidenceHashes','viewPath']);
  assert.equal(proof.schemaVersion,'trix-context-response-proof-1.0.0');assert.equal(proof.jobId,audit.jobId);assert.equal(proof.claimHash,claim.hash);
  assert.equal(proof.auditHash,sha(jsonBytes(audit)));assert.equal(proof.previousDigest,audit.previousDigest);assert.equal(proof.actualDigest,audit.actualDigest);
  assert.deepEqual(proof.evidenceHashes,audit.evidenceHashes);assert.equal(proof.responseHash,sha(checked.bytes));
  assert.equal(proof.promptHash,claim.data.job.promptHash);assert.equal(proof.threadId,checked.receipt.hostAgentId);
  assert.equal(checked.receipt.responseHash,proof.responseHash);assert.equal(checked.receipt.requestedModel,'gpt-6-luna');assert.equal(checked.receipt.requestedEffort,'max');
  assert.equal(checked.evidence.available,true);assert.equal(checked.evidence.baseContext.digest,audit.actualDigest);
  assert.equal(checked.reviewJob.id,claim.data.reviewId);assert.equal(checked.reviewJob.stage,'decision');assert.equal(checked.reviewJob.promptHash,proof.promptHash);
  assert.equal(proof.viewPath,`private/context-replay/${proof.jobId}/${proof.auditHash}`);
  if(expectedProof)assert.deepEqual(proof,expectedProof,'Audited context response evidence changed');
  return checked;
}

export function verifyContextRecoveryHistory(collector,{amendment,startupRecovery,audit,authorizationSequence=Infinity,expectedProof,verifyContext=verifyContextEvidence,verifyPlayer=verifyPriorPlayer,verifyReviewer=verifyPriorHost,verifyFailure=verifyFailedReviewInvocation}={}) {
  const context=contexts(collector,amendment,audit),rows=collector.state().rows,claim=targetClaim(collector,audit),checked=checkProof(verifyContext(collector,claim,audit),claim,audit,expectedProof),failures=new Map(),counts=new Map();
  const inventoryFor=invocation=>invocation.sequence<=amendment.previousBoundary.sequence?context.originalInventory:invocation.sequence<=authorizationSequence?context.previousInventory:context.inventory;
  for(const row of rows.filter(r=>r.kind==='review-dispatch-claimed')){const count=(counts.get(row.data.reviewId)??0)+1;assert.ok(count<=2,'Cumulative review attempt cap exceeded');counts.set(row.data.reviewId,count);}
  const history=verifySettledHistory(collector,context.inventory,{originalInventory:context.originalInventory,originalThroughSequence:amendment.previousBoundary.sequence,verifyPlayer(underlying,row){verifyPlayer(underlying,row,inventoryFor(row));},verifyReviewer(underlying,row){
    if(row.data.job.jobId===audit.jobId){assert.equal(row.hash,claim.hash);return;}
    const inventory=inventoryFor(row);
    if(existsSync(safePath(collector.root,`private/invocations/${row.data.job.jobId}/receipt.json`))){verifyReviewer(underlying,row,inventory);return;}
    const settlement=rows.find(done=>done.kind==='review-attempt-settled'&&done.data.jobId===row.data.job.jobId);assert.equal(settlement?.data.status,'rejected');
    const proof=verifyFailure(underlying,row,inventory);assert.equal(proof.schemaVersion,'trix-failed-review-invocation-1.0.0');assert.equal(proof.jobId,row.data.job.jobId);assert.equal(proof.claimHash,row.hash);assert.equal(proof.acceptedResponse,false);assert.equal(proof.stoppedVerified,true);
    failures.set(proof.jobId,proof);
  }});
  for(const proof of startupRecovery.recovery.failedClaims){assert.ok(failures.has(proof.jobId),'Previously reconciled startup failure disappeared');assert.deepEqual(failures.get(proof.jobId),proof,'Startup failure proof changed');}
  return {history,checked,reconciledReviewFailures:failures,inventoryFor,...context};
}

function validateRecovery(collector,recovery,amendment,startupRecovery) {
  keys(recovery,['schemaVersion','runId','createdAt','originalAmendmentHash','startupRecoveryHash','originalManifestHash','originalSourceDigest','nativeBinaryDigest','originalContextInventoryHash','previousContextInventoryHash','newContextInventoryHash','auditRef','proof','previousBoundary','failurePause','processingBuild','sourceHashes']);
  assert.equal(recovery.schemaVersion,schemaVersion);assert.equal(recovery.runId,collector.manifest.runId);assert.equal(recovery.originalAmendmentHash,sha(jsonBytes(amendment)));assert.equal(recovery.startupRecoveryHash,startupRecovery.recoveryHash);
  for(const key of ['originalManifestHash','originalSourceDigest','nativeBinaryDigest','originalContextInventoryHash'])assert.equal(recovery[key],amendment[key]);
  assert.equal(recovery.previousContextInventoryHash,amendment.currentContextInventoryHash);
  keys(recovery.processingBuild,['sourceDigest','binaryDigest']);assert.equal(recovery.processingBuild.sourceDigest,sourceDigest(recovery.sourceHashes));assert.equal(recovery.processingBuild.binaryDigest,amendment.nativeBinaryDigest);verifyBehaviorCompatibility(collector.manifest.sourceHashes,recovery.sourceHashes);
  const audit=getBlob(collector.root,recovery.auditRef),context=contexts(collector,amendment,audit),claim=targetClaim(collector,audit),rows=collector.state().rows;
  assert.equal(recovery.newContextInventoryHash,sha(jsonBytes(context.inventory)));assert.equal(recovery.proof.auditHash,sha(jsonBytes(audit)));assert.equal(recovery.proof.jobId,audit.jobId);assert.equal(recovery.proof.claimHash,claim.hash);
  const pause=rows.find(row=>row.sequence===recovery.failurePause.sequence),boundary=rows.find(row=>row.sequence===recovery.previousBoundary.sequence);keys(recovery.failurePause,['sequence','hash']);keys(recovery.previousBoundary,['sequence','hash']);
  assert.ok(pause&&pause.hash===recovery.failurePause.hash&&pause.kind==='pause'&&pause.data.reason==='campaign-driver-failed','Context recovery pause changed');
  assert.ok(boundary&&boundary.hash===recovery.previousBoundary.hash&&boundary.kind==='campaign-worker-stopped'&&boundary.data.stop==='campaign-driver-failed'&&boundary.sequence===pause.sequence+1,'Context recovery stopped-worker boundary changed');assert.equal(recovery.createdAt,boundary.at);
  const settlements=rows.filter(row=>row.kind==='review-attempt-settled'&&row.data.jobId===audit.jobId);assert.equal(settlements.length,1);assert.equal(settlements[0].data.status,'rejected');assert.equal(settlements[0].data.reason,contextFailureReason);assert.equal(settlements[0].sequence,pause.sequence-1);assert.ok(claim.sequence>startupRecovery.authorization.sequence&&claim.sequence<settlements[0].sequence);
  const intervening=rows.filter(row=>row.sequence>startupRecovery.authorization.sequence&&row.sequence<=boundary.sequence&&['pause','resume'].includes(row.kind));assert.deepEqual(intervening,[pause],'Operator or unrelated pause prevents context recovery');
  const attempts=rows.filter(row=>row.kind==='review-dispatch-claimed'&&row.sequence<=boundary.sequence&&row.data.reviewId===claim.data.reviewId);assert.ok(attempts.length>=1&&attempts.length<=2,'Context recovery cannot enlarge the review attempt cap');
  const reviewJob=readJson(collector.root,`outbox/${claim.data.reviewId}.json`);assert.ok(!rows.some(row=>row.sequence<=boundary.sequence&&row.kind==='review-imported'&&row.data.stage==='decision'&&row.data.subjectId===reviewJob.subjectId),'Context target review was already imported');
  return {audit,claim};
}

export function readLatestContextRecovery(collector) {
  const records=collector.state().rows.filter(row=>row.kind==='context-recovery-authorized');if(!records.length)return null;assert.equal(records.length,1,'Multiple context amendments require a separately reviewed migration');
  const {amendment}=readCampaignAmendment(collector),startupRecovery=readLatestCampaignRecovery(collector);assert.ok(startupRecovery,'Startup recovery required');
  const authorization=records[0],recoveryHash=authorization.data.recoveryHash;assert.match(recoveryHash,/^[a-f0-9]{64}$/);const recoveryPath=`private/context-recovery/${recoveryHash}.json`;assert.equal(authorization.data.recoveryPath,recoveryPath);
  const recovery=readJson(collector.root,recoveryPath);assert.equal(sha(jsonBytes(recovery)),recoveryHash,'Context recovery metadata changed');validateRecovery(collector,recovery,amendment,startupRecovery);
  assert.equal(authorization.sequence,recovery.previousBoundary.sequence+1);assert.equal(authorization.data.startupRecoveryHash,recovery.startupRecoveryHash);return {recovery,recoveryHash,recoveryPath,authorization};
}

export function prepareContextRecovery(collector,{auditPath}={}) {
  assert.equal(collector.manifest.mode,'live');
  return withRunLock(collector.root,()=>{
    const state=collector.state();assertDerivationQuiescent(collector.root,state);
    const {amendment}=readCampaignAmendment(collector),startupRecovery=readLatestCampaignRecovery(collector);assert.ok(startupRecovery);
    const auditBytes=readFileSync(auditPath),audit=JSON.parse(auditBytes.toString('utf8')),existing=readLatestContextRecovery(collector);
    if(existing){assert.deepEqual(getBlob(collector.root,existing.recovery.auditRef),audit,'Context recovery audit changed');return {...existing,alreadyPrepared:true};}
    assert.ok(state.paused&&!state.episode&&!state.pending&&!state.claimed&&!state.intent,'Context recovery requires completed, settled, paused player work');
    const verified=verifyContextRecoveryHistory(collector,{amendment,startupRecovery,audit});
    const hashes=sourceHashes();verifyBehaviorCompatibility(collector.manifest.sourceHashes,hashes);
    const original=resolveBuild(collector.root,collector.manifest.sourceHashes,{sourceDigest:amendment.originalSourceDigest,binaryDigest:amendment.nativeBinaryDigest}),pins={sourceDigest:sourceDigest(hashes),binaryDigest:amendment.nativeBinaryDigest};
    const boundary=state.rows.at(-1),pause=state.rows.at(-2),recovery={schemaVersion,runId:collector.manifest.runId,createdAt:boundary.at,originalAmendmentHash:sha(jsonBytes(amendment)),startupRecoveryHash:startupRecovery.recoveryHash,originalManifestHash:amendment.originalManifestHash,originalSourceDigest:amendment.originalSourceDigest,nativeBinaryDigest:amendment.nativeBinaryDigest,originalContextInventoryHash:amendment.originalContextInventoryHash,previousContextInventoryHash:amendment.currentContextInventoryHash,newContextInventoryHash:sha(jsonBytes(audit.newInventory)),auditRef:putBlob(collector.root,auditBytes),proof:verified.checked.proof,previousBoundary:{sequence:boundary.sequence,hash:boundary.hash},failurePause:{sequence:pause.sequence,hash:pause.hash},processingBuild:pins,sourceHashes:hashes};
    validateRecovery(collector,recovery,amendment,startupRecovery);preserveBuild(collector.root,repository,hashes,pins,original.binaryPath);
    const recoveryHash=sha(jsonBytes(recovery)),recoveryPath=`private/context-recovery/${recoveryHash}.json`;writeImmutable(safePath(collector.root,recoveryPath),jsonBytes(recovery));appendEvent(collector.root,'context-recovery-authorized',{recoveryHash,recoveryPath,startupRecoveryHash:recovery.startupRecoveryHash});return {...readLatestContextRecovery(collector),alreadyPrepared:false};
  });
}

export function contextRecoveryFacade(collector,latest) {
  assert.deepEqual(readLatestContextRecovery(collector),latest);const {amendment}=readCampaignAmendment(collector),underlying=collector.state.bind(collector),facade=Object.create(collector);
  Object.defineProperty(facade,'executionPolicy',{value:Object.freeze({...amendment.executionPolicy}),writable:false,configurable:false});facade.resume=()=>{throw Error('Context recovery cannot resume the legacy collector');};
  facade.state=()=>{const state=underlying();assert.equal(state.rows.find(row=>row.sequence===latest.authorization.sequence)?.hash,latest.authorization.hash);assert.ok(!state.rows.some(row=>row.sequence>latest.authorization.sequence&&row.kind==='resume'),'Legacy resume prevents context recovery');return {...state,paused:state.rows.some(row=>row.sequence>latest.authorization.sequence&&(row.kind==='pause'||row.kind==='attempt-settled'&&row.data.fatal))};};return facade;
}

export function importContextSavedReview(collector,latest,checked,api) {
  assert.equal(collector.state().paused,false,'Later pause prevents saved context review import');
  assert.deepEqual(checked.proof,latest.recovery.proof,'Saved response proof changed before import');
  const importCollector=Object.create(collector),underlying=collector.state.bind(collector);
  // importReview calls state inside its existing run lock. Recheck the facade
  // there so an operator pause cannot race the final accepted-review write.
  importCollector.state=()=>{const state=underlying();assert.equal(state.paused,false,'Later pause prevents saved context review import');return state;};
  const proposal=JSON.parse(checked.bytes.toString('utf8'));
  const hostEvidenceRef=putBlob(collector.root,{contextRecoveryHash:latest.recoveryHash,contextAmendmentRef:latest.recovery.auditRef,proof:checked.proof,evidence:checked.evidence,receipt:checked.receipt,rawRef:putBlob(collector.root,checked.bytes)});
  const result=api.importReview(importCollector,checked.reviewJob,proposal,{reviewerId:checked.receipt.hostAgentId,promptHash:checked.reviewJob.promptHash,responseHash:sha(jsonBytes(proposal)),contextMode:'independent-review',hostEvidenceRef});
  withRunLock(collector.root,()=>{if(!collector.state().rows.some(row=>row.kind==='context-review-saved-admitted'&&row.data.recoveryHash===latest.recoveryHash))appendEvent(collector.root,'context-review-saved-admitted',{recoveryHash:latest.recoveryHash,jobId:checked.proof.jobId,responseHash:checked.proof.responseHash,hostEvidenceRef,reviewRef:result.reviewRef});});return result;
}

function ownDriver(root,recoveryHash) {
  const path=safePath(root,'private/driver.lock');if(existsSync(path)){const owner=readJson(root,'private/driver.lock');assert.ok(Number.isSafeInteger(owner.pid)&&owner.pid>0);let alive=true;try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}assert.equal(alive,false,'A campaign worker is already active');unlinkSync(path);}
  const fd=openSync(path,'wx');writeFileSync(fd,jsonBytes({pid:process.pid,startedAt:new Date().toISOString(),worker:'full-campaign',contextRecoveryHash:recoveryHash}));fsyncSync(fd);return ()=>{closeSync(fd);unlinkSync(path);};
}

export async function buildContextDriverApis(collector,verified,audit) {
  const original=await import(pathToFileURL(resolve(collector.sourceRoot,'scripts/trix-scenario-collection/review.mjs')).href);
  const [driver,envelope,worker,raw,failure]=await Promise.all([import('./live-driver.mjs'),import('./review-envelope.mjs'),import('./review-worker.mjs'),import('./raw-export.mjs'),import('./failed-invocation.mjs')]);
  return {...original,...driver,...envelope,...failure,exportRawGame:raw.exportRawGame,validateSavedContent:worker.validateSavedContent,verifyPriorHost(underlying,claim){if(claim.data.job.jobId===audit.jobId)checkProof(verifyContextEvidence(underlying,claim,audit),claim,audit,verified.checked.proof);else verifyPriorHost(underlying,claim,verified.inventoryFor(claim));},verifyFailedReviewInvocation(underlying,claim){return verifyFailedReviewInvocation(underlying,claim,verified.inventoryFor(claim));}};
}

export async function runContextRecoveredCampaign(root,{contextAdmission,cwd,executable,checkOnly=false,progress=value=>process.stdout.write(JSON.stringify(value)+'\n')}={}) {
  assert.equal(typeof checkOnly,'boolean');const collector=new Collector(root),latest=readLatestContextRecovery(collector);assert.ok(latest,'No authorized context recovery');
  const {amendment}=readCampaignAmendment(collector),startupRecovery=readLatestCampaignRecovery(collector),audit=getBlob(root,latest.recovery.auditRef),frozen=resolveBuild(root,latest.recovery.sourceHashes,latest.recovery.processingBuild);assert.equal(resolve(repository),resolve(frozen.sourceRoot),'Context recovery must run its frozen processor');const release=ownDriver(root,latest.recoveryHash);
  let started=false;
  try{
    contexts(collector,amendment,audit,contextAdmission);const facade=contextRecoveryFacade(collector,latest);if(facade.state().paused)return {stop:'paused-after-context-recovery',status:collector.status()};
    const verified=verifyContextRecoveryHistory(collector,{amendment,startupRecovery,audit,authorizationSequence:latest.authorization.sequence,expectedProof:latest.recovery.proof});
    const processingAudit={originalSourceDigest:amendment.originalSourceDigest,reviewSourceDigest:latest.recovery.processingBuild.sourceDigest,nativeBinaryDigest:amendment.nativeBinaryDigest};
    if(checkOnly)return {stop:'context-recovery-admission-passed',runId:collector.manifest.runId,recoveryHash:latest.recoveryHash,history:verified.history,savedResponseHash:verified.checked.proof.responseHash,processingAudit,modelCalls:0};
    const api=await buildContextDriverApis(facade,verified,audit);
    if(facade.state().paused)return {stop:'paused-after-context-recovery',status:collector.status()};
    withRunLock(root,()=>{assert.equal(facade.state().paused,false,'Later pause prevents context recovery worker start');appendEvent(root,'campaign-worker-started',{contextRecoveryHash:latest.recoveryHash,processingAudit,history:verified.history,wallLimit:null,selectionDeferred:true});});started=true;
    importContextSavedReview(facade,latest,verified.checked,api);progress({event:'context-saved-review-imported',jobId:audit.jobId,responseHash:verified.checked.proof.responseHash,newModelCalls:0});
    const {runFullCampaign}=await import('./campaign-driver.mjs'),result=await runFullCampaign(facade,{inventory:verified.inventory,originalInventory:verified.originalInventory,originalThroughSequence:amendment.previousBoundary.sequence,reconciledReviewFailures:verified.reconciledReviewFailures,processingAudit,apis:api,...(cwd?{cwd}:{}),...(executable?{executable}:{}),progress});withRunLock(root,()=>appendEvent(root,'campaign-worker-stopped',{contextRecoveryHash:latest.recoveryHash,stop:result.stop}));return result;
  }catch(error){
    if(started)withRunLock(root,()=>{if(!collector.state().rows.some(row=>row.sequence>latest.authorization.sequence&&row.kind==='pause'))appendEvent(root,'pause',{reason:'context-recovery-failed',detail:error.message});appendEvent(root,'campaign-worker-stopped',{contextRecoveryHash:latest.recoveryHash,stop:'context-recovery-failed',reason:error.message});});
    throw error;
  }finally{release();}
}

export async function dispatchContextRecovery(originalCollector,options={}) {
  const latest=readLatestContextRecovery(originalCollector);assert.ok(latest,'No authorized context recovery');const frozen=resolveBuild(originalCollector.root,latest.recovery.sourceHashes,latest.recovery.processingBuild),processor=await import(pathToFileURL(resolve(frozen.sourceRoot,'scripts/trix-scenario-collection/context-recovery.mjs')).href);return processor.runContextRecoveredCampaign(originalCollector.root,options);
}
