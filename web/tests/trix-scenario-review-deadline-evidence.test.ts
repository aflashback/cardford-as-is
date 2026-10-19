import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { verifyReviewDeadlineInvocation } from '../../scripts/trix-scenario-collection/review-deadline-evidence.mjs';
import { describeAppServerContext, playerBaseInstructions, playerDeveloperInstructions } from '../../scripts/trix-scenario-collection/app-server-bridge.mjs';
import { preserveBuild, sourceDigest } from '../../scripts/coach-lab-builds.mjs';
import { reviewDeadlineTransportSourceHash } from '../../scripts/trix-scenario-collection/review-deadline-evidence.mjs';
import { appendEvent, jsonBytes, putBlob, readJournal, sha } from '../../scripts/trix-scenario-collection/journal.mjs';

const reason = 'App-server invocation timeout';
const abortText = '<turn_aborted>\nThe previous turn was interrupted on purpose. Any running unified exec processes may still be running in the background. If any tools/commands were aborted, they may have partially executed.\n</turn_aborted>';
const guardFile = 'scripts/trix-scenario-collection/shutdown-safe-transport.mjs';
const time = seconds => new Date(Date.parse('2026-10-11T16:00:00.000Z') + seconds * 1000).toISOString();
const disabled = ['shell_tool','unified_exec','multi_agent','multi_agent_v2','code_mode_host','code_mode','computer_use','browser_use','browser_use_external','in_app_browser','plugins','remote_plugin','skill_search','skill_mcp_dependency_install','sleep_tool','tool_suggest'];

