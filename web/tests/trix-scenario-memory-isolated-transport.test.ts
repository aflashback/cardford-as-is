import { sourceDigest } from '../../scripts/coach-lab-builds.mjs';
import test from 'node:test';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startClient, probeCapability, invoke, invokeSyntheticProbe, readWireLog, describeAppServerContext, inspectAppServerEvidence, playerBaseInstructions, playerDeveloperInstructions } from '../../scripts/trix-scenario-collection/memory-isolated-app-server-bridge.mjs';
import { putBlob, sha, jsonBytes, appendEvent, readJournal, writeImmutable, safePath, getBlob, withRunLock } from '../../scripts/trix-scenario-collection/journal.mjs';
import { startMemoryIsolatedClient, verifyMemoryIsolationInvocation, assertMemoryIsolationDispatchClaim, dispatchMemoryIsolatedHostJob, memoryIsolationArgs, memoryIsolationPolicyVersion, memoryIsolationExecutableHash, defaultMemoryIsolationExecutable, memoryIsolationBridgeSourceHash, memoryIsolationTransportSourceHash } from '../../scripts/trix-scenario-collection/memory-isolated-transport.mjs';

const threadId = '01a12bf5-00ce-7e61-8f39-589017af9157';
const turnId = '01a12bf5-10ce-7e61-8f39-589017af9157';
const contextDigest = 'a'.repeat(64);
const final = '{"card":"|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢Ãƒâ€šÃ‚Â¥|K|","reasoning":"Only legal card.","confidence":100}';

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
  const prompt = Buffer.from('Synthetic actor packet, only |ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢Ãƒâ€šÃ‚Â¥|K|.');
  const job = { jobId: 'synthetic', promptHash: sha(prompt), promptRef: putBlob(root, prompt) };
  return { root, client, job, killed: () => killed };
}

test('configuration preflight records exact requests and never sends a model turn', async t => {
  const f = setup(t), capability = await probeCapability(f.client, { cwd: f.root });
  assert.equal(capability.model, 'gpt-6-luna'); assert.equal(capability.effort, 'max'); assert.equal(capability.baseContextApproved, false);
  const calls = readWireLog(f.evidenceRoot??f.root).filter(r => r.direction === 'outbound').map(r => r.frame);
  assert.deepEqual(calls.map(c => c.method), ['initialize', 'initialized', 'model/list', 'thread/start']);
  assert.equal(calls[3].params.allowProviderModelFallback, false); assert.deepEqual(calls[3].params.environments, []);
  const stopped = await f.client.stop(); assert.equal(stopped.stoppedVerified, true);
});

