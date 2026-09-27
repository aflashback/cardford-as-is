import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadLocalEnvironment, readConfig } from '../config.ts';
import { createPool } from '../records/database.ts';
import { migrate } from '../records/migrations.ts';
import { createApp } from '../http/app.ts';
import type { SessionView, GameAction, Mode } from '../../shared/contracts.ts';
import { hashToken } from '../records/repository.ts';

loadLocalEnvironment();
const url = process.env.TEST_DATABASE_URL;
if (!url || url === process.env.DATABASE_URL || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Integration tests require a distinct _test database.');
const pool = createPool(url);
const config = readConfig({ ...process.env, APP_ENV: 'test', DATABASE_URL: url });
await migrate(pool);
const app = await createApp(config, pool);
const replica = await createApp(config, pool);
const errors: Error[] = [];
app.addHook('onError', async (_request, _reply, error) => {
  errors.push(error);
});
type App = typeof app;
async function client(server: App = app) {
  let cookie = '';
  const tab = randomUUID();
  const request = async (
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
    overrideTab?: string,
  ) => {
    const response = await server.inject({
      method,
      url: path,
      headers: {
        cookie,
        'x-tricks-tab': overrideTab ?? tab,
        'x-tricks-client': '1',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
    });
    const set = response.headers['set-cookie'];
    if (typeof set === 'string') cookie = set.split(';')[0];
    return response;
  };
  const first = await request('GET', '/api/session');
  assert.equal(first.statusCode, 200, JSON.stringify(first.json()));
  return {
    request,
    tab,
    get cookie() {
      return cookie;
    },
    view: first.json<SessionView>(),
  };
}
const command = (view: SessionView) => ({
  commandId: randomUUID(),
  gameId: view.game.id,
  expectedRevision: view.revision,
  controlLeaseToken: view.controlLeaseToken,
});
function noSecrets(value: unknown) {
  if (Array.isArray(value)) for (const item of value) noSecrets(item);
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      assert.ok(
        !['hands', 'deck', 'deals', 'seed', 'token_hash', 'observation', 'document'].includes(key),
        `private field ${key}`,
      );
      noSecrets(item);
    }
}

test('API creates durable safe views and rejects untrusted input and other owners', async () => {
  const a = await client(),
    b = await client();
  noSecrets(a.view);
  assert.equal(a.view.game.hand.length, 13);
  const bad = await a.request('POST', '/api/session/actions', {
    ...command(a.view),
    action: { kind: 'bid', bid: 2 },
    hands: [['SA']],
  });
  assert.equal(bad.statusCode, 400);
  const foreign = await b.request('POST', '/api/session/actions', {
    ...command(a.view),
    action: { kind: 'bid', bid: 2 },
  });
  assert.equal(foreign.statusCode, 404);
  const hostile = await app.inject({
    method: 'POST',
    url: '/api/session/control',
    headers: {
      cookie: a.cookie,
      'x-tricks-tab': a.tab,
      'x-tricks-client': '1',
      origin: 'https://evil.example',
    },
    payload: command(a.view),
  });
  assert.equal(hostile.statusCode, 403);
  const csrf = await app.inject({
    method: 'POST',
    url: '/api/session/control',
    headers: { cookie: a.cookie, 'x-tricks-tab': a.tab },
    payload: command(a.view),
  });
  assert.equal(csrf.statusCode, 403);
});

test('same command replay accepts once, changed digest fails, old revision and old lease fence', async () => {
  const c = await client();
  const newGame = await c.request('POST', '/api/sessions', {
    commandId: randomUUID(),
    mode: 'hearts',
    expectedActiveGameId: c.view.game.id,
  });
  const view = newGame.json<SessionView>();
  assert.equal(newGame.statusCode, 200);
  const body = { ...command(view), action: view.game.legalActions[0] };
  const first = await c.request('POST', '/api/session/actions', body);
  assert.equal(first.statusCode, 200, first.body);
  const retry = await c.request('POST', '/api/session/actions', body);
  assert.equal(retry.statusCode, 200);
  assert.deepEqual(retry.json(), first.json());
  const changed = await c.request('POST', '/api/session/actions', {
    ...body,
    action: view.game.legalActions[1],
  });
  assert.equal(changed.statusCode, 409);
  const stale = await c.request('POST', '/api/session/actions', { ...body, commandId: randomUUID() });
  assert.equal(stale.statusCode, 409);
  const next = first.json<SessionView>(),
    tab2 = randomUUID();
  const reader = await c.request('GET', '/api/session', undefined, tab2);
  assert.equal(reader.json<SessionView>().controlLeaseToken, 'view-only');
  const transfer = await c.request(
    'POST',
    '/api/session/control',
    { ...command(next), controlLeaseToken: 'view-only' },
    tab2,
  );
  assert.equal(transfer.statusCode, 200);
  const fenced = await c.request('POST', '/api/session/control', { ...command(next), expectedRevision: 999 });
  assert.equal(fenced.statusCode, 409);
  const old = await c.request('POST', '/api/session/notes', command(next));
  assert.equal(old.statusCode, 409);
  assert.equal(old.json().code, 'LEASE_LOST');
  const count = await pool.query<{ count: string }>('SELECT count(*) FROM game_events WHERE game_id=$1', [
    view.game.id,
  ]);
  assert.equal(count.rows[0].count, '1');
});

test('two application instances serialize 50 first-unlock requests into one remaining hand', async () => {
  const c = await client();
  const res = await c.request('POST', '/api/sessions', {
    commandId: randomUUID(),
    mode: 'hearts',
    expectedActiveGameId: c.view.game.id,
  });
  const view = res.json<SessionView>();
  const token = c.cookie.split('=')[1];
  const player = (
    await pool.query<{ player_id: string }>('SELECT player_id FROM sessions WHERE token_hash=$1', [
      hashToken(token),
    ])
  ).rows[0].player_id;
  await pool.query("UPDATE players SET profile=jsonb_set(profile,'{plan}','\"practice\"') WHERE id=$1", [
    player,
  ]);
  for (let hand = 100; hand < 103; hand++)
    await pool.query(
      "INSERT INTO coached_hands(player_id,game_id,hand_number,period) VALUES($1,$2,$3,(now() AT TIME ZONE 'UTC')::date)",
      [player, view.game.id, hand],
    );
  const attempts = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      (i % 2 ? app : replica).inject({
        method: 'POST',
        url: '/api/coaching/hand-unlocks',
        headers: { cookie: c.cookie, 'x-tricks-tab': c.tab, 'x-tricks-client': '1' },
        payload: {
          requestId: randomUUID(),
          gameId: view.game.id,
          handId: `${view.game.id}:1`,
          decisionId: view.decisionId,
          expectedRevision: view.revision,
          requestedLevel: 1,
          controlLeaseToken: view.controlLeaseToken,
        },
      }),
    ),
  );
  for (const result of attempts) assert.equal(result.statusCode, 200, result.body);
  const used = await pool.query<{ count: string }>('SELECT count(*) FROM coached_hands WHERE player_id=$1', [
    player,
  ]);
  assert.equal(used.rows[0].count, '4');
  const fresh = await c.request('GET', '/api/session');
  assert.equal(fresh.json<SessionView>().access.remainingHands, 0);
  const guidance = attempts[0].json().advice;
  assert.equal(guidance.suggestion, '');
  assert.equal(guidance.reason, '');
  assert.equal(guidance.pass, undefined);
});

