// TSC-09: only the independently reconstructed native public ending can certify
// a correction. The model's proposed certificate is never the proof authority.
import assert from 'node:assert/strict';
import { digest } from './contracts.mjs';
import { getBlob, putBlob } from './journal.mjs';

export function buildProofEvidence(collector,commit,packet) {
  if(commit.forced||commit.phase!=='playing'||packet.handCounts.reduce((sum,count)=>sum+count,0)>8)return [];
  const saved=getBlob(collector.root,commit.savedRef);
  const intent=collector.state().rows.find(r=>r.kind==='commit-intent'&&r.data.jobId===commit.jobId)?.data;
  assert.ok(intent,'Missing original native frame for proof');
  const before=getBlob(collector.root,intent.beforeFrameRef),nativePacket=getBlob(collector.root,saved.job.nativePacketRef);
  assert.deepEqual(before.nativeActorPacket,nativePacket);
  assert.equal(before.revision,commit.revision);assert.equal(nativePacket.seat,packet.actor);
  assert.deepEqual(before.pin,packet.pin);
  const result=collector.native('proof',{pin:before.pin,snapshot:before.snapshot,selectedCandidateId:commit.selectedCandidateId,objective:packet.objective});
  if(!result.verified)return [];
  const c=result.certificate;
  assert.equal(c?.schemaVersion,'trix-public-ending-proof-1.0.0');assert.equal(c.proofKind,'native-objective-dominance');
  assert.deepEqual(c.pin,packet.pin);assert.equal(c.revision,commit.revision);assert.equal(c.actor,packet.actor);
  assert.equal(c.nativePacketDigest,digest(nativePacket));assert.equal(c.objective,packet.objective);
  assert.equal(c.selectedCandidateId,commit.selectedCandidateId);
  assert.ok(c.alternativeCandidateId!==c.selectedCandidateId&&packet.legalOptions.some(o=>o.candidateId===c.alternativeCandidateId));
  assert.ok(c.selectedBounds.terminalCount>0&&c.alternativeBounds.terminalCount>0);
  assert.equal(c.guaranteedAdvantage,c.alternativeBounds.minimum-c.selectedBounds.maximum);assert.ok(c.guaranteedAdvantage>0);
  const proofRef=putBlob(collector.root,result);
  return [{verified:true,proofKind:c.proofKind,packetHash:saved.job.packetRef.sha256,originalCandidateId:c.selectedCandidateId,alternativeCandidateId:c.alternativeCandidateId,objective:c.objective,advantage:c.guaranteedAdvantage,proofRef}];
}

export function verifyReviewProof(collector,claim,job,packet) {
  try{
    const commit=getBlob(collector.root,job.commitRef);
    assert.equal(commit.decisionId,job.decisionId);assert.equal(commit.selectedCandidateId,job.selectedCandidateId);
    const evidence=buildProofEvidence(collector,commit,packet);
    const proof=evidence.find(p=>p.alternativeCandidateId===claim.alternativeCandidateId&&p.proofRef.sha256===claim.proofRef?.sha256);
    assert.ok(proof,'No matching independent native public-ending proof');
    assert.equal(proof.packetHash,job.packetHash);assert.equal(proof.advantage,claim.advantage);assert.equal(proof.objective,claim.objective);
    return {...proof,pin:packet.pin};
  }catch(error){return {verified:false,reason:error.message};}
}
