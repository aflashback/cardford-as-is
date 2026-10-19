// Local-auth owns a distinct native PostgreSQL cluster and named Keycloak container.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import https from 'node:https';
export const root = resolve(import.meta.dirname, '..');
export const authRoot = join(root, '.local/auth');
export const configFile = join(authRoot, 'config.json');
export const pins = JSON.parse(readFileSync(join(root, 'infra/keycloak/pins.json'), 'utf8'));
export const podman = join(process.env.LOCALAPPDATA ?? '', 'Programs/Podman/podman.exe');
export const pgbin = join(root, '.local/windows-tools/pgsql/bin');
export const containerName = 'cardford-local-auth-keycloak';
export const ownerLabel = 'io.cardford.local-auth';
export const secret = () => randomBytes(32).toString('hex');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function withinAuth(path) {
  const rel = relative(authRoot, resolve(path));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('Resource must be strictly inside .local/auth.');
  return resolve(path);
}
export function run(exe, args, options = {}) {
  const { diagnostic = false, ...spawnOptions } = options;
  const r = spawnSync(exe, args, { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 << 20, ...spawnOptions });
  if (r.error || r.status !== 0) {
    // Callers may put passwords in stdin/env. Never echo them or arbitrary subprocess output.
    throw Error(`${exe.split(/[\\/]/).at(-1)} failed (${r.error?.code ?? r.status}). ${diagnostic ? r.stderr : 'Inspect local service logs.'}`);
  }
  return r.stdout ?? '';
}
export function jsonFile(file, value) { mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); }
export function validateConfig(c) {
  if (c.schemaVersion !== 1 || c.resources?.root !== authRoot || c.resources.container !== containerName || c.resources.pgPort !== 54332 ||
      c.address !== '127.0.0.1:4179' || c.origin !== 'https://localhost:4443' || c.issuer !== 'https://localhost:8443/realms/cardford' || c.clientId !== 'cardford')
    throw Error('Unrecognized local auth resource identity.');
  for (const key of ['caFile']) withinAuth(c[key]);
  for (const key of ['certFile', 'keyFile']) withinAuth(c.tls[key]);
  for (const value of [c.clientSecret, c.controlToken, c.resources.pgPassword, c.resources.appPassword, c.keycloak.databasePassword])
    if (!/^[a-f0-9]{64}$/.test(value)) throw Error('Invalid local secret format.');
  // The local administrator can rotate their password independently of generated service secrets.
  if (typeof c.keycloak.adminPassword !== 'string' || c.keycloak.adminPassword.length === 0 ||
      c.keycloak.adminPassword.length > 1024 || /[\x00-\x1f\x7f]/.test(c.keycloak.adminPassword))
    throw Error('Invalid local administrator password format.');
  if (!/^172\.\d+\.\d+\.\d+$/.test(c.resources.gateway) || !/^172\.\d+\.\d+\.\d+$/.test(c.resources.vmAddress)) throw Error('Invalid WSL network identity.');
  for (const name of ['databaseUrl', 'testDatabaseUrl']) {
    const u = new URL(c[name]);
    if (u.hostname !== '127.0.0.1' || u.port !== '54332' || u.username !== 'cardford_auth_app' ||
        u.pathname !== (name === 'databaseUrl' ? '/cardford_auth_local_dev' : '/cardford_auth_local_test')) throw Error('Unexpected auth database.');
  }
  return c;
}
export function config() { return validateConfig(JSON.parse(readFileSync(configFile, 'utf8'))); }
// Retrievable provider credentials require a persistent key outside PostgreSQL.
// Setup creates it once; a missing referenced key is an error, never an implicit rotation.
export function provisionTokenKey(c) {
  const existing = Boolean(c.tokenKeyFile);
  const file = withinAuth(c.tokenKeyFile ?? join(authRoot, 'keys/provider-tokens-v1.key'));
  if (!existsSync(file)) {
    if (existing) throw Error('Provider-token encryption key is missing. Restore it or explicitly revoke affected logins before rotating.');
    mkdirSync(resolve(file, '..'), { recursive: true });
    writeFileSync(file, randomBytes(32).toString('base64url') + '\n', { mode: 0o600, flag: 'wx' });
  }
  c.tokenKeyFile = file;
  c.tokenKeyId ??= 'local-v1';
  tokenKey(c);
  return c;
}
export function tokenKey(c) {
  if (!c.tokenKeyFile || !/^[A-Za-z0-9_-]{1,64}$/.test(c.tokenKeyId ?? '')) throw Error('Run dev:auth:setup to provision the provider-token encryption key.');
  const value = readFileSync(withinAuth(c.tokenKeyFile), 'utf8').trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(value) || Buffer.from(value, 'base64url').length !== 32) throw Error('Invalid provider-token encryption key.');
  return value;
}
export function pgEnv(c, user = 'cardford_auth_owner') {
  return { ...process.env, PGHOST: '127.0.0.1', PGPORT: '54332', PGUSER: user,
    PGPASSWORD: user === 'cardford_auth_owner' ? c.resources.pgPassword : c.resources.appPassword, PGDATABASE: 'postgres', PGSSLMODE: 'require' };
}
export function sql(c, text) { return run(join(pgbin, 'psql.exe'), ['-X', '-v', 'ON_ERROR_STOP=1', '-qAt'], { env: pgEnv(c), input: text }); }
export function inspectContainer() {
  const r = spawnSync(podman, ['container', 'inspect', containerName], { windowsHide: true, encoding: 'utf8', timeout: 15_000 });
  if (r.status !== 0) return null;
  const value = JSON.parse(r.stdout)[0];
  if (value.Config?.Labels?.[ownerLabel] !== authRoot) throw Error('Refusing an unowned container with the auth name.');
  return value;
}
export function ensureImage(image, platform = 'linux/amd64') {
  const result = spawnSync(podman, ['image', 'inspect', image, '--format', '{{.Digest}}'], { windowsHide: true, encoding: 'utf8', timeout: 15_000 });
  if (result.status === 0 && result.stdout.trim() === image.split('@')[1]) return;
  run(podman, ['pull', '--platform', platform, image], { timeout: 300_000 });
}
export function tlsRequest(url, { method = 'GET', headers = {}, body, caFile, timeout = 3000 } = {}) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !['localhost', 'app.localhost', 'auth.localhost'].includes(u.hostname)) throw Error('Local TLS requests only.');
  return new Promise((done, reject) => {
    const req = https.request(u, { method, headers, ca: caFile ? readFileSync(caFile) : undefined,
      lookup: (_host, options, callback) => options?.all ? callback(null, [{ address: '127.0.0.1', family: 4 }]) : callback(null, '127.0.0.1', 4), timeout }, res => {
      let data = ''; res.on('data', b => { data += b; if (data.length > 8 << 20) req.destroy(Error('Response limit.')); });
      res.on('end', () => done({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('timeout', () => req.destroy(Error('Request deadline.'))); req.on('error', reject);
    req.end(body);
  });
}
export async function waitReady(check, { attempts = 100, interval = 300 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try { if (await check()) return; } catch { /* bounded startup */ }
    await new Promise(done => setTimeout(done, interval));
  }
  throw Error('Local auth readiness deadline exceeded.');
}
export function nativeGoEnv() {
  const base = join(root, '.local/windows-tools');
  return { ...process.env, GOTOOLCHAIN: 'local', GOCACHE: join(base, 'gocache'), GOMODCACHE: join(base, 'gomodcache'),
    GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0', GOFLAGS: '', NODE_OPTIONS: '',
    PATH: [join(base, 'go1.26.8/go/bin'), pgbin, process.env.PATH].join(';') };
}
export function ownedConfigExists() { return existsSync(configFile); }
