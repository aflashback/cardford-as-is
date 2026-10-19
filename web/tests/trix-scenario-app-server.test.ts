import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startClient, probeCapability, invoke, invokeSyntheticProbe, readWireLog, describeAppServerContext, inspectAppServerEvidence, playerBaseInstructions, playerDeveloperInstructions } from '../../scripts/trix-scenario-collection/app-server-bridge.mjs';
import { putBlob, sha } from '../../scripts/trix-scenario-collection/journal.mjs';
import { startShutdownSafeClient } from '../../scripts/trix-scenario-collection/shutdown-safe-transport.mjs';

const threadId = '01a12bf5-00ce-7e61-8f39-589017af9157';
const turnId = '01a12bf5-10ce-7e61-8f39-589017af9157';
const contextDigest = 'a'.repeat(64);
const final = '{"card":"|♥|K|","reasoning":"Only legal card.","confidence":100}';

function setup(t, mutate = (_frame, _child) => false, clientFactory = startClient) {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'rpc-test-'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  const child = new EventEmitter(); child.pid = 12345; child.stdout = new PassThrough(); child.stderr = new PassThrough();
  let killed = false, ended = false;
  const close = () => { if (ended) return; ended = true; queueMicrotask(() => { child.emit('exit', 0, null); child.stdout.end(); child.stderr.end(); child.emit('close', 0, null); }); };
  child.kill = () => { killed = true; close(); return true; };
  const send = frame => child.stdout.write(JSON.stringify(frame) + '\n');
  const notice = (method, params) => send({ method, params });
  child.stdin = new Writable({ write(chunk, _encoding, callback) {
    const frame = JSON.parse(chunk.toString());
    // Prove bytes were durably recorded before this fake host received them.
    const log = readWireLog(root); assert.ok(log.some(r => r.direction === 'outbound' && r.bytes.equals(chunk)));
    queueMicrotask(() => {
      if (mutate(frame, { child, send, notice, close })) return;
      if (!frame.id) return;
      if (frame.method === 'initialize') send({ id: frame.id, result: { userAgent: 'fixture' } });
      else if (frame.method === 'model/list') send({ id: frame.id, result: { data: [{ model: 'gpt-6-luna', supportedReasoningEfforts: [{ reasoningEffort: 'max' }] }], nextCursor: null } });
      else if (frame.method === 'thread/start') send({ id: frame.id, result: { model: 'gpt-6-luna', reasoningEffort: 'max', runtimeWorkspaceRoots: [], instructionSources: [], thread: { id: threadId, forkedFromId: null, parentThreadId: null, turns: [], environments: [], path: null } } });
      else if (frame.method === 'thread/archive' || frame.method === 'turn/interrupt') send({ id: frame.id, result: {} });
      else if (frame.method === 'turn/start') {
        notice('turn/started', { threadId, turn: { id: turnId, status: 'inProgress' } });
        send({ id: frame.id, result: { turn: { id: turnId, status: 'inProgress' } } });
        const user = { type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: frame.params.input[0].text }] };
        notice('item/started', { threadId, turnId, item: user }); notice('item/completed', { threadId, turnId, item: user });
        const message = { type: 'agentMessage', id: 'final-1', phase: 'final', text: final };
        notice('item/started', { threadId, turnId, item: message }); notice('item/completed', { threadId, turnId, item: message });
        notice('rawResponseItem/completed', { threadId, turnId, item: { type: 'message', id: 'host-final', role: 'assistant', phase: 'final', content: [{ type: 'output_text', text: final }] } });
        notice('turn/completed', { threadId, turn: { id: turnId, status: 'completed', error: null } });
      } else send({ id: frame.id, error: { code: -32601 } });
    }); callback();
  }, final(callback) { close(); callback(); } });
  const spawnProcess = (_exe, args, options) => { assert.equal(options.windowsHide, true); assert.equal(args[0], 'app-server'); assert.ok(args.includes('stdio://')); return child; };
  const client = clientFactory({ root, cwd: root, timeoutMs: 100, spawnProcess });
  t.after(async () => { if (!client.exited) await client.stop(); });
  writeFileSync(join(root, 'host-base-context-admission.json'), JSON.stringify({ schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: [contextDigest] }));
  const prompt = Buffer.from('Synthetic actor packet, only |♥|K|.');
  const job = { jobId: 'synthetic', promptHash: sha(prompt), promptRef: putBlob(root, prompt) };
  return { root, client, job, killed: () => killed };
}

