import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateHostReviewEnvelope, importNormalizedHostReview } from '../../scripts/trix-scenario-collection/review-envelope.mjs';
import { describeBaseContext, inspectHostInvocation } from '../../scripts/trix-scenario-collection/host-journal.mjs';
import { appendEvent, getBlob, jsonBytes, putBlob, readJournal, sha, writeImmutable } from '../../scripts/trix-scenario-collection/journal.mjs';

const parentId='01a12816-4909-7f21-86cb-be096b18edc3',childId='01a12bea-9c45-7b03-b668-67f4f3572d1b';
const turnId='01a12bea-9f81-76d0-92ad-ce64310e0cd4',parentTurn='01a12be8-916d-7bb1-b862-5281d983c895';
const taskName='trix_review_unique',callId='call_review_dispatch';
const startedAt='2026-10-11T17:02:38.250Z',finishedAt='2026-10-11T17:02:40.250Z';
const row=(type,payload,timestamp=startedAt)=>({ordinal:0,timestamp,type,payload});
const normalize=rows=>rows.map((r,ordinal)=>({...r,ordinal}));
const hostBytes=rows=>Buffer.from(normalize(rows).map(r=>JSON.stringify(r)).join('\n')+'\n');

function fixture(t,change=p=>{}) {
  const root=mkdtempSync(join(tmpdir(),'trix-review-envelope-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const sessionsRoot=join(root,'sessions'), packet={variant:'basic-solo',request:'diamonds',objective:'own-request-points',ownHand:['|S|♦|2|'],legalOptions:[{candidateId:'play:D2'},{candidateId:'play:C2'}],pin:{gameId:'trix',variantId:'basic-solo'}};
  const packetRef=putBlob(root,packet),saved={job:{packetRef,parentThreadId:parentId},receiptRef:putBlob(root,{hostAgentId:'player-context'})};
  const commit={episodeId:'e1',decisionId:'d1',selectedCandidateId:'play:D2',savedRef:putBlob(root,saved)};
  const prompt='Independent actor review '+JSON.stringify({decisionId:'d1',packetHash:packetRef.sha256,...packet});
  const job={id:'review-d1',stage:'decision',subjectId:'d1',decisionId:'d1',selectedCandidateId:'play:D2',packetRef,packetHash:packetRef.sha256,commitRef:putBlob(root,commit),proofEvidenceRefs:[],promptRef:putBlob(root,Buffer.from(prompt)),promptHash:sha(Buffer.from(prompt))};
  const transportJob={jobId:'review-host-unique',dispatchToken:'unique-token',taskName,parentThreadId:parentId,claimedAt:'2026-10-11T17:02:37.000Z',deadlineAt:'2026-10-11T17:03:00.000Z',promptHash:job.promptHash,promptRef:job.promptRef};
  const raw={decisionId:'d1',packetHash:'a'.repeat(63),reviewVersion:'trix-luna-review-1.0.0',provenance:'llm-proposal',rationaleStatus:'adequate',checks:['facts','objective','material-alternatives','tactical-purpose','uncertainty'].map(id=>({id,status:'supported',explanation:'Synthetic host review fixture only.',evidenceRefs:['actor:/ownHand/0']})),categoryIds:['DIA'],explanationIssues:[],hypotheses:[],missedOpportunity:null,limitations:['Synthetic fixture, no live model.']};
  change(raw, {job,root,packet});
  let bytes=Buffer.from(JSON.stringify(raw,null,2)+'\n');
  const receipt={schemaVersion:'trix-host-receipt-1.0.0',jobId:transportJob.jobId,dispatchToken:transportJob.dispatchToken,promptHash:job.promptHash,responseHash:sha(bytes),hostAgentId:childId,requestedModel:'gpt-6-luna',requestedEffort:'max',reportedModelId:null,startedAt,finishedAt,dispatchStatus:'completed',usage:null};
  const parent=[
    row('session_meta',{id:parentId}),
    row('response_item',{type:'function_call',namespace:'collaboration',name:'spawn_agent',call_id:callId,arguments:JSON.stringify({task_name:taskName,model:'gpt-6-luna',reasoning_effort:'max',fork_turns:'none',message:prompt}),internal_chat_message_metadata_passthrough:{turn_id:parentTurn}}),
    row('event_msg',{type:'item_completed',item:{type:'SubAgentActivity',id:callId,kind:'started',agent_thread_id:childId,agent_path:`/root/${taskName}`}}),
    row('response_item',{type:'function_call_output',call_id:callId,output:JSON.stringify({task_name:`/root/${taskName}`})}),
  ];
  const meta={turn_id:turnId};
  const child=[
    row('session_meta',{id:childId,parent_thread_id:parentId,thread_source:'subagent',source:{subagent:{thread_spawn:{parent_thread_id:parentId,agent_path:`/root/${taskName}`,depth:1}}},base_instructions:{text:'Generic system and safety instructions.'}}),
    row('event_msg',{type:'task_started',turn_id:turnId,started_at:Math.floor(Date.parse(startedAt)/1000)}),
    row('response_item',{type:'message',role:'developer',content:[{type:'input_text',text:'Generic identical operating instructions.'}],internal_chat_message_metadata_passthrough:{turn_id:turnId,content_item_kinds:['generic.developer_instructions']}}),
    row('response_item',{type:'message',role:'user',content:[{type:'input_text',text:'Generic environment.'}],internal_chat_message_metadata_passthrough:{turn_id:turnId,content_item_kinds:['environments.environment_context']}}),
    row('world_state',{full:true,state:{model:'gpt-6-luna',permissions:'read-only'}}),
    row('turn_context',{model:'gpt-6-luna',effort:'max',turn_id:turnId,root_turn_id:parentTurn}),
    row('response_item',{type:'agent_message',author:'/root',recipient:`/root/${taskName}`,content:[{type:'input_text',text:`Message Type: NEW_TASK\nTask name: /root/${taskName}\nSender: /root\nPayload:\n`},{type:'encrypted_content',encrypted_content:'opaque-host-payload'}],internal_chat_message_metadata_passthrough:meta}),
    row('response_item',{type:'reasoning',encrypted_content:'opaque-private-reasoning',internal_chat_message_metadata_passthrough:meta}),
    row('event_msg',{type:'item_completed',turn_id:turnId,item:{type:'Reasoning'}}),
    row('response_item',{type:'message',role:'assistant',phase:'final',content:[{type:'output_text',text:bytes.toString()}],internal_chat_message_metadata_passthrough:meta},finishedAt),
    row('event_msg',{type:'item_completed',turn_id:turnId,item:{type:'AgentMessage'}},finishedAt),
    row('event_msg',{type:'task_complete',turn_id:turnId,last_agent_message:bytes.toString(),completed_at:Math.floor(Date.parse(finishedAt)/1000)},finishedAt),
  ];
  function saveHost(){
    const dir=join(sessionsRoot,'2026/10/11');mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,`rollout-fixture-${parentId}.jsonl`),hostBytes(parent));
    writeFileSync(join(dir,`rollout-fixture-${childId}.jsonl`),hostBytes(child));
  }
  saveHost();writeFileSync(join(root,'host-base-context-admission.json'),JSON.stringify({schemaVersion:'trix-host-base-context-admission-1.0.0',approvedDigests:[describeBaseContext(normalize(child)).digest]}));
  writeImmutable(join(root,`outbox/${job.id}.json`),jsonBytes(job));
  appendEvent(root,'review-dispatch-claimed',{reviewId:job.id,stage:job.stage,job:transportJob});
  appendEvent(root,'review-attempt-settled',{jobId:transportJob.jobId,status:'rejected',reason:'Copied packetHash failed schema.'});
  const processingAudit={originalSourceDigest:'a'.repeat(64),reviewSourceDigest:'b'.repeat(64),nativeBinaryDigest:'c'.repeat(64)};
  const collector={root,manifest:{build:{sourceDigest:processingAudit.originalSourceDigest,binaryDigest:processingAudit.nativeBinaryDigest}},state:()=>({commits:[commit],reviews:readJournal(root).filter(e=>e.kind==='review-imported').map(e=>e.data)})};
  const options={processingAudit,inspectHost:(j,r,runRoot)=>inspectHostInvocation(j,r,runRoot,{sessionsRoot})};
  return {root,collector,job,transportJob,raw,get bytes(){return bytes;},receipt,options,parent,child,saveHost,commit,
    setResponse:text=>{bytes=Buffer.from(text);receipt.responseHash=sha(bytes);child[9].payload.content[0].text=text;child[11].payload.last_agent_message=text;saveHost();},
    check:()=>validateHostReviewEnvelope(collector,job,transportJob,bytes,receipt,options),
    import:()=>importNormalizedHostReview(collector,job,transportJob,bytes,receipt,options)};
}

