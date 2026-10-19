// An exhausted review can reuse preserved evidence only through the narrow,
// host-verified reference envelope. Attempts, grading and prose stay original.
import assert from 'node:assert/strict';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { preserveBuild, resolveBuild, sourceDigest } from '../coach-lab-builds.mjs';
import { Collector, repository, sourceHashes } from './runner.mjs';
import { appendEvent, getBlob, jsonBytes, safePath, sha, withRunLock, writeImmutable } from './journal.mjs';
import { assertDerivationQuiescent } from './derived-export.mjs';
import { readCampaignAmendment, verifyBehaviorCompatibility } from './campaign-continuation.mjs';
import { readLatestCampaignRecovery } from './campaign-recovery.mjs';
import { buildContextDriverApis, readLatestContextRecovery, verifyContextRecoveryHistory } from './context-recovery.mjs';
import { verifyReferenceRecovery, importRecoveredReferenceReview, wrapReferenceDriverApis } from './reference-envelope.mjs';

const originalSchemaVersion='trix-metadata-recovery-1.0.0';
const schemaVersion='trix-metadata-recovery-2.0.0';
const keys=(value,names)=>assert.deepEqual(Object.keys(value).sort(),[...names].sort());
const readJson=(root,path)=>JSON.parse(readFileSync(safePath(root,path),'utf8'));

function layers(collector) {
  const {amendment}=readCampaignAmendment(collector),startupRecovery=readLatestCampaignRecovery(collector),contextRecovery=readLatestContextRecovery(collector);
  assert.ok(startupRecovery&&contextRecovery,'Authorized context recovery required before metadata recovery');
  return {amendment,startupRecovery,contextRecovery,audit:getBlob(collector.root,contextRecovery.recovery.auditRef)};
}
function processingAuditFor(amendment,pins) {return {originalSourceDigest:amendment.originalSourceDigest,reviewSourceDigest:pins.sourceDigest,nativeBinaryDigest:amendment.nativeBinaryDigest};}
function historyFor(collector,prior) {
  return verifyContextRecoveryHistory(collector,{amendment:prior.amendment,startupRecovery:prior.startupRecovery,audit:prior.audit,authorizationSequence:prior.contextRecovery.authorization.sequence,expectedProof:prior.contextRecovery.recovery.proof});
}

function capBoundary(collector,prior,requestedReviewId) {
  const state=collector.state(),rows=state.rows;
  assert.ok(state.paused&&!state.episode&&!state.pending&&!state.claimed&&!state.intent,'Metadata recovery requires completed, settled, paused player work');
  const boundary=rows.at(-1),pause=rows.at(-2),settlement=rows.at(-3);
  assert.ok(boundary?.kind==='campaign-worker-stopped'&&boundary.data.stop==='review-attempt-cap','Metadata recovery requires its stopped attempt-cap worker');
  assert.ok(pause?.kind==='pause'&&pause.data.reason==='review-attempt-cap'&&pause.sequence===boundary.sequence-1,'Only the frozen review-attempt-cap pause permits metadata recovery');
  assert.ok(settlement?.kind==='review-attempt-settled'&&settlement.data.status==='rejected'&&settlement.sequence===pause.sequence-1,'Attempt-cap pause must follow its rejected review');
  const selected=rows.filter(row=>row.kind==='review-dispatch-claimed'&&row.data.job.jobId===settlement.data.jobId);assert.equal(selected.length,1);
  const reviewId=selected[0].data.reviewId;if(requestedReviewId!==undefined)assert.equal(requestedReviewId,reviewId,'Recovery target must match the capped pending review');
  return {state,boundary,pause,reviewId};
}

