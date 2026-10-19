import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import * as runner from '../../scripts/trix-scenario-collection/runner.mjs';
import { appendEvent, putBlob, readJournal, safePath } from '../../scripts/trix-scenario-collection/journal.mjs';

const repo = resolve(import.meta.dirname, '../..');
const plan = JSON.parse(readFileSync(resolve(repo, 'planning/implementation/coach-lab/trix-scenario-collection/campaign.plan.json'), 'utf8'));
const deferred = Object.freeze({ maxActiveSegmentWallMs: null, selectionDeferred: true });
function fixture(t, customPlan = plan) {
  const scratch = resolve(tmpdir());
  const home = mkdtempSync(resolve(scratch, 'trix-execution-policy-'));
  t.after(() => { assert.ok(home.startsWith(scratch)); rmSync(home, { recursive: true, force: true }); });
  const { root } = runner.initializeRun({ runId: 'fixture', home, plan: customPlan, archive: false, fixture: true, seed: 'execution-policy-tests' });
  const starts = [];
  const c = new runner.Collector(root, { native(command, input) {
    assert.equal(command, 'start'); starts.push(input);
    return { schemaVersion: 'trix-collection-native-1.0.0', pin: { ...customPlan.pins, variantId: input.variant, ruleProfileId: customPlan.phases.find(p => p.variant === input.variant).ruleProfileId }, node: { phase: 'round-complete' }, outcome: { completedTricks: 13, acceptedPlays: 52, nativeTerminalPhase: 'round-complete' } };
  } });
  return { c, starts };
}
function pending(c) { const job = { jobId: 'synthetic-pending-job' }; appendEvent(c.root, 'job-prepared', job); return job; }
function liveFacade(c) {
  // Control-flow fixture only: the persisted manifest and its hash stay intact.
  const facade = Object.create(c); facade.manifest = { ...c.manifest, mode: 'live' }; facade.state = c.state.bind(c);
  return facade;
}
function completed(c, count, request = 'diamonds') {
  for (let i = 0; i < count; i++) appendEvent(c.root, 'episode-completed', { episodeId: `synthetic-${i}`, variant: 'basic-solo', request });
}

test('execution policy defaults to the original cap and accepts only the exact opt-in', t => {
  const { c } = fixture(t);
  assert.deepEqual(runner.effectiveExecutionPolicy(c), { maxActiveSegmentWallMs: 5400000, selectionDeferred: false });
  c.executionPolicy = deferred;
  assert.deepEqual(runner.effectiveExecutionPolicy(c), deferred);
  for (const invalid of [null, [], {}, { ...deferred, extra: true }, { maxActiveSegmentWallMs: 5400000, selectionDeferred: true }, { maxActiveSegmentWallMs: null, selectionDeferred: false }, { maxActiveSegmentWallMs: null, selectionDeferred: 'true' }, { ...deferred, [Symbol('extra')]: true }]) {
    c.executionPolicy = invalid; assert.throws(() => runner.effectiveExecutionPolicy(c));
  }
});

test('the default 90-minute cap still stops next and claim without spending an attempt', t => {
  const { c } = fixture(t); const job = pending(c);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  appendEvent(c.root, 'segment-started', {}); t.mock.timers.tick(5400001);
  assert.throws(() => c.claim(job.jobId, 'synthetic-parent'), /wall cap/);
  assert.equal(c.next().stop, 'active-segment-wall-cap');
  assert.equal(c.state().attempts, 0); assert.equal(c.state().pending.jobId, job.jobId);
});

test('the opt-in admits an old segment and gives each claim only its 300-second deadline', t => {
  const { c } = fixture(t); const manifestBytes = readFileSync(safePath(c.root, 'manifest.json')); const job = pending(c);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  appendEvent(c.root, 'segment-started', {}); const segmentAt = c.state().segmentStartedAt;
  t.mock.timers.tick(5400001); c.executionPolicy = deferred;
  assert.equal(c.next().job.jobId, job.jobId);
  const claim = c.claim(job.jobId, 'synthetic-parent');
  assert.equal(Date.parse(claim.deadlineAt) - Date.parse(claim.claimedAt), 300000);
  assert.equal(c.state().segmentStartedAt, segmentAt); assert.equal(c.state().attempts, 1);
  assert.ok(readFileSync(safePath(c.root, 'manifest.json')).equals(manifestBytes));
  assert.equal(readJournal(c.root).some(row => row.kind === 'pause' || row.kind === 'resume'), false);
});

