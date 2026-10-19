import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { importMetadataSavedReview, metadataRecoveryFacade, readLatestMetadataRecovery, validateMetadataRecovery, verifyMetadataSavedResponse } from '../../scripts/trix-scenario-collection/metadata-recovery.mjs';
import { amendmentPath, campaignInventoryPath } from '../../scripts/trix-scenario-collection/campaign-continuation.mjs';
import { readLatestCampaignRecovery } from '../../scripts/trix-scenario-collection/campaign-recovery.mjs';
import { contextFailureReason } from '../../scripts/trix-scenario-collection/context-evidence.mjs';
import { appendEvent, getBlob, jsonBytes, putBlob, readJournal, sha, withRunLock, writeImmutable } from '../../scripts/trix-scenario-collection/journal.mjs';
import { preserveBuild, sourceDigest } from '../../scripts/coach-lab-builds.mjs';

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

test('metadata authorization preserves prior layers and both consumed attempts',t=>{
  const f=metadataFixture(t),before=readJournal(f.root),original=readFileSync(join(f.root,'manifest.json')),oldAmendment=readFileSync(join(f.root,amendmentPath)),latest=f.publishMetadata();
  assert.deepEqual(readLatestMetadataRecovery(f.collector),latest);assert.deepEqual(readJournal(f.root).slice(0,before.length),before);
  const active=metadataRecoveryFacade(f.collector,latest);assert.equal(active.state().paused,false);assert.deepEqual(active.executionPolicy,{maxActiveSegmentWallMs:null,selectionDeferred:true});assert.equal(active.state().rows.filter(r=>r.kind==='review-dispatch-claimed'&&r.data.reviewId===latest.recovery.reviewId).length,2);
  assert.ok(original.equals(readFileSync(join(f.root,'manifest.json'))));assert.ok(oldAmendment.equals(readFileSync(join(f.root,amendmentPath))));assert.throws(()=>active.resume(),/legacy/);
});

test('saved metadata admission verifies exact proof and chronology without imports or calls',t=>{
  const f=metadataFixture(t),latest=f.publishMetadata(),active=metadataRecoveryFacade(f.collector,latest),before=readJournal(f.root);let checks=0;
  assert.deepEqual(verifyMetadataSavedResponse(active,latest,{verifyReference(_c,id){checks++;assert.equal(id,f.metadata.reviewId);return f.selected;}}),f.selected);
  assert.equal(checks,1);assert.deepEqual(readJournal(f.root),before);
  assert.throws(()=>verifyMetadataSavedResponse(active,latest,{verifyReference:()=>({...f.selected,proof:{...f.selected.proof,normalizedProposalHash:'a'.repeat(64)}})}),/proof changed/);
  assert.throws(()=>verifyMetadataSavedResponse(active,latest,{verifyReference:()=>({...f.selected,claimBindings:[...f.bindings].reverse()})}),/chronology changed/);
});

test('reference projection preserves all prose and grades, imports once and never adds a third claim',t=>{
  const f=metadataFixture(t),latest=f.publishMetadata(),active=metadataRecoveryFacade(f.collector,latest),responsePath=join(f.root,'private/invocations/'+f.selected.proof.jobId+'/response.txt'),before=readFileSync(responsePath);let imports=0;
  const importReference=(c,selected)=>withRunLock(c.root,()=>{const state=c.state(),existing=state.reviews.find(r=>r.subjectId===selected.job.subjectId);if(existing)return existing;imports++;const accepted=structuredClone(selected.checked.normalized),restored=structuredClone(accepted);restored.checks[0].evidenceRefs[0]=selected.checked.raw.checks[0].evidenceRefs[0];assert.deepEqual(restored,f.raw);const result={stage:'decision',subjectId:selected.job.subjectId,reviewRef:putBlob(c.root,accepted),originalRef:putBlob(c.root,selected.checked.raw)};appendEvent(c.root,'review-imported',result);return result;});
  importMetadataSavedReview(active,latest,f.selected,{importReference});importMetadataSavedReview(active,latest,f.selected,{importReference});
  assert.equal(imports,1);assert.equal(active.state().rows.filter(r=>r.kind==='metadata-review-saved-admitted').length,1);assert.equal(active.state().rows.filter(r=>r.kind==='review-dispatch-claimed'&&r.data.reviewId===f.metadata.reviewId).length,2);assert.ok(before.equals(readFileSync(responsePath)));
});

