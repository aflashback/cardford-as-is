// Versioned review policy: native forcedness and explanation quality are distinct.
// Original prompts, schemas, player responses and the historical validator stay pinned.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendEvent, getBlob, jsonBytes, putBlob, readJournal, safePath, sha, withRunLock } from './journal.mjs';
import { canonical } from './contracts.mjs';
import { validateArtifact } from './external-reader.mjs';
import { validateDecisionProposal, proofMatches } from './review.mjs';
import { inspectHostInvocation, verifyHostReceipt, verifyResponseBytes } from './bridge.mjs';
import { validateHostReviewEnvelope } from './review-envelope.mjs';
import { validateReferenceReviewEnvelope } from './reference-envelope.mjs';
import { verifyReviewProof } from './proof-adapter.mjs';
import { resolveBuild, sourceDigest } from '../coach-lab-builds.mjs';

export const forcedRationalePolicyVersion = 'trix-forced-rationale-quality-1.0.0';
export const forcedRationalePolicySourceHash = sha(readFileSync(new URL(import.meta.url)));
const one = (rows, predicate, label) => { const matches = rows.filter(predicate); assert.equal(matches.length, 1, `Missing or ambiguous ${label}`); return matches[0]; };

function policyAuthorization(collector, application) {
  const authorization = one(readJournal(collector.root), row => row.kind === 'forced-rationale-recovery-authorized', 'forced rationale authorization');
  const recoveryHash = authorization.data.recoveryHash;
  assert.match(recoveryHash, /^[a-f0-9]{64}$/);
  assert.equal(authorization.data.recoveryPath, `private/forced-rationale-recovery/${recoveryHash}.json`);
  const recovery = JSON.parse(readFileSync(safePath(collector.root, authorization.data.recoveryPath)));
  assert.equal(sha(jsonBytes(recovery)), recoveryHash, 'Forced rationale authorization changed');
  assert.equal(recovery.schemaVersion, 'trix-forced-rationale-recovery-1.0.0');
  assert.equal(recovery.policyVersion, forcedRationalePolicyVersion); assert.equal(recovery.policySourceHash, forcedRationalePolicySourceHash);
  assert.equal(recovery.sourceHashes['scripts/trix-scenario-collection/forced-rationale-policy.mjs'], recovery.policySourceHash);
  assert.equal(sourceDigest(recovery.sourceHashes), recovery.processingBuild.sourceDigest);
  assert.equal(recovery.processingBuild.sourceDigest, application.reviewSourceDigest);
  assert.equal(recovery.processingBuild.binaryDigest, application.nativeBinaryDigest);
  assert.equal(recovery.originalSourceDigest, application.originalSourceDigest); assert.equal(recovery.nativeBinaryDigest, application.nativeBinaryDigest);
  assert.equal(recovery.originalSourceDigest, collector.manifest.build.sourceDigest); assert.equal(recovery.nativeBinaryDigest, collector.manifest.build.binaryDigest);
  assert.equal(authorization.sequence, recovery.previousBoundary.sequence + 1);
  assert.equal(one(readJournal(collector.root), row => row.sequence === recovery.previousBoundary.sequence, 'authorization boundary').hash, recovery.previousBoundary.hash);
  resolveBuild(collector.root, recovery.sourceHashes, recovery.processingBuild);
  return { authorizationSequence: authorization.sequence, authorizationHash: authorization.hash, recoveryHash };
}

export function validateForcedRationaleProposal(proposal, job, packet, { validateDecision = validateDecisionProposal, ...options } = {}) {
  // Validate the exact original grade and every schema field before making a
  // validation-only projection. An absent or unknown grade cannot be repaired.
  validateArtifact('decision-review', proposal);
  assert.equal(packet.schemaVersion, 'trix-scenario-player-packet-1.0.0');
  assert.ok(Array.isArray(packet.legalOptions) && packet.legalOptions.length > 0);
  if (packet.legalOptions.length !== 1) return validateDecision(proposal, job, packet, options);
  assert.equal(proposal.missedOpportunity, null, 'A native forced decision cannot have a missed opportunity');
  const projected = { ...structuredClone(proposal), rationaleStatus: 'forced' };
  const accepted = validateDecision(projected, job, packet, options);
  return { ...accepted, rationaleStatus: proposal.rationaleStatus };
}

