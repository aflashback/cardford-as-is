import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { freezeLabRun } from '../evaluation/multi-game/lab/freeze.ts';
import { validateRecord,type RunEnvelope } from '../evaluation/multi-game/lab/contracts.ts';

export function envelope():RunEnvelope {
  const base = JSON.parse(readFileSync(new URL('../../../qa/evaluation/multi-game/spades-partners.manifest.json', import.meta.url), 'utf8'));
  base.id='lab-test'; base.sourceHashes={'fixture.go':'a'.repeat(64)}; base.families=[{id:'f1',split:'discovery',seed:'test-seed',sealed:false}];
  base.rotations=[0]; base.environments=['fixed-seat-policies-1.0.0'];
  for(const pin of [base.ruleProfile,base.candidate,base.reference])pin.hash='a'.repeat(64);
  return {schemaVersion:'coach-lab-run-1.0.0',runId:base.id,base,lab:{sourceIdentity:{sourceDigest:'a'.repeat(64),binaryDigest:'b'.repeat(64)},selector:{gameId:'spades',variantId:'partners',moduleVersion:'2.0.0',ruleProfileId:base.ruleProfile.id},config:{},seatPolicies:[0,1,2,3].map(seat=>({seat,id:seat===0?base.candidate.id:base.reference.id,version:seat===0?'5.0.0':'2.1.0'})),caps:{maxRounds:100,maxActions:10000,maxTransitions:20000,maxWallMs:60000},judge:{mode:'fixture',authorizedUsd:0},familyRoles:[{id:'f1',role:'development'}]}};
}

test('lab freezes existing study without supplying authority and rejects provider and hidden unknown fields',()=>{
  const value=envelope(); const frozen=freezeLabRun(value); assert.ok(Object.isFrozen(frozen.envelope)); assert.equal(frozen.confirmationEligible,false);
  assert.throws(()=>freezeLabRun({...value,secret:'seed'}),/schema|additional/i);
  assert.throws(()=>freezeLabRun({...value,lab:{...value.lab,judge:{mode:'live',authorizedUsd:5}}}),/fixture|schema/i);
  assert.throws(()=>freezeLabRun({...value,lab:{...value.lab,seatPolicies:[...value.lab.seatPolicies.slice(0,3),{seat:3,id:'neural-policy',version:'1'}]}}),/policy|deterministic/i);
});
test('lab rejects mismatched identities and family roles and preserves literal seed meaning',()=>{
  const value=envelope();assert.equal(freezeLabRun(value).envelope.base.families[0].seed,'test-seed');
  assert.throws(()=>freezeLabRun({...value,runId:'another'}),/identity/i);
  assert.throws(()=>freezeLabRun({...value,lab:{...value.lab,familyRoles:[{id:'f1',role:'development'},{id:'f1',role:'validation'}]}}),/family/i);
  assert.throws(()=>validateRecord('review',{schemaVersion:'coach-lab-review-1.0.0',status:'pending',verdict:'supported'}),/schema/i);
});
test('additive Trix study version retains exact native variants without broadening frozen V1',()=>{
 const value=envelope();value.schemaVersion='coach-lab-run-2.0.0';value.base={...value.base,schemaVersion:'multi-game-evaluation-2.0.0',variant:'trix-basic-solo'};value.base.ruleProfile.id='trix-basic-solo-1.0.0';value.base.candidate.id=value.base.reference.id='trix-deterministic-1.0.0';
 value.lab.selector={gameId:'trix',variantId:'basic-solo',moduleVersion:'2.0.0',ruleProfileId:value.base.ruleProfile.id};value.lab.seatPolicies=[0,1,2,3].map(seat=>({seat,id:'trix-deterministic-1.0.0',version:'1.0.0'}));
 assert.equal(freezeLabRun(value).envelope.base.variant,'trix-basic-solo');
 assert.throws(()=>freezeLabRun({...value,base:{...value.base,schemaVersion:'multi-game-evaluation-1.0.0'}}),/schema|variant/i);
});

test('Trix admission keeps current Partners and historical rule identities isolated',()=>{
 const value=envelope();value.schemaVersion='coach-lab-run-2.0.0';value.base.schemaVersion='multi-game-evaluation-2.0.0';value.base.variant='trix-basic-partners';value.base.candidate.id='trix-reasoning-1.0.0';value.base.reference.id='trix-deterministic-1.0.0';
 value.lab.seatPolicies=[0,1,2,3].map(seat=>({seat,id:'trix-deterministic-1.0.0',version:'1.0.0'}));
 value.lab.selector={gameId:'trix',variantId:'basic-partners',moduleVersion:'2.1.0',ruleProfileId:'trix-basic-partners-1.1.0'};value.base.ruleProfile.id=value.lab.selector.ruleProfileId;
 assert.doesNotThrow(()=>freezeLabRun(value));
 const historical=structuredClone(value);historical.lab.selector.moduleVersion='2.0.0';historical.lab.selector.ruleProfileId=historical.base.ruleProfile.id='trix-basic-partners-1.0.0';historical.base.candidate.id=historical.base.reference.id='trix-deterministic-1.0.0';
 assert.doesNotThrow(()=>freezeLabRun(historical));
 for(const [moduleVersion,ruleProfileId] of [['2.0.0','trix-basic-partners-1.1.0'],['2.1.0','trix-basic-partners-1.0.0'],['2.1.0','trix-basic-solo-1.1.0']]){
  const bad=structuredClone(value);bad.lab.selector.moduleVersion=moduleVersion;bad.lab.selector.ruleProfileId=bad.base.ruleProfile.id=ruleProfileId;
  assert.throws(()=>freezeLabRun(bad),/module|profile|rule/i);
 }
});
