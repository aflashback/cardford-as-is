import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as referenceEnvelope from '../../scripts/trix-scenario-collection/reference-envelope.mjs';
import { describeBaseContext, inspectHostInvocation } from '../../scripts/trix-scenario-collection/host-journal.mjs';
import { appendEvent, getBlob, jsonBytes, putBlob, readJournal, sha, writeImmutable } from '../../scripts/trix-scenario-collection/journal.mjs';
import { validateDecisionProposal } from '../../scripts/trix-scenario-collection/review.mjs';
import { validateSavedContent } from '../../scripts/trix-scenario-collection/review-worker.mjs';
import { verifyPriorHost } from '../../scripts/trix-scenario-collection/review-worker.mjs';
import { describeAppServerContext, playerBaseInstructions, playerDeveloperInstructions } from '../../scripts/trix-scenario-collection/app-server-bridge.mjs';

const parentId = '01a12816-4909-7f21-86cb-be096b18edc3', childId = '01a12bea-9c45-7b03-b668-67f4f3572d1b';
const turnId = '01a12bea-9f81-76d0-92ad-ce64310e0cd4', parentTurn = '01a12be8-916d-7bb1-b862-5281d983c895';
const startedAt = '2026-10-11T17:02:38.250Z', finishedAt = '2026-10-11T17:02:40.250Z';
const oldRef = 'actor:/publicPhaseAndTurn/handCounts/2', newRef = 'actor:/handCounts/2';
const hostBytes = rows => Buffer.from(rows.map((row, ordinal) => JSON.stringify({ ordinal, timestamp: startedAt, ...row }) + '\n').join(''));
const row = (type, payload, timestamp = startedAt) => ({ timestamp, type, payload });