function trustedEnvelope(collector, job, transport, bytes, receipt, { processingAudit, inspectHost = inspectHostInvocation } = {}) {
  assert.equal(job.stage, 'decision'); assert.equal(job.subjectId, job.decisionId);
  assert.deepEqual(job, JSON.parse(readFileSync(safePath(collector.root, `outbox/${job.id}.json`))));
  assert.equal(job.promptHash, job.promptRef.sha256); assert.equal(sha(getBlob(collector.root, job.promptRef, false)), job.promptHash);
  assert.equal(transport.promptHash, job.promptHash); assert.deepEqual(transport.promptRef, job.promptRef);
  assert.equal(job.packetHash, job.packetRef.sha256);
  const packet = getBlob(collector.root, job.packetRef), state = collector.state(), commit = getBlob(collector.root, job.commitRef);
  assert.equal(commit.decisionId, job.decisionId); assert.equal(commit.selectedCandidateId, job.selectedCandidateId);
  assert.ok(state.commits.some(c => canonical(c) === canonical(commit)), 'Original committed decision changed');
  assert.deepEqual(getBlob(collector.root, commit.savedRef).job.packetRef, job.packetRef);
  assert.equal(packet.schemaVersion, 'trix-scenario-player-packet-1.0.0');
  assert.ok(Array.isArray(packet.legalOptions) && packet.legalOptions.length > 0);
  assert.equal(commit.forced, packet.legalOptions.length === 1, 'Native forcedness changed');
  const rows = readJournal(collector.root), claim = one(rows, r => r.kind === 'review-dispatch-claimed' && r.data.job.jobId === transport.jobId, 'review dispatch claim');
  assert.equal(claim.data.reviewId, job.id); assert.equal(claim.data.stage, job.stage); assert.deepEqual(claim.data.job, transport);
  assert.ok(rows.filter(r => r.kind === 'review-dispatch-claimed' && r.data.reviewId === job.id).length <= 2, 'Cumulative review attempt cap exceeded');
  const duration = Date.parse(transport.deadlineAt) - Date.parse(transport.claimedAt);
  assert.ok(Number.isFinite(duration) && duration > 0 && duration <= 300000, 'Original invocation budget changed');
  assert.deepEqual(Object.keys(processingAudit ?? {}).sort(), ['nativeBinaryDigest', 'originalSourceDigest', 'reviewSourceDigest']);
  for (const digest of Object.values(processingAudit)) assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(processingAudit.originalSourceDigest, collector.manifest.build.sourceDigest);
  assert.equal(processingAudit.nativeBinaryDigest, collector.manifest.build.binaryDigest);
  const evidence = inspectHost(transport, receipt, collector.root); assert.equal(evidence.available, true, evidence.reason);
  const admission = verifyHostReceipt(transport, receipt, evidence.events, evidence.baseContext);
  assert.equal(admission.admitted, true, admission.errors.join('; ')); verifyResponseBytes(receipt, bytes);
  for (const c of state.commits.filter(c => c.episodeId === commit.episodeId)) {
    const saved = getBlob(collector.root, c.savedRef), player = getBlob(collector.root, saved.receiptRef);
    assert.notEqual(receipt.hostAgentId, player.hostAgentId, 'Player cannot review its own decision');
    if (saved.job.parentThreadId) assert.notEqual(receipt.hostAgentId, saved.job.parentThreadId, 'Coordinator cannot review its own decision');
  }
  return { packet, commit, claim, evidence, admission };
}

