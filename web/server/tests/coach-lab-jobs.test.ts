import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReviewLedger } from '../evaluation/multi-game/lab/jobs.ts';
test('durable fixture jobs reuse exact input and retain unknown dispatched reservations across restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'coach-jobs-'));
 try {const ledger=new ReviewLedger(dir,{mode:'fixture',authorizedUsd:0});const input={stage:'A',caseId:'x'};
  const job=ledger.queue(input,'fixture-v1');assert.equal(ledger.queue(input,'fixture-v1').id,job.id);ledger.reserve(job.id,0);ledger.dispatch(job.id);
  const reopened=new ReviewLedger(dir,{mode:'fixture',authorizedUsd:0});assert.equal(reopened.get(job.id).state,'unknown-outcome');assert.throws(()=>reopened.dispatch(job.id),/unknown|state/i);
  assert.equal(reopened.summary().unknown,1);assert.ok(readFileSync(join(dir,'jobs.jsonl'),'utf8').includes('dispatched'));
  assert.throws(()=>new ReviewLedger(dir,{mode:'live',authorizedUsd:10} as never),/disabled/i);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('ledger rejects corrupted journal instead of granting a new budget',()=>{
 const dir=mkdtempSync(join(tmpdir(),'coach-jobs-'));try{writeFileSync(join(dir,'jobs.jsonl'),'broken\n');assert.throws(()=>new ReviewLedger(dir,{mode:'fixture',authorizedUsd:0}),/journal|JSON/i);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('stale concurrent writer cannot append a second sequence to the ledger',()=>{
 const dir=mkdtempSync(join(tmpdir(),'coach-concurrent-'));try{const a=new ReviewLedger(dir,{mode:'fixture',authorizedUsd:0});const b=new ReviewLedger(dir,{mode:'fixture',authorizedUsd:0});a.queue({a:1},'fixture');assert.throws(()=>b.queue({b:1},'fixture'),/stale|writer/i);}finally{rmSync(dir,{recursive:true,force:true});}
});
