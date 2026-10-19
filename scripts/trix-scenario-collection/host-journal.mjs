// TSC-02/03: derive evidence from host-owned journals, never imported trust flags.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getBlob, safePath, sha } from './journal.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const check = (condition, message) => { if (!condition) throw Error(message); };
const hostTime = value => typeof value === 'number' && Number.isSafeInteger(value) ? value * 1000 : Date.parse(value);
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
const normalizedDate = value => { check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'Invalid base context date'); return '<host-current-date>'; };

export function parseHostJournal(bytes) {
  const text = Buffer.from(bytes).toString('utf8');
  check(text.endsWith('\n'), 'Incomplete host journal tail');
  const rows = text.slice(0, -1).split('\n').map(line => JSON.parse(line));
  check(rows.length > 0, 'Empty host journal');
  rows.forEach((row, index) => check(row.ordinal === index && typeof row.timestamp === 'string' && row.payload && typeof row.type === 'string', 'Missing or invalid host journal record'));
  check(rows[0].type === 'session_meta' && rows.filter(r => r.type === 'session_meta').length === 1, 'Missing or duplicate host session identity');
  return rows;
}

function dateDirectories(id, job) {
  check(uuid.test(id), 'Invalid host thread UUID');
  const dates = [Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16), Date.parse(job.claimedAt), Date.parse(job.deadlineAt)];
  check(dates.every(Number.isFinite), 'Invalid host invocation time window');
  check(dates[2] >= dates[1] && dates[2] - dates[1] <= 86400000, 'Unbounded host invocation window');
  return [...new Set(dates.flatMap(ms => [-86400000, 0, 86400000].map(offset => new Date(ms + offset).toISOString().slice(0, 10).replaceAll('-', '/'))))];
}

