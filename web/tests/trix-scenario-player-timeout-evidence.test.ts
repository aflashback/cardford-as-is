import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { verifyPlayerTimeoutInvocation } from '../../scripts/trix-scenario-collection/player-timeout-evidence.mjs';
import { describeAppServerContext, playerBaseInstructions, playerDeveloperInstructions } from '../../scripts/trix-scenario-collection/app-server-bridge.mjs';
import { projectPlayerPacket, renderPrompt } from '../../scripts/trix-scenario-collection/contracts.mjs';
import { preserveBuild, sourceDigest } from '../../scripts/coach-lab-builds.mjs';
import { playerTimeoutTransportSourceHash } from '../../scripts/trix-scenario-collection/player-timeout-evidence.mjs';
import { appendEvent, jsonBytes, putBlob, readJournal, sha } from '../../scripts/trix-scenario-collection/journal.mjs';

const reason = 'App-server invocation timeout';
const abortText = '<turn_aborted>\nThe previous turn was interrupted on purpose. Any running unified exec processes may still be running in the background. If any tools/commands were aborted, they may have partially executed.\n</turn_aborted>';
const guardFile = 'scripts/trix-scenario-collection/shutdown-safe-transport.mjs';
const time = seconds => new Date(Date.parse('2026-10-11T16:00:00.000Z') + seconds * 1000).toISOString();
const disabled = ['shell_tool','unified_exec','multi_agent','multi_agent_v2','code_mode_host','code_mode','computer_use','browser_use','browser_use_external','in_app_browser','plugins','remote_plugin','skill_search','skill_mcp_dependency_install','sleep_tool','tool_suggest'];

