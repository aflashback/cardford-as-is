// Trusted local wire recorder. A model response/receipt never supplies evidence.
import { spawn } from 'node:child_process';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getBlob, jsonBytes, safePath, sha, writeImmutable } from './journal.mjs';
import { parseHostJournal, describeBaseContext } from './host-journal.mjs';

export const defaultExecutable = 'C:/Users/AliA/AppData/Local/OpenAI/Codex/bin/9691020b546a15b2/codex.exe';
export const playerBaseInstructions = 'You are an offline card-game player. Use only the supplied actor-safe packet. Return the requested JSON response. Never use tools, access files, browse, delegate, or ask for additional information.';
export const playerDeveloperInstructions = 'Every invocation is a fresh independent decision. Follow native legal options and scoring in the packet. Do not use previous conversations, ambient project memory, collection targets, reviewer advice, or another player\'s private information.';
const check = (condition, message) => { if (!condition) throw Error(message); };
const disabledFeatures = ['shell_tool', 'unified_exec', 'multi_agent', 'multi_agent_v2', 'code_mode_host', 'code_mode', 'computer_use', 'browser_use', 'browser_use_external', 'in_app_browser', 'plugins', 'remote_plugin', 'skill_search', 'skill_mcp_dependency_install', 'sleep_tool', 'tool_suggest'];
const frameBytes = frame => Buffer.from(JSON.stringify(frame) + '\n');
const hostCapabilities = new WeakMap();
function isHostEnvironmentMessage(item) {
  const kinds = item.internal_chat_message_metadata_passthrough?.content_item_kinds;
  return kinds?.length === 1 && kinds[0] === 'environments.environment_context' && item.content?.length === 1 && item.content[0].type === 'input_text' && /^<environment_context>\n  <current_date>\d{4}-\d{2}-\d{2}<\/current_date>\n  <timezone>[A-Za-z_]+\/[A-Za-z_]+<\/timezone>\n<\/environment_context>$/.test(item.content[0].text);
}

function recorder(root) {
  const directory = safePath(root, 'private/app-server'); mkdirSync(directory, { recursive: true });
  const fd = openSync(safePath(root, 'private/app-server/wire.jsonl'), 'wx');
  let sequence = 0, previousHash = '0'.repeat(64), closed = false;
  return {
    write(direction, bytes) {
      check(!closed, 'Recorder is closed');
      const data = Buffer.from(bytes), body = { sequence: ++sequence, at: new Date().toISOString(), direction, bytesBase64: data.toString('base64'), bytesHash: sha(data), previousHash };
      const entry = { ...body, hash: sha(jsonBytes(body)) }, output = jsonBytes(entry);
      let offset = 0; while (offset < output.length) offset += writeSync(fd, output, offset);
      fsyncSync(fd); previousHash = entry.hash;
      return entry;
    },
    close() { if (!closed) { fsyncSync(fd); closeSync(fd); closed = true; } },
    get digest() { return previousHash; },
    get count() { return sequence; },
  };
}

export function readWireLog(root) {
  const text = readFileSync(safePath(root, 'private/app-server/wire.jsonl'), 'utf8');
  if (text === '') return [];
  check(text.endsWith('\n'), 'Truncated app-server wire log');
  let previousHash = '0'.repeat(64);
  return text.slice(0, -1).split('\n').map((line, index) => {
    const entry = JSON.parse(line), { hash, ...body } = entry;
    check(entry.sequence === index + 1 && entry.previousHash === previousHash && hash === sha(jsonBytes(body)), 'App-server wire log gap or corruption');
    const bytes = Buffer.from(entry.bytesBase64, 'base64'); check(sha(bytes) === entry.bytesHash, 'App-server wire frame corruption');
    previousHash = hash;
    return { ...entry, bytes, frame: ['outbound', 'inbound'].includes(entry.direction) ? JSON.parse(bytes.toString('utf8')) : null };
  });
}

export function describeAppServerContext(bytes, promptBytes) {
  const rows = parseHostJournal(bytes), text = Buffer.from(promptBytes).toString('utf8');
  const tasks = rows.filter(r => r.type === 'response_item' && r.payload.type === 'message' && r.payload.role === 'user' && r.payload.internal_chat_message_metadata_passthrough?.content_item_kinds?.includes('user.text'));
  check(tasks.length === 1 && tasks[0].payload.content?.length === 1 && tasks[0].payload.content[0].type === 'input_text' && tasks[0].payload.content[0].text === text, 'Host journal frozen input mismatch');
  const boundary = rows.indexOf(tasks[0]);
  const contexts = rows.filter(r => r.type === 'turn_context');
  check(contexts.length === 1 && rows.indexOf(contexts[0]) < boundary && contexts[0].payload.model === 'gpt-6-luna' && contexts[0].payload.effort === 'max', 'Host journal effective configuration mismatch');
  return describeBaseContext(rows.slice(0, boundary));
}