test('configuration preflight records exact requests and never sends a model turn', async t => {
  const f = setup(t), capability = await probeCapability(f.client, { cwd: f.root });
  assert.equal(capability.model, 'gpt-6-luna'); assert.equal(capability.effort, 'max'); assert.equal(capability.baseContextApproved, false);
  const calls = readWireLog(f.root).filter(r => r.direction === 'outbound').map(r => r.frame);
  assert.deepEqual(calls.map(c => c.method), ['initialize', 'initialized', 'model/list', 'thread/start']);
  assert.equal(calls[3].params.allowProviderModelFallback, false); assert.deepEqual(calls[3].params.environments, []);
  const stopped = await f.client.stop(); assert.equal(stopped.stoppedVerified, true);
});

test('trusted recorder invokes exact frozen prompt and closes host after completion', async t => {
  const f = setup(t), capability = await probeCapability(f.client, { cwd: f.root });
  const result = await invoke(f.client, capability, f.job, { auditedContextDigest: contextDigest, timeoutMs: 500 });
  assert.equal(result.responseBytes.toString(), final); assert.equal(result.responseHash, sha(Buffer.from(final))); assert.equal(f.client.exited, true);
  assert.equal(result.archived, true); assert.equal(result.stoppedVerified, true);
  const sent = readWireLog(f.root).find(r => r.direction === 'outbound' && r.frame.method === 'turn/start');
  assert.equal(sha(Buffer.from(sent.frame.params.input[0].text)), f.job.promptHash); assert.equal(sent.frame.params.effort, 'max');
});

test('first synthetic probe stays nonadmitted pending post-turn context audit', async t => {
  const f = setup(t), capability = await probeCapability(f.client, { cwd: f.root });
  const result = await invokeSyntheticProbe(f.client, capability, { ...f.job, syntheticProbe: true }, { timeoutMs: 500 });
  assert.equal(result.admitted, false); assert.equal(result.syntheticOnly, true); assert.equal(result.requiresPostTurnContextAudit, true); assert.equal(result.baseContextDigest, null);
});

test('synthetic entrypoint cannot classify a dataset episode as a probe', t => {
  const f = setup(t);
  assert.throws(() => invokeSyntheticProbe(f.client, {}, { ...f.job, syntheticProbe: true, episodeId: 'dataset' }), /dataset job/);
});

test('known infrastructure startup notices are recorded without counting as tools', async t => {
  const f = setup(t, (frame, host) => {
    if (frame.method !== 'turn/start') return false;
    host.notice('thread/started', { thread: { id: threadId, model: 'gpt-6-luna', reasoningEffort: 'max', parentThreadId: null, forkedFromId: null, turns: [], environments: [] } });
    host.notice('warning', { threadId, message: 'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.' });
    host.notice('mcpServer/startupStatus/updated', { threadId, name: 'node_repl', status: 'starting', error: null, failureReason: null });
    host.notice('account/updated', { authMode: 'chatgpt', planType: 'promax' });
    host.notice('rawResponseItem/completed', { threadId, turnId, item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: frame.params.input[0].text }] } });
    host.notice('rawResponseItem/completed', { threadId, turnId, item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>\n  <current_date>2026-10-11</current_date>\n  <timezone>America/Toronto</timezone>\n</environment_context>' }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['environments.environment_context'] } } });
    return false;
  });
  const capability = await probeCapability(f.client, { cwd: f.root });
  const result = await invokeSyntheticProbe(f.client, capability, { ...f.job, syntheticProbe: true }, { timeoutMs: 500 });
  assert.equal(result.toolCallCount, 0);
});

