import assert from 'node:assert/strict';
import test from 'node:test';
import { assessKingReturnRun, bindKingReturnCase, kingReturnConfiguration, summarizeKingReturnCase } from '../../scripts/coach-lab-king-return.mjs';

function archiveRun() {
  const variant = 'complex-partners';
  const observation = { id: 'king-scenario', gameId: 'trix', variantId: variant, seat: 2, turn: 2, phase: 'playing', request: 'complex',
    hand: ['D3', 'D7', 'D9', 'D10', 'DJ', 'DQ', 'H8', 'H9', 'H10', 'S2', 'S3'], handCounts: [11, 11, 11, 11], trick: [], tricks: [{ number: 1 }, { number: 2 }] };
  return { variant, pin: { gameId: 'trix', variantId: variant, moduleVersion: '2.2.0', ruleProfileId: `trix-${variant}-1.1.0`, stateSchemaVersion: '1.2.0', observationSchemaVersion: '1.2.0', publicSchemaVersion: '1.2.0', eventSchemaVersion: '1.0.0' },
    status: 'completed', arm: 'controlled-HK-double', profileId: 'trix-deterministic-1.0.0', witnessId: 'partner-return-to-publicly-known-void',
    actorRecords: [{ ordinal: 14, seat: 2, observation, policySuggestedCandidateId: 'play:S2', executedCandidateId: 'play:D3' }],
    hands: 'NEVER-NATIVE-INPUT', result: 'NOT-A-DECISION-FACT', timeline: ['LATER-EVENTS'] };
}

test('king return binder extracts only North at the frozen move and copies its observation', () => {
  const source = archiveRun(), bound = bindKingReturnCase(source.variant, source);
  assert.deepEqual(Object.keys(bound).sort(), ['alternativeCandidateId', 'caseId', 'observation', 'referenceCandidateId', 'rulePin']);
  assert.ok(!JSON.stringify(bound).includes('NEVER-NATIVE-INPUT') && !JSON.stringify(bound).includes('LATER-EVENTS'));
  bound.observation.seat = 0; assert.equal(source.actorRecords[0].observation.seat, 2);
});

test('king return binder rejects another seat, move, profile, pin and unknown private actor field', () => {
  const changes: ((r: ReturnType<typeof archiveRun>) => void)[] = [
    r => { r.actorRecords[0].seat = 0; }, r => { r.actorRecords[0].ordinal = 16; }, r => { r.actorRecords.push(r.actorRecords[0]); },
    r => { r.actorRecords[0].observation.turn = 0; }, r => { r.pin.publicSchemaVersion = '1.1.0'; },
    r => { r.actorRecords[0].policySuggestedCandidateId = 'play:D7'; }, r => { r.profileId = 'foreign'; },
    r => { Object.assign(r.actorRecords[0].observation, { hands: [['HK']] }); },
  ];
  for (const change of changes) { const r = archiveRun(); change(r); assert.throws(() => bindKingReturnCase(r.variant, r)); }
});

type Recipient = { kind: string; seat?: number; competitor?: string };
type Ledger = { component: string; card?: string; delta: number; recipient: Recipient };
function finish(candidateId: string) {
  const releaseNow = candidateId !== 'play:S2', seat = releaseNow ? 3 : 0;
  const card = candidateId.slice(5), bonusRecipient = { kind: 'competitor', competitor: releaseNow ? 'NS' : 'EW' };
  const ledger: Ledger[] = [{ component: 'king', card: 'HK', delta: -150, recipient: { kind: 'seat', seat } },
    { component: 'double-bonus', card: 'HK', delta: 75, recipient: bonusRecipient },
    { component: 'diamond', card: 'D2', delta: -10, recipient: { kind: 'seat', seat: 2 } },
    { component: 'diamond', delta: -120, recipient: { kind: 'seat', seat: 1 } },
    { component: 'queen', delta: -100, recipient: { kind: 'seat', seat: 1 } },
    { component: 'trick', delta: -195, recipient: { kind: 'seat', seat: 1 } }];
  const componentTotals: Record<string, Record<string, number>> = { NS: {}, EW: {} };
  for (const e of ledger) {
    const id = e.recipient.kind === 'competitor' ? e.recipient.competitor! : e.recipient.seat! % 2 === 0 ? 'NS' : 'EW';
    componentTotals[id][e.component] = (componentTotals[id][e.component] ?? 0) + e.delta;
  }
  const requestTotals = ['NS', 'EW'].map(id => ({ id, seats: id === 'NS' ? [0, 2] : [1, 3], total: Object.values(componentTotals[id]).reduce((a, b) => a + b, 0) }));
  return { candidateId, teamPoints: requestTotals[0].total, kingNetPoints: releaseNow ? 75 : -150, componentTotals, requestTotals, completedTricks: 13,
    kingCapture: { seat, trick: releaseNow ? 3 : 4, leader: releaseNow ? 2 : 0, doubled: true, bonusRecipient, withheld: false },
    kingRelease: { seat: 0, trick: releaseNow ? 3 : 4, playOrdinal: releaseNow ? 11 : 13, continuationPlayOrdinal: releaseNow ? 3 : 5 },
    firstTrick: { number: 3, leader: 2, winner: releaseNow ? 3 : 0, plays: releaseNow ? [{ seat: 2, card }, { seat: 1, card: 'C3' }, { seat: 0, card: 'HK' }, { seat: 3, card: card[0] + 'A' }] : [{ seat: 2, card }, { seat: 1, card: 'S3' }, { seat: 0, card: 'S4' }, { seat: 3, card: 'C5' }] },
    ledger, withheldBonuses: [] };
}

