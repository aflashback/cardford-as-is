// Trusted native Trix deal-sequence launcher. Concealed decks remain server-side.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const [path, ...extra] = process.argv.slice(2);
if (!path || extra.length)
  throw Error('Pass one private fixture JSON file containing id and twenty complete deals.');
if (!['local', 'test'].includes(process.env.APP_ENV))
  throw Error('Trix fixtures require explicit local/test environment.');
const child = spawn(process.execPath, ['scripts/start-go.mjs'], {
  cwd: root,
  env: { ...process.env, CARDFORD_TRIX_FIXTURE_FILE: resolve(path) },
  stdio: 'inherit',
  windowsHide: true,
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('error', (error) => {
  console.error(error.code);
  process.exitCode = 1;
});
child.on('close', (code) => {
  process.exitCode = code ?? 1;
});
