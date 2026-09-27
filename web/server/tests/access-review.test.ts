import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test,{type TestContext} from 'node:test';
import type {Pool} from 'pg';
import type {SessionView,TrialRequest} from '../../shared/contracts.ts';
import {testDatabase,player} from '../billing/database-test.ts';
import {newIdentity,hashToken} from '../records/repository.ts';
import {GameService} from '../http/game-service.ts';
import {TrialService} from '../http/trial-service.ts';
import {createApp} from '../http/app.ts';
import {readConfig} from '../config.ts';
import {mutateFamily} from '../access/family.ts';
const envelope=(view:SessionView)=>({commandId:randomUUID(),gameId:view.game.id,expectedRevision:view.revision,controlLeaseToken:view.controlLeaseToken});
async function account(pool:Pool) {
  const token=await newIdentity(pool),context={token,tab:randomUUID()},service=new GameService(pool);
  const id=(await pool.query<{player_id:string}>('SELECT player_id FROM sessions WHERE token_hash=$1',[hashToken(token)])).rows[0]!.player_id;
  const first=await service.session(context),view=await service.newSession(context,{commandId:randomUUID(),mode:'hearts',expectedActiveGameId:first.game.id});
  return {id,context,service,view};
}
async function expired(pool:Pool,id:string){await pool.query("UPDATE players SET profile=jsonb_set(profile,'{currentPeriodEnd}','\"1970-01-01T00:00:00.000Z\"') WHERE id=$1",[id]);}

test('limited family coverage never auto-spends a hand from an expired unlimited individual profile',async t=>{
  const pool=await testDatabase(t);if(!pool)return;const user=await account(pool);await expired(pool,user.id);
  const payer=await player(pool,{plan:'family'});await mutateFamily(pool,payer,{commandId:'create',action:'create'});
  const invite=(await mutateFamily(pool,payer,{commandId:'invite',action:'invite',inviteeId:user.id,seatClass:'limited'})).invitations[0]!;
  await mutateFamily(pool,user.id,{commandId:'accept',action:'accept',token:invite.token!,acknowledgeIndividualCoverage:false});
  const fresh=await user.service.session(user.context);assert.equal(fresh.access.plan,'practice');assert.equal(fresh.access.handUnlocked,false);
  await assert.rejects(user.service.advice(user.context,{...envelope(fresh),decisionId:fresh.decisionId,requestedLevel:1}),/Unlock coaching/);
  assert.equal((await pool.query('SELECT count(*) FROM coached_hands WHERE player_id=$1',[user.id])).rows[0].count,'0');
  const unlocked=await user.service.unlock(user.context,{requestId:randomUUID(),gameId:fresh.game.id,handId:`${fresh.game.id}:1`,decisionId:fresh.decisionId,expectedRevision:fresh.revision,controlLeaseToken:fresh.controlLeaseToken,requestedLevel:1});
  assert.equal(unlocked.access.remainingHands,3);
});

test('owned saved advice remains readable after expiry without generating new levels or spending again',async t=>{
  const pool=await testDatabase(t);if(!pool)return;const user=await account(pool);
  const body={...envelope(user.view),decisionId:user.view.decisionId,requestedLevel:1 as const};
  const saved=await user.service.advice(user.context,body);await expired(pool,user.id);
  assert.deepEqual(await user.service.advice(user.context,body),saved);
  assert.deepEqual(await user.service.advice(user.context,{...body,commandId:randomUUID()}),saved);
  await assert.rejects(user.service.advice(user.context,{...body,commandId:randomUUID(),requestedLevel:2}),/expired/);
  assert.equal((await pool.query('SELECT count(*) FROM coached_hands WHERE player_id=$1',[user.id])).rows[0].count,'1');
});

test('read routes reject unknown and malformed query fields',async t=>{
  const pool=await testDatabase(t);if(!pool)return;const user=await account(pool);
  const config=readConfig({...process.env,APP_ENV:'test',IDENTITY_MODE:'local-test',BILLING_MODE:'fixture',DATABASE_URL:process.env.TEST_DATABASE_URL});
  const app=await createApp(config,pool);t.after(()=>app.close());
  for(const path of ['/api/session?seed=73','/api/coaching/access?plan=unlimited','/api/session/reviews?scope=arbitrary','/api/session/reviews/unknown?step=-1']){
    const result=await app.inject({method:'GET',url:path,headers:{cookie:`tc_session=${user.context.token}`,'x-tricks-tab':user.context.tab}});assert.equal(result.statusCode,400,path);
  }
});

