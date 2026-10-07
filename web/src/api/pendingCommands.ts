import type { ContractName, SessionView } from '../../shared/contracts';
import { validateContract } from '../../shared/validation.ts';

export type PendingScope = 'session' | 'review';
export type PendingOperation = { path: string; body: unknown; method?: string };
export const PENDING_COMMAND_TTL_MS = 24 * 60 * 60 * 1000;
const PREFIX = 'cardford-pending-v1:';
export interface StoredPending {
  version: 1;
  ownerId: string;
  gameId: string;
  createdAt: number;
  expiresAt: number;
  operation: PendingOperation;
  leaseHash?: string;
}

function key(scope: PendingScope) {
  let tab = '';
  try {
    tab = sessionStorage.getItem('tricks-tab') ?? '';
  } catch {
    /* Storage is optional. */
  }
  return `${PREFIX}${tab}:${scope}`;
}
function contract(operation: PendingOperation): ContractName | null {
  const method = operation.method ?? 'POST';
  if (operation.path === '/api/preferences' && method === 'PUT') return 'PreferencesRequest';
  if (method !== 'POST') return null;
  switch (operation.path) {
    case '/api/sessions':
      return 'NewSessionRequest';
    case '/api/session/actions':
      return 'ActionsRequest';
    case '/api/session/advance':
      return 'AdvanceRequest';
    case '/api/session/next-hand':
      return 'NextHandRequest';
    case '/api/session/control':
      return 'CommandEnvelope';
    default:
      return /^\/api\/session\/reviews\/[^/]+\/trials$/.test(operation.path) ? 'TrialRequest' : null;
  }
}
function bodyOf(operation: PendingOperation): Record<string, unknown> | null {
  return typeof operation.body === 'object' && operation.body !== null && !Array.isArray(operation.body)
    ? (operation.body as Record<string, unknown>)
    : null;
}
export function pendingCommandId(value: StoredPending | PendingOperation): string {
  const operation = 'operation' in value ? value.operation : value;
  const body = bodyOf(operation);
  return typeof body?.commandId === 'string' ? body.commandId : '';
}
async function leaseHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
export async function storePending(
  scope: PendingScope,
  operation: PendingOperation,
  ownerId: string,
  gameId: string,
  now = Date.now(),
): Promise<StoredPending> {
  const type = contract(operation);
  const body = bodyOf(operation);
  if (!type || !body || !validateContract(type, body)) throw new Error('Unsupported pending request.');
  const { controlLeaseToken, ...nonsecretBody } = body as Record<string, unknown>;
  const stored: StoredPending = {
    version: 1,
    ownerId,
    gameId,
    createdAt: now,
    expiresAt: now + PENDING_COMMAND_TTL_MS,
    operation: { ...operation, body: nonsecretBody },
    ...(typeof controlLeaseToken === 'string' ? { leaseHash: await leaseHash(controlLeaseToken) } : {}),
  };
  try {
    localStorage.setItem(key(scope), JSON.stringify(stored));
  } catch {
    /* Keep the in-memory request. */
  }
  return stored;
}
export function readPending(scope: PendingScope, ownerId: string, now = Date.now()): StoredPending | null {
  try {
    const serialized = localStorage.getItem(key(scope));
    if (!serialized) return null;
    const value: unknown = JSON.parse(serialized);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error();
    const pending = value as StoredPending;
    if (
      Object.keys(value).some(
        (name) =>
          !['version', 'ownerId', 'gameId', 'createdAt', 'expiresAt', 'operation', 'leaseHash'].includes(
            name,
          ),
      ) ||
      pending.version !== 1 ||
      pending.ownerId !== ownerId ||
      typeof pending.gameId !== 'string' ||
      !Number.isFinite(pending.createdAt) ||
      !Number.isFinite(pending.expiresAt) ||
      pending.createdAt > now ||
      pending.expiresAt !== pending.createdAt + PENDING_COMMAND_TTL_MS ||
      pending.expiresAt <= now ||
      !pending.operation ||
      Object.keys(pending.operation).some((name) => !['path', 'body', 'method'].includes(name))
    )
      throw new Error();
    const body = bodyOf(pending.operation);
    const type = contract(pending.operation);
    if (
      !body ||
      'controlLeaseToken' in body ||
      !type ||
      (typeof body.gameId === 'string' && body.gameId !== pending.gameId) ||
      (pending.leaseHash !== undefined && !/^[a-f0-9]{64}$/.test(pending.leaseHash)) ||
      !validateContract(type, { ...body, ...(pending.leaseHash ? { controlLeaseToken: 'pending' } : {}) })
    )
      throw new Error();
    return pending;
  } catch {
    clearPending(scope);
    return null;
  }
}
export async function restorePending(
  value: StoredPending,
  session: SessionView,
): Promise<PendingOperation | null> {
  if (value.gameId !== session.game.id) return null;
  const body = bodyOf(value.operation)!;
  if (value.leaseHash && value.leaseHash !== (await leaseHash(session.controlLeaseToken))) return null;
  return {
    ...value.operation,
    body: { ...body, ...(value.leaseHash ? { controlLeaseToken: session.controlLeaseToken } : {}) },
  };
}
export function clearPending(scope: PendingScope, commandId?: string) {
  try {
    if (commandId) {
      const value = JSON.parse(localStorage.getItem(key(scope)) ?? 'null') as StoredPending | null;
      if (value && pendingCommandId(value) !== commandId) return;
    }
    localStorage.removeItem(key(scope));
  } catch {
    /* Storage is optional. */
  }
}
export function clearPendingCommands() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const name = localStorage.key(index);
      if (name?.startsWith(PREFIX) || name?.startsWith('cardford-go-pending-v1:')) localStorage.removeItem(name);
    }
  } catch {
    /* Storage is optional. */
  }
}
