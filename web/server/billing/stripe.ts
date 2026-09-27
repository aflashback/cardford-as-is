import Stripe from 'stripe';
import type { PaidPlan } from '../../shared/contracts.ts';
export const STRIPE_API_VERSION = '2026-08-26.dahlia' as const;
export interface ApprovedOffer {
  id: string;
  version: string;
  plan: PaidPlan;
  priceId: string;
  productId: string;
  currency: string;
  approved: true;
}
export interface CheckoutInput {
  purchaseId: string;
  customerId: string;
  offer: ApprovedOffer;
  environment: 'test' | 'live';
  returnOrigin: string;
}
export interface SubscriptionSnapshot {
  id: string;
  customerId: string;
  purchaseId: string;
  livemode: boolean;
  status: string;
  priceId: string;
  productId: string;
  currency: string;
  paid: boolean;
  paidThrough: number;
  cancelAtPeriodEnd: boolean;
}
export interface VerifiedStripeEvent {
  id: string;
  type: string;
  livemode: boolean;
  subscriptionId: string | null;
  purchaseId: string | null;
}
export interface SubscriptionBinding {
  subscriptionId: string;
  customerId: string;
  environment: 'test' | 'live';
  expectedPriceId: string;
}
export interface StripePlanChange extends SubscriptionBinding {
  offer: ApprovedOffer;
  prorationDate: number;
}
export interface StripeInvoicePreview {
  subscriptionId: string;
  currency: string;
  invoiceAmountDue: number;
  invoiceTotal: number;
  prorationDate: number;
  effectiveAt: number;
  changesApplied: false;
}
export interface StripeChangeResult {
  subscriptionId: string;
  pendingPayment: boolean;
  reconciliationRequired: true;
}
export interface SubscriptionManagementPort {
  previewPlanChange(input: StripePlanChange): Promise<StripeInvoicePreview>;
  requestPlanChange(input: StripePlanChange, operationId: string): Promise<StripeChangeResult>;
  cancelAtPeriodEnd(input: SubscriptionBinding, operationId: string): Promise<StripeChangeResult>;
  resumeRenewal(input: SubscriptionBinding, operationId: string): Promise<StripeChangeResult>;
  schedulePlanChange(
    input: StripePlanChange,
    operationId: string,
  ): Promise<{
    subscriptionId: string;
    scheduleId: string;
    effectiveAt: number;
    reconciliationRequired: true;
  }>;
}
export interface BillingPort {
  createCheckout(input: CheckoutInput): Promise<{ id: string; url: string }>;
  getSubscription(id: string): Promise<SubscriptionSnapshot>;
}
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const refId = (value: unknown): string | null =>
  typeof value === 'string'
    ? value
    : typeof record(value)?.id === 'string'
      ? (record(value)!.id as string)
      : null;