function locate(sessionsRoot, id, job) {
  const matches = [];
  for (const date of dateDirectories(id, job)) {
    let entries;
    try { entries = readdirSync(join(sessionsRoot, date), { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const entry of entries) if (entry.name.startsWith('rollout-') && entry.name.endsWith(`-${id}.jsonl`)) {
      check(entry.isFile() && !entry.isSymbolicLink(), 'Host journal must be a regular file');
      matches.push(join(sessionsRoot, date, entry.name));
    }
  }
  check(matches.length === 1, 'Host journal missing or ambiguous');
  const rows = parseHostJournal(readFileSync(matches[0]));
  check(rows[0].payload.id === id, 'Host journal session identity mismatch');
  return rows;
}

// Coordinator audits these exact texts before adding their digest to the fixed
// admission file. This function does not approve or write that file.
export function describeBaseContext(rows) {
  const parts = [];
  const addPart = (source, text, normalizedText = text) => parts.push({ source, text, rawSha256: sha(Buffer.from(text)), normalizedSha256: sha(Buffer.from(normalizedText)) });
  const base = rows[0]?.payload?.base_instructions;
  check(typeof base?.text === 'string' && base.text.length > 0, 'Missing host base instructions');
  addPart('session_meta.base_instructions', base.text);
  let taskSeen = false;
  for (const row of rows) {
    if (row.type === 'turn_context') {
      check(!taskSeen, 'Late or inherited turn configuration');
      const { turn_id, root_turn_id, ...configuration } = row.payload;
      const normalized = structuredClone(configuration);
      if (Object.hasOwn(normalized, 'current_date')) normalized.current_date = normalizedDate(normalized.current_date);
      addPart('turn_context.configuration', canonical(configuration), canonical(normalized));
    }
    if (row.type === 'world_state') {
      check(row.payload.full === true && row.payload.state && !taskSeen, 'Uninspectable or changed base world state');
      const normalized = structuredClone(row.payload.state);
      if (normalized.environments && Object.hasOwn(normalized.environments, 'current_date')) normalized.environments.current_date = normalizedDate(normalized.environments.current_date);
      addPart('world_state', canonical(row.payload.state), canonical(normalized));
    }
    if (row.type !== 'response_item') continue;
    const item = row.payload;
    if (item.type === 'agent_message') { taskSeen = true; continue; }
    if (item.type !== 'message' || item.role === 'assistant') continue;
    check(!taskSeen && ['developer', 'system', 'user'].includes(item.role), 'Inherited conversation or late input');
    const kinds = item.internal_chat_message_metadata_passthrough?.content_item_kinds;
    check(Array.isArray(kinds) && kinds.length === item.content?.length, 'Missing base context provenance');
    if (item.role === 'user') check(kinds.every(k => k === 'environments.environment_context'), 'Inherited user conversation');
    item.content.forEach((chunk, index) => {
      check(chunk.type === 'input_text' && typeof chunk.text === 'string', 'Encrypted or unknown base context');
      let normalized = chunk.text;
      if (item.role === 'user') {
        const dates = [...chunk.text.matchAll(/<current_date>([^<]*)<\/current_date>/g)];
        check(dates.length <= 1, 'Ambiguous environment current date');
        if (dates.length === 1) normalized = normalized.replace(dates[0][0], `<current_date>${normalizedDate(dates[0][1])}</current_date>`);
      }
      addPart(`${item.role}:${kinds[index]}`, chunk.text, normalized);
    });
  }
  check(parts.length > 1, 'Incomplete base context manifest');
  return { digest: sha(Buffer.from(canonical(parts.map(({ source, normalizedSha256 }) => ({ source, normalizedSha256 }))))), parts };
}

function finalText(item) {
  check(item.type === 'message' && item.role === 'assistant' && ['final', 'final_answer'].includes(item.phase), 'Missing assistant final response');
  check(Array.isArray(item.content) && item.content.length > 0 && item.content.every(c => c.type === 'output_text' && typeof c.text === 'string'), 'Uninspectable final response');
  return item.content.map(c => c.text).join('');
}

export function inspectHostInvocation(job, receipt, root, options = {}) {
  try {
    // options.sessionsRoot is for host setup/fixture tests; never populate it
    // from a receipt, player response, or arbitrary imported JSON.
    const sessionsRoot = options.sessionsRoot ?? join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions');
    check(typeof job.parentThreadId === 'string' && uuid.test(job.parentThreadId), 'Missing trusted parent thread ID');
    check(typeof job.taskName === 'string' && /^[a-z0-9_]+$/.test(job.taskName), 'Invalid unique task name');
    check(uuid.test(receipt.hostAgentId), 'Invalid child host thread ID');
    const prompt = getBlob(root, job.promptRef, false);
    check(sha(prompt) === job.promptHash, 'Frozen prompt hash mismatch');
    const parent = locate(sessionsRoot, job.parentThreadId, job);
    const dispatches = parent.filter(r => r.type === 'response_item' && r.payload.type === 'function_call' && r.payload.name === 'spawn_agent').map(r => ({ row: r, args: JSON.parse(r.payload.arguments) })).filter(d => d.args.task_name === job.taskName);
    check(dispatches.length === 1, 'Missing or reused host dispatch task');
    const { row: dispatch, args } = dispatches[0];
    check(dispatch.payload.namespace === 'collaboration', 'Unexpected host dispatch namespace');
    check(args.model === 'gpt-6-luna' && args.reasoning_effort === 'max' && args.fork_turns === 'none', 'Host dispatch model/effort/context mismatch');
    check(typeof args.message === 'string' && sha(Buffer.from(args.message)) === job.promptHash, 'Host dispatch prompt mismatch');
    const claimTime = Date.parse(job.claimedAt), deadline = Date.parse(job.deadlineAt);
    check(Date.parse(dispatch.timestamp) >= claimTime && Date.parse(dispatch.timestamp) <= deadline, 'Host dispatch outside claim window');
    const outputs = parent.filter(r => r.type === 'response_item' && r.payload.type === 'function_call_output' && r.payload.call_id === dispatch.payload.call_id);
    check(outputs.length === 1 && JSON.parse(outputs[0].payload.output).task_name === `/root/${job.taskName}`, 'Missing or mismatched host dispatch output');
    const bindings = parent.filter(r => r.type === 'event_msg' && r.payload.type === 'item_completed' && r.payload.item?.type === 'SubAgentActivity' && r.payload.item.id === dispatch.payload.call_id);
    check(bindings.length === 1, 'Missing or ambiguous host dispatch binding');
    const binding = bindings[0].payload.item;
    check(binding.kind === 'started' && binding.agent_thread_id === receipt.hostAgentId && binding.agent_path === `/root/${job.taskName}`, 'Host child routing mismatch');
    check(!parent.some(r => r.type === 'response_item' && r.payload.type === 'function_call' && ['send_message', 'followup_task'].includes(r.payload.name) && [job.taskName, `/root/${job.taskName}`, receipt.hostAgentId].includes(JSON.parse(r.payload.arguments).target)), 'Player received a followup');
    const child = locate(sessionsRoot, receipt.hostAgentId, job);
    const meta = child[0].payload, spawn = meta.source?.subagent?.thread_spawn;
    check(meta.parent_thread_id === job.parentThreadId && spawn?.parent_thread_id === job.parentThreadId && spawn.agent_path === `/root/${job.taskName}` && spawn.depth === 1, 'Child session parent/context mismatch');
    check(meta.thread_source === 'subagent', 'Unexpected child session source');
    const contexts = child.filter(r => r.type === 'turn_context');
    check(contexts.length === 1 && contexts[0].payload.model === 'gpt-6-luna' && contexts[0].payload.effort === 'max', 'Child effective model/effort mismatch');
    const turn = contexts[0].payload;
    const collaboration = turn.collaboration_mode?.settings;
    if (collaboration) check(collaboration.model === 'gpt-6-luna' && collaboration.reasoning_effort === 'max', 'Collaboration mode overrides player configuration');
    check(turn.root_turn_id === dispatch.payload.internal_chat_message_metadata_passthrough?.turn_id, 'Child root turn mismatch');
    const inbound = child.filter(r => r.type === 'response_item' && r.payload.type === 'agent_message');
    check(inbound.length === 1 && inbound[0].payload.author === '/root' && inbound[0].payload.recipient === `/root/${job.taskName}`, 'Inherited or additional player task');
    const chunks = inbound[0].payload.content;
    check(chunks.length === 2 && chunks[0].type === 'input_text' && chunks[0].text === `Message Type: NEW_TASK\nTask name: /root/${job.taskName}\nSender: /root\nPayload:\n` && chunks[1].type === 'encrypted_content', 'Unknown player task envelope');
    check(inbound[0].payload.internal_chat_message_metadata_passthrough?.turn_id === turn.turn_id, 'Task turn binding mismatch');
    const starts = child.filter(r => r.type === 'event_msg' && r.payload.type === 'task_started');
    const ends = child.filter(r => r.type === 'event_msg' && r.payload.type === 'task_complete');
    check(starts.length === 1 && ends.length === 1 && starts[0].payload.turn_id === turn.turn_id && ends[0].payload.turn_id === turn.turn_id, 'Missing or mismatched host completion');
    check(starts[0].ordinal < contexts[0].ordinal && contexts[0].ordinal < inbound[0].ordinal && inbound[0].ordinal < ends[0].ordinal, 'Invalid host invocation order');
    const started = Date.parse(starts[0].timestamp), finished = Date.parse(ends[0].timestamp);
    check(Number.isFinite(started) && Number.isFinite(finished) && started >= claimTime && finished >= started && finished <= deadline, 'Host execution outside claim window');
    check(Math.abs(hostTime(starts[0].payload.started_at) - started) < 1000 && Math.abs(hostTime(ends[0].payload.completed_at) - finished) < 1000, 'Host completion timestamps disagree');
    const finals = child.filter(r => r.type === 'response_item' && r.payload.type === 'message' && r.payload.role === 'assistant' && ['final', 'final_answer'].includes(r.payload.phase));
    check(finals.length === 1 && finals[0].ordinal < ends[0].ordinal, 'Missing or duplicate host final');
    const response = finalText(finals[0].payload), responseHash = sha(Buffer.from(response));
    check(response === ends[0].payload.last_agent_message && responseHash === receipt.responseHash, 'Host final response mismatch');
    const allowedRows = new Set(['session_meta', 'turn_context', 'world_state', 'response_item', 'event_msg', 'token_usage_record']);
    const allowedEvents = new Set(['task_started', 'task_complete', 'token_count', 'item_completed']);
    for (const row of child) {
      check(allowedRows.has(row.type), 'Unknown or uninspectable host activity');
      if (row.type === 'response_item') {
        check(['message', 'reasoning', 'agent_message'].includes(row.payload.type), 'Player tool call or unknown response activity');
        check(row.payload.internal_chat_message_metadata_passthrough?.turn_id === turn.turn_id, 'Inherited response turn');
      }
      if (row.type === 'event_msg') {
        check(allowedEvents.has(row.payload.type), 'Changed configuration or unknown host event');
        check(!row.payload.turn_id || row.payload.turn_id === turn.turn_id, 'Inherited event turn');
        if (row.payload.type === 'item_completed') check(['Reasoning', 'AgentMessage'].includes(row.payload.item?.type), 'Player tool execution or unknown host item');
      }
      if (row.type === 'token_usage_record') check(row.payload.thread_id === receipt.hostAgentId && row.payload.turn_id === turn.turn_id, 'Usage identity mismatch');
      if (row.ordinal > ends[0].ordinal) check(row.type === 'token_usage_record' || row.type === 'event_msg' && row.payload.type === 'token_count', 'Activity after host completion');
    }
    const context = describeBaseContext(child);
    const inventory = JSON.parse(readFileSync(safePath(root, 'host-base-context-admission.json'), 'utf8'));
    check(inventory.schemaVersion === 'trix-host-base-context-admission-1.0.0' && Array.isArray(inventory.approvedDigests) && inventory.approvedDigests.every(d => /^[a-f0-9]{64}$/.test(d)), 'Missing approved base context hash inventory');
    check(inventory.approvedDigests.includes(context.digest), 'Unknown or changed base context; coordinator audit required');
    // An exact audited context digest is the authority, not JSON booleans from
    // the model/receipt. Newly sampled episode facts must never be approved.
    return { available: true, events: { verifiedByAdapter: true, agentId: receipt.hostAgentId, jobId: job.jobId, promptHash: job.promptHash, responseHash, model: turn.model, effort: turn.effort, forkTurns: 'none', activityComplete: true, toolCallCount: 0, inheritedConversation: false, reportedModelId: null }, baseContext: { inspected: true, episodeSpecificFacts: false, otherSeatEvidence: false, hiddenFixtureMemory: false, digest: context.digest } };
  } catch (error) { return { available: false, reason: error.message }; }
}
