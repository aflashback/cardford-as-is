import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { assessKingDiscardRun, bindKingDiscardCase, kingDiscardConfiguration, summarizeKingDiscardCase, verifyKingDiscardReceipt, reportKingDiscard } from '../../scripts/coach-lab-king-discard.mjs';

function archiveRun(variant = 'complex-partners') {
  const observation = { id: 'king-scenario', gameId: 'trix', variantId: variant, seat: 0, turn: 0, phase: 'playing', request: variant.startsWith('basic') ? 'king' : 'complex',
    hand: ['C3', 'C4', 'C5', 'C6', 'CA', 'H2', 'H3', 'H4', 'H5', 'H6', 'HK'], handCounts: [11, 10, 10, 11],
    trick: [{ seat: 2, card: 'D3' }, { seat: 1, card: 'S6' }], ledger: [],
    tricks: [{ number: 1, leader: 3, winner: 3, plays: [{ seat: 3, card: 'DA' }, { seat: 2, card: 'D8' }, { seat: 1, card: 'S4' }, { seat: 0, card: 'D2' }] },
      { number: 2, leader: 3, winner: 2, plays: [{ seat: 3, card: 'D4' }, { seat: 2, card: 'DK' }, { seat: 1, card: 'S5' }, { seat: 0, card: 'C2' }] }] };
  return { variant, pin: { gameId: 'trix', variantId: variant, moduleVersion: '2.2.0', ruleProfileId: `trix-${variant}-1.1.0`, stateSchemaVersion: '1.2.0', observationSchemaVersion: '1.2.0', publicSchemaVersion: '1.2.0', eventSchemaVersion: '1.0.0' },
    status: 'completed', arm: 'controlled-HK-double', profileId: 'trix-deterministic-1.0.0', witnessId: 'partner-return-to-publicly-known-void',
    actorRecords: [{ ordinal: 16, seat: 0, observation, policySuggestedCandidateId: 'play:HK', executedCandidateId: 'play:HK' }],
    hands: 'NEVER-NATIVE-INPUT', result: 'NOT-A-DECISION-FACT', timeline: ['LATER-EVENTS'] };
}

test('king discard binder extracts only South at the frozen move and copies its observation', () => {
  const source = archiveRun(), bound = bindKingDiscardCase(source.variant, source);
  assert.deepEqual(Object.keys(bound).sort(), ['alternativeCandidateId', 'caseId', 'observation', 'referenceCandidateId', 'rulePin']);
  assert.ok(!JSON.stringify(bound).includes('NEVER-NATIVE-INPUT') && !JSON.stringify(bound).includes('LATER-EVENTS'));
  bound.observation.seat = 2; assert.equal(source.actorRecords[0].observation.seat, 0);
});

test('king discard binder rejects another seat, move, profile, pin and unknown private actor field', () => {
  const changes: ((r: ReturnType<typeof archiveRun>) => void)[] = [
    r => { r.actorRecords[0].seat = 2; }, r => { r.actorRecords[0].ordinal = 14; }, r => { r.actorRecords.push(r.actorRecords[0]); },
    r => { r.actorRecords[0].observation.turn = 2; }, r => { r.pin.publicSchemaVersion = '1.1.0'; },
    r => { r.actorRecords[0].policySuggestedCandidateId = 'play:CA'; }, r => { r.profileId = 'foreign'; },
    r => { r.actorRecords[0].executedCandidateId = 'play:CA'; },
    r => { r.actorRecords[0].observation.handCounts[1]++; },
    r => { r.actorRecords[0].observation.trick[1].card = 'D5'; },
    r => { r.actorRecords[0].observation.tricks[0].plays[0].card = 'D10'; },
    r => { r.actorRecords[0].observation.hand[0] = 'D5'; },
    r => { Object.assign(r.actorRecords[0].observation, { hands: [['HK']] }); },
  ];
  for (const change of changes) { const r = archiveRun(); change(r); assert.throws(() => bindKingDiscardCase(r.variant, r)); }
});

