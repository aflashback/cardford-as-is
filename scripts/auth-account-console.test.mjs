import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAccountConsole, reconcileSeedAccountRoles } from './auth-configure.mjs';

test('account console accepts only its explicit issuer origin without replacing client settings', async () => {
  const calls = [];
  const client = { id: 'console-id', clientId: 'account-console', webOrigins: [], publicClient: true, attributes: { 'pkce.code.challenge.method': 'S256' } };
  const admin = async (path, options) => {
    calls.push({ path, options });
    return options ? null : [client];
  };
  await reconcileAccountConsole(admin, 'https://localhost:8443/realms/cardford');
  assert.deepEqual(calls, [
    { path: '/clients?clientId=account-console', options: undefined },
    { path: '/clients/console-id', options: { method: 'PUT', body: { webOrigins: ['https://localhost:8443'] } } },
  ]);
  assert.deepEqual(client.webOrigins, []);
});

test('account console reconciliation is idempotent and preserves existing origins', async () => {
  const origins = ['https://localhost:8443'];
  let writes = 0;
  await reconcileAccountConsole(async (_path, options) => {
    if (options) writes++;
    return [{ id: 'console-id', webOrigins: origins }];
  }, 'https://localhost:8443/realms/cardford');
  assert.equal(writes, 0);
  assert.deepEqual(origins, ['https://localhost:8443']);
});

test('account console reconciliation rejects an ambiguous target', async () => {
  for (const clients of [[], [{ id: 'one' }, { id: 'two' }]]) {
    await assert.rejects(reconcileAccountConsole(async (_path, options) => {
      assert.equal(options, undefined);
      return clients;
    }, 'https://localhost:8443/realms/cardford'), /exactly one local account-console/);
  }
});

test('seed role repair targets only existing named seeds and adds the normal default role', async () => {
  const calls = [];
  const role = { id: 'default-id', name: 'default-roles-cardford' };
  const admin = async (path, options) => {
    calls.push({path, options});
    if (options) return null;
    if (path === '/roles/default-roles-cardford') return role;
    if (path.includes('username=player')) return [{id:'seed-player'}];
    if (path.includes('username=second')) return [{id:'seed-second'}];
    if (path.includes('username=removed')) return [];
    if (path === '/users/seed-player/role-mappings/realm') return [];
    if (path === '/users/seed-second/role-mappings/realm') return [role];
    throw Error('Unexpected admin access '+path);
  };
  await reconcileSeedAccountRoles(admin, [{username:'player@cardford.test'}, {username:'second@cardford.test'}, {username:'removed@cardford.test'}]);
  assert.deepEqual(calls.filter(x=>x.options), [{path:'/users/seed-player/role-mappings/realm', options:{method:'POST',body:[role]}}]);
});
