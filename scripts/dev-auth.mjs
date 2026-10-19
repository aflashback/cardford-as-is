import { spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { writeFileSync, existsSync } from 'node:fs';
import { root, authRoot, config, nativeGoEnv, run, tlsRequest, waitReady, inspectContainer, podman, containerName, pgbin, pgEnv, sql, tokenKey } from './auth-common.mjs';
import { setup, ensurePostgres } from './auth-setup.mjs';
import { reconcileRealm } from './auth-configure.mjs';
import { runBoundedNative } from './bounded-native-run.mjs';

const [command = 'start', ...args] = process.argv.slice(2);
const webRequire = createRequire(new URL('../web/package.json', import.meta.url));
async function helpersRunning(c) {
  return new Promise(done => {
    const req = http.request('http://127.0.0.1:4180/status', { headers: { Authorization: `Bearer ${c.controlToken}` }, timeout: 1000 }, response => {
      response.resume(); response.on('end', () => done(response.statusCode === 200));
    });
    req.on('error', () => done(false)); req.on('timeout', () => { req.destroy(); done(false); }); req.end();
  });
}
async function stopNative(c) {
  await new Promise(done => {
    const req = http.request('http://127.0.0.1:4180/stop', { method: 'POST', headers: { Authorization: `Bearer ${c.controlToken}` }, timeout: 3000 }, r => { r.resume(); r.on('end', done); });
    req.on('error', done); req.on('timeout', () => { req.destroy(); done(); }); req.end();
  });
}
async function stopInfrastructure(c) {
  await stopNative(c);
  const existing = inspectContainer(); if (existing?.State.Running) run(podman, ['stop', '--time', '15', containerName], { timeout: 30_000 });
  // Stop only the auth-specific cluster after its verified config identity.
  try { run(join(pgbin, 'pg_ctl.exe'), ['-D', join(authRoot, 'postgres/data'), 'status'], { env: pgEnv(c), timeout: 5000 }); }
  catch { console.log('Auth PostgreSQL already stopped.'); return; }
  run(join(pgbin, 'pg_ctl.exe'), ['-D', join(authRoot, 'postgres/data'), '-m', 'fast', '-w', '-t', '15', 'stop'], { env: pgEnv(c), timeout: 20_000, stdio: 'ignore' });
}
async function start() {
  if (existsSync(join(authRoot, 'config.json')) && await helpersRunning(config())) throw Error('Local auth is already running. Use dev:auth:status or stop the existing launcher first.');
  const c = await setup({ trust: args.includes('--trust') });
  const children = [];
  let shuttingDown = false;
  const stopChildren = () => {
    if (shuttingDown) return; shuttingDown = true;
    for (const child of children) if (child.exitCode === null && child.pid) {
      // Exact children spawned by this launcher; never a PID loaded from disk.
      try { run('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { timeout: 5000 }); } catch { child.kill(); }
    }
  };
  process.on('SIGINT', stopChildren); process.on('SIGTERM', stopChildren);
  const own = (exe, argv, env) => {
    if (shuttingDown) throw Error('Auth startup was interrupted.');
    const child = spawn(exe, argv, { cwd: root, env, windowsHide: true, stdio: 'inherit' });
    children.push(child); child.once('error', () => { process.exitCode = 1; stopChildren(); });
    child.once('exit', code => { if (!shuttingDown && code) process.exitCode = code; stopChildren(); });
    return child;
  };
  try {
    const helperEnv = { ...process.env };
    delete helperEnv.CARDFORD_AUTH_TOKEN_KEY; delete helperEnv.CARDFORD_AUTH_TOKEN_KEY_ID;
    own(process.execPath, ['scripts/auth-services.mjs'], helperEnv);
    await waitReady(async () => (await tlsRequest(`${c.issuer}/.well-known/openid-configuration`, { caFile: c.caFile, timeout: 2000 })).status === 200, { attempts: 180, interval: 500 });
    if (shuttingDown) throw Error('Auth startup was interrupted.');
    await reconcileRealm(c);
    if (shuttingDown) throw Error('Auth startup was interrupted.');
    const env = { ...nativeGoEnv(), APP_ENV: 'local-auth', IDENTITY_MODE: 'keycloak', BILLING_MODE: 'disabled', JEV_MODE: 'off', JEV_MAX_REQUESTS: '0', CARDFORD_AUTH_CONFIG: join(authRoot, 'config.json'), NODE_EXTRA_CA_CERTS: c.caFile };
    delete env.CARDFORD_AUTH_TOKEN_KEY; delete env.CARDFORD_AUTH_TOKEN_KEY_ID;
    const executable = join(authRoot, 'cardford-auth.exe');
    const build = await runBoundedNative(join(root, '.local/windows-tools/go1.26.8/go/bin/go.exe'), ['build', '-o', executable, './server/cmd/cardford-auth'], { cwd: root, env, milliseconds: 120_000, onData: text => process.stdout.write(text) });
    if (build.status !== 'passed') throw Error('Native auth Go build failed.');
    own(executable, ['-config', join(authRoot, 'config.json')], { ...env,
      CARDFORD_AUTH_TOKEN_KEY: tokenKey(c), CARDFORD_AUTH_TOKEN_KEY_ID: c.tokenKeyId });
    await waitReady(async () => (await tlsRequest(`${c.origin}/api/health`, { caFile: c.caFile })).status === 200);
    const vite = resolve(webRequire.resolve('vite/package.json'), '../bin/vite.js');
    own(process.execPath, [vite, '--config', 'web/vite.config.ts', 'web', '--host', '127.0.0.1', '--port', '4178'],
      { ...env, VITE_BACKEND: 'go', VITE_AUTH_MODE: 'keycloak', VITE_KEYCLOAK_ORIGIN: 'https://localhost:8443', CARDFORD_DEV_API_ORIGIN: '' });
    console.log(`CardFord real local auth: ${c.origin} | identity: https://localhost:8443 | private inbox: ${c.email.inboxOrigin}`);
    console.log('Ctrl+C stops owned app, Vite and native helper processes. Database and Keycloak persist; dev:auth:stop stops those services.');
  } catch (error) { stopChildren(); throw error; }
}
if (command === 'setup') await setup({ trust: args.includes('--trust'), refreshNetwork: args.includes('--refresh-network') });
else if (command === 'start') await start();
else if (command === 'stop') { await stopInfrastructure(config()); console.log('Owned auth processes stopped; state retained.'); }
else if (command === 'status') {
  const c = config();
  const existing = inspectContainer(); let issuerReady = false, appReady = false;
  try { issuerReady = (await tlsRequest(`${c.issuer}/.well-known/openid-configuration`, { caFile: c.caFile })).status === 200; } catch { /* absent */ }
  try { appReady = (await tlsRequest(`${c.origin}/api/health`, { caFile: c.caFile })).status === 200; } catch { /* absent */ }
  console.log(JSON.stringify({ appOrigin: c.origin, issuer: c.issuer, issuerReady, appReady, keycloakRunning: existing?.State.Running ?? false, nativePostgresPort: 54332, emailInbox: c.email.inboxOrigin, regionalParity: false }, null, 2));
} else if (command === 'reset') {
  if (!args.includes('--confirm=cardford-local-auth')) throw Error('Explicit reset required: reset --confirm=cardford-local-auth. This clears only the three auth databases.');
  const c = config(); await stopNative(c);
  const existing = inspectContainer(); if (existing) run(podman, ['rm', '--force', containerName]);
  ensurePostgres(c);
  // Never recursively delete directories, or touch game databases/roles.
  for (const name of ['cardford_auth_local_dev', 'cardford_auth_local_test', 'cardford_auth_keycloak']) sql(c, `DROP DATABASE IF EXISTS ${name} WITH (FORCE);`);
  writeFileSync(join(authRoot, 'mail.json'), '[]');
  console.log('Three local auth databases cleared. Secrets/CA retained. Run dev:auth:setup then dev:auth.');
} else if (command === 'regional') {
  throw Error('Regional multi-host topology is not implemented. Port-only localhost cannot prove cross-host cookie isolation. Use dev:auth for the implemented single-cell local foundation.');
} else throw Error('Use setup [--trust] | start | stop | status | reset --confirm=cardford-local-auth | regional.');
