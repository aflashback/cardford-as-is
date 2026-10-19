import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { authRoot, containerName, validateConfig, withinAuth, waitReady, pins } from './auth-common.mjs';
import { realmDefinition } from './auth-realm.mjs';
const token = 'a'.repeat(64);
function fixture() {
  return { schemaVersion: 1, address: '127.0.0.1:4179', origin: 'https://localhost:4443', issuer: 'https://localhost:8443/realms/cardford', clientId: 'cardford', clientSecret: token, controlToken: token,
    databaseUrl: `postgres://cardford_auth_app:${token}@127.0.0.1:54332/cardford_auth_local_dev?sslmode=require`, testDatabaseUrl: `postgres://cardford_auth_app:${token}@127.0.0.1:54332/cardford_auth_local_test?sslmode=require`,
    caFile: join(authRoot, 'tls/ca.pem'), tls: { certFile: join(authRoot, 'tls/server.pem'), keyFile: join(authRoot, 'tls/server-key.pem') },
    resources: { root: authRoot, container: containerName, pgPort: 54332, pgPassword: token, appPassword: token, gateway: '172.17.64.1', vmAddress: '172.17.74.11' },
    keycloak: { databasePassword: token, adminPassword: token },
  };
}
test('config rejects foreign database, container, root and origin identities', () => {
  assert.equal(validateConfig(fixture()).clientId, 'cardford');
  for (const mutate of [c => c.resources.root = join(authRoot, '..'), c => c.resources.container = 'another-container',
    c => c.resources.pgPort = 54331, c => c.origin = 'https://attacker.test', c => c.databaseUrl = c.databaseUrl.replace('cardford_auth_local_dev', 'cardford_windows'),
    c => c.testDatabaseUrl = c.testDatabaseUrl.replace('127.0.0.1', '192.168.1.2'), c => c.clientSecret = "x';DROP ROLE x;--",
    c => c.tls.keyFile = join(authRoot, '../other-key.pem')]) {
    const c = fixture(); mutate(c); assert.throws(() => validateConfig(c));
  }
});
test('local admin password rotation preserves generated service-secret checks', () => {
  const c = fixture(); c.keycloak.adminPassword = 'local-review-password';
  assert.equal(validateConfig(c), c);
  for (const value of ['', undefined, 123, 'line\nbreak', 'x'.repeat(1025)]) {
    const invalid = fixture(); invalid.keycloak.adminPassword = value;
    assert.throws(() => validateConfig(invalid), /administrator password format/);
  }
  for (const mutate of [c => c.clientSecret = 'short', c => c.controlToken = 'short',
    c => c.resources.pgPassword = 'short', c => c.resources.appPassword = 'short',
    c => c.keycloak.databasePassword = 'short']) {
    const invalid = fixture(); mutate(invalid);
    assert.throws(() => validateConfig(invalid), /local secret format/);
  }
});

test('scoped paths reject auth root itself and traversal', () => {
  assert.equal(withinAuth(join(authRoot, 'postgres/data')), join(authRoot, 'postgres/data'));
  assert.throws(() => withinAuth(authRoot)); assert.throws(() => withinAuth(join(authRoot, '../windows-postgres')));
});
test('readiness has a bounded attempt ceiling and accepts only successful checks', async () => {
  let attempts = 0;
  await assert.rejects(waitReady(() => { attempts++; throw Error('not-ready'); }, { attempts: 3, interval: 1 }), /deadline/);
  assert.equal(attempts, 3);
  attempts = 0; await waitReady(() => ++attempts === 2, { attempts: 3, interval: 1 }); assert.equal(attempts, 2);
});
test('explicit reset confirmation gates all state access', () => {
  const result = spawnSync(process.execPath, ['scripts/dev-auth.mjs', 'reset'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  assert.equal(result.status, 1); assert.match(result.stderr, /Explicit reset required/);
});
test('realm normal login, signup and optional second factor preserve email proof', () => {
  const realm = realmDefinition(fixture());
  assert.equal(realm.registrationAllowed, true);
  const browser = realm.authenticationFlows.find(x => x.alias === 'cardford-email-forms');
  assert.deepEqual(browser.authenticationExecutions.slice(0, 2).map(x => [x.authenticator, x.requirement]), [['auth-username-form', 'REQUIRED'], ['cardford-bounded-email-otp', 'REQUIRED']]);
  const registration = realm.authenticationFlows.find(x => x.alias === realm.registrationFlow);
  assert.equal(registration.authenticationExecutions[0].authenticator, 'registration-page-form');
  assert.equal(registration.authenticationExecutions[1].authenticator, 'cardford-bounded-email-otp');
  assert.equal(registration.authenticationExecutions[1].requirement, 'REQUIRED');
  const factor = realm.authenticationFlows.find(x => x.alias === 'cardford-second-factor');
  assert.deepEqual(factor.authenticationExecutions.map(x => x.authenticator), ['conditional-user-configured', 'auth-otp-form', 'auth-recovery-authn-code-form']);
  assert.ok(realm.requiredActions.every(x => !x.defaultAction));
  assert.ok(realm.authenticationFlows.every(x => x.authenticationExecutions.every(y => !/magic-form|login-token/.test(y.authenticator ?? ''))));
  const client = realm.clients[0]; assert.equal(client.publicClient, false); assert.equal(client.directAccessGrantsEnabled, false); assert.equal(client.serviceAccountsEnabled, false);
  assert.deepEqual(client.redirectUris, ['https://localhost:4443/auth/callback']);
});
test('runtime and provider pins require immutable hashes', () => {
  assert.match(pins.keycloak.image, /:26\.8\.1@sha256:[a-f0-9]{64}$/);
  assert.match(pins.emailOtp.sha256, /^[a-f0-9]{64}$/); assert.match(pins.emailOtp.sourceCommit, /^[a-f0-9]{40}$/);
});

test('player realm bounds online refresh and configures signed backchannel logout', () => {
  const realm = realmDefinition(fixture());
  assert.equal(realm.accessTokenLifespan, 15 * 60);
  assert.equal(realm.ssoSessionIdleTimeout, 90 * 86400);
  assert.equal(realm.ssoSessionMaxLifespan, 180 * 86400);
  assert.equal(realm.revokeRefreshToken, true);
  assert.equal(realm.refreshTokenMaxReuse, 0);
  const client = realm.clients[0];
  assert.equal(client.attributes['client.session.idle.timeout'], String(90 * 86400));
  assert.equal(client.attributes['client.session.max.lifespan'], String(180 * 86400));
  assert.equal(client.attributes['backchannel.logout.url'], 'https://cardford-db:4444/auth/backchannel-logout');
  assert.equal(client.attributes['backchannel.logout.session.required'], 'true');
  assert.ok(!client.optionalClientScopes.includes('offline_access'));
});
