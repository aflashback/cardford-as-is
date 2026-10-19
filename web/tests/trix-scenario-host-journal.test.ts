import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describeBaseContext, inspectHostInvocation, parseHostJournal } from '../../scripts/trix-scenario-collection/host-journal.mjs';
import { putBlob, sha } from '../../scripts/trix-scenario-collection/journal.mjs';

const parentId = '01a12816-4909-7f21-86cb-be096b18edc3';
const childId = '01a12bea-9c45-7b03-b668-67f4f3572d1b';
const turnId = '01a12bea-9f81-76d0-92ad-ce64310e0cd4';
const parentTurn = '01a12be8-916d-7bb1-b862-5281d983c895';
const taskName = 'trix_player_unique';
const callId = 'call_unique_dispatch';
const startTime = '2026-10-11T17:02:38.250Z';
const endTime = '2026-10-11T17:02:40.250Z';
const prompt = 'Synthetic actor-safe packet; |S|♥|K|. No tools.';
const response = '{"card":"|♥|K|","reasoning":"Only legal card.","confidence":100}';
const row = (type, payload, timestamp = startTime) => ({ ordinal: 0, timestamp, type, payload });
const normalize = rows => rows.map((r, ordinal) => ({ ...r, ordinal }));
const bytes = rows => Buffer.from(normalize(rows).map(r => JSON.stringify(r)).join('\n') + '\n');
const metaTurn = { turn_id: turnId };

function fixture(t) {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability');
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'test-'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  const sessionsRoot = join(root, 'sessions');
  const job = { jobId: 'job-unique', taskName, parentThreadId: parentId, claimedAt: '2026-10-11T17:02:37.000Z', deadlineAt: '2026-10-11T17:03:00.000Z', promptHash: sha(Buffer.from(prompt)), promptRef: putBlob(root, Buffer.from(prompt)) };
  const receipt = { hostAgentId: childId, responseHash: sha(Buffer.from(response)), reportedModelId: null, verifiedByAdapter: true };
  const parent = [
    row('session_meta', { id: parentId }),
    row('response_item', { type: 'function_call', namespace: 'collaboration', name: 'spawn_agent', call_id: callId, arguments: JSON.stringify({ task_name: taskName, model: 'gpt-6-luna', reasoning_effort: 'max', fork_turns: 'none', message: prompt }), internal_chat_message_metadata_passthrough: { turn_id: parentTurn } }),
    row('event_msg', { type: 'item_completed', item: { type: 'SubAgentActivity', id: callId, kind: 'started', agent_thread_id: childId, agent_path: `/root/${taskName}` } }),
    row('response_item', { type: 'function_call_output', call_id: callId, output: JSON.stringify({ task_name: `/root/${taskName}` }) }),
  ];
  const child = [
    row('session_meta', { id: childId, parent_thread_id: parentId, thread_source: 'subagent', source: { subagent: { thread_spawn: { parent_thread_id: parentId, agent_path: `/root/${taskName}`, depth: 1 } } }, base_instructions: { text: 'Generic system and safety instructions.' } }),
    row('event_msg', { type: 'task_started', turn_id: turnId, started_at: Math.floor(Date.parse(startTime) / 1000) }),
    row('response_item', { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'Generic identical operating instructions.' }], internal_chat_message_metadata_passthrough: { turn_id: turnId, content_item_kinds: ['generic.developer_instructions'] } }),
    row('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Generic environment.' }], internal_chat_message_metadata_passthrough: { turn_id: turnId, content_item_kinds: ['environments.environment_context'] } }),
    row('world_state', { full: true, state: { model: 'gpt-6-luna', permissions: 'read-only' } }),
    row('turn_context', { model: 'gpt-6-luna', effort: 'max', turn_id: turnId, root_turn_id: parentTurn }),
    row('response_item', { type: 'agent_message', author: '/root', recipient: `/root/${taskName}`, content: [{ type: 'input_text', text: `Message Type: NEW_TASK\nTask name: /root/${taskName}\nSender: /root\nPayload:\n` }, { type: 'encrypted_content', encrypted_content: 'opaque-host-payload' }], internal_chat_message_metadata_passthrough: metaTurn }),
    row('response_item', { type: 'reasoning', encrypted_content: 'opaque-private-reasoning', internal_chat_message_metadata_passthrough: metaTurn }),
    row('event_msg', { type: 'item_completed', turn_id: turnId, item: { type: 'Reasoning' } }),
    row('response_item', { type: 'message', role: 'assistant', phase: 'final', content: [{ type: 'output_text', text: response }], internal_chat_message_metadata_passthrough: metaTurn }, endTime),
    row('event_msg', { type: 'item_completed', turn_id: turnId, item: { type: 'AgentMessage' } }, endTime),
    row('event_msg', { type: 'task_complete', turn_id: turnId, last_agent_message: response, completed_at: Math.floor(Date.parse(endTime) / 1000) }, endTime),
  ];
  function save() {
    const dateRoot = join(sessionsRoot, '2026/10/11'); mkdirSync(dateRoot, { recursive: true });
    writeFileSync(join(dateRoot, `rollout-fixture-${parentId}.jsonl`), bytes(parent));
    writeFileSync(join(dateRoot, `rollout-fixture-${childId}.jsonl`), bytes(child));
  }
  function approve() { writeFileSync(join(root, 'host-base-context-admission.json'), JSON.stringify({ schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: [describeBaseContext(normalize(child)).digest] })); }
  save(); approve();
  return { root, sessionsRoot, job, receipt, parent, child, save, approve, inspect: () => inspectHostInvocation(job, receipt, root, { sessionsRoot }) };
}

