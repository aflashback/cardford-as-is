// Reviews only: finish earned work inside its original budget, never play.
import assert from 'node:assert/strict';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendEvent, getBlob, jsonBytes, safePath, sha, withRunLock } from './journal.mjs';
import { inspectHostInvocation, verifyHostReceipt, verifyResponseBytes } from './bridge.mjs';

async function originalApis(collector) {
  assert.equal(typeof collector.sourceRoot, 'string', 'Original frozen source root required');
  const originalReview = await import(pathToFileURL(resolve(collector.sourceRoot, 'scripts/trix-scenario-collection/review.mjs')).href);
  const originalDriver = await import(pathToFileURL(resolve(collector.sourceRoot, 'scripts/trix-scenario-collection/live-driver.mjs')).href);
  const envelope = await import(new URL('./review-envelope.mjs', import.meta.url));
  return { ...originalReview, ...originalDriver, ...envelope };
}
const record = (collector, kind, data) => withRunLock(collector.root, () => appendEvent(collector.root, kind, data));
const attemptsFor = (collector, job) => collector.state().rows.filter(r => r.kind === 'review-dispatch-claimed' && r.data.reviewId === job.id);
function stopped(collector, transport) {
  const path = safePath(collector.root, `private/invocations/${transport.jobId}/private/app-server/stopped.json`);
  return existsSync(path) && JSON.parse(readFileSync(path, 'utf8')).stoppedVerified === true;
}
function lockDriver(root) {
  const path = safePath(root, 'private/driver.lock');
  if (existsSync(path)) {
    const owner = JSON.parse(readFileSync(path, 'utf8')); assert.ok(Number.isInteger(owner.pid) && owner.pid > 0, 'Invalid driver lock');
    let alive = true; try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    assert.equal(alive, false, 'A collection driver is already active'); unlinkSync(path);
  }
  const fd = openSync(path, 'wx'); writeFileSync(fd, jsonBytes({ pid: process.pid, startedAt: new Date().toISOString(), worker: 'reviews-only' })); fsyncSync(fd);
  return () => { closeSync(fd); unlinkSync(path); };
}

function reviewFacade(collector, originalDeadlineAt, processingAudit) {
  const state = collector.state(), rows = state.rows;
  assert.equal(collector.manifest.mode, 'live'); assert.ok(state.paused, 'Reviews-only repair requires a paused baseline');
  assert.ok(!state.episode && !state.claimed && !state.intent, 'Finish or reconcile all player work before reviews-only repair');
  assert.ok(!rows.some(r => r.kind === 'resume' || r.kind === 'attempt-settled' && r.data.fatal), 'Prior reset or fatal player stop prevents repair');
  const pauses = rows.filter(r => r.kind === 'pause'); assert.ok(pauses.length > 0 && pauses.every(r => r.data.reason === 'review-failed'), 'Operator or safety pause prevents reviews-only repair');
  const segments = rows.filter(r => r.kind === 'segment-started'); assert.equal(segments.length, 1, 'Original segment changed');
  const segmentStartedAt = segments[0].at, deadline = Date.parse(segmentStartedAt) + collector.manifest.plan.workCaps.maxActiveSegmentWallMs;
  assert.equal(Date.parse(originalDeadlineAt), deadline, 'Reviews-only worker cannot extend the original deadline');
  assert.ok(Date.now() < deadline, 'Original deadline expired');
  for (const key of ['originalSourceDigest', 'reviewSourceDigest', 'nativeBinaryDigest']) assert.match(processingAudit?.[key] ?? '', /^[a-f0-9]{64}$/);
  assert.equal(processingAudit.originalSourceDigest, collector.manifest.build.sourceDigest, 'Original source provenance mismatch');
  assert.equal(processingAudit.nativeBinaryDigest, collector.manifest.build.binaryDigest, 'Original native binary provenance mismatch');
  for (const claim of rows.filter(r => r.kind === 'dispatch-claimed')) assert.ok(rows.some(r => ['move-committed', 'attempt-settled'].includes(r.kind) && r.data.jobId === claim.data.jobId), 'Unsettled player claim');
  for (const claim of rows.filter(r => r.kind === 'review-dispatch-claimed')) {
    const settlements = rows.filter(r => r.kind === 'review-attempt-settled' && r.data.jobId === claim.data.job.jobId);
    assert.equal(settlements.length, 1, 'Unsettled review claim');
    assert.ok(stopped(collector, claim.data.job), 'Prior reviewer host is not stopped');
    if (settlements[0].data.status === 'rejected') assert.equal(settlements[0].data.reason, `${claim.data.stage}-review schema: data/packetHash must match pattern "^[a-f0-9]{64}$"`, 'Prior failure is outside metadata repair scope');
  }
  const boundary = rows.at(-1).sequence, baseHashes = new Set(pauses.map(r => r.hash)), underlyingState = collector.state.bind(collector);
  const facade = Object.create(collector);
  for (const method of ['next', 'claim', 'accept', 'resume', 'abandon']) facade[method] = () => { throw Error('Reviews-only worker cannot start player work or reset budget'); };
  facade.state = () => {
    const current = underlyingState();
    assert.ok(pauses.every(p => current.rows.some(r => r.sequence === p.sequence && r.hash === p.hash)), 'Paused baseline changed');
    assert.ok(!current.rows.some(r => r.sequence > boundary && ['resume', 'segment-started'].includes(r.kind)), 'Original review budget reset');
    const newPause = current.rows.some(r => r.kind === 'pause' && !baseHashes.has(r.hash) || r.sequence > boundary && r.kind === 'attempt-settled' && r.data.fatal);
    return { ...current, paused: newPause ? true : false, segmentStartedAt };
  };
  return { facade, deadline, segmentStartedAt };
}