export function startClient({ root, cwd, executable = defaultExecutable, timeoutMs = 30000, spawnProcess = spawn }) {
  check(isAbsolute(cwd) && timeoutMs > 0 && timeoutMs <= 300000, 'Invalid isolated app-server startup');
  const log = recorder(root), signals = new EventEmitter();
  const args = ['app-server', '--listen', 'stdio://', ...disabledFeatures.flatMap(name => ['--disable', name]), '--enable', 'skip_host_skill_discovery'];
  const launchedAt = new Date().toISOString();
  const executableHash = spawnProcess === spawn ? sha(readFileSync(executable)) : 'fixture';
  writeImmutable(safePath(root, 'private/app-server/process.json'), jsonBytes({ schemaVersion: 'trix-app-server-process-1.0.0', executable: resolve(executable), executableHash, args, cwd, launchedAt, adapterSourceHash: sha(readFileSync(new URL('./app-server-bridge.mjs', import.meta.url))), journalSourceHash: sha(readFileSync(new URL('./journal.mjs', import.meta.url))) }));
  let child;
  try { child = spawnProcess(executable, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); } catch (error) { log.close(); throw error; }
  let nextId = 1, buffer = Buffer.alloc(0), fatal = null, exited = false, streamClosed = false, exitResult = null, stopping = null;
  const pending = new Map(), notifications = [];
  let resolveExit;
  const closed = new Promise(resolveClosed => { resolveExit = resolveClosed; });
  const fail = error => {
    if (fatal) return;
    fatal = error instanceof Error ? error : Error(String(error));
    for (const work of pending.values()) { clearTimeout(work.timer); work.reject(fatal); } pending.clear();
    signals.emit('fatal', fatal);
    try { child.kill(); } catch {};
  };
  const send = frame => {
    check(!fatal && !exited, 'App-server is unavailable');
    const bytes = frameBytes(frame);
    // The exact fsynced bytes are the bytes sent, never reserialized afterward.
    log.write('outbound', bytes); child.stdin.write(bytes);
  };
  const accept = bytes => {
    log.write('inbound', bytes);
    let frame;
    try { frame = JSON.parse(bytes.toString('utf8')); } catch { fail(Error('Invalid app-server JSON frame')); return; }
    if (frame.method && Object.hasOwn(frame, 'id')) {
      // Never approve a command, file write, permissions escalation, MCP action,
      // or dynamic tool request. All server requests are fail-closed.
      try { send({ id: frame.id, error: { code: -32601, message: 'Offline player client rejects all server requests.' } }); } catch {};
      fail(Error(`App-server requested disallowed action: ${frame.method}`)); return;
    }
    if (Object.hasOwn(frame, 'id')) {
      const work = pending.get(frame.id);
      if (!work) { fail(Error('Unknown or duplicate app-server response ID')); return; }
      clearTimeout(work.timer); pending.delete(frame.id);
      if (frame.error) { work.reject(Error(`App-server RPC ${work.method} failed: ${frame.error.code}`)); fail(Error('App-server returned an RPC error')); }
      else if (Object.hasOwn(frame, 'result')) work.resolve(frame.result);
      else { work.reject(Error('Missing app-server result')); fail(Error('Invalid app-server response')); }
      return;
    }
    if (typeof frame.method !== 'string' || !frame.params) { fail(Error('Unknown app-server frame')); return; }
    notifications.push(frame); signals.emit('notification', frame);
  };
  child.stdout.on('data', chunk => {
    try {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      check(buffer.length <= 16 * 1024 * 1024, 'Unbounded app-server frame');
      let newline; while ((newline = buffer.indexOf(10)) !== -1) { const bytes = buffer.subarray(0, newline + 1); buffer = buffer.subarray(newline + 1); accept(bytes); }
    } catch (error) { fail(error); }
  });
  child.stderr.on('data', bytes => { try { log.write('stderr', bytes); } catch (error) { fail(error); } });
  child.stdin.on('error', fail); child.stdout.on('error', fail); child.stderr.on('error', fail);
  child.on('error', error => { fail(error); if (!child.pid && !exited) { exited = true; streamClosed = true; resolveExit({ code: null, signal: null, spawnFailed: true }); } });
  child.on('exit', (code, signal) => {
    exited = true; exitResult = { code, signal };
    for (const work of pending.values()) { clearTimeout(work.timer); work.reject(fatal ?? Error('App-server exited before response')); } pending.clear();
    signals.emit('exit', exitResult);
  });
  child.on('close', () => {
    streamClosed = true;
    if (buffer.length > 0) { try { log.write('inbound-fragment', buffer); } catch {}; fatal ??= Error('Truncated app-server stream'); }
    resolveExit(exitResult);
  });
  const client = {
    root, notifications, signals,
    request(method, params) {
      if (fatal || exited) return Promise.reject(fatal ?? Error('App-server has exited'));
      const id = nextId++;
      return new Promise((resolveResult, reject) => {
        const timer = setTimeout(() => fail(Error(`App-server RPC timeout: ${method}`)), timeoutMs);
        pending.set(id, { method, resolve: resolveResult, reject, timer });
        try { send({ id, method, params }); } catch (error) { fail(error); }
      });
    },
    notify(method, params) { send({ method, ...(params === undefined ? {} : { params }) }); },
    get error() { return fatal; },
    get exited() { return exited; },
    async stop() {
      if (stopping) return stopping;
      stopping = (async () => {
      if (!exited) { try { child.stdin.end(); } catch {}; }
      let timer;
      const grace = await Promise.race([closed, new Promise(resolveGrace => { timer = setTimeout(() => resolveGrace(null), 1000); })]); clearTimeout(timer);
      if (!grace && !exited) { try { child.kill(); } catch {}; }
      let killTimer;
      const result = streamClosed ? exitResult : await Promise.race([closed, new Promise(resolveKill => { killTimer = setTimeout(() => resolveKill(null), 3000); })]); clearTimeout(killTimer);
      const verifiedStopped = exited && streamClosed;
      if (verifiedStopped) log.close();
      const receipt = { stoppedVerified: verifiedStopped, pid: child.pid ?? null, exit: result, wireDigest: log.digest, wireFrames: log.count, error: fatal?.message ?? null };
      if (verifiedStopped) writeImmutable(safePath(root, 'private/app-server/stopped.json'), jsonBytes(receipt));
      return receipt;
      })();
      return stopping;
    },
  };
  return client;
}

