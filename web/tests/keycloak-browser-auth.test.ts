import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthSession } from '../src/auth/session.ts';
import { api } from '../src/api/client.ts';
import { authEpoch, invalidateAuth, noteAcceptedAuthActivity } from '../src/api/authLifecycle.ts';
import { authCsrf, authMode, authModeFrom, configuredApiOrigin, apiUrl, authEndpoint, streamUrl, trustedAccountUrl } from '../src/auth/transport.ts';

const signedOut = {mode:'keycloak',state:'signed-out',refreshUrl:'/auth/refresh',authenticated:false,loginUrl:'/auth/login',logoutUrl:'/auth/logout',accountUrl:'https://localhost:8443/realms/cardford/account/'};
const signedIn = {...signedOut,state:'authenticated',session:{id:'family-a',serverTime:new Date().toISOString(),accessExpiresAt:new Date(Date.now()+900_000).toISOString(),idleExpiresAt:new Date(Date.now()+90*86400_000).toISOString(),absoluteExpiresAt:new Date(Date.now()+180*86400_000).toISOString()},authenticated:true,csrfToken:'a'.repeat(43),account:{id:'owner-a',displayName:'Ali',plan:'free'}};
function cleanup(t:test.TestContext, session:AuthSession) { t.after(()=>{session.stop();invalidateAuth();}); }

test('fixture remains the default; real mode and API authority require explicit build configuration', () => {
  assert.equal(authMode,'fixture');
  assert.equal(authModeFrom(undefined),'fixture');
  assert.equal(authModeFrom('keycloak'),'keycloak');
  assert.throws(()=>authModeFrom('url-selected-mode'));
  assert.equal(configuredApiOrigin(),null);
});

test('API and authentication links reject untrusted authorities and path escapes', () => {
  assert.equal(configuredApiOrigin('https://api.example.test'),'https://api.example.test');
  assert.equal(configuredApiOrigin('http://127.0.0.1:4179'),'http://127.0.0.1:4179');
  for (const origin of ['http://api.example.test','https://user:secret@api.example.test','https://api.example.test/other','https://api.example.test?origin=evil'])
    assert.throws(()=>configuredApiOrigin(origin));
  for (const path of ['https://evil.test/api/private','//evil.test/api/private','/api/../private','/api/../../auth/../private','/api/\\evil.test'])
    assert.throws(()=>apiUrl(path));
  assert.equal(authEndpoint('/auth/login','/auth/login','https://localhost:4443/#account'),'https://localhost:4443/auth/login');
  assert.throws(()=>authEndpoint('https://evil.test/auth/login','/auth/login','https://localhost:4443/'));
  assert.equal(trustedAccountUrl(signedOut.accountUrl,'https://localhost:8443'),signedOut.accountUrl);
  for (const url of ['https://evil.test/realms/cardford/account/','https://localhost:8443/realms/cardford/account/?next=evil','https://localhost:8443/admin/'])
    assert.throws(()=>trustedAccountUrl(url,'https://localhost:8443'));
});

test('receive-only stream accepts only the configured API and matching stream binding', () => {
  assert.equal(streamUrl('/api/realtime/connect?streamId=one','one','https://localhost:4443/'),'wss://localhost:4443/api/realtime/connect?streamId=one');
  for (const value of ['wss://evil.test/api/realtime/connect?streamId=one','/api/realtime/connect?streamId=two','/api/private?streamId=one'])
    assert.throws(()=>streamUrl(value,'one','https://localhost:4443/'));
});

test('an unauthenticated bootstrap makes no local enrollment or game request', async t => {
  const calls:string[] = [];
  const session = new AuthSession(async input => {calls.push(String(input));return Response.json(signedOut);});cleanup(t,session);
  assert.equal(session.getSnapshot().phase,'loading');
  await session.start();
  assert.equal(session.getSnapshot().phase,'signed-out');
  assert.deepEqual(calls,['/api/auth/status']);
  assert.equal(authCsrf(),null);
});

