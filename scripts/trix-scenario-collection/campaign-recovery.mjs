// Append-only recovery of independently proved, stopped MCP startup failures.
import assert from 'node:assert/strict';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { preserveBuild, resolveBuild, sourceDigest } from '../coach-lab-builds.mjs';
import { Collector, repository, sourceHashes } from './runner.mjs';
import { appendEvent, jsonBytes, safePath, sha, withRunLock, writeImmutable } from './journal.mjs';
import { assertDerivationQuiescent } from './derived-export.mjs';
import { campaignInventoryPath, readCampaignAmendment, verifyBehaviorCompatibility, verifySettledHistory } from './campaign-continuation.mjs';
import { verifyPriorHost, verifyPriorPlayer } from './review-worker.mjs';
import { verifyFailedReviewInvocation } from './failed-invocation.mjs';

const schemaVersion='trix-campaign-recovery-1.0.0';
const recoveryDirectory='private/campaign-recovery';
const proofSchema='trix-failed-review-invocation-1.0.0';
const classification='mcp-startup-timeout-interrupted-no-final';
const readJson=(root,path)=>JSON.parse(readFileSync(safePath(root,path),'utf8'));

function inventories(collector,amendment,contextAdmission) {
  const originalInventory=readJson(collector.root,'host-base-context-admission.json');
  const inventory=readJson(collector.root,campaignInventoryPath);
  for(const value of [originalInventory,inventory]){
    assert.equal(value.schemaVersion,'trix-host-base-context-admission-1.0.0');
    assert.ok(Array.isArray(value.approvedDigests)&&value.approvedDigests.length===1,'Exactly one admitted context required');
    assert.match(value.approvedDigests[0],/^[a-f0-9]{64}$/);
  }
  assert.equal(sha(jsonBytes(originalInventory)),amendment.originalContextInventoryHash,'Original context inventory changed');
  assert.equal(sha(jsonBytes(inventory)),amendment.currentContextInventoryHash,'Continuation context inventory changed');
  if(contextAdmission!==undefined)assert.deepEqual(JSON.parse(readFileSync(contextAdmission,'utf8')),inventory,'Recovery must use the frozen continuation inventory');
  return {inventory,originalInventory};
}

function validateFailureProof(proof,claim,inventory) {
  assert.deepEqual(Object.keys(proof).sort(),['schemaVersion','jobId','reviewId','claimSequence','claimHash','classification','threadId','turnId','model','effort','stoppedVerified','acceptedResponse','promptHash','wireDigest','wireFrames','evidenceHashes'].sort(),'Unexpected failed invocation proof');
  assert.equal(proof.schemaVersion,proofSchema);assert.equal(proof.classification,classification);
  assert.equal(proof.jobId,claim.data.job.jobId);assert.equal(proof.reviewId,claim.data.reviewId);
  assert.equal(proof.claimSequence,claim.sequence);assert.equal(proof.claimHash,claim.hash);
  assert.equal(proof.model,'gpt-6-luna');assert.equal(proof.effort,'max');
  assert.equal(proof.stoppedVerified,true);assert.equal(proof.acceptedResponse,false);
  assert.equal(proof.promptHash,claim.data.job.promptHash);assert.match(proof.wireDigest,/^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(proof.wireFrames)&&proof.wireFrames>0);
  for(const key of ['threadId','turnId'])assert.ok(typeof proof[key]==='string'&&proof[key].length>0);
  assert.deepEqual(Object.keys(proof.evidenceHashes).sort(),['process','stopped','job','capability','wire','prompt','inventory','hostJournal'].sort());
  for(const digest of Object.values(proof.evidenceHashes))assert.match(digest,/^[a-f0-9]{64}$/);
  assert.equal(proof.evidenceHashes.inventory,sha(jsonBytes(inventory)),'Failed invocation context changed');
  return proof;
}