export function validateMetadataRecovery(collector,recovery,prior=layers(collector),previous=null) {
  const original=recovery.schemaVersion===originalSchemaVersion;
  assert.ok(original||recovery.schemaVersion===schemaVersion,'Unknown metadata recovery version');
  keys(recovery,['schemaVersion','runId','createdAt','originalAmendmentHash','contextRecoveryHash','originalManifestHash','originalSourceDigest','nativeBinaryDigest','contextInventoryHash','previousBoundary','failurePause','reviewId','claimBindings','proof','processingBuild','sourceHashes',...(original?[]:['previousMetadataRecoveryHash'])]);
  if(original)assert.equal(previous,null,'Historical V1 must be the first metadata recovery');
  else {assert.ok(previous,'V2 metadata recovery requires its predecessor');assert.equal(recovery.previousMetadataRecoveryHash,previous.recoveryHash,'Metadata recovery predecessor changed');assert.notEqual(recovery.reviewId,previous.recovery.reviewId,'A recovered target cannot receive another cap recovery');}
  assert.equal(recovery.runId,collector.manifest.runId);assert.equal(recovery.originalAmendmentHash,sha(jsonBytes(prior.amendment)));assert.equal(recovery.contextRecoveryHash,prior.contextRecovery.recoveryHash);
  for(const key of ['originalManifestHash','originalSourceDigest','nativeBinaryDigest'])assert.equal(recovery[key],prior.amendment[key]);
  assert.equal(recovery.contextInventoryHash,prior.contextRecovery.recovery.newContextInventoryHash);assert.equal(recovery.contextInventoryHash,sha(jsonBytes(prior.audit.newInventory)));
  keys(recovery.processingBuild,['sourceDigest','binaryDigest']);assert.equal(recovery.processingBuild.sourceDigest,sourceDigest(recovery.sourceHashes));assert.equal(recovery.processingBuild.binaryDigest,recovery.nativeBinaryDigest);verifyBehaviorCompatibility(collector.manifest.sourceHashes,recovery.sourceHashes);
  const state=collector.state(),rows=state.rows,boundary=rows.find(row=>row.sequence===recovery.previousBoundary.sequence),pause=rows.find(row=>row.sequence===recovery.failurePause.sequence);keys(recovery.previousBoundary,['sequence','hash']);keys(recovery.failurePause,['sequence','hash']);
  assert.ok(boundary&&boundary.hash===recovery.previousBoundary.hash&&boundary.kind==='campaign-worker-stopped'&&boundary.data.stop==='review-attempt-cap','Metadata recovery worker boundary changed');
  assert.ok(pause&&pause.hash===recovery.failurePause.hash&&pause.kind==='pause'&&pause.data.reason==='review-attempt-cap'&&pause.sequence===boundary.sequence-1,'Metadata recovery pause changed');assert.equal(recovery.createdAt,boundary.at);
  const baselineSequence=previous?.authorization.sequence??prior.contextRecovery.authorization.sequence;
  assert.ok(pause.sequence>baselineSequence,'Metadata recovery boundary must follow its predecessor');
  const intervening=rows.filter(row=>row.sequence>baselineSequence&&row.sequence<=boundary.sequence&&['pause','resume'].includes(row.kind));assert.deepEqual(intervening,[pause],'Operator or unrelated pause prevents metadata recovery');
  const attempts=rows.filter(row=>row.kind==='review-dispatch-claimed'&&row.sequence<=boundary.sequence&&row.data.reviewId===recovery.reviewId);assert.equal(attempts.length,2,'Metadata recovery must preserve both consumed attempts');assert.equal(attempts[0].data.stage,'decision');assert.equal(attempts[1].data.stage,'decision');
  assert.ok(Array.isArray(recovery.claimBindings)&&recovery.claimBindings.length===2);
  for(let i=0;i<2;i++){
    const claim=attempts[i],binding=recovery.claimBindings[i];keys(binding,['claimSequence','claimHash','settlementSequence','settlementHash','jobId']);assert.equal(binding.claimSequence,claim.sequence);assert.equal(binding.claimHash,claim.hash);assert.equal(binding.jobId,claim.data.job.jobId);
    const settlements=rows.filter(row=>row.kind==='review-attempt-settled'&&row.data.jobId===binding.jobId);assert.equal(settlements.length,1);assert.equal(settlements[0].data.status,'rejected');assert.equal(binding.settlementSequence,settlements[0].sequence);assert.equal(binding.settlementHash,settlements[0].hash);assert.ok(binding.settlementSequence>binding.claimSequence&&binding.settlementSequence<pause.sequence);
    if(i===0)assert.ok(binding.settlementSequence<attempts[1].sequence);else assert.equal(binding.settlementSequence,pause.sequence-1);
  }
  const proof=recovery.proof,selectedIndex=original?1:attempts.findIndex(row=>row.data.job.jobId===proof.jobId);assert.ok(selectedIndex===0||selectedIndex===1,'Selected reference claim is outside the bound attempts');
  assert.equal(proof.schemaVersion,'trix-reference-recovery-proof-1.0.0');assert.equal(proof.reviewId,recovery.reviewId);assert.equal(proof.jobId,attempts[selectedIndex].data.job.jobId);assert.equal(proof.claimHash,attempts[selectedIndex].hash);assert.equal(proof.claimSequence,attempts[selectedIndex].sequence);
  assert.match(proof.rawResponseHash,/^[a-f0-9]{64}$/);assert.match(proof.normalizedProposalHash,/^[a-f0-9]{64}$/);assert.ok(proof.normalization&&typeof proof.normalization==='object');assert.ok(Array.isArray(proof.earlierRejected)&&proof.earlierRejected.length===selectedIndex);
  for(let i=0;i<selectedIndex;i++)assert.equal(proof.earlierRejected[i].jobId,attempts[i].data.job.jobId,'Rejected chronology changed');
  const normalizerHash=recovery.sourceHashes['scripts/trix-scenario-collection/reference-envelope.mjs'];assert.match(normalizerHash,/^[a-f0-9]{64}$/);
  assert.equal(proof.normalization.normalizerSourceHash,normalizerHash,'Reference normalizer differs from the frozen source');
  const processingAudit=processingAuditFor(prior.amendment,recovery.processingBuild);
  for(const [key,value]of Object.entries(processingAudit))assert.equal(proof.normalization[key],value,`Reference normalization changed frozen ${key}`);
  assert.equal(sha(readFileSync(safePath(collector.root,`private/invocations/${proof.jobId}/response.txt`))),proof.rawResponseHash,'Preserved reference response changed');
  const job=readJson(collector.root,`outbox/${recovery.reviewId}.json`);assert.equal(job.stage,'decision');assert.ok(!rows.some(row=>row.sequence<=boundary.sequence&&row.kind==='review-imported'&&row.data.stage==='decision'&&row.data.subjectId===job.subjectId),'Capped target was already reviewed');
  return recovery;
}

