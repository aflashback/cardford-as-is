import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { buildGameReviewRecoveryApis, importGameReviewSavedReview, gameReviewRecoveryFacade, readLatestGameReviewRecovery, validateGameReviewRecovery, verifyGameReviewSavedResponse } from '../../scripts/trix-scenario-collection/game-review-recovery.mjs';
import { readLatestRationaleRecovery } from '../../scripts/trix-scenario-collection/forced-rationale-recovery.mjs';
import { gameReviewClassificationVersion } from '../../scripts/trix-scenario-collection/game-review-classification.mjs';
import { forcedRationalePolicyVersion } from '../../scripts/trix-scenario-collection/forced-rationale-policy.mjs';
import { amendmentPath, campaignInventoryPath } from '../../scripts/trix-scenario-collection/campaign-continuation.mjs';
import { readLatestCampaignRecovery } from '../../scripts/trix-scenario-collection/campaign-recovery.mjs';
import { contextFailureReason } from '../../scripts/trix-scenario-collection/context-evidence.mjs';
import { appendEvent, getBlob, jsonBytes, putBlob, readJournal, sha, withRunLock, writeImmutable } from '../../scripts/trix-scenario-collection/journal.mjs';
import { preserveBuild, resolveBuild, sourceDigest } from '../../scripts/coach-lab-builds.mjs';

