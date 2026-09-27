import Stripe from 'stripe';
import type { PaidPlan } from '../../shared/contracts.ts';
export const STRIPE_API_VERSION='2026-08-26.dahlia' as const;
export interface ApprovedOffer {id:string;version:string;plan:PaidPlan;priceId:string;productId:string;currency:string;approved:true}
export interface CheckoutInput {purchaseId:string;customerId:string;offer:ApprovedOffer;environment:'test'|'live';returnOrigin:string}
export interface SubscriptionSnapshot {id:string;customerId:string;purchaseId:string;livemode:boolean;status:string;priceId:string;productId:string;currency:string;paid:boolean;paidThrough:number;cancelAtPeriodEnd:boolean}
export interface VerifiedStripeEvent {id:string;type:string;livemode:boolean;subscriptionId:string|null;purchaseId:string|null}
export interface BillingPort {createCheckout(input:CheckoutInput):Promise<{id:string;url:string}>;getSubscription(id:string):Promise<SubscriptionSnapshot>}
const record=(value:unknown):Record<string,unknown>|null=>typeof value==='object'&&value!==null&&!Array.isArray(value)?value as Record<string,unknown>:null;
const refId=(value:unknown):string|null=>typeof value==='string'?value:typeof record(value)?.id==='string'?record(value)!.id as string:null;
export class StripeBillingAdapter implements BillingPort {
  private readonly stripe:Stripe;
  constructor(apiKey:string) {this.stripe=new Stripe(apiKey,{apiVersion:STRIPE_API_VERSION,maxNetworkRetries:0,timeout:8000});}
  async createCheckout(input:CheckoutInput) {
    if(!input.offer.approved)throw new Error('An approved server offer is required.');
    const origin=new URL(input.returnOrigin);if(origin.protocol!=='https:' && !['localhost','127.0.0.1'].includes(origin.hostname))throw new Error('Invalid checkout return origin.');
    const session=await this.stripe.checkout.sessions.create({mode:'subscription',customer:input.customerId,line_items:[{price:input.offer.priceId,quantity:1}],metadata:{purchaseId:input.purchaseId},subscription_data:{metadata:{purchaseId:input.purchaseId}},success_url:`${origin.origin}/?billing=return`,cancel_url:`${origin.origin}/?billing=canceled`},{idempotencyKey:`purchase:${input.purchaseId}`});
    if(!session.url)throw new Error('Stripe did not return a checkout URL.');
    return {id:session.id,url:session.url};
  }
  async getSubscription(id:string):Promise<SubscriptionSnapshot> {
    const s=await this.stripe.subscriptions.retrieve(id,{expand:['latest_invoice','items.data.price.product']});
    if(s.items.data.length!==1)throw new Error('Unsupported subscription composition.');
    const item=s.items.data[0]!;const invoice=typeof s.latest_invoice==='object'?s.latest_invoice:null;
    return {id:s.id,customerId:typeof s.customer==='string'?s.customer:s.customer.id,purchaseId:s.metadata.purchaseId??'',livemode:s.livemode,status:s.status,priceId:item.price.id,productId:typeof item.price.product==='string'?item.price.product:item.price.product.id,currency:s.currency,paid:invoice?.status==='paid',paidThrough:item.current_period_end,cancelAtPeriodEnd:s.cancel_at_period_end};
  }
  /** The HTTP route must preserve raw bytes; parsed/re-serialized JSON is invalid input. */
  verifyWebhook(rawBody:Buffer|string,signature:string,secret:string):VerifiedStripeEvent {
    const event=this.stripe.webhooks.constructEvent(rawBody,signature,secret,300);
    const object=record(event.data.object);const metadata=record(object?.metadata);
    const parent=record(object?.parent);const details=record(parent?.subscription_details);
    const subscriptionId=event.type.startsWith('customer.subscription.')?refId(object):refId(object?.subscription)??refId(details?.subscription);
    return {id:event.id,type:event.type,livemode:event.livemode,subscriptionId,purchaseId:typeof metadata?.purchaseId==='string'?metadata.purchaseId:null};
  }
}