function fixture(t) {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'review-deadline-evidence-test-'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  const invocation = join(root, 'private/invocations/synthetic-job'), app = join(invocation, 'private/app-server'); mkdirSync(app, { recursive: true }); mkdirSync(join(root, 'outbox'));
  const write = (path, value) => writeFileSync(path, jsonBytes(value));
  const prompt = Buffer.from('Synthetic independent review prompt; no actual private game data.'), promptRef = putBlob(root, prompt); putBlob(invocation, prompt);
  const sourceHashes = Object.fromEntries(['scripts/trix-scenario-collection/app-server-bridge.mjs', 'scripts/trix-scenario-collection/journal.mjs'].map(path => [path, sha(readFileSync(resolve(path)))]));
  const job = { jobId: 'synthetic-job', dispatchToken: 'synthetic-token', promptHash: sha(prompt), promptRef, claimedAt: time(0), deadlineAt: time(300) };
  const review = { id: 'synthetic-review', stage: 'decision', subjectId: 'synthetic-episode:2:0', promptHash: job.promptHash, promptRef };
  const add = (kind, data, at) => { const row = appendEvent(root, kind, data); row.at = at; const { hash, ...body } = row; row.hash = sha(jsonBytes(body)); const rows = readJournal(root); rows[rows.length - 1] = row; writeFileSync(join(root, 'private/journal.jsonl'), Buffer.concat(rows.map(jsonBytes))); return row; };
  const worker = join(root, 'synthetic-native-worker.exe'); writeFileSync(worker, 'Synthetic native worker bytes; never launched.'); const binaryDigest = sha(readFileSync(worker));
  const manifest = { runId: 'synthetic-review-deadline-run', sourceHashes, build: { sourceDigest: sourceDigest(sourceHashes), binaryDigest } };
  const boundary = add('initialized', {}, time(-5));
  const hashes = { ...sourceHashes, [guardFile]: reviewDeadlineTransportSourceHash }, processingBuild = { sourceDigest: sourceDigest(hashes), binaryDigest };
  preserveBuild(root, resolve('.'), hashes, processingBuild, worker);
  const delegated = { policyVersion: 'trix-host-shutdown-guard-1.0.0', sourceFile: guardFile, sourceHash: reviewDeadlineTransportSourceHash, processingBuild, processingAudit: { originalSourceDigest: manifest.build.sourceDigest, reviewSourceDigest: processingBuild.sourceDigest, nativeBinaryDigest: binaryDigest }, adapterSourceHash: sourceHashes['scripts/trix-scenario-collection/app-server-bridge.mjs'], journalSourceHash: sourceHashes['scripts/trix-scenario-collection/journal.mjs'] };
  const recovery = { schemaVersion: 'trix-review-timeout-recovery-1.0.0', runId: manifest.runId, originalManifestHash: sha(jsonBytes(manifest)), originalSourceDigest: manifest.build.sourceDigest, nativeBinaryDigest: binaryDigest, previousBoundary: { sequence: boundary.sequence, hash: boundary.hash }, sourceHashes: hashes, processingBuild, transportDelegation: delegated };
  const recoveryHash = sha(jsonBytes(recovery)), recoveryPath = `private/review-timeout/recoveries/${recoveryHash}.json`; mkdirSync(join(root, 'private/review-timeout/recoveries'), { recursive: true }); write(join(root, recoveryPath), recovery);
  const authorization = add('review-timeout-recovery-authorized', { recoveryHash, recoveryPath }, time(-4));
  const claim = add('review-dispatch-claimed', { reviewId: review.id, stage: review.stage, job }, time(0)), settlement = add('review-attempt-settled', { jobId: job.jobId, status: 'rejected', reason }, time(300.168));
  const threadId = '019a0201-1000-7000-8000-000000000001', turnId = 'synthetic-turn';
  const context = { turn_id: turnId, root_turn_id: turnId, model: 'gpt-6-luna', effort: 'max', current_date: '2026-10-11', cwd: 'C:/Windows/Temp' };
  const hostRows = [
    { timestamp: time(0), type: 'session_meta', payload: { id: threadId, base_instructions: { text: playerBaseInstructions } } },
    { timestamp: time(8.5), type: 'event_msg', payload: { type: 'task_started', turn_id: turnId } },
    { timestamp: time(9), type: 'turn_context', payload: context },
    { timestamp: time(9.25), type: 'response_item', payload: { id: 'synthetic-user-input', type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt.toString() }], internal_chat_message_metadata_passthrough: { turn_id: turnId, content_item_kinds: ['user.text'] } } },
    { timestamp: time(9.5), type: 'event_msg', payload: { type: 'item_completed', thread_id: threadId, turn_id: turnId,
      item: { type: 'UserMessage', id: 'typed-input', content: [{ type: 'text', text: prompt.toString(), text_elements: [] }] } } },
    { timestamp: time(10), type: 'response_item', payload: { id: 'synthetic-reasoning', type: 'reasoning', summary: [] } },
    { timestamp: time(300.003), type: 'response_item', payload: { id: 'abort-notice', type: 'message', role: 'developer', content: [{ type: 'input_text', text: abortText }], internal_chat_message_metadata_passthrough: { turn_id: turnId, create_time: Date.parse(time(300.003)) / 1000, content_item_kinds: ['generic.turn_aborted'] } } },
    { timestamp: time(300.006), type: 'event_msg', payload: { type: 'turn_aborted', turn_id: turnId, root_turn_id: turnId, reason: 'interrupted', started_at: Date.parse(time(9)) / 1000, completed_at: Date.parse(time(300)) / 1000, duration_ms: 291007 } },
  ];
  const journalBytes = () => Buffer.from(hostRows.map((row, ordinal) => JSON.stringify({ ordinal, timestamp: time(ordinal), ...row }) + '\n').join(''));
  const inventory = { schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: [describeAppServerContext(journalBytes(), prompt).digest], audit: { hostExecutable: join(root, 'synthetic-host.exe') } };
  writeFileSync(inventory.audit.hostExecutable, 'Synthetic executable bytes; never launched.');
  const cfg = { model: 'gpt-6-luna', config: { model_reasoning_effort: 'max', web_search: 'disabled' }, allowProviderModelFallback: false,
    baseInstructions: playerBaseInstructions, developerInstructions: playerDeveloperInstructions, approvalPolicy: 'never', sandbox: 'read-only', cwd: 'C:/Windows/Temp',
    dynamicTools: [], environments: [], runtimeWorkspaceRoots: [], selectedCapabilityRoots: [] };
  const thread = { model: 'gpt-6-luna', reasoningEffort: 'max', thread: { id: threadId, parentThreadId: null, forkedFromId: null, turns: [], environments: [] }, runtimeWorkspaceRoots: [] };
  const frames = [
    { direction: 'outbound', frame: { id: 1, method: 'initialize', params: {} } },
    { direction: 'inbound', frame: { id: 1, result: {} } },
    { direction: 'outbound', frame: { method: 'initialized', params: {} } },
    { direction: 'outbound', frame: { id: 2, method: 'model/list', params: {} } },
    { direction: 'inbound', frame: { id: 2, result: { data: [{ model: 'gpt-6-luna', supportedReasoningEfforts: [{ reasoningEffort: 'max' }] }] } } },
    { direction: 'outbound', frame: { id: 3, method: 'thread/start', params: cfg } },
    { direction: 'inbound', frame: { id: 3, result: thread } },
    { direction: 'outbound', frame: { id: 4, method: 'turn/start', params: { threadId, model: 'gpt-6-luna', effort: 'max', additionalContext: {}, environments: [], runtimeWorkspaceRoots: [], input: [{ type: 'text', text: prompt.toString(), text_elements: [] }] } } },
    { direction: 'inbound', frame: { id: 4, result: { turn: { id: turnId } } } },
    { direction: 'inbound', frame: { method: 'turn/started', params: { threadId, turn: { id: turnId } } } },
    { direction: 'inbound', frame: { method: 'mcpServer/startupStatus/updated', params: { name: 'codex_apps', status: 'ready', error: null, failureReason: null } } },
    { direction: 'inbound', frame: { method: 'mcpServer/startupStatus/updated', params: { name: 'node_repl', status: 'ready', error: null, failureReason: null } } },
    { direction: 'inbound', frame: { method: 'rawResponseItem/completed', params: { threadId, turnId, item: hostRows[5].payload } } },
    { direction: 'inbound', at: time(295), frame: { method: 'item/started', params: { threadId, turnId, startedAtMs: Date.parse(time(295)), item: { type: 'agentMessage', id: 'partial-agent', text: '', phase: 'final_answer', memoryCitation: null, delivery: null, questions: null } } } },
    { direction: 'inbound', at: time(295.001), frame: { method: 'item/agentMessage/delta', params: { threadId, turnId, itemId: 'partial-agent', delta: '{"synthetic":"' } } },
    { direction: 'inbound', at: time(299.985), frame: { method: 'item/agentMessage/delta', params: { threadId, turnId, itemId: 'partial-agent', delta: 'partial \u2665 text' } } },
  ];
  // Insert baseline notices when serializing without shifting the stable RPC
  // fixture indices used by the independent mutation cases below.
  const threadNotice = { before: frames[7], direction: 'inbound', at: time(6.5), frame: { method: 'thread/started', params: {
    thread: { ...structuredClone(thread.thread), model: 'gpt-6-luna', reasoningEffort: 'max' },
  } } };
  const typedNotice = { before: frames[10], direction: 'inbound', at: time(9.5), frame: { method: 'item/completed', params: {
    threadId, turnId, item: { id: 'typed-input', type: 'userMessage', content: structuredClone(frames[7].frame.params.input) },
  } } };
  const processInfo = { launchedAt: time(0), adapterSourceHash: sourceHashes['scripts/trix-scenario-collection/app-server-bridge.mjs'], journalSourceHash: sourceHashes['scripts/trix-scenario-collection/journal.mjs'],
    executable: inventory.audit.hostExecutable, executableHash: sha(readFileSync(inventory.audit.hostExecutable)), cwd: 'C:/Windows/Temp',
    args: ['app-server', '--listen', 'stdio://', ...disabled.flatMap(name => ['--disable', name]), '--enable', 'skip_host_skill_discovery'] };
  const capability = { threadId, model: 'gpt-6-luna', effort: 'max', request: cfg, response: thread, journalPath: join(root, `rollout-synthetic-${threadId}.jsonl`) };
  const stopped = { stoppedVerified: true, error: null, exit: { code: 0, signal: null }, wireFrames: 0, wireDigest: '' };
  const saveWire = () => {
    let previousHash = '0'.repeat(64);
    const expanded = frames.flatMap((frame, i) => [...[threadNotice, typedNotice].filter(notice => notice.before === frame), { ...frame, at: frame.at ?? time(i) }]);
    const rows = expanded.map(({ direction, frame, at }, i) => {
      const bytes = Buffer.from(JSON.stringify(frame) + '\n');
      const body = { sequence: i + 1, at: at ?? time(i), direction, bytesBase64: bytes.toString('base64'), bytesHash: sha(bytes), previousHash };
      const row = { ...body, hash: sha(jsonBytes(body)) }; previousHash = row.hash; return row;
    });
    writeFileSync(join(app, 'wire.jsonl'), Buffer.concat(rows.map(jsonBytes))); stopped.wireFrames = rows.length; stopped.wireDigest = previousHash; write(join(app, 'stopped.json'), stopped);
  };
  const save = () => {
    write(join(root, 'outbox', `${review.id}.json`), review); write(join(app, 'shutdown-guard.json'), { schemaVersion: delegated.policyVersion, jobId: job.jobId, sourceHash: delegated.sourceHash }); write(join(invocation, 'job.json'), job); write(join(app, 'job.json'), job);
    write(join(invocation, 'host-base-context-admission.json'), inventory); write(join(app, 'process.json'), processInfo); write(join(app, 'capability.json'), capability);
    writeFileSync(capability.journalPath, journalBytes()); saveWire();
  };
  const collector = { root, sourceRoot: resolve('.'), manifest, state: () => ({ rows: readJournal(root) }) };
  const editRun = edit => {
    const rows = readJournal(root); edit(rows); let previousHash = '0'.repeat(64);
    const changed = rows.map(({ hash: _hash, ...body }, index) => { body.sequence = index + 1; body.previousHash = previousHash; const row = { ...body, hash: sha(jsonBytes(body)) }; previousHash = row.hash; return row; });
    writeFileSync(join(root, 'private/journal.jsonl'), Buffer.concat(changed.map(jsonBytes)));
    Object.assign(claim, changed.find(r => r.kind === 'review-dispatch-claimed' && r.data.job.jobId === job.jobId));
  };
  save();
  return { root, app, invocation, job, review, claim, settlement, recovery, recoveryPath, authorization, delegated, inventory, collector, frames, threadNotice, typedNotice, hostRows, cfg, thread, processInfo, capability, stopped, save, saveWire, editRun,
    verify: () => verifyReviewDeadlineInvocation(collector, claim, inventory) };
}