function fixture(t) {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'player-timeout-evidence-test-'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  const invocation = join(root, 'private/invocations/synthetic-job'), app = join(invocation, 'private/app-server'); mkdirSync(app, { recursive: true }); mkdirSync(join(root, 'outbox'));
  const write = (path, value) => writeFileSync(path, jsonBytes(value));
  const totals = [0, 1, 2, 3].map(seat => ({ id: `seat-${seat}`, seats: [seat], total: 0 }));
  const nativePacket = { publicSchemaVersion: '1.2.0', gameId: 'trix', variantId: 'basic-solo', seat: 0, phase: 'playing', observation: { id: 'synthetic-game', gameId: 'trix', variantId: 'basic-solo', seat: 0, phase: 'playing', turn: 0, kingdom: 1, dealNumber: 1, owner: 3, request: 'king', remainingRequests: [], hand: ['C2'], handCounts: [1, 1, 1, 1], trick: [], tricks: [], declarations: [], board: ['C', 'D', 'H', 'S'].map(suit => ({ suit, low: 0, high: 0 })), finishOrder: [], passes: [], ledger: [], withheldBonuses: [], lastExternalLeader: [null, null, null, null], totals, requestTotals: totals, kingdomTotals: totals, winners: [], layoutHistory: { version: '1.0.0', status: 'available', turns: [] } }, candidates: [{ id: 'play:C2', public: { kind: 'play-card', card: 'C2' } }] };
  const pin = { gameId: 'trix', variantId: 'basic-solo', moduleVersion: '2.2.0', ruleProfileId: 'trix-basic-solo-1.0.0', stateSchemaVersion: '1.2.0', observationSchemaVersion: '1.2.0', publicSchemaVersion: '1.2.0', eventSchemaVersion: '1.0.0' };
  const rules = { name: 'Synthetic Trix', description: 'Synthetic actor-safe player fixture.', text: 'Use only the native legal cards.', objective: 'own-request-points' };
  const frame = { revision: 2, snapshot: { synthetic: true, revision: 2 }, node: { phase: 'playing' }, nativeActorPacket: nativePacket, pin, rules }, frameRef = putBlob(root, frame);
  const packet = projectPlayerPacket(nativePacket, pin, 2, 'synthetic-job', rules), packetRef = putBlob(root, packet), nativePacketRef = putBlob(root, nativePacket);
  const prompt = renderPrompt(packet, 'playing').bytes, promptRef = putBlob(root, prompt); putBlob(invocation, prompt);
  const sourceHashes = Object.fromEntries(['scripts/trix-scenario-collection/app-server-bridge.mjs', 'scripts/trix-scenario-collection/journal.mjs', 'contracts/trix-scenario-collection/play-response.schema.json', 'planning/implementation/coach-lab/trix-scenario-collection/prompts/player.md'].map(path => [path, sha(readFileSync(resolve(path)))]));
  const preparedData = { schemaVersion: 'trix-player-job-1.0.0', runId: 'synthetic-player-timeout-run', jobId: 'synthetic-job', episodeId: 'synthetic-episode', decisionId: 'synthetic-episode:2:0', actor: 0, revision: 2, phase: 'playing', attempt: 1, requestedModel: 'gpt-6-luna', requestedEffort: 'max', pin, packetRef, nativePacketRef, sharedRulesHash: packet.sharedRulesHash, promptHash: sha(prompt), promptRef, responseSchemaHash: sourceHashes['contracts/trix-scenario-collection/play-response.schema.json'] };
  const claimData = { jobId: preparedData.jobId, dispatchToken: 'synthetic-token', parentThreadId: null, taskName: 'synthetic-player', claimedAt: time(0), deadlineAt: time(300) }, job = { ...preparedData, ...claimData };
  const add = (kind, data, at) => { const row = appendEvent(root, kind, data); row.at = at; const { hash, ...body } = row; row.hash = sha(jsonBytes(body)); const rows = readJournal(root); rows[rows.length - 1] = row; writeFileSync(join(root, 'private/journal.jsonl'), Buffer.concat(rows.map(jsonBytes))); return row; };
  const worker = join(root, 'synthetic-native-worker.exe'); writeFileSync(worker, 'Synthetic native worker bytes; never launched.'); const binaryDigest = sha(readFileSync(worker));
  const manifest = { runId: job.runId, sourceHashes, build: { sourceDigest: sourceDigest(sourceHashes), binaryDigest } };
  const boundary = add('initialized', {}, time(-5));
  const hashes = { ...sourceHashes, [guardFile]: playerTimeoutTransportSourceHash }, processingBuild = { sourceDigest: sourceDigest(hashes), binaryDigest };
  preserveBuild(root, resolve('.'), hashes, processingBuild, worker);
  const delegated = { policyVersion: 'trix-host-shutdown-guard-1.0.0', sourceFile: guardFile, sourceHash: playerTimeoutTransportSourceHash, processingBuild, processingAudit: { originalSourceDigest: manifest.build.sourceDigest, reviewSourceDigest: processingBuild.sourceDigest, nativeBinaryDigest: binaryDigest }, adapterSourceHash: sourceHashes['scripts/trix-scenario-collection/app-server-bridge.mjs'], journalSourceHash: sourceHashes['scripts/trix-scenario-collection/journal.mjs'] };
  const recovery = { schemaVersion: 'trix-review-timeout-recovery-1.0.0', runId: manifest.runId, originalManifestHash: sha(jsonBytes(manifest)), originalSourceDigest: manifest.build.sourceDigest, nativeBinaryDigest: binaryDigest, previousBoundary: { sequence: boundary.sequence, hash: boundary.hash }, sourceHashes: hashes, processingBuild, transportDelegation: delegated };
  const recoveryHash = sha(jsonBytes(recovery)), recoveryPath = `private/review-timeout/recoveries/${recoveryHash}.json`; mkdirSync(join(root, 'private/review-timeout/recoveries'), { recursive: true }); write(join(root, recoveryPath), recovery);
  const authorization = add('review-timeout-recovery-authorized', { recoveryHash, recoveryPath }, time(-4));
  const episodeStarted = add('episode-started', { episode: { episodeId: job.episodeId }, frameRef }, time(-3));
  const prepared = add('job-prepared', preparedData, time(-2)), claim = add('dispatch-claimed', claimData, time(0)), settlement = add('attempt-settled', { jobId: job.jobId, dispatchToken: job.dispatchToken, fatal: true, reason }, time(300.123));
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
    { timestamp: time(300.005), type: 'response_item', payload: { id: 'abort-notice', type: 'message', role: 'developer', content: [{ type: 'input_text', text: abortText }], internal_chat_message_metadata_passthrough: { turn_id: turnId, create_time: Date.parse(time(300.005)) / 1000, content_item_kinds: ['generic.turn_aborted'] } } },
    { timestamp: time(300.007), type: 'event_msg', payload: { type: 'turn_aborted', turn_id: turnId, root_turn_id: turnId, reason: 'interrupted', started_at: Date.parse(time(9)) / 1000, completed_at: Date.parse(time(300)) / 1000, duration_ms: 291007 } },
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
    { direction: 'inbound', at: time(280), frame: { method: 'item/reasoning/summaryTextDelta', params: { threadId, turnId, delta: 'Synthetic neutral reasoning activity.' } } },
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
    write(join(root, 'outbox', `${job.jobId}.json`), preparedData); write(join(root, 'outbox', `${job.jobId}.claim.json`), claimData); write(join(app, 'shutdown-guard.json'), { schemaVersion: delegated.policyVersion, jobId: job.jobId, sourceHash: delegated.sourceHash }); write(join(invocation, 'job.json'), job); write(join(app, 'job.json'), job);
    write(join(invocation, 'host-base-context-admission.json'), inventory); write(join(app, 'process.json'), processInfo); write(join(app, 'capability.json'), capability);
    writeFileSync(capability.journalPath, journalBytes()); saveWire();
  };
  const collector = { root, sourceRoot: resolve('.'), manifest, state: () => ({ rows: readJournal(root) }) };
  const editRun = edit => {
    const rows = readJournal(root); edit(rows); let previousHash = '0'.repeat(64);
    const changed = rows.map(({ hash: _hash, ...body }, index) => { body.sequence = index + 1; body.previousHash = previousHash; const row = { ...body, hash: sha(jsonBytes(body)) }; previousHash = row.hash; return row; });
    writeFileSync(join(root, 'private/journal.jsonl'), Buffer.concat(changed.map(jsonBytes)));
    Object.assign(claim, changed.find(r => r.kind === 'dispatch-claimed' && r.data.jobId === job.jobId));
  };
  save();
  return { root, app, invocation, job, preparedData, claimData, prepared, claim, settlement, frame, frameRef, packet, nativePacket, episodeStarted, recovery, recoveryPath, authorization, delegated, inventory, collector, frames, threadNotice, typedNotice, hostRows, cfg, thread, processInfo, capability, stopped, save, saveWire, editRun,
    verify: () => verifyPlayerTimeoutInvocation(collector, claim, inventory) };
}