function fixture(t) {
  const scratch=resolve('.local/evaluation/trix-scenarios/bridge-capability');mkdirSync(scratch,{recursive:true});const root=mkdtempSync(join(scratch,'context-recovery-test-'));t.after(()=>{assert.ok(root.startsWith(scratch+sep));rmSync(root,{recursive:true,force:true});});
  const hashes=Object.fromEntries(['go.mod','go.sum','server/example.go','scripts/trix-scenario-collection/contracts.mjs'].map(name=>[name,sha(Buffer.from('Synthetic archive fixture: '+name))]));
  const phases=[['basic-solo',['diamonds','king','queens','lutoosh'],32,8],['complex-solo',['complex'],32,32],['basic-partners',['diamonds','king','queens','lutoosh'],32,8],['complex-partners',['complex'],64,64]].map(([variant,requests,maxCompletedRequests,maxRequestsPerContract])=>({variant,requests,maxCompletedRequests,maxRequestsPerContract}));
  const manifest={runId:'context-fixture',mode:'live',build:{sourceDigest:sourceDigest(hashes),binaryDigest:sha(Buffer.from('Synthetic archive native bytes'))},sourceHashes:hashes,plan:{workCaps:{maxActiveSegmentWallMs:5400000,maxInvocationWallMs:300000,maxPlayerAttemptsPerDecision:2,maxAttemptedEpisodes:180,maxPlayerAttemptsCampaign:17920,batchRequests:4},phases}};
  writeImmutable(join(root,'manifest.json'),jsonBytes(manifest));appendEvent(root,'initialized',{manifestHash:sha(jsonBytes(manifest))});appendEvent(root,'dispatch-claimed',{jobId:'original-player'});appendEvent(root,'move-committed',{jobId:'original-player'});const originalBoundary=appendEvent(root,'pause',{reason:'operator-request'});
  const previousInventory={schemaVersion:'trix-host-base-context-admission-1.0.0',approvedDigests:['f'.repeat(64)]},originalInventory={...previousInventory,approvedDigests:['1'.repeat(64)]},inventory={...previousInventory,approvedDigests:['2'.repeat(64)]};
  writeImmutable(join(root,'host-base-context-admission.json'),jsonBytes(originalInventory));writeImmutable(join(root,campaignInventoryPath),jsonBytes(previousInventory));const {maxActiveSegmentWallMs,...preservedWorkCaps}=manifest.plan.workCaps;
  const amendment={schemaVersion:'trix-campaign-continuation-1.0.0',runId:manifest.runId,createdAt:originalBoundary.at,ownerDecision:'Remove the 90 minute limit window; continue and finish all necessary rounds and data collection for all planned scenarios and games. Selection is deferred. Keep detailed reviews after each game.',originalManifestHash:sha(jsonBytes(manifest)),originalSourceDigest:manifest.build.sourceDigest,nativeBinaryDigest:manifest.build.binaryDigest,previousBoundary:{sequence:originalBoundary.sequence,hash:originalBoundary.hash},executionPolicy:{maxActiveSegmentWallMs:null,selectionDeferred:true},reviewTiming:'after-each-game',completionRequests:phases.map(p=>({variant:p.variant,requests:p.requests,completed:p.maxCompletedRequests,perContract:p.maxRequestsPerContract})),preservedWorkCaps,processingBuild:{sourceDigest:sourceDigest(hashes),binaryDigest:manifest.build.binaryDigest},sourceHashes:hashes,originalContextInventoryHash:sha(jsonBytes(originalInventory)),currentContextInventoryHash:sha(jsonBytes(previousInventory))};
  writeImmutable(join(root,amendmentPath),jsonBytes(amendment));appendEvent(root,'campaign-continuation-authorized',{amendmentPath,amendmentHash:sha(jsonBytes(amendment))});
  const reviewJob={id:'decision-pending',stage:'decision',subjectId:'pending-decision',promptHash:'3'.repeat(64)};writeImmutable(join(root,`outbox/${reviewJob.id}.json`),jsonBytes(reviewJob));
  const stop=jobId=>writeImmutable(join(root,`private/invocations/${jobId}/private/app-server/stopped.json`),jsonBytes({stoppedVerified:true}));
  const firstClaim=appendEvent(root,'review-dispatch-claimed',{reviewId:reviewJob.id,stage:'decision',subjectId:reviewJob.subjectId,job:{jobId:'startup-failed',promptHash:reviewJob.promptHash}});appendEvent(root,'review-attempt-settled',{jobId:'startup-failed',status:'rejected',reason:'MCP startup timeout'});stop('startup-failed');const startupPause=appendEvent(root,'pause',{reason:'campaign-driver-failed'}),startupBoundary=appendEvent(root,'campaign-worker-stopped',{stop:'campaign-driver-failed'});
  const failureProof={schemaVersion:'trix-failed-review-invocation-1.0.0',jobId:'startup-failed',reviewId:reviewJob.id,claimSequence:firstClaim.sequence,claimHash:firstClaim.hash,classification:'mcp-startup-timeout-interrupted-no-final',threadId:'first-thread',turnId:'first-turn',model:'gpt-6-luna',effort:'max',stoppedVerified:true,acceptedResponse:false,promptHash:reviewJob.promptHash,wireDigest:'4'.repeat(64),wireFrames:46,evidenceHashes:Object.fromEntries(['process','stopped','job','capability','wire','prompt','hostJournal'].map(key=>[key,'5'.repeat(64)]))};failureProof.evidenceHashes.inventory=sha(jsonBytes(previousInventory));
  const startupRecord={schemaVersion:'trix-campaign-recovery-1.0.0',runId:manifest.runId,createdAt:startupBoundary.at,originalAmendmentHash:sha(jsonBytes(amendment)),previousRecoveryHash:null,originalManifestHash:amendment.originalManifestHash,originalSourceDigest:amendment.originalSourceDigest,nativeBinaryDigest:amendment.nativeBinaryDigest,originalContextInventoryHash:amendment.originalContextInventoryHash,currentContextInventoryHash:amendment.currentContextInventoryHash,previousBoundary:{sequence:startupBoundary.sequence,hash:startupBoundary.hash},failurePause:{sequence:startupPause.sequence,hash:startupPause.hash},failedClaims:[failureProof],processingBuild:{sourceDigest:sourceDigest(hashes),binaryDigest:manifest.build.binaryDigest},sourceHashes:hashes};const startupHash=sha(jsonBytes(startupRecord)),startupPath=`private/campaign-recovery/${startupHash}.json`;writeImmutable(join(root,startupPath),jsonBytes(startupRecord));appendEvent(root,'campaign-recovery-authorized',{recoveryHash:startupHash,recoveryPath:startupPath,originalAmendmentHash:startupRecord.originalAmendmentHash});
  const claim=appendEvent(root,'review-dispatch-claimed',{reviewId:reviewJob.id,stage:'decision',subjectId:reviewJob.subjectId,job:{jobId:'context-final',promptHash:reviewJob.promptHash}});appendEvent(root,'review-attempt-settled',{jobId:'context-final',status:'rejected',reason:contextFailureReason});stop('context-final');const pause=appendEvent(root,'pause',{reason:'campaign-driver-failed'}),boundary=appendEvent(root,'campaign-worker-stopped',{stop:'campaign-driver-failed'});
  const audit={schemaVersion:'trix-context-evidence-amendment-1.0.0',jobId:'context-final',claimHash:claim.hash,previousContextJobId:'startup-failed',previousInventoryHash:sha(jsonBytes(previousInventory)),newInventory:inventory,previousDigest:previousInventory.approvedDigests[0],actualDigest:inventory.approvedDigests[0],changes:[{index:1,source:'developer:memories.instructions',beforeSha256:'6'.repeat(64),afterSha256:'7'.repeat(64)}],evidenceHashes:{synthetic:'8'.repeat(64)},assessment:{changedContextReviewed:true,episodeSpecificFacts:false,otherSeatEvidence:false,hiddenFixtureMemory:false,summary:'Synthetic context fixture.',limitations:['Synthetic fixture, no model calls.']}};
  const bytes=jsonBytes({decisionId:reviewJob.subjectId,reasoning:'Exact preserved synthetic proposal.'}),proof={schemaVersion:'trix-context-response-proof-1.0.0',jobId:audit.jobId,claimHash:claim.hash,auditHash:sha(jsonBytes(audit)),previousDigest:audit.previousDigest,actualDigest:audit.actualDigest,responseHash:sha(bytes),threadId:'independent-reviewer',promptHash:reviewJob.promptHash,evidenceHashes:audit.evidenceHashes,viewPath:`private/context-replay/${audit.jobId}/${sha(jsonBytes(audit))}`};
  const checked={proof,bytes,receipt:{hostAgentId:proof.threadId,responseHash:proof.responseHash,requestedModel:'gpt-6-luna',requestedEffort:'max'},evidence:{available:true,baseContext:{digest:audit.actualDigest}},reviewJob};
  const collector={root,manifest,state(){const rows=readJournal(root);return {rows,paused:true,episode:null,pending:null,claimed:null,intent:null,commits:[],outcomes:[],reviews:rows.filter(row=>row.kind==='review-imported').map(row=>row.data)};}};
  const processingHashes={...hashes,'scripts/trix-scenario-collection/context-recovery.mjs':'9'.repeat(64)};
  const recovery={schemaVersion:'trix-context-recovery-1.0.0',runId:manifest.runId,createdAt:boundary.at,originalAmendmentHash:sha(jsonBytes(amendment)),startupRecoveryHash:startupHash,originalManifestHash:amendment.originalManifestHash,originalSourceDigest:amendment.originalSourceDigest,nativeBinaryDigest:amendment.nativeBinaryDigest,originalContextInventoryHash:amendment.originalContextInventoryHash,previousContextInventoryHash:amendment.currentContextInventoryHash,newContextInventoryHash:sha(jsonBytes(inventory)),auditRef:putBlob(root,audit),proof,previousBoundary:{sequence:boundary.sequence,hash:boundary.hash},failurePause:{sequence:pause.sequence,hash:pause.hash},processingBuild:{sourceDigest:sourceDigest(processingHashes),binaryDigest:manifest.build.binaryDigest},sourceHashes:processingHashes};
  const publish=()=>{const recoveryHash=sha(jsonBytes(recovery)),recoveryPath=`private/context-recovery/${recoveryHash}.json`;writeImmutable(join(root,recoveryPath),jsonBytes(recovery));const authorization=appendEvent(root,'context-recovery-authorized',{recoveryHash,recoveryPath,startupRecoveryHash:startupHash});return {recovery,recoveryHash,recoveryPath,authorization};};
  const historyOptions={amendment,startupRecovery:readLatestCampaignRecovery(collector),audit,expectedProof:proof,verifyContext:()=>checked,verifyPlayer(){},verifyReviewer(){},verifyFailure:()=>failureProof};
  return {root,collector,amendment,audit,checked,claim,firstClaim,recovery,inventory,originalInventory,previousInventory,reviewJob,proof,failureProof,publish,historyOptions,stop};
}