test('unsupported or incomplete server identity cannot authorize a table or plan', async t => {
  for (const value of [{...signedIn,csrfToken:undefined},{...signedIn,account:{...signedIn.account,plan:'admin'}},{...signedIn,account:{...signedIn.account,canPlay:true}}]) {
    const session = new AuthSession(async()=>Response.json(value));cleanup(t,session);
    await session.start();assert.equal(session.getSnapshot().phase,'error');assert.equal(authCsrf(),null);session.stop();
  }
});

test('401 clears authenticated display and pending CSRF; a late status cannot restore it', async t => {
  let complete:((value:Response)=>void)|undefined;
  let calls=0;
  const session = new AuthSession(async()=>++calls===1 ? Response.json(signedIn) : new Promise<Response>(resolve=>{complete=resolve;}));cleanup(t,session);
  await session.start();assert.equal(session.getSnapshot().phase,'authenticated');assert.equal(authCsrf(),signedIn.csrfToken);
  const pending=session.refresh();
  const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});
  globalThis.fetch=async()=>new Response(null,{status:401});
  await assert.rejects(api('/api/identity','IdentityView'),/session ended/);
  assert.equal(session.getSnapshot().phase,'ended');assert.equal(authCsrf(),null);
  complete?.(Response.json(signedIn));await pending;
  assert.equal(session.getSnapshot().phase,'ended');
});

test('same-account login replacement rotates auth epoch and CSRF before a fresh private mount', async t => {
  let status=signedIn;
  const session=new AuthSession(async()=>Response.json(status));cleanup(t,session);
  await session.start();const before=authEpoch();
  status={...signedIn,session:{...signedIn.session,id:'family-b'},csrfToken:'b'.repeat(43)};
  await session.refresh();
  assert.equal(session.getSnapshot().phase,'authenticated');assert.equal(authEpoch(),before+1);assert.equal(authCsrf(),status.csrfToken);
});

test('simultaneous foreground verification requests share one bounded fetch', async t => {
  let complete:((value:Response)=>void)|undefined;
  let calls=0;
  const session=new AuthSession(async()=>{calls++;return new Promise<Response>(resolve=>{complete=resolve;});});cleanup(t,session);
  const first=session.start();
  const second=session.refresh();
  assert.equal(calls,1);
  assert.equal(first,second);
  complete?.(Response.json(signedIn));
  await Promise.all([first,second]);
  assert.equal(session.getSnapshot().phase,'authenticated');
});

test('leaving the gate discards cached authorization before the next mount', async t => {
  let complete:((value:Response)=>void)|undefined;
  let calls=0;
  const session=new AuthSession(async()=>++calls===1 ? Response.json(signedIn) : new Promise<Response>(resolve=>{complete=resolve;}));cleanup(t,session);
  await session.start();
  assert.equal(session.getSnapshot().phase,'authenticated');
  session.stop();
  assert.equal(session.getSnapshot().phase,'loading');
  assert.equal(authCsrf(),null);
  const verification=session.start();
  assert.equal(session.getSnapshot().phase,'loading');
  complete?.(Response.json(signedOut));
  await verification;
  assert.equal(session.getSnapshot().phase,'signed-out');
});

test('logout hides private UI before sending CSRF protected server revocation', async t => {
  let session:AuthSession;
  const requests:{url:string;options?:RequestInit}[]=[];
  session=new AuthSession(async(input,options)=>{
    requests.push({url:String(input),options});
    if(options?.method==='POST') {assert.equal(session.getSnapshot().phase,'ended');return new Response(null,{status:204});}
    return Response.json(signedIn);
  });cleanup(t,session);
  await session.start();await session.logout('https://localhost:4443/#account');
  assert.equal(session.getSnapshot().phase,'signed-out');assert.equal(authCsrf(),null);
  assert.equal(requests[1].url,'https://localhost:4443/auth/logout');
  assert.equal(new Headers(requests[1].options?.headers).get('X-CSRF-Token'),signedIn.csrfToken);
});

