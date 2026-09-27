import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { TestContext } from 'node:test';
import type { BillingProfile } from './store.ts';
export async function testDatabase(t:TestContext):Promise<pg.Pool|null> {
  const url=process.env.TEST_DATABASE_URL;
  if(!url){t.skip('TEST_DATABASE_URL is not provisioned.');return null;}
  const parsed=new URL(url);
  if(!parsed.pathname.endsWith('_test')||url===process.env.DATABASE_URL)throw new Error('Refusing non-test database.');
  const admin=new pg.Pool({connectionString:url});const schema=`billing_test_${randomUUID().replaceAll('-','')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`,max:8});
  t.after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
  const baseline=process.env.BILLING_BASELINE_ROOT ? new URL('web/server/records/migrations/001-local-platform.sql',new URL('file:///'+process.env.BILLING_BASELINE_ROOT.replaceAll('\\','/')+'/')) : new URL('../records/migrations/001-local-platform.sql',import.meta.url);
  await pool.query(await readFile(baseline,'utf8'));
  await pool.query(await readFile(new URL('../records/migrations/002-billing-family.sql',import.meta.url),'utf8'));
  return pool;
}
export async function player(pool:pg.Pool,patch:Partial<BillingProfile>={}):Promise<string> {
  const id=randomUUID();const profile:BillingProfile={displayName:'Local fixture',plan:'unlimited',currentPeriodEnd:new Date(Date.now()+30*86400000).toISOString(),cancelAtPeriodEnd:false,billingMode:'fixture',...patch};
  await pool.query('INSERT INTO players(id,profile) VALUES($1,$2)',[id,profile]);return id;
}
