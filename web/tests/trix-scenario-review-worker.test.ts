import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runReviewWorker } from '../../scripts/trix-scenario-collection/review-worker.mjs';
import { appendEvent, jsonBytes, putBlob, readJournal, sha } from '../../scripts/trix-scenario-collection/journal.mjs';

function fixture(t, { validHistorical = ['raw:first'], earlierOperatorPause = false, cap = 60000, newPause = false, failImport = false, trustFailure = false, rejectionReason = 'decision-review schema: data/packetHash must match pattern "^[a-f0-9]{64}$"' } = {}) {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'review-worker-test-')); mkdirSync(join(root, 'private'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  appendEvent(root, 'initialized', {}); const segment = appendEvent(root, 'segment-started', {});
  const jobs = [{ id: 'decision-one', stage: 'decision', subjectId: 'one' }, { id: 'decision-two', stage: 'decision', subjectId: 'two' }, { id: 'game-one', stage: 'game', subjectId: 'episode' }];
  const stopped = jobId => {
    const directory = join(root, 'private/invocations', jobId, 'private/app-server'); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'stopped.json'), JSON.stringify({ stoppedVerified: true, error: null }));
  };
  for (const [i, raw] of ['raw:first', 'raw:second'].entries()) {
    const jobId = `prior-${i}`;
    appendEvent(root, 'review-dispatch-claimed', { reviewId: 'decision-one', stage: 'decision', job: { jobId } });
    appendEvent(root, 'review-attempt-settled', { jobId, status: 'rejected', reason: rejectionReason });
    stopped(jobId); const directory = join(root, 'private/invocations', jobId);
    writeFileSync(join(directory, 'response.txt'), raw); writeFileSync(join(directory, 'receipt.json'), JSON.stringify({ jobId }));
    appendEvent(root, 'pause', { reason: 'review-failed' });
  }
  if (earlierOperatorPause) appendEvent(root, 'pause', { reason: 'operator-request' });
  mkdirSync(join(root, 'private/recovery')); writeFileSync(join(root, 'private/recovery/original-budget.json'), 'preserved old recovery metadata');
  const originalDeadlineAt = new Date(Date.parse(segment.at) + cap).toISOString();
  const contextAdmission = join(root, 'approved-context.json'); writeFileSync(contextAdmission, JSON.stringify({ schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: ['a'.repeat(64)] }));
  const processingAudit = { originalSourceDigest: 'b'.repeat(64), reviewSourceDigest: 'c'.repeat(64), nativeBinaryDigest: 'd'.repeat(64) };
  let dispatches = 0, playerCalls = 0; const importedFrom = [], stages = [], preflights = [], hostChecks = [];
  const collector = {
    root, manifest: { mode: 'live', runId: 'reviews-only-fixture', build: { sourceDigest: processingAudit.originalSourceDigest, binaryDigest: processingAudit.nativeBinaryDigest }, plan: { workCaps: { maxActiveSegmentWallMs: cap } } },
    state() {
      const rows = readJournal(root); let paused = false, segmentStartedAt = null;
      for (const row of rows) { if (row.kind === 'pause') paused = true; if (row.kind === 'resume') { paused = false; segmentStartedAt = null; } if (row.kind === 'segment-started') segmentStartedAt = row.at; }
      return { rows, paused, segmentStartedAt, episode: null, claimed: null, intent: null, reviews: rows.filter(r => r.kind === 'review-imported').map(r => r.data) };
    },
    next() { playerCalls++; throw Error('Player work prohibited'); },
  };
  const insertReview = (facade, job, transport, bytes) => { importedFrom.push({ jobId: transport.jobId, raw: bytes.toString() }); appendEvent(root, 'review-imported', { stage: job.stage, subjectId: job.subjectId }); };
  const api = {
    makeReviewPacket(facade, stage) {
      stages.push(stage); if (stage === 'game') assert.equal(facade.state().reviews.filter(r => r.stage === 'decision').length, 2);
      const job = jobs.find(j => j.stage === stage && !facade.state().reviews.some(r => r.stage === stage && r.subjectId === j.subjectId)); return job ? { job } : { stop: 'none' };
    },
    claimReviewInvocation(facade, job) {
      assert.equal(facade.state().paused, false);
      const transport = { jobId: `fresh-${dispatches}`, deadlineAt: new Date(Date.parse(facade.state().segmentStartedAt) + cap).toISOString() };
      appendEvent(root, 'review-dispatch-claimed', { reviewId: job.id, stage: job.stage, job: transport }); return { job: transport };
    },
    async dispatchHostJob(facade, transport, options) {
      assert.equal(options.outputSchema, undefined); assert.equal(options.cwd, 'C:/Windows/Temp');
      assert.throws(() => facade.next(), /Reviews-only worker/); dispatches++; stopped(transport.jobId);
      if (newPause) appendEvent(root, 'pause', { reason: 'operator-request' });
      return { bytes: Buffer.from('valid:fresh'), receipt: { jobId: transport.jobId } };
    },
    importHostReview(facade, job, transport, bytes) { assert.equal(bytes.toString(), 'valid:fresh'); insertReview(facade, job, transport, bytes); },
    validateHostReviewEnvelope(_facade, _job, transport, bytes, receipt, options) {
      preflights.push(transport.jobId);
      assert.equal(receipt.jobId, transport.jobId); assert.deepEqual(options.processingAudit, processingAudit);
      if (trustFailure) throw Error('Host wire unavailable or corrupted');
      if (!validHistorical.includes(bytes.toString())) { const error = Error('Only metadata repair preflight failed'); error.code = 'TRIX_REVIEW_CONTENT_INVALID'; throw error; }
      return {};
    },
    importNormalizedHostReview(facade, job, transport, bytes) { if (failImport) throw Error('First preflight-valid import failed'); insertReview(facade, job, transport, bytes); },
    validateDecisionProposal() {},
    validateGameProposal() {},
    verifyPriorHost(_collector, claim) {
      hostChecks.push(claim.data.job.jobId);
      const directory = join(root, 'private/invocations', claim.data.job.jobId);
      readFileSync(join(directory, 'response.txt')); JSON.parse(readFileSync(join(directory, 'receipt.json'), 'utf8'));
      if (trustFailure) throw Error('Host wire unavailable or corrupted');
    },
    validateSavedContent(facade, job, transport, bytes, receipt, options) { api.validateHostReviewEnvelope(facade, job, transport, bytes, receipt, options); return true; },
  };
  return { root, collector, api, originalDeadlineAt, contextAdmission, processingAudit, importedFrom, stages, preflights, hostChecks, counts: () => ({ dispatches, playerCalls }), options: { originalDeadlineAt, contextAdmission, processingAudit, apis: api } };
}

