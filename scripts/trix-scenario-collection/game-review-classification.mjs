// Classify model-reported explanation flags separately from proved corrections.
// All saved prose, grades, raw responses and historical validators remain intact.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendEvent, getBlob, jsonBytes, putBlob, readJournal, safePath, sha, withRunLock } from './journal.mjs';
import { validateArtifact } from './external-reader.mjs';
import { validateGameProposal } from './review.mjs';
import { inspectHostInvocation, verifyHostReceipt, verifyResponseBytes } from './bridge.mjs';
import { resolveBuild, sourceDigest } from '../coach-lab-builds.mjs';

export const gameReviewClassificationVersion = 'trix-game-explanation-reference-classification-1.0.0';
export const gameReviewClassificationSourceHash = sha(readFileSync(new URL(import.meta.url)));
const classifierFile = 'scripts/trix-scenario-collection/game-review-classification.mjs';
const one = (rows, predicate, label) => { const found = rows.filter(predicate); assert.equal(found.length, 1, `Missing or ambiguous ${label}`); return found[0]; };

export function classifyGameReviewProposal(raw, job, context, { validateGame = validateGameProposal } = {}) {
  validateArtifact('game-review', raw);
  const projected = structuredClone(raw), removedReferences = [];
  for (let seatIndex = 0; seatIndex < projected.seatSummaries.length; seatIndex++) {
    const seat = projected.seatSummaries[seatIndex];
    assert.equal(new Set(seat.correctionDecisionIds).size, seat.correctionDecisionIds.length, 'Duplicate seat correction reference');
    seat.correctionDecisionIds = seat.correctionDecisionIds.filter((decisionId, index) => {
      const commit = one(context.commits, c => c.decisionId === decisionId, 'seat correction decision');
      assert.equal(commit.actor, seat.actor, 'Cross-seat correction cannot be classified');
      const review = one(context.reviews, r => r.decisionId === decisionId, 'frozen seat review');
      if (review.missedOpportunity !== null) return true;
      const issueCheckIds = review.checks.filter(check => check.status === 'issue').map(check => check.id);
      const explanationIssueCount = review.explanationIssues.length;
      assert.ok(explanationIssueCount > 0 || issueCheckIds.length > 0, 'Unsupported action correction has no explicit explanation flag');
      const frozen = context.frozenRows?.find(row => row.subjectId === decisionId);
      removedReferences.push({ path: `/seatSummaries/${seatIndex}/correctionDecisionIds/${index}`, actor: seat.actor, decisionId,
        ...(frozen ? { frozenReviewRef: frozen.reviewRef } : {}), classification: 'model-reported-unverified-explanation-flag', winningCorrectionSupported: false,
        originalRationaleStatus: review.rationaleStatus, explanationIssueCount, issueCheckIds });
      return false;
    });
  }
  // The supported proof references, native totals, counts, IDs and every other
  // semantic field still pass the unchanged original game validator.
  const accepted = validateGame(projected, job, context);
  return { projected, accepted, removedReferences };
}

function auditPins(collector, audit) {
  assert.deepEqual(Object.keys(audit ?? {}).sort(), ['nativeBinaryDigest', 'originalSourceDigest', 'reviewSourceDigest']);
  for (const digest of Object.values(audit)) assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(audit.originalSourceDigest, collector.manifest.build.sourceDigest); assert.equal(audit.nativeBinaryDigest, collector.manifest.build.binaryDigest);
}

function trustedContext(collector, job) {
  const state = collector.state(), outcome = one(state.outcomes, o => o.episodeId === job.episodeId, 'completed native game');
  assert.deepEqual(outcome.outcomeRef, job.outcomeRef); assert.equal(job.subjectId, job.episodeId);
  const commits = state.commits.filter(c => c.episodeId === job.episodeId);
  assert.equal(commits.filter(c => c.phase === 'playing').length, 52, 'Every native play requires its original commit');
  assert.equal(new Set(commits.map(c => c.decisionId)).size, commits.length, 'Duplicate game decision');
  const frozenRows = commits.map(c => one(state.reviews, r => r.stage === 'decision' && r.subjectId === c.decisionId, 'frozen decision review'));
  const reviews = frozenRows.map(row => getBlob(collector.root, row.reviewRef));
  reviews.forEach((review, index) => assert.equal(review.decisionId, commits[index].decisionId));
  assert.equal(sha(jsonBytes(reviews)), job.frozenDecisionReviewDigest, 'Frozen decision reviews changed');
  const native = getBlob(collector.root, job.outcomeRef), replay = one(collector.replay(), r => r.episodeId === job.episodeId, 'native replay');
  assert.equal(native.status, 'completed'); assert.equal(native.completedTricks, 13); assert.equal(native.acceptedPlays, 52); assert.equal(native.nativeTerminalPhase, 'round-complete');
  assert.equal(replay.status, 'passed'); assert.equal(replay.completedTricks, 13);
  return { commits, reviews, frozenRows, native, replay };
}