export function verifyPriorHost(collector, claim, inventory) {
  const job = JSON.parse(readFileSync(safePath(collector.root, `outbox/${claim.data.reviewId}.json`), 'utf8'));
  assert.equal(job.id, claim.data.reviewId); assert.equal(job.stage, claim.data.stage);
  const transport = claim.data.job;
  assert.equal(transport.promptHash, job.promptHash); assert.deepEqual(transport.promptRef, job.promptRef);
  assert.equal(sha(getBlob(collector.root, job.promptRef, false)), job.promptHash);
  const directory = `private/invocations/${transport.jobId}`;
  const bytes = readFileSync(safePath(collector.root, `${directory}/response.txt`));
  const receipt = JSON.parse(readFileSync(safePath(collector.root, `${directory}/receipt.json`), 'utf8'));
  const evidence = inspectHostInvocation(transport, receipt, collector.root);
  assert.equal(evidence.available, true, evidence.reason);
  const admission = verifyHostReceipt(transport, receipt, evidence.events, evidence.baseContext);
  assert.equal(admission.admitted, true, admission.errors.join('; ')); verifyResponseBytes(receipt, bytes);
  assert.ok(inventory.approvedDigests.includes(evidence.baseContext.digest), 'Prior reviewer context is not approved for continuation');
  const state = collector.state();
  const episodeId = job.stage === 'decision' ? getBlob(collector.root, job.commitRef).episodeId : job.episodeId;
  for (const commit of state.commits.filter(c => c.episodeId === episodeId)) {
    const saved = getBlob(collector.root, commit.savedRef), player = getBlob(collector.root, saved.receiptRef);
    assert.notEqual(receipt.hostAgentId, player.hostAgentId, 'Player context cannot review its own decision');
    if (saved.job.parentThreadId) assert.notEqual(receipt.hostAgentId, saved.job.parentThreadId, 'Coordinator cannot review its own decision');
  }
}

export function verifyPriorPlayer(collector, claim, inventory) {
  const rows = collector.state().rows;
  const prepared = rows.filter(r => r.kind === 'job-prepared' && r.data.jobId === claim.data.jobId);
  assert.equal(prepared.length, 1, 'Missing or ambiguous original player job');
  const job = { ...prepared[0].data, ...claim.data };
  assert.ok(stopped(collector, job), 'Prior player host is not stopped');
  const outputs = rows.filter(r => r.kind === 'attempt-output' && r.data.jobId === job.jobId);
  assert.equal(outputs.length, 1, 'Player output requires trusted reconciliation');
  const receipt = getBlob(collector.root, outputs[0].data.receiptRef), bytes = getBlob(collector.root, outputs[0].data.rawRef, false);
  assert.equal(typeof collector.inspector, 'function', 'Original host inspector required');
  const evidence = collector.inspector(job, receipt, collector.root);
  assert.equal(evidence.available, true, evidence.reason);
  const admission = verifyHostReceipt(job, receipt, evidence.events, evidence.baseContext);
  assert.equal(admission.admitted, true, admission.errors.join('; ')); verifyResponseBytes(receipt, bytes);
  assert.ok(inventory.approvedDigests.includes(evidence.baseContext.digest), 'Prior player context is not approved for continuation');
}