function snapshot(root){return readdirSync(root,{recursive:true}).filter(name=>typeof name==='string'&&!name.endsWith('owner.lock')).flatMap(name=>{try{return [[name,sha(readFileSync(join(root,name)))]];}catch{return [];}});}

for(const badHash of ['a'.repeat(63),'packetHash copied from prompt'])test(`host-bound normalization preserves raw bytes and reasoning for ${badHash.length===63?'63 hex':'text'} hash`,t=>{
  const f=fixture(t,p=>p.packetHash=badHash),before=snapshot(f.root),checked=f.check();
  assert.deepEqual(snapshot(f.root),before,'Preflight must be read-only');
  assert.deepEqual(checked.normalized,{...f.raw,packetHash:f.job.packetHash});
  const imported=f.import(),accepted=getBlob(f.root,imported.reviewRef),original=getBlob(f.root,imported.originalRef);
  assert.deepEqual(original,f.raw);assert.deepEqual(accepted,checked.normalized);
  const reviewer=getBlob(f.root,imported.reviewerReceiptRef),host=getBlob(f.root,reviewer.hostEvidenceRef),audit=getBlob(f.root,imported.metadataNormalizationRef);
  assert.equal(reviewer.responseHash,sha(jsonBytes(f.raw)));assert.notEqual(reviewer.responseHash,f.receipt.responseHash);
  assert.ok(getBlob(f.root,host.rawRef,false).equals(f.bytes));assert.equal(host.receipt.responseHash,sha(f.bytes));
  assert.equal(audit.oldValue,badHash);assert.equal(audit.newValue,f.job.packetHash);assert.equal(audit.rawResponseHash,sha(f.bytes));assert.match(audit.normalizerSourceHash,/^[a-f0-9]{64}$/);
  const journal=readJournal(f.root);assert.equal(journal[1].data.status,'rejected');assert.equal(journal[2].kind,'review-metadata-normalized');assert.equal(journal[3].kind,'review-imported');
  assert.deepEqual(f.import(),imported);assert.equal(readJournal(f.root).length,4);
});

