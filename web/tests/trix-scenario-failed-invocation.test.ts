import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { verifyFailedReviewInvocation } from '../../scripts/trix-scenario-collection/failed-invocation.mjs';
import { describeAppServerContext, playerBaseInstructions, playerDeveloperInstructions } from '../../scripts/trix-scenario-collection/app-server-bridge.mjs';
import { appendEvent, jsonBytes, putBlob, readJournal, sha } from '../../scripts/trix-scenario-collection/journal.mjs';

const reason = 'Unexpected MCP infrastructure startup failure';
const abortText = '<turn_aborted>\nThe previous turn was interrupted on purpose. Any running unified exec processes may still be running in the background. If any tools/commands were aborted, they may have partially executed.\n</turn_aborted>';
const time = seconds => new Date(Date.parse('2026-10-11T16:00:00.000Z') + seconds * 1000).toISOString();
const disabled = ['shell_tool','unified_exec','multi_agent','multi_agent_v2','code_mode_host','code_mode','computer_use','browser_use','browser_use_external','in_app_browser','plugins','remote_plugin','skill_search','skill_mcp_dependency_install','sleep_tool','tool_suggest'];

function fixture(t) {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'failed-invocation-test-'));
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
    { timestamp: time(12.5), type: 'response_item', payload: { id: 'synthetic-abort-notice', type: 'message', role: 'developer', content: [{ type: 'input_text', text: abortText }],
      internal_chat_message_metadata_passthrough: { turn_id: turnId, create_time: Date.parse(time(12.5)) / 1000, content_item_kinds: ['generic.turn_aborted'] } } },
    { timestamp: time(13), type: 'event_msg', payload: { type: 'turn_aborted', turn_id: turnId, root_turn_id: turnId, reason: 'interrupted' } },
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
    { direction: 'inbound', frame: { method: 'mcpServer/startupStatus/updated', params: { name: 'codex_apps', status: 'failed', error: 'MCP client for `codex_apps` timed out after 30 seconds. Synthetic fixture.', failureReason: null } } },
    { direction: 'outbound', frame: { id: 5, method: 'turn/interrupt', params: { threadId, turnId } } },
    { direction: 'inbound', frame: { id: 5, result: {} } },
    { direction: 'inbound', frame: { method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'interrupted', error: null } } } },
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
    write(join(root, 'outbox', `${review.id}.json`), review); write(join(invocation, 'job.json'), job); write(join(app, 'job.json'), job);
    write(join(invocation, 'host-base-context-admission.json'), inventory); write(join(app, 'process.json'), processInfo); write(join(app, 'capability.json'), capability);
    writeFileSync(join(app, 'failed-host-session.jsonl'), journalBytes()); saveWire();
  };
  const collector = { root, manifest: { sourceHashes }, state: () => ({ rows: readJournal(root) }) };
  const editRun = edit => {
    const rows = readJournal(root); edit(rows); let previousHash = '0'.repeat(64);
    const changed = rows.map(({ hash: _hash, ...body }) => { body.previousHash = previousHash; const row = { ...body, hash: sha(jsonBytes(body)) }; previousHash = row.hash; return row; });
    writeFileSync(join(root, 'private/journal.jsonl'), Buffer.concat(changed.map(jsonBytes)));
    Object.assign(claim, changed.find(r => r.kind === 'review-dispatch-claimed'));
  };
  save();
  return { root, app, invocation, job, review, claim, inventory, collector, frames, threadNotice, typedNotice, hostRows, cfg, thread, processInfo, capability, stopped, save, saveWire, editRun,
    verify: () => verifyFailedReviewInvocation(collector, claim, inventory) };
}

test('synthetic MCP startup timeout is proved stopped and interrupted without admitting output', t => {
  const f = fixture(t), proof = f.verify();
  assert.equal(proof.classification, 'mcp-startup-timeout-interrupted-no-final'); assert.equal(proof.acceptedResponse, false); assert.equal(proof.stoppedVerified, true);
  assert.equal(proof.model, 'gpt-6-luna'); assert.equal(proof.effort, 'max'); assert.equal(proof.wireFrames, f.frames.length + 2);
  assert.equal(proof.claimHash, f.claim.hash); assert.match(proof.evidenceHashes.hostJournal, /^[a-f0-9]{64}$/);
});

