import assert from 'node:assert/strict';
import { join } from 'node:path';
import { digest,validateDecision,validateRecord,type ReviewRecord,type JsonObject,type DecisionRecord } from './contracts.ts';
import { exportBlindPacket,reviewMatchesPresentation } from './packets.ts';
import { immutableJson } from './storage.ts';
import type { LabGap,LabEvaluation } from './types.generated.ts';
import type { AcceptedHuman } from './calibration.ts';
export type Gap=LabGap;

/** Revalidate immutable accepted labels when consuming disk records, not just at import. */
export function validateAcceptedHumans(humans:AcceptedHuman[]):AcceptedHuman[]{
 const unique=new Map<string,AcceptedHuman>();const identities=new Map<string,string>();
 for(const h of humans){
  const s=validateRecord<AcceptedHuman['submission']>('human',h.submission);
  assert.equal(h.id,'human-'+digest(s),'Human label identity digest changed');
  assert.equal(h.provenance,'independent-human');assert.equal(h.confirmationEligible,false);
  assert.ok(s.reviewerId&&s.qualification&&s.reviewedAt&&s.status!=='pending','Completed qualified human label required');
  assert.equal(s.independence,'independent');assert.ok(!Object.values(s.exposure).some(Boolean),'Human label exposure invalidates independence');
  assert.equal(new Set(s.acceptableActions).size,s.acceptableActions.length,'Duplicate human acceptable actions');
  if(s.status==='acceptable-set')assert.ok(s.acceptableActions.length&&s.rationale,'Human acceptable set requires rationale');else assert.equal(s.acceptableActions.length,0,'Unresolved human label supplies no acceptable set');
  const key=JSON.stringify([s.caseId,s.reviewerId]);assert.ok(!identities.has(key)||identities.get(key)===h.id,'Duplicate human reviewer cannot replace original label');
  identities.set(key,h.id);unique.set(h.id,h);
 }
 return [...unique.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
export function humansForDecision(d:DecisionRecord,humans:AcceptedHuman[]):AcceptedHuman[]{
 const packet=exportBlindPacket(d),legal=new Set(d.legalCandidates.map(c=>c.id));
 return humans.filter(h=>h.submission.caseId===packet.caseId).map(h=>{
  assert.equal(h.submission.packetHash,digest(packet),'Human packet identity changed');
  assert.ok(h.submission.acceptableActions.every(id=>legal.has(id)),'Human acceptable action is not legal');return h;
 });
}
export function validateDecisionHumans(decisions:DecisionRecord[],humans:AcceptedHuman[]):AcceptedHuman[]{
 const labels=validateAcceptedHumans(humans),familiesByReviewer=new Map<string,string>();
 const cases=new Map<string,DecisionRecord[]>();for(const d of decisions){const id=exportBlindPacket(d).caseId;cases.set(id,[...cases.get(id)??[],d]);}
 for(const h of labels){const rows=cases.get(h.submission.caseId);assert.ok(rows?.length,'Human original actor case absent');humansForDecision(rows[0],[h]);
  for(const family of new Set(rows.map(d=>d.familyId))){const key=JSON.stringify([h.submission.reviewerId,family]),prior=familiesByReviewer.get(key);assert.ok(!prior||prior===h.submission.caseId,'Same-family exposure prevents independent human labels');familiesByReviewer.set(key,h.submission.caseId);}
 }
 return labels;
}
export function validateFeedbackEvaluations(decisions:DecisionRecord[],inputs:JsonObject[]):LabEvaluation[]{
 const unique=new Map<string,LabEvaluation>();
 for(const input of inputs){
  const e=validateRecord<LabEvaluation>('evaluation',input),d=decisions.find(d=>d.decisionId===e.decisionId);assert.ok(d,'Evaluation original decision absent');
  const legal=new Set(d.legalCandidates.map(c=>c.id));
  for(const ids of [e.testedActions,e.untestedActions,e.values.map(v=>v.actionId)]){assert.equal(new Set(ids).size,ids.length,'Duplicate evaluation action');assert.ok(ids.every(id=>legal.has(id)),'Evaluation action is not original legal action');}
  for(const v of e.values){assert.ok([v.value,v.lower,v.upper].every(Number.isFinite)&&v.lower<=v.value&&v.value<=v.upper,'Evaluation bounds do not contain finite value');assert.ok(v.worlds>0,'Evaluation numerical row requires completed worlds');assert.ok(e.testedActions.includes(v.actionId),'Evaluation value requires tested action');if(e.status==='completed')assert.ok(!e.untestedActions.includes(v.actionId),'Completed numerical row cannot be unconfirmed');}
  assert.ok(new Set(e.values.map(v=>v.worlds)).size<=1,'Paired evaluation rows require the same worlds');
  const original=e.values.find(v=>v.actionId===d.selectedCandidateId);if(original&&pairedObjective(d,e))assert.ok(original.value===0&&original.lower===0&&original.upper===0,'Paired original action must be zero reference');
  const id='evaluation-'+digest(e);unique.set(id,e);
 }
 return [...unique.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,e])=>e);
}
function pairedObjective(d:DecisionRecord,e:LabEvaluation){return d.actorPacket.gameId==='trix'?e.objective==='paired-actor-request-margin-difference':['paired-actor-score-difference','paired-terminal-match-win-difference'].includes(e.objective);}
export function completedComparisons(d:DecisionRecord,evaluations:LabEvaluation[]):LabEvaluation[]{return evaluations.filter(e=>e.decisionId===d.decisionId&&e.status==='completed'&&pairedObjective(d,e)&&e.testedActions.includes(d.selectedCandidateId)&&e.values.some(v=>v.actionId!==d.selectedCandidateId));}
export function feedbackFlags(d:DecisionRecord,reviews:ReviewRecord[],humans:AcceptedHuman[],evaluations:LabEvaluation[]){
 const labels=humansForDecision(d,humans);return {humanReviewed:!d.forced&&labels.some(h=>h.submission.status==='acceptable-set'),modelReviewed:!d.forced&&reviews.some(r=>reviewMatchesPresentation(r,d)&&r.stage==='B-reason'&&r.status==='completed'&&r.provenance==='llm-proposal'),evaluated:!d.forced&&completedComparisons(d,evaluations).length>0};
}
export function buildGapQueue(decisions:unknown[],reviews:ReviewRecord[],humans:AcceptedHuman[]=[],evaluations:JsonObject[]=[]):Gap[]{const rows=decisions.map(validateDecision),labels=validateDecisionHumans(rows,humans),comparisons=validateFeedbackEvaluations(rows,evaluations);const gaps=new Map<string,Gap>();for(const d of rows){const add=(layer:Gap['layer'],description:string,refs:string[]=[])=>{const core={decisionId:d.decisionId,layer,description,evidenceRefs:refs};const g:Gap={schemaVersion:'coach-lab-gap-1.0.0',id:'gap-'+digest(core),...core,status:'hypothesis',severity:'unknown',candidateRefs:[]};validateRecord('gap',g);gaps.set(g.id,g);};
 if(!d.coachMessage||d.coachMessage.status==='insufficient-reason')add('explanation','Original saved advice lacks a supported complete tactical reason.');if(d.audit.status==='failed')add('facts','Native audit reports failed checks; investigate integrity before strategy.');
 const caseId=exportBlindPacket(d).caseId;for(const review of reviews.filter(r=>reviewMatchesPresentation(r,d)&&['B-cue','B-reason'].includes(r.stage)&&r.provenance==='llm-proposal'&&r.status==='completed'))for(const dimension of review.dimensions)if(dimension.assessment==='fail')add('explanation',`Provisional reviewer failure: ${dimension.name}`,[review.id,...dimension.evidenceRefs]);
 if(!d.forced)for(const review of reviews.filter(r=>r.caseId===caseId&&r.provenance==='llm-proposal'&&r.status==='completed')){if(review.stage==='B-reason'&&reviewMatchesPresentation(review,d)&&review.verdict==='inferior')add('action','Provisional evidence-stage reviewer prefers alternatives to the saved action; independent validation required.',[review.id,...review.reasons.flatMap(reason=>reason.evidenceRefs)]);if(review.stage==='A'&&review.verdict==='supported'&&review.acceptableActions.length&&!review.acceptableActions.includes(d.selectedCandidateId))add('action','Blind reviewer acceptable set omits the saved action; this disagreement is a hypothesis, not an inaccurate label.',[review.id]);}
 if(!d.forced){
  for(const human of humansForDecision(d,labels))if(human.submission.status==='acceptable-set'&&!human.submission.acceptableActions.includes(d.selectedCandidateId))add('action','Independent human acceptable set omits the saved action; this disagreement is a hypothesis, not a correctness or strength label.',[human.id]);
  for(const evaluation of completedComparisons(d,comparisons))for(const value of evaluation.values)if(value.actionId!==d.selectedCandidateId&&value.value>0)add('action',`Conditional numerical comparison favors ${value.actionId} over the saved action by ${value.value} under ${evaluation.objective} at ${evaluation.horizon}; lower/upper ${value.lower}/${value.upper}, worlds ${value.worlds}, unconfirmed ${evaluation.untestedActions.length}. This is an evaluator hypothesis, not domain truth or proof of stronger play.`,['evaluation-'+digest(evaluation),...evaluation.evidenceRefs]);
  const flags=feedbackFlags(d,reviews,labels,comparisons);if(!flags.humanReviewed&&!flags.modelReviewed)add('coverage','Strategic review remains pending, abstained or unavailable.');
 }
 }return [...gaps.values()];}