test('later operator pause blocks imports and remains effective across facade reconstruction',t=>{
  const f=metadataFixture(t),latest=f.publishMetadata(),active=metadataRecoveryFacade(f.collector,latest);appendEvent(f.root,'pause',{reason:'operator-request'});
  assert.equal(active.state().paused,true);assert.equal(metadataRecoveryFacade(f.collector,latest).state().paused,true);assert.throws(()=>importMetadataSavedReview(active,latest,f.selected,{importReference(){throw Error('Must not import');}}),/Later pause/);
  const g=metadataFixture(t),authorized=g.publishMetadata(),running=metadataRecoveryFacade(g.collector,authorized);assert.throws(()=>importMetadataSavedReview(running,authorized,g.selected,{importReference(c){appendEvent(c.root,'pause',{reason:'operator-request'});return withRunLock(c.root,()=>c.state());}}),/Later pause/);
});

test('new target claims, changed raw responses and metadata tampering fail admission',t=>{
  const f=metadataFixture(t),latest=f.publishMetadata();appendEvent(f.root,'review-dispatch-claimed',{reviewId:f.metadata.reviewId,stage:'decision',job:{jobId:'third-attempt'}});
  assert.throws(()=>verifyMetadataSavedResponse(f.collector,latest,{verifyReference(){throw Error('Must not verify after new claim');}}),/third attempt/);
  const g=metadataFixture(t),valid=g.publishMetadata();writeFileSync(join(g.root,'private/invocations/'+g.selected.proof.jobId+'/response.txt'),'changed original');assert.throws(()=>readLatestMetadataRecovery(g.collector),/response changed/);
  const h=metadataFixture(t),saved=h.publishMetadata();writeFileSync(join(h.root,saved.recoveryPath),jsonBytes({...saved.recovery,nativeBinaryDigest:'a'.repeat(64)}));assert.throws(()=>readLatestMetadataRecovery(h.collector),/record changed/);
});

test('only the second selected claim and exact cap boundary can be authorized',t=>{
  const f=metadataFixture(t),prior={amendment:f.amendment,contextRecovery:f.context,audit:f.audit};
  const first=structuredClone(f.metadata);first.proof.jobId=f.claims[0].data.job.jobId;first.proof.claimHash=f.claims[0].hash;first.proof.claimSequence=f.claims[0].sequence;
  assert.throws(()=>validateMetadataRecovery(f.collector,first,prior));
  const changed=structuredClone(f.metadata);changed.claimBindings[0].settlementHash='a'.repeat(64);assert.throws(()=>validateMetadataRecovery(f.collector,changed,prior));
  const operator=structuredClone(f.metadata);operator.failurePause.hash='a'.repeat(64);assert.throws(()=>validateMetadataRecovery(f.collector,operator,prior));
});

test('reference normalization binds exact frozen source bytes and all three processing pins',t=>{
  const f=metadataFixture(t),prior={amendment:f.amendment,contextRecovery:f.context,audit:f.audit};
  assert.doesNotThrow(()=>validateMetadataRecovery(f.collector,f.metadata,prior));
  for(const field of ['normalizerSourceHash','originalSourceDigest','nativeBinaryDigest','reviewSourceDigest']){
    const changed=structuredClone(f.metadata);changed.proof.normalization[field]='a'.repeat(64);
    assert.throws(()=>validateMetadataRecovery(f.collector,changed,prior),/frozen/);
  }
});

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