for(const [name,change] of [
  ['wrong decision',p=>p.decisionId='other'],['wrong version',p=>p.reviewVersion='new-version'],
  ['extra field',p=>p.hiddenHand=['H2']],['missing field',p=>delete p.limitations],
  ['invented actor reference',p=>p.checks[0].evidenceRefs=['actor:/hiddenHands']],
  ['missing hash',p=>delete p.packetHash],['non-string hash',p=>p.packetHash=123],
  ['invalid grading',p=>p.rationaleStatus='perfect'],['duplicate checks',p=>p.checks[0].id='objective'],
])test(`normalization rejects ${name} without mutation`,t=>{
  const f=fixture(t,change),before=snapshot(f.root);assert.throws(()=>f.check(),error=>error.code==='TRIX_REVIEW_CONTENT_INVALID');assert.throws(()=>f.import(),error=>error.code==='TRIX_REVIEW_CONTENT_INVALID');assert.deepEqual(snapshot(f.root),before);
});

for(const [name,change] of [
  ['receipt byte tampering',f=>f.receipt.responseHash='d'.repeat(64)],
  ['host tool use',f=>{f.child[8].payload.item.type='CommandExecution';f.saveHost();}],
  ['wrong prompt dispatch',f=>{const args=JSON.parse(f.parent[1].payload.arguments);args.message+=' extra';f.parent[1].payload.arguments=JSON.stringify(args);f.saveHost();}],
  ['wrong stored job',f=>f.job.decisionId='other'],
  ['unregistered transport',f=>f.transportJob.jobId='not-registered'],
  ['different player source',f=>f.options.processingAudit.originalSourceDigest='d'.repeat(64)],
  ['different native binary',f=>f.options.processingAudit.nativeBinaryDigest='d'.repeat(64)],
  ['player reviewer context',f=>{const saved=getBlob(f.root,f.commit.savedRef);saved.receiptRef=putBlob(f.root,{hostAgentId:childId});f.commit.savedRef=putBlob(f.root,saved);f.job.commitRef=putBlob(f.root,f.commit);writeFileSync(join(f.root,`outbox/${f.job.id}.json`),jsonBytes(f.job));}],
])test(`normalization rejects ${name} before storing review artifacts`,t=>{
  const f=fixture(t);change(f);const before=snapshot(f.root);assert.throws(()=>f.check(),error=>error.code!=='TRIX_REVIEW_CONTENT_INVALID');assert.throws(()=>f.import(),error=>error.code!=='TRIX_REVIEW_CONTENT_INVALID');assert.deepEqual(snapshot(f.root),before);
});

