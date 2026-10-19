import type {CoachUIFeedbackRequest, CoachUIItemRequest, CoachUIStartRequest} from '../../shared/local-service.contracts';
import {validateContract} from '../../shared/local-service.validation.ts';
import {COACH_PENDING_STORAGE_KEY} from '../api/authLifecycle.ts';

export type CoachOperation =
  | {kind:'start'; body:CoachUIStartRequest}
  | {kind:'item'; body:CoachUIItemRequest}
  | {kind:'feedback'; body:CoachUIFeedbackRequest};
export const coachPendingKey = COACH_PENDING_STORAGE_KEY;
const ttl = 24 * 60 * 60 * 1000;
export interface CoachPending {
  version:1; owner:string; createdAt:number; kind:CoachOperation['kind']; body:Record<string,unknown>; leaseHash?:string;
}
const types = {start:'CoachUIStartRequest',item:'CoachUIItemRequest',feedback:'CoachUIFeedbackRequest'} as const;
async function hash(value:string) {
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
/** Store only the command intent. Saved views and control credentials never enter storage. */
export async function packCoachPending(owner:string, operation:CoachOperation, now=Date.now()):Promise<CoachPending> {
  if (!owner || owner.length > 256 || !Number.isFinite(now) || !Object.prototype.hasOwnProperty.call(types,operation.kind) ||
    !validateContract(types[operation.kind],operation.body)) throw new TypeError('Invalid Coach request.');
  const body = structuredClone(operation.body) as unknown as Record<string,unknown>;
  const token = body.controlLeaseToken; delete body.controlLeaseToken;
  return {version:1,owner,createdAt:now,kind:operation.kind,body,
    ...(typeof token === 'string' ? {leaseHash:await hash(token)} : {})};
}
export function readCoachPending(raw:string|null, owner:string, now=Date.now()):CoachPending|null {
  try {
    const value = JSON.parse(raw || 'null') as CoachPending|null;
    if (!owner || !Number.isFinite(now) || !value || value.version!==1 || value.owner!==owner || !Number.isFinite(value.createdAt) ||
      value.createdAt>now || now-value.createdAt>=ttl || !Object.prototype.hasOwnProperty.call(types,value.kind) ||
      Object.keys(value).some(key=>!['version','owner','createdAt','kind','body','leaseHash'].includes(key)) ||
      !value.body || typeof value.body!=='object' || Array.isArray(value.body) || 'controlLeaseToken' in value.body ||
      (value.kind==='feedback' ? value.leaseHash!==undefined : !/^[a-f0-9]{64}$/.test(value.leaseHash || '')) ||
      !validateContract(types[value.kind],{...value.body,...(value.leaseHash ? {controlLeaseToken:'restore'} : {})})) return null;
    return value;
  } catch {return null;}
}
export async function restoreCoachPending(value:CoachPending, gameId:string, token:string):Promise<CoachOperation|null> {
  value=structuredClone(value);
  if (!readCoachPending(JSON.stringify(value),value.owner)) return null;
  if (value.leaseHash && (value.body.gameId!==gameId || value.leaseHash!==await hash(token))) return null;
  const body={...structuredClone(value.body),...(value.leaseHash ? {controlLeaseToken:token} : {})};
  if (!validateContract(types[value.kind],body)) return null;
  return {kind:value.kind,body} as CoachOperation;
}

/** A chargeable write must have a recoverable exact intent before transport. */
export function saveCoachPending(value:CoachPending, storage:Pick<Storage,'setItem'|'getItem'>) {
  const serialized=JSON.stringify(value);
  try {
    storage.setItem(coachPendingKey,serialized);
    if (storage.getItem(coachPendingKey)!==serialized) throw new Error('Storage did not retain the intent.');
  } catch {throw new Error('Save this request for recovery before trying again. Enable browser storage.');}
}

/** One write at a time; an uncertain write must retain its exact command ID. */
export class CoachMutationGate {
  pending:CoachOperation|null = null;
  busy = false;
  begin(operation?:CoachOperation):CoachOperation|null {
    if (this.busy || (operation && this.pending)) return null;
    if (operation) this.pending=structuredClone(operation);
    if (!this.pending) return null;
    this.busy=true;
    return this.pending;
  }
  settle(definite:boolean) {this.busy=false; if (definite) this.pending=null;}
  clear() {this.pending=null; this.busy=false;}
}

export function coachSessionLabel(access:{unlimited:boolean;remaining:number|null;mode:string}) {
  const label=access.unlimited ? 'Unlimited coaching' : `${access.remaining ?? 0} of 2 sessions left today`;
  return access.mode==='local-fixture' ? `${label} · local preview` : label;
}
