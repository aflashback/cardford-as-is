import { onAuthInvalidated } from '../api/authLifecycle.ts';

export type AuthMode = 'fixture' | 'keycloak';
export function authModeFrom(value?: string): AuthMode {
  if (!value || value === 'fixture') return 'fixture';
  if (value === 'keycloak') return 'keycloak';
  throw new Error('VITE_AUTH_MODE must select fixture or keycloak.');
}
const environment = import.meta.env ?? {};
export const authMode = authModeFrom(environment.VITE_AUTH_MODE);

/** Build configuration is the only source of an API origin. Never read it from a URL or storage. */
export function configuredApiOrigin(value?: string): string | null {
  if (!value) return null;
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))))
    throw new Error('VITE_API_ORIGIN must be an exact secure API origin.');
  return url.origin;
}
const apiOrigin = configuredApiOrigin(authMode === 'keycloak' ? environment.VITE_API_ORIGIN : undefined);
let csrfToken: string | null = null;
onAuthInvalidated(() => { csrfToken = null; });
export function setAuthCsrf(value: string | null) { csrfToken = value; }
export function authCsrf(): string | null { return csrfToken; }
export function apiUrl(path: string): string {
  if (!path.startsWith('/api/') && !path.startsWith('/auth/')) throw new Error('Unsupported API path.');
  if (path.startsWith('//') || path.includes('\\') || /[\r\n]/.test(path)) throw new Error('Unsupported API path.');
  const parsed = new URL(path, 'https://cardford.invalid');
  if (parsed.origin !== 'https://cardford.invalid' || (!parsed.pathname.startsWith('/api/') && !parsed.pathname.startsWith('/auth/')))
    throw new Error('Unsupported API path.');
  return apiOrigin ? `${apiOrigin}${parsed.pathname}${parsed.search}` : path;
}
export function apiCredentials(): RequestCredentials { return authMode === 'keycloak' ? 'include' : 'same-origin'; }
export function trustedAccountUrl(value: string, allowedOrigin = environment.VITE_KEYCLOAK_ORIGIN): string {
  const origin = configuredApiOrigin(allowedOrigin);
  const url = new URL(value);
  if (!origin || url.origin !== origin || url.username || url.password || url.search || url.hash ||
      !/^\/realms\/[A-Za-z0-9_-]+\/account\/$/.test(url.pathname))
    throw new Error('Account settings are unavailable.');
  return url.href;
}
export function authEndpoint(value: string, path: '/auth/login' | '/auth/logout' | '/auth/refresh', pageUrl: string): string {
  const expected = new URL(apiUrl(path), pageUrl);
  const candidate = new URL(value, expected);
  if (candidate.href !== expected.href) throw new Error('The sign-in service returned an unsupported link.');
  return expected.href;
}
export function streamUrl(value: string, streamId: string, pageUrl: string): string {
  const expected = new URL(apiUrl('/api/realtime/connect'), pageUrl);
  const candidate = new URL(value, expected);
  // A server may return ws(s), but its authority and path must still be the configured API.
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(candidate.protocol) || candidate.host !== expected.host ||
      candidate.username || candidate.password || candidate.hash || candidate.pathname !== expected.pathname ||
      candidate.searchParams.get('streamId') !== streamId)
    throw new Error('Unsupported session stream URL.');
  candidate.protocol = expected.protocol === 'https:' ? 'wss:' : 'ws:';
  return candidate.href;
}