export async function probeCapability(client, { cwd, baseInstructions = playerBaseInstructions, developerInstructions = playerDeveloperInstructions }) {
  check(isAbsolute(cwd), 'Isolated cwd must be absolute');
  await client.request('initialize', { clientInfo: { name: 'trix_offline_host_recorder', version: '1.0.0' }, capabilities: { experimentalApi: true, optOutNotificationMethods: [] } });
  client.notify('initialized');
  const models = [];
  let cursor = null, pages = 0;
  do {
    check(++pages <= 20, 'Unbounded model catalog');
    const page = await client.request('model/list', { includeHidden: true, limit: 100, ...(cursor ? { cursor } : {}) });
    check(Array.isArray(page.data), 'Missing host model catalog'); models.push(...page.data); cursor = page.nextCursor ?? null;
  } while (cursor);
  const found = models.filter(m => m.model === 'gpt-6-luna');
  check(found.length === 1 && found[0].supportedReasoningEfforts?.some(e => e.reasoningEffort === 'max'), 'Exact Luna Max unavailable in app-server catalog');
  const params = { model: 'gpt-6-luna', allowProviderModelFallback: false, config: { model_reasoning_effort: 'max', web_search: 'disabled' }, baseInstructions, developerInstructions, cwd, sandbox: 'read-only', approvalPolicy: 'never', dynamicTools: [], environments: [], runtimeWorkspaceRoots: [], selectedCapabilityRoots: [], experimentalRawEvents: true, ephemeral: false };
  const response = await client.request('thread/start', params);
  check(response.model === 'gpt-6-luna' && response.reasoningEffort === 'max', 'App-server selected different model or effort');
  check(typeof response.thread?.id === 'string' && response.thread.forkedFromId === null && response.thread.parentThreadId === null && response.thread.turns?.length === 0, 'App-server did not create a fresh independent thread');
  check(Array.isArray(response.thread.environments) && response.thread.environments.length === 0 && response.runtimeWorkspaceRoots?.length === 0, 'App-server inherited environment/workspace access');
  check(Array.isArray(response.instructionSources), 'Host instruction source manifest unavailable');
  const result = { schemaVersion: 'trix-app-server-capability-1.0.0', model: response.model, effort: response.reasoningEffort, threadId: response.thread.id, journalPath: response.thread.path ?? null, instructionSources: response.instructionSources, request: params, response, baseContextApproved: false };
  writeImmutable(safePath(client.root, 'private/app-server/capability.json'), jsonBytes(result));
  hostCapabilities.set(result, client);
  return result;
}

// The coordinator must obtain/audit full base context and install its exact
// digest inventory before enabling this function. Configuration-only preflight
// never dispatches turn/start.
export function invoke(client, capability, job, options = {}) {
  return performInvocation(client, capability, job, options, false);
}

export function invokeSyntheticProbe(client, capability, job, options = {}) {
  check(job.syntheticProbe === true && job.runId === undefined && job.episodeId === undefined, 'Synthetic probe must not be a dataset job');
  return performInvocation(client, capability, job, options, true);
}