export function verifyRecoveryHistory(collector,{amendment,inventory,originalInventory,expectedFailures,verifyPlayer=verifyPriorPlayer,verifyReviewer=verifyPriorHost,verifyFailure=verifyFailedReviewInvocation}={}) {
  const rows=collector.state().rows,counts=new Map(),failures=new Map();
  for(const claim of rows.filter(row=>row.kind==='review-dispatch-claimed')){
    const count=(counts.get(claim.data.reviewId)??0)+1;assert.ok(count<=2,'Cumulative review attempt cap exceeded');counts.set(claim.data.reviewId,count);
  }
  const history=verifySettledHistory(collector,inventory,{originalInventory,originalThroughSequence:amendment.previousBoundary.sequence,verifyPlayer,verifyReviewer(checkedCollector,claim,admittedInventory){
    const path=`private/invocations/${claim.data.job.jobId}/receipt.json`;
    if(existsSync(safePath(collector.root,path))){verifyReviewer(checkedCollector,claim,admittedInventory);return;}
    const settlement=rows.find(row=>row.kind==='review-attempt-settled'&&row.data.jobId===claim.data.job.jobId);
    assert.equal(settlement?.data.status,'rejected','Receipt-free review must be a rejected invocation');
    const proof=validateFailureProof(verifyFailure(checkedCollector,claim,admittedInventory),claim,admittedInventory);
    failures.set(proof.jobId,proof);
  }});
  if(expectedFailures){
    for(const proof of expectedFailures){assert.ok(failures.has(proof.jobId),'Previously reconciled failure disappeared');assert.deepEqual(failures.get(proof.jobId),proof,'Failed invocation proof changed');}
  }
  return {history,reconciledReviewFailures:failures};
}

function requireRecoveryBoundary(collector,amendment,priorRecoveries=[]) {
  const state=collector.state(),rows=state.rows;
  assert.ok(state.paused,'Recovery requires the paused campaign baseline');
  assert.ok(!state.episode&&!state.pending&&!state.claimed&&!state.intent,'Recovery requires completed, settled player work');
  assert.ok(!rows.some(row=>row.sequence>amendment.previousBoundary.sequence&&row.kind==='resume'),'Legacy resume prevents recovery');
  const through=priorRecoveries.at(-1)?.authorization.sequence??amendment.previousBoundary.sequence+1;
  const pauses=rows.filter(row=>row.kind==='pause'&&row.sequence>through);
  assert.equal(pauses.length,1,'Exactly one new failure pause required');
  assert.equal(pauses[0].data.reason,'campaign-driver-failed','Only a campaign-driver-failed pause permits this recovery');
  const boundary=rows.at(-1);
  assert.equal(boundary.kind,'campaign-worker-stopped','The failed campaign worker must have stopped');
  assert.equal(boundary.data.stop,'campaign-driver-failed','Worker stop must bind the campaign failure');
  assert.ok(boundary.sequence>pauses[0].sequence,'Worker stop must follow the failure pause');
  return {state,pause:pauses[0],boundary};
}

