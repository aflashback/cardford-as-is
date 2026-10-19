// Preserve model prose/grades; repair only a declared actor-reference container typo.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendEvent, getBlob, jsonBytes, putBlob, readJournal, safePath, sha, withRunLock } from './journal.mjs';
import { canonical } from './contracts.mjs';
import { inspectHostInvocation, verifyHostReceipt, verifyResponseBytes } from './bridge.mjs';
import { validateDecisionProposal, resolveActorEvidence, proofMatches } from './review.mjs';
import { verifyReviewProof } from './proof-adapter.mjs';

const normalizerSourceHash=sha(readFileSync(new URL(import.meta.url)));
const contentError=error=>{if(error instanceof SyntaxError||error.code==='ERR_ASSERTION')error.code='TRIX_REVIEW_CONTENT_INVALID';throw error;};
export function normalizeActorReferenceProposal(raw,packet) {
  assert.equal(packet.schemaVersion,'trix-scenario-player-packet-1.0.0');
  assert.ok(Array.isArray(packet.handCounts)&&packet.handCounts.length===4&&packet.handCounts.every(n=>Number.isInteger(n)&&n>=0&&n<=13));
  assert.ok(packet.publicPhaseAndTurn&&typeof packet.publicPhaseAndTurn==='object'&&!Object.hasOwn(packet.publicPhaseAndTurn,'handCounts'),'Reference source must be absent');
  const normalized=structuredClone(raw),changes=[];
  const fix=(refs,path)=>{if(!Array.isArray(refs))return;for(let i=0;i<refs.length;i++){
    const from=refs[i];if(typeof from!=='string'||!/^actor:\/publicPhaseAndTurn\/handCounts(?:\/[0-3])?$/.test(from))continue;
    assert.throws(()=>resolveActorEvidence(packet,from),'Reference source already resolves');
    const to=from.replace('actor:/publicPhaseAndTurn/handCounts','actor:/handCounts');resolveActorEvidence(packet,to);
    refs[i]=to;changes.push({path:`${path}/${i}`,from,to});
  }};
  for(const name of ['checks','explanationIssues'])if(Array.isArray(normalized?.[name]))normalized[name].forEach((row,i)=>fix(row?.evidenceRefs,`/${name}/${i}/evidenceRefs`));
  if(normalized?.missedOpportunity)fix(normalized.missedOpportunity.actorEvidenceRefs,'/missedOpportunity/actorEvidenceRefs');
  assert.ok(changes.length>0,'No supported actor-reference typo');return {normalized,changes};
}

export function validateReferenceReviewEnvelope(collector,job,transport,bytes,receipt,{processingAudit,inspectHost=inspectHostInvocation,validateDecision=validateDecisionProposal}={}) {
  assert.equal(job.stage,'decision');assert.deepEqual(job,JSON.parse(readFileSync(safePath(collector.root,`outbox/${job.id}.json`))));
  assert.equal(job.subjectId,job.decisionId);assert.equal(job.promptHash,job.promptRef.sha256);assert.equal(sha(getBlob(collector.root,job.promptRef,false)),job.promptHash);
  assert.equal(transport.promptHash,job.promptHash);assert.deepEqual(transport.promptRef,job.promptRef);assert.equal(job.packetHash,job.packetRef.sha256);
  const packet=getBlob(collector.root,job.packetRef),state=collector.state(),commit=getBlob(collector.root,job.commitRef);
  assert.equal(commit.decisionId,job.decisionId);assert.equal(commit.selectedCandidateId,job.selectedCandidateId);assert.ok(state.commits.some(c=>canonical(c)===canonical(commit)));
  assert.deepEqual(getBlob(collector.root,commit.savedRef).job.packetRef,job.packetRef);
  const claims=readJournal(collector.root).filter(r=>r.kind==='review-dispatch-claimed'&&r.data.job.jobId===transport.jobId);assert.equal(claims.length,1);const claim=claims[0];
  assert.equal(claim.data.reviewId,job.id);assert.equal(claim.data.stage,job.stage);assert.deepEqual(claim.data.job,transport);
  const budget=Date.parse(transport.deadlineAt)-Date.parse(transport.claimedAt);assert.ok(Number.isFinite(budget)&&budget>0&&budget<=300000);
  assert.deepEqual(Object.keys(processingAudit??{}).sort(),['nativeBinaryDigest','originalSourceDigest','reviewSourceDigest']);for(const hash of Object.values(processingAudit))assert.match(hash,/^[a-f0-9]{64}$/);
  assert.equal(processingAudit.originalSourceDigest,collector.manifest.build.sourceDigest);assert.equal(processingAudit.nativeBinaryDigest,collector.manifest.build.binaryDigest);
  const evidence=inspectHost(transport,receipt,collector.root);assert.equal(evidence.available,true,evidence.reason);
  const admission=verifyHostReceipt(transport,receipt,evidence.events,evidence.baseContext);assert.equal(admission.admitted,true,admission.errors.join('; '));verifyResponseBytes(receipt,bytes);
  for(const c of state.commits.filter(c=>c.episodeId===commit.episodeId)){const saved=getBlob(collector.root,c.savedRef),host=getBlob(collector.root,saved.receiptRef);assert.notEqual(receipt.hostAgentId,host.hostAgentId);if(saved.job.parentThreadId)assert.notEqual(receipt.hostAgentId,saved.job.parentThreadId);}
  let raw,normalized,changes;
  try{
    raw=JSON.parse(Buffer.from(bytes).toString('utf8'));assert.ok(raw&&typeof raw==='object'&&!Array.isArray(raw));
    assert.equal(raw.packetHash,job.packetHash,'Reference repair cannot also repair packet identity');
    ({normalized,changes}=normalizeActorReferenceProposal(raw,packet));
    validateDecision(normalized,job,packet,{verifyProof:()=>({verified:false,reason:'Read-only reference preflight; import applies ordinary proof validation'})});
  }catch(error){contentError(error);}
  const normalization={schemaVersion:'trix-review-reference-normalization-1.0.0',kind:'actor-handCounts-container',changes,reason:'The frozen actor packet places handCounts at its root; preserve the full array or exact seat index while removing the nonexistent publicPhaseAndTurn container.',reviewId:job.id,decisionId:job.decisionId,transportJobId:transport.jobId,dispatchClaimHash:claim.hash,dispatchClaimSequence:claim.sequence,promptHash:job.promptHash,packetRef:job.packetRef,rawResponseHash:sha(bytes),rawProposalHash:sha(jsonBytes(raw)),normalizedProposalHash:sha(jsonBytes(normalized)),normalizerSourceHash,...processingAudit};
  return {raw,normalized,normalization,admission,evidence};
}

