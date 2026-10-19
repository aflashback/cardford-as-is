import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { envelope } from './coach-lab-contracts.test.ts';
import { createHash } from 'node:crypto';
import { prepareStrengthStudy, summarizeStrengthStudy, initializeStrengthStudy, loadStrengthStudy, runStrengthStudy, type StrengthConfig } from '../evaluation/multi-game/lab/strength.ts';
import { digest, validateDecision } from '../evaluation/multi-game/lab/contracts.ts';
import { decision } from './coach-lab-packets.test.ts';
const policy='trix-reasoning-1.0.0';
function cleanTemporaryStudy(path:string){const target=resolve(path);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('coach-strength-'));rmSync(target,{recursive:true,force:true});}
function config():StrengthConfig{return {schemaVersion:'coach-lab-strength-1.0.0',studyId:'test-study',stage:'development',families:[{id:'f1',seed:'fresh-one'},{id:'f2',seed:'fresh-two'}],rotations:[0,1],deployments:['one-seat','both-partners'],environments:[{id:'baseline-environment',seatPolicies:[0,1,2,3].map(seat=>({seat,id:'trix-deterministic-1.0.0',version:'1.0.0'}))}],usefulGain:20,maximumHarm:10,minFamilies:12,powerRationale:'Two-family mechanics pilot; twelve-family floor is not a power calculation.',multiplicityAdjustment:'Report each environment and deployment separately; no pooled superiority claim.'};}
function template(){const e=envelope();e.schemaVersion='coach-lab-run-2.0.0';e.base.schemaVersion='multi-game-evaluation-2.0.0';e.base.variant='trix-basic-partners';e.base.candidate.id=policy;e.base.reference.id='trix-deterministic-1.0.0';e.base.ruleProfile.id='trix-basic-partners-1.1.0';e.lab.selector={gameId:'trix',variantId:'basic-partners',moduleVersion:'2.1.0',ruleProfileId:e.base.ruleProfile.id};e.lab.seatPolicies=[0,1,2,3].map(seat=>({seat,id:policy,version:'1.0.0'}));e.lab.config={id:e.runId,variant:'basic-partners'};return e;}
function receipt(cell:ReturnType<typeof prepareStrengthStudy>['cells'][number],deltas:number[]){const e=cell.manifest;return {schemaVersion:'coach-lab-receipt-1.0.0',runId:e.runId,status:'complete',manifestHash:cell.manifestHash,sourceDigest:e.lab.sourceIdentity.sourceDigest,binaryDigest:e.lab.sourceIdentity.binaryDigest,decisions:0,committed:0,pending:0,forced:0,unforced:0,providerMode:'fixture',strengthClaim:false,errors:[],episodes:e.base.families.flatMap((f,fi)=>e.base.rotations.flatMap(rotation=>['reference','candidate'].map(arm=>({episodeId:'episode-'+createHash('sha256').update(e.runId+'\0'+f.id+`\0${rotation}\0${arm}`).digest('hex').slice(0,24),familyId:f.id,arm,status:'complete',reason:'',rounds:20,outcome:{scores:rotation%2===0?[arm==='candidate'?deltas[fi]:0,0]:[0,arm==='candidate'?deltas[fi]:0],rounds:20,winnerSeats:[0,2],winnerIds:['team-0']}}))))};}
test('paired study uses families as units and keeps deployment/environment cells separate',()=>{const study=prepareStrengthStudy(template(),config());assert.equal(study.cells.length,2);const summary=summarizeStrengthStudy(study,study.cells.map(cell=>({cellId:cell.id,receipt:receipt(cell,[10,30])})));for(const cell of summary.cells){assert.equal(cell.completePairs,4);assert.equal(cell.familyUnits,2);assert.equal(cell.meanPairedMargin,20);assert.equal(cell.status,'insufficient-evidence');assert.equal(cell.strengthClaim,false);}assert.deepEqual(study.cells.map(c=>c.manifest.base.seatAssignments.candidate),[[0],[0,2]]);});
test('missing or censored arm retains pair and excludes incomplete family without choosing winners',()=>{const study=prepareStrengthStudy(template(),config());const r=receipt(study.cells[0],[10,30]);r.episodes.pop();r.episodes[0].status='censored';const summary=summarizeStrengthStudy(study,[{cellId:study.cells[0].id,receipt:r}]);assert.equal(summary.cells[0].censoredPairs,1);assert.equal(summary.cells[0].missingPairs,1);assert.equal(summary.cells[0].familyUnits,0);assert.equal(summary.cells[0].meanPairedMargin,null);assert.equal(summary.cells[1].missingPairs,4);});
test('receipt identity, repeated episode, malformed terminal and unknown policy cannot pool',()=>{const study=prepareStrengthStudy(template(),config());const r=receipt(study.cells[0],[10,30]);assert.throws(()=>summarizeStrengthStudy(study,[{cellId:study.cells[1].id,receipt:r}]),/identity/i);r.episodes.push(r.episodes[0]);assert.throws(()=>summarizeStrengthStudy(study,[{cellId:study.cells[0].id,receipt:r}]),/duplicate/i);const bad={...config(),environments:[{id:'bad',seatPolicies:[0,1,2,3].map(seat=>({seat,id:'unknown-policy',version:'1.0.0'}))}]};assert.throws(()=>prepareStrengthStudy(template(),bad),/policy|schema/i);const repeated=config();repeated.families[1].seed=repeated.families[0].seed;assert.throws(()=>prepareStrengthStudy(template(),repeated),/seed/i);});
test('fresh validation pins the development protocol, refuses seed reuse and policy/environment changes',()=>{const dev=prepareStrengthStudy(template(),config());const v=config();v.stage='fresh-validation';v.studyId='test-validation';v.families=[{id:'v1',seed:'held-one'},{id:'v2',seed:'held-two'}];assert.doesNotThrow(()=>prepareStrengthStudy(template(),v,dev));v.families[0].seed='fresh-one';assert.throws(()=>prepareStrengthStudy(template(),v,dev),/seed/i);v.families[0].seed='held-one';v.environments[0].seatPolicies[1].id=policy;assert.throws(()=>prepareStrengthStudy(template(),v,dev),/frozen|protocol/i);assert.throws(()=>prepareStrengthStudy(template(),v),/parent/i);});

