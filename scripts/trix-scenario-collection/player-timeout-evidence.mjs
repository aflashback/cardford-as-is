// A separately admitted absolute-deadline stop consumes its existing attempt.
// This verifier certifies local termination and no observed final, never output.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { getBlob, jsonBytes, safePath, sha, writeImmutable } from './journal.mjs';
import { describeAppServerContext, playerBaseInstructions, playerDeveloperInstructions, readWireLog } from './app-server-bridge.mjs';
import { resolveBuild } from '../coach-lab-builds.mjs';
import { projectPlayerPacket, validatePlayerPacket, renderPrompt } from './contracts.mjs';
import { parseHostJournal } from './host-journal.mjs';

export const playerTimeoutReason = 'App-server invocation timeout';
export const playerTimeoutTransportSourceHash = 'fe52a48f9373927a6c43e98445dd64c8a6ca6453cb72288cd78f06890cc6a505';
const abortText = '<turn_aborted>\nThe previous turn was interrupted on purpose. Any running unified exec processes may still be running in the background. If any tools/commands were aborted, they may have partially executed.\n</turn_aborted>';
const keys = (value, fields) => assert.deepEqual(Object.keys(value).sort(), [...fields].sort());
const notices = new Set(['remoteControl/status/changed','thread/started','thread/status/changed','thread/tokenUsage/updated','turn/started','turn/completed','item/started','item/completed','item/reasoning/summaryTextDelta','item/reasoning/summaryPartAdded','item/reasoning/textDelta','rawResponseItem/completed','account/updated','account/rateLimits/updated','warning','mcpServer/startupStatus/updated']);
const one = (rows, predicate, label) => { const matches=rows.filter(predicate);assert.equal(matches.length,1,`Missing or ambiguous ${label}`);return matches[0]; };