export function validateForcedRationaleEnvelope(collector, job, transport, bytes, receipt, options = {}) {
  // Provenance, native state and host evidence stay outside the content error boundary.
  const trusted = trustedEnvelope(collector, job, transport, bytes, receipt, options);
  const validator = (proposal, reviewJob, packet, validationOptions) => validateForcedRationaleProposal(proposal, reviewJob, packet, { ...validationOptions, validateDecision: options.validateDecision ?? validateDecisionProposal });
  let raw, normalized, accepted, normalization;
  try {
    raw = JSON.parse(Buffer.from(bytes).toString('utf8')); assert.ok(raw && typeof raw === 'object' && !Array.isArray(raw));
    normalized = raw;
    if (options.allowMetadataNormalization && raw.packetHash !== job.packetHash) {
      const checked = validateHostReviewEnvelope(collector, job, transport, bytes, receipt, { ...options, validateDecision: validator });
      normalized = checked.normalized; normalization = checked.normalization;
    } else {
      try { validator(raw, job, trusted.packet, { verifyProof: () => ({ verified: false, reason: 'Forced-rationale read-only preflight' }) }); }
      catch (ordinaryError) {
        if (!options.allowMetadataNormalization) throw ordinaryError;
        try {
          const checked = validateReferenceReviewEnvelope(collector, job, transport, bytes, receipt, { ...options, validateDecision: validator });
          normalized = checked.normalized; normalization = checked.normalization;
        } catch (repairError) {
          if (repairError.code === 'TRIX_REVIEW_CONTENT_INVALID' && repairError.message === 'No supported actor-reference typo') throw ordinaryError;
          throw repairError;
        }
      }
    }
    accepted = validator(normalized, job, trusted.packet, { verifyProof: () => ({ verified: false, reason: 'Forced-rationale read-only preflight' }) });
  } catch (error) {
    if (error instanceof SyntaxError || error.code === 'ERR_ASSERTION') error.code = 'TRIX_REVIEW_CONTENT_INVALID';
    throw error;
  }
  const nativeForced = trusted.packet.legalOptions.length === 1;
  const rationalePolicy = nativeForced && raw.rationaleStatus !== 'forced' ? {
    schemaVersion: 'trix-forced-rationale-policy-application-1.0.0', policyVersion: forcedRationalePolicyVersion, policySourceHash: forcedRationalePolicySourceHash,
    reviewId: job.id, decisionId: job.decisionId, transportJobId: transport.jobId, dispatchClaimHash: trusted.claim.hash, dispatchClaimSequence: trusted.claim.sequence,
    promptHash: job.promptHash, packetRef: job.packetRef, nativeForced: true, originalRationaleStatus: raw.rationaleStatus, acceptedRationaleStatus: accepted.rationaleStatus,
    rawResponseHash: sha(bytes), rawProposalHash: sha(jsonBytes(raw)), acceptedProposalHash: sha(jsonBytes(accepted)),
    validationProjection: { field: 'rationaleStatus', from: raw.rationaleStatus, to: 'forced', validationOnly: true },
    ...(normalization ? { metadataNormalizationHash: sha(jsonBytes(normalization)) } : {}), ...options.processingAudit,
  } : null;
  return { raw, normalized, accepted, normalization, rationalePolicy, admission: trusted.admission, evidence: trusted.evidence };
}