// Explicit owner continuation is separate from the original-deadline repair.
// Incomplete/unknown dispatches require a separate trusted reconciliation;
// stopped.json alone never authorizes a new segment or a replacement call.
function newSegmentFacade(collector, processingAudit, inventory, api) {
  return withRunLock(collector.root, () => {
    const state = collector.state(), rows = state.rows;
    assert.equal(collector.manifest.mode, 'live');
    assert.ok(!state.episode && !state.claimed && !state.intent && !state.pending, 'Finish or reconcile all player work before a new review segment');
    assert.ok(!rows.some(r => r.kind === 'attempt-settled' && r.data.fatal), 'Fatal player stop requires trusted reconciliation');
    assert.ok(state.paused || !state.segmentStartedAt || Date.now() >= Date.parse(state.segmentStartedAt) + collector.manifest.plan.workCaps.maxActiveSegmentWallMs, 'Pause the current segment before explicit continuation');
    for (const key of ['originalSourceDigest', 'reviewSourceDigest', 'nativeBinaryDigest']) assert.match(processingAudit?.[key] ?? '', /^[a-f0-9]{64}$/);
    assert.equal(processingAudit.originalSourceDigest, collector.manifest.build.sourceDigest, 'Original source provenance mismatch');
    assert.equal(processingAudit.nativeBinaryDigest, collector.manifest.build.binaryDigest, 'Original native binary provenance mismatch');
    for (const claim of rows.filter(r => r.kind === 'dispatch-claimed')) {
      const settlements = rows.filter(r => r.sequence > claim.sequence && ['move-committed', 'attempt-settled'].includes(r.kind) && r.data.jobId === claim.data.jobId);
      assert.equal(settlements.length, 1, 'Unsettled or ambiguous player claim');
      (api.verifyPriorPlayer ?? verifyPriorPlayer)(collector, claim, inventory);
    }
    for (const claim of rows.filter(r => r.kind === 'review-dispatch-claimed')) {
      const settlements = rows.filter(r => r.kind === 'review-attempt-settled' && r.data.jobId === claim.data.job.jobId);
      assert.equal(settlements.length, 1, 'Unsettled review claim requires trusted reconciliation');
      assert.ok(settlements[0].sequence > claim.sequence && ['accepted', 'rejected'].includes(settlements[0].data.status), 'Invalid review settlement');
      assert.ok(stopped(collector, claim.data.job), 'Prior reviewer host is not stopped');
      (api.verifyPriorHost ?? verifyPriorHost)(collector, claim, inventory);
    }
    const previousBoundary = rows.at(-1);
    if (!state.paused) appendEvent(collector.root, 'pause', { reason: 'explicit-owner-reviews-only' });
    appendEvent(collector.root, 'completed-reviews-new-segment-authorized', { previousBoundaryHash: previousBoundary.hash, previousBoundarySequence: previousBoundary.sequence, previousSegmentStartedAt: state.segmentStartedAt, processingAudit, explicitOwnerNewSegment: true });
    // Keep the archived collector durably paused even if this worker crashes.
    // Only this authorized facade may disregard the exact preceding pauses.
    const segment = appendEvent(collector.root, 'segment-started', { scope: 'reviews-only', processingAudit });
    const segmentStartedAt = segment.at, deadline = Date.parse(segmentStartedAt) + collector.manifest.plan.workCaps.maxActiveSegmentWallMs;
    const facade = Object.create(collector), underlyingState = collector.state.bind(collector);
    for (const method of ['next', 'claim', 'accept', 'resume', 'abandon']) facade[method] = () => { throw Error('Reviews-only worker cannot start player work or reset budget'); };
    facade.state = () => {
      const current = underlyingState();
      assert.ok(current.rows.some(r => r.sequence === segment.sequence && r.hash === segment.hash), 'Authorized review segment changed');
      assert.ok(!current.rows.some(r => r.sequence > segment.sequence && ['resume', 'segment-started'].includes(r.kind)), 'Review segment reset without authorization');
      const paused = current.rows.some(r => r.sequence > segment.sequence && (r.kind === 'pause' || r.kind === 'attempt-settled' && r.data.fatal));
      return { ...current, paused, segmentStartedAt };
    };
    return { facade, deadline, segmentStartedAt };
  });
}

