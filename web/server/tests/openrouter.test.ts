import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGame, fullDeck, actionId, type GameAction } from '../game/index.ts';
import { observe, type SeatObservation } from '../observations/index.ts';
import {
  selectWithJev,
  validateResult,
  buildDecisionRequest,
  JEV_MODEL,
  DECISIONS_URL,
  type RequestOptions,
  type AttemptRecord,
  type AttemptPort,
} from '../providers/openrouter.ts';
import { loadOpenRouterKey } from '../providers/secrets.ts';
import { durableAttemptPort, runJevSmoke, type SqlPool, type SqlClient } from '../evaluation/jev-smoke.ts';
const fakeKey = 'sk-or-v1-unit-test-only-fake-1234567890';
const observation = () =>
  observe(createGame({ id: 'private-identity-canary', mode: 'spades-solo', dealer: 3 }, fullDeck()), 0);
const options = (): RequestOptions => ({
  observation: observation(),
  candidateIds: ['bid:0', 'bid:1'],
  mode: 'shadow',
  experiment: { id: 'mock', maxRequests: 3, maxCostUsd: 0.01 },
  deadlineAt: Date.now() + 8000,
});
const valid = (cost: number | null = 0.001) => ({
  id: 'fixture-id',
  model: 'typesafe/jev-1.13-20260917',
  provider: 'TypeSafe',
  answers: {
    move: {
      type: 'choice',
      choice: 'bid:1',
      probabilities: { 'bid:0': 0.25, 'bid:1': 0.75 },
      confidence: 0.5,
    },
  },
  ...(cost === null ? {} : { usage: { input_tokens: 100, output_tokens: 10, cost } }),
});
function port(): AttemptPort & { records: AttemptRecord[]; reservations: number } {
  return {
    records: [],
    reservations: 0,
    async reserve(e) {
      if (this.reservations >= e.maxRequests || this.records.some((r) => r.costUsd === null)) return null;
      this.reservations++;
      return `attempt-${this.reservations}`;
    },
    async finish(_id, record) {
      this.records.push(record);
    },
  };
}
test('JEV: off and zero cap send no request and never load credentials', async () => {
  for (const override of [
    { mode: 'off' as const },
    { experiment: { id: 'mock', maxRequests: 0, maxCostUsd: 0.01 } },
  ]) {
    const p = port();
    const out = await selectWithJev(
      { ...options(), ...override },
      {
        loadKey: async () => {
          throw new Error('must not load');
        },
        fetch: async () => {
          throw new Error('must not fetch');
        },
        attempts: p,
      },
    );
    assert.equal(out.status, 'disabled');
    assert.equal(p.reservations, 0);
  }
});
test('JEV: forced action and single shortlisted action bypass without secret or network', async () => {
  const base = options();
  const forced = observe(createGame({ id: 'forced', mode: 'hearts', dealer: 3 }, fullDeck()), 0);
  forced.phase = 'play';
  forced.turn = 0;
  forced.legalActions = [{ kind: 'play', seat: 0, card: 'C2' }];
  for (const request of [
    { ...base, candidateIds: ['bid:1'] },
    { ...base, observation: forced, candidateIds: ['play:C2'] },
  ]) {
    const result = await selectWithJev(request, {
      loadKey: async () => {
        throw new Error('key');
      },
      attempts: port(),
      fetch: async () => {
        throw new Error('fetch');
      },
    });
    assert.equal(result.status, 'bypassed');
    if (result.status === 'bypassed')
      assert.equal(result.provenance, request.observation === forced ? 'forced' : 'code');
  }
});
test('JEV: exact endpoint and typed criteria use semantic actor knowledge and durable admission', async () => {
  const request = options(),
    original = structuredClone(request.observation),
    p = port();
  let dispatched = 0;
  const out = await selectWithJev(request, {
    loadKey: async () => fakeKey,
    attempts: p,
    fetch: async (url, init) => {
      assert.equal(p.reservations, 1, 'admission happened before fetch');
      assert.equal(url, DECISIONS_URL);
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${fakeKey}`);
      const encoded = String(init?.body);
      assert.equal(encoded.includes('private-identity-canary'), false);
      assert.equal(encoded.includes('"events"'), false);
      assert.equal(encoded.includes('"hands"'), false);
      const body = JSON.parse(encoded) as {
        model: string;
        questions: { move: { type: string; criteria: Record<string, string> } };
      };
      assert.equal(body.model, JEV_MODEL);
      assert.equal(body.questions.move.type, 'choice');
      assert.deepEqual(Object.keys(body.questions.move.criteria), ['bid:0', 'bid:1']);
      dispatched++;
      return new Response(JSON.stringify(valid()));
    },
  });
  assert.equal(dispatched, 1);
  assert.equal(out.status, 'selected');
  if (out.status === 'selected') {
    assert.equal(out.application, 'shadow-only');
    assert.equal(out.observedModel, 'typesafe/jev-1.13-20260917');
    assert.equal(out.costUsd, 0.001);
  }
  assert.deepEqual(request.observation, original);
  assert.equal(p.records.length, 1);
});
test('JEV: strict response rejects missing keys, invalid distribution/range/confidence/model and fake usage', () => {
  const mutations: ((body: ReturnType<typeof valid>) => void)[] = [
    (b) => {
      b.model = 'unapproved/model';
    },
    (b) => {
      b.answers.move.choice = 'bid:9';
    },
    (b) => {
      b.answers.move.probabilities['bid:0'] = 0.9;
    },
    (b) => {
      b.answers.move.probabilities['bid:1'] = -0.1;
    },
    (b) => {
      b.answers.move.confidence = NaN;
    },
    (b) => {
      b.answers.move.confidence = 1.1;
    },
    (b) => {
      delete (b.answers.move.probabilities as Partial<Record<string, number>>)['bid:0'];
    },
    (b) => {
      Object.assign(b.answers.move.probabilities, { 'bid:2': 0 });
    },
    (b) => {
      b.answers.move.choice = 'bid:0';
    },
    (b) => {
      if (b.usage) b.usage.input_tokens = -1;
    },
    (b) => {
      if (b.usage) b.usage.cost = Infinity;
    },
  ];
  for (const mutate of mutations) {
    const body = valid();
    mutate(body);
    assert.throws(() => validateResult(body, ['bid:0', 'bid:1']));
  }
  const noUsage = validateResult(valid(null), ['bid:0', 'bid:1']);
  assert.equal(noUsage.usage, null);
  assert.equal(noUsage.costUsd, null);
  const tolerant = valid();
  tolerant.answers.move.probabilities['bid:0'] = 0.24;
  assert.equal(
    validateResult(tolerant, ['bid:0', 'bid:1']).probabilities['bid:0'],
    0.24,
    'no silent normalization',
  );
});
test('JEV: sensitive aggregate or malformed candidate is rejected before credentials', async () => {
  const request = options();
  Object.assign(request.observation, { hands: [['SA']] });
  await assert.rejects(() =>
    selectWithJev(request, {
      loadKey: async () => {
        throw new Error('must not read');
      },
      attempts: port(),
    }),
  );
  assert.throws(() => buildDecisionRequest(observation(), ['bid:14']));
  assert.throws(() => buildDecisionRequest(observation(), ['bid:1', 'bid:1']));
});
test('JEV: no auth, credit, malformed-response or unknown-cost retry', async () => {
  for (const status of [401, 402, 422, 429, 503]) {
    const p = port();
    let calls = 0;
    const result = await selectWithJev(options(), {
      loadKey: async () => fakeKey,
      attempts: p,
      fetch: async () => {
        calls++;
        return new Response(JSON.stringify({ error: { message: fakeKey } }), { status });
      },
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(calls, 1);
    assert.equal(p.records[0].costUsd, null);
    assert.equal(JSON.stringify(result).includes(fakeKey), false);
    assert.equal(JSON.stringify(p.records).includes(fakeKey), false);
  }
  const p = port();
  const result = await selectWithJev(options(), {
    loadKey: async () => fakeKey,
    attempts: p,
    fetch: async () => new Response('not-json'),
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(p.reservations, 1);
});
test('JEV: one definite 429/503 retry with known zero cost honors Retry-After within same deadline', async () => {
  for (const status of [429, 503]) {
    let clock = 1000,
      calls = 0;
    const p = port();
    const request = { ...options(), deadlineAt: 9000 };
    const result = await selectWithJev(request, {
      loadKey: async () => fakeKey,
      attempts: p,
      now: () => clock,
      sleep: async (ms) => {
        assert.equal(ms, 1000);
        clock += ms;
      },
      fetch: async () => {
        calls++;
        return calls === 1
          ? new Response(JSON.stringify({ usage: { cost: 0 } }), { status, headers: { 'retry-after': '1' } })
          : new Response(JSON.stringify(valid()));
      },
    });
    assert.equal(result.status, 'selected');
    assert.equal(calls, 2);
    assert.equal(p.reservations, 2);
    assert.equal(p.records.length, 2);
  }
});
test('JEV: Retry-After beyond deadline and cap exhaustion cannot dispatch again', async () => {
  let calls = 0;
  const p = port();
  const result = await selectWithJev(options(), {
    loadKey: async () => fakeKey,
    attempts: p,
    fetch: async () => {
      calls++;
      return new Response(JSON.stringify({ usage: { cost: 0 } }), {
        status: 429,
        headers: { 'retry-after': '9' },
      });
    },
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(calls, 1);
  const exhausted = port();
  exhausted.reservations = 3;
  calls = 0;
  await selectWithJev(options(), {
    loadKey: async () => fakeKey,
    attempts: exhausted,
    fetch: async () => {
      calls++;
      return new Response(JSON.stringify(valid()));
    },
  });
  assert.equal(calls, 0);
});
test('JEV: timeout is bounded and not retried; late expired admission sends no request', async () => {
  const p = port();
  let calls = 0;
  const result = await selectWithJev(
    { ...options(), deadlineAt: Date.now() + 15 },
    {
      loadKey: async () => fakeKey,
      attempts: p,
      fetch: async () => {
        calls++;
        return new Promise<Response>(() => {});
      },
    },
  );
  assert.equal(result.status, 'unavailable');
  if (result.status === 'unavailable') assert.equal(result.reason, 'deadline');
  assert.equal(calls, 1);
  assert.equal(p.reservations, 1);
  assert.equal(p.records.length, 0, 'expired fetch leaves the durable unknown-cost reservation pending');
  let keyLoads = 0;
  await selectWithJev(
    { ...options(), deadlineAt: 0 },
    {
      loadKey: async () => {
        keyLoads++;
        return fakeKey;
      },
      attempts: port(),
      fetch: async () => {
        throw new Error('expired');
      },
    },
  );
  assert.equal(keyLoads, 0);
});
test('JEV: unknown cost remains unknown and prevents later experiment admission', async () => {
  const p = port();
  let calls = 0;
  const deps = {
    loadKey: async () => fakeKey,
    attempts: p,
    fetch: async () => {
      calls++;
      return new Response(JSON.stringify(valid(null)));
    },
  };
  const first = await selectWithJev(options(), deps);
  assert.equal(first.status, 'selected');
  const second = await selectWithJev(options(), deps);
  assert.equal(second.status, 'unavailable');
  assert.equal(calls, 1);
});

test('JEV: credential, reservation and finish stalls share the admission deadline and consume late rejection', async () => {
  for (const stage of ['credential', 'reservation', 'finish'] as const) {
    let resolveLate!: (value: string) => void;
    let rejectLate!: (error: Error) => void;
    const late = new Promise<string>((resolve, reject) => {
      resolveLate = resolve;
      rejectLate = reject;
    });
    let calls = 0,
      reservations = 0,
      completions = 0;
    let signal: AbortSignal | undefined;
    const started = Date.now();
    const deadlineAt = started + 35;
    const result = await selectWithJev(
      { ...options(), deadlineAt },
      {
        loadKey: async (s) => {
          signal = s;
          return stage === 'credential' ? late : fakeKey;
        },
        attempts: {
          async reserve(_experiment, _model, budget) {
            assert.equal(budget?.deadlineAt, deadlineAt);
            reservations++;
            return stage === 'reservation' ? late : 'reserved';
          },
          async finish(_id, _record, budget) {
            assert.equal(budget?.deadlineAt, deadlineAt);
            completions++;
            if (stage === 'finish') await late;
          },
        },
        fetch: async () => {
          calls++;
          return new Response(JSON.stringify(valid()));
        },
      },
    );
    assert.ok(
      Date.now() - started < 800,
      `${stage} must not exceed its caller deadline by an unbounded wait`,
    );
    assert.equal(result.status, 'unavailable');
    if (result.status === 'unavailable') assert.equal(result.reason, 'deadline');
    assert.equal(signal?.aborted, true);
    if (stage === 'reservation') resolveLate('late-persisted-reservation');
    else rejectLate(new Error('private-credential-canary'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(calls, stage === 'finish' ? 1 : 0, 'late admission or credentials must never dispatch');
    assert.equal(reservations, stage === 'credential' ? 0 : 1);
    assert.equal(completions, stage === 'finish' ? 1 : 0, 'late reservation stays pending and fenced');
    assert.ok(!JSON.stringify(result).includes('canary'));
  }
});

test('JEV JOURNAL: expired pool acquisition releases a late client without executing SQL', async () => {
  let resolveConnection!: (client: SqlClient) => void;
  let releases = 0,
    queries = 0;
  const connection = new Promise<SqlClient>((resolve) => {
    resolveConnection = resolve;
  });
  const pool: SqlPool = {
    connect: () => connection,
    query: async () => {
      throw new Error('must not query pool');
    },
    end: async () => {},
  };
  await assert.rejects(
    () =>
      durableAttemptPort(pool).reserve({ id: 'late-pool', maxRequests: 1, maxCostUsd: 0.01 }, JEV_MODEL, {
        deadlineAt: Date.now() + 25,
      }),
    /storage is unavailable/,
  );
  resolveConnection({
    query: async () => {
      queries++;
      return { rows: [] };
    },
    release(destroy) {
      assert.equal(destroy, true);
      releases++;
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(releases, 1);
  assert.equal(queries, 0);
});
test('SECRET: off/zero never read a file; explicit live loader rejects conflicts and malformed data', async () => {
  assert.equal(
    await loadOpenRouterKey(
      { live: false, mode: 'shadow', maxRequests: 1 },
      { OPENROUTER_API_KEY_FILE: 'missing' },
    ),
    null,
  );
  assert.equal(
    await loadOpenRouterKey(
      { live: true, mode: 'off', maxRequests: 1 },
      { OPENROUTER_API_KEY_FILE: 'missing' },
    ),
    null,
  );
  assert.equal(
    await loadOpenRouterKey(
      { live: true, mode: 'shadow', maxRequests: 0 },
      { OPENROUTER_API_KEY_FILE: 'missing' },
    ),
    null,
  );
  const dir = await mkdtemp(join(tmpdir(), 'jev-fake-secret-'));
  try {
    const file = join(dir, 'fixture-token.txt');
    await writeFile(file, fakeKey + '\n');
    assert.equal(
      await loadOpenRouterKey(
        { live: true, mode: 'shadow', maxRequests: 1 },
        { OPENROUTER_API_KEY_FILE: file },
      ),
      fakeKey,
    );
    await assert.rejects(
      () =>
        loadOpenRouterKey(
          { live: true, mode: 'shadow', maxRequests: 1 },
          { OPENROUTER_API_KEY: fakeKey, OPENROUTER_API_KEY_FILE: file },
        ),
      /exactly one/,
    );
    await writeFile(file, 'bad token\nprivate-canary');
    await assert.rejects(
      () =>
        loadOpenRouterKey({ live: true, mode: 'shadow', maxRequests: 1 }, { OPENROUTER_API_KEY_FILE: file }),
      (error) => error instanceof Error && !error.message.includes('canary'),
    );
  } finally {
    const tempRoot = await realpath(tmpdir()),
      target = await realpath(dir);
    assert.ok(target.startsWith(join(tempRoot, 'jev-fake-secret-')));
    await rm(target, { recursive: true, force: true });
  }
});

test('JEV JOURNAL: durable reservation commits before fetch and pending/unknown outcomes survive adapter restart', async () => {
  const rows: { id: string; outcome: string }[] = [];
  let inTransaction = false;
  const commands: string[] = [];
  const query = async (
    text: string,
    values: unknown[] = [],
  ): Promise<{ rows: Record<string, unknown>[] }> => {
    commands.push(text);
    if (text === 'BEGIN') inTransaction = true;
    if (text === 'COMMIT' || text === 'ROLLBACK') inTransaction = false;
    if (text.startsWith('SELECT outcome')) return { rows: rows.map((r) => ({ outcome: r.outcome })) };
    if (text.startsWith('INSERT')) rows.push({ id: String(values[0]), outcome: String(values[3]) });
    if (text.startsWith('UPDATE')) {
      const row = rows.find((r) => r.id === values[0]);
      if (row) {
        row.outcome = String(values[2]);
        return { rows: [{ id: row.id }] };
      }
    }
    return { rows: [] };
  };
  const client: SqlClient = {
    query,
    release(destroy) {
      if (destroy) inTransaction = false;
      assert.equal(inTransaction, false);
    },
  };
  const pool: SqlPool = {
    query,
    async connect() {
      return client;
    },
    async end() {},
  };
  const first = durableAttemptPort(pool),
    experiment = { id: 'persisted', maxRequests: 3, maxCostUsd: 0.01 };
  const id = await first.reserve(experiment, JEV_MODEL);
  assert.ok(id);
  assert.equal(inTransaction, false);
  assert.ok(commands.some((c) => c.includes('pg_advisory_xact_lock')));
  assert.equal(
    await durableAttemptPort(pool).reserve(experiment, JEV_MODEL),
    null,
    'pending attempt blocks restart',
  );
  await first.finish(id, { status: 'http-429', observedModel: null, costUsd: 0 });
  const next = await durableAttemptPort(pool).reserve(experiment, JEV_MODEL);
  assert.ok(next);
  await first.finish(next, { status: 'deadline', observedModel: null, costUsd: null });
  assert.equal(
    await durableAttemptPort(pool).reserve(experiment, JEV_MODEL),
    null,
    'unknown cost blocks further dispatch',
  );
  await assert.rejects(
    () => first.finish('unknown', { status: 'selected', observedModel: JEV_MODEL, costUsd: 0.001 }),
    /not persisted/,
  );
});
test('JEV SMOKE: no-live path neither initializes root database nor reads configured credentials', async () => {
  const result = await runJevSmoke(false);
  assert.equal(result.status, 'not-run-explicit-live-flag-required');
  assert.equal(result.observedModel, null);
});