test('frontier studies retain history controls and independently pinned continuation environments',()=>{
 const frontier='trix-frontier-1.0.0',history='trix-history-1.0.0';
 const t=template();t.base.candidate.id=frontier;t.base.reference.id=history;t.lab.selector.moduleVersion='2.2.0';
 const c=config();c.environments=[{id:'history-environment',seatPolicies:[0,1,2,3].map(seat=>({seat,id:history,version:'1.0.0'}))},{id:'frontier-environment',seatPolicies:[0,1,2,3].map(seat=>({seat,id:frontier,version:'1.0.0'}))}];
 const dev=prepareStrengthStudy(t,c);
 assert.equal(dev.cells.length,4);
 for(const cell of dev.cells){assert.equal(cell.manifest.base.candidate.id,frontier);assert.equal(cell.manifest.base.reference.id,history);assert.ok(cell.manifest.lab.seatPolicies.every(pin=>pin.id===(cell.environment==='history-environment'?history:frontier)));assert.equal(cell.manifest.lab.selector.moduleVersion,'2.2.0');assert.equal(cell.manifest.lab.selector.ruleProfileId,'trix-basic-partners-1.1.0');}
 const v=structuredClone(c);v.stage='fresh-validation';v.studyId='frontier-validation';v.families=[{id:'v1',seed:'frontier-held-one'},{id:'v2',seed:'frontier-held-two'}];
 const validation=prepareStrengthStudy(t,v,dev);assert.equal(validation.parentHash,dev.studyHash);assert.equal(validation.formalConfirmationEligible,false);assert.equal(validation.strengthClaim,false);
 const changed=structuredClone(t);changed.base.candidate.id=history;changed.base.reference.id=frontier;assert.throws(()=>prepareStrengthStudy(changed,v,dev),/frozen|protocol/i);
 const invalid={...c,environments:[{...c.environments[0],seatPolicies:c.environments[0].seatPolicies.map(pin=>({...pin,version:'2.0.0'}))}]};assert.throws(()=>prepareStrengthStudy(t,invalid),/schema|policy/i);
});