async function trialFixture(t:TestContext,pool:Pool) {
  await pool.query(await readFile(new URL('../records/migrations/004-analysis-jobs.sql',import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../records/migrations/005-analysis-attempt-fence.sql',import.meta.url),'utf8'));
  const user=await account(pool);let view=user.view;
  await user.service.advice(user.context,{...envelope(view),decisionId:view.decisionId,requestedLevel:1});
  view=await user.service.action(user.context,{...envelope(view),action:view.game.legalActions[0]!});
  for(let step=0;!view.game.legalActions.length&&step<4;step++){
    const prepared=await user.service.prepare(user.context,envelope(view));view=await user.service.advance(user.context,{...envelope(view),kind:'bot',preparedDecisionId:prepared.preparedDecisionId});
  }
  const chosen=view.game.legalActions[0]!;assert.equal(chosen.kind,'play');if(chosen.kind!=='play')throw new Error('Expected a human card decision.');
  const decisionId=view.decisionId;view=await user.service.action(user.context,{...envelope(view),action:chosen});
  const trials=new TrialService(pool);t.after(()=>trials.close());
  const body:TrialRequest={...envelope(view),decisionId,trialId:randomUUID(),alternative:chosen};
  return {...user,trials,body};
}

test('unavailable trial status is committed before returning its retryable error',async t=>{
  const pool=await testDatabase(t);if(!pool)return;const f=await trialFixture(t,pool);
  f.trials.workers.run=async()=>({status:'unavailable',reason:'Fixture unavailable'});
  await assert.rejects(f.trials.run(f.context,f.body),/Fixture unavailable/);
  assert.equal((await pool.query('SELECT status FROM analysis_jobs WHERE player_id=$1',[f.id])).rows[0].status,'unavailable');
});

test('expired trial result cannot publish coaching or change the live table',async t=>{
  const pool=await testDatabase(t);if(!pool)return;const f=await trialFixture(t,pool);
  const before=(await pool.query('SELECT revision,document FROM games WHERE id=$1',[f.body.gameId])).rows[0];
  f.trials.workers.run=async observation=>{
    await pool.query("UPDATE analysis_jobs SET expires_at=now()-interval '1 second' WHERE player_id=$1",[f.id]);
    return {status:'available',label:'Possible continuation',frames:[observation],plays:[],seed:1,samplerVersion:'fixture',policyVersion:'fixture',limitations:[]};
  };
  await assert.rejects(f.trials.run(f.context,f.body));
  assert.equal((await pool.query('SELECT status FROM analysis_jobs WHERE player_id=$1',[f.id])).rows[0].status,'expired');
  assert.deepEqual((await pool.query('SELECT revision,document FROM games WHERE id=$1',[f.body.gameId])).rows[0],before);
});

test('a previous trial attempt cannot overwrite its replacement attempt',async t=>{
  const pool=await testDatabase(t);if(!pool)return;const f=await trialFixture(t,pool);
  f.trials.workers.run=async observation=>{
    await pool.query('UPDATE analysis_jobs SET attempt_fence=attempt_fence+1 WHERE player_id=$1',[f.id]);
    return {status:'available',label:'Possible continuation',frames:[observation],plays:[],seed:1,samplerVersion:'fixture',policyVersion:'fixture',limitations:[]};
  };
  await assert.rejects(f.trials.run(f.context,f.body));
  const job=(await pool.query('SELECT status,result,attempt_fence FROM analysis_jobs WHERE player_id=$1',[f.id])).rows[0];
  assert.equal(job.status,'queued');assert.equal(job.result,null);assert.equal(job.attempt_fence,2);
});

test('saved trial remains readable after coverage expires without another worker call',async t=>{
  const pool=await testDatabase(t);if(!pool)return;const f=await trialFixture(t,pool);let calls=0;
  f.trials.workers.run=async observation=>{calls++;return {status:'available',label:'Possible continuation',frames:[observation],plays:[],seed:1,samplerVersion:'fixture',policyVersion:'fixture',limitations:[]};};
  const saved=await f.trials.run(f.context,f.body);await expired(pool,f.id);
  assert.deepEqual(await f.trials.run(f.context,f.body),saved);assert.equal(calls,1);
});
