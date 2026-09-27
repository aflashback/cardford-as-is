import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createGame,fullDeck,actionId} from '../game/index.ts';
import {observe} from '../observations/index.ts';
import {JEV_MODEL,selectWithJev,type AttemptPort,type AttemptRecord} from '../providers/openrouter.ts';
import {loadOpenRouterKey} from '../providers/secrets.ts';
export interface SqlClient{query(text:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[]}>;release():void;}
export interface SqlPool{connect():Promise<SqlClient>;query(text:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[]}>;end():Promise<void>;}
/** A pending/ambiguous attempt blocks further dispatch, including after process restart. */
export function durableAttemptPort(pool:SqlPool):AttemptPort{
 return {
  async reserve(experiment,requestedModel){
   if(requestedModel!==JEV_MODEL||!Number.isInteger(experiment.maxRequests)||experiment.maxRequests<1||experiment.maxRequests>3||!Number.isFinite(experiment.maxCostUsd)||experiment.maxCostUsd<=0)throw new Error('Invalid durable experiment cap.');
   const client=await pool.connect();try{
    await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[experiment.id]);
    const previous=await client.query('SELECT outcome FROM provider_attempts WHERE experiment_id=$1',[experiment.id]);
    let cost=0,blocked=previous.rows.length>=experiment.maxRequests;
    for(const row of previous.rows){let record:unknown;try{record=JSON.parse(String(row.outcome));}catch{record=null;}
     if(typeof record!=='object'||record===null||!('costUsd' in record)||typeof record.costUsd!=='number'||!Number.isFinite(record.costUsd)||record.costUsd<0)blocked=true;else cost+=record.costUsd;
    }
    if(blocked||cost>=experiment.maxCostUsd){await client.query('COMMIT');return null;}
    const id=randomUUID();await client.query('INSERT INTO provider_attempts(id,experiment_id,requested_model,outcome) VALUES($1,$2,$3,$4)',[id,experiment.id,requestedModel,JSON.stringify({status:'reserved',observedModel:null,costUsd:null})]);await client.query('COMMIT');return id;
   }catch{await client.query('ROLLBACK');throw new Error('Provider attempt admission storage is unavailable.');}finally{client.release();}
  },
  async finish(id,record){const saved=await pool.query('UPDATE provider_attempts SET observed_model=$2,outcome=$3 WHERE id=$1 RETURNING id',[id,record.observedModel,JSON.stringify({status:record.status,observedModel:record.observedModel,costUsd:record.costUsd} satisfies AttemptRecord)]);if(saved.rows.length!==1)throw new Error('Attempt outcome was not persisted.');},
 };
}
type SmokeReport={status:string;requestedModel:string;observedModel:string|null;costUsd:number|null;costUnknown:boolean;promotion:false};
export async function runJevSmoke(live:boolean):Promise<SmokeReport>{
 if(!live)return {status:'not-run-explicit-live-flag-required',requestedModel:JEV_MODEL,observedModel:null,costUsd:null,costUnknown:true,promotion:false};
 const manifest=JSON.parse(await readFile(new URL('./jev-smoke-manifest.json',import.meta.url),'utf8')) as Record<string,unknown>;
 if(manifest.maxRequests!==1||manifest.requestedModel!==JEV_MODEL||manifest.mode!=='shadow'||manifest.promotion!==false||manifest.stopOnUnknownCost!==true||manifest.deadlineMs!==8000||typeof manifest.id!=='string'||typeof manifest.maxCostUsd!=='number'||manifest.maxCostUsd<=0||manifest.maxCostUsd>0.01)throw new Error('Invalid frozen Jev smoke manifest.');
 // Dynamic imports make no-live execution independent of DB initialization or credential configuration.
 const configUrl=new URL('../config.ts',import.meta.url).href;const config=await import(configUrl) as {loadLocalEnvironment:()=>void};config.loadLocalEnvironment();
 if(process.env.JEV_MODE!=='shadow'||process.env.JEV_MAX_REQUESTS!=='1')return {status:'not-run-explicit-shadow-and-cap1-required',requestedModel:JEV_MODEL,observedModel:null,costUsd:null,costUnknown:true,promotion:false};
 if(!process.env.DATABASE_URL)throw new Error('Smoke database configuration is unavailable.');
 const databaseUrl=new URL('../records/database.ts',import.meta.url).href;const database=await import(databaseUrl) as {createPool:(connectionString:string)=>SqlPool};const pool=database.createPool(process.env.DATABASE_URL);
 try{
  const observation=observe(createGame({id:'synthetic-smoke-not-sent',mode:'spades-solo',dealer:3},fullDeck()),0);
  const result=await selectWithJev({observation,candidateIds:observation.legalActions.map(actionId),mode:'shadow',experiment:{id:manifest.id,maxRequests:1,maxCostUsd:manifest.maxCostUsd},deadlineAt:Date.now()+8000},{loadKey:()=>loadOpenRouterKey({live:true,mode:'shadow',maxRequests:1}),attempts:durableAttemptPort(pool)});
  const costUsd=result.status==='selected'||result.status==='unavailable'?result.costUsd:null;
  return {status:result.status==='unavailable'?`unavailable-${result.reason}`:result.status,requestedModel:JEV_MODEL,observedModel:result.observedModel,costUsd,costUnknown:costUsd===null,promotion:false};
 }finally{await pool.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const live=process.argv.slice(2).includes('--live');
 try{const report=await runJevSmoke(live);if(live)await writeFile(new URL('./evidence/jev-smoke.json',import.meta.url),JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify(report)+'\n');}
 catch{process.stdout.write(JSON.stringify({status:'unavailable-local-configuration-or-storage',requestedModel:JEV_MODEL,observedModel:null,costUsd:null,costUnknown:true,promotion:false})+'\n');process.exitCode=1;}
}