async function performInvocation(client, capability, job, { outputSchema, auditedContextDigest, timeoutMs = 30000, diagnosticNotifications = false } = {}, syntheticOnly = false) {
  check(!diagnosticNotifications || syntheticOnly, 'Diagnostic notifications are synthetic-only');
  check(hostCapabilities.get(capability) === client, 'Capability must come from this live host client');
  if (!syntheticOnly) {
    check(/^[a-f0-9]{64}$/.test(auditedContextDigest ?? ''), 'Missing coordinator-audited base context');
    const inventory = JSON.parse(readFileSync(safePath(client.root, 'host-base-context-admission.json'), 'utf8'));
    check(inventory.schemaVersion === 'trix-host-base-context-admission-1.0.0' && inventory.approvedDigests?.includes(auditedContextDigest), 'Unapproved app-server base context');
  }
  check(capability.model === 'gpt-6-luna' && capability.effort === 'max', 'Invalid app-server capability pin');
  const prompt = getBlob(client.root, job.promptRef, false);
  check(sha(prompt) === job.promptHash, 'Frozen player prompt mismatch');
  const text = prompt.toString('utf8'); check(Buffer.from(text).equals(prompt), 'Prompt is not valid UTF-8');
  // Written by the trusted dispatcher before any model request, binding the
  // collector job token and frozen input to this invocation directory.
  writeImmutable(safePath(client.root, 'private/app-server/job.json'), jsonBytes(job));
  const params = { threadId: capability.threadId, model: 'gpt-6-luna', effort: 'max', input: [{ type: 'text', text, text_elements: [] }], additionalContext: {}, environments: [], runtimeWorkspaceRoots: [], ...(outputSchema ? { outputSchema } : {}) };
  const seenItems = new Map(), unclassifiedNotifications = []; let turnId = null, completed = null, started = false, threadAnnounced = false, violation = null, archiving = false, result = null;
  let resolveComplete, rejectComplete, timer;
  const complete = new Promise((resolveTurn, rejectTurn) => { resolveComplete = resolveTurn; rejectComplete = rejectTurn; });
  // Attach rejection handling before RPC dispatch; a synchronous tool event
  // must not produce an unhandled promise rejection.
  complete.catch(() => {});
  const fail = error => { rejectComplete(error); };
  const onNotification = frame => {
    try {
      const p = frame.params;
      const permittedNotifications = new Set(['thread/started', 'thread/status/changed', 'thread/tokenUsage/updated', 'turn/started', 'turn/completed', 'item/started', 'item/completed', 'item/agentMessage/delta', 'item/reasoning/summaryTextDelta', 'item/reasoning/summaryPartAdded', 'item/reasoning/textDelta', 'rawResponseItem/completed', 'rawResponse/completed', 'model/verification', 'model/safetyBuffering/updated', 'turn/moderationMetadata', 'account/updated', 'account/rateLimits/updated', 'warning', 'mcpServer/startupStatus/updated', ...(archiving ? ['thread/archived'] : [])]);
      const legacyType = p.msg?.type;
      if (/rerout|approval|tool.*call|command.*execution|file.*change|exec.*command/i.test(frame.method) || (legacyType && /tool|exec|patch|collab|mcp|web_search/i.test(legacyType))) throw Error('Disallowed diagnostic tool or routing activity');
      if (p.item?.type) check(['message', 'reasoning', 'userMessage', 'agentMessage'].includes(p.item.type), 'App-server player tool call or unknown item');
      if (!permittedNotifications.has(frame.method)) {
        check(diagnosticNotifications, 'Unknown or disallowed app-server activity');
        unclassifiedNotifications.push(frame);
      }
      if (frame.method === 'account/updated') check(p.authMode === 'chatgpt' && typeof p.planType === 'string', 'Unexpected account identity change');
      if (frame.method === 'rawResponseItem/completed') {
        check(['message', 'reasoning'].includes(p.item?.type), 'Raw app-server player tool call or unknown item');
        if (p.item.type === 'message') {
          check(['user', 'assistant', 'developer', 'system'].includes(p.item.role) && Array.isArray(p.item.content), 'Unknown raw response message');
          if (p.item.role === 'user') check(isHostEnvironmentMessage(p.item) || (p.item.content.length === 1 && p.item.content[0].type === 'input_text' && p.item.content[0].text === text), 'Raw app-server inherited user input');
          check(p.item.content.every(c => ['input_text', 'output_text'].includes(c.type) && typeof c.text === 'string'), 'Uninspectable raw response message');
        }
      }
      if (frame.method === 'rawResponse/completed') check(typeof p.responseId === 'string', 'Missing upstream response identity');
      if (frame.method === 'thread/started') {
        check(!threadAnnounced && !started && p.thread?.id === capability.threadId && p.thread.model === 'gpt-6-luna' && p.thread.reasoningEffort === 'max' && p.thread.parentThreadId === null && p.thread.forkedFromId === null && p.thread.turns?.length === 0 && p.thread.environments?.length === 0, 'Unexpected or inherited thread announcement'); threadAnnounced = true;
      }
      if (frame.method === 'warning') {
        check(typeof p.message === 'string' && (p.message.startsWith('Under-development features enabled: skip_host_skill_discovery. Under-development features are incomplete and may behave unpredictably. To suppress this warning, set `suppress_unstable_features_warning = true` in ') || p.message === 'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.'), 'Unexpected app-server warning');
      }
      if (frame.method === 'mcpServer/startupStatus/updated') check(['node_repl', 'codex_apps'].includes(p.name) && ['starting', 'ready'].includes(p.status) && !p.error && !p.failureReason, 'Unexpected MCP infrastructure startup failure');
      if (p.threadId && p.threadId !== capability.threadId) throw Error('Wrong app-server event thread');
      if (frame.method === 'model/rerouted' || frame.method === 'error' || frame.method === 'thread/compacted' || frame.method.startsWith('hook/') || frame.method.includes('Approval') || frame.method === 'thread/settings/updated') throw Error('App-server reroute/error/context change');
      if (frame.method === 'turn/started') { check(!started, 'Additional app-server turn'); started = true; turnId = p.turn.id; }
      if (p.turnId && turnId) check(p.turnId === turnId, 'Wrong app-server event turn');
      if (frame.method === 'item/started' || frame.method === 'item/completed') {
        check(['userMessage', 'agentMessage', 'reasoning'].includes(p.item?.type), 'App-server player tool call or unknown item');
        if (p.item.type === 'userMessage') check(p.item.content?.length === 1 && p.item.content[0].type === 'text' && p.item.content[0].text === text, 'App-server inherited user input');
        const key = `${frame.method}:${p.item.id}`; check(!seenItems.has(key), 'Duplicate app-server item event'); seenItems.set(key, p.item);
      }
      if (frame.method === 'turn/completed') { check(started && p.turn.id === turnId && p.turn.status === 'completed' && !p.turn.error && !completed, 'Incomplete app-server turn'); completed = p.turn; resolveComplete(completed); }
      if (!diagnosticNotifications && frame.method.startsWith('item/') && !['item/started', 'item/completed', 'item/agentMessage/delta', 'item/reasoning/summaryTextDelta', 'item/reasoning/summaryPartAdded', 'item/reasoning/textDelta'].includes(frame.method)) throw Error('Unknown app-server item activity');
    } catch (error) { violation ??= error; fail(error); }
  };
  client.signals.on('notification', onNotification); client.signals.on('fatal', fail);
  const onExit = () => { if (!completed) fail(Error('App-server exited before verified completion')); }; client.signals.on('exit', onExit);
  try {
    check(timeoutMs > 0 && timeoutMs <= 300000, 'Invalid invocation deadline');
    timer = setTimeout(() => { fail(Error('App-server invocation timeout')); void client.stop(); }, timeoutMs);
    const response = await client.request('turn/start', params);
    check(response.turn?.id && (!turnId || response.turn.id === turnId), 'App-server turn response mismatch'); turnId ??= response.turn.id;
    await complete;
    check(!client.error, 'Host stream failure');
    const finals = [...seenItems.entries()].filter(([key, value]) => key.startsWith('item/completed:') && value.type === 'agentMessage' && ['final', 'final_answer'].includes(value.phase));
    check(finals.length === 1 && typeof finals[0][1].text === 'string', 'Missing unique app-server final');
    const responseBytes = Buffer.from(finals[0][1].text);
    result = { schemaVersion: 'trix-app-server-invocation-1.0.0', invocationId: randomUUID(), jobId: job.jobId, threadId: capability.threadId, turnId, model: 'gpt-6-luna', effort: 'max', promptHash: job.promptHash, responseHash: sha(responseBytes), responseBytes, baseContextDigest: syntheticOnly ? null : auditedContextDigest, toolCallCount: unclassifiedNotifications.length ? null : 0, unclassifiedNotificationMethods: [...new Set(unclassifiedNotifications.map(f => f.method))], syntheticOnly, admitted: false, requiresPostTurnContextAudit: true };
    return result;
  } finally {
    clearTimeout(timer);
    if (!completed && turnId && !client.error && !client.exited) {
      try { await client.request('turn/interrupt', { threadId: capability.threadId, turnId }); } catch {};
    }
    let archiveError = null;
    if (completed && !client.error && !client.exited) {
      archiving = true;
      try { await client.request('thread/archive', { threadId: capability.threadId }); } catch (error) { archiveError = error; }
    }
    const stopped = await client.stop();
    client.signals.off('notification', onNotification); client.signals.off('fatal', fail); client.signals.off('exit', onExit);
    if (result) {
      result.stoppedVerified = stopped.stoppedVerified;
      result.archived = !archiveError && archiving;
      result.hostJournalRef = null;
      if (capability.journalPath) {
        try {
          check(capability.journalPath.endsWith(`-${capability.threadId}.jsonl`), 'Host journal path identity mismatch');
          // thread/archive moves the host file into the sibling archive store.
          // Try only this thread's exact returned filename, never scan bodies.
          let bytes;
          try { bytes = readFileSync(capability.journalPath); } catch (error) {
            if (error.code !== 'ENOENT' || !result.archived) throw error;
            const archivedPath = resolve(dirname(capability.journalPath), '../../../../archived_sessions', basename(capability.journalPath));
            bytes = readFileSync(archivedPath);
          }
          check(bytes.length > 0 && bytes.at(-1) === 10, 'Host journal is incomplete');
          const name = 'private/app-server/host-session.jsonl'; writeImmutable(safePath(client.root, name), bytes);
          result.hostJournalRef = { path: name, sha256: sha(bytes) };
          const context = describeAppServerContext(bytes, prompt);
          result.actualBaseContextDigest = context.digest;
          writeImmutable(safePath(client.root, 'private/app-server/context-audit.json'), jsonBytes(context));
          if (!syntheticOnly) check(context.digest === auditedContextDigest, 'Actual post-turn context differs from approved context');
        } catch (error) { result.contextExportError = error.message; }
      }
      writeImmutable(safePath(client.root, 'private/app-server/invocation.json'), jsonBytes({ ...result, responseBytes: undefined }));
    }
    check(stopped.stoppedVerified, 'App-server stop could not be verified');
    if (violation) throw violation;
    if (client.error) throw client.error;
    if (archiveError) throw archiveError;
    if (result?.contextExportError && !syntheticOnly) throw Error(result.contextExportError);
  }
}

