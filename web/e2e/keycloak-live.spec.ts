import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { tlsRequest } from '../../scripts/auth-common.mjs';

test.beforeEach(async ({}, info) => {
  test.skip(info.config.metadata.authProfile !== 'keycloak-live', 'Requires the explicit real-Keycloak profile.');
});
const configPath = fileURLToPath(new URL('../../.local/auth/config.json', import.meta.url));

async function codeFor(email: string, after: number): Promise<string> {
  const c = JSON.parse(readFileSync(configPath, 'utf8'));
  let found = '';
  await expect.poll(async () => {
    const response = await fetch(`${c.email.inboxOrigin}/messages`);
    const messages = await response.json() as Array<{to:string;receivedAt:string;raw:string}>;
    const message = messages.find(value => value.to.includes(email) && Date.parse(value.receivedAt) >= after);
    if (!message) return false;
    // Both text and HTML MIME parts carry the same generated code. Never print it.
    found = message.raw.match(/\b\d{6}\b/)?.[0] ?? '';
    return found !== '';
  }, { timeout: 20_000, message: 'Generated local OTP email arrives' }).toBe(true);
  return found;
}
async function submitOTP(page: Page, email: string, after: number, checkPolicy = false) {
  const field = page.locator('input[name="otp"],input[name="code"],input[name="emailCode"],input[autocomplete="one-time-code"]');
  await expect(field.first()).toBeVisible();
  const code = await codeFor(email, after);
  if (checkPolicy) {
    await page.getByRole('button', {name:'Resend code',exact:true}).click();
    await expect(page.getByText('Please wait 60 seconds before requesting another code.',{exact:true})).toBeVisible();
    const wrong = (code[0] === '0' ? '1' : '0') + code.slice(1);
    await field.first().fill(wrong);
    await page.getByRole('button', {name:'Verify email',exact:true}).click();
    await expect(field.first()).toBeVisible();
    expect(new URL(page.url()).port).toBe('8443');
  }
  await field.first().fill(code);
  await page.getByRole('button', {name:'Verify email',exact:true}).click();
  await expect(page).toHaveURL(/^https:\/\/localhost:4443\/$/);
}

