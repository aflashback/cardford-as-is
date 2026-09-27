import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
export class BillingFailure extends Error {
  readonly status: number;
  readonly code:
    'FORBIDDEN' | 'INVALID_COMMAND' | 'IDEMPOTENCY_CONFLICT' | 'NOT_FOUND' | 'SERVICE_UNAVAILABLE';
  constructor(status: number, code: BillingFailure['code'], message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
export type RequestGuard = (client: PoolClient, playerId: string) => Promise<void>;
export async function inTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export interface BillingProfile {
  plan: 'practice' | 'unlimited' | 'family';
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  billingMode: 'fixture';
  displayName: string;
  scheduledPlan?: 'practice' | 'unlimited' | 'family' | null;
}
export async function lockPlayer(client: PoolClient, playerId: string): Promise<BillingProfile> {
  const row = (
    await client.query<{ profile: BillingProfile }>('SELECT profile FROM players WHERE id=$1 FOR UPDATE', [
      playerId,
    ])
  ).rows[0];
  if (!row) throw new BillingFailure(404, 'NOT_FOUND', 'Account not found.');
  return row.profile;
}
export function requireFixture(profile: BillingProfile) {
  if (profile.billingMode !== 'fixture')
    throw new BillingFailure(403, 'FORBIDDEN', 'This operation requires local fixture billing.');
}