export function readLatestMetadataRecovery(collector) {
  const records=collector.state().rows.filter(row=>row.kind==='metadata-recovery-authorized');if(!records.length)return null;
  const prior=layers(collector),seen=new Set(),targets=new Set();let previous=null;
  for(const authorization of records){
    const recoveryHash=authorization.data.recoveryHash;assert.match(recoveryHash,/^[a-f0-9]{64}$/);assert.ok(!seen.has(recoveryHash),'Duplicate or cyclic metadata recovery');seen.add(recoveryHash);
    const recoveryPath=`private/metadata-recovery/${recoveryHash}.json`;assert.equal(authorization.data.recoveryPath,recoveryPath);
    const recovery=readJson(collector.root,recoveryPath);assert.equal(sha(jsonBytes(recovery)),recoveryHash,'Metadata recovery record changed');validateMetadataRecovery(collector,recovery,prior,previous);
    assert.ok(!targets.has(recovery.reviewId),'Duplicate metadata recovery target');targets.add(recovery.reviewId);
    // Every historical processor, including V1's narrower normalizer, remains
    // pinned to its own archived bytes. Never regenerate its proof using V2.
    resolveBuild(collector.root,recovery.sourceHashes,recovery.processingBuild);
    assert.equal(authorization.sequence,recovery.previousBoundary.sequence+1);assert.equal(authorization.data.contextRecoveryHash,recovery.contextRecoveryHash);
    previous={recovery,recoveryHash,recoveryPath,authorization};
  }
  return previous;
}

