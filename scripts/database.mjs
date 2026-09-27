import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = path.join(root, '.local');
const container = 'tricks-coach-postgres';
const run = (...args) => spawnSync('podman', args, { encoding: 'utf8', windowsHide: true });
mkdirSync(local, { recursive: true });
const envPath = path.join(local, 'postgres.env');
if (!existsSync(envPath))
  writeFileSync(
    envPath,
    `POSTGRES_USER=tricks\nPOSTGRES_PASSWORD=${randomBytes(24).toString('hex')}\nPOSTGRES_DB=tricks_coach\n`,
  );
const password = readFileSync(envPath, 'utf8').match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1];
if (!password) throw new Error('Local PostgreSQL password is missing.');
const inspect = run('container', 'exists', container);
if (inspect.status === 0) {
  if (run('start', container).status !== 0) throw new Error('Could not start local PostgreSQL.');
} else {
  const result = run(
    'run',
    '-d',
    '--name',
    container,
    '-p',
    '127.0.0.1:54329:5432',
    '--env-file',
    envPath,
    '-v',
    'tricks-coach-data:/var/lib/postgresql/data',
    'docker.io/library/postgres:16',
  );
  if (result.status !== 0)
    throw new Error('Could not create local PostgreSQL. Check Podman availability and port 54329.');
}
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  if (run('exec', container, 'pg_isready', '-U', 'tricks', '-d', 'tricks_coach').status === 0) {
    ready = true;
    break;
  }
  await setTimeout(500);
}
if (!ready) throw new Error('PostgreSQL did not become ready.');
const databaseCheck = run(
  'exec',
  container,
  'psql',
  '-U',
  'tricks',
  '-d',
  'postgres',
  '-tAc',
  "SELECT 1 FROM pg_database WHERE datname='tricks_coach_test'",
);
if (
  !databaseCheck.stdout?.includes('1') &&
  run('exec', container, 'createdb', '-U', 'tricks', 'tricks_coach_test').status !== 0
)
  throw new Error('Could not create isolated test database.');
const envFile = path.join(root, '.env.local');
if (!existsSync(envFile))
  writeFileSync(
    envFile,
    `APP_ENV=local\nIDENTITY_MODE=local-test\nBILLING_MODE=fixture\nHOST=127.0.0.1\nPORT=4173\nAPP_ORIGIN=http://127.0.0.1:4173\nDATABASE_URL=postgres://tricks:${password}@127.0.0.1:54329/tricks_coach\nTEST_DATABASE_URL=postgres://tricks:${password}@127.0.0.1:54329/tricks_coach_test\nJEV_MODE=off\nJEV_MAX_REQUESTS=0\nOPENROUTER_API_KEY_FILE=C:/repos/test-jev/jev-token-openrouter.txt\n`,
  );
console.log('Local PostgreSQL ready on 127.0.0.1:54329; development and isolated test databases available.');
