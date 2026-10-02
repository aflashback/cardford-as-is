import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, loadLocalEnvironment, type Config } from '../config.ts';
import { createPool } from '../records/database.ts';
import { migrate } from '../records/migrations.ts';
import { createApp } from '../http/app.ts';
import { loadDevScenarios } from '../dev-scenarios.ts';
import { createGame } from '../game/index.ts';
import type { GameDocument } from '../records/types.ts';
import type { SessionView, NewSessionRequest, DevScenariosView } from '../../shared/contracts.ts';
import { assertContract } from '../../shared/validation.ts';

loadLocalEnvironment();
const url = process.env.TEST_DATABASE_URL;
if (!url || url === process.env.DATABASE_URL || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Selected-deal integration tests require a distinct _test database.');
const pool = createPool(url);
await migrate(pool);
const file = fileURLToPath(new URL('../../../examples/dev-deals.json', import.meta.url));
const config = readConfig({ ...process.env, APP_ENV: 'test', DATABASE_URL: url, DEV_SCENARIOS_FILE: file });
const scenarios = await loadDevScenarios(file);
const app = await createApp(config, pool);
const replica = await createApp(config, pool);
const disabled = await createApp({ ...config, devScenariosFile: null }, pool);
type App = typeof app;

async function client(server: App = app) {
  let cookie = '';
  const tab = randomUUID();
  const request = async (method: 'GET' | 'POST', path: string, body?: unknown, target = server) => {
    const response = await target.inject({
      method,
      url: path,
      headers: {
        cookie,
        'x-tricks-tab': tab,
        'x-tricks-client': '1',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
    });
    const set = response.headers['set-cookie'];
    if (typeof set === 'string') cookie = set.split(';')[0];
    return response;
  };
  const response = await request('GET', '/api/session');
  assert.equal(response.statusCode, 200, response.body);
  return {
    request,
    tab,
    get cookie() {
      return cookie;
    },
    view: response.json<SessionView>(),
  };
}
const envelope = (view: SessionView) => ({
  commandId: randomUUID(),
  gameId: view.game.id,
  expectedRevision: view.revision,
  controlLeaseToken: view.controlLeaseToken,
});
const newSession = (
  view: SessionView,
  selection: Pick<NewSessionRequest, 'scenarioId' | 'replayScenario'> = {},
) => ({
  commandId: randomUUID(),
  mode: view.game.mode,
  expectedActiveGameId: view.game.id,
  ...selection,
});
async function document(id: string): Promise<GameDocument> {
  return (await pool.query<{ document: GameDocument }>('SELECT document FROM games WHERE id=$1', [id]))
    .rows[0].document;
}
async function finishHand(c: Awaited<ReturnType<typeof client>>, initial: SessionView) {
  let view = initial;
  let steps = 0;
  while (!['hand-end', 'match-end'].includes(view.game.phase) && steps++ < 100) {
    let result;
    if (view.game.phase === 'trick-end')
      result = await c.request('POST', '/api/session/advance', {
        ...envelope(view),
        kind: 'collect-trick',
      });
    else if (view.game.legalActions.length)
      result = await c.request('POST', '/api/session/actions', {
        ...envelope(view),
        action: view.game.legalActions[0],
      });
    else {
      const ready = await c.request('POST', '/api/session/prepare', envelope(view));
      assert.equal(ready.statusCode, 200, ready.body);
      result = await c.request('POST', '/api/session/advance', {
        ...envelope(view),
        kind: 'bot',
        preparedDecisionId: ready.json().preparedDecisionId,
      });
    }
    assert.equal(result.statusCode, 200, result.body);
    view = result.json<SessionView>();
    safe(view);
  }
  assert.equal(view.game.phase, 'hand-end');
  assert.equal(view.game.history.length, 13);
  return view;
}
function safe(value: unknown): void {
  if (Array.isArray(value)) for (const item of value) safe(item);
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      assert.ok(
        !['hands', 'deck', 'deals', 'seed', 'document', 'openingScenario'].includes(key),
        `Private field ${key}`,
      );
      safe(item);
    }
}

test('RD-02: disabled servers reject selected starts and expose an empty catalog', async () => {
  const c = await client(disabled);
  const catalog = await c.request('GET', '/api/dev/scenarios');
  assert.equal(catalog.statusCode, 200);
  assert.deepEqual(catalog.json(), { scenarios: [] });
  const selected = await c.request(
    'POST',
    '/api/sessions',
    newSession(c.view, { scenarioId: scenarios[0].metadata.id }),
  );
  assert.equal(selected.statusCode, 403);
  const replay = await c.request('POST', '/api/sessions', newSession(c.view, { replayScenario: true }));
  assert.equal(replay.statusCode, 403);
  const normal = await c.request('POST', '/api/sessions', newSession(c.view));
  assert.equal(normal.statusCode, 200, normal.body);
  assert.equal(normal.json<SessionView>().scenario, undefined);
  assert.equal((await document(normal.json<SessionView>().game.id)).openingScenario, undefined);
});

test('RD-02: catalog and selected starts retain authentication, origin and strict contract checks', async () => {
  const anonymous = await app.inject({
    method: 'GET',
    url: '/api/dev/scenarios',
    headers: { 'x-tricks-tab': randomUUID() },
  });
  assert.equal(anonymous.statusCode, 401);
  const c = await client();
  assert.equal((await c.request('GET', '/api/dev/scenarios?hands=true')).statusCode, 400);
  const catalog = (await c.request('GET', '/api/dev/scenarios')).json<DevScenariosView>();
  assertContract('DevScenariosView', catalog);
  safe(catalog);
  for (const extra of [{ hands: [] }, { deck: [] }, { seed: 1 }, { dealer: 2 }])
    assert.equal(
      (await c.request('POST', '/api/sessions', { ...newSession(c.view), ...extra })).statusCode,
      400,
    );
  const hostile = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    headers: {
      cookie: c.cookie,
      'x-tricks-tab': c.tab,
      'x-tricks-client': '1',
      origin: 'https://evil.example',
    },
    payload: newSession(c.view, { scenarioId: scenarios[0].metadata.id }),
  });
  assert.equal(hostile.statusCode, 403);
});

