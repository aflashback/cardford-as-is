import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { ApprovedOffer, BillingPort, SubscriptionSnapshot, VerifiedStripeEvent } from './stripe.ts';
import { BillingFailure, fingerprint, inTransaction, lockPlayer } from './store.ts';
interface Purchase {
  id: string;
  player_id: string;
  customer_id: string;
  offer: ApprovedOffer;
  environment: 'test' | 'live';
  subscription_id: string | null;
  reconcile_fence: number;
  status: string;
}
/** Persist intent first. Provider idempotency recovers ambiguous/lost responses without a second purchase. */
export async function createCheckout(
  pool: Pool,
  port: BillingPort,
  input: {
    playerId: string;
    requestId: string;
    customerId: string;
    offer: ApprovedOffer;
    environment: 'test' | 'live';
    returnOrigin: string;
  },
): Promise<{ purchaseId: string; url: string }> {
  if (!input.offer.approved)
    throw new BillingFailure(403, 'FORBIDDEN', 'No approved server offer is configured.');
  const purchase = await inTransaction(pool, async (client) => {
    await lockPlayer(client, input.playerId);
    const old = (
      await client.query<Purchase>('SELECT * FROM billing_purchases WHERE player_id=$1 AND request_id=$2', [
        input.playerId,
        input.requestId,
      ])
    ).rows[0];
    if (old) {
      if (
        old.customer_id !== input.customerId ||
        old.environment !== input.environment ||
        fingerprint(old.offer) !== fingerprint(input.offer)
      )
        throw new BillingFailure(409, 'IDEMPOTENCY_CONFLICT', 'Purchase request already has another offer.');
      return old;
    }
    const id = randomUUID();
    return (
      await client.query<Purchase>(
        'INSERT INTO billing_purchases(id,player_id,request_id,customer_id,offer,environment) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
        [id, input.playerId, input.requestId, input.customerId, input.offer, input.environment],
      )
    ).rows[0]!;
  });
  const checkout = await port.createCheckout({
    purchaseId: purchase.id,
    customerId: purchase.customer_id,
    offer: purchase.offer,
    environment: purchase.environment,
    returnOrigin: input.returnOrigin,
  });
  await pool.query(
    "UPDATE billing_purchases SET checkout_id=$2,status=CASE WHEN status='pending' THEN 'checkout' ELSE status END WHERE id=$1 AND (checkout_id IS NULL OR checkout_id=$2)",
    [purchase.id, checkout.id],
  );
  return { purchaseId: purchase.id, url: checkout.url };
}
/** Call only after Stripe raw-signature verification. Ack only after the inbox/job transaction commits. */
export async function receiveStripeEvent(
  pool: Pool,
  event: VerifiedStripeEvent,
  environment: 'test' | 'live',
): Promise<{ duplicate: boolean }> {
  if (event.livemode !== (environment === 'live'))
    throw new BillingFailure(400, 'INVALID_COMMAND', 'Stripe environment mismatch.');
  return inTransaction(pool, async (client) => {
    const inserted = await client.query(
      'INSERT INTO billing_events(id,event_type,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING RETURNING id',
      [event.id, event.type, event],
    );
    if (!inserted.rowCount) return { duplicate: true };
    const purchase = (
      await client.query<Purchase>(
        'SELECT * FROM billing_purchases WHERE environment=$1 AND (subscription_id=$2 OR id::text=$3)',
        [environment, event.subscriptionId, event.purchaseId],
      )
    ).rows[0];
    await client.query(
      'INSERT INTO billing_reconcile_jobs(event_id,purchase_id,subscription_id,status) VALUES($1,$2,$3,$4)',
      [
        event.id,
        purchase?.id ?? null,
        event.subscriptionId,
        purchase && event.subscriptionId ? 'pending' : 'unbound',
      ],
    );
    return { duplicate: false };
  });
}
export function validateCoverage(
  purchase: Pick<Purchase, 'id' | 'customer_id' | 'offer' | 'environment'>,
  snapshot: SubscriptionSnapshot,
): void {
  if (
    snapshot.purchaseId !== purchase.id ||
    snapshot.customerId !== purchase.customer_id ||
    snapshot.livemode !== (purchase.environment === 'live') ||
    snapshot.priceId !== purchase.offer.priceId ||
    snapshot.productId !== purchase.offer.productId ||
    snapshot.currency.toLowerCase() !== purchase.offer.currency.toLowerCase()
  )
    throw new BillingFailure(403, 'FORBIDDEN', 'Stripe subscription does not match the recorded purchase.');
  if (!Number.isSafeInteger(snapshot.paidThrough) || snapshot.paidThrough <= 0)
    throw new BillingFailure(400, 'INVALID_COMMAND', 'Invalid paid-through time.');
}
/** Fencing protects overlapping reconciliation; no transaction spans the external retrieval. */
export async function reconcileSubscription(
  pool: Pool,
  port: BillingPort,
  purchaseId: string,
  subscriptionId: string,
): Promise<'confirmed' | 'unchanged' | 'obsolete'> {
  const purchase = await inTransaction(pool, async (client) => {
    const p = (
      await client.query<Purchase>('SELECT * FROM billing_purchases WHERE id=$1 FOR UPDATE', [purchaseId])
    ).rows[0];
    if (!p || (p.subscription_id && p.subscription_id !== subscriptionId))
      throw new BillingFailure(403, 'FORBIDDEN', 'Subscription binding mismatch.');
    p.reconcile_fence++;
    await client.query('UPDATE billing_purchases SET reconcile_fence=$2 WHERE id=$1', [
      p.id,
      p.reconcile_fence,
    ]);
    return p;
  });
  const snapshot = await port.getSubscription(subscriptionId);
  validateCoverage(purchase, snapshot);
  if (snapshot.id !== subscriptionId)
    throw new BillingFailure(403, 'FORBIDDEN', 'Wrong Stripe subscription returned.');
  return inTransaction(pool, async (client) => {
    await lockPlayer(client, purchase.player_id);
    const current = (
      await client.query<Purchase>('SELECT * FROM billing_purchases WHERE id=$1 FOR UPDATE', [purchase.id])
    ).rows[0]!;
    if (current.reconcile_fence !== purchase.reconcile_fence) return 'obsolete';
    if (current.status === 'blocked') return 'unchanged';
    if (!snapshot.paid || !['active', 'canceled'].includes(snapshot.status)) return 'unchanged';
    await client.query(
      'INSERT INTO billing_coverage(purchase_id,player_id,plan,paid_through,canceled) VALUES($1,$2,$3,to_timestamp($4),$5) ON CONFLICT(purchase_id) DO UPDATE SET paid_through=GREATEST(billing_coverage.paid_through,excluded.paid_through),canceled=excluded.canceled,updated_at=now() WHERE billing_coverage.revoked_at IS NULL',
      [
        purchase.id,
        purchase.player_id,
        purchase.offer.plan,
        snapshot.paidThrough,
        snapshot.cancelAtPeriodEnd,
      ],
    );
    await client.query("UPDATE billing_purchases SET status='confirmed',subscription_id=$2 WHERE id=$1", [
      purchase.id,
      subscriptionId,
    ]);
    await client.query('UPDATE players SET access_generation=access_generation+1 WHERE id=$1', [
      purchase.player_id,
    ]);
    return 'confirmed';
  });
}
/** Explicit verified dispute/refund policy may revoke; later stale updates cannot resurrect coverage. */
export async function revokePurchase(pool: Pool, purchaseId: string): Promise<void> {
  await inTransaction(pool, async (client) => {
    const p = (await client.query<Purchase>('SELECT * FROM billing_purchases WHERE id=$1', [purchaseId]))
      .rows[0];
    if (!p) return;
    await lockPlayer(client, p.player_id);
    await client.query(
      "UPDATE billing_purchases SET status='blocked',reconcile_fence=reconcile_fence+1 WHERE id=$1",
      [purchaseId],
    );
    await client.query('UPDATE billing_coverage SET revoked_at=now() WHERE purchase_id=$1', [purchaseId]);
    await client.query('UPDATE players SET access_generation=access_generation+1 WHERE id=$1', [p.player_id]);
  });
}