test('default claim deadline is still truncated by the remaining aggregate budget', t => {
  const { c } = fixture(t); const job = pending(c);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() }); appendEvent(c.root, 'segment-started', {});
  t.mock.timers.tick(5400000 - 1000);
  const claim = c.claim(job.jobId, 'synthetic-parent');
  assert.equal(Date.parse(claim.deadlineAt) - Date.parse(claim.claimedAt), 1000);
});

test('deferred selection never enters the original curate/replay path', t => {
  const { c, starts } = fixture(t); const live = liveFacade(c);
  live.replay = () => { throw Error('synthetic curate sentinel'); };
  assert.throws(() => live.next(), /synthetic curate sentinel/); assert.equal(starts.length, 0);
  live.executionPolicy = deferred;
  assert.equal(live.next().stop, 'request-completed'); assert.equal(starts.length, 1);
});

test('deferred selection does not close a phase whose selected target is already met', t => {
  const customPlan = structuredClone(plan); customPlan.phases[0].targetCases = 0;
  for (const request of customPlan.phases[0].requests) customPlan.phases[0].requestTargets[request] = 0;
  const { c, starts } = fixture(t, customPlan); const live = liveFacade(c);
  assert.equal(live.next().stop, 'phase-target-met'); assert.equal(starts.length, 0);
  const { c: amended, starts: amendedStarts } = fixture(t, customPlan); const continuation = liveFacade(amended); continuation.executionPolicy = deferred;
  assert.equal(continuation.next().stop, 'request-completed'); assert.equal(amendedStarts.length, 1);
  assert.deepEqual(amended.state().closedPhases, []);
});

test('deferred selection retains the batch review gate', t => {
  const { c, starts } = fixture(t); c.executionPolicy = deferred; completed(c, 4);
  assert.equal(c.next().stop, 'batch-review-required'); assert.equal(starts.length, 0);
  appendEvent(c.root, 'batch-reviewed', { variant: 'basic-solo', completed: 4 });
  assert.equal(c.next().stop, 'request-completed'); assert.equal(starts.length, 1);
});

test('deferred selection retains phase and per-contract request caps', t => {
  const { c, starts } = fixture(t); c.executionPolicy = deferred; completed(c, 32);
  appendEvent(c.root, 'batch-reviewed', { variant: 'basic-solo', completed: 32 });
  assert.equal(c.next().stop, 'phase-cap-reached'); assert.equal(starts.length, 0);
  const { c: contract, starts: contractStarts } = fixture(t); contract.executionPolicy = deferred; completed(contract, 8);
  appendEvent(contract.root, 'batch-reviewed', { variant: 'basic-solo', completed: 8 });
  assert.equal(contract.next().stop, 'request-completed'); assert.equal(contractStarts[0].request, 'king');
});

test('deferred selection retains campaign attempts and attempted episode caps', t => {
  const customPlan = structuredClone(plan); customPlan.workCaps.maxPlayerAttemptsCampaign = 1;
  const { c, starts } = fixture(t, customPlan); c.executionPolicy = deferred;
  const job = pending(c); appendEvent(c.root, 'dispatch-claimed', { jobId: job.jobId }); appendEvent(c.root, 'attempt-settled', { jobId: job.jobId, fatal: false });
  assert.equal(c.next().stop, 'attempt-cap'); assert.equal(starts.length, 0);
  pending(c); assert.throws(() => c.claim(job.jobId, 'synthetic-parent'), /Attempt cap/);
  const episodePlan = structuredClone(plan); episodePlan.workCaps.maxAttemptedEpisodes = 1;
  const { c: episode, starts: episodeStarts } = fixture(t, episodePlan); episode.executionPolicy = deferred;
  appendEvent(episode.root, 'episode-started', { episode: episode.schedule[0], frameRef: {} }); appendEvent(episode.root, 'episode-abandoned', {});
  assert.equal(episode.next().stop, 'episode-cap'); assert.equal(episodeStarts.length, 0);
});

test('deferred selection retains the per-decision attempt cap', t => {
  const { c } = fixture(t); c.executionPolicy = deferred;
  const episode = c.schedule[0], frameRef = putBlob(c.root, { revision: 7, node: { phase: 'playing' } });
  appendEvent(c.root, 'episode-started', { episode, frameRef });
  for (let i = 0; i < 2; i++) {
    appendEvent(c.root, 'job-prepared', { jobId: `synthetic-attempt-${i}`, episodeId: episode.episodeId, revision: 7 });
    appendEvent(c.root, 'attempt-settled', { fatal: false });
  }
  assert.equal(c.next().stop, 'decision-attempt-cap'); assert.equal(c.state().paused, true);
});
