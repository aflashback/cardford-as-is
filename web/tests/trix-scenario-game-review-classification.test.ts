import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { classifyGameReviewProposal, validateGameReviewEnvelope, importClassifiedGameHostReview, wrapGameReviewApis, verifyGameReviewRecovery, importRecoveredGameReview, gameReviewClassificationVersion, gameReviewClassificationSourceHash } from '../../scripts/trix-scenario-collection/game-review-classification.mjs';
import { validateGameProposal } from '../../scripts/trix-scenario-collection/review.mjs';
import { verifyPriorHost } from '../../scripts/trix-scenario-collection/review-worker.mjs';
import { describeAppServerContext, playerBaseInstructions, playerDeveloperInstructions } from '../../scripts/trix-scenario-collection/app-server-bridge.mjs';
import { forcedRationalePolicyVersion, forcedRationalePolicySourceHash } from '../../scripts/trix-scenario-collection/forced-rationale-policy.mjs';
import { projectPlayerPacket } from '../../scripts/trix-scenario-collection/contracts.mjs';
import { seededDeck } from '../../scripts/trix-scenario-collection/runner.mjs';
import { exportRawGame } from '../../scripts/trix-scenario-collection/raw-export.mjs';
import { preserveBuild, sourceDigest } from '../../scripts/coach-lab-builds.mjs';
import { appendEvent, getBlob, jsonBytes, putBlob, readJournal, safePath, sha, writeImmutable } from '../../scripts/trix-scenario-collection/journal.mjs';

const plan = JSON.parse(readFileSync(resolve('planning/implementation/coach-lab/trix-scenario-collection/campaign.plan.json'), 'utf8'));
const classifierFile = 'scripts/trix-scenario-collection/game-review-classification.mjs', forcedFile = 'scripts/trix-scenario-collection/forced-rationale-policy.mjs';
const at = index => new Date(Date.parse('2026-10-11T18:00:00Z') + index * 10).toISOString();

