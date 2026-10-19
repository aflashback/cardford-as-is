// TSC-06/08/09: collect the full approved request schedule; selection is deferred.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendEvent, jsonBytes, safePath, sha, withRunLock } from './journal.mjs';

const phaseCaps = [['basic-solo', 32], ['complex-solo', 32], ['basic-partners', 32], ['complex-partners', 64]];
const record = (collector, kind, data) => withRunLock(collector.root, () => appendEvent(collector.root, kind, data));
const hasReview = (state, stage, subjectId) => state.reviews.some(row => row.stage === stage && row.subjectId === subjectId);
const attemptsFor = (state, reviewId) => state.rows.filter(row => row.kind === 'review-dispatch-claimed' && row.data.reviewId === reviewId);

async function originalApis(collector) {
  assert.equal(typeof collector.sourceRoot, 'string', 'Original frozen source root required');
  const original = await import(pathToFileURL(resolve(collector.sourceRoot, 'scripts/trix-scenario-collection/review.mjs')).href);
  const driver = await import(new URL('./live-driver.mjs', import.meta.url));
  const envelope = await import(new URL('./review-envelope.mjs', import.meta.url));
  const worker = await import(new URL('./review-worker.mjs', import.meta.url));
  const raw = await import(new URL('./raw-export.mjs', import.meta.url));
  const failure = await import(new URL('./failed-invocation.mjs', import.meta.url));
  return { ...original, ...driver, ...envelope, ...failure, exportRawGame: raw.exportRawGame, verifyPriorHost: worker.verifyPriorHost, validateSavedContent: worker.validateSavedContent };
}

function validatePolicy(collector, inventory, processingAudit) {
  assert.equal(collector.manifest.mode, 'live', 'Full campaign requires a live frozen collector');
  assert.deepEqual(collector.executionPolicy, { maxActiveSegmentWallMs: null, selectionDeferred: true }, 'Explicit admitted full collection policy required');
  assert.deepEqual(collector.manifest.plan.phases.map(p => [p.variant, p.maxCompletedRequests]), phaseCaps, 'Full collection requires all 160 approved requests');
  assert.equal(collector.manifest.plan.workCaps.maxInvocationWallMs, 300000, 'Original per-call deadline must remain 300 seconds');
  assert.equal(collector.manifest.plan.workCaps.maxPlayerAttemptsPerDecision, 2, 'Original player attempt cap must remain two');
  assert.equal(inventory?.schemaVersion, 'trix-host-base-context-admission-1.0.0');
  assert.equal(inventory.approvedDigests?.length, 1, 'Exactly one inspected context required');
  assert.match(inventory.approvedDigests[0], /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(processingAudit ?? {}).sort(), ['nativeBinaryDigest', 'originalSourceDigest', 'reviewSourceDigest']);
  for (const digest of Object.values(processingAudit)) assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(processingAudit.originalSourceDigest, collector.manifest.build.sourceDigest, 'Original source provenance mismatch');
  assert.equal(processingAudit.nativeBinaryDigest, collector.manifest.build.binaryDigest, 'Native binary provenance mismatch');
}

function assertReviewed(state, outcomes) {
  for (const outcome of outcomes) {
    const commits = state.commits.filter(c => c.episodeId === outcome.episodeId);
    assert.ok(commits.length > 0, 'Completed request requires committed decisions');
    assert.ok(commits.every(c => hasReview(state, 'decision', c.decisionId)), 'Every committed decision requires a review');
    assert.ok(hasReview(state, 'game', outcome.episodeId), 'Every completed request requires a game review');
  }
}

function requestCoverage(collector, state) {
  return collector.manifest.plan.phases.map(phase => {
    const outcomes = state.outcomes.filter(o => o.variant === phase.variant);
    return { variant: phase.variant, required: phase.maxCompletedRequests, completed: outcomes.length,
      remaining: Math.max(0, phase.maxCompletedRequests - outcomes.length),
      requests: Object.fromEntries(phase.requests.map(request => [request, {
        required: phase.maxRequestsPerContract, completed: outcomes.filter(o => o.request === request).length,
        remaining: Math.max(0, phase.maxRequestsPerContract - outcomes.filter(o => o.request === request).length),
      }])) };
  });
}

