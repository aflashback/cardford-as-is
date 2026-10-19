import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runSequential, dispatchHostJob, receiptFromEvidence, claimReviewInvocation } from '../../scripts/trix-scenario-collection/live-driver.mjs';
import { putBlob, sha, readJournal } from '../../scripts/trix-scenario-collection/journal.mjs';

function fixture(t, state = { paused: true, claimed: null, outcomes: [] }, mode = 'live') {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'driver-test-')); mkdirSync(join(root, 'private'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  const contextAdmission = join(root, 'approved-context.json');
  writeFileSync(contextAdmission, JSON.stringify({ schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: ['a'.repeat(64)] }));
  let nextCalls = 0, claimCalls = 0;
  const collector = {
    root, manifest: { mode, plan: { workCaps: { batchRequests: 4, maxActiveSegmentWallMs: 60000, maxInvocationWallMs: 10000 } } },
    state: () => state, status: () => ({ paused: state.paused, claimed: Boolean(state.claimed) }),
    next: () => { nextCalls++; throw Error('Unexpected job allocation'); },
    claim: () => { claimCalls++; throw Error('Unexpected model dispatch claim'); },
  };
  return { root, collector, contextAdmission, calls: () => ({ nextCalls, claimCalls }) };
}

test('live driver refuses a fixture manifest before reading admission or allocating a job', async t => {
  const f = fixture(t, undefined, 'fixture');
  await assert.rejects(runSequential(f.collector, { contextAdmission: 'missing-admission-file' }), /cannot run fixture/);
  assert.deepEqual(f.calls(), { nextCalls: 0, claimCalls: 0 });
  assert.equal(existsSync(join(f.root, 'private/driver.lock')), false);
  assert.equal(existsSync(join(f.root, 'host-base-context-admission.json')), false);
});

test('one active live driver lock blocks another and preserves the existing owner', async t => {
  const f = fixture(t), lock = join(f.root, 'private/driver.lock');
  const owner = JSON.stringify({ pid: process.pid, startedAt: '2026-10-11T17:00:00Z' }); writeFileSync(lock, owner);
  await assert.rejects(runSequential(f.collector, { contextAdmission: f.contextAdmission }), /driver is already active/);
  assert.equal(readFileSync(lock, 'utf8'), owner); assert.deepEqual(f.calls(), { nextCalls: 0, claimCalls: 0 });
});

test('paused collection returns without allocating or claiming another player job', async t => {
  const f = fixture(t);
  const result = await runSequential(f.collector, { contextAdmission: f.contextAdmission });
  assert.equal(result.stop, 'paused'); assert.deepEqual(f.calls(), { nextCalls: 0, claimCalls: 0 });
  assert.equal(existsSync(join(f.root, 'private/driver.lock')), false);
});

test('an uncertain prior player dispatch blocks review and all new jobs', async t => {
  const f = fixture(t, { paused: false, claimed: { jobId: 'unresolved' }, outcomes: [] });
  const result = await runSequential(f.collector, { contextAdmission: f.contextAdmission });
  assert.equal(result.stop, 'uncertain-player-dispatch'); assert.deepEqual(f.calls(), { nextCalls: 0, claimCalls: 0 });
});

test('an existing invocation cannot be redispatched or overwrite its recorded wire', async t => {
  const f = fixture(t), jobId = 'existing-job';
  const directory = join(f.root, 'private/invocations', jobId, 'private/app-server'); mkdirSync(directory, { recursive: true });
  const wire = join(directory, 'wire.jsonl'); writeFileSync(wire, 'preserved host evidence\n');
  await assert.rejects(dispatchHostJob(f.collector, { jobId }, { inventory: {} }), /Invocation already exists/);
  assert.equal(readFileSync(wire, 'utf8'), 'preserved host evidence\n');
});

test('expired absolute deadline blocks process startup after freezing the dispatch token', async t => {
  const f = fixture(t), bytes = Buffer.from('No-model fixture prompt');
  const job = { jobId: 'expired-job', dispatchToken: 'frozen-token', promptHash: sha(bytes), promptRef: putBlob(f.root, bytes), claimedAt: '2026-01-01T00:00:00Z', deadlineAt: '2026-01-01T00:00:01Z' };
  await assert.rejects(dispatchHostJob(f.collector, job, { inventory: { approvedDigests: ['a'.repeat(64)] } }), /deadline expired/);
  const invocation = join(f.root, 'private/invocations', job.jobId);
  assert.deepEqual(JSON.parse(readFileSync(join(invocation, 'job.json'), 'utf8')), job);
  assert.equal(existsSync(join(invocation, 'private/app-server/wire.jsonl')), false);
  assert.equal(existsSync(join(invocation, 'private/app-server/process.json')), false);
});

const job = { jobId: 'receipt-job', dispatchToken: 'collector-token', promptHash: 'a'.repeat(64), claimedAt: '2026-10-11T17:00:00Z', deadlineAt: '2026-10-11T17:01:00Z' };
const evidence = () => ({ available: true, baseContext: { inspected: true, episodeSpecificFacts: false, otherSeatEvidence: false, hiddenFixtureMemory: false, digest: 'c'.repeat(64) }, events: { verifiedByAdapter: true, agentId: '01a12c12-7db2-74c1-aa50-5530bc143ed6', jobId: job.jobId, promptHash: job.promptHash, responseHash: 'b'.repeat(64), model: 'gpt-6-luna', effort: 'max', forkTurns: 'none', activityComplete: true, toolCallCount: 0, inheritedConversation: false, reportedModelId: 'gpt-6-luna', startedAt: '2026-10-11T17:00:01Z', finishedAt: '2026-10-11T17:00:04Z' } });

test('host receipt derives the dispatch token and exact verified transport timestamps', () => {
  const source = evidence(), receipt = receiptFromEvidence(job, source);
  assert.equal(receipt.dispatchToken, job.dispatchToken); assert.equal(receipt.hostAgentId, source.events.agentId);
  assert.equal(receipt.startedAt, source.events.startedAt); assert.equal(receipt.finishedAt, source.events.finishedAt);
  assert.equal(receipt.responseHash, source.events.responseHash); assert.equal(receipt.dispatchStatus, 'completed');
});

test('host receipt refuses unavailable evidence', () => {
  assert.throws(() => receiptFromEvidence(job, { available: false, reason: 'host journal absent' }), /host journal absent/);
});

for (const [label, key, value] of [
  ['missing start timestamp', 'startedAt', undefined],
  ['invalid finish timestamp', 'finishedAt', 'not-time'],
  ['finish beyond deadline', 'finishedAt', '2026-10-11T17:01:01Z'],
  ['start before claim', 'startedAt', '2026-10-11T16:59:59Z'],
  ['wrong prompt hash', 'promptHash', 'c'.repeat(64)],
  ['wrong job identity', 'jobId', 'another-job'],
  ['lower effort', 'effort', 'high'],
  ['different model', 'model', 'gpt-6-sol'],
  ['unverified adapter', 'verifiedByAdapter', false],
  ['incomplete activity', 'activityComplete', false],
  ['tool activity', 'toolCallCount', 1],
  ['inherited conversation', 'inheritedConversation', true],
] as const) test(`host receipt rejects ${label}`, () => {
  const source = evidence(); source.events[key] = value;
  assert.throws(() => receiptFromEvidence(job, source));
});

const reviewJob = { id: 'review-id', stage: 'decision', promptHash: 'd'.repeat(64), promptRef: { path: `blobs/${'d'.repeat(64)}`, sha256: 'd'.repeat(64) } };

test('review claim starts a segment durably and binds a fresh token to the review prompt', t => {
  const f = fixture(t, { paused: false, outcomes: [], segmentStartedAt: null });
  const result = claimReviewInvocation(f.collector, reviewJob), rows = readJournal(f.root);
  assert.deepEqual(rows.map(r => r.kind), ['segment-started', 'review-dispatch-claimed']);
  assert.equal(rows[1].data.reviewId, reviewJob.id); assert.equal(rows[1].data.stage, reviewJob.stage);
  assert.deepEqual(rows[1].data.job, result.job); assert.equal(result.job.promptHash, reviewJob.promptHash); assert.deepEqual(result.job.promptRef, reviewJob.promptRef);
  assert.match(result.job.jobId, /^[a-f0-9-]{36}$/); assert.match(result.job.dispatchToken, /^[a-f0-9-]{36}$/);
  assert.ok(Date.parse(result.job.deadlineAt) > Date.parse(result.job.claimedAt));
  assert.ok(Date.parse(result.job.deadlineAt) <= Date.parse(result.job.claimedAt) + 10050);
  assert.equal(existsSync(join(f.root, 'private/owner.lock')), false);
});

test('review deadline is clamped to the already active segment end', t => {
  const segmentStartedAt = new Date(Date.now() - 59000).toISOString();
  const f = fixture(t, { paused: false, outcomes: [], segmentStartedAt });
  const result = claimReviewInvocation(f.collector, reviewJob), rows = readJournal(f.root);
  assert.equal(Date.parse(result.job.deadlineAt), Date.parse(segmentStartedAt) + 60000);
  assert.deepEqual(rows.map(r => r.kind), ['review-dispatch-claimed']);
});

test('paused review cannot claim work or restart the active segment', t => {
  const f = fixture(t, { paused: true, outcomes: [], segmentStartedAt: null });
  assert.deepEqual(claimReviewInvocation(f.collector, reviewJob), { stop: 'paused' });
  assert.deepEqual(readJournal(f.root), []);
});

test('review at active segment cap records a pause without allocating another token', t => {
  const f = fixture(t, { paused: false, outcomes: [], segmentStartedAt: new Date(Date.now() - 60001).toISOString() });
  assert.deepEqual(claimReviewInvocation(f.collector, reviewJob), { stop: 'active-segment-wall-cap' });
  const rows = readJournal(f.root); assert.deepEqual(rows.map(r => r.kind), ['pause']);
  assert.equal(rows[0].data.reason, 'active-segment-wall-cap');
});
