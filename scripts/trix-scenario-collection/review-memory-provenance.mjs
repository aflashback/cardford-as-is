// The new context epoch adds provenance; historical accepted bytes stay intact.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { appendEvent, getBlob, jsonBytes, putBlob, safePath, sha, withRunLock, writeImmutable } from './journal.mjs';
import { verifyMemoryIsolationInvocation } from './memory-isolated-transport.mjs';
import { verifyHostReceipt, verifyResponseBytes } from './bridge.mjs';
import { validateDecisionProposal, validateGameProposal, proofMatches } from './review.mjs';
import { validateForcedRationaleProposal, validateForcedRationaleExport } from './forced-rationale-policy.mjs';
import { validateGameClassificationExport } from './game-review-classification.mjs';
import { validateReferenceReviewEnvelope } from './reference-envelope.mjs';
import { validateHostReviewEnvelope } from './review-envelope.mjs';
import { verifyReviewProof } from './proof-adapter.mjs';

const one = (rows, predicate, label) => { const found = rows.filter(predicate); assert.equal(found.length, 1, `Missing or ambiguous ${label}`); return found[0]; };
export const reviewMemoryProvenanceVersion = 'trix-review-memory-provenance-1.0.0';
export const reviewMemoryProvenanceSourceHash = sha(readFileSync(new URL(import.meta.url)));
export function memoryAuthorization(latest) { return { sequence: latest.authorization.sequence, hash: latest.authorization.hash, exceptionHash: latest.recoveryHash }; }

export function verifyReviewMemoryProvenance(collector, row, { latest, verifyIsolation = verifyMemoryIsolationInvocation, allowTargetProvenanceRecovery = false } = {}) {
  const wrapper = getBlob(collector.root, row.reviewerReceiptRef), host = getBlob(collector.root, wrapper.hostEvidenceRef);
  const claim = one(collector.state().rows, entry => entry.kind === 'review-dispatch-claimed' && entry.data.job.jobId === host.receipt.jobId, 'imported review claim');
  const job = JSON.parse(readFileSync(safePath(collector.root, `outbox/${claim.data.reviewId}.json`)));
  assert.equal(job.id, claim.data.reviewId); assert.equal(job.stage, claim.data.stage); assert.equal(row.stage, job.stage); assert.equal(row.subjectId, job.subjectId);
  assert.equal(wrapper.promptHash, job.promptHash); assert.equal(host.receipt.promptHash, job.promptHash); assert.equal(claim.data.job.promptHash, job.promptHash);
  assert.equal(host.receipt.dispatchToken, claim.data.job.dispatchToken); assert.equal(wrapper.reviewerId, host.receipt.hostAgentId);
  if(host.transportJob)assert.deepEqual(host.transportJob,claim.data.job);
  const imported=one(collector.state().rows,entry=>entry.kind==='review-imported'&&entry.data.stage===row.stage&&entry.data.subjectId===row.subjectId,'actual imported row');assert.deepEqual(imported.data,row);assert.ok(imported.sequence>claim.sequence);
  if (claim.sequence < latest.authorization.sequence){assert.ok(imported.sequence<latest.authorization.sequence,'A new import cannot borrow a historical review receipt');return { historical: true };}
  assert.ok(claim.sequence > latest.authorization.sequence);
  assert.deepEqual(host.transportJob,claim.data.job);
  const verified = verifyIsolation(collector, claim, latest.recovery.inventory, { processingAudit: latest.recovery.processingAudit, authorization: memoryAuthorization(latest) });
  assert.equal(verified.available, true, verified.reason); assert.equal(wrapper.reviewerId, verified.events.agentId);
  assert.equal(verifyHostReceipt(claim.data.job, host.receipt, verified.events, verified.baseContext).admitted, true);
  verifyResponseBytes(host.receipt, verified.responseBytes);
  assert.equal(host.receipt.responseHash, sha(verified.responseBytes)); assert.ok(getBlob(collector.root, host.rawRef, false).equals(verified.responseBytes));
  const raw = JSON.parse(verified.responseBytes.toString('utf8')), original = getBlob(collector.root, row.originalRef), review = getBlob(collector.root, row.reviewRef);
  assert.deepEqual(raw, original); assert.equal(wrapper.responseHash, sha(jsonBytes(raw)));
  validateAcceptedReview(collector, row, job, raw, review, wrapper, verified, latest);
  const matching=collector.state().rows.filter(entry=>entry.kind==='review-memory-provenance-recorded'&&entry.data.claimHash===claim.hash);
  if(!matching.length&&allowTargetProvenanceRecovery){assert.equal(claim.data.reviewId,latest.recovery.reviewId);return{historical:false,recoveryPending:true,claim};}
  const event = one(matching, () => true, 'new-context review provenance');
  assert.deepEqual(event.data.reviewRef, row.reviewRef); assert.deepEqual(event.data.originalRef, row.originalRef); assert.deepEqual(event.data.reviewerReceiptRef, row.reviewerReceiptRef);
  const proof = getBlob(collector.root, event.data.provenanceRef);
  assert.ok(event.sequence>imported.sequence);assert.deepEqual(proof,{schemaVersion:reviewMemoryProvenanceVersion,sourceHash:reviewMemoryProvenanceSourceHash,authorization:memoryAuthorization(latest),processingAudit:latest.recovery.processingAudit,claimSequence:claim.sequence,claimHash:claim.hash,reviewId:claim.data.reviewId,replacementOrdinal:claim.data.reviewId===latest.recovery.reviewId?3:null,rawResponseHash:sha(verified.responseBytes),contextDigest:latest.recovery.newContextDigest,isolation:verified.isolation});
  if (claim.data.reviewId === latest.recovery.reviewId) {
    const attempts = collector.state().rows.filter(entry => entry.kind === 'review-dispatch-claimed' && entry.data.reviewId === claim.data.reviewId);
    assert.equal(attempts.length, 3); assert.equal(attempts[2].hash, claim.hash); assert.equal(proof.replacementOrdinal, 3);
  } else assert.equal(proof.replacementOrdinal, null);
  return { historical: false, provenanceRef: event.data.provenanceRef, proof, claim };
}
export const validateReviewMemoryProvenance = verifyReviewMemoryProvenance;