export function collectionReport(collector) {
  const state = collector.state(), coverage = requestCoverage(collector, state);
  return { schemaVersion: 'trix-full-collection-report-1.0.0', runId: collector.manifest.runId, mode: collector.manifest.mode,
    status: state.paused ? 'paused' : state.claimed ? 'awaiting-response' : state.episode ? 'active' : 'ready',
    selectionDeferred: true, requestCoverage: coverage, remainingRequests: coverage.reduce((n, p) => n + p.remaining, 0),
    reviewCoverage: { committedDecisions: state.commits.length, decision: state.commits.filter(c => hasReview(state, 'decision', c.decisionId)).length,
      completedGames: state.outcomes.length, game: state.outcomes.filter(o => hasReview(state, 'game', o.episodeId)).length },
    counters: { attempts: state.attempts, acceptedPlays: state.acceptedPlays, completedRequests: state.outcomes.length },
    closedPhases: state.closedPhases };
}

export function closeReviewedCollectionBatch(collector, { closePhase = false, reason = 'reviewed collection batch' } = {}) {
  return withRunLock(collector.root, () => {
    const state = collector.state();
    assert.ok(!state.episode && !state.pending && !state.claimed && !state.intent, 'Finish active player work before batch close');
    const phase = collector.manifest.plan.phases.find(p => !state.closedPhases.includes(p.variant));
    assert.ok(phase, 'No open collection phase');
    const outcomes = state.outcomes.filter(o => o.variant === phase.variant);
    assert.ok(outcomes.length > 0 && outcomes.length <= phase.maxCompletedRequests, 'Invalid phase completion count');
    assert.equal(new Set(outcomes.map(o => o.episodeId)).size, outcomes.length, 'Duplicate completed request');
    assertReviewed(state, outcomes);
    const coverage = requestCoverage(collector, state).find(p => p.variant === phase.variant);
    assert.ok(outcomes.every(o => phase.requests.includes(o.request)), 'Unexpected request contract');
    for (const value of Object.values(coverage.requests)) assert.ok(value.completed <= value.required, 'Per-contract cap exceeded');
    if (closePhase) {
      assert.equal(outcomes.length, phase.maxCompletedRequests, 'Phase close requires its actual request cap');
      assert.ok(Object.values(coverage.requests).every(value => value.completed === value.required), 'Phase close requires every contract cap');
    }
    if (!state.rows.some(row => row.kind === 'batch-reviewed' && row.data.variant === phase.variant && row.data.completed === outcomes.length)) {
      appendEvent(collector.root, 'batch-reviewed', { variant: phase.variant, completed: outcomes.length, reason, selectionDeferred: true, requestCoverage: coverage.requests });
    }
    if (closePhase) appendEvent(collector.root, 'phase-closed', { variant: phase.variant, completed: outcomes.length, reason, selectionDeferred: true, requestCoverage: coverage.requests });
    return collectionReport(collector);
  });
}

function stopped(collector, job) {
  const path = safePath(collector.root, `private/invocations/${job.jobId}/private/app-server/stopped.json`);
  return existsSync(path) && JSON.parse(readFileSync(path, 'utf8')).stoppedVerified === true;
}
function settleReview(collector, transport, status, reason) {
  assert.ok(!collector.state().rows.some(row => row.kind === 'review-attempt-settled' && row.data.jobId === transport.jobId), 'Review attempt already settled');
  record(collector, 'review-attempt-settled', { jobId: transport.jobId, status, ...(reason ? { reason } : {}) });
}
function savedReview(collector, transport) {
  const directory = `private/invocations/${transport.jobId}`;
  return { bytes: readFileSync(safePath(collector.root, `${directory}/response.txt`)),
    receipt: JSON.parse(readFileSync(safePath(collector.root, `${directory}/receipt.json`), 'utf8')) };
}
function assertDeadline(collector, transport) {
  const duration = Date.parse(transport.deadlineAt) - Date.parse(transport.claimedAt);
  assert.ok(Number.isFinite(duration) && duration > 0 && duration <= collector.manifest.plan.workCaps.maxInvocationWallMs, 'Invocation exceeded original 300-second budget');
}