export function importForcedRationaleHostReview(collector, job, transport, bytes, receipt, options = {}) {
  return withRunLock(collector.root, () => {
    assert.equal(collector.state().paused, false, 'A later pause prevents forced-rationale import');
    const checked = validateForcedRationaleEnvelope(collector, job, transport, bytes, receipt, options);
    const existing = collector.state().reviews.find(r => r.stage === 'decision' && r.subjectId === job.subjectId);
    if (existing) {
      assert.deepEqual(getBlob(collector.root, existing.originalRef), checked.raw, 'Existing original review cannot be replaced');
      const previous = getBlob(collector.root, existing.reviewerReceiptRef); assert.equal(previous.reviewerId, receipt.hostAgentId);
      if (checked.rationalePolicy) { assert.ok(existing.rationalePolicyRef, 'Existing historical review cannot be reclassified'); assert.deepEqual(getBlob(collector.root, existing.rationalePolicyRef), checked.rationalePolicy); }
      if (checked.normalization) { assert.ok(existing.metadataNormalizationRef); assert.deepEqual(getBlob(collector.root, existing.metadataNormalizationRef), checked.normalization); }
      return existing;
    }
    let proofReceipt;
    const verify = options.verifyProof ?? ((claim, reviewJob, packet) => verifyReviewProof(collector, claim, reviewJob, packet));
    const verifier = (claim, reviewJob, packet) => {
      if (!(job.proofEvidenceRefs ?? []).some(ref => canonical(ref) === canonical(claim.proofRef))) return { verified: false, reason: 'Proof was not supplied to this frozen actor review' };
      const result = verify(claim, reviewJob, packet); if (proofMatches(result, claim, reviewJob, packet)) proofReceipt = result; return result;
    };
    const accepted = validateForcedRationaleProposal(checked.normalized, job, getBlob(collector.root, job.packetRef), { validateDecision: options.validateDecision ?? validateDecisionProposal, verifyProof: verifier });
    if (accepted.missedOpportunity) { assert.ok(proofReceipt); getBlob(collector.root, proofReceipt.proofRef); accepted.acceptedProofReceiptRef = putBlob(collector.root, proofReceipt); }
    if (checked.rationalePolicy) assert.equal(sha(jsonBytes(accepted)), checked.rationalePolicy.acceptedProposalHash);
    const rationalePolicyAuthorization = checked.rationalePolicy ? policyAuthorization(collector, checked.rationalePolicy) : null;
    const rawRef = putBlob(collector.root, Buffer.from(bytes)), hostEvidenceRef = putBlob(collector.root, { transportJob: transport, receipt, rawRef, admission: checked.admission, trustedHostEvents: checked.evidence.events, baseContextDigest: checked.evidence.baseContext.digest });
    const metadataNormalizationRef = checked.normalization ? putBlob(collector.root, checked.normalization) : null;
    const rationalePolicyRef = checked.rationalePolicy ? putBlob(collector.root, checked.rationalePolicy) : null;
    const reviewerReceiptRef = putBlob(collector.root, { reviewerId: receipt.hostAgentId, promptHash: job.promptHash, responseHash: sha(jsonBytes(checked.raw)), contextMode: 'independent-review', hostEvidenceRef,
      ...(metadataNormalizationRef ? { metadataNormalizationRef } : {}), ...(rationalePolicyRef ? { rationalePolicyRef, rationalePolicyAuthorization } : {}) });
    const data = { stage: 'decision', subjectId: job.subjectId, reviewRef: putBlob(collector.root, accepted), originalRef: putBlob(collector.root, checked.raw), reviewerReceiptRef,
      ...(metadataNormalizationRef ? { metadataNormalizationRef } : {}), ...(rationalePolicyRef ? { rationalePolicyRef, rationalePolicyAuthorization } : {}) };
    const binding = { reviewId: job.id, transportJobId: transport.jobId, hostEvidenceRef, originalRef: data.originalRef, reviewRef: data.reviewRef, reviewerReceiptRef,
      ...(metadataNormalizationRef ? { metadataNormalizationRef } : {}), ...(rationalePolicyRef ? { rationalePolicyRef, rationalePolicyAuthorization } : {}) };
    if (metadataNormalizationRef) appendEvent(collector.root, checked.normalization.kind === 'actor-handCounts-container' ? 'review-reference-normalized' : 'review-metadata-normalized', binding);
    if (rationalePolicyRef) appendEvent(collector.root, 'forced-rationale-imported', binding);
    appendEvent(collector.root, 'review-imported', data); return data;
  });
}

export function wrapForcedRationaleApis(api, { processingAudit } = {}) {
  const originalValidator = api.validateDecisionProposal;
  const policyValidator = (proposal, job, packet, options) => validateForcedRationaleProposal(proposal, job, packet, { ...options, validateDecision: originalValidator });
  const wrapped = { ...api, validateDecisionProposal: policyValidator };
  const envelopeOptions = options => ({ ...options, processingAudit: options?.processingAudit ?? processingAudit, validateDecision: originalValidator });
  wrapped.validateSavedContent = (collector, job, transport, bytes, receipt, options, callerApi) => {
    if (job.stage !== 'decision') return api.validateSavedContent(collector, job, transport, bytes, receipt, options, callerApi ?? wrapped);
    try { return api.validateSavedContent(collector, job, transport, bytes, receipt, options, wrapped); }
    catch (error) {
      if (error.code !== 'TRIX_REVIEW_CONTENT_INVALID') throw error;
      const checked = validateForcedRationaleEnvelope(collector, job, transport, bytes, receipt, { ...envelopeOptions(options), allowMetadataNormalization: true });
      return Boolean(checked.normalization);
    }
  };
  wrapped.importHostReview = (collector, job, transport, bytes, receipt) => job.stage === 'decision'
    ? importForcedRationaleHostReview(collector, job, transport, bytes, receipt, envelopeOptions()) : api.importHostReview(collector, job, transport, bytes, receipt);
  wrapped.importNormalizedHostReview = (collector, job, transport, bytes, receipt, options) => importForcedRationaleHostReview(collector, job, transport, bytes, receipt, { ...envelopeOptions(options), allowMetadataNormalization: true });
  return wrapped;
}