test('reviews-only worker admits earliest saved normalized attempt without a third call then freezes decisions before game', async t => {
  const f = fixture(t), original = readJournal(f.root), metadata = readFileSync(join(f.root, 'private/recovery/original-budget.json'));
  const result = await runReviewWorker(f.collector, f.options);
  assert.deepEqual(result, { stop: 'completed-reviews-finished', imported: 3, dispatched: 2 });
  assert.deepEqual(f.importedFrom[0], { jobId: 'prior-0', raw: 'raw:first' }); assert.equal(f.counts().playerCalls, 0);
  assert.deepEqual(readJournal(f.root).slice(0, original.length), original); assert.equal(f.collector.state().paused, true);
  assert.ok(readFileSync(join(f.root, 'private/recovery/original-budget.json')).equals(metadata));
  assert.equal(existsSync(join(f.root, 'private/driver.lock')), false);
  assert.deepEqual(readJournal(f.root).filter(r => r.kind === 'review-attempt-settled').map(r => r.data.status), ['rejected', 'rejected', 'accepted', 'accepted']);
});

test('if first envelope is invalid the next chronological preflight-valid raw attempt is used', async t => {
  const f = fixture(t, { validHistorical: ['raw:second'] });
  await runReviewWorker(f.collector, f.options); assert.equal(f.importedFrom[0].jobId, 'prior-1');
  assert.equal(readJournal(f.root).filter(r => r.kind === 'completed-review-prior-unusable').length, 1);
});

