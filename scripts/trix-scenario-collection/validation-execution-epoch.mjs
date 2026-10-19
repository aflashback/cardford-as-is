// Additive execution provenance. Original host, native, content and receipt gates remain authoritative.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {getBlob,jsonBytes,readJournal,safePath,sha,writeImmutable} from './journal.mjs';
import {assertValidationExecutionState,readLatestValidationExecutionAmendment,withValidationExecutionOwnerLock,readExecutionArtifact,executionArtifact,inventoryExecutionDirectory} from './validation-execution-amendment.mjs';

export const validationExecutionInvocationVersion='trix-validation-execution-invocation-1.0.0';
export const validationExecutionEpochVersion='trix-validation-execution-epoch-1.0.0';
const bind=r=>({sequence:r.sequence,hash:r.hash});
const one=(rows,p,label)=>{const found=rows.filter(p);assert.equal(found.length,1,'Missing or ambiguous '+label);return found[0];};
const sync=v=>{assert.ok(!v||typeof v.then!=='function','Epoch validation must be synchronous');return v;};
const read=(c,path)=>JSON.parse(readFileSync(safePath(c.root,path)));
const jobIdFor=claim=>claim.kind==='review-dispatch-claimed'?claim.data.job.jobId:claim.data.jobId;
const originalBinding=r=>({recoveryHash:r.recoveryHash,recoveryPath:r.recoveryPath,authorization:r.authorization,processingBuild:r.processingBuild});
const markerPath=jobId=>{assert.match(jobId,/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);return'private/invocations/'+jobId+'/private/validation-execution.json';};