export function validateGameReviewEnvelope(collector, job, transport, bytes, receipt, { gameProcessingAudit, processingAudit = gameProcessingAudit, inspectHost = inspectHostInvocation, validateGame = validateGameProposal } = {}) {
  assert.equal(job.stage, 'game'); assert.deepEqual(job, JSON.parse(readFileSync(safePath(collector.root, `outbox/${job.id}.json`))));
  assert.equal(job.promptHash, job.promptRef.sha256); assert.equal(sha(getBlob(collector.root, job.promptRef, false)), job.promptHash);
  assert.equal(transport.promptHash, job.promptHash); assert.deepEqual(transport.promptRef, job.promptRef);
  const claim = one(readJournal(collector.root), row => row.kind === 'review-dispatch-claimed' && row.data.job.jobId === transport.jobId, 'game host claim');
  assert.equal(claim.data.reviewId, job.id); assert.equal(claim.data.stage, 'game'); assert.deepEqual(claim.data.job, transport);
  assert.ok(readJournal(collector.root).filter(row => row.kind === 'review-dispatch-claimed' && row.data.reviewId === job.id).length <= 2, 'Game review attempt cap exceeded');
  const duration = Date.parse(transport.deadlineAt) - Date.parse(transport.claimedAt); assert.ok(Number.isFinite(duration) && duration > 0 && duration <= 300000);
  auditPins(collector, processingAudit);
  const context = trustedContext(collector, job);
  const evidence = inspectHost(transport, receipt, collector.root); assert.equal(evidence.available, true, evidence.reason);
  const admission = verifyHostReceipt(transport, receipt, evidence.events, evidence.baseContext); assert.equal(admission.admitted, true, admission.errors.join('; ')); verifyResponseBytes(receipt, bytes);
  for (const commit of context.commits) {
    const saved = getBlob(collector.root, commit.savedRef), player = getBlob(collector.root, saved.receiptRef);
    assert.notEqual(receipt.hostAgentId, player.hostAgentId, 'Player cannot review its own game');
    if (saved.job.parentThreadId) assert.notEqual(receipt.hostAgentId, saved.job.parentThreadId, 'Coordinator cannot review its own game');
  }
  let raw, checked;
  try { raw = JSON.parse(Buffer.from(bytes).toString('utf8')); checked = classifyGameReviewProposal(raw, job, context, { validateGame }); }
  catch (error) { if (error instanceof SyntaxError || error.code === 'ERR_ASSERTION') error.code = 'TRIX_REVIEW_CONTENT_INVALID'; throw error; }
  const classification = checked.removedReferences.length ? {
    schemaVersion: 'trix-game-review-reference-classification-1.0.0', classificationVersion: gameReviewClassificationVersion, classificationSourceHash: gameReviewClassificationSourceHash,
    reviewId: job.id, episodeId: job.episodeId, transportJobId: transport.jobId, dispatchClaimHash: claim.hash, dispatchClaimSequence: claim.sequence, promptHash: job.promptHash,
    outcomeRef: job.outcomeRef, frozenDecisionReviewDigest: job.frozenDecisionReviewDigest,
    rawResponseHash: sha(bytes), rawProposalHash: sha(jsonBytes(raw)), acceptedProposalHash: sha(jsonBytes(checked.accepted)), removedReferences: checked.removedReferences,
    ...processingAudit,
  } : null;
  return { raw, projected: checked.projected, accepted: checked.accepted, classification, admission, evidence };
}