const outputBytes = f => Buffer.from(f.frames.filter(row => row.frame.method === 'item/agentMessage/delta').map(row => row.frame.params.delta).join(''));
const notice = (method, params, at = time(20)) => ({ direction: 'inbound', at, frame: { method, params } });

test('review deadline preserves incomplete UTF-8 output as evidence without admitting or importing it', t => {
  const f = fixture(t), files = ['job.json', 'host-base-context-admission.json', 'private/app-server/job.json', 'private/app-server/process.json', 'private/app-server/capability.json', 'private/app-server/stopped.json', 'private/app-server/wire.jsonl', 'private/app-server/shutdown-guard.json'];
  const originals = Object.fromEntries(files.map(path => [path, readFileSync(join(f.invocation, path))])), ledger = readFileSync(join(f.root, 'private/journal.jsonl')), bytes = outputBytes(f);
  const proof = f.verify(); assert.equal(proof.schemaVersion, 'trix-review-deadline-invocation-1.0.0'); assert.equal(proof.classification, 'absolute-deadline-local-clean-stop-partial-output-no-completed-final');
  assert.equal(proof.acceptedResponse, false); assert.equal(proof.completedFinalObserved, false); assert.equal(proof.partialOutputObserved, true);
  assert.equal(proof.claimHash, f.claim.hash); assert.equal(proof.settlementHash, f.settlement.hash); assert.equal(proof.reviewJobHash, sha(jsonBytes(f.review)));
  assert.equal(proof.partialOutput.itemId, 'partial-agent'); assert.equal(proof.partialOutput.deltaCount, 2); assert.equal(proof.partialOutput.byteLength, bytes.length); assert.equal(proof.partialOutput.sha256, sha(bytes));
  assert.ok(readFileSync(join(f.root, proof.partialOutput.path)).equals(bytes)); assert.throws(() => JSON.parse(bytes.toString('utf8')));
  assert.ok(readFileSync(join(f.root, proof.hostJournalSnapshot.path)).equals(readFileSync(f.capability.journalPath)));
  assert.deepEqual(f.verify(), proof); assert.ok(readFileSync(join(f.root, 'private/journal.jsonl')).equals(ledger));
  for (const path of files) assert.ok(readFileSync(join(f.invocation, path)).equals(originals[path]));
  for (const path of ['response.txt', 'receipt.json', 'private/app-server/invocation.json', 'private/app-server/host-session.jsonl']) assert.equal(existsSync(join(f.invocation, path)), false);
});

