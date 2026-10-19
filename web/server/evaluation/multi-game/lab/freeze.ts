import assert from 'node:assert/strict';
import { freezeManifest } from '../manifest.ts';
import type { LabelSnapshot } from '../research.ts';
import { deepFreeze,digest,validateRecord,type RunEnvelope } from './contracts.ts';
import { trixNativeProfiles } from './trix-pins.ts';
export function freezeLabRun(input:unknown,labelIndex:readonly LabelSnapshot[]=[]) {
 const envelope=validateRecord<RunEnvelope>('run',structuredClone(input));
 // V2 is a separate development adapter. Reuse V1's generic study checks on
 // a validation projection; archive/hash the original V2, never that projection.
 const base=envelope.base.schemaVersion==='multi-game-evaluation-1.0.0'?freezeManifest(envelope.base,labelIndex):(()=>{assert.equal(envelope.base.purpose,'development','Trix V2 confirmation unavailable');freezeManifest({...envelope.base,schemaVersion:'multi-game-evaluation-1.0.0',variant:'hearts-solo'},labelIndex);return {hash:digest(envelope.base)};})();
 assert.equal(envelope.runId,envelope.base.id,'Run identity mismatch');const selector=envelope.lab.selector;
 const nativeProfiles=selector.gameId==='trix'
  ? trixNativeProfiles
  : [{gameId:'hearts',variantId:'solo',moduleVersion:'2.0.0',ruleProfileId:'hearts-training-1.0.0'},
    {gameId:'spades',variantId:'solo',moduleVersion:'2.0.0',ruleProfileId:'spades-solo-training-1.0.0'},
    {gameId:'spades',variantId:'partners',moduleVersion:'2.0.0',ruleProfileId:'spades-training-1.0.0'}];
 assert.ok(nativeProfiles.some(pin=>pin.gameId===selector.gameId&&pin.variantId===selector.variantId&&pin.moduleVersion===selector.moduleVersion&&pin.ruleProfileId===selector.ruleProfileId),'Unsupported exact native module/profile selector');
 assert.equal(selector.gameId==='trix',envelope.schemaVersion==='coach-lab-run-2.0.0','Game requires its exact manifest branch');
 for(const pin of [envelope.base.ruleProfile,envelope.base.candidate,envelope.base.reference])assert.equal(pin.hash,envelope.lab.sourceIdentity.sourceDigest,'Rule/policy pin must identify the complete source graph');
 assert.equal(`${selector.gameId}-${selector.variantId}`,envelope.base.variant,'Variant identity mismatch');assert.equal(selector.ruleProfileId,envelope.base.ruleProfile.id,'Rule identity mismatch');
 const roles=envelope.lab.familyRoles;assert.equal(new Set(roles.map(f=>f.id)).size,roles.length,'Duplicate family roles');assert.deepEqual(roles.map(f=>f.id).sort(),envelope.base.families.map(f=>f.id).sort(),'Family roles mismatch');
 for(const family of envelope.base.families){const role=roles.find(f=>f.id===family.id)?.role;assert.equal(role==='confirmation',family.split==='confirmation','Family split mismatch');}
 assert.deepEqual(envelope.lab.seatPolicies.map(p=>p.seat).sort(),[0,1,2,3],'Four deterministic seat policies required');
 const allowed=new Map([['spades-tactics-2.1.0','2.1.0'],['spades-partner-resource-5.0.0','5.0.0'],['hearts-baseline-1.0.0','1.0.0'],['trix-deterministic-1.0.0','1.0.0'],['trix-reasoning-1.0.0','1.0.0'],['trix-history-1.0.0','1.0.0'],['trix-frontier-1.0.0','1.0.0'],['trix-ownership-1.0.0','1.0.0'],['trix-ownership-comparison-1.0.0','1.0.0']]);
 const belongs=(id:string)=>id.startsWith(selector.gameId+'-')&&(id!=='spades-partner-resource-5.0.0'||selector.variantId==='partners');
 for(const pin of envelope.lab.seatPolicies){assert.equal(allowed.get(pin.id),pin.version,'Unknown deterministic policy/version pin');assert.ok(belongs(pin.id),'Policy belongs to another game/variant');}
 for(const pin of [envelope.base.candidate,envelope.base.reference])assert.ok(allowed.has(pin.id)&&belongs(pin.id),'Unknown frozen deterministic policy');
 assert.ok(envelope.lab.caps.maxWallMs<=envelope.base.maxWallMs,'Lab exceeds manifest wall cap');
 // Native confirmation remains unavailable until independent custodian admission exists.
 assert.equal(envelope.base.purpose,'development','Confirmation requires a separately implemented custodian gate');
 return {envelope:deepFreeze(envelope),hash:digest(envelope),baseHash:base.hash,confirmationEligible:false};
}
export function exportStudyDescriptor(input:unknown){const frozen=freezeLabRun(input);const e=frozen.envelope;return validateRecord('study',{schemaVersion:'coach-lab-study-1.0.0',runId:e.runId,privateEnvelopeHash:frozen.hash,purpose:e.base.purpose,variant:e.base.variant,families:e.base.families.map(f=>({id:f.id,commitment:digest({id:f.id,seed:f.seed})})),validationReceipt:{validatorVersion:'coach-lab-run-1.0.0',baseHash:frozen.baseHash,confirmationEligible:false}});}