export function verifyPlayerTimeoutInvocation(collector, claim, inventory) {
  const state = collector.state(), ledger = state.rows;
  assert.equal(claim.kind, 'dispatch-claimed');
  assert.deepEqual(one(ledger, row => row.sequence === claim.sequence, 'player claim'), claim);
  assert.equal(ledger.filter(row => row.kind === 'dispatch-claimed' && row.data.jobId === claim.data.jobId).length, 1);
  const prepared = one(ledger, row => row.kind === 'job-prepared' && row.data.jobId === claim.data.jobId, 'player preparation');
  const settlement = one(ledger, row => row.kind === 'attempt-settled' && row.data.jobId === claim.data.jobId, 'player timeout settlement');
  assert.equal(prepared.sequence + 1, claim.sequence); assert.equal(claim.sequence + 1, settlement.sequence);
  assert.equal(settlement.data.fatal, true); assert.equal(settlement.data.reason, playerTimeoutReason); assert.equal(settlement.data.dispatchToken, claim.data.dispatchToken);
  const job = { ...prepared.data, ...claim.data };
  assert.equal(job.schemaVersion, 'trix-player-job-1.0.0'); assert.equal(job.runId, collector.manifest.runId); assert.equal(job.attempt, 1);
  assert.equal(job.requestedModel, 'gpt-6-luna'); assert.equal(job.requestedEffort, 'max'); assert.equal(job.parentThreadId, null);
  assert.equal(job.decisionId, `${job.episodeId}:${job.revision}:${job.actor}`);
  assert.equal(ledger.filter(row => row.sequence <= prepared.sequence && row.kind === 'job-prepared' && row.data.decisionId === job.decisionId).length, 1, 'Only the first consumed attempt is eligible');
  assert.ok(!ledger.some(row => ['move-committed', 'response-saved', 'commit-intent'].includes(row.kind) && row.data.jobId === job.jobId), 'Original timed-out job has action/output requiring reconciliation');
  const episodeStarted = one(ledger, row => row.kind === 'episode-started' && row.data.episode.episodeId === job.episodeId, 'original episode');
  assert.ok(episodeStarted.sequence < prepared.sequence);
  const beforeRow = ledger.filter(row => row.sequence < prepared.sequence && (row.kind === 'episode-started' && row.data.episode.episodeId === job.episodeId || row.kind === 'move-committed' && row.data.episodeId === job.episodeId)).at(-1);
  const beforeFrameRef = beforeRow.data.frameRef, before = getBlob(collector.root, beforeFrameRef);
  assert.equal(before.revision, job.revision); assert.equal(before.nativeActorPacket.seat, job.actor); assert.equal(before.node.phase, job.phase); assert.deepEqual(before.pin, job.pin);
  assert.deepEqual(getBlob(collector.root, job.nativePacketRef), before.nativeActorPacket);
  const packet = validatePlayerPacket(getBlob(collector.root, job.packetRef));
  assert.deepEqual(projectPlayerPacket(before.nativeActorPacket, before.pin, before.revision, job.jobId, before.rules), packet);
  assert.equal(packet.actor, job.actor); assert.equal(packet.nativeRevision, job.revision); assert.equal(packet.sharedRulesHash, job.sharedRulesHash);
  const schemaPath = `contracts/trix-scenario-collection/${job.phase === 'declare-doubles' ? 'declaration-response' : 'play-response'}.schema.json`;
  assert.equal(job.responseSchemaHash, collector.manifest.sourceHashes[schemaPath]); assert.equal(sha(readFileSync(resolve(collector.sourceRoot, schemaPath))), job.responseSchemaHash);
  const templatePath = `planning/implementation/coach-lab/trix-scenario-collection/prompts/${job.phase === 'declare-doubles' ? 'declaration' : 'player'}.md`;
  assert.equal(sha(readFileSync(resolve(collector.sourceRoot, templatePath))), collector.manifest.sourceHashes[templatePath]);
  assert.equal(renderPrompt(packet, job.phase, { templateRoot: resolve(collector.sourceRoot, 'planning/implementation/coach-lab/trix-scenario-collection/prompts') }).sha256, job.promptHash);
  assert.equal(inventory.schemaVersion, 'trix-host-base-context-admission-1.0.0'); assert.equal(inventory.approvedDigests.length, 1); assert.match(inventory.approvedDigests[0], /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(readFileSync(safePath(collector.root, `outbox/${job.jobId}.json`))), prepared.data);
  assert.deepEqual(JSON.parse(readFileSync(safePath(collector.root, `outbox/${job.jobId}.claim.json`))), claim.data);
  const root=safePath(collector.root,`private/invocations/${job.jobId}`);
  for(const path of ['response.txt','receipt.json','private/app-server/invocation.json'])assert.equal(existsSync(safePath(root,path)),false,'Failed invocation has output requiring ordinary reconciliation');
  const bytes=name=>readFileSync(safePath(root,name)), read=name=>JSON.parse(bytes(name));
  const dispatched=read('private/app-server/job.json');assert.deepEqual(dispatched,job);assert.deepEqual(read('job.json'),job);
  assert.deepEqual(read('host-base-context-admission.json'),inventory,'Failed call context inventory changed');
  const prompt=getBlob(collector.root,job.promptRef,false);assert.equal(sha(prompt),job.promptHash);assert.ok(prompt.equals(getBlob(root,job.promptRef,false)));
  const wire=readWireLog(root), stopped=read('private/app-server/stopped.json'), process=read('private/app-server/process.json'), capability=read('private/app-server/capability.json');
  assert.equal(stopped.stoppedVerified,true);assert.equal(stopped.error,null);assert.deepEqual(stopped.exit,{code:0,signal:null});
  const { authorization, recoveryHash, delegated } = verifyTransportAuthorization(collector, claim, read('private/app-server/shutdown-guard.json'));
  assert.equal(stopped.wireFrames,wire.length);assert.equal(stopped.wireDigest,wire.at(-1).hash);
  assert.equal(process.adapterSourceHash,collector.manifest.sourceHashes['scripts/trix-scenario-collection/app-server-bridge.mjs']);
  assert.equal(process.journalSourceHash,collector.manifest.sourceHashes['scripts/trix-scenario-collection/journal.mjs']);
  assert.equal(resolve(process.executable),resolve(inventory.audit.hostExecutable));assert.equal(process.executableHash,sha(readFileSync(process.executable)));
  assert.equal(process.cwd.replaceAll('\\','/').toLowerCase(),'c:/windows/temp');
  const expectedArgs=['app-server','--listen','stdio://',...['shell_tool','unified_exec','multi_agent','multi_agent_v2','code_mode_host','code_mode','computer_use','browser_use','browser_use_external','in_app_browser','plugins','remote_plugin','skill_search','skill_mcp_dependency_install','sleep_tool','tool_suggest'].flatMap(name=>['--disable',name]),'--enable','skip_host_skill_discovery'];
  assert.deepEqual(process.args,expectedArgs);
  const outbound=wire.filter(r=>r.direction==='outbound'), inbound=wire.filter(r=>r.direction==='inbound');
  assert.ok(wire.every(r=>['outbound','inbound','stderr'].includes(r.direction)));
  assert.ok(outbound.every(r=>['initialize','initialized','model/list','thread/start','turn/start'].includes(r.frame.method)));
  const request=method=>one(outbound,r=>r.frame.method===method,method);
  request('initialize');request('initialized');const threadRequest=request('thread/start'),turnRequest=request('turn/start');
  const requests=outbound.filter(r=>r.frame.id!==undefined);assert.equal(new Set(requests.map(r=>r.frame.id)).size,requests.length);
  const response=request=>one(inbound,r=>r.frame.id===request.frame.id,'RPC response');
  for(const r of requests){const f=response(r).frame;assert.equal(f.error,undefined);assert.equal(f.method,undefined);assert.ok(Object.hasOwn(f,'result'));}
  assert.equal(inbound.filter(r=>r.frame.id!==undefined).length,requests.length);
  const catalogs=outbound.filter(r=>r.frame.method==='model/list').flatMap(r=>response(r).frame.result.data??[]);
  assert.ok(catalogs.some(m=>m.model==='gpt-6-luna'&&m.supportedReasoningEfforts?.some(e=>e.reasoningEffort==='max')),'Exact failed-call model catalog missing');
  const cfg=threadRequest.frame.params,thread=response(threadRequest).frame.result,turn=response(turnRequest).frame.result.turn;
  assert.equal(cfg.model,'gpt-6-luna');assert.equal(cfg.config.model_reasoning_effort,'max');assert.equal(cfg.allowProviderModelFallback,false);
  assert.equal(cfg.baseInstructions,playerBaseInstructions);assert.equal(cfg.developerInstructions,playerDeveloperInstructions);assert.equal(cfg.config.web_search,'disabled');assert.equal(cfg.approvalPolicy,'never');assert.equal(cfg.sandbox,'read-only');
  assert.equal(resolve(cfg.cwd),resolve(process.cwd));
  for(const key of ['dynamicTools','environments','runtimeWorkspaceRoots','selectedCapabilityRoots'])assert.deepEqual(cfg[key],[]);
  assert.equal(thread.model,'gpt-6-luna');assert.equal(thread.reasoningEffort,'max');assert.equal(thread.thread.parentThreadId,null);assert.equal(thread.thread.forkedFromId,null);assert.deepEqual(thread.thread.turns,[]);assert.deepEqual(thread.thread.environments,[]);assert.deepEqual(thread.runtimeWorkspaceRoots,[]);
  const threadId=thread.thread.id,turnId=turn.id;assert.equal(capability.threadId,threadId);assert.equal(capability.model,'gpt-6-luna');assert.equal(capability.effort,'max');assert.deepEqual(capability.request,cfg);assert.deepEqual(capability.response,thread);
  const params=turnRequest.frame.params;assert.equal(params.threadId,threadId);assert.equal(params.model,'gpt-6-luna');assert.equal(params.effort,'max');assert.deepEqual(params.additionalContext,{});assert.deepEqual(params.environments,[]);assert.deepEqual(params.runtimeWorkspaceRoots,[]);assert.deepEqual(params.input,[{type:'text',text:prompt.toString('utf8'),text_elements:[]}]);
  const notifications=inbound.filter(r=>r.frame.method), ready=new Set();
  const typedSeen=new Set();
  for(const r of notifications){
    const {method,params:p}=r.frame;assert.ok(notices.has(method),`Unexpected failed-call activity: ${method}`);
    if(p.threadId)assert.equal(p.threadId,threadId);if(p.turnId)assert.equal(p.turnId,turnId);if(p.model)assert.equal(p.model,'gpt-6-luna');if(p.modelId)assert.equal(p.modelId,'gpt-6-luna');
    if(p.item){assert.ok(['message','reasoning','userMessage'].includes(p.item.type),'Failed call contains assistant output or tool activity');if(p.item.type==='message')assert.ok(['user','developer','system'].includes(p.item.role),'Failed call contains assistant output');}
    if(method==='remoteControl/status/changed')assert.equal(p.status,'disabled');
    if(method==='thread/started'){
      assert.equal(p.thread?.id,threadId);assert.equal(p.thread.model,'gpt-6-luna');assert.equal(p.thread.reasoningEffort,'max');assert.equal(p.thread.parentThreadId,null);assert.equal(p.thread.forkedFromId,null);assert.deepEqual(p.thread.turns,[]);assert.deepEqual(p.thread.environments,[]);
    }
    if(method==='warning')assert.ok(p.message?.startsWith('Under-development features enabled: skip_host_skill_discovery. Under-development features are incomplete and may behave unpredictably. To suppress this warning, set `suppress_unstable_features_warning = true` in ')||p.message==='Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.','Unexpected host warning');
    if(['item/started','item/completed'].includes(method)){
      assert.ok(['userMessage','reasoning'].includes(p.item?.type));
      const key=`${method}:${p.item.id}`;assert.ok(!typedSeen.has(key),'Duplicate typed item');typedSeen.add(key);
      if(p.item.type==='userMessage')assert.deepEqual(p.item.content,params.input,'Unexpected typed input');
    }
    if(method==='mcpServer/startupStatus/updated'){
      assert.ok(['node_repl','codex_apps'].includes(p.name));assert.ok(['starting','ready'].includes(p.status));assert.ok(!p.error&&!p.failureReason);if(p.status==='ready')ready.add(p.name);
    }
  }
  assert.deepEqual([...ready].sort(),['codex_apps','node_repl'],'Both MCP hosts must be ready');
  const announced=one(notifications,r=>r.frame.method==='thread/started','thread announcement');
  const typedUser=one(notifications,r=>r.frame.method==='item/completed'&&r.frame.params.item.type==='userMessage','typed task');
  const started=one(notifications,r=>r.frame.method==='turn/started','turn start');assert.equal(started.frame.params.turn.id,turnId);
  assert.ok(threadRequest.sequence<response(threadRequest).sequence&&response(threadRequest).sequence<turnRequest.sequence&&response(threadRequest).sequence<announced.sequence&&announced.sequence<started.sequence,'Invalid fresh thread announcement ordering');
  assert.equal(notifications.filter(r=>r.frame.method==='turn/completed').length,0,'Completed or interrupted turn requires separate reconciliation');
  const deadline=Date.parse(job.deadlineAt),claimed=Date.parse(job.claimedAt);assert.equal(deadline-claimed,300000,'Original absolute deadline must remain 300 seconds');
  assert.ok(turnRequest.sequence<started.sequence&&started.sequence<typedUser.sequence&&typedUser.sequence<wire.at(-1).sequence);
  assert.ok(wire.every(r=>Number.isFinite(Date.parse(r.at))&&Date.parse(r.at)>=claimed&&Date.parse(r.at)<=deadline),'Wire outside original invocation window');
  const ended = Date.parse(settlement.at); assert.ok(Number.isFinite(ended) && ended >= deadline && ended <= deadline + 5000, 'Settlement does not bind the bounded local stop');
  assert.ok(Date.parse(process.launchedAt) >= claimed && Date.parse(process.launchedAt) <= Date.parse(wire[0].at));
  assert.equal(wire.filter(row => row.direction === 'stderr').length, 0, 'Unclassified stderr activity');
  // A new immutable copy is outside the original invocation directory.
  const journalPath=safePath(collector.root,`private/player-timeout/evidence/${job.jobId}/host-session.jsonl`);
  assert.ok(capability.journalPath.endsWith(`-${threadId}.jsonl`),'Wrong timeout thread journal');
  let source;try{source=readFileSync(capability.journalPath);}catch(error){if(error.code!=='ENOENT')throw error;source=readFileSync(resolve(dirname(capability.journalPath),'../../../../archived_sessions',basename(capability.journalPath)));}
  if(existsSync(journalPath))assert.ok(readFileSync(journalPath).equals(source),'Stopped own host journal changed');else writeImmutable(journalPath,source);
  const journalBytes=readFileSync(journalPath),rows=parseHostJournal(journalBytes);
  assert.equal(rows[0].payload.id,threadId);assert.ok(!rows[0].payload.parent_thread_id);
  assert.equal(describeAppServerContext(journalBytes,prompt).digest,inventory.approvedDigests[0]);
  const context=one(rows,r=>r.type==='turn_context','turn context');assert.equal(context.payload.turn_id,turnId);assert.equal(context.payload.root_turn_id,turnId);
  const task=one(rows,r=>r.type==='response_item'&&r.payload.type==='message'&&r.payload.role==='user'&&r.payload.internal_chat_message_metadata_passthrough?.content_item_kinds?.includes('user.text'),'frozen journal task');
  assert.deepEqual(task.payload.content,[{type:'input_text',text:prompt.toString('utf8')}]);
  const late=rows.slice(rows.indexOf(task)+1);
  assert.ok(!late.some(r=>['session_meta','world_state','turn_context'].includes(r.type)),'Late host configuration');
  const abortNotice = one(late, row => row.type === 'response_item' && row.payload.type === 'message', 'host abort notice');
  assert.equal(abortNotice.payload.role, 'developer'); assert.deepEqual(abortNotice.payload.content, [{ type: 'input_text', text: abortText }]);
  const metadata = abortNotice.payload.internal_chat_message_metadata_passthrough;
  keys(metadata, ['turn_id', 'create_time', 'content_item_kinds']); assert.equal(metadata.turn_id, turnId); assert.deepEqual(metadata.content_item_kinds, ['generic.turn_aborted']);
  const abort = one(rows, row => row.type === 'event_msg' && row.payload.type === 'turn_aborted', 'terminal host abort');
  assert.equal(rows.at(-1), abort); assert.equal(rows.at(-2), abortNotice);
  assert.equal(abort.payload.turn_id, turnId); assert.equal(abort.payload.root_turn_id, turnId); assert.equal(abort.payload.reason, 'interrupted');
  keys(abort.payload, ['type', 'turn_id', 'root_turn_id', 'reason', 'started_at', 'completed_at', 'duration_ms']);
  for (const value of [Date.parse(abortNotice.timestamp), metadata.create_time * 1000, Date.parse(abort.timestamp)]) assert.ok(Number.isFinite(value) && value >= deadline && value <= Math.min(ended, deadline + 1000), 'Abort outside verified local shutdown');
  assert.ok(metadata.create_time * 1000 <= Date.parse(abort.timestamp) && Date.parse(abortNotice.timestamp) <= Date.parse(abort.timestamp));
  assert.ok(Number.isSafeInteger(abort.payload.started_at) && abort.payload.started_at * 1000 >= claimed - 999 && abort.payload.started_at * 1000 <= Date.parse(started.at));
  assert.ok(Number.isSafeInteger(abort.payload.completed_at) && Math.abs(abort.payload.completed_at * 1000 - Date.parse(abort.timestamp)) < 1000);
  assert.ok(Number.isSafeInteger(abort.payload.duration_ms) && abort.payload.duration_ms > 0 && abort.payload.duration_ms <= 300000 && Math.abs((abort.payload.completed_at - abort.payload.started_at) * 1000 - abort.payload.duration_ms) < 1000);
  const closingTelemetry = late.filter(row => Date.parse(row.timestamp) > deadline && row !== abortNotice && row !== abort);
  assert.ok(closingTelemetry.length <= 1, 'Additional activity after the invocation deadline');
  if (closingTelemetry.length) {
    const telemetry = closingTelemetry[0]; assert.equal(rows.at(-3), telemetry); assert.equal(telemetry.type, 'event_msg');
    keys(telemetry.payload, ['type', 'info', 'rate_limits']); assert.equal(telemetry.payload.type, 'token_count'); assert.equal(telemetry.payload.info, null);
    const limits = telemetry.payload.rate_limits; keys(limits, ['limit_id', 'limit_name', 'primary', 'secondary', 'credits', 'individual_limit', 'spend_control_reached', 'plan_type', 'rate_limit_reached_type']);
    assert.equal(limits.limit_id, 'codex'); assert.equal(limits.plan_type, 'promax');
    for (const field of ['limit_name', 'secondary', 'individual_limit', 'spend_control_reached', 'rate_limit_reached_type']) assert.equal(limits[field], null);
    keys(limits.primary, ['used_percent', 'window_minutes', 'resets_at']);
    assert.ok(Number.isFinite(limits.primary.used_percent) && limits.primary.used_percent >= 0 && limits.primary.used_percent <= 100);
    for (const field of ['window_minutes', 'resets_at']) assert.ok(Number.isSafeInteger(limits.primary[field]) && limits.primary[field] > 0);
    keys(limits.credits, ['has_credits', 'unlimited', 'balance']); assert.equal(typeof limits.credits.has_credits, 'boolean'); assert.equal(typeof limits.credits.unlimited, 'boolean'); assert.match(limits.credits.balance, /^\d+(?:\.\d+)?$/);
    assert.ok(Date.parse(telemetry.timestamp) <= Date.parse(abortNotice.timestamp), 'Closing telemetry follows abort notice');
  }
  for(const r of rows){
    assert.ok(['session_meta','response_item','world_state','turn_context','event_msg','token_usage_record'].includes(r.type));
    for(const name of ['thread_id'])if(r.payload[name]!==undefined)assert.equal(r.payload[name],threadId,'Wrong own-journal thread');for(const name of ['turn_id','root_turn_id'])if(r.payload[name]!==undefined)assert.equal(r.payload[name],turnId,'Wrong own-journal turn');const metadata=r.payload.internal_chat_message_metadata_passthrough;if(metadata?.turn_id!==undefined)assert.equal(metadata.turn_id,turnId);
    if(r.type==='response_item'){assert.ok(['message','reasoning'].includes(r.payload.type));if(r.payload.type==='message')assert.ok(['user','developer','system'].includes(r.payload.role),'Failed journal contains assistant output');}
    if(r.type==='event_msg'){assert.ok(['task_started','item_completed','token_count','turn_aborted'].includes(r.payload.type));if(r.payload.type==='item_completed')assert.ok(['UserMessage','Reasoning'].includes(r.payload.item.type));}
  }
  assert.ok(late.filter(row => row !== abortNotice && row !== abort && !closingTelemetry.includes(row)).every(r=>Number.isFinite(Date.parse(r.timestamp))&&Date.parse(r.timestamp)>=claimed&&Date.parse(r.timestamp)<=deadline),'Own-journal activity outside original deadline');
  assert.equal(one(rows,r=>r.type==='event_msg'&&r.payload.type==='task_started','journal start').payload.turn_id,turnId);
  const journalUser=one(rows,r=>r.type==='event_msg'&&r.payload.type==='item_completed'&&r.payload.item.type==='UserMessage','journal typed task');
  assert.equal(journalUser.payload.thread_id,threadId);assert.equal(journalUser.payload.turn_id,turnId);assert.equal(journalUser.payload.item.id,typedUser.frame.params.item.id);assert.deepEqual(journalUser.payload.item.content,params.input);
  for(const r of notifications.filter(r=>r.frame.method==='rawResponseItem/completed'))assert.deepEqual(one(rows,row=>row.type==='response_item'&&row.payload.id===r.frame.params.item.id,'raw journal join').payload,r.frame.params.item);
  return { schemaVersion: 'trix-player-timeout-invocation-1.0.0', classification: 'absolute-deadline-local-clean-stop-host-aborted-no-observed-final', jobId: job.jobId, decisionId: job.decisionId, episodeId: job.episodeId, attempt: 1,
    preparedSequence: prepared.sequence, preparedHash: prepared.hash, claimSequence: claim.sequence, claimHash: claim.hash, settlementSequence: settlement.sequence, settlementHash: settlement.hash,
    threadId, turnId, model: 'gpt-6-luna', effort: 'max', stoppedVerified: true, acceptedResponse: false, promptHash: job.promptHash, packetRef: job.packetRef, nativePacketRef: job.nativePacketRef, beforeFrameRef,
    nativeBeforeDigest: sha(jsonBytes(before.snapshot)), episodeStarted: { sequence: episodeStarted.sequence, hash: episodeStarted.hash }, episodeHash: sha(jsonBytes(episodeStarted.data.episode)), responseSchemaHash: job.responseSchemaHash,
    contextDigest: inventory.approvedDigests[0], guardSourceHash: delegated.sourceHash, transportAuthorization: { sequence: authorization.sequence, hash: authorization.hash, recoveryHash }, transportDelegation: delegated,
    wireDigest: stopped.wireDigest, wireFrames: wire.length, hostJournalSnapshot: { path: `private/player-timeout/evidence/${job.jobId}/host-session.jsonl`, sha256: sha(journalBytes) },
    evidenceHashes: { process: sha(bytes('private/app-server/process.json')), stopped: sha(bytes('private/app-server/stopped.json')), job: sha(bytes('private/app-server/job.json')), capability: sha(bytes('private/app-server/capability.json')), wire: sha(bytes('private/app-server/wire.jsonl')), hostJournal: sha(journalBytes), prompt: sha(prompt), inventory: sha(bytes('host-base-context-admission.json')), guard: sha(bytes('private/app-server/shutdown-guard.json')), prepared: sha(readFileSync(safePath(collector.root, `outbox/${job.jobId}.json`))), claim: sha(readFileSync(safePath(collector.root, `outbox/${job.jobId}.claim.json`))) } };
}