test('valid-looking JSON deltas remain unaccepted without completed message and turn evidence', t => {
  const f = fixture(t); f.frames.at(-2).frame.params.delta = '{"synthetic":'; f.frames.at(-1).frame.params.delta = 'true}'; f.save();
  assert.deepEqual(JSON.parse(outputBytes(f).toString()), { synthetic: true }); assert.equal(f.verify().acceptedResponse, false);
});

for (const mode of ['missing-start', 'missing-deltas', 'second-start', 'nonempty-start', 'wrong-phase', 'start-extra-field', 'start-content', 'wrong-item-id', 'wrong-delta-thread', 'wrong-delta-turn', 'delta-extra-field', 'empty-delta', 'invalid-utf8', 'before-start', 'out-of-order-time', 'interleaved-reasoning', 'interleaved-input', 'completed-agent', 'raw-assistant', 'completed-turn', 'tool']) {
  test(`partial review stream rejects ${mode}`, t => {
    const f = fixture(t), start = f.frames.at(-3), delta = f.frames.at(-1);
    if (mode === 'missing-start') f.frames.splice(-3, 1);
    if (mode === 'missing-deltas') f.frames.splice(-2);
    if (mode === 'second-start') f.frames.splice(-2, 0, structuredClone(start));
    if (mode === 'nonempty-start') start.frame.params.item.text = 'Unexpected initial output';
    if (mode === 'wrong-phase') start.frame.params.item.phase = 'commentary';
    if (mode === 'start-extra-field') start.frame.params.extra = true;
    if (mode === 'start-content') start.frame.params.item.memoryCitation = { hidden: 'Unknown inherited citation' };
    if (mode === 'wrong-item-id') delta.frame.params.itemId = 'Other item';
    if (mode === 'wrong-delta-thread') delta.frame.params.threadId = 'Other thread';
    if (mode === 'wrong-delta-turn') delta.frame.params.turnId = 'Other turn';
    if (mode === 'delta-extra-field') delta.frame.params.extra = true;
    if (mode === 'empty-delta') delta.frame.params.delta = '';
    if (mode === 'invalid-utf8') delta.frame.params.delta = '\ud800';
    if (mode === 'before-start') [f.frames[f.frames.length - 3], f.frames[f.frames.length - 2]] = [f.frames.at(-2), start];
    if (mode === 'out-of-order-time') delta.at = time(295);
    if (mode === 'interleaved-reasoning') f.frames.splice(-1, 0, notice('item/reasoning/summaryTextDelta', { delta: 'Additional reasoning' }, time(296)));
    if (mode === 'interleaved-input') f.frames.splice(-1, 0, notice('rawResponseItem/completed', { item: structuredClone(f.hostRows[3].payload) }, time(296)));
    if (mode === 'completed-agent') f.frames.push(notice('item/completed', { item: { ...start.frame.params.item, text: outputBytes(f).toString() } }, time(299.99)));
    if (mode === 'raw-assistant') f.frames.push(notice('rawResponseItem/completed', { item: { type: 'message', role: 'assistant', phase: 'final', content: [{ type: 'output_text', text: '{}' }] } }, time(299.99)));
    if (mode === 'completed-turn') f.frames.push(notice('turn/completed', { turn: { id: delta.frame.params.turnId, status: 'completed', error: null } }, time(299.99)));
    if (mode === 'tool') f.frames.splice(-3, 0, notice('item/completed', { item: { type: 'function_call', name: 'synthetic_tool' } }));
    f.save(); assert.throws(f.verify);
  });
}

