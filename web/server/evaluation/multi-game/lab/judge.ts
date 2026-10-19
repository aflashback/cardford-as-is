import assert from 'node:assert/strict';
import { join,relative,isAbsolute } from 'node:path';
import { buildReviewPacket,validateReview,exportBlindPacket,presentationHash,type ReviewPacket,type Stage } from './packets.ts';
import { digest,validateDecision,validateRecord,type ReviewRecord,type ReviewResult,type JsonObject } from './contracts.ts';
import { ReviewLedger } from './jobs.ts';
import { immutableJson,readJsonDirectory,readJson } from './storage.ts';
import { existsSync,realpathSync } from 'node:fs';
import { buildRetrospectivePacket } from './retrospective.ts';
export const fixtureModel='fixture-abstain-1.0.0';
export function pendingReview(packet:ReviewPacket):ReviewRecord{return {schemaVersion:'coach-lab-review-1.0.0',id:'review-'+digest({packet,modelPin:'unreviewed'}),caseId:packet.case.caseId,stage:packet.stage,inputHash:digest(packet),modelPin:'unreviewed',provenance:'fixture',status:'pending',verdict:null,acceptableActions:[],reasons:[],dimensions:[],...(packet.presentationHash?{presentationHash:packet.presentationHash}:{})};}
export function importModelReview(packet:ReviewPacket,result:unknown,modelPin:string,out:string,provenance:'fixture'|'llm-proposal'='llm-proposal',exportedPacketPath?:string):ReviewRecord {
 assert.ok(modelPin.trim(),'Model provenance required');const inputHash=digest(packet);const fixturePath=join(out,'review-inputs','job-'+digest({inputHash,modelPin})+'.json');const savedPath=exportedPacketPath??(provenance==='fixture'?fixturePath:undefined);assert.ok(savedPath&&existsSync(savedPath),'Response packet was not exported by this run');const rel=relative(realpathSync(join(out,'review-inputs')),realpathSync(savedPath));assert.ok(!rel.startsWith('..')&&!isAbsolute(rel),'Packet is outside original review export');assert.equal(digest(readJson(savedPath)),inputHash,'Response packet differs from original export');if(provenance==='llm-proposal'){assert.ok(!modelPin.startsWith('fixture'),'Fixture provenance cannot self-promote');if(packet.stage!=='A'&&packet.prior)assert.ok(packet.prior.provenance==='llm-proposal'&&packet.prior.modelPin===modelPin,'Later model stage requires its own frozen blind predecessor');}const validated=validateReview(packet,result);
 const record:ReviewRecord={...validated,schemaVersion:'coach-lab-review-1.0.0',id:'review-'+digest({inputHash:digest(packet),modelPin,provenance,result:validated}),caseId:packet.case.caseId,stage:packet.stage,inputHash:digest(packet),modelPin,provenance,...(packet.presentationHash?{presentationHash:packet.presentationHash}:{})};validateRecord('review',record);immutableJson(join(out,'reviews',record.id+'.json'),record);return record;
}
/** Manual/offline export never dispatches or charges a provider. */
export function exportModelPacket(request:unknown,decisions:unknown[],reviews:ReviewRecord[],out:string,evaluations:JsonObject[]=[],inferences:JsonObject[]=[],receipt?:JsonObject){
 assert.ok(request&&typeof request==='object');const r=request as {decisionId:string;stage:Stage;modelPin:string};assert.deepEqual(Object.keys(r).sort(),['decisionId','modelPin','stage']);
 assert.ok(typeof r.modelPin==='string'&&r.modelPin.trim()&&!r.modelPin.startsWith('fixture'),'Explicit nonfixture model provenance required');assert.ok(['A','B-cue','B-reason','C'].includes(r.stage),'Unknown review stage');
 const d=decisions.map(validateDecision).find(d=>d.decisionId===r.decisionId);assert.ok(d,'Decision not in original run');assert.ok(!d.forced||r.stage==='C','Only-option choices are audited without an invented strategic label');
 const previous=r.stage==='B-cue'?'A':r.stage==='B-reason'?'B-cue':r.stage==='C'&&!d.forced?'B-reason':null;const caseId=exportBlindPacket(d).caseId;
 const exports=readJsonDirectory<{decisionId:string;inputHash:string;modelPin:string}>(join(out,'model-exports'));
 const priors=reviews.filter(review=>review.caseId===caseId&&review.stage===previous&&review.modelPin===r.modelPin&&review.provenance==='llm-proposal'&&['completed','abstained','disputed'].includes(review.status)&&(previous==='A'||exports.some(e=>e.decisionId===d.decisionId&&e.inputHash===review.inputHash&&e.modelPin===r.modelPin)));
 assert.ok(!previous||priors.length===1,'Exactly one frozen previous stage for this original decision and model required');if(r.stage==='C')assert.ok(receipt,'Native closed episode receipt required');
 const packet=r.stage==='C'?buildRetrospectivePacket(d,decisions,receipt!,priors[0]):buildReviewPacket(r.stage,d,priors[0],evaluations.find(e=>e.decisionId===d.decisionId),undefined,inferences.find(i=>i.decisionId===d.decisionId));
 const id='manual-'+digest({modelPin:r.modelPin,packet,decisionId:d.decisionId});immutableJson(join(out,'review-inputs',id+'.json'),packet);
 // Archive assignment is kept out of the judge packet. Stage A may deduplicate
 // actor inputs; answer-bearing stages remain bound to their original decision.
 immutableJson(join(out,'model-exports',id+'.json'),{schemaVersion:'coach-lab-model-export-1.0.0',decisionId:d.decisionId,modelPin:r.modelPin,inputHash:digest(packet),packetPath:'review-inputs/'+id+'.json',liveDispatch:false,status:'pending'});
 return {status:'pending',modelPin:r.modelPin,packetPath:join(out,'review-inputs',id+'.json'),inputHash:digest(packet),liveDispatch:false};
}
/** Fixtures validate mechanics. An abstention never manufactures strategy labels. */
export async function runFixtureReviews(decisions:unknown[],out:string,evaluations:JsonObject[]=[],inferences:JsonObject[]=[]):Promise<ReviewRecord[]> {
 const ledger=new ReviewLedger(join(out,'review-ledger'),{mode:'fixture',authorizedUsd:0});const result:ReviewRecord[]=[];let newlyReviewed=0;const finished=new Map<string,ReviewRecord[]>();const index=new Map<string,ReviewRecord[]>();const previous=readJsonDirectory<ReviewRecord>(join(out,'reviews')).filter(r=>r.provenance==='fixture'&&r.modelPin===fixtureModel);for(const review of previous){const key=review.caseId+'|'+(review.stage==='A'?'A':review.presentationHash);const group=index.get(key)??[];group.push(review);index.set(key,group);}for(const review of previous.filter(r=>r.stage==='B-reason'&&r.status==='abstained')){const key=review.caseId+'|'+review.presentationHash;finished.set(key,[...(index.get(review.caseId+'|A')??[]),...(index.get(key)??[])]);}
 for(const value of decisions){const d=validateDecision(value);if(d.forced)continue;let prior:ReviewRecord|undefined;
  const key=exportBlindPacket(d).caseId+'|'+presentationHash(d);const done=finished.get(key);if(done){result.push(...done);continue;}if(newlyReviewed>=8)break;newlyReviewed++;const current:ReviewRecord[]=[];
  for(const stage of ['A','B-cue','B-reason'] as const){const evidence=evaluations.find(e=>e.decisionId===d.decisionId);const packet=buildReviewPacket(stage,d,prior,evidence,undefined,inferences.find(i=>i.decisionId===d.decisionId));const job=ledger.queue(packet,fixtureModel);immutableJson(join(out,'review-inputs',job.id+'.json'),packet);
   if(job.state==='succeeded'){prior=job.result as ReviewRecord;validateRecord('review',prior);result.push(prior);current.push(prior);continue;}
   if(job.state==='unknown-outcome'||job.state==='dispatched'){prior=pendingReview(packet);result.push(prior);break;}
   assert.ok(job.state==='queued'||job.state==='reserved','Rejected fixture job cannot silently retry');if(job.state==='queued')ledger.reserve(job.id,0);ledger.dispatch(job.id);
   const response:ReviewResult={status:'abstained',verdict:null,acceptableActions:[],reasons:[],dimensions:[]};prior=importModelReview(packet,response,fixtureModel,out,'fixture');ledger.settle(job.id,prior,true);result.push(prior);current.push(prior);
  }
  if(current.at(-1)?.stage==='B-reason')finished.set(key,current);
 }
 return result;
}
