import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';
import { StripeBillingAdapter, type StripePlanChange } from '../billing/stripe.ts';

const input:StripePlanChange={subscriptionId:'sub_fixture',customerId:'cus_fixture',environment:'test',expectedPriceId:'price_old',prorationDate:1500,offer:{id:'offer_fixture',version:'v1',plan:'unlimited',priceId:'price_new',productId:'prod_fixture',currency:'usd',approved:true}};
const subscription=()=>({id:'sub_fixture',customer:'cus_fixture',livemode:false,status:'active',collection_method:'charge_automatically',pause_collection:null,pending_update:null,schedule:null,automatic_tax:{enabled:false},default_tax_rates:[],discounts:[],transfer_data:null,currency:'usd',items:{data:[{id:'si_fixture',quantity:1,price:{id:'price_old',recurring:{interval:'month',interval_count:1}},current_period_start:1000,current_period_end:2000}]}});
function fixture(options:{customer?:string;currency?:string;pending?:boolean}={}) {
  const calls:Array<{path:string;method:string;body:URLSearchParams;key:string|null}>=[];
  const mockedFetch:typeof fetch=async(url,init)=>{
    const path=new URL(String(url)).pathname;
    calls.push({path,method:init?.method??'GET',body:new URLSearchParams(String(init?.body??'')),key:new Headers(init?.headers).get('idempotency-key')});
    let result:unknown;
    if(path==='/v1/subscriptions/sub_fixture')result={...subscription(),customer:options.customer??'cus_fixture',pending_update:init?.method==='POST'&&options.pending?{expires_at:1800}:null};
    else if(path==='/v1/prices/price_new')result={id:'price_new',active:true,livemode:false,product:'prod_fixture',currency:options.currency??'usd',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
    else if(path==='/v1/invoices/create_preview')result={id:'upcoming_fixture',currency:'usd',amount_due:1234,total:1234};
    else if(path==='/v1/subscription_schedules'||path==='/v1/subscription_schedules/sub_sched_fixture')result={id:'sub_sched_fixture'};
    else throw new Error('Unexpected fixture request '+path);
    return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json','request-id':'req_fixture'}});
  };
  return {adapter:new StripeBillingAdapter('sk_test_fixture_no_network',Stripe.createFetchHttpClient(mockedFetch)),calls};
}

test('Stripe preview and update preserve approved price/proration and await payment reconciliation',async()=>{
  const {adapter,calls}=fixture({pending:true});
  const preview=await adapter.previewPlanChange(input);
  assert.equal(preview.changesApplied,false);assert.equal(preview.invoiceAmountDue,1234);
  const result=await adapter.requestPlanChange(input,'persisted-op-1');
  assert.deepEqual(result,{subscriptionId:'sub_fixture',pendingPayment:true,reconciliationRequired:true});
  await adapter.requestPlanChange(input,'persisted-op-1');
  const previewCall=calls.find(c=>c.path.endsWith('create_preview'))!;
  const updates=calls.filter(c=>c.path.endsWith('sub_fixture')&&c.method==='POST');
  assert.equal(previewCall.body.get('subscription_details[proration_date]'),'1500');
  assert.equal(updates.length,2);assert.equal(updates[0]!.key,updates[1]!.key);
  assert.equal(updates[0]!.key,'subscription:change:persisted-op-1');
  assert.equal(updates[0]!.body.get('proration_date'),'1500');
  assert.equal(updates[0]!.body.get('items[0][price]'),'price_new');
  assert.equal(updates[0]!.body.get('payment_behavior'),'pending_if_incomplete');
  assert.equal(updates[0]!.body.get('proration_behavior'),'always_invoice');
});

test('Stripe cancellation and resume update renewal with distinct durable idempotency keys',async()=>{
  const {adapter,calls}=fixture();
  await adapter.cancelAtPeriodEnd(input,'persisted-cancel');
  await adapter.resumeRenewal(input,'persisted-resume');
  const updates=calls.filter(c=>c.method==='POST');
  assert.equal(updates[0]!.body.get('cancel_at_period_end'),'true');
  assert.equal(updates[1]!.body.get('cancel_at_period_end'),'false');
  assert.equal(updates[0]!.key,'subscription:cancel:persisted-cancel');
  assert.equal(updates[1]!.key,'subscription:resume:persisted-resume');
  assert.ok(calls.every(c=>c.method!=='DELETE'));
});

test('Stripe renewal change retains current period and schedules approved price without prorations',async()=>{
  const {adapter,calls}=fixture();
  const result=await adapter.schedulePlanChange(input,'persisted-downgrade');
  assert.equal(result.effectiveAt,2000);assert.equal(result.reconciliationRequired,true);
  const posts=calls.filter(c=>c.method==='POST');
  assert.equal(posts[0]!.body.get('from_subscription'),'sub_fixture');
  assert.equal(posts[1]!.body.get('phases[0][items][0][price]'),'price_old');
  assert.equal(posts[1]!.body.get('phases[0][end_date]'),'2000');
  assert.equal(posts[1]!.body.get('phases[1][start_date]'),'2000');
  assert.equal(posts[1]!.body.get('phases[1][items][0][price]'),'price_new');
  assert.equal(posts[1]!.body.get('proration_behavior'),'none');
  assert.notEqual(posts[0]!.key,posts[1]!.key);
});

test('Stripe customer, environment, price and period mismatches fail before provider mutation',async()=>{
  for(const [changed,options] of [
    [input,{customer:'cus_other'}],
    [{...input,environment:'live' as const},{}],
    [{...input,expectedPriceId:'price_stale'},{}],
    [input,{currency:'cad'}],
    [{...input,prorationDate:2000},{}],
  ] as const){
    const {adapter,calls}=fixture(options);
    await assert.rejects(adapter.requestPlanChange(changed,'persisted-rejected'));
    assert.equal(calls.filter(c=>c.method==='POST').length,0);
  }
});