function authorizationFor(collector, classification) {
  const rows = readJournal(collector.root), authorization = one(rows, r => r.kind === 'game-review-recovery-authorized', 'game classification authorization');
  const recoveryHash = authorization.data.recoveryHash; assert.match(recoveryHash, /^[a-f0-9]{64}$/);
  assert.equal(authorization.data.recoveryPath, `private/game-review-recovery/${recoveryHash}.json`);
  const recovery = JSON.parse(readFileSync(safePath(collector.root, authorization.data.recoveryPath))); assert.equal(sha(jsonBytes(recovery)), recoveryHash);
  assert.equal(recovery.schemaVersion, 'trix-game-review-recovery-1.0.0'); assert.equal(recovery.classificationVersion, gameReviewClassificationVersion); assert.equal(recovery.classificationSourceHash, gameReviewClassificationSourceHash);
  assert.equal(recovery.sourceHashes[classifierFile], gameReviewClassificationSourceHash); assert.equal(sourceDigest(recovery.sourceHashes), recovery.processingBuild.sourceDigest);
  assert.equal(recovery.processingBuild.sourceDigest, classification.reviewSourceDigest); assert.equal(recovery.processingBuild.binaryDigest, classification.nativeBinaryDigest);
  assert.equal(recovery.originalSourceDigest, classification.originalSourceDigest); assert.equal(recovery.nativeBinaryDigest, classification.nativeBinaryDigest); auditPins(collector, classificationAudit(classification));
  assert.equal(authorization.sequence, recovery.previousBoundary.sequence + 1); assert.equal(one(rows, row => row.sequence === recovery.previousBoundary.sequence, 'game authorization boundary').hash, recovery.previousBoundary.hash);
  const delegated = recovery.forcedPolicyDelegation, prior = one(rows, row => row.kind === 'forced-rationale-recovery-authorized' && row.data.recoveryHash === delegated.recoveryHash, 'delegated forced policy authorization');
  const old = JSON.parse(readFileSync(safePath(collector.root, prior.data.recoveryPath))); assert.equal(sha(jsonBytes(old)), delegated.recoveryHash);
  assert.equal(old.policyVersion, delegated.policyVersion); assert.equal(old.policySourceHash, delegated.policySourceHash); assert.deepEqual(old.processingBuild, delegated.processingBuild);
  assert.deepEqual(delegated.processingAudit, { originalSourceDigest: old.originalSourceDigest, nativeBinaryDigest: old.nativeBinaryDigest, reviewSourceDigest: old.processingBuild.sourceDigest });
  assert.equal(delegated.processingAudit.originalSourceDigest, classification.originalSourceDigest); assert.equal(delegated.processingAudit.nativeBinaryDigest, classification.nativeBinaryDigest);
  assert.equal(recovery.sourceHashes['scripts/trix-scenario-collection/forced-rationale-policy.mjs'], delegated.policySourceHash); assert.ok(prior.sequence < authorization.sequence);
  resolveBuild(collector.root, old.sourceHashes, old.processingBuild); resolveBuild(collector.root, recovery.sourceHashes, recovery.processingBuild);
  return { authorizationSequence: authorization.sequence, authorizationHash: authorization.hash, recoveryHash };
}
const classificationAudit = classification => ({ originalSourceDigest: classification.originalSourceDigest, nativeBinaryDigest: classification.nativeBinaryDigest, reviewSourceDigest: classification.reviewSourceDigest });

