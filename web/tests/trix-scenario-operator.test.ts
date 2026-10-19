import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Collector, initializeRun, nativeCall, seededDeck, physicalDealFamily, makeSchedule } from '../../scripts/trix-scenario-collection/runner.mjs';
import { appendEvent, getBlob, jsonBytes, readJournal, safePath, sha, withRunLock, withCorpusLock } from '../../scripts/trix-scenario-collection/journal.mjs';
import { verifyHostReceipt } from '../../scripts/trix-scenario-collection/bridge.mjs';
import { displayCard } from '../../scripts/trix-scenario-collection/contracts.mjs';

const repo=resolve(import.meta.dirname,'../..');
const binary=resolve(repo,'.local/evaluation/trix-scenarios/native/trixcollection.exe');
const plan=JSON.parse(readFileSync(resolve(repo,'planning/implementation/coach-lab/trix-scenario-collection/campaign.plan.json'),'utf8'));
function fixture(customPlan=plan){
  const home=mkdtempSync(resolve(tmpdir(),'trix-collector-'));
  const {root}=initializeRun({runId:'fixture',home,plan:customPlan,binaryPath:binary,archive:false,fixture:true,seed:'operator-tests'});
  const inspector=(job: Record<string,unknown>,receipt: Record<string,unknown>)=>({available:true,events:{verifiedByAdapter:true,agentId:receipt.hostAgentId,jobId:job.jobId,promptHash:job.promptHash,responseHash:receipt.responseHash,model:'gpt-6-luna',effort:'max',forkTurns:'none',activityComplete:true,toolCallCount:0,inheritedConversation:false,reportedModelId:null},baseContext:{inspected:true,episodeSpecificFacts:false,otherSeatEvidence:false,hiddenFixtureMemory:false,digest:'a'.repeat(64)}});
  return new Collector(root,{native:(cmd: string,input: unknown)=>nativeCall(binary,cmd,input),inspector});
}
function acceptFirst(c: Collector){
  const {job}=c.next();const claim=c.claim(job.jobId,'fixture-parent');const n=getBlob(c.root,job.nativePacketRef);const action=n.candidates[0].public;
  const response=action.kind==='play-card'?{card:displayCard(action.card),reasoning:'Synthetic protocol fixture, not a Luna move.',confidence:0}:{cards:(action.cards??[]).map((x:string)=>displayCard(x)),reasoning:'Synthetic declaration fixture.',confidence:0};
  const bytes=jsonBytes(response),receipt={schemaVersion:'trix-host-receipt-1.0.0',jobId:job.jobId,dispatchToken:claim.dispatchToken,promptHash:job.promptHash,responseHash:sha(bytes),hostAgentId:'fixture-agent',requestedModel:'gpt-6-luna',requestedEffort:'max',reportedModelId:null,startedAt:claim.claimedAt,finishedAt:new Date().toISOString(),dispatchStatus:'completed',usage:null};
  return {job,bytes,receipt,commit:c.accept(job.jobId,bytes,receipt)};
}
test('complete native request journals all decisions, resumes and replays exactly',()=>{
  const capped=structuredClone(plan);capped.workCaps.maxPlayerAttemptsCampaign=52;
  const c=fixture(capped);for(let i=0;i<52;i++)acceptFirst(c);
  assert.equal(c.next().stop,'request-completed');assert.equal(c.status().counters.acceptedPlays,52);assert.equal(c.replay()[0].status,'passed');
  assert.equal(c.state().outcomes.length,1);assert.equal(c.state().commits.length,52);
  assert.equal(c.manifest.mode,'fixture');
  assert.equal(c.next().stop,'attempt-cap');
});
test('response import is idempotent; wrong seat/revision job cannot replace a move',()=>{
  const c=fixture(),accepted=acceptFirst(c);const count=c.state().rows.length;
  assert.deepEqual(c.accept(accepted.job.jobId,accepted.bytes,accepted.receipt),accepted.commit);assert.equal(c.state().rows.length,count);
  assert.throws(()=>c.accept(accepted.job.jobId,Buffer.from('{}'),accepted.receipt),/Conflicting/);
  assert.throws(()=>c.claim(accepted.job.jobId,'fixture'),/Expected/);
});
test('claimed calls without a response consume attempt budget and block redispatch',()=>{
  const c=fixture(),{job}=c.next();c.claim(job.jobId,'fixture-parent');assert.equal(c.status().counters.attempts,1);
  assert.throws(()=>c.claim(job.jobId,'fixture-parent'),/outstanding/);assert.throws(()=>c.resume(),/Reconcile/);
  assert.throws(()=>c.settle(job.jobId,'timeout'),/reconciled/);assert.equal(c.status().counters.attempts,1);
});
test('commit intent recovered after simulated interruption applies once',()=>{
  const c=fixture(),accepted=acceptFirst(c),rows=readJournal(c.root);const commitIndex=rows.findIndex(e=>e.kind==='move-committed');
  writeFileSync(safePath(c.root,'private/journal.jsonl'),rows.slice(0,commitIndex).map(r=>JSON.stringify(r)+'\n').join(''));
  assert.equal(c.status().counters.acceptedPlays,0);c.next();assert.equal(c.status().counters.acceptedPlays,1);
  assert.equal(c.state().commits[0].nativeAfterDigest,accepted.commit.nativeAfterDigest);c.next();assert.equal(c.status().counters.acceptedPlays,1);
});

