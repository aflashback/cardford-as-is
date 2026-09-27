import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import test from 'node:test';
import { previewChange,confirmChange } from '../billing/service.ts';
import { createCheckout,receiveStripeEvent,reconcileSubscription,validateCoverage,revokePurchase } from '../billing/purchases.ts';
import { StripeBillingAdapter,type BillingPort,type SubscriptionSnapshot,type ApprovedOffer } from '../billing/stripe.ts';
import { testDatabase,player } from '../billing/database-test.ts';
const offer:ApprovedOffer={id:'fixture-offer',version:'fixture-1',plan:'unlimited',priceId:'price_fixture',productId:'prod_fixture',currency:'usd',approved:true};
const snapshot=(purchaseId:string):SubscriptionSnapshot=>({id:'sub_fixture',customerId:'cus_fixture',purchaseId,livemode:false,status:'active',priceId:offer.priceId,productId:offer.productId,currency:'usd',paid:true,paidThrough:Math.floor(Date.now()/1000)+86400,cancelAtPeriodEnd:false});

test('Stripe verifies exact raw bytes, signatures, timestamp and safe event references without network',()=>{
  const stripe=new StripeBillingAdapter('sk_test_fixture_never_used');const secret='whsec_fixture_only';const ts=Math.floor(Date.now()/1000);
  const raw=JSON.stringify({id:'evt_fixture',type:'customer.subscription.updated',livemode:false,data:{object:{id:'sub_fixture',metadata:{purchaseId:'purchase_fixture'}}}});
  const sign=(body:string,time:number)=>`t=${time},v1=${createHmac('sha256',secret).update(`${time}.${body}`).digest('hex')}`;
  assert.deepEqual(stripe.verifyWebhook(raw,sign(raw,ts),secret),{id:'evt_fixture',type:'customer.subscription.updated',livemode:false,subscriptionId:'sub_fixture',purchaseId:'purchase_fixture'});
  assert.throws(()=>stripe.verifyWebhook(raw+' ',sign(raw,ts),secret));
  assert.throws(()=>stripe.verifyWebhook(raw,sign(raw,ts-301),secret));
  assert.throws(()=>stripe.verifyWebhook(raw,sign(raw,ts),'wrong'));
});

test('subscription binding rejects wrong beneficiary purchase, customer, environment, price/product/currency',()=>{
  const purchase={id:'purchase_fixture',customer_id:'cus_fixture',offer,environment:'test' as const};
  validateCoverage(purchase,snapshot(purchase.id));
  for(const patch of [{purchaseId:'other'},{customerId:'other'},{livemode:true},{priceId:'other'},{productId:'other'},{currency:'cad'},{paidThrough:NaN}])assert.throws(()=>validateCoverage(purchase,{...snapshot(purchase.id),...patch}));
});

test('fixture previews require confirmation, preserve paid-through and retry once with stale/foreign preview rejection',async t=>{
  const pool=await testDatabase(t);if(!pool)return;
  const owner=await player(pool);const other=await player(pool);
  const preview=await previewChange(pool,owner,{action:'select-plan',plan:'practice'});
  assert.equal(preview.mode,'fixture');assert.equal(preview.amountDueNow,null);
  assert.equal((await pool.query('SELECT profile FROM players WHERE id=$1',[owner])).rows[0].profile.plan,'unlimited');
  await assert.rejects(confirmChange(pool,other,{commandId:'foreign',previewId:preview.previewId}));
  const command={commandId:'once',previewId:preview.previewId};const result=await confirmChange(pool,owner,command);
  assert.equal(result.status,'scheduled');assert.deepEqual(await confirmChange(pool,owner,command),result);
  assert.equal((await pool.query('SELECT profile FROM players WHERE id=$1',[owner])).rows[0].profile.plan,'unlimited');
  const cancel=await previewChange(pool,owner,{action:'cancel'});await confirmChange(pool,owner,{commandId:'cancel',previewId:cancel.previewId});
  const profile=(await pool.query('SELECT profile FROM players WHERE id=$1',[owner])).rows[0].profile;
  assert.equal(profile.cancelAtPeriodEnd,true);assert.equal(profile.currentPeriodEnd,cancel.effectiveAt);
  await assert.rejects(confirmChange(pool,owner,{commandId:'once',previewId:cancel.previewId}));
  await assert.rejects(previewChange(pool,owner,{action:'resume'},async()=>{throw new Error('Session revoked.');}));
});

