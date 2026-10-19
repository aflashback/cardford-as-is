import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assessTimingRun, bindTimingCase, readTimingDecision, summarizeTimingCase, timingConfiguration, verifyTimingArchiveBytes } from '../../scripts/coach-lab-jacks-timing.mjs';

function fixture() {
  const pin = { gameId: 'trix', variantId: 'basic-partners', moduleVersion: '2.2.0', ruleProfileId: 'trix-basic-partners-1.1.0' };
  const spec = { id: 'test-case', decisionId: 'case-test', inputDigest: 'a'.repeat(64), referenceCandidateId: 'layout:H10' };
  const candidates = ['H10', 'S3'].map(card => ({ id: `layout:${card}`, public: { kind: 'layout-card', card } }));
  const actorPacket = { publicSchemaVersion: '1.2.0', gameId: 'trix', variantId: 'basic-partners', seat: 0, phase: 'layout', observation: { seat: 0, phase: 'layout' }, candidates };
  const decision = { decisionId: spec.decisionId, inputDigest: spec.inputDigest, executionStatus: 'committed', actor: 0, phase: 'layout', episodeId: 'episode-example', actorPacket,
    legalCandidates: candidates.map(c => ({ id: c.id, action: c.public })), actualHiddenHands: ['NEVER-EXPORT'], actualOutcome: { score: 999 }, analysis: { suggestion: 'NOT-INPUT' } };
  const manifest = { runId: 'example', base: { id: 'example' }, lab: { selector: pin } };
  return { spec, decision, manifest };
}

test('timing binder transmits only the frozen actor packet, exact pin and declared work', () => {
  const { spec, decision, manifest } = fixture();
  const bound = bindTimingCase(spec, manifest, decision);
  assert.deepEqual(Object.keys(bound).sort(), ['actorPacket', 'configuration', 'id', 'pin']);
  assert.deepEqual(bound.actorPacket, decision.actorPacket);
  assert.ok(!JSON.stringify(bound).includes('NEVER-EXPORT') && !JSON.stringify(bound).includes('NOT-INPUT'));
  bound.actorPacket.observation.seat = 2;
  assert.equal(decision.actorPacket.observation.seat, 0);
  assert.equal(bound.pin.publicSchemaVersion, '1.2.0');
  assert.equal(bound.configuration.profiles.length, 8);
});

test('timing binder rejects changed digest, illegal alternatives, actor rotation and historical pin', () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.decision.inputDigest = 'b'.repeat(64); },
    (f: ReturnType<typeof fixture>) => { f.decision.legalCandidates.pop(); },
    (f: ReturnType<typeof fixture>) => { f.decision.actor = 1; },
    (f: ReturnType<typeof fixture>) => { f.manifest.lab.selector.moduleVersion = '2.1.0'; },
    (f: ReturnType<typeof fixture>) => { f.spec.referenceCandidateId = 'layout:CA'; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => bindTimingCase(f.spec, f.manifest, f.decision)); }
});