export function verifyForcedRationaleRecovery(collector, reviewId, { processingAudit, api } = {}) {
  const job = JSON.parse(readFileSync(safePath(collector.root, `outbox/${reviewId}.json`))), state = collector.state();
  assert.equal(job.id, reviewId); assert.equal(job.stage, 'decision');
  const claims = state.rows.filter(r => r.kind === 'review-dispatch-claimed' && r.data.reviewId === reviewId);
  assert.equal(claims.length, 2, 'Forced-rationale recovery requires both existing attempts');
  const claimBindings = [], earlierRejected = []; let selected;
  for (const claim of claims) {
    const transport = claim.data.job, settlement = one(state.rows, r => r.kind === 'review-attempt-settled' && r.data.jobId === transport.jobId, 'review settlement');
    assert.equal(settlement.data.status, 'rejected'); assert.ok(settlement.sequence > claim.sequence);
    claimBindings.push({ claimSequence: claim.sequence, claimHash: claim.hash, settlementSequence: settlement.sequence, settlementHash: settlement.hash, jobId: transport.jobId });
    api.verifyPriorHost(collector, claim);
    const dir = `private/invocations/${transport.jobId}`, bytes = readFileSync(safePath(collector.root, `${dir}/response.txt`)), receipt = JSON.parse(readFileSync(safePath(collector.root, `${dir}/receipt.json`)));
    if (selected) continue;
    try {
      const checked = validateForcedRationaleEnvelope(collector, job, transport, bytes, receipt, { processingAudit, validateDecision: api.validateDecisionProposal, allowMetadataNormalization: true });
      assert.ok(checked.rationalePolicy?.nativeForced, 'Earlier valid response requires ordinary reconciliation');
      selected = { job, transport, bytes, receipt, checked, claim };
    } catch (error) { if (error.code !== 'TRIX_REVIEW_CONTENT_INVALID') throw error; earlierRejected.push({ jobId: transport.jobId, reason: error.message }); }
  }
  assert.ok(selected, 'No saved response passes the forced-rationale policy');
  const { transport, claim, checked } = selected;
  const proof = { schemaVersion: 'trix-forced-rationale-recovery-proof-1.0.0', reviewId, jobId: transport.jobId, claimHash: claim.hash, claimSequence: claim.sequence,
    rawResponseHash: sha(selected.bytes), rawProposalHash: sha(jsonBytes(checked.raw)), acceptedProposalHash: sha(jsonBytes(checked.accepted)),
    policyVersion: forcedRationalePolicyVersion, policySourceHash: forcedRationalePolicySourceHash, nativeForced: true,
    rationalePolicy: checked.rationalePolicy, metadataNormalization: checked.normalization ?? null, earlierRejected };
  return { ...selected, proof, claimBindings };
}

export function importRecoveredForcedRationaleReview(collector, selected, options = {}) {
  const again = verifyForcedRationaleRecovery(collector, selected.job.id, options);
  assert.deepEqual(again.proof, selected.proof); assert.deepEqual(again.claimBindings, selected.claimBindings);
  return importForcedRationaleHostReview(collector, again.job, again.transport, again.bytes, again.receipt, { processingAudit: options.processingAudit, validateDecision: options.api.validateDecisionProposal, allowMetadataNormalization: true });
}

