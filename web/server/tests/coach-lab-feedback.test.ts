import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,dirname,basename,resolve } from 'node:path';
import { decision } from './coach-lab-packets.test.ts';
import { digest,validateDecision,type ReviewRecord,type JsonObject } from '../evaluation/multi-game/lab/contracts.ts';
import { exportBlindPacket,presentationHash } from '../evaluation/multi-game/lab/packets.ts';
import type { AcceptedHuman } from '../evaluation/multi-game/lab/calibration.ts';
import { buildGapQueue } from '../evaluation/multi-game/lab/gaps.ts';
import { buildLabReport } from '../evaluation/multi-game/report.ts';
import { exportGapReviews,importGapReview,adjudicateGaps } from '../evaluation/multi-game/lab/adjudication.ts';
import { immutableJson,readJson } from '../evaluation/multi-game/lab/storage.ts';

function row(id='feedback'){const d=decision();return validateDecision({...d,decisionId:id,actorPacket:{...d.actorPacket,observation:{...d.actorPacket.observation,scores:[id.length,0,0,0]}}});}
function human(d:ReturnType<typeof row>,reviewerId='human-1',actions=['play:DA']):AcceptedHuman{const packet=exportBlindPacket(d);const submission={schemaVersion:'coach-lab-human-1.0.0' as const,caseId:packet.caseId,packetHash:digest(packet),reviewerId,qualification:'test reviewer',reviewedAt:'2026-10-09T12:00:00Z',independence:'independent' as const,exposure:{future:false,otherSeat:false,answers:false},status:'acceptable-set' as const,acceptableActions:actions,rationale:'Test independent acceptable set.'};return {id:'human-'+digest(submission),submission,provenance:'independent-human',confirmationEligible:false};}
function evaluation(d:ReturnType<typeof row>):JsonObject{return {schemaVersion:'coach-lab-evaluation-1.0.0',decisionId:d.decisionId,status:'completed',objective:'paired-actor-score-difference',horizon:'current-round',assumptions:['Common feasible worlds; original action is zero.'],testedActions:['play:D3','play:DA'],untestedActions:[],evidenceRefs:['actor-observation:'+d.inputDigest],values:[{actionId:'play:DA',value:3,lower:1,upper:5,worlds:8}],limitations:['Conditional evaluator only.']};}
function model(d:ReturnType<typeof row>):ReviewRecord{return {schemaVersion:'coach-lab-review-1.0.0',id:'model-'+d.decisionId,caseId:exportBlindPacket(d).caseId,stage:'B-reason',presentationHash:presentationHash(d),inputHash:'a'.repeat(64),modelPin:'offline-test',provenance:'llm-proposal',status:'completed',verdict:'supported',acceptableActions:[d.selectedCandidateId],reasons:[],dimensions:[]};}