function metadataFixture(t) {
  const f=fixture(t),context=f.publish();
  appendEvent(f.root,'review-imported',{stage:'decision',subjectId:f.reviewJob.subjectId,reviewRef:putBlob(f.root,{synthetic:'previous context review already accepted'})});
  const reviewId='decision-reference',job={id:reviewId,stage:'decision',subjectId:'basic-solo-1:32:3'},bindings=[],claims=[];
  writeImmutable(join(f.root,'outbox/'+reviewId+'.json'),jsonBytes(job));
  const raw={rationaleStatus:'uncertain',checks:[{evidenceRefs:['actor:/publicPhaseAndTurn/handCounts/2'],explanation:'Exact original reasoning, including its factual limitation.'}],hypotheses:[],limitations:['Original quality limitation remains.']};
  const normalized=structuredClone(raw);normalized.checks[0].evidenceRefs[0]='actor:/handCounts/2';
  for(let i=0;i<2;i++){
    const jobId='reference-attempt-'+i,claim=appendEvent(f.root,'review-dispatch-claimed',{reviewId,stage:'decision',job:{jobId,promptHash:'b'.repeat(64)}});
    const response=i===0?{...raw,rationaleStatus:'forced'}:raw,bytes=jsonBytes(response);
    writeImmutable(join(f.root,'private/invocations/'+jobId+'/response.txt'),bytes);
    writeImmutable(join(f.root,'private/invocations/'+jobId+'/receipt.json'),jsonBytes({synthetic:true}));
    f.stop(jobId);
    const settled=appendEvent(f.root,'review-attempt-settled',{jobId,status:'rejected',reason:i===0?'Forced rationale status mismatch':'Actor evidence path does not resolve'});
    bindings.push({claimSequence:claim.sequence,claimHash:claim.hash,settlementSequence:settled.sequence,settlementHash:settled.hash,jobId});claims.push(claim);
  }
  const pause=appendEvent(f.root,'pause',{reason:'review-attempt-cap'}),boundary=appendEvent(f.root,'campaign-worker-stopped',{stop:'review-attempt-cap'});
  const normalization={schemaVersion:'trix-review-reference-normalization-1.0.0',changes:[{path:'/checks/0/evidenceRefs/0',from:'actor:/publicPhaseAndTurn/handCounts/2',to:'actor:/handCounts/2'}]};
  const proof={schemaVersion:'trix-reference-recovery-proof-1.0.0',reviewId,jobId:claims[1].data.job.jobId,claimHash:claims[1].hash,claimSequence:claims[1].sequence,rawResponseHash:sha(jsonBytes(raw)),normalizedProposalHash:sha(jsonBytes(normalized)),normalization,earlierRejected:[{jobId:claims[0].data.job.jobId,reason:'Forced rationale status mismatch'}]};
  const archiveSources=Object.fromEntries(Object.keys(context.recovery.sourceHashes).map(name=>[name,'Synthetic archive fixture: '+name]));
  archiveSources['scripts/trix-scenario-collection/metadata-recovery.mjs']='Synthetic metadata recovery V1 processor';
  archiveSources['scripts/trix-scenario-collection/reference-envelope.mjs']='Synthetic reference V1 normalizer';
  const hashes=Object.fromEntries(Object.entries(archiveSources).map(([name,text])=>[name,sha(Buffer.from(text))]));
  Object.assign(normalization,{normalizerSourceHash:hashes['scripts/trix-scenario-collection/reference-envelope.mjs'],originalSourceDigest:f.amendment.originalSourceDigest,nativeBinaryDigest:f.amendment.nativeBinaryDigest,reviewSourceDigest:sourceDigest(hashes)});
  const recovery={schemaVersion:'trix-metadata-recovery-1.0.0',runId:f.collector.manifest.runId,createdAt:boundary.at,originalAmendmentHash:sha(jsonBytes(f.amendment)),contextRecoveryHash:context.recoveryHash,originalManifestHash:f.amendment.originalManifestHash,originalSourceDigest:f.amendment.originalSourceDigest,nativeBinaryDigest:f.amendment.nativeBinaryDigest,contextInventoryHash:context.recovery.newContextInventoryHash,previousBoundary:{sequence:boundary.sequence,hash:boundary.hash},failurePause:{sequence:pause.sequence,hash:pause.hash},reviewId,claimBindings:bindings,proof,processingBuild:{sourceDigest:sourceDigest(hashes),binaryDigest:f.amendment.nativeBinaryDigest},sourceHashes:hashes};
  const archive=(record,texts=archiveSources)=>{const sourceRoot=join(f.root,'fixture-build-source',record.processingBuild.sourceDigest);for(const [name,text]of Object.entries(texts))writeImmutable(join(sourceRoot,name),Buffer.from(text));const binaryPath=join(sourceRoot,'native-fixture.bin');writeImmutable(binaryPath,Buffer.from('Synthetic archive native bytes'));return preserveBuild(f.root,sourceRoot,record.sourceHashes,record.processingBuild,binaryPath);};
  const publishMetadata=()=>{archive(recovery);const recoveryHash=sha(jsonBytes(recovery)),recoveryPath='private/metadata-recovery/'+recoveryHash+'.json';writeImmutable(join(f.root,recoveryPath),jsonBytes(recovery));const authorization=appendEvent(f.root,'metadata-recovery-authorized',{recoveryHash,recoveryPath,contextRecoveryHash:context.recoveryHash});return {recovery,recoveryHash,recoveryPath,authorization};};
  const selected={job,transport:claims[1].data.job,bytes:jsonBytes(raw),receipt:{synthetic:true},checked:{raw,normalized,normalization},proof,claimBindings:bindings};
  return {...f,context,metadata:recovery,publishMetadata,selected,raw,normalized,bindings,claims,archive,archiveSources};
}
function nextMetadataFixture(t,{operatorPause=false}={}) {
  const f=metadataFixture(t),previous=f.publishMetadata();
  appendEvent(f.root,'review-imported',{stage:'decision',subjectId:f.selected.job.subjectId,reviewRef:putBlob(f.root,f.normalized)});
  if(operatorPause)appendEvent(f.root,'pause',{reason:'operator-request'});
  const reviewId='decision-array-reference',job={id:reviewId,stage:'decision',subjectId:'basic-solo-1:34:1'},claims=[],claimBindings=[];
  writeImmutable(join(f.root,'outbox/'+reviewId+'.json'),jsonBytes(job));
  const raw={rationaleStatus:'uncertain',checks:[{evidenceRefs:['actor:/publicPhaseAndTurn/handCounts'],explanation:'Original whole-array reasoning remains unchanged.'}],missedOpportunity:null};
  const normalized=structuredClone(raw);normalized.checks[0].evidenceRefs[0]='actor:/handCounts';
  for(let i=0;i<2;i++){
    const jobId='array-reference-attempt-'+i,claim=appendEvent(f.root,'review-dispatch-claimed',{reviewId,stage:'decision',job:{jobId,promptHash:'b'.repeat(64)}});
    writeImmutable(join(f.root,'private/invocations/'+jobId+'/response.txt'),jsonBytes(raw));writeImmutable(join(f.root,'private/invocations/'+jobId+'/receipt.json'),jsonBytes({synthetic:true}));f.stop(jobId);
    const settlement=appendEvent(f.root,'review-attempt-settled',{jobId,status:'rejected',reason:'Actor evidence whole-array path does not resolve'});claims.push(claim);claimBindings.push({claimSequence:claim.sequence,claimHash:claim.hash,settlementSequence:settlement.sequence,settlementHash:settlement.hash,jobId});
  }
  const pause=appendEvent(f.root,'pause',{reason:'review-attempt-cap'}),boundary=appendEvent(f.root,'campaign-worker-stopped',{stop:'review-attempt-cap'});
  const archiveSources={...f.archiveSources,'scripts/trix-scenario-collection/metadata-recovery.mjs':'Synthetic metadata recovery V2 processor','scripts/trix-scenario-collection/reference-envelope.mjs':'Synthetic reference V2 whole-array normalizer'};
  const sourceHashes=Object.fromEntries(Object.entries(archiveSources).map(([name,text])=>[name,sha(Buffer.from(text))]));const processingBuild={sourceDigest:sourceDigest(sourceHashes),binaryDigest:f.amendment.nativeBinaryDigest};
  const normalization={schemaVersion:'trix-review-reference-normalization-1.0.0',changes:[{path:'/checks/0/evidenceRefs/0',from:'actor:/publicPhaseAndTurn/handCounts',to:'actor:/handCounts'}],normalizerSourceHash:sourceHashes['scripts/trix-scenario-collection/reference-envelope.mjs'],originalSourceDigest:f.amendment.originalSourceDigest,nativeBinaryDigest:f.amendment.nativeBinaryDigest,reviewSourceDigest:processingBuild.sourceDigest};
  const proof={schemaVersion:'trix-reference-recovery-proof-1.0.0',reviewId,jobId:claims[0].data.job.jobId,claimHash:claims[0].hash,claimSequence:claims[0].sequence,rawResponseHash:sha(jsonBytes(raw)),normalizedProposalHash:sha(jsonBytes(normalized)),normalization,earlierRejected:[]};
  const recovery={...f.metadata,schemaVersion:'trix-metadata-recovery-2.0.0',previousMetadataRecoveryHash:previous.recoveryHash,createdAt:boundary.at,previousBoundary:{sequence:boundary.sequence,hash:boundary.hash},failurePause:{sequence:pause.sequence,hash:pause.hash},reviewId,claimBindings,proof,sourceHashes,processingBuild};
  const publish=()=>{f.archive(recovery,archiveSources);const recoveryHash=sha(jsonBytes(recovery)),recoveryPath='private/metadata-recovery/'+recoveryHash+'.json';writeImmutable(join(f.root,recoveryPath),jsonBytes(recovery));const authorization=appendEvent(f.root,'metadata-recovery-authorized',{recoveryHash,recoveryPath,contextRecoveryHash:recovery.contextRecoveryHash});return {recovery,recoveryHash,recoveryPath,authorization};};
  const selected={job,transport:claims[0].data.job,bytes:jsonBytes(raw),receipt:{synthetic:true},checked:{raw,normalized,normalization},proof,claimBindings};
  return {...f,previous,next:recovery,publishNext:publish,selectedNext:selected,newRaw:raw,newNormalized:normalized,newClaims:claims};
}