function evaluatedCase() {
  const source = archiveRun(), input = bindKingReturnCase(source.variant, source), configuration = kingReturnConfiguration();
  const candidateIds = source.actorRecords[0].observation.hand.map(c => `play:${c}`);
  const rows = configuration.streams.flatMap(stream => Array.from({ length: 16 }, (_, i) => ({ stream, ordinal: i + 1, allocationDigest: 'a'.repeat(64),
    profiles: configuration.profiles.map(p => ({ profileId: p.id, roots: candidateIds.map(finish) })) })));
  const result = { version: 'trix-king-return-1.0.0', caseId: input.caseId, referenceCandidateId: input.referenceCandidateId, alternativeCandidateId: input.alternativeCandidateId,
    actorObservation: input.observation, status: 'completed', inputDigest: 'b'.repeat(64), rulePin: input.rulePin, objective: 'combined-team-request-points', candidateIds,
    policySelections: configuration.profiles.map(p => ({ profileId: p.id, candidateId: 'play:S2' })), streams: configuration.streams, samplingComplete: true, rows,
    uniqueAllocations: 1, repeatedSamples: 31, work: { worlds: 32, steps: 32 * 4 * 11 * 44, samplerOperations: 1000 } };
  return { input, configuration, result };
}

test('king return reporting uses full team points, separate streams and actual partner responses', () => {
  const f = evaluatedCase(), summary = summarizeKingReturnCase(f.result, f.input, f.configuration);
  assert.equal(summary.streams.length, 2); assert.equal(summary.uniqueAllocations, 1); assert.equal(summary.repeatedSamples, 31);
  const alternative = summary.streams[0].comparisons.find(c => c.candidateId === 'play:D3')!;
  assert.equal(alternative.meanTeamPoints, 65); assert.equal(alternative.meanKingNetPoints, 75);
  assert.equal(alternative.meanDeltaVsReference, 225); assert.equal(alternative.meanDeltaVsCurrent, 225);
  assert.equal(alternative.better, 16); assert.equal(alternative.immediateReleases, 16);
  const reference = summary.streams[0].comparisons.find(c => c.candidateId === 'play:S2')!;
  assert.equal(reference.meanDeltaVsReference, 0); assert.equal(reference.immediateReleases, 0);
});

test('king return reporting rejects missing pairing, mutated accounting, source context and chronology', () => {
  const changes: ((f: ReturnType<typeof evaluatedCase>) => void)[] = [
    f => { f.result.rows.pop(); }, f => { f.result.rows[0].profiles.pop(); }, f => { f.result.rows[0].profiles[0].roots.pop(); },
    f => { f.result.rows[0].ordinal = 2; }, f => { f.result.repeatedSamples = 0; }, f => { f.result.work.steps--; },
    f => { f.result.rulePin = { ...f.result.rulePin, publicSchemaVersion: '1.1.0' }; },
    f => { f.result.rows[0].profiles[0].roots[0].teamPoints++; },
    f => { f.result.rows[0].profiles[0].roots[0].kingNetPoints++; },
    f => { f.result.rows[0].profiles[0].roots[0].firstTrick.winner = 0; },
    f => { f.result.rows[0].profiles[0].roots[0].kingRelease.playOrdinal++; },
  ];
  for (const change of changes) { const f = evaluatedCase(); change(f); assert.throws(() => summarizeKingReturnCase(f.result, f.input, f.configuration)); }
});

test('partial king return worlds produce no rankings and failed or drifted receipts cannot pass', () => {
  const f = evaluatedCase(); f.result.status = 'incomplete'; f.result.samplingComplete = false; f.result.rows.pop();
  assert.deepEqual(summarizeKingReturnCase(f.result, f.input, f.configuration).streams, []);
  const good = { build: { status: 'passed' }, invocation: { status: 'passed' }, sourceUnchanged: true,
    study: { version: 'trix-king-return-1.0.0', status: 'completed', cases: [{ status: 'completed', samplingComplete: true }, { status: 'completed', samplingComplete: true }] } };
  assert.equal(assessKingReturnRun(good), 'passed');
  for (const bad of [{ ...good, sourceUnchanged: false }, { ...good, invocation: { status: 'failed' } }, { ...good, study: { ...good.study, cases: [f.result] } }]) assert.equal(assessKingReturnRun(bad), 'pending-unverified');
});