test('trusted recorder invokes exact frozen prompt and closes host after completion', async t => {
  const f = setup(t), capability = await probeCapability(f.client, { cwd: f.root });
  const result = await invoke(f.client, capability, f.job, { auditedContextDigest: contextDigest, timeoutMs: 500 });
  assert.equal(result.responseBytes.toString(), final); assert.equal(result.responseHash, sha(Buffer.from(final))); assert.equal(f.client.exited, true);
  assert.equal(result.archived, true); assert.equal(result.stoppedVerified, true);
  const sent = readWireLog(f.evidenceRoot??f.root).find(r => r.direction === 'outbound' && r.frame.method === 'turn/start');
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
  const input = readWireLog(f.evidenceRoot??f.root).find(r => r.frame?.method === 'turn/start').frame.params.input[0].text;
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
  writeFileSync(join(f.evidenceRoot??f.root, 'private/app-server/host-session.jsonl'), bytes);
  const context = describeAppServerContext(bytes, Buffer.from(input));
  writeFileSync(join(f.root, 'host-base-context-admission.json'), JSON.stringify({ schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: [context.digest] }));
  return bytes;
}

test('evidence inspector derives complete facts from wire and host journal, ignores forged receipt', async t => {
  const f = setup(t), capability = await probeCapability(f.client, { cwd: f.root });
  const job = { ...f.job, claimedAt: new Date(Date.now() - 1000).toISOString(), deadlineAt: new Date(Date.now() + 60000).toISOString() };
  await invoke(f.client, capability, job, { auditedContextDigest: contextDigest, timeoutMs: 500 });
  installHostJournal(f);
  writeFileSync(join(f.evidenceRoot??f.root, 'private/app-server/invocation.json'), JSON.stringify({ toolCallCount: 500, model: 'forged', responseHash: 'fake' }));
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
  writeFileSync(join(f.evidenceRoot??f.root, 'private/app-server/host-session.jsonl'), rows.map(JSON.stringify).join('\n') + '\n');
  assert.match(inspectAppServerEvidence(f.root, job).reason, /tool call/);
  const late = bytes.toString().trimEnd().split('\n').map(JSON.parse);
  late.push({ ordinal: late.length, timestamp: '2026-10-11T17:00:00Z', type: 'world_state', payload: { full: true, state: { hidden_fixture: 'later context injection' } } });
  writeFileSync(join(f.evidenceRoot??f.root, 'private/app-server/host-session.jsonl'), late.map(JSON.stringify).join('\n') + '\n');
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
  assert.equal(readWireLog(f.evidenceRoot??f.root).some(row => row.frame?.method === 'turn/start'), false);
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
  assert.equal(JSON.parse(readFileSync(join(f.evidenceRoot??f.root, 'private/app-server/stopped.json'), 'utf8')).stoppedVerified, true);
});

test('shutdown guard rejects cleanup RPCs before recording or writing to ended stdin', async t => {
  const f = setup(t, undefined, startMemoryIsolatedClient);
  await probeCapability(f.client, { cwd: f.root });
  const frames = readWireLog(f.evidenceRoot??f.root).length, stop = f.client.stop();
  assert.equal(f.client.stopping, true); assert.strictEqual(f.client.stop(), stop);
  await assert.rejects(f.client.request('turn/interrupt', { threadId, turnId }), /stopping/);
  assert.throws(() => f.client.notify('initialized'), /stopping/);
  const stopped = await stop;
  assert.equal(stopped.stoppedVerified, true); assert.equal(stopped.error, null);
  assert.equal(readWireLog(f.evidenceRoot??f.root).length, frames, 'No undelivered cleanup request may be added to the wire');
});

for (const outerDeadline of [false, true]) test(`guarded invocation retains timeout and stop evidence with ${outerDeadline ? 'outer deadline' : 'invocation deadline'} shutdown`, async t => {
  const f = setup(t, (frame, host) => {
    if (frame.method !== 'turn/start') return false;
    host.child.stdin._final = callback => callback(); // Keep host alive until the original bounded stop kills it.
    host.notice('turn/started', { threadId, turn: { id: turnId, status: 'inProgress' } });
    host.send({ id: frame.id, result: { turn: { id: turnId } } }); return true;
  }, startMemoryIsolatedClient);
  const capability = await probeCapability(f.client, { cwd: f.root });
  const outerTimer = outerDeadline ? setTimeout(() => { void f.client.stop(); }, 10) : null;
  t.after(() => { if (outerTimer) clearTimeout(outerTimer); });
  await assert.rejects(invoke(f.client, capability, f.job, { auditedContextDigest: contextDigest, timeoutMs: 20 }), /^Error: App-server invocation timeout$/);
  const stopped = JSON.parse(readFileSync(join(f.evidenceRoot??f.root, 'private/app-server/stopped.json'), 'utf8'));
  assert.equal(stopped.stoppedVerified, true); assert.equal(stopped.error, null);
  assert.equal(f.killed(), true); assert.equal(f.client.error, null);
  assert.equal(readWireLog(f.evidenceRoot??f.root).some(row => row.frame?.method === 'turn/interrupt'), false);
});

test('guarded client preserves normal capability and completed invocation evidence', async t => {
  const f = setup(t, undefined, startMemoryIsolatedClient), capability = await probeCapability(f.client, { cwd: f.root });
  const result = await invokeSyntheticProbe(f.client, capability, { ...f.job, syntheticProbe: true }, { timeoutMs: 500 });
  assert.equal(result.responseBytes.toString(), final); assert.equal(result.stoppedVerified, true); assert.equal(result.archived, true);
  const wire = readWireLog(f.evidenceRoot??f.root); assert.equal(wire.filter(row => row.frame?.method === 'thread/archive').length, 1);
  assert.equal(JSON.parse(readFileSync(join(f.evidenceRoot??f.root, 'private/app-server/stopped.json'), 'utf8')).error, null);
});

test('forged capability cannot send a model turn', async t => {
  const f = setup(t); await assert.rejects(invoke(f.client, { model: 'gpt-6-luna', effort: 'max', threadId }, f.job, { auditedContextDigest: contextDigest }), /live host client/);
  assert.equal(readWireLog(f.evidenceRoot??f.root).some(r => r.frame?.method === 'turn/start'), false);
});

test('wire inspection rejects modified frames and missing entries', async t => {
  const f = setup(t); await probeCapability(f.client, { cwd: f.root }); await f.client.stop();
  const path = join(f.evidenceRoot??f.root, 'private/app-server/wire.jsonl'), rows = readFileSync(path, 'utf8').trimEnd().split('\n');
  writeFileSync(path, rows.filter((_, i) => i !== 1).join('\n') + '\n'); assert.throws(() => readWireLog(f.evidenceRoot??f.root), /gap|corruption/);
});


function rewriteWire(f,mutate) {
 const path=join(f.evidenceRoot??f.root,'private/app-server/wire.jsonl'),rows=readFileSync(path,'utf8').trimEnd().split('\n').map(line=>JSON.parse(line));let previousHash='0'.repeat(64);
 for(const row of rows){if(['inbound','outbound'].includes(row.direction)){const frame=JSON.parse(Buffer.from(row.bytesBase64,'base64').toString());mutate(frame);const bytes=Buffer.from(JSON.stringify(frame)+'\n');row.bytesBase64=bytes.toString('base64');row.bytesHash=sha(bytes);}row.previousHash=previousHash;const {hash,...body}=row;row.hash=sha(jsonBytes(body));previousHash=row.hash;}
 writeFileSync(path,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');const stopped=JSON.parse(readFileSync(join(f.evidenceRoot??f.root,'private/app-server/stopped.json'),'utf8'));Object.assign(stopped,{wireDigest:rows.at(-1).hash,wireFrames:rows.length});writeFileSync(join(f.evidenceRoot??f.root,'private/app-server/stopped.json'),jsonBytes(stopped));
}
function replaceRecord(f,mutate) {
 mutate(f.record);f.processingAudit=f.record.processingAudit;const exceptionHash=sha(jsonBytes(f.record)),exceptionPath=`private/review-memory-exception/${exceptionHash}.json`;writeFileSync(safePath(f.root,exceptionPath),jsonBytes(f.record));const rows=readJournal(f.root);rows[1].data={exceptionHash,exceptionPath};let previousHash='0'.repeat(64);for(const row of rows){row.previousHash=previousHash;const {hash,...body}=row;row.hash=sha(jsonBytes(body));previousHash=row.hash;}writeFileSync(join(f.root,'private/journal.jsonl'),rows.map(row=>JSON.stringify(row)).join('\n')+'\n');f.authorization={sequence:rows[1].sequence,hash:rows[1].hash,exceptionHash};f.claim=rows[2];f.marker.authorization=f.authorization;f.marker.claimHash=f.claim.hash;f.marker.processingAudit=f.processingAudit;f.marker.inventoryHash=f.record.inventoryHash;f.marker.contextDigest=f.record.inventory.approvedDigests[0];writeFileSync(join(f.evidenceRoot??f.root,'private/app-server/memory-isolation.json'),jsonBytes(f.marker));f.inventory=f.record.inventory;f.options={processingAudit:f.processingAudit,authorization:f.authorization};
}
function replaceContext(f,mutate) {
 const path=join(f.evidenceRoot??f.root,'private/app-server/host-session.jsonl'),rows=readFileSync(path,'utf8').trimEnd().split('\n').map(line=>JSON.parse(line));mutate(rows);rows.forEach((row,index)=>row.ordinal=index);const host=Buffer.from(rows.map(row=>JSON.stringify(row)).join('\n')+'\n');writeFileSync(path,host);const context=describeAppServerContext(host,getBlob(f.root,f.job.promptRef,false));writeFileSync(join(f.evidenceRoot??f.root,'private/app-server/context-audit.json'),jsonBytes(context));const inventory={...f.inventory,approvedDigests:[context.digest]};replaceRecord(f,record=>{record.inventory=inventory;record.inventoryHash=sha(jsonBytes(inventory));});writeFileSync(join(f.evidenceRoot??f.root,'host-base-context-admission.json'),jsonBytes(inventory));const invocation=JSON.parse(readFileSync(join(f.evidenceRoot??f.root,'private/app-server/invocation.json'),'utf8'));Object.assign(invocation,{baseContextDigest:context.digest,actualBaseContextDigest:context.digest,hostJournalRef:{path:'private/app-server/host-session.jsonl',sha256:sha(host)}});writeFileSync(join(f.evidenceRoot??f.root,'private/app-server/invocation.json'),jsonBytes(invocation));
}
async function trustedIsolationFixture(t) {
 const f=setup(t),capability=await probeCapability(f.client,{cwd:'C:/Windows/Temp'}),claimedAt=new Date(Date.now()-1000).toISOString(),job={...f.job,dispatchToken:'memory-fixture-token',claimedAt,deadlineAt:new Date(Date.parse(claimedAt)+300000).toISOString()};await invoke(f.client,capability,job,{auditedContextDigest:contextDigest,timeoutMs:500});const original=installHostJournal(f),rows=original.toString().trimEnd().split('\n').map(line=>JSON.parse(line));rows.find(row=>row.type==='turn_context').payload.cwd='C:/Windows/Temp';const host=Buffer.from(rows.map(row=>JSON.stringify(row)).join('\n')+'\n');writeFileSync(join(f.evidenceRoot??f.root,'private/app-server/host-session.jsonl'),host);const context=describeAppServerContext(host,getBlob(f.root,job.promptRef,false)),inventory={schemaVersion:'trix-host-base-context-admission-1.0.0',approvedDigests:[context.digest],audit:{fixtureOnly:true,summary:'Synthetic local trusted-host fixture, no provider call.'}};writeFileSync(join(f.evidenceRoot??f.root,'host-base-context-admission.json'),jsonBytes(inventory));writeFileSync(join(f.evidenceRoot??f.root,'private/app-server/context-audit.json'),jsonBytes(context));writeFileSync(join(f.root,'job.json'),jsonBytes(job));
 const sourceHashes=Object.fromEntries(['memory-isolated-app-server-bridge.mjs','memory-isolated-transport.mjs','journal.mjs'].map(name=>['scripts/trix-scenario-collection/'+name,sha(readFileSync(resolve('scripts/trix-scenario-collection',name)))])),manifest={runId:'synthetic-memory-transport-fixture',mode:'live',build:{sourceDigest:'1'.repeat(64),binaryDigest:'2'.repeat(64)}},processingBuild={sourceDigest:sourceDigest(sourceHashes),binaryDigest:manifest.build.binaryDigest},processingAudit={originalSourceDigest:manifest.build.sourceDigest,reviewSourceDigest:processingBuild.sourceDigest,nativeBinaryDigest:manifest.build.binaryDigest},record={schemaVersion:'trix-review-memory-exception-1.0.0',runId:manifest.runId,originalSourceDigest:manifest.build.sourceDigest,nativeBinaryDigest:manifest.build.binaryDigest,inventory,inventoryHash:sha(jsonBytes(inventory)),processingAudit,sourceHashes,processingBuild},exceptionHash=sha(jsonBytes(record)),exceptionPath=`private/review-memory-exception/${exceptionHash}.json`;writeImmutable(safePath(f.root,exceptionPath),jsonBytes(record));appendEvent(f.root,'initialized',{fixtureOnly:true});const event=appendEvent(f.root,'review-memory-exception-authorized',{exceptionHash,exceptionPath}),review={id:'fixture-review',stage:'decision',promptRef:job.promptRef,promptHash:job.promptHash};writeImmutable(join(f.root,'outbox/fixture-review.json'),jsonBytes(review));const claim=appendEvent(f.root,'review-dispatch-claimed',{reviewId:review.id,stage:review.stage,job}),authorization={sequence:event.sequence,hash:event.hash,exceptionHash},marker={schemaVersion:memoryIsolationPolicyVersion,jobId:job.jobId,claimSequence:claim.sequence,claimHash:claim.hash,authorization,processingAudit,inventoryHash:record.inventoryHash,contextDigest:context.digest,bridgeSourceHash:memoryIsolationBridgeSourceHash,transportSourceHash:memoryIsolationTransportSourceHash,executableHash:memoryIsolationExecutableHash};writeImmutable(join(f.evidenceRoot??f.root,'private/app-server/memory-isolation.json'),jsonBytes(marker));writeImmutable(join(f.evidenceRoot??f.root,'private/app-server/shutdown-guard.json'),jsonBytes({schemaVersion:memoryIsolationPolicyVersion,jobId:job.jobId,sourceHash:memoryIsolationTransportSourceHash}));
 const process=JSON.parse(readFileSync(join(f.evidenceRoot??f.root,'private/app-server/process.json'),'utf8'));Object.assign(process,{executable:defaultMemoryIsolationExecutable,executableHash:memoryIsolationExecutableHash,args:memoryIsolationArgs,cwd:'C:/Windows/Temp'});writeFileSync(join(f.evidenceRoot??f.root,'private/app-server/process.json'),jsonBytes(process));const invocation=JSON.parse(readFileSync(join(f.evidenceRoot??f.root,'private/app-server/invocation.json'),'utf8'));Object.assign(invocation,{syntheticOnly:false,baseContextDigest:context.digest,actualBaseContextDigest:context.digest,hostJournalRef:{path:'private/app-server/host-session.jsonl',sha256:sha(host)}});writeFileSync(join(f.evidenceRoot??f.root,'private/app-server/invocation.json'),jsonBytes(invocation));
 const collectionRoot=mkdtempSync(join(resolve('.local/evaluation/trix-scenarios/bridge-capability'),'memory-transport-collection-'));t.after(()=>rmSync(collectionRoot,{recursive:true,force:true}));cpSync(f.root,collectionRoot,{recursive:true});const evidenceRoot=join(collectionRoot,'private/invocations',job.jobId);cpSync(f.root,evidenceRoot,{recursive:true});const collector={root:collectionRoot,manifest,state(){return {rows:readJournal(collectionRoot),paused:readJournal(collectionRoot).some(row=>row.kind==='pause')};}};return {...f,root:collectionRoot,evidenceRoot,job,collector,record,inventory,processingAudit,authorization,claim,marker,options:{processingAudit,authorization}};
}

test('promoted source preserves candidate behavior with only truthful renamed self-hash',()=>{
 const current=readFileSync(resolve('scripts/trix-scenario-collection/memory-isolated-app-server-bridge.mjs'),'utf8'),original=readFileSync(resolve('scripts/trix-scenario-collection/app-server-bridge.mjs'),'utf8');const promoted=original.replace("'sleep_tool', 'tool_suggest']","'sleep_tool', 'tool_suggest', 'memories']").replace("'--enable', 'skip_host_skill_discovery'];","'--enable', 'skip_host_skill_discovery', '-c', 'memories.use_memories=false', '-c', 'memories.generate_memories=false'];").replace("config: { model_reasoning_effort: 'max', web_search: 'disabled' }","config: { model_reasoning_effort: 'max', web_search: 'disabled', 'features.memories': false, 'memories.use_memories': false, 'memories.generate_memories': false }").replace("sha(readFileSync(new URL('./app-server-bridge.mjs', import.meta.url)))","sha(readFileSync(new URL(import.meta.url)))");assert.equal(current,promoted);assert.equal(current.slice(current.indexOf('export function inspectAppServerEvidence')),original.slice(original.indexOf('export function inspectAppServerEvidence')));
});

test('complete synthetic fixture passes old inspector plus strict isolation provenance',async t=>{
 const f=await trustedIsolationFixture(t),before=readJournal(f.root),checked=verifyMemoryIsolationInvocation(f.collector,f.claim,f.inventory,f.options);assert.equal(checked.available,true);assert.equal(checked.isolation.syntheticOnly,false);assert.equal(checked.events.toolCallCount,0);assert.equal(checked.isolation.authorization.exceptionHash,f.authorization.exceptionHash);assert.equal(checked.isolation.bridgeSourceHash,memoryIsolationBridgeSourceHash);assert.equal(checked.isolation.transportSourceHash,memoryIsolationTransportSourceHash);assert.deepEqual(readJournal(f.root),before);
});

for(const [name,modify]of [
 ['memory-off argv missing',p=>p.args=p.args.filter(value=>value!=='memories')],['memory config arg true',p=>p.args=p.args.map(value=>value==='memories.use_memories=false'?'memories.use_memories=true':value)],['fixture executable hash',p=>p.executableHash='fixture'],['different executable path',p=>p.executable='C:/Windows/not-codex.exe'],['old bridge source',p=>p.adapterSourceHash='a'.repeat(64)],['wrong journal source',p=>p.journalSourceHash='a'.repeat(64)],['wrong cwd',p=>p.cwd='C:/repos/test-jev']
])test(`isolation rejects ${name} even though original evidence pins remain valid`,async t=>{
 const f=await trustedIsolationFixture(t),path=join(f.evidenceRoot??f.root,'private/app-server/process.json'),process=JSON.parse(readFileSync(path,'utf8'));modify(process);writeFileSync(path,jsonBytes(process));assert.throws(()=>verifyMemoryIsolationInvocation(f.collector,f.claim,f.inventory,f.options));
});
for(const field of ['features.memories','memories.use_memories','memories.generate_memories'])test(`isolation rejects enabled thread ${field}`,async t=>{
 const f=await trustedIsolationFixture(t);rewriteWire(f,frame=>{if(frame.method==='thread/start')frame.params.config[field]=true;});assert.throws(()=>verifyMemoryIsolationInvocation(f.collector,f.claim,f.inventory,f.options),/memory injection or generation enabled/);
});

test('marker and immutable owner/source graph bindings cannot be supplied by the response',async t=>{
 const f=await trustedIsolationFixture(t);for(const mutate of [m=>m.claimHash='a'.repeat(64),m=>m.contextDigest='a'.repeat(64),m=>m.transportSourceHash='a'.repeat(64),m=>m.authorization.exceptionHash='a'.repeat(64)]){const marker=structuredClone(f.marker);mutate(marker);writeFileSync(join(f.evidenceRoot??f.root,'private/app-server/memory-isolation.json'),jsonBytes(marker));assert.throws(()=>verifyMemoryIsolationInvocation(f.collector,f.claim,f.inventory,f.options));}writeFileSync(join(f.evidenceRoot??f.root,'private/app-server/memory-isolation.json'),jsonBytes(f.marker));replaceRecord(f,r=>{r.sourceHashes['scripts/trix-scenario-collection/memory-isolated-app-server-bridge.mjs']='a'.repeat(64);r.processingBuild.sourceDigest=sourceDigest(r.sourceHashes);r.processingAudit.reviewSourceDigest=r.processingBuild.sourceDigest;});assert.throws(()=>verifyMemoryIsolationInvocation(f.collector,f.claim,f.inventory,f.options),/bridge source/);
});

for(const mirrored of [false,true])test(`approved digest cannot hide ${mirrored?'world-state mirrored':'developer'} memory`,async t=>{
 const f=await trustedIsolationFixture(t);replaceContext(f,rows=>rows.splice(2,0,mirrored?{type:'world_state',timestamp:rows[1].timestamp,payload:{full:true,state:{memories:{body:'========= MEMORY_SUMMARY prior review evidence'}}}}:{type:'response_item',timestamp:rows[1].timestamp,payload:{type:'message',role:'developer',content:[{type:'input_text',text:'Prior actor review evidence.'}],internal_chat_message_metadata_passthrough:{content_item_kinds:['memories.instructions']}}}));assert.throws(()=>verifyMemoryIsolationInvocation(f.collector,f.claim,f.inventory,f.options),mirrored?/Ambient memory mirrored/:/Ambient memory instruction/);
});
for(const [field,value]of [['syntheticOnly',true],['responseHash','a'.repeat(64)],['threadId','unrelated-thread'],['hostJournalRef',{path:'private/app-server/host-session.jsonl',sha256:'a'.repeat(64)}]])test(`changed invocation ${field} cannot admit an otherwise valid final`,async t=>{
 const f=await trustedIsolationFixture(t),path=join(f.evidenceRoot??f.root,'private/app-server/invocation.json'),invocation=JSON.parse(readFileSync(path,'utf8'));invocation[field]=value;writeFileSync(path,jsonBytes(invocation));assert.throws(()=>verifyMemoryIsolationInvocation(f.collector,f.claim,f.inventory,f.options));
});

test('claim/startup guard rejects unclaimed transport, missing callback, changed auth and later pause before turn',async t=>{
 const f=await trustedIsolationFixture(t),calls=readWireLog(f.evidenceRoot??f.root).filter(r=>r.frame?.method==='turn/start').length,guard={...f.options,inventory:f.inventory,verifyClaim(_c,claim){assert.deepEqual(claim,f.claim);}};assert.doesNotThrow(()=>withRunLock(f.root,()=>assertMemoryIsolationDispatchClaim(f.collector,f.job,guard)));assert.throws(()=>assertMemoryIsolationDispatchClaim(f.collector,{...f.job,jobId:'unclaimed'},guard),/dispatch claim/);assert.throws(()=>assertMemoryIsolationDispatchClaim(f.collector,f.job,{...guard,verifyClaim:undefined}),/caller-owned/);assert.throws(()=>assertMemoryIsolationDispatchClaim(f.collector,f.job,{...guard,authorization:{...f.authorization,hash:'a'.repeat(64)}}));appendEvent(f.root,'pause',{reason:'operator-request-during-startup'});assert.throws(()=>withRunLock(f.root,()=>assertMemoryIsolationDispatchClaim(f.collector,f.job,guard)),/Later pause/);assert.equal(readWireLog(f.evidenceRoot??f.root).filter(r=>r.frame?.method==='turn/start').length,calls);
});

test('recorded invocation cannot dispatch again and absolute cap cannot be extended',async t=>{
 const f=await trustedIsolationFixture(t),childProcess=createRequire(import.meta.url)('node:child_process'),originalSpawn=childProcess.spawn;let blockedSpawns=0;childProcess.spawn=()=>{blockedSpawns++;throw Error('Real process spawn forbidden by test');};syncBuiltinESMExports();try{await assert.rejects(()=>dispatchMemoryIsolatedHostJob(f.collector,f.job,{...f.options,inventory:f.inventory,verifyClaim(){}}),/Invocation already exists/);assert.equal(blockedSpawns,0);}finally{childProcess.spawn=originalSpawn;syncBuiltinESMExports();}const rows=readJournal(f.root),changed=structuredClone(rows);changed[2].data.job.deadlineAt=new Date(Date.parse(f.job.claimedAt)+300001).toISOString();let previousHash='0'.repeat(64);for(const row of changed){row.previousHash=previousHash;const {hash,...body}=row;row.hash=sha(jsonBytes(body));previousHash=row.hash;}writeFileSync(join(f.root,'private/journal.jsonl'),changed.map(row=>JSON.stringify(row)).join('\n')+'\n');assert.throws(()=>assertMemoryIsolationDispatchClaim(f.collector,changed[2].data.job,{...f.options,inventory:f.inventory,verifyClaim(){}}),/original deadline/);
});


test('operator pause during capability setup blocks turn/start at the locked second gate',async t=>{
 const f=await trustedIsolationFixture(t),warming=setup(t);await probeCapability(warming.client,{cwd:'C:/Windows/Temp'});assert.equal(readWireLog(warming.root).filter(row=>row.frame?.method==='turn/start').length,0);appendEvent(f.root,'pause',{reason:'operator-request-during-capability'});assert.throws(()=>withRunLock(f.root,()=>assertMemoryIsolationDispatchClaim(f.collector,f.job,{...f.options,inventory:f.inventory,verifyClaim(){}})),/Later pause/);assert.equal(readWireLog(warming.root).filter(row=>row.frame?.method==='turn/start').length,0);await warming.client.stop();
});