for (const scenario of scenarios)
  test(`RD-03: ${scenario.metadata.mode} persists exact cards, survives restart and completes a legal hand`, async () => {
    const c = await client();
    const body = {
      ...newSession(c.view, { scenarioId: scenario.metadata.id }),
      mode: scenario.metadata.mode,
    };
    const response = await c.request('POST', '/api/sessions', body);
    assert.equal(response.statusCode, 200, response.body);
    let view = response.json<SessionView>();
    const original = await document(view.game.id);
    const expected = createGame(
      { id: view.game.id, mode: scenario.metadata.mode, dealer: scenario.dealer },
      scenario.deck,
    );
    assert.deepEqual(original.state.hands, expected.hands);
    assert.deepEqual(original.deals, [scenario.deck]);
    assert.deepEqual(view.game.hand, expected.hands[0]);
    assert.deepEqual(view.scenario, scenario.metadata);
    safe(view);
    const duplicate = await c.request('POST', '/api/sessions', body, replica);
    assert.equal(duplicate.statusCode, 200, duplicate.body);
    assert.deepEqual(duplicate.json(), view);
    const restored = await c.request('GET', '/api/session', undefined, replica);
    assert.deepEqual(restored.json(), view);
    view = await finishHand(c, view);
    const replay = await c.request('POST', '/api/sessions', newSession(view, { replayScenario: true }));
    assert.equal(replay.statusCode, 200, replay.body);
    const fresh = replay.json<SessionView>();
    assert.notEqual(fresh.game.id, view.game.id);
    assert.equal(fresh.revision, 0);
    assert.deepEqual(fresh.game.hand, expected.hands[0]);
    assert.deepEqual(fresh.game.scores, [0, 0, 0, 0]);
    assert.deepEqual(fresh.scenario, scenario.metadata);
    const replayed = await document(fresh.game.id);
    assert.deepEqual(replayed.deals, original.deals);
    assert.deepEqual(replayed.actions, []);
    assert.deepEqual(replayed.stats, { decisions: 0, helped: 0, suggestions: 0 });
    assert.equal((await document(view.game.id)).state.history.length, 13);
  });

test('RD-04: a normal next hand drops the selected marker and cannot replay as the opening scenario', async () => {
  const c = await client();
  const scenario = scenarios.find((item) => item.metadata.mode === 'spades-solo')!;
  const selected = await c.request('POST', '/api/sessions', {
    ...newSession(c.view, { scenarioId: scenario.metadata.id }),
    mode: scenario.metadata.mode,
  });
  assert.equal(selected.statusCode, 200, selected.body);
  const ended = await finishHand(c, selected.json<SessionView>());
  const response = await c.request('POST', '/api/session/next-hand', envelope(ended));
  assert.equal(response.statusCode, 200, response.body);
  const next = response.json<SessionView>();
  safe(next);
  assert.equal(next.game.id, ended.game.id);
  assert.equal(next.game.handNumber, 2);
  assert.equal(next.scenario, undefined);
  const saved = await document(next.game.id);
  assert.equal(saved.deals.length, 2);
  assert.deepEqual(saved.deals[0], scenario.deck);
  assert.equal(new Set(saved.deals[1]).size, 52);
  assert.deepEqual(saved.openingScenario?.metadata, scenario.metadata);
  const replay = await c.request('POST', '/api/sessions', newSession(next, { replayScenario: true }));
  assert.equal(replay.statusCode, 400);
  assert.equal((await c.request('GET', '/api/session')).json<SessionView>().game.id, next.game.id);
});

