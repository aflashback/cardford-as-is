import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { verifyReviewTimeoutInvocation } from '../../scripts/trix-scenario-collection/review-timeout-evidence.mjs';
import { describeAppServerContext, playerBaseInstructions, playerDeveloperInstructions } from '../../scripts/trix-scenario-collection/app-server-bridge.mjs';
import { appendEvent, jsonBytes, putBlob, readJournal, sha } from '../../scripts/trix-scenario-collection/journal.mjs';

const reason = 'write after end';
const time = seconds => new Date(Date.parse('2026-10-11T16:00:00.000Z') + seconds * 1000).toISOString();
const disabled = ['shell_tool','unified_exec','multi_agent','multi_agent_v2','code_mode_host','code_mode','computer_use','browser_use','browser_use_external','in_app_browser','plugins','remote_plugin','skill_search','skill_mcp_dependency_install','sleep_tool','tool_suggest'];

function fixture(t) {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'review-timeout-evidence-test-'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  const invocation = join(root, 'private/invocations/synthetic-job'), app = join(invocation, 'private/app-server'); mkdirSync(app, { recursive: true }); mkdirSync(join(root, 'outbox'));
  const write = (path, value) => writeFileSync(path, jsonBytes(value));
  const prompt = Buffer.from('Synthetic actor-safe review prompt. No real cards or private game data.');
  const promptRef = putBlob(root, prompt); putBlob(invocation, prompt);
  const job = { jobId: 'synthetic-job', dispatchToken: 'synthetic-token', promptHash: sha(prompt), promptRef, claimedAt: time(0), deadlineAt: time(300) };
  const review = { id: 'synthetic-review', stage: 'decision', promptHash: job.promptHash, promptRef };
  appendEvent(root, 'initialized', {});
  const claim = appendEvent(root, 'review-dispatch-claimed', { reviewId: review.id, stage: review.stage, job });
  appendEvent(root, 'review-attempt-settled', { jobId: job.jobId, status: 'rejected', reason });
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
    { direction: 'outbound', at: time(300), frame: { id: 5, method: 'turn/interrupt', params: { threadId, turnId } } },
  ];
  // Insert baseline notices when serializing without shifting the stable RPC
  // fixture indices used by the independent mutation cases below.
  const threadNotice = { before: frames[7], direction: 'inbound', at: time(6.5), frame: { method: 'thread/started', params: {
    thread: { ...structuredClone(thread.thread), model: 'gpt-6-luna', reasoningEffort: 'max' },
  } } };
  const typedNotice = { before: frames[10], direction: 'inbound', at: time(9.5), frame: { method: 'item/completed', params: {
    threadId, turnId, item: { id: 'typed-input', type: 'userMessage', content: structuredClone(frames[7].frame.params.input) },
  } } };
  const sourceHashes = Object.fromEntries(['app-server-bridge', 'journal'].map(name => [`scripts/trix-scenario-collection/${name}.mjs`, sha(readFileSync(resolve(`scripts/trix-scenario-collection/${name}.mjs`)))]));
  const processInfo = { adapterSourceHash: sourceHashes['scripts/trix-scenario-collection/app-server-bridge.mjs'], journalSourceHash: sourceHashes['scripts/trix-scenario-collection/journal.mjs'],
    executable: inventory.audit.hostExecutable, executableHash: sha(readFileSync(inventory.audit.hostExecutable)), cwd: 'C:/Windows/Temp',
    args: ['app-server', '--listen', 'stdio://', ...disabled.flatMap(name => ['--disable', name]), '--enable', 'skip_host_skill_discovery'] };
  const capability = { threadId, model: 'gpt-6-luna', effort: 'max', request: cfg, response: thread, journalPath: join(root, `rollout-synthetic-${threadId}.jsonl`) };
  const stopped = { stoppedVerified: true, error: reason, exit: { code: null, signal: 'SIGTERM' }, wireFrames: 0, wireDigest: '' };
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
    write(join(root, 'outbox', `${review.id}.json`), review); write(join(invocation, 'job.json'), job); write(join(app, 'job.json'), job);
    write(join(invocation, 'host-base-context-admission.json'), inventory); write(join(app, 'process.json'), processInfo); write(join(app, 'capability.json'), capability);
    writeFileSync(capability.journalPath, journalBytes()); saveWire();
  };
  const collector = { root, manifest: { sourceHashes }, state: () => ({ rows: readJournal(root) }) };
  const editRun = edit => {
    const rows = readJournal(root); edit(rows); let previousHash = '0'.repeat(64);
    const changed = rows.map(({ hash: _hash, ...body }, index) => { body.sequence = index + 1; body.previousHash = previousHash; const row = { ...body, hash: sha(jsonBytes(body)) }; previousHash = row.hash; return row; });
    writeFileSync(join(root, 'private/journal.jsonl'), Buffer.concat(changed.map(jsonBytes)));
    Object.assign(claim, changed.find(r => r.kind === 'review-dispatch-claimed' && r.data.job.jobId === job.jobId));
  };
  save();
  return { root, app, invocation, job, review, claim, inventory, collector, frames, threadNotice, typedNotice, hostRows, cfg, thread, processInfo, capability, stopped, save, saveWire, editRun,
    verify: () => verifyReviewTimeoutInvocation(collector, claim, inventory) };
}

