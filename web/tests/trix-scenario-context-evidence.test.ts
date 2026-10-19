import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { verifyContextEvidence } from '../../scripts/trix-scenario-collection/context-evidence.mjs';
import { describeAppServerContext, inspectAppServerEvidence, playerBaseInstructions, playerDeveloperInstructions } from '../../scripts/trix-scenario-collection/app-server-bridge.mjs';
import { appendEvent, jsonBytes, putBlob, readJournal, sha } from '../../scripts/trix-scenario-collection/journal.mjs';

const failureReason = 'Actual post-turn context differs from approved context';
const time = n => new Date(Date.parse('2026-10-11T16:00:00Z') + n * 1000).toISOString();
const features = ['shell_tool','unified_exec','multi_agent','multi_agent_v2','code_mode_host','code_mode','computer_use','browser_use','browser_use_external','in_app_browser','plugins','remote_plugin','skill_search','skill_mcp_dependency_install','sleep_tool','tool_suggest'];

function fixture(t) {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'context-evidence-test-'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  const write = (path, value) => { mkdirSync(resolve(path, '..'), { recursive: true }); writeFileSync(path, Buffer.isBuffer(value) ? value : jsonBytes(value)); };
  const executable = join(root, 'synthetic-host.exe'); writeFileSync(executable, 'Synthetic host executable; never launched.');
  const prompt = Buffer.from('Synthetic independent review. Return the prescribed synthetic JSON only.');
  const sourceHashes = Object.fromEntries(['app-server-bridge', 'journal'].map(name => [`scripts/trix-scenario-collection/${name}.mjs`, sha(readFileSync(resolve(`scripts/trix-scenario-collection/${name}.mjs`)))]));
  const packet = { variant: 'basic-solo', request: 'diamonds', objective: 'own-request-points', ownHand: ['|S|♦|2|'],
    legalOptions: [{ candidateId: 'play:D2' }, { candidateId: 'play:C2' }], pin: { gameId: 'trix', variantId: 'basic-solo' } };
  const packetRef = putBlob(root, packet), saved = { job: { packetRef, parentThreadId: null }, receiptRef: putBlob(root, { hostAgentId: 'synthetic-player-context' }) };
  const commit = { episodeId: 'synthetic-episode', decisionId: 'synthetic-decision', selectedCandidateId: 'play:D2', savedRef: putBlob(root, saved) };
  const proposal = { decisionId: commit.decisionId, packetHash: packetRef.sha256, reviewVersion: 'trix-luna-review-1.0.0', provenance: 'llm-proposal', rationaleStatus: 'adequate',
    checks: ['facts', 'objective', 'material-alternatives', 'tactical-purpose', 'uncertainty'].map(id => ({ id, status: 'supported', explanation: 'Synthetic unchanged review fixture.', evidenceRefs: ['actor:/ownHand/0'] })),
    categoryIds: ['DIA'], explanationIssues: [], hypotheses: [], missedOpportunity: null, limitations: ['Synthetic evidence; no actual game or model call.'] };
  const final = JSON.stringify(proposal, null, 2) + '\n';
  const promptRef = putBlob(root, prompt), job = { jobId: 'current-context-job', dispatchToken: 'synthetic-current-token', promptHash: sha(prompt), promptRef, claimedAt: time(0), deadlineAt: time(300) };
  const previousJob = { ...job, jobId: 'previous-context-job', dispatchToken: 'synthetic-previous-token', claimedAt: time(-120), deadlineAt: time(-60) };
  const reviewJob = { id: 'synthetic-current-review', stage: 'decision', subjectId: commit.decisionId, decisionId: commit.decisionId, selectedCandidateId: commit.selectedCandidateId,
    packetRef, packetHash: packetRef.sha256, commitRef: putBlob(root, commit), proofEvidenceRefs: [], promptHash: job.promptHash, promptRef };
  const oldMemory = 'Synthetic neutral memory: prefer clear prose.', newMemory = 'Synthetic neutral memory: prefer concise clear prose.';
  const threadId = '019a0201-1000-7000-8000-000000000002', turnId = 'synthetic-completed-turn';
  const hostRows = [
    { type: 'session_meta', payload: { id: threadId, base_instructions: { text: playerBaseInstructions } } },
    { type: 'event_msg', payload: { type: 'task_started', turn_id: turnId } },
    { type: 'response_item', payload: { id: 'generic-instructions', type: 'message', role: 'developer', content: [{ type: 'input_text', text: playerDeveloperInstructions }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['generic.developer_instructions'] } } },
    { type: 'response_item', payload: { id: 'generic-memory', type: 'message', role: 'developer', content: [{ type: 'input_text', text: newMemory }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['memories.instructions'] } } },
    { type: 'turn_context', payload: { turn_id: turnId, root_turn_id: turnId, cwd: 'C:/Windows/Temp', model: 'gpt-6-luna', effort: 'max' } },
    { type: 'response_item', payload: { id: 'raw-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt.toString() }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['user.text'] } } },
    { type: 'event_msg', payload: { type: 'item_completed', thread_id: threadId, turn_id: turnId, item: { id: 'typed-user', type: 'UserMessage', content: [{ type: 'text', text: prompt.toString(), text_elements: [] }] } } },
    { type: 'response_item', payload: { id: 'host-final', type: 'message', role: 'assistant', phase: 'final', content: [{ type: 'output_text', text: final }] } },
    { type: 'event_msg', payload: { type: 'task_complete', turn_id: turnId, last_agent_message: final } },
  ];
  const journalBytes = rows => Buffer.from(rows.map((row, ordinal) => JSON.stringify({ ordinal, timestamp: time(ordinal), ...row }) + '\n').join(''));
  const previousRows = structuredClone(hostRows); previousRows[3].payload.content[0].text = oldMemory;
  const previousContext = describeAppServerContext(journalBytes(previousRows), prompt), actualContext = describeAppServerContext(journalBytes(hostRows), prompt);
  const oldInventory = { schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: [previousContext.digest], audit: { hostExecutable: executable } };
  const assessmentSummary = 'Synthetic neutral prose preferences changed; no episode facts were added.';
  const newInventory = { ...oldInventory, approvedDigests: [actualContext.digest], audit: { ...oldInventory.audit,
    evidence: `private/invocations/${job.jobId}/private/app-server/host-session.jsonl`, hostJournalSha256: sha(journalBytes(hostRows)), contextAuditSha256: sha(jsonBytes(actualContext)),
    previousDigest: previousContext.digest, classification: assessmentSummary, cwd: 'C:/Windows/Temp', model: 'gpt-6-luna', effort: 'max',
  } };
  appendEvent(root, 'initialized', {});
  appendEvent(root, 'review-dispatch-claimed', { reviewId: 'synthetic-previous-review', stage: 'decision', job: previousJob });
  appendEvent(root, 'review-attempt-settled', { jobId: previousJob.jobId, status: 'rejected', reason: 'Synthetic previous content rejected' });
  const claim = appendEvent(root, 'review-dispatch-claimed', { reviewId: reviewJob.id, stage: reviewJob.stage, job });
  appendEvent(root, 'review-attempt-settled', { jobId: job.jobId, status: 'rejected', reason: failureReason });
  write(join(root, 'outbox', `${reviewJob.id}.json`), reviewJob);
  const invocation = join(root, 'private/invocations', job.jobId), app = join(invocation, 'private/app-server'); mkdirSync(app, { recursive: true }); putBlob(invocation, prompt);
  const previousInvocation = join(root, 'private/invocations', previousJob.jobId); putBlob(previousInvocation, prompt);
  write(join(previousInvocation, 'job.json'), previousJob); write(join(previousInvocation, 'host-base-context-admission.json'), oldInventory);
  write(join(previousInvocation, 'private/app-server/host-session.jsonl'), journalBytes(previousRows));
  const cfg = { model: 'gpt-6-luna', config: { model_reasoning_effort: 'max', web_search: 'disabled' }, allowProviderModelFallback: false, baseInstructions: playerBaseInstructions, developerInstructions: playerDeveloperInstructions,
    approvalPolicy: 'never', sandbox: 'read-only', cwd: 'C:/Windows/Temp', dynamicTools: [], environments: [], runtimeWorkspaceRoots: [], selectedCapabilityRoots: [] };
  const thread = { model: 'gpt-6-luna', reasoningEffort: 'max', runtimeWorkspaceRoots: [], instructionSources: [], thread: { id: threadId, parentThreadId: null, forkedFromId: null, turns: [], environments: [], path: null } };
  const frames = [
    { direction: 'outbound', frame: { id: 1, method: 'initialize', params: {} } }, { direction: 'inbound', frame: { id: 1, result: {} } },
    { direction: 'outbound', frame: { method: 'initialized', params: {} } },
    { direction: 'outbound', frame: { id: 2, method: 'model/list', params: {} } }, { direction: 'inbound', frame: { id: 2, result: { data: [{ model: 'gpt-6-luna', supportedReasoningEfforts: [{ reasoningEffort: 'max' }] }] } } },
    { direction: 'outbound', frame: { id: 3, method: 'thread/start', params: cfg } }, { direction: 'inbound', frame: { id: 3, result: thread } },
    { direction: 'inbound', frame: { method: 'thread/started', params: { thread: { ...thread.thread, model: 'gpt-6-luna', reasoningEffort: 'max' } } } },
    { direction: 'outbound', frame: { id: 4, method: 'turn/start', params: { threadId, model: 'gpt-6-luna', effort: 'max', additionalContext: {}, environments: [], runtimeWorkspaceRoots: [], input: [{ type: 'text', text: prompt.toString(), text_elements: [] }] } } },
    { direction: 'inbound', frame: { id: 4, result: { turn: { id: turnId } } } }, { direction: 'inbound', frame: { method: 'turn/started', params: { threadId, turn: { id: turnId } } } },
    { direction: 'inbound', frame: { method: 'item/completed', params: { threadId, turnId, item: { id: 'typed-user', type: 'userMessage', content: [{ type: 'text', text: prompt.toString(), text_elements: [] }] } } } },
    { direction: 'inbound', frame: { method: 'item/completed', params: { threadId, turnId, item: { id: 'typed-final', type: 'agentMessage', phase: 'final', text: final } } } },
    { direction: 'inbound', frame: { method: 'rawResponseItem/completed', params: { threadId, turnId, item: hostRows[7].payload } } },
    { direction: 'inbound', frame: { method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed', error: null } } } },
    { direction: 'outbound', frame: { id: 5, method: 'thread/archive', params: { threadId } } }, { direction: 'inbound', frame: { id: 5, result: {} } },
  ];
  const processInfo = { schemaVersion: 'trix-app-server-process-1.0.0', executable, executableHash: sha(readFileSync(executable)), cwd: 'C:/Windows/Temp', launchedAt: time(0),
    adapterSourceHash: sourceHashes['scripts/trix-scenario-collection/app-server-bridge.mjs'], journalSourceHash: sourceHashes['scripts/trix-scenario-collection/journal.mjs'], args: ['app-server', '--listen', 'stdio://', ...features.flatMap(name => ['--disable', name]), '--enable', 'skip_host_skill_discovery'] };
  const capability = { schemaVersion: 'trix-app-server-capability-1.0.0', model: 'gpt-6-luna', effort: 'max', threadId, journalPath: `synthetic-${threadId}.jsonl`, instructionSources: [], request: cfg, response: thread, baseContextApproved: false };
  const invocationInfo = { schemaVersion: 'trix-app-server-invocation-1.0.0', invocationId: 'synthetic-invocation', jobId: job.jobId, threadId, turnId, model: 'gpt-6-luna', effort: 'max', promptHash: job.promptHash, responseHash: sha(Buffer.from(final)),
    baseContextDigest: previousContext.digest, actualBaseContextDigest: actualContext.digest, toolCallCount: 0, unclassifiedNotificationMethods: [], syntheticOnly: false, admitted: false, requiresPostTurnContextAudit: true,
    stoppedVerified: true, archived: true, hostJournalRef: { path: 'private/app-server/host-session.jsonl', sha256: sha(journalBytes(hostRows)) }, contextExportError: failureReason };
  const files = ['job.json', 'host-base-context-admission.json', 'private/app-server/job.json', 'private/app-server/process.json', 'private/app-server/capability.json', 'private/app-server/stopped.json', 'private/app-server/wire.jsonl', 'private/app-server/host-session.jsonl', 'private/app-server/context-audit.json', 'private/app-server/invocation.json', promptRef.path];
  const audit = { schemaVersion: 'trix-context-evidence-amendment-1.0.0', jobId: job.jobId, claimHash: claim.hash, previousContextJobId: previousJob.jobId, previousInventoryHash: sha(jsonBytes(oldInventory)), newInventory,
    previousDigest: previousContext.digest, actualDigest: actualContext.digest,
    changes: actualContext.parts.flatMap((part, index) => part.rawSha256 === previousContext.parts[index].rawSha256 ? [] : [{ index, source: part.source, beforeSha256: previousContext.parts[index].rawSha256, afterSha256: part.rawSha256 }]),
    evidenceHashes: {}, assessment: { changedContextReviewed: true, episodeSpecificFacts: false, otherSeatEvidence: false, hiddenFixtureMemory: false, summary: assessmentSummary, limitations: ['Synthetic fixture only; no live host call.'] } };
  const save = () => {
    write(join(invocation, 'job.json'), job); write(join(invocation, 'host-base-context-admission.json'), oldInventory); write(join(app, 'job.json'), job); write(join(app, 'process.json'), processInfo); write(join(app, 'capability.json'), capability);
    write(join(app, 'host-session.jsonl'), journalBytes(hostRows)); write(join(app, 'context-audit.json'), describeAppServerContext(journalBytes(hostRows), prompt)); write(join(app, 'invocation.json'), invocationInfo);
    write(join(previousInvocation, 'private/app-server/process.json'), processInfo);
    let previousHash = '0'.repeat(64); const wire = frames.map(({ direction, frame }, index) => {
      const bytes = Buffer.from(JSON.stringify(frame) + '\n'), body = { sequence: index + 1, at: time(index), direction, bytesBase64: bytes.toString('base64'), bytesHash: sha(bytes), previousHash };
      const row = { ...body, hash: sha(jsonBytes(body)) }; previousHash = row.hash; return row;
    });
    write(join(app, 'wire.jsonl'), Buffer.concat(wire.map(jsonBytes))); write(join(app, 'stopped.json'), { stoppedVerified: true, error: null, exit: { code: 0, signal: null }, wireFrames: wire.length, wireDigest: previousHash });
    audit.evidenceHashes = Object.fromEntries(files.map(path => [path, sha(readFileSync(join(invocation, path)))]));
    newInventory.audit.hostJournalSha256 = audit.evidenceHashes['private/app-server/host-session.jsonl'];
    newInventory.audit.contextAuditSha256 = audit.evidenceHashes['private/app-server/context-audit.json'];
  };
  const collector = { root, manifest: { sourceHashes }, state: () => ({ rows: readJournal(root), commits: [commit] }) };
  save();
  return { root, invocation, app, previousInvocation, collector, claim, audit, job, hostRows, frames, processInfo, invocationInfo, oldInventory, newInventory, reviewJob, proposal, commit, files, save, journalBytes,
    verify: () => verifyContextEvidence(collector, claim, audit) };
}

test('audited memory-only context drift replays exact completed host evidence without editing the original invocation', t => {
  const f = fixture(t), originals = Object.fromEntries(f.files.map(path => [path, readFileSync(join(f.invocation, path))]));
  const originalJournal = readFileSync(join(f.root, 'private/journal.jsonl'));
  assert.match(inspectAppServerEvidence(f.invocation, f.job).reason, /inventory not approved/);
  const result = f.verify();
  assert.equal(result.proof.schemaVersion, 'trix-context-response-proof-1.0.0'); assert.equal(result.proof.jobId, f.job.jobId); assert.equal(result.proof.claimHash, f.claim.hash);
  assert.equal(result.evidence.available, true); assert.deepEqual(JSON.parse(result.bytes.toString()), f.proposal); assert.equal(result.receipt.responseHash, sha(result.bytes));
  assert.deepEqual(result.reviewJob, f.reviewJob); assert.equal(result.proof.responseHash, sha(result.bytes));
  for (const path of f.files) assert.ok(readFileSync(join(f.invocation, path)).equals(originals[path]), `Original ${path} changed`);
  assert.ok(readFileSync(join(f.root, 'private/journal.jsonl')).equals(originalJournal), 'Reinspection cannot rewrite the original rejection');
  assert.equal(existsSync(join(f.invocation, 'response.txt')), false); assert.equal(existsSync(join(f.invocation, 'receipt.json')), false);
  const view = resolve(f.root, result.proof.viewPath); assert.ok(view.startsWith(f.root));
  assert.ok(readFileSync(join(view, 'response.txt')).equals(result.bytes));
  assert.deepEqual(JSON.parse(readFileSync(join(view, 'receipt.json'), 'utf8')), result.receipt);
  assert.deepEqual(f.verify().proof, result.proof, 'Repeated inspection must reuse the same immutable proof');
});

for (const mode of ['job-id', 'claim-hash', 'inventory-hash', 'previous-digest', 'actual-digest', 'changed-index', 'changed-source', 'changed-before', 'changed-after', 'evidence-hash', 'assessment', 'hidden-memory', 'new-inventory']) {
  test(`context amendment rejects ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'job-id') f.audit.jobId = 'wrong-job';
    if (mode === 'claim-hash') f.audit.claimHash = '0'.repeat(64);
    if (mode === 'inventory-hash') f.audit.previousInventoryHash = '0'.repeat(64);
    if (mode === 'previous-digest') f.audit.previousDigest = '0'.repeat(64);
    if (mode === 'actual-digest') f.audit.actualDigest = '0'.repeat(64);
    if (mode === 'changed-index') f.audit.changes[0].index++;
    if (mode === 'changed-source') f.audit.changes[0].source = 'developer:generic.developer_instructions';
    if (mode === 'changed-before') f.audit.changes[0].beforeSha256 = '0'.repeat(64);
    if (mode === 'changed-after') f.audit.changes[0].afterSha256 = '0'.repeat(64);
    if (mode === 'evidence-hash') f.audit.evidenceHashes['private/app-server/wire.jsonl'] = '0'.repeat(64);
    if (mode === 'assessment') f.audit.assessment.changedContextReviewed = false;
    if (mode === 'hidden-memory') f.audit.assessment.hiddenFixtureMemory = true;
    if (mode === 'new-inventory') f.audit.newInventory.approvedDigests = ['0'.repeat(64)];
    assert.throws(f.verify, undefined, mode);
  });
}

for (const mode of ['wire-corrupt', 'host-final-changed', 'host-tool', 'additional-turn', 'wrong-model', 'process-source', 'missing-host-journal', 'saved-original-output', 'non-memory-section', 'previous-not-earlier']) {
  test(`context evidence rejects ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'wire-corrupt') writeFileSync(join(f.app, 'wire.jsonl'), 'corrupted synthetic wire\n');
    if (mode === 'host-final-changed') { f.hostRows[7].payload.content[0].text = 'Different final'; f.save(); }
    if (mode === 'host-tool') { f.hostRows.splice(-1, 0, { type: 'response_item', payload: { type: 'function_call', name: 'synthetic-tool' } }); f.save(); }
    if (mode === 'additional-turn') { f.frames.push(structuredClone(f.frames[8])); f.save(); }
    if (mode === 'wrong-model') { f.frames[8].frame.params.model = 'other-model'; f.save(); }
    if (mode === 'process-source') { f.processInfo.adapterSourceHash = '0'.repeat(64); f.save(); }
    if (mode === 'missing-host-journal') rmSync(join(f.app, 'host-session.jsonl'));
    if (mode === 'saved-original-output') writeFileSync(join(f.invocation, 'response.txt'), 'Different final');
    if (mode === 'non-memory-section') { f.hostRows[2].payload.content[0].text += ' Changed other instructions.'; f.save(); }
    if (mode === 'previous-not-earlier') f.audit.previousContextJobId = f.job.jobId;
    assert.throws(f.verify, undefined, mode);
  });
}

for (const mode of ['evidence', 'hostJournalSha256', 'contextAuditSha256', 'previousDigest', 'classification', 'cwd', 'model', 'effort']) {
  test(`new context inventory rejects inconsistent ${mode} provenance`, t => {
    const f = fixture(t);
    f.newInventory.audit[mode] = mode.endsWith('Sha256') || mode === 'previousDigest' ? '0'.repeat(64) : 'Incorrect provenance';
    assert.throws(f.verify, undefined, mode);
  });
}

function replaceSavedFinal(f, proposal) {
  const bytes = Buffer.from(JSON.stringify(proposal, null, 2) + '\n');
  f.frames[12].frame.params.item.text = bytes.toString();
  f.hostRows[7].payload.content[0].text = bytes.toString();
  f.hostRows[8].payload.last_agent_message = bytes.toString();
  f.invocationInfo.responseHash = sha(bytes);
  f.invocationInfo.hostJournalRef.sha256 = sha(f.journalBytes(f.hostRows));
  f.save(); return bytes;
}

for (const mode of ['copied-packet-hash', 'invalid-review-schema', 'unknown-actor-reference']) {
  test(`context-only recovery cannot repair ${mode} in the saved proposal`, t => {
    const f = fixture(t), proposal = structuredClone(f.proposal);
    if (mode === 'copied-packet-hash') proposal.packetHash = '0'.repeat(64);
    if (mode === 'invalid-review-schema') proposal.rationaleStatus = 'perfect';
    if (mode === 'unknown-actor-reference') proposal.checks[0].evidenceRefs = ['actor:/hiddenHands'];
    replaceSavedFinal(f, proposal);
    assert.throws(f.verify, undefined, mode);
    assert.equal(existsSync(join(f.invocation, 'response.txt')), false);
  });
}

test('context recovery preserves a valid weak rationale without requesting or choosing another response', t => {
  const f = fixture(t), proposal = structuredClone(f.proposal);
  proposal.rationaleStatus = 'uncertain'; proposal.checks[0].status = 'unknown';
  const raw = replaceSavedFinal(f, proposal), result = f.verify();
  assert.ok(result.bytes.equals(raw)); assert.equal(JSON.parse(result.bytes.toString()).rationaleStatus, 'uncertain');
  assert.equal(readJournal(f.root).filter(row => row.kind === 'review-dispatch-claimed').length, 2);
});

test('a conflicting derived replay response stops immutable proof reuse', t => {
  const f = fixture(t), result = f.verify();
  writeFileSync(join(f.root, result.proof.viewPath, 'response.txt'), 'Conflicting derived response');
  assert.throws(f.verify, /Immutable artifact changed/);
  assert.equal(existsSync(join(f.invocation, 'response.txt')), false);
});
