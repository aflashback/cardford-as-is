import test from 'node:test';import assert from 'node:assert/strict';
import { inspectHostInvocation, verifyHostReceipt } from '../../scripts/trix-scenario-collection/bridge.mjs';
const job={jobId:'j',dispatchToken:'d',promptHash:'a'.repeat(64),deadlineAt:'2030-01-01T00:00:00Z'};
const receipt={schemaVersion:'trix-host-receipt-1.0.0',jobId:'j',dispatchToken:'d',promptHash:job.promptHash,responseHash:'b'.repeat(64),hostAgentId:'child',requestedModel:'gpt-6-luna',requestedEffort:'max',reportedModelId:null,startedAt:'2026-10-11T00:00:00Z',finishedAt:'2026-10-11T00:00:01Z',dispatchStatus:'completed',usage:null};
const events={verifiedByAdapter:true,agentId:'child',jobId:'j',promptHash:job.promptHash,responseHash:receipt.responseHash,model:'gpt-6-luna',effort:'max',forkTurns:'none',activityComplete:true,toolCallCount:0,inheritedConversation:false};
const base={inspected:true,episodeSpecificFacts:false,otherSeatEvidence:false,hiddenFixtureMemory:false,digest:'c'.repeat(64)};
test('verified host facts admit requested settings with unknown backend revision disclosed',()=>{const a=verifyHostReceipt(job,receipt,events,base);assert.equal(a.admitted,true);assert.equal(a.limitations.length,1);});
test('tool call, inherited context, fallback effort and incomplete logs are rejected',()=>{
  for(const changed of [{toolCallCount:1},{inheritedConversation:true},{effort:'high'},{model:'gpt-6-sol'},{activityComplete:false},{verifiedByAdapter:false}])assert.equal(verifyHostReceipt(job,receipt,{...events,...changed},base).admitted,false);
  for(const changed of [{inspected:false},{otherSeatEvidence:true},{hiddenFixtureMemory:true},{episodeSpecificFacts:true}])assert.equal(verifyHostReceipt(job,receipt,events,{...base,...changed}).admitted,false);
});
test('a self-authored receipt without adapter evidence never admits a player',()=>{assert.equal(verifyHostReceipt(job,receipt,null,base).admitted,false);assert.equal(inspectHostInvocation().available,false);});