function verifyTransportAuthorization(collector, claim, guard) {
  const rows = collector.state().rows, authorization = one(rows, row => row.kind === 'review-timeout-recovery-authorized', 'authorized shutdown transport');
  assert.ok(authorization.sequence < claim.sequence); const recoveryHash = authorization.data.recoveryHash; assert.match(recoveryHash, /^[a-f0-9]{64}$/);
  const recoveryPath = `private/review-timeout/recoveries/${recoveryHash}.json`; assert.equal(authorization.data.recoveryPath, recoveryPath);
  const recovery = JSON.parse(readFileSync(safePath(collector.root, recoveryPath))); assert.equal(sha(jsonBytes(recovery)), recoveryHash);
  assert.equal(recovery.schemaVersion, 'trix-review-timeout-recovery-1.0.0'); assert.equal(recovery.runId, collector.manifest.runId);
  assert.equal(recovery.originalManifestHash, sha(jsonBytes(collector.manifest))); assert.equal(recovery.originalSourceDigest, collector.manifest.build.sourceDigest); assert.equal(recovery.nativeBinaryDigest, collector.manifest.build.binaryDigest);
  const boundary = one(rows, row => row.sequence === recovery.previousBoundary.sequence, 'transport predecessor boundary'); assert.equal(boundary.hash, recovery.previousBoundary.hash); assert.equal(authorization.sequence, boundary.sequence + 1);
  const delegated = recovery.transportDelegation, file = 'scripts/trix-scenario-collection/shutdown-safe-transport.mjs';
  keys(delegated, ['policyVersion', 'sourceFile', 'sourceHash', 'processingBuild', 'processingAudit', 'adapterSourceHash', 'journalSourceHash']);
  assert.equal(delegated.sourceFile, file); assert.equal(delegated.policyVersion, 'trix-host-shutdown-guard-1.0.0'); assert.equal(delegated.sourceHash, playerTimeoutTransportSourceHash); assert.equal(recovery.sourceHashes[file], delegated.sourceHash);
  assert.deepEqual(delegated.processingBuild, recovery.processingBuild); assert.equal(delegated.processingBuild.binaryDigest, recovery.nativeBinaryDigest);
  assert.deepEqual(delegated.processingAudit, { originalSourceDigest: recovery.originalSourceDigest, reviewSourceDigest: recovery.processingBuild.sourceDigest, nativeBinaryDigest: recovery.nativeBinaryDigest });
  assert.equal(delegated.adapterSourceHash, collector.manifest.sourceHashes['scripts/trix-scenario-collection/app-server-bridge.mjs']); assert.equal(delegated.journalSourceHash, collector.manifest.sourceHashes['scripts/trix-scenario-collection/journal.mjs']);
  assert.equal(recovery.sourceHashes['scripts/trix-scenario-collection/app-server-bridge.mjs'], delegated.adapterSourceHash); assert.equal(recovery.sourceHashes['scripts/trix-scenario-collection/journal.mjs'], delegated.journalSourceHash);
  resolveBuild(collector.root, recovery.sourceHashes, recovery.processingBuild);
  assert.deepEqual(guard, { schemaVersion: delegated.policyVersion, jobId: claim.data.jobId, sourceHash: delegated.sourceHash });
  return { authorization, recoveryHash, delegated };
}