test('ownership strength cells freeze history controls and independent ownership continuations without promotion',()=>{
 const ownership='trix-ownership-1.0.0',history='trix-history-1.0.0';
 const t=template();t.base.candidate.id=ownership;t.base.reference.id=history;t.lab.selector.moduleVersion='2.2.0';
 const c=config();c.environments=[{id:'history-environment',seatPolicies:[0,1,2,3].map(seat=>({seat,id:history,version:'1.0.0'}))},{id:'ownership-environment',seatPolicies:[0,1,2,3].map(seat=>({seat,id:ownership,version:'1.0.0'}))}];
 const dev=prepareStrengthStudy(t,c);
 assert.equal(dev.cells.length,4);
 for(const cell of dev.cells){assert.equal(cell.manifest.base.candidate.id,ownership);assert.equal(cell.manifest.base.reference.id,history);assert.ok(cell.manifest.lab.seatPolicies.every(pin=>pin.id===(cell.environment==='history-environment'?history:ownership)));assert.equal(cell.manifest.base.promotionAuthority,null);}
 const v=structuredClone(c);v.stage='fresh-validation';v.studyId='ownership-validation';v.families=[{id:'v1',seed:'ownership-held-one'},{id:'v2',seed:'ownership-held-two'}];
 const validation=prepareStrengthStudy(t,v,dev);assert.equal(validation.parentHash,dev.studyHash);assert.equal(validation.formalConfirmationEligible,false);assert.equal(validation.strengthClaim,false);
 const changed=structuredClone(t);changed.base.candidate.id=history;changed.base.reference.id=ownership;assert.throws(()=>prepareStrengthStudy(changed,v,dev),/frozen|protocol/i);
 const invalid:unknown={...c,environments:c.environments.map(environment=>environment.id==='ownership-environment'?{...environment,seatPolicies:environment.seatPolicies.map(pin=>pin.seat===0?{...pin,id:'trix-ownership-9.0.0'}:pin)}:environment)};assert.throws(()=>prepareStrengthStudy(t,invalid),/schema|policy/i);
});
test('environment repetitions never inflate family units or combine margins',()=>{const c=config();c.environments.push({id:'reasoning-environment',seatPolicies:[0,1,2,3].map(seat=>({seat,id:policy,version:'1.0.0'}))});const study=prepareStrengthStudy(template(),c);const summary=summarizeStrengthStudy(study,study.cells.map(cell=>({cellId:cell.id,receipt:receipt(cell,cell.environment==='baseline-environment'?[10,30]:[-20,-40])})));assert.equal(summary.cells.length,4);assert.deepEqual(summary.cells.map(c=>c.familyUnits),[2,2,2,2]);assert.deepEqual(summary.cells.map(c=>c.meanPairedMargin),[20,20,-30,-30]);});
test('terminal outcome requires native complete-session rounds and exact source identity',()=>{const study=prepareStrengthStudy(template(),config());const cell=study.cells[0];const short=receipt(cell,[10,30]);short.episodes[0].outcome.rounds=19;assert.throws(()=>summarizeStrengthStudy(study,[{cellId:cell.id,receipt:short}]),/full-session/i);const changed=receipt(cell,[10,30]);changed.binaryDigest='c'.repeat(64);assert.throws(()=>summarizeStrengthStudy(study,[{cellId:cell.id,receipt:changed}]),/binary identity/i);});
test('on-disk study cannot rewrite manifests or reserve development seeds for another study',()=>{const dir=mkdtempSync(join(tmpdir(),'coach-strength-'));try{const out=join(dir,'development'),registry=join(dir,'registry');const study=initializeStrengthStudy(template(),config(),out,{registryDirectory:registry});assert.equal(loadStrengthStudy(out).studyHash,study.studyHash);const other=config();other.studyId='other';assert.throws(()=>initializeStrengthStudy(template(),other,join(dir,'other'),{registryDirectory:registry}),/reserved/i);writeFileSync(join(out,'manifests',study.cells[0].id+'.json'),'{}');assert.throws(()=>loadStrengthStudy(out),/byte identity/i);}finally{cleanTemporaryStudy(dir);}});
test('batch decision allowance covers every declared episode rather than one native action cap',()=>{const study=prepareStrengthStudy(template(),config());for(const cell of study.cells)assert.equal(cell.manifest.base.maxDecisions,cell.manifest.lab.caps.maxActions*8);});
test('larger study shards finite native archives but aggregates all origin families within each cohort',()=>{const c=config();c.families=Array.from({length:21},(_,i)=>({id:'family-'+i,seed:'new-family-seed-'+i}));c.minFamilies=20;const study=prepareStrengthStudy(template(),c);assert.equal(study.cells.length,22);assert.ok(study.cells.every(c=>c.manifest.base.families.length<=2));const summary=summarizeStrengthStudy(study,study.cells.map(cell=>({cellId:cell.id,receipt:receipt(cell,[10,30])})));assert.equal(summary.cells.length,2);for(const cohort of summary.cells){assert.equal(cohort.familyUnits,21);assert.equal(cohort.completePairs,42);assert.equal(cohort.subruns.length,11);assert.equal(cohort.minimumFamiliesMet,true);}});

