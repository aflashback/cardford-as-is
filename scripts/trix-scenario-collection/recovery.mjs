// Narrow host-verified review retry. Never reset the original segment budget.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { appendEvent, jsonBytes, readJournal, safePath, sha, withRunLock, writeImmutable } from './journal.mjs';

const metadataPath = 'private/recovery/original-budget.json';

export function assertNormalResumeAllowed(root, { newSegment = false } = {}) {
  assert.equal(typeof newSegment, 'boolean', 'New segment requires an explicit boolean');
  assert.ok(newSegment || !existsSync(safePath(root, metadataPath)), 'This run has an original-budget recovery; reset-style resume requires explicit newSegment');
}

function assertNoActiveDriver(root) {
  const path = safePath(root, 'private/driver.lock');
  if (!existsSync(path)) return;
  const owner = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(Number.isInteger(owner.pid) && owner.pid > 0, 'Invalid driver lock owner');
  let alive = true;
  try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
  assert.equal(alive, false, 'A live collection driver must stop before recovery preparation');
}

function eligibility(collector, originalDeadlineAt) {
  assert.equal(collector.manifest.mode, 'live', 'Review recovery requires the original live collector');
  const state = collector.state(), rows = state.rows;
  assert.ok(state.paused, 'Review recovery requires a paused run');
  assert.ok(!state.claimed && !state.intent, 'Unsettled player dispatch or commit');
  const pause = rows.at(-1);
  assert.equal(pause?.kind, 'pause', 'Review recovery requires the exact last pause');
  assert.equal(pause.data.reason, 'review-failed', 'Only a settled review-failed pause can be recovered');
  assert.equal(rows.filter(r => r.kind === 'pause').length, 1, 'Earlier operator or safety pause must remain effective');
  assert.ok(!rows.some(r => r.kind === 'attempt-settled' && r.data.fatal), 'Earlier fatal player stop must remain effective');
  const segments = rows.filter(r => r.kind === 'segment-started');
  assert.equal(segments.length, 1, 'Original segment start is missing or has been reset');
  assert.ok(!rows.some(r => r.kind === 'resume'), 'A reset-style resume changed the original budget');
  const originalSegmentStartedAt = segments[0].at;
  assert.equal(state.segmentStartedAt, originalSegmentStartedAt, 'Collector lost the original segment start');
  const originalEnd = Date.parse(originalSegmentStartedAt) + collector.manifest.plan.workCaps.maxActiveSegmentWallMs;
  assert.ok(Number.isFinite(originalEnd) && Date.parse(originalDeadlineAt) === originalEnd, 'Recovery may not extend or reset the original deadline');
  assert.ok(Date.now() < originalEnd, 'Original segment deadline expired');
  const reviewClaims = rows.filter(r => r.kind === 'review-dispatch-claimed');
  assert.ok(reviewClaims.length > 0, 'No failed review dispatch');
  for (const claim of rows.filter(r => r.kind === 'dispatch-claimed')) {
    assert.ok(rows.some(r => ['attempt-settled', 'move-committed'].includes(r.kind) && r.data.jobId === claim.data.jobId), 'Unsettled player dispatch in journal');
  }
  for (const claim of reviewClaims) {
    const settlements = rows.filter(r => r.kind === 'review-attempt-settled' && r.data.jobId === claim.data.job.jobId);
    assert.equal(settlements.length, 1, 'Unsettled or ambiguous review dispatch');
    assert.ok(['accepted', 'rejected'].includes(settlements[0].data.status), 'Unknown review settlement');
  }
  const failed = reviewClaims.at(-1), settled = rows.find(r => r.kind === 'review-attempt-settled' && r.data.jobId === failed.data.job.jobId);
  assert.equal(settled.data.status, 'rejected', 'Last review was not rejected');
  assert.equal(settled.data.reason, `${failed.data.stage}-review schema: data/packetHash must match pattern "^[a-f0-9]{64}$"`, 'Recovery is limited to the sole malformed packetHash rejection');
  assert.equal(reviewClaims.filter(r => r.data.reviewId === failed.data.reviewId).length, 1, 'Review retry attempt cap reached');
  const stoppedPath = safePath(collector.root, `private/invocations/${failed.data.job.jobId}/private/app-server/stopped.json`);
  const stoppedBytes = readFileSync(stoppedPath), stopped = JSON.parse(stoppedBytes);
  assert.equal(stopped.stoppedVerified, true, 'Failed review host is not verified stopped');
  assert.equal(stopped.error, null, 'Failed review host had a transport failure');
  return { pause, failed, originalSegmentStartedAt, originalDeadlineAt: new Date(originalEnd).toISOString(), stoppedEvidenceHash: sha(stoppedBytes) };
}