test('wire hash corruption, torn tail and mismatched stopped evidence are rejected', t => {
  for (const mode of ['hash', 'tail', 'stopped', 'exit', 'count']) {
    const f = fixture(t);
    if (mode === 'hash') { const rows = readFileSync(join(f.app, 'wire.jsonl'), 'utf8').trimEnd().split('\n').map(JSON.parse); rows[0].hash = '0'.repeat(64); writeFileSync(join(f.app, 'wire.jsonl'), rows.map(r => JSON.stringify(r) + '\n').join('')); }
    if (mode === 'tail') { const bytes = readFileSync(join(f.app, 'wire.jsonl')); writeFileSync(join(f.app, 'wire.jsonl'), bytes.subarray(0, bytes.length - 1)); }
    if (mode === 'stopped') f.stopped.stoppedVerified = false;
    if (mode === 'exit') f.stopped.exit.code = 1;
    if (mode === 'count') f.stopped.wireFrames++;
    if (['stopped', 'exit', 'count'].includes(mode)) writeFileSync(join(f.app, 'stopped.json'), jsonBytes(f.stopped));
    assert.throws(f.verify, undefined, mode);
  }
});

test('extra RPCs, reused RPC IDs and multiple turns cannot prove an empty failed invocation', t => {
  for (const mode of ['extra', 'reused', 'turns', 'extra-response']) {
    const f = fixture(t);
    if (mode === 'extra') f.frames.push({ direction: 'outbound', frame: { id: 6, method: 'tools/call', params: {} } });
    if (mode === 'reused') f.frames[5].frame.id = 1;
    if (mode === 'turns') f.frames.push(structuredClone(f.frames[7]));
    if (mode === 'extra-response') f.frames.push({ direction: 'inbound', frame: { id: 99, result: {} } });
    f.save(); assert.throws(f.verify, undefined, mode);
  }
});

test('wrong prompt, model, effort, fallback and inherited thread configuration are rejected', t => {
  for (const mode of ['prompt', 'thread-model', 'turn-model', 'effort', 'fallback', 'parent', 'instructions', 'catalog-model', 'catalog-effort']) {
    const f = fixture(t);
    if (mode === 'prompt') f.frames[7].frame.params.input[0].text += ' changed';
    if (mode === 'thread-model') f.cfg.model = 'other-model';
    if (mode === 'turn-model') f.frames[7].frame.params.model = 'other-model';
    if (mode === 'effort') f.cfg.config.model_reasoning_effort = 'low';
    if (mode === 'fallback') f.cfg.allowProviderModelFallback = true;
    if (mode === 'parent') f.thread.thread.parentThreadId = 'inherited-parent';
    if (mode === 'instructions') f.cfg.developerInstructions += ' changed';
    if (mode === 'catalog-model') f.frames[4].frame.result.data[0].model = 'other-model';
    if (mode === 'catalog-effort') f.frames[4].frame.result.data[0].supportedReasoningEfforts[0].reasoningEffort = 'low';
    f.save(); assert.throws(f.verify, undefined, mode);
  }
});

test('completed final or tool activity is never classified as an output-free interrupted call', t => {
  for (const mode of ['completed', 'wire-final', 'wire-tool', 'journal-final', 'journal-tool', 'saved-output']) {
    const f = fixture(t);
    if (mode === 'completed') f.frames[13].frame.params.turn.status = 'completed';
    if (mode === 'wire-final') f.frames.splice(11, 0, { direction: 'inbound', frame: { method: 'item/completed', params: { item: { type: 'message', role: 'assistant', phase: 'final', content: [{ type: 'output_text', text: 'Unexpected final' }] } } } });
    if (mode === 'wire-tool') f.frames.splice(11, 0, { direction: 'inbound', frame: { method: 'item/completed', params: { item: { type: 'function_call', name: 'synthetic_tool' } } } });
    if (mode === 'journal-final') f.hostRows.splice(-1, 0, { type: 'response_item', payload: { type: 'message', role: 'assistant', phase: 'final', content: [] } });
    if (mode === 'journal-tool') f.hostRows.splice(-1, 0, { type: 'response_item', payload: { type: 'function_call', name: 'synthetic_tool' } });
    f.save(); if (mode === 'saved-output') writeFileSync(join(f.invocation, 'response.txt'), 'Unexpected final');
    assert.throws(f.verify, undefined, mode);
  }
});