function installHostJournal(f) {
  const input = readWireLog(f.root).find(r => r.frame?.method === 'turn/start').frame.params.input[0].text;
  const payloads = [
    ['session_meta', { id: threadId, base_instructions: { text: playerBaseInstructions } }],
    ['event_msg', { type: 'task_started', turn_id: turnId }],
    ['response_item', { type: 'message', role: 'developer', content: [{ type: 'input_text', text: playerDeveloperInstructions }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['generic.developer_instructions'] } }],
    ['turn_context', { turn_id: turnId, root_turn_id: turnId, cwd: f.root, model: 'gpt-6-luna', effort: 'max' }],
    ['response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: input }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['user.text'] } }],
    ['response_item', { type: 'message', id: 'host-final', role: 'assistant', phase: 'final', content: [{ type: 'output_text', text: final }] }],
    ['event_msg', { type: 'task_complete', turn_id: turnId, last_agent_message: final }],
  ];
  const bytes = Buffer.from(payloads.map(([type, payload], ordinal) => JSON.stringify({ ordinal, timestamp: '2026-10-11T17:00:00Z', type, payload })).join('\n') + '\n');
  writeFileSync(join(f.root, 'private/app-server/host-session.jsonl'), bytes);
  const context = describeAppServerContext(bytes, Buffer.from(input));
  writeFileSync(join(f.root, 'host-base-context-admission.json'), JSON.stringify({ schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: [context.digest] }));
  return bytes;
}

test('evidence inspector derives complete facts from wire and host journal, ignores forged receipt', async t => {
  const f = setup(t), capability = await probeCapability(f.client, { cwd: f.root });
  const job = { ...f.job, claimedAt: new Date(Date.now() - 1000).toISOString(), deadlineAt: new Date(Date.now() + 60000).toISOString() };
  await invoke(f.client, capability, job, { auditedContextDigest: contextDigest, timeoutMs: 500 });
  installHostJournal(f);
  writeFileSync(join(f.root, 'private/app-server/invocation.json'), JSON.stringify({ toolCallCount: 500, model: 'forged', responseHash: 'fake' }));
  const evidence = inspectAppServerEvidence(f.root, job);
  assert.equal(evidence.available, true); assert.equal(evidence.events.toolCallCount, 0); assert.equal(evidence.events.model, 'gpt-6-luna'); assert.equal(evidence.responseBytes.toString(), final);
  assert.equal(Number.isFinite(Date.parse(evidence.events.startedAt)), true);
  writeFileSync(join(f.root, 'host-base-context-admission.json'), JSON.stringify({ schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: [] }));
  assert.match(inspectAppServerEvidence(f.root, job).reason, /inventory not approved/);
});

test('evidence inspector rejects altered job token, late context and host tool activity', async t => {
  const f = setup(t), capability = await probeCapability(f.client, { cwd: f.root });
  const job = { ...f.job, claimedAt: new Date(Date.now() - 1000).toISOString(), deadlineAt: new Date(Date.now() + 60000).toISOString() };
  await invoke(f.client, capability, job, { auditedContextDigest: contextDigest, timeoutMs: 500 });
  const bytes = installHostJournal(f);
  assert.match(inspectAppServerEvidence(f.root, { ...job, jobId: 'forged' }).reason, /job binding/);
  const rows = bytes.toString().trimEnd().split('\n').map(JSON.parse);
  rows.push({ ordinal: rows.length, timestamp: '2026-10-11T17:00:00Z', type: 'response_item', payload: { type: 'function_call', name: 'exec_command' } });
  writeFileSync(join(f.root, 'private/app-server/host-session.jsonl'), rows.map(JSON.stringify).join('\n') + '\n');
  assert.match(inspectAppServerEvidence(f.root, job).reason, /tool call/);
  const late = bytes.toString().trimEnd().split('\n').map(JSON.parse);
  late.push({ ordinal: late.length, timestamp: '2026-10-11T17:00:00Z', type: 'world_state', payload: { full: true, state: { hidden_fixture: 'later context injection' } } });
  writeFileSync(join(f.root, 'private/app-server/host-session.jsonl'), late.map(JSON.stringify).join('\n') + '\n');
  assert.match(inspectAppServerEvidence(f.root, job).reason, /Late host context/);
});

test('synthetic diagnostic records raw events without asserting zero tools', async t => {
  const f = setup(t, (frame, host) => { if (frame.method !== 'turn/start') return false; host.notice('raw_response_item/completed', { threadId, turnId, item: { type: 'message', role: 'assistant' } }); return false; });
  const capability = await probeCapability(f.client, { cwd: f.root });
  const result = await invokeSyntheticProbe(f.client, capability, { ...f.job, syntheticProbe: true }, { diagnosticNotifications: true, timeoutMs: 500 });
  assert.equal(result.toolCallCount, null); assert.equal(result.admitted, false); assert.deepEqual(result.unclassifiedNotificationMethods, ['raw_response_item/completed']);
});

test('unknown benign notification is provisional in synthetic and rejected for real invocation', async t => {
  const mutation = (frame, host) => { if (frame.method !== 'turn/start') return false; host.notice('new/infrastructure/status', { status: 'idle' }); return false; };
  const synthetic = setup(t, mutation), capability = await probeCapability(synthetic.client, { cwd: synthetic.root });
  const result = await invokeSyntheticProbe(synthetic.client, capability, { ...synthetic.job, syntheticProbe: true }, { diagnosticNotifications: true, timeoutMs: 500 });
  assert.equal(result.admitted, false); assert.equal(result.toolCallCount, null); assert.deepEqual(result.unclassifiedNotificationMethods, ['new/infrastructure/status']);
  const real = setup(t, mutation), realCapability = await probeCapability(real.client, { cwd: real.root });
  await assert.rejects(invoke(real.client, realCapability, real.job, { auditedContextDigest: contextDigest, timeoutMs: 500 }), /disallowed/);
});

test('dataset invocation cannot enable diagnostic event recording', async t => {
  const f = setup(t), capability = await probeCapability(f.client, { cwd: f.root });
  await assert.rejects(invoke(f.client, capability, f.job, { auditedContextDigest: contextDigest, diagnosticNotifications: true }), /synthetic-only/);
  assert.equal(readWireLog(f.root).some(row => row.frame?.method === 'turn/start'), false);
});

test('actual context extraction excludes frozen task and verifies effective model', () => {
  const prompt = Buffer.from('frozen task');
  const payloads = [
    ['session_meta', { id: threadId, base_instructions: { text: 'audited player base' } }],
    ['response_item', { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'generic instructions' }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['generic.developer_instructions'] } }],
    ['turn_context', { turn_id: turnId, model: 'gpt-6-luna', effort: 'max' }],
    ['response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt.toString() }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['user.text'] } }],
  ];
  const bytes = () => Buffer.from(payloads.map(([type, payload], ordinal) => JSON.stringify({ ordinal, timestamp: '2026-10-11T17:00:00Z', type, payload })).join('\n') + '\n');
  const context = describeAppServerContext(bytes(), prompt);
  assert.equal(context.parts.some(p => p.text.includes('frozen task')), false);
  payloads[2][1].effort = 'high'; assert.throws(() => describeAppServerContext(bytes(), prompt), /effective configuration/);
});