/** Bounded retryable inbox drain. Reconciliation fetches current state; webhook arrival order is not authority. */
export async function processBillingInbox(
  pool: Pool,
  port: BillingPort,
  limit = 25,
): Promise<{ done: number; failed: number }> {
  const jobs = (
    await pool.query<{ event_id: string; purchase_id: string; subscription_id: string }>(
      "SELECT event_id,purchase_id,subscription_id FROM billing_reconcile_jobs WHERE status IN ('pending','failed') AND purchase_id IS NOT NULL AND subscription_id IS NOT NULL ORDER BY updated_at LIMIT $1",
      [Math.min(100, Math.max(1, limit))],
    )
  ).rows;
  let done = 0,
    failed = 0;
  for (const job of jobs) {
    try {
      const result = await reconcileSubscription(pool, port, job.purchase_id, job.subscription_id);
      if (result === 'obsolete') continue;
      await inTransaction(pool, async (client) => {
        await client.query(
          "UPDATE billing_reconcile_jobs SET status='done',last_error=NULL,updated_at=now() WHERE event_id=$1",
          [job.event_id],
        );
        await client.query('UPDATE billing_events SET processed_at=now() WHERE id=$1', [job.event_id]);
      });
      done++;
    } catch {
      await pool.query(
        "UPDATE billing_reconcile_jobs SET status='failed',last_error='Reconciliation failed; retry required.',updated_at=now() WHERE event_id=$1",
        [job.event_id],
      );
      failed++;
    }
  }
  return { done, failed };
}