export async function prepareMetadataRecovery(collector,{reviewId}={}) {
  assert.equal(collector.manifest.mode,'live');const prior=layers(collector);assertDerivationQuiescent(collector.root,collector.state());const verified=historyFor(collector,prior),api=await buildContextDriverApis(collector,verified,prior.audit);
  return withRunLock(collector.root,()=>{
    const currentPrior=layers(collector);assert.equal(currentPrior.contextRecovery.recoveryHash,prior.contextRecovery.recoveryHash);assertDerivationQuiescent(collector.root,collector.state());const existing=readLatestMetadataRecovery(collector);
    const currentRows=collector.state().rows;
    if(existing&&!currentRows.some(row=>row.sequence>existing.authorization.sequence&&row.kind==='pause')){if(reviewId!==undefined)assert.equal(reviewId,existing.recovery.reviewId);return {...existing,alreadyPrepared:true};}
    const baseline=capBoundary(collector,prior,reviewId);historyFor(collector,prior);
    const hashes=sourceHashes();verifyBehaviorCompatibility(collector.manifest.sourceHashes,hashes);const pins={sourceDigest:sourceDigest(hashes),binaryDigest:prior.amendment.nativeBinaryDigest},processingAudit=processingAuditFor(prior.amendment,pins);
    const selected=verifyReferenceRecovery(collector,baseline.reviewId,{processingAudit,api});assert.equal(selected.proof.reviewId,baseline.reviewId);
    const recovery={schemaVersion:existing?schemaVersion:originalSchemaVersion,...(existing?{previousMetadataRecoveryHash:existing.recoveryHash}:{}),runId:collector.manifest.runId,createdAt:baseline.boundary.at,originalAmendmentHash:sha(jsonBytes(prior.amendment)),contextRecoveryHash:prior.contextRecovery.recoveryHash,originalManifestHash:prior.amendment.originalManifestHash,originalSourceDigest:prior.amendment.originalSourceDigest,nativeBinaryDigest:prior.amendment.nativeBinaryDigest,contextInventoryHash:prior.contextRecovery.recovery.newContextInventoryHash,previousBoundary:{sequence:baseline.boundary.sequence,hash:baseline.boundary.hash},failurePause:{sequence:baseline.pause.sequence,hash:baseline.pause.hash},reviewId:baseline.reviewId,claimBindings:selected.claimBindings,proof:selected.proof,processingBuild:pins,sourceHashes:hashes};
    validateMetadataRecovery(collector,recovery,prior,existing);const original=resolveBuild(collector.root,collector.manifest.sourceHashes,{sourceDigest:recovery.originalSourceDigest,binaryDigest:recovery.nativeBinaryDigest});preserveBuild(collector.root,repository,hashes,pins,original.binaryPath);
    const recoveryHash=sha(jsonBytes(recovery)),recoveryPath=`private/metadata-recovery/${recoveryHash}.json`;writeImmutable(safePath(collector.root,recoveryPath),jsonBytes(recovery));appendEvent(collector.root,'metadata-recovery-authorized',{recoveryHash,recoveryPath,contextRecoveryHash:recovery.contextRecoveryHash});return {...readLatestMetadataRecovery(collector),alreadyPrepared:false};
  });
}

export function metadataRecoveryFacade(collector,latest) {
  assert.deepEqual(readLatestMetadataRecovery(collector),latest);const {amendment}=readCampaignAmendment(collector),facade=Object.create(collector),underlying=collector.state.bind(collector);
  Object.defineProperty(facade,'executionPolicy',{value:Object.freeze({...amendment.executionPolicy}),writable:false,configurable:false});facade.resume=()=>{throw Error('Metadata recovery cannot resume the legacy collector');};
  facade.state=()=>{const state=underlying();assert.equal(state.rows.find(row=>row.sequence===latest.authorization.sequence)?.hash,latest.authorization.hash);assert.ok(!state.rows.some(row=>row.sequence>latest.authorization.sequence&&row.kind==='resume'),'Legacy resume prevents metadata recovery');return {...state,paused:state.rows.some(row=>row.sequence>latest.authorization.sequence&&(row.kind==='pause'||row.kind==='attempt-settled'&&row.data.fatal))};};return facade;
}

export function verifyMetadataSavedResponse(collector,latest,{processingAudit,api,verifyReference=verifyReferenceRecovery}={}) {
  const attempts=collector.state().rows.filter(row=>row.kind==='review-dispatch-claimed'&&row.data.reviewId===latest.recovery.reviewId);assert.equal(attempts.length,2,'A new claim or third attempt prevents saved reference recovery');
  const selected=verifyReference(collector,latest.recovery.reviewId,{processingAudit,api});assert.deepEqual(selected.proof,latest.recovery.proof,'Reference recovery proof changed');assert.deepEqual(selected.claimBindings,latest.recovery.claimBindings,'Reference recovery chronology changed');return selected;
}

export function importMetadataSavedReview(collector,latest,selected,options) {
  assert.equal(collector.state().paused,false,'Later pause prevents saved reference import');assert.deepEqual(selected.proof,latest.recovery.proof,'Saved reference proof changed');assert.deepEqual(selected.claimBindings,latest.recovery.claimBindings,'Saved reference chronology changed');
  const guarded=Object.create(collector),underlying=collector.state.bind(collector);guarded.state=()=>{const state=underlying();assert.equal(state.paused,false,'Later pause prevents saved reference import');return state;};
  const {importReference=importRecoveredReferenceReview,...importOptions}=options;
  const result=importReference(guarded,selected,importOptions);
  withRunLock(collector.root,()=>{if(!collector.state().rows.some(row=>row.kind==='metadata-review-saved-admitted'&&row.data.recoveryHash===latest.recoveryHash))appendEvent(collector.root,'metadata-review-saved-admitted',{recoveryHash:latest.recoveryHash,reviewId:latest.recovery.reviewId,jobId:selected.proof.jobId,rawResponseHash:selected.proof.rawResponseHash,normalizedProposalHash:selected.proof.normalizedProposalHash,reviewRef:result.reviewRef});});return result;
}