test('independent acceptable-action disagreements and numerical deltas produce separate reproducible hypotheses',()=>{
 const d=row(),h=human(d),e=evaluation(d);const gaps=buildGapQueue([d],[],[h],[e]);
 const hg=gaps.find(g=>g.layer==='action'&&g.evidenceRefs.includes(h.id));const eg=gaps.find(g=>g.layer==='action'&&g.evidenceRefs.includes('evaluation-'+digest(e)));
 assert.ok(hg);assert.ok(eg);assert.notEqual(hg.id,eg.id);assert.equal(hg.status,'hypothesis');assert.equal(eg.status,'hypothesis');assert.match(hg.description,/human.*hypothesis/i);assert.match(eg.description,/conditional.*not.*proof/i);
 assert.deepEqual(buildGapQueue([d],[],[h,h],[e,e]),gaps);
 assert.equal(buildGapQueue([d],[],[human(d,'accepts',['play:D3'])],[{...e,values:[{actionId:'play:DA',value:0,lower:-1,upper:1,worlds:8}]}]).filter(g=>g.layer==='action').length,0);
});
test('numeric hypotheses exclude failed, unsupported and uncertain comparisons and never interpret unknown objectives',()=>{
 const d=row(),e=evaluation(d);for(const status of ['failed','unsupported','uncertain'])assert.equal(buildGapQueue([d],[],[],[{...e,status}]).filter(g=>g.layer==='action').length,0);
 assert.equal(buildGapQueue([d],[],[],[{...e,objective:'lower-is-better'}]).filter(g=>g.layer==='action').length,0);
 for(const values of [[{actionId:'play:SK',value:3,lower:1,upper:5,worlds:8}],[{actionId:'play:DA',value:3,lower:5,upper:1,worlds:8}],[{actionId:'play:DA',value:3,lower:1,upper:5,worlds:0}]])assert.throws(()=>buildGapQueue([d],[],[],[{...e,values}]),/legal|bound|world|range/i);
});
test('bounded incomplete evaluation remains valid pending evidence without a numerical hypothesis or review credit',()=>{
 const d=row(),e={...evaluation(d),status:'incomplete',testedActions:[],untestedActions:['play:D3','play:DA'],values:[]};
 const gaps=buildGapQueue([d],[],[],[e]);assert.ok(gaps.some(g=>g.layer==='coverage'));assert.ok(!gaps.some(g=>g.layer==='action'));
 const report=buildLabReport([d],[],[],[],gaps,[e]);assert.equal(report.evaluationCoverage[0].status,'incomplete');assert.equal(report.feedbackCoverage.evaluated,0);assert.equal(report.feedbackCoverage.evaluationUnreviewed,1);assert.equal(report.feedbackCoverage.evidencePending,1);assert.equal(report.feedbackCoverage.combinedReviewed,0);
});
test('coverage counts human, model and numerical evidence separately and unions only unforced occurrences',()=>{
 const a=row('a'),b=row('bb'),c=row('ccc'),d=row('dddd'),base=row('forced');const f=validateDecision({...base,forced:true,legalCandidates:[base.legalCandidates[0]],actorPacket:{...base.actorPacket,candidates:[base.actorPacket.candidates[0]]}});
 const hs=[human(a),human(d,'human-2'),human(f,'forced-human',['play:D3'])];const es=[evaluation(b),evaluation(d)];const rs=[model(c),model(d),model(f)];const report=buildLabReport([a,b,c,d,f],[],rs,hs,[],es);
 assert.equal(report.coverage.strategicallyReviewed,3);assert.equal(report.coverage.pendingStrategic,1);
 assert.deepEqual(report.feedbackCoverage,{denominator:4,humanReviewed:2,modelReviewed:2,evaluated:2,combinedReviewed:3,combinedUnreviewed:1,combinedEvidence:4,evidencePending:0,humanUnreviewed:2,modelUnreviewed:2,evaluationUnreviewed:2});
 assert.equal(report.coverage.forced,1);assert.equal(report.byVariantPhase['spades-partners/play'].strategicallyReviewed,3);
});
test('tampered human identity or packet binding cannot create hypotheses or support adjudication',()=>{
 const d=row(),h=human(d),gap=buildGapQueue([d],[]).find(g=>g.layer==='explanation')!;const assessment={gapId:gap.id,caseId:h.submission.caseId,reviewerId:'human-1',assessment:'supported' as const,rationale:'Reason is absent.',evidenceRefs:[gap.id],exposure:{future:false,otherSeat:false}};
 const record={id:'gapreview-'+digest(assessment),submission:assessment,priorBlindLabel:h.id,provenance:'human-gap-assessment' as const,confirmationEligible:false as const};
 const changed={...h,submission:{...h.submission,reviewerId:'changed'}};
 assert.throws(()=>buildGapQueue([d],[],[changed],[]),/identity|digest/i);assert.throws(()=>adjudicateGaps([gap],[record],[changed],[d]),/identity|digest/i);
 const packetChanged=human(d);packetChanged.submission.packetHash='b'.repeat(64);packetChanged.id='human-'+digest(packetChanged.submission);assert.throws(()=>buildGapQueue([d],[],[packetChanged],[]),/packet/i);
});
test('one human cannot replace their original assessment or count repeated assessments as independent',()=>{
 const out=mkdtempSync(join(tmpdir(),'coach-feedback-'));try{const d=row(),h=human(d),gaps=buildGapQueue([d],[]),gap=gaps.find(g=>g.layer==='explanation')!;exportGapReviews([d],gaps,out);
 const assessment={gapId:gap.id,caseId:h.submission.caseId,reviewerId:h.submission.reviewerId,assessment:'supported',rationale:'Original reason absent.',evidenceRefs:[gap.id],exposure:{future:false,otherSeat:false}};
 const first=importGapReview(assessment,gaps,[h],out);assert.deepEqual(importGapReview(assessment,gaps,[h],out),first);assert.throws(()=>importGapReview({...assessment,rationale:'Changed opinion.'},gaps,[h],out),/original|replace|duplicate/i);
 assert.equal(adjudicateGaps(gaps,[first,first],[h],[d]).find(g=>g.id===gap.id)!.status,'hypothesis');
 }finally{assert.equal(dirname(resolve(out)),resolve(tmpdir()));assert.match(basename(out),/^coach-feedback-/);rmSync(out,{recursive:true,force:true});}
});
test('adjudication rejects labels for another actor case and consumption retains family exposure isolation',()=>{
 const d=row('target'),other={...row('other-actor'),familyId:'other-family'},h1=human(other,'h1'),h2=human(other,'h2'),gap=buildGapQueue([d],[]).find(g=>g.layer==='explanation')!;
 const reviews=[h1,h2].map(h=>{const submission={gapId:gap.id,caseId:h.submission.caseId,reviewerId:h.submission.reviewerId,assessment:'supported' as const,rationale:'Test unrelated opinion.',evidenceRefs:[gap.id],exposure:{future:false,otherSeat:false}};return {id:'gapreview-'+digest(submission),submission,priorBlindLabel:h.id,provenance:'human-gap-assessment' as const,confirmationEligible:false as const};});
 assert.equal(adjudicateGaps([gap],reviews,[h1,h2],[d,other])[0].status,'hypothesis');
 const sameFamily={...other,familyId:d.familyId};assert.throws(()=>buildLabReport([d,sameFamily],[],[],[human(d,'shared'),human(sameFamily,'shared')],[]),/family|expos/i);
});
test('numeric gap review exports the reproducible actor-safe comparison with assumptions and limitations',()=>{
 const out=mkdtempSync(join(tmpdir(),'coach-feedback-'));try{const d=row(),e=evaluation(d),gaps=buildGapQueue([d],[],[],[e]),gap=gaps.find(g=>g.layer==='action')!,ref='evaluation-'+digest(e),path=join(out,'gap-evidence',ref+'.json');
 assert.throws(()=>exportGapReviews([d],[gap],out),/ENOENT/);immutableJson(path,e);exportGapReviews([d],[gap],out);
 const packet=readJson<{conditionalComparisons:JsonObject[]}>(join(out,'gap-review-export',gap.id,'packet.json'));assert.deepEqual(packet.conditionalComparisons,[e]);assert.match(JSON.stringify(packet),/Conditional evaluator only/);assert.ok(!JSON.stringify(packet).includes('privateWorldRows'));
 writeFileSync(path,JSON.stringify({...e,horizon:'changed'}));assert.throws(()=>exportGapReviews([d],[gap],out),/identity/i);
 }finally{assert.equal(dirname(resolve(out)),resolve(tmpdir()));assert.match(basename(out),/^coach-feedback-/);rmSync(out,{recursive:true,force:true});}
});