async function drainReviews(collector, api, options, envelopeOptions, progress) {
  // Decision packets from an unfinished game are reviewed after its native outcome.
  if (collector.state().episode) return null;
  for (const stage of ['decision', 'game']) for (;;) {
    if (collector.state().paused) return 'paused';
    const packet = api.makeReviewPacket(collector, stage);
    if (packet.stop) break;
    const job = packet.job; assert.equal(job.stage, stage, 'Review stage changed');
    const attempts = attemptsFor(collector.state(), job.id);
    assert.ok(attempts.length <= 2, 'Cumulative review attempt cap exceeded');
    let recovered = false;
    for (const attempt of attempts) {
      if (collector.state().paused) return 'paused';
      const transport = attempt.data.job;
      const settlements = collector.state().rows.filter(row => row.kind === 'review-attempt-settled' && row.data.jobId === transport.jobId);
      if (settlements.length === 0 || !stopped(collector, transport)) return 'uncertain-review-dispatch';
      assert.equal(settlements.length, 1, 'Ambiguous historical review settlement');
      assert.ok(settlements[0].sequence > attempt.sequence && ['accepted', 'rejected'].includes(settlements[0].data.status), 'Invalid historical review settlement');
      const historicalInventory = options.originalInventory && attempt.sequence <= options.originalThroughSequence ? options.originalInventory : options.inventory;
      if (options.reconciledReviewFailures.has(transport.jobId)) {
        assert.equal(settlements[0].data.status, 'rejected');
        const proof = api.verifyFailedReviewInvocation(collector, attempt, historicalInventory);
        assert.deepEqual(proof, options.reconciledReviewFailures.get(transport.jobId), 'Failed invocation evidence changed');
        continue;
      }
      api.verifyPriorHost(collector, attempt, historicalInventory);
      const saved = savedReview(collector, transport);
      let normalize;
      try { normalize = api.validateSavedContent(collector, job, transport, saved.bytes, saved.receipt, envelopeOptions, api); }
      catch (error) {
        if (error.code !== 'TRIX_REVIEW_CONTENT_INVALID') throw error;
        // Only unusable model content permits looking at the next chronological attempt.
        continue;
      }
      if (normalize) api.importNormalizedHostReview(collector, job, transport, saved.bytes, saved.receipt, envelopeOptions);
      else api.importHostReview(collector, job, transport, saved.bytes, saved.receipt);
      record(collector, 'campaign-review-prior-admitted', { reviewId: job.id, jobId: transport.jobId, processingAudit: envelopeOptions.processingAudit });
      progress({ event: 'review-recovered', stage, subjectId: job.subjectId, jobId: transport.jobId });
      recovered = true; break;
    }
    if (recovered) continue;
    if (attempts.length >= 2) return 'review-attempt-cap';
    if (collector.state().paused) return 'paused';
    const claimed = api.claimReviewInvocation(collector, job);
    if (claimed.stop) return claimed.stop;
    const transport = claimed.job;
    try {
      assertDeadline(collector, transport);
      const result = await api.dispatchHostJob(collector, transport, options);
      const claims = attemptsFor(collector.state(), job.id).filter(row => row.data.job.jobId === transport.jobId);
      assert.equal(claims.length, 1, 'Missing or ambiguous review claim');
      assert.ok(stopped(collector, transport), 'Reviewer host is not verified stopped');
      // Host trust is established before any model content may be classified as retryable.
      api.verifyPriorHost(collector, claims[0], options.inventory);
      const saved = savedReview(collector, transport);
      assert.ok(saved.bytes.equals(Buffer.from(result.bytes)), 'Dispatch response differs from preserved raw bytes');
      assert.deepEqual(saved.receipt, result.receipt, 'Dispatch receipt differs from preserved host receipt');
      let normalize;
      try { normalize = api.validateSavedContent(collector, job, transport, saved.bytes, saved.receipt, envelopeOptions, api); }
      catch (error) {
        if (error.code !== 'TRIX_REVIEW_CONTENT_INVALID') throw error;
        settleReview(collector, transport, 'rejected', error.message);
        progress({ event: 'review-response-rejected', stage, subjectId: job.subjectId, reason: error.message });
        continue;
      }
      // A valid preflight commits to this attempt. Import failures cannot select a later rationale.
      if (normalize) api.importNormalizedHostReview(collector, job, transport, saved.bytes, saved.receipt, envelopeOptions);
      else api.importHostReview(collector, job, transport, saved.bytes, saved.receipt);
      settleReview(collector, transport, 'accepted');
      progress({ event: 'reviewed', stage, subjectId: job.subjectId });
    } catch (error) {
      if (stopped(collector, transport) && !collector.state().rows.some(row => row.kind === 'review-attempt-settled' && row.data.jobId === transport.jobId)) settleReview(collector, transport, 'rejected', error.message);
      if (error.message === 'Unexpected MCP infrastructure startup failure' && typeof api.verifyFailedReviewInvocation === 'function') {
        const claim = attemptsFor(collector.state(), job.id).find(row => row.data.job.jobId === transport.jobId);
        const proof = api.verifyFailedReviewInvocation(collector, claim, options.inventory);
        options.reconciledReviewFailures.set(transport.jobId, proof);
        record(collector, 'campaign-review-infrastructure-reconciled', { jobId: transport.jobId, proof });
        progress({ event: 'review-infrastructure-interrupted', stage, subjectId: job.subjectId, consumedAttempts: attemptsFor(collector.state(), job.id).length });
        continue;
      }
      throw error;
    }
  }
  return null;
}