function ownDriver(root,recoveryHash) {
  const path=safePath(root,'private/driver.lock');if(existsSync(path)){const owner=readJson(root,'private/driver.lock');assert.ok(Number.isSafeInteger(owner.pid)&&owner.pid>0);let alive=true;try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}assert.equal(alive,false,'A campaign worker is already active');unlinkSync(path);}
  const fd=openSync(path,'wx');writeFileSync(fd,jsonBytes({pid:process.pid,startedAt:new Date().toISOString(),worker:'full-campaign',metadataRecoveryHash:recoveryHash}));fsyncSync(fd);return ()=>{closeSync(fd);unlinkSync(path);};
}

export async function runMetadataRecoveredCampaign(root,{contextAdmission,cwd,executable,checkOnly=false,progress=value=>process.stdout.write(JSON.stringify(value)+'\n')}={}) {
  assert.equal(typeof checkOnly,'boolean');const collector=new Collector(root),latest=readLatestMetadataRecovery(collector);assert.ok(latest,'No authorized metadata recovery');const prior=layers(collector),frozen=resolveBuild(root,latest.recovery.sourceHashes,latest.recovery.processingBuild);assert.equal(resolve(repository),resolve(frozen.sourceRoot),'Metadata recovery must run its frozen processor');const release=ownDriver(root,latest.recoveryHash);let started=false;
  try{
    if(contextAdmission!==undefined)assert.deepEqual(JSON.parse(readFileSync(contextAdmission,'utf8')),prior.audit.newInventory,'Metadata recovery requires the audited active context');
    const facade=metadataRecoveryFacade(collector,latest);if(facade.state().paused)return {stop:'paused-after-metadata-recovery',status:collector.status()};
    const verified=historyFor(collector,prior),processingAudit=processingAuditFor(prior.amendment,latest.recovery.processingBuild),baseApi=await buildContextDriverApis(facade,verified,prior.audit);
    if(facade.state().paused)return {stop:'paused-after-metadata-recovery',status:collector.status()};
    const selected=verifyMetadataSavedResponse(facade,latest,{processingAudit,api:baseApi});
    if(checkOnly)return {stop:'metadata-recovery-admission-passed',runId:collector.manifest.runId,recoveryHash:latest.recoveryHash,history:verified.history,selectedSavedResponseHash:selected.proof.rawResponseHash,modelCalls:0,processingAudit};
    const api=wrapReferenceDriverApis(baseApi,{processingAudit});withRunLock(root,()=>{assert.equal(facade.state().paused,false,'Later pause prevents metadata worker start');appendEvent(root,'campaign-worker-started',{metadataRecoveryHash:latest.recoveryHash,processingAudit,history:verified.history,wallLimit:null,selectionDeferred:true});});started=true;
    importMetadataSavedReview(facade,latest,selected,{processingAudit,api:baseApi});progress({event:'metadata-saved-review-imported',reviewId:latest.recovery.reviewId,rawResponseHash:selected.proof.rawResponseHash,newModelCalls:0});
    const {runFullCampaign}=await import('./campaign-driver.mjs'),result=await runFullCampaign(facade,{inventory:verified.inventory,originalInventory:verified.originalInventory,originalThroughSequence:prior.amendment.previousBoundary.sequence,reconciledReviewFailures:verified.reconciledReviewFailures,processingAudit,apis:api,...(cwd?{cwd}:{}),...(executable?{executable}:{}),progress});withRunLock(root,()=>appendEvent(root,'campaign-worker-stopped',{metadataRecoveryHash:latest.recoveryHash,stop:result.stop}));return result;
  }catch(error){if(started)withRunLock(root,()=>{if(!collector.state().rows.some(row=>row.sequence>latest.authorization.sequence&&row.kind==='pause'))appendEvent(root,'pause',{reason:'metadata-recovery-failed',detail:error.message});appendEvent(root,'campaign-worker-stopped',{metadataRecoveryHash:latest.recoveryHash,stop:'metadata-recovery-failed',reason:error.message});});throw error;}finally{release();}
}

export async function dispatchMetadataRecovery(originalCollector,options={}) {
  const latest=readLatestMetadataRecovery(originalCollector);assert.ok(latest,'No authorized metadata recovery');const frozen=resolveBuild(originalCollector.root,latest.recovery.sourceHashes,latest.recovery.processingBuild),processor=await import(pathToFileURL(resolve(frozen.sourceRoot,'scripts/trix-scenario-collection/metadata-recovery.mjs')).href);return processor.runMetadataRecoveredCampaign(originalCollector.root,options);
}
