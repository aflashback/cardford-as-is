// Retrospective deterministic audit; never chooses or submits a browser move.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createGame, apply, collectTrick, actionId } from '../../../web/server/game/index.ts';
import { observe, assertObservation } from '../../../web/server/observations/index.ts';
import { analyzeDecision } from '../../../web/server/strategy/index.ts';
import { explain } from '../../../web/server/coaching/templates.ts';
import { checkSpadesClaims } from '../../../web/server/games/spades/evaluation/claims/check.ts';
import { verifyHand } from './verify-hand.mjs';

const directory = fileURLToPath(new URL('./', import.meta.url));
const read = name => JSON.parse(readFileSync(directory + name, 'utf8'));
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const persisted = value => JSON.parse(JSON.stringify(value));
// --check computes and validates the current snapshot without replacing any derived files.
const checking = process.argv.includes('--check');
const write = (name, value) => { if (!checking) writeFileSync(directory + name, value); };
const modes = ['spades-solo', 'spades-partners'], arms = ['baseline', 'candidate'];
const caseIds = ['CASE-01', 'CASE-02', 'CASE-03', 'CASE-04'];
const zeroRoles = () => ({ human: 0, bot: 0 });
const roleOf = row => row.seat === 0 ? 'human' : 'bot';
function claimTotals(rows, field) {
  const totals = { decisions: rows.length, inputClaims: 0, confirmed: 0, false: 0, notCheckable: 0, legacyWithoutTypedClaims: 0, byPredicate: {} };
  for (const row of rows) {
    const result = row[field];
    totals.inputClaims += result.results.length;
    totals.confirmed += result.checked; totals.false += result.falseClaims.length; totals.notCheckable += result.notCheckable;
    if (field === 'cueClaimChecks' ? row.advice.claims === undefined : !row.originalAnalysis.reasons.some(reason => reason.claims !== undefined)) totals.legacyWithoutTypedClaims++;
    for (const [predicate, count] of Object.entries(result.byPredicate)) {
      const tally = totals.byPredicate[predicate] ??= { confirmed: 0, false: 0, notCheckable: 0 };
      tally.confirmed += count.checked; tally.false += count.false; tally.notCheckable += count.notCheckable;
    }
  }
  assert.equal(totals.inputClaims, totals.confirmed + totals.false + totals.notCheckable, 'Every typed claim retains a verdict');
  return totals;
}
export function summarizeDecisions(rows) {
  const counts = { decisions: rows.length, roles: zeroRoles(), forced: zeroRoles(), severalReasonable: zeroRoles(), shadowDisagreements: zeroRoles() };
  for (const row of rows) {
    const role = roleOf(row); counts.roles[role]++;
    if (row.forced) counts.forced[role]++;
    if (row.advice.outcome === 'several-reasonable') counts.severalReasonable[role]++;
    if (row.shadow.disagreement) counts.shadowDisagreements[role]++;
  }
  return { ...counts, cueClaimChecks: claimTotals(rows, 'cueClaimChecks'), reasonClaimChecks: claimTotals(rows, 'reasonClaimChecks'),
    cases: Object.fromEntries(caseIds.map(id => {
      const original = rows.filter(row => row.matchedCases.includes(id)), shadow = rows.filter(row => row.shadow.candidateCases.includes(id));
      return [id, { original: original.length, shadow: shadow.length,
        originalByRole: { human: original.filter(row => row.seat === 0).length, bot: original.filter(row => row.seat !== 0).length },
        shadowByRole: { human: shadow.filter(row => row.seat === 0).length, bot: shadow.filter(row => row.seat !== 0).length } }];
    })) };
}
export function summarizeTransports(rows) {
  return { attempts: rows.length, validTransport: rows.filter(row => row.validTransport === true).length,
    invalidTransport: rows.filter(row => row.validTransport !== true).length, accepted: rows.filter(row => row.accepted === true).length,
    rejected: rows.filter(row => row.accepted === false).length, acceptanceUnavailable: rows.filter(row => typeof row.accepted !== 'boolean').length,
    timedOut: rows.filter(row => row.timedOut).length, toolEventAttempts: rows.filter(row => row.toolEvents > 0).length };
}
export function summarizeFormatRecoveries(rows) {
  const recovered = rows.filter(row => row.formatRecovery);
  return { recordedCommittedChoices: rows.length, verifiedCompleteChoices: rows.filter(row => row.verifiedComplete).length,
    formatRevalidatedCommittedChoices: recovered.length, verifiedCompleteRecoveries: recovered.filter(row => row.verifiedComplete).length,
    incompleteHandRecoveries: recovered.filter(row => !row.verifiedComplete).length,
    reusedRecoveryChoices: recovered.filter(row => row.source === 'reused-identical-packet').length,
    reusedAcrossArms: recovered.filter(row => row.reusedAcrossArms).length,
    uniqueRevalidationFilesUsed: new Set(recovered.map(row => row.formatRecovery)).size,
    originalRejectedAttemptsUsed: new Set(recovered.map(row => row.originalTransportFile)).size };
}
export function pairedScores(hands) {
  return [...new Set(hands.map(hand => hand.scenarioId))].map(scenarioId => {
    const baseline = hands.find(hand => hand.scenarioId === scenarioId && hand.arm === 'baseline');
    const candidate = hands.find(hand => hand.scenarioId === scenarioId && hand.arm === 'candidate');
    const complete = baseline?.status === 'complete' && candidate?.status === 'complete';
    return { scenarioId, mode: baseline?.mode ?? candidate?.mode, baselineRun: baseline?.id, candidateRun: candidate?.id,
      status: complete ? 'complete' : 'incomplete-pair', baselineStatus: baseline?.status ?? 'not-started', candidateStatus: candidate?.status ?? 'not-started',
      candidateMinusBaseline: complete ? { southPoints: candidate.points[0] - baseline.points[0], southMargin: candidate.marginForSouth - baseline.marginForSouth,
        competitorPoints: candidate.contracts.map((contract, index) => ({ seats: contract.seats, points: contract.points - baseline.contracts[index].points })) } : null };
  });
}
export function factualClaimFailures(rows) {
  return rows.flatMap((row, index) => ['cueClaimChecks', 'reasonClaimChecks'].flatMap(source => row[source].results
    .filter(result => result.verdict === 'false').map(result => ({ runId: row.runId, mode: row.mode, arm: row.arm, decisionId: row.id, seat: row.seat,
      source: source === 'cueClaimChecks' ? 'original-cue' : 'original-analysis-reason', claim: result.claim, reason: result.reason,
      evidence: { file: 'baseline-decisions.jsonl', line: index + 1 } }))));
}
function recordedFiles(folder) {
  return existsSync(directory + folder) ? readdirSync(directory + folder).filter(name => name.endsWith('.json')).sort().map(name => `${folder}/${name}`) : [];
}
const manifest = read('manifest.json'), catalog = read('dev-deals.json');
assert.equal(sha(catalog), manifest.catalogHash);
const sessions = existsSync(directory + 'sessions.json') ? read('sessions.json').sessions : [];
assert.ok(sessions.length <= 20);
for (const mode of ['spades-solo', 'spades-partners']) assert.ok(sessions.filter(s => s.mode === mode).length <= 10);
const packets = [], decisions = [], hands = [], playerChoices = [];
for (const run of manifest.runs) {
  if (!existsSync(directory + `runs/${run.id}.json`)) { hands.push({ ...run, status: 'not-started' }); continue; }
  const record = read(`runs/${run.id}.json`);
  for (const [index, choice] of (record.playerDecisions ?? []).entries()) {
    assert.ok(Number.isInteger(choice.acceptedRevision) && choice.acceptedRevision > choice.before.revision, 'Recorded player choice must have committed');
    const row = { runId: run.id, mode: run.mode, arm: run.arm, index: choice.index ?? index + 1, decisionId: choice.before.decisionId,
      source: choice.source, verifiedComplete: record.status === 'complete', acceptedRevision: choice.acceptedRevision,
      formatRecovery: choice.formatRecovery ?? null, originalTransportFile: choice.transportFile ?? null,
      evidence: { run: `runs/${run.id}.json`, playerDecisionIndex: index } };
    if (choice.formatRecovery) {
      const recovery = read(choice.formatRecovery), original = read(recovery.original);
      assert.equal(recovery.original, choice.transportFile); assert.equal(recovery.originalAccepted, false);
      assert.equal(original.accepted, false); assert.equal(original.validTransport, true);
      assert.equal(recovery.promptHash, original.promptHash); assert.equal(recovery.packetHash, choice.packetHash);
      assert.equal(original.packetHash, choice.packetHash); assert.equal(actionId(recovery.action), actionId(choice.action));
      assert.ok(choice.packet.legalActions.includes(actionId(choice.action)), 'Recovered action must match the exact legal packet');
      row.originalRunId = original.runId; row.originalArm = manifest.runs.find(source => source.id === original.runId)?.arm ?? null;
      row.reusedAcrossArms = choice.source === 'reused-identical-packet' && row.originalArm !== null && row.originalArm !== run.arm;
      row.recorderVersion = recovery.recorderVersion;
    }
    playerChoices.push(row);
  }
  if (record.status !== 'complete') { hands.push({ ...run, status: record.status, gameId: record.gameId,
    recordedPlayerDecisions: record.playerDecisions?.length ?? 0, terminalRecorded: !!record.terminal,
    evidence: { run: `runs/${run.id}.json`, privateAudit: record.privateAudit?.file ?? null } }); continue; }
  const audit = read(record.privateAudit.file);
  verifyHand(run, audit, record, catalog);
  assert.equal(sha(audit), record.privateAudit.hash);
  assert.equal(audit.reasoningPolicy.policyVersion, run.policy);
  assert.equal(audit.openingScenario.metadata.id, run.scenarioId);
  const bots = Object.values(audit.botDecisionAudits).sort((a, b) => a.revision - b.revision);
  assert.equal(bots.length, 42); assert.equal(audit.humanDecisions.length, 14); assert.equal(record.playerDecisions.length, 14);
  let state = createGame({ id: audit.gameId, mode: run.mode, dealer: audit.openingScenario.dealer }, audit.deals[0]);
  let humanIndex = 0, botIndex = 0, actionCount = 0, forced = 0;
  const caseCounts = {}, shadowDisagreements = [], playerSources = { luna: 0, 'reused-identical-packet': 0, forced: 0 };
  for (const entry of audit.actions) {
    if (entry.kind === 'collect') { state = collectTrick(state); continue; }
    assert.equal(entry.kind, 'action', 'Single-hand baseline has no next-hand action');
    const action = entry.action, seat = state.turn, obs = observe(state, seat);
    assertObservation(obs); assert.equal(action.seat, seat);
    assert.ok(obs.legalActions.some(a => actionId(a) === actionId(action)));
    const isHuman = seat === 0;
    const saved = isHuman ? audit.humanDecisions[humanIndex] : bots[botIndex];
    const id = isHuman ? saved.id : saved.decisionId;
    assert.deepEqual(saved.observation, obs);
    const analysis = isHuman ? audit.decisionAnalyses[id].analysis : saved.analysis;
    assert.equal(analysis.policyVersion, run.policy);
    const originalAdvice = isHuman ? audit.decisionAnalyses[id].adviceSnapshot : explain(obs, analysis);
    if (isHuman) {
      const choice = record.playerDecisions[humanIndex++];
      assert.equal(choice.before.decisionId, id); assert.equal(actionId(choice.action), actionId(action));
      assert.equal(choice.dom.enabled, true); assert.equal(choice.dom.revision, choice.before.revision);
      assert.equal(saved.assisted, false); playerSources[choice.source]++;
      assert.deepEqual(originalAdvice, persisted(explain(obs, analysis)), 'Original saved advice drifted');
    } else {
      botIndex++;
      assert.equal(saved.originalAnalysis, 'available'); assert.equal(saved.policyVersion, run.policy);
      assert.deepEqual(saved.action, action); assert.deepEqual(analysis.action, action);
      assert.equal(saved.revision, Number(id.split(':').at(-1)));
    }
    if (obs.legalActions.length === 1) { forced++; assert.equal(analysis.provenance, 'forced'); }
    const baseline = analyzeDecision(obs, 'spades-tactics-2.1.0'), candidate = analyzeDecision(obs, 'spades-cases-4.0.0');
    const actualRecomputed = run.arm === 'baseline' ? baseline : candidate;
    assert.deepEqual(analysis, persisted(actualRecomputed), 'Stored original analysis differs from frozen implementation');
    const matched = (analysis.trace?.scenarioChecks ?? []).filter(c => c.id.startsWith('CASE-') && c.result === 'matched').map(c => c.id);
    for (const id of matched) caseCounts[id] = (caseCounts[id] ?? 0) + 1;
    const different = actionId(baseline.action) !== actionId(candidate.action);
    if (different) shadowDisagreements.push({ decisionId: id, seat, old: actionId(baseline.action), candidate: actionId(candidate.action) });
    const claims = originalAdvice.claims ?? [];
    const cueClaims = checkSpadesClaims(state, seat, claims, { bound: 256 });
    const reasonsClaims = checkSpadesClaims(state, seat, analysis.reasons.flatMap(r => r.claims ?? []), { bound: 256 });
    const row = { id, runId: run.id, mode: run.mode, arm: run.arm, seat, forced: obs.legalActions.length === 1,
      role: isHuman ? 'Luna browser player' : 'runtime bot', actualAction: action, policyVersion: run.policy,
      originalAnalysis: analysis, advice: originalAdvice, adviceOrigin: isHuman ? 'original-saved-human-advice' : 'retrospective-render-of-original-bot-analysis', matchedCases: matched,
      shadow: { observationHash: sha(obs), baselineAction: baseline.action, candidateAction: candidate.action, disagreement: different, candidateCases: (candidate.trace?.scenarioChecks ?? []).filter(c => c.id.startsWith('CASE-') && c.result === 'matched').map(c => c.id) },
      cueClaimChecks: cueClaims, reasonClaimChecks: reasonsClaims };
    decisions.push(row);
    packets.push({ schemaVersion: 'seat-evaluation-packet-1.0.0', id, runId: run.id, observationHash: sha(obs), observation: obs });
    state = apply(state, action); actionCount++;
  }
  assert.equal(actionCount, 56); assert.deepEqual(state, audit.state); assert.equal(state.history.length, 13);
  assert.equal(record.terminal.stats.helped, 0); assert.equal(record.terminal.stats.suggestions, 0);
  const competitors = run.mode === 'spades-solo' ? [[0], [1], [2], [3]] : [[0, 2], [1, 3]];
  const contracts = competitors.map(seats => {
    const positive = seats.filter(s => state.bids[s] > 0), bid = positive.reduce((sum, s) => sum + state.bids[s], 0), tricks = positive.reduce((sum, s) => sum + state.tricks[s], 0);
    return { seats, bid, creditedTricks: tricks, made: bid > 0 ? tricks >= bid : null, nil: seats.filter(s => state.bids[s] === 0).map(seat => ({ seat, made: state.tricks[seat] === 0 })), points: state.handResult.points[seats[0]], bags: state.bags[seats[0]] };
  });
  const margin = run.mode === 'spades-partners' ? state.scores[0] - state.scores[1] : state.scores[0] - (state.scores[1] + state.scores[2] + state.scores[3]) / 3;
  hands.push({ ...run, status: 'complete', gameId: audit.gameId, bids: state.bids, tricks: state.tricks, points: state.handResult.points, marginForSouth: margin, contracts, acceptedActions: actionCount, forcedActions: forced, playerSources, caseCounts, shadowDisagreements,
    evidence: { run: `runs/${run.id}.json`, privateAudit: record.privateAudit.file } });
}
write('seat-packets.jsonl', packets.map(value => JSON.stringify(value)).join('\n') + (packets.length ? '\n' : ''));
write('baseline-decisions.jsonl', decisions.map(value => JSON.stringify(value)).join('\n') + (decisions.length ? '\n' : ''));
const unreadableEvidence = [], transports = [], observerJobs = [];
for (const file of recordedFiles('transport')) {
  try {
    const row = read(file); if (!['player', 'observer'].includes(row.role)) continue;
    transports.push({ file, role: row.role, runId: row.runId, stage: row.stage ?? null, validTransport: row.validTransport,
      accepted: row.accepted, rejection: row.rejection ?? null, timedOut: row.metadata?.timedOut === true, toolEvents: row.metadata?.toolEvents?.length ?? 0 });
  } catch (error) { unreadableEvidence.push({ file, error: error.message }); }
}
for (const file of recordedFiles('observer-jobs')) {
  try { const row = read(file); observerJobs.push({ file, runId: row.runId, stage: row.stage }); }
  catch (error) { unreadableEvidence.push({ file, error: error.message }); }
}
const observer = { queuedPackets: observerJobs.length, ...summarizeTransports(transports.filter(row => row.role === 'observer')),
  awaitingResponse: observerJobs.filter(job => !transports.some(row => row.role === 'observer' && row.runId === job.runId && row.stage === job.stage)).length,
  publicCheckpoints: summarizeTransports(transports.filter(row => row.role === 'observer' && row.stage !== 'retrospective')),
  retrospective: summarizeTransports(transports.filter(row => row.role === 'observer' && row.stage === 'retrospective')) };