export function validateSavedContent(collector, job, transport, bytes, receipt, options, api) {
  // Read all trusted context before the model-content error boundary.
  let context;
  if (job.stage === 'decision') context = getBlob(collector.root, job.packetRef);
  else {
    const state = collector.state(), commits = state.commits.filter(c => c.episodeId === job.episodeId);
    const frozenRows = commits.map(c => state.reviews.find(r => r.stage === 'decision' && r.subjectId === c.decisionId));
    assert.ok(commits.length > 0 && frozenRows.every(Boolean), 'Missing frozen decision reviews');
    context = { commits, reviews: frozenRows.map(r => getBlob(collector.root, r.reviewRef)), native: getBlob(collector.root, job.outcomeRef), replay: collector.replay().find(r => r.episodeId === job.episodeId) };
    assert.equal(context.native.completedTricks, 13, 'Trusted native completed trick count changed');
    assert.equal(context.native.acceptedPlays, 52, 'Trusted native accepted play count changed');
    assert.equal(context.native.nativeTerminalPhase, 'round-complete', 'Trusted native terminal phase changed');
    assert.equal(context.replay?.status, 'passed', 'Trusted native replay failed');
    assert.equal(context.replay.completedTricks, 13, 'Trusted replay completed trick count changed');
    assert.equal(sha(jsonBytes(context.reviews)), job.frozenDecisionReviewDigest, 'Trusted frozen decision review digest changed');
  }
  let raw;
  try { raw = JSON.parse(Buffer.from(bytes).toString('utf8')); }
  catch (error) { if (error instanceof SyntaxError) error.code = 'TRIX_REVIEW_CONTENT_INVALID'; throw error; }
  if (job.stage === 'decision' && typeof raw?.packetHash === 'string' && raw.packetHash !== job.packetHash) {
    api.validateHostReviewEnvelope(collector, job, transport, bytes, receipt, options); return true;
  }
  try {
    if (job.stage === 'decision') api.validateDecisionProposal(raw, job, context, { verifyProof: () => ({ verified: false, reason: 'Read-only saved content preflight' }) });
    else api.validateGameProposal(raw, job, context);
  } catch (error) { if (error.code === 'ERR_ASSERTION') error.code = 'TRIX_REVIEW_CONTENT_INVALID'; throw error; }
  return false;
}

/**
 * Call with either originalDeadlineAt (strict original-budget repair) or
 * newSegment:true (an explicit owner-authorized later reviews-only segment).
 * A new segment requires every historical claim to be settled, stopped and
 * fully host-inspectable; incomplete/unknown requests require separate trusted
 * reconciliation and are never inferred safe from a stopped receipt alone.
 * Both modes preserve original frozen prompts/native APIs and cumulative
 * per-review attempts. The later mode keeps the collector durably paused,
 * records authorization plus a segment boundary, and grants only its facade
 * one original-plan wall cap. No global resume or player action is issued.
 * The caller must preserve/verify this processing graph before calling.
 * `apis` is fixture injection, not an operator evidence-admission option.
 */
