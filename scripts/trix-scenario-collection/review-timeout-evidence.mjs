// A separately admitted absolute-deadline stop consumes its existing attempt.
// This verifier certifies local termination and no observed final, never output.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { getBlob, jsonBytes, safePath, sha, writeImmutable } from './journal.mjs';
import { describeAppServerContext, playerBaseInstructions, playerDeveloperInstructions, readWireLog } from './app-server-bridge.mjs';
import { parseHostJournal } from './host-journal.mjs';

const failureReason = 'write after end';
const notices = new Set(['remoteControl/status/changed','thread/started','thread/status/changed','thread/tokenUsage/updated','turn/started','turn/completed','item/started','item/completed','item/reasoning/summaryTextDelta','item/reasoning/summaryPartAdded','item/reasoning/textDelta','rawResponseItem/completed','account/updated','account/rateLimits/updated','warning','mcpServer/startupStatus/updated']);
const one = (rows, predicate, label) => { const matches=rows.filter(predicate);assert.equal(matches.length,1,`Missing or ambiguous ${label}`);return matches[0]; };

export function verifyReviewTimeoutInvocation(collector, claim, inventory) {
  const state=collector.state(), job=claim.data.job;
  assert.equal(claim.kind,'review-dispatch-claimed');
  assert.deepEqual(one(state.rows,r=>r.sequence===claim.sequence,'claim'),claim);
  assert.equal(state.rows.filter(r=>r.kind==='review-dispatch-claimed'&&r.data.job.jobId===job.jobId).length,1);
  assert.equal(state.rows.filter(r=>r.kind==='review-dispatch-claimed'&&r.data.reviewId===claim.data.reviewId&&r.sequence<=claim.sequence).length,1,'Timeout recovery requires the first consumed review attempt');
  assert.equal(inventory.schemaVersion,'trix-host-base-context-admission-1.0.0');assert.equal(inventory.approvedDigests.length,1);
  const settlement=one(state.rows,r=>r.kind==='review-attempt-settled'&&r.data.jobId===job.jobId,'settlement');
  assert.ok(settlement.sequence>claim.sequence);assert.equal(settlement.data.status,'rejected');assert.equal(settlement.data.reason,failureReason);
  const review=JSON.parse(readFileSync(safePath(collector.root,`outbox/${claim.data.reviewId}.json`)));
  assert.equal(review.id,claim.data.reviewId);assert.equal(review.stage,claim.data.stage);
  assert.equal(review.promptHash,job.promptHash);assert.deepEqual(review.promptRef,job.promptRef);
  const root=safePath(collector.root,`private/invocations/${job.jobId}`);
  for(const path of ['response.txt','receipt.json','private/app-server/invocation.json'])assert.equal(existsSync(safePath(root,path)),false,'Failed invocation has output requiring ordinary reconciliation');
  const bytes=name=>readFileSync(safePath(root,name)), read=name=>JSON.parse(bytes(name));
  const dispatched=read('private/app-server/job.json');assert.deepEqual(dispatched,job);assert.deepEqual(read('job.json'),job);
  assert.deepEqual(read('host-base-context-admission.json'),inventory,'Failed call context inventory changed');
  const prompt=getBlob(collector.root,job.promptRef,false);assert.equal(sha(prompt),job.promptHash);assert.ok(prompt.equals(getBlob(root,job.promptRef,false)));
  const wire=readWireLog(root), stopped=read('private/app-server/stopped.json'), process=read('private/app-server/process.json'), capability=read('private/app-server/capability.json');
  assert.equal(stopped.stoppedVerified,true);assert.equal(stopped.error,failureReason);assert.deepEqual(stopped.exit,{code:null,signal:'SIGTERM'});
  assert.equal(stopped.wireFrames,wire.length);assert.equal(stopped.wireDigest,wire.at(-1).hash);
  assert.equal(process.adapterSourceHash,collector.manifest.sourceHashes['scripts/trix-scenario-collection/app-server-bridge.mjs']);
  assert.equal(process.journalSourceHash,collector.manifest.sourceHashes['scripts/trix-scenario-collection/journal.mjs']);
  assert.equal(resolve(process.executable),resolve(inventory.audit.hostExecutable));assert.equal(process.executableHash,sha(readFileSync(process.executable)));
  assert.equal(process.cwd.replaceAll('\\','/').toLowerCase(),'c:/windows/temp');
  const expectedArgs=['app-server','--listen','stdio://',...['shell_tool','unified_exec','multi_agent','multi_agent_v2','code_mode_host','code_mode','computer_use','browser_use','browser_use_external','in_app_browser','plugins','remote_plugin','skill_search','skill_mcp_dependency_install','sleep_tool','tool_suggest'].flatMap(name=>['--disable',name]),'--enable','skip_host_skill_discovery'];
  assert.deepEqual(process.args,expectedArgs);
  const outbound=wire.filter(r=>r.direction==='outbound'), inbound=wire.filter(r=>r.direction==='inbound');
  assert.ok(wire.every(r=>['outbound','inbound','stderr'].includes(r.direction)));
  assert.ok(outbound.every(r=>['initialize','initialized','model/list','thread/start','turn/start','turn/interrupt'].includes(r.frame.method)));
  const request=method=>one(outbound,r=>r.frame.method===method,method);
  request('initialize');request('initialized');const threadRequest=request('thread/start'),turnRequest=request('turn/start'),interrupt=request('turn/interrupt');
  const requests=outbound.filter(r=>r.frame.id!==undefined);assert.equal(new Set(requests.map(r=>r.frame.id)).size,requests.length);
  const response=request=>one(inbound,r=>r.frame.id===request.frame.id,'RPC response');
  for(const r of requests.filter(r=>r!==interrupt)){const f=response(r).frame;assert.equal(f.error,undefined);assert.equal(f.method,undefined);assert.ok(Object.hasOwn(f,'result'));}
  assert.equal(inbound.filter(r=>r.frame.id!==undefined).length,requests.length-1);assert.equal(inbound.filter(r=>r.frame.id===interrupt.frame.id).length,0,'Unexpected interrupt acknowledgement');
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
  assert.deepEqual(interrupt.frame.params,{threadId,turnId});
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
  assert.equal(wire.at(-1),interrupt,'Deadline interrupt must be the exact terminal wire frame');
  const deadline=Date.parse(job.deadlineAt),claimed=Date.parse(job.claimedAt);assert.equal(deadline-claimed,300000,'Original absolute deadline must remain 300 seconds');assert.equal(Date.parse(interrupt.at),deadline,'Interrupt must occur at the original absolute deadline');
  assert.ok(turnRequest.sequence<started.sequence&&started.sequence<typedUser.sequence&&typedUser.sequence<interrupt.sequence);
  assert.ok(wire.every(r=>Number.isFinite(Date.parse(r.at))&&Date.parse(r.at)>=claimed&&Date.parse(r.at)<=deadline),'Wire outside original invocation window');
  const diagnostics=wire.filter(r=>r.direction==='stderr');assert.ok(diagnostics.length<=1,'Additional unclassified stderr activity');
  for(const row of diagnostics){const notice=JSON.parse(row.bytes.toString('utf8'));assert.deepEqual(Object.keys(notice).sort(),['fields','level','target','timestamp']);assert.equal(notice.level,'WARN');assert.equal(notice.target,'codex_core::responses_retry');assert.deepEqual(Object.keys(notice.fields).sort(),['max_retries','message','retries','sampling_error','turn_id']);assert.equal(notice.fields.turn_id,turnId);assert.equal(notice.fields.retries,1);assert.equal(notice.fields.max_retries,5);assert.match(notice.fields.message,/^stream disconnected - retrying sampling request \(1\/5 in \d{1,4}ms\)\.\.\.$/);assert.match(notice.fields.sampling_error,/^We[\u2019\ufffd']re currently experiencing high demand, which may cause temporary errors\.$/);assert.ok(Date.parse(notice.timestamp)>=claimed&&Date.parse(notice.timestamp)<=deadline);}
  // A new immutable copy is outside the original invocation directory.
  const journalPath=safePath(collector.root,`private/review-timeout/evidence/${job.jobId}/host-session.jsonl`);
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
  assert.ok(!late.some(r=>r.type==='response_item'&&r.payload.type==='message'),'Timeout journal contains output or additional input');
  for(const r of rows){
    assert.ok(['session_meta','response_item','world_state','turn_context','event_msg','token_usage_record'].includes(r.type));
    for(const name of ['thread_id'])if(r.payload[name]!==undefined)assert.equal(r.payload[name],threadId,'Wrong own-journal thread');for(const name of ['turn_id','root_turn_id'])if(r.payload[name]!==undefined)assert.equal(r.payload[name],turnId,'Wrong own-journal turn');const metadata=r.payload.internal_chat_message_metadata_passthrough;if(metadata?.turn_id!==undefined)assert.equal(metadata.turn_id,turnId);
    if(r.type==='response_item'){assert.ok(['message','reasoning'].includes(r.payload.type));if(r.payload.type==='message')assert.ok(['user','developer','system'].includes(r.payload.role),'Failed journal contains assistant output');}
    if(r.type==='event_msg'){assert.ok(['task_started','item_completed','token_count'].includes(r.payload.type));if(r.payload.type==='item_completed')assert.ok(['UserMessage','Reasoning'].includes(r.payload.item.type));}
  }
  assert.ok(late.every(r=>Number.isFinite(Date.parse(r.timestamp))&&Date.parse(r.timestamp)>=claimed&&Date.parse(r.timestamp)<=deadline),'Own-journal activity outside original deadline');
  assert.equal(one(rows,r=>r.type==='event_msg'&&r.payload.type==='task_started','journal start').payload.turn_id,turnId);
  const journalUser=one(rows,r=>r.type==='event_msg'&&r.payload.type==='item_completed'&&r.payload.item.type==='UserMessage','journal typed task');
  assert.equal(journalUser.payload.thread_id,threadId);assert.equal(journalUser.payload.turn_id,turnId);assert.equal(journalUser.payload.item.id,typedUser.frame.params.item.id);assert.deepEqual(journalUser.payload.item.content,params.input);
  for(const r of notifications.filter(r=>r.frame.method==='rawResponseItem/completed'))assert.deepEqual(one(rows,row=>row.type==='response_item'&&row.payload.id===r.frame.params.item.id,'raw journal join').payload,r.frame.params.item);
  return {schemaVersion:'trix-review-timeout-invocation-1.0.0',jobId:job.jobId,reviewId:review.id,claimSequence:claim.sequence,claimHash:claim.hash,classification:'absolute-deadline-local-sigterm-no-observed-final',threadId,turnId,model:'gpt-6-luna',effort:'max',stoppedVerified:true,acceptedResponse:false,promptHash:job.promptHash,wireDigest:stopped.wireDigest,wireFrames:wire.length,hostJournalSnapshot:{path:`private/review-timeout/evidence/${job.jobId}/host-session.jsonl`,sha256:sha(journalBytes)},evidenceHashes:{process:sha(bytes('private/app-server/process.json')),stopped:sha(bytes('private/app-server/stopped.json')),job:sha(bytes('private/app-server/job.json')),capability:sha(bytes('private/app-server/capability.json')),wire:sha(bytes('private/app-server/wire.jsonl')),hostJournal:sha(journalBytes),prompt:sha(prompt),inventory:sha(bytes('host-base-context-admission.json'))}};
}
