import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAuthStatus } from '../shared/auth.validation.ts';

const base = { mode: 'keycloak', state:'signed-out',refreshUrl:'/auth/refresh',authenticated: false, loginUrl: '/auth/login', logoutUrl: '/auth/logout',
  accountUrl: 'https://localhost:8443/realms/cardford-local/account/' };

test('authentication bootstrap keeps identity credentials out and requires authenticated account/CSRF', () => {
  assert.equal(validateAuthStatus(base), true);
  const signedIn = { ...base, state:'authenticated',session:{id:'family-a',serverTime:new Date().toISOString(),accessExpiresAt:new Date(Date.now()+900_000).toISOString(),idleExpiresAt:new Date(Date.now()+90*86400_000).toISOString(),absoluteExpiresAt:new Date(Date.now()+180*86400_000).toISOString()},authenticated: true, csrfToken: 'x'.repeat(43),
    account: { id: 'internal-account', displayName: 'Local player', plan: 'free' } };
  assert.equal(validateAuthStatus(signedIn), true);
  assert.equal(validateAuthStatus({ ...signedIn, account: { ...signedIn.account, plan: 'admin' } }), false);
  const { csrfToken: _csrf, ...missingCSRF } = signedIn;
  assert.equal(validateAuthStatus(missingCSRF), false);
  assert.equal(validateAuthStatus({ ...base, accessToken: 'must-not-reach-browser' }), false);
  assert.equal(validateAuthStatus({ ...base, account: signedIn.account }), false);
});
