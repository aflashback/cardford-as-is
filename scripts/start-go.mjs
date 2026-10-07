// Explicit same-origin native Go + React local app. The original Node reader
// remains available separately for historical V1 records.
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (process.platform !== 'win32' || !process.env.DATABASE_URL)
  throw new Error('Start PostgreSQL, then run through scripts/windows-env.mjs.');
const args = process.argv.slice(2);
if (new Set(args).size !== args.length || args.some(arg => !['--configured','--partner-resources','--actor-rollout'].includes(arg)) || (args.includes('--partner-resources') && args.includes('--actor-rollout')))
  throw new Error('Use --configured for the empty launch policy; choose at most one experimental option: --partner-resources or --actor-rollout.');
for (const command of [
  ['go', 'build', '-o', '.local/cardford.exe', './server/cmd/cardford'],
  ['npm', 'run', 'build'],
]) {
  const child = spawnSync(process.execPath, ['scripts/windows-env.mjs', ...command], {
    cwd:root, env:{...process.env,VITE_BACKEND:'go'}, stdio:'inherit', windowsHide:true,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}
const child = spawn(resolve('.local/cardford.exe'), [
  '--migrations','web/server/records/migrations','--web','web/dist',
  ...(args.includes('--configured') ? ['--access-policy','server/internal/access/launch.json'] : []),
  ...(args.includes('--partner-resources') ? ['--reasoning','partner-resources'] : []),
  ...(args.includes('--actor-rollout') ? ['--reasoning','actor-rollout'] : []),
], {cwd:root,env:process.env,stdio:'inherit',windowsHide:true});
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
child.on('error',error=>{console.error(error.code);process.exitCode=1;});
child.on('close',code=>{process.exitCode=code ?? 1;});