test('journal-only subrun reaches native resume without requiring an earlier derived export',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'coach-strength-'));try{
  const out=join(dir,'development');const study=initializeStrengthStudy(template(),config(),out,{registryDirectory:join(dir,'registry')});
  const path=join(out,'runs',study.cells[0].id,'private');mkdirSync(path,{recursive:true});writeFileSync(join(path,'journal.jsonl'),'retained interrupted journal');
  let reached=0;const options={maxCells:1,maxWallMs:1200000,resume:true,resolveBundle:()=>{reached++;throw Error('native-verifier-boundary');}};
  const result=await runStrengthStudy(out,options);
  assert.equal(reached,1);assert.equal(result.attempts.length,1);assert.match(result.attempts[0].error??'',/native-verifier-boundary/);
  assert.equal(result.summary.cells[0].missingPairs,4);
  await assert.rejects(()=>runStrengthStudy(out,{...options,resume:false}),/requires --resume/);
 }finally{cleanTemporaryStudy(dir);}
});

function summaryConsumptionFixture(){
 const c=config();c.environments.push({id:'reasoning-environment',seatPolicies:[0,1,2,3].map(seat=>({seat,id:policy,version:'1.0.0'}))});
 const study=prepareStrengthStudy(template(),c);
 const histories=[undefined,
  {eligible:false,coverage:'outside-scope',selectedChanged:false},
  {eligible:true,coverage:'complete',priorReasoningCandidateId:'play:DA',selectedChanged:true,comparisons:[{candidateId:'play:D3',worse:0,better:1}]},
  {eligible:true,coverage:'complete',selectedChanged:true,comparisons:[{candidateId:'play:D3',worse:1,better:1}]},
  {eligible:true,coverage:'complete',priorReasoningCandidateId:'play:D3',selectedChanged:false,comparisons:[{candidateId:'play:DA',worse:0,better:1}]},
 ];
 const inputs=study.cells.map((cell,index)=>{
  const r=receipt(cell,index<2?[10,30]:[-20,-40]);
  const rows=index===0?histories:index===2?[histories[1]]:[];
  const decisions=rows.map((history,i)=>validateDecision({...decision(),decisionId:'summary-'+cell.id+'-'+i,familyId:cell.manifest.base.families[0].id,episodeId:r.episodes[1].episodeId,originalAnalysis:history?{historyEvidence:history}:{}}));
  r.decisions=decisions.length;r.pending=decisions.length;r.unforced=decisions.length;
  if(index===2)r.episodes[0].status='censored';
  if(index===3)r.episodes.pop();
  return {cellId:cell.id,receipt:r,decisions};
 });
 return {study,inputs};
}

test('array strength summaries retain the pre-fix output and activation counters',()=>{
 const {study,inputs}=summaryConsumptionFixture();const summary=summarizeStrengthStudy(study,inputs);
 assert.equal(digest(summary),'7c6877ac090dbb99b3c903781928934a6e019e88ff25c72023494800033c81d8');
 assert.equal(createHash('sha256').update(JSON.stringify(summary)).digest('hex'),'0684e4d8034e5299df03b8064d4845bed6ce9c9ebfa6100fbdab16aa9e4b165d');
 assert.deepEqual(summary.cells[0].tacticActivation,{availableDecisions:4,eligibleDecisions:3,completeScopeDecisions:3,ambiguousScopeDecisions:1,dominanceAvailableDecisions:2,dominanceSelectedDecisions:1,choiceChangeMeasuredDecisions:4,selectedChangedDecisions:2});
 assert.equal(summary.cells[1].tacticActivation,null);assert.equal(summary.cells[2].censoredPairs,1);assert.equal(summary.cells[3].missingPairs,1);
 assert.deepEqual(summary.cells.map(cell=>cell.familyUnits),[2,2,1,1]);
});