const summary = summarizeDecisions(decisions);
const groups = modes.flatMap(mode => arms.map(arm => {
  const selected = hands.filter(hand => hand.mode === mode && hand.arm === arm), rows = decisions.filter(row => row.mode === mode && row.arm === arm);
  const runIds = new Set(selected.map(hand => hand.id));
  return { mode, arm, plannedHands: selected.length, recordedHands: selected.filter(hand => hand.status !== 'not-started').length,
    completeHands: selected.filter(hand => hand.status === 'complete').length,
    incompleteHands: selected.filter(hand => !['not-started', 'complete'].includes(hand.status)).length,
    recordedIncompletePlayerDecisions: selected.filter(hand => hand.status !== 'complete').reduce((sum, hand) => sum + (hand.recordedPlayerDecisions ?? 0), 0),
    sessionsCreated: sessions.filter(session => session.mode === mode && session.arm === arm).length,
    bootstrapSessions: sessions.filter(session => session.mode === mode && session.arm === arm && session.role === 'bootstrap').length,
    ...summarizeDecisions(rows), formatRevalidations: summarizeFormatRecoveries(playerChoices.filter(row => row.mode === mode && row.arm === arm)),
    observer: summarizeTransports(transports.filter(row => row.role === 'observer' && runIds.has(row.runId))) };
}));
const pairs = pairedScores(hands);
const pairedByMode = modes.map(mode => {
  const selected = pairs.filter(pair => pair.mode === mode), complete = selected.filter(pair => pair.status === 'complete');
  return { mode, plannedPairs: selected.length, completePairs: complete.length,
    meanCandidateMinusBaselineSouthPoints: complete.length ? complete.reduce((sum, pair) => sum + pair.candidateMinusBaseline.southPoints, 0) / complete.length : null,
    meanCandidateMinusBaselineSouthMargin: complete.length ? complete.reduce((sum, pair) => sum + pair.candidateMinusBaseline.southMargin, 0) / complete.length : null };
});
const factualFailures = factualClaimFailures(decisions);
assert.equal(factualFailures.length, summary.cueClaimChecks.false + summary.reasonClaimChecks.false);
const recoveryFiles = recordedFiles('revalidations');
const formatRevalidations = { ...summarizeFormatRecoveries(playerChoices), recordedRevalidationFiles: recoveryFiles.length,
  files: recoveryFiles, committedChoices: playerChoices.filter(row => row.formatRecovery) };