export function importReferenceHostReview(collector,job,transport,bytes,receipt,options={}) {
  return withRunLock(collector.root,()=>{
    assert.equal(collector.state().paused,false,'A later pause prevents reference import');
    const checked=validateReferenceReviewEnvelope(collector,job,transport,bytes,receipt,options);
    const duplicate=collector.state().reviews.find(r=>r.stage==='decision'&&r.subjectId===job.subjectId);
    if(duplicate){assert.deepEqual(getBlob(collector.root,duplicate.originalRef),checked.raw);const old=getBlob(collector.root,duplicate.reviewerReceiptRef);assert.equal(old.reviewerId,receipt.hostAgentId);assert.ok(duplicate.metadataNormalizationRef);assert.deepEqual(getBlob(collector.root,duplicate.metadataNormalizationRef),checked.normalization);return duplicate;}
    let proofReceipt=null;const verify=options.verifyProof??((claim,reviewJob,packet)=>verifyReviewProof(collector,claim,reviewJob,packet));
    const verifier=(claim,reviewJob,packet)=>{if(!(job.proofEvidenceRefs??[]).some(ref=>canonical(ref)===canonical(claim.proofRef)))return {verified:false,reason:'Proof was not supplied to this frozen actor review'};const result=verify(claim,reviewJob,packet);if(proofMatches(result,claim,reviewJob,packet))proofReceipt=result;return result;};
    const accepted=(options.validateDecision??validateDecisionProposal)(checked.normalized,job,getBlob(collector.root,job.packetRef),{verifyProof:verifier});
    if(accepted.missedOpportunity){assert.ok(proofReceipt);getBlob(collector.root,proofReceipt.proofRef);accepted.acceptedProofReceiptRef=putBlob(collector.root,proofReceipt);}
    const rawRef=putBlob(collector.root,Buffer.from(bytes)),hostEvidenceRef=putBlob(collector.root,{transportJob:transport,receipt,rawRef,admission:checked.admission,trustedHostEvents:checked.evidence.events,baseContextDigest:checked.evidence.baseContext.digest});
    const metadataNormalizationRef=putBlob(collector.root,checked.normalization),reviewerReceiptRef=putBlob(collector.root,{reviewerId:receipt.hostAgentId,promptHash:job.promptHash,responseHash:sha(jsonBytes(checked.raw)),contextMode:'independent-review',hostEvidenceRef,metadataNormalizationRef});
    const data={stage:'decision',subjectId:job.subjectId,reviewRef:putBlob(collector.root,accepted),originalRef:putBlob(collector.root,checked.raw),reviewerReceiptRef,metadataNormalizationRef};
    appendEvent(collector.root,'review-reference-normalized',{reviewId:job.id,transportJobId:transport.jobId,metadataNormalizationRef,hostEvidenceRef,originalRef:data.originalRef,reviewRef:data.reviewRef});appendEvent(collector.root,'review-imported',data);return data;
  });
}