test('an admitted response survives a crash before intent and cannot be replaced',()=>{
  const c=fixture(),accepted=acceptFirst(c),rows=readJournal(c.root),intentIndex=rows.findIndex(e=>e.kind==='commit-intent');
  writeFileSync(safePath(c.root,'private/journal.jsonl'),rows.slice(0,intentIndex).map(r=>JSON.stringify(r)+'\n').join(''));
  assert.equal(c.status().counters.acceptedPlays,0);
  assert.throws(()=>c.accept(accepted.job.jobId,Buffer.from('{}'),accepted.receipt),/Conflicting/);
  assert.equal(c.status().counters.acceptedPlays,1);assert.equal(c.state().commits[0].nativeAfterDigest,accepted.commit.nativeAfterDigest);
});
test('hash corruption, torn journal and path escapes fail closed',()=>{
  const c=fixture();assert.throws(()=>safePath(c.root,'../outside'),/Unsafe/);assert.throws(()=>safePath(c.root,'C:/outside'),/Unsafe/);
  const file=safePath(c.root,'private/journal.jsonl'),bytes=readFileSync(file,'utf8');writeFileSync(file,bytes.slice(0,-1));assert.throws(()=>c.status(),/Torn/);
  writeFileSync(file,bytes.replace('initialized','compromised'));assert.throws(()=>c.status(),/hash/);
});
test('run lock rejects a second active owner',()=>{const c=fixture();withRunLock(c.root,()=>assert.throws(()=>withRunLock(c.root,()=>null),/already owned/));});
test('seeded shuffled decks are stable permutations',()=>{const a=seededDeck('a');assert.equal(new Set(a).size,52);assert.deepEqual(a,seededDeck('a'));assert.notDeepEqual(a,seededDeck('b'));});

test('seat rotations share a physical family but distinct deals do not',()=>{
  const a=seededDeck('a');assert.equal(physicalDealFamily(a),physicalDealFamily([...a.slice(13),...a.slice(0,13)]));assert.notEqual(physicalDealFamily(a),physicalDealFamily(seededDeck('b')));
});

test('every contract samples all opening seats instead of coupling seat to request',()=>{
  const schedule=makeSchedule(plan,'seat-coverage');
  for(const phase of plan.phases)for(const request of phase.requests){
    const owners=new Set(schedule.filter(e=>e.variant===phase.variant&&e.request===request).map(e=>Math.floor(e.deck.indexOf('H7')/13)));
    assert.equal(owners.size,4,`${phase.variant}:${request}`);
  }
});

test('malformed response is retained and retried with schema-only repair; second failure stops',()=>{
  const c=fixture();
  for(let i=0;i<2;i++){
    const {job}=c.next();assert.equal(job.attempt,i+1);const claim=c.claim(job.jobId,'fixture-parent'),bytes=Buffer.from('{}');
    const receipt={schemaVersion:'trix-host-receipt-1.0.0',jobId:job.jobId,dispatchToken:claim.dispatchToken,promptHash:job.promptHash,responseHash:sha(bytes),hostAgentId:'fixture-agent',requestedModel:'gpt-6-luna',requestedEffort:'max',reportedModelId:null,startedAt:claim.claimedAt,finishedAt:new Date().toISOString(),dispatchStatus:'completed',usage:null};
    if(i)assert.match(getBlob(c.root,job.promptRef,false).toString(),/previous response could not/);
    assert.throws(()=>c.accept(job.jobId,bytes,receipt),/schema/);
  }
  assert.equal(c.status().counters.attempts,2);assert.equal(c.status().counters.acceptedPlays,0);assert.equal(c.next().stop,'paused');
  assert.equal(c.state().rows.filter(r=>r.kind==='attempt-output').length,2);
  const failed=c.state().episode.episodeId;c.abandon('Two malformed responses; exclude incomplete episode');c.resume();
  const next=c.next();assert.notEqual(next.job.episodeId,failed);assert.equal(c.state().outcomes.length,0);assert.equal(c.state().attempts,2);
});

test('an uncertain invocation cannot be hidden by abandoning its episode',()=>{
  const c=fixture(),{job}=c.next();c.claim(job.jobId,'fixture-parent');
  assert.throws(()=>c.abandon('skip uncertain call'),/Reconcile/);assert.equal(c.state().attempts,1);assert.equal(c.state().episodes.length,1);
});

test('active-segment cap prevents another dispatch and retains its checkpoint',()=>{
  const c=fixture(),{job}=c.next();appendEvent(c.root,'segment-started',{});
  const rows=readJournal(c.root);let previous='0'.repeat(64);
  for(const row of rows){if(row.kind==='segment-started')row.at=new Date(Date.now()-plan.workCaps.maxActiveSegmentWallMs-1000).toISOString();const{hash,...body}=row;body.previousHash=previous;row.previousHash=previous;row.hash=sha(jsonBytes(body));previous=row.hash;}
  writeFileSync(safePath(c.root,'private/journal.jsonl'),rows.map(r=>JSON.stringify(r)+'\n').join(''));
  assert.throws(()=>c.claim(job.jobId,'fixture-parent'),/wall cap/);assert.equal(c.next().stop,'active-segment-wall-cap');assert.equal(c.status().counters.attempts,0);assert.equal(c.state().pending.jobId,job.jobId);
});

test('corpus lock rejects competing export even across run roots',()=>{
  const home=mkdtempSync(resolve(tmpdir(),'trix-corpus-lock-'));
  withCorpusLock(home,'corpus',()=>assert.throws(()=>withCorpusLock(home,'corpus',()=>null),/already owned/));
});
