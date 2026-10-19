import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decision } from './coach-lab-packets.test.ts';
import { exportHumanPack,importIndependentReview,calibrateJudge } from '../evaluation/multi-game/lab/calibration.ts';
import { runFixtureReviews } from '../evaluation/multi-game/lab/judge.ts';
import { presentationHash,exportBlindPacket,buildReviewPacket } from '../evaluation/multi-game/lab/packets.ts';
import { validateDecision,type ReviewRecord } from '../evaluation/multi-game/lab/contracts.ts';
import { readJsonDirectory } from '../evaluation/multi-game/lab/storage.ts';
import { buildGapQueue,registerCandidate } from '../evaluation/multi-game/lab/gaps.ts';
import { buildLabReport,writeLabReport,buildAuditMetrics } from '../evaluation/multi-game/report.ts';
import { bindArchive } from '../evaluation/multi-game/lab/archive.ts';
import { envelope } from './coach-lab-contracts.test.ts';
import { writeFileSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { exportGapReviews,importGapReview,adjudicateGaps } from '../evaluation/multi-game/lab/adjudication.ts';

test('blank expert packets preserve pending and exposed submissions never establish independence',()=>{
 const dir=mkdtempSync(join(tmpdir(),'coach-review-'));try {
  const exported=exportHumanPack([decision()],dir);assert.equal(exported.cases,1);
  const blank=JSON.parse(readFileSync(join(dir,'cases',exported.caseIds[0],'submission.json'),'utf8'));assert.equal(blank.status,'pending');assert.equal(blank.reviewerId,null);
  assert.throws(()=>importIndependentReview(blank,exported.packets[0],dir),/pending|qualification/i);
  const human={...blank,reviewerId:'reviewer-1',qualification:'experienced Spades Partners',reviewedAt:'2026-10-08T12:00:00Z',independence:'independent',status:'acceptable-set',acceptableActions:['play:D3'],rationale:'Preserve ace.',exposure:{future:false,otherSeat:false,answers:false}};
  const record=importIndependentReview(human,exported.packets[0],dir);assert.equal(record.provenance,'independent-human');assert.equal(record.confirmationEligible,false);
  assert.throws(()=>importIndependentReview({...human,exposure:{...human.exposure,future:true}},exported.packets[0],dir),/expos/i);
  assert.throws(()=>importIndependentReview({...human,acceptableActions:['play:SK']},exported.packets[0],dir),/legal/i);
  assert.throws(()=>importIndependentReview({...human,rationale:'Changed opinion'},exported.packets[0],dir),/original|duplicate/i);
  assert.throws(()=>importIndependentReview({...human,caseId:'forged',packetHash:'a'.repeat(64)}, {...exported.packets[0],caseId:'forged'},dir),/export|case|packet/i);
  assert.equal(calibrateJudge([],[]).status,'uncalibrated');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('bounded fixtures review eight new contexts and resume without losing the ninth',async()=>{const dir=mkdtempSync(join(tmpdir(),'coach-bounded-'));try{const rows=Array.from({length:9},(_,i)=>{const d=decision();return {...d,decisionId:'bounded'+i,actorPacket:{...d.actorPacket,observation:{...d.actorPacket.observation,scores:[i,0,0,0]}}};});await runFixtureReviews(rows,dir);assert.equal(readJsonDirectory<ReviewRecord>(join(dir,'reviews')).filter(r=>r.stage==='B-reason').length,8);await runFixtureReviews(rows,dir);assert.equal(readJsonDirectory<ReviewRecord>(join(dir,'reviews')).filter(r=>r.stage==='B-reason').length,9);}finally{rmSync(dir,{recursive:true,force:true});}});
test('same blind context with a different selected presentation cannot reuse a B judgment',()=>{const source=decision();const make=(id:string,card:string,cue:string)=>validateDecision({...source,decisionId:id,selectedCandidateId:'play:'+card,coachMessage:{presentationVersion:'coach-advice-2.0.0',decisionId:id,policyVersion:source.policyPin.id,cueVersion:'unit-test',status:'tactical',selectedAction:'play:'+card,cue,reason:{summary:cue,support:[{id:'policy-preference',kind:'policy',text:cue}],alternatives:[],limitations:[]}}});const first=make('d1','D3','Preserve the ace.');const second=make('d2','DA','Take the trick.');const r:ReviewRecord={schemaVersion:'coach-lab-review-1.0.0',id:'unit-review',caseId:exportBlindPacket(first).caseId,stage:'B-reason',presentationHash:presentationHash(first),inputHash:'a'.repeat(64),modelPin:'unit-model',provenance:'llm-proposal',status:'completed',verdict:'inferior',acceptableActions:['play:DA'],reasons:[],dimensions:[]};const report=buildLabReport([first,second],[],[r],[],[]);assert.equal(report.coverage.strategicallyReviewed,1);assert.ok(buildGapQueue([first,second],[r]).some(g=>g.layer==='action'&&g.decisionId==='d1'));assert.ok(!buildGapQueue([first,second],[r]).some(g=>g.layer==='action'&&g.decisionId==='d2'));assert.throws(()=>buildReviewPacket('B-reason',second,{...r,stage:'B-cue'}),/presentation/i);});
test('exact mechanical checks can pass while contextual facts and prose remain pending',()=>{const d=decision();const checks=['actor-context','complete-legal-set','legal-coverage','selected-legal','forced-status','original-advice-action','original-action'].map(id=>({id,status:'passed',detail:'exact'}));const audit={status:'partially-checkable',checks:[...checks,{id:'remaining-context-facts',status:'pending',detail:'not independently checked'},{id:'explanation-semantics',status:'pending',detail:'not strategic truth'}]};assert.equal(buildAuditMetrics([{...d,audit}]).mechanicallyChecked,1);assert.equal(buildAuditMetrics([{...d,audit}]).fullyPassed,0);});
test('supported gap admission requires two distinct human assessments linked to frozen blind labels',()=>{
 const dir=mkdtempSync(join(tmpdir(),'coach-gap-review-'));try{const d=decision();const exported=exportHumanPack([d],join(dir,'human-export'));const blank=JSON.parse(readFileSync(join(dir,'human-export','cases',exported.caseIds[0],'submission.json'),'utf8'));const humans=['h1','h2'].map(reviewerId=>importIndependentReview({...blank,reviewerId,qualification:'test experienced reviewer',reviewedAt:'2026-10-08T12:00:00Z',independence:'independent',status:'acceptable-set',acceptableActions:['play:D3'],rationale:'Test label only.'},exported.packets[0],dir));const gaps=buildGapQueue([d],[]);const gap=gaps.find(g=>g.layer==='explanation')!;exportGapReviews([d],gaps,dir);const assessment={gapId:gap.id,caseId:exported.caseIds[0],reviewerId:'h1',assessment:'supported',rationale:'Saved reason is absent.',evidenceRefs:[gap.id],exposure:{future:false,otherSeat:false}};const first=importGapReview(assessment,gaps,humans,dir);assert.equal(adjudicateGaps(gaps,[first],humans,[d]).find(g=>g.id===gap.id)!.status,'hypothesis');const second=importGapReview({...assessment,reviewerId:'h2'},gaps,humans,dir);assert.equal(adjudicateGaps(gaps,[first,second],humans,[d]).find(g=>g.id===gap.id)!.status,'supported');assert.throws(()=>importGapReview({...assessment,reviewerId:'missing'},gaps,humans,dir),/blind|independent/i);assert.throws(()=>importGapReview({...assessment,exposure:{future:true,otherSeat:false}},gaps,humans,dir),/expos/i);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('one reviewer cannot establish independence from two positions in the same family',()=>{
 const dir=mkdtempSync(join(tmpdir(),'coach-exposure-'));try{const d=decision();const later={...d,decisionId:'d2',revision:4,actorPacket:{...d.actorPacket,observation:{...d.actorPacket.observation,scores:[1,0,0,0]}}};const exported=exportHumanPack([d,later],dir);for(const [index,p] of exported.packets.entries()){const label={schemaVersion:'coach-lab-human-1.0.0',caseId:p.caseId,packetHash:(JSON.parse(readFileSync(join(dir,'cases',p.caseId,'submission.json'),'utf8'))).packetHash,reviewerId:'same-reviewer',qualification:'experienced',reviewedAt:'2026-10-08T12:00:00Z',independence:'independent',exposure:{future:false,otherSeat:false,answers:false},status:'acceptable-set',acceptableActions:['play:D3'],rationale:'Public control preserved.'};if(index===0)importIndependentReview(label,p,dir);else assert.throws(()=>importIndependentReview(label,p,dir),/family|expos/i);}}finally{rmSync(dir,{recursive:true,force:true});}
});
test('report snapshots can refresh after labels while archive rejects an unrelated manifest',()=>{
 const dir=mkdtempSync(join(tmpdir(),'coach-report-'));try{const first=buildLabReport([decision()],[],[],[],[]);writeLabReport(dir,first);writeLabReport(dir,first);const second={...first,limitations:[...first.limitations,'New independent review pending.']};writeLabReport(dir,second);assert.equal(JSON.parse(readFileSync(join(dir,'report.json'),'utf8')).limitations.length,second.limitations.length);
 const manifest=join(dir,'manifest.json');const raw=JSON.stringify(envelope());writeFileSync(manifest,raw);const receipt={schemaVersion:'coach-lab-receipt-1.0.0',runId:'another',status:'complete',manifestHash:createHash('sha256').update(raw).digest('hex'),episodes:[],decisions:0,committed:0,pending:0,forced:0,unforced:0,providerMode:'fixture',strengthClaim:false,errors:[]};writeFileSync(join(dir,'receipt.json'),JSON.stringify(receipt));writeFileSync(join(dir,'decisions.jsonl'),'');assert.throws(()=>bindArchive(manifest,dir),/run|identity/i);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('fixture review cannot supply strategy truth and reports retain every occurrence and missing content',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'coach-pipeline-'));try {
  const d=decision();const reviews=await runFixtureReviews([d,d],dir);assert.equal(reviews.length,6);assert.ok(reviews.every(r=>r.provenance==='fixture'&&r.status==='abstained'&&r.verdict===null));
  const gaps=buildGapQueue([d],reviews);assert.ok(gaps.some(g=>g.layer==='explanation'));assert.ok(gaps.every(g=>g.status==='hypothesis'));
  const report=buildLabReport([d,d],[],reviews,[],gaps);assert.equal(report.coverage.total,2);assert.equal(report.coverage.unforced,2);assert.equal(report.coverage.strategicallyReviewed,0);assert.equal(report.calibration.status,'uncalibrated');assert.equal(report.strengthClaim,false);
  assert.throws(()=>registerCandidate({id:'candidate1',gapIds:gaps.map(g=>g.id),status:'hypothesis',evidenceRefs:[],policyPin:'new-rule',description:'Preserve control'},gaps,dir),/independent|proof|supported/i);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
