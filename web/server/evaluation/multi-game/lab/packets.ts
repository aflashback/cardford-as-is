import assert from 'node:assert/strict';
import { assertContract } from '../../../../shared/validation.ts';
import { digest,validateDecision,validateRecord,type DecisionRecord,type ReviewRecord,type ReviewResult,type JsonObject } from './contracts.ts';
import { trixPinForPublicSchema } from './trix-pins.ts';
export type Stage='A'|'B-cue'|'B-reason'|'C';
export type BlindPacket={caseId:string;ruleProfile:string;actorPacket:DecisionRecord['actorPacket'];legalCandidates:DecisionRecord['actorPacket']['candidates']};
export type ReviewPacket={stage:Stage;case:BlindPacket;evidenceRefs:string[];presentationHash?:string;prior?:ReviewRecord;selectedAction?:string;cue?:string;reason?:unknown;evaluation?:JsonObject;inference?:JsonObject;retrospective?:JsonObject};
export function presentationHash(d:DecisionRecord){const m=d.coachMessage;return digest(m?{presentationVersion:m.presentationVersion,cueVersion:m.cueVersion,status:m.status,selectedAction:m.selectedAction,cue:m.cue,reason:m.reason}:{presentationVersion:'legacy-unmigrated',selectedAction:d.selectedCandidateId,cue:null,reason:null});}
export function reviewMatchesPresentation(review:ReviewRecord,d:DecisionRecord){return review.caseId===exportBlindPacket(d).caseId&&review.presentationHash===presentationHash(d);}
export function exportBlindPacket(value:unknown):BlindPacket {
 const d=validateDecision(value);const actor=d.actorPacket;assert.ok(['hearts','spades','trix'].includes(actor.gameId),'Unsupported review module');
 // RegisteredActorPacket is already a strict, generated public schema. A fresh
 // object copies only this approved DTO; journal/analysis/policy never enter it.
 const actorPacket=structuredClone({publicSchemaVersion:actor.publicSchemaVersion,gameId:actor.gameId,variantId:actor.variantId,seat:actor.seat,phase:actor.phase,observation:actor.observation,candidates:actor.candidates});
 if(actor.gameId==='trix')Object.assign(actorPacket.observation,{id:'actor-context'});
 assertContract('RegisteredActorPacket',actorPacket);
 const ruleProfile=actor.gameId==='trix'?trixPinForPublicSchema(actor.variantId,actor.publicSchemaVersion).ruleProfileId:actor.gameId==='spades'?(actor.variantId==='solo'?'spades-solo-training-1.0.0':'spades-training-1.0.0'):'hearts-training-1.0.0';
 return {caseId:'case-'+digest({actorPacket}).slice(0,24),ruleProfile,actorPacket,legalCandidates:structuredClone(actor.candidates)};
}
export function buildReviewPacket(stage:Stage,value:unknown,prior?:ReviewRecord,evidence?:unknown,retrospective?:JsonObject,inference?:unknown):ReviewPacket {
 const d=validateDecision(value);const safe=exportBlindPacket(d);const packet:ReviewPacket={stage,case:safe,evidenceRefs:['actor-observation','legal-candidates']};
 if(stage==='A')return packet;
 packet.presentationHash=presentationHash(d);
 assert.ok(prior&&prior.caseId===safe.caseId&&['completed','abstained','disputed'].includes(prior.status),'Frozen stage A review required');
 assert.ok(stage==='B-cue'?prior.stage==='A':stage==='B-reason'?prior.stage==='B-cue':prior.stage==='B-reason','Wrong prior review stage');
 if(stage!=='B-cue')assert.equal(prior.presentationHash,packet.presentationHash,'Prior review belongs to a different frozen presentation');
 packet.prior=structuredClone(prior);packet.selectedAction=d.selectedCandidateId;
 if(evidence){const e=validateRecord<JsonObject>('evaluation',evidence);assert.equal(e.decisionId,d.decisionId,'Evaluation identity mismatch');const {decisionId:_privateIdentity,...summary}=e;packet.evaluation=structuredClone(summary);packet.evidenceRefs.push('conditional-evaluation',...e.evidenceRefs as string[]);}
 if(inference){const i=validateRecord<JsonObject>('inference',inference);assert.equal(i.decisionId,d.decisionId,'Inference identity mismatch');const {decisionId:_private,...summary}=i;packet.inference=structuredClone(summary);packet.evidenceRefs.push('conditional-inference',...i.evidenceRefs as string[]);}
 if(d.coachMessage){packet.cue=d.coachMessage.cue;packet.evidenceRefs.push('saved-cue');if(stage==='B-reason'){packet.reason=structuredClone(d.coachMessage.reason);packet.evidenceRefs.push('saved-reason');}}packet.evidenceRefs=[...new Set(packet.evidenceRefs)];
 if(stage==='C'){assert.ok(retrospective,'Completed retrospective required');assert.deepEqual(Object.keys(retrospective).sort(),['coverage','publicHistory','result']);assert.ok(Array.isArray(retrospective.publicHistory)&&retrospective.publicHistory.every(event=>typeof event==='string'),'Retrospective accepts public event references only');assert.ok(typeof retrospective.result==='number'&&Number.isFinite(retrospective.result),'Retrospective numeric result required');assert.ok(['complete','incomplete','failed'].includes(String(retrospective.coverage)),'Invalid retrospective coverage');packet.retrospective=structuredClone(retrospective);}
 return packet;
}
export function validateReview(packet:ReviewPacket,response:unknown):ReviewResult {
 assert.ok(response&&typeof response==='object'&&!Array.isArray(response),'Invalid model response');const r=response as ReviewResult;
 assert.deepEqual(Object.keys(r).sort(),['status','verdict','acceptableActions','reasons','dimensions'].sort(),'Unknown response fields');const record={...r,schemaVersion:'coach-lab-review-1.0.0',id:'validation',caseId:packet.case.caseId,stage:packet.stage,inputHash:digest(packet),modelPin:'validation',provenance:'llm-proposal',...(packet.presentationHash?{presentationHash:packet.presentationHash}:{})};
 validateRecord('review',record);assert.notEqual(r.status,'pending','Pending is a workflow state, not a completed model response');
 assert.ok(r.status==='completed'?r.verdict!==null:r.verdict===null,'Verdict inconsistent with review status');
 if(r.status==='completed'&&['supported','inferior'].includes(r.verdict??''))assert.ok(r.acceptableActions.length,'Strategic verdict requires a nonempty acceptable action set');
 if(packet.stage==='A')assert.equal(r.dimensions.length,0,'Blind stage cannot grade undisclosed advice');if(packet.stage==='B-cue')assert.ok(!r.dimensions.some(d=>d.name==='reason-completeness'&&['pass','fail'].includes(d.assessment)),'Full reason was not disclosed in cue-only stage');
 const legal=new Set(packet.case.legalCandidates.map(c=>c.id));assert.equal(new Set(r.acceptableActions).size,r.acceptableActions.length,'Duplicate acceptable actions');for(const id of r.acceptableActions)assert.ok(legal.has(id),'Review action not legal');
 const refs=new Set(packet.evidenceRefs);for(const reason of [...r.reasons,...r.dimensions])for(const ref of reason.evidenceRefs)assert.ok(refs.has(ref),'Unavailable evidence reference');
 if(packet.stage==='B-reason'&&r.status==='completed')assert.deepEqual(r.dimensions.map(d=>d.name).sort(),['strategic-purpose','context-grounding','action-fidelity','uncertainty-honesty','reason-completeness'].sort(),'Full saved reason requires all disclosure dimensions exactly once');
 if(packet.stage==='C'){assert.ok(r.verdict===null||r.verdict==='not-applicable','Retrospective cannot assign decision-quality label');assert.equal(r.acceptableActions.length,0,'Retrospective cannot supply action targets');assert.equal(r.dimensions.length,0,'Retrospective cannot grade initial disclosure');}
 return structuredClone(r);
}