for (const mode of ['hash', 'tail', 'stop-count', 'stop-digest', 'stop-error', 'sigterm', 'unverified-stop', 'interrupt', 'archive', 'unacked-rpc', 'second-turn', 'stderr']) {
  test(`review deadline requires clean complete transport capture: ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'stop-count') f.stopped.wireFrames++;
    if (mode === 'stop-digest') f.stopped.wireDigest = '0'.repeat(64);
    if (mode === 'stop-error') f.stopped.error = 'write after end';
    if (mode === 'sigterm') f.stopped.exit = { code: null, signal: 'SIGTERM' };
    if (mode === 'unverified-stop') f.stopped.stoppedVerified = false;
    if (mode === 'interrupt' || mode === 'archive') f.frames.push({ direction: 'outbound', at: time(300), frame: { id: 5, method: mode === 'interrupt' ? 'turn/interrupt' : 'thread/archive', params: {} } });
    if (mode === 'unacked-rpc') f.frames.splice(8, 1);
    if (mode === 'second-turn') f.frames.splice(-3, 0, structuredClone(f.frames[7]));
    if (mode === 'stderr') f.frames.splice(-3, 0, { direction: 'stderr', frame: { level: 'WARN', message: 'Unclassified warning' } });
    const stop = structuredClone(f.stopped); f.save();
    if (mode === 'stop-count' || mode === 'stop-digest') writeFileSync(join(f.app, 'stopped.json'), jsonBytes(stop));
    if (mode === 'hash') { const path = join(f.app, 'wire.jsonl'), rows = readFileSync(path, 'utf8').trim().split('\n').map(JSON.parse); rows[0].hash = '0'.repeat(64); writeFileSync(path, Buffer.concat(rows.map(jsonBytes))); }
    if (mode === 'tail') { const path = join(f.app, 'wire.jsonl'), bytes = readFileSync(path); writeFileSync(path, bytes.subarray(0, -1)); }
    assert.throws(f.verify);
  });
}

for (const mode of ['model', 'effort', 'fallback', 'parent', 'instructions', 'prompt', 'typed-input', 'raw-join', 'inventory', 'context', 'context-model', 'executable', 'source', 'args', 'guard', 'build', 'metadata', 'wrong-review']) {
  test(`partial review requires original trusted provenance: ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'model') f.cfg.model = 'other-model';
    if (mode === 'effort') f.frames[7].frame.params.effort = 'low';
    if (mode === 'fallback') f.cfg.allowProviderModelFallback = true;
    if (mode === 'parent') f.thread.thread.parentThreadId = 'Other parent';
    if (mode === 'instructions') f.cfg.developerInstructions += ' Changed.';
    if (mode === 'prompt') f.frames[7].frame.params.input[0].text += ' Changed.';
    if (mode === 'typed-input') f.typedNotice.frame.params.item.content[0].text += ' Changed.';
    if (mode === 'raw-join') f.hostRows[5].payload = { ...f.hostRows[5].payload, summary: ['Other recorded reasoning'] };
    if (mode === 'context') f.hostRows[0].payload.base_instructions.text += ' Changed.';
    if (mode === 'context-model') f.hostRows[2].payload.model = 'other-model';
    if (mode === 'executable') writeFileSync(f.processInfo.executable, 'Changed executable');
    if (mode === 'source') f.processInfo.adapterSourceHash = '0'.repeat(64);
    if (mode === 'args') f.processInfo.args.push('--enable', 'shell_tool');
    if (mode === 'wrong-review') f.review.stage = 'game';
    f.save();
    if (mode === 'inventory') writeFileSync(join(f.invocation, 'host-base-context-admission.json'), jsonBytes({ ...f.inventory, approvedDigests: ['0'.repeat(64)] }));
    if (mode === 'guard') writeFileSync(join(f.app, 'shutdown-guard.json'), jsonBytes({ schemaVersion: f.delegated.policyVersion, jobId: f.job.jobId, sourceHash: '0'.repeat(64) }));
    if (mode === 'build') writeFileSync(join(f.root, 'builds', f.delegated.processingBuild.sourceDigest, f.delegated.processingBuild.binaryDigest, 'source', guardFile), 'Changed frozen bytes');
    if (mode === 'metadata') { f.recovery.runId = 'Other run'; writeFileSync(join(f.root, f.recoveryPath), jsonBytes(f.recovery)); }
    assert.throws(f.verify);
  });
}

