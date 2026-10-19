import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDecisionProposal } from '../../scripts/trix-scenario-collection/review.mjs';
import { validateGameProposal, makeReviewPacket, importReview } from '../../scripts/trix-scenario-collection/review.mjs';
import { selectCases, collectCandidates, corpusCases } from '../../scripts/trix-scenario-collection/curate.mjs';
import { exportCases, buildCategoryStrategies } from '../../scripts/trix-scenario-collection/export.mjs';
import { readExternalCases, validateExternalCase } from '../../scripts/trix-scenario-collection/external-reader.mjs';
import { nativeCall, seededDeck } from '../../scripts/trix-scenario-collection/runner.mjs';
import { canonical, projectPlayerPacket } from '../../scripts/trix-scenario-collection/contracts.mjs';
import { getBlob, jsonBytes, putBlob, readJournal, safePath, sha, withCorpusLock, writeImmutable } from '../../scripts/trix-scenario-collection/journal.mjs';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const packet={variant:'basic-solo',request:'diamonds',objective:'own-request-points',ownHand:['|S|♦|2|'],legalOptions:[{candidateId:'play:D2'},{candidateId:'play:C2'}]};
const job={decisionId:'d1',packetHash:'a'.repeat(64)};
function proposal(){return {decisionId:job.decisionId,packetHash:job.packetHash,reviewVersion:'trix-luna-review-1.0.0',provenance:'llm-proposal',rationaleStatus:'adequate',checks:['facts','objective','material-alternatives','tactical-purpose','uncertainty'].map(id=>({id,status:'supported',explanation:'Synthetic review validation fixture.',evidenceRefs:['actor:/ownHand/0']})),categoryIds:['DIA'],explanationIssues:[],hypotheses:[],missedOpportunity:null,limitations:['Synthetic protocol fixture.']};}
test('decision evidence resolves exact actor JSON pointers, rejecting fabricated paths and outcome refs',()=>{
  assert.doesNotThrow(()=>validateDecisionProposal(proposal(),job,packet));
  for(const ref of ['actor:/hiddenHands','actor:invented','outcome:/scoreTotals','actor:/ownHand/9','actor:/__proto__']){
    const p=proposal();p.checks[0].evidenceRefs=[ref];assert.throws(()=>validateDecisionProposal(p,job,packet));
  }
});
test('sampled/unbound and information-set corrections remain hypotheses; forced decisions have no correction',()=>{
  const p=proposal();p.missedOpportunity={alternativeCandidateId:'play:C2',objective:'own-request-points',advantage:20,proofKind:'native-objective-dominance',proofRef:{path:'blobs/'+'b'.repeat(64),sha256:'b'.repeat(64)},actorEvidenceRefs:['actor:/ownHand/0'],correction:'Synthetic sampled preference, not a proved better move.'};
  const result=validateDecisionProposal(p,job,packet,{verifyProof:()=>({verified:true})});assert.equal(result.missedOpportunity,null);assert.equal(result.hypotheses.length,1);assert.ok(result.hypotheses[0].counterexamplesToSeek.length);
  p.missedOpportunity.proofKind='information-set-exhaustive';assert.equal(validateDecisionProposal(p,job,packet).missedOpportunity,null);
  p.missedOpportunity.alternativeCandidateId='play:H2';assert.throws(()=>validateDecisionProposal(p,job,packet),/Illegal/);
  const forced=proposal();forced.rationaleStatus='forced';assert.doesNotThrow(()=>validateDecisionProposal(forced,job,{...packet,legalOptions:[packet.legalOptions[0]]}));
  forced.missedOpportunity=p.missedOpportunity;assert.throws(()=>validateDecisionProposal(forced,job,{...packet,legalOptions:[packet.legalOptions[0]]}),/Forced/);
});
test('only an exact positive native proof receipt can retain a corrective claim under the actor objective',()=>{
  const p=proposal(),proofRef={path:'blobs/'+'b'.repeat(64),sha256:'b'.repeat(64)},reviewJob={...job,selectedCandidateId:'play:D2'},actorPacket={...packet,pin:{gameId:'trix',variantId:'basic-solo'}};
  p.missedOpportunity={alternativeCandidateId:'play:C2',objective:'own-request-points',advantage:10,proofKind:'native-objective-dominance',proofRef,actorEvidenceRefs:['actor:/ownHand/0'],correction:'Synthetic proof-binding fixture.'};
  const receipt={verified:true,packetHash:job.packetHash,pin:actorPacket.pin,originalCandidateId:'play:D2',alternativeCandidateId:'play:C2',objective:'own-request-points',advantage:10,proofRef};
  assert.deepEqual(validateDecisionProposal(p,reviewJob,actorPacket,{verifyProof:()=>receipt}).missedOpportunity,p.missedOpportunity);
  for(const change of [{objective:'own-minus-opponent-margin'},{advantage:9},{packetHash:'c'.repeat(64)},{originalCandidateId:'play:C2'},{pin:{gameId:'trix',variantId:'basic-partners'}}])assert.equal(validateDecisionProposal(p,reviewJob,actorPacket,{verifyProof:()=>({...receipt,...change})}).missedOpportunity,null);
});
const repo=resolve(import.meta.dirname,'../..'),binary=resolve(repo,'.local/evaluation/trix-scenarios/native/trixcollection.exe');
const plan=JSON.parse(readFileSync(resolve(repo,'planning/implementation/coach-lab/trix-scenario-collection/campaign.plan.json'),'utf8'));
function selectable(index:number,variant='basic-solo',request='diamonds',familyId='family-'+index){return {caseId:'case-'+index,decisionId:String(index).padStart(5,'0'),variant,request,familyId,tags:['DIA','HK','Q','LUT','VOID','COMB','DBL','INFER','END',...(variant.endsWith('partners')?['TEAM']:[])],primaryCategory:'DIA',exactDecisionFingerprint:'fingerprint-'+index,eligible:true};}
test('1001 diverse candidates observe the 1000 and 200/200/200/400 caps with explicit shortfall; Basic contracts cap at 50',()=>{
  let i=0;const rows=plan.phases.flatMap((phase:any)=>phase.requests.flatMap((request:string)=>Array.from({length:phase.requestTargets[request]+1},()=>selectable(i++,phase.variant,request))));
  const result=selectCases(rows,[],plan);assert.equal(result.selected.length,1000);assert.deepEqual(result.coverage.byVariant,{'basic-solo':200,'complex-solo':200,'basic-partners':200,'complex-partners':400});assert.equal(result.coverage.byRequest['basic-solo:diamonds'],50);assert.ok(result.rejections.length>0);assert.ok(result.shortfalls.every((s:any)=>s.missing===0));
  const excess=structuredClone(plan);excess.phases[0].maxCases=201;assert.throws(()=>selectCases([],[],excess),/Unapproved/);
  assert.throws(()=>selectCases([],[...result.selected,selectable(9000)],plan),/exceeds cap/);
});
test('family twins, exact observation/actions and weak/incomplete cases do not inflate counts',()=>{
  const family=Array.from({length:9},(_,i)=>selectable(i,'basic-solo','diamonds','same-family'));
  const result=selectCases(family,[],plan);assert.equal(result.selected.length,8);assert.equal(result.rejections[0].reason,'family-cap');
  const duplicate={...selectable(100),exactDecisionFingerprint:family[0].exactDecisionFingerprint};
  const excluded=['forced','incomplete-episode','inadequate-rationale-without-proof'].map((reason,i)=>({...selectable(200+i),eligible:false,ineligibleReason:reason}));
  const next=selectCases([duplicate,...excluded],result.selected,plan);assert.equal(next.selected.length,0);assert.equal(next.coverage.total,8);assert.equal(next.rejections.length,4);
  assert.equal(selectCases([family[0]],result.selected,plan).coverage.total,8);
});
function storedFixture(){
  const home=mkdtempSync(resolve(tmpdir(),'trix-review-export-')),root=resolve(home,'synthetic-run');mkdirSync(root);
  const frame=nativeCall(binary,'start',{variant:'basic-solo',request:'diamonds',id:'synthetic-episode',deck:seededDeck('review-export-synthetic')});
  const actorPacket=projectPlayerPacket(frame.nativeActorPacket,frame.pin,frame.revision,'synthetic-invocation',frame.rules);
  assert.ok(actorPacket.legalOptions.length>1);
  const nativeChoice=frame.nativeActorPacket.candidates[0],response={card:actorPacket.legalOptions[0].card,reasoning:'Synthetic validation fixture; no Luna collection.',confidence:99};
  const rawRef=putBlob(root,jsonBytes(response)),packetRef=putBlob(root,actorPacket),saved={rawRef,response,receiptRef:putBlob(root,{hostAgentId:'synthetic-player-context'}),candidateId:nativeChoice.id,admission:{admitted:true},job:{packetRef,parentThreadId:'synthetic-coordinator'}};
  const commit={decisionId:`synthetic-episode:${frame.revision}:${actorPacket.actor}`,episodeId:'synthetic-episode',familyId:'synthetic-family',variant:'basic-solo',request:'diamonds',revision:frame.revision,actor:actorPacket.actor,phase:'playing',forced:false,selectedCandidateId:nativeChoice.id,responseHash:rawRef.sha256,savedRef:putBlob(root,saved)};
  const review={...proposal(),decisionId:commit.decisionId,packetHash:packetRef.sha256};
  const actorReview={stage:'decision',subjectId:commit.decisionId,reviewRef:putBlob(root,review),originalRef:putBlob(root,review),reviewerReceiptRef:putBlob(root,{contextMode:'independent-review',responseHash:sha(jsonBytes(review))})};
  const nativeOutcome=completedNativeFixture(frame);
  const outcome={episodeId:commit.episodeId,outcomeRef:putBlob(root,nativeOutcome)};
  const gameProposal={episodeId:commit.episodeId,reviewVersion:'trix-luna-game-review-1.0.0',provenance:'llm-proposal',complete:true,quality:'insufficient-evidence',summary:'Synthetic export schema fixture, not a collected model game.',seatSummaries:[0,1,2,3].map(actor=>({actor,summary:'Synthetic schema fixture.',reviewedDecisions:1,uncertainty:['Fixture only.'],correctionDecisionIds:[]})),nativeTotals:{scoreTotals:nativeOutcome.scoreTotals,componentTotals:nativeOutcome.componentTotals},supportedMissedOpportunityRefs:[],explanationIssueCounts:{adequate:1,'incomplete-explanation':0,'unsupported-claim':0,'incorrect-fact':0,uncertain:0,forced:0},usefulPatternRefs:[],counterexampleRefs:[],limitations:['Synthetic validation fixture.']};
  const gameReview={stage:'game',subjectId:commit.episodeId,reviewRef:putBlob(root,{...gameProposal,frozenDecisionReviewDigest:sha(jsonBytes([review]))})};
  const state={commits:[commit],reviews:[actorReview,gameReview],outcomes:[outcome]};
  const manifest={runId:'synthetic-run',corpusId:plan.corpusId,mode:'live',planHash:sha(jsonBytes(plan)),plan};writeImmutable(safePath(root,'manifest.json'),jsonBytes(manifest));
  const collector={root,manifest,state:()=>state,status:()=>({runId:manifest.runId,mode:manifest.mode,counters:{attempts:0,acceptedPlays:0,completedRequests:0}}),replay:()=>[{episodeId:commit.episodeId,status:'passed',completedTricks:13}]};
  return {home,collector,state,review,actorReview,actorPacket,saved,commit,gameProposal};
}
let cachedOutcome;
function completedNativeFixture(start){
  if(cachedOutcome)return cachedOutcome;
  let frame=start;const choices=[];
  while(!frame.outcome){const p=frame.nativeActorPacket,candidateId=p.candidates[0].id;choices.push({actor:p.seat,candidateId});frame=nativeCall(binary,'commit',{pin:frame.pin,snapshot:frame.snapshot,expectedRevision:frame.revision,actor:p.seat,candidateId});}
  const replay=nativeCall(binary,'replay',{variant:'basic-solo',request:'diamonds',id:'synthetic-episode',deck:seededDeck('review-export-synthetic'),choices});assert.deepEqual(frame.outcome,replay.outcome);return cachedOutcome=frame.outcome;
}
test('eligibility excludes fixture, forced, incomplete, weak uncertain rationale and missing replay',()=>{
  const f=storedFixture();assert.equal(collectCandidates(f.collector)[0].eligible,true);
  f.collector.manifest.mode='fixture';assert.equal(collectCandidates(f.collector)[0].ineligibleReason,'fixture-not-live-data');f.collector.manifest.mode='live';
  f.commit.forced=true;assert.equal(collectCandidates(f.collector)[0].ineligibleReason,'forced');f.commit.forced=false;
  const outcome=f.state.outcomes.pop();assert.equal(collectCandidates(f.collector)[0].ineligibleReason,'incomplete-episode');f.state.outcomes.push(outcome);
  f.review.rationaleStatus='uncertain';f.review.checks[0].status='unknown';f.actorReview.reviewRef=putBlob(f.collector.root,f.review);f.state.reviews[1].reviewRef=putBlob(f.collector.root,{...f.gameProposal,frozenDecisionReviewDigest:sha(jsonBytes([f.review]))});
  assert.equal(collectCandidates(f.collector)[0].ineligibleReason,'inadequate-rationale-without-proof');
  f.collector.replay=()=>[];assert.equal(collectCandidates(f.collector)[0].ineligibleReason,'replay-unverified');
});
test('versioned export reader verifies digests, immutable originals, provenance, category evidence and corpus revisions',()=>{
  const f=storedFixture(),first=exportCases(f.collector),directory=safePath(f.collector.root,first.directory),read=readExternalCases(directory);
  assert.equal(read.cases.length,1);assert.equal(read.cases[0].originalRationale,f.saved.response.reasoning);assert.equal(read.cases[0].selfReportedConfidence,99);
  assert.equal(read.cases[0].provenance,'offline-llm-player');assert.equal(read.cases[0].promotionEligible,false);assert.equal(read.cases[0].runtimeActivated,false);
  assert.equal(read.strategies.length,1);assert.equal(read.strategies[0].evidenceLevel,'hypothesis');assert.deepEqual(read.strategies[0].supportingCaseIds,[read.cases[0].caseId]);assert.ok(read.strategies[0].validationNeeded.length>0);
  assert.equal(corpusCases(f.home,plan.corpusId).length,1);assert.equal(exportCases(f.collector).cases,1);assert.equal(corpusCases(f.home,plan.corpusId).length,1);
  const counterfeit={...read.cases[0],registeredAnalysis:{},provenance:'deterministic-policy'};assert.throws(()=>validateExternalCase(counterfeit),/schema/);
  const changed=structuredClone(f.saved);changed.response.reasoning='Changed original';changed.rawRef=putBlob(f.collector.root,jsonBytes(changed.response));f.commit.responseHash=changed.rawRef.sha256;f.commit.savedRef=putBlob(f.collector.root,changed);
  assert.throws(()=>exportCases(f.collector),/Immutable case revision changed/);
  const path=safePath(directory,'cases.jsonl');writeFileSync(path,readFileSync(path,'utf8').replace('Synthetic validation','Tampered validation'));assert.throws(()=>readExternalCases(directory),/digest mismatch/);assert.throws(()=>corpusCases(f.home,plan.corpusId),/digest mismatch/);
});
test('a corpus lock excludes a simultaneous exporter from another run',()=>{
  const f=storedFixture();withCorpusLock(f.home,plan.corpusId,()=>assert.throws(()=>exportCases(f.collector),/already owned/));
});
test('review jobs hide confidence and outcomes, freeze original proposals and enforce independent receipts',()=>{
  const f=storedFixture();f.state.reviews=[];
  f.collector.templateRoot=resolve(repo,'planning/implementation/coach-lab/trix-scenario-collection/prompts');
  f.collector.state=()=>({...f.state,reviews:[...f.state.reviews,...readJournal(f.collector.root).filter(e=>e.kind==='review-imported').map(e=>e.data)]});
  assert.throws(()=>makeReviewPacket(f.collector,'game'),/Freeze every decision review/);
  const {job:reviewJob}=makeReviewPacket(f.collector,'decision');const prompt=getBlob(f.collector.root,reviewJob.promptRef,false).toString('utf8');
  assert.ok(!prompt.includes('"confidence":99'));assert.ok(!prompt.includes('"nativeTerminalPhase"'));
  const original={...f.review};const receipt={reviewerId:'synthetic-independent-reviewer',promptHash:reviewJob.promptHash,responseHash:sha(jsonBytes(original)),contextMode:'independent-review'};
  assert.throws(()=>importReview(f.collector,reviewJob,original,{...receipt,contextMode:'player-context'}));
  assert.throws(()=>importReview(f.collector,reviewJob,original,{...receipt,reviewerId:'synthetic-player-context'}),/Player context/);
  assert.throws(()=>importReview(f.collector,reviewJob,original,{...receipt,reviewerId:'synthetic-coordinator'}),/Coordinator context/);
  const first=importReview(f.collector,reviewJob,original,receipt);assert.deepEqual(getBlob(f.collector.root,first.originalRef),original);
  assert.deepEqual(importReview(f.collector,reviewJob,original,receipt),first);
  const changed={...original,limitations:['Changed revision']};assert.throws(()=>importReview(f.collector,reviewJob,changed,{...receipt,responseHash:sha(jsonBytes(changed))}),/Conflicting immutable review/);
});
test('retrospective reviews resolve frozen references, count every seat and quote exact native totals',()=>{
  const f=storedFixture(),reviews=[0,1,2,3].map(actor=>({...f.review,decisionId:'synthetic-seat-'+actor})),commits=reviews.map((r,actor)=>({decisionId:r.decisionId,actor})),native=getBlob(f.collector.root,f.state.outcomes[0].outcomeRef);
  const game={...f.gameProposal,explanationIssueCounts:{...f.gameProposal.explanationIssueCounts,adequate:4}},gameJob={episodeId:f.commit.episodeId,frozenDecisionReviewDigest:sha(jsonBytes(reviews))},context={native,reviews,commits,replay:{status:'passed',completedTricks:13}};
  assert.doesNotThrow(()=>validateGameProposal(game,gameJob,context));
  for(const change of [(p:any)=>p.nativeTotals.scoreTotals[0].total++,(p:any)=>p.usefulPatternRefs=['nonexistent'],(p:any)=>p.supportedMissedOpportunityRefs=[reviews[0].decisionId],(p:any)=>p.seatSummaries[0].actor=1,(p:any)=>p.seatSummaries[0].reviewedDecisions=2,(p:any)=>p.explanationIssueCounts.adequate=3]){const p=structuredClone(game);change(p);assert.throws(()=>validateGameProposal(p,gameJob,context));}
  assert.throws(()=>validateGameProposal(game,{...gameJob,frozenDecisionReviewDigest:'a'.repeat(64)},context),/Frozen decision reviews changed/);
});
test('strategy evidence stays hypothetical without a reviewed counterexample and original observation changes fail validation',()=>{
  const f=storedFixture(),candidate=collectCandidates(f.collector)[0],{eligible,ineligibleReason,...row}=candidate;
  const draft=buildCategoryStrategies([row])[0];assert.equal(draft.evidenceLevel,'hypothesis');assert.equal(draft.counterexampleCaseIds.length,0);
  const bad=structuredClone(row);bad.actorPacket.ownHand[0]='|S|♦|A|';assert.throws(()=>validateExternalCase(bad));
  assert.deepEqual(buildCategoryStrategies([]),[]);
});