test('streaming archive read binds exact unique record and complete byte hash', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'trix-timing-'));
  try {
    const path = join(dir, 'decisions.jsonl'), d = fixture().decision;
    const bytes = JSON.stringify({ decisionId: 'another' }) + '\r\n' + JSON.stringify(d) + '\r\n';
    writeFileSync(path, bytes);
    const selected = await readTimingDecision(path, d.decisionId);
    assert.deepEqual(selected.decision, d); assert.equal(selected.line, 2);
    assert.equal(selected.archiveDigest, createHash('sha256').update(bytes).digest('hex'));
    await assert.rejects(readTimingDecision(path, 'missing'), /exactly once/);
    writeFileSync(path, bytes + JSON.stringify(d) + '\n');
    await assert.rejects(readTimingDecision(path, d.decisionId), /exactly once/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function resultCase() {
  const root = (candidateId: string, harmful: boolean) => {
    const first = harmful ? 1 : 5, placement = harmful ? 12 : 8;
    const turns = Array.from({ length: 12 }, (_, i) => ({ offset: i + 1, seat: 1, action: { kind: 'layout-pass', card: '' }, newlyPlayable: [] as string[] }));
    turns[0].seat = 0; turns[0].action = { kind: 'layout-card', card: candidateId.slice(7) };
    turns[first - 1].newlyPlayable.push('S2');
    turns[placement - 1].seat = 2; turns[placement - 1].action = { kind: 'layout-card', card: 'S2' };
    return { candidateId,
    finishOrder: harmful ? [3, 0, 1, 2] : [3, 0, 2, 1], seatPoints: harmful ? [150, 100, 50, 200] : [150, 50, 100, 200],
    ownPoints: 150, partnerPoints: harmful ? 50 : 100, teamPoints: harmful ? 200 : 250, objectivePoints: harmful ? 200 : 250,
    unforcedFutureDecisions: 4, turns, releaseTimes: [{ card: candidateId.slice(7), seat: 0, firstPlayableOffset: 0, placementOffset: 1 }, { card: 'S2', seat: 2, firstPlayableOffset: first, placementOffset: placement }] };
  };
  const configuration = { ...timingConfiguration(), worldsPerStream: 1, profiles: [{ id: 'all-history', policies: Array(4).fill('trix-history-1.0.0') }] };
  return { id: 'example', pin: { variantId: 'basic-partners' }, actorObservation: { seat: 0, board: [{ suit: 'H', low: 11, high: 14 }, { suit: 'S', low: 4, high: 14 }] }, evaluation: {
    status: 'completed', samplingComplete: true, objective: 'combined-team-request-points', configuration,
    streams: ['timing-primary', 'timing-confirmation'], candidateIds: ['layout:H10', 'layout:S3'], uniqueAllocations: 1, repeatedSamples: 1,
    rows: ['timing-primary', 'timing-confirmation'].map(stream => ({ stream, ordinal: 0, allocationDigest: 'a'.repeat(64), profiles: [{ profileId: 'all-history', roots: [root('layout:H10', false), root('layout:S3', true)] }] })) } };
}

test('timing summary uses paired team points and separates earlier availability from actual placement', () => {
  const summary = summarizeTimingCase(resultCase(), 'layout:H10');
  assert.equal(summary.sampledWorlds, 2); assert.equal(summary.uniqueAllocations, 1);
  for (const stream of summary.streams) {
    const comparison = stream.comparisons.find((c: any) => c.candidateId === 'layout:S3');
    assert.equal(comparison.meanDeltaPoints, -50); assert.equal(comparison.worse, 1);
    const timing = stream.timingChanges[0].twos[0];
    assert.equal(timing.availableEarlier, 1); assert.equal(timing.playedEarlier, 0);
    assert.equal(timing.availabilityDelta, -4); assert.equal(timing.placementDelta, 4);
  }
});

test('timing summaries suppress incomplete results and reject unpaired/tampered completed evidence', () => {
  const incomplete = resultCase(); incomplete.evaluation.status = 'incomplete';
  assert.deepEqual(summarizeTimingCase(incomplete, 'layout:H10').streams, []);
  for (const mutate of [
    (c: ReturnType<typeof resultCase>) => { c.evaluation.rows.pop(); },
    (c: ReturnType<typeof resultCase>) => { c.evaluation.rows[0].profiles[0].roots.pop(); },
    (c: ReturnType<typeof resultCase>) => { c.evaluation.rows[0].profiles[0].roots[0].teamPoints = 999; },
    (c: ReturnType<typeof resultCase>) => { c.evaluation.rows[1].stream = 'timing-primary'; },
    (c: ReturnType<typeof resultCase>) => { c.evaluation.rows[0].profiles[0].roots[0].releaseTimes.pop(); },
    (c: ReturnType<typeof resultCase>) => { c.evaluation.rows[0].profiles[0].roots[0].releaseTimes[1].firstPlayableOffset = -1; },
    (c: ReturnType<typeof resultCase>) => { c.evaluation.rows[0].profiles[0].roots[0].releaseTimes[1].placementOffset = 2; },
  ]) { const c = resultCase(); mutate(c); assert.throws(() => summarizeTimingCase(c, 'layout:H10')); }
});

test('timing archive byte pins reject a substituted valid manifest or actor packet', () => {
  const bytes = Buffer.from(JSON.stringify(fixture().manifest)), record = 'b'.repeat(64);
  const spec = { manifestDigest: createHash('sha256').update(bytes).digest('hex'), recordDigest: record };
  assert.doesNotThrow(() => verifyTimingArchiveBytes(spec, bytes, record));
  assert.throws(() => verifyTimingArchiveBytes(spec, Buffer.concat([bytes, Buffer.from(' ')]), record), /manifest bytes/);
  assert.throws(() => verifyTimingArchiveBytes(spec, bytes, 'c'.repeat(64)), /decision bytes/);
});

test('timing execution receipt cannot call an incomplete or drifted run verified', () => {
  const c = resultCase(), args = { build: { status: 'passed' }, invocation: { status: 'passed' }, sourceUnchanged: true,
    study: { schemaVersion: 'trix-jacks-timing-study-1.0.0', status: 'completed', cases: [c] } };
  assert.equal(assessTimingRun(args), 'passed');
  assert.equal(assessTimingRun({ ...args, sourceUnchanged: false }), 'pending-unverified');
  assert.equal(assessTimingRun({ ...args, invocation: { status: 'timed-out' } }), 'pending-unverified');
  c.evaluation.samplingComplete = false;
  assert.equal(assessTimingRun(args), 'pending-unverified');
});
