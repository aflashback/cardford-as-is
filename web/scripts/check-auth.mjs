// Focused auth proof: real PostgreSQL tests use disposable schemas, never the development account data.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { config, nativeGoEnv, root, tokenKey } from '../../scripts/auth-common.mjs';

const c = config();
const secrets = [c.clientSecret, c.resources.pgPassword, c.resources.appPassword,
  c.keycloak.adminPassword, c.keycloak.databasePassword, c.controlToken, c.tokenKeyFile ? tokenKey(c) : undefined].filter(Boolean);
const redact = value => secrets.reduce((text, secret) => text.replaceAll(secret, '[redacted]'), value ?? '');
function check(label, executable, args, env = process.env) {
  console.log(`\n${label}`);
  const result = spawnSync(executable, args, { cwd: root, env, windowsHide: true, encoding: 'utf8',
    timeout: 150_000, maxBuffer: 16 << 20 });
  process.stdout.write(redact(result.stdout));
  process.stderr.write(redact(result.stderr));
  if (result.error || result.status !== 0) throw new Error(`${label} failed (${result.error?.code ?? result.status}).`);
}
check('Generated authentication contract', process.execPath, ['web/scripts/generate-auth-contracts.mjs', '--check']);
const nodeTests = ['web/tests/auth-contract.test.ts', 'web/tests/keycloak-browser-auth.test.ts',
  'web/tests/client-recovery.test.ts', 'web/tests/realtime-stream.test.ts', 'web/tests/rally-coach-auth-cleanup.test.ts',
  'scripts/auth-common.test.mjs', 'scripts/auth-account-console.test.mjs', 'scripts/auth-backchannel.test.mjs'];
check('Critical browser/transport and setup boundaries', process.execPath, ['--test', '--test-isolation=none', ...nodeTests]);
check('Go identity and session boundaries with isolated native PostgreSQL',
  join(root, '.local/windows-tools/go1.26.8/go/bin/go.exe'),
  ['test', './server/internal/authn', './server/internal/authsession', './server/internal/http', './server/internal/records', './server/internal/service', './server/cmd/cardford-auth',
    '-run', '^(TestAuth|TestOIDC)', '-count=1', '-timeout=90s'],
  { ...nativeGoEnv(), DATABASE_URL: c.databaseUrl, TEST_DATABASE_URL: c.testDatabaseUrl, NODE_EXTRA_CA_CERTS:c.caFile });
console.log('\nFocused authentication checks passed. Real Keycloak browser acceptance: npm run test:auth:live.');