test('absolute deadline proves local SIGTERM and no observed final while preserving original evidence', t => {
  const f = fixture(t), originals = ['job.json', 'host-base-context-admission.json', 'private/app-server/job.json', 'private/app-server/process.json', 'private/app-server/capability.json', 'private/app-server/stopped.json', 'private/app-server/wire.jsonl'];
  const hashes = Object.fromEntries(originals.map(path => [path, sha(readFileSync(join(f.invocation, path)))])), ledger = readFileSync(join(f.root, 'private/journal.jsonl'));
  const proof = f.verify();
  assert.equal(proof.schemaVersion, 'trix-review-timeout-invocation-1.0.0'); assert.equal(proof.classification, 'absolute-deadline-local-sigterm-no-observed-final');
  assert.equal(proof.acceptedResponse, false); assert.equal(proof.stoppedVerified, true); assert.equal(proof.claimHash, f.claim.hash);
  assert.equal(proof.model, 'gpt-6-luna'); assert.equal(proof.effort, 'max'); assert.equal(proof.wireFrames, f.frames.length + 2);
  assert.equal(proof.hostJournalSnapshot.path, `private/review-timeout/evidence/${f.job.jobId}/host-session.jsonl`);
  assert.ok(readFileSync(join(f.root, proof.hostJournalSnapshot.path)).equals(readFileSync(f.capability.journalPath)));
  for (const path of originals) assert.equal(sha(readFileSync(join(f.invocation, path))), hashes[path]);
  assert.ok(readFileSync(join(f.root, 'private/journal.jsonl')).equals(ledger));
  for (const path of ['response.txt', 'receipt.json', 'private/app-server/invocation.json', 'private/app-server/host-session.jsonl']) assert.equal(existsSync(join(f.invocation, path)), false);
  assert.deepEqual(f.verify(), proof);
});

const addBeforeInterrupt = (f, row) => f.frames.splice(-1, 0, row);
const notice = (method, params) => ({ direction: 'inbound', frame: { method, params } });
const stderr = f => ({ direction: 'stderr', frame: { timestamp: time(20), level: 'WARN', target: 'codex_core::responses_retry', fields: { turn_id: f.frames[9].frame.params.turn.id, message: 'stream disconnected - retrying sampling request (1/5 in 100ms)...', sampling_error: 'We’re currently experiencing high demand, which may cause temporary errors.', retries: 1, max_retries: 5 } } });

test('one exact same-turn high-demand retry warning is retained without certifying a response', t => {
  const f = fixture(t); addBeforeInterrupt(f, stderr(f)); f.save(); assert.equal(f.verify().acceptedResponse, false);
});

for (const mode of ['hash', 'tail', 'frame-bytes', 'stopped-digest', 'stopped-count', 'unverified-stop', 'wrong-error', 'clean-exit', 'wrong-signal', 'missing-stop']) {
  test(`timeout transport corruption or stop mismatch rejects ${mode}`, t => {
    const f = fixture(t), path = join(f.app, 'wire.jsonl');
    if (mode === 'hash' || mode === 'frame-bytes') { const rows = readFileSync(path, 'utf8').trim().split('\n').map(JSON.parse); if (mode === 'hash') rows[0].hash = '0'.repeat(64); else rows[0].bytesBase64 = Buffer.from('{}\n').toString('base64'); writeFileSync(path, Buffer.concat(rows.map(jsonBytes))); }
    if (mode === 'tail') { const bytes = readFileSync(path); writeFileSync(path, bytes.subarray(0, -1)); }
    if (mode === 'stopped-digest') f.stopped.wireDigest = '0'.repeat(64);
    if (mode === 'stopped-count') f.stopped.wireFrames++;
    if (mode === 'unverified-stop') f.stopped.stoppedVerified = false;
    if (mode === 'wrong-error') f.stopped.error = 'Other failure';
    if (mode === 'clean-exit') f.stopped.exit = { code: 0, signal: null };
    if (mode === 'wrong-signal') f.stopped.exit.signal = 'SIGKILL';
    writeFileSync(join(f.app, 'stopped.json'), jsonBytes(f.stopped));
    if (mode === 'missing-stop') rmSync(join(f.app, 'stopped.json'));
    assert.throws(f.verify);
  });
}

