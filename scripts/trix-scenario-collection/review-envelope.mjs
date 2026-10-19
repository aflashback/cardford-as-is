// TSC-09: repair one host-bound copied identifier without changing model reasoning.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendEvent, getBlob, jsonBytes, putBlob, readJournal, safePath, sha, withRunLock } from './journal.mjs';
import { canonical } from './contracts.mjs';
import { inspectHostInvocation, verifyHostReceipt, verifyResponseBytes } from './bridge.mjs';
import { validateDecisionProposal, proofMatches } from './review.mjs';
import { verifyReviewProof } from './proof-adapter.mjs';

const normalizerSourceHash = sha(readFileSync(new URL(import.meta.url)));

// This preflight does not store blobs, append events, or invoke native proof work.
// The ordinary validator still checks every reasoning/check/reference/proof field.
export function validateHostReviewEnvelope(collector, job, transportJob, bytes, receipt, {
  processingAudit, validateDecision = validateDecisionProposal, inspectHost = inspectHostInvocation,
} = {}) {
  assert.equal(job.stage, 'decision', 'Only decision review packetHash metadata can be normalized');
  const stored = JSON.parse(readFileSync(safePath(collector.root, `outbox/${job.id}.json`), 'utf8'));
  assert.deepEqual(job, stored, 'Frozen review job changed');
  assert.equal(job.subjectId, job.decisionId);
  assert.equal(job.promptHash, job.promptRef.sha256);
  const prompt = getBlob(collector.root, job.promptRef, false);
  assert.equal(sha(prompt), job.promptHash);
  assert.equal(transportJob.promptHash, job.promptHash, 'Review prompt changed in transport');
  assert.deepEqual(transportJob.promptRef, job.promptRef);
  assert.equal(job.packetHash, job.packetRef.sha256, 'Review packet identity changed');
  const packet = getBlob(collector.root, job.packetRef);
  const state = collector.state(), commit = getBlob(collector.root, job.commitRef);
  assert.equal(commit.decisionId, job.decisionId);
  assert.equal(commit.selectedCandidateId, job.selectedCandidateId);
  assert.ok(state.commits.some(c => canonical(c) === canonical(commit)), 'Review requires exact committed original response');
  assert.deepEqual(getBlob(collector.root, commit.savedRef).job.packetRef, job.packetRef);
  const claims = readJournal(collector.root).filter(row => row.kind === 'review-dispatch-claimed' && row.data.job.jobId === transportJob.jobId);
  assert.equal(claims.length, 1, 'Missing or ambiguous original review dispatch claim');
  const claim = claims[0];
  assert.equal(claim.data.reviewId, job.id); assert.equal(claim.data.stage, job.stage);
  assert.deepEqual(claim.data.job, transportJob, 'Original review transport job changed');
  assert.ok(processingAudit && typeof processingAudit === 'object', 'Frozen review processing audit required');
  assert.deepEqual(Object.keys(processingAudit).sort(), ['originalSourceDigest', 'reviewSourceDigest', 'nativeBinaryDigest'].sort());
  for (const digest of Object.values(processingAudit)) assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(processingAudit.originalSourceDigest, collector.manifest.build.sourceDigest);
  assert.equal(processingAudit.nativeBinaryDigest, collector.manifest.build.binaryDigest);

  const evidence = inspectHost(transportJob, receipt, collector.root);
  assert.equal(evidence.available, true, evidence.reason);
  const admission = verifyHostReceipt(transportJob, receipt, evidence.events, evidence.baseContext);
  assert.equal(admission.admitted, true, admission.errors.join('; '));
  verifyResponseBytes(receipt, bytes);
  for (const originalCommit of state.commits.filter(c => c.episodeId === commit.episodeId)) {
    const original = getBlob(collector.root, originalCommit.savedRef), host = getBlob(collector.root, original.receiptRef);
    assert.notEqual(receipt.hostAgentId, host.hostAgentId, 'Player context cannot review its own decision');
    if (original.job.parentThreadId) assert.notEqual(receipt.hostAgentId, original.job.parentThreadId, 'Coordinator context is not an independent review');
  }
  let raw, normalized;
  try {
    raw = JSON.parse(Buffer.from(bytes).toString('utf8'));
    assert.ok(raw && typeof raw === 'object' && !Array.isArray(raw), 'Review must be an object');
    assert.ok(Object.hasOwn(raw, 'packetHash') && typeof raw.packetHash === 'string', 'Only a copied string packetHash can be normalized');
    assert.notEqual(raw.packetHash, job.packetHash, 'Correct packetHash must use ordinary review import');
    normalized = { ...raw, packetHash: job.packetHash };
    // No correction to version, identity, grading, prose, or evidence is attempted.
    // False proof here only avoids native work; import applies the ordinary verifier.
    validateDecision(normalized, job, packet, { verifyProof: () => ({ verified: false, reason: 'Read-only envelope preflight' }) });
  } catch (error) {
    // Only model content may be skipped while inspecting historical attempts.
    // Filesystem, host, provenance and independence failures remain fatal.
    if (error instanceof SyntaxError || error.code === 'ERR_ASSERTION') error.code = 'TRIX_REVIEW_CONTENT_INVALID';
    throw error;
  }
  const normalization = {
    schemaVersion: 'trix-review-metadata-normalization-1.0.0', field: 'packetHash',
    oldValue: raw.packetHash, newValue: job.packetHash,
    reason: 'Copied packetHash differs from the immutable actor review job independently bound to the verified host prompt.',
    reviewId: job.id, decisionId: job.decisionId, transportJobId: transportJob.jobId,
    dispatchClaimHash: claim.hash, dispatchClaimSequence: claim.sequence,
    promptHash: job.promptHash, packetRef: job.packetRef,
    rawResponseHash: sha(bytes), rawProposalHash: sha(jsonBytes(raw)),
    normalizerSourceHash, ...processingAudit,
  };
  return { raw, normalized, normalization, admission, evidence };
}