export class StripeBillingAdapter implements BillingPort, SubscriptionManagementPort {
  private readonly stripe: Stripe;
  constructor(apiKey: string, httpClient?: ReturnType<typeof Stripe.createFetchHttpClient>) {
    this.stripe = new Stripe(apiKey, {
      apiVersion: STRIPE_API_VERSION,
      maxNetworkRetries: 0,
      timeout: 8000,
      ...(httpClient ? { httpClient } : {}),
    });
  }
  async createCheckout(input: CheckoutInput) {
    if (!input.offer.approved) throw new Error('An approved server offer is required.');
    const origin = new URL(input.returnOrigin);
    if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname))
      throw new Error('Invalid checkout return origin.');
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: input.customerId,
        line_items: [{ price: input.offer.priceId, quantity: 1 }],
        metadata: { purchaseId: input.purchaseId },
        subscription_data: { metadata: { purchaseId: input.purchaseId } },
        success_url: `${origin.origin}/?billing=return`,
        cancel_url: `${origin.origin}/?billing=canceled`,
      },
      { idempotencyKey: `purchase:${input.purchaseId}` },
    );
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    return { id: session.id, url: session.url };
  }
  async getSubscription(id: string): Promise<SubscriptionSnapshot> {
    const s = await this.stripe.subscriptions.retrieve(id, {
      expand: ['latest_invoice', 'items.data.price.product'],
    });
    if (s.items.data.length !== 1) throw new Error('Unsupported subscription composition.');
    const item = s.items.data[0]!;
    const invoice = typeof s.latest_invoice === 'object' ? s.latest_invoice : null;
    return {
      id: s.id,
      customerId: typeof s.customer === 'string' ? s.customer : s.customer.id,
      purchaseId: s.metadata.purchaseId ?? '',
      livemode: s.livemode,
      status: s.status,
      priceId: item.price.id,
      productId: typeof item.price.product === 'string' ? item.price.product : item.price.product.id,
      currency: s.currency,
      paid: invoice?.status === 'paid',
      paidThrough: item.current_period_end,
      cancelAtPeriodEnd: s.cancel_at_period_end,
    };
  }
  private async boundSubscription(input: SubscriptionBinding, allowSchedule = false) {
    const s = await this.stripe.subscriptions.retrieve(input.subscriptionId);
    if (
      s.id !== input.subscriptionId ||
      refId(s.customer) !== input.customerId ||
      s.livemode !== (input.environment === 'live')
    )
      throw new Error('Subscription customer/environment mismatch.');
    if (
      s.items.data.length !== 1 ||
      s.items.data[0]!.quantity !== 1 ||
      s.items.data[0]!.price.id !== input.expectedPriceId
    )
      throw new Error('Subscription changed; request a fresh preview.');
    if (
      !['active', 'past_due'].includes(s.status) ||
      s.collection_method !== 'charge_automatically' ||
      s.pause_collection ||
      s.pending_update
    )
      throw new Error('This subscription state needs a new billing review.');
    if (s.schedule && !allowSchedule)
      throw new Error('An existing schedule must be resolved before this operation.');
    return s;
  }
  private async approvedPrice(offer: ApprovedOffer, environment: 'test' | 'live') {
    if (!offer.approved) throw new Error('An approved server offer is required.');
    const price = await this.stripe.prices.retrieve(offer.priceId);
    if (
      price.id !== offer.priceId ||
      !price.active ||
      price.livemode !== (environment === 'live') ||
      refId(price.product) !== offer.productId ||
      price.currency !== offer.currency.toLowerCase() ||
      price.recurring?.interval !== 'month' ||
      price.recurring.interval_count !== 1 ||
      price.recurring.usage_type !== 'licensed'
    )
      throw new Error('The provider price does not match the approved monthly offer.');
    return price;
  }
  private operationKey(operationId: string, kind: string) {
    if (!/^[a-zA-Z0-9_:-]{1,160}$/.test(operationId))
      throw new Error('A persisted server operation ID is required.');
    return 'subscription:' + kind + ':' + operationId;
  }
  private validateProration(s: Stripe.Subscription, date: number) {
    const item = s.items.data[0]!;
    if (!Number.isSafeInteger(date) || date < item.current_period_start || date >= item.current_period_end)
      throw new Error('Preview proration date is outside the current period.');
  }
  async previewPlanChange(input: StripePlanChange): Promise<StripeInvoicePreview> {
    const s = await this.boundSubscription(input);
    await this.approvedPrice(input.offer, input.environment);
    this.validateProration(s, input.prorationDate);
    const invoice = await this.stripe.invoices.createPreview({
      customer: input.customerId,
      subscription: s.id,
      subscription_details: {
        items: [{ id: s.items.data[0]!.id, price: input.offer.priceId, quantity: 1 }],
        proration_behavior: 'always_invoice',
        proration_date: input.prorationDate,
      },
    });
    if (invoice.currency !== input.offer.currency.toLowerCase())
      throw new Error('Preview currency mismatch.');
    // Stripe invoice previews can include renewal/pending items: do not relabel this as a guaranteed immediate charge.
    return {
      subscriptionId: s.id,
      currency: invoice.currency,
      invoiceAmountDue: invoice.amount_due,
      invoiceTotal: invoice.total,
      prorationDate: input.prorationDate,
      effectiveAt: input.prorationDate,
      changesApplied: false,
    };
  }
  async requestPlanChange(input: StripePlanChange, operationId: string): Promise<StripeChangeResult> {
    const s = await this.boundSubscription(input);
    await this.approvedPrice(input.offer, input.environment);
    this.validateProration(s, input.prorationDate);
    const updated = await this.stripe.subscriptions.update(
      s.id,
      {
        items: [{ id: s.items.data[0]!.id, price: input.offer.priceId, quantity: 1 }],
        proration_behavior: 'always_invoice',
        proration_date: input.prorationDate,
        payment_behavior: 'pending_if_incomplete',
      },
      { idempotencyKey: this.operationKey(operationId, 'change') },
    );
    return {
      subscriptionId: updated.id,
      pendingPayment: updated.pending_update !== null,
      reconciliationRequired: true,
    };
  }
  async cancelAtPeriodEnd(input: SubscriptionBinding, operationId: string): Promise<StripeChangeResult> {
    const s = await this.boundSubscription(input);
    const updated = await this.stripe.subscriptions.update(
      s.id,
      { cancel_at_period_end: true },
      { idempotencyKey: this.operationKey(operationId, 'cancel') },
    );
    return { subscriptionId: updated.id, pendingPayment: false, reconciliationRequired: true };
  }
  async resumeRenewal(input: SubscriptionBinding, operationId: string): Promise<StripeChangeResult> {
    const s = await this.boundSubscription(input);
    const updated = await this.stripe.subscriptions.update(
      s.id,
      { cancel_at_period_end: false },
      { idempotencyKey: this.operationKey(operationId, 'resume') },
    );
    return { subscriptionId: updated.id, pendingPayment: false, reconciliationRequired: true };
  }
  async schedulePlanChange(input: StripePlanChange, operationId: string) {
    const s = await this.boundSubscription(input, true);
    await this.approvedPrice(input.offer, input.environment);
    const current = s.items.data[0]!;
    if (
      s.automatic_tax.enabled ||
      s.default_tax_rates?.length ||
      s.discounts.length ||
      s.transfer_data ||
      current.price.recurring?.interval !== 'month' ||
      current.price.recurring.interval_count !== 1
    )
      throw new Error(
        'Configured tax, discounts or non-monthly schedules require a separately reviewed schedule implementation.',
      );
    // The same creation key recovers an ambiguous schedule-creation response; a different pre-existing schedule fails closed.
    const schedule = await this.stripe.subscriptionSchedules.create(
      { from_subscription: s.id },
      { idempotencyKey: this.operationKey(operationId, 'schedule-create') },
    );
    await this.stripe.subscriptionSchedules.update(
      schedule.id,
      {
        end_behavior: 'release',
        proration_behavior: 'none',
        phases: [
          {
            start_date: current.current_period_start,
            end_date: current.current_period_end,
            items: [{ price: input.expectedPriceId, quantity: 1 }],
            proration_behavior: 'none',
          },
          {
            start_date: current.current_period_end,
            duration: { interval: 'month', interval_count: 1 },
            items: [{ price: input.offer.priceId, quantity: 1 }],
            proration_behavior: 'none',
          },
        ],
      },
      { idempotencyKey: this.operationKey(operationId, 'schedule-update') },
    );
    return {
      subscriptionId: s.id,
      scheduleId: schedule.id,
      effectiveAt: current.current_period_end,
      reconciliationRequired: true as const,
    };
  }
  /** The HTTP route must preserve raw bytes; parsed/re-serialized JSON is invalid input. */
  verifyWebhook(rawBody: Buffer | string, signature: string, secret: string): VerifiedStripeEvent {
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, secret, 300);
    const object = record(event.data.object);
    const metadata = record(object?.metadata);
    const parent = record(object?.parent);
    const details = record(parent?.subscription_details);
    const subscriptionId = event.type.startsWith('customer.subscription.')
      ? refId(object)
      : (refId(object?.subscription) ?? refId(details?.subscription));
    return {
      id: event.id,
      type: event.type,
      livemode: event.livemode,
      subscriptionId,
      purchaseId: typeof metadata?.purchaseId === 'string' ? metadata.purchaseId : null,
    };
  }
}