test('two invalid historical attempts stop without requesting a third review', async t => {
  const f = fixture(t, { validHistorical: [] }), result = await runReviewWorker(f.collector, f.options);
  assert.deepEqual(result, { stop: 'review-attempt-cap', imported: 0, dispatched: 0 }); assert.equal(f.counts().dispatches, 0);
});

test('first preflight-valid import error cannot select a later rationale', async t => {
  const f = fixture(t, { validHistorical: ['raw:first', 'raw:second'], failImport: true });
  await assert.rejects(runReviewWorker(f.collector, f.options), /First preflight-valid import failed/);
  assert.deepEqual(f.importedFrom, []); assert.equal(f.counts().dispatches, 0);
  assert.equal(readJournal(f.root).filter(r => r.kind === 'completed-review-prior-unusable').length, 0);
});

test('prior host trust failure stops before another preflight or model request', async t => {
  const f = fixture(t, { trustFailure: true });
  await assert.rejects(runReviewWorker(f.collector, f.options), /Host wire unavailable or corrupted/);
  assert.deepEqual(f.preflights, ['prior-0']); assert.equal(f.counts().dispatches, 0);
  assert.equal(readJournal(f.root).filter(r => r.kind === 'completed-review-prior-unusable').length, 0);
});

test('operator pause during completed review stops before another model request', async t => {
  const f = fixture(t, { newPause: true }), result = await runReviewWorker(f.collector, f.options);
  assert.equal(result.stop, 'paused'); assert.equal(f.counts().dispatches, 1); assert.equal(f.collector.state().paused, true);
});

test('prior operator pause cannot be suppressed by the repair facade', async t => {
  const f = fixture(t, { earlierOperatorPause: true });
  await assert.rejects(runReviewWorker(f.collector, f.options), /Operator or safety pause/); assert.equal(f.counts().dispatches, 0);
});

test('expired or extended original deadline prevents all review processing', async t => {
  const expired = fixture(t, { cap: 1 }); await assert.rejects(runReviewWorker(expired.collector, expired.options), /deadline expired/);
  const extended = fixture(t); await assert.rejects(runReviewWorker(extended.collector, { ...extended.options, originalDeadlineAt: new Date(Date.parse(extended.originalDeadlineAt) + 1).toISOString() }), /cannot extend/);
  assert.equal(expired.counts().dispatches + extended.counts().dispatches, 0);
});

test('uncertain prior review and active driver are rejected before processing', async t => {
  const uncertain = fixture(t); appendEvent(uncertain.root, 'review-dispatch-claimed', { reviewId: 'unsettled', stage: 'decision', job: { jobId: 'uncertain' } });
  await assert.rejects(runReviewWorker(uncertain.collector, uncertain.options), /Unsettled review claim/);
  const active = fixture(t); writeFileSync(join(active.root, 'private/driver.lock'), JSON.stringify({ pid: process.pid }));
  await assert.rejects(runReviewWorker(active.collector, active.options), /driver is already active/);
  assert.equal(active.counts().dispatches + uncertain.counts().dispatches, 0);
});

const continuation = f => ({ ...f.options, originalDeadlineAt: undefined, newSegment: true });

test('explicit later segment resumes partial reviewed work after the old budget and preserves old attempts', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const f = fixture(t, { earlierOperatorPause: true });
  appendEvent(f.root, 'review-imported', { stage: 'decision', subjectId: 'one' });
  const original = readJournal(f.root); t.mock.timers.tick(60001);
  const result = await runReviewWorker(f.collector, continuation(f));
  assert.deepEqual(result, { stop: 'completed-reviews-finished', imported: 2, dispatched: 2 });
  const rows = readJournal(f.root); assert.deepEqual(rows.slice(0, original.length), original);
  assert.equal(rows.filter(r => r.kind === 'resume').length, 0); assert.equal(rows.filter(r => r.kind === 'segment-started').length, 2);
  assert.equal(rows.filter(r => r.kind === 'completed-reviews-new-segment-authorized').length, 1);
  assert.equal(rows.filter(r => r.kind === 'review-dispatch-claimed' && r.data.reviewId === 'decision-one').length, 2);
  const segment = rows.filter(r => r.kind === 'segment-started').at(-1);
  for (const row of rows.filter(r => r.kind === 'review-dispatch-claimed' && r.sequence > segment.sequence)) assert.equal(Date.parse(row.data.job.deadlineAt), Date.parse(segment.at) + 60000);
  assert.deepEqual(f.hostChecks, ['prior-0', 'prior-1']); assert.equal(f.counts().playerCalls, 0); assert.equal(f.collector.state().paused, true);
});