function fixture(t, { attempts = 1, authorize = true, ordinary = false } = {}) {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability'); mkdirSync(scratch, { recursive: true }); const root = mkdtempSync(join(scratch, 'game-classification-test-'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  const worker = join(root, 'synthetic-worker.exe'); writeFileSync(worker, 'Synthetic native bytes; never launched.'); const binaryDigest = sha(readFileSync(worker));
  const oldHashes = { [forcedFile]: forcedRationalePolicySourceHash }, hashes = { ...oldHashes, [classifierFile]: gameReviewClassificationSourceHash };
  const processingAudit = { originalSourceDigest: 'a'.repeat(64), nativeBinaryDigest: binaryDigest, reviewSourceDigest: sourceDigest(oldHashes) }, gameProcessingAudit = { ...processingAudit, reviewSourceDigest: sourceDigest(hashes) };
  const manifest = { schemaVersion: 'trix-scenario-run-1.0.0', runId: 'synthetic-game-classification', corpusId: plan.corpusId, mode: 'fixture', plan, planHash: sha(jsonBytes(plan)), build: { sourceDigest: processingAudit.originalSourceDigest, binaryDigest } };
  writeImmutable(join(root, 'manifest.json'), jsonBytes(manifest)); appendEvent(root, 'initialized', {});
  const cards = seededDeck('synthetic-game-classification'), totals = [0, 1, 2, 3].map(actor => ({ id: `seat-${actor}`, seats: [actor], total: 0 })), commits = [], reviews = [], frozen = [];
  const pin = { ...plan.pins, variantId: 'basic-solo', ruleProfileId: plan.phases[0].ruleProfileId };
  for (let revision = 0; revision < 52; revision++) {
    const actor = revision % 4, card = cards[revision], decisionId = `synthetic-game:${revision}:${actor}`;
    const nativePacket = { publicSchemaVersion: '1.2.0', gameId: 'trix', variantId: 'basic-solo', seat: actor, phase: 'playing', observation: { id: 'synthetic-game', gameId: 'trix', variantId: 'basic-solo', seat: actor, phase: 'playing', turn: actor, kingdom: 1, dealNumber: 1, owner: 3, request: 'king', remainingRequests: [], hand: [card], handCounts: [1, 1, 1, 1], trick: [], tricks: [], declarations: [], board: ['C', 'D', 'H', 'S'].map(suit => ({ suit, low: 0, high: 0 })), finishOrder: [], passes: [], ledger: [], withheldBonuses: [], lastExternalLeader: [null, null, null, null], totals, requestTotals: totals, kingdomTotals: totals, winners: [], layoutHistory: { version: '1.0.0', status: 'available', turns: [] } }, candidates: [{ id: `play:${card}`, public: { kind: 'play-card', card } }] };
    const packet = projectPlayerPacket(nativePacket, pin, revision, `synthetic-player-${revision}`, { name: 'Synthetic Trix', description: 'Fixture only.', text: 'Native rules are authoritative.', objective: 'own-request-points' });
    const packetRef = putBlob(root, packet), response = { card: packet.legalOptions[0].card, reasoning: 'Original synthetic player rationale.', confidence: 17 }, rawRef = putBlob(root, jsonBytes(response)), receiptRef = putBlob(root, { hostAgentId: 'synthetic-player-context', responseHash: rawRef.sha256 });
    const savedRef = putBlob(root, { response, rawRef, receiptRef, candidateId: `play:${card}`, admission: { admitted: true }, job: { packetRef, nativePacketRef: putBlob(root, nativePacket), actor, revision, phase: 'playing', pin, parentThreadId: null } });
    commits.push({ decisionId, episodeId: 'synthetic-game', variant: 'basic-solo', request: 'king', revision, actor, phase: 'playing', forced: true, selectedCandidateId: `play:${card}`, responseHash: rawRef.sha256, receiptHash: receiptRef.sha256, savedRef });
    const flagged = revision < 2;
    const decision = { decisionId, packetHash: packetRef.sha256, reviewVersion: 'trix-luna-review-1.0.0', provenance: 'llm-proposal', rationaleStatus: 'forced', checks: ['facts', 'objective', 'material-alternatives', 'tactical-purpose', 'uncertainty'].map(id => ({ id, status: flagged && id === 'facts' ? 'issue' : 'supported', explanation: 'Synthetic frozen explanation audit.', evidenceRefs: ['actor:/ownHand/0'] })), categoryIds: ['HK'], explanationIssues: flagged ? [{ description: 'Synthetic factual explanation issue.', evidenceRefs: ['actor:/ownHand/0'] }] : [], hypotheses: [], missedOpportunity: null, limitations: ['Synthetic only; no strategy proof.'] };
    frozen.push(decision); reviews.push({ stage: 'decision', subjectId: decisionId, reviewRef: putBlob(root, decision), originalRef: putBlob(root, decision), reviewerReceiptRef: putBlob(root, { contextMode: 'independent-review', responseHash: sha(jsonBytes(decision)) }) });
  }
  const native = { status: 'completed', acceptedPlays: 52, completedTricks: 13, nativeTerminalPhase: 'round-complete', scoreTotals: totals, componentTotals: {}, ledger: [], withheldBonuses: [], tricks: Array.from({ length: 13 }, (_, i) => ({ number: i + 1, leader: 0, winner: 0, plays: cards.slice(i * 4, i * 4 + 4).map((card, seat) => ({ seat, card })) })) };
  const outcomeRef = putBlob(root, native), prompt = Buffer.from('Synthetic whole-game review with immutable frozen decision reviews.'), promptRef = putBlob(root, prompt);
  const job = { id: 'synthetic-game-review', stage: 'game', subjectId: 'synthetic-game', episodeId: 'synthetic-game', outcomeRef, frozenDecisionReviewDigest: sha(jsonBytes(frozen)), promptRef, promptHash: promptRef.sha256 };
  writeImmutable(join(root, `outbox/${job.id}.json`), jsonBytes(job));
  const raw = { episodeId: 'synthetic-game', reviewVersion: 'trix-luna-game-review-1.0.0', provenance: 'llm-proposal', complete: true, quality: 'insufficient-evidence', summary: 'These references concern explanations, not proved better actions.',
    seatSummaries: [0, 1, 2, 3].map(actor => ({ actor, summary: 'Retain this original seat prose exactly.', reviewedDecisions: 13, uncertainty: ['Original uncertainty remains.'], correctionDecisionIds: !ordinary && actor < 2 ? [commits[actor].decisionId] : [] })),
    nativeTotals: { scoreTotals: totals, componentTotals: {} }, supportedMissedOpportunityRefs: [], explanationIssueCounts: { adequate: 0, 'incomplete-explanation': 0, 'unsupported-claim': 0, 'incorrect-fact': 0, uncertain: 0, forced: 52 }, usefulPatternRefs: [], counterexampleRefs: [], limitations: ['No expected score advantage is proved.'] };
  const state = { commits, reviews, outcomes: [{ episodeId: 'synthetic-game', variant: 'basic-solo', request: 'king', outcomeRef }] };
  const collector = { root, manifest, state: () => ({ ...state, rows: readJournal(root), paused: readJournal(root).some(row => row.kind === 'pause'), reviews: [...state.reviews, ...readJournal(root).filter(row => row.kind === 'review-imported').map(row => row.data)] }), replay: () => [{ episodeId: 'synthetic-game', status: 'passed', completedTricks: 13 }] };
  const context = { commits, reviews: frozen, frozenRows: reviews, native, replay: collector.replay()[0] }, transports = [], receipts = [], raws = [];
  let inventory;
  function invocation(proposal) {
    const transport = { jobId: randomUUID(), dispatchToken: randomUUID(), promptHash: job.promptHash, promptRef, claimedAt: at(-100), deadlineAt: new Date(Date.parse(at(-100)) + 300000).toISOString() }, threadId = randomUUID(), turnId = randomUUID();
    const bytes = Buffer.from(JSON.stringify(proposal, null, 2) + '\n'), directory = join(root, 'private/invocations', transport.jobId), app = join(directory, 'private/app-server'); mkdirSync(app, { recursive: true }); putBlob(directory, prompt);
    const cfg = { model: 'gpt-6-luna', config: { model_reasoning_effort: 'max', web_search: 'disabled' }, allowProviderModelFallback: false, baseInstructions: playerBaseInstructions, developerInstructions: playerDeveloperInstructions, approvalPolicy: 'never', sandbox: 'read-only', cwd: 'C:/Windows/Temp', dynamicTools: [], environments: [], runtimeWorkspaceRoots: [], selectedCapabilityRoots: [] };
    const thread = { model: 'gpt-6-luna', reasoningEffort: 'max', runtimeWorkspaceRoots: [], thread: { id: threadId, parentThreadId: null, forkedFromId: null, turns: [], environments: [] } };
    const hostRows = [['session_meta', { id: threadId, base_instructions: { text: playerBaseInstructions } }], ['event_msg', { type: 'task_started', turn_id: turnId }], ['response_item', { type: 'message', role: 'developer', content: [{ type: 'input_text', text: playerDeveloperInstructions }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['generic.developer_instructions'] } }], ['turn_context', { turn_id: turnId, root_turn_id: turnId, model: 'gpt-6-luna', effort: 'max', cwd: cfg.cwd }], ['response_item', { id: 'raw-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt.toString() }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['user.text'] } }], ['response_item', { id: 'raw-final', type: 'message', role: 'assistant', phase: 'final', content: [{ type: 'output_text', text: bytes.toString() }] }], ['event_msg', { type: 'task_complete', turn_id: turnId, last_agent_message: bytes.toString() }]];
    const hostBytes = Buffer.from(hostRows.map(([type, payload], ordinal) => JSON.stringify({ ordinal, timestamp: at(ordinal), type, payload }) + '\n').join(''));
    inventory = { schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: [describeAppServerContext(hostBytes, prompt).digest] };
    const input = [{ type: 'text', text: prompt.toString(), text_elements: [] }];
    const frames = [['outbound', { id: 1, method: 'initialize', params: {} }], ['inbound', { id: 1, result: {} }], ['outbound', { method: 'initialized', params: {} }], ['outbound', { id: 2, method: 'model/list', params: {} }], ['inbound', { id: 2, result: { data: [{ model: 'gpt-6-luna', supportedReasoningEfforts: [{ reasoningEffort: 'max' }] }] } }], ['outbound', { id: 3, method: 'thread/start', params: cfg }], ['inbound', { id: 3, result: thread }], ['outbound', { id: 4, method: 'turn/start', params: { threadId, model: 'gpt-6-luna', effort: 'max', input, additionalContext: {}, environments: [], runtimeWorkspaceRoots: [] } }], ['inbound', { id: 4, result: { turn: { id: turnId } } }], ['inbound', { method: 'turn/started', params: { threadId, turn: { id: turnId } } }], ['inbound', { method: 'item/completed', params: { threadId, turnId, item: { type: 'userMessage', id: 'typed-user', content: input } } }], ['inbound', { method: 'item/completed', params: { threadId, turnId, item: { type: 'agentMessage', id: 'typed-final', phase: 'final', text: bytes.toString() } } }], ['inbound', { method: 'rawResponseItem/completed', params: { threadId, turnId, item: hostRows[5][1] } }], ['inbound', { method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed', error: null } } }], ['outbound', { id: 5, method: 'thread/archive', params: { threadId } }], ['inbound', { id: 5, result: {} }]];
    let previousHash = '0'.repeat(64); const wire = frames.map(([direction, frame], i) => { const b = Buffer.from(JSON.stringify(frame) + '\n'), body = { sequence: i + 1, at: at(i), direction, bytesBase64: b.toString('base64'), bytesHash: sha(b), previousHash }; const row = { ...body, hash: sha(jsonBytes(body)) }; previousHash = row.hash; return row; });
    writeFileSync(join(directory, 'host-base-context-admission.json'), jsonBytes(inventory)); writeFileSync(join(app, 'job.json'), jsonBytes(transport)); writeFileSync(join(app, 'host-session.jsonl'), hostBytes); writeFileSync(join(app, 'wire.jsonl'), Buffer.concat(wire.map(jsonBytes))); writeFileSync(join(app, 'stopped.json'), jsonBytes({ stoppedVerified: true, error: null, wireFrames: wire.length, wireDigest: previousHash }));
    const receipt = { schemaVersion: 'trix-host-receipt-1.0.0', jobId: transport.jobId, dispatchToken: transport.dispatchToken, promptHash: job.promptHash, responseHash: sha(bytes), hostAgentId: threadId, requestedModel: 'gpt-6-luna', requestedEffort: 'max', reportedModelId: 'gpt-6-luna', startedAt: at(7), finishedAt: at(13), dispatchStatus: 'completed', usage: null };
    writeFileSync(join(directory, 'response.txt'), bytes); writeFileSync(join(directory, 'receipt.json'), jsonBytes(receipt)); appendEvent(root, 'review-dispatch-claimed', { reviewId: job.id, stage: 'game', job: transport }); appendEvent(root, 'review-attempt-settled', { jobId: transport.jobId, status: 'rejected', reason: 'Synthetic unverified seat correction' }); transports.push(transport); receipts.push(receipt); raws.push(proposal);
  }
  for (let i = 0; i < attempts; i++) invocation(structuredClone(raw));
  function authorization() {
    preserveBuild(root, resolve('.'), oldHashes, { sourceDigest: processingAudit.reviewSourceDigest, binaryDigest }, worker);
    const oldBoundary = readJournal(root).at(-1), old = { schemaVersion: 'trix-forced-rationale-recovery-1.0.0', policyVersion: forcedRationalePolicyVersion, policySourceHash: forcedRationalePolicySourceHash, sourceHashes: oldHashes, processingBuild: { sourceDigest: processingAudit.reviewSourceDigest, binaryDigest }, originalSourceDigest: processingAudit.originalSourceDigest, nativeBinaryDigest: binaryDigest, previousBoundary: { sequence: oldBoundary.sequence, hash: oldBoundary.hash } };
    const oldHash = sha(jsonBytes(old)), oldPath = `private/forced-rationale-recovery/${oldHash}.json`; writeImmutable(safePath(root, oldPath), jsonBytes(old)); appendEvent(root, 'forced-rationale-recovery-authorized', { recoveryHash: oldHash, recoveryPath: oldPath });
    preserveBuild(root, resolve('.'), hashes, { sourceDigest: gameProcessingAudit.reviewSourceDigest, binaryDigest }, worker);
    const boundary = readJournal(root).at(-1), recovery = { schemaVersion: 'trix-game-review-recovery-1.0.0', classificationVersion: gameReviewClassificationVersion, classificationSourceHash: gameReviewClassificationSourceHash, sourceHashes: hashes, processingBuild: { sourceDigest: gameProcessingAudit.reviewSourceDigest, binaryDigest }, originalSourceDigest: gameProcessingAudit.originalSourceDigest, nativeBinaryDigest: binaryDigest, previousBoundary: { sequence: boundary.sequence, hash: boundary.hash }, forcedPolicyDelegation: { recoveryHash: oldHash, policyVersion: old.policyVersion, policySourceHash: old.policySourceHash, processingBuild: old.processingBuild, processingAudit } };
    const recoveryHash = sha(jsonBytes(recovery)), recoveryPath = `private/game-review-recovery/${recoveryHash}.json`; writeImmutable(safePath(root, recoveryPath), jsonBytes(recovery)); appendEvent(root, 'game-review-recovery-authorized', { recoveryHash, recoveryPath, rationaleRecoveryHash: oldHash });
  }
  if (authorize) authorization();
  const api = { validateGameProposal, verifyPriorHost: (c, claim) => verifyPriorHost(c, claim, inventory) };
  const response = (i = 0) => ({ transport: transports[i], receipt: receipts[i], bytes: readFileSync(join(root, 'private/invocations', transports[i].jobId, 'response.txt')) });
  return { root, collector, state, frozen, context, job, raw, transports, receipts, raws, processingAudit, gameProcessingAudit, api, invocation, authorization, response,
    check: (i = 0) => { const r = response(i); return validateGameReviewEnvelope(collector, job, r.transport, r.bytes, r.receipt, { gameProcessingAudit }); },
    import: (i = 0) => { const r = response(i); return importClassifiedGameHostReview(collector, job, r.transport, r.bytes, r.receipt, { gameProcessingAudit }); } };
}

test('classification moves only owned explicit explanation flags out of canonical proved corrections and retains every raw grade/prose byte', t => {
  const f = fixture(t); assert.throws(() => validateGameProposal(f.raw, f.job, f.context), /Unverified seat correction/);
  const checked = f.check(), expected = structuredClone(f.raw); expected.seatSummaries[0].correctionDecisionIds = []; expected.seatSummaries[1].correctionDecisionIds = [];
  assert.deepEqual(checked.projected, expected); assert.deepEqual(checked.accepted, { ...expected, frozenDecisionReviewDigest: f.job.frozenDecisionReviewDigest });
  assert.equal(checked.classification.removedReferences.length, 2); assert.ok(checked.classification.removedReferences.every(flag => flag.classification === 'model-reported-unverified-explanation-flag' && flag.winningCorrectionSupported === false && flag.originalRationaleStatus === 'forced'));
  const imported = f.import(); assert.deepEqual(getBlob(f.root, imported.originalRef), f.raw); assert.deepEqual(getBlob(f.root, imported.reviewRef), checked.accepted);
  const host = getBlob(f.root, getBlob(f.root, imported.reviewerReceiptRef).hostEvidenceRef); assert.ok(getBlob(f.root, host.rawRef, false).equals(f.response().bytes)); assert.deepEqual(f.import(), imported);
});

for (const mode of ['unknown-id', 'cross-seat', 'duplicate-id', 'unflagged-action', 'unsupported-winning-proof', 'wrong-totals', 'wrong-counts', 'wrong-seat-count', 'wrong-episode', 'extra-field']) test(`classification cannot repair ${mode}`, t => {
  const f = fixture(t), raw = structuredClone(f.raw);
  if (mode === 'unknown-id') raw.seatSummaries[0].correctionDecisionIds = ['unknown']; if (mode === 'cross-seat') raw.seatSummaries[0].correctionDecisionIds = [f.state.commits[1].decisionId];
  if (mode === 'duplicate-id') raw.seatSummaries[0].correctionDecisionIds.push(raw.seatSummaries[0].correctionDecisionIds[0]); if (mode === 'unflagged-action') raw.seatSummaries[0].correctionDecisionIds = [f.state.commits[4].decisionId];
  if (mode === 'unsupported-winning-proof') raw.supportedMissedOpportunityRefs = [f.state.commits[0].decisionId]; if (mode === 'wrong-totals') raw.nativeTotals.scoreTotals[0].total = 10; if (mode === 'wrong-counts') raw.explanationIssueCounts.forced = 51;
  if (mode === 'wrong-seat-count') raw.seatSummaries[0].reviewedDecisions = 12; if (mode === 'wrong-episode') raw.episodeId = 'other'; if (mode === 'extra-field') raw.assistantClaim = true;
  assert.throws(() => classifyGameReviewProposal(raw, f.job, f.context));
});

test('a grade alone is insufficient and proved correction references remain unchanged', t => {
  const f = fixture(t), context = structuredClone(f.context); context.reviews[0].rationaleStatus = 'incorrect-fact'; context.reviews[0].explanationIssues = []; context.reviews[0].checks.forEach(check => { check.status = 'supported'; });
  assert.throws(() => classifyGameReviewProposal(f.raw, f.job, context), /explicit explanation flag/);
  const supported = structuredClone(f.context); supported.reviews[0].missedOpportunity = { syntheticBoundProof: true }; const raw = structuredClone(f.raw); raw.supportedMissedOpportunityRefs = [f.state.commits[0].decisionId];
  const job = { ...f.job, frozenDecisionReviewDigest: sha(jsonBytes(supported.reviews)) }, checked = classifyGameReviewProposal(raw, job, supported);
  assert.deepEqual(checked.projected.seatSummaries[0].correctionDecisionIds, raw.seatSummaries[0].correctionDecisionIds); assert.deepEqual(checked.projected.supportedMissedOpportunityRefs, raw.supportedMissedOpportunityRefs); assert.equal(checked.removedReferences.length, 1);
});

test('native replay and frozen review corruption remain fatal trust errors before content classification', t => {
  for (const mode of ['replay', 'frozen', 'native']) {
    const f = fixture(t); if (mode === 'replay') f.collector.replay = () => [{ episodeId: 'synthetic-game', status: 'failed', completedTricks: 13 }];
    if (mode === 'frozen') f.state.reviews[0].reviewRef = putBlob(f.root, { ...f.frozen[0], limitations: ['Changed frozen review'] });
    if (mode === 'native') f.job.outcomeRef = putBlob(f.root, { ...f.context.native, acceptedPlays: 51 });
    assert.throws(() => f.check(), error => error.code !== 'TRIX_REVIEW_CONTENT_INVALID');
  }
});

test('game imports require immutable authorization and a pause check while decisions retain the delegated old processor audit', t => {
  const f = fixture(t, { authorize: false }); f.check(); assert.throws(() => f.import(), /authorization/);
  const paused = fixture(t); appendEvent(paused.root, 'pause', { reason: 'operator-request' }); assert.throws(() => paused.import(), /later pause/);
  const ordinary = fixture(t, { ordinary: true }), calls = [], base = { ...ordinary.api, validateSavedContent(...args) { calls.push(args[5].processingAudit); return false; }, importHostReview() { throw Error('Decision route fixture only'); } };
  const wrapped = wrapGameReviewApis(base, { gameProcessingAudit: ordinary.gameProcessingAudit }); wrapped.validateSavedContent(ordinary.collector, { stage: 'decision' }, {}, Buffer.from('{}'), {}, { processingAudit: ordinary.processingAudit }, base);
  assert.deepEqual(calls, [ordinary.processingAudit]); const r = ordinary.response(); assert.equal(wrapped.validateSavedContent(ordinary.collector, ordinary.job, r.transport, r.bytes, r.receipt, { processingAudit: ordinary.processingAudit }, base), false);
  assert.equal(wrapped.importHostReview(ordinary.collector, ordinary.job, r.transport, r.bytes, r.receipt).gameReviewClassificationRef, undefined);
});

test('chronological recovery selects the first eligible game response and verifies both existing hosts without a third attempt', t => {
  const f = fixture(t, { attempts: 2 }), selected = verifyGameReviewRecovery(f.collector, f.job.id, { gameProcessingAudit: f.gameProcessingAudit, api: f.api });
  assert.equal(selected.transport.jobId, f.transports[0].jobId); assert.deepEqual(selected.proof.earlierRejected, []);
  const imported = importRecoveredGameReview(f.collector, selected, { gameProcessingAudit: f.gameProcessingAudit, api: f.api }); assert.deepEqual(getBlob(f.root, imported.originalRef), f.raws[0]); assert.equal(readJournal(f.root).filter(row => row.kind === 'review-dispatch-claimed').length, 2);
});

test('an earlier ordinary-valid game response blocks later classification and later host corruption aborts recovery', t => {
  const ordinary = fixture(t, { ordinary: true, attempts: 2 }); assert.throws(() => verifyGameReviewRecovery(ordinary.collector, ordinary.job.id, { gameProcessingAudit: ordinary.gameProcessingAudit, api: ordinary.api }), /ordinary reconciliation/);
  const corrupt = fixture(t, { attempts: 2 }); writeFileSync(join(corrupt.root, 'private/invocations', corrupt.transports[1].jobId, 'response.txt'), 'Corrupted later response'); assert.throws(() => verifyGameReviewRecovery(corrupt.collector, corrupt.job.id, { gameProcessingAudit: corrupt.gameProcessingAudit, api: corrupt.api }));
});

test('rechecking rejects changed selected proof or historical claim binding before import', t => {
  for (const mode of ['proof', 'binding']) { const f = fixture(t, { attempts: 2 }), selected = verifyGameReviewRecovery(f.collector, f.job.id, { gameProcessingAudit: f.gameProcessingAudit, api: f.api }); if (mode === 'proof') selected.proof.acceptedProposalHash = '0'.repeat(64); else selected.claimBindings[0].settlementHash = '0'.repeat(64); assert.throws(() => importRecoveredGameReview(f.collector, selected, { gameProcessingAudit: f.gameProcessingAudit, api: f.api })); assert.equal(f.collector.state().reviews.filter(row => row.stage === 'game').length, 0); }
});

test('raw export exposes preserved original game prose and distinctly unverified flags with exact authorized classification refs', t => {
  const f = fixture(t), imported = f.import(), publication = exportRawGame(f.collector, 'synthetic-game', { processingAudit: f.gameProcessingAudit });
  const game = JSON.parse(readFileSync(join(f.root, publication.directory, 'game.json'), 'utf8'));
  assert.deepEqual(game.originalGameReview, f.raw); assert.equal(game.unverifiedExplanationFlags.length, 2); assert.ok(game.unverifiedExplanationFlags.every(flag => flag.winningCorrectionSupported === false)); assert.deepEqual(game.sourceRefs.gameReviewClassificationRef, imported.gameReviewClassificationRef);
  assert.equal(game.acceptedGameReview.seatSummaries[0].summary, f.raw.seatSummaries[0].summary); assert.deepEqual(game.acceptedGameReview.supportedMissedOpportunityRefs, []);
  assert.deepEqual(exportRawGame(f.collector, 'synthetic-game', { processingAudit: f.gameProcessingAudit }), publication);
});

for (const mode of ['missing-classification', 'changed-classification', 'changed-authorization']) test(`raw export rejects ${mode}`, t => {
  const f = fixture(t), imported = f.import();
  if (mode === 'missing-classification' || mode === 'changed-classification') { const state = f.collector.state.bind(f.collector); const ref = mode === 'changed-classification' ? putBlob(f.root, { ...getBlob(f.root, imported.gameReviewClassificationRef), acceptedProposalHash: '0'.repeat(64) }) : undefined; f.collector.state = () => ({ ...state(), reviews: state().reviews.map(row => row.stage === 'game' ? { ...row, gameReviewClassificationRef: ref } : row) }); }
  if (mode === 'changed-authorization') { const auth = readJournal(f.root).find(row => row.kind === 'game-review-recovery-authorized'); const record = JSON.parse(readFileSync(safePath(f.root, auth.data.recoveryPath), 'utf8')); record.classificationVersion = 'unapproved'; writeFileSync(safePath(f.root, auth.data.recoveryPath), jsonBytes(record)); }
  assert.throws(() => exportRawGame(f.collector, 'synthetic-game', { processingAudit: f.gameProcessingAudit })); assert.equal(existsSync(join(f.root, 'raw-games/synthetic-game/source-manifest.json')), false);
});
