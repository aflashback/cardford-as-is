import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { forcedRationalePolicyVersion, forcedRationalePolicySourceHash, validateForcedRationaleProposal, validateForcedRationaleEnvelope, importForcedRationaleHostReview, wrapForcedRationaleApis, verifyForcedRationaleRecovery, importRecoveredForcedRationaleReview } from '../../scripts/trix-scenario-collection/forced-rationale-policy.mjs';
import { validateDecisionProposal, importHostReview } from '../../scripts/trix-scenario-collection/review.mjs';
import { validateSavedContent, verifyPriorHost } from '../../scripts/trix-scenario-collection/review-worker.mjs';
import { wrapReferenceDriverApis } from '../../scripts/trix-scenario-collection/reference-envelope.mjs';
import { validateHostReviewEnvelope, importNormalizedHostReview } from '../../scripts/trix-scenario-collection/review-envelope.mjs';
import { describeAppServerContext, playerBaseInstructions, playerDeveloperInstructions } from '../../scripts/trix-scenario-collection/app-server-bridge.mjs';
import { projectPlayerPacket } from '../../scripts/trix-scenario-collection/contracts.mjs';
import { exportRawGame } from '../../scripts/trix-scenario-collection/raw-export.mjs';
import { seededDeck } from '../../scripts/trix-scenario-collection/runner.mjs';
import { preserveBuild, sourceDigest } from '../../scripts/coach-lab-builds.mjs';
import { appendEvent, getBlob, jsonBytes, putBlob, readJournal, safePath, sha, writeImmutable } from '../../scripts/trix-scenario-collection/journal.mjs';

const plan = JSON.parse(readFileSync(resolve('planning/implementation/coach-lab/trix-scenario-collection/campaign.plan.json'), 'utf8'));
const policyFile = 'scripts/trix-scenario-collection/forced-rationale-policy.mjs';
const at = n => new Date(Date.parse('2026-10-11T17:00:00Z') + n * 10).toISOString();
const grades = ['adequate', 'incomplete-explanation', 'unsupported-claim', 'incorrect-fact', 'uncertain', 'forced'];