function rationaleFixture(t) {
  const f=nextMetadataFixture(t),metadata=f.publishNext();
  appendEvent(f.root,'review-imported',{stage:'decision',subjectId:f.selectedNext.job.subjectId,reviewRef:putBlob(f.root,f.newNormalized)});
  const reviewId='decision-forced-rationale',subjectId='basic-solo-1:50:1',commitRef=putBlob(f.root,{decisionId:subjectId,forced:true}),packetRef=putBlob(f.root,{legalOptions:[{candidateId:'play:SQ'}]});
  const job={id:reviewId,stage:'decision',subjectId,decisionId:subjectId,commitRef,packetRef},claims=[],claimBindings=[];
  writeImmutable(join(f.root,'outbox/'+reviewId+'.json'),jsonBytes(job));
  const raw={decisionId:subjectId,rationaleStatus:'incorrect-fact',checks:[{id:'facts',explanation:'Original false factual rationale stays recorded.'}],missedOpportunity:null,hypotheses:[],limitations:['Model rationale quality is not certified.']};
  for(let i=0;i<2;i++){
    const jobId='forced-rationale-attempt-'+i,claim=appendEvent(f.root,'review-dispatch-claimed',{reviewId,stage:'decision',job:{jobId,promptHash:'b'.repeat(64)}});
    const response=i===0?raw:{...raw,limitations:['Second preserved raw rationale, not preferred.']};
    writeImmutable(join(f.root,'private/invocations/'+jobId+'/response.txt'),jsonBytes(response));writeImmutable(join(f.root,'private/invocations/'+jobId+'/receipt.json'),jsonBytes({synthetic:true}));f.stop(jobId);
    const settled=appendEvent(f.root,'review-attempt-settled',{jobId,status:'rejected',reason:'Forced rationale status mismatch'});claims.push(claim);claimBindings.push({claimSequence:claim.sequence,claimHash:claim.hash,settlementSequence:settled.sequence,settlementHash:settled.hash,jobId});
  }
  const pause=appendEvent(f.root,'pause',{reason:'review-attempt-cap'}),boundary=appendEvent(f.root,'campaign-worker-stopped',{stop:'review-attempt-cap'});
  const previousBuild=resolveBuild(f.root,metadata.recovery.sourceHashes,metadata.recovery.processingBuild);
  const texts=Object.fromEntries(Object.keys(metadata.recovery.sourceHashes).map(name=>[name,readFileSync(join(previousBuild.sourceRoot,name),'utf8')]));
  texts['scripts/trix-scenario-collection/campaign-driver.mjs']='Synthetic archived campaign driver';
  texts['scripts/trix-scenario-collection/forced-rationale-recovery.mjs']='Synthetic forced rationale recovery manager';
  texts['scripts/trix-scenario-collection/forced-rationale-policy.mjs']='Synthetic versioned forced rationale policy';
  const sourceHashes=Object.fromEntries(Object.entries(texts).map(([name,text])=>[name,sha(Buffer.from(text))])),processingBuild={sourceDigest:sourceDigest(sourceHashes),binaryDigest:f.amendment.nativeBinaryDigest},policySourceHash=sourceHashes['scripts/trix-scenario-collection/forced-rationale-policy.mjs'];
  const rationalePolicy={schemaVersion:'trix-forced-rationale-policy-application-1.0.0',policyVersion:forcedRationalePolicyVersion,policySourceHash,reviewId,decisionId:subjectId,transportJobId:claims[0].data.job.jobId,dispatchClaimHash:claims[0].hash,dispatchClaimSequence:claims[0].sequence,promptHash:'b'.repeat(64),packetRef,nativeForced:true,originalRationaleStatus:raw.rationaleStatus,acceptedRationaleStatus:raw.rationaleStatus,rawResponseHash:sha(jsonBytes(raw)),rawProposalHash:sha(jsonBytes(raw)),acceptedProposalHash:sha(jsonBytes(raw)),validationProjection:{field:'rationaleStatus',from:raw.rationaleStatus,to:'forced',validationOnly:true},originalSourceDigest:f.amendment.originalSourceDigest,nativeBinaryDigest:f.amendment.nativeBinaryDigest,reviewSourceDigest:processingBuild.sourceDigest};
  const proof={schemaVersion:'trix-forced-rationale-recovery-proof-1.0.0',reviewId,jobId:claims[0].data.job.jobId,claimHash:claims[0].hash,claimSequence:claims[0].sequence,rawResponseHash:sha(jsonBytes(raw)),rawProposalHash:sha(jsonBytes(raw)),acceptedProposalHash:sha(jsonBytes(raw)),policyVersion:forcedRationalePolicyVersion,policySourceHash,nativeForced:true,rationalePolicy,metadataNormalization:null,earlierRejected:[]};
  const recovery={schemaVersion:'trix-forced-rationale-recovery-1.0.0',runId:f.collector.manifest.runId,createdAt:boundary.at,originalAmendmentHash:sha(jsonBytes(f.amendment)),metadataRecoveryHash:metadata.recoveryHash,originalManifestHash:f.amendment.originalManifestHash,originalSourceDigest:f.amendment.originalSourceDigest,nativeBinaryDigest:f.amendment.nativeBinaryDigest,contextRecoveryHash:f.context.recoveryHash,contextInventoryHash:f.context.recovery.newContextInventoryHash,policyVersion:forcedRationalePolicyVersion,policySourceHash,previousBoundary:{sequence:boundary.sequence,hash:boundary.hash},failurePause:{sequence:pause.sequence,hash:pause.hash},reviewId,claimBindings,proof,processingBuild,sourceHashes};
  const publishRationale=()=>{f.archive(recovery,texts);const recoveryHash=sha(jsonBytes(recovery)),recoveryPath='private/forced-rationale-recovery/'+recoveryHash+'.json';writeImmutable(join(f.root,recoveryPath),jsonBytes(recovery));const authorization=appendEvent(f.root,'forced-rationale-recovery-authorized',{recoveryHash,recoveryPath,metadataRecoveryHash:metadata.recoveryHash});return {recovery,recoveryHash,recoveryPath,authorization};};
  const selected={job,transport:claims[0].data.job,bytes:jsonBytes(raw),receipt:{synthetic:true},checked:{raw,normalized:raw,accepted:raw,rationalePolicy},proof,claimBindings};
  const prior={amendment:f.amendment,metadataRecovery:metadata,contextRecovery:f.context,audit:f.audit};
  return {...f,metadata,policyRecovery:recovery,selectedRationale:selected,rationaleRaw:raw,rationaleClaims:claims,publishRationale,prior};
}