for (const mode of ['short-window', 'long-window', 'late-delta', 'early-settlement', 'wrong-settlement', 'duplicate-settlement', 'duplicate-claim', 'prior-attempt', 'saved-response', 'saved-receipt', 'saved-invocation']) {
  test(`partial review deadline preserves first attempt and reconciliation boundaries: ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'short-window' || mode === 'long-window') { f.job.deadlineAt = time(mode === 'short-window' ? 299 : 301); f.editRun(rows => { rows.find(row => row.kind === 'review-dispatch-claimed').data.job = structuredClone(f.job); }); }
    if (mode === 'late-delta') f.frames.at(-1).at = time(300.001);
    if (mode === 'early-settlement') f.editRun(rows => { rows.find(row => row.kind === 'review-attempt-settled').at = time(299); });
    if (mode === 'wrong-settlement') f.editRun(rows => { rows.find(row => row.kind === 'review-attempt-settled').data.reason = 'Other failure'; });
    if (mode === 'duplicate-settlement') appendEvent(f.root, 'review-attempt-settled', f.settlement.data);
    if (mode === 'duplicate-claim') appendEvent(f.root, 'review-dispatch-claimed', f.claim.data);
    if (mode === 'prior-attempt') f.editRun(rows => { const index = rows.findIndex(row => row.kind === 'review-dispatch-claimed'); rows.splice(index, 0, { ...structuredClone(rows[index]), data: { ...f.claim.data, job: { ...f.job, jobId: 'earlier-job' } } }); });
    f.save();
    if (mode.startsWith('saved-')) writeFileSync(join(f.invocation, mode === 'saved-response' ? 'response.txt' : mode === 'saved-receipt' ? 'receipt.json' : 'private/app-server/invocation.json'), '{}');
    assert.throws(f.verify);
  });
}

for (const mode of ['unknown-abort', 'wrong-turn', 'wrong-root', 'early-abort', 'late-abort', 'extra-input', 'journal-final', 'tool', 'late-context', 'task-complete']) {
  test(`partial review requires exact same-turn host abort: ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'unknown-abort') f.hostRows[6].payload.content[0].text += ' Unknown instructions.';
    if (mode === 'wrong-turn') f.hostRows[6].payload.internal_chat_message_metadata_passthrough.turn_id = 'Other turn';
    if (mode === 'wrong-root') f.hostRows[7].payload.root_turn_id = 'Other turn';
    if (mode === 'early-abort') f.hostRows[6].timestamp = time(299);
    if (mode === 'late-abort') f.hostRows[7].timestamp = time(301.001);
    if (mode === 'extra-input' || mode === 'journal-final') f.hostRows.splice(6, 0, { timestamp: time(20), type: 'response_item', payload: { type: 'message', role: mode === 'extra-input' ? 'user' : 'assistant', content: [{ type: 'input_text', text: 'Unexpected message.' }] } });
    if (mode === 'tool') f.hostRows.splice(6, 0, { timestamp: time(20), type: 'response_item', payload: { type: 'function_call', name: 'synthetic_tool' } });
    if (mode === 'late-context') f.hostRows.splice(6, 0, { ...structuredClone(f.hostRows[2]), timestamp: time(20) });
    if (mode === 'task-complete') f.hostRows.splice(6, 0, { timestamp: time(20), type: 'event_msg', payload: { type: 'task_complete' } });
    f.save(); assert.throws(f.verify);
  });
}