const report = { schemaVersion: 'browser-audit-1.0.0', source: 'real-browser-against-runtime-bots', jevCalls: 0, sessionsCreated: sessions.length,
  sessionsPerMode: Object.fromEntries(['spades-solo', 'spades-partners'].map(mode => [mode, sessions.filter(s => s.mode === mode).length])), measuredComplete: hands.filter(h => h.status === 'complete').length,
  replayedDecisions: decisions.length, ...summary, groups, pairs, pairedByMode, factualFailures, formatRevalidations,
  analysisComparison: { representation: 'JSON-persisted', originalEvidenceModified: false,
    normalization: 'Fresh recomputed analysis/advice passes through JSON stringify/parse: negative zero becomes zero, undefined object fields are omitted, undefined array entries become null. Stored original evidence is compared as read.' },
  transport: { player: summarizeTransports(transports.filter(row => row.role === 'player')), observer, unreadableEvidence, files: transports },
  evidence: { manifest: 'manifest.json', sessions: 'sessions.json', sourceReplay: 'source-audit.json', caseLedger: 'case-ledger.md', publicViews: 'public/',
    observerJobs: observerJobs.map(job => job.file), decisions: 'baseline-decisions.jsonl', packets: 'seat-packets.jsonl', codeSnapshot: 'code-snapshot.json' }, hands };