function validateAcceptedReview(collector, row, job, raw, review, wrapper, evidence, latest) {
  if (job.stage === 'game') {
    if (row.gameReviewClassificationRef) { validateGameClassificationExport(collector, row, review, raw, wrapper); return; }
    const state = collector.state(), commits = state.commits.filter(commit => commit.episodeId === job.episodeId), frozenRows = commits.map(commit => one(state.reviews, entry => entry.stage === 'decision' && entry.subjectId === commit.decisionId, 'frozen review'));
    const native = getBlob(collector.root, job.outcomeRef), replay = collector.replay().find(result => result.episodeId === job.episodeId);
    assert.deepEqual(validateGameProposal(raw, job, { commits, reviews: frozenRows.map(entry => getBlob(collector.root, entry.reviewRef)), native, replay }), review); return;
  }
  const packet = getBlob(collector.root, job.packetRef), commit = getBlob(collector.root, job.commitRef); let proposal = raw;
  if (row.metadataNormalizationRef) {
    const normalization = getBlob(collector.root, row.metadataNormalizationRef), host=getBlob(collector.root,wrapper.hostEvidenceRef);
    assert.deepEqual(wrapper.metadataNormalizationRef,row.metadataNormalizationRef);
    const processingAudit=Object.fromEntries(['originalSourceDigest','reviewSourceDigest','nativeBinaryDigest'].map(key=>[key,normalization[key]]));
    assert.ok([latest.recovery.processingAudit,latest.recovery.forcedPolicyDelegation.processingAudit].some(audit=>isDeepStrictEqual(audit,processingAudit)),'Unrecognized metadata processing epoch');
    let validateEnvelope;
    if(normalization.schemaVersion==='trix-review-reference-normalization-1.0.0'){assert.equal(normalization.kind,'actor-handCounts-container');validateEnvelope=validateReferenceReviewEnvelope;}
    else{assert.equal(normalization.schemaVersion,'trix-review-metadata-normalization-1.0.0');assert.equal(normalization.field,'packetHash');validateEnvelope=validateHostReviewEnvelope;}
    const checked=validateEnvelope(collector,job,host.transportJob,evidence.responseBytes,host.receipt,{processingAudit,inspectHost:()=>evidence,validateDecision:row.rationalePolicyRef?validateForcedRationaleProposal:validateDecisionProposal});
    assert.deepEqual(normalization,checked.normalization);proposal=checked.normalized;
  }
  let nativeProof;
  const verifier = (claim, reviewJob, actorPacket) => {
    if (!job.proofEvidenceRefs.some(ref => JSON.stringify(ref) === JSON.stringify(claim.proofRef))) return { verified: false, reason: 'Proof was not supplied to the frozen review' };
    const proof = verifyReviewProof(collector, claim, reviewJob, actorPacket); if (proofMatches(proof, claim, reviewJob, actorPacket)) nativeProof = proof; return proof;
  };
  const expected = (row.rationalePolicyRef ? validateForcedRationaleProposal : validateDecisionProposal)(proposal, job, packet, { verifyProof: verifier });
  if (expected.missedOpportunity) { assert.ok(nativeProof); assert.deepEqual(getBlob(collector.root, review.acceptedProofReceiptRef), nativeProof); expected.acceptedProofReceiptRef = review.acceptedProofReceiptRef; }
  assert.deepEqual(expected, review);
  if (row.rationalePolicyRef) validateForcedRationaleExport(collector, collector.state(), row, packet, commit, review, raw, wrapper);
}