type Recipient = { kind: string; seat?: number; competitor?: string };
type Ledger = { component: string; card?: string; trick?: number; delta: number; recipient: Recipient };
function finish(candidateId: string, variant = 'complex-partners', eastWins = true) {
  const releaseNow = candidateId === 'play:HK', seat = releaseNow ? (eastWins ? 3 : 2) : 0;
  const card = candidateId.slice(5), bonusRecipient = { kind: 'competitor', competitor: seat % 2 ? 'NS' : 'EW' };
  const ledger: Ledger[] = [{ component: 'king', card: 'HK', trick: releaseNow ? 3 : 4, delta: -150, recipient: { kind: 'seat', seat } },
    { component: 'double-bonus', card: 'HK', trick: releaseNow ? 3 : 4, delta: 75, recipient: bonusRecipient }];
  if (variant.startsWith('complex')) ledger.push(
    { component: 'diamond', card: 'D2', delta: -10, recipient: { kind: 'seat', seat: 2 } },
    { component: 'diamond', delta: -120, recipient: { kind: 'seat', seat: 1 } },
    { component: 'queen', delta: -100, recipient: { kind: 'seat', seat: 1 } },
    { component: 'trick', delta: -195, recipient: { kind: 'seat', seat: 1 } });
  const componentTotals: Record<string, Record<string, number>> = { NS: {}, EW: {} };
  for (const e of ledger) {
    const id = e.recipient.kind === 'competitor' ? e.recipient.competitor! : e.recipient.seat! % 2 === 0 ? 'NS' : 'EW';
    componentTotals[id][e.component] = (componentTotals[id][e.component] ?? 0) + e.delta;
  }
  const requestTotals = ['NS', 'EW'].map(id => ({ id, seats: id === 'NS' ? [0, 2] : [1, 3], total: Object.values(componentTotals[id]).reduce((a, b) => a + b, 0) }));
  return { candidateId, teamPoints: requestTotals[0].total, kingNetPoints: seat % 2 ? 75 : -150, componentTotals, requestTotals, completedTricks: 13,
    kingCapture: { seat, trick: releaseNow ? 3 : 4, leader: releaseNow ? 2 : 0, doubled: true, bonusRecipient, withheld: false },
    kingRelease: { seat: 0, trick: releaseNow ? 3 : 4, playOrdinal: releaseNow ? 11 : 13, continuationPlayOrdinal: releaseNow ? 1 : 3 },
    firstTrick: { number: 3, leader: 2, winner: eastWins ? 3 : 2, plays: [{ seat: 2, card: 'D3' }, { seat: 1, card: 'S6' }, { seat: 0, card }, { seat: 3, card: eastWins ? 'D5' : 'C7' }] },
    ledger, withheldBonuses: [] };
}

function evaluatedCase(variant = 'complex-partners') {
  const source = archiveRun(variant), input = bindKingDiscardCase(source.variant, source), configuration = kingDiscardConfiguration();
  const candidateIds = source.actorRecords[0].observation.hand.map(c => `play:${c}`);
  const rows = configuration.streams.flatMap(stream => Array.from({ length: 16 }, (_, i) => ({ stream, ordinal: i + 1, allocationDigest: 'a'.repeat(64),
    profiles: configuration.profiles.map(p => ({ profileId: p.id, roots: candidateIds.map(id => finish(id, variant)) })) })));
  const result = { version: 'trix-king-discard-1.0.0', caseId: input.caseId, referenceCandidateId: input.referenceCandidateId, alternativeCandidateId: input.alternativeCandidateId,
    actorObservation: input.observation, status: 'completed', inputDigest: 'b'.repeat(64), rulePin: input.rulePin, objective: 'combined-team-request-points', candidateIds,
    policySelections: configuration.profiles.map(p => ({ profileId: p.id, candidateId: p.id === 'all-baseline' || p.id === 'ns-baseline' ? 'play:HK' : 'play:CA' })), streams: configuration.streams, samplingComplete: true, rows,
    uniqueAllocations: 1, repeatedSamples: 31, work: { worlds: 32, steps: 32 * 4 * 11 * 42, samplerOperations: 1000 } };
  return { input, configuration, result };
}

test('king discard reporting uses full team points, separate streams and actual South choice and king outcomes', () => {
  const f = evaluatedCase(), summary = summarizeKingDiscardCase(f.result, f.input, f.configuration);
  assert.equal(summary.streams.length, 2); assert.equal(summary.uniqueAllocations, 1); assert.equal(summary.repeatedSamples, 31);
  const alternative = summary.streams[0].comparisons.find(c => c.candidateId === 'play:HK')!;
  assert.equal(alternative.meanTeamPoints, 65); assert.equal(alternative.meanKingNetPoints, 75);
  assert.equal(alternative.meanDeltaVsReference, 225); assert.equal(alternative.meanDeltaVsCurrent, 0);
  assert.equal(alternative.better, 16); assert.equal(alternative.immediateReleases, 16);
  const reference = summary.streams[0].comparisons.find(c => c.candidateId === 'play:CA')!;
  assert.equal(reference.meanDeltaVsReference, 0); assert.equal(reference.immediateReleases, 0);
});