for (const mode of ['interrupt-ack', 'missing-interrupt', 'late-frame', 'extra-rpc', 'reused-id', 'second-turn', 'extra-response', 'completed-turn', 'interrupted-turn', 'wrong-interrupt-thread']) {
  test(`timeout recovery rejects incompatible RPC history ${mode}`, t => {
    const f = fixture(t), terminal = f.frames.at(-1), turnId = terminal.frame.params.turnId, threadId = terminal.frame.params.threadId;
    if (mode === 'interrupt-ack') addBeforeInterrupt(f, { direction: 'inbound', frame: { id: terminal.frame.id, result: {} } });
    if (mode === 'missing-interrupt') f.frames.pop();
    if (mode === 'late-frame') f.frames.push(notice('thread/status/changed', { threadId, status: 'idle' }));
    if (mode === 'extra-rpc') addBeforeInterrupt(f, { direction: 'outbound', frame: { id: 6, method: 'tools/call', params: {} } });
    if (mode === 'reused-id') terminal.frame.id = 3;
    if (mode === 'second-turn') addBeforeInterrupt(f, structuredClone(f.frames[7]));
    if (mode === 'extra-response') addBeforeInterrupt(f, { direction: 'inbound', frame: { id: 99, result: {} } });
    if (mode === 'completed-turn' || mode === 'interrupted-turn') addBeforeInterrupt(f, notice('turn/completed', { threadId, turn: { id: turnId, status: mode === 'completed-turn' ? 'completed' : 'interrupted', error: null } }));
    if (mode === 'wrong-interrupt-thread') terminal.frame.params.threadId = 'Other thread';
    f.save(); assert.throws(f.verify);
  });
}

for (const mode of ['typed-final', 'raw-final', 'wire-tool', 'journal-final', 'journal-tool', 'journal-completed', 'late-input', 'late-context', 'saved-response', 'saved-receipt', 'saved-invocation']) {
  test(`timeout output-free evidence rejects ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'typed-final') addBeforeInterrupt(f, notice('item/completed', { item: { id: 'bad-final', type: 'agentMessage', phase: 'final_answer', text: '{}' } }));
    if (mode === 'raw-final') addBeforeInterrupt(f, notice('rawResponseItem/completed', { item: { id: 'bad-final', type: 'message', role: 'assistant', phase: 'final', content: [{ type: 'output_text', text: '{}' }] } }));
    if (mode === 'wire-tool') addBeforeInterrupt(f, notice('item/completed', { item: { id: 'bad-tool', type: 'function_call', name: 'synthetic_tool' } }));
    if (mode === 'journal-final' || mode === 'late-input') f.hostRows.push({ timestamp: time(20), type: 'response_item', payload: { type: 'message', role: mode === 'journal-final' ? 'assistant' : 'user', content: [{ type: 'output_text', text: 'Unexpected input/output.' }] } });
    if (mode === 'journal-tool') f.hostRows.push({ timestamp: time(20), type: 'response_item', payload: { type: 'function_call', name: 'synthetic_tool' } });
    if (mode === 'journal-completed') f.hostRows.push({ timestamp: time(20), type: 'event_msg', payload: { type: 'task_complete' } });
    if (mode === 'late-context') f.hostRows.push({ ...structuredClone(f.hostRows[2]), timestamp: time(20) });
    f.save();
    if (mode.startsWith('saved-')) writeFileSync(join(f.invocation, mode === 'saved-response' ? 'response.txt' : mode === 'saved-receipt' ? 'receipt.json' : 'private/app-server/invocation.json'), '{}');
    assert.throws(f.verify);
  });
}

for (const mode of ['prompt', 'model', 'effort', 'fallback', 'parent', 'instructions', 'catalog', 'inventory', 'context', 'context-model', 'executable', 'source', 'args', 'journal-thread', 'typed-input', 'raw-join']) {
  test(`timeout evidence rejects changed trust binding ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'prompt') f.frames[7].frame.params.input[0].text += ' Changed.';
    if (mode === 'model') f.cfg.model = 'other-model';
    if (mode === 'effort') f.frames[7].frame.params.effort = 'low';
    if (mode === 'fallback') f.cfg.allowProviderModelFallback = true;
    if (mode === 'parent') f.thread.thread.parentThreadId = 'Other parent';
    if (mode === 'instructions') f.cfg.developerInstructions += ' Changed.';
    if (mode === 'catalog') f.frames[4].frame.result.data[0].model = 'other-model';
    if (mode === 'context') f.hostRows[0].payload.base_instructions.text += ' Changed.';
    if (mode === 'context-model') f.hostRows[2].payload.model = 'other-model';
    if (mode === 'executable') writeFileSync(f.processInfo.executable, 'Changed executable');
    if (mode === 'source') f.processInfo.adapterSourceHash = '0'.repeat(64);
    if (mode === 'args') f.processInfo.args.push('--enable', 'shell_tool');
    if (mode === 'journal-thread') f.hostRows[0].payload.id = 'Other thread';
    if (mode === 'typed-input') f.typedNotice.frame.params.item.content[0].text += ' Changed.';
    if (mode === 'raw-join') f.hostRows[5].payload = { ...f.hostRows[5].payload, summary: ['Changed'] };
    f.save();
    if (mode === 'inventory') writeFileSync(join(f.invocation, 'host-base-context-admission.json'), jsonBytes({ ...f.inventory, approvedDigests: ['0'.repeat(64)] }));
    assert.throws(f.verify);
  });
}

