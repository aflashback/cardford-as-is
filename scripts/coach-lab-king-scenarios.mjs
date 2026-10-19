// CFL-12: finite authored scenario families; the native selector sees Observe only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { collectSourceHashes } from './coach-lab.mjs';
import { preserveBuild, sourceDigest } from './coach-lab-builds.mjs';
import { runBoundedNative } from './bounded-native-run.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const privateRoot = resolve(root, '.local/evaluation/coach-lab/king-scenario-work');
const fixturePath = 'server/internal/games/trix/testdata/king-scenarios.json';
const variants = ['basic-solo', 'complex-solo', 'basic-partners', 'complex-partners'];
const profiles = ['trix-deterministic-1.0.0', 'trix-ownership-comparison-1.0.0'];
const arms = ['natural-all-declarations', 'controlled-HK-double', 'controlled-decline'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const ownId = variant => variant.endsWith('-partners') ? 'NS' : 'seat-0';
const competitor = (variant, seat) => variant.endsWith('-partners') ? seat % 2 === 0 ? 'NS' : 'EW' : `seat-${seat}`;
const actionId = a => a.kind === 'play-card' ? `play:${a.card}` : a.kind === 'choose-request' ? `choose:${a.request}` : `doubles:${(a.cards ?? []).join(',')}`;

export function validateKingScenarioRun(run) {
  assert.equal(run.status, 'completed', 'Incomplete request cannot enter paired results');
  assert.ok(variants.includes(run.variant) && profiles.includes(run.profileId) && arms.includes(run.arm));
  const partners = run.variant.endsWith('-partners'), mine = ownId(run.variant);
  assert.deepEqual(run.pin, { gameId: 'trix', variantId: run.variant, moduleVersion: '2.2.0', ruleProfileId: `trix-${run.variant}-${partners ? '1.1.0' : '1.0.0'}`, stateSchemaVersion: '1.2.0', observationSchemaVersion: '1.2.0', publicSchemaVersion: '1.2.0', eventSchemaVersion: '1.0.0' });
  assert.equal(run.objective, partners ? 'combined-team-request-points' : 'own-request-points');
  assert.equal(run.completedTricks, 13); assert.equal(run.timeline.length, 57);
  const plays = [], declared = new Set();
  run.timeline.forEach((turn, i) => {
    assert.equal(turn.ordinal, i + 1); assert.ok(Number.isInteger(turn.seat) && turn.seat >= 0 && turn.seat < 4);
    assert.ok(Number.isInteger(turn.legalCount) && turn.legalCount >= 1); assert.equal(turn.legalForced, turn.legalCount === 1);
    const focal = turn.seat === 0 || partners && turn.seat === 2;
    assert.equal(typeof turn.experimentalOverride, 'boolean');
    if (focal || i === 0) assert.equal(turn.experimentalOverride, actionId(turn.action) !== turn.policySuggestedCandidateId);
    else { assert.equal(turn.policySuggestedCandidateId, ''); assert.equal(turn.cue, ''); assert.equal(turn.policyCue, ''); assert.deepEqual(turn.facts, []); }
    assert.ok(['policy', 'fixed-request', 'controlled-declaration', 'authored-witness'].includes(turn.selectionSource));
    if (turn.selectionSource === 'policy') assert.equal(turn.experimentalOverride, false);
    else { if (focal) assert.match(turn.cue, /^Experimental action:/); assert.deepEqual(turn.facts, []); }
    if (i === 0) { assert.equal(turn.selectionSource, 'fixed-request'); assert.equal(turn.action.kind, 'choose-request'); assert.equal(turn.action.request, run.variant.startsWith('basic') ? 'king' : 'complex'); }
    else if (i < 5) {
      assert.equal(turn.action.kind, 'declare-doubles');
      assert.equal(turn.selectionSource, run.arm === 'natural-all-declarations' ? 'policy' : 'controlled-declaration');
      for (const card of turn.action.cards ?? []) { assert.ok(!declared.has(card)); declared.add(card); }
      if (run.arm !== 'natural-all-declarations') assert.deepEqual(turn.action.cards ?? [], run.arm === 'controlled-HK-double' && turn.seat === 0 ? ['HK'] : []);
    } else { assert.equal(turn.action.kind, 'play-card'); assert.ok(turn.selectionSource === 'policy' || run.witnessId && turn.selectionSource === 'authored-witness'); plays.push(turn); }
  });
  assert.deepEqual([...run.timeline.slice(1, 5).map(t => t.seat)].sort(), [0, 1, 2, 3]);
  assert.equal(new Set(plays.map(t => t.action.card)).size, 52, 'All cards must be played once');
  for (const turn of plays) assert.match(turn.action.card, /^[CDHS](?:[2-9]|10|J|Q|K|A)$/);
  assert.equal(run.kingCapture.doubled, declared.has('HK'));
  assert.ok(run.kingCapture.seat >= 0 && run.kingCapture.seat <= 3);
  assert.ok(run.kingCapture.trick >= 1 && run.kingCapture.trick <= 13);
  assert.equal(run.tricks.length, 13);
  for (const [i, trick] of run.tricks.entries()) {
    assert.equal(trick.number, i + 1); assert.equal(trick.plays.length, 4);
    assert.deepEqual(trick.plays, plays.slice(i * 4, i * 4 + 4).map(t => ({ seat: t.seat, card: t.action.card })));
    assert.equal(trick.leader, trick.plays[0].seat);
    if (i > 0) assert.equal(trick.leader, run.tricks[i - 1].winner);
    const led = trick.plays[0].card[0], rank = card => ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(card.slice(1));
    const winner = trick.plays.filter(p => p.card[0] === led).reduce((a, b) => rank(a.card) > rank(b.card) ? a : b).seat;
    assert.equal(trick.winner, winner);
    for (let j = 1; j < 4; j++) assert.equal(trick.plays[j].seat, (trick.plays[j - 1].seat + 3) % 4);
    if (trick.plays.some(p => p.card === 'HK')) { assert.equal(run.kingCapture.seat, winner); assert.equal(run.kingCapture.trick, trick.number); assert.equal(run.kingCapture.leader, trick.leader); }
  }

  const ids = partners ? ['NS', 'EW'] : ['seat-0', 'seat-1', 'seat-2', 'seat-3'];
  assert.deepEqual(run.requestTotals.map(t => t.id), ids);
  const components = Object.fromEntries(ids.map(id => [id, {}]));
  let kingNetPoints = 0;
  for (const entry of run.ledger) {
    assert.ok(Number.isInteger(entry.delta));
    const recipient = entry.recipient;
    assert.ok(['seat', 'competitor'].includes(recipient.kind));
    if (recipient.kind === 'seat') assert.ok(Number.isInteger(recipient.seat) && recipient.seat >= 0 && recipient.seat < 4);
    else assert.ok(partners, 'Solo cannot receive a team bonus');
    const id = recipient.kind === 'seat' ? competitor(run.variant, recipient.seat) : recipient.competitor;
    assert.ok(ids.includes(id));
    components[id][entry.component] = (components[id][entry.component] ?? 0) + entry.delta;
    if (id === mine && entry.card === 'HK') kingNetPoints += entry.delta;
  }
  assert.deepEqual(run.componentTotals, components, 'Saved component totals must match the native ledger');
  for (const total of run.requestTotals) {
    assert.deepEqual(total.seats, partners ? total.id === 'NS' ? [0, 2] : [1, 3] : [Number(total.id.slice(5))]);
    assert.equal(total.total, Object.values(components[total.id]).reduce((a, b) => a + b, 0));
  }
  assert.equal(run.objectivePoints, run.requestTotals.find(t => t.id === mine).total);
  assert.equal(run.kingComponentPoints, components[mine].king ?? 0);
  const king = run.ledger.filter(e => e.card === 'HK' && e.component === 'king');
  assert.equal(king.length, 1); assert.equal(king[0].delta, run.kingCapture.doubled ? -150 : -75);
  assert.equal(king[0].recipient.kind, 'seat'); assert.equal(king[0].recipient.seat, run.kingCapture.seat);
  const bonus = run.ledger.filter(e => e.card === 'HK' && e.component === 'double-bonus');
  assert.equal(bonus.length, run.kingCapture.doubled && !run.kingCapture.withheld ? 1 : 0);
  if (bonus.length) {
    assert.equal(bonus[0].delta, 75); assert.deepEqual(run.kingCapture.bonusRecipient, bonus[0].recipient);
    assert.equal(run.kingCapture.leadSourceRef ?? '', bonus[0].leadSourceRef ?? '');
    if (partners) assert.deepEqual(bonus[0].recipient, { kind: 'competitor', competitor: run.kingCapture.seat % 2 === 0 ? 'EW' : 'NS' });
  }
  const withheld = run.withheldBonuses.reduce((n, w) => n + w.bonusValue, 0);
  assert.equal(run.requestTotals.reduce((n, s) => n + s.total, 0), (run.variant.startsWith('basic') ? -75 : -500) - withheld, 'Full request scoring conservation');
  assert.deepEqual(run.actorRecords.map(r => r.ordinal), run.timeline.filter(t => t.seat === 0 || partners && t.seat === 2).map(t => t.ordinal), 'Every focal decision requires its scoped evidence');
  for (const record of run.actorRecords) {
    assert.ok(record.seat === 0 || partners && record.seat === 2);
    assert.equal(record.observation.seat, record.seat); assert.equal(record.observation.variantId, run.variant);
    const turn = run.timeline[record.ordinal - 1]; assert.equal(turn.seat, record.seat);
    assert.equal(record.executedCandidateId, actionId(turn.action)); assert.equal(record.policySuggestedCandidateId, turn.policySuggestedCandidateId);
    for (const key of ['hands', 'deck', 'fixtureDeals', 'witnesses', 'patternId']) assert.ok(!Object.hasOwn(record.observation, key));
    if (record.trace) assert.equal(record.trace.selectedCandidateId, record.policySuggestedCandidateId);
  }
  return { runId: run.id, variant: run.variant, profileId: run.profileId, arm: run.arm, witnessId: run.witnessId ?? null,
    objectivePoints: run.objectivePoints, kingNetPoints, kingPenaltyPoints: run.kingComponentPoints, kingCaptor: run.kingCapture.seat,
    doubled: run.kingCapture.doubled, kingWithheld: run.kingCapture.withheld, components: components[mine] };
}

export function summarizeKingScenarioStudy(study, corpus) {
  assert.equal(study.schemaVersion, 'trix-king-scenario-study-1.0.0'); assert.equal(study.status, 'completed');
  assert.deepEqual(study.cases.map(c => c.id), corpus.fixtures.map(f => f.id));
  const cases = []; let runs = 0, steps = 0;
  for (const [i, c] of study.cases.entries()) {
    const fixture = corpus.fixtures[i]; assert.equal(c.patternId, fixture.patternId);
    assert.equal(new Set(c.runs.map(r => r.id)).size, c.runs.length, 'Duplicate run');
    const values = c.runs.map(validateKingScenarioRun), comparisons = [], witnesses = [];
    for (const variant of variants) {
      for (const profileId of profiles) {
        const cells = values.filter(r => r.variant === variant && r.profileId === profileId && r.witnessId === null);
        assert.deepEqual(cells.map(r => r.arm).sort(), [...arms].sort(), 'Every policy arm must be present exactly once');
        const natural = cells.find(r => r.arm === arms[0]), doubled = cells.find(r => r.arm === arms[1]), declined = cells.find(r => r.arm === arms[2]);
        comparisons.push({ variant, profileId, natural, doubled, declined, doubleMinusDeclinePoints: doubled.objectivePoints - declined.objectivePoints,
          doubleMinusDeclineKingNet: doubled.kingNetPoints - declined.kingNetPoints });
      }
      const rows = values.filter(r => r.variant === variant && r.witnessId !== null);
      assert.deepEqual(rows.map(r => r.witnessId).sort(), fixture.witnesses.map(w => w.id).sort(), 'Witnesses missing or duplicated');
      for (const row of rows) { assert.equal(row.profileId, profiles[0]); assert.equal(row.arm, arms[1]); assert.equal(row.kingCaptor, fixture.witnesses.find(w => w.id === row.witnessId).expectedKingCaptor); witnesses.push(row); }
    }
    assert.equal(values.length, 24 + fixture.witnesses.length * 4, 'Unexpected extra runs');
    runs += values.length; steps += c.runs.reduce((n, r) => n + r.timeline.length, 0);
    cases.push({ id: c.id, patternId: c.patternId, comparisons, witnesses });
  }
  assert.equal(study.work.runs, runs); assert.equal(study.work.steps, steps); assert.ok(steps <= 20000);
  return { schemaVersion: 'trix-king-scenario-summary-1.0.0', status: 'passed', fixtureCount: cases.length, runs, steps, strengthClaim: false, promotionEligible: false, cases };
}

function markdown(summary) {
  const lines = ['# Protected King of Hearts scenario results', '', `${summary.fixtureCount} authored distributions; ${summary.runs} complete requests. These are grouped diagnostic examples, not a random test sample, win probability or strength validation. Witnesses prove legal feasibility only. All policy decisions use that seat\'s observation.`, ''];
  for (const variant of variants) {
    lines.push(`## ${variant}`, '', 'Points are South’s full request score in Solo, or combined South/North score in Partners. Complex includes every penalty component.', '',
      '| Fixture | Policy | Natural: double / K♥ taker / points | Double points | Decline points | Double − decline |', '| --- | --- | --- | ---: | ---: | ---: |');
    for (const c of summary.cases) for (const r of c.comparisons.filter(r => r.variant === variant)) lines.push(`| ${c.id} | ${r.profileId === profiles[0] ? 'Baseline' : 'Ownership comparison'} | ${r.natural.doubled ? 'yes' : 'no'} / seat ${r.natural.kingCaptor} / ${r.natural.objectivePoints} | ${r.doubled.objectivePoints} | ${r.declined.objectivePoints} | ${r.doubleMinusDeclinePoints} |`);
    lines.push('');
  }
  lines.push('## Witnesses and detailed evidence', '', 'summary.json keeps authored witness outcomes separate from bot-policy results, including the K♥ net component and all other score components. study.json retains scoped actor observations, policy suggestions, imposed-action labels, public play and ledger. Never send a combined multi-seat archive or fixture answers to a coach/judge as decision-time input.', '',
    'An authored line outperforming a bot run is a hypothesis to investigate. The author knows all hands, opponents may cooperate in that line, and the same actor observation can support different concealed deals. No new policy or live default is promoted.', '');
  return lines.join('\n');
}

export function assessKingScenarioRun({ build, invocation, sourceUnchanged, study }) {
  return build?.status === 'passed' && invocation?.status === 'passed' && sourceUnchanged === true && study?.schemaVersion === 'trix-king-scenario-study-1.0.0' && study.status === 'completed'
    ? 'passed' : 'pending-unverified';
}
function snapshot() {
  const hashes = collectSourceHashes();
  for (const path of ['scripts/coach-lab-king-scenarios.mjs', 'scripts/coach-lab-king-scenarios.d.mts', 'web/tests/coach-lab-king-scenarios.test.ts', 'planning/implementation/coach-lab/trix-king-scenarios.md']) hashes[path] = sha(readFileSync(resolve(root, path)));
  return hashes;
}
export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') { console.log('node scripts/coach-lab-king-scenarios.mjs --out .local/evaluation/coach-lab/king-scenario-work/UNUSED-NAME'); return; }
  assert.ok(args.length === 2 && args[0] === '--out' && args[1], 'Use --out with a new private run directory');
  const out = resolve(root, args[1]); assert.equal(dirname(out), privateRoot); assert.ok(!existsSync(out), 'Refusing to overwrite saved evidence');
  const fixtureBytes = readFileSync(resolve(root, fixturePath)), corpus = JSON.parse(fixtureBytes);
  assert.equal(corpus.schemaVersion, 'trix-king-scenarios-1.0.0');
  mkdirSync(out, { recursive: true });
  const before = snapshot(), binary = resolve(out, process.platform === 'win32' ? 'king-study.exe' : 'king-study'), output = resolve(out, 'study.json');
  const protocol = { schemaVersion: 'trix-king-scenario-protocol-1.0.0', fixtureDigest: sha(fixtureBytes), fixtures: corpus.fixtures.map(f => ({ id: f.id, patternId: f.patternId, witnesses: f.witnesses.map(w => w.id) })), variants, profiles, arms, maxSteps: 20000, buildWallMs: 300000, studyWallMs: 300000, maxStudyBytes: 256 << 20, strengthClaim: false, promotionEligible: false };
  save(resolve(out, 'protocol.json'), protocol); save(resolve(out, 'source-before.json'), before);
  let build = null, invocation = null, study = null, bundle = null, error = null;
  try {
    build = await runBoundedNative(process.execPath, ['scripts/windows-env.mjs', 'go', 'test', '-c', '-o', binary, './server/internal/games/trix'], { cwd: root, milliseconds: protocol.buildWallMs });
    writeFileSync(resolve(out, 'build.log'), build.output, { flag: 'wx' });
    if (build.status === 'passed') {
      bundle = preserveBuild(out, root, before, { sourceDigest: sourceDigest(before), binaryDigest: sha(readFileSync(binary)) }, binary);
      invocation = await runBoundedNative(bundle.binaryPath, ['-test.run=^TestKingScenarioStudy$', '-test.v', '-test.timeout=290s'], { cwd: resolve(bundle.sourceRoot, 'server/internal/games/trix'), milliseconds: protocol.studyWallMs, maxBytes: 16 << 20, env: { ...process.env, TRIX_KING_SCENARIO_OUTPUT: output } });
      writeFileSync(resolve(out, 'study.log'), invocation.output, { flag: 'wx' });
      if (existsSync(output)) { assert.ok(statSync(output).size <= protocol.maxStudyBytes, 'Study exceeded output cap'); study = JSON.parse(readFileSync(output, 'utf8')); }
    }
  } catch (e) { error = String(e); }
  const after = snapshot(), sourceUnchanged = isDeepStrictEqual(before, after); save(resolve(out, 'source-after.json'), after);
  let status = assessKingScenarioRun({ build, invocation, sourceUnchanged, study });
  try {
    if (status === 'passed') {
      assert.equal(study.fixtureDigest, protocol.fixtureDigest);
      const summary = summarizeKingScenarioStudy(study, corpus);
      save(resolve(out, 'summary.json'), summary); writeFileSync(resolve(out, 'report.md'), markdown(summary), { flag: 'wx' });
    }
  } catch (e) { error = String(e); }
  if (error) status = 'pending-unverified';
  const compact = value => value && Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'output'));
  save(resolve(out, 'invocation.json'), { schemaVersion: 'trix-king-scenario-invocation-1.0.0', status, sourceDigest: sourceDigest(before), finalSourceDigest: sourceDigest(after), sourceUnchanged, fixtureDigest: protocol.fixtureDigest, binaryDigest: existsSync(binary) ? sha(readFileSync(binary)) : null, retainedBuild: bundle, studyDigest: existsSync(output) ? sha(readFileSync(output)) : null, build: compact(build), invocation: compact(invocation), error, strengthClaim: false, promotionEligible: false });
  console.log(JSON.stringify({ output: out, status, sourceUnchanged, error })); if (status !== 'passed') process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