write('audit.json', JSON.stringify(report, null, 2) + '\n');
const rows = hands.map(h => h.status === 'complete' ? `| ${h.id} | ${h.bids.join('/')} | ${h.tricks.join('/')} | ${h.points.join('/')} | ${h.marginForSouth.toFixed(1)} |` : `| ${h.id} | ${h.status} | — | — | — |`).join('\n');
const roles = count => `${count.human}/${count.bot}`;
const verdicts = count => `${count.confirmed}/${count.false}/${count.notCheckable}`;
const denominators = groups.map(group => `| ${group.mode} / ${group.arm} | ${group.completeHands}/${group.plannedHands} | ${roles(group.roles)} | ${roles(group.forced)} | ${roles(group.severalReasonable)} |`).join('\n');
const claims = groups.map(group => `| ${group.mode} / ${group.arm} | ${verdicts(group.cueClaimChecks)} / ${group.cueClaimChecks.inputClaims} | ${verdicts(group.reasonClaimChecks)} / ${group.reasonClaimChecks.inputClaims} |`).join('\n');
const cases = groups.map(group => `| ${group.mode} / ${group.arm} | ${caseIds.map(id => `${group.cases[id].original}/${group.cases[id].shadow}`).join(' | ')} |`).join('\n');
const scorePairs = pairs.map(pair => `| ${pair.scenarioId} | ${pair.status} | ${pair.candidateMinusBaseline?.southPoints ?? '—'} | ${pair.candidateMinusBaseline ? pair.candidateMinusBaseline.southMargin.toFixed(1) : '—'} |`).join('\n');
const meanPairs = pairedByMode.map(group => `${group.mode}: ${group.completePairs}/${group.plannedPairs} complete pairs; mean point difference ${group.meanCandidateMinusBaselineSouthPoints?.toFixed(1) ?? '—'}, mean margin difference ${group.meanCandidateMinusBaselineSouthMargin?.toFixed(1) ?? '—'}`).join('; ');
const failures = factualFailures.length ? `**${factualFailures.length} false factual claims retained.** Full claims and checker reasons are in [audit.json](audit.json) and their referenced decision lines.\n\n${factualFailures.slice(0, 8).map(failure => `- ${failure.runId}, ${failure.decisionId}, seat ${failure.seat}: ${failure.source} / ${failure.claim.predicate} / ${failure.reason} ([decision line ${failure.evidence.line}](baseline-decisions.jsonl)).`).join('\n')}${factualFailures.length > 8 ? '\n- Further failures are retained in audit.json.' : ''}` : 'No false typed claims found in the replayed decisions.';
const playerTransport = report.transport.player;
write('results.md', `# Browser baseline

${report.measuredComplete}/${manifest.runs.length} measured hands verified complete; ${sessions.length} created sessions. Seat order: South / West / North / East. South is the Luna browser player; other seats are programmed bots. Partial records remain listed below; their decisions and scores are excluded from verified aggregates.

| Run | Bids | Tricks | Points | South margin |
|---|---|---|---|---|
${rows}

## Coverage and factual checks

Human/bot counts include every replayed bid and card decision, including forced moves. Several-reasonable counts are outcomes of the original cue. C/F/U means confirmed / false / unresolved; the final number is input typed claims. Untyped wording is not validated by these counts.

Cues comprise original saved South advice and retrospective rendering from original bot analyses; bot cues were not issued during play.

Original evidence remains unchanged. Fresh analysis/advice is compared in JSON's persisted form (negative zero becomes zero; undefined object fields are omitted and undefined array entries become null).

| Mode / arm | Complete / planned hands | Decisions H/B | Forced H/B | Several-reasonable H/B |
|---|---|---|---|---|
${denominators}

| Mode / arm | Original cue C/F/U / inputs | Original analysis reason C/F/U / inputs |
|---|---|---|
${claims}

${summary.cueClaimChecks.legacyWithoutTypedClaims}/${decisions.length} cue records and ${summary.reasonClaimChecks.legacyWithoutTypedClaims}/${decisions.length} analysis records carry no typed claim fields. The independent checker uses a bound of 256; unresolved claims remain unresolved. ${failures}

| Mode / arm | CASE-01 O/S | CASE-02 O/S | CASE-03 O/S | CASE-04 O/S |
|---|---|---|---|---|
${cases}

O is the stored original analysis; S is the candidate recomputed on the same seat observation, an offline shadow diagnostic. Baseline originals do not emit CASE identifiers. Counts use the decision denominators above; role splits and per-predicate verdicts are in [audit.json](audit.json). A zero count stays a miss; no added games fill it.

## Descriptive paired outcomes

| Fixed pair | Status | Candidate minus baseline South points | Candidate minus baseline South margin |
|---|---|---|---|
${scorePairs}

${meanPairs}. Incomplete pairs have no difference or mean contribution. Solo margin is South minus the mean of the other three scores; Partners margin is the South/North team minus the other team, counted once.

## Agent and source evidence

- Recorded player attempts: ${playerTransport.attempts}; valid transport ${playerTransport.validTransport}, accepted ${playerTransport.accepted}, rejected ${playerTransport.rejected}. Forced choices and identical-packet reuse need no new model attempt.
- Format-revalidated committed choices: **${formatRevalidations.formatRevalidatedCommittedChoices}**, including ${formatRevalidations.reusedRecoveryChoices} identical-packet reuses (${formatRevalidations.reusedAcrossArms} across arms); ${formatRevalidations.verifiedCompleteRecoveries} in verified complete hands and ${formatRevalidations.incompleteHandRecoveries} recorded in incomplete hands. These use ${formatRevalidations.originalRejectedAttemptsUsed} original rejected attempts through ${formatRevalidations.uniqueRevalidationFilesUsed} recovery files. Original rejection records remain unchanged in the raw attempt counts. [Revalidation records](revalidations/) and audit.json retain each committed choice's original transport, source run/arm, and recovery pointer. ${formatRevalidations.recordedRevalidationFiles} revalidation files exist; an uncommitted recovery file is not counted as a committed choice.
- Observer packets queued ${observer.queuedPackets}; responses ${observer.attempts}, valid transport ${observer.validTransport}, accepted ${observer.accepted}, rejected ${observer.rejected}, awaiting response ${observer.awaitingResponse}. Accepted public checkpoints ${observer.publicCheckpoints.accepted}; accepted retrospective reviews ${observer.retrospective.accepted}. Unreadable agent evidence files: ${unreadableEvidence.length}, retained and flagged in audit.json.
- Observer judgments are agent evidence, not expert labels or factual-checker verdicts. They are never feedback to the player. Exact prompts/responses and rejections: [transport](transport/); captured observer inputs: [observer jobs](observer-jobs/).
- Jev calls: **0**. Runtime bots use deterministic code. Research agents use the configured model in [transport configuration](transport/config.json); its exact backend snapshot is not independently exposed.
- Raw browser hands: [runs](runs/), [public views](public/), [private replay](private/). Source links and case coverage: [case ledger](case-ledger.md), [source replay](source-audit.json), [frozen manifest](manifest.json), [code snapshot](code-snapshot.json).
- [Seat packets](seat-packets.jsonl) are future evaluation inputs; send one seat packet per model call. [Baseline decisions](baseline-decisions.jsonl) are separate evaluation targets and must not enter a decision-model prompt.

These three authored pairs per mode describe table behavior with all three bots changed. They are familiar development deals, not held-out evidence, a representative win-rate estimate, or proof of stronger play. Original claims, shadow diagnostics, and observer judgments remain separate.

The candidate composes plan 3.0, which retains the 2.1 action order. CASE-01 adds a conditional preference; the other new cases refine proofs and cues. Matching actions or scores on a pair do not establish strategic strength.
`);
const compactClaims = ({ inputClaims, confirmed, false: falseClaims, notCheckable, legacyWithoutTypedClaims }) => ({ inputClaims, confirmed, false: falseClaims, notCheckable, legacyWithoutTypedClaims });
console.log(JSON.stringify({ checking, complete: report.measuredComplete, decisions: decisions.length, sessions: sessions.length,
  cueClaimChecks: compactClaims(summary.cueClaimChecks), reasonClaimChecks: compactClaims(summary.reasonClaimChecks), factualFailures: factualFailures.length,
  cases: report.cases, pairedByMode, observer, formatRevalidations: summarizeFormatRecoveries(playerChoices) }));
if (factualFailures.length > 0 || unreadableEvidence.length > 0) process.exitCode = 1;