test('continuation requires explicit true and cannot also supply the original deadline', async t => {
  const f = fixture(t), before = readJournal(f.root);
  await assert.rejects(runReviewWorker(f.collector, { ...continuation(f), newSegment: false }), /Explicit originalDeadlineAt/);
  await assert.rejects(runReviewWorker(f.collector, { ...continuation(f), newSegment: 'true' }), /explicit boolean/);
  await assert.rejects(runReviewWorker(f.collector, { ...f.options, newSegment: true }), /mutually exclusive/);
  assert.deepEqual(readJournal(f.root), before); assert.equal(f.counts().dispatches, 0);
});

test('explicit new segment cannot reset a two-attempt review cap', async t => {
  const f = fixture(t, { validHistorical: [] }), before = readJournal(f.root);
  const result = await runReviewWorker(f.collector, continuation(f));
  assert.equal(result.stop, 'review-attempt-cap'); assert.equal(f.counts().dispatches, 0);
  assert.deepEqual(readJournal(f.root).slice(0, before.length), before);
  assert.equal(readJournal(f.root).filter(r => r.kind === 'review-dispatch-claimed').length, 2);
  assert.equal(f.collector.state().paused, true);
});

test('missing historical response or host trust failure blocks before any resume event', async t => {
  const missing = fixture(t); rmSync(join(missing.root, 'private/invocations/prior-0/response.txt'));
  const untrusted = fixture(t, { trustFailure: true });
  for (const f of [missing, untrusted]) {
    const before = readJournal(f.root);
    await assert.rejects(runReviewWorker(f.collector, continuation(f)));
    assert.deepEqual(readJournal(f.root), before); assert.equal(f.counts().dispatches, 0);
    assert.equal(existsSync(join(f.root, 'private/driver.lock')), false);
  }
});

test('explicit new segment rejects unsettled review or live owner before writing resume', async t => {
  const unsettled = fixture(t); appendEvent(unsettled.root, 'review-dispatch-claimed', { reviewId: 'unsettled', stage: 'decision', job: { jobId: 'unknown' } });
  const active = fixture(t); writeFileSync(join(active.root, 'private/driver.lock'), JSON.stringify({ pid: process.pid }));
  for (const f of [unsettled, active]) {
    const before = readJournal(f.root); await assert.rejects(runReviewWorker(f.collector, continuation(f)), /Unsettled review claim|driver is already active/);
    assert.deepEqual(readJournal(f.root), before); assert.equal(f.counts().dispatches, 0);
  }
});

test('operator pause during explicit continuation is respected and a new segment cannot be started automatically', async t => {
  const f = fixture(t, { newPause: true });
  const result = await runReviewWorker(f.collector, continuation(f)); assert.equal(result.stop, 'paused'); assert.equal(f.counts().dispatches, 1);
  const before = readJournal(f.root); await assert.rejects(runReviewWorker(f.collector, f.options), /Operator or safety pause|Original segment changed/);
  assert.deepEqual(readJournal(f.root), before); assert.equal(f.collector.state().paused, true);
});

test('fully settled player claims still require host inspection and stopping before owner continuation', async t => {
  const f = fixture(t);
  appendEvent(f.root, 'dispatch-claimed', { jobId: 'original-player' });
  appendEvent(f.root, 'move-committed', { jobId: 'original-player' });
  let checked = 0;
  f.api.verifyPriorPlayer = () => { checked++; throw Error('Prior player host is uninspectable'); };
  const before = readJournal(f.root);
  await assert.rejects(runReviewWorker(f.collector, continuation(f)), /Prior player host is uninspectable/);
  assert.equal(checked, 1); assert.deepEqual(readJournal(f.root), before); assert.equal(f.counts().dispatches, 0);
});

