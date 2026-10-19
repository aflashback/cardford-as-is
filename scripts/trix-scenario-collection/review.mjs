// TSC-08/09: actor-time reviews are immutable and distinct from final outcomes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appendEvent, getBlob, jsonBytes, putBlob, sha, withRunLock, writeImmutable, safePath } from './journal.mjs';
import { applicableCategory, validateArtifact, resolveActorEvidence } from './external-reader.mjs';
import { canonical } from './contracts.mjs';
import { buildProofEvidence, verifyReviewProof } from './proof-adapter.mjs';
import { inspectHostInvocation, verifyHostReceipt, verifyResponseBytes } from './bridge.mjs';

export const categoryIds=['DIA','HK','Q','LUT','VOID','COMB','DBL','INFER','END','TEAM'];
const fill=(template,fields)=>template.replace(/\{\{(\w+)\}\}/g,(_,key)=>{assert.ok(Object.hasOwn(fields,key),`Missing review prompt field ${key}`);return typeof fields[key]==='string'?fields[key]:JSON.stringify(fields[key]);});
export { resolveActorEvidence };
export function proofMatches(proof,claim,job,packet) {
  return proof?.verified===true&&proof.packetHash===job.packetHash&&proof.alternativeCandidateId===claim.alternativeCandidateId&&proof.originalCandidateId===job.selectedCandidateId&&proof.originalCandidateId!==proof.alternativeCandidateId&&proof.objective===packet.objective&&proof.advantage===claim.advantage&&claim.advantage>0&&canonical(proof.pin)===canonical(packet.pin)&&proof.proofRef?.sha256===claim.proofRef.sha256&&proof.proofRef?.path===claim.proofRef.path;
}
export function validateDecisionProposal(proposal,job,packet,{verifyProof=()=>({verified:false,reason:'No installed independent certificate verifier'})}={}) {
  validateArtifact('decision-review',proposal);
  assert.equal(proposal.decisionId,job.decisionId);assert.equal(proposal.packetHash,job.packetHash);
  assert.ok(proposal.categoryIds.every(c=>applicableCategory(c,packet.variant,packet.request)),'Inapplicable review category');
  assert.equal(new Set(proposal.checks.map(c=>c.id)).size,5,'Five distinct rationale checks required');
  for(const row of [...proposal.checks,...proposal.explanationIssues])for(const ref of row.evidenceRefs)resolveActorEvidence(packet,ref);
  const forced=packet.legalOptions.length===1;
  assert.equal(proposal.rationaleStatus==='forced',forced,'Forced rationale status mismatch');
  const result=structuredClone(proposal);
  if(result.missedOpportunity!==null){
    const m=result.missedOpportunity;
    assert.ok(!forced,'Forced decision has no alternative');assert.equal(m.objective,packet.objective);
    assert.ok(packet.legalOptions.some(o=>o.candidateId===m.alternativeCandidateId),'Illegal review alternative');
    for(const ref of m.actorEvidenceRefs)resolveActorEvidence(packet,ref);
    // Information-set proofs remain unsupported. A verifier must bind every identity field.
    const proof=m.proofKind==='native-objective-dominance'?verifyProof(m,job,packet):{verified:false,reason:'Information-set verifier unavailable'};
    const bound=proofMatches(proof,m,job,packet);
    if(!bound){result.hypotheses.push({description:m.correction,assumptions:['Unverified correction claim: '+(proof.reason??'Unbound proof receipt')],counterexamplesToSeek:['Seek an actor-information-consistent legal continuation that reverses the proposed advantage.']});result.missedOpportunity=null;}
  }
  return result;
}
function frozenForEpisode(collector,s,outcome) {
  const commits=s.commits.filter(c=>c.episodeId===outcome.episodeId);
  const rows=commits.map(c=>s.reviews.find(r=>r.stage==='decision'&&r.subjectId===c.decisionId));
  assert.ok(commits.length>0&&rows.every(Boolean),'Freeze every decision review before retrospective review');
  return {commits,reviews:rows.map(r=>getBlob(collector.root,r.reviewRef))};
}
export function validateGameProposal(proposal,job,context) {
  validateArtifact('game-review',proposal);assert.equal(proposal.episodeId,job.episodeId);
  const {native,commits,reviews,replay}=context;
  assert.equal(native.completedTricks,13);assert.equal(native.acceptedPlays,52);assert.equal(native.nativeTerminalPhase,'round-complete');
  assert.equal(replay?.status,'passed');assert.equal(replay.completedTricks,13);
  assert.deepEqual(proposal.nativeTotals,{scoreTotals:native.scoreTotals,componentTotals:native.componentTotals},'Retrospective native totals mismatch');
  assert.equal(new Set(proposal.seatSummaries.map(s=>s.actor)).size,4,'Each seat requires exactly one summary');
  const byId=new Map(reviews.map(r=>[r.decisionId,r]));
  for(const seat of proposal.seatSummaries){
    const own=commits.filter(c=>c.actor===seat.actor);assert.equal(seat.reviewedDecisions,own.length,'Seat review count mismatch');
    assert.ok(seat.correctionDecisionIds.every(id=>own.some(c=>c.decisionId===id)&&byId.get(id)?.missedOpportunity),'Unverified seat correction');
  }
  for(const name of ['usefulPatternRefs','counterexampleRefs','supportedMissedOpportunityRefs']){
    assert.equal(new Set(proposal[name]).size,proposal[name].length,'Duplicate review reference');
    assert.ok(proposal[name].every(id=>byId.has(id)),'Unknown frozen decision reference');
  }
  assert.ok(proposal.supportedMissedOpportunityRefs.every(id=>byId.get(id).missedOpportunity),'Unverified retrospective correction');
  const counts=Object.fromEntries(Object.keys(proposal.explanationIssueCounts).map(k=>[k,reviews.filter(r=>r.rationaleStatus===k).length]));
  assert.deepEqual(proposal.explanationIssueCounts,counts,'Retrospective rationale counts mismatch');
  assert.equal(sha(jsonBytes(reviews)),job.frozenDecisionReviewDigest,'Frozen decision reviews changed');
  return {...structuredClone(proposal),frozenDecisionReviewDigest:job.frozenDecisionReviewDigest};
}
export function makeReviewPacket(collector,stage,{alternativeEvidenceFor=(commit,packet)=>buildProofEvidence(collector,commit,packet)}={}) {return withRunLock(collector.root,()=>{
  const s=collector.state();assert.ok(stage==='decision'||stage==='game');
  const existing=new Set(s.reviews.filter(r=>r.stage===stage).map(r=>r.subjectId));
  let job,prompt;
  if(stage==='decision'){
    const commit=s.commits.find(c=>!existing.has(c.decisionId));if(!commit)return {stop:'no-pending-decision-reviews'};
    const saved=getBlob(collector.root,commit.savedRef),packet=getBlob(collector.root,saved.job.packetRef);
    const {confidence,...response}=saved.response;
    job={schemaVersion:'trix-review-job-1.0.0',id:`decision-${sha(commit.decisionId).slice(0,24)}`,stage,decisionId:commit.decisionId,subjectId:commit.decisionId,selectedCandidateId:commit.selectedCandidateId,packetHash:saved.job.packetRef.sha256,commitRef:putBlob(collector.root,commit),packetRef:saved.job.packetRef};
    const evidence=alternativeEvidenceFor(commit,packet);
    assert.ok(Array.isArray(evidence));
    for(const summary of evidence){
      assert.deepEqual(Object.keys(summary).sort(),['verified','proofKind','packetHash','originalCandidateId','alternativeCandidateId','objective','advantage','proofRef'].sort(),'Unexpected actor-safe proof summary field');
      assert.equal(summary.verified,true);assert.equal(summary.proofKind,'native-objective-dominance');assert.equal(summary.packetHash,job.packetHash);assert.equal(summary.originalCandidateId,job.selectedCandidateId);assert.equal(summary.objective,packet.objective);assert.ok(summary.advantage>0);assert.ok(packet.legalOptions.some(o=>o.candidateId===summary.alternativeCandidateId));getBlob(collector.root,summary.proofRef);
    }
    job.actorSafeAlternativeEvidenceRef=putBlob(collector.root,evidence);job.proofEvidenceRefs=evidence.map(e=>e.proofRef);
    prompt=fill(readFileSync(resolve(collector.templateRoot,'decision-review.md'),'utf8'),{actorPacket:{decisionId:job.decisionId,packetHash:job.packetHash,...packet},originalCardOrDeclarationAndRationale:response,nativeFactAudit:{legal:true,forced:commit.forced,selectedCandidateId:commit.selectedCandidateId},actorSafeAlternativeEvidence:evidence,categoryIds});
  }else{
    const outcome=s.outcomes.find(o=>!existing.has(o.episodeId));if(!outcome)return {stop:'no-pending-game-reviews'};
    const frozen=frozenForEpisode(collector,s,outcome),native=getBlob(collector.root,outcome.outcomeRef),replay=collector.replay().find(r=>r.episodeId===outcome.episodeId);
    assert.equal(replay?.status,'passed');
    job={schemaVersion:'trix-review-job-1.0.0',id:`game-${sha(outcome.episodeId).slice(0,24)}`,stage,subjectId:outcome.episodeId,episodeId:outcome.episodeId,frozenDecisionReviewDigest:sha(jsonBytes(frozen.reviews)),outcomeRef:outcome.outcomeRef};
    prompt=fill(readFileSync(resolve(collector.templateRoot,'game-review.md'),'utf8'),{episodeIdentityAndPins:{episodeId:outcome.episodeId,variant:outcome.variant,request:outcome.request,decisionActors:frozen.commits.map(c=>({decisionId:c.decisionId,actor:c.actor}))},completePublicPlayHistory:native.tricks,nativeFinalScoresAndComponents:{scoreTotals:native.scoreTotals,componentTotals:native.componentTotals,ledger:native.ledger,withheldBonuses:native.withheldBonuses},frozenDecisionReviewSummary:frozen.reviews,auditAndReplayReceipt:replay});
  }
  const reviewSchema=JSON.parse(readFileSync(new URL(`../../contracts/trix-scenario-collection/${stage}-review.schema.json`,import.meta.url),'utf8'));
  prompt+='\nReturn one JSON object conforming exactly to this schema. Use no Markdown fences or extra prose.\n'+JSON.stringify(reviewSchema)+'\n';
  job.promptRef=putBlob(collector.root,Buffer.from(prompt));job.promptHash=job.promptRef.sha256;
  writeImmutable(safePath(collector.root,`outbox/${job.id}.json`),jsonBytes(job));writeImmutable(safePath(collector.root,`outbox/${job.id}.prompt.txt`),Buffer.from(prompt));return {job};
});}
export function importReview(collector,job,proposal,reviewerReceipt,{verifyProof=(claim,reviewJob,packet)=>verifyReviewProof(collector,claim,reviewJob,packet)}={}) {return withRunLock(collector.root,()=>{
  const stored=JSON.parse(readFileSync(safePath(collector.root,`outbox/${job.id}.json`),'utf8'));assert.deepEqual(job,stored);
  getBlob(collector.root,job.promptRef,false);assert.equal(job.promptHash,job.promptRef.sha256);
  assert.ok(reviewerReceipt&&typeof reviewerReceipt.reviewerId==='string'&&reviewerReceipt.reviewerId.trim());
  assert.equal(reviewerReceipt.promptHash,job.promptHash);assert.equal(reviewerReceipt.responseHash,sha(jsonBytes(proposal)));assert.equal(reviewerReceipt.contextMode,'independent-review');
  const s=collector.state(),duplicate=s.reviews.find(r=>r.stage===job.stage&&r.subjectId===job.subjectId);
  if(duplicate){assert.deepEqual(getBlob(collector.root,duplicate.originalRef),proposal,'Conflicting immutable review revision');assert.deepEqual(getBlob(collector.root,duplicate.reviewerReceiptRef),reviewerReceipt,'Conflicting reviewer receipt');return duplicate;}
  const episodeId=job.stage==='decision'?getBlob(collector.root,job.commitRef).episodeId:job.episodeId;
  const relevant=s.commits.filter(c=>c.episodeId===episodeId);
  for(const commit of relevant){
    const original=getBlob(collector.root,commit.savedRef),host=getBlob(collector.root,original.receiptRef);
    assert.notEqual(reviewerReceipt.reviewerId,host.hostAgentId,'Player context cannot review its own decision');
    if(original.job.parentThreadId)assert.notEqual(reviewerReceipt.reviewerId,original.job.parentThreadId,'Coordinator context is not an independent review');
  }
  let accepted;
  if(job.stage==='decision'){
    const commit=getBlob(collector.root,job.commitRef);assert.ok(s.commits.some(c=>c.decisionId===job.decisionId),'Review requires committed original response');assert.equal(commit.selectedCandidateId,job.selectedCandidateId);
    let verifiedReceipt=null;
    const verifier=verifyProof?(claim,reviewJob,packet)=>{if(!job.proofEvidenceRefs.some(ref=>canonical(ref)===canonical(claim.proofRef)))return {verified:false,reason:'Proof was not supplied to this frozen actor review'};const receipt=verifyProof(claim,reviewJob,packet);if(proofMatches(receipt,claim,reviewJob,packet))verifiedReceipt=receipt;return receipt;}:undefined;
    accepted=validateDecisionProposal(proposal,job,getBlob(collector.root,job.packetRef),{verifyProof:verifier});
    if(accepted.missedOpportunity){assert.ok(verifiedReceipt);getBlob(collector.root,verifiedReceipt.proofRef);accepted.acceptedProofReceiptRef=putBlob(collector.root,verifiedReceipt);}
  }else{
    const outcome=s.outcomes.find(o=>o.episodeId===job.episodeId);assert.ok(outcome,'Unknown completed episode');assert.deepEqual(outcome.outcomeRef,job.outcomeRef);
    const frozen=frozenForEpisode(collector,s,outcome);accepted=validateGameProposal(proposal,job,{...frozen,native:getBlob(collector.root,job.outcomeRef),replay:collector.replay().find(r=>r.episodeId===job.episodeId)});
  }
  const data={stage:job.stage,subjectId:job.subjectId,reviewRef:putBlob(collector.root,accepted),originalRef:putBlob(collector.root,proposal),reviewerReceiptRef:putBlob(collector.root,reviewerReceipt)};
  appendEvent(collector.root,'review-imported',data);return data;
});}

// Automatic reviews have the same transport and isolation evidence as players.
// The manual importer remains an explicitly operator-attested route.
export function importHostReview(collector,job,transportJob,bytes,receipt) {
  assert.equal(transportJob.promptHash,job.promptHash,'Review prompt changed in transport');
  assert.deepEqual(transportJob.promptRef,job.promptRef);
  const evidence=inspectHostInvocation(transportJob,receipt,collector.root);
  assert.equal(evidence.available,true,evidence.reason);
  const admission=verifyHostReceipt(transportJob,receipt,evidence.events,evidence.baseContext);
  assert.equal(admission.admitted,true,admission.errors.join('; '));verifyResponseBytes(receipt,bytes);
  const proposal=JSON.parse(Buffer.from(bytes).toString('utf8'));
  const hostEvidenceRef=putBlob(collector.root,{transportJob,receipt,rawRef:putBlob(collector.root,Buffer.from(bytes)),admission,baseContextDigest:evidence.baseContext.digest});
  return importReview(collector,job,proposal,{reviewerId:receipt.hostAgentId,promptHash:job.promptHash,responseHash:sha(jsonBytes(proposal)),contextMode:'independent-review',hostEvidenceRef});
}
