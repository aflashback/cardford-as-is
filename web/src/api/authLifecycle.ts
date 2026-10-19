// A rejected identity invalidates every private response started before it.
// Keep this process-local: table, account and review views must never be stored.
let epoch = 0;
const listeners = new Set<() => void>();
// Central ownership keeps cleanup independent of whether Coach is mounted.
// This module must not import presentation or transport modules.
export const COACH_PENDING_STORAGE_KEY = 'cardford-rally-coach-pending-v1';

export function authEpoch(): number {
  return epoch;
}

export function onAuthInvalidated(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateAuth(): void {
  epoch++;
  try { sessionStorage.removeItem(COACH_PENDING_STORAGE_KEY); } catch { /* Storage can be unavailable. */ }
  for (const listener of listeners) {
    try { listener(); } catch { /* One screen cannot prevent the others from clearing. */ }
  }
}


// Access suspension is distinct from a replacement login. Routine renewal must
// preserve the family epoch and durable command/control receipts.
let renewAccess: (() => Promise<boolean>) | null = null;
let acceptedActivity: (() => void) | null = null;
export function registerAuthRenewal(renew: () => Promise<boolean>, accepted: () => void): () => void {
  renewAccess = renew; acceptedActivity = accepted;
  return () => { if (renewAccess === renew) { renewAccess = null; acceptedActivity = null; } };
}
export function renewAuthAccess(): Promise<boolean> { return renewAccess?.() ?? Promise.resolve(false); }
export function noteAcceptedAuthActivity(): void { acceptedActivity?.(); }


const accessSuspended = new Set<() => void>();
export function onAuthAccessSuspended(listener:()=>void):()=>void {
  accessSuspended.add(listener);return ()=>{accessSuspended.delete(listener);};
}
export function suspendAuthAccess():void {
  for(const listener of accessSuspended) { try { listener(); } catch { /* Other owners must still suspend. */ } }
}