export function validationExecutionClaimJob(state,jobId){
  const claim=one(state.rows,r=>['dispatch-claimed','review-dispatch-claimed'].includes(r.kind)&&jobIdFor(r)===jobId,'physical invocation claim');
  const job=claim.kind==='review-dispatch-claimed'?claim.data.job:{...one(state.rows,r=>r.kind==='job-prepared'&&r.data.jobId===jobId&&r.sequence<claim.sequence,'original player job').data,...claim.data};
  assert.equal(job.jobId,jobId);assert.ok(typeof job.dispatchToken==='string'&&job.dispatchToken.length>0);
  const start=Date.parse(job.claimedAt),end=Date.parse(job.deadlineAt);assert.ok(Number.isFinite(start)&&Number.isFinite(end));assert.equal(end-start,300000,'Original absolute invocation deadline changed');
  return{claim,job};
}
function invocationValue(c,latest,claim,job){
  const r=latest.amendment;assert.ok(claim.sequence>latest.authorization.sequence,'Only new epoch claims have execution provenance');
  const review=claim.kind==='review-dispatch-claimed',outboxPath='outbox/'+(review?claim.data.reviewId:job.jobId)+'.json',outbox=read(c,outboxPath);
  if(review){assert.equal(outbox.id,claim.data.reviewId);assert.equal(outbox.stage,claim.data.stage);assert.equal(outbox.promptHash,job.promptHash);assert.deepEqual(outbox.promptRef,job.promptRef);}
  else for(const [key,value]of Object.entries(outbox))assert.deepEqual(job[key],value,'Original prepared player job changed');
  return{schemaVersion:validationExecutionInvocationVersion,runId:r.runId,amendmentHash:latest.amendmentHash,authorization:bind(latest.authorization),originalRecoveryDelegation:originalBinding(r.originalRecoveryDelegation),executionBuild:r.processingBuild,sourceReviewRef:r.evidence.sourceReviewRef,helperPins:r.helperPins,nodeExecutable:r.nodeExecutable,hostExecutable:r.hostExecutable,runtimeIdentity:r.runtimeIdentity,claim:bind(claim),kind:claim.kind,jobId:job.jobId,jobHash:sha(jsonBytes(job)),outboxRef:executionArtifact(c.root,outboxPath),claimedAt:job.claimedAt,deadlineAt:job.deadlineAt};
}
function current(c,latest,validateCurrent){
  assert.equal(typeof validateCurrent,'function','Fresh current-input verifier required');
  const verified=sync(validateCurrent(c));assert.ok(Array.isArray(verified?.state?.rows),'Exact current state required');
  assert.deepEqual(readLatestValidationExecutionAmendment(c),latest,'Execution authority changed');
  assertValidationExecutionState(c,latest,verified.state);assert.deepEqual(verified.state.rows,readJournal(c.root),'Physical head changed during epoch verification');
  return verified.state;
}
export function bindValidationExecutionInvocation(c,job,latest,{validateCurrent}={}){
  return withValidationExecutionOwnerLock(c.root,()=>{
    const state=current(c,latest,validateCurrent),selected=validationExecutionClaimJob(state,job.jobId);assert.deepEqual(job,selected.job,'Dispatch job differs from physical claim');
    assert.ok(Date.now()<Date.parse(job.deadlineAt),'Original invocation deadline elapsed');
    assert.ok(!state.rows.some(r=>r.sequence>selected.claim.sequence&&['move-committed','attempt-settled','review-attempt-settled'].includes(r.kind)&&r.data.jobId===job.jobId),'Settled call cannot bind a new dispatch marker');
    const value=invocationValue(c,latest,selected.claim,job),path=markerPath(job.jobId);writeImmutable(safePath(c.root,path),jsonBytes(value));return{path,sha256:sha(jsonBytes(value))};
  });
}
export function assertValidationExecutionInvocation(c,jobId,latest,{state=c.state(),inspectOriginal}={}){
  assert.deepEqual(readLatestValidationExecutionAmendment(c),latest,'Execution authority changed');assertValidationExecutionState(c,latest,state);
  const {claim,job}=validationExecutionClaimJob(state,jobId),path=markerPath(jobId),bytes=readFileSync(safePath(c.root,path)),expected=invocationValue(c,latest,claim,job);
  assert.ok(bytes.equals(jsonBytes(expected)),'Execution invocation marker changed');
  // Original throwing validators return undefined on success. Inspectors that
  // return evidence must affirm availability; a failed evidence object is never
  // interpreted as a successful throwing-validator return.
  if(inspectOriginal!==undefined)verifyValidationExecutionInspection(inspectOriginal,c,claim,job);
  return{claim:bind(claim),kind:claim.kind,jobId,markerRef:{path,sha256:sha(bytes)}};
}
export function verifyValidationExecutionInspection(inspectOriginal,c,claim,job){assert.equal(typeof inspectOriginal,'function');const evidence=sync(inspectOriginal(c,claim,job));if(evidence!==undefined)assert.equal(evidence?.available,true,'Original invocation evidence unavailable');}