function gameFixture(t,{operatorPause=false}={}) {
  const f=rationaleFixture(t),rationale=f.publishRationale();
  const priorReviewRef=putBlob(f.root,f.rationaleRaw);
  appendEvent(f.root,'review-imported',{stage:'decision',subjectId:f.selectedRationale.job.subjectId,reviewRef:priorReviewRef,rationalePolicyRef:putBlob(f.root,f.selectedRationale.checked.rationalePolicy)});
  if(operatorPause)appendEvent(f.root,'pause',{reason:'operator-request'});
  const reviewId='game-pending',episodeId='basic-solo-1',frozenDecisionReviewDigest=sha(jsonBytes([f.rationaleRaw])),outcomeRef=putBlob(f.root,{episodeId,tricks:Array.from({length:13},()=>({})),scoreTotals:[0,0,0,0]});
  const job={id:reviewId,stage:'game',subjectId:episodeId,episodeId,frozenDecisionReviewDigest,outcomeRef,promptHash:'b'.repeat(64)},claims=[],claimBindings=[];
  writeImmutable(join(f.root,'outbox/'+reviewId+'.json'),jsonBytes(job));
  const raw={episodeId,seatSummaries:[{actor:1,reviewedDecisions:13,correctionDecisionIds:[f.selectedRationale.job.subjectId],assessment:'Original explanation criticism remains recorded.'}],supportedMissedOpportunityRefs:[],usefulPatternRefs:[f.selectedRationale.job.subjectId],counterexampleRefs:[],explanationIssueCounts:{'incorrect-fact':1},limitations:['Model explanation flag is not a proven winning correction.']};
  for(let i=0;i<2;i++){
    const jobId='game-attempt-'+i,claim=appendEvent(f.root,'review-dispatch-claimed',{reviewId,stage:'game',job:{jobId,promptHash:job.promptHash}}),response=i===0?raw:{...raw,limitations:['Second preserved game rationale, not preferred.']};
    writeImmutable(join(f.root,'private/invocations/'+jobId+'/response.txt'),jsonBytes(response));writeImmutable(join(f.root,'private/invocations/'+jobId+'/receipt.json'),jsonBytes({synthetic:true}));f.stop(jobId);
    const settled=appendEvent(f.root,'review-attempt-settled',{jobId,status:'rejected',reason:'Unverified seat correction'});claims.push(claim);claimBindings.push({claimSequence:claim.sequence,claimHash:claim.hash,settlementSequence:settled.sequence,settlementHash:settled.hash,jobId});
  }
  const pause=appendEvent(f.root,'pause',{reason:'review-attempt-cap'}),boundary=appendEvent(f.root,'campaign-worker-stopped',{stop:'review-attempt-cap'});
  const previousBuild=resolveBuild(f.root,rationale.recovery.sourceHashes,rationale.recovery.processingBuild),texts=Object.fromEntries(Object.keys(rationale.recovery.sourceHashes).map(name=>[name,readFileSync(join(previousBuild.sourceRoot,name),'utf8')]));
  texts['scripts/trix-scenario-collection/game-review-recovery.mjs']='Synthetic game recovery manager';texts['scripts/trix-scenario-collection/game-review-classification.mjs']='Synthetic game explanation reference classifier';
  const sourceHashes=Object.fromEntries(Object.entries(texts).map(([name,text])=>[name,sha(Buffer.from(text))])),processingBuild={sourceDigest:sourceDigest(sourceHashes),binaryDigest:f.amendment.nativeBinaryDigest},classificationSourceHash=sourceHashes['scripts/trix-scenario-collection/game-review-classification.mjs'];
  const gameProcessingAudit={originalSourceDigest:f.amendment.originalSourceDigest,nativeBinaryDigest:f.amendment.nativeBinaryDigest,reviewSourceDigest:processingBuild.sourceDigest},oldProcessingAudit={...gameProcessingAudit,reviewSourceDigest:rationale.recovery.processingBuild.sourceDigest};
  const projected=structuredClone(raw);projected.seatSummaries[0].correctionDecisionIds=[];const accepted={...projected,frozenDecisionReviewDigest};
  const classification={schemaVersion:'trix-game-review-reference-classification-1.0.0',classificationVersion:gameReviewClassificationVersion,classificationSourceHash,reviewId,episodeId,transportJobId:claims[0].data.job.jobId,dispatchClaimHash:claims[0].hash,dispatchClaimSequence:claims[0].sequence,promptHash:job.promptHash,outcomeRef,frozenDecisionReviewDigest,rawResponseHash:sha(jsonBytes(raw)),rawProposalHash:sha(jsonBytes(raw)),acceptedProposalHash:sha(jsonBytes(accepted)),removedReferences:[{path:'/seatSummaries/0/correctionDecisionIds/0',actor:1,decisionId:f.selectedRationale.job.subjectId,frozenReviewRef:priorReviewRef,classification:'model-reported-unverified-explanation-flag',winningCorrectionSupported:false,originalRationaleStatus:'incorrect-fact',explanationIssueCount:1,issueCheckIds:['facts']}],...gameProcessingAudit};
  const proof={schemaVersion:'trix-game-review-recovery-proof-1.0.0',reviewId,jobId:claims[0].data.job.jobId,claimHash:claims[0].hash,claimSequence:claims[0].sequence,rawResponseHash:classification.rawResponseHash,rawProposalHash:classification.rawProposalHash,acceptedProposalHash:classification.acceptedProposalHash,classificationVersion:gameReviewClassificationVersion,classificationSourceHash,classification,earlierRejected:[]};
  const forcedPolicyDelegation={recoveryHash:rationale.recoveryHash,policyVersion:rationale.recovery.policyVersion,policySourceHash:rationale.recovery.policySourceHash,processingBuild:rationale.recovery.processingBuild,processingAudit:oldProcessingAudit},driverFile='scripts/trix-scenario-collection/campaign-driver.mjs',baseDriverDelegation={sourceFile:driverFile,sourceHash:rationale.recovery.sourceHashes[driverFile],processingBuild:rationale.recovery.processingBuild,processingAudit:oldProcessingAudit};
  const recovery={schemaVersion:'trix-game-review-recovery-1.0.0',runId:f.collector.manifest.runId,createdAt:boundary.at,originalAmendmentHash:sha(jsonBytes(f.amendment)),rationaleRecoveryHash:rationale.recoveryHash,originalManifestHash:f.amendment.originalManifestHash,originalSourceDigest:f.amendment.originalSourceDigest,nativeBinaryDigest:f.amendment.nativeBinaryDigest,contextRecoveryHash:f.context.recoveryHash,contextInventoryHash:f.context.recovery.newContextInventoryHash,classificationVersion:gameReviewClassificationVersion,classificationSourceHash,forcedPolicyDelegation,baseDriverDelegation,previousBoundary:{sequence:boundary.sequence,hash:boundary.hash},failurePause:{sequence:pause.sequence,hash:pause.hash},reviewId,claimBindings,proof,processingBuild,sourceHashes};
  const publishGame=()=>{f.archive(recovery,texts);const recoveryHash=sha(jsonBytes(recovery)),recoveryPath='private/game-review-recovery/'+recoveryHash+'.json';writeImmutable(join(f.root,recoveryPath),jsonBytes(recovery));const authorization=appendEvent(f.root,'game-review-recovery-authorized',{recoveryHash,recoveryPath,rationaleRecoveryHash:rationale.recoveryHash});return {recovery,recoveryHash,recoveryPath,authorization};};
  const selected={job,transport:claims[0].data.job,bytes:jsonBytes(raw),receipt:{synthetic:true},checked:{raw,projected,accepted,classification},proof,claimBindings};
  const prior={amendment:f.amendment,rationaleRecovery:rationale,contextRecovery:f.context,audit:f.audit};
  return {...f,rationale,gameRecovery:recovery,gameRaw:raw,gameAccepted:accepted,gameClaims:claims,gameSelected:selected,publishGame,prior,gameProcessingAudit,oldProcessingAudit};
}