export function prepareReviewRetry(collector, { originalDeadlineAt }) {
  const admission = withRunLock(collector.root, () => {
    assertNoActiveDriver(collector.root);
    const eligible = eligibility(collector, originalDeadlineAt);
    assert.ok(!existsSync(safePath(collector.root, metadataPath)), 'Review recovery already prepared; do not authorize another retry');
    const source = readFileSync(new URL('./recovery.mjs', import.meta.url)), sourceHash = sha(source);
    const journal = readFileSync(new URL('./journal.mjs', import.meta.url)), journalHash = sha(journal);
    const recoverySourcePath = `private/recovery/${sourceHash}/recovery.mjs`, journalSourcePath = `private/recovery/${sourceHash}/journal.mjs`;
    const metadata = { schemaVersion: 'trix-review-recovery-1.0.0', runId: collector.manifest.runId, originalSegmentStartedAt: eligible.originalSegmentStartedAt, originalDeadlineAt: eligible.originalDeadlineAt, pauseSequence: eligible.pause.sequence, pauseHash: eligible.pause.hash, reviewId: eligible.failed.data.reviewId, rejectedJobId: eligible.failed.data.job.jobId, stoppedEvidenceHash: eligible.stoppedEvidenceHash, recoverySourceHash: sourceHash, recoverySourcePath, journalSourceHash: journalHash, journalSourcePath, frozenSourceDigest: collector.manifest.build?.sourceDigest ?? null, frozenSourceRoot: collector.sourceRoot ?? null };
    writeImmutable(safePath(collector.root, recoverySourcePath), source);
    writeImmutable(safePath(collector.root, journalSourcePath), journal);
    writeImmutable(safePath(collector.root, metadataPath), jsonBytes(metadata));
    appendEvent(collector.root, 'review-recovery-authorized', { metadataHash: sha(jsonBytes(metadata)), reviewId: metadata.reviewId, rejectedJobId: metadata.rejectedJobId, originalSegmentStartedAt: metadata.originalSegmentStartedAt, originalDeadlineAt: metadata.originalDeadlineAt, pauseHash: metadata.pauseHash, recoverySourceHash: sourceHash, journalSourceHash: journalHash });
    return metadata;
  });
  const facade = Object.create(collector), originalState = collector.state.bind(collector);
  facade.resume = () => { throw Error('Recovery cannot reset or extend the original segment'); };
  facade.state = () => {
    const state = originalState(), rows = state.rows;
    const trigger = rows.find(r => r.sequence === admission.pauseSequence);
    assert.equal(trigger?.hash, admission.pauseHash, 'Original recovery pause changed');
    const later = rows.filter(r => r.sequence > admission.pauseSequence);
    assert.ok(!later.some(r => ['resume', 'segment-started'].includes(r.kind)), 'Recovery budget was reset');
    const newPause = later.some(r => r.kind === 'pause' || r.kind === 'attempt-settled' && r.data.fatal);
    return { ...state, paused: newPause ? state.paused : false, segmentStartedAt: admission.originalSegmentStartedAt };
  };
  return { collector: facade, metadata: admission };
}

export function recoveryMetadata(root) {
  return JSON.parse(readFileSync(safePath(root, metadataPath), 'utf8'));
}
