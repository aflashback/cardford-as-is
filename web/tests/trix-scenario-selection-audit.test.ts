import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { selectCases, requestScoringExhausted, collectCandidates } from '../../scripts/trix-scenario-collection/curate.mjs';
import { deriveSelectionExport, verifyNativeCompatibility, assertDerivationQuiescent } from '../../scripts/trix-scenario-collection/derived-export.mjs';
import { nativeCall, seededDeck, sourceHashes } from '../../scripts/trix-scenario-collection/runner.mjs';
import { projectPlayerPacket } from '../../scripts/trix-scenario-collection/contracts.mjs';
import { appendEvent, getBlob, jsonBytes, putBlob, readJournal, safePath, sha, writeImmutable } from '../../scripts/trix-scenario-collection/journal.mjs';
import { preserveBuild, sourceDigest } from '../../scripts/coach-lab-builds.mjs';
import { readExternalCases } from '../../scripts/trix-scenario-collection/external-reader.mjs';

const repo=resolve(import.meta.dirname,'../..');
const plan=JSON.parse(readFileSync(resolve(repo,'planning/implementation/coach-lab/trix-scenario-collection/campaign.plan.json'),'utf8'));
function settled(request:string,cards:string[]){return {variant:'basic-solo',request,completedTricks:[{plays:cards.map(card=>({card}))}],currentTrick:{plays:[]}};}
function row(packet){return {caseId:'synthetic-case',decisionId:'synthetic-decision',variant:packet.variant,request:packet.request,familyId:'synthetic-family',tags:['INFER'],primaryCategory:'INFER',exactDecisionFingerprint:'synthetic-fingerprint',actorPacket:packet,eligible:true};}
test('a nonforced adequate reviewed king decision after public capture cannot fill quota',()=>{
  const p=settled('king',['|S|♥|K|']);
  const selected=selectCases([row(p)],[],plan);assert.equal(selected.selected.length,0);assert.equal(selected.rejections[0].reason,'request-scoring-exhausted');
});
test('only completed public captures exhaust card requests; doubles and trick requests retain correct treatment',()=>{
  const king=settled('king',[]);king.currentTrick.plays=[{card:'|E|♥|K|'}];assert.equal(requestScoringExhausted(king),false);
  king.completedTricks[0].plays=king.currentTrick.plays;assert.equal(requestScoringExhausted(king),true);
  const queens=settled('queens',['|S|♠|Q|','|W|♥|Q|','|E|♣|Q|']);queens.currentTrick.plays=[{card:'|N|♦|Q|'}];assert.equal(requestScoringExhausted(queens),false);
  queens.completedTricks[0].plays.push(queens.currentTrick.plays[0]);assert.equal(requestScoringExhausted(queens),true);
  const diamonds=settled('diamonds',['2','3','4','5','6','7','8','9','10','J','Q','K'].map(r=>`|S|♦|${r}|`));assert.equal(requestScoringExhausted(diamonds),false);diamonds.completedTricks[0].plays.push({card:'|E|♦|A|'});assert.equal(requestScoringExhausted(diamonds),true);
  for(const packet of [king,queens])for(const variant of ['basic-solo','basic-partners']){
    assert.equal(requestScoringExhausted({...packet,variant,declarations:[{cards:['|S|♥|K|','|W|♦|Q|']}],publicScoresAndBonusFacts:{withheldBonuses:[{card:'|♥|K|'}]}}),true,'Double debit and bonus are settled with their public capture');
  }
  assert.equal(requestScoringExhausted({...king,request:'lutoosh'}),false);
  assert.equal(requestScoringExhausted({...queens,variant:'complex-solo',request:'complex'}),false);
  assert.equal(requestScoringExhausted({...diamonds,variant:'complex-partners',request:'complex'}),false);
  assert.throws(()=>selectCases([], [row(king)],plan),/Previously published scoring-exhausted case/);
});
test('a family cap selects all available usable stages and verified corrections without ranking confidence or outcomes',()=>{
  const candidates=['opening','middle','late'].flatMap((stage,s)=>Array.from({length:10},(_,i)=>({...row(settled('diamonds',[])),caseId:`case-${s}-${i}`,decisionId:`decision-${s}-${String(i).padStart(2,'0')}`,stage,exactDecisionFingerprint:`fp-${s}-${i}`,selfReportedConfidence:100-i})));
  candidates.at(-1).actionAssessment='proved-correction';candidates.at(-1).eligibilityReceipt={correctionVerified:true};
  const selection=selectCases(candidates,[],plan);assert.equal(selection.selected.length,8);assert.deepEqual(new Set(selection.selected.map(c=>c.stage)),new Set(['opening','middle','late']));assert.ok(selection.selected.some(c=>c.caseId===candidates.at(-1).caseId));assert.equal(selection.coverage.byFamily['synthetic-family'],8);
  const prior=candidates.slice(0,6);const next=selectCases(candidates,prior,plan);assert.equal(next.coverage.total,8);assert.ok(next.selected.some(c=>c.stage==='middle'));assert.ok(next.selected.some(c=>c.stage==='late'));assert.ok(prior.every(p=>next.selected.some(c=>c.caseId===p.caseId)));
});
const binary=resolve(repo,'.local/evaluation/trix-scenarios/native/trixcollection.exe');
let completedFixture,partialFixture;
test('native revision-50 King and Queens positions retain raw two-option decisions while selection excludes them',()=>{
  for(const [request,seed]of [['king','exhaustion-0'],['queens','exhaustion-3']]){
    let frame=nativeCall(binary,'start',{variant:'basic-solo',request,id:'synthetic-exhaustion',deck:seededDeck(seed)});
    let earlyPacket;const choices=[];
    while(frame.revision<50){const n=frame.nativeActorPacket;if(!earlyPacket&&n.phase==='playing'&&n.candidates.length>1)earlyPacket=projectPlayerPacket(n,frame.pin,frame.revision,'synthetic-early',frame.rules);choices.push({actor:n.seat,candidateId:n.candidates[0].id});frame=nativeCall(binary,'commit',{pin:frame.pin,snapshot:frame.snapshot,expectedRevision:frame.revision,actor:n.seat,candidateId:n.candidates[0].id});}
    assert.equal(frame.revision,50);const packet=projectPlayerPacket(frame.nativeActorPacket,frame.pin,frame.revision,'synthetic-exhaustion-invocation',frame.rules);
    assert.equal(packet.legalOptions.length,2);assert.equal(requestScoringExhausted(packet),true);
    const selected=selectCases([row(packet)],[],plan);assert.equal(selected.selected.length,0);assert.equal(selected.rejections[0].reason,'request-scoring-exhausted');
    const root=mkdtempSync(resolve(tmpdir(),'trix-exhaustion-raw-')),option=packet.legalOptions[0],response={card:option.card,reasoning:'Synthetic exhausted-request fixture, retained unchanged.',confidence:95},rawRef=putBlob(root,jsonBytes(response)),packetRef=putBlob(root,packet);
    const commit={decisionId:`synthetic-exhaustion:${packet.nativeRevision}:${packet.actor}`,episodeId:'synthetic-exhaustion',familyId:'synthetic-family',variant:packet.variant,request,revision:packet.nativeRevision,actor:packet.actor,phase:'playing',forced:false,selectedCandidateId:option.candidateId,responseHash:rawRef.sha256,savedRef:putBlob(root,{response,rawRef,candidateId:option.candidateId,job:{packetRef},admission:{admitted:true}})};
    const review={decisionId:commit.decisionId,packetHash:packetRef.sha256,reviewVersion:'trix-luna-review-1.0.0',provenance:'llm-proposal',rationaleStatus:'adequate',checks:['facts','objective','material-alternatives','tactical-purpose','uncertainty'].map(id=>({id,status:'supported',explanation:'Synthetic review fixture.',evidenceRefs:['actor:/ownHand/0']})),categoryIds:[request==='king'?'HK':'Q'],explanationIssues:[],hypotheses:[],missedOpportunity:null,limitations:['Synthetic test review; not a model review.']};
    const reviews=[{stage:'decision',subjectId:commit.decisionId,reviewRef:putBlob(root,review),originalRef:putBlob(root,review),reviewerReceiptRef:putBlob(root,{contextMode:'independent-review',responseHash:sha(jsonBytes(review))})}];const collector={root,manifest:{mode:'live',runId:'synthetic-run',corpusId:plan.corpusId},state:()=>({commits:[commit],reviews,outcomes:[]}),replay:()=>[]};
    const candidate=collectCandidates(collector)[0];assert.equal(candidate.ineligibleReason,'request-scoring-exhausted');assert.equal(candidate.rationaleAssessment,'adequate');assert.equal(candidate.originalRationale,response.reasoning);assert.equal(candidate.selfReportedConfidence,95);assert.equal(collector.state().commits.length,1);assert.deepEqual(getBlob(root,reviews[0].reviewRef),review);
    if(request==='king'){
      while(!frame.outcome){const n=frame.nativeActorPacket;choices.push({actor:n.seat,candidateId:n.candidates[0].id});frame=nativeCall(binary,'commit',{pin:frame.pin,snapshot:frame.snapshot,expectedRevision:frame.revision,actor:n.seat,candidateId:n.candidates[0].id});}
      assert.deepEqual(nativeCall(binary,'replay',{variant:'basic-solo',request,id:'synthetic-exhaustion',deck:seededDeck(seed),choices}).outcome,frame.outcome);completedFixture={packet:earlyPacket,outcome:frame.outcome};
    }else partialFixture={packet,frame};
  }
});
test('paused partial checkpoints are allowed while active drivers and unresolved player/reviewer calls block derivation',()=>{
  const root=mkdtempSync(resolve(tmpdir(),'trix-derived-guard-')),state={episode:{episodeId:'partial'},pending:{jobId:'prepared'},paused:true,claimed:null,intent:null,rows:[]};
  assert.doesNotThrow(()=>assertDerivationQuiescent(root,state));assert.throws(()=>assertDerivationQuiescent(root,{...state,paused:false}),/Pause the active request/);assert.throws(()=>assertDerivationQuiescent(root,{...state,claimed:{jobId:'inflight'}}),/outstanding player/);
  const rows=[{kind:'review-dispatch-claimed',data:{job:{jobId:'review-inflight'}}}];assert.throws(()=>assertDerivationQuiescent(root,{...state,rows}),/outstanding reviewer/);assert.doesNotThrow(()=>assertDerivationQuiescent(root,{...state,rows:[...rows,{kind:'review-attempt-settled',data:{jobId:'review-inflight'}}]}));
  writeImmutable(safePath(root,'private/driver.lock'),jsonBytes({pid:process.pid}));assert.throws(()=>assertDerivationQuiescent(root,state),/Stop the live collection driver/);
});
test('native compatibility rejects changed, added and removed server Go/JSON inputs and module dependencies',()=>{
  const hashes={'go.mod':'a','go.sum':'b','server/game.go':'c','server/internal/contracts/schema.generated.json':'schema','scripts/export.mjs':'old'};assert.doesNotThrow(()=>verifyNativeCompatibility(hashes,{...hashes,'scripts/export.mjs':'new'}));
  assert.throws(()=>verifyNativeCompatibility(hashes,{...hashes,'server/game.go':'changed'}),/Native source changed/);
  assert.throws(()=>verifyNativeCompatibility(hashes,{...hashes,'server/new.go':'new'}),/Native source file set changed/);
  const removed={...hashes};delete removed['server/game.go'];assert.throws(()=>verifyNativeCompatibility(hashes,removed),/Native source file set changed/);
  assert.throws(()=>verifyNativeCompatibility(hashes,{...hashes,'go.sum':'new'}),/Native source changed/);
  assert.throws(()=>verifyNativeCompatibility(hashes,{...hashes,'server/internal/contracts/schema.generated.json':'changed'}),/Native source changed/);
  assert.throws(()=>verifyNativeCompatibility(hashes,{...hashes,'server/new.schema.json':'new'}),/Native source file set changed/);
  const removedJson={...hashes};delete removedJson['server/internal/contracts/schema.generated.json'];assert.throws(()=>verifyNativeCompatibility(hashes,removedJson),/Native source file set changed/);
});
test('derived selection freezes its exporter, preserves original manifest/build and records explicit publication audit',async()=>{
  const root=mkdtempSync(resolve(tmpdir(),'trix-derived-selection-')),currentHashes=sourceHashes(),originalHashes={...currentHashes};
  // Synthetic older source graph differs only by lacking the new audit module.
  delete originalHashes['scripts/trix-scenario-collection/derived-export.mjs'];
  const pins={sourceDigest:sourceDigest(originalHashes),binaryDigest:sha(readFileSync(binary))},originalBuild=preserveBuild(root,repo,originalHashes,pins,binary);
  const manifest={schemaVersion:'trix-scenario-run-1.0.0',runId:'synthetic-derived-selection',corpusId:plan.corpusId,mode:'live',plan,planHash:sha(jsonBytes(plan)),sourceHashes:originalHashes,build:{...pins,sourceArchive:originalBuild.sourceRoot,binaryPath:originalBuild.binaryPath}};
  writeImmutable(safePath(root,'manifest.json'),jsonBytes(manifest));appendEvent(root,'initialized',{manifestHash:sha(jsonBytes(manifest))});
  function commitFor(packet,episodeId){
    const option=packet.legalOptions[0],response={card:option.card,reasoning:'Synthetic admitted-record test fixture; no live model game.',confidence:80},rawRef=putBlob(root,jsonBytes(response)),packetRef=putBlob(root,packet);
    return {decisionId:`${episodeId}:${packet.nativeRevision}:${packet.actor}`,episodeId,familyId:episodeId+'-family',variant:packet.variant,request:packet.request,revision:packet.nativeRevision,actor:packet.actor,phase:'playing',forced:false,selectedCandidateId:option.candidateId,responseHash:rawRef.sha256,savedRef:putBlob(root,{response,rawRef,candidateId:option.candidateId,job:{packetRef},admission:{admitted:true}})};
  }
  const complete=commitFor(completedFixture.packet,'completed-fixture'),partial=commitFor({...partialFixture.packet,completedTricks:[]} ,'partial-fixture');
  // Removing settled history only in this explicit unit fixture makes the partial
  // exclusion test target episode completeness rather than scoring exhaustion.
  const saved=getBlob(root,complete.savedRef),review={decisionId:complete.decisionId,packetHash:saved.job.packetRef.sha256,reviewVersion:'trix-luna-review-1.0.0',provenance:'llm-proposal',rationaleStatus:'adequate',checks:['facts','objective','material-alternatives','tactical-purpose','uncertainty'].map(id=>({id,status:'supported',explanation:'Synthetic test review.',evidenceRefs:['actor:/ownHand/0']})),categoryIds:['HK'],explanationIssues:[],hypotheses:[],missedOpportunity:null,limitations:['Synthetic protocol fixture.']};
  const decisionReview={stage:'decision',subjectId:complete.decisionId,reviewRef:putBlob(root,review),originalRef:putBlob(root,review),reviewerReceiptRef:putBlob(root,{contextMode:'independent-review',responseHash:sha(jsonBytes(review))})};
  const nativeOutcome=completedFixture.outcome,gameReview={episodeId:complete.episodeId,reviewVersion:'trix-luna-game-review-1.0.0',provenance:'llm-proposal',complete:true,quality:'insufficient-evidence',summary:'Synthetic public-game export fixture.',seatSummaries:[0,1,2,3].map(actor=>({actor,summary:'Synthetic fixture.',reviewedDecisions:1,uncertainty:['Unit fixture.'],correctionDecisionIds:[]})),nativeTotals:{scoreTotals:nativeOutcome.scoreTotals,componentTotals:nativeOutcome.componentTotals},supportedMissedOpportunityRefs:[],explanationIssueCounts:{adequate:1,'incomplete-explanation':0,'unsupported-claim':0,'incorrect-fact':0,uncertain:0,forced:0},usefulPatternRefs:[],counterexampleRefs:[],limitations:['Synthetic protocol fixture.'],frozenDecisionReviewDigest:sha(jsonBytes([review]))};
  const originalManifestBytes=readFileSync(safePath(root,'manifest.json')),frameRef=putBlob(root,partialFixture.frame),state={rows:[],episode:{episodeId:partial.episodeId},frameRef,pending:{jobId:'prepared-partial'},claimed:null,intent:null,paused:true,commits:[complete,partial],reviews:[decisionReview,{stage:'game',subjectId:complete.episodeId,reviewRef:putBlob(root,gameReview)}],outcomes:[{episodeId:complete.episodeId,variant:complete.variant,request:complete.request,outcomeRef:putBlob(root,nativeOutcome)}]};
  const collector={root,manifest,native:()=>{throw Error('The original native replay receipt was verified in the fixture above');},state:()=>state,replay:()=>[{episodeId:complete.episodeId,status:'passed',completedTricks:13}],status:()=>({runId:manifest.runId,mode:manifest.mode,status:'paused'})};
  const exported=await deriveSelectionExport(collector),read=readExternalCases(safePath(root,exported.directory));
  assert.equal(read.cases.length,1);assert.equal(read.cases[0].episodeId,complete.episodeId);assert.equal(read.coverage.rejections.find(r=>r.decisionId===partial.decisionId).reason,'incomplete-episode');assert.equal(state.episode.episodeId,partial.episodeId);assert.equal(state.frameRef,frameRef);assert.deepEqual(getBlob(root,frameRef),partialFixture.frame);
  assert.ok(readFileSync(safePath(root,'manifest.json')).equals(originalManifestBytes));assert.deepEqual(collector.manifest,manifest);
  assert.equal(read.manifest.sourceDigest,exported.selectionAudit.selectionSourceDigest);assert.notEqual(read.manifest.sourceDigest,manifest.build.sourceDigest);assert.equal(read.manifest.binaryDigest,manifest.build.binaryDigest);
  assert.equal(read.coverage.selectionAudit.originalSourceDigest,manifest.build.sourceDigest);assert.equal(read.coverage.selectionAudit.selectionPolicyVersion,'trix-selection-1.0.1');
  const lineage=getBlob(root,read.manifest.privateLineageRef);assert.deepEqual(lineage.selectionAudit,read.coverage.selectionAudit);
  assert.ok(readFileSync(safePath(root,`${exported.directory}/casebook.md`),'utf8').includes('Original player source: '+manifest.build.sourceDigest));
  const events=readJournal(root);assert.equal(events.at(-1).kind,'selection-audit');assert.equal(events.at(-1).data.derivedPublication,exported.directory);assert.deepEqual(getBlob(root,events.at(-1).data.derivedPublicationRef),exported.source);
  assert.equal(sha(readFileSync(originalBuild.binaryPath)),manifest.build.binaryDigest);assert.equal(sha(readFileSync(resolve(originalBuild.sourceRoot,'scripts/trix-scenario-collection/curate.mjs'))),manifest.sourceHashes['scripts/trix-scenario-collection/curate.mjs']);
  // The original archived reader's closed manifest schema still accepts the bundle.
  const oldReader=await import(new URL('file:///'+resolve(originalBuild.sourceRoot,'scripts/trix-scenario-collection/external-reader.mjs').replaceAll('\\','/')));assert.equal(oldReader.readExternalCases(safePath(root,exported.directory)).cases.length,1);
});