function fixture(t, change = (_raw, _fixture) => {}) {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'reference-envelope-test-'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  const packet = { schemaVersion: 'trix-scenario-player-packet-1.0.0', variant: 'basic-solo', request: 'diamonds', objective: 'own-request-points',
    ownHand: ['|S|♦|2|'], handCounts: [1, 3, 5, 2], publicPhaseAndTurn: { phase: 'playing', turn: 0 },
    legalOptions: [{ candidateId: 'play:D2' }, { candidateId: 'play:C2' }], pin: { gameId: 'trix', variantId: 'basic-solo' } };
  const packetRef = putBlob(root, packet), saved = { job: { packetRef, parentThreadId: parentId }, receiptRef: putBlob(root, { hostAgentId: 'synthetic-player-context' }) };
  const commit = { episodeId: 'synthetic-episode', decisionId: 'synthetic-decision', selectedCandidateId: 'play:D2', savedRef: putBlob(root, saved) };
  const prompt = Buffer.from('Synthetic independent reference review ' + JSON.stringify({ decisionId: commit.decisionId, packetHash: packetRef.sha256, ...packet }));
  const job = { id: 'synthetic-reference-review', stage: 'decision', subjectId: commit.decisionId, decisionId: commit.decisionId, selectedCandidateId: commit.selectedCandidateId,
    packetRef, packetHash: packetRef.sha256, commitRef: putBlob(root, commit), proofEvidenceRefs: [], promptRef: putBlob(root, prompt), promptHash: sha(prompt) };
  const transport = { jobId: 'synthetic-reference-host', dispatchToken: 'synthetic-token', taskName: 'synthetic_reference_review', parentThreadId: parentId,
    claimedAt: '2026-10-11T17:02:37.000Z', deadlineAt: '2026-10-11T17:03:00.000Z', promptHash: job.promptHash, promptRef: job.promptRef };
  const raw = { decisionId: job.decisionId, packetHash: job.packetHash, reviewVersion: 'trix-luna-review-1.0.0', provenance: 'llm-proposal', rationaleStatus: 'adequate',
    checks: ['facts', 'objective', 'material-alternatives', 'tactical-purpose', 'uncertainty'].map(id => ({ id, status: 'supported', explanation: 'Synthetic explanation retained exactly.', evidenceRefs: id === 'facts' ? [oldRef] : ['actor:/ownHand/0'] })),
    categoryIds: ['DIA'], explanationIssues: [], hypotheses: [], missedOpportunity: null, limitations: ['Synthetic host fixture; no actual game or model call.'] };
  change(raw, { root, job, packet, commit, saved });
  let bytes = Buffer.from(JSON.stringify(raw, null, 2) + '\n');
  const receipt = { schemaVersion: 'trix-host-receipt-1.0.0', jobId: transport.jobId, dispatchToken: transport.dispatchToken, promptHash: job.promptHash, responseHash: sha(bytes),
    hostAgentId: childId, requestedModel: 'gpt-6-luna', requestedEffort: 'max', reportedModelId: null, startedAt, finishedAt, dispatchStatus: 'completed', usage: null };
  const parent = [
    row('session_meta', { id: parentId }),
    row('response_item', { type: 'function_call', namespace: 'collaboration', name: 'spawn_agent', call_id: 'synthetic-dispatch', arguments: JSON.stringify({ task_name: transport.taskName, model: 'gpt-6-luna', reasoning_effort: 'max', fork_turns: 'none', message: prompt.toString() }), internal_chat_message_metadata_passthrough: { turn_id: parentTurn } }),
    row('event_msg', { type: 'item_completed', item: { type: 'SubAgentActivity', id: 'synthetic-dispatch', kind: 'started', agent_thread_id: childId, agent_path: `/root/${transport.taskName}` } }),
    row('response_item', { type: 'function_call_output', call_id: 'synthetic-dispatch', output: JSON.stringify({ task_name: `/root/${transport.taskName}` }) }),
  ];
  const meta = { turn_id: turnId };
  const child = [
    row('session_meta', { id: childId, parent_thread_id: parentId, thread_source: 'subagent', source: { subagent: { thread_spawn: { parent_thread_id: parentId, agent_path: `/root/${transport.taskName}`, depth: 1 } } }, base_instructions: { text: 'Synthetic generic safety instructions.' } }),
    row('event_msg', { type: 'task_started', turn_id: turnId, started_at: Math.floor(Date.parse(startedAt) / 1000) }),
    row('response_item', { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'Synthetic identical generic instructions.' }], internal_chat_message_metadata_passthrough: { turn_id: turnId, content_item_kinds: ['generic.developer_instructions'] } }),
    row('turn_context', { model: 'gpt-6-luna', effort: 'max', turn_id: turnId, root_turn_id: parentTurn }),
    row('response_item', { type: 'agent_message', author: '/root', recipient: `/root/${transport.taskName}`, content: [{ type: 'input_text', text: `Message Type: NEW_TASK\nTask name: /root/${transport.taskName}\nSender: /root\nPayload:\n` }, { type: 'encrypted_content', encrypted_content: 'synthetic opaque task payload' }], internal_chat_message_metadata_passthrough: meta }),
    row('response_item', { type: 'reasoning', encrypted_content: 'synthetic opaque reasoning', internal_chat_message_metadata_passthrough: meta }),
    row('event_msg', { type: 'item_completed', turn_id: turnId, item: { type: 'Reasoning' } }),
    row('response_item', { type: 'message', role: 'assistant', phase: 'final', content: [{ type: 'output_text', text: bytes.toString() }], internal_chat_message_metadata_passthrough: meta }, finishedAt),
    row('event_msg', { type: 'item_completed', turn_id: turnId, item: { type: 'AgentMessage' } }, finishedAt),
    row('event_msg', { type: 'task_complete', turn_id: turnId, last_agent_message: bytes.toString(), completed_at: Math.floor(Date.parse(finishedAt) / 1000) }, finishedAt),
  ];
  const sessionsRoot = join(root, 'sessions');
  const saveHost = () => {
    const directory = join(sessionsRoot, '2026/10/11'); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `rollout-synthetic-${parentId}.jsonl`), hostBytes(parent)); writeFileSync(join(directory, `rollout-synthetic-${childId}.jsonl`), hostBytes(child));
  };
  saveHost();
  writeFileSync(join(root, 'host-base-context-admission.json'), jsonBytes({ schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: [describeBaseContext(child).digest] }));
  writeImmutable(join(root, `outbox/${job.id}.json`), jsonBytes(job));
  appendEvent(root, 'review-dispatch-claimed', { reviewId: job.id, stage: job.stage, job: transport });
  appendEvent(root, 'review-attempt-settled', { jobId: transport.jobId, status: 'rejected', reason: 'Synthetic copied hand-count path rejected.' });
  const processingAudit = { originalSourceDigest: 'a'.repeat(64), reviewSourceDigest: 'b'.repeat(64), nativeBinaryDigest: 'c'.repeat(64) };
  const collector = { root, manifest: { build: { sourceDigest: processingAudit.originalSourceDigest, binaryDigest: processingAudit.nativeBinaryDigest } },
    state: () => ({ rows: readJournal(root), paused: readJournal(root).some(r => r.kind === 'pause'), commits: [commit], reviews: readJournal(root).filter(r => r.kind === 'review-imported').map(r => r.data) }) };
  const options = { processingAudit, inspectHost: (job, receipt, runRoot) => inspectHostInvocation(job, receipt, runRoot, { sessionsRoot }) };
  return { root, raw, packet, saved, commit, job, transport, receipt, options, collector, parent, child, saveHost, get bytes() { return bytes; },
    check: () => referenceEnvelope.validateReferenceReviewEnvelope(collector, job, transport, bytes, receipt, options),
    import: () => referenceEnvelope.importReferenceHostReview(collector, job, transport, bytes, receipt, options),
    setResponse(value) { bytes = Buffer.from(value); receipt.responseHash = sha(bytes); child[7].payload.content[0].text = bytes.toString(); child[9].payload.last_agent_message = bytes.toString(); saveHost(); },
  };
}

function snapshot(root) {
  return readdirSync(root, { recursive: true }).flatMap(name => { try { return [[name, sha(readFileSync(join(root, name)))]]; } catch { return []; } });
}