function recordImportedReceipt(f, supplied, recovered = false) {
  const receipt = { ...supplied, promptHash: f.job.promptHash };
  let claim = readJournal(f.root).find(row => row.kind === 'review-dispatch-claimed' && row.data.job.jobId === receipt.jobId);
  if (!claim) claim = appendEvent(f.root, 'review-dispatch-claimed', { ...f.claim.data, job: { ...f.job, jobId: receipt.jobId, dispatchToken: receipt.dispatchToken } });
  const hostEvidenceRef = putBlob(f.root, recovered ? { contextRecoveryHash: 'b'.repeat(64), proof: { schemaVersion: 'trix-context-response-proof-1.0.0', jobId: receipt.jobId }, evidence: { available: true }, receipt } : { transportJob: claim.data.job, receipt });
  const wrapper = { reviewerId: receipt.hostAgentId, promptHash: f.job.promptHash, responseHash: 'a'.repeat(64), contextMode: 'independent-review', hostEvidenceRef };
  appendEvent(f.root, 'review-imported', { stage: f.review.stage, subjectId: f.review.subjectId, reviewerReceiptRef: putBlob(f.root, wrapper) });
}
for (const binding of ['jobId', 'dispatchToken', 'hostAgentId']) test(`timed-out review cannot already be imported under matching ${binding} receipt provenance`, t => {
  const f = fixture(t), receipt = { jobId: 'Other job', dispatchToken: 'Other token', hostAgentId: 'Other host' };
  receipt[binding] = binding === 'hostAgentId' ? f.capability.threadId : f.job[binding]; recordImportedReceipt(f, receipt); assert.throws(f.verify);
});

