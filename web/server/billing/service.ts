import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
  BillingPreviewRequest,
  BillingPreview,
  BillingConfirmRequest,
  BillingOperation,
  PaidPlan,
} from '../../shared/contracts.ts';
import { assertContract } from '../../shared/validation.ts';
import {
  BillingFailure,
  fingerprint,
  inTransaction,
  lockPlayer,
  requireFixture,
  type RequestGuard,
  type BillingProfile,
} from './store.ts';
const rank: Record<PaidPlan, number> = { practice: 0, unlimited: 1, family: 2 };
const billingFingerprint = (p: BillingProfile) =>
  fingerprint({
    plan: p.plan,
    cancel: p.cancelAtPeriodEnd,
    end: p.currentPeriodEnd,
    scheduled: p.scheduledPlan ?? null,
  });
export async function previewChange(
  pool: Pool,
  playerId: string,
  request: BillingPreviewRequest,
  guard?: RequestGuard,
): Promise<BillingPreview> {
  assertContract('BillingPreviewRequest', request);
  return inTransaction(pool, async (client) => {
    const profile = await lockPlayer(client, playerId);
    requireFixture(profile);
    await guard?.(client, playerId);
    const now = (await client.query<{ now: Date }>('SELECT now()')).rows[0]!.now;
    const plan = request.action === 'select-plan' ? request.plan : profile.plan;
    const scheduled =
      request.action === 'select-plan' &&
      rank[plan] < rank[profile.plan] &&
      Date.parse(profile.currentPeriodEnd) > now.getTime();
    const view: BillingPreview = {
      previewId: randomUUID(),
      action: request.action,
      plan,
      effectiveAt: scheduled ? profile.currentPeriodEnd : now.toISOString(),
      expiresAt: new Date(now.getTime() + 600000).toISOString(),
      amountDueNow: null,
      currency: null,
      mode: 'fixture',
      notice: 'Local billing simulation. No payment is collected. Prices and currency are not approved.',
    };
    if (request.action === 'cancel') view.effectiveAt = profile.currentPeriodEnd;
    await client.query(
      'INSERT INTO billing_previews(id,player_id,request,view,profile_fingerprint,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
      [view.previewId, playerId, request, view, billingFingerprint(profile), view.expiresAt],
    );
    return view;
  });
}
export async function confirmChange(
  pool: Pool,
  playerId: string,
  request: BillingConfirmRequest,
  guard?: RequestGuard,
): Promise<BillingOperation> {
  assertContract('BillingConfirmRequest', request);
  return inTransaction(pool, async (client) => {
    const profile = await lockPlayer(client, playerId);
    requireFixture(profile);
    await guard?.(client, playerId);
    const digest = fingerprint(request);
    const old = (
      await client.query<{ digest: string; response: BillingOperation }>(
        'SELECT digest,response FROM billing_operations WHERE player_id=$1 AND command_id=$2',
        [playerId, request.commandId],
      )
    ).rows[0];
    if (old) {
      if (old.digest !== digest)
        throw new BillingFailure(409, 'IDEMPOTENCY_CONFLICT', 'The request ID was already used.');
      return old.response;
    }
    const row = (
      await client.query<{ view: BillingPreview; profile_fingerprint: string; valid: boolean; now: Date }>(
        'SELECT view,profile_fingerprint,now(),(expires_at>now() AND used_at IS NULL) AS valid FROM billing_previews WHERE id=$1 AND player_id=$2 FOR UPDATE',
        [request.previewId, playerId],
      )
    ).rows[0];
    if (!row?.valid || row.profile_fingerprint !== billingFingerprint(profile))
      throw new BillingFailure(
        409,
        'INVALID_COMMAND',
        'This preview has expired or the subscription changed. Request another preview.',
      );
    const view = row.view;
    const scheduled =
      view.action === 'select-plan' &&
      rank[view.plan] < rank[profile.plan] &&
      Date.parse(view.effectiveAt) > row.now.getTime();
    const patch: Partial<BillingProfile> = {};
    if (view.action === 'select-plan') {
      if (scheduled) patch.scheduledPlan = view.plan;
      else {
        patch.plan = view.plan;
        patch.scheduledPlan = null;
        patch.cancelAtPeriodEnd = false;
        if (Date.parse(profile.currentPeriodEnd) <= row.now.getTime())
          patch.currentPeriodEnd = new Date(row.now.getTime() + 30 * 86400000).toISOString();
      }
    } else patch.cancelAtPeriodEnd = view.action === 'cancel';
    await client.query(
      'UPDATE players SET profile=profile || $2::jsonb,access_generation=access_generation+1 WHERE id=$1',
      [playerId, JSON.stringify(patch)],
    );
    await client.query('UPDATE billing_previews SET used_at=now() WHERE id=$1', [view.previewId]);
    const result: BillingOperation = {
      operationId: randomUUID(),
      status: scheduled ? 'scheduled' : 'confirmed',
      effectiveAt: view.effectiveAt,
      plan: view.plan,
      cancelAtPeriodEnd: patch.cancelAtPeriodEnd ?? profile.cancelAtPeriodEnd,
      mode: 'fixture',
      message: scheduled
        ? 'Local plan change scheduled at the current period end. No payment taken.'
        : 'Local subscription simulation updated. No payment taken.',
    };
    await client.query(
      'INSERT INTO billing_operations(id,player_id,command_id,digest,response) VALUES($1,$2,$3,$4,$5)',
      [result.operationId, playerId, request.commandId, digest, result],
    );
    return result;
  });
}
/** Caller holds the player's transaction lock. Scheduling never creates paid coverage. */
export async function applyDuePlan(client: PoolClient, playerId: string): Promise<void> {
  await client.query(
    "UPDATE players SET profile=jsonb_set(profile-'scheduledPlan','{plan}',profile->'scheduledPlan'),access_generation=access_generation+1 WHERE id=$1 AND profile->>'scheduledPlan' IN ('practice','unlimited','family') AND (profile->>'currentPeriodEnd')::timestamptz<=now()",
    [playerId],
  );
}
