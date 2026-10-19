// Reinspect an exact saved response under a separately audited context inventory.
// Original invocation files and their rejection are never rewritten.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describeAppServerContext, inspectAppServerEvidence } from './app-server-bridge.mjs';
import { receiptFromEvidence } from './live-driver.mjs';
import { validateDecisionProposal } from './review.mjs';
import { getBlob, jsonBytes, safePath, sha, writeImmutable } from './journal.mjs';

export const contextFailureReason='Actual post-turn context differs from approved context';
export const contextEvidenceFiles=['job.json','host-base-context-admission.json','private/app-server/job.json','private/app-server/process.json','private/app-server/capability.json','private/app-server/stopped.json','private/app-server/wire.jsonl','private/app-server/host-session.jsonl','private/app-server/context-audit.json','private/app-server/invocation.json'];
const one=(rows,predicate,label)=>{const found=rows.filter(predicate);assert.equal(found.length,1,`Missing or ambiguous ${label}`);return found[0];};
const keys=(value,names)=>assert.deepEqual(Object.keys(value).sort(),[...names].sort());

export function verifyContextEvidence(collector,claim,audit) {
  keys(audit,['schemaVersion','jobId','claimHash','previousContextJobId','previousInventoryHash','newInventory','previousDigest','actualDigest','changes','evidenceHashes','assessment']);
  assert.equal(audit.schemaVersion,'trix-context-evidence-amendment-1.0.0');
  const state=collector.state(),job=claim.data.job;
  const budget=Date.parse(job.deadlineAt)-Date.parse(job.claimedAt);assert.ok(Number.isFinite(budget)&&budget>0&&budget<=300000);
  assert.equal(claim.kind,'review-dispatch-claimed');assert.deepEqual(one(state.rows,r=>r.sequence===claim.sequence,'context claim'),claim);
  assert.equal(audit.jobId,job.jobId);assert.equal(audit.claimHash,claim.hash);
  assert.equal(state.rows.filter(r=>r.kind==='review-dispatch-claimed'&&r.data.job.jobId===job.jobId).length,1);
  const settlement=one(state.rows,r=>r.kind==='review-attempt-settled'&&r.data.jobId===job.jobId,'context rejection');
  assert.equal(settlement.data.status,'rejected');assert.equal(settlement.data.reason,contextFailureReason);assert.ok(settlement.sequence>claim.sequence);
  const attempts=state.rows.filter(r=>r.kind==='review-dispatch-claimed'&&r.data.reviewId===claim.data.reviewId);assert.ok(attempts.length<=2);
  const root=safePath(collector.root,`private/invocations/${job.jobId}`),read=name=>JSON.parse(readFileSync(safePath(root,name)));
  for(const name of ['response.txt','receipt.json'])assert.equal(existsSync(safePath(root,name)),false,'Original output already exists; ordinary reconciliation required');
  keys(audit.evidenceHashes,[...contextEvidenceFiles,job.promptRef.path]);
  for(const [name,hash]of Object.entries(audit.evidenceHashes)){assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(sha(readFileSync(safePath(root,name))),hash,`Changed original evidence: ${name}`);}
  assert.deepEqual(read('job.json'),job);assert.deepEqual(read('private/app-server/job.json'),job);
  const prompt=getBlob(collector.root,job.promptRef,false);assert.equal(sha(prompt),job.promptHash);assert.ok(prompt.equals(getBlob(root,job.promptRef,false)));
  const reviewJob=JSON.parse(readFileSync(safePath(collector.root,`outbox/${claim.data.reviewId}.json`)));
  assert.equal(reviewJob.id,claim.data.reviewId);assert.equal(reviewJob.stage,'decision');assert.equal(claim.data.stage,'decision');assert.equal(reviewJob.promptHash,job.promptHash);assert.deepEqual(reviewJob.promptRef,job.promptRef);
  const oldInventory=read('host-base-context-admission.json'),inventory=audit.newInventory;
  assert.equal(sha(jsonBytes(oldInventory)),audit.previousInventoryHash);
  for(const [inv,digest]of [[oldInventory,audit.previousDigest],[inventory,audit.actualDigest]]){assert.equal(inv.schemaVersion,'trix-host-base-context-admission-1.0.0');assert.deepEqual(inv.approvedDigests,[digest]);assert.match(digest,/^[a-f0-9]{64}$/);}
  assert.notEqual(audit.previousDigest,audit.actualDigest);assert.equal(inventory.audit.hostExecutable,oldInventory.audit.hostExecutable);
  assert.equal(inventory.audit.evidence,`private/invocations/${job.jobId}/private/app-server/host-session.jsonl`);
  assert.equal(inventory.audit.hostJournalSha256,audit.evidenceHashes['private/app-server/host-session.jsonl']);assert.equal(inventory.audit.contextAuditSha256,audit.evidenceHashes['private/app-server/context-audit.json']);
  assert.equal(inventory.audit.previousDigest,audit.previousDigest);assert.equal(inventory.audit.classification,audit.assessment.summary);
  assert.equal(inventory.audit.cwd,'C:/Windows/Temp');assert.equal(inventory.audit.model,'gpt-6-luna');assert.equal(inventory.audit.effort,'max');
  const prior=one(state.rows,r=>['review-dispatch-claimed','dispatch-claimed'].includes(r.kind)&&(r.data.job?.jobId??r.data.jobId)===audit.previousContextJobId,'previous context claim');
  assert.ok(prior.sequence<claim.sequence);
  const previousRoot=safePath(collector.root,`private/invocations/${audit.previousContextJobId}`);
  assert.deepEqual(JSON.parse(readFileSync(safePath(previousRoot,'host-base-context-admission.json'))),oldInventory);
  const previousJob=JSON.parse(readFileSync(safePath(previousRoot,'job.json'))),previousPrompt=getBlob(previousRoot,previousJob.promptRef,false);
  assert.equal(previousJob.jobId,audit.previousContextJobId);assert.equal(sha(previousPrompt),previousJob.promptHash);
  if(prior.data.job)assert.deepEqual(previousJob,prior.data.job);
  const priorPath=existsSync(safePath(previousRoot,'private/app-server/host-session.jsonl'))?'private/app-server/host-session.jsonl':'private/app-server/failed-host-session.jsonl';
  const before=describeAppServerContext(readFileSync(safePath(previousRoot,priorPath)),previousPrompt);
  const after=describeAppServerContext(readFileSync(safePath(root,'private/app-server/host-session.jsonl')),prompt);
  assert.equal(before.digest,audit.previousDigest);assert.equal(after.digest,audit.actualDigest);assert.deepEqual(read('private/app-server/context-audit.json'),after);
  assert.equal(before.parts.length,after.parts.length);
  const changes=[];
  for(let i=0;i<after.parts.length;i++){
    const a=before.parts[i],b=after.parts[i];if(JSON.stringify(a)===JSON.stringify(b))continue;
    assert.equal(a.source,'developer:memories.instructions','Unreviewed host context section changed');assert.equal(b.source,a.source);
    changes.push({index:i,source:a.source,beforeSha256:sha(Buffer.from(a.text)),afterSha256:sha(Buffer.from(b.text))});
  }
  assert.equal(changes.length,1,'Only the explicitly inspected memory section may change');assert.deepEqual(audit.changes,changes);
  keys(audit.assessment,['changedContextReviewed','episodeSpecificFacts','otherSeatEvidence','hiddenFixtureMemory','summary','limitations']);
  assert.equal(audit.assessment.changedContextReviewed,true);
  for(const name of ['episodeSpecificFacts','otherSeatEvidence','hiddenFixtureMemory'])assert.equal(audit.assessment[name],false);
  assert.ok(typeof audit.assessment.summary==='string'&&audit.assessment.summary.length>0);assert.ok(Array.isArray(audit.assessment.limitations)&&audit.assessment.limitations.every(x=>typeof x==='string'&&x.length>0));
  const process=read('private/app-server/process.json'),invocation=read('private/app-server/invocation.json'),stopped=read('private/app-server/stopped.json');
  const previousProcess=JSON.parse(readFileSync(safePath(previousRoot,'private/app-server/process.json')));
  assert.deepEqual(process.args,previousProcess.args);assert.equal(process.executableHash,previousProcess.executableHash);
  assert.equal(process.adapterSourceHash,collector.manifest.sourceHashes['scripts/trix-scenario-collection/app-server-bridge.mjs']);assert.equal(process.journalSourceHash,collector.manifest.sourceHashes['scripts/trix-scenario-collection/journal.mjs']);
  assert.equal(resolve(process.executable),resolve(inventory.audit.hostExecutable));assert.equal(process.executableHash,sha(readFileSync(process.executable)));
  assert.equal(process.cwd.replaceAll('\\','/').toLowerCase(),'c:/windows/temp');
  assert.deepEqual(stopped.exit,{code:0,signal:null});assert.equal(stopped.error,null);assert.equal(stopped.stoppedVerified,true);
  assert.equal(invocation.schemaVersion,'trix-app-server-invocation-1.0.0');assert.equal(invocation.jobId,job.jobId);assert.equal(invocation.model,'gpt-6-luna');assert.equal(invocation.effort,'max');assert.equal(invocation.promptHash,job.promptHash);
  assert.equal(invocation.baseContextDigest,audit.previousDigest);assert.equal(invocation.actualBaseContextDigest,audit.actualDigest);assert.equal(invocation.contextExportError,contextFailureReason);
  assert.equal(invocation.admitted,false);assert.equal(invocation.syntheticOnly,false);assert.equal(invocation.stoppedVerified,true);assert.equal(invocation.archived,true);assert.equal(invocation.toolCallCount,0);assert.deepEqual(invocation.unclassifiedNotificationMethods,[]);
  assert.deepEqual(invocation.hostJournalRef,{path:'private/app-server/host-session.jsonl',sha256:audit.evidenceHashes['private/app-server/host-session.jsonl']});
  const auditHash=sha(jsonBytes(audit)),viewPath=`private/context-replay/${job.jobId}/${auditHash}`,viewRoot=safePath(collector.root,viewPath);
  // Exact copies of original evidence; the only substituted input to the
  // unchanged inspector is this separately approved single-digest inventory.
  for(const name of [...contextEvidenceFiles,job.promptRef.path])if(name!=='host-base-context-admission.json')writeImmutable(safePath(viewRoot,name),readFileSync(safePath(root,name)));
  writeImmutable(safePath(viewRoot,'host-base-context-admission.json'),jsonBytes(inventory));
  const evidence=inspectAppServerEvidence(viewRoot,job);assert.equal(evidence.available,true,evidence.reason);
  assert.equal(evidence.baseContext.digest,audit.actualDigest);assert.equal(evidence.events.agentId,invocation.threadId);assert.equal(evidence.events.responseHash,invocation.responseHash);
  const receipt=receiptFromEvidence(job,evidence),bytes=evidence.responseBytes;
  const ownCommit=one(state.commits,r=>r.decisionId===reviewJob.subjectId,'reviewed commit');
  assert.deepEqual(getBlob(collector.root,reviewJob.commitRef),ownCommit);assert.equal(reviewJob.packetHash,reviewJob.packetRef.sha256);
  for(const commit of state.commits.filter(c=>c.episodeId===ownCommit.episodeId)){
    const saved=getBlob(collector.root,commit.savedRef),player=getBlob(collector.root,saved.receiptRef);
    assert.notEqual(receipt.hostAgentId,player.hostAgentId);if(saved.job.parentThreadId)assert.notEqual(receipt.hostAgentId,saved.job.parentThreadId);
  }
  // No rewriting even a copied identifier: this context-only recovery requires
  // the exact saved proposal to pass the original content validator unchanged.
  validateDecisionProposal(JSON.parse(bytes.toString('utf8')),reviewJob,getBlob(collector.root,reviewJob.packetRef),{verifyProof:()=>({verified:false,reason:'Context evidence preflight only; import performs ordinary proof validation'})});
  writeImmutable(safePath(viewRoot,'response.txt'),bytes);writeImmutable(safePath(viewRoot,'receipt.json'),jsonBytes(receipt));
  return {proof:{schemaVersion:'trix-context-response-proof-1.0.0',jobId:job.jobId,claimHash:claim.hash,auditHash,previousDigest:audit.previousDigest,actualDigest:audit.actualDigest,responseHash:sha(bytes),threadId:receipt.hostAgentId,promptHash:job.promptHash,evidenceHashes:audit.evidenceHashes,viewPath},evidence,receipt,bytes,reviewJob};
}
