import assert from 'node:assert/strict';
import test from 'node:test';
import { assessKingScenarioRun, summarizeKingScenarioStudy, validateKingScenarioRun } from '../../scripts/coach-lab-king-scenarios.mjs';

const variants = ['basic-solo', 'complex-solo', 'basic-partners', 'complex-partners'];
const profiles = ['trix-deterministic-1.0.0', 'trix-ownership-comparison-1.0.0'];
const arms = ['natural-all-declarations', 'controlled-HK-double', 'controlled-decline'];
type Action = { kind: string; card: string; cards: string[]; request: string };
type Recipient = { kind: string; seat?: number; competitor?: string };
type Entry = { component: string; card?: string; delta: number; recipient: Recipient; leadSourceRef?: string };
type Trick = { number: number; leader: number; winner: number; plays: { seat: number; card: string }[] };
const id = (a: Action) => a.kind === 'choose-request' ? `choose:${a.request}` : a.kind === 'declare-doubles' ? `doubles:${a.cards.join(',')}` : `play:${a.card}`;

// Synthetic native-shaped report: test admission/accounting, not game strategy.
// Native tests separately replay legal authored deals and literal scoring.
function runFixture(variant = variants[0], profileId = profiles[0], arm = arms[1], witnessId?: string) {
  const partners = variant.endsWith('-partners'), complex = variant.startsWith('complex');
  const doubled = arm === arms[1];
  const competitor = (seat: number) => partners ? seat % 2 === 0 ? 'NS' : 'EW' : `seat-${seat}`;
  const ids = partners ? ['NS', 'EW'] : ['seat-0', 'seat-1', 'seat-2', 'seat-3'];
  const cards = ['C', 'D', 'H', 'S'].flatMap(s => ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map(r => s + r));
  const action = (kind: string, card = '', selected: string[] = []): Action => ({ kind, card, cards: selected, request: complex ? 'complex' : 'king' });
  const moves = [{ seat: 0, action: action('choose-request'), selectionSource: 'fixed-request' },
    ...[0, 3, 2, 1].map(seat => ({ seat, action: action('declare-doubles', '', doubled && seat === 0 ? ['HK'] : []), selectionSource: arm === arms[0] ? 'policy' : 'controlled-declaration' }))];
  const tricks: Trick[] = []; let leader = 0;
  for (let i = 0; i < 13; i++) {
    const plays = cards.slice(i * 4, i * 4 + 4).map((card, j) => ({ seat: (leader + 3 * j) % 4, card }));
    const winner = plays.filter(p => p.card[0] === plays[0].card[0]).at(-1)!.seat;
    tricks.push({ number: i + 1, leader, winner, plays }); leader = winner;
    moves.push(...plays.map(p => ({ seat: p.seat, action: action('play-card', p.card), selectionSource: witnessId ? 'authored-witness' : 'policy' })));
  }
  const timeline = moves.map((m, i) => {
    const focal = m.seat === 0 || partners && m.seat === 2;
    return { ...m, ordinal: i + 1, legalCount: 2, legalForced: false, experimentalOverride: false,
      policySuggestedCandidateId: focal || i === 0 ? id(m.action) : '', policyCue: focal ? 'Saved policy advice' : '',
      cue: focal ? m.selectionSource === 'policy' ? 'Saved policy advice' : `Experimental action: ${m.selectionSource}` : '', facts: [] };
  });
  const kt = tricks.find(t => t.plays.some(p => p.card === 'HK'))!;
  const bonusRecipient: Recipient = partners ? { kind: 'competitor', competitor: kt.winner % 2 === 0 ? 'EW' : 'NS' } : { kind: 'seat', seat: kt.winner === 0 ? kt.leader : 0 };
  const ledger: Entry[] = [];
  for (const trick of tricks) {
    const recipient = { kind: 'seat', seat: trick.winner };
    if (complex) ledger.push({ component: 'tricks', delta: -15, recipient });
    for (const p of trick.plays) {
      if (complex && p.card.startsWith('D')) ledger.push({ component: 'diamonds', card: p.card, delta: -10, recipient });
      if (complex && p.card.endsWith('Q')) ledger.push({ component: 'queens', card: p.card, delta: -25, recipient });
      if (p.card === 'HK') ledger.push({ component: 'king', card: 'HK', delta: doubled ? -150 : -75, recipient });
    }
  }
  if (doubled) ledger.push({ component: 'double-bonus', card: 'HK', delta: 75, recipient: bonusRecipient });
  const componentTotals: Record<string, Record<string, number>> = Object.fromEntries(ids.map(c => [c, {}]));
  for (const entry of ledger) {
    const c = entry.recipient.kind === 'seat' ? competitor(entry.recipient.seat!) : entry.recipient.competitor!;
    componentTotals[c][entry.component] = (componentTotals[c][entry.component] ?? 0) + entry.delta;
  }
  const requestTotals = ids.map(c => ({ id: c, seats: partners ? c === 'NS' ? [0, 2] : [1, 3] : [Number(c.slice(5))], total: Object.values(componentTotals[c]).reduce((a, b) => a + b, 0) }));
  const actorRecords = timeline.filter(t => t.seat === 0 || partners && t.seat === 2).map(t => ({ ordinal: t.ordinal, seat: t.seat,
    observation: { seat: t.seat, variantId: variant }, executedCandidateId: id(t.action), policySuggestedCandidateId: t.policySuggestedCandidateId }));
  return { id: `${variant}/${profileId}/${arm}/${witnessId ?? 'policy'}`, variant, profileId, arm, witnessId, status: 'completed',
    pin: { gameId: 'trix', variantId: variant, moduleVersion: '2.2.0', ruleProfileId: `trix-${variant}-${partners ? '1.1.0' : '1.0.0'}`, stateSchemaVersion: '1.2.0', observationSchemaVersion: '1.2.0', publicSchemaVersion: '1.2.0', eventSchemaVersion: '1.0.0' },
    objective: partners ? 'combined-team-request-points' : 'own-request-points', objectivePoints: requestTotals[0].total, kingComponentPoints: componentTotals[ids[0]].king ?? 0,
    completedTricks: 13, tricks, requestTotals, componentTotals, ledger, withheldBonuses: [] as { bonusValue: number }[], timeline, actorRecords,
    kingCapture: { seat: kt.winner, trick: kt.number, leader: kt.leader, doubled, withheld: false, ...(doubled ? { bonusRecipient } : {}) } };
}