const evidenceNotifications = new Set(['remoteControl/status/changed', 'thread/started', 'thread/status/changed', 'thread/tokenUsage/updated', 'turn/started', 'turn/completed', 'item/started', 'item/completed', 'item/agentMessage/delta', 'item/reasoning/summaryTextDelta', 'item/reasoning/summaryPartAdded', 'item/reasoning/textDelta', 'rawResponseItem/completed', 'rawResponse/completed', 'model/verification', 'model/safetyBuffering/updated', 'turn/moderationMetadata', 'account/updated', 'account/rateLimits/updated', 'warning', 'mcpServer/startupStatus/updated', 'thread/archived']);

export function inspectAppServerEvidence(root, job, { allowSyntheticProbe = false } = {}) {
  try {
    check(!job.syntheticProbe || allowSyntheticProbe, 'Synthetic evidence cannot admit a dataset job');
    const prompt = getBlob(root, job.promptRef, false); check(sha(prompt) === job.promptHash, 'Frozen job prompt mismatch');
    // The early capability diagnostic predates the dispatch-token manifest.
    // Only its explicitly permitted synthetic audit may omit that manifest.
    if (!allowSyntheticProbe) {
      const dispatched = JSON.parse(readFileSync(safePath(root, 'private/app-server/job.json'), 'utf8'));
      check(JSON.stringify(dispatched) === JSON.stringify(job), 'Trusted transport job binding mismatch');
    }
    const wire = readWireLog(root); check(wire.length > 0, 'Missing app-server wire evidence');
    const stopped = JSON.parse(readFileSync(safePath(root, 'private/app-server/stopped.json'), 'utf8'));
    check(stopped.stoppedVerified && !stopped.error && stopped.wireFrames === wire.length && stopped.wireDigest === wire.at(-1).hash, 'Incomplete host process evidence');
    const outbound = wire.filter(r => r.direction === 'outbound').map(r => r.frame);
    check(wire.every(r => ['outbound', 'inbound', 'stderr'].includes(r.direction)), 'Incomplete wire stream');
    check(outbound.every(f => ['initialize', 'initialized', 'model/list', 'thread/start', 'turn/start', 'thread/archive'].includes(f.method)), 'Unexpected outbound host action');
    const one = method => { const a = wire.filter(r => r.direction === 'outbound' && r.frame.method === method); check(a.length === 1, `Missing or additional ${method}`); return a[0]; };
    one('initialize'); one('initialized'); const threadRequest = one('thread/start'), turnRequest = one('turn/start'); one('thread/archive');
    const responses = new Map();
    check(new Set(outbound.filter(f => f.id !== undefined).map(f => f.id)).size === outbound.filter(f => f.id !== undefined).length, 'Reused outbound RPC identity');
    for (const r of wire.filter(x => x.direction === 'inbound' && Object.hasOwn(x.frame, 'id'))) {
      check(!r.frame.method && !r.frame.error && Object.hasOwn(r.frame, 'result') && !responses.has(r.frame.id), 'Host error/request/duplicate response');
      check(outbound.some(f => f.id === r.frame.id), 'Unjoined host response'); responses.set(r.frame.id, r.frame.result);
    }
    check(outbound.filter(f => f.id !== undefined).every(f => responses.has(f.id)), 'Missing host RPC completion');
    const catalogs = outbound.filter(f => f.method === 'model/list').flatMap(f => responses.get(f.id).data ?? []);
    check(catalogs.some(m => m.model === 'gpt-6-luna' && m.supportedReasoningEfforts?.some(e => e.reasoningEffort === 'max')), 'Exact host model unavailable');
    const cfg = threadRequest.frame.params, thread = responses.get(threadRequest.frame.id);
    check(cfg.model === 'gpt-6-luna' && cfg.allowProviderModelFallback === false && cfg.config?.model_reasoning_effort === 'max' && cfg.config.web_search === 'disabled' && cfg.baseInstructions === playerBaseInstructions && cfg.developerInstructions === playerDeveloperInstructions && cfg.approvalPolicy === 'never' && cfg.sandbox === 'read-only', 'Host configuration pin mismatch');
    for (const key of ['dynamicTools', 'environments', 'runtimeWorkspaceRoots', 'selectedCapabilityRoots']) check(Array.isArray(cfg[key]) && cfg[key].length === 0, 'Inherited host context capabilities');
    check(thread.model === 'gpt-6-luna' && thread.reasoningEffort === 'max' && thread.thread?.parentThreadId === null && thread.thread.forkedFromId === null && thread.thread.turns?.length === 0 && thread.thread.environments?.length === 0 && thread.runtimeWorkspaceRoots?.length === 0, 'Host effective configuration or freshness mismatch');
    const threadId = thread.thread.id, params = turnRequest.frame.params, turn = responses.get(turnRequest.frame.id).turn;
    check(params.threadId === threadId && params.model === 'gpt-6-luna' && params.effort === 'max' && params.input?.length === 1 && params.input[0].type === 'text' && Buffer.from(params.input[0].text).equals(prompt) && params.input[0].text_elements?.length === 0, 'Host exact input/configuration mismatch');
    check(JSON.stringify(params.additionalContext) === '{}' && params.environments?.length === 0 && params.runtimeWorkspaceRoots?.length === 0, 'Inherited turn context');
    const notices = wire.filter(r => r.direction === 'inbound' && r.frame.method);
    for (const r of notices) {
      const { method, params: p } = r.frame; check(evidenceNotifications.has(method), 'Unknown host activity');
      if (p.threadId) check(p.threadId === threadId, 'Unjoined host event thread');
      if (p.turnId) check(p.turnId === turn.id, 'Unjoined host event turn');
      if (p.model) check(p.model === 'gpt-6-luna', 'Host event model changed');
      if (p.modelId) check(p.modelId === 'gpt-6-luna', 'Host reported model changed');
      if (p.item) check(['message', 'reasoning', 'userMessage', 'agentMessage'].includes(p.item.type), 'Host player tool call');
      if (method === 'remoteControl/status/changed') check(p.status === 'disabled', 'Remote control enabled');
      if (method === 'thread/started') check(p.thread?.id === threadId && p.thread.parentThreadId === null && p.thread.forkedFromId === null && p.thread.turns?.length === 0 && p.thread.model === 'gpt-6-luna' && p.thread.reasoningEffort === 'max', 'Inherited thread event');
      if (method === 'mcpServer/startupStatus/updated') check(['node_repl', 'codex_apps'].includes(p.name) && ['starting', 'ready'].includes(p.status) && !p.error && !p.failureReason, 'Unknown MCP startup');
      if (method === 'warning') check(p.message?.startsWith('Under-development features enabled: skip_host_skill_discovery. Under-development features are incomplete and may behave unpredictably. To suppress this warning, set `suppress_unstable_features_warning = true` in ') || p.message === 'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.', 'Unexpected host warning');
      if (method === 'rawResponseItem/completed' && p.item.type === 'message' && p.item.role === 'user') check(isHostEnvironmentMessage(p.item) || (p.item.content?.length === 1 && p.item.content[0].type === 'input_text' && Buffer.from(p.item.content[0].text).equals(prompt)), 'Inherited raw user input');
      if (['item/started', 'item/completed'].includes(method) && p.item.type === 'userMessage') check(p.item.content?.length === 1 && p.item.content[0].type === 'text' && Buffer.from(p.item.content[0].text).equals(prompt), 'Inherited typed user input');
    }
    const starts = notices.filter(r => r.frame.method === 'turn/started'), finishes = notices.filter(r => r.frame.method === 'turn/completed');
    check(starts.length === 1 && starts[0].frame.params.turn.id === turn.id && finishes.length === 1 && finishes[0].frame.params.turn.id === turn.id && finishes[0].frame.params.turn.status === 'completed' && !finishes[0].frame.params.turn.error, 'Incomplete or additional host turn');
    const startedAt = turnRequest.at, finishedAt = finishes[0].at;
    if (!allowSyntheticProbe) check(Number.isFinite(Date.parse(job.claimedAt)) && Number.isFinite(Date.parse(job.deadlineAt)) && Date.parse(startedAt) >= Date.parse(job.claimedAt) && Date.parse(finishedAt) <= Date.parse(job.deadlineAt), 'Host invocation outside job deadline');
    const finals = notices.filter(r => r.frame.method === 'item/completed' && r.frame.params.item.type === 'agentMessage' && ['final', 'final_answer'].includes(r.frame.params.item.phase));
    check(finals.length === 1 && typeof finals[0].frame.params.item.text === 'string', 'Missing unique host final');
    const responseBytes = Buffer.from(finals[0].frame.params.item.text), responseHash = sha(responseBytes);
    const bytes = readFileSync(safePath(root, 'private/app-server/host-session.jsonl')), rows = parseHostJournal(bytes);
    check(rows[0].payload.id === threadId && !rows[0].payload.parent_thread_id && rows[0].payload.base_instructions.text === cfg.baseInstructions, 'Host journal identity/base mismatch');
    const context = describeAppServerContext(bytes, prompt), contexts = rows.filter(r => r.type === 'turn_context');
    check(contexts[0].payload.turn_id === turn.id && contexts[0].payload.root_turn_id === turn.id && contexts[0].payload.cwd.replaceAll('\\', '/').toLowerCase() === cfg.cwd.replaceAll('\\', '/').toLowerCase(), 'Host journal inherited turn/routing mismatch');
    const eventTypes = new Set(['task_started', 'item_completed', 'token_count', 'task_complete']);
    for (const r of rows) {
      check(['session_meta', 'response_item', 'world_state', 'turn_context', 'event_msg', 'token_usage_record'].includes(r.type), 'Unknown host journal activity');
      if (r.type === 'response_item') check(['message', 'reasoning'].includes(r.payload.type), 'Host journal tool call');
      if (r.type === 'event_msg') { check(eventTypes.has(r.payload.type), 'Unknown or interrupted host journal event'); if (r.payload.type === 'item_completed') check(['UserMessage', 'Reasoning', 'AgentMessage'].includes(r.payload.item?.type), 'Host journal executed tool'); }
    }
    for (const r of notices.filter(r => r.frame.method === 'rawResponseItem/completed')) {
      const item = r.frame.params.item;
      check(['message', 'reasoning'].includes(item.type) && typeof item.id === 'string', 'Uninspectable raw host item');
      const matching = rows.filter(row => row.type === 'response_item' && row.payload.id === item.id);
      check(matching.length === 1 && JSON.stringify(matching[0].payload) === JSON.stringify(item), 'Raw context/output differs from persisted host journal');
    }
    check(notices.filter(r => r.frame.method === 'item/completed' && r.frame.params.item.type === 'userMessage').length === 1, 'Additional typed task input');
    const journalStarts = rows.filter(r => r.type === 'event_msg' && r.payload.type === 'task_started'), journalEnds = rows.filter(r => r.type === 'event_msg' && r.payload.type === 'task_complete');
    check(journalStarts.length === 1 && journalStarts[0].payload.turn_id === turn.id && journalEnds.length === 1 && journalEnds[0].payload.turn_id === turn.id && Buffer.from(journalEnds[0].payload.last_agent_message).equals(responseBytes), 'Host journal completion mismatch');
    const journalFinal = rows.filter(r => r.type === 'response_item' && r.payload.type === 'message' && r.payload.role === 'assistant');
    check(journalFinal.length === 1 && ['final', 'final_answer'].includes(journalFinal[0].payload.phase) && journalFinal[0].payload.content?.every(c => c.type === 'output_text' && typeof c.text === 'string') && Buffer.from(journalFinal[0].payload.content.map(c => c.text).join('')).equals(responseBytes), 'Host final bytes mismatch');
    const rawFinals = notices.filter(r => r.frame.method === 'rawResponseItem/completed' && r.frame.params.item.type === 'message' && r.frame.params.item.role === 'assistant');
    check(rawFinals.length === 1 && Buffer.from(rawFinals[0].frame.params.item.content.map(c => c.text).join('')).equals(responseBytes), 'Raw final bytes mismatch');
    const boundary = rows.indexOf(rows.find(r => r.type === 'response_item' && r.payload.type === 'message' && r.payload.role === 'user' && r.payload.internal_chat_message_metadata_passthrough?.content_item_kinds?.includes('user.text')));
    check(!rows.slice(boundary + 1).some(r => ['world_state', 'turn_context', 'session_meta'].includes(r.type)), 'Late host context or configuration');
    check(!rows.slice(boundary + 1).some(r => r.type === 'response_item' && r.payload.type === 'message' && r.payload.role !== 'assistant'), 'Additional host input after frozen task');
    const inventory = JSON.parse(readFileSync(safePath(root, 'host-base-context-admission.json'), 'utf8'));
    check(inventory.schemaVersion === 'trix-host-base-context-admission-1.0.0' && inventory.approvedDigests?.includes(context.digest), 'Actual host context inventory not approved');
    return { available: true, events: { verifiedByAdapter: true, agentId: threadId, jobId: job.jobId, promptHash: sha(prompt), responseHash, model: 'gpt-6-luna', effort: 'max', forkTurns: 'none', activityComplete: true, toolCallCount: 0, inheritedConversation: false, reportedModelId: 'gpt-6-luna', startedAt, finishedAt }, baseContext: { inspected: true, episodeSpecificFacts: false, otherSeatEvidence: false, hiddenFixtureMemory: false, digest: context.digest }, responseBytes };
  } catch (error) { return { available: false, reason: error.message }; }
}
