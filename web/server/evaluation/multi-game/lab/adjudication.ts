import assert from 'node:assert/strict';
import { join } from 'node:path';
import { validateDecision,validateRecord,digest,type JsonObject } from './contracts.ts';
import { exportBlindPacket } from './packets.ts';
import { immutableJson,readJson,readJsonDirectory } from './storage.ts';
import { validateAcceptedHumans,validateDecisionHumans,validateFeedbackEvaluations,type Gap } from './gaps.ts';
import type { AcceptedHuman } from './calibration.ts';
import type { LabGapreview } from './types.generated.ts';
type Assessment=LabGapreview;
export type GapReview={id:string;submission:Assessment;priorBlindLabel:string;provenance:'human-gap-assessment';confirmationEligible:false};
export function exportGapReviews(decisions:unknown[],gaps:Gap[],out:string){const rows=decisions.map(validateDecision);for(const gap of gaps){const d=rows.find(d=>d.decisionId===gap.decisionId);assert.ok(d,'Gap original decision absent');const actor=exportBlindPacket(d);
 const numerical=gap.evidenceRefs.filter(ref=>/^evaluation-[a-f0-9]{64}$/.test(ref)).map(ref=>{const summary=readJson<JsonObject>(join(out,'gap-evidence',ref+'.json'));assert.equal(ref,'evaluation-'+digest(summary),'Gap numerical evidence identity changed');const [evaluation]=validateFeedbackEvaluations([d],[summary]);return evaluation;});
 const packet={case:actor,gap,selectedAction:d.selectedCandidateId,originalPresentation:d.coachMessage?{cue:d.coachMessage.cue,reason:d.coachMessage.reason,presentationVersion:d.coachMessage.presentationVersion}:null,...(numerical.length?{conditionalComparisons:numerical}:{}),limitations:['Review the saved reason after freezing your blind action label. No later outcome or concealed hands included.','A supported human gap is a proposal review gate, not strategy-strength proof.']};immutableJson(join(out,'gap-review-export',gap.id,'packet.json'),packet);immutableJson(join(out,'gap-review-export',gap.id,'submission.json'),{gapId:gap.id,caseId:actor.caseId,reviewerId:null,assessment:'pending',rationale:null,evidenceRefs:[],exposure:{future:false,otherSeat:false}} satisfies Assessment);}return {gaps:gaps.length,status:'pending',out:join(out,'gap-review-export')};}
export function importGapReview(input:unknown,gaps:Gap[],humans:AcceptedHuman[],out:string):GapReview{
 const s=validateRecord<Assessment>('gapreview',input);assert.ok(s.reviewerId&&s.rationale&&s.assessment!=='pending','Completed qualified human assessment required');assert.ok(!s.exposure.future&&!s.exposure.otherSeat,'Exposed assessment cannot support gap admission');
 const gap=gaps.find(g=>g.id===s.gapId);assert.ok(gap,'Unknown source gap');const packet=readJson<{case:{caseId:string};gap:Gap}>(join(out,'gap-review-export',gap.id,'packet.json'));assert.equal(packet.case.caseId,s.caseId,'Gap case mismatch');assert.deepEqual(packet.gap,gap,'Gap source changed');
 const prior=validateAcceptedHumans(humans).find(h=>h.submission.caseId===s.caseId&&h.submission.reviewerId===s.reviewerId);assert.ok(prior,'Freeze this reviewer independent blind action label first');assert.equal(prior.submission.packetHash,digest(packet.case),'Gap blind packet changed');
 const refs=new Set([gap.id,...gap.evidenceRefs,prior.id]);assert.ok(s.evidenceRefs.length&&s.evidenceRefs.every(ref=>refs.has(ref)),'Assessment evidence must reference exported gap or original blind label');
 const record:GapReview={id:'gapreview-'+digest(s),submission:structuredClone(s),priorBlindLabel:prior.id,provenance:'human-gap-assessment',confirmationEligible:false};
 for(const old of readJsonDirectory<GapReview>(join(out,'gap-reviews')))if(old.submission.gapId===s.gapId&&old.submission.reviewerId===s.reviewerId){assert.deepEqual(old,record,'Duplicate reviewer cannot replace original gap assessment');return old;}
 immutableJson(join(out,'gap-reviews',record.id+'.json'),record);return record;
}
export function adjudicateGaps(gaps:Gap[],reviews:GapReview[],humans:AcceptedHuman[],decisions:unknown[]):Gap[]{
 const rows=decisions.map(validateDecision),labels=validateDecisionHumans(rows,humans);const uniqueReviews=new Map<string,GapReview>();
 for(const r of reviews){const s=validateRecord<Assessment>('gapreview',r.submission);assert.equal(r.id,'gapreview-'+digest(s),'Gap assessment identity digest changed');assert.equal(r.provenance,'human-gap-assessment');assert.equal(r.confirmationEligible,false);assert.ok(s.reviewerId&&s.rationale&&s.assessment!=='pending','Completed gap assessment required');
  const key=JSON.stringify([s.gapId,s.reviewerId]);const old=uniqueReviews.get(key);assert.ok(!old||digest(old)===digest(r),'Duplicate reviewer cannot replace original gap assessment');uniqueReviews.set(key,r);
 }
 return gaps.map(gap=>{
  const d=rows.find(d=>d.decisionId===gap.decisionId);assert.ok(d,'Gap original decision absent');const caseId=exportBlindPacket(d).caseId;
  const refs=new Set([gap.id,...gap.evidenceRefs]);
  const valid=[...uniqueReviews.values()].filter(r=>r.submission.gapId===gap.id&&r.submission.caseId===caseId&&!Object.values(r.submission.exposure).some(Boolean)&&labels.some(h=>h.id===r.priorBlindLabel&&h.submission.reviewerId===r.submission.reviewerId&&h.submission.caseId===r.submission.caseId&&r.submission.evidenceRefs.length&&r.submission.evidenceRefs.every(ref=>refs.has(ref)||ref===h.id)));
  const unique=new Set(valid.map(r=>r.submission.reviewerId)),assessments=new Set(valid.map(r=>r.submission.assessment));const supported=unique.size>=2&&assessments.size===1&&assessments.has('supported');const disputed=assessments.has('disputed')||assessments.size>1;
  return {...gap,status:supported?'supported':disputed?'disputed':gap.status==='fixed'?'fixed':'hypothesis',evidenceRefs:[...new Set([...gap.evidenceRefs.filter(ref=>!ref.startsWith('gapreview-')),...valid.map(r=>r.id)])]};
 });
}
