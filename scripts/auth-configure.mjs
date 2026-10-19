import { pathToFileURL } from 'node:url';
import { config, tlsRequest } from './auth-common.mjs';
import { realmDefinition } from './auth-realm.mjs';

// AUTH-LOCAL-010: the browser-based account console exchanges codes itself.
// Its built-in client needs the exact public issuer origin behind our TLS proxy.
export async function reconcileAccountConsole(admin, issuer) {
  const clients = await admin('/clients?clientId=account-console');
  if (clients.length !== 1) throw Error('Expected exactly one local account-console client.');
  const client = clients[0];
  const origin = new URL(issuer).origin;
  const origins = client.webOrigins ?? [];
  if (!origins.includes(origin)) {
    await admin(`/clients/${client.id}`, { method: 'PUT', body: { webOrigins: [...origins, origin] } });
  }
}

// Imported fixture identities can predate default-role assignment. Restore the
// same self-service defaults new registrations receive, only for named seeds.
export async function reconcileSeedAccountRoles(admin, seeds) {
  const defaultRole = await admin('/roles/default-roles-cardford');
  for (const seed of seeds) {
    const matches = await admin(`/users?exact=true&username=${encodeURIComponent(seed.username)}`);
    if (matches.length === 0) continue; // Do not recreate intentionally removed accounts.
    if (matches.length !== 1) throw Error('Expected at most one local seed identity.');
    const path = `/users/${matches[0].id}/role-mappings/realm`;
    const roles = await admin(path);
    if (!roles.some(role => role.id === defaultRole.id)) {
      await admin(path, { method: 'POST', body: [defaultRole] });
    }
  }
}

// Server-side setup only. The consumer app has no admin token or manage-users role.
export async function reconcileRealm(c) {
  const tokenResponse = await tlsRequest('https://localhost:8443/realms/master/protocol/openid-connect/token', {
    method: 'POST', caFile: c.caFile, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: c.keycloak.adminUsername, password: c.keycloak.adminPassword }).toString(),
  });
  if (tokenResponse.status !== 200) throw Error(`Local setup administrator authentication failed (${tokenResponse.status}).`);
  const token = JSON.parse(tokenResponse.body).access_token;
  const admin = async (path, { method = 'GET', body, allowed = [200, 201, 204] } = {}) => {
    const response = await tlsRequest(`https://localhost:8443/admin/realms/cardford${path}`, { method, caFile: c.caFile,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (!allowed.includes(response.status)) throw Error(`Local realm reconcile failed (${method} ${path}, ${response.status}).`);
    return response.body ? JSON.parse(response.body) : null;
  };
  const definition = realmDefinition(c);
  // Repair only our initial local custom registration flow if it predates the stock provider name.
  let registration;
  try { registration = await admin('/authentication/flows/cardford-registration/executions'); } catch { registration = null; }
  if (!registration || !registration.some(x => x.providerId === 'registration-page-form')) {
    await admin('', { method: 'PUT', body: { registrationFlow: 'registration' } });
    const flows = await admin('/authentication/flows');
    for (const alias of ['cardford-registration', 'cardford-registration-form']) {
      const value = flows.find(x => x.alias === alias);
      if (value) await admin(`/authentication/flows/${value.id}`, { method: 'DELETE', allowed: [204, 404] });
    }
    await admin('/authentication/flows/registration/copy', { method: 'POST', body: { newName: 'cardford-registration' } });
    registration = await admin('/authentication/flows/cardford-registration/executions');
  }
  for (const execution of registration.filter(x => x.providerId === 'registration-password-action' && x.requirement !== 'DISABLED')) {
    await admin('/authentication/flows/cardford-registration/executions', { method: 'PUT', body: { ...execution, requirement: 'DISABLED' } });
  }
  for (const alias of ['cardford-registration', 'cardford-email-forms']) {
    let executions = await admin(`/authentication/flows/${alias}/executions`);
    if (!executions.some(x => x.providerId === 'cardford-bounded-email-otp')) {
      await admin(`/authentication/flows/${alias}/executions/execution`, { method: 'POST', body: { provider: 'cardford-bounded-email-otp' } });
      executions = await admin(`/authentication/flows/${alias}/executions`);
    }
    for (const execution of executions.filter(x => x.providerId === 'cardford-bounded-email-otp')) {
      if (execution.requirement !== 'REQUIRED') await admin(`/authentication/flows/${alias}/executions`, { method: 'PUT', body: { ...execution, requirement: 'REQUIRED' } });
    }
    for (const old of executions.filter(x => x.providerId === 'ext-email-otp')) await admin(`/authentication/executions/${old.id}`, { method: 'DELETE' });
    // The normal login asks for email proof before optional TOTP/recovery.
    if (alias === 'cardford-email-forms') for (let i = 0; i < 8; i++) {
      executions = await admin(`/authentication/flows/${alias}/executions`);
      const email = executions.find(x => x.providerId === 'cardford-bounded-email-otp');
      if (email.index <= 1) break;
      await admin(`/authentication/executions/${email.id}/raise-priority`, { method: 'POST' });
    }
  }
  // Reconcile settings without replacing users, credentials, sessions, or optional MFA enrollments.
  const { clients, authenticationFlows, authenticatorConfig, users, requiredActions, ...settings } = definition;
  await admin('', { method: 'PUT', body: settings });
  const existing = await admin('/clients?clientId=cardford');
  if (existing.length !== 1) throw Error('Expected exactly one local CardFord client.');
  await admin(`/clients/${existing[0].id}`, { method: 'PUT', body: clients[0] });
  await reconcileAccountConsole(admin, c.issuer);
  await reconcileSeedAccountRoles(admin, users);
  const profile = await admin('/users/profile');
  for (const attribute of profile.attributes ?? []) {
    if (attribute.name === 'firstName') {
      delete attribute.required;
      attribute.displayName = 'Display name';
      attribute.permissions = { view: ['admin', 'user'], edit: ['admin', 'user'] };
    } else if (attribute.name === 'lastName') {
      delete attribute.required;
      attribute.permissions = { view: ['admin'], edit: ['admin'] };
    } else if (attribute.name === 'email') {
      attribute.required = { roles: ['user'] };
    }
  }
  // Metadata only: preserve existing user attributes and all other profile validators/groups.
  await admin('/users/profile', { method: 'PUT', body: profile });
  // Account-console enrollment actions remain optional; recovery codes require explicit enrollment.
  for (const action of requiredActions) await admin(`/authentication/required-actions/${action.alias}`, { method: 'PUT', body: action });
  const browser = await admin('/authentication/flows/cardford-browser/executions');
  if (!browser.some(x => x.providerId === 'cardford-bounded-email-otp' && x.requirement === 'REQUIRED') || browser.some(x => /ext-email-otp|ext-magic|login-token/.test(x.providerId ?? '')))
    throw Error('Local browser flow is missing required Email OTP or includes a bypass execution.');
  console.log('Local realm reconciled: browser email OTP, passwordless registration, optional TOTP/recovery, confidential PKCE client.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await reconcileRealm(config());
