import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));
export function loadLocalEnvironment() {
  const file = fileURLToPath(new URL('../../.env.local', import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  if (!['local','test','staging','production'].includes(env.APP_ENV ?? '')) throw new Error('APP_ENV must be explicit.');
  const appEnv = env.APP_ENV as 'local'|'test'|'staging'|'production';
  const hosted = appEnv === 'staging' || appEnv === 'production';
  if (hosted && (env.IDENTITY_MODE !== 'managed' || env.BILLING_MODE !== (appEnv === 'staging' ? 'stripe-test' : 'stripe-live'))) throw new Error('Hosted startup rejects fixture identity and billing.');
  if (hosted) throw new Error('Hosted managed identity is not configured; complete the staging gate.');
  if (env.IDENTITY_MODE !== 'local-test' || env.BILLING_MODE !== 'fixture') throw new Error('Local identity/payment modes must be explicit.');
  const host = env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1','localhost','::1'].includes(host)) throw new Error('Local fixtures require a loopback host.');
  const port = Number(env.PORT ?? '4173');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid PORT.');
  const origin = env.APP_ORIGIN ?? `http://127.0.0.1:${port}`;
  const url = new URL(origin);
  if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.protocol !== 'http:' || url.origin !== origin) throw new Error('Local APP_ORIGIN must be a loopback origin.');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required. Run npm run db:up.');
  for (const [name,value] of Object.entries(env)) if (name.startsWith('VITE_') && value && /KEY|TOKEN|SECRET|DATABASE/i.test(name)) throw new Error('Secrets must never use a VITE_ variable.');
  const jevMode = env.JEV_MODE ?? 'off';
  if (!['off','shadow','recommend'].includes(jevMode)) throw new Error('Invalid JEV_MODE.');
  if (jevMode !== 'off') throw new Error('Jev runtime promotion is disabled; use the bounded evaluation command.');
  return { appEnv, host, port, origin, databaseUrl:env.DATABASE_URL, identityMode:'local-test' as const, billingMode:'fixture' as const, jevMode:'off' as const };
}
export type Config = ReturnType<typeof readConfig>;