test('exact copied hand-count reference is corrected while all raw bytes and reasoning remain unchanged', t => {
  const f = fixture(t), original = structuredClone(f.raw), before = snapshot(f.root), checked = f.check();
  const expected = structuredClone(f.raw); expected.checks[0].evidenceRefs = [newRef];
  assert.deepEqual(checked.raw, original); assert.deepEqual(checked.normalized, expected); assert.deepEqual(snapshot(f.root), before, 'Preflight must be read-only');
  const imported = f.import();
  assert.deepEqual(getBlob(f.root, imported.originalRef), original); assert.deepEqual(getBlob(f.root, imported.reviewRef), expected);
  const metadata = getBlob(f.root, imported.metadataNormalizationRef), reviewer = getBlob(f.root, imported.reviewerReceiptRef), host = getBlob(f.root, reviewer.hostEvidenceRef);
  assert.ok(getBlob(f.root, host.rawRef, false).equals(f.bytes));
  assert.equal(metadata.schemaVersion, 'trix-review-reference-normalization-1.0.0'); assert.equal(metadata.kind, 'actor-handCounts-container');
  assert.equal(metadata.rawResponseHash, sha(f.bytes)); assert.equal(metadata.rawProposalHash, sha(jsonBytes(original))); assert.equal(metadata.normalizedProposalHash, sha(jsonBytes(expected)));
  assert.equal(metadata.originalSourceDigest, f.options.processingAudit.originalSourceDigest); assert.equal(metadata.reviewSourceDigest, f.options.processingAudit.reviewSourceDigest); assert.equal(metadata.nativeBinaryDigest, f.options.processingAudit.nativeBinaryDigest);
  assert.deepEqual(metadata.changes, checked.normalization.changes); assert.match(metadata.normalizerSourceHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(f.import(), imported); assert.equal(readJournal(f.root).filter(row => row.kind === 'review-imported').length, 1);
  assert.equal(readJournal(f.root).filter(row => row.kind === 'review-reference-normalized').length, 1);
});

for (const index of [0, 1, 2, 3]) test(`only the copied handCounts seat ${index} path can be remapped`, t => {
  const f = fixture(t, raw => { raw.checks[0].evidenceRefs = [`actor:/publicPhaseAndTurn/handCounts/${index}`]; });
  assert.deepEqual(f.check().normalized.checks[0].evidenceRefs, [`actor:/handCounts/${index}`]);
});

for (const badRef of ['actor:/publicPhaseAndTurn/handCounts/4', 'actor:/publicPhaseAndTurn/handCounts/-1', 'actor:/publicPhaseAndTurn/handCounts/02', 'actor:/publicPhaseAndTurn/handCounts/2/nested', 'actor:/publicPhaseAndTurn/otherCounts/2', 'actor:/missingField', 'hidden:/handCounts/2']) {
  test(`reference normalization rejects unapproved path ${badRef}`, t => {
    const f = fixture(t, raw => { raw.checks[0].evidenceRefs = [badRef]; }), before = snapshot(f.root);
    assert.throws(f.check); assert.throws(f.import); assert.deepEqual(snapshot(f.root), before);
  });
}

for (const mode of ['wrong-version', 'no-hand-counts', 'three-counts', 'string-count', 'negative-count', 'old-path-exists', 'duplicate-target', 'wrong-forced-grade', 'wrong-decision', 'wrong-packet-hash']) {
  test(`reference normalization rejects ${mode} without altering semantic fields`, t => {
    const f = fixture(t, (raw, { root, packet, job, commit, saved }) => {
      if (mode === 'wrong-version') packet.schemaVersion = 'new-packet-version';
      if (mode === 'no-hand-counts') delete packet.handCounts;
      if (mode === 'three-counts') packet.handCounts.pop();
      if (mode === 'string-count') packet.handCounts[2] = '5';
      if (mode === 'negative-count') packet.handCounts[2] = -1;
      if (mode === 'old-path-exists') packet.publicPhaseAndTurn.handCounts = [1, 3, 5, 2];
      if (mode === 'duplicate-target') raw.checks[0].evidenceRefs = [oldRef, newRef];
      if (mode === 'wrong-forced-grade') packet.legalOptions = [packet.legalOptions[0]];
      if (mode === 'wrong-decision') raw.decisionId = 'another-decision';
      if (mode === 'wrong-packet-hash') raw.packetHash = '0'.repeat(64);
      if (!['duplicate-target', 'wrong-decision', 'wrong-packet-hash'].includes(mode)) {
        job.packetRef = putBlob(root, packet); job.packetHash = job.packetRef.sha256; raw.packetHash = job.packetHash;
        saved.job.packetRef = job.packetRef; commit.savedRef = putBlob(root, saved); job.commitRef = putBlob(root, commit);
      }
    }), before = snapshot(f.root);
    assert.throws(f.check); assert.throws(f.import); assert.deepEqual(snapshot(f.root), before);
  });
}

test('inaccurate prose and the original supported grading are retained exactly', t => {
  const f = fixture(t, raw => { raw.checks[0].explanation = 'Synthetic North has nine cards, although the bound count is five.'; });
  const checked = f.check();
  assert.equal(checked.normalized.checks[0].explanation, f.raw.checks[0].explanation); assert.equal(checked.normalized.checks[0].status, 'supported');
  assert.equal(checked.normalized.rationaleStatus, f.raw.rationaleStatus);
});

test('permitted evidence reference arrays are repaired without changing hypotheses, prose, categories or proof claims', t => {
  const f = fixture(t, (raw, { root, job }) => {
    raw.explanationIssues = [{ description: 'Retain this issue verbatim.', evidenceRefs: [oldRef] }];
    const proofRef = putBlob(root, { synthetic: true }); job.proofEvidenceRefs = [proofRef];
    raw.missedOpportunity = { alternativeCandidateId: 'play:C2', objective: 'own-request-points', advantage: 10, proofKind: 'native-objective-dominance', proofRef, actorEvidenceRefs: [oldRef], correction: 'Synthetic unverified correction retained in raw data.' };
  });
  const checked = f.check();
  assert.deepEqual(checked.normalized.explanationIssues[0].evidenceRefs, [newRef]); assert.deepEqual(checked.normalized.missedOpportunity.actorEvidenceRefs, [newRef]);
  assert.equal(checked.normalized.missedOpportunity.correction, f.raw.missedOpportunity.correction); assert.deepEqual(checked.normalized.missedOpportunity.proofRef, f.raw.missedOpportunity.proofRef);
  assert.deepEqual(checked.normalized.categoryIds, f.raw.categoryIds); assert.deepEqual(checked.normalized.hypotheses, f.raw.hypotheses);
});

test('an issued bound proof still passes the original proof validator after reference metadata repair', t => {
  const f = fixture(t, (raw, { root, job }) => {
    const proofRef = putBlob(root, { synthetic: true, description: 'Fixture proof only; no strategy result.' }); job.proofEvidenceRefs = [proofRef];
    raw.missedOpportunity = { alternativeCandidateId: 'play:C2', objective: 'own-request-points', advantage: 10, proofKind: 'native-objective-dominance', proofRef, actorEvidenceRefs: [oldRef], correction: 'Synthetic proof-bound correction.' };
  });
  const proof = { verified: true, packetHash: f.job.packetHash, pin: f.packet.pin, originalCandidateId: f.job.selectedCandidateId,
    alternativeCandidateId: 'play:C2', objective: f.packet.objective, advantage: 10, proofRef: f.job.proofEvidenceRefs[0] };
  let calls = 0;
  f.options.verifyProof = claim => { calls++; assert.deepEqual(claim.actorEvidenceRefs, [newRef]); assert.equal(claim.correction, f.raw.missedOpportunity.correction); return proof; };
  f.check(); assert.equal(calls, 0, 'Preflight must not run native proof work');
  const imported = f.import(), accepted = getBlob(f.root, imported.reviewRef);
  assert.equal(calls, 1); assert.deepEqual(accepted.missedOpportunity.actorEvidenceRefs, [newRef]); assert.deepEqual(getBlob(f.root, accepted.acceptedProofReceiptRef), proof);
  assert.deepEqual(getBlob(f.root, imported.originalRef), f.raw);
});

test('reference repair cannot invent an unissued or unbound proof', t => {
  const f = fixture(t, (raw, { root }) => {
    raw.missedOpportunity = { alternativeCandidateId: 'play:C2', objective: 'own-request-points', advantage: 10, proofKind: 'native-objective-dominance', proofRef: putBlob(root, { synthetic: true }), actorEvidenceRefs: [oldRef], correction: 'Synthetic unsupported correction.' };
  });
  let calls = 0; f.options.verifyProof = () => { calls++; return { verified: true }; };
  const imported = f.import(), accepted = getBlob(f.root, imported.reviewRef);
  assert.equal(calls, 0); assert.equal(accepted.missedOpportunity, null); assert.equal(accepted.hypotheses.length, 1);
  assert.deepEqual(getBlob(f.root, imported.originalRef).missedOpportunity, f.raw.missedOpportunity);
});

test('a new operator pause prevents reference import and preserves the raw prior attempt', t => {
  const f = fixture(t); f.check(); appendEvent(f.root, 'pause', { reason: 'operator-request' });
  const before = snapshot(f.root); assert.throws(f.import, /later pause/); assert.deepEqual(snapshot(f.root), before);
});

test('driver wrapper tries reference repair only after the ordinary content validator rejects the exact saved proposal', t => {
  const f = fixture(t), api = { validateSavedContent, validateDecisionProposal };
  const wrapped = referenceEnvelope.wrapReferenceDriverApis(api, { processingAudit: f.options.processingAudit });
  assert.throws(() => validateSavedContent(f.collector, f.job, f.transport, f.bytes, f.receipt, f.options, api), error => error.code === 'TRIX_REVIEW_CONTENT_INVALID');
  assert.equal(wrapped.validateSavedContent(f.collector, f.job, f.transport, f.bytes, f.receipt, f.options, api), true);
  const imported = wrapped.importNormalizedHostReview(f.collector, f.job, f.transport, f.bytes, f.receipt, f.options);
  assert.deepEqual(getBlob(f.root, imported.originalRef), f.raw); assert.deepEqual(getBlob(f.root, imported.reviewRef).checks[0].evidenceRefs, [newRef]);
});

test('already correct references follow ordinary validation without normalization', t => {
  const f = fixture(t, raw => { raw.checks[0].evidenceRefs = [newRef]; }), api = { validateSavedContent, validateDecisionProposal };
  const wrapped = referenceEnvelope.wrapReferenceDriverApis(api, { processingAudit: f.options.processingAudit });
  assert.equal(wrapped.validateSavedContent(f.collector, f.job, f.transport, f.bytes, f.receipt, f.options, api), false);
  assert.throws(f.check, /No supported actor-reference typo/);
  assert.equal(readJournal(f.root).filter(row => row.kind === 'review-reference-normalized').length, 0);
});

test('pure reference correction leaves strings outside the permitted evidence-reference arrays untouched', t => {
  const f = fixture(t, raw => {
    raw.checks[0].explanation = oldRef;
    raw.hypotheses = [{ description: oldRef, assumptions: [oldRef], counterexamplesToSeek: [oldRef] }];
    raw.limitations = [oldRef];
  });
  const checked = referenceEnvelope.normalizeActorReferenceProposal(f.raw, f.packet);
  assert.equal(checked.normalized.checks[0].explanation, oldRef); assert.deepEqual(checked.normalized.hypotheses, f.raw.hypotheses); assert.deepEqual(checked.normalized.limitations, f.raw.limitations);
  assert.deepEqual(checked.changes, [{ path: '/checks/0/evidenceRefs/0', from: oldRef, to: newRef }]);
});

for (const [name, mutate] of [
  ['response byte tampering', f => { f.receipt.responseHash = '0'.repeat(64); }],
  ['host tool activity', f => { f.child[6].payload.item.type = 'CommandExecution'; f.saveHost(); }],
  ['different frozen player source', f => { f.options.processingAudit.originalSourceDigest = '0'.repeat(64); }],
  ['different native binary', f => { f.options.processingAudit.nativeBinaryDigest = '0'.repeat(64); }],
  ['player reviewing itself', f => { f.saved.receiptRef = putBlob(f.root, { hostAgentId: childId }); f.commit.savedRef = putBlob(f.root, f.saved); f.job.commitRef = putBlob(f.root, f.commit); writeFileSync(join(f.root, `outbox/${f.job.id}.json`), jsonBytes(f.job)); }],
]) test(`reference normalization rejects ${name} before saving anything`, t => {
  const f = fixture(t); mutate(f); const before = snapshot(f.root);
  assert.throws(f.check); assert.throws(f.import); assert.deepEqual(snapshot(f.root), before);
});

function recoveryFixture(t, { first = 'reference', second = 'reference', attempts = 2 } = {}) {
  const f = fixture(t), claims = [], receipts = [], transports = [], raws = [];
  // Replace only this synthetic fixture's initial delegated journal with two
  // fully recorded app-server invocations. The production inspector is used
  // directly, with no environment changes or evidence-admission test hooks.
  writeFileSync(join(f.root, 'private/journal.jsonl'), Buffer.alloc(0));
  let inventory;
  for (let i = 0; i < attempts; i++) {
    const tail = String(i + 1).padStart(12, '0'), jobId = `01a12bea-0001-7000-8000-${tail}`;
    const threadId = `01a12bea-0002-7000-8000-${tail}`, invocationTurn = `01a12bea-0003-7000-8000-${tail}`;
    const transport = { ...f.transport, jobId, dispatchToken: `synthetic-attempt-${i}`, parentThreadId: null };
    const raw = structuredClone(f.raw), kind = i === 0 ? first : second;
    if (kind === 'ordinary') raw.checks[0].evidenceRefs = [newRef];
    if (kind === 'whole') raw.checks[0].evidenceRefs = ['actor:/publicPhaseAndTurn/handCounts'];
    if (kind === 'grade') raw.rationaleStatus = 'forced';
    const bytes = Buffer.from(JSON.stringify(raw, null, 2) + '\n'), invocation = join(f.root, 'private/invocations', jobId), app = join(invocation, 'private/app-server');
    mkdirSync(app, { recursive: true }); putBlob(invocation, getBlob(f.root, f.job.promptRef, false));
    const cfg = { model: 'gpt-6-luna', config: { model_reasoning_effort: 'max', web_search: 'disabled' }, allowProviderModelFallback: false, baseInstructions: playerBaseInstructions, developerInstructions: playerDeveloperInstructions,
      approvalPolicy: 'never', sandbox: 'read-only', cwd: 'C:/Windows/Temp', dynamicTools: [], environments: [], runtimeWorkspaceRoots: [], selectedCapabilityRoots: [] };
    const thread = { model: 'gpt-6-luna', reasoningEffort: 'max', runtimeWorkspaceRoots: [], thread: { id: threadId, parentThreadId: null, forkedFromId: null, turns: [], environments: [] } };
    const hostRows = [
      row('session_meta', { id: threadId, base_instructions: { text: playerBaseInstructions } }),
      row('event_msg', { type: 'task_started', turn_id: invocationTurn }),
      row('response_item', { id: 'generic-instructions', type: 'message', role: 'developer', content: [{ type: 'input_text', text: playerDeveloperInstructions }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['generic.developer_instructions'] } }),
      row('turn_context', { turn_id: invocationTurn, root_turn_id: invocationTurn, cwd: cfg.cwd, model: 'gpt-6-luna', effort: 'max' }),
      row('response_item', { id: 'raw-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: getBlob(f.root, f.job.promptRef, false).toString() }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['user.text'] } }),
      row('response_item', { id: 'raw-final', type: 'message', role: 'assistant', phase: 'final', content: [{ type: 'output_text', text: bytes.toString() }] }),
      row('event_msg', { type: 'task_complete', turn_id: invocationTurn, last_agent_message: bytes.toString() }),
    ];
    const input = [{ type: 'text', text: getBlob(f.root, f.job.promptRef, false).toString(), text_elements: [] }];
    const frames = [
      ['outbound', { id: 1, method: 'initialize', params: {} }], ['inbound', { id: 1, result: {} }], ['outbound', { method: 'initialized', params: {} }],
      ['outbound', { id: 2, method: 'model/list', params: {} }], ['inbound', { id: 2, result: { data: [{ model: 'gpt-6-luna', supportedReasoningEfforts: [{ reasoningEffort: 'max' }] }] } }],
      ['outbound', { id: 3, method: 'thread/start', params: cfg }], ['inbound', { id: 3, result: thread }],
      ['outbound', { id: 4, method: 'turn/start', params: { threadId, model: 'gpt-6-luna', effort: 'max', input, additionalContext: {}, environments: [], runtimeWorkspaceRoots: [] } }],
      ['inbound', { id: 4, result: { turn: { id: invocationTurn } } }], ['inbound', { method: 'turn/started', params: { threadId, turn: { id: invocationTurn } } }],
      ['inbound', { method: 'item/completed', params: { threadId, turnId: invocationTurn, item: { id: 'typed-user', type: 'userMessage', content: input } } }],
      ['inbound', { method: 'item/completed', params: { threadId, turnId: invocationTurn, item: { id: 'typed-final', type: 'agentMessage', phase: 'final', text: bytes.toString() } } }],
      ['inbound', { method: 'rawResponseItem/completed', params: { threadId, turnId: invocationTurn, item: hostRows[5].payload } }],
      ['inbound', { method: 'turn/completed', params: { threadId, turn: { id: invocationTurn, status: 'completed', error: null } } }],
      ['outbound', { id: 5, method: 'thread/archive', params: { threadId } }], ['inbound', { id: 5, result: {} }],
    ];
    let previousHash = '0'.repeat(64);
    const wire = frames.map(([direction, frame], index) => {
      const wireBytes = Buffer.from(JSON.stringify(frame) + '\n'), at = new Date(Date.parse(startedAt) + index * 10).toISOString();
      const body = { sequence: index + 1, at, direction, bytesBase64: wireBytes.toString('base64'), bytesHash: sha(wireBytes), previousHash };
      const entry = { ...body, hash: sha(jsonBytes(body)) }; previousHash = entry.hash; return entry;
    });
    inventory = { schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: [describeAppServerContext(hostBytes(hostRows), getBlob(f.root, f.job.promptRef, false)).digest] };
    writeFileSync(join(invocation, 'host-base-context-admission.json'), jsonBytes(inventory)); writeFileSync(join(app, 'job.json'), jsonBytes(transport));
    writeFileSync(join(app, 'host-session.jsonl'), hostBytes(hostRows)); writeFileSync(join(app, 'wire.jsonl'), Buffer.concat(wire.map(jsonBytes)));
    writeFileSync(join(app, 'stopped.json'), jsonBytes({ stoppedVerified: true, error: null, wireFrames: wire.length, wireDigest: previousHash }));
    const receipt = { ...f.receipt, jobId, dispatchToken: transport.dispatchToken, hostAgentId: threadId, responseHash: sha(bytes), reportedModelId: 'gpt-6-luna', startedAt: wire[7].at, finishedAt: wire[13].at };
    writeFileSync(join(invocation, 'response.txt'), bytes); writeFileSync(join(invocation, 'receipt.json'), jsonBytes(receipt));
    claims.push(appendEvent(f.root, 'review-dispatch-claimed', { reviewId: f.job.id, stage: 'decision', job: transport }));
    appendEvent(f.root, 'review-attempt-settled', { jobId, status: 'rejected', reason: 'Synthetic original content failure' });
    receipts.push(receipt); transports.push(transport); raws.push(raw);
  }
  const inspected = [];
  const api = { validateSavedContent, validateDecisionProposal,
    verifyPriorHost(collector, claim) { inspected.push(claim.data.job.jobId); return verifyPriorHost(collector, claim, inventory); },
  };
  const options = { processingAudit: f.options.processingAudit, api };
  return { ...f, claims, receipts, transports, raws, inspected, recoveryOptions: options,
    recover: () => referenceEnvelope.verifyReferenceRecovery(f.collector, f.job.id, options),
    recoverImport: selected => referenceEnvelope.importRecoveredReferenceReview(f.collector, selected, options),
  };
}

test('reference recovery refuses a later response when the first saved response already passes ordinary validation', t => {
  const f = recoveryFixture(t, { first: 'ordinary' }), before = snapshot(f.root);
  assert.throws(f.recover, /Earlier valid response requires ordinary reconciliation/); assert.deepEqual(snapshot(f.root), before);
  assert.deepEqual(f.inspected, [f.transports[0].jobId]);
});

test('reference recovery selects the first reference-repairable saved attempt and still verifies the later host', t => {
  const f = recoveryFixture(t), selected = f.recover();
  assert.equal(selected.transport.jobId, f.transports[0].jobId); assert.deepEqual(selected.proof.earlierRejected, []);
  assert.deepEqual(f.inspected, f.transports.map(job => job.jobId));
  const imported = f.recoverImport(selected);
  assert.deepEqual(getBlob(f.root, imported.originalRef), f.raws[0]); assert.equal(readJournal(f.root).filter(row => row.kind === 'review-dispatch-claimed').length, 2);
});

test('reference recovery rejects the first semantic grade error then selects the second metadata-only response', t => {
  const f = recoveryFixture(t, { first: 'grade' }), selected = f.recover();
  assert.equal(selected.transport.jobId, f.transports[1].jobId); assert.equal(selected.proof.earlierRejected.length, 1);
  assert.equal(selected.proof.earlierRejected[0].jobId, f.transports[0].jobId);
  const imported = f.recoverImport(selected); assert.deepEqual(getBlob(f.root, imported.originalRef), f.raws[1]);
  assert.equal(getBlob(f.root, imported.reviewRef).rationaleStatus, 'adequate');
});

for (const attempt of [0, 1]) test(`reference recovery aborts when saved host ${attempt + 1} cannot be trusted`, t => {
  const f = recoveryFixture(t), receipt = { ...f.receipts[attempt], responseHash: '0'.repeat(64) };
  writeFileSync(join(f.root, 'private/invocations', receipt.jobId, 'receipt.json'), jsonBytes(receipt));
  assert.throws(f.recover); assert.equal(readJournal(f.root).filter(row => row.kind === 'review-imported').length, 0);
});

for (const attempts of [1, 3]) test(`reference recovery rejects ${attempts} historical attempts`, t => {
  const f = recoveryFixture(t, { attempts }); assert.throws(f.recover, /both existing attempts/); assert.deepEqual(f.inspected, []);
});

for (const mode of ['missing', 'duplicate']) test(`reference recovery rejects ${mode} settlement before selecting or importing`, t => {
  const f = recoveryFixture(t);
  if (mode === 'duplicate') appendEvent(f.root, 'review-attempt-settled', { jobId: f.transports[0].jobId, status: 'rejected', reason: 'Duplicate settlement' });
  else {
    const state = f.collector.state.bind(f.collector);
    f.collector.state = () => { const current = state(); return { ...current, rows: current.rows.filter(row => !(row.kind === 'review-attempt-settled' && row.data.jobId === f.transports[0].jobId)) }; };
  }
  assert.throws(f.recover); assert.equal(readJournal(f.root).filter(row => row.kind === 'review-imported').length, 0);
});

for (const mode of ['proof', 'bindings', 'saved-host']) test(`reference recovery recheck rejects changed ${mode} before import`, t => {
  const f = recoveryFixture(t), selected = f.recover();
  if (mode === 'proof') selected.proof.normalizedProposalHash = '0'.repeat(64);
  if (mode === 'bindings') selected.claimBindings[0].settlementHash = '0'.repeat(64);
  if (mode === 'saved-host') writeFileSync(join(f.root, 'private/invocations', f.transports[1].jobId, 'response.txt'), 'Altered later saved bytes');
  const before = snapshot(f.root); assert.throws(() => f.recoverImport(selected)); assert.deepEqual(snapshot(f.root), before);
  assert.equal(readJournal(f.root).filter(row => row.kind === 'review-imported').length, 0);
});

const oldWhole = 'actor:/publicPhaseAndTurn/handCounts', newWhole = 'actor:/handCounts';

test('exact whole-array hand-count reference preserves raw bytes, prose and grades while correcting only its container', t => {
  const f = fixture(t, raw => { raw.checks[0].evidenceRefs = [oldWhole]; raw.checks[0].explanation = 'Retain the original explanation and grading exactly.'; });
  const checked = f.check(), expected = structuredClone(f.raw); expected.checks[0].evidenceRefs = [newWhole];
  assert.deepEqual(checked.normalized, expected);
  assert.deepEqual(checked.normalization.changes, [{ path: '/checks/0/evidenceRefs/0', from: oldWhole, to: newWhole }]);
  const imported = f.import(), host = getBlob(f.root, getBlob(f.root, imported.reviewerReceiptRef).hostEvidenceRef);
  assert.ok(getBlob(f.root, host.rawRef, false).equals(f.bytes)); assert.deepEqual(getBlob(f.root, imported.originalRef), f.raw);
  assert.deepEqual(getBlob(f.root, imported.reviewRef), expected); assert.deepEqual(f.import(), imported);
});

test('whole-array references may be corrected in every approved evidence-reference array without changing other fields', t => {
  const f = fixture(t, (raw, { root, job }) => {
    raw.checks[0].evidenceRefs = [oldWhole];
    raw.explanationIssues = [{ description: 'Keep this original issue.', evidenceRefs: [oldWhole] }];
    const proofRef = putBlob(root, { synthetic: true }); job.proofEvidenceRefs = [proofRef];
    raw.missedOpportunity = { alternativeCandidateId: 'play:C2', objective: 'own-request-points', advantage: 10, proofKind: 'native-objective-dominance', proofRef,
      actorEvidenceRefs: [oldWhole], correction: 'Keep the original conditional correction.' };
  });
  const expected = structuredClone(f.raw); expected.checks[0].evidenceRefs = [newWhole]; expected.explanationIssues[0].evidenceRefs = [newWhole]; expected.missedOpportunity.actorEvidenceRefs = [newWhole];
  const checked = f.check(); assert.deepEqual(checked.normalized, expected);
  assert.deepEqual(checked.normalization.changes.map(change => change.path), ['/checks/0/evidenceRefs/0', '/explanationIssues/0/evidenceRefs/0', '/missedOpportunity/actorEvidenceRefs/0']);
});

test('whole-array and indexed references are one metadata family and can coexist in the same unchanged proposal', t => {
  const f = fixture(t, raw => { raw.checks[0].evidenceRefs = [oldWhole, oldRef]; });
  const expected = structuredClone(f.raw); expected.checks[0].evidenceRefs = [newWhole, newRef];
  assert.deepEqual(f.check().normalized, expected); assert.deepEqual(getBlob(f.root, f.import().reviewRef), expected);
});

for (const badRef of [oldWhole + '/', oldWhole + '/0/', oldWhole + '/length', oldWhole + '/4', oldWhole + 's', 'actor:/publicPhaseAndTurn/HandCounts', 'actor:/publicPhaseAndTurn/handCountsExtra', 'actor:/publicPhaseAndTurn/handCounts/0/extra']) {
  test(`whole-array extension still rejects prefix-similar path ${badRef}`, t => {
    const f = fixture(t, raw => { raw.checks[0].evidenceRefs = [badRef]; }), before = snapshot(f.root);
    assert.throws(f.check); assert.throws(f.import); assert.deepEqual(snapshot(f.root), before);
  });
}

for (const [name, mutate] of [
  ['absent target', packet => { delete packet.handCounts; }],
  ['wrong root length', packet => { packet.handCounts = [1, 2, 3]; }],
  ['noninteger root target', packet => { packet.handCounts = [1, 2, 3, 4.5]; }],
  ['string root target', packet => { packet.handCounts = [1, 2, 3, '4']; }],
  ['negative root target', packet => { packet.handCounts = [1, 2, 3, -1]; }],
  ['oversized root target', packet => { packet.handCounts = [1, 2, 3, 14]; }],
  ['already present source', packet => { packet.publicPhaseAndTurn.handCounts = [1, 3, 5, 2]; }],
]) test(`whole-array normalization requires ${name === 'already present source' ? 'an absent source' : 'a valid target'}: ${name}`, t => {
  const f = fixture(t, raw => { raw.checks[0].evidenceRefs = [oldWhole]; }), packet = structuredClone(f.packet); mutate(packet);
  assert.throws(() => referenceEnvelope.normalizeActorReferenceProposal(f.raw, packet));
});

test('whole-array mapping cannot collapse duplicate evidence references into an accepted review', t => {
  const f = fixture(t, raw => { raw.checks[0].evidenceRefs = [oldWhole, newWhole]; }), before = snapshot(f.root);
  assert.throws(f.check); assert.throws(f.import); assert.deepEqual(snapshot(f.root), before);
});

test('earliest whole-array repair wins while both historical hosts are verified and raw quality judgments remain intact', t => {
  const f = recoveryFixture(t, { first: 'whole' }), selected = f.recover();
  assert.equal(selected.transport.jobId, f.transports[0].jobId); assert.deepEqual(f.inspected, f.transports.map(job => job.jobId));
  assert.deepEqual(selected.proof.earlierRejected, []); const expected = structuredClone(f.raws[0]); expected.checks[0].evidenceRefs = [newWhole];
  assert.deepEqual(selected.checked.normalized, expected);
  const imported = f.recoverImport(selected); assert.deepEqual(getBlob(f.root, imported.originalRef), f.raws[0]); assert.deepEqual(getBlob(f.root, imported.reviewRef), expected);
  const host = getBlob(f.root, getBlob(f.root, imported.reviewerReceiptRef).hostEvidenceRef);
  assert.ok(getBlob(f.root, host.rawRef, false).equals(selected.bytes)); assert.equal(readJournal(f.root).filter(row => row.kind === 'review-dispatch-claimed').length, 2);
});

test('unsupported reference fallback preserves the ordinary unresolved-reference error', t => {
  const f = fixture(t, raw => { raw.checks[0].evidenceRefs = ['actor:/publicPhaseAndTurn/handCountsExtra']; });
  const api = { validateSavedContent, validateDecisionProposal }, wrapped = referenceEnvelope.wrapReferenceDriverApis(api, { processingAudit: f.options.processingAudit });
  let ordinary;
  try { validateSavedContent(f.collector, f.job, f.transport, f.bytes, f.receipt, f.options, api); } catch (error) { ordinary = error; }
  assert.ok(ordinary); assert.equal(ordinary.code, 'TRIX_REVIEW_CONTENT_INVALID');
  assert.throws(() => wrapped.validateSavedContent(f.collector, f.job, f.transport, f.bytes, f.receipt, f.options, api), error => error.code === ordinary.code && error.message === ordinary.message);
});