/** Caller owns the exclusive driver lock and the audited frozen-collector facade.
 * This driver never resumes a collector or selects/exports a case. `apis` is
 * fixture injection only, never an operator evidence-admission option.
 */
export async function runFullCampaign(collector, { inventory, originalInventory, originalThroughSequence, reconciledReviewFailures = new Map(), cwd = 'C:/Windows/Temp', executable, processingAudit, progress = () => {}, apis } = {}) {
  validatePolicy(collector, inventory, processingAudit);
  if (originalInventory !== undefined || originalThroughSequence !== undefined) {
    assert.equal(originalInventory?.schemaVersion, 'trix-host-base-context-admission-1.0.0');
    assert.equal(originalInventory.approvedDigests?.length, 1);
    assert.match(originalInventory.approvedDigests[0], /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(originalThroughSequence) && originalThroughSequence >= 0, 'Historical context requires a frozen journal boundary');
  }
  const api = apis ?? await originalApis(collector);
  assert.ok(reconciledReviewFailures instanceof Map, 'Reconciled failures require exact saved proof receipts');
  if(reconciledReviewFailures.size)assert.equal(typeof api.verifyFailedReviewInvocation, 'function');
  for (const name of ['makeReviewPacket', 'claimReviewInvocation', 'dispatchHostJob', 'importHostReview', 'importNormalizedHostReview', 'validateHostReviewEnvelope', 'validateDecisionProposal', 'validateGameProposal', 'verifyPriorHost', 'validateSavedContent', 'exportRawGame']) assert.equal(typeof api[name], 'function', `Missing campaign API ${name}`);
  const options = { inventory, reconciledReviewFailures: new Map(reconciledReviewFailures), ...(originalInventory ? { originalInventory, originalThroughSequence } : {}), cwd, ...(executable ? { executable } : {}) }, envelopeOptions = { processingAudit, validateDecision: api.validateDecisionProposal };
  const exportedGames = new Set();
  const finish = (stop, reason) => ({ stop, ...(reason ? { reason } : {}), report: collectionReport(collector) });
  const halt = stop => { if (stop !== 'paused' && !collector.state().paused) collector.pause(stop); return finish(stop); };
  try {
    for (;;) {
      if (collector.state().paused) return finish('paused');
      if (collector.state().claimed) return halt('uncertain-player-dispatch');
      const reviewStop = await drainReviews(collector, api, options, envelopeOptions, progress);
      if (reviewStop) return halt(reviewStop);
      if (collector.state().paused) return finish('paused');
      const reviewed = collector.state();
      if (!reviewed.episode) for (const outcome of reviewed.outcomes) {
        if (exportedGames.has(outcome.episodeId) || !hasReview(reviewed, 'game', outcome.episodeId)) continue;
        assertReviewed(reviewed, [outcome]);
        await api.exportRawGame(collector, outcome.episodeId, { processingAudit, reusePublishedAudit: true });
        exportedGames.add(outcome.episodeId);
        progress({ event: 'raw-game-exported', episodeId: outcome.episodeId });
      }
      const next = collector.next();
      if (next.stop === 'request-completed') { progress({ event: next.stop, episodeId: next.episodeId, scores: next.outcome.scoreTotals }); continue; }
      if (next.stop === 'batch-review-required') { closeReviewedCollectionBatch(collector); continue; }
      if (next.stop === 'phase-cap-reached') { closeReviewedCollectionBatch(collector, { closePhase: true, reason: next.stop }); continue; }
      if (next.stop === 'campaign-complete') {
        const state = collector.state(), coverage = requestCoverage(collector, state);
        assert.ok(!state.episode && !state.pending && !state.claimed && !state.intent, 'Campaign has unfinished player work');
        assert.equal(state.outcomes.length, 160, 'Full campaign requires 160 completed requests');
        assert.equal(new Set(state.outcomes.map(o => o.episodeId)).size, 160, 'Duplicate campaign outcome');
        assert.ok(coverage.every(p => p.completed === p.required && Object.values(p.requests).every(r => r.completed === r.required)), 'Full campaign requires every phase and contract cap');
        assert.ok(collector.manifest.plan.phases.every(p => state.closedPhases.includes(p.variant)), 'Full campaign has an open phase');
        assertReviewed(state, state.outcomes);
        assert.ok(state.commits.every(c => hasReview(state, 'decision', c.decisionId)), 'Campaign has an unreviewed committed decision');
        if (!state.rows.some(row => row.kind === 'campaign-collection-completed')) record(collector, 'campaign-collection-completed', { completedRequests: 160, reviewedDecisions: state.commits.length, reviewedGames: 160, selectionDeferred: true, processingAudit });
        return finish('campaign-collection-completed');
      }
      if (next.stop === 'phase-target-met') throw Error('Deferred selection cannot close a phase at a selected-case target');
      if (next.stop) return halt(next.stop);
      assert.ok(!next.claimed, 'Outstanding player dispatch');
      const job = collector.claim(next.job.jobId);
      progress({ event: 'player-started', episodeId: job.episodeId, actor: job.actor, revision: job.revision, attempt: job.attempt });
      try {
        assertDeadline(collector, job);
        const schema = job.phase === 'declare-doubles' ? 'declaration-response' : 'play-response';
        assert.equal(job.responseSchemaHash, sha(readFileSync(resolve(collector.sourceRoot, 'contracts/trix-scenario-collection', `${schema}.schema.json`))), 'Frozen response schema mismatch');
        const result = await api.dispatchHostJob(collector, job, options);
        collector.accept(job.jobId, result.bytes, result.receipt);
        progress({ event: 'player-accepted', episodeId: job.episodeId, actor: job.actor, revision: job.revision });
      } catch (error) {
        const state = collector.state();
        // Native accept has already settled a schema-invalid response and enforces its two-attempt cap.
        if (!state.claimed && !state.paused) { progress({ event: 'player-response-rejected', reason: error.message }); continue; }
        if (state.claimed && stopped(collector, job)) collector.settle(job.jobId, error.message, { verifiedNotRunning: true });
        throw error;
      }
    }
  } catch (error) {
    if (!collector.state().paused) collector.pause('campaign-driver-failed');
    return finish('campaign-driver-failed', error.message);
  }
}
