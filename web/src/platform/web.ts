import type { ClientPlatform } from './runtime.ts';

export type Backend = 'node' | 'go';
export function backendFrom(value: string | undefined): Backend {
  if (!value || value === 'node') return 'node';
  if (value === 'go') return 'go';
  throw new Error('VITE_BACKEND must explicitly select node or go.');
}
const environment = import.meta.env ?? {};
export const backend = backendFrom(environment.VITE_BACKEND);

export function externalUrl(value: string, allowedOrigins: readonly string[]): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password ||
      !allowedOrigins.includes(url.origin)) throw new Error('This external link is unavailable.');
  return url.href;
}
const allowedOrigins = (environment.VITE_EXTERNAL_ORIGINS ?? '').split(',').filter(Boolean);
export const webPlatform: ClientPlatform = {
  kind: 'web',
  apiOrigin: () => null,
  onForeground(listener) {
    const visible = () => { if (!document.hidden) listener(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', visible);
    window.addEventListener('online', visible);
    window.addEventListener('focus', visible);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pageshow', visible);
      window.removeEventListener('online', visible);
      window.removeEventListener('focus', visible);
    };
  },
  async openExternal(value) {
    window.open(externalUrl(value, allowedOrigins), '_blank', 'noopener,noreferrer');
  },
};