test('changed context inventory, effective host context and executable provenance are rejected', t => {
  for (const mode of ['inventory', 'context', 'context-model', 'executable', 'source']) {
    const f = fixture(t);
    if (mode === 'inventory') writeFileSync(join(f.invocation, 'host-base-context-admission.json'), jsonBytes({ ...f.inventory, approvedDigests: ['f'.repeat(64)] }));
    if (mode === 'context') { f.hostRows[0].payload.base_instructions.text += ' changed'; f.save(); }
    if (mode === 'context-model') { f.hostRows.find(r => r.type === 'turn_context').payload.model = 'other-model'; f.save(); }
    if (mode === 'executable') writeFileSync(f.processInfo.executable, 'Modified executable');
    if (mode === 'source') { f.processInfo.adapterSourceHash = 'e'.repeat(64); f.save(); }
    assert.throws(f.verify, undefined, mode);
  }
});

test('wrong MCP server, timeout reason or settlement cannot authorize failed-call reconciliation', t => {
  for (const mode of ['name', 'reason', 'failureReason', 'settlement', 'accepted', 'abort']) {
    const f = fixture(t);
    if (mode === 'name') f.frames[10].frame.params.name = 'node_repl';
    if (mode === 'reason') f.frames[10].frame.params.error = 'Unrelated provider failure';
    if (mode === 'failureReason') f.frames[10].frame.params.failureReason = 'Unknown';
    if (mode === 'settlement') f.editRun(rows => { rows[2].data.reason = 'Unrelated provider failure'; });
    if (mode === 'accepted') f.editRun(rows => { rows[2].data.status = 'accepted'; });
    if (mode === 'abort') f.hostRows.at(-1).payload.reason = 'completed';
    f.save(); assert.throws(f.verify, undefined, mode);
  }
});

test('stale or ambiguous claim and execution outside original bounds are rejected', t => {
  for (const mode of ['stale', 'duplicate', 'before', 'after', 'duration', 'ordering']) {
    const f = fixture(t);
    if (mode === 'stale') f.claim.hash = '0'.repeat(64);
    if (mode === 'duplicate') appendEvent(f.root, 'review-dispatch-claimed', { ...f.claim.data });
    if (mode === 'before') f.frames[7].at = time(-1);
    if (mode === 'after') f.frames[13].at = time(301);
    if (mode === 'duration') { f.job.deadlineAt = time(301); f.editRun(rows => { rows[1].data.job.deadlineAt = time(301); }); }
    if (mode === 'ordering') { const failure = f.frames.splice(10, 1)[0]; f.frames.push(failure); }
    f.save(); assert.throws(f.verify, undefined, mode);
  }
});

