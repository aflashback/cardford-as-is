// TSC-10: cap selected teaching decisions, never raw evidence.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getBlob, safePath, sha } from './journal.mjs';
import { canonical, nativeCard, validatePlayerPacket } from './contracts.mjs';
import { readExternalCases, validateExternalCase } from './external-reader.mjs';
import { proofMatches } from './review.mjs';

export const selectionPolicyVersion='trix-selection-1.0.1';
// A completed public trick settles its penalty and any associated double bonus.
// Current-trick cards are deliberately excluded: their capture is not settled yet.
export function requestScoringExhausted(packet) {
  if(!packet.variant.startsWith('basic-')||!['king','queens','diamonds'].includes(packet.request))return false;
  const played=new Set(packet.completedTricks.flatMap(t=>t.plays).map(play=>{
    const fields=play.card.split('|');
    return nativeCard(fields.length===5?`|${fields[2]}|${fields[3]}|`:play.card);
  }));
  if(packet.request==='king')return played.has('HK');
  if(packet.request==='queens')return ['SQ','HQ','DQ','CQ'].every(card=>played.has(card));
  return ['2','3','4','5','6','7','8','9','10','J','Q','K','A'].every(rank=>played.has('D'+rank));
}
const selectionStages=['opening','middle','late','declaration'];
export function interleaveFamilyStages(candidates,priorCases=[]) {
  const priorIds=new Set(priorCases.map(c=>c.caseId)),families=new Map(),untouched=[],rejected=[];
  const rows=[...candidates].sort((a,b)=>a.decisionId.localeCompare(b.decisionId));
  for(const row of rows){
    if(priorIds.has(row.caseId)){untouched.push(row);continue;}
    if(!row.eligible||row.actorPacket&&requestScoringExhausted(row.actorPacket)){rejected.push(row);continue;}
    if(!families.has(row.familyId))families.set(row.familyId,new Map());
    const stages=families.get(row.familyId),stage=selectionStages.includes(row.stage)?row.stage:'opening';
    if(!stages.has(stage))stages.set(stage,[]);stages.get(stage).push(row);
  }
  const correction=row=>row.actionAssessment==='proved-correction'&&row.eligibilityReceipt?.correctionVerified===true;
  const interleaved=[];
  // Each family offers its underrepresented available stages before offering
  // another move from the same stage. Scores and confidence never rank choices.
  for(const [familyId,stages]of families){
    const offered=Object.fromEntries(selectionStages.map(stage=>[stage,priorCases.filter(c=>c.familyId===familyId&&c.stage===stage).length]));
    for(const queue of stages.values())queue.sort((a,b)=>Number(correction(b))-Number(correction(a))||a.decisionId.localeCompare(b.decisionId));
    while([...stages.values()].some(queue=>queue.length)){
      const available=[...stages.keys()].filter(stage=>stages.get(stage).length);
      available.sort((a,b)=>offered[a]-offered[b]||Number(correction(stages.get(b)[0]))-Number(correction(stages.get(a)[0]))||selectionStages.indexOf(a)-selectionStages.indexOf(b));
      const stage=available[0];interleaved.push(stages.get(stage).shift());offered[stage]++;
    }
  }
  return [...untouched,...interleaved,...rejected];
}