export function registerCandidate(input:JsonObject,gaps:Gap[],out:string){assert.deepEqual(Object.keys(input).sort(),['description','evidenceRefs','gapIds','id','policyPin','status'].sort(),'Unknown candidate fields');assert.ok(typeof input.id==='string'&&typeof input.description==='string'&&typeof input.policyPin==='string','Candidate identity required');assert.ok(Array.isArray(input.gapIds)&&input.gapIds.length,'Candidate gaps required');const selected=gaps.filter(g=>(input.gapIds as unknown[]).includes(g.id));assert.equal(selected.length,(input.gapIds as unknown[]).length,'Unknown candidate gap');assert.ok(selected.every(g=>g.status==='supported'&&new Set(g.evidenceRefs.filter(ref=>ref.startsWith('gapreview-'))).size>=2)&&Array.isArray(input.evidenceRefs)&&input.evidenceRefs.length,'Two independent human gap assessments and supported gaps required; numerical diagnostics do not admit proof');const refs=new Set(selected.flatMap(g=>[g.id,...g.evidenceRefs]));assert.ok((input.evidenceRefs as unknown[]).every(ref=>typeof ref==='string'&&refs.has(ref)),'Unknown candidate evidence reference');assert.equal(input.status,'proposal','Candidate registration only admits deterministic rule proposals');const candidate={...input,provenance:'admitted-proposal',deterministicRuleOnly:true,runtimeActivated:false,promotionEligible:false};immutableJson(join(out,'candidates','candidate-'+digest(candidate)+'.json'),candidate);return candidate;}
