import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { prepareReviewRetry, recoveryMetadata, assertNormalResumeAllowed } from '../../scripts/trix-scenario-collection/recovery.mjs';
import { appendEvent, readJournal, sha } from '../../scripts/trix-scenario-collection/journal.mjs';

function fixture(t, { cap = 60000, reason = 'review-failed', settled = true, attempts = 1, stopped = true, earlierPause = false, fatalPlayer = false, rejectionReason = 'decision-review schema: data/packetHash must match pattern "^[a-f0-9]{64}$"' } = {}) {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'recovery-test-')); mkdirSync(join(root, 'private'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  appendEvent(root, 'initialized', {}); const segment = appendEvent(root, 'segment-started', {});
  if (earlierPause) appendEvent(root, 'pause', { reason: 'operator-request' });
  if (fatalPlayer) appendEvent(root, 'attempt-settled', { jobId: 'prior-player', fatal: true });
  for (let i = 0; i < attempts; i++) {
    const jobId = `review-${i}`;
    appendEvent(root, 'review-dispatch-claimed', { reviewId: 'independent-review', stage: 'decision', job: { jobId } });
    if (settled) appendEvent(root, 'review-attempt-settled', { jobId, status: 'rejected', reason: rejectionReason });
    const directory = join(root, 'private/invocations', jobId, 'private/app-server'); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'stopped.json'), JSON.stringify({ stoppedVerified: stopped, error: null }));
  }
  appendEvent(root, 'pause', { reason });
  const collector = {
    root, manifest: { mode: 'live', runId: 'no-model-recovery-fixture', plan: { workCaps: { maxActiveSegmentWallMs: cap } }, build: { sourceDigest: 'a'.repeat(64) } },
    state() {
      const rows = readJournal(root);
      return { rows, paused: rows.some(r => r.kind === 'pause'), claimed: null, intent: null, segmentStartedAt: segment.at };
    },
    originalGuardEnd() { return Date.parse(this.state().segmentStartedAt) + this.manifest.plan.workCaps.maxActiveSegmentWallMs; },
  };
  return { root, collector, segment, originalDeadlineAt: new Date(Date.parse(segment.at) + cap).toISOString() };
}

test('review recovery preserves original cap without resuming the frozen underlying collector', t => {
  const f = fixture(t), before = readJournal(f.root), retry = prepareReviewRetry(f.collector, { originalDeadlineAt: f.originalDeadlineAt });
  assert.equal(f.collector.state().paused, true); assert.equal(retry.collector.state().paused, false);
  assert.equal(retry.collector.state().segmentStartedAt, f.segment.at);
  assert.equal(retry.collector.originalGuardEnd(), Date.parse(f.originalDeadlineAt));
  assert.equal(recoveryMetadata(f.root).originalDeadlineAt, f.originalDeadlineAt);
  const rows = readJournal(f.root); assert.deepEqual(rows.slice(0, before.length), before);
  assert.equal(rows.at(-1).kind, 'review-recovery-authorized'); assert.equal(rows.filter(r => r.kind === 'resume').length, 0);
  const source = readFileSync(join(f.root, retry.metadata.recoverySourcePath));
  assert.equal(sha(source), retry.metadata.recoverySourceHash);
  const journalSource = readFileSync(join(f.root, retry.metadata.journalSourcePath));
  assert.equal(sha(journalSource), retry.metadata.journalSourceHash);
  assert.throws(() => retry.collector.resume(), /cannot reset/);
  assert.throws(() => assertNormalResumeAllowed(f.root), /explicit newSegment/);
  assert.doesNotThrow(() => assertNormalResumeAllowed(f.root, { newSegment: true }));
});

test('any new pause remains paused in recovery and cannot be suppressed', t => {
  const f = fixture(t), retry = prepareReviewRetry(f.collector, { originalDeadlineAt: f.originalDeadlineAt });
  appendEvent(f.root, 'pause', { reason: 'operator-request' });
  assert.equal(retry.collector.state().paused, true); assert.equal(retry.collector.state().segmentStartedAt, f.segment.at);
});

test('recovery refuses a later reset-style resume instead of accepting a new budget', t => {
  const f = fixture(t), retry = prepareReviewRetry(f.collector, { originalDeadlineAt: f.originalDeadlineAt });
  appendEvent(f.root, 'resume', {});
  assert.throws(() => retry.collector.state(), /budget was reset/);
});

for (const [name, options, message] of [
  ['original budget expired', { cap: 1 }, /deadline expired/],
  ['unsettled reviewer', { settled: false }, /Unsettled.*review/],
  ['second reviewer attempt', { attempts: 2 }, /attempt cap/],
  ['normal operator pause', { reason: 'operator-request' }, /Only a settled review-failed/],
  ['unverified stopped host', { stopped: false }, /not verified stopped/],
  ['earlier operator pause followed by review failure', { earlierPause: true }, /Earlier operator or safety pause/],
  ['earlier fatal player stop', { fatalPlayer: true }, /Earlier fatal player stop/],
] as const) test(`recovery rejects ${name} without consuming its one-shot authorization`, t => {
  const f = fixture(t, options), before = readJournal(f.root);
  assert.throws(() => prepareReviewRetry(f.collector, { originalDeadlineAt: f.originalDeadlineAt }), message);
  assert.deepEqual(readJournal(f.root), before); assert.equal(existsSync(join(f.root, 'private/recovery/original-budget.json')), false);
});

test('recovery rejects a supplied deadline extension', t => {
  const f = fixture(t);
  assert.throws(() => prepareReviewRetry(f.collector, { originalDeadlineAt: new Date(Date.parse(f.originalDeadlineAt) + 1).toISOString() }), /may not extend/);
  assert.equal(existsSync(join(f.root, 'private/recovery/original-budget.json')), false);
});

test('live driver lock prevents preparation and leaves recovery metadata unused', t => {
  const f = fixture(t); writeFileSync(join(f.root, 'private/driver.lock'), JSON.stringify({ pid: process.pid }));
  assert.throws(() => prepareReviewRetry(f.collector, { originalDeadlineAt: f.originalDeadlineAt }), /live collection driver must stop/);
  assert.equal(existsSync(join(f.root, 'private/recovery/original-budget.json')), false);
});

test('different review rejection does not authorize this narrow recovery', t => {
  const f = fixture(t, { rejectionReason: 'reviewer used tools' });
  assert.throws(() => prepareReviewRetry(f.collector, { originalDeadlineAt: f.originalDeadlineAt }), /sole malformed packetHash rejection/);
});
