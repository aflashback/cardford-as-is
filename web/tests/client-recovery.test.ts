import assert from 'node:assert/strict';
import test from 'node:test';
import { api, ApiFailure, definiteFailure } from '../src/api/client.ts';
import { authEpoch, onAuthInvalidated, registerAuthRenewal } from '../src/api/authLifecycle.ts';
import {
  clearPendingCommands,
  PENDING_COMMAND_TTL_MS,
  readPending,
  restorePending,
  storePending,
} from '../src/api/pendingCommands.ts';
import type { SessionView } from '../shared/contracts.ts';

function storage(context: test.TestContext) {
  const values = new Map<string, string>();
  const descriptors = ['localStorage', 'sessionStorage'].map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  const fake = {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => {
      values.set(name, value);
    },
    removeItem: (name: string) => {
      values.delete(name);
    },
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
  };
  for (const [name] of descriptors)
    Object.defineProperty(globalThis, name, { configurable: true, value: fake });
  context.after(() => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  return values;
}
function fetchFixture(context: test.TestContext, value: typeof fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = value;
  context.after(() => {
    globalThis.fetch = original;
  });
}
const command = {
  commandId: '00000000-0000-4000-8000-000000000001',
  gameId: 'game-a',
  expectedRevision: 5,
  controlLeaseToken: 'lease-secret-a',
  action: { kind: 'play', card: 'C2' },
};
const view = { game: { id: 'game-a' }, controlLeaseToken: 'lease-secret-a' } as SessionView;

test('timeout and queue-capacity HTTP responses remain ambiguous for receipt recovery', () => {
  for (const status of [408, 429, 500, 502, 503])
    assert.equal(definiteFailure(new ApiFailure('Recover the original command.', status, 'SERVICE_UNAVAILABLE')), false);
  for (const status of [400, 401, 403, 409])
    assert.equal(definiteFailure(new ApiFailure('Confirmed rejection.', status, 'INVALID_COMMAND')), true);
  assert.equal(definiteFailure(new TypeError('Network failed')), false);
});

test('realtime admission Retry-After is retained for bounded reconnect backoff', async context => {
  storage(context);
  fetchFixture(context, async () => Response.json({code:'SERVICE_UNAVAILABLE',message:'Slow down.'},
    {status:429,headers:{'Retry-After':'2'}}));
  await assert.rejects(api('/api/realtime/negotiate','RealtimeNegotiateView',{}), error =>
    error instanceof ApiFailure && error.status === 429 && error.retryAfterMs === 2000);
});

test('one bounded deadline aborts a stalled fetch and keeps mutation outcome ambiguous', async (context) => {
  storage(context);
  let signal: AbortSignal | null | undefined;
  fetchFixture(context, async (_path, options) => {
    signal = options?.signal;
    return new Promise<Response>(() => undefined);
  });
  await assert.rejects(
    api('/api/session/actions', 'SessionView', command, 'POST', undefined, 20),
    (error) => {
      assert.ok(error instanceof ApiFailure);
      assert.equal(error.code, 'REQUEST_TIMEOUT');
      assert.equal(error.status, 503);
      assert.match(error.message, /outcome is unconfirmed/);
      return true;
    },
  );
  assert.equal(signal?.aborted, true);
});

test('the same deadline includes a stalled response body even if body consumption ignores abort', async (context) => {
  storage(context);
  let signal: AbortSignal | null | undefined;
  fetchFixture(context, async (_path, options) => {
    signal = options?.signal;
    return { ok: true, json: () => new Promise(() => undefined) } as unknown as Response;
  });
  await assert.rejects(
    api('/api/health', 'AcceptedView', undefined, 'GET', undefined, 20),
    (error) => error instanceof ApiFailure && error.code === 'REQUEST_TIMEOUT',
  );
  assert.equal(signal?.aborted, true);
});

test('external abort cancels fetch and response consumption with the caller reason', async (context) => {
  storage(context);
  const controller = new AbortController();
  const reason = new Error('caller cancelled');
  let signal: AbortSignal | null | undefined;
  fetchFixture(context, async (_path, options) => {
    signal = options?.signal;
    return { ok: true, json: () => new Promise(() => undefined) } as unknown as Response;
  });
  const request = api('/api/health', 'AcceptedView', undefined, 'GET', controller.signal, 1000);
  controller.abort(reason);
  await assert.rejects(request, (error) => error === reason);
  assert.equal(signal?.aborted, true);
});

test('a valid response finishes normally and invalid response never claims a mutation was rolled back', async (context) => {
  storage(context);
  fetchFixture(context, async () => Response.json({ accepted: true }));
  assert.deepEqual(await api('/api/health', 'AcceptedView', undefined, 'GET', undefined, 100), {
    accepted: true,
  });
  await assert.rejects(
    api('/api/session/actions', 'SessionView', command, 'POST', undefined, 100),
    (error) =>
      error instanceof ApiFailure &&
      error.code === 'INVALID_RESPONSE' &&
      !error.message.includes('unchanged'),
  );
});

test('reload restores the identical action envelope using the freshly verified lease without storing it', async (context) => {
  const values = storage(context);
  const operation = { path: '/api/session/actions', body: command };
  await storePending('session', operation, 'owner-a', 'game-a', 100);
  const serialized = [...values.values()].find((value) => value.includes('owner-a'))!;
  assert.ok(!serialized.includes('lease-secret-a'));
  assert.ok(!serialized.includes('history'));
  const restored = readPending('session', 'owner-a', 110)!;
  assert.deepEqual(await restorePending(restored, view), operation);
  assert.equal(await restorePending(restored, { ...view, controlLeaseToken: 'lease-secret-b' }), null);
  assert.equal(await restorePending(restored, { ...view, game: { id: 'game-b' } } as SessionView), null);
});

test('review reload preserves command, trial, alternative and revision without storing frames or analysis', async (context) => {
  const values = storage(context);
  const { action: _action, ...envelope } = command;
  const body = {
    ...envelope,
    trialId: '00000000-0000-4000-8000-000000000002',
    decisionId: 'decision-a',
    alternative: { kind: 'play', card: 'D3' },
  };
  const operation = { path: '/api/session/reviews/decision-a/trials', body };
  await storePending('review', operation, 'owner-a', 'game-a', 100);
  assert.deepEqual(await restorePending(readPending('review', 'owner-a', 101)!, view), operation);
  assert.ok(![...values.values()].some((value) => value.includes('frames') || value.includes('analysis')));
});

test('expired, different-owner, malformed and unexpected private pending payloads are discarded', async (context) => {
  const values = storage(context);
  const operation = { path: '/api/session/actions', body: command };
  await storePending('session', operation, 'owner-a', 'game-a', 100);
  assert.equal(readPending('session', 'owner-b', 101), null);
  await storePending('session', operation, 'owner-a', 'game-a', 100);
  assert.equal(readPending('session', 'owner-a', 100 + PENDING_COMMAND_TTL_MS), null);
  await assert.rejects(
    storePending(
      'session',
      { ...operation, body: { ...command, history: ['private'] } },
      'owner-a',
      'game-a',
    ),
  );
  values.set('cardford-pending-v1::session', '{malformed');
  assert.equal(readPending('session', 'owner-a'), null);
});

test('logout attempts and unauthenticated responses erase all durable pending envelopes', async (context) => {
  const values = storage(context);
  await storePending('session', { path: '/api/session/actions', body: command }, 'owner-a', 'game-a');
  fetchFixture(context, async () => Response.json({ accepted: true }));
  await api('/api/logout', 'AcceptedView', {});
  assert.equal(readPending('session', 'owner-a'), null);
  await storePending('session', { path: '/api/session/actions', body: command }, 'owner-a', 'game-a');
  globalThis.fetch = async () =>
    Response.json({ code: 'UNAUTHENTICATED', message: 'Session ended.' }, { status: 401 });
  await assert.rejects(api('/api/session', 'SessionView'));
  assert.equal(readPending('session', 'owner-a'), null);
  values.set('unrelated', 'keep');
  clearPendingCommands();
  assert.equal(values.get('unrelated'), 'keep');
});

test('a 401 invalidates mounted consumers and rejects an older private response', async (context) => {
  const values = storage(context);
  let finishOld!: (response: Response) => void;
  const oldResponse = new Promise<Response>((resolve) => { finishOld = resolve; });
  fetchFixture(context, async (path) =>
    String(path) === '/api/account'
      ? oldResponse
      : Response.json({ code: 'UNAUTHENTICATED', message: 'Session ended.' }, { status: 401 }),
  );
  values.set('cardford-go-pending-v1:tab:session', 'old-owner-intent');
  const before = authEpoch();
  let invalidations = 0;
  const disconnect = onAuthInvalidated(() => { invalidations++; });
  context.after(disconnect);
  const old = api('/api/account', 'PlatformAccountView');
  await assert.rejects(api('/api/identity', 'IdentityView'),
    (error) => error instanceof ApiFailure && error.status === 401);
  assert.equal(authEpoch(), before + 1);
  assert.equal(invalidations, 1);
  assert.equal(values.has('cardford-go-pending-v1:tab:session'), false);
  finishOld(Response.json({ playerId: 'old-owner' }));
  await assert.rejects(old,
    (error) => error instanceof ApiFailure && error.status === 401 && error.code === 'UNAUTHENTICATED');
  assert.equal(invalidations, 1);
});


test('typed expiry coalesces renewal and retries each original serialized mutation at most once',async t=>{
 storage(t);let renewals=0;let finish!:()=>void;
 const dispose=registerAuthRenewal(()=>{renewals++;return new Promise<boolean>(resolve=>{finish=()=>resolve(true);});},()=>{});t.after(dispose);
 const bodies:string[]=[];let calls=0;
 fetchFixture(t,async(_url,options)=>{bodies.push(String(options?.body));calls++;return calls<=2?Response.json({code:'session_renewal_required',message:'Renew.'},{status:401}):Response.json({accepted:true});});
 // Coordinator owns coalescing; mirror its shared operation at the boundary.
 let shared:Promise<boolean>|undefined;dispose();
 const remove=registerAuthRenewal(()=>shared??=(async()=>{renewals++;await new Promise<void>(resolve=>{finish=resolve;});return true;})(),()=>{});t.after(remove);
 const epoch=authEpoch();const a=api('/api/session/actions','AcceptedView',command),b=api('/api/session/actions','AcceptedView',command);
 for(let i=0;i<10 && !finish;i++)await Promise.resolve();
 assert.equal(renewals,1);finish();await Promise.all([a,b]);
 assert.equal(calls,4);assert.ok(bodies.every(body=>body===JSON.stringify(command)));assert.equal(authEpoch(),epoch);
});

test('a second typed expiry is never replayed again; passive presence cannot renew',async t=>{
 storage(t);let renewals=0;const remove=registerAuthRenewal(async()=>{renewals++;return true;},()=>{});t.after(remove);let calls=0;
 fetchFixture(t,async()=>{calls++;return Response.json({code:'session_renewal_required',message:'Renew.'},{status:401});});
 await assert.rejects(api('/api/session/actions','AcceptedView',command),error=>error instanceof ApiFailure&&error.code==='session_renewal_required');
 assert.equal(calls,2);assert.equal(renewals,1);
 await assert.rejects(api('/api/session/presence','AcceptedView',{}),error=>error instanceof ApiFailure&&error.code==='session_renewal_required');
 assert.equal(calls,3);assert.equal(renewals,1);
});

test('background reads preserve renewable expiry without refreshing or losing pending actions', async (t) => {
  storage(t);
  await storePending('session', { path: '/api/session/actions', body: command }, 'owner-a', 'game-a');
  const pending = readPending('session', 'owner-a');
  assert.ok(pending);
  const epoch = authEpoch();
  let renewals = 0;
  const remove = registerAuthRenewal(async () => { renewals++; return true; }, () => {});
  t.after(remove);
  let calls = 0;
  fetchFixture(t, async () => {
    calls++;
    return Response.json({ code: 'session_renewal_required', message: 'Continue.' }, { status: 401 });
  });

  for (const method of ['GET', 'HEAD']) {
    const before = calls;
    await assert.rejects(api('/api/platform/coach', 'AcceptedView', undefined, method),
      (error) => error instanceof ApiFailure && error.status === 401 && error.code === 'session_renewal_required');
    assert.equal(calls - before, 1, `${method} must not replay a background read`);
    assert.equal(renewals, 0, `${method} must wait for explicit user renewal`);
    assert.equal(authEpoch(), epoch);
    assert.deepEqual(readPending('session', 'owner-a'), pending);
  }
});