test('clean guarded player timeout certifies consumed attempt one and host abort without action or output', t => {
  const f = fixture(t), files = ['job.json', 'host-base-context-admission.json', 'private/app-server/job.json', 'private/app-server/process.json', 'private/app-server/capability.json', 'private/app-server/stopped.json', 'private/app-server/wire.jsonl', 'private/app-server/shutdown-guard.json'];
  const originals = Object.fromEntries(files.map(path => [path, readFileSync(join(f.invocation, path))])), ledger = readFileSync(join(f.root, 'private/journal.jsonl'));
  const proof = f.verify(); assert.equal(proof.schemaVersion, 'trix-player-timeout-invocation-1.0.0');
  assert.equal(proof.classification, 'absolute-deadline-local-clean-stop-host-aborted-no-observed-final'); assert.equal(proof.acceptedResponse, false); assert.equal(proof.attempt, 1);
  assert.equal(proof.preparedHash, f.prepared.hash); assert.equal(proof.claimHash, f.claim.hash); assert.equal(proof.settlementHash, f.settlement.hash);
  assert.deepEqual(proof.beforeFrameRef, f.frameRef); assert.equal(proof.nativeBeforeDigest, sha(jsonBytes(f.frame.snapshot)));
  assert.equal(proof.guardSourceHash, playerTimeoutTransportSourceHash); assert.deepEqual(proof.transportDelegation, f.delegated);
  assert.equal(proof.transportAuthorization.hash, f.authorization.hash); assert.equal(proof.hostJournalSnapshot.path, `private/player-timeout/evidence/${f.job.jobId}/host-session.jsonl`);
  assert.ok(readFileSync(join(f.root, proof.hostJournalSnapshot.path)).equals(readFileSync(f.capability.journalPath)));
  assert.deepEqual(f.verify(), proof); assert.ok(readFileSync(join(f.root, 'private/journal.jsonl')).equals(ledger));
  for (const path of files) assert.ok(readFileSync(join(f.invocation, path)).equals(originals[path]));
  for (const path of ['response.txt', 'receipt.json', 'private/app-server/invocation.json', 'private/app-server/host-session.jsonl']) assert.equal(existsSync(join(f.invocation, path)), false);
  assert.equal(readJournal(f.root).filter(row => row.kind === 'job-prepared').length, 1);
});