export function recordReviewMemoryProvenance(collector, row, claim, latest, { verifyIsolation = verifyMemoryIsolationInvocation } = {}) {
  return withRunLock(collector.root, () => {
    assert.equal(collector.state().paused, false, 'Pause prevents provenance publication');
    const imported = one(collector.state().reviews, entry => entry.stage === row.stage && entry.subjectId === row.subjectId, 'actual imported review'); assert.deepEqual(imported, row);
    const job = JSON.parse(readFileSync(safePath(collector.root, `outbox/${claim.data.reviewId}.json`))); assert.equal(row.stage, claim.data.stage); assert.equal(row.stage, job.stage); assert.equal(row.subjectId, job.subjectId);
    const wrapper = getBlob(collector.root, row.reviewerReceiptRef), host = getBlob(collector.root, wrapper.hostEvidenceRef); assert.equal(host.receipt.jobId, claim.data.job.jobId); assert.equal(host.receipt.dispatchToken, claim.data.job.dispatchToken);
    const evidence = verifyIsolation(collector, claim, latest.recovery.inventory, { processingAudit: latest.recovery.processingAudit, authorization: memoryAuthorization(latest) });
    assert.equal(evidence.available, true, evidence.reason);
    assert.deepEqual(host.transportJob,claim.data.job);assert.equal(wrapper.promptHash,job.promptHash);assert.equal(wrapper.reviewerId,host.receipt.hostAgentId);assert.equal(wrapper.reviewerId,evidence.events.agentId);
    assert.equal(verifyHostReceipt(claim.data.job,host.receipt,evidence.events,evidence.baseContext).admitted,true);verifyResponseBytes(host.receipt,evidence.responseBytes);assert.ok(getBlob(collector.root,host.rawRef,false).equals(evidence.responseBytes));
    const raw=JSON.parse(evidence.responseBytes.toString('utf8'));assert.deepEqual(raw,getBlob(collector.root,row.originalRef));assert.equal(wrapper.responseHash,sha(jsonBytes(raw)));validateAcceptedReview(collector,row,job,raw,getBlob(collector.root,row.reviewRef),wrapper,evidence,latest);
    const proof = { schemaVersion: reviewMemoryProvenanceVersion, sourceHash: reviewMemoryProvenanceSourceHash, authorization: memoryAuthorization(latest), processingAudit: latest.recovery.processingAudit,
      claimSequence: claim.sequence, claimHash: claim.hash, reviewId: claim.data.reviewId, replacementOrdinal: claim.data.reviewId === latest.recovery.reviewId ? 3 : null,
      rawResponseHash: sha(evidence.responseBytes), contextDigest: latest.recovery.newContextDigest, isolation: evidence.isolation };
    const prior = collector.state().rows.filter(entry => entry.kind === 'review-memory-provenance-recorded' && entry.data.claimHash === claim.hash);
    if (prior.length) { assert.equal(prior.length, 1); assert.deepEqual(getBlob(collector.root, prior[0].data.provenanceRef), proof); for (const key of ['reviewRef', 'originalRef', 'reviewerReceiptRef']) assert.deepEqual(prior[0].data[key], row[key]); return prior[0].data.provenanceRef; }
    const provenanceRef = putBlob(collector.root, proof);
    appendEvent(collector.root, 'review-memory-provenance-recorded', { claimHash: claim.hash, provenanceRef, reviewRef: row.reviewRef, originalRef: row.originalRef, reviewerReceiptRef: row.reviewerReceiptRef });
    return provenanceRef;
  });
}