test('returning from demo during pending logout bootstraps after revocation settles', async t => {
  let finishLogout:((value:Response)=>void)|undefined;
  let checks=0;
  const session=new AuthSession(async(_input,options)=>{
    if(options?.method==='POST') return new Promise<Response>(resolve=>{finishLogout=resolve;});
    return Response.json(++checks===1 ? signedIn : signedOut);
  });cleanup(t,session);
  await session.start();
  const logout=session.logout('https://localhost:4443/');
  session.stop();
  await session.start();
  assert.equal(session.getSnapshot().phase,'loading');
  finishLogout?.(new Response(null,{status:204}));
  await logout;
  assert.equal(session.getSnapshot().phase,'signed-out');
  assert.equal(checks,2);
});


test('idle access expiry clears private UI locally without recurring status or provider requests', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});
  let calls=0;
  const session=new AuthSession(async()=>{calls++;return Response.json(signedIn);});cleanup(t,session);
  await session.start();const epoch=authEpoch();
  t.mock.timers.tick(31_000);assert.equal(calls,1);
  t.mock.timers.tick(900_000);
  assert.equal(calls,1);assert.equal(session.getSnapshot().phase,'renewal-required');
  assert.equal(authEpoch(),epoch,'Access expiry must not impersonate replacement login');
});

test('renewal-required gate coalesces explicit Continue and keeps family epoch stable',async t=>{
  const {account:_account,...remembered}=signedIn;
  let renews=0;
  const session=new AuthSession(async(_url,options)=>{
    if(options?.method==='POST'){renews++;await Promise.resolve();return Response.json(signedIn);}
    return Response.json({...remembered,state:'renewal-required',authenticated:false});
  });cleanup(t,session);
  await session.start();assert.equal(session.getSnapshot().phase,'renewal-required');
  const epoch=authEpoch();
  await Promise.all([session.renew(),session.renew()]);
  assert.equal(renews,1);assert.equal(authEpoch(),epoch);assert.equal(session.getSnapshot().phase,'authenticated');
});


test('routine same-family refresh preserves epoch despite provider credential and CSRF rotation',async t=>{
 let status=signedIn;const session=new AuthSession(async()=>Response.json(status));cleanup(t,session);
 await session.start();const epoch=authEpoch();status={...signedIn,csrfToken:'b'.repeat(43),session:{...signedIn.session,accessExpiresAt:new Date(Date.now()+900_000).toISOString()}};
 await session.renew();assert.equal(authEpoch(),epoch);assert.equal(session.getSnapshot().phase,'authenticated');
});

test('lost refresh response is recovered by status without replaying rotation',async t=>{
 let reads=0,rotations=0;const session=new AuthSession(async(_input,options)=>{
  if(options?.method==='POST'){rotations++;throw new TypeError('Response lost');}
  reads++;return Response.json(signedIn);
 });cleanup(t,session);await session.start();const epoch=authEpoch();
 assert.equal(await session.renew(),true);assert.equal(rotations,1);assert.equal(reads,2);assert.equal(authEpoch(),epoch);
});


test('proactive renewal requires current play, trusted foreground interaction and accepted action',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});
 const original=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false}});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');});
 let posts=0,reads=0;const session=new AuthSession(async(_input,options)=>{
  if(options?.method==='POST')posts++;else reads++;
  return Response.json({...signedIn,session:{...signedIn.session,serverTime:new Date().toISOString(),accessExpiresAt:new Date(Date.now()+900_000).toISOString()}});
 });cleanup(t,session);await session.start();session.setPlayActive(true);const epoch=authEpoch();
 t.mock.timers.tick(839_000);assert.equal(posts,0);noteAcceptedAuthActivity();session.noteInteraction();
 t.mock.timers.tick(1000);await session.renew();
 assert.equal(posts,1);assert.equal(reads,1);assert.equal(authEpoch(),epoch);
 session.setPlayActive(false);t.mock.timers.tick(900_000);assert.equal(posts,1);
 assert.equal(session.getSnapshot().phase,'renewal-required');
});
