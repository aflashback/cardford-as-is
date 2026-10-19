import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { verifyPlayerContextEvidence, verifyGoogleWorkspaceCatalogRemoval, removedGoogleWorkspaceEntrySha256 } from '../../scripts/trix-scenario-collection/player-context-evidence.mjs';
import { projectPlayerPacket, renderPrompt } from '../../scripts/trix-scenario-collection/contracts.mjs';
import { describeAppServerContext, inspectAppServerEvidence, playerBaseInstructions, playerDeveloperInstructions } from '../../scripts/trix-scenario-collection/app-server-bridge.mjs';
import { appendEvent, jsonBytes, putBlob, readJournal, sha } from '../../scripts/trix-scenario-collection/journal.mjs';

const failureReason = 'Actual post-turn context differs from approved context';
const time = n => new Date(Date.parse('2026-10-11T16:00:00Z') + n * 1000).toISOString();
const features = ['shell_tool','unified_exec','multi_agent','multi_agent_v2','code_mode_host','code_mode','computer_use','browser_use','browser_use_external','in_app_browser','plugins','remote_plugin','skill_search','skill_mcp_dependency_install','sleep_tool','tool_suggest'];

function fixture(t) {
  const scratch = resolve('.local/evaluation/trix-scenarios/bridge-capability'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'player-context-evidence-test-'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  const write = (path, value) => { mkdirSync(resolve(path, '..'), { recursive: true }); writeFileSync(path, Buffer.isBuffer(value) ? value : jsonBytes(value)); };
  const executable = join(root, 'synthetic-host.exe'); writeFileSync(executable, 'Synthetic host executable; never launched.');
  const sourceHashes = Object.fromEntries(['scripts/trix-scenario-collection/app-server-bridge.mjs', 'scripts/trix-scenario-collection/journal.mjs', 'contracts/trix-scenario-collection/declaration-response.schema.json'].map(path => [path, sha(readFileSync(resolve(path)))]));
  const totals = [0, 1, 2, 3].map(seat => ({ id: `seat-${seat}`, seats: [seat], total: 0 }));
  const nativePacket = { publicSchemaVersion: '1.2.0', gameId: 'trix', variantId: 'basic-solo', seat: 0, phase: 'declare-doubles', observation: { id: 'synthetic-game', gameId: 'trix', variantId: 'basic-solo', seat: 0, phase: 'declare-doubles', turn: 0, kingdom: 1, dealNumber: 1, owner: 3, request: 'king', remainingRequests: [], hand: ['C2'], handCounts: [1, 1, 1, 1], trick: [], tricks: [], declarations: [], board: ['C', 'D', 'H', 'S'].map(suit => ({ suit, low: 0, high: 0 })), finishOrder: [], passes: [], ledger: [], withheldBonuses: [], lastExternalLeader: [null, null, null, null], totals, requestTotals: totals, kingdomTotals: totals, winners: [], layoutHistory: { version: '1.0.0', status: 'available', turns: [] } }, candidates: [{ id: 'doubles:', public: { kind: 'declare-doubles' } }] };
  const pin = { gameId: 'trix', variantId: 'basic-solo', moduleVersion: '2.2.0', ruleProfileId: 'trix-basic-solo-1.0.0', stateSchemaVersion: '1.2.0', observationSchemaVersion: '1.2.0', publicSchemaVersion: '1.2.0', eventSchemaVersion: '1.0.0' };
  const rules = { name: 'Synthetic Trix', description: 'Synthetic actor-safe declaration fixture.', text: 'Use only the native declaration subsets.', objective: 'own-request-points' };
  const frame = { revision: 2, node: { phase: 'declare-doubles' }, nativeActorPacket: nativePacket, pin, rules }, frameRef = putBlob(root, frame);
  const packet = projectPlayerPacket(nativePacket, pin, 2, 'current-context-job', rules), packetRef = putBlob(root, packet), nativePacketRef = putBlob(root, nativePacket);
  const prompt = renderPrompt(packet, 'declare-doubles').bytes, promptRef = putBlob(root, prompt);
  const response = { cards: [], reasoning: 'Synthetic unchanged rationale: decline is the sole native option.', confidence: 100 }, final = JSON.stringify(response, null, 2) + '\n';
  const preparedData = { schemaVersion: 'trix-player-job-1.0.0', runId: 'synthetic-player-context-run', jobId: 'current-context-job', episodeId: 'synthetic-episode', actor: 0, revision: 2, phase: 'declare-doubles', attempt: 1, pin, packetRef, nativePacketRef, sharedRulesHash: packet.sharedRulesHash, promptHash: sha(prompt), promptRef, responseSchemaHash: sourceHashes['contracts/trix-scenario-collection/declaration-response.schema.json'], parentThreadId: null };
  const claimData = { jobId: preparedData.jobId, dispatchToken: 'synthetic-current-token', requestedModel: 'gpt-6-luna', requestedEffort: 'max', claimedAt: time(0), deadlineAt: time(300) }, job = { ...preparedData, ...claimData };
  const previousJob = { ...job, jobId: 'previous-context-job', dispatchToken: 'synthetic-previous-token', claimedAt: time(-120), deadlineAt: time(-60) };
  const googleEntry = '- google-workspace: Read this before the first Google Drive, Docs, Sheets or Slides connector call whenever the task creates or changes a Google file. Use this skill whenever the user wants to create or change a Google Doc, Sheet or Slides file in their Google Drive. Triggers include: a request that names Google Docs, Sheets, Slides or Drive and asks to make, edit, format, copy or rename a file; a docs.google.com link with a request to change that file, even a one-line fix or suggested edits; and any follow-up change to a Google file from earlier in the chat, even "change it" or "add a tab". Includes helper scripts for document positions, cell ranges and slide layout. However, if the user asks for a doc, deck or spreadsheet without naming Google, or gives a Google file only as source material for something new, use Codex\'s own output type instead. Do NOT use for read-only questions about a Google file, or for Word, Excel, PowerPoint or PDF files. (file: r1/synced/aec24770-6cca-4ee7-96e8-a417b9c4edbb_442ad428-e452-4d24-971d-c086f7f6209a/google-workspace/SKILL.md)';
  const oldCatalog = 'Synthetic public skills catalog.\n' + googleEntry + '\n- synthetic-skill: A neutral synthetic entry.\n', newCatalog = oldCatalog.replace(googleEntry + '\n', '');
  const threadId = '019a0201-1000-7000-8000-000000000002', turnId = 'synthetic-completed-turn';
  const hostRows = [
    { type: 'session_meta', payload: { id: threadId, base_instructions: { text: playerBaseInstructions } } },
    { type: 'event_msg', payload: { type: 'task_started', turn_id: turnId } },
    { type: 'response_item', payload: { id: 'generic-instructions', type: 'message', role: 'developer', content: [{ type: 'input_text', text: playerDeveloperInstructions }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['generic.developer_instructions'] } } },
    { type: 'response_item', payload: { id: 'generic-memory', type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'Synthetic neutral memory; no episode facts.' }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['memories.instructions'] } } },
    ...['host_skills.instructions', 'permissions.instructions', 'collaboration_mode.instructions', 'multi_agent.role_instructions', 'multi_agent.mode_instructions'].map(kind => ({ type: 'response_item', payload: { id: kind, type: 'message', role: 'developer', content: [{ type: 'input_text', text: kind === 'host_skills.instructions' ? newCatalog : 'Synthetic unchanged ' + kind }], internal_chat_message_metadata_passthrough: { content_item_kinds: [kind] } } })),
    { type: 'response_item', payload: { id: 'environment', type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>\n  <current_date>2026-10-11</current_date>\n  <timezone>America/Toronto</timezone>\n</environment_context>' }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['environments.environment_context'] } } },
    { type: 'world_state', payload: { full: true, state: { host_skills: { body: 'World catalog wrapper.\n' + newCatalog, includeInstructions: true }, neutral: 'Unchanged public host fact.' } } },
    { type: 'turn_context', payload: { turn_id: turnId, root_turn_id: turnId, cwd: 'C:/Windows/Temp', model: 'gpt-6-luna', effort: 'max' } },
    { type: 'response_item', payload: { id: 'raw-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt.toString() }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['user.text'] } } },
    { type: 'event_msg', payload: { type: 'item_completed', thread_id: threadId, turn_id: turnId, item: { id: 'typed-user', type: 'UserMessage', content: [{ type: 'text', text: prompt.toString(), text_elements: [] }] } } },
    { type: 'response_item', payload: { id: 'host-final', type: 'message', role: 'assistant', phase: 'final', content: [{ type: 'output_text', text: final }] } },
    { type: 'event_msg', payload: { type: 'task_complete', turn_id: turnId, last_agent_message: final } },
  ];
  const journalBytes = rows => Buffer.from(rows.map((row, ordinal) => JSON.stringify({ ordinal, timestamp: time(ordinal), ...row }) + '\n').join(''));
  const previousRows = structuredClone(hostRows); previousRows[4].payload.content[0].text = oldCatalog; previousRows[10].payload.state.host_skills.body = 'World catalog wrapper.\n' + oldCatalog;
  const previousContext = describeAppServerContext(journalBytes(previousRows), prompt), actualContext = describeAppServerContext(journalBytes(hostRows), prompt);
  const oldInventory = { schemaVersion: 'trix-host-base-context-admission-1.0.0', approvedDigests: [previousContext.digest], audit: { hostExecutable: executable } };
  const assessmentSummary = 'Only the exact Google Workspace catalog entry was removed; no episode facts were added.';
  const newInventory = { ...oldInventory, approvedDigests: [actualContext.digest], audit: { ...oldInventory.audit,
    evidence: `private/invocations/${job.jobId}/private/app-server/host-session.jsonl`, hostJournalSha256: sha(journalBytes(hostRows)), contextAuditSha256: sha(jsonBytes(actualContext)),
    previousDigest: previousContext.digest, classification: assessmentSummary, cwd: 'C:/Windows/Temp', model: 'gpt-6-luna', effort: 'max',
  } };
  appendEvent(root, 'initialized', {});
  appendEvent(root, 'review-dispatch-claimed', { reviewId: 'synthetic-previous-review', stage: 'game', job: previousJob });
  appendEvent(root, 'review-attempt-settled', { jobId: previousJob.jobId, status: 'accepted' });
  appendEvent(root, 'episode-started', { episode: { episodeId: job.episodeId }, frameRef });
  const prepared = appendEvent(root, 'job-prepared', preparedData), claim = appendEvent(root, 'dispatch-claimed', claimData);
  const settlement = appendEvent(root, 'attempt-settled', { jobId: job.jobId, dispatchToken: job.dispatchToken, fatal: true, reason: failureReason });
  appendEvent(root, 'worker-stopped', { reason: failureReason });
  write(join(root, 'outbox', `${job.jobId}.json`), preparedData); write(join(root, 'outbox', `${job.jobId}.claim.json`), claimData);
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
    { direction: 'inbound', frame: { method: 'rawResponseItem/completed', params: { threadId, turnId, item: hostRows[14].payload } } },
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
  const audit = { schemaVersion: 'trix-player-context-evidence-amendment-1.0.0', jobId: job.jobId, preparedHash: prepared.hash, claimHash: claim.hash, settlementHash: settlement.hash, removedCatalogEntrySha256: removedGoogleWorkspaceEntrySha256, previousContextJobId: previousJob.jobId, previousInventoryHash: sha(jsonBytes(oldInventory)), newInventory,
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
  const collector = { root, sourceRoot: resolve('.'), manifest: { runId: job.runId, sourceHashes }, state: () => ({ rows: readJournal(root), commits: [] }) };
  save();
  return { root, invocation, app, previousInvocation, collector, claim, audit, job, hostRows, frames, processInfo, invocationInfo, oldInventory, newInventory, response, prepared, settlement, packet, nativePacket, frame, frameRef, previousContext, actualContext, googleEntry, files, save, journalBytes,
    verify: () => verifyPlayerContextEvidence(collector, claim, audit) };
}

test('saved first player response replays exact host bytes without rewriting its failed invocation or claim', t => {
  const f = fixture(t), originals = Object.fromEntries(f.files.map(path => [path, readFileSync(join(f.invocation, path))]));
  const ledger = readFileSync(join(f.root, 'private/journal.jsonl'));
  assert.match(inspectAppServerEvidence(f.invocation, f.job).reason, /inventory not approved/);
  const result = f.verify();
  assert.equal(result.proof.schemaVersion, 'trix-player-context-response-proof-1.0.0');
  assert.equal(result.proof.preparedHash, f.prepared.hash); assert.equal(result.proof.claimHash, f.claim.hash); assert.equal(result.proof.settlementHash, f.settlement.hash);
  assert.equal(result.candidateId, 'doubles:'); assert.deepEqual(result.response, f.response); assert.deepEqual(result.job, f.job);
  assert.equal(result.evidence.available, true); assert.equal(result.receipt.responseHash, sha(result.bytes));
  assert.deepEqual(result.proof.beforeFrameRef, f.frameRef); assert.equal(result.proof.viewPath, `private/player-context-replay/${f.job.jobId}/${sha(jsonBytes(f.audit))}`);
  for (const path of f.files) assert.ok(readFileSync(join(f.invocation, path)).equals(originals[path]), path);
  assert.ok(readFileSync(join(f.root, 'private/journal.jsonl')).equals(ledger));
  assert.equal(existsSync(join(f.invocation, 'response.txt')), false); assert.equal(existsSync(join(f.invocation, 'receipt.json')), false);
  assert.ok(readFileSync(join(result.viewRoot, 'response.txt')).equals(result.bytes));
  assert.deepEqual(f.verify().proof, result.proof);
});

test('the catalog delta proves two exact changes and nine unchanged sections', t => {
  const f = fixture(t), changes = verifyGoogleWorkspaceCatalogRemoval(f.previousContext, f.actualContext);
  assert.deepEqual(changes.map(change => change.index), [3, 9]); assert.deepEqual(changes, f.audit.changes);
  assert.equal(sha(Buffer.from(f.googleEntry)), removedGoogleWorkspaceEntrySha256);
});

for (const mode of ['other-section', 'changed-entry', 'duplicate-entry', 'other-skill-deletion', 'remaining-entry', 'world-other-field', 'world-includeInstructions', 'part-order', 'one-container-only']) {
  test(`exact catalog delta rejects ${mode}`, t => {
    const f = fixture(t), before = structuredClone(f.previousContext), after = structuredClone(f.actualContext);
    if (mode === 'other-section') after.parts[2].text += ' Different memory.';
    if (mode === 'changed-entry') before.parts[3].text = before.parts[3].text.replace('Google Drive', 'Other Drive');
    if (mode === 'duplicate-entry') before.parts[3].text += f.googleEntry + '\n';
    if (mode === 'other-skill-deletion') after.parts[3].text = after.parts[3].text.replace('- synthetic-skill: A neutral synthetic entry.\n', '');
    if (mode === 'remaining-entry') after.parts[3].text = before.parts[3].text;
    if (mode === 'world-other-field' || mode === 'world-includeInstructions') { const world = JSON.parse(after.parts[9].text); if (mode === 'world-other-field') world.neutral = 'Changed'; else world.host_skills.includeInstructions = false; after.parts[9].text = JSON.stringify(world); }
    if (mode === 'part-order') [after.parts[4], after.parts[5]] = [after.parts[5], after.parts[4]];
    if (mode === 'one-container-only') after.parts[9].text = before.parts[9].text;
    assert.throws(() => verifyGoogleWorkspaceCatalogRemoval(before, after));
  });
}

for (const mode of ['prepared-hash', 'claim-hash', 'settlement-hash', 'entry-hash', 'inventory-hash', 'actual-digest', 'previous-digest', 'changes', 'evidence-hash', 'assessment', 'hidden-facts', 'extra-audit-field']) {
  test(`player context audit rejects ${mode}`, t => {
    const f = fixture(t);
    const fields = { 'prepared-hash': 'preparedHash', 'claim-hash': 'claimHash', 'settlement-hash': 'settlementHash', 'entry-hash': 'removedCatalogEntrySha256', 'inventory-hash': 'previousInventoryHash', 'actual-digest': 'actualDigest', 'previous-digest': 'previousDigest' };
    if (fields[mode]) f.audit[fields[mode]] = '0'.repeat(64);
    if (mode === 'changes') f.audit.changes[0].source = 'developer:memories.instructions';
    if (mode === 'evidence-hash') f.audit.evidenceHashes['private/app-server/wire.jsonl'] = '0'.repeat(64);
    if (mode === 'assessment') f.audit.assessment.changedContextReviewed = false;
    if (mode === 'hidden-facts') f.audit.assessment.episodeSpecificFacts = true;
    if (mode === 'extra-audit-field') f.audit.extra = true;
    assert.throws(f.verify);
  });
}

for (const field of ['evidence', 'hostJournalSha256', 'contextAuditSha256', 'previousDigest', 'classification', 'cwd', 'model', 'effort', 'hostExecutable']) {
  test(`new player inventory rejects inconsistent ${field}`, t => { const f = fixture(t); f.newInventory.audit[field] = 'Invalid provenance'; assert.throws(f.verify); });
}

for (const mode of ['wire-corrupt', 'final-mismatch', 'tool-output', 'extra-turn', 'wrong-model', 'source-hash', 'executable-hash', 'exit-error', 'saved-response', 'saved-receipt', 'other-context', 'late-context', 'missing-journal', 'prior-not-earlier', 'invocation-admitted']) {
  test(`saved player host evidence rejects ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'wire-corrupt') writeFileSync(join(f.app, 'wire.jsonl'), 'Corrupted wire\n');
    if (mode === 'final-mismatch') { f.hostRows[14].payload.content[0].text = 'Wrong saved final'; f.save(); }
    if (mode === 'tool-output') { f.hostRows.splice(-1, 0, { type: 'response_item', payload: { type: 'function_call', name: 'synthetic-tool' } }); f.save(); }
    if (mode === 'extra-turn') { f.frames.push(structuredClone(f.frames[8])); f.save(); }
    if (mode === 'wrong-model') { f.frames[8].frame.params.model = 'other-model'; f.save(); }
    if (mode === 'source-hash') { f.processInfo.adapterSourceHash = '0'.repeat(64); f.save(); }
    if (mode === 'executable-hash') { f.processInfo.executableHash = '0'.repeat(64); f.save(); }
    if (mode === 'exit-error') { const path = join(f.app, 'stopped.json'), stop = JSON.parse(readFileSync(path, 'utf8')); stop.exit.code = 1; writeFileSync(path, jsonBytes(stop)); f.audit.evidenceHashes['private/app-server/stopped.json'] = sha(readFileSync(path)); }
    if (mode === 'saved-response') writeFileSync(join(f.invocation, 'response.txt'), 'Already saved');
    if (mode === 'saved-receipt') writeFileSync(join(f.invocation, 'receipt.json'), '{}');
    if (mode === 'other-context') { f.hostRows[3].payload.content[0].text += ' Changed memory.'; f.save(); }
    if (mode === 'late-context') { f.hostRows.splice(-1, 0, structuredClone(f.hostRows[10])); f.save(); }
    if (mode === 'missing-journal') rmSync(join(f.app, 'host-session.jsonl'));
    if (mode === 'prior-not-earlier') f.audit.previousContextJobId = f.job.jobId;
    if (mode === 'invocation-admitted') { f.invocationInfo.admitted = true; f.save(); }
    assert.throws(f.verify);
  });
}

function replaceRows(f, change) {
  const rows = readJournal(f.root); change(rows);
  let previousHash = '0'.repeat(64);
  for (const row of rows) { row.previousHash = previousHash; const { hash, ...body } = row; row.hash = sha(jsonBytes(body)); previousHash = row.hash; }
  writeFileSync(join(f.root, 'private/journal.jsonl'), Buffer.concat(rows.map(jsonBytes)));
  Object.assign(f.claim, rows.find(row => row.sequence === f.claim.sequence));
  f.audit.preparedHash = rows.find(row => row.sequence === f.prepared.sequence).hash;
  f.audit.claimHash = f.claim.hash; f.audit.settlementHash = rows.find(row => row.sequence === f.settlement.sequence).hash;
}

for (const mode of ['duplicate-claim', 'replacement-attempt', 'duplicate-settlement', 'missing-settlement', 'nonfatal', 'wrong-reason', 'wrong-token', 'abandoned', 'claim-body-tamper', 'wrong-frame', 'wrong-packet']) {
  test(`first consumed player attempt binding rejects ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'duplicate-claim') appendEvent(f.root, 'dispatch-claimed', f.claim.data);
    if (mode === 'replacement-attempt') appendEvent(f.root, 'job-prepared', { ...f.prepared.data, jobId: 'replacement-job', attempt: 2 });
    if (mode === 'duplicate-settlement') appendEvent(f.root, 'attempt-settled', f.settlement.data);
    if (mode === 'missing-settlement') replaceRows(f, rows => { rows[f.settlement.sequence - 1].kind = 'synthetic-unrelated'; });
    if (['nonfatal', 'wrong-reason', 'wrong-token'].includes(mode)) replaceRows(f, rows => { const data = rows[f.settlement.sequence - 1].data; if (mode === 'nonfatal') data.fatal = false; if (mode === 'wrong-reason') data.reason = 'Different failure'; if (mode === 'wrong-token') data.dispatchToken = 'Wrong token'; });
    if (mode === 'abandoned') appendEvent(f.root, 'episode-abandoned', { episodeId: f.job.episodeId });
    if (mode === 'claim-body-tamper') { f.claim.data.requestedModel = 'other-model'; const { hash, ...body } = f.claim; f.claim.hash = sha(jsonBytes(body)); f.audit.claimHash = f.claim.hash; }
    if (mode === 'wrong-frame') { const frame = structuredClone(f.frame); frame.revision++; const ref = putBlob(f.root, frame); replaceRows(f, rows => { rows.find(row => row.kind === 'episode-started').data.frameRef = ref; }); }
    if (mode === 'wrong-packet') { const packet = structuredClone(f.packet); packet.legalOptions[0].candidateId = 'doubles:HK'; const ref = putBlob(f.root, packet); replaceRows(f, rows => { rows[f.prepared.sequence - 1].data.packetRef = ref; }); }
    assert.throws(f.verify);
  });
}

for (const mode of ['illegal-subset', 'extra-field', 'missing-rationale', 'bad-confidence']) {
  test(`context evidence cannot repair ${mode} in the original player answer`, t => {
    const f = fixture(t), response = structuredClone(f.response);
    if (mode === 'illegal-subset') response.cards = ['|♣|2|'];
    if (mode === 'extra-field') response.extra = true;
    if (mode === 'missing-rationale') response.reasoning = ' ';
    if (mode === 'bad-confidence') response.confidence = 101;
    const text = JSON.stringify(response, null, 2) + '\n';
    f.hostRows[14].payload.content[0].text = text; f.hostRows[15].payload.last_agent_message = text;
    f.frames[12].frame.params.item.text = text; f.invocationInfo.responseHash = sha(Buffer.from(text)); f.invocationInfo.hostJournalRef.sha256 = sha(f.journalBytes(f.hostRows)); f.save();
    assert.throws(f.verify); assert.equal(existsSync(join(f.invocation, 'response.txt')), false);
  });
}

test('conflicting derived response prevents immutable proof reuse', t => {
  const f = fixture(t), checked = f.verify(); writeFileSync(join(checked.viewRoot, 'response.txt'), 'Conflict'); assert.throws(f.verify, /Immutable artifact changed/);
});

for (const mode of ['over-300-seconds', 'zero-window', 'negative-window', 'invalid-window', 'response-past-deadline', 'started-before-claim', 'second-attempt']) {
  test(`player recovery preserves bounded invocation policy: ${mode}`, t => {
    const f = fixture(t);
    if (mode === 'over-300-seconds') f.claim.data.deadlineAt = time(301);
    if (mode === 'zero-window') f.claim.data.deadlineAt = time(0);
    if (mode === 'negative-window') f.claim.data.deadlineAt = time(-1);
    if (mode === 'invalid-window') f.claim.data.deadlineAt = 'Invalid timestamp';
    if (mode === 'response-past-deadline') f.claim.data.deadlineAt = time(11);
    if (mode === 'started-before-claim') f.claim.data.claimedAt = time(10);
    if (mode === 'second-attempt') f.prepared.data.attempt = 2;
    replaceRows(f, rows => { rows[f.claim.sequence - 1].data = f.claim.data; rows[f.prepared.sequence - 1].data = f.prepared.data; });
    Object.assign(f.job, f.prepared.data, f.claim.data);
    writeFileSync(join(f.root, 'outbox', `${f.job.jobId}.json`), jsonBytes(f.prepared.data));
    writeFileSync(join(f.root, 'outbox', `${f.job.jobId}.claim.json`), jsonBytes(f.claim.data));
    f.save(); assert.throws(f.verify);
  });
}

