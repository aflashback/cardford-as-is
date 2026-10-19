import assert from 'node:assert/strict';
import test from 'node:test';
import { exportBlindPacket, buildReviewPacket, validateReview } from '../evaluation/multi-game/lab/packets.ts';

export function decision() {
  return {schemaVersion:'coach-lab-decision-1.0.0',decisionId:'d1',familyId:'f1',episodeId:'e1',revision:3,actor:0,phase:'play',executionStatus:'prepared',forced:false,policyPin:{seat:0,id:'spades-tactics-2.1.0',version:'2.1.0'},inputDigest:'a'.repeat(64),actorPacket:{publicSchemaVersion:'2.0.0',gameId:'spades',variantId:'partners',seat:0,phase:'play',observation:{hand:['D3','DA'],handCounts:[2,2,2,2],scores:[0,0,0,0],turn:0,dealer:3,roundNumber:1,trick:[],history:[],spadesBroken:false,bids:[1,1,1,1],tricks:[0,0,0,0],bags:[0,0,0,0]},candidates:[{id:'play:D3',public:{kind:'play',card:'D3'}},{id:'play:DA',public:{kind:'play',card:'DA'}}]},legalCandidates:[{id:'play:D3',action:{kind:'play',card:'D3'}},{id:'play:DA',action:{kind:'play',card:'DA'}}],selectedCandidateId:'play:D3',registeredAnalysis:{},originalAnalysis:{},originalAdvice:{},audit:{status:'pending',checks:[]}};
}
test('blind packets drop policy answers and reject private fields before export',()=>{
  const d=decision();const p=exportBlindPacket(d);const encoded=JSON.stringify(p);
  assert.ok(!encoded.includes('selectedCandidateId'));assert.ok(!encoded.includes('spades-tactics'));assert.ok(!encoded.includes('f1'));assert.equal(p.legalCandidates.length,2);
  assert.throws(()=>exportBlindPacket({...d,actorPacket:{...d.actorPacket,observation:{...d.actorPacket.observation,hiddenHands:[['SK']]}}}),/unknown|schema|additional/i);
});
test('isolated review stages require earlier frozen verdict and reject illegal actions or fabricated event references',()=>{
  const d=decision();const a=buildReviewPacket('A',d); assert.ok(!JSON.stringify(a).includes('play:D3","cue'));
  assert.throws(()=>buildReviewPacket('B-cue',d),/stage A/i);
  const verdict={status:'completed',verdict:'uncertain',acceptableActions:['play:D3','play:DA'],reasons:[],dimensions:[]};
  assert.equal(validateReview(a,verdict).verdict,'uncertain');
  assert.throws(()=>validateReview(a,{...verdict,acceptableActions:['play:SK']}),/legal/i);
  assert.throws(()=>validateReview(a,{...verdict,reasons:[{text:'Later king',evidenceRefs:['event:999']}]}),/reference/i);
  assert.throws(()=>validateReview(a,{...verdict,status:'pending'}),/pending/i);
});