function validateRecovery(collector,recovery,amendment,priorRecoveries=[]) {
  assert.deepEqual(Object.keys(recovery).sort(),['schemaVersion','runId','createdAt','originalAmendmentHash','previousRecoveryHash','originalManifestHash','originalSourceDigest','nativeBinaryDigest','originalContextInventoryHash','currentContextInventoryHash','previousBoundary','failurePause','failedClaims','processingBuild','sourceHashes'].sort());
  assert.equal(recovery.schemaVersion,schemaVersion);assert.equal(recovery.runId,collector.manifest.runId);
  assert.equal(recovery.originalAmendmentHash,sha(jsonBytes(amendment)));
  assert.equal(recovery.previousRecoveryHash,priorRecoveries.at(-1)?.recoveryHash??null);
  for(const key of ['originalManifestHash','originalSourceDigest','nativeBinaryDigest','originalContextInventoryHash','currentContextInventoryHash'])assert.equal(recovery[key],amendment[key],`Recovery changed ${key}`);
  assert.deepEqual(Object.keys(recovery.processingBuild).sort(),['binaryDigest','sourceDigest']);
  assert.equal(recovery.processingBuild.sourceDigest,sourceDigest(recovery.sourceHashes));assert.equal(recovery.processingBuild.binaryDigest,amendment.nativeBinaryDigest);
  verifyBehaviorCompatibility(collector.manifest.sourceHashes,recovery.sourceHashes);
  const rows=collector.state().rows,boundary=rows.find(row=>row.sequence===recovery.previousBoundary.sequence),pause=rows.find(row=>row.sequence===recovery.failurePause.sequence);
  assert.deepEqual(Object.keys(recovery.previousBoundary).sort(),['hash','sequence']);assert.deepEqual(Object.keys(recovery.failurePause).sort(),['hash','sequence']);
  assert.ok(boundary&&boundary.hash===recovery.previousBoundary.hash&&boundary.kind==='campaign-worker-stopped'&&boundary.data.stop==='campaign-driver-failed','Recovery worker boundary changed');
  assert.ok(pause&&pause.hash===recovery.failurePause.hash&&pause.kind==='pause'&&pause.data.reason==='campaign-driver-failed'&&pause.sequence<boundary.sequence,'Recovery failure pause changed');
  assert.equal(recovery.createdAt,boundary.at);
  const admittedPauseHashes=new Set([...priorRecoveries.map(row=>row.recovery.failurePause.hash),pause.hash]);
  const originAuthorization=amendment.previousBoundary.sequence+1;
  assert.ok(!rows.some(row=>row.sequence>originAuthorization&&row.sequence<=boundary.sequence&&(row.kind==='resume'||row.kind==='pause'&&!admittedPauseHashes.has(row.hash))),'Operator or unapproved pause prevents recovery');
  assert.ok(Array.isArray(recovery.failedClaims)&&recovery.failedClaims.length>0,'Recovery requires independently proved failed claims');
  const {inventory,originalInventory}=inventories(collector,amendment);
  const ids=new Set();let newlyPending=0;
  const previousSequence=priorRecoveries.at(-1)?.authorization.sequence??originAuthorization;
  for(const proof of recovery.failedClaims){
    const claim=rows.find(row=>row.sequence===proof.claimSequence);assert.ok(claim?.kind==='review-dispatch-claimed'&&claim.sequence<=boundary.sequence,'Recovery failed claim changed');
    validateFailureProof(proof,claim,claim.sequence<=amendment.previousBoundary.sequence?originalInventory:inventory);
    assert.ok(!ids.has(proof.jobId),'Duplicate failed claim proof');ids.add(proof.jobId);
    if(claim.sequence>previousSequence){
      const settled=rows.find(row=>row.kind==='review-attempt-settled'&&row.data.jobId===proof.jobId);
      assert.ok(settled?.data.status==='rejected'&&settled.sequence>claim.sequence&&settled.sequence<pause.sequence,'Failure must precede its pause');
      const imported=rows.some(row=>row.kind==='review-imported'&&row.sequence<=boundary.sequence&&row.data.stage===claim.data.stage&&row.data.subjectId===(claim.data.subjectId??readJson(collector.root,`outbox/${proof.reviewId}.json`).subjectId));
      if(!imported){
        assert.equal(settled.sequence,pause.sequence-1,'Pending startup failure must immediately precede its failure pause');
        const attempts=rows.filter(row=>row.kind==='review-dispatch-claimed'&&row.sequence<=boundary.sequence&&row.data.reviewId===proof.reviewId);assert.equal(attempts.length,1,'Failed pending review has no attempt remaining');newlyPending++;
      }
    }
  }
  assert.ok(newlyPending>0,'Recovery must bind a newly failed pending review with one attempt remaining');
  return recovery;
}

