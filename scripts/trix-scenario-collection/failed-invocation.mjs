// A failed call consumes its attempt. This verifier never admits model output.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { getBlob, jsonBytes, safePath, sha, writeImmutable } from './journal.mjs';
import { describeAppServerContext, playerBaseInstructions, playerDeveloperInstructions, readWireLog } from './app-server-bridge.mjs';
import { parseHostJournal } from './host-journal.mjs';

const failureReason = 'Unexpected MCP infrastructure startup failure';
const abortText = '<turn_aborted>\nThe previous turn was interrupted on purpose. Any running unified exec processes may still be running in the background. If any tools/commands were aborted, they may have partially executed.\n</turn_aborted>';
const notices = new Set(['remoteControl/status/changed','thread/started','thread/status/changed','thread/tokenUsage/updated','turn/started','turn/completed','item/started','item/completed','item/reasoning/summaryTextDelta','item/reasoning/summaryPartAdded','item/reasoning/textDelta','rawResponseItem/completed','rawResponse/completed','model/verification','model/safetyBuffering/updated','turn/moderationMetadata','account/updated','account/rateLimits/updated','warning','mcpServer/startupStatus/updated']);
const one = (rows, predicate, label) => { const matches=rows.filter(predicate);assert.equal(matches.length,1,`Missing or ambiguous ${label}`);return matches[0]; };

