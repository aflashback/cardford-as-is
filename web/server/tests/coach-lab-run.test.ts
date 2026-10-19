import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyExecutionPins,parseRunArgs,labWatchdogMilliseconds } from '../evaluation/multi-game/run.ts';
import { createHash } from 'node:crypto';
import { envelope } from './coach-lab-contracts.test.ts';
test('coordinator checks source bytes and binary before admitting native work',()=>{
 const dir=mkdtempSync(join(tmpdir(),'coach-pins-'));try{
  writeFileSync(join(dir,'fixture.go'),'source');writeFileSync(join(dir,'worker.exe'),'worker');const e=envelope();const h=(s:string)=>createHash('sha256').update(s).digest('hex');e.base.sourceHashes={'fixture.go':h('source')};e.lab.sourceIdentity={sourceDigest:h(JSON.stringify([['fixture.go',h('source')]])),binaryDigest:h('worker')};
  assert.doesNotThrow(()=>verifyExecutionPins(e,join(dir,'worker.exe'),dir));writeFileSync(join(dir,'fixture.go'),'changed');assert.throws(()=>verifyExecutionPins(e,join(dir,'worker.exe'),dir),/source/i);
  assert.throws(()=>parseRunArgs(['--manifest','x','--out','y','--unsafe']),/unknown/i);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('watchdog reserves checkpoint time within the twenty minute invocation ceiling',()=>{assert.equal(labWatchdogMilliseconds(1140000),1200000);assert.equal(labWatchdogMilliseconds(60000),120000);assert.throws(()=>labWatchdogMilliseconds(1200000),/ceiling|leave/i);});
test('frozen source root remains verifiable when the current source has changed',()=>{const dir=mkdtempSync(join(tmpdir(),'coach-frozen-pins-'));try{const current=join(dir,'current'),frozen=join(dir,'frozen');mkdirSync(current);mkdirSync(frozen);writeFileSync(join(current,'fixture.go'),'changed');writeFileSync(join(frozen,'fixture.go'),'source');const binary=join(dir,'worker.exe');writeFileSync(binary,'worker');const h=(s:string)=>createHash('sha256').update(s).digest('hex');const e=envelope();e.base.sourceHashes={'fixture.go':h('source')};e.lab.sourceIdentity={sourceDigest:h(JSON.stringify([['fixture.go',h('source')]])),binaryDigest:h('worker')};assert.throws(()=>verifyExecutionPins(e,binary,current),/Source pin changed/);assert.doesNotThrow(()=>verifyExecutionPins(e,binary,frozen));writeFileSync(join(frozen,'fixture.go'),'modified frozen source');assert.throws(()=>verifyExecutionPins(e,binary,frozen),/Source pin changed/);}finally{rmSync(dir,{recursive:true,force:true});}});