function readRecoveries(collector,amendment) {
  const found=[];
  for(const authorization of collector.state().rows.filter(row=>row.kind==='campaign-recovery-authorized')){
    const recoveryHash=authorization.data.recoveryHash;assert.match(recoveryHash,/^[a-f0-9]{64}$/);
    const recoveryPath=`${recoveryDirectory}/${recoveryHash}.json`;assert.equal(authorization.data.recoveryPath,recoveryPath);
    const recovery=readJson(collector.root,recoveryPath);assert.equal(sha(jsonBytes(recovery)),recoveryHash,'Recovery metadata changed');
    validateRecovery(collector,recovery,amendment,found);
    assert.equal(authorization.sequence,recovery.previousBoundary.sequence+1,'Recovery authorization must follow its frozen boundary');
    assert.equal(authorization.data.originalAmendmentHash,recovery.originalAmendmentHash);
    found.push({recovery,recoveryHash,recoveryPath,authorization});
  }
  return found;
}

export function readLatestCampaignRecovery(collector) {
  const {amendment}=readCampaignAmendment(collector);
  return readRecoveries(collector,amendment).at(-1)??null;
}

export function prepareCampaignRecovery(collector,{contextAdmission}={}) {
  assert.equal(collector.manifest.mode,'live');
  return withRunLock(collector.root,()=>{
    const {amendment}=readCampaignAmendment(collector),prior=readRecoveries(collector,amendment),state=collector.state();
    assertDerivationQuiescent(collector.root,state);
    const contexts=inventories(collector,amendment,contextAdmission),latest=prior.at(-1);
    if(latest&&state.rows.at(-1).hash===latest.authorization.hash)return {...latest,alreadyPrepared:true};
    const {pause,boundary}=requireRecoveryBoundary(collector,amendment,prior);
    const verified=verifyRecoveryHistory(collector,{amendment,...contexts,expectedFailures:latest?.recovery.failedClaims});
    const hashes=sourceHashes();verifyBehaviorCompatibility(collector.manifest.sourceHashes,hashes);
    const original=resolveBuild(collector.root,collector.manifest.sourceHashes,{sourceDigest:amendment.originalSourceDigest,binaryDigest:amendment.nativeBinaryDigest});
    const pins={sourceDigest:sourceDigest(hashes),binaryDigest:amendment.nativeBinaryDigest};
    preserveBuild(collector.root,repository,hashes,pins,original.binaryPath);
    const recovery={schemaVersion,runId:collector.manifest.runId,createdAt:boundary.at,originalAmendmentHash:sha(jsonBytes(amendment)),previousRecoveryHash:latest?.recoveryHash??null,originalManifestHash:amendment.originalManifestHash,originalSourceDigest:amendment.originalSourceDigest,nativeBinaryDigest:amendment.nativeBinaryDigest,originalContextInventoryHash:amendment.originalContextInventoryHash,currentContextInventoryHash:amendment.currentContextInventoryHash,previousBoundary:{sequence:boundary.sequence,hash:boundary.hash},failurePause:{sequence:pause.sequence,hash:pause.hash},failedClaims:[...verified.reconciledReviewFailures.values()],processingBuild:pins,sourceHashes:hashes};
    validateRecovery(collector,recovery,amendment,prior);
    const recoveryHash=sha(jsonBytes(recovery)),recoveryPath=`${recoveryDirectory}/${recoveryHash}.json`;
    writeImmutable(safePath(collector.root,recoveryPath),jsonBytes(recovery));
    appendEvent(collector.root,'campaign-recovery-authorized',{recoveryHash,recoveryPath,originalAmendmentHash:recovery.originalAmendmentHash});
    return {...readLatestCampaignRecovery(collector),alreadyPrepared:false};
  });
}

export function campaignRecoveryFacade(collector,recovery,authorization) {
  const latest=readLatestCampaignRecovery(collector);assert.ok(latest);
  assert.deepEqual(latest.recovery,recovery);assert.equal(latest.authorization.hash,authorization.hash);
  const {amendment}=readCampaignAmendment(collector),facade=Object.create(collector),underlying=collector.state.bind(collector);
  Object.defineProperty(facade,'executionPolicy',{value:Object.freeze({...amendment.executionPolicy}),writable:false,configurable:false});
  facade.resume=()=>{throw Error('Campaign recovery cannot resume the legacy collector');};
  facade.state=()=>{
    const current=underlying();assert.equal(current.rows.find(row=>row.sequence===authorization.sequence)?.hash,authorization.hash,'Recovery authorization changed');
    assert.ok(!current.rows.some(row=>row.sequence>authorization.sequence&&row.kind==='resume'),'Legacy resume prevents campaign recovery');
    return {...current,paused:current.rows.some(row=>row.sequence>authorization.sequence&&(row.kind==='pause'||row.kind==='attempt-settled'&&row.data.fatal))};
  };
  return facade;
}