export function verifyFailedReviewInvocation(collector, claim, inventory) {
  const state=collector.state(), job=claim.data.job;
  assert.equal(claim.kind,'review-dispatch-claimed');
  assert.deepEqual(one(state.rows,r=>r.sequence===claim.sequence,'claim'),claim);
  assert.equal(state.rows.filter(r=>r.kind==='review-dispatch-claimed'&&r.data.job.jobId===job.jobId).length,1);
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
  assert.equal(stopped.stoppedVerified,true);assert.equal(stopped.error,null);assert.deepEqual(stopped.exit,{code:0,signal:null});
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
  assert.deepEqual(interrupt.frame.params,{threadId,turnId});
  const notifications=inbound.filter(r=>r.frame.method), failures=[];
  const typedSeen=new Set();
  for(const r of notifications){
    const {method,params:p}=r.frame;assert.ok(notices.has(method),`Unexpected failed-call activity: ${method}`);
    if(p.threadId)assert.equal(p.threadId,threadId);if(p.turnId)assert.equal(p.turnId,turnId);if(p.model)assert.equal(p.model,'gpt-6-luna');if(p.modelId)assert.equal(p.modelId,'gpt-6-luna');
    if(p.item){assert.ok(['message','reasoning','userMessage'].includes(p.item.type),'Failed call contains assistant output or tool activity');if(p.item.type==='message')assert.ok(['user','developer','system'].includes(p.item.role),'Failed call contains assistant output');}
    if(method==='remoteControl/status/changed')assert.equal(p.status,'disabled');
    if(method==='thread/started'){
      assert.equal(p.thread?.id,threadId);assert.equal(p.thread.model,'gpt-6-luna');assert.equal(p.thread.reasoningEffort,'max');assert.equal(p.thread.parentThreadId,null);assert.equal(p.thread.forkedFromId,null);assert.deepEqual(p.thread.turns,[]);assert.deepEqual(p.thread.environments,[]);
      assert.ok(r.sequence<turnRequest.sequence,'Late thread announcement');
    }
    if(method==='warning')assert.ok(p.message?.startsWith('Under-development features enabled: skip_host_skill_discovery. Under-development features are incomplete and may behave unpredictably. To suppress this warning, set `suppress_unstable_features_warning = true` in ')||p.message==='Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.','Unexpected host warning');
    if(['item/started','item/completed'].includes(method)){
      assert.ok(['userMessage','reasoning'].includes(p.item?.type));
      const key=`${method}:${p.item.id}`;assert.ok(!typedSeen.has(key),'Duplicate typed item');typedSeen.add(key);
      if(p.item.type==='userMessage')assert.deepEqual(p.item.content,params.input,'Unexpected typed input');
    }
    if(method==='mcpServer/startupStatus/updated'){
      assert.ok(['node_repl','codex_apps'].includes(p.name));
      if(p.status==='failed'){assert.equal(p.name,'codex_apps');assert.match(p.error,/^MCP client for `codex_apps` timed out after 30 seconds\./);assert.equal(p.failureReason,null);failures.push(r);}
      else {assert.ok(['starting','ready'].includes(p.status));assert.ok(!p.error&&!p.failureReason);}
    }
  }
  assert.equal(failures.length,1);const failure=failures[0];
  one(notifications,r=>r.frame.method==='thread/started','thread announcement');
  const typedUser=one(notifications,r=>r.frame.method==='item/completed'&&r.frame.params.item.type==='userMessage','typed task');
  const started=one(notifications,r=>r.frame.method==='turn/started','turn start'), ended=one(notifications,r=>r.frame.method==='turn/completed','interrupted turn');
  assert.equal(started.frame.params.turn.id,turnId);assert.equal(ended.frame.params.turn.id,turnId);assert.equal(ended.frame.params.turn.status,'interrupted');assert.equal(ended.frame.params.turn.error,null);
  assert.ok(turnRequest.sequence<started.sequence&&started.sequence<failure.sequence&&failure.sequence<interrupt.sequence&&interrupt.sequence<ended.sequence);
  const timeline=[job.claimedAt,turnRequest.at,started.at,failure.at,interrupt.at,ended.at,job.deadlineAt].map(Date.parse);
  assert.ok(timeline.every(Number.isFinite)&&timeline.every((t,i)=>i===0||t>=timeline[i-1]),'Invalid invocation time ordering');
  assert.ok(timeline.at(-1)>timeline[0]&&timeline.at(-1)-timeline[0]<=300000);
  // Preserve this stopped thread's exact own journal; never archive or edit it.
  const journalPath=safePath(root,'private/app-server/failed-host-session.jsonl');
  if(!existsSync(journalPath)){
    assert.ok(capability.journalPath.endsWith(`-${threadId}.jsonl`),'Wrong failed thread journal');
    let source;try{source=readFileSync(capability.journalPath);}catch(error){if(error.code!=='ENOENT')throw error;source=readFileSync(resolve(dirname(capability.journalPath),'../../../../archived_sessions',basename(capability.journalPath)));}
    writeImmutable(journalPath,source);
  }
  const journalBytes=readFileSync(journalPath),rows=parseHostJournal(journalBytes);
  assert.equal(rows[0].payload.id,threadId);assert.ok(!rows[0].payload.parent_thread_id);
  assert.equal(describeAppServerContext(journalBytes,prompt).digest,inventory.approvedDigests[0]);
  const context=one(rows,r=>r.type==='turn_context','turn context');assert.equal(context.payload.turn_id,turnId);assert.equal(context.payload.root_turn_id,turnId);
  const task=one(rows,r=>r.type==='response_item'&&r.payload.type==='message'&&r.payload.role==='user'&&r.payload.internal_chat_message_metadata_passthrough?.content_item_kinds?.includes('user.text'),'frozen journal task');
  assert.deepEqual(task.payload.content,[{type:'input_text',text:prompt.toString('utf8')}]);
  const late=rows.slice(rows.indexOf(task)+1);
  assert.ok(!late.some(r=>['session_meta','world_state','turn_context'].includes(r.type)),'Late host configuration');
  const abortNotice=one(late,r=>r.type==='response_item'&&r.payload.type==='message','abort notice');
  assert.equal(abortNotice.payload.role,'developer');assert.deepEqual(abortNotice.payload.content,[{type:'input_text',text:abortText}]);
  const abortMeta=abortNotice.payload.internal_chat_message_metadata_passthrough;
  assert.deepEqual(abortMeta.content_item_kinds,['generic.turn_aborted']);assert.equal(abortMeta.turn_id,turnId);
  assert.ok(Number.isFinite(abortMeta.create_time)&&abortMeta.create_time*1000>=Date.parse(interrupt.at)&&abortMeta.create_time*1000<=Date.parse(ended.at));
  assert.ok(Date.parse(abortNotice.timestamp)>=Date.parse(interrupt.at)&&Date.parse(abortNotice.timestamp)<=Date.parse(ended.at));
  for(const r of rows){
    assert.ok(['session_meta','response_item','world_state','turn_context','event_msg','token_usage_record'].includes(r.type));
    if(r.type==='response_item'){assert.ok(['message','reasoning'].includes(r.payload.type));if(r.payload.type==='message')assert.ok(['user','developer','system'].includes(r.payload.role),'Failed journal contains assistant output');}
    if(r.type==='event_msg'){assert.ok(['task_started','item_completed','token_count','turn_aborted'].includes(r.payload.type));if(r.payload.type==='item_completed')assert.ok(['UserMessage','Reasoning'].includes(r.payload.item.type));}
  }
  assert.equal(one(rows,r=>r.type==='event_msg'&&r.payload.type==='task_started','journal start').payload.turn_id,turnId);
  const journalUser=one(rows,r=>r.type==='event_msg'&&r.payload.type==='item_completed'&&r.payload.item.type==='UserMessage','journal typed task');
  assert.equal(journalUser.payload.thread_id,threadId);assert.equal(journalUser.payload.turn_id,turnId);assert.equal(journalUser.payload.item.id,typedUser.frame.params.item.id);assert.deepEqual(journalUser.payload.item.content,params.input);
  const abort=one(rows,r=>r.type==='event_msg'&&r.payload.type==='turn_aborted','journal abort');assert.equal(abort.payload.turn_id,turnId);assert.equal(abort.payload.root_turn_id,turnId);assert.equal(abort.payload.reason,'interrupted');assert.equal(rows.at(-1),abort);
  assert.ok(Object.keys(abort.payload).every(k=>['type','root_turn_id','turn_id','reason','started_at','completed_at','duration_ms'].includes(k)),'Unknown abort payload');
  for(const r of notifications.filter(r=>r.frame.method==='rawResponseItem/completed'))assert.deepEqual(one(rows,row=>row.type==='response_item'&&row.payload.id===r.frame.params.item.id,'raw journal join').payload,r.frame.params.item);
  return {schemaVersion:'trix-failed-review-invocation-1.0.0',jobId:job.jobId,reviewId:review.id,claimSequence:claim.sequence,claimHash:claim.hash,classification:'mcp-startup-timeout-interrupted-no-final',threadId,turnId,model:'gpt-6-luna',effort:'max',stoppedVerified:true,acceptedResponse:false,promptHash:job.promptHash,wireDigest:stopped.wireDigest,wireFrames:wire.length,evidenceHashes:{process:sha(bytes('private/app-server/process.json')),stopped:sha(bytes('private/app-server/stopped.json')),job:sha(bytes('private/app-server/job.json')),capability:sha(bytes('private/app-server/capability.json')),wire:sha(bytes('private/app-server/wire.jsonl')),hostJournal:sha(journalBytes),prompt:sha(prompt),inventory:sha(bytes('host-base-context-admission.json'))}};
}