export function importClassifiedGameHostReview(collector, job, transport, bytes, receipt, options = {}) {
  return withRunLock(collector.root, () => {
    assert.equal(collector.state().paused, false, 'A later pause prevents game classification import');
    const checked = validateGameReviewEnvelope(collector, job, transport, bytes, receipt, options);
    const existing = collector.state().reviews.find(row => row.stage === 'game' && row.subjectId === job.subjectId);
    if (existing) {
      assert.deepEqual(getBlob(collector.root, existing.originalRef), checked.raw, 'Existing game review cannot be replaced');
      assert.equal(getBlob(collector.root, existing.reviewerReceiptRef).reviewerId, receipt.hostAgentId);
      if (checked.classification) { assert.ok(existing.gameReviewClassificationRef); assert.deepEqual(getBlob(collector.root, existing.gameReviewClassificationRef), checked.classification); }
      return existing;
    }
    const gameReviewClassificationAuthorization = checked.classification ? authorizationFor(collector, checked.classification) : null;
    const rawRef = putBlob(collector.root, Buffer.from(bytes)), hostEvidenceRef = putBlob(collector.root, { transportJob: transport, receipt, rawRef, admission: checked.admission, trustedHostEvents: checked.evidence.events, baseContextDigest: checked.evidence.baseContext.digest });
    const gameReviewClassificationRef = checked.classification ? putBlob(collector.root, checked.classification) : null;
    const reviewerReceiptRef = putBlob(collector.root, { reviewerId: receipt.hostAgentId, promptHash: job.promptHash, responseHash: sha(jsonBytes(checked.raw)), contextMode: 'independent-review', hostEvidenceRef,
      ...(gameReviewClassificationRef ? { gameReviewClassificationRef, gameReviewClassificationAuthorization } : {}) });
    const data = { stage: 'game', subjectId: job.subjectId, reviewRef: putBlob(collector.root, checked.accepted), originalRef: putBlob(collector.root, checked.raw), reviewerReceiptRef,
      ...(gameReviewClassificationRef ? { gameReviewClassificationRef, gameReviewClassificationAuthorization } : {}) };
    if (gameReviewClassificationRef) appendEvent(collector.root, 'game-review-classified', { reviewId: job.id, transportJobId: transport.jobId, hostEvidenceRef, originalRef: data.originalRef, reviewRef: data.reviewRef, reviewerReceiptRef, gameReviewClassificationRef, gameReviewClassificationAuthorization });
    appendEvent(collector.root, 'review-imported', data); return data;
  });
}

export function wrapGameReviewApis(api, { gameProcessingAudit } = {}) {
  const wrapped = { ...api };
  wrapped.validateSavedContent = (collector, job, transport, bytes, receipt, options, callerApi) => {
    if (job.stage !== 'game') return api.validateSavedContent(collector, job, transport, bytes, receipt, options, callerApi ?? api);
    validateGameReviewEnvelope(collector, job, transport, bytes, receipt, { processingAudit: gameProcessingAudit, validateGame: api.validateGameProposal }); return false;
  };
  wrapped.importHostReview = (collector, job, transport, bytes, receipt) => job.stage === 'game' ? importClassifiedGameHostReview(collector, job, transport, bytes, receipt, { processingAudit: gameProcessingAudit, validateGame: api.validateGameProposal }) : api.importHostReview(collector, job, transport, bytes, receipt);
  return wrapped;
}

export function verifyGameReviewRecovery(collector, reviewId, { gameProcessingAudit, processingAudit = gameProcessingAudit, api } = {}) {
  const job = JSON.parse(readFileSync(safePath(collector.root, `outbox/${reviewId}.json`))), state = collector.state(); assert.equal(job.id, reviewId); assert.equal(job.stage, 'game');
  const claims = state.rows.filter(row => row.kind === 'review-dispatch-claimed' && row.data.reviewId === reviewId); assert.equal(claims.length, 2, 'Game classification recovery requires both existing attempts');
  const claimBindings = [], earlierRejected = []; let selected;
  for (const claim of claims) {
    const transport = claim.data.job, settlement = one(state.rows, row => row.kind === 'review-attempt-settled' && row.data.jobId === transport.jobId, 'game review settlement');
    assert.equal(settlement.data.status, 'rejected'); assert.ok(settlement.sequence > claim.sequence);
    claimBindings.push({ claimSequence: claim.sequence, claimHash: claim.hash, settlementSequence: settlement.sequence, settlementHash: settlement.hash, jobId: transport.jobId });
    api.verifyPriorHost(collector, claim);
    const directory = `private/invocations/${transport.jobId}`, bytes = readFileSync(safePath(collector.root, `${directory}/response.txt`)), receipt = JSON.parse(readFileSync(safePath(collector.root, `${directory}/receipt.json`)));
    if (selected) continue;
    try {
      const checked = validateGameReviewEnvelope(collector, job, transport, bytes, receipt, { processingAudit, validateGame: api.validateGameProposal });
      assert.ok(checked.classification, 'Earlier valid game response requires ordinary reconciliation');
      selected = { job, transport, bytes, receipt, checked, claim };
    } catch (error) { if (error.code !== 'TRIX_REVIEW_CONTENT_INVALID') throw error; earlierRejected.push({ jobId: transport.jobId, reason: error.message }); }
  }
  assert.ok(selected, 'No saved game response passes narrow explanation-reference classification');
  const { claim, transport, checked } = selected;
  const proof = { schemaVersion: 'trix-game-review-recovery-proof-1.0.0', reviewId, jobId: transport.jobId, claimHash: claim.hash, claimSequence: claim.sequence,
    rawResponseHash: sha(selected.bytes), rawProposalHash: sha(jsonBytes(checked.raw)), acceptedProposalHash: sha(jsonBytes(checked.accepted)), classificationVersion: gameReviewClassificationVersion,
    classificationSourceHash: gameReviewClassificationSourceHash, classification: checked.classification, earlierRejected };
  return { ...selected, proof, claimBindings };
}