function ownDriver(root,recoveryHash) {
  const path=safePath(root,'private/driver.lock');
  if(existsSync(path)){const owner=readJson(root,'private/driver.lock');assert.ok(Number.isSafeInteger(owner.pid)&&owner.pid>0);let alive=true;try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}assert.equal(alive,false,'A campaign worker is already active');unlinkSync(path);}
  const fd=openSync(path,'wx');writeFileSync(fd,jsonBytes({pid:process.pid,startedAt:new Date().toISOString(),worker:'full-campaign',recoveryHash}));fsyncSync(fd);
  return ()=>{closeSync(fd);unlinkSync(path);};
}

export async function runRecoveredCampaign(root,{contextAdmission,cwd,executable,checkOnly=false,progress=value=>process.stdout.write(JSON.stringify(value)+'\n')}={}) {
  assert.equal(typeof checkOnly,'boolean');
  const collector=new Collector(root),{amendment}=readCampaignAmendment(collector),latest=readLatestCampaignRecovery(collector);assert.ok(latest,'No authorized campaign recovery');
  const frozen=resolveBuild(root,latest.recovery.sourceHashes,latest.recovery.processingBuild);
  assert.equal(resolve(repository),resolve(frozen.sourceRoot),'Recovery must execute its authorized frozen processor');
  const release=ownDriver(root,latest.recoveryHash);
  try{
    const contexts=inventories(collector,amendment,contextAdmission),facade=campaignRecoveryFacade(collector,latest.recovery,latest.authorization);
    if(facade.state().paused)return {stop:'paused-after-recovery',status:collector.status()};
    const verified=verifyRecoveryHistory(collector,{amendment,...contexts,expectedFailures:latest.recovery.failedClaims});
    const processingAudit={originalSourceDigest:amendment.originalSourceDigest,reviewSourceDigest:latest.recovery.processingBuild.sourceDigest,nativeBinaryDigest:amendment.nativeBinaryDigest};
    if(checkOnly)return {stop:'campaign-recovery-admission-passed',runId:collector.manifest.runId,recoveryHash:latest.recoveryHash,history:verified.history,reconciledReviewFailures:[...verified.reconciledReviewFailures.keys()],processingAudit,modelCalls:0};
    withRunLock(root,()=>appendEvent(root,'campaign-worker-started',{recoveryHash:latest.recoveryHash,processingAudit,history:verified.history,wallLimit:null,selectionDeferred:true}));
    const {runFullCampaign}=await import('./campaign-driver.mjs');
    const result=await runFullCampaign(facade,{...contexts,originalThroughSequence:amendment.previousBoundary.sequence,reconciledReviewFailures:verified.reconciledReviewFailures,processingAudit,...(cwd?{cwd}:{}),...(executable?{executable}:{}),progress});
    withRunLock(root,()=>appendEvent(root,'campaign-worker-stopped',{recoveryHash:latest.recoveryHash,stop:result.stop}));return result;
  }finally{release();}
}

export async function dispatchCampaignRecovery(originalCollector,options={}) {
  const latest=readLatestCampaignRecovery(originalCollector);assert.ok(latest,'No authorized campaign recovery');
  const frozen=resolveBuild(originalCollector.root,latest.recovery.sourceHashes,latest.recovery.processingBuild);
  const processor=await import(pathToFileURL(resolve(frozen.sourceRoot,'scripts/trix-scenario-collection/campaign-recovery.mjs')).href);
  return processor.runRecoveredCampaign(originalCollector.root,options);
}