export async function runReviewWorker(collector, { originalDeadlineAt, newSegment = false, contextAdmission, cwd = 'C:/Windows/Temp', executable, processingAudit, progress = () => {}, apis } = {}) {
  assert.equal(typeof newSegment, 'boolean', 'newSegment must be an explicit boolean');
  assert.ok(!(newSegment && originalDeadlineAt !== undefined), 'newSegment and originalDeadlineAt are mutually exclusive');
  assert.ok(newSegment || originalDeadlineAt !== undefined, 'Explicit originalDeadlineAt or newSegment:true required');
  const release = lockDriver(collector.root);
  let continuationStarted = false;
  try {
    const inventory = JSON.parse(readFileSync(contextAdmission, 'utf8'));
    assert.equal(inventory.schemaVersion, 'trix-host-base-context-admission-1.0.0'); assert.equal(inventory.approvedDigests?.length, 1); assert.match(inventory.approvedDigests[0], /^[a-f0-9]{64}$/);
    const api = apis ?? await originalApis(collector);
    for (const name of ['makeReviewPacket', 'claimReviewInvocation', 'dispatchHostJob', 'importHostReview', 'validateHostReviewEnvelope', 'importNormalizedHostReview', 'validateDecisionProposal']) assert.equal(typeof api[name], 'function', `Missing review API ${name}`);
    if (newSegment) assert.equal(typeof api.validateGameProposal, 'function', 'Missing review API validateGameProposal');
    const { facade, deadline, segmentStartedAt } = newSegment ? newSegmentFacade(collector, processingAudit, inventory, api) : reviewFacade(collector, originalDeadlineAt, processingAudit);
    continuationStarted = newSegment;
    record(collector, 'completed-reviews-worker-started', { originalDeadlineAt: new Date(deadline).toISOString(), originalSegmentStartedAt: segmentStartedAt, segmentMode: newSegment ? 'explicit-owner-new-segment' : 'original-deadline', processingAudit, load: 'sequential', pausedBaselineSequence: collector.state().rows.at(-1).sequence });
    let imported = 0, dispatched = 0;
    const stop = () => facade.state().paused ? 'paused' : Date.now() >= deadline ? 'original-deadline' : null;
    const envelopeOptions = { processingAudit, validateDecision: api.validateDecisionProposal };
    for (const stage of ['decision', 'game']) for (;;) {
      const halted = stop(); if (halted) return { stop: halted, imported, dispatched };
      const packet = api.makeReviewPacket(facade, stage); if (packet.stop) break;
      const job = packet.job; assert.equal(job.stage, stage, 'Wrong review stage');
      const attempts = attemptsFor(facade, job); assert.ok(attempts.length <= 2, 'Review attempt cap already exceeded');
      let recovered = false;
      // Chronological validation is fixed before inspecting rationale quality.
      for (const attempt of attempts) {
        const haltedBeforeRead = stop(); if (haltedBeforeRead) return { stop: haltedBeforeRead, imported, dispatched };
        const transport = attempt.data.job;
        const settled = facade.state().rows.find(r => r.kind === 'review-attempt-settled' && r.data.jobId === transport.jobId);
        if (!settled || !stopped(collector, transport)) return { stop: 'uncertain-review-dispatch', imported, dispatched };
        const directory = `private/invocations/${transport.jobId}`;
        let bytes, receipt, normalize = settled.data.status !== 'accepted';
        try {
          bytes = readFileSync(safePath(collector.root, `${directory}/response.txt`)); receipt = JSON.parse(readFileSync(safePath(collector.root, `${directory}/receipt.json`), 'utf8'));
          if (settled.data.status !== 'accepted') {
            if (newSegment) {
              (api.verifyPriorHost ?? verifyPriorHost)(collector, attempt, inventory);
              normalize = (api.validateSavedContent ?? validateSavedContent)(facade, job, transport, bytes, receipt, envelopeOptions, api);
            } else api.validateHostReviewEnvelope(facade, job, transport, bytes, receipt, envelopeOptions);
          }
        } catch (error) {
          // A verified model's content can be unusable; unavailable/corrupt
          // host evidence cannot authorize another attempt or another model.
          if (error.code !== 'TRIX_REVIEW_CONTENT_INVALID') throw error;
          record(collector, 'completed-review-prior-unusable', { reviewId: job.id, jobId: transport.jobId, reason: error.message });
          continue;
        }
        // Once the first preflight-valid envelope is selected, an import error
        // must stop this worker, never choose a later reviewer's rationale.
        if (!normalize) api.importHostReview(facade, job, transport, bytes, receipt);
        else api.importNormalizedHostReview(facade, job, transport, bytes, receipt, envelopeOptions);
        record(collector, 'completed-review-prior-admitted', { reviewId: job.id, jobId: transport.jobId, historicalStatus: settled.data.status, processingAudit });
        imported++; recovered = true; progress({ event: 'review-recovered', stage, subjectId: job.subjectId, jobId: transport.jobId }); break;
      }
      if (recovered) continue;
      if (attempts.length >= 2) return { stop: 'review-attempt-cap', imported, dispatched };
      const haltedBeforeClaim = stop(); if (haltedBeforeClaim) return { stop: haltedBeforeClaim, imported, dispatched };
      const claimed = api.claimReviewInvocation(facade, job); if (claimed.stop) return { stop: claimed.stop, imported, dispatched };
      const transport = claimed.job;
      assert.ok(Date.parse(transport.deadlineAt) <= deadline, 'Review claim extended original deadline');
      try {
        // Prompt already carries the frozen closed schema. No backend schema
        // substitution and no player request occurs in this worker.
        dispatched++;
        const result = await api.dispatchHostJob(facade, transport, { inventory, cwd, ...(executable ? { executable } : {}) });
        try { api.importHostReview(facade, job, transport, result.bytes, result.receipt); }
        catch { api.validateHostReviewEnvelope(facade, job, transport, result.bytes, result.receipt, envelopeOptions); api.importNormalizedHostReview(facade, job, transport, result.bytes, result.receipt, envelopeOptions); }
        record(collector, 'review-attempt-settled', { jobId: transport.jobId, status: 'accepted' });
        imported++; progress({ event: 'reviewed', stage, subjectId: job.subjectId });
      } catch (error) {
        if (stopped(collector, transport)) record(collector, 'review-attempt-settled', { jobId: transport.jobId, status: 'rejected', reason: error.message });
        record(collector, 'pause', { reason: 'completed-review-worker-failed' });
        throw error;
      }
    }
    record(collector, 'completed-reviews-worker-finished', { imported, dispatched, processingAudit });
    return { stop: 'completed-reviews-finished', imported, dispatched };
  } finally {
    try { if (continuationStarted && !collector.state().paused) record(collector, 'pause', { reason: 'reviews-only-segment-finished' }); }
    finally { release(); }
  }
}
