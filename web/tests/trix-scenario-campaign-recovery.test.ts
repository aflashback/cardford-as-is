import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { campaignRecoveryFacade, prepareCampaignRecovery, readLatestCampaignRecovery, verifyRecoveryHistory } from '../../scripts/trix-scenario-collection/campaign-recovery.mjs';
import { amendmentPath, campaignInventoryPath } from '../../scripts/trix-scenario-collection/campaign-continuation.mjs';
import { appendEvent, jsonBytes, readJournal, sha, writeImmutable } from '../../scripts/trix-scenario-collection/journal.mjs';
import { sourceDigest } from '../../scripts/coach-lab-builds.mjs';

function fixture(t) {
  const scratch=resolve('.local/evaluation/trix-scenarios/bridge-capability');mkdirSync(scratch,{recursive:true});
  const root=mkdtempSync(join(scratch,'campaign-recovery-test-'));
  t.after(()=>{assert.ok(resolve(root).startsWith(scratch+sep));rmSync(root,{recursive:true,force:true});});
  const hashes={'go.mod':'a'.repeat(64),'go.sum':'b'.repeat(64),'server/example.go':'c'.repeat(64),'scripts/trix-scenario-collection/contracts.mjs':'d'.repeat(64)};
  const manifest={runId:'recovery-fixture',mode:'live',build:{sourceDigest:sourceDigest(hashes),binaryDigest:'e'.repeat(64)},sourceHashes:hashes,plan:{workCaps:{maxActiveSegmentWallMs:5400000,maxInvocationWallMs:300000,maxPlayerAttemptsPerDecision:2,maxAttemptedEpisodes:180,maxPlayerAttemptsCampaign:17920,batchRequests:4},phases:[{variant:'basic-solo',requests:['diamonds','king','queens','lutoosh'],maxCompletedRequests:32,maxRequestsPerContract:8},{variant:'complex-solo',requests:['complex'],maxCompletedRequests:32,maxRequestsPerContract:32},{variant:'basic-partners',requests:['diamonds','king','queens','lutoosh'],maxCompletedRequests:32,maxRequestsPerContract:8},{variant:'complex-partners',requests:['complex'],maxCompletedRequests:64,maxRequestsPerContract:64}]}};
  writeImmutable(join(root,'manifest.json'),jsonBytes(manifest));appendEvent(root,'initialized',{manifestHash:sha(jsonBytes(manifest))});const originalBoundary=appendEvent(root,'pause',{reason:'operator-request'});
  const inventory={schemaVersion:'trix-host-base-context-admission-1.0.0',approvedDigests:['f'.repeat(64)]},originalInventory={...inventory,approvedDigests:['1'.repeat(64)]};
  writeImmutable(join(root,'host-base-context-admission.json'),jsonBytes(originalInventory));writeImmutable(join(root,campaignInventoryPath),jsonBytes(inventory));
  const {maxActiveSegmentWallMs,...preservedWorkCaps}=manifest.plan.workCaps;
  const amendment={schemaVersion:'trix-campaign-continuation-1.0.0',runId:manifest.runId,createdAt:originalBoundary.at,ownerDecision:'Remove the 90 minute limit window; continue and finish all necessary rounds and data collection for all planned scenarios and games. Selection is deferred. Keep detailed reviews after each game.',originalManifestHash:sha(jsonBytes(manifest)),originalSourceDigest:manifest.build.sourceDigest,nativeBinaryDigest:manifest.build.binaryDigest,previousBoundary:{sequence:originalBoundary.sequence,hash:originalBoundary.hash},executionPolicy:{maxActiveSegmentWallMs:null,selectionDeferred:true},reviewTiming:'after-each-game',completionRequests:manifest.plan.phases.map(p=>({variant:p.variant,requests:p.requests,completed:p.maxCompletedRequests,perContract:p.maxRequestsPerContract})),preservedWorkCaps,processingBuild:{sourceDigest:sourceDigest(hashes),binaryDigest:manifest.build.binaryDigest},sourceHashes:hashes,originalContextInventoryHash:sha(jsonBytes(originalInventory)),currentContextInventoryHash:sha(jsonBytes(inventory))};
  writeImmutable(join(root,amendmentPath),jsonBytes(amendment));appendEvent(root,'campaign-continuation-authorized',{amendmentPath,amendmentHash:sha(jsonBytes(amendment))});
  const collector={root,manifest,state(){const rows=readJournal(root);return {rows,paused:true,episode:null,claimed:null,intent:null,pending:null,commits:[],reviews:rows.filter(r=>r.kind==='review-imported').map(r=>r.data),outcomes:[]};}};
  const failed=(name='first')=>{
    const reviewId=`decision-${name}`,jobId=`failed-${name}`;writeImmutable(join(root,`outbox/${reviewId}.json`),jsonBytes({id:reviewId,stage:'decision',subjectId:`subject-${name}`}));
    const claim=appendEvent(root,'review-dispatch-claimed',{reviewId,stage:'decision',subjectId:`subject-${name}`,job:{jobId,promptHash:'2'.repeat(64)}});
    appendEvent(root,'review-attempt-settled',{jobId,status:'rejected',reason:'MCP startup timed out'});
    writeImmutable(join(root,`private/invocations/${jobId}/private/app-server/stopped.json`),jsonBytes({stoppedVerified:true}));
    const proof={schemaVersion:'trix-failed-review-invocation-1.0.0',jobId,reviewId,claimSequence:claim.sequence,claimHash:claim.hash,classification:'mcp-startup-timeout-interrupted-no-final',threadId:`thread-${name}`,turnId:`turn-${name}`,model:'gpt-6-luna',effort:'max',stoppedVerified:true,acceptedResponse:false,promptHash:'2'.repeat(64),wireDigest:'3'.repeat(64),wireFrames:4,evidenceHashes:{process:'4'.repeat(64),stopped:'5'.repeat(64),job:'6'.repeat(64),capability:'7'.repeat(64),wire:'8'.repeat(64),prompt:'9'.repeat(64),inventory:sha(jsonBytes(inventory)),hostJournal:'a'.repeat(64)}};
    const pause=appendEvent(root,'pause',{reason:'campaign-driver-failed'}),boundary=appendEvent(root,'campaign-worker-stopped',{stop:'campaign-driver-failed'});
    return {claim,proof,pause,boundary};
  };
  const publish=(failure,proofs=[failure.proof],previous=null)=>{
    const sourceHashes={...hashes,'scripts/trix-scenario-collection/campaign-recovery.mjs':'0'.repeat(64)};
    const recovery={schemaVersion:'trix-campaign-recovery-1.0.0',runId:manifest.runId,createdAt:failure.boundary.at,originalAmendmentHash:sha(jsonBytes(amendment)),previousRecoveryHash:previous?.recoveryHash??null,originalManifestHash:amendment.originalManifestHash,originalSourceDigest:amendment.originalSourceDigest,nativeBinaryDigest:amendment.nativeBinaryDigest,originalContextInventoryHash:amendment.originalContextInventoryHash,currentContextInventoryHash:amendment.currentContextInventoryHash,previousBoundary:{sequence:failure.boundary.sequence,hash:failure.boundary.hash},failurePause:{sequence:failure.pause.sequence,hash:failure.pause.hash},failedClaims:proofs,processingBuild:{sourceDigest:sourceDigest(sourceHashes),binaryDigest:manifest.build.binaryDigest},sourceHashes};
    const recoveryHash=sha(jsonBytes(recovery)),recoveryPath=`private/campaign-recovery/${recoveryHash}.json`;writeImmutable(join(root,recoveryPath),jsonBytes(recovery));
    const authorization=appendEvent(root,'campaign-recovery-authorized',{recoveryHash,recoveryPath,originalAmendmentHash:recovery.originalAmendmentHash});return {recovery,recoveryHash,recoveryPath,authorization};
  };
  return {root,collector,amendment,inventory,originalInventory,failed,publish};
}