test('later legitimate second-attempt import does not erase or invalidate the failed partial-stream proof', t => {
  const f = fixture(t), proof = f.verify(); appendEvent(f.root, 'review-dispatch-claimed', { ...f.claim.data, job: { ...f.job, jobId: 'second-job', dispatchToken: 'second-token' } });
  appendEvent(f.root, 'review-attempt-settled', { jobId: 'second-job', status: 'accepted' }); recordImportedReceipt(f, { jobId: 'second-job', dispatchToken: 'second-token', hostAgentId: 'second-host' });
  assert.deepEqual(f.verify(), proof);
});

test('historical context-recovered wrapper without transportJob remains bound through its original host claim', t => {
  const f = fixture(t); recordImportedReceipt(f, { jobId: 'historical-context-job', dispatchToken: 'historical-token', hostAgentId: 'historical-host' }, true);
  assert.equal(f.verify().acceptedResponse, false);
});

test('context-recovered receipt shape cannot hide the timed-out host identity', t => {
  const f = fixture(t); recordImportedReceipt(f, { jobId: 'context-job', dispatchToken: 'context-token', hostAgentId: f.capability.threadId }, true);
  assert.throws(f.verify);
});

test('immutable partial artifact cannot be replaced with repaired or preferred output', t => {
  const f = fixture(t), proof = f.verify(); writeFileSync(join(f.root, proof.partialOutput.path), '{"repaired":true}'); assert.throws(f.verify, /Immutable artifact changed/);
});