test('game recovery appends above forced recovery and keeps its archived policy and receipts unchanged',t=>{
  const f=gameFixture(t),before=readJournal(f.root),oldBytes=readFileSync(join(f.root,f.rationale.recoveryPath)),latest=f.publishGame();
  assert.deepEqual(readLatestGameReviewRecovery(f.collector),latest);assert.deepEqual(readJournal(f.root).slice(0,before.length),before);assert.ok(oldBytes.equals(readFileSync(join(f.root,f.rationale.recoveryPath))));
  assert.deepEqual(readLatestRationaleRecovery(f.collector),f.rationale);const active=gameReviewRecoveryFacade(f.collector,latest);assert.equal(active.state().paused,false);assert.deepEqual(active.executionPolicy,{maxActiveSegmentWallMs:null,selectionDeferred:true});assert.throws(()=>active.resume(),/legacy/);
});

test('zero-call proof check binds earliest saved response and both consumed attempts without writes',t=>{
  const f=gameFixture(t),latest=f.publishGame(),active=gameReviewRecoveryFacade(f.collector,latest),before=readJournal(f.root);let checks=0;
  assert.deepEqual(verifyGameReviewSavedResponse(active,latest,{verifyGame(_c,id){checks++;assert.equal(id,f.gameRecovery.reviewId);return f.gameSelected;}}),f.gameSelected);assert.equal(checks,1);assert.deepEqual(readJournal(f.root),before);
  const preferred={...f.gameSelected,proof:{...f.gameSelected.proof,jobId:f.gameClaims[1].data.job.jobId}};assert.throws(()=>verifyGameReviewSavedResponse(active,latest,{verifyGame:()=>preferred}),/proof changed/);
});