test('recovery is append-only, idempotent and suppresses only its authorized failure pause',t=>{
  const f=fixture(t),originalManifest=readFileSync(join(f.root,'manifest.json')),originalAmendment=readFileSync(join(f.root,amendmentPath)),failure=f.failed(),prefix=readJournal(f.root),saved=f.publish(failure);
  assert.deepEqual(readLatestCampaignRecovery(f.collector),saved);assert.deepEqual(readJournal(f.root).slice(0,prefix.length),prefix);
  assert.equal(prepareCampaignRecovery(f.collector).alreadyPrepared,true);
  const active=campaignRecoveryFacade(f.collector,saved.recovery,saved.authorization);assert.equal(active.state().paused,false);assert.deepEqual(active.executionPolicy,{maxActiveSegmentWallMs:null,selectionDeferred:true});
  assert.throws(()=>active.resume(),/legacy/);appendEvent(f.root,'pause',{reason:'operator-request'});assert.equal(active.state().paused,true);
  assert.equal(campaignRecoveryFacade(f.collector,saved.recovery,saved.authorization).state().paused,true);
  assert.ok(originalManifest.equals(readFileSync(join(f.root,'manifest.json'))));assert.ok(originalAmendment.equals(readFileSync(join(f.root,amendmentPath))));
});