const notice = (method, params) => ({ direction: 'inbound', at: time(20), frame: { method, params } });
function editJob(f, change) {
  change(f.preparedData, f.claimData); Object.assign(f.job, f.preparedData, f.claimData);
  f.editRun(rows => { rows.find(row => row.kind === 'job-prepared').data = f.preparedData; rows.find(row => row.kind === 'dispatch-claimed').data = f.claimData; });
}

for (const mode of ['wire-hash', 'wire-tail', 'wire-count', 'stop-error', 'sigterm', 'unverified-stop', 'missing-stop', 'interrupt', 'archive', 'rpc-unacked', 'extra-rpc', 'reused-id', 'second-turn', 'completed-turn', 'wire-final', 'wire-tool', 'stderr']) {
  test(`clean player timeout rejects incompatible transport ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'stop-error') f.stopped.error = 'write after end';
    if (mode === 'sigterm') f.stopped.exit = { code: null, signal: 'SIGTERM' };
    if (mode === 'unverified-stop') f.stopped.stoppedVerified = false;
    if (mode === 'interrupt' || mode === 'archive' || mode === 'extra-rpc') f.frames.push({ direction: 'outbound', at: time(299), frame: { id: 5, method: mode === 'interrupt' ? 'turn/interrupt' : mode === 'archive' ? 'thread/archive' : 'tools/call', params: {} } });
    if (mode === 'rpc-unacked') f.frames.splice(8, 1);
    if (mode === 'reused-id') f.frames[5].frame.id = 1;
    if (mode === 'second-turn') f.frames.push(structuredClone(f.frames[7]));
    if (mode === 'completed-turn') f.frames.push(notice('turn/completed', { turn: { id: f.frames[9].frame.params.turn.id, status: 'completed', error: null } }));
    if (mode === 'wire-final') f.frames.push(notice('item/completed', { item: { id: 'final', type: 'agentMessage', phase: 'final_answer', text: '{}' } }));
    if (mode === 'wire-tool') f.frames.push(notice('rawResponseItem/completed', { item: { id: 'tool', type: 'function_call', name: 'synthetic_tool' } }));
    if (mode === 'stderr') f.frames.push({ direction: 'stderr', at: time(20), frame: { level: 'WARN', message: 'Unclassified stderr.' } });
    f.save();
    if (mode === 'wire-count') { f.stopped.wireFrames++; writeFileSync(join(f.app, 'stopped.json'), jsonBytes(f.stopped)); }
    if (mode === 'wire-hash') { const path = join(f.app, 'wire.jsonl'), rows = readFileSync(path, 'utf8').trim().split('\n').map(JSON.parse); rows[0].hash = '0'.repeat(64); writeFileSync(path, Buffer.concat(rows.map(jsonBytes))); }
    if (mode === 'wire-tail') { const path = join(f.app, 'wire.jsonl'), bytes = readFileSync(path); writeFileSync(path, bytes.subarray(0, -1)); }
    if (mode === 'missing-stop') rmSync(join(f.app, 'stopped.json'));
    assert.throws(f.verify);
  });
}

for (const mode of ['model', 'effort', 'fallback', 'parent', 'instructions', 'prompt', 'typed-input', 'raw-join', 'inventory', 'context', 'context-model', 'executable', 'source', 'args', 'process-time', 'journal-thread']) {
  test(`clean player timeout rejects changed trust binding ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'model') f.cfg.model = 'other-model';
    if (mode === 'effort') f.frames[7].frame.params.effort = 'low';
    if (mode === 'fallback') f.cfg.allowProviderModelFallback = true;
    if (mode === 'parent') f.thread.thread.parentThreadId = 'Other parent';
    if (mode === 'instructions') f.cfg.developerInstructions += ' Changed.';
    if (mode === 'prompt') f.frames[7].frame.params.input[0].text += ' Changed.';
    if (mode === 'typed-input') f.typedNotice.frame.params.item.content[0].text += ' Changed.';
    if (mode === 'raw-join') f.hostRows[5].payload = { ...f.hostRows[5].payload, summary: ['Different recorded reasoning'] };
    if (mode === 'context') f.hostRows[0].payload.base_instructions.text += ' Changed.';
    if (mode === 'context-model') f.hostRows[2].payload.model = 'other-model';
    if (mode === 'executable') writeFileSync(f.processInfo.executable, 'Changed executable');
    if (mode === 'source') f.processInfo.adapterSourceHash = '0'.repeat(64);
    if (mode === 'args') f.processInfo.args.push('--enable', 'shell_tool');
    if (mode === 'process-time') f.processInfo.launchedAt = time(-1);
    if (mode === 'journal-thread') f.hostRows[0].payload.id = 'Other thread';
    f.save();
    if (mode === 'inventory') writeFileSync(join(f.invocation, 'host-base-context-admission.json'), jsonBytes({ ...f.inventory, approvedDigests: ['0'.repeat(64)] }));
    assert.throws(f.verify);
  });
}