test('trusted exact host join admits zero-tool completed synthetic turn', t => {
  const f = fixture(t), result = f.inspect();
  assert.equal(result.available, true, result.reason);
  assert.deepEqual(result.events, { verifiedByAdapter: true, agentId: childId, jobId: 'job-unique', promptHash: f.job.promptHash, responseHash: f.receipt.responseHash, model: 'gpt-6-luna', effort: 'max', forkTurns: 'none', activityComplete: true, toolCallCount: 0, inheritedConversation: false, reportedModelId: null });
  assert.equal(result.baseContext.inspected, true);
});

test('actual host final_answer phase admits only a matched completed final', t => {
  const f = fixture(t); f.child[9].payload.phase = 'final_answer'; f.child[10].payload.item.phase = 'final_answer'; f.save();
  assert.equal(f.inspect().available, true);
});

for (const [name, mutate] of [
  ['forged imported receipt is not evidence', f => { f.receipt.hostAgentId = parentId; }],
  ['wrong prompt', f => { const a = JSON.parse(f.parent[1].payload.arguments); a.message += ' hidden'; f.parent[1].payload.arguments = JSON.stringify(a); }],
  ['encrypted dispatch is not plaintext prompt proof', f => { const a = JSON.parse(f.parent[1].payload.arguments); a.message = 'gAAAAABopaqueEncryptedHostMessage'; f.parent[1].payload.arguments = JSON.stringify(a); }],
  ['fallback model', f => { const a = JSON.parse(f.parent[1].payload.arguments); a.model = 'gpt-6-sol'; f.parent[1].payload.arguments = JSON.stringify(a); }],
  ['lower effective effort', f => { f.child[5].payload.effort = 'high'; }],
  ['parent history fork', f => { const a = JSON.parse(f.parent[1].payload.arguments); a.fork_turns = 'all'; f.parent[1].payload.arguments = JSON.stringify(a); }],
  ['wrong host call join', f => { f.parent[2].payload.item.id = 'call_other'; }],
  ['child routing mismatch', f => { f.child[0].payload.source.subagent.thread_spawn.agent_path = '/root/other'; }],
  ['one custom tool call', f => { f.child.splice(8, 0, row('response_item', { type: 'custom_tool_call', name: 'functions.exec', internal_chat_message_metadata_passthrough: metaTurn })); }],
  ['tool execution event alone', f => { f.child[8].payload.item.type = 'CommandExecution'; }],
  ['followup received', f => { f.child.splice(8, 0, structuredClone(f.child[6])); }],
  ['parent sends a followup', f => { f.parent.push(row('response_item', { type: 'function_call', name: 'send_message', arguments: JSON.stringify({ target: taskName, message: 'reviewer guidance' }) })); }],
  ['inherited user conversation', f => { f.child[3].payload.internal_chat_message_metadata_passthrough.content_item_kinds = ['user.text']; }],
  ['unapproved hidden fixture memory', f => { f.child[2].payload.content[0].text += ' Private fixture family PRIVATE_SEED_A'; }],
  ['changed world state', f => { f.child[4].payload.state.hiddenHand = ['SA']; }],
  ['missing host completion', f => { f.child.pop(); }],
  ['final mismatch', f => { f.child[11].payload.last_agent_message = 'forged'; }],
  ['response receipt mismatch', f => { f.receipt.responseHash = sha(Buffer.from('forged')); }],
  ['unexpected compacted history', f => { f.child.splice(8, 0, row('compacted', { message: 'inherited hands' })); }],
  ['extra effective turn', f => { f.child.splice(8, 0, structuredClone(f.child[5])); }],
  ['collaboration mode override', f => { f.child[5].payload.collaboration_mode = { settings: { model: 'gpt-6-sol', reasoning_effort: 'high' } }; }],
  ['hidden turn configuration input', f => { f.child[5].payload.injected_memory = 'PRIVATE_HAND_A'; }],
  ['past deadline', f => { f.job.deadlineAt = '2026-10-11T17:02:39.000Z'; }],
  ['uninspectable developer context', f => { f.child[2].payload.content[0] = { type: 'encrypted_content', encrypted_content: 'hidden' }; }],
  ['reused unique task name', f => { f.parent.push(structuredClone(f.parent[1])); }],
]) test(`host journal rejects ${name}`, t => { const f = fixture(t); mutate(f); f.save(); const r = f.inspect(); assert.equal(r.available, false, name); assert.ok(r.reason); });