for (const mode of ['claim-body', 'negative-window', 'reversed-wire-time', 'late-developer', 'late-system', 'late-world-state', 'late-turn-context', 'typed-user-extra', 'typed-user-wrong-text', 'abort-root-turn', 'abort-unknown-message', 'nested-thread-model', 'nested-thread-parent']) {
  test(`failed-call proof rejects ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'claim-body') {
      // Keep the original matching row hash while changing the supplied claim body.
      f.job.deadlineAt = time(299);
    }
    if (mode === 'negative-window') {
      f.job.claimedAt = time(20); f.job.deadlineAt = time(0);
      f.editRun(rows => { rows[1].data.job.claimedAt = f.job.claimedAt; rows[1].data.job.deadlineAt = f.job.deadlineAt; });
      // Existing endpoint checks could both hold despite a negative claim window.
      f.frames[7].at = time(25); f.frames[13].at = time(-1);
    }
    if (mode === 'reversed-wire-time') { f.frames[7].at = time(20); f.frames[13].at = time(1); }
    if (mode === 'late-developer' || mode === 'late-system') f.hostRows.splice(-1, 0, {
      type: 'response_item', payload: { id: 'injected-late-instructions', type: 'message', role: mode === 'late-developer' ? 'developer' : 'system',
        content: [{ type: 'input_text', text: 'Injected instructions after the frozen task.' }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['developer.instructions'] } },
    });
    if (mode === 'late-world-state') f.hostRows.splice(-1, 0, { type: 'world_state', payload: { full: true, state: { injected: 'Late ambient state' } } });
    if (mode === 'late-turn-context') f.hostRows.splice(-1, 0, structuredClone(f.hostRows.find(r => r.type === 'turn_context')));
    if (mode === 'typed-user-extra' || mode === 'typed-user-wrong-text') {
      if (mode === 'typed-user-extra') f.frames.splice(11, 0, { direction: 'inbound', frame: structuredClone(f.typedNotice.frame), at: time(10.5) });
      else f.typedNotice.frame.params.item.content[0].text = 'Changed task text';
    }
    if (mode === 'abort-root-turn') f.hostRows.at(-1).payload.root_turn_id = 'wrong-root-turn';
    if (mode === 'abort-unknown-message') f.hostRows.at(-1).payload.message = 'Unexpected final answer hidden in abort text.';
    if (mode === 'nested-thread-model') f.threadNotice.frame.params.thread.model = 'other-model';
    if (mode === 'nested-thread-parent') f.threadNotice.frame.params.thread.parentThreadId = 'unknown-parent';
    f.save(); assert.throws(f.verify, undefined, mode);
  });
}

for (const mode of ['unknown-warning', 'abort-text', 'abort-provenance-kind', 'abort-provenance-turn', 'abort-create-time', 'abort-notice-time', 'late-raw-user', 'journal-user-content']) {
  test(`failed-call proof rejects ${mode}`, t => {
    const f = fixture(t);
    const notice = f.hostRows.find(row => row.payload.internal_chat_message_metadata_passthrough?.content_item_kinds?.includes('generic.turn_aborted'));
    if (mode === 'unknown-warning') f.frames.splice(11, 0, { direction: 'inbound', at: time(10.5), frame: { method: 'warning', params: { message: 'Unexpected warning describing an unrelated failure.' } } });
    if (mode === 'abort-text') notice.payload.content[0].text = '<turn_aborted>Unrecognized diagnostic or extra model output.</turn_aborted>';
    if (mode === 'abort-provenance-kind') notice.payload.internal_chat_message_metadata_passthrough.content_item_kinds = ['developer.instructions'];
    if (mode === 'abort-provenance-turn') notice.payload.internal_chat_message_metadata_passthrough.turn_id = 'another-turn';
    if (mode === 'abort-create-time') notice.payload.internal_chat_message_metadata_passthrough.create_time = Date.parse(time(10)) / 1000;
    if (mode === 'abort-notice-time') notice.timestamp = time(10);
    if (mode === 'late-raw-user') {
      const item = { id: 'extra-raw-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'An extra task after the frozen input.' }],
        internal_chat_message_metadata_passthrough: { turn_id: 'synthetic-turn', content_item_kinds: ['user.text'] } };
      f.frames.splice(13, 0, { direction: 'inbound', at: time(12.5), frame: { method: 'rawResponseItem/completed', params: { threadId: f.capability.threadId, turnId: 'synthetic-turn', item } } });
      f.hostRows.splice(-1, 0, { timestamp: time(12.5), type: 'response_item', payload: item });
    }
    if (mode === 'journal-user-content') f.hostRows.find(row => row.payload.item?.type === 'UserMessage').payload.item.content[0].text = 'Different journal task';
    f.save(); assert.throws(f.verify, undefined, mode);
  });
}