test('recovery history requires full failure verification, never stopped flags alone, and rechecks bound proof receipts',t=>{
  const f=fixture(t),failure=f.failed();let verified=0;
  const options={amendment:f.amendment,inventory:f.inventory,originalInventory:f.originalInventory,verifyPlayer(){},verifyReviewer(){throw Error('missing receipt cannot pass normal review admission');},verifyFailure(){verified++;return failure.proof;}};
  const admitted=verifyRecoveryHistory(f.collector,options);assert.equal(verified,1);assert.deepEqual(admitted.reconciledReviewFailures.get(failure.proof.jobId),failure.proof);
  assert.throws(()=>verifyRecoveryHistory(f.collector,{...options,verifyFailure(){throw Error('interruption could not be proved');}}),/could not be proved/);
  assert.throws(()=>verifyRecoveryHistory(f.collector,{...options,expectedFailures:[{...failure.proof,wireDigest:'a'.repeat(64)}]}),/proof changed/);
  assert.throws(()=>verifyRecoveryHistory(f.collector,{...options,verifyFailure:()=>({...failure.proof,acceptedResponse:true})}));
});

test('normal receipt-bearing history uses original admission and never enters the failure bypass',t=>{
  const f=fixture(t),failure=f.failed();writeImmutable(join(f.root,`private/invocations/${failure.proof.jobId}/receipt.json`),jsonBytes({synthetic:true}));let normal=0;
  const result=verifyRecoveryHistory(f.collector,{amendment:f.amendment,inventory:f.inventory,originalInventory:f.originalInventory,verifyPlayer(){},verifyReviewer(_collector,_claim,inventory){assert.deepEqual(inventory,f.inventory);normal++;},verifyFailure(){throw Error('Unexpected bypass');}});
  assert.equal(normal,1);assert.equal(result.reconciledReviewFailures.size,0);
});

test('third cumulative review attempts are rejected before verification',t=>{
  const f=fixture(t),failure=f.failed();for(let i=0;i<2;i++)appendEvent(f.root,'review-dispatch-claimed',{reviewId:failure.proof.reviewId,job:{jobId:`extra-${i}`}});
  assert.throws(()=>verifyRecoveryHistory(f.collector,{amendment:f.amendment,inventory:f.inventory,originalInventory:f.originalInventory,verifyFailure(){throw Error('Must not verify after cap');}}),/attempt cap/);
});

test('operator pauses and active driver ownership prevent recovery preparation',t=>{
  const f=fixture(t);appendEvent(f.root,'pause',{reason:'operator-request'});appendEvent(f.root,'campaign-worker-stopped',{stop:'campaign-driver-failed'});
  assert.throws(()=>prepareCampaignRecovery(f.collector),/Only a campaign-driver-failed/);assert.equal(existsSync(join(f.root,'private/campaign-recovery')),false);
  const g=fixture(t);g.failed();writeImmutable(join(g.root,'private/driver.lock'),jsonBytes({pid:process.pid}));
  assert.throws(()=>prepareCampaignRecovery(g.collector),/Stop the live collection driver/);
});

test('a later startup failure can receive a separate authorization while preserving the first recovery',t=>{
  const f=fixture(t),first=f.failed(),saved=f.publish(first),originalBytes=readFileSync(join(f.root,saved.recoveryPath));
  appendEvent(f.root,'review-imported',{stage:'decision',subjectId:'subject-first'});
  const second=f.failed('second'),next=f.publish(second,[first.proof,second.proof],saved);
  assert.deepEqual(readLatestCampaignRecovery(f.collector),next);assert.ok(originalBytes.equals(readFileSync(join(f.root,saved.recoveryPath))));
  assert.equal(campaignRecoveryFacade(f.collector,next.recovery,next.authorization).state().paused,false);
  const admitted=verifyRecoveryHistory(f.collector,{amendment:f.amendment,inventory:f.inventory,originalInventory:f.originalInventory,expectedFailures:next.recovery.failedClaims,verifyPlayer(){},verifyReviewer(){},verifyFailure(_collector,claim){return claim.data.job.jobId===first.proof.jobId?first.proof:second.proof;}});
  assert.equal(admitted.reconciledReviewFailures.size,2);
});

test('changed metadata or a legacy resume cannot silently activate recovery',t=>{
  const f=fixture(t),saved=f.publish(f.failed());writeFileSync(join(f.root,saved.recoveryPath),jsonBytes({...saved.recovery,nativeBinaryDigest:'f'.repeat(64)}));
  assert.throws(()=>readLatestCampaignRecovery(f.collector),/metadata changed/);
  const g=fixture(t),valid=g.publish(g.failed()),active=campaignRecoveryFacade(g.collector,valid.recovery,valid.authorization);appendEvent(g.root,'resume',{});assert.throws(()=>active.state(),/Legacy resume/);
});