test('failed trusted retrospective replay or frozen digest stops before any replacement review call', async t => {
  for (const corruption of ['replay', 'digest']) {
    const f = fixture(t);
    const reviews = [{ decisionId: 'one', rationaleStatus: 'forced' }], reviewRef = putBlob(f.root, reviews[0]);
    const outcomeRef = putBlob(f.root, { completedTricks: 13, acceptedPlays: 52, nativeTerminalPhase: 'round-complete' });
    const job = { id: 'game-past', stage: 'game', subjectId: 'episode', episodeId: 'episode', outcomeRef, frozenDecisionReviewDigest: corruption === 'digest' ? 'e'.repeat(64) : sha(jsonBytes(reviews)) };
    const state = f.collector.state.bind(f.collector);
    f.collector.state = () => ({ ...state(), commits: [{ decisionId: 'one', episodeId: 'episode' }], reviews: [{ stage: 'decision', subjectId: 'one', reviewRef }] });
    f.collector.replay = () => [{ episodeId: 'episode', status: corruption === 'replay' ? 'failed' : 'passed', completedTricks: 13 }];
    f.api.makeReviewPacket = (_facade, stage) => stage === 'game' ? { job } : { stop: 'none' };
    delete f.api.validateSavedContent;
    appendEvent(f.root, 'review-dispatch-claimed', { reviewId: job.id, stage: 'game', job: { jobId: 'game-prior' } });
    appendEvent(f.root, 'review-attempt-settled', { jobId: 'game-prior', status: 'rejected', reason: 'Model content invalid' });
    const directory = join(f.root, 'private/invocations/game-prior'); mkdirSync(join(directory, 'private/app-server'), { recursive: true });
    writeFileSync(join(directory, 'private/app-server/stopped.json'), JSON.stringify({ stoppedVerified: true }));
    writeFileSync(join(directory, 'response.txt'), '{}'); writeFileSync(join(directory, 'receipt.json'), '{}');
    f.api.verifyPriorHost = () => {};
    let dispatches = 0; f.api.dispatchHostJob = async () => { dispatches++; throw Error('Replacement call prohibited'); };
    await assert.rejects(runReviewWorker(f.collector, continuation(f)), /Trusted native replay failed|Trusted frozen decision review digest changed/);
    assert.equal(dispatches, 0); assert.equal(readJournal(f.root).filter(r => r.kind === 'completed-review-prior-unusable').length, 0);
  }
});

test('explicit owner continuation may skip verified invalid content then use the first valid ordinary saved response', async t => {
  const f = fixture(t, { rejectionReason: 'Decision review rationale was invalid' });
  f.api.validateSavedContent = (_facade, _job, transport) => {
    if (transport.jobId === 'prior-0') { const error = Error('Verified model content invalid'); error.code = 'TRIX_REVIEW_CONTENT_INVALID'; throw error; }
    return false;
  };
  const ordinary = f.api.importHostReview;
  f.api.importHostReview = (facade, job, transport, bytes, receipt) => {
    if (transport.jobId !== 'prior-1') return ordinary(facade, job, transport, bytes, receipt);
    assert.equal(bytes.toString(), 'raw:second');
    f.importedFrom.push({ jobId: transport.jobId, raw: bytes.toString() });
    appendEvent(f.root, 'review-imported', { stage: job.stage, subjectId: job.subjectId });
  };
  const result = await runReviewWorker(f.collector, continuation(f));
  assert.equal(result.stop, 'completed-reviews-finished'); assert.equal(f.importedFrom[0].jobId, 'prior-1');
  assert.equal(f.counts().dispatches, 2); assert.equal(readJournal(f.root).filter(r => r.kind === 'review-dispatch-claimed' && r.data.reviewId === 'decision-one').length, 2);
});