test('host parser rejects truncation, missing ordinals and unknown record variants', t => {
  const f = fixture(t);
  assert.throws(() => parseHostJournal(bytes(f.child).subarray(0, -1)), /tail/);
  const corrupted = normalize(f.child); corrupted[8].ordinal++;
  assert.throws(() => parseHostJournal(Buffer.from(corrupted.map(r => JSON.stringify(r)).join('\n') + '\n')), /record/);
  f.child.splice(8, 0, row('new_uninspectable_host_activity', {})); f.save();
  assert.equal(f.inspect().available, false);
});

test('an imported inspected boolean cannot approve an unknown base context', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'host-base-context-admission.json'), JSON.stringify({ inspected: true, episodeSpecificFacts: false, hiddenFixtureMemory: false }));
  assert.equal(f.inspect().available, false);
});

test('base approval reuses only identified routing/date changes and preserves all other text', t => {
  const f = fixture(t);
  f.child[3].payload.content[0].text += '<current_date>2026-10-11</current_date>';
  f.child[4].payload.state.environments = { current_date: '2026-10-11', timezone: 'America/Toronto' };
  f.child[5].payload.current_date = '2026-10-11';
  f.approve();
  const before = describeBaseContext(normalize(f.child));
  f.child[3].payload.content[0].text = f.child[3].payload.content[0].text.replace('2026-10-11', '2026-10-12');
  f.child[4].payload.state.environments.current_date = '2026-10-12';
  f.child[5].payload.current_date = '2026-10-12';
  const after = describeBaseContext(normalize(f.child));
  assert.equal(before.digest, after.digest);
  assert.notEqual(before.parts[2].rawSha256, after.parts[2].rawSha256);
  f.save(); assert.equal(f.inspect().available, true);
  f.child[3].payload.content[0].text += ' PRIVATE_HAND_A'; f.save();
  assert.equal(f.inspect().available, false);
});