for (const mode of ['short-window', 'long-window', 'negative-window', 'invalid-window', 'early-interrupt', 'late-interrupt', 'wire-outside-window', 'journal-outside-window', 'claim-body-tamper', 'duplicate-claim', 'prior-attempt', 'wrong-settlement', 'duplicate-settlement', 'missing-settlement']) {
  test(`timeout first-attempt and strict deadline binding rejects ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'short-window') f.job.deadlineAt = time(299);
    if (mode === 'long-window') f.job.deadlineAt = time(301);
    if (mode === 'negative-window') f.job.deadlineAt = time(-1);
    if (mode === 'invalid-window') f.job.claimedAt = 'Invalid date';
    if (['short-window', 'long-window', 'negative-window', 'invalid-window'].includes(mode)) f.editRun(rows => { rows.find(row => row.kind === 'review-dispatch-claimed').data.job = structuredClone(f.job); });
    if (mode === 'early-interrupt') f.frames.at(-1).at = time(299);
    if (mode === 'late-interrupt') f.frames.at(-1).at = time(301);
    if (mode === 'wire-outside-window') f.frames[0].at = time(-1);
    if (mode === 'journal-outside-window') f.hostRows[5].timestamp = time(301);
    if (mode === 'claim-body-tamper') { f.claim.data.stage = 'game'; const { hash, ...body } = f.claim; f.claim.hash = sha(jsonBytes(body)); }
    if (mode === 'duplicate-claim') appendEvent(f.root, 'review-dispatch-claimed', f.claim.data);
    if (mode === 'prior-attempt') f.editRun(rows => { rows.splice(1, 0, { ...structuredClone(rows[1]), sequence: 1.5, data: { ...rows[1].data, job: { ...f.job, jobId: 'earlier-job' } } }); });
    if (mode === 'wrong-settlement') f.editRun(rows => { rows[2].data.reason = 'Other failure'; });
    if (mode === 'duplicate-settlement') appendEvent(f.root, 'review-attempt-settled', { jobId: f.job.jobId, status: 'rejected', reason });
    if (mode === 'missing-settlement') f.editRun(rows => { rows[2].kind = 'unrelated-event'; });
    f.save(); assert.throws(f.verify);
  });
}

for (const mode of ['extra-line', 'wrong-level', 'wrong-target', 'wrong-turn', 'wrong-retry', 'wrong-error', 'wrong-message', 'extra-field', 'late-timestamp']) {
  test(`timeout stderr allowlist rejects ${mode}`, t => {
    const f = fixture(t), row = stderr(f);
    if (mode === 'extra-line') addBeforeInterrupt(f, structuredClone(row));
    if (mode === 'wrong-level') row.frame.level = 'ERROR';
    if (mode === 'wrong-target') row.frame.target = 'Unknown subsystem';
    if (mode === 'wrong-turn') row.frame.fields.turn_id = 'Other turn';
    if (mode === 'wrong-retry') row.frame.fields.retries = 2;
    if (mode === 'wrong-error') row.frame.fields.sampling_error = 'Unrelated failure';
    if (mode === 'wrong-message') row.frame.fields.message = 'Unknown provider warning';
    if (mode === 'extra-field') row.frame.fields.extra = true;
    if (mode === 'late-timestamp') row.frame.timestamp = time(301);
    addBeforeInterrupt(f, row); f.save(); assert.throws(f.verify);
  });
}

test('changing the stopped own journal after immutable snapshot blocks proof reuse', t => {
  const f = fixture(t); f.verify(); f.hostRows[5].payload.summary = ['Different recorded reasoning']; f.save(); assert.throws(f.verify, /own host journal changed/);
});