test('king reporting counts team bonuses once and separates king net from all Complex costs', () => {
  for (const variant of variants) for (const arm of arms) {
    const run = runFixture(variant, profiles[0], arm), summary = validateKingScenarioRun(run);
    assert.equal(summary.objectivePoints, Object.values(summary.components).reduce((a, b) => a + b, 0));
    assert.equal(summary.kingNetPoints, (summary.components.king ?? 0) + (summary.components['double-bonus'] ?? 0));
    if (variant.startsWith('complex')) assert.notEqual(summary.kingNetPoints, summary.objectivePoints);
  }
});

test('king admission retains redaction and distinguishes legal necessity from an imposed alternative', () => {
  const run = runFixture();
  const turn = run.timeline[1]; turn.policySuggestedCandidateId = 'doubles:'; turn.experimentalOverride = true;
  run.actorRecords.find(r => r.ordinal === 2)!.policySuggestedCandidateId = 'doubles:';
  assert.doesNotThrow(() => validateKingScenarioRun(run));
  assert.equal(turn.legalForced, false);
  const corrupted = structuredClone(run); corrupted.timeline[1].selectionSource = 'policy';
  assert.throws(() => validateKingScenarioRun(corrupted));
  const leaked = structuredClone(run); leaked.timeline[2].policySuggestedCandidateId = 'play:HA';
  assert.throws(() => validateKingScenarioRun(leaked));
});

test('king admission accepts native omission of empty declaration cards', () => {
  const run = runFixture('basic-solo', profiles[0], arms[2]);
  for (const turn of run.timeline.slice(1, 5)) delete (turn.action as Partial<Action>).cards;
  assert.doesNotThrow(() => validateKingScenarioRun(run));
});

test('king admission rejects corrupted scores, missing focal evidence, altered tricks and incomplete runs', () => {
  const changes: ((run: ReturnType<typeof runFixture>) => void)[] = [
    r => { r.status = 'incomplete'; }, r => { r.requestTotals[0].total++; }, r => { r.objectivePoints++; },
    r => { r.componentTotals.NS.king = -999; }, r => { r.kingCapture.seat = (r.kingCapture.seat + 1) % 4; },
    r => { r.ledger.find(e => e.component === 'double-bonus')!.recipient = { kind: 'competitor', competitor: r.kingCapture.seat % 2 === 0 ? 'NS' : 'EW' }; },
    r => { r.actorRecords.pop(); }, r => { r.timeline[5].legalForced = true; }, r => { r.tricks[1].leader = (r.tricks[1].leader + 1) % 4; },
  ];
  for (const change of changes) { const run = runFixture('complex-partners'); change(run); assert.throws(() => validateKingScenarioRun(run)); }
});

function studyFixture() {
  const witnesses = [{ id: 'escape', expectedKingCaptor: runFixture().kingCapture.seat }];
  const corpus = { fixtures: [{ id: 'authored', patternId: 'six-hearts', witnesses }] };
  const runs = variants.flatMap(variant => [
    ...profiles.flatMap(profile => arms.map(arm => runFixture(variant, profile, arm))),
    runFixture(variant, profiles[0], arms[1], 'escape'),
  ]);
  const study = { schemaVersion: 'trix-king-scenario-study-1.0.0', status: 'completed', cases: [{ id: 'authored', patternId: 'six-hearts', runs }], work: { runs: runs.length, steps: runs.length * 57 } };
  return { corpus, study };
}

test('king summary requires every variant, profile, declaration arm and authored witness exactly once', () => {
  const { study, corpus } = studyFixture(), summary = summarizeKingScenarioStudy(study, corpus);
  assert.equal(summary.runs, 28); assert.equal(summary.steps, 1596); assert.equal(summary.cases[0].comparisons.length, 8);
  assert.equal(summary.cases[0].witnesses.length, 4); assert.equal(summary.strengthClaim, false); assert.equal(summary.promotionEligible, false);
  for (const change of [
    (s: typeof study) => { s.cases[0].runs.pop(); },
    (s: typeof study) => { s.cases[0].runs.push(s.cases[0].runs[0]); },
    (s: typeof study) => { s.work.steps--; },
    (s: typeof study) => { s.cases[0].runs[0].arm = arms[1]; },
  ]) { const changed = structuredClone(study); change(changed); assert.throws(() => summarizeKingScenarioStudy(changed, corpus)); }
});

test('king study cannot pass with failed, timed out or changed-source receipts', () => {
  const run = { build: { status: 'passed' }, invocation: { status: 'passed' }, sourceUnchanged: true, study: { schemaVersion: 'trix-king-scenario-study-1.0.0', status: 'completed' } };
  assert.equal(assessKingScenarioRun(run), 'passed');
  for (const failed of [
    { ...run, build: { status: 'failed' } }, { ...run, invocation: { status: 'timed-out' } },
    { ...run, sourceUnchanged: false }, { ...run, study: { ...run.study, status: 'incomplete' } },
  ]) assert.equal(assessKingScenarioRun(failed), 'pending-unverified');
});