test('saved game import preserves original text and grades and never makes a third claim',t=>{
  const f=gameFixture(t),latest=f.publishGame(),active=gameReviewRecoveryFacade(f.collector,latest),rawPath=join(f.root,'private/invocations/'+f.gameSelected.proof.jobId+'/response.txt'),before=readFileSync(rawPath);let imports=0;
  const importGame=(c,selected)=>withRunLock(c.root,()=>{const state=c.state(),old=state.reviews.find(r=>r.stage==='game'&&r.subjectId===selected.job.subjectId);if(old)return old;imports++;assert.deepEqual(selected.checked.accepted,f.gameAccepted);const result={stage:'game',subjectId:selected.job.subjectId,reviewRef:putBlob(c.root,selected.checked.accepted),originalRef:putBlob(c.root,selected.checked.raw),gameReviewClassificationRef:putBlob(c.root,selected.checked.classification)};appendEvent(c.root,'review-imported',result);return result;});
  importGameReviewSavedReview(active,latest,f.gameSelected,{importGame});importGameReviewSavedReview(active,latest,f.gameSelected,{importGame});assert.equal(imports,1);assert.ok(before.equals(readFileSync(rawPath)));assert.equal(active.state().rows.filter(r=>r.kind==='review-dispatch-claimed'&&r.data.reviewId===f.gameRecovery.reviewId).length,2);assert.equal(active.state().reviews.filter(r=>r.subjectId===f.selectedRationale.job.subjectId).length,1);assert.equal(active.state().rows.filter(r=>r.kind==='game-review-saved-admitted').length,1);
});

