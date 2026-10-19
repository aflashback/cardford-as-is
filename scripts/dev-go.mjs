// Native Go keeps authority; Vite watches only the frontend and proxies same-origin API calls.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { runBoundedNative } from './bounded-native-run.mjs';

const root = resolve(import.meta.dirname, '..');
const webRequire = createRequire(new URL('../web/package.json', import.meta.url));
const vite = resolve(webRequire.resolve('vite/package.json'), '../bin/vite.js');
process.chdir(root);
if (process.platform !== 'win32' || !process.env.DATABASE_URL)
  throw Error('Run node scripts/windows-env.mjs node scripts/dev-go.mjs.');
mkdirSync('.local', { recursive: true });
const build = await runBoundedNative('go', ['build', '-o', '.local/cardford-ui-dev.exe', './server/cmd/cardford'], {
  cwd: root, env: process.env, milliseconds: 120_000, onData: data => process.stdout.write(data),
});
if (build.status !== 'passed') throw Error('Native Go development build failed.');
const origin = 'http://127.0.0.1:4174', apiOrigin = 'http://127.0.0.1:4176';
const api = spawn(resolve('.local/cardford-ui-dev.exe'), [
  '--migrations', 'web/server/records/migrations', '--web', 'web/dist', '--reasoning', 'partner-resources',
], { cwd: root, env: { ...process.env, PORT: '4176', APP_ORIGIN: apiOrigin }, windowsHide: true, stdio: 'inherit' });
let web;
const stop = () => { web?.kill(); api.kill(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
api.once('error', stop);
api.once('exit', code => { web?.kill(); if (code) process.exitCode = code; });
try {
  let ready = false;
  for (let i = 0; i < 100 && api.exitCode === null; i++) {
    try { ready = (await fetch(`${apiOrigin}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Bounded readiness. */ }
    if (ready) break;
    await new Promise(done => setTimeout(done, 200));
  }
  if (!ready) throw Error('Go development backend did not become ready.');
  web = spawn(process.execPath, [vite, '--config', 'web/vite.config.ts', 'web', '--host', '127.0.0.1', '--port', '4174'], {
    cwd: root, env: { ...process.env, VITE_BACKEND: 'go', CARDFORD_DEV_API_ORIGIN: apiOrigin }, windowsHide: true, stdio: 'inherit',
  });
  web.once('error', stop);
  web.once('exit', code => { api.kill(); if (code) process.exitCode = code; });
  writeFileSync('.local/go-ui-dev.json', JSON.stringify({ origin, apiOrigin, apiPid: api.pid, vitePid: web.pid, startedAt: new Date().toISOString() }, null, 2));
} catch (error) { stop(); throw error; }