export function importNormalizedHostReview(collector, job, transportJob, bytes, receipt, options = {}) {
  return withRunLock(collector.root, () => {
    const checked = validateHostReviewEnvelope(collector, job, transportJob, bytes, receipt, options);
    const duplicate = collector.state().reviews.find(row => row.stage === 'decision' && row.subjectId === job.subjectId);
    if (duplicate) {
      assert.deepEqual(getBlob(collector.root, duplicate.originalRef), checked.raw, 'Conflicting immutable review revision');
      const previous = getBlob(collector.root, duplicate.reviewerReceiptRef);
      assert.equal(previous.reviewerId, receipt.hostAgentId, 'Conflicting reviewer context');
      assert.ok(duplicate.metadataNormalizationRef, 'Existing ordinary review cannot be replaced');
      assert.deepEqual(getBlob(collector.root, duplicate.metadataNormalizationRef), checked.normalization, 'Conflicting normalization revision');
      return duplicate;
    }
    let verifiedReceipt = null;
    const verify = options.verifyProof ?? ((claim, reviewJob, packet) => verifyReviewProof(collector, claim, reviewJob, packet));
    const verifier = (claim, reviewJob, packet) => {
      if (!(job.proofEvidenceRefs ?? []).some(ref => canonical(ref) === canonical(claim.proofRef))) return { verified: false, reason: 'Proof was not supplied to this frozen actor review' };
      const result = verify(claim, reviewJob, packet);
      if (proofMatches(result, claim, reviewJob, packet)) verifiedReceipt = result;
      return result;
    };
    const accepted = (options.validateDecision ?? validateDecisionProposal)(checked.normalized, job, getBlob(collector.root, job.packetRef), { verifyProof: verifier });
    if (accepted.missedOpportunity) {
      assert.ok(verifiedReceipt); getBlob(collector.root, verifiedReceipt.proofRef);
      accepted.acceptedProofReceiptRef = putBlob(collector.root, verifiedReceipt);
    }
    const rawRef = putBlob(collector.root, Buffer.from(bytes));
    const hostEvidenceRef = putBlob(collector.root, { transportJob, receipt, rawRef, admission: checked.admission, trustedHostEvents: checked.evidence.events, baseContextDigest: checked.evidence.baseContext.digest });
    const metadataNormalizationRef = putBlob(collector.root, checked.normalization);
    const reviewerReceiptRef = putBlob(collector.root, {
      reviewerId: receipt.hostAgentId, promptHash: job.promptHash,
      responseHash: sha(jsonBytes(checked.raw)), contextMode: 'independent-review',
      hostEvidenceRef, metadataNormalizationRef,
    });
    const data = { stage: 'decision', subjectId: job.subjectId,
      reviewRef: putBlob(collector.root, accepted), originalRef: putBlob(collector.root, checked.raw),
      reviewerReceiptRef, metadataNormalizationRef };
    // Existing rejection/settlement records remain untouched. This is a distinct
    // acceptance through a versioned metadata repair, never a rewritten attempt.
    appendEvent(collector.root, 'review-metadata-normalized', { reviewId: job.id, transportJobId: transportJob.jobId, metadataNormalizationRef, hostEvidenceRef, originalRef: data.originalRef, reviewRef: data.reviewRef });
    appendEvent(collector.root, 'review-imported', data);
    return data;
  });
}
