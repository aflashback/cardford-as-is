import assert from 'node:assert/strict';
import { openSync,closeSync,writeSync,fsyncSync,readFileSync,existsSync,mkdirSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { digest,type JsonObject } from './contracts.ts';
type State='queued'|'reserved'|'dispatched'|'succeeded'|'rejected'|'failed'|'unknown-outcome';
type Job={id:string;inputHash:string;modelPin:string;state:State;reservationUsd:number;costUsd:number|null;result:unknown};
type Event={sequence:number;previous:string;job:Job;hash:string};
export class ReviewLedger {
 private path:string;private jobs=new Map<string,Job>();private tail='0'.repeat(64);private sequence=0;
 constructor(dir:string,authorization:{mode:'fixture';authorizedUsd:0}){assert.equal(authorization.mode,'fixture','Live provider dispatch disabled');assert.equal(authorization.authorizedUsd,0,'Only zero-cost fixture jobs implemented');mkdirSync(dir,{recursive:true});this.path=join(dir,'jobs.jsonl');
  if(existsSync(this.path)){const bytes=readFileSync(this.path,'utf8');assert.ok(!bytes||bytes.endsWith('\n'),'Truncated job journal');for(const line of bytes.trim().split('\n').filter(Boolean)){const event=JSON.parse(line) as Event;assert.equal(event.sequence,this.sequence+1,'Job journal sequence');assert.equal(event.previous,this.tail,'Job journal chain');assert.equal(event.hash,digest({sequence:event.sequence,previous:event.previous,job:event.job}),'Job journal hash');this.jobs.set(event.job.id,event.job);this.sequence=event.sequence;this.tail=event.hash;}}
  for(const job of [...this.jobs.values()])if(job.state==='dispatched')this.save({...job,state:'unknown-outcome'});
 }
 private save(job:Job){const lock=this.path+'.lock';const guard=openSync(lock,'wx');try{const bytes=existsSync(this.path)?readFileSync(this.path,'utf8'):'';const last=bytes.trim().split('\n').filter(Boolean).at(-1);assert.equal(last?(JSON.parse(last) as Event).hash:'0'.repeat(64),this.tail,'Stale ledger writer; reopen before mutation');const core={sequence:this.sequence+1,previous:this.tail,job};const event={...core,hash:digest(core)};const fd=openSync(this.path,'a');try{writeSync(fd,JSON.stringify(event)+'\n');fsyncSync(fd);}finally{closeSync(fd);}this.jobs.set(job.id,structuredClone(job));this.sequence=event.sequence;this.tail=event.hash;}finally{closeSync(guard);unlinkSync(lock);}}
 get(id:string):Job{const job=this.jobs.get(id);assert.ok(job,'Unknown review job');return structuredClone(job);}
 queue(input:unknown,modelPin:string):Job{const inputHash=digest(input);const id='job-'+digest({inputHash,modelPin});const old=this.jobs.get(id);if(old)return this.get(id);const job:Job={id,inputHash,modelPin,state:'queued',reservationUsd:0,costUsd:null,result:null};this.save(job);return this.get(id);}
 reserve(id:string,worstUsd:number){assert.equal(worstUsd,0,'Paid jobs disabled');const j=this.get(id);assert.equal(j.state,'queued','Job state cannot reserve');this.save({...j,state:'reserved',reservationUsd:worstUsd});}
 dispatch(id:string){const j=this.get(id);assert.equal(j.state,'reserved','Job state cannot dispatch; unknown outcomes require reconciliation');this.save({...j,state:'dispatched'});}
 settle(id:string,result:unknown,accepted:boolean,costUsd=0){const j=this.get(id);assert.equal(j.state,'dispatched','Job state cannot settle');assert.equal(costUsd,0,'Fixture usage cannot charge');this.save({...j,state:accepted?'succeeded':'rejected',result,costUsd,reservationUsd:0});}
 summary(){const all=[...this.jobs.values()];return {total:all.length,unknown:all.filter(j=>j.state==='unknown-outcome').length,reservedUsd:all.reduce((n,j)=>n+j.reservationUsd,0),spentUsd:all.reduce((n,j)=>n+(j.costUsd??0),0),states:all.reduce<Record<string,number>>((counts,j)=>({...counts,[j.state]:(counts[j.state]??0)+1}),{})};}
}