test('V2 appends an immutable chain and preserves V1 processor and narrower proof',t=>{
  const f=nextMetadataFixture(t),oldBytes=readFileSync(join(f.root,f.previous.recoveryPath)),before=readJournal(f.root),latest=f.publishNext();
  assert.deepEqual(readLatestMetadataRecovery(f.collector),latest);assert.deepEqual(readJournal(f.root).slice(0,before.length),before);assert.ok(oldBytes.equals(readFileSync(join(f.root,f.previous.recoveryPath))));
  assert.notEqual(latest.recovery.proof.normalization.normalizerSourceHash,f.previous.recovery.proof.normalization.normalizerSourceHash);
  assert.equal(f.previous.recovery.proof.jobId,f.claims[1].data.job.jobId);assert.equal(latest.recovery.proof.jobId,f.newClaims[0].data.job.jobId);
  const active=metadataRecoveryFacade(f.collector,latest);assert.equal(active.state().paused,false);appendEvent(f.root,'pause',{reason:'operator-request'});assert.equal(active.state().paused,true);
});

test('V2 admits the earliest eligible first response without another call or reimporting V1',t=>{
  const f=nextMetadataFixture(t),latest=f.publishNext(),active=metadataRecoveryFacade(f.collector,latest),before=readJournal(f.root);let checks=0,imports=0;
  const selected=verifyMetadataSavedResponse(active,latest,{verifyReference(_collector,reviewId){checks++;assert.equal(reviewId,f.next.reviewId);return f.selectedNext;}});assert.deepEqual(readJournal(f.root),before);assert.equal(checks,1);
  importMetadataSavedReview(active,latest,selected,{importReference(c,chosen){return withRunLock(c.root,()=>{c.state();imports++;assert.equal(chosen.job.id,f.next.reviewId);assert.equal(chosen.transport.jobId,f.newClaims[0].data.job.jobId);const result={stage:'decision',subjectId:chosen.job.subjectId,reviewRef:putBlob(c.root,chosen.checked.normalized)};appendEvent(c.root,'review-imported',result);return result;});}});
  assert.equal(imports,1);assert.equal(active.state().reviews.filter(r=>r.subjectId===f.selected.job.subjectId).length,1);assert.equal(active.state().rows.filter(r=>r.kind==='review-dispatch-claimed'&&r.data.reviewId===f.next.reviewId).length,2);
  const preferred={...f.selectedNext,proof:{...f.next.proof,jobId:f.newClaims[1].data.job.jobId,claimHash:f.newClaims[1].hash,claimSequence:f.newClaims[1].sequence}};
  assert.throws(()=>verifyMetadataSavedResponse(active,latest,{verifyReference:()=>preferred}),/proof changed/);
});

test('V2 rejects orphan, cyclic, duplicate and changed predecessor records',t=>{
  const f=nextMetadataFixture(t),prior={amendment:f.amendment,contextRecovery:f.context,audit:f.audit};assert.throws(()=>validateMetadataRecovery(f.collector,f.next,prior),/predecessor/);
  for(const hash of [null,'a'.repeat(64),sha(jsonBytes(f.next))]){const changed=structuredClone(f.next);changed.previousMetadataRecoveryHash=hash;assert.throws(()=>validateMetadataRecovery(f.collector,changed,prior,f.previous),/predecessor/);}
  const latest=f.publishNext();appendEvent(f.root,'metadata-recovery-authorized',{recoveryHash:latest.recoveryHash,recoveryPath:latest.recoveryPath,contextRecoveryHash:latest.recovery.contextRecoveryHash});assert.throws(()=>readLatestMetadataRecovery(f.collector),/Duplicate|cyclic/);
  const g=nextMetadataFixture(t);g.publishNext();writeFileSync(join(g.root,g.previous.recoveryPath),jsonBytes({...g.previous.recovery,reviewId:'changed-original-target'}));assert.throws(()=>readLatestMetadataRecovery(g.collector),/record changed/);
});

test('V2 rejects operator pauses and modified historical archived normalizer bytes',t=>{
  const f=nextMetadataFixture(t,{operatorPause:true});f.publishNext();assert.throws(()=>readLatestMetadataRecovery(f.collector),/Operator|unrelated pause/);
  const g=nextMetadataFixture(t);g.publishNext();const archived=g.archive(g.previous.recovery);writeFileSync(join(archived.sourceRoot,'scripts/trix-scenario-collection/reference-envelope.mjs'),'changed old normalizer');assert.throws(()=>readLatestMetadataRecovery(g.collector),/Frozen source changed/);
});

