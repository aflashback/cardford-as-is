// Explicit same-origin native Go + React local app. The original Node reader
// remains available separately for historical V1 records.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (process.platform !== 'win32' || !process.env.DATABASE_URL)
  throw new Error('Run npm run pg:start, then npm run start:go.');
const args = process.argv.slice(2);
if (new Set(args).size !== args.length || args.some(arg => !['--configured','--partner-resources','--actor-rollout'].includes(arg)) || (args.includes('--partner-resources') && args.includes('--actor-rollout')))
  throw new Error('Use --configured for the empty launch policy; choose at most one experimental option: --partner-resources or --actor-rollout.');
const web = resolve(root, 'web');
const webRequire = createRequire(new URL('../web/package.json', import.meta.url));
const tsc = resolve(webRequire.resolve('typescript/package.json'), '../bin/tsc');
const vite = resolve(webRequire.resolve('vite/package.json'), '../bin/vite.js');
const port = Number(process.env.PORT || '4174');
let child, interrupted = false;
function stop(signal) {
  interrupted = true;
  child?.kill(signal);
}
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
async function run(executable, commandArgs, cwd = root) {
  if (interrupted) throw Error('Startup stopped.');
  child = spawn(executable, commandArgs, {
    cwd, env:{...process.env,VITE_BACKEND:'go'}, stdio:'inherit', windowsHide:true,
  });
  const code = await new Promise((done, fail) => {
    child.once('error', fail);
    child.once('close', done);
  });
  child = undefined;
  if (interrupted) throw Error('CardFord stopped.');
  if (code !== 0) throw Error(`Stage exited with code ${code}; see the output above.`);
}
try {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT must be between 1 and 65535.');
  console.log(`[1/5] Checking local port ${port}...`);
  await new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', error => fail(error.code === 'EADDRINUSE'
      ? Error(`Port ${port} is already in use. Stop the existing start:go or dev:go terminal with Ctrl+C, then retry. No build was started.`)
      : error));
    probe.listen(port, '127.0.0.1', () => probe.close(done));
  });
  console.log('[2/5] Building the Go backend...');
  await run('go', ['build', '-o', '.local/cardford.exe', './server/cmd/cardford']);
  console.log('[3/5] Checking frontend TypeScript (this step can be quiet)...');
  await run(process.execPath, [tsc, '-b'], web);
  console.log('[4/5] Building the Go-connected frontend...');
  await run(process.execPath, [vite, 'build'], web);
  console.log(`[5/5] Starting CardFord at http://127.0.0.1:${port}; keep this terminal open. Ctrl+C stops it.`);
  await run(resolve('.local/cardford.exe'), [
    '--migrations','web/server/records/migrations','--web','web/dist',
    ...(args.includes('--configured') ? ['--access-policy','server/internal/access/launch.json'] : []),
    ...(args.includes('--partner-resources') ? ['--reasoning','partner-resources'] : []),
    ...(args.includes('--actor-rollout') ? ['--reasoning','actor-rollout'] : []),
  ]);
} catch (error) {
  if (interrupted) console.log('CardFord stopped.');
  else { console.error(error.message); process.exitCode = 1; }
}
