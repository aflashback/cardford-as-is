import assert from 'node:assert/strict';
import test from 'node:test';
import type {TestContext} from 'node:test';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {durableAttemptPort,type SqlPool} from '../evaluation/jev-smoke.ts';
import {JEV_MODEL} from '../providers/openrouter.ts';
async function isolatedPools(t:TestContext):Promise<[SqlPool,SqlPool]|null>{
 if(!process.env.TEST_DATABASE_URL){t.skip('TEST_DATABASE_URL is not provisioned.');return null;}
 const helperUrl=process.env.PROVIDER_LEDGER_TEST_ROOT?pathToFileURL(join(process.env.PROVIDER_LEDGER_TEST_ROOT,'web/server/billing/database-test.ts')).href:new URL('../billing/database-test.ts',import.meta.url).href;
 const helper=await import(helperUrl) as {testDatabase:(context:TestContext)=>Promise<SqlPool|null>};
 const first=await helper.testDatabase(t);if(!first)return null;
 const schema=(await first.query('SELECT current_schema() AS schema')).rows[0]?.schema;
 assert.equal(typeof schema,'string');assert.match(String(schema),/^billing_test_[a-f0-9]{32}$/,'both pools must remain inside the disposable test schema');
 const Pool=first.constructor as new(options:{connectionString:string;options:string;max:number})=>SqlPool;
 const second=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:8});t.after(()=>second.end());return [first,second];
}
test('PROVIDER LEDGER: 50 concurrent reservations through two real pools admit exactly one cap-one attempt',async t=>{
 const pools=await isolatedPools(t);if(!pools)return;const [first,second]=pools;const experiment={id:`concurrent-${randomUUID()}`,maxRequests:1,maxCostUsd:0.01};const ports=pools.map(durableAttemptPort);
 const results=await Promise.all(Array.from({length:50},(_,index)=>ports[index%2].reserve(experiment,JEV_MODEL)));
 const admitted=results.filter((id):id is string=>id!==null);assert.equal(admitted.length,1);assert.equal(new Set(admitted).size,1);
 const saved=await first.query('SELECT id,requested_model,outcome FROM provider_attempts WHERE experiment_id=$1',[experiment.id]);assert.equal(saved.rows.length,1);assert.equal(saved.rows[0].id,admitted[0]);assert.equal(saved.rows[0].requested_model,JEV_MODEL);assert.equal(JSON.parse(String(saved.rows[0].outcome)).status,'reserved');
 assert.equal(await durableAttemptPort(second).reserve(experiment,JEV_MODEL),null,'recreated adapter cannot reset the durable cap');
 await ports[0].finish(admitted[0],{status:'selected',observedModel:JEV_MODEL,costUsd:0.00001});assert.equal(await durableAttemptPort(second).reserve(experiment,JEV_MODEL),null,'finishing does not restore the request allowance');
});
test('PROVIDER LEDGER: pending, unknown cost and known cost budget remain fenced across pool restart',async t=>{
 const pools=await isolatedPools(t);if(!pools)return;const [first,second]=pools;const initial=durableAttemptPort(first);const experiment={id:`restart-${randomUUID()}`,maxRequests:3,maxCostUsd:0.01};
 const firstId=await initial.reserve(experiment,JEV_MODEL);assert.ok(firstId);assert.equal(await durableAttemptPort(second).reserve(experiment,JEV_MODEL),null,'a pending attempt may already be billable');
 await initial.finish(firstId,{status:'http-429',observedModel:null,costUsd:0});const recreated=durableAttemptPort(second);const nextId=await recreated.reserve(experiment,JEV_MODEL);assert.ok(nextId);
 await recreated.finish(nextId,{status:'deadline',observedModel:null,costUsd:null});assert.equal(await durableAttemptPort(first).reserve(experiment,JEV_MODEL),null,'unknown cost remains unknown across adapters and pools');
 const separate={id:`known-cost-${randomUUID()}`,maxRequests:3,maxCostUsd:0.01};const costId=await initial.reserve(separate,JEV_MODEL);assert.ok(costId);await initial.finish(costId,{status:'selected',observedModel:JEV_MODEL,costUsd:0.01});assert.equal(await durableAttemptPort(second).reserve(separate,JEV_MODEL),null,'recorded cumulative cost blocks admission');
});
test('PROVIDER LEDGER: reservation releases its DB transaction; missing completion row fails closed',async t=>{
 const pools=await isolatedPools(t);if(!pools)return;const [first,second]=pools;const experiment={id:`transaction-${randomUUID()}`,maxRequests:3,maxCostUsd:0.01};const port=durableAttemptPort(first);const id=await port.reserve(experiment,JEV_MODEL);assert.ok(id);
 const client=await second.connect();try{
  await client.query('BEGIN');const lock=await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired',[experiment.id]);assert.equal(lock.rows[0].acquired,true,'admission lock is released before any provider HTTP could start');await client.query('ROLLBACK');
 }finally{client.release();}
 await assert.rejects(()=>port.finish(randomUUID(),{status:'selected',observedModel:JEV_MODEL,costUsd:0}),/not persisted/);
 const rows=await first.query('SELECT outcome FROM provider_attempts WHERE id=$1',[id]);assert.equal(JSON.parse(String(rows.rows[0].outcome)).status,'reserved','wrong-row finish cannot clear a pending attempt');
});