for (const mode of ['hearts', 'spades-solo', 'spades-partners'] as Mode[])
  test(`complete a persisted ${mode} hand through safe HTTP commands`, async () => {
    const c = await client();
    let response = await c.request('POST', '/api/sessions', {
      commandId: randomUUID(),
      mode,
      expectedActiveGameId: c.view.game.id,
    });
    assert.equal(response.statusCode, 200, response.body);
    let view = response.json<SessionView>();
    let steps = 0;
    while (!['hand-end', 'match-end'].includes(view.game.phase) && steps++ < 100) {
      if (view.game.phase === 'trick-end')
        response = await c.request('POST', '/api/session/advance', {
          ...command(view),
          kind: 'collect-trick',
        });
      else if (view.game.legalActions.length) {
        const action: GameAction = view.game.legalActions[0];
        response = await c.request('POST', '/api/session/actions', { ...command(view), action });
      } else {
        const ready = await c.request('POST', '/api/session/prepare', command(view));
        assert.equal(ready.statusCode, 200, ready.body);
        response = await c.request('POST', '/api/session/advance', {
          ...command(view),
          kind: 'bot',
          preparedDecisionId: ready.json().preparedDecisionId,
        });
      }
      assert.equal(response.statusCode, 200, `${response.body}; ${errors.at(-1)?.message ?? ''}`);
      view = response.json<SessionView>();
      noSecrets(view);
    }
    assert.equal(view.game.phase, 'hand-end');
    assert.equal(view.game.history.length, 13);
    assert.equal(view.game.hand.length, 0);
    assert.ok(view.game.handResult);
    const restart = await replica.inject({
      method: 'GET',
      url: '/api/session',
      headers: { cookie: c.cookie, 'x-tricks-tab': c.tab },
    });
    assert.deepEqual(restart.json(), view);
    const reviews = await c.request('GET', '/api/session/reviews');
    assert.ok(reviews.json().cases.length >= 13);
    const original = await c.request(
      'GET',
      `/api/session/reviews/${encodeURIComponent(reviews.json().cases[0].decisionId)}`,
    );
    assert.equal(original.statusCode, 200);
    noSecrets(original.json());
    const next = await c.request('POST', '/api/session/next-hand', command(view));
    assert.equal(next.statusCode, 200, next.body);
    assert.equal(next.json<SessionView>().game.handNumber, 2);
  });

test('revoked sessions fail through another application instance', async () => {
  const c = await client();
  const oldCookie = c.cookie;
  assert.equal((await c.request('POST', '/api/logout', {})).statusCode, 200);
  const result = await replica.inject({
    method: 'GET',
    url: '/api/session',
    headers: { cookie: oldCookie, 'x-tricks-tab': c.tab },
  });
  assert.equal(result.statusCode, 401);
});

test.after(async () => {
  await app.close();
  await replica.close();
  await pool.end();
});