export const complexTargets = {
  'complex-solo':{DIA:20,HK:30,Q:25,LUT:20,VOID:20,COMB:35,DBL:15,INFER:15,END:20,TEAM:0},
  'complex-partners':{DIA:30,HK:45,Q:35,LUT:25,VOID:35,COMB:60,DBL:30,INFER:35,END:30,TEAM:75},
};
export function corpusCases(home,corpusId) {
  const found=new Map();
  if(!existsSync(home))return [];
  for(const dir of readdirSync(home,{withFileTypes:true})) {
    if(!dir.isDirectory()||dir.isSymbolicLink())continue;
    const root=safePath(home,dir.name),mp=safePath(root,'manifest.json');if(!existsSync(mp))continue;
    const manifest=JSON.parse(readFileSync(mp,'utf8'));if(manifest.corpusId!==corpusId||manifest.mode!=='live')continue;
    const exports=safePath(root,'exports');if(!existsSync(exports))continue;
    for(const version of readdirSync(exports,{withFileTypes:true})) {
      if(!version.isDirectory()||version.isSymbolicLink())continue;
      const directory=safePath(exports,version.name);
      // The manifest is published last. Partial exports never reserve corpus slots.
      if(!existsSync(safePath(directory,'source-manifest.json')))continue;
      const exported=readExternalCases(directory);assert.equal(exported.manifest.corpusId,corpusId);assert.equal(exported.manifest.runId,manifest.runId);
      for(const row of exported.cases){const old=found.get(row.caseId);if(old)assert.equal(canonical(old),canonical(row),'Corpus case identity/revision conflict');else found.set(row.caseId,row);}
    }
  }
  return [...found.values()];
}
export function selectCases(candidates,priorCases,plan) {
  assert.ok(!priorCases.some(c=>c.actorPacket&&requestScoringExhausted(c.actorPacket)),'Previously published scoring-exhausted case requires an explicit corpus audit; preserve the original export');
  assert.ok(plan.selection.maxCorpusCases<=1000&&plan.selection.maxCasesPerPhysicalDealFamily<=8,'Unapproved corpus/family cap');
  const hardCaps={'basic-solo':200,'complex-solo':200,'basic-partners':200,'complex-partners':400};
  assert.equal(new Set(plan.phases.map(p=>p.variant)).size,plan.phases.length,'Duplicate phase');
  for(const phase of plan.phases){assert.ok(phase.maxCases<=hardCaps[phase.variant],'Unapproved phase cap');for(const target of Object.values(phase.requestTargets))assert.ok(target<=(phase.variant.startsWith('basic')?50:hardCaps[phase.variant]),'Unapproved request cap');}
  const prior=new Map(priorCases.map(c=>[c.caseId,c])),counts={total:prior.size,byVariant:{},byRequest:{},byFamily:{},byCategory:{}};
  assert.equal(prior.size,priorCases.length,'Duplicate corpus identity');
  assert.equal(new Set(priorCases.map(c=>c.exactDecisionFingerprint)).size,prior.size,'Duplicate corpus observation/action');
  const add=c=>{counts.byVariant[c.variant]=(counts.byVariant[c.variant]??0)+1;const r=`${c.variant}:${c.request}`;counts.byRequest[r]=(counts.byRequest[r]??0)+1;counts.byFamily[c.familyId]=(counts.byFamily[c.familyId]??0)+1;const cat=`${c.variant}:${c.primaryCategory}`;counts.byCategory[cat]=(counts.byCategory[cat]??0)+1;};
  prior.forEach(add);
  assert.ok(counts.total<=plan.selection.maxCorpusCases,'Existing corpus exceeds cap');
  for(const phase of plan.phases){assert.ok((counts.byVariant[phase.variant]??0)<=phase.maxCases,'Existing phase exceeds cap');for(const [request,target]of Object.entries(phase.requestTargets))assert.ok((counts.byRequest[`${phase.variant}:${request}`]??0)<=target,'Existing request exceeds cap');}
  assert.ok(Object.values(counts.byFamily).every(n=>n<=plan.selection.maxCasesPerPhysicalDealFamily),'Existing family exceeds cap');
  const selected=[],rejections=[],seen=new Set(priorCases.map(c=>c.exactDecisionFingerprint));
  const rows=interleaveFamilyStages(candidates,priorCases);
  for(const row of rows) {
    if(prior.has(row.caseId)){
      const old=prior.get(row.caseId);for(const key of ['decisionId','runId','episodeId','revision','actor','exactDecisionFingerprint','originalChoice','originalRationale'])assert.deepEqual(old[key],row[key],'Immutable case revision changed');
      if(!selected.some(c=>c.caseId===row.caseId))selected.push(old);continue;
    }
    const phase=plan.phases.find(p=>p.variant===row.variant);let reason=null;
    if(!phase||!phase.requests.includes(row.request))reason='out-of-scope';
    else if(row.actorPacket&&requestScoringExhausted(row.actorPacket))reason='request-scoring-exhausted';
    else if(!row.eligible)reason=row.ineligibleReason??'insufficient-evidence';
    else if(seen.has(row.exactDecisionFingerprint))reason='duplicate-observation-action';
    else if(counts.total>=plan.selection.maxCorpusCases)reason='corpus-cap';
    else if((counts.byVariant[row.variant]??0)>=phase.maxCases)reason='phase-cap';
    else if((counts.byRequest[`${row.variant}:${row.request}`]??0)>=phase.requestTargets[row.request])reason='request-cap';
    else if((counts.byFamily[row.familyId]??0)>=plan.selection.maxCasesPerPhysicalDealFamily)reason='family-cap';
    let primary=row.tags[0];
    const targets=complexTargets[row.variant];
    if(!reason&&targets){
      const available=row.tags.filter(c=>(targets[c]??0)>(counts.byCategory[`${row.variant}:${c}`]??0));
      if(!available.length)reason='category-target-filled';
      else primary=available.sort((a,b)=>((counts.byCategory[`${row.variant}:${a}`]??0)/(targets[a]||1))-((counts.byCategory[`${row.variant}:${b}`]??0)/(targets[b]||1))||a.localeCompare(b))[0];
    }
    if(reason){rejections.push({decisionId:row.decisionId,reason});continue;}
    const {eligible,ineligibleReason,...record}=row;record.primaryCategory=primary;
    selected.push(record);counts.total++;add(record);seen.add(row.exactDecisionFingerprint);
  }
  const shortfalls=plan.phases.map(p=>({variant:p.variant,target:p.targetCases,selected:counts.byVariant[p.variant]??0,missing:Math.max(0,p.targetCases-(counts.byVariant[p.variant]??0))}));
  return {selected,rejections,coverage:counts,shortfalls};
}
export function collectCandidates(collector) {
  const s=collector.state(),completed=new Map(s.outcomes.map(o=>[o.episodeId,o]));
  const replay=new Map(collector.replay().map(r=>[r.episodeId,r]));
  return s.commits.map(commit=>{
    const saved=getBlob(collector.root,commit.savedRef),packet=getBlob(collector.root,saved.job.packetRef),reviewRow=s.reviews.find(r=>r.stage==='decision'&&r.subjectId===commit.decisionId),review=reviewRow?getBlob(collector.root,reviewRow.reviewRef):null;
    const outcome=completed.get(commit.episodeId),gameReview=s.reviews.find(r=>r.stage==='game'&&r.subjectId===commit.episodeId);
    validatePlayerPacket(packet);assert.equal(packet.nativeRevision,commit.revision);assert.equal(packet.actor,commit.actor);assert.equal(saved.candidateId,commit.selectedCandidateId);
    assert.deepEqual(JSON.parse(getBlob(collector.root,saved.rawRef,false).toString('utf8')),saved.response,'Original output mismatch');
    assert.equal(sha(getBlob(collector.root,saved.rawRef,false)),commit.responseHash);
    const materialChecksSupported=review?.checks?.length===5&&review.checks.every(c=>c.status==='supported');
    if(review){
      assert.equal(review.decisionId,commit.decisionId);assert.equal(review.packetHash,saved.job.packetRef.sha256,'Review packet binding mismatch');
      const original=getBlob(collector.root,reviewRow.originalRef),receipt=getBlob(collector.root,reviewRow.reviewerReceiptRef);
      assert.equal(receipt.contextMode,'independent-review');assert.equal(receipt.responseHash,sha(Buffer.from(JSON.stringify(original)+'\n')),'Review original response binding mismatch');
    }
    let correctionVerified=false;
    if(review?.missedOpportunity&&review.acceptedProofReceiptRef){const proof=getBlob(collector.root,review.acceptedProofReceiptRef);getBlob(collector.root,review.missedOpportunity.proofRef);correctionVerified=proofMatches(proof,review.missedOpportunity,{packetHash:saved.job.packetRef.sha256,selectedCandidateId:commit.selectedCandidateId},packet);}
    let ineligibleReason=null;
    if(collector.manifest.mode!=='live')ineligibleReason='fixture-not-live-data';
    else if(commit.forced||packet.legalOptions.length===1)ineligibleReason='forced';
    else if(requestScoringExhausted(packet))ineligibleReason='request-scoring-exhausted';
    else if(!saved.admission?.admitted)ineligibleReason='unadmitted-player-response';
    else if(!outcome)ineligibleReason='incomplete-episode';
    else if(replay.get(commit.episodeId)?.status!=='passed'||replay.get(commit.episodeId)?.completedTricks!==13)ineligibleReason='replay-unverified';
    else if(!review||!gameReview)ineligibleReason='review-pending';
    else if(review.missedOpportunity&&!correctionVerified)ineligibleReason='correction-unverified';
    else if(!correctionVerified&&(!['adequate','uncertain'].includes(review.rationaleStatus)||!materialChecksSupported||review.explanationIssues.length>0))ineligibleReason='inadequate-rationale-without-proof';
    const {invocationId,nativeRevision,...comparable}=packet;
    if(outcome){const native=getBlob(collector.root,outcome.outcomeRef);if(native.completedTricks!==13||native.acceptedPlays!==52||native.nativeTerminalPhase!=='round-complete')ineligibleReason='incomplete-episode';}
    if(gameReview){const game=getBlob(collector.root,gameReview.reviewRef);const frozen=s.commits.filter(c=>c.episodeId===commit.episodeId).map(c=>s.reviews.find(r=>r.stage==='decision'&&r.subjectId===c.decisionId)).filter(Boolean).map(r=>getBlob(collector.root,r.reviewRef));assert.equal(game.frozenDecisionReviewDigest,sha(Buffer.from(JSON.stringify(frozen)+'\n')),'Frozen review digest mismatch');}
    const row={schemaVersion:'trix-coaching-case-1.0.0',corpusId:collector.manifest.corpusId,caseId:sha(`${collector.manifest.runId}:${commit.decisionId}`),runId:collector.manifest.runId,decisionId:commit.decisionId,episodeId:commit.episodeId,revision:commit.revision,familyId:commit.familyId,variant:commit.variant,request:commit.request,pin:packet.pin,objective:packet.objective,actor:commit.actor,stage:commit.phase==='declare-doubles'?'declaration':packet.completedTricks.length<=3?'opening':packet.completedTricks.length<=8?'middle':'late',primaryCategory:review?.categoryIds[0]??'INFER',tags:review?.categoryIds??['INFER'],actorPacket:packet,originalChoice:commit.selectedCandidateId,originalRationale:saved.response.reasoning,selfReportedConfidence:saved.response.confidence,rationaleAssessment:review?.rationaleStatus??'pending',actionAssessment:correctionVerified?'proved-correction':review?.rationaleStatus==='uncertain'?'ambiguous':'supported-for-testing',missedOpportunity:correctionVerified?review.missedOpportunity:null,acceptedProofReceiptRef:correctionVerified?review.acceptedProofReceiptRef:null,evidenceRefs:reviewRow?[{kind:'actor-review',...reviewRow.reviewRef},{kind:'original-response',...saved.rawRef},{kind:'reviewer-receipt',...reviewRow.reviewerReceiptRef}]:[],retrospectiveRef:gameReview?.reviewRef??null,eligibilityReceipt:{nativeLegal:true,nonForced:!commit.forced&&packet.legalOptions.length>1,episodeComplete:!!outcome,replayVerified:replay.get(commit.episodeId)?.status==='passed',actorReviewFrozen:!!review,gameReviewFrozen:!!gameReview,materialChecksSupported,correctionVerified},limitations:['Model self-play discovery; not an expert answer key or playing-strength evidence.',...(review?.limitations??[])],provenance:'offline-llm-player',promotionEligible:false,runtimeActivated:false,exactDecisionFingerprint:sha(canonical({packet:comparable,choice:commit.selectedCandidateId})),eligible:ineligibleReason===null,ineligibleReason};
    if(row.eligible){const {eligible,ineligibleReason,...record}=row;validateExternalCase(record);}return row;
  });
}
export function curate(collector) {return selectCases(collectCandidates(collector),corpusCases(dirname(collector.root),collector.manifest.corpusId),collector.manifest.plan);}