test('lazy strength inputs are summarized before the next archive loads',()=>{
 const {study,inputs}=summaryConsumptionFixture();const expected=summarizeStrengthStudy(study,inputs);let consumed=0;
 function* archives(){
  // Reverse the read order to verify that final cohort ordering still comes
  // from the frozen study. A producer cannot advance before activation reads.
  for(const input of [...inputs].reverse()){
   let reads=0;
   const decisions=input.decisions.map(d=>({...d,get originalAnalysis(){reads++;return d.originalAnalysis;}}));
   yield {...input,decisions};
   assert.equal(reads,decisions.length,'Previous archive was retained without being summarized');consumed++;
  }
 }
 const actual=summarizeStrengthStudy(study,archives());
 assert.equal(consumed,study.cells.length);assert.deepEqual(actual,expected);
 assert.equal(digest(actual),'7c6877ac090dbb99b3c903781928934a6e019e88ff25c72023494800033c81d8');
 assert.equal(createHash('sha256').update(JSON.stringify(actual)).digest('hex'),'0684e4d8034e5299df03b8064d4845bed6ce9c9ebfa6100fbdab16aa9e4b165d');
});

test('lazy strength admission retains duplicate cell and unknown episode rejection',()=>{
 const {study,inputs}=summaryConsumptionFixture();
 function* duplicate(){yield inputs[0];yield inputs[0];}
 assert.throws(()=>summarizeStrengthStudy(study,duplicate()),/Duplicate cell input/);
 function* unknown(){yield {...inputs[0],cellId:'unknown-cell'};}
 assert.throws(()=>summarizeStrengthStudy(study,unknown()),/Unknown cell identity/);
 const invalid=structuredClone(inputs[0]);invalid.decisions[0].episodeId='unknown-episode';
 function* changedEpisode(){yield invalid;}
 assert.throws(()=>summarizeStrengthStudy(study,changedEpisode()),/Activation decision episode identity/);
});

const ownershipPolicy='trix-ownership-1.0.0';
function ownershipStudy(){const t=template();t.base.candidate.id=ownershipPolicy;t.base.reference.id='trix-history-1.0.0';t.lab.selector.moduleVersion='2.2.0';const c=config();c.families.push({id:'f3',seed:'fresh-three'});return prepareStrengthStudy(t,c);}
function ownershipRow(cell:ReturnType<typeof prepareStrengthStudy>['cells'][number],options:{rotation?:number;arm?:string;actor?:number;policy?:string;forced?:boolean;status?:'prepared'|'committed'|'failed';evidence?:unknown}={}){
 const rotation=options.rotation??0,actor=options.actor??rotation;const r=receipt(cell,[10,30]);const episode=r.episodes.find(e=>e.arm===(options.arm??'candidate')&&e.episodeId==='episode-'+createHash('sha256').update(cell.id+'\0'+cell.manifest.base.families[0].id+`\0${rotation}\0${options.arm??'candidate'}`).digest('hex').slice(0,24))!;
 const d=decision();d.actor=actor;d.actorPacket.seat=actor;d.policyPin={seat:actor,id:options.policy??ownershipPolicy,version:'1.0.0'};d.familyId=cell.manifest.base.families[0].id;d.episodeId=episode.episodeId;d.executionStatus=options.status??'committed';
 if(options.forced){d.legalCandidates=d.legalCandidates.slice(0,1);d.actorPacket.candidates=d.actorPacket.candidates.slice(0,1);d.forced=true;}
 d.originalAnalysis=options.evidence===undefined?{}:{ownershipEvidence:options.evidence};return validateDecision(d);
}
function ownershipEvidence(overrides:Record<string,unknown>={}){return {version:'trix-ownership-evidence-1.0.0',coverage:'four-twos-constraints',eligible:true,assignments:1,priorCandidateId:'play:D3',selectedChanged:false,suppressedOneTeam:false,...overrides};}