for (const [name, mutation] of [
  ['unavailable exact model', (frame, host) => { if (frame.method !== 'model/list') return false; host.send({ id: frame.id, result: { data: [{ model: 'gpt-6-sol', supportedReasoningEfforts: [] }] } }); return true; }],
  ['wrong effective effort', (frame, host) => { if (frame.method !== 'thread/start') return false; host.send({ id: frame.id, result: { model: 'gpt-6-luna', reasoningEffort: 'high' } }); return true; }],
  ['RPC error', (frame, host) => { if (frame.method !== 'model/list') return false; host.send({ id: frame.id, error: { code: -32001 } }); return true; }],
  ['server requests approval', (frame, host) => { if (frame.method !== 'model/list') return false; host.send({ id: 900, method: 'item/commandExecution/requestApproval', params: {} }); return true; }],
]) test(`preflight rejects ${name}`, async t => {
  const f = setup(t, mutation); await assert.rejects(probeCapability(f.client, { cwd: f.root })); assert.equal((await f.client.stop()).stoppedVerified, true);
});

for (const [name, method, params] of [
  ['tool call', 'item/started', { threadId, turnId, item: { type: 'commandExecution', id: 'tool' } }],
  ['reroute', 'model/rerouted', { threadId, turnId, fromModel: 'gpt-6-luna', toModel: 'gpt-6-sol' }],
  ['wrong thread', 'item/started', { threadId: 'wrong', turnId, item: { type: 'reasoning', id: 'r' } }],
  ['inherited thread announcement', 'thread/started', { thread: { id: threadId, model: 'gpt-6-luna', reasoningEffort: 'max', parentThreadId: 'other', forkedFromId: null, turns: [], environments: [] } }],
  ['unknown activity', 'new/activity', { threadId, turnId }],
  ['unexpected warning', 'warning', { threadId, message: 'Switching to another model.' }],
  ['inherited input', 'item/started', { threadId, turnId, item: { type: 'userMessage', id: 'u', content: [{ type: 'text', text: 'Other seat hidden hand' }] } }],
  ['raw tool call', 'rawResponseItem/completed', { threadId, turnId, item: { type: 'function_call', name: 'exec_command' } }],
  ['raw inherited input', 'rawResponseItem/completed', { threadId, turnId, item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hidden other seat' }] } }],
  ['forged environment input', 'rawResponseItem/completed', { threadId, turnId, item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>hidden other seat</environment_context>' }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['environments.environment_context'] } } }],
]) test(`invocation rejects ${name} and verifies process stopped`, async t => {
  const f = setup(t, (frame, host) => {
    if (frame.method !== 'turn/start') return false;
    host.notice('turn/started', { threadId, turn: { id: turnId, status: 'inProgress' } }); host.send({ id: frame.id, result: { turn: { id: turnId } } }); host.notice(method, params); return true;
  });
  const capability = await probeCapability(f.client, { cwd: f.root });
  await assert.rejects(invoke(f.client, capability, f.job, { auditedContextDigest: contextDigest, timeoutMs: 500 }));
  assert.equal(f.client.exited, true);
});

test('invocation timeout stops host and persists verifiable process receipt', async t => {
  const f = setup(t, (frame, host) => { if (frame.method !== 'turn/start') return false; host.send({ id: frame.id, result: { turn: { id: turnId } } }); return true; });
  const capability = await probeCapability(f.client, { cwd: f.root });
  await assert.rejects(invoke(f.client, capability, f.job, { auditedContextDigest: contextDigest, timeoutMs: 20 }), /timeout/);
  assert.equal(JSON.parse(readFileSync(join(f.root, 'private/app-server/stopped.json'), 'utf8')).stoppedVerified, true);
});

test('shutdown guard rejects cleanup RPCs before recording or writing to ended stdin', async t => {
  const f = setup(t, undefined, startShutdownSafeClient);
  await probeCapability(f.client, { cwd: f.root });
  const frames = readWireLog(f.root).length, stop = f.client.stop();
  assert.equal(f.client.stopping, true); assert.strictEqual(f.client.stop(), stop);
  await assert.rejects(f.client.request('turn/interrupt', { threadId, turnId }), /stopping/);
  assert.throws(() => f.client.notify('initialized'), /stopping/);
  const stopped = await stop;
  assert.equal(stopped.stoppedVerified, true); assert.equal(stopped.error, null);
  assert.equal(readWireLog(f.root).length, frames, 'No undelivered cleanup request may be added to the wire');
});

for (const outerDeadline of [false, true]) test(`guarded invocation retains timeout and stop evidence with ${outerDeadline ? 'outer deadline' : 'invocation deadline'} shutdown`, async t => {
  const f = setup(t, (frame, host) => {
    if (frame.method !== 'turn/start') return false;
    host.child.stdin._final = callback => callback(); // Keep host alive until the original bounded stop kills it.
    host.notice('turn/started', { threadId, turn: { id: turnId, status: 'inProgress' } });
    host.send({ id: frame.id, result: { turn: { id: turnId } } }); return true;
  }, startShutdownSafeClient);
  const capability = await probeCapability(f.client, { cwd: f.root });
  const outerTimer = outerDeadline ? setTimeout(() => { void f.client.stop(); }, 10) : null;
  t.after(() => { if (outerTimer) clearTimeout(outerTimer); });
  await assert.rejects(invoke(f.client, capability, f.job, { auditedContextDigest: contextDigest, timeoutMs: 20 }), /^Error: App-server invocation timeout$/);
  const stopped = JSON.parse(readFileSync(join(f.root, 'private/app-server/stopped.json'), 'utf8'));
  assert.equal(stopped.stoppedVerified, true); assert.equal(stopped.error, null);
  assert.equal(f.killed(), true); assert.equal(f.client.error, null);
  assert.equal(readWireLog(f.root).some(row => row.frame?.method === 'turn/interrupt'), false);
});

test('guarded client preserves normal capability and completed invocation evidence', async t => {
  const f = setup(t, undefined, startShutdownSafeClient), capability = await probeCapability(f.client, { cwd: f.root });
  const result = await invokeSyntheticProbe(f.client, capability, { ...f.job, syntheticProbe: true }, { timeoutMs: 500 });
  assert.equal(result.responseBytes.toString(), final); assert.equal(result.stoppedVerified, true); assert.equal(result.archived, true);
  const wire = readWireLog(f.root); assert.equal(wire.filter(row => row.frame?.method === 'thread/archive').length, 1);
  assert.equal(JSON.parse(readFileSync(join(f.root, 'private/app-server/stopped.json'), 'utf8')).error, null);
});

test('forged capability cannot send a model turn', async t => {
  const f = setup(t); await assert.rejects(invoke(f.client, { model: 'gpt-6-luna', effort: 'max', threadId }, f.job, { auditedContextDigest: contextDigest }), /live host client/);
  assert.equal(readWireLog(f.root).some(r => r.frame?.method === 'turn/start'), false);
});

test('wire inspection rejects modified frames and missing entries', async t => {
  const f = setup(t); await probeCapability(f.client, { cwd: f.root }); await f.client.stop();
  const path = join(f.root, 'private/app-server/wire.jsonl'), rows = readFileSync(path, 'utf8').trimEnd().split('\n');
  writeFileSync(path, rows.filter((_, i) => i !== 1).join('\n') + '\n'); assert.throws(() => readWireLog(f.root), /gap|corruption/);
});
