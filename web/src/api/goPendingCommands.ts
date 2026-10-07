import type { ContractName, ContractTypes, PlatformReconcileRequest } from '../../shared/local-service.contracts.ts';
import { validateContract } from '../../shared/local-service.validation.ts';
import { api, ApiFailure, definiteFailure, tabId } from './client.ts';
import { readInvitation, readLease, retainInvitation, tokenHash } from './controlLease.ts';
import { PENDING_COMMAND_TTL_MS } from './pendingCommands.ts';

export type GoScope = 'session' | 'review' | 'account';
type Operation = PlatformReconcileRequest['operation'];
const PREFIX = 'cardford-go-pending-v1:';
const routes: Record<string, { operation: Operation; input: ContractName; output: ContractName }> = {
  '/api/sessions': {operation:'new-session', input:'LocalServiceNewSessionRequest', output:'LocalServiceCommandReceipt'},
  '/api/session/control': {operation:'control', input:'LocalServiceControlRequest', output:'LocalControlView'},
  '/api/session/actions': {operation:'action', input:'LocalServiceActionRequest', output:'LocalServiceCommandReceipt'},
  '/api/session/advance': {operation:'advance', input:'LocalServiceAdvanceRequest', output:'LocalServiceCommandReceipt'},
  '/api/session/next-hand': {operation:'next-hand', input:'LocalServiceNextHandRequest', output:'LocalServiceCommandReceipt'},
  '/api/access/trials': {operation:'activate-trial', input:'LocalServiceTrialRequest', output:'LocalServiceTrialReceipt'},
  '/api/access/unlocks': {operation:'unlock-coaching', input:'LocalServiceUnlockRequest', output:'LocalServiceUnlockReceipt'},
  '/api/preferences': {operation:'platform-preferences', input:'PlatformPreferencesRequest', output:'PlatformPreferencesView'},
  '/api/platform/advice': {operation:'platform-advice', input:'PlatformAdviceRequest', output:'PlatformAdviceView'},
  '/api/platform/notes': {operation:'platform-notes', input:'PlatformNotesRequest', output:'NotesView'},
  '/api/platform/exposures': {operation:'platform-exposures', input:'PlatformReviewExposureRequest', output:'AcceptedView'},
  '/api/subscription/change': {operation:'platform-billing-change', input:'BillingConfirmRequest', output:'BillingOperation'},
  '/api/family': {operation:'platform-family-command', input:'PlatformFamilyCommand', output:'FamilyView'},
};
function route(path: string) {
  if (routes[path]) return routes[path];
  if (/^\/api\/platform\/reviews\/[^/]+\/trials$/.test(path))
    return { operation:'platform-review-trial' as const, input:'PlatformReviewTrialRequest' as const, output:'PlatformReviewStatus' as const };
  throw new Error('Unsupported pending request.');
}
export interface GoPending {
  version: 1; ownerId: string; gameId: string; createdAt: number; expiresAt: number;
  path: string; body: Record<string, unknown>; leaseHash?: string; invitationHash?:string;
}
function key(scope: GoScope) {
  return PREFIX + tabId() + ':' + scope;
}
export function clearGoPending(scope: GoScope) {
  try { localStorage.removeItem(key(scope)); } catch { /* Optional storage. */ }
}
export async function storeGoPending(scope: GoScope, path: string, body: unknown,
  ownerId: string, gameId: string, now = Date.now()): Promise<GoPending> {
  const spec = route(path);
  if (!validateContract(spec.input, body) || typeof body !== 'object' || body === null || Array.isArray(body))
    throw new Error('Unsupported pending request.');
  const { controlLeaseToken, ...nonsecret } = body as Record<string, unknown>;
  const pending: GoPending = {version:1, ownerId, gameId, createdAt:now,
    expiresAt:now + PENDING_COMMAND_TTL_MS, path, body:nonsecret,
    ...(typeof controlLeaseToken === 'string' ? {leaseHash:await tokenHash(controlLeaseToken)} : {})};
  // null is a nonsecret bootstrap precondition and remains part of the exact request.
  if (controlLeaseToken === null) pending.body.controlLeaseToken = null;
  if (path === '/api/family' && pending.body.action === 'accept' && typeof pending.body.token === 'string') {
    pending.invitationHash=await retainInvitation(ownerId,pending.body.token);
    delete pending.body.token;
  }
  const serialized = JSON.stringify(pending);
  try {
    localStorage.setItem(key(scope), serialized);
    if (localStorage.getItem(key(scope)) !== serialized) throw new Error();
  } catch {
    // Do not send an intent that cannot survive an uncertain response and reload.
    throw new Error('This request could not be saved for recovery. Enable browser storage before trying again.');
  }
  return pending;
}
export function readGoPending(scope: GoScope, ownerId: string, now = Date.now()): GoPending | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(scope)) ?? 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const value = raw as GoPending;
    if (Object.keys(raw).some(name => !['version','ownerId','gameId','createdAt','expiresAt','path','body','leaseHash','invitationHash'].includes(name)) ||
        value.version !== 1 || value.ownerId !== ownerId || typeof value.gameId !== 'string' ||
        !Number.isFinite(value.createdAt) || value.createdAt > now ||
        value.expiresAt !== value.createdAt + PENDING_COMMAND_TTL_MS || value.expiresAt <= now ||
        !value.body || typeof value.body !== 'object' || Array.isArray(value.body) ||
        ('controlLeaseToken' in value.body && value.body.controlLeaseToken !== null) ||
        (value.leaseHash !== undefined && !/^[a-f0-9]{64}$/.test(value.leaseHash)) ||
        (value.invitationHash !== undefined && (!/^[a-f0-9]{64}$/.test(value.invitationHash) || value.path !== '/api/family' || value.body.action !== 'accept')) ||
        ('token' in value.body)) throw new Error();
    const spec = route(value.path);
    const body = {...value.body, ...(value.leaseHash ? {controlLeaseToken:'p'.repeat(40)} : {}),
      ...(value.invitationHash ? {token:'i'.repeat(40)} : {})};
    const instanceId = value.body.gameId;
    if (!validateContract(spec.input, body) ||
        (typeof instanceId === 'string' && instanceId !== value.gameId)) throw new Error();
    return value;
  } catch { clearGoPending(scope); return null; }
}
export async function restoreGoPending(value: GoPending): Promise<Record<string, unknown>> {
  const body={...value.body};
  if (value.invitationHash) {
    const token=await readInvitation(value.ownerId,value.invitationHash);
    if (!token) throw new Error('The original invitation token is unavailable. This request remains unconfirmed.');
    body.token=token;
  }
  if (!value.leaseHash) return body;
  const lease = await readLease(value.ownerId, value.gameId, value.leaseHash);
  if (!lease) throw new Error('The original control lease is unavailable. This request remains unconfirmed.');
  return {...body, controlLeaseToken:lease.token};
}
export async function recoverGoPending(value: GoPending): Promise<unknown | null> {
  const body = await restoreGoPending(value);
  const spec = route(value.path);
  const status = await api('/api/platform/commands/reconcile', 'PlatformReconcileView', {
    commandId:body.commandId, operation:spec.operation, request:body,
  });
  if (status.status === 'unknown') return null;
  if (!validateContract(spec.output, status.receipt))
    throw new ApiFailure('The recovered receipt does not match this request.', 502, 'INVALID_RESPONSE');
  return status.receipt;
}
export async function executeGo<N extends ContractName>(scope: GoScope, path: string,
  output: N, body: unknown, ownerId: string, gameId: string): Promise<ContractTypes[N]> {
  const spec = route(path);
  if (spec.output !== output) throw new Error('Unsupported command response.');
  const existing = readGoPending(scope, ownerId);
  const commandId = (body as {commandId?: unknown}).commandId;
  if (existing && existing.body.commandId !== commandId)
    throw new Error('A previous request remains unconfirmed. Retry it before continuing.');
  const pending = existing ?? await storeGoPending(scope, path, body, ownerId, gameId);
  try {
    const recovered = existing ? await recoverGoPending(pending) : null;
    const value = recovered ?? await api(path, output, existing ? await restoreGoPending(existing) : body);
    if (!validateContract(output, value)) throw new ApiFailure('Unsupported recovered response.', 502, 'INVALID_RESPONSE');
    if (output !== 'PlatformReviewStatus' || (value as {status?:string}).status === 'completed')
      clearGoPending(scope);
    return value;
  } catch (error) {
    if (definiteFailure(error)) clearGoPending(scope);
    throw error;
  }
}