test('purchase retries, durable inbox, current-state reconciliation and revocation are idempotent',async t=>{
  const pool=await testDatabase(t);if(!pool)return;const owner=await player(pool);
  let bound='';let calls=0;
  const port:BillingPort={async createCheckout(input){bound=input.purchaseId;calls++;assert.equal((await pool.query('SELECT id FROM billing_purchases WHERE id=$1',[bound])).rowCount,1);return {id:'cs_fixture',url:'https://checkout.stripe.com/fixture'};},async getSubscription(){return snapshot(bound);}};
  const input={playerId:owner,requestId:'buy-once',customerId:'cus_fixture',offer,environment:'test' as const,returnOrigin:'http://localhost'};
  const first=await createCheckout(pool,port,input);assert.deepEqual(await createCheckout(pool,port,input),first);assert.equal(calls,2);
  assert.equal((await pool.query('SELECT * FROM billing_purchases')).rowCount,1);
  const event={id:'evt_fixture',type:'customer.subscription.updated',livemode:false,subscriptionId:'sub_fixture',purchaseId:bound};
  assert.deepEqual(await receiveStripeEvent(pool,event,'test'),{duplicate:false});assert.deepEqual(await receiveStripeEvent(pool,event,'test'),{duplicate:true});
  assert.equal((await pool.query('SELECT * FROM billing_reconcile_jobs')).rowCount,1);
  assert.equal(await reconcileSubscription(pool,port,bound,'sub_fixture'),'confirmed');
  assert.equal((await pool.query('SELECT * FROM billing_coverage')).rowCount,1);
  const failed:BillingPort={...port,async getSubscription(){return {...snapshot(bound),paid:false,status:'past_due'};}};
  assert.equal(await reconcileSubscription(pool,failed,bound,'sub_fixture'),'unchanged');
  await revokePurchase(pool,bound);assert.equal(await reconcileSubscription(pool,port,bound,'sub_fixture'),'unchanged');
  assert.ok((await pool.query('SELECT revoked_at FROM billing_coverage')).rows[0].revoked_at);
  await assert.rejects(receiveStripeEvent(pool,{...event,id:randomUUID(),livemode:true},'test'));
});

test('late reconciliation is fenced and provider failure leaves existing paid coverage unchanged',async t=>{
  const pool=await testDatabase(t);if(!pool)return;const owner=await player(pool);let bound='';
  const base:BillingPort={async createCheckout(input){bound=input.purchaseId;return {id:'cs_fixture',url:'https://checkout.stripe.com/fixture'};},async getSubscription(){return snapshot(bound);}};
  await createCheckout(pool,base,{playerId:owner,requestId:'buy',customerId:'cus_fixture',offer,environment:'test',returnOrigin:'http://localhost'});
  let release:()=>void=()=>{};let entered:()=>void=()=>{};
  const waiting=new Promise<void>(r=>{release=r;});const started=new Promise<void>(r=>{entered=r;});
  const slow:BillingPort={...base,async getSubscription(){entered();await waiting;return {...snapshot(bound),paidThrough:Math.floor(Date.now()/1000)+999999};}};
  const first=reconcileSubscription(pool,slow,bound,'sub_fixture');await started;
  assert.equal(await reconcileSubscription(pool,base,bound,'sub_fixture'),'confirmed');release();assert.equal(await first,'obsolete');
  const before=(await pool.query('SELECT * FROM billing_coverage')).rows[0];
  await assert.rejects(reconcileSubscription(pool,{...base,async getSubscription(){throw new Error('Fixture outage');}},bound,'sub_fixture'));
  assert.deepEqual((await pool.query('SELECT * FROM billing_coverage')).rows[0],before);
});