test('king discard reporting rejects missing pairing, mutated accounting, source context and chronology', () => {
  const changes: ((f: ReturnType<typeof evaluatedCase>) => void)[] = [
    f => { f.result.rows.pop(); }, f => { f.result.rows[0].profiles.pop(); }, f => { f.result.rows[0].profiles[0].roots.pop(); },
    f => { f.result.rows[0].ordinal = 2; }, f => { f.result.repeatedSamples = 0; }, f => { f.result.work.steps--; },
    f => { f.result.rulePin = { ...f.result.rulePin, publicSchemaVersion: '1.1.0' }; },
    f => { f.result.rows[0].profiles[0].roots[0].teamPoints++; },
    f => { f.result.rows[0].profiles[0].roots[0].kingNetPoints++; },
    f => { f.result.rows[0].profiles[0].roots[0].firstTrick.winner = 0; },
    f => { f.result.rows[0].profiles[0].roots[0].firstTrick.plays[0].card = 'D5'; },
    f => { f.result.rows[0].profiles[0].roots[0].firstTrick.plays[1].card = 'S7'; },
    f => { f.result.rows[0].profiles[0].roots[0].firstTrick.plays[2].card = 'CA'; },
    f => { f.result.rows[0].profiles[0].roots[0].firstTrick.plays[3].card = 'DA'; },
    f => { f.result.rows[0].profiles[0].roots[0].kingRelease.continuationPlayOrdinal = 5; },
    f => { f.result.rows[0].profiles[0].roots[0].kingRelease.playOrdinal++; },
    f => {
      const root = f.result.rows[0].profiles[0].roots[0]; // Non-HK root: deferred release, originally trick 4.
      root.kingCapture.trick = 5; root.kingRelease.trick = 5;
      root.kingRelease.playOrdinal = 17; root.kingRelease.continuationPlayOrdinal = 7;
    },
    f => { f.result.rows[0].profiles[0].roots[0].ledger[0].trick = 5; },
    f => { f.result.rows[0].profiles[0].roots[0].ledger[1].trick = 5; },
  ];
  for (const change of changes) { const f = evaluatedCase(); change(f); assert.throws(() => summarizeKingDiscardCase(f.result, f.input, f.configuration)); }
});

test('partial king discard worlds produce no rankings and failed or drifted receipts cannot pass', () => {
  const f = evaluatedCase(); f.result.status = 'incomplete'; f.result.samplingComplete = false; f.result.rows.pop();
  assert.deepEqual(summarizeKingDiscardCase(f.result, f.input, f.configuration).streams, []);
  const good = { build: { status: 'passed' }, invocation: { status: 'passed' }, sourceUnchanged: true,
    study: { version: 'trix-king-discard-1.0.0', status: 'completed', cases: [{ status: 'completed', samplingComplete: true }, { status: 'completed', samplingComplete: true }] } };
  assert.equal(assessKingDiscardRun(good), 'passed');
  for (const bad of [{ ...good, sourceUnchanged: false }, { ...good, invocation: { status: 'failed' } }, { ...good, study: { ...good.study, cases: [f.result] } }]) assert.equal(assessKingDiscardRun(bad), 'pending-unverified');
});


test('king discard keeps Basic and Complex full objectives separate and reports uncertainty from outcomes', () => {
  const basic = evaluatedCase('basic-partners'), complex = evaluatedCase();
  for (let i = 8; i < 16; i++) for (const profile of complex.result.rows[i].profiles) {
    const index = profile.roots.findIndex(r => r.candidateId === 'play:HK');
    profile.roots[index] = finish('play:HK', 'complex-partners', false);
  }
  const bs = summarizeKingDiscardCase(basic.result, basic.input, basic.configuration);
  const cs = summarizeKingDiscardCase(complex.result, complex.input, complex.configuration);
  const hk = cs.streams[0].comparisons.find(r => r.profileId === 'all-baseline' && r.candidateId === 'play:HK')!;
  assert.deepEqual(hk.firstTrickCaptorCounts, [0, 0, 8, 8]);
  assert.equal(hk.opposingCaptures, 8); assert.equal(hk.meanDeltaVsReference, 112.5);
  assert.equal(hk.minimumDelta, 0); assert.equal(hk.maximumDelta, 225);
  assert.equal(hk.equal, 8); assert.equal(hk.better, 8);
  assert.equal(bs.streams[0].comparisons.find(r => r.candidateId === 'play:HK')!.meanTeamPoints, 75);
  assert.equal(cs.streams[1].comparisons.find(r => r.candidateId === 'play:HK')!.meanTeamPoints, 65);
  const report = reportKingDiscard([bs, cs]);
  assert.match(report, /HK − CA/); assert.match(report, /Current South choice/);
  assert.match(report, /First-trick captors South\/West\/North\/East/);
  assert.match(report, /8 \/ 16/); assert.match(report, /first-trick captor counts/);
});

test('king discard source receipts bind the frozen archive and exact source graph', () => {
  const before = { 'server/main.go': 'a'.repeat(64) };
  // Source graph hashing is the same retained-build contract used by the operator.
  const source = createHash('sha256').update(JSON.stringify(Object.entries(before))).digest('hex');
  const receipt = { status: 'passed', sourceUnchanged: true,
    studyDigest: 'cdf334d3a1f1f7aa257421cadaab1404d15a7414f73d44c7ddb2b3382267edf1',
    sourceDigest: source, finalSourceDigest: source, binaryDigest: 'b'.repeat(64) };
  verifyKingDiscardReceipt(receipt, before, { ...before });
  const changes = [
    { status: 'failed' }, { sourceUnchanged: false }, { studyDigest: 'c'.repeat(64) },
    { sourceDigest: 'c'.repeat(64), finalSourceDigest: 'c'.repeat(64) },
    { finalSourceDigest: 'c'.repeat(64) }, { binaryDigest: null },
  ];
  for (const change of changes) assert.throws(() => verifyKingDiscardReceipt({ ...receipt, ...change }, before, before));
  assert.throws(() => verifyKingDiscardReceipt(receipt, before, { ...before, 'server/main.go': 'c'.repeat(64) }));
});