export function validateForcedRationaleExport(collector, state, row, packet, commit, review, original, reviewerReceipt) {
  assert.ok(row.rationalePolicyRef, 'Forced quality review requires an authenticated policy receipt');
  const policy = getBlob(collector.root, row.rationalePolicyRef);
  assert.equal(policy.schemaVersion, 'trix-forced-rationale-policy-application-1.0.0'); assert.equal(policy.policyVersion, forcedRationalePolicyVersion);
  assert.equal(policy.policySourceHash, forcedRationalePolicySourceHash); assert.equal(policy.nativeForced, true); assert.equal(commit.forced, true); assert.equal(packet.legalOptions.length, 1);
  assert.equal(policy.decisionId, commit.decisionId); assert.deepEqual(policy.packetRef, getBlob(collector.root, commit.savedRef).job.packetRef);
  assert.equal(policy.originalSourceDigest, collector.manifest.build.sourceDigest); assert.equal(policy.nativeBinaryDigest, collector.manifest.build.binaryDigest); assert.match(policy.reviewSourceDigest, /^[a-f0-9]{64}$/);
  assert.equal(policy.originalRationaleStatus, original.rationaleStatus); assert.equal(policy.acceptedRationaleStatus, review.rationaleStatus); assert.equal(review.rationaleStatus, original.rationaleStatus);
  assert.equal(policy.rawProposalHash, sha(jsonBytes(original))); assert.equal(policy.acceptedProposalHash, sha(jsonBytes(review))); assert.equal(review.missedOpportunity, null);
  assert.deepEqual(policy.validationProjection, { field: 'rationaleStatus', from: original.rationaleStatus, to: 'forced', validationOnly: true });
  assert.deepEqual(reviewerReceipt.rationalePolicyRef, row.rationalePolicyRef);
  const authorization = policyAuthorization(collector, policy);
  assert.deepEqual(row.rationalePolicyAuthorization, authorization); assert.deepEqual(reviewerReceipt.rationalePolicyAuthorization, authorization);
  const host = getBlob(collector.root, reviewerReceipt.hostEvidenceRef), raw = getBlob(collector.root, host.rawRef, false);
  assert.equal(host.admission.admitted, true); assert.equal(sha(raw), policy.rawResponseHash); assert.deepEqual(JSON.parse(raw.toString('utf8')), original);
  assert.equal(host.receipt.responseHash, policy.rawResponseHash); assert.equal(host.transportJob.jobId, policy.transportJobId); assert.equal(host.transportJob.promptHash, policy.promptHash);
  const rows = readJournal(collector.root), claim = one(rows, r => r.kind === 'review-dispatch-claimed' && r.data.job.jobId === policy.transportJobId, 'policy claim');
  assert.equal(claim.hash, policy.dispatchClaimHash); assert.equal(claim.sequence, policy.dispatchClaimSequence); assert.equal(claim.data.reviewId, policy.reviewId); assert.deepEqual(claim.data.job, host.transportJob);
  const event = one(rows, r => r.kind === 'forced-rationale-imported' && r.data.rationalePolicyRef?.sha256 === row.rationalePolicyRef.sha256, 'forced policy journal admission');
  assert.ok(event.sequence > claim.sequence); assert.deepEqual(event.data.reviewRef, row.reviewRef); assert.deepEqual(event.data.originalRef, row.originalRef); assert.deepEqual(event.data.reviewerReceiptRef, row.reviewerReceiptRef); assert.deepEqual(event.data.hostEvidenceRef, reviewerReceipt.hostEvidenceRef);
  assert.ok(authorization.authorizationSequence < event.sequence, 'Policy import preceded its authorization'); assert.deepEqual(event.data.rationalePolicyAuthorization, authorization);
  const imported = one(rows, r => r.kind === 'review-imported' && r.data.subjectId === row.subjectId, 'policy review import');
  assert.ok(imported.sequence > event.sequence); assert.deepEqual(imported.data, row);
  if (row.metadataNormalizationRef) { const metadata = getBlob(collector.root, row.metadataNormalizationRef); assert.equal(policy.metadataNormalizationHash, sha(jsonBytes(metadata))); assert.deepEqual(event.data.metadataNormalizationRef, row.metadataNormalizationRef); }
  else assert.equal(policy.metadataNormalizationHash, undefined);
  validateForcedRationaleProposal(review, { decisionId: commit.decisionId, packetHash: policy.packetRef.sha256 }, packet);
  return policy;
}