// Pure mapping and byte checks; the public publisher additionally validates current
// authority and original host proofs before it can write anything.
export function validationExecutionGameClaims(c,episodeId,state,afterSequence){
  assert.match(episodeId,/^[a-z0-9][a-z0-9-]{0,127}$/);
  return state.rows.filter(r=>r.sequence>afterSequence&&['dispatch-claimed','review-dispatch-claimed'].includes(r.kind)).filter(claim=>{
    if(claim.kind==='dispatch-claimed'){
      const prepared=one(state.rows,r=>r.kind==='job-prepared'&&r.data.jobId===claim.data.jobId&&r.sequence<claim.sequence,'player preparation for game mapping');
      const commits=state.rows.filter(r=>r.kind==='move-committed'&&r.data.jobId===claim.data.jobId);assert.ok(commits.length<=1);if(commits.length)assert.equal(commits[0].data.episodeId,prepared.data.episodeId);
      return prepared.data.episodeId===episodeId;
    }
    const job=read(c,'outbox/'+claim.data.reviewId+'.json');assert.equal(job.id,claim.data.reviewId);assert.equal(job.stage,claim.data.stage);assert.equal(job.promptHash,claim.data.job.promptHash);assert.deepEqual(job.promptRef,claim.data.job.promptRef);
    if(job.stage==='game'){assert.equal(job.subjectId,job.episodeId);return job.episodeId===episodeId;}
    assert.equal(job.stage,'decision');const commit=getBlob(c.root,job.commitRef);assert.equal(commit.decisionId,job.subjectId);
    one(state.rows,r=>r.kind==='move-committed'&&JSON.stringify(r.data)===JSON.stringify(commit),'reviewed physical commit');
    return commit.episodeId===episodeId;
  });
}
export function verifyValidationExecutionRawMapping(c,episodeId,state,rawResult){
  const directory='raw-games/'+episodeId;assert.equal(rawResult.directory,directory);
  const bytes=readFileSync(safePath(c.root,directory+'/source-manifest.json')),source=JSON.parse(bytes);assert.deepEqual(source,rawResult.source);
  assert.equal(source.schemaVersion,'trix-raw-game-export-1.0.0');assert.equal(source.runId,c.manifest.runId);assert.equal(source.episodeId,episodeId);assert.equal(source.originalManifestHash,sha(readFileSync(safePath(c.root,'manifest.json'))));
  assert.deepEqual(Object.keys(source.files).sort(),['decisions.jsonl','game.json']);
  for(const [name,h]of Object.entries(source.files))assert.equal(sha(readFileSync(safePath(c.root,directory+'/'+name))),h,'Raw published bytes changed');
  const decisions=readFileSync(safePath(c.root,directory+'/decisions.jsonl'),'utf8').trimEnd().split('\n').filter(Boolean).map(JSON.parse),game=read(c,directory+'/game.json');
  const commits=state.rows.filter(r=>r.kind==='move-committed'&&r.data.episodeId===episodeId);assert.equal(decisions.length,commits.length);assert.equal(source.decisionCount,decisions.length);
  assert.equal(new Set(commits.map(r=>r.data.decisionId)).size,commits.length);
  for(let i=0;i<commits.length;i++){
    const commit=commits[i].data,decision=decisions[i];assert.equal(decision.decisionId,commit.decisionId);assert.deepEqual(decision.sourceRefs.savedRef,commit.savedRef);
    const review=one(state.rows,r=>r.kind==='review-imported'&&r.data.stage==='decision'&&r.data.subjectId===commit.decisionId,'accepted decision review').data;
    for(const [field,key]of [['decisionReviewRef','reviewRef'],['reviewOriginalRef','originalRef'],['reviewerReceiptRef','reviewerReceiptRef']])assert.deepEqual(decision.sourceRefs[field],review[key]);
    assert.deepEqual(decision.acceptedDecisionReview,getBlob(c.root,review.reviewRef));assert.equal(decision.nativeChoice,commit.selectedCandidateId);
  }
  const outcome=one(state.rows,r=>r.kind==='episode-completed'&&r.data.episodeId===episodeId,'completed native game').data,review=one(state.rows,r=>r.kind==='review-imported'&&r.data.stage==='game'&&r.data.subjectId===episodeId,'accepted game review').data;
  assert.equal(game.episodeId,episodeId);assert.deepEqual(game.sourceRefs.outcomeRef,outcome.outcomeRef);assert.deepEqual(game.sourceRefs.gameReviewRef,review.reviewRef);assert.deepEqual(game.sourceRefs.reviewOriginalRef,review.originalRef);assert.deepEqual(game.sourceRefs.reviewerReceiptRef,review.reviewerReceiptRef);
  const native=getBlob(c.root,outcome.outcomeRef);
  // The unchanged raw exporter requires 52 plays/13 tricks for every approved
  // Basic and Complex request; declaration commits are additional decisions.
  assert.equal(native.status,'completed');assert.equal(native.acceptedPlays,52);assert.equal(native.completedTricks,13);assert.equal(native.nativeTerminalPhase,'round-complete');assert.equal(commits.filter(r=>r.data.phase==='playing').length,native.acceptedPlays);
  assert.deepEqual(game.nativeOutcome,Object.fromEntries(['status','completedTricks','acceptedPlays','nativeTerminalPhase','scoreTotals','componentTotals','ledger','withheldBonuses','tricks'].map(key=>[key,native[key]])));assert.deepEqual(game.acceptedGameReview,getBlob(c.root,review.reviewRef));
  return{path:directory+'/source-manifest.json',sha256:sha(bytes)};
}
const physicalPrefix=(bytes,sequence)=>{let end=-1;for(let i=0;i<sequence;i++){end=bytes.indexOf(10,end+1);assert.ok(end>=0,'Missing sidecar physical prefix');}return bytes.subarray(0,end+1);};
export function verifyValidationExecutionEpochReuse(saved,{base,state,physical}){
  const {physicalObservedBoundary,physicalJournalHash,...savedBase}=saved;assert.deepEqual(savedBase,base,'Immutable execution epoch changed');
  const boundary=one(state.rows,row=>row.sequence===physicalObservedBoundary.sequence,'published epoch boundary');assert.deepEqual(bind(boundary),physicalObservedBoundary);assert.ok(base.bindings.every(b=>b.claim.sequence<=boundary.sequence));assert.equal(sha(physicalPrefix(physical,boundary.sequence)),physicalJournalHash,'Published execution epoch prefix changed');
}
export function publishValidationExecutionEpoch(c,episodeId,{latest,rawResult,validateCurrent,inspectOriginal}={}){
  assert.equal(typeof inspectOriginal,'function','Original invocation proof verifier required');
  return withValidationExecutionOwnerLock(c.root,()=>{
    const state=current(c,latest,validateCurrent),r=latest.amendment;
    const baseline=readExecutionArtifact(c.root,r.evidence.preservationBaselineRef);
    for(const [oldEpisode,inventory]of Object.entries(baseline.rawGameFileInventories))assert.deepEqual(inventoryExecutionDirectory(c.root,'raw-games/'+oldEpisode),inventory,'Historical publication inventory changed');
    const claims=validationExecutionGameClaims(c,episodeId,state,latest.authorization.sequence);
    if(baseline.rawGameFileInventories[episodeId]){assert.equal(claims.length,0,'Historical publication cannot gain new claims');return rawResult;}
    assert.ok(claims.length>0,'New epoch publication has no relevant physical claims');
    const rawSourceManifestRef=verifyValidationExecutionRawMapping(c,episodeId,state,rawResult);
    const bindings=claims.map(claim=>assertValidationExecutionInvocation(c,jobIdFor(claim),latest,{state,inspectOriginal}));
    const path=rawResult.directory+'/'+r.epochPolicy.publicationFile,physical=readFileSync(safePath(c.root,'private/journal.jsonl'));
    const base={schemaVersion:validationExecutionEpochVersion,runId:r.runId,episodeId,amendmentHash:latest.amendmentHash,authorization:bind(latest.authorization),originalRecoveryDelegation:originalBinding(r.originalRecoveryDelegation),executionBuild:r.processingBuild,sourceReviewRef:r.evidence.sourceReviewRef,helperPins:r.helperPins,nodeExecutable:r.nodeExecutable,hostExecutable:r.hostExecutable,runtimeIdentity:r.runtimeIdentity,rawSourceManifestRef,bindings};
    if(existsSync(safePath(c.root,path))){
      verifyValidationExecutionEpochReuse(read(c,path),{base,state,physical});
      return{...rawResult,validationExecutionEpochRef:{path,sha256:sha(readFileSync(safePath(c.root,path)))}};
    }
    const sidecar={...base,physicalObservedBoundary:bind(state.rows.at(-1)),physicalJournalHash:sha(physical)};writeImmutable(safePath(c.root,path),jsonBytes(sidecar));
    return{...rawResult,validationExecutionEpochRef:{path,sha256:sha(jsonBytes(sidecar))}};
  });
}