export function wrapReferenceDriverApis(api,{processingAudit}={}) {
  const wrapped={...api};
  wrapped.validateSavedContent=(collector,job,transport,bytes,receipt,options,callerApi)=>{
    try{return api.validateSavedContent(collector,job,transport,bytes,receipt,options,callerApi??api);}
    catch(error){
      if(error.code!=='TRIX_REVIEW_CONTENT_INVALID'||job.stage!=='decision')throw error;
      try{validateReferenceReviewEnvelope(collector,job,transport,bytes,receipt,{...options,processingAudit:options?.processingAudit??processingAudit,validateDecision:api.validateDecisionProposal});}
      catch(repairError){if(repairError.code==='TRIX_REVIEW_CONTENT_INVALID'&&repairError.message==='No supported actor-reference typo')throw error;throw repairError;}
      return true;
    }
  };
  wrapped.importNormalizedHostReview=(collector,job,transport,bytes,receipt,options)=>{
    const raw=JSON.parse(Buffer.from(bytes).toString('utf8'));
    if(raw.packetHash!==job.packetHash)return api.importNormalizedHostReview(collector,job,transport,bytes,receipt,options);
    return importReferenceHostReview(collector,job,transport,bytes,receipt,{...options,processingAudit:options?.processingAudit??processingAudit,validateDecision:api.validateDecisionProposal});
  };return wrapped;
}

export function verifyReferenceRecovery(collector,reviewId,{processingAudit,api}={}) {
  const job=JSON.parse(readFileSync(safePath(collector.root,`outbox/${reviewId}.json`))),state=collector.state();assert.equal(job.id,reviewId);assert.equal(job.stage,'decision');
  const claims=state.rows.filter(r=>r.kind==='review-dispatch-claimed'&&r.data.reviewId===reviewId);assert.equal(claims.length,2,'Reference cap recovery requires both existing attempts');
  const claimBindings=[],earlierRejected=[];let selected=null;
  for(const claim of claims){
    const transport=claim.data.job,settlements=state.rows.filter(r=>r.kind==='review-attempt-settled'&&r.data.jobId===transport.jobId);assert.equal(settlements.length,1);const settlement=settlements[0];assert.equal(settlement.data.status,'rejected');assert.ok(settlement.sequence>claim.sequence);
    claimBindings.push({claimSequence:claim.sequence,claimHash:claim.hash,settlementSequence:settlement.sequence,settlementHash:settlement.hash,jobId:transport.jobId});
    api.verifyPriorHost(collector,claim);
    const dir=`private/invocations/${transport.jobId}`,bytes=readFileSync(safePath(collector.root,`${dir}/response.txt`)),receipt=JSON.parse(readFileSync(safePath(collector.root,`${dir}/receipt.json`)));
    if(selected)continue;
    let ordinaryInvalid=false;
    try{api.validateSavedContent(collector,job,transport,bytes,receipt,{processingAudit,validateDecision:api.validateDecisionProposal},api);}catch(error){if(error.code!=='TRIX_REVIEW_CONTENT_INVALID')throw error;ordinaryInvalid=true;}
    assert.equal(ordinaryInvalid,true,'Earlier valid response requires ordinary reconciliation, not a later preferred rationale');
    try{const checked=validateReferenceReviewEnvelope(collector,job,transport,bytes,receipt,{processingAudit,validateDecision:api.validateDecisionProposal});selected={job,transport,bytes,receipt,checked,claim};}
    catch(error){if(error.code!=='TRIX_REVIEW_CONTENT_INVALID')throw error;earlierRejected.push({jobId:transport.jobId,reason:error.message});}
  }
  assert.ok(selected,'No saved response passes reference-only normalization');
  const {checked,transport,claim}=selected,proof={schemaVersion:'trix-reference-recovery-proof-1.0.0',reviewId,jobId:transport.jobId,claimHash:claim.hash,claimSequence:claim.sequence,rawResponseHash:sha(selected.bytes),normalizedProposalHash:sha(jsonBytes(checked.normalized)),normalization:checked.normalization,earlierRejected};
  return {...selected,proof,claimBindings};
}

export function importRecoveredReferenceReview(collector,selected,{processingAudit,api}={}) {
  const again=verifyReferenceRecovery(collector,selected.job.id,{processingAudit,api});assert.deepEqual(again.proof,selected.proof);assert.deepEqual(again.claimBindings,selected.claimBindings);
  return importReferenceHostReview(collector,again.job,again.transport,again.bytes,again.receipt,{processingAudit,validateDecision:api.validateDecisionProposal});
}