test('RD-02: unavailable IDs, wrong modes, unselected replay and another tab cannot create a game', async () => {
  const c = await client();
  const unknown = await c.request('POST', '/api/sessions', newSession(c.view, { scenarioId: 'missing' }));
  assert.equal(unknown.statusCode, 400);
  const mismatch = await c.request('POST', '/api/sessions', {
    ...newSession(c.view),
    mode: 'spades-solo',
    scenarioId: scenarios[0].metadata.id,
  });
  assert.equal(mismatch.statusCode, 400);
  assert.equal(
    (await c.request('POST', '/api/sessions', newSession(c.view, { replayScenario: true }))).statusCode,
    400,
  );
  const other = await client();
  assert.equal(
    (
      await other.request(
        'POST',
        '/api/sessions',
        newSession(c.view, { scenarioId: scenarios[0].metadata.id }),
      )
    ).statusCode,
    409,
  );
  const tab = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    headers: { cookie: c.cookie, 'x-tricks-tab': randomUUID(), 'x-tricks-client': '1' },
    payload: {
      ...newSession(c.view),
      mode: scenarios[0].metadata.mode,
      scenarioId: scenarios[0].metadata.id,
    },
  });
  assert.equal(tab.statusCode, 409);
  assert.equal(tab.json().code, 'LEASE_LOST');
  assert.equal((await c.request('GET', '/api/session')).json<SessionView>().game.id, c.view.game.id);
});

test('RD-03: replay uses the saved private deal even when the fixture file has changed', async () => {
  const c = await client();
  const source = scenarios[0];
  const response = await c.request('POST', '/api/sessions', {
    ...newSession(c.view),
    mode: source.metadata.mode,
    scenarioId: source.metadata.id,
  });
  const original = response.json<SessionView>();
  const start = (await document(original.game.id)).state;
  const directory = await mkdtemp(join(tmpdir(), 'cardford-replay-deals-'));
  const path = join(directory, 'changed.json');
  let changedApp: App | undefined;
  try {
    await writeFile(
      path,
      JSON.stringify({
        schemaVersion: '1.0.0',
        scenarios: [
          {
            ...source.metadata,
            version: '2.0.0',
            dealer: 0,
            hands: {
              south: start.hands[1],
              west: start.hands[0],
              north: start.hands[2],
              east: start.hands[3],
            },
          },
        ],
      }),
    );
    changedApp = await createApp({ ...config, devScenariosFile: path }, pool);
    const replay = await c.request(
      'POST',
      '/api/sessions',
      newSession(original, { replayScenario: true }),
      changedApp,
    );
    assert.equal(replay.statusCode, 200, replay.body);
    const view = replay.json<SessionView>();
    assert.deepEqual(view.scenario, source.metadata);
    assert.equal(view.game.dealer, source.dealer);
    assert.deepEqual((await document(view.game.id)).state.hands, start.hands);
    const selected = await c.request(
      'POST',
      '/api/sessions',
      newSession(view, { scenarioId: source.metadata.id }),
      changedApp,
    );
    assert.equal(selected.statusCode, 200, selected.body);
    assert.equal(selected.json<SessionView>().scenario?.version, '2.0.0');
    assert.deepEqual(selected.json<SessionView>().game.hand, start.hands[1]);
  } finally {
    await changedApp?.close();
    await unlink(path);
    await rmdir(directory);
  }
});

test('RD-02: app creation independently rejects a hosted fixture override', async () => {
  // Deliberately bypass readConfig to verify the application guard as well.
  await assert.rejects(
    createApp({ ...config, appEnv: 'production' } as unknown as Config, pool),
    /local or test/,
  );
  await assert.rejects(
    createApp({ ...config, appEnv: 'staging' } as unknown as Config, pool),
    /local or test/,
  );
});

test.after(async () => {
  await Promise.all([app.close(), replica.close(), disabled.close()]);
  await pool.end();
});