test('later operator pauses stop game import before and within its owner lock',t=>{
  const f=gameFixture(t),latest=f.publishGame(),active=gameReviewRecoveryFacade(f.collector,latest);appendEvent(f.root,'pause',{reason:'operator-request'});assert.equal(active.state().paused,true);assert.throws(()=>importGameReviewSavedReview(active,latest,f.gameSelected,{importGame(){throw Error('Must not import');}}),/Later pause/);
  const g=gameFixture(t),saved=g.publishGame(),running=gameReviewRecoveryFacade(g.collector,saved);assert.throws(()=>importGameReviewSavedReview(running,saved,g.gameSelected,{importGame(c){appendEvent(c.root,'pause',{reason:'operator-request'});return withRunLock(c.root,()=>c.state());}}),/Later pause/);
  const h=gameFixture(t,{operatorPause:true});assert.throws(()=>validateGameReviewRecovery(h.collector,h.gameRecovery,h.prior),/Operator or unrelated pause/);
});

test('game projection rejects text/grade changes, processor confusion and predecessor drift',t=>{
  const f=gameFixture(t);assert.doesNotThrow(()=>validateGameReviewRecovery(f.collector,f.gameRecovery,f.prior));
  for(const mutate of [
    r=>r.forcedPolicyDelegation.processingAudit.reviewSourceDigest=r.processingBuild.sourceDigest,
    r=>r.baseDriverDelegation.processingAudit.reviewSourceDigest=r.processingBuild.sourceDigest,
    r=>r.sourceHashes['scripts/trix-scenario-collection/forced-rationale-policy.mjs']='a'.repeat(64),
    r=>r.rationaleRecoveryHash='a'.repeat(64),
    r=>r.classificationSourceHash='a'.repeat(64),
    r=>r.proof.classification.reviewSourceDigest=r.forcedPolicyDelegation.processingAudit.reviewSourceDigest,
    r=>r.proof.classification.removedReferences[0].winningCorrectionSupported=true,
    r=>r.proof.classification.removedReferences[0].actor=2,
    r=>r.proof.acceptedProposalHash=sha(jsonBytes({...f.gameAccepted,limitations:['rewritten']})),
  ]){const changed=structuredClone(f.gameRecovery);mutate(changed);assert.throws(()=>validateGameReviewRecovery(f.collector,changed,f.prior));}
});

test('runtime imports prior archived driver/policy and separates new game audit',async t=>{
  const f=gameFixture(t),latest=f.publishGame(),calls=[],oldBuild=resolveBuild(f.root,f.rationale.recovery.sourceHashes,f.rationale.recovery.processingBuild),baseApi={validateDecisionProposal:()=>{},validateGameProposal:()=>{},validateSavedContent(){calls.push('decision-preflight');},importHostReview(){calls.push('decision-import');},importNormalizedHostReview(){calls.push('decision-normalized');}};
  const runFullCampaign=()=>{throw Error('No campaign or model calls permitted in this test');};
  const importModule=async url=>{
    assert.ok(url.startsWith(new URL('file:///'+oldBuild.sourceRoot.replaceAll('\\','/')+'/').href));
    if(url.endsWith('reference-envelope.mjs'))return {wrapReferenceDriverApis(api,{processingAudit}){assert.deepEqual(processingAudit,f.oldProcessingAudit);return api;}};
    if(url.endsWith('forced-rationale-policy.mjs'))return {forcedRationalePolicyVersion:f.rationale.recovery.policyVersion,forcedRationalePolicySourceHash:f.rationale.recovery.policySourceHash,wrapForcedRationaleApis(api,{processingAudit}){assert.deepEqual(processingAudit,f.oldProcessingAudit);return api;}};
    assert.ok(url.endsWith('campaign-driver.mjs'));return {runFullCampaign};
  };
  const runtime=await buildGameReviewRecoveryApis(f.collector,f.prior,baseApi,{gameProcessingAudit:f.gameProcessingAudit,importModule});assert.equal(runtime.runFullCampaign,runFullCampaign);assert.deepEqual(runtime.processingAudit,f.oldProcessingAudit);assert.notEqual(runtime.processingAudit.reviewSourceDigest,runtime.gameProcessingAudit.reviewSourceDigest);assert.deepEqual(runtime.forcedPolicyDelegation,latest.recovery.forcedPolicyDelegation);assert.deepEqual(runtime.baseDriverDelegation,latest.recovery.baseDriverDelegation);
  runtime.api.validateSavedContent(f.collector,{stage:'decision'});runtime.api.importHostReview(f.collector,{stage:'decision'});runtime.api.importNormalizedHostReview(f.collector,{stage:'decision'});assert.deepEqual(calls,['decision-preflight','decision-import','decision-normalized']);
  await assert.rejects(()=>buildGameReviewRecoveryApis(f.collector,f.prior,baseApi,{gameProcessingAudit:f.gameProcessingAudit,importModule:async url=>url.endsWith('forced-rationale-policy.mjs')?{forcedRationalePolicyVersion:f.rationale.recovery.policyVersion,forcedRationalePolicySourceHash:'a'.repeat(64)}:importModule(url)}),/Archived forced policy source/);
});

test('third claims, changed raw evidence, predecessor tampering and legacy resume fail closed',t=>{
  const f=gameFixture(t),latest=f.publishGame();appendEvent(f.root,'review-dispatch-claimed',{reviewId:f.gameRecovery.reviewId,stage:'game',job:{jobId:'third-attempt'}});assert.throws(()=>verifyGameReviewSavedResponse(f.collector,latest,{verifyGame(){throw Error('Must not verify third attempt');}}),/third attempt/);
  const g=gameFixture(t);g.publishGame();writeFileSync(join(g.root,'private/invocations/'+g.gameSelected.proof.jobId+'/response.txt'),'changed raw');assert.throws(()=>readLatestGameReviewRecovery(g.collector));
  const h=gameFixture(t);h.publishGame();writeFileSync(join(h.root,h.rationale.recoveryPath),jsonBytes({...h.rationale.recovery,reviewId:'changed predecessor'}));assert.throws(()=>readLatestGameReviewRecovery(h.collector),/record changed/);
  const i=gameFixture(t),saved=i.publishGame(),active=gameReviewRecoveryFacade(i.collector,saved);appendEvent(i.root,'resume',{});assert.throws(()=>active.state(),/Legacy resume/);
});