export function exportReviewMemoryProvenance(collector, episodeId, { latest, exportRawGame, processingAudit, verifyIsolation = verifyMemoryIsolationInvocation } = {}) {
  // Validate before the legacy exporter publishes any files.
  const state = collector.state(), commits = state.commits.filter(commit => commit.episodeId === episodeId), bindings = [];
  for (const commit of commits) {
    const claim = one(state.rows, row => row.kind === 'dispatch-claimed' && row.data.jobId === commit.jobId, 'raw player claim');
    if (claim.sequence > latest.authorization.sequence) {
      const verified = verifyIsolation(collector, claim, latest.recovery.inventory, { processingAudit: latest.recovery.processingAudit, authorization: memoryAuthorization(latest) });
      assert.equal(verified.available, true, verified.reason); assert.equal(sha(verified.responseBytes), commit.responseHash);
      bindings.push({ stage: 'player', subjectId: commit.decisionId, claimHash: claim.hash, isolation: verified.isolation });
    }
    const review = one(state.reviews, row => row.stage === 'decision' && row.subjectId === commit.decisionId, 'raw decision review');
    const validated = verifyReviewMemoryProvenance(collector, review, { latest, verifyIsolation });
    if (!validated.historical) bindings.push({ stage: 'decision', subjectId: commit.decisionId, provenanceRef: validated.provenanceRef });
  }
  const game = one(state.reviews, row => row.stage === 'game' && row.subjectId === episodeId, 'raw game review');
  const validated = verifyReviewMemoryProvenance(collector, game, { latest, verifyIsolation });
  if (!validated.historical) bindings.push({ stage: 'game', subjectId: episodeId, provenanceRef: validated.provenanceRef });
  const result = exportRawGame(collector, episodeId, { processingAudit, reusePublishedAudit: true });
  if (!bindings.length) return result;
  const directory = result.directory, sidecar = { schemaVersion: 'trix-raw-memory-provenance-1.0.0', episodeId, authorization: memoryAuthorization(latest), processingAudit: latest.recovery.processingAudit,
    historicalContextCaveat: latest.recovery.historicalCensusRef, sourceHash: reviewMemoryProvenanceSourceHash, rawFiles: result.source.files, bindings };
  writeImmutable(safePath(collector.root, `${directory}/review-memory-provenance.json`), jsonBytes(sidecar));
  writeImmutable(safePath(collector.root, `${directory}/review-memory-provenance-manifest.json`), jsonBytes({ schemaVersion: 'trix-raw-memory-provenance-manifest-1.0.0', episodeId,
    authorization: sidecar.authorization, sourceHash: reviewMemoryProvenanceSourceHash, rawSourceManifestHash: sha(readFileSync(safePath(collector.root, `${directory}/source-manifest.json`))), provenanceHash: sha(jsonBytes(sidecar)) }));
  return result;
}