export function importRecoveredGameReview(collector, selected, options = {}) {
  const again = verifyGameReviewRecovery(collector, selected.job.id, options); assert.deepEqual(again.proof, selected.proof); assert.deepEqual(again.claimBindings, selected.claimBindings);
  return importClassifiedGameHostReview(collector, again.job, again.transport, again.bytes, again.receipt, { processingAudit: options.gameProcessingAudit ?? options.processingAudit, validateGame: options.api.validateGameProposal });
}

export function validateGameClassificationExport(collector, row, review, original, reviewerReceipt) {
  const classification = getBlob(collector.root, row.gameReviewClassificationRef);
  assert.equal(classification.schemaVersion, 'trix-game-review-reference-classification-1.0.0'); assert.equal(classification.classificationVersion, gameReviewClassificationVersion); assert.equal(classification.classificationSourceHash, gameReviewClassificationSourceHash);
  assert.equal(classification.episodeId, row.subjectId); assert.equal(classification.rawProposalHash, sha(jsonBytes(original))); assert.equal(classification.acceptedProposalHash, sha(jsonBytes(review)));
  const authorization = authorizationFor(collector, classification); assert.deepEqual(row.gameReviewClassificationAuthorization, authorization); assert.deepEqual(reviewerReceipt.gameReviewClassificationAuthorization, authorization); assert.deepEqual(reviewerReceipt.gameReviewClassificationRef, row.gameReviewClassificationRef);
  const rows = readJournal(collector.root), claim = one(rows, r => r.kind === 'review-dispatch-claimed' && r.data.job.jobId === classification.transportJobId, 'classified game claim');
  assert.equal(claim.hash, classification.dispatchClaimHash); assert.equal(claim.sequence, classification.dispatchClaimSequence); assert.equal(claim.data.reviewId, classification.reviewId);
  const host = getBlob(collector.root, reviewerReceipt.hostEvidenceRef), raw = getBlob(collector.root, host.rawRef, false); assert.equal(host.admission.admitted, true); assert.equal(sha(raw), classification.rawResponseHash); assert.deepEqual(JSON.parse(raw.toString('utf8')), original);
  assert.equal(host.receipt.responseHash, classification.rawResponseHash); assert.deepEqual(host.transportJob, claim.data.job); assert.equal(host.transportJob.promptHash, classification.promptHash);
  const event = one(rows, r => r.kind === 'game-review-classified' && r.data.gameReviewClassificationRef?.sha256 === row.gameReviewClassificationRef.sha256, 'game classification admission');
  assert.ok(event.sequence > authorization.authorizationSequence); assert.deepEqual(event.data.reviewRef, row.reviewRef); assert.deepEqual(event.data.originalRef, row.originalRef); assert.deepEqual(event.data.reviewerReceiptRef, row.reviewerReceiptRef); assert.deepEqual(event.data.hostEvidenceRef, reviewerReceipt.hostEvidenceRef); assert.deepEqual(event.data.gameReviewClassificationAuthorization, authorization);
  const imported = one(rows, r => r.kind === 'review-imported' && r.data.stage === 'game' && r.data.subjectId === row.subjectId, 'classified game import'); assert.ok(imported.sequence > event.sequence); assert.deepEqual(imported.data, row);
  const job = JSON.parse(readFileSync(safePath(collector.root, `outbox/${classification.reviewId}.json`))); assert.equal(job.frozenDecisionReviewDigest, classification.frozenDecisionReviewDigest); assert.deepEqual(job.outcomeRef, classification.outcomeRef);
  const context = trustedContext(collector, job), checked = classifyGameReviewProposal(original, job, context);
  assert.deepEqual(checked.accepted, review); assert.deepEqual(checked.removedReferences, classification.removedReferences);
  return classification;
}