test('correct hash uses ordinary importer; valid weak rationale is preserved without quality selection',t=>{
  const correct=fixture(t,(p,{job})=>p.packetHash=job.packetHash),before=snapshot(correct.root);
  assert.throws(()=>correct.check(),/ordinary review import/);assert.throws(()=>correct.import(),/ordinary review import/);assert.deepEqual(snapshot(correct.root),before);
  const weak=fixture(t,p=>{p.rationaleStatus='uncertain';p.checks[0].status='unknown';});
  assert.equal(getBlob(weak.root,weak.import().reviewRef).rationaleStatus,'uncertain');
});

test('an unissued or unbound proof is downgraded by the ordinary validator, never normalized into proof',t=>{
  const f=fixture(t,p=>p.missedOpportunity={alternativeCandidateId:'play:C2',objective:'own-request-points',advantage:10,proofKind:'native-objective-dominance',proofRef:{path:'blobs/'+'d'.repeat(64),sha256:'d'.repeat(64)},actorEvidenceRefs:['actor:/ownHand/0'],correction:'Synthetic unsupported claim.'});
  let calls=0;f.options.verifyProof=()=>{calls++;return {verified:true};};
  const accepted=getBlob(f.root,f.import().reviewRef);assert.equal(calls,0);assert.equal(accepted.missedOpportunity,null);assert.equal(accepted.hypotheses.length,1);
  assert.deepEqual(getBlob(f.root,readJournal(f.root).at(-1).data.originalRef),f.raw);
});

test('only an issued exact native proof receipt survives normalization, with unchanged original claim',t=>{
  const f=fixture(t,(p,{job,root})=>{
    const proofRef=putBlob(root,{synthetic:true,description:'Synthetic bound proof receipt fixture, not strategy evidence.'});job.proofEvidenceRefs=[proofRef];
    p.missedOpportunity={alternativeCandidateId:'play:C2',objective:'own-request-points',advantage:10,proofKind:'native-objective-dominance',proofRef,actorEvidenceRefs:['actor:/ownHand/0'],correction:'Synthetic bound claim.'};
  });
  const proof={verified:true,packetHash:f.job.packetHash,pin:{gameId:'trix',variantId:'basic-solo'},originalCandidateId:'play:D2',alternativeCandidateId:'play:C2',objective:'own-request-points',advantage:10,proofRef:f.job.proofEvidenceRefs[0]};
  let calls=0;f.options.verifyProof=()=>{calls++;return proof;};
  f.check();assert.equal(calls,0,'Preflight cannot call native verification');
  const accepted=getBlob(f.root,f.import().reviewRef);assert.equal(calls,1);assert.deepEqual(accepted.missedOpportunity,f.raw.missedOpportunity);assert.deepEqual(getBlob(f.root,accepted.acceptedProofReceiptRef),proof);
  const unbound=fixture(t,(p,{job,root})=>{const proofRef=putBlob(root,{synthetic:true});job.proofEvidenceRefs=[proofRef];p.missedOpportunity={...f.raw.missedOpportunity,proofRef};});
  unbound.options.verifyProof=()=>({...proof,packetHash:'f'.repeat(64),proofRef:unbound.job.proofEvidenceRefs[0]});
  const downgraded=getBlob(unbound.root,unbound.import().reviewRef);assert.equal(downgraded.missedOpportunity,null);assert.equal(downgraded.hypotheses.length,1);
});

test('only verified-host model JSON and shape errors are classified as skippable content',t=>{
  for(const text of ['{broken JSON','[]','null']){
    const f=fixture(t);f.setResponse(text);const before=snapshot(f.root);
    assert.throws(()=>f.check(),error=>error.code==='TRIX_REVIEW_CONTENT_INVALID');assert.deepEqual(snapshot(f.root),before);
    f.receipt.responseHash='f'.repeat(64);
    assert.throws(()=>f.check(),error=>error.code!=='TRIX_REVIEW_CONTENT_INVALID','Host failure takes priority over model syntax');
  }
  const missing=fixture(t);missing.options.validateDecision=()=>{const error=new Error('Missing validator dependency');error.code='ENOENT';throw error;};
  assert.throws(()=>missing.check(),error=>error.code==='ENOENT');
});
