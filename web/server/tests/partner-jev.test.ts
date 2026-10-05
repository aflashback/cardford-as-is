import assert from 'node:assert/strict';
import test from 'node:test';
import { observe } from '../observations/index.ts';
import { partnerFixture } from '../evaluation/partner-cases/fixtures.ts';
import {
  comparePartnerWithJev,
  replayPartnerPacket,
  requirePartnerJevDatabase,
  validatePartnerComparison,
} from '../evaluation/partner-jev.ts';
import { createGame } from '../game/index.ts';
import { spadesZeroDeal } from '../games/spades/evaluation/adapter.ts';
import { JEV_MODEL, type ProviderDependencies } from '../providers/openrouter.ts';

const state = partnerFixture('useful-second-suit');
const observation = observe(state, state.turn!);
const input = { observation, referenceActionId: 'play:SJ', candidateActionId: 'play:H5' };

test('partner comparison rejects database aliases before any migration or provider work', () => {
  const dedicated = 'postgres://fixture@127.0.0.1:54330/cardford_jev_comparison_20261005';
  assert.equal(requirePartnerJevDatabase(dedicated, {}), dedicated);
  assert.throws(() =>
    requirePartnerJevDatabase(dedicated.replace('postgres:', 'postgresql:'), { DATABASE_URL: dedicated }),
  );
  assert.throws(() =>
    requirePartnerJevDatabase(dedicated.replace('127.0.0.1', 'localhost'), { TEST_DATABASE_URL: dedicated }),
  );
  assert.throws(() => requirePartnerJevDatabase('postgres://fixture@127.0.0.1:54330/tricks_coach', {}));
  assert.throws(() => requirePartnerJevDatabase(dedicated.replace('54330', '54329'), {}));
});

test('partner comparison never retries HTTP even when an injected attempt port admits twice', async () => {
  let calls = 0,
    reserves = 0;
  const result = await comparePartnerWithJev(input, true, {
    loadKey: async () => 'synthetic-test-key',
    attempts: {
      reserve: async () => {
        reserves++;
        return 'synthetic-id';
      },
      finish: async () => {},
    },
    fetch: async () => {
      calls++;
      return new Response(JSON.stringify({ usage: { cost: 0 } }), { status: 503 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(reserves, 1);
  assert.equal(result.requests, 1);
  assert.equal(result.status, 'unavailable-experiment-cap');
});

test('partner comparison reconstructs its actor packet through legal production replay', () => {
  // Harness test seed stays outside the declared fresh development seed range.
  const seed = 23;
  const initial = createGame(
    { id: 'offline-fresh-partner-deal', mode: 'spades-partners', dealer: 3 },
    spadesZeroDeal(seed),
  );
  assert.deepEqual(replayPartnerPacket(seed, 0, []), observe(initial, 0));
  assert.throws(() => replayPartnerPacket(seed, 1, []));
  assert.throws(() => replayPartnerPacket(seed, 0, ['1:bid:3']));
  assert.throws(() => replayPartnerPacket(seed, 0, ['0:play:SA']));
});

test('partner Jev comparison stays inert without explicit live and rejects stale choices before credentials', async () => {
  let touches = 0;
  const deps: ProviderDependencies = {
    loadKey: async () => {
      touches++;
      return 'fake';
    },
    attempts: {
      reserve: async () => {
        touches++;
        return 'id';
      },
      finish: async () => {
        touches++;
      },
    },
    fetch: async () => {
      touches++;
      throw new Error('forbidden');
    },
  };
  assert.equal((await comparePartnerWithJev(input, false, deps)).requests, 0);
  assert.equal(touches, 0);
  assert.throws(() => validatePartnerComparison({ ...input, candidateActionId: 'play:SJ' }));
  await assert.rejects(() => comparePartnerWithJev({ ...input, candidateActionId: 'play:SJ' }, true, deps));
  assert.equal(touches, 0);
});

test('partner Jev comparison sends the complete safe legal set and retains a redacted rejection category', async () => {
  let calls = 0;
  const saved: string[] = [];
  const result = await comparePartnerWithJev(input, true, {
    loadKey: async () => 'synthetic-test-key',
    attempts: {
      reserve: async (experiment) => {
        assert.equal(experiment.maxRequests, 1);
        assert.equal(experiment.maxCostUsd, 0.01);
        return 'synthetic-attempt';
      },
      finish: async (_id, record) => {
        saved.push(record.status);
      },
    },
    fetch: async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.equal(Object.keys(body.questions.move.criteria).length, observation.legalActions.length);
      assert.ok(!('hands' in body.state));
      assert.ok(!('referenceActionId' in body.state));
      assert.ok(!('candidateActionId' in body.state));
      assert.ok(!('seed' in body.state));
      return new Response(
        JSON.stringify({
          model: JEV_MODEL,
          answers: { move: { type: 'choice', choice: 'invalid-private-value' } },
          usage: { cost: 0.00001 },
        }),
      );
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.requests, 1);
  assert.equal(result.status, 'unavailable-invalid-response');
  assert.equal(result.diagnostic?.category, 'choice');
  assert.ok(!JSON.stringify(result).includes('invalid-private-value'));
  assert.deepEqual(saved, ['invalid-response']);
});

test('partner Jev comparison retains a validated synthetic choice without exporting confidence or probabilities', async () => {
  const result = await comparePartnerWithJev(input, true, {
    loadKey: async () => 'synthetic-test-key',
    attempts: { reserve: async () => 'synthetic-id', finish: async () => {} },
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const ids = Object.keys(body.questions.move.criteria);
      return new Response(
        JSON.stringify({
          model: JEV_MODEL,
          answers: {
            move: {
              type: 'choice',
              choice: input.candidateActionId,
              confidence: 0.5,
              probabilities: Object.fromEntries(ids.map((id) => [id, 1 / ids.length])),
            },
          },
          usage: { cost: 0.0001 },
        }),
      );
    },
  });
  assert.equal(result.status, 'selected');
  assert.equal(result.jevActionId, input.candidateActionId);
  assert.equal(result.diagnostic, null);
  assert.equal(result.costUnknown, false);
  assert.ok(!('confidence' in result));
  assert.ok(!('probabilities' in result));
  assert.equal(result.promotion, false);
});