test('real registration, OTP, browser replacement and logout preserve account ownership', async ({browser, page}, info) => {
  const email = `auth-check-${randomUUID().slice(0,8)}@cardford.test`;
  const after = Date.now() - 1000;
  let socketFrames = 0;
  let openedSockets = 0;
  let activeSockets = 0;
  page.on('websocket', socket => {
    if (new URL(socket.url()).pathname !== '/api/realtime/connect') return;
    openedSockets++; activeSockets++;
    socket.on('close', () => { activeSockets--; });
    socket.on('framereceived', () => { socketFrames++; });
  });
  await page.goto('/');
  await page.screenshot({path:info.outputPath('welcome.png')});
  await page.getByRole('button', {name:'Sign in or create an account'}).click();
  await page.getByRole('link', {name:'Create account',exact:true}).click();
  await expect(page.getByRole('heading', {name:'Create your account',exact:true})).toBeVisible();
  await expect(page.getByLabel('Display name (optional)', {exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('keycloak-registration.png')});
  for (const [name, value] of Object.entries({email,username:email})) {
    const input = page.locator(`input[name="${name}"]`);
    if (await input.count() && await input.first().isVisible()) await input.first().fill(value);
  }
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.locator('input[name="lastName"]')).toHaveCount(0);
  await page.locator('#kc-register-form [type="submit"]').click();
  // Registration alone is not sufficient to receive an application session.
  const probe = await page.context().newPage();
  await probe.goto('/');
  const beforeOTP = await probe.evaluate(async () => (await fetch('/api/auth/status')).json());
  expect(beforeOTP.authenticated).toBe(false);
  await probe.close();
  const boot = page.waitForResponse(response => new URL(response.url()).pathname === '/api/realtime/snapshot' && response.status() === 200).then(response=>response.json());
  const opening = page.waitForResponse(response => new URL(response.url()).pathname === '/api/sessions' && response.request().method() === 'POST' && response.ok()).then(response=>response.json());
  await submitOTP(page, email, after, true);
  const snapshot = await boot;
  expect(snapshot.view.catalog.some((entry:{start:{allowed:boolean}}) => entry.start.allowed)).toBe(true);
  const created = await opening;
  expect(typeof created.gameId).toBe('string');
  const resume = page.getByRole('button', {name:'Resume game',exact:true});
  await expect(resume).toBeVisible();
  expect(openedSockets).toBe(0);
  const resumed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session/playback' && response.request().method() === 'POST' && response.ok());
  await resume.click();
  expect((await (await resumed).json()).running).toBe(true);
  await expect.poll(()=>activeSockets, {message:'Explicit accepted Resume opens one game socket'}).toBe(1);
  await expect.poll(()=>socketFrames, {message:'Real receive-only game socket delivers committed updates'}).toBeGreaterThan(0);
  await page.getByRole('button', {name:'Pause game',exact:true}).click();
  await expect.poll(()=>activeSockets, {message:'Pause closes the game socket immediately'}).toBe(0);
  // A commit may arrive in an HTTP recovery snapshot rather than a socket frame.
  // Read the durable deadline independently of the receive-only delivery check.
  const paused = await page.evaluate(async () => {
    const response = await fetch('/api/realtime/snapshot', {headers:{'X-Tricks-Tab':sessionStorage.getItem('tricks-tab') ?? ''}});
    if (!response.ok) throw new Error('Authorized paused snapshot unavailable.');
    const value = await response.json();
    return {gameId:value.view.session?.gameId,expiresAt:value.playback.expiresAt,running:value.playback.running};
  });
  expect(paused.gameId).toBe(created.gameId);
  expect(paused.running).toBe(false);
  expect(typeof paused.expiresAt).toBe('string');
  const originalDeadline = paused.expiresAt;
  await page.goto('/#account');
  await expect(page.getByRole('heading', {name:'Account.',exact:true})).toBeVisible();
  const first = await page.evaluate(async () => (await fetch('/api/auth/status')).json());
  expect(first.authenticated).toBe(true);
  expect(first.account.plan).toBe('free');
  expect(first.state).toBe('authenticated');
  const hardLifetime = Date.parse(first.session.absoluteExpiresAt) - Date.parse(first.session.serverTime);
  expect(hardLifetime).toBeGreaterThan(179 * 86400_000);
  expect(hardLifetime).toBeLessThanOrEqual(180 * 86400_000);
  // Accelerate only this synthetic account's access lease. The real provider
  // still redeems/rotates its actual refresh credential over verified TLS.
  const local = JSON.parse(readFileSync(configPath, 'utf8'));
  const database = new URL(local.databaseUrl); database.searchParams.delete('sslmode');
  const connection = new pg.Client({connectionString:database.toString(), ssl:{ca:readFileSync(local.caFile,'utf8')}});
  await connection.connect();
  try {
    await connection.query('SET search_path TO cardford_auth_local, public');
    const result = await connection.query('UPDATE cardford_auth_local.m04_sessions SET expires_at=clock_timestamp()+interval \'30 seconds\' WHERE owner_id=$1 AND revoked_at IS NULL', [first.account.id]);
    expect(result.rowCount).toBe(1);
  } finally { await connection.end(); }
  const renewed = await page.evaluate(async () => {
    const status = await (await fetch('/api/auth/status')).json();
    const response = await fetch('/auth/refresh', {method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':status.csrfToken},body:'{}'});
    if (!response.ok) throw Error('Real provider renewal failed.');
    return response.json();
  });
  expect(renewed.session.id).toBe(first.session.id);
  expect(renewed.account.id).toBe(first.account.id);
  expect(renewed.session.absoluteExpiresAt).toBe(first.session.absoluteExpiresAt);
  expect(Date.parse(renewed.session.accessExpiresAt)-Date.parse(renewed.session.serverTime)).toBeGreaterThan(14 * 60_000);
  execFileSync(fileURLToPath(new URL('../../.local/auth/cardford-auth.exe', import.meta.url)),
    ['-config',configPath,'-grant-account',first.account.id,'-grant-duration','1h','-grant-reason','Automated local access verification'],
    {timeout:15_000,windowsHide:true,stdio:'pipe'});
  await page.reload();
  await expect(page.getByText('Paid',{exact:true})).toBeVisible();

  // Paused Account screens retain no recurring auth/game traffic. Browser B
  // revokes server authority; A discovers replacement on its next foreground check.
  await page.clock.install();
  await page.reload();
  await expect(page.getByText('Paid',{exact:true})).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  let automaticStatusChecks = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/auth/status') automaticStatusChecks++;
  });

  const other = await browser.newContext();
  try {
    const second = await other.newPage();
    const secondAfter = Date.now() - 1000;
    await second.goto('/');
    await second.getByRole('button', {name:'Sign in or create an account'}).click();
    await second.locator('input[name="username"]').fill(email);
    await second.locator('form [type="submit"]').last().click();
    const recovered = second.waitForResponse(response => new URL(response.url()).pathname === '/api/realtime/snapshot' && response.status() === 200).then(response=>response.json());
    await submitOTP(second, email, secondAfter);
    const recovery = await recovered;
    expect(recovery.view.session.gameId).toBe(created.gameId);
    expect(recovery.playback.expiresAt).toBe(originalDeadline);
    expect(recovery.playback.running).toBe(false);
    await second.goto('/#account');
    await expect(second.getByRole('heading', {name:'Account.',exact:true})).toBeVisible();
    const next = await second.evaluate(async () => (await fetch('/api/auth/status')).json());
    expect(next.account.id).toBe(first.account.id);
    expect(next.account.plan).toBe('paid');
    const checksBefore = automaticStatusChecks;
    await page.clock.fastForward(31_000);
    expect(automaticStatusChecks).toBe(checksBefore);
    expect(activeSockets).toBe(0);
    const checkedOnReturn = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/status' && response.status() === 200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    expect((await (await checkedOnReturn).json()).authenticated).toBe(false);
    await expect(page.getByRole('heading', {name:'Account.',exact:true})).toHaveCount(0);
    await expect(page.getByRole('heading', {name:first.account.displayName,exact:true})).toHaveCount(0);
    await expect(page.getByRole('heading', {name:'Good cards. Better company.'})).toBeVisible();
    const oldStatus = await page.evaluate(async () => (await fetch('/api/auth/status')).json());
    expect(oldStatus.authenticated).toBe(false);
    const oldIdentityStatus = await page.evaluate(async () => (await fetch('/api/identity', {headers:{'X-Tricks-Tab':'auth-live-old-browser'}})).status);
    expect(oldIdentityStatus).toBe(401);
    const forgedLogout = await second.evaluate(async () => (await fetch('/auth/logout', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status);
    expect(forgedLogout).toBe(403);
    // A real provider-generated, signed logout must reach the private HTTPS
    // bridge and revoke remembered authority without a browser cookie or CSRF.
    const adminProof = await tlsRequest('https://localhost:8443/realms/master/protocol/openid-connect/token', {
      method:'POST', caFile:local.caFile, headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:local.keycloak.adminUsername,password:local.keycloak.adminPassword}).toString(),
    });
    expect(adminProof.status).toBe(200);
    const adminHeaders = {Authorization:`Bearer ${JSON.parse(adminProof.body).access_token}`};
    const providerUsers = await tlsRequest(`https://localhost:8443/admin/realms/cardford/users?email=${encodeURIComponent(email)}&exact=true`, {caFile:local.caFile,headers:adminHeaders});
    expect(providerUsers.status).toBe(200);
    const identities = JSON.parse(providerUsers.body);
    expect(identities.length).toBe(1);
    const externalLogout = await tlsRequest(`https://localhost:8443/admin/realms/cardford/users/${identities[0].id}/logout`, {method:'POST',caFile:local.caFile,headers:adminHeaders});
    expect(externalLogout.status).toBe(204);
    await expect.poll(async () => (await second.evaluate(async () => (await fetch('/api/auth/status')).json())).authenticated,
      {message:'Signed provider backchannel logout revokes the app login'}).toBe(false);
    await second.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(second.getByRole('heading', {name:'Good cards. Better company.'})).toBeVisible();
    const thirdAfter = Date.now() - 1000;
    await second.getByRole('button', {name:'Sign in or create an account'}).click();
    await second.locator('input[name="username"]').fill(email);
    await second.locator('form [type="submit"]').last().click();
    await submitOTP(second, email, thirdAfter);
    await second.goto('/#account');
    await expect(second.getByRole('heading', {name:'Account.',exact:true})).toBeVisible();
    await second.getByRole('button', {name:'Sign out',exact:true}).click();
    await expect(second.getByRole('heading', {name:'Good cards. Better company.'})).toBeVisible();
    const loggedOut = await second.evaluate(async () => (await fetch('/api/auth/status')).json());
    expect(loggedOut.authenticated).toBe(false);
  } finally { await other.close(); }
});