function fixture(t, { forced = true, grade = 'incorrect-fact', attempts = 1, authorize = true, mutate = (_raw, _job) => {} } = {}) {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'forced-rationale-test-'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  const worker = join(root, 'synthetic-native.exe'); writeFileSync(worker, 'Synthetic worker bytes; never launched.');
  const binaryDigest = sha(readFileSync(worker)), policyHashes = { [policyFile]: forcedRationalePolicySourceHash };
  const processingAudit = { originalSourceDigest: 'a'.repeat(64), nativeBinaryDigest: binaryDigest, reviewSourceDigest: sourceDigest(policyHashes) };
  const manifest = { schemaVersion: 'trix-scenario-run-1.0.0', runId: 'forced-policy-synthetic', corpusId: plan.corpusId, mode: 'fixture', plan, planHash: sha(jsonBytes(plan)), build: { sourceDigest: processingAudit.originalSourceDigest, binaryDigest } };
  writeImmutable(join(root, 'manifest.json'), jsonBytes(manifest)); appendEvent(root, 'initialized', {});
  const cards = seededDeck('forced-policy-synthetic'), totals = [0, 1, 2, 3].map(actor => ({ id: `seat-${actor}`, seats: [actor], total: 0 }));
  function player(revision, count = 1) {
    const actor = revision % 4, card = cards[revision], pin = { ...plan.pins, variantId: 'basic-solo', ruleProfileId: plan.phases[0].ruleProfileId };
    const hand = count === 1 ? [card] : [card, cards[(revision + 1) % cards.length]], handCounts = [1, 1, 1, 1]; handCounts[actor] = hand.length;
    const nativePacket = { publicSchemaVersion: '1.2.0', gameId: 'trix', variantId: 'basic-solo', seat: actor, phase: 'playing', observation: { id: 'synthetic-game', gameId: 'trix', variantId: 'basic-solo', seat: actor, phase: 'playing', turn: actor, kingdom: 1, dealNumber: 1, owner: 3, request: 'king', remainingRequests: [], hand, handCounts, trick: [], tricks: [], declarations: [], board: ['C', 'D', 'H', 'S'].map(suit => ({ suit, low: 0, high: 0 })), finishOrder: [], passes: [], ledger: [], withheldBonuses: [], lastExternalLeader: [null, null, null, null], totals, requestTotals: totals, kingdomTotals: totals, winners: [], layoutHistory: { version: '1.0.0', status: 'available', turns: [] } }, candidates: hand.map(card => ({ id: `play:${card}`, public: { kind: 'play-card', card } })) };
    const packet = projectPlayerPacket(nativePacket, pin, revision, `synthetic-player-${revision}`, { name: 'Synthetic Trix', description: 'Synthetic schema fixture.', text: 'Native rules are authoritative.', objective: 'own-request-points' });
    const packetRef = putBlob(root, packet), response = { card: packet.legalOptions[0].card, reasoning: `Original synthetic forced rationale ${revision}.`, confidence: 23 };
    const rawRef = putBlob(root, jsonBytes(response)), receiptRef = putBlob(root, { hostAgentId: 'synthetic-player-context', responseHash: rawRef.sha256 });
    const savedRef = putBlob(root, { response, rawRef, receiptRef, candidateId: `play:${card}`, admission: { admitted: true }, job: { packetRef, nativePacketRef: putBlob(root, nativePacket), actor, revision, phase: 'playing', pin, parentThreadId: null } });
    const commit = { decisionId: `synthetic-game:${revision}:${actor}`, episodeId: 'synthetic-game', variant: 'basic-solo', request: 'king', revision, actor, phase: 'playing', forced: count === 1, selectedCandidateId: `play:${card}`, responseHash: rawRef.sha256, receiptHash: receiptRef.sha256, savedRef };
    return { packet, packetRef, commit };
  }
  const first = player(0, forced ? 1 : 2), prompt = Buffer.from('Synthetic independent review ' + JSON.stringify(first.packet));
  const job = { id: 'synthetic-forced-review', stage: 'decision', subjectId: first.commit.decisionId, decisionId: first.commit.decisionId, selectedCandidateId: first.commit.selectedCandidateId, packetRef: first.packetRef, packetHash: first.packetRef.sha256, commitRef: putBlob(root, first.commit), proofEvidenceRefs: [], promptRef: putBlob(root, prompt), promptHash: sha(prompt) };
  const raw = { decisionId: job.decisionId, packetHash: job.packetHash, reviewVersion: 'trix-luna-review-1.0.0', provenance: 'llm-proposal', rationaleStatus: grade,
    checks: ['facts', 'objective', 'material-alternatives', 'tactical-purpose', 'uncertainty'].map(id => ({ id, status: 'issue', explanation: 'Original synthetic critique remains verbatim.', evidenceRefs: ['actor:/ownHand/0'] })),
    categoryIds: ['HK'], explanationIssues: [{ description: 'Original factual criticism.', evidenceRefs: ['actor:/ownHand/0'] }], hypotheses: [], missedOpportunity: null, limitations: ['Synthetic fixture; no model calls.'] };
  mutate(raw, job); writeImmutable(join(root, `outbox/${job.id}.json`), jsonBytes(job));
  const state = { commits: [first.commit], reviews: [], outcomes: [] }, transports = [], receipts = [], claims = [], raws = [];
  let inventory;
  function invocation(proposal, index) {
    const transport = { jobId: randomUUID(), dispatchToken: randomUUID(), promptHash: job.promptHash, promptRef: job.promptRef, claimedAt: at(-100), deadlineAt: at(30000) };
    // Exactly 300 seconds including setup; independent host IDs per attempt.
    transport.deadlineAt = new Date(Date.parse(transport.claimedAt) + 300000).toISOString();
    const threadId = randomUUID(), turnId = randomUUID(), bytes = Buffer.from(JSON.stringify(proposal, null, 2) + '\n');
    const directory = join(root, 'private/invocations', transport.jobId), app = join(directory, 'private/app-server'); mkdirSync(app, { recursive: true }); putBlob(directory, prompt);
    const cfg = { model: 'gpt-6-luna', config: { model_reasoning_effort: 'max', web_search: 'disabled' }, allowProviderModelFallback: false, baseInstructions: playerBaseInstructions, developerInstructions: playerDeveloperInstructions, approvalPolicy: 'never', sandbox: 'read-only', cwd: 'C:/Windows/Temp', dynamicTools: [], environments: [], runtimeWorkspaceRoots: [], selectedCapabilityRoots: [] };
    const thread = { model: 'gpt-6-luna', reasoningEffort: 'max', runtimeWorkspaceRoots: [], thread: { id: threadId, parentThreadId: null, forkedFromId: null, turns: [], environments: [] } };
    const rows = [
      ['session_meta', { id: threadId, base_instructions: { text: playerBaseInstructions } }], ['event_msg', { type: 'task_started', turn_id: turnId }],
      ['response_item', { type: 'message', role: 'developer', content: [{ type: 'input_text', text: playerDeveloperInstructions }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['generic.developer_instructions'] } }],
      ['turn_context', { turn_id: turnId, root_turn_id: turnId, model: 'gpt-6-luna', effort: 'max', cwd: cfg.cwd }],
      ['response_item', { id: 'raw-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt.toString() }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['user.text'] } }],
      ['response_item', { id: 'raw-final', type: 'message', role: 'assistant', phase: 'final', content: [{ type: 'output_text', text: bytes.toString() }] }],
      ['event_msg', { type: 'task_complete', turn_id: turnId, last_agent_message: bytes.toString() }],
    ];
    const hostBytes = Buffer.from(rows.map(([type, payload], ordinal) => JSON.stringify({ ordinal, timestamp: at(ordinal), type, payload }) + '\n').join(''));
    inventory = { schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: [describeAppServerContext(hostBytes, prompt).digest] };
    const input = [{ type: 'text', text: prompt.toString(), text_elements: [] }];
    const frames = [['outbound', { id: 1, method: 'initialize', params: {} }], ['inbound', { id: 1, result: {} }], ['outbound', { method: 'initialized', params: {} }],
      ['outbound', { id: 2, method: 'model/list', params: {} }], ['inbound', { id: 2, result: { data: [{ model: 'gpt-6-luna', supportedReasoningEfforts: [{ reasoningEffort: 'max' }] }] } }],
      ['outbound', { id: 3, method: 'thread/start', params: cfg }], ['inbound', { id: 3, result: thread }],
      ['outbound', { id: 4, method: 'turn/start', params: { threadId, model: 'gpt-6-luna', effort: 'max', input, additionalContext: {}, environments: [], runtimeWorkspaceRoots: [] } }], ['inbound', { id: 4, result: { turn: { id: turnId } } }],
      ['inbound', { method: 'turn/started', params: { threadId, turn: { id: turnId } } }], ['inbound', { method: 'item/completed', params: { threadId, turnId, item: { id: 'typed-user', type: 'userMessage', content: input } } }],
      ['inbound', { method: 'item/completed', params: { threadId, turnId, item: { id: 'typed-final', type: 'agentMessage', phase: 'final', text: bytes.toString() } } }],
      ['inbound', { method: 'rawResponseItem/completed', params: { threadId, turnId, item: rows[5][1] } }], ['inbound', { method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed', error: null } } }],
      ['outbound', { id: 5, method: 'thread/archive', params: { threadId } }], ['inbound', { id: 5, result: {} }]];
    let previousHash = '0'.repeat(64); const wire = frames.map(([direction, frame], i) => { const b = Buffer.from(JSON.stringify(frame) + '\n'), body = { sequence: i + 1, at: at(i), direction, bytesBase64: b.toString('base64'), bytesHash: sha(b), previousHash }; const row = { ...body, hash: sha(jsonBytes(body)) }; previousHash = row.hash; return row; });
    writeFileSync(join(directory, 'host-base-context-admission.json'), jsonBytes(inventory)); writeFileSync(join(app, 'job.json'), jsonBytes(transport)); writeFileSync(join(app, 'host-session.jsonl'), hostBytes); writeFileSync(join(app, 'wire.jsonl'), Buffer.concat(wire.map(jsonBytes)));
    writeFileSync(join(app, 'stopped.json'), jsonBytes({ stoppedVerified: true, error: null, wireFrames: wire.length, wireDigest: previousHash }));
    const receipt = { schemaVersion: 'trix-host-receipt-1.0.0', jobId: transport.jobId, dispatchToken: transport.dispatchToken, promptHash: job.promptHash, responseHash: sha(bytes), hostAgentId: threadId, requestedModel: 'gpt-6-luna', requestedEffort: 'max', reportedModelId: 'gpt-6-luna', startedAt: at(7), finishedAt: at(13), dispatchStatus: 'completed', usage: null };
    writeFileSync(join(directory, 'response.txt'), bytes); writeFileSync(join(directory, 'receipt.json'), jsonBytes(receipt));
    claims.push(appendEvent(root, 'review-dispatch-claimed', { reviewId: job.id, stage: 'decision', job: transport })); appendEvent(root, 'review-attempt-settled', { jobId: transport.jobId, status: 'rejected', reason: 'Synthetic forced-grade mismatch' });
    transports.push(transport); receipts.push(receipt); raws.push(proposal);
    return { transport, bytes, receipt };
  }
  for (let i = 0; i < attempts; i++) invocation(structuredClone(raw), i);
  function authorization() {
    preserveBuild(root, resolve('.'), policyHashes, { sourceDigest: processingAudit.reviewSourceDigest, binaryDigest }, worker);
    const boundary = readJournal(root).at(-1), recovery = { schemaVersion: 'trix-forced-rationale-recovery-1.0.0', policyVersion: forcedRationalePolicyVersion, policySourceHash: forcedRationalePolicySourceHash,
      sourceHashes: policyHashes, processingBuild: { sourceDigest: processingAudit.reviewSourceDigest, binaryDigest }, originalSourceDigest: processingAudit.originalSourceDigest, nativeBinaryDigest: binaryDigest,
      previousBoundary: { sequence: boundary.sequence, hash: boundary.hash } };
    const recoveryHash = sha(jsonBytes(recovery)), recoveryPath = `private/forced-rationale-recovery/${recoveryHash}.json`; writeImmutable(safePath(root, recoveryPath), jsonBytes(recovery)); appendEvent(root, 'forced-rationale-recovery-authorized', { recoveryHash, recoveryPath });
  }
  if (authorize) authorization();
  const collector = { root, manifest, state: () => ({ ...state, rows: readJournal(root), paused: readJournal(root).some(row => row.kind === 'pause'), reviews: [...state.reviews, ...readJournal(root).filter(row => row.kind === 'review-imported').map(row => row.data)] }) };
  const api = { validateDecisionProposal, validateSavedContent, validateHostReviewEnvelope, importNormalizedHostReview, importHostReview, verifyPriorHost: (c, claim) => verifyPriorHost(c, claim, inventory) };
  const baseReferenceApi = wrapReferenceDriverApis(api, { processingAudit }), wrapped = wrapForcedRationaleApis(baseReferenceApi, { processingAudit });
  const response = i => ({ bytes: readFileSync(join(root, 'private/invocations', transports[i].jobId, 'response.txt')), receipt: receipts[i], transport: transports[i] });
  return { root, collector, state, packet: first.packet, commit: first.commit, job, raw, processingAudit, transports, receipts, claims, raws, player, cards, totals, api, baseReferenceApi, wrapped, invocation, authorization, response,
    check: (i = 0, options = {}) => { const r = response(i); return validateForcedRationaleEnvelope(collector, job, r.transport, r.bytes, r.receipt, { processingAudit, ...options }); },
    import: (i = 0, options = {}) => { const r = response(i); return importForcedRationaleHostReview(collector, job, r.transport, r.bytes, r.receipt, { processingAudit, ...options }); } };
}

for (const grade of grades) test(`native forcedness preserves the original ${grade} rationale grade`, t => {
  const f = fixture(t, { grade });
  if (grade !== 'forced') assert.throws(() => validateDecisionProposal(f.raw, f.job, f.packet), /Forced rationale status mismatch/);
  assert.deepEqual(validateForcedRationaleProposal(f.raw, f.job, f.packet), f.raw);
  const checked = f.check(), imported = f.import(); assert.deepEqual(getBlob(f.root, imported.originalRef), f.raw); assert.deepEqual(getBlob(f.root, imported.reviewRef), f.raw);
  if (grade !== 'forced') { assert.equal(checked.rationalePolicy.validationProjection.validationOnly, true); assert.ok(imported.rationalePolicyRef); assert.equal(getBlob(f.root, imported.rationalePolicyRef).acceptedRationaleStatus, grade); }
  else assert.equal(imported.rationalePolicyRef, undefined);
  assert.deepEqual(f.import(), imported);
});

for (const mode of ['missing-grade', 'unknown-grade', 'forced-missed-opportunity', 'wrong-decision', 'wrong-reference', 'duplicate-checks', 'extra-schema-field']) test(`forced policy does not repair ${mode}`, t => {
  const f = fixture(t, { mutate(raw, job) {
    if (mode === 'missing-grade') delete raw.rationaleStatus;
    if (mode === 'unknown-grade') raw.rationaleStatus = 'perfect';
    if (mode === 'forced-missed-opportunity') raw.missedOpportunity = { alternativeCandidateId: job.selectedCandidateId, objective: 'own-request-points', advantage: 10, proofKind: 'information-set-exhaustive', proofRef: { path: 'blobs/' + '0'.repeat(64), sha256: '0'.repeat(64) }, actorEvidenceRefs: ['actor:/ownHand/0'], correction: 'No actual alternative.' };
    if (mode === 'wrong-decision') raw.decisionId = 'other'; if (mode === 'wrong-reference') raw.checks[0].evidenceRefs = ['actor:/hiddenHands'];
    if (mode === 'duplicate-checks') raw.checks[0].id = 'objective'; if (mode === 'extra-schema-field') raw.invented = true;
  } });
  assert.throws(() => f.check()); assert.throws(() => f.import()); assert.equal(f.collector.state().reviews.length, 0);
});

test('nonforced decisions retain the historical forced-label prohibition and unchanged quality validation', t => {
  const f = fixture(t, { forced: false, grade: 'forced' }); assert.throws(() => f.check(), /Forced rationale status mismatch/);
  const quality = fixture(t, { forced: false, grade: 'uncertain' }); assert.deepEqual(quality.check().accepted, quality.raw); assert.equal(quality.import().rationalePolicyRef, undefined);
});

test('policy import requires frozen authorization and rechecks an operator pause under its lock', t => {
  const unauthorized = fixture(t, { authorize: false }); unauthorized.check(); assert.throws(() => unauthorized.import(), /authorization/);
  const paused = fixture(t); paused.check(); appendEvent(paused.root, 'pause', { reason: 'operator-request' }); assert.throws(() => paused.import(), /later pause/);
});

test('ordinary, copied packetHash and copied reference wrapper imports all retain the policy receipt and raw grade', t => {
  for (const mode of ['ordinary', 'packet', 'reference']) {
    const f = fixture(t, { mutate(raw) { if (mode === 'packet') raw.packetHash = 'a'.repeat(63); if (mode === 'reference') raw.checks[0].evidenceRefs = ['actor:/publicPhaseAndTurn/handCounts']; } });
    const r = f.response(0), options = { processingAudit: f.processingAudit, validateDecision: f.wrapped.validateDecisionProposal };
    const normalized = f.wrapped.validateSavedContent(f.collector, f.job, r.transport, r.bytes, r.receipt, options, f.wrapped);
    const imported = normalized ? f.wrapped.importNormalizedHostReview(f.collector, f.job, r.transport, r.bytes, r.receipt, options) : f.wrapped.importHostReview(f.collector, f.job, r.transport, r.bytes, r.receipt);
    assert.ok(imported.rationalePolicyRef); assert.deepEqual(getBlob(f.root, imported.originalRef), f.raw); assert.equal(getBlob(f.root, imported.reviewRef).rationaleStatus, f.raw.rationaleStatus);
    assert.equal(Boolean(imported.metadataNormalizationRef), mode !== 'ordinary');
  }
});

test('recovery chooses the earliest policy-valid saved quality review and rechecks both hosts before import', t => {
  const f = fixture(t, { attempts: 2 }); let inspected = [];
  const api = { ...f.baseReferenceApi, verifyPriorHost(c, claim) { inspected.push(claim.data.job.jobId); return f.api.verifyPriorHost(c, claim); } };
  const selected = verifyForcedRationaleRecovery(f.collector, f.job.id, { processingAudit: f.processingAudit, api });
  assert.equal(selected.transport.jobId, f.transports[0].jobId); assert.deepEqual(inspected, f.transports.map(job => job.jobId)); assert.deepEqual(selected.proof.earlierRejected, []);
  const imported = importRecoveredForcedRationaleReview(f.collector, selected, { processingAudit: f.processingAudit, api }); assert.deepEqual(getBlob(f.root, imported.originalRef), f.raws[0]);
  assert.equal(readJournal(f.root).filter(row => row.kind === 'review-dispatch-claimed').length, 2);
});

test('recovery blocks later selection when an earlier saved review is already valid under the original forced label', t => {
  const f = fixture(t, { grade: 'forced', attempts: 2 }); assert.throws(() => verifyForcedRationaleRecovery(f.collector, f.job.id, { processingAudit: f.processingAudit, api: f.baseReferenceApi }), /ordinary reconciliation/);
});

for (const target of [0, 1]) test(`a trust failure in historical host ${target + 1} aborts forced recovery`, t => {
  const f = fixture(t, { attempts: 2 }); writeFileSync(join(f.root, 'private/invocations', f.transports[target].jobId, 'response.txt'), 'Corrupt saved bytes');
  assert.throws(() => verifyForcedRationaleRecovery(f.collector, f.job.id, { processingAudit: f.processingAudit, api: f.baseReferenceApi })); assert.equal(f.collector.state().reviews.length, 0);
});

function completeGame(f) {
  for (let revision = 1; revision < 52; revision++) {
    const { packet, packetRef, commit } = f.player(revision); f.state.commits.push(commit);
    const review = { ...structuredClone(f.raw), decisionId: commit.decisionId, packetHash: packetRef.sha256, rationaleStatus: 'forced' };
    f.state.reviews.push({ stage: 'decision', subjectId: commit.decisionId, reviewRef: putBlob(f.root, review), originalRef: putBlob(f.root, review), reviewerReceiptRef: putBlob(f.root, { contextMode: 'independent-review', responseHash: sha(jsonBytes(review)) }) });
  }
  const accepted = f.state.commits.map(commit => getBlob(f.root, f.collector.state().reviews.find(row => row.subjectId === commit.decisionId).reviewRef));
  const native = { status: 'completed', completedTricks: 13, acceptedPlays: 52, nativeTerminalPhase: 'round-complete', scoreTotals: f.totals, componentTotals: {}, ledger: [], withheldBonuses: [], tricks: Array.from({ length: 13 }, (_, i) => ({ number: i + 1, leader: 0, winner: 0, plays: f.cards.slice(i * 4, i * 4 + 4).map((card, seat) => ({ seat, card })) })) };
  const counts = Object.fromEntries(grades.map(grade => [grade, accepted.filter(review => review.rationaleStatus === grade).length]));
  const game = { episodeId: 'synthetic-game', reviewVersion: 'trix-luna-game-review-1.0.0', provenance: 'llm-proposal', complete: true, quality: 'insufficient-evidence', summary: 'Synthetic retrospective.', seatSummaries: [0, 1, 2, 3].map(actor => ({ actor, summary: 'Synthetic fixture.', reviewedDecisions: 13, uncertainty: ['Fixture only.'], correctionDecisionIds: [] })), nativeTotals: { scoreTotals: f.totals, componentTotals: {} }, supportedMissedOpportunityRefs: [], explanationIssueCounts: counts, usefulPatternRefs: [], counterexampleRefs: [], limitations: ['Synthetic only.'] };
  f.state.reviews.push({ stage: 'game', subjectId: 'synthetic-game', reviewRef: putBlob(f.root, { ...game, frozenDecisionReviewDigest: sha(jsonBytes(accepted)) }), originalRef: putBlob(f.root, game), reviewerReceiptRef: putBlob(f.root, { contextMode: 'independent-review', responseHash: sha(jsonBytes(game)) }) });
  f.state.outcomes.push({ episodeId: 'synthetic-game', variant: 'basic-solo', request: 'king', outcomeRef: putBlob(f.root, native) });
}

test('raw export keeps native forcedness separate from an authenticated original factual-quality grade', t => {
  const f = fixture(t); const imported = f.import(); completeGame(f);
  const first = exportRawGame(f.collector, 'synthetic-game', { processingAudit: f.processingAudit });
  const rows = readFileSync(join(f.root, first.directory, 'decisions.jsonl'), 'utf8').trimEnd().split('\n').map(JSON.parse);
  assert.equal(rows.length, 52); assert.equal(rows[0].forced, true); assert.equal(rows[0].acceptedDecisionReview.rationaleStatus, 'incorrect-fact');
  assert.deepEqual(rows[0].acceptedDecisionReview, f.raw); assert.deepEqual(rows[0].sourceRefs.rationalePolicyRef, imported.rationalePolicyRef);
  assert.equal(rows[0].originalResponse.reasoning, 'Original synthetic forced rationale 0.'); assert.equal(rows[0].originalResponse.confidence, 23);
  assert.deepEqual(exportRawGame(f.collector, 'synthetic-game', { processingAudit: f.processingAudit }), first);
});

for (const mode of ['missing-policy', 'changed-policy', 'missing-authorization', 'changed-review-source']) test(`raw export rejects ${mode} instead of relaxing the legacy assertion`, t => {
  const f = fixture(t), imported = f.import(); completeGame(f);
  if (mode === 'missing-policy') { const state = f.collector.state.bind(f.collector); f.collector.state = () => ({ ...state(), reviews: state().reviews.map(row => row.subjectId === imported.subjectId ? { ...row, rationalePolicyRef: undefined } : row) }); }
  if (mode === 'changed-policy' || mode === 'changed-review-source') { const policy = getBlob(f.root, imported.rationalePolicyRef); const changed = putBlob(f.root, { ...policy, [mode === 'changed-policy' ? 'acceptedRationaleStatus' : 'reviewSourceDigest']: mode === 'changed-policy' ? 'adequate' : '0'.repeat(64) }); const state = f.collector.state.bind(f.collector); f.collector.state = () => ({ ...state(), reviews: state().reviews.map(row => row.subjectId === imported.subjectId ? { ...row, rationalePolicyRef: changed } : row) }); }
  if (mode === 'missing-authorization') { const path = join(f.root, 'private/journal.jsonl'), rows = readJournal(f.root), auth = rows.find(row => row.kind === 'forced-rationale-recovery-authorized'); const record = JSON.parse(readFileSync(safePath(f.root, auth.data.recoveryPath), 'utf8')); record.policyVersion = 'unapproved'; writeFileSync(safePath(f.root, auth.data.recoveryPath), jsonBytes(record)); }
  assert.throws(() => exportRawGame(f.collector, 'synthetic-game', { processingAudit: f.processingAudit })); assert.equal(existsSync(join(f.root, 'raw-games/synthetic-game/source-manifest.json')), false);
});