test('ownership activation counts only committed candidate execution at the rotated focal seats across shards',()=>{
 const study=ownershipStudy();const inputs=study.cells.map(cell=>{
  const decisions=cell.manifest.base.families.length===2?[
   ownershipRow(cell,{evidence:ownershipEvidence({priorCandidateId:'play:DA',selectedChanged:true,suppressedOneTeam:true})}),
   ownershipRow(cell,{rotation:1,forced:true,evidence:ownershipEvidence({suppressedOneTeam:true})}),
   ownershipRow(cell,{evidence:ownershipEvidence({coverage:'outside-scope',eligible:false})}),
   ownershipRow(cell,{evidence:ownershipEvidence({coverage:'historical-profile',eligible:false})}),
   ownershipRow(cell),
   ownershipRow(cell,{evidence:{coverage:'four-twos-constraints'}}),
   ownershipRow(cell,{status:'prepared',evidence:ownershipEvidence({priorCandidateId:'play:DA',selectedChanged:true})}),
   ownershipRow(cell,{arm:'reference',evidence:ownershipEvidence({priorCandidateId:'play:DA',selectedChanged:true})}),
   ownershipRow(cell,{rotation:1,actor:0,evidence:ownershipEvidence({priorCandidateId:'play:DA',selectedChanged:true})}),
   ownershipRow(cell,{policy:'trix-history-1.0.0',evidence:ownershipEvidence({priorCandidateId:'play:DA',selectedChanged:true})}),
  ]:[ownershipRow(cell,{evidence:ownershipEvidence()})];
  return {cellId:cell.id,receipt:receipt(cell,[10,30]),decisions};
 });
 const summary=summarizeStrengthStudy(study,inputs);const activation=summary.cells[0].ownershipActivation;
 assert.deepEqual(activation,{expectedDecisions:8,uncommittedDecisions:1,availableDecisions:5,missingExpectedTraceDecisions:1,malformedEvidenceDecisions:1,eligibleDecisions:3,forcedEligibleDecisions:1,unforcedEligibleDecisions:2,supportedScopeDecisions:3,outsideScopeDecisions:1,historicalProfileDecisions:1,suppressedOneTeamEligibleDecisions:2,choiceChangeMeasuredDecisions:5,selectedChangedDecisions:1});
 assert.equal(summary.cells[0].tacticActivation,null);
 assert.equal(summary.cells[0].subruns[0].ownershipActivation?.expectedDecisions,7);
 assert.equal(summary.cells[0].subruns[1].ownershipActivation?.expectedDecisions,1);
});

test('ownership activation leaves absent evidence unavailable and records missing expected traces separately',()=>{
 const study=ownershipStudy(),cell=study.cells[0];
 const absent=summarizeStrengthStudy(study,[]);assert.equal(absent.cells[0].ownershipActivation,null);
 const missing=summarizeStrengthStudy(study,[{cellId:cell.id,receipt:receipt(cell,[10,30]),decisions:[ownershipRow(cell)]}]);
 const activation=missing.cells[0].ownershipActivation!;
 assert.equal(activation.availableDecisions,0);assert.equal(activation.missingExpectedTraceDecisions,1);
});

test('ownership activation includes both rotated focal partners only when both are assigned the candidate',()=>{
 const study=ownershipStudy();const inputs=study.cells.map(cell=>({cellId:cell.id,receipt:receipt(cell,[10,30]),decisions:[
  ownershipRow(cell,{actor:2,evidence:ownershipEvidence()}),
  ownershipRow(cell,{rotation:1,actor:3,evidence:ownershipEvidence({priorCandidateId:'play:DA',selectedChanged:true})}),
 ]}));
 const summary=summarizeStrengthStudy(study,inputs);
 assert.equal(summary.cells[0].ownershipActivation,null);
 assert.equal(summary.cells[1].ownershipActivation?.availableDecisions,4);
 assert.equal(summary.cells[1].ownershipActivation?.selectedChangedDecisions,2);
});

test('ownership activation exposes contradictory coverage and incomplete change measurement as malformed evidence',()=>{
 const study=ownershipStudy(),cell=study.cells[0];const inputs=[
  ownershipEvidence({coverage:'outside-scope'}),
  ownershipEvidence({eligible:false}),
  ownershipEvidence({priorCandidateId:undefined}),
 ];
 const summary=summarizeStrengthStudy(study,[{cellId:cell.id,receipt:receipt(cell,[10,30]),decisions:inputs.map(evidence=>ownershipRow(cell,{evidence}))}]);
 assert.equal(summary.cells[0].ownershipActivation?.malformedEvidenceDecisions,3);
 assert.equal(summary.cells[0].ownershipActivation?.availableDecisions,0);
 assert.equal(summary.cells[0].ownershipActivation?.choiceChangeMeasuredDecisions,0);
});

test('ownership activation rejects a changed flag that disagrees with decision-time candidate IDs',()=>{
 const study=ownershipStudy(),cell=study.cells[0];
 for(const evidence of [ownershipEvidence({priorCandidateId:'play:DA'}),ownershipEvidence({selectedChanged:true})]){
  assert.throws(()=>summarizeStrengthStudy(study,[{cellId:cell.id,receipt:receipt(cell,[10,30]),decisions:[ownershipRow(cell,{evidence})]}]),/Ownership selectedChanged disagrees/);
 }
});
