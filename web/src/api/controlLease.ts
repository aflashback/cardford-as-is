const PREFIX = 'cardford-lease-v1:';
const CURRENT = 'cardford-lease-current-v1:';
const INVITATION = 'cardford-invitation-v1:';
export interface RetainedLease {
  version: 1; ownerId: string; gameId: string; token: string; hash: string; generation: number;
}
export async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
function identityKey(owner: string, game: string): string {
  return `${encodeURIComponent(owner)}:${encodeURIComponent(game)}:`;
}
const volatile = new Map<string, string>();
function put(key: string, value: string) {
  volatile.set(key, value);
  try { sessionStorage.setItem(key, value); } catch { /* Tab memory remains usable. */ }
}
function get(key: string): string | null {
  try { return sessionStorage.getItem(key) ?? volatile.get(key) ?? null; }
  catch { return volatile.get(key) ?? null; }
}
export async function retainInvitation(ownerId:string, token:string):Promise<string> {
  const hash=await tokenHash(token);
  put(INVITATION + encodeURIComponent(ownerId) + ':' + hash, token);
  return hash;
}
export async function readInvitation(ownerId:string, hash:string):Promise<string|null> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const token=get(INVITATION + encodeURIComponent(ownerId) + ':' + hash);
  return token && await tokenHash(token) === hash ? token : null;
}
export async function retainLease(ownerId: string, gameId: string, token: string,
  generation: number): Promise<RetainedLease> {
  if (!ownerId || !gameId || !/^[A-Za-z0-9_-]{32,256}$/.test(token) ||
      !Number.isSafeInteger(generation) || generation < 0) throw new Error('Invalid control lease.');
  const hash = await tokenHash(token);
  const lease: RetainedLease = { version: 1, ownerId, gameId, token, hash, generation };
  const identity = identityKey(ownerId, gameId);
  put(PREFIX + identity + hash, JSON.stringify(lease));
  put(CURRENT + identity, hash);
  return lease;
}
export async function readLease(ownerId: string, gameId: string,
  expectedHash?: string): Promise<RetainedLease | null> {
  try {
    const identity = identityKey(ownerId, gameId);
    const hash = expectedHash ?? get(CURRENT + identity);
    if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return null;
    const raw: unknown = JSON.parse(get(PREFIX + identity + hash) ?? 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const lease = raw as RetainedLease;
    if (Object.keys(raw).some(key => !['version', 'ownerId', 'gameId', 'token', 'hash', 'generation'].includes(key)) ||
        lease.version !== 1 || lease.ownerId !== ownerId || lease.gameId !== gameId || lease.hash !== hash ||
        typeof lease.token !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(lease.token) ||
        !Number.isSafeInteger(lease.generation) || lease.generation < 0 ||
        await tokenHash(lease.token) !== hash) return null;
    return lease;
  } catch { return null; }
}
export function clearLeases() {
  volatile.clear();
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(PREFIX) || key?.startsWith(CURRENT) || key?.startsWith(INVITATION)) sessionStorage.removeItem(key);
    }
  } catch { /* Storage is optional. */ }
}