for (const mode of ['short-window', 'long-window', 'invalid-window', 'late-wire', 'early-settlement', 'late-settlement', 'attempt-two', 'prior-prepared', 'duplicate-claim', 'duplicate-settlement', 'wrong-reason', 'nonfatal', 'wrong-token', 'missing-settlement', 'saved-response', 'saved-receipt', 'intent', 'commit', 'native-frame', 'packet', 'response-schema', 'stale-claim']) {
  test(`player timeout requires exact original first-attempt checkpoint: ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'short-window') editJob(f, (_prepared, claim) => { claim.deadlineAt = time(299); });
    if (mode === 'long-window') editJob(f, (_prepared, claim) => { claim.deadlineAt = time(301); });
    if (mode === 'invalid-window') editJob(f, (_prepared, claim) => { claim.claimedAt = 'Invalid date'; });
    if (mode === 'late-wire') f.frames.at(-1).at = time(301);
    if (mode === 'early-settlement' || mode === 'late-settlement') f.editRun(rows => { rows.find(row => row.kind === 'attempt-settled').at = time(mode === 'early-settlement' ? 299 : 306); });
    if (mode === 'attempt-two') editJob(f, prepared => { prepared.attempt = 2; });
    if (mode === 'prior-prepared') f.editRun(rows => { const index = rows.findIndex(row => row.kind === 'job-prepared'); rows.splice(index, 0, { ...structuredClone(rows[index]), data: { ...f.preparedData, jobId: 'earlier-job' } }); });
    if (mode === 'duplicate-claim') appendEvent(f.root, 'dispatch-claimed', f.claim.data);
    if (mode === 'duplicate-settlement') appendEvent(f.root, 'attempt-settled', f.settlement.data);
    if (mode === 'wrong-reason' || mode === 'nonfatal' || mode === 'wrong-token') f.editRun(rows => { const data = rows.find(row => row.kind === 'attempt-settled').data; if (mode === 'wrong-reason') data.reason = 'Other failure'; if (mode === 'nonfatal') data.fatal = false; if (mode === 'wrong-token') data.dispatchToken = 'Other token'; });
    if (mode === 'missing-settlement') f.editRun(rows => { rows.find(row => row.kind === 'attempt-settled').kind = 'unrelated-event'; });
    if (mode === 'intent' || mode === 'commit') appendEvent(f.root, mode === 'intent' ? 'commit-intent' : 'move-committed', { jobId: f.job.jobId });
    if (mode === 'native-frame') { const frame = structuredClone(f.frame); frame.revision++; const ref = putBlob(f.root, frame); f.editRun(rows => { rows.find(row => row.kind === 'episode-started').data.frameRef = ref; }); }
    if (mode === 'packet') editJob(f, prepared => { const packet = structuredClone(f.packet); packet.rulesAndScoring += ' Changed.'; prepared.packetRef = putBlob(f.root, packet); });
    if (mode === 'response-schema') editJob(f, prepared => { prepared.responseSchemaHash = '0'.repeat(64); });
    if (mode === 'stale-claim') { f.claim.data.taskName = 'Changed'; const { hash, ...body } = f.claim; f.claim.hash = sha(jsonBytes(body)); }
    f.save();
    if (mode === 'saved-response') writeFileSync(join(f.invocation, 'response.txt'), '{}');
    if (mode === 'saved-receipt') writeFileSync(join(f.invocation, 'receipt.json'), '{}');
    assert.throws(f.verify);
  });
}

for (const mode of ['missing-notice', 'unknown-text', 'wrong-kind', 'wrong-turn', 'early-notice', 'late-notice', 'metadata-time', 'wrong-root', 'wrong-reason', 'unknown-event-field', 'bad-duration', 'wrong-start', 'nonterminal-abort', 'extra-input', 'assistant-final', 'tool', 'task-complete', 'late-context']) {
  test(`clean local shutdown requires narrow host abort evidence: ${mode}`, t => {
    const f = fixture(t), abortNotice = f.hostRows[6], abort = f.hostRows[7];
    if (mode === 'missing-notice') f.hostRows.splice(6, 1);
    if (mode === 'unknown-text') abortNotice.payload.content[0].text += ' Other instructions.';
    if (mode === 'wrong-kind') abortNotice.payload.internal_chat_message_metadata_passthrough.content_item_kinds = ['generic.instructions'];
    if (mode === 'wrong-turn') abortNotice.payload.internal_chat_message_metadata_passthrough.turn_id = 'Other turn';
    if (mode === 'early-notice') abortNotice.timestamp = time(299);
    if (mode === 'late-notice') abortNotice.timestamp = time(301.001);
    if (mode === 'metadata-time') abortNotice.payload.internal_chat_message_metadata_passthrough.create_time = Date.parse(time(299)) / 1000;
    if (mode === 'wrong-root') abort.payload.root_turn_id = 'Other turn';
    if (mode === 'wrong-reason') abort.payload.reason = 'completed';
    if (mode === 'unknown-event-field') abort.payload.extra = true;
    if (mode === 'bad-duration') abort.payload.duration_ms = 301000;
    if (mode === 'wrong-start') abort.payload.started_at = Date.parse(time(-5)) / 1000;
    if (mode === 'nonterminal-abort') f.hostRows.push({ timestamp: time(300.008), type: 'token_usage_record', payload: {} });
    if (mode === 'extra-input' || mode === 'assistant-final') f.hostRows.splice(6, 0, { timestamp: time(20), type: 'response_item', payload: { type: 'message', role: mode === 'extra-input' ? 'user' : 'assistant', content: [{ type: 'input_text', text: 'Unexpected message.' }] } });
    if (mode === 'tool') f.hostRows.splice(6, 0, { timestamp: time(20), type: 'response_item', payload: { type: 'function_call', name: 'synthetic_tool' } });
    if (mode === 'task-complete') f.hostRows.splice(6, 0, { timestamp: time(20), type: 'event_msg', payload: { type: 'task_complete' } });
    if (mode === 'late-context') f.hostRows.splice(6, 0, { ...structuredClone(f.hostRows[2]), timestamp: time(20) });
    f.save(); assert.throws(f.verify);
  });
}

for (const mode of ['marker-version', 'marker-job', 'marker-source', 'missing-marker', 'metadata-hash', 'missing-authorization', 'changed-build', 'changed-native', 'wrong-source-map']) {
  test(`player timeout proves frozen authorized shutdown transport: ${mode}`, t => {
    const f = fixture(t), markerPath = join(f.app, 'shutdown-guard.json');
    if (mode.startsWith('marker-')) { const marker = JSON.parse(readFileSync(markerPath, 'utf8')); marker[mode === 'marker-version' ? 'schemaVersion' : mode === 'marker-job' ? 'jobId' : 'sourceHash'] = 'Wrong pin'; writeFileSync(markerPath, jsonBytes(marker)); }
    if (mode === 'missing-marker') rmSync(markerPath);
    if (mode === 'metadata-hash') { f.recovery.runId = 'Other run'; writeFileSync(join(f.root, f.recoveryPath), jsonBytes(f.recovery)); }
    if (mode === 'missing-authorization') f.editRun(rows => { rows.find(row => row.kind === 'review-timeout-recovery-authorized').kind = 'unrelated-event'; });
    if (mode === 'changed-build' || mode === 'changed-native') { const dir = join(f.root, 'builds', f.delegated.processingBuild.sourceDigest, f.delegated.processingBuild.binaryDigest); writeFileSync(mode === 'changed-build' ? join(dir, 'source', guardFile) : join(dir, process.platform === 'win32' ? 'worker.exe' : 'worker'), 'Changed frozen bytes'); }
    if (mode === 'wrong-source-map') { f.recovery.sourceHashes[guardFile] = '0'.repeat(64); const hash = sha(jsonBytes(f.recovery)), path = `private/review-timeout/recoveries/${hash}.json`; writeFileSync(join(f.root, path), jsonBytes(f.recovery)); f.editRun(rows => { rows.find(row => row.kind === 'review-timeout-recovery-authorized').data = { recoveryHash: hash, recoveryPath: path }; }); }
    assert.throws(f.verify);
  });
}

test('preserved player timeout proof rejects later own-journal changes', t => {
  const f = fixture(t); f.verify(); f.hostRows[5].payload.summary = ['Changed own journal']; f.save(); assert.throws(f.verify, /own host journal changed/);
});

const closingTelemetry = () => ({ timestamp: time(300.001), type: 'event_msg', payload: { type: 'token_count', info: null, rate_limits: { limit_id: 'codex', limit_name: null, primary: { used_percent: 23, window_minutes: 10080, resets_at: 1792342838 }, secondary: null, credits: { has_credits: false, unlimited: false, balance: '0' }, individual_limit: null, spend_control_reached: null, plan_type: 'promax', rate_limit_reached_type: null } } });

test('one schema-bound terminal usage notice may precede the same-turn shutdown abort', t => {
  const f = fixture(t); f.hostRows.splice(6, 0, closingTelemetry()); f.save(); assert.equal(f.verify().acceptedResponse, false);
});

for (const mode of ['multiple', 'info-content', 'extra-field', 'wrong-type', 'wrong-position', 'after-abort', 'wrong-plan', 'bad-percent', 'missing-limits']) {
  test(`late shutdown telemetry cannot conceal other activity: ${mode}`, t => {
    const f = fixture(t), telemetry = closingTelemetry();
    if (mode === 'multiple') f.hostRows.splice(6, 0, closingTelemetry());
    if (mode === 'info-content') telemetry.payload.info = { message: 'Unexpected output' };
    if (mode === 'extra-field') telemetry.payload.extra = 'Unknown';
    if (mode === 'wrong-type') telemetry.payload.type = 'task_complete';
    if (mode === 'after-abort') telemetry.timestamp = time(300.006);
    if (mode === 'wrong-plan') telemetry.payload.rate_limits.plan_type = 'other';
    if (mode === 'bad-percent') telemetry.payload.rate_limits.primary.used_percent = 101;
    if (mode === 'missing-limits') telemetry.payload.rate_limits = null;
    f.hostRows.splice(mode === 'wrong-position' ? 5 : 6, 0, telemetry); f.save(); assert.throws(f.verify);
  });
}

