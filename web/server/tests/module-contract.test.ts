import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCompetition, parseControllers } from '../game/kernel/seats.ts';
import { providerEligibility } from '../game/kernel/session.ts';
import { validateContract } from '../../shared/validation.ts';
import { bindSession } from '../game/kernel/session.ts';
import { createRegistration, createRegistry, catalog as legacyCatalog } from '../game/kernel/registry.ts';
import { json } from '../game/kernel/codec.ts';
import { fixture, analysis, installed } from './support/module-contract-fixture.ts';
import {
  accessOfferPolicyCodec,
  accessResolverInputCodec,
  accessOperationCodec,
  verifiedGrantCodec,
} from '../access/contracts.ts';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';

test('M01 four seats remain independent of competition and practice controllers', () => {
  assert.equal(
    parseCompetition({
      mode: 'individual',
      competitors: [0, 1, 2, 3].map((seat) => ({ id: `p${seat}`, seats: [seat] })),
    }).competitors.length,
    4,
  );
  assert.throws(() =>
    parseCompetition({
      mode: 'partnership',
      competitors: [
        { id: 'a', seats: [0, 2] },
        { id: 'b', seats: [1, 2] },
      ],
    }),
  );
  assert.throws(() => parseControllers([{ seat: 0, kind: 'human' }]));
});

test('M01 strict four-seat partitions and controls reject duplicates, unknown fields and multiplayer', () => {
  const teams = {
    mode: 'partnership',
    competitors: [
      { id: 'north-south', seats: [0, 2] },
      { id: 'east-west', seats: [1, 3] },
    ],
  };
  assert.equal(parseCompetition(teams).mode, 'partnership');
  for (const value of [
    { ...teams, hidden: [] },
    {
      ...teams,
      competitors: [
        { id: 'x', seats: [0, 1] },
        { id: 'x', seats: [2, 3] },
      ],
    },
    {
      ...teams,
      competitors: [
        { id: 'x', seats: [0, 1, 2] },
        { id: 'y', seats: [3] },
      ],
    },
    {
      ...teams,
      competitors: [
        { id: 'x', seats: [0, 4] },
        { id: 'y', seats: [1, 3] },
      ],
    },
  ])
    assert.throws(() => parseCompetition(value));
  const practice = [0, 1, 2, 3].map((seat) => ({ seat, kind: seat === 0 ? 'human' : 'computer' }));
  assert.equal(parseControllers(practice).length, 4);
  assert.throws(() => parseControllers(practice.map((value) => ({ ...value, kind: 'human' }))));
  assert.throws(() => parseControllers(practice.map((value) => ({ ...value, token: 'private' }))));
});

test('M01 registered facade resolves typed candidate IDs and lifecycle transitions', () => {
  const f = fixture(),
    registry = f.registry();
  const session = registry.createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 });
  assert.deepEqual(legacyCatalog, ['hearts', 'spades-solo', 'spades-partners']);
  assert.equal(session.packet(0).candidates.length, 3);
  assert.throws(() => session.commit(1, 'take-0'));
  assert.throws(() => session.commit(0, 'invented'));
  assert.throws(() => session.commitSealed('window-1', []));
  assert.throws(() => session.advance('collect'));
  assert.throws(() => session.continueRound());
  const automatic = session.commit(0, 'take-2');
  assert.equal(automatic.next.node().kind, 'automatic');
  assert.equal(session.node().kind, 'actor');
  assert.equal(automatic.privateEvents.length, 1);
  assert.throws(() => automatic.next.packet(0));
  assert.throws(() => automatic.next.advance('invented'));
  const chance = automatic.next.advance('collect').next;
  assert.equal(chance.node().kind, 'chance');
  assert.throws(() => chance.supplyChance('wrong', { amount: 2 }));
  assert.throws(() => chance.supplyChance('deal', { amount: 2, private: [] }));
  const round = chance.supplyChance('deal', { amount: 2 }).next;
  assert.equal(round.node().kind, 'round-complete');
  assert.equal(round.continueRound().next.node().kind, 'actor');
  assert.deepEqual(f.reduced, ['actor', 'automatic', 'chance', 'continue-round']);
});

test('M01 sealed choices project all frozen seats before a single atomic transition', () => {
  const f = fixture(),
    session = f
      .registry()
      .createRegisteredSession(f.selector, { stage: 'sealed', count: 286 }, { amount: 0 });
  assert.equal(session.packet(0).candidates.length, 286);
  f.observed.length = 0;
  assert.throws(() => session.commit(0, 'take-0'));
  assert.throws(() => session.commitSealed('wrong', []));
  assert.throws(() => session.commitSealed('window-1', [{ seat: 0, candidateId: 'take-0' }]));
  const choices = [
    { seat: 0, candidateId: 'take-285' },
    { seat: 1, candidateId: 'take-2' },
    { seat: 2, candidateId: 'take-3' },
    { seat: 3, candidateId: 'take-4' },
  ] as const;
  assert.throws(() => session.commitSealed('window-1', [choices[0], choices[0], choices[2], choices[3]]));
  const result = session.commitSealed('window-1', choices);
  assert.deepEqual(
    f.observed,
    [0, 1, 2, 3].map((seat) => ({ seat, step: 0, frozen: true })),
  );
  assert.deepEqual(f.reduced, ['sealed']);
  assert.equal(result.next.node().kind, 'session-complete');
  assert.equal(session.node().kind, 'sealed');
});

test('M01 async analysis receives a frozen seat-only input and original digest', async () => {
  const f = fixture();
  let release: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.adapters.analyze = async (input, facts) => {
    assert.deepEqual(Object.keys(input).sort(), ['count', 'ownValue', 'phase', 'seat', 'step']);
    assert.equal(input.ownValue, 7);
    assert.throws(() => {
      input.step = 100;
    });
    assert.throws(() => {
      facts.step = 100;
    });
    await wait;
    assert.equal(input.step, 0);
    return { candidateId: 'take-0', analysis: analysis() };
  };
  const session = f
    .registry()
    .createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 });
  const pending = session.prepare(0, 'counter-policy@1');
  session.commit(0, 'take-1');
  release?.();
  const result = await pending;
  assert.match(result.inputDigest, /^[a-f0-9]{64}$/);
  assert.equal(result.observationSchemaVersion, '1.0.0');
  assert.equal(Object.isFrozen(result.analysis), true);
});

test('M01 providers cannot invent candidate IDs or retain reasons for another selection', async () => {
  const f = fixture();
  f.adapters.analyze = async () => ({ candidateId: 'uninstalled', analysis: analysis('uninstalled') });
  await assert.rejects(
    f
      .registry()
      .createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 })
      .prepare(0, 'policy'),
  );
  f.adapters.analyze = async () => ({
    candidateId: 'take-0',
    analysis: {
      ...analysis(),
      facts: [
        { id: 'claim', kind: 'exact', summary: 'Wrong candidate', evidence: [], candidateId: 'take-1' },
      ],
    },
  });
  await assert.rejects(
    f
      .registry()
      .createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 })
      .prepare(0, 'policy'),
  );
});

test('M01 strict generated branches reject private fields and mixed game payloads', () => {
  const f = fixture(),
    session = f.registry().createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 });
  const packet = session.packet(0);
  assert.equal(validateContract('RegisteredActorPacket', packet), true);
  for (const bad of [
    { ...packet, hands: [] },
    { ...packet, gameId: 'tarneeb' },
    { ...packet, variantId: 'partners' },
    { ...packet, observation: { ...packet.observation, bids: [0, 0, 0, 0] } },
    { ...packet, observation: { ...packet.observation, secret: [] } },
    { ...packet, candidates: [{ id: 'x', public: { kind: 'bid', bid: 1 } }] },
    { ...packet, candidates: [{ id: 'x', public: { kind: 'play', card: 'S1' } }] },
  ])
    assert.equal(validateContract('RegisteredActorPacket', bad), false);
  assert.equal(validateContract('RegisteredSessionView', session.view(0)), true);
  assert.equal(
    validateContract('RegisteredAnalysis', {
      ...analysis(),
      estimates: [
        {
          competitorId: 'p0',
          metric: 'score',
          event: 'win',
          unit: 'round',
          population: 'fixture',
          value: Infinity,
          estimator: { id: 'x', version: '1' },
          uncertainty: null,
        },
      ],
    }),
    false,
  );
});

test('M01 public adapters cannot truncate, duplicate or rename complete candidates', () => {
  for (const alteration of ['truncate', 'duplicate', 'rename'] as const) {
    const f = fixture(),
      packet = f.adapters.packet;
    f.adapters.packet = (input, candidates) => {
      const result = packet(input, candidates);
      if (alteration === 'truncate') result.candidates = result.candidates.slice(0, 255);
      if (alteration === 'duplicate') result.candidates[1] = result.candidates[0];
      if (alteration === 'rename') result.candidates[0] = { ...result.candidates[0], id: 'renamed' };
      return result;
    };
    assert.throws(() =>
      f
        .registry()
        .createRegisteredSession(f.selector, { stage: 'sealed', count: 286 }, { amount: 0 })
        .packet(0),
    );
  }
  assert.throws(() => providerEligibility({ candidates: [{ id: 'x' }, { id: 'x' }] }));
  assert.throws(() => providerEligibility({ candidates: [] }));
  assert.equal(
    providerEligibility({ candidates: Array.from({ length: 255 }, (_, i) => ({ id: String(i) })) }).kind,
    'eligible',
  );
});

test('M01 registration requires installed capabilities/schema IDs and immutable exact selectors', () => {
  const f = fixture(),
    registration = createRegistration(f.descriptor, f.module, f.adapters);
  assert.throws(() => createRegistry([registration], { ...installed, schemas: [] }));
  assert.throws(() => createRegistry([registration], { ...installed, engine: [] }));
  assert.throws(() => createRegistry([registration, registration], installed));
  const registry = createRegistry([registration], installed);
  assert.equal(registry.catalog(installed.engine, installed.ui).length, 1);
  assert.equal(registry.catalog(installed.engine, []).length, 0);
  assert.throws(() => {
    registration.descriptor.variants[0].competition.competitors[0].seats[0] = 3;
  });
  assert.throws(() =>
    registry.createRegisteredSession(
      { ...f.selector, moduleVersion: 'latest' },
      { stage: 'actor', count: 3 },
      { amount: 0 },
    ),
  );
});

test('M01 changed pins, illegal private transitions and leaked event projections fail closed', () => {
  const f = fixture(),
    session = f.registry().createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 });
  f.module.projectEvent = () => json({ ...analysis(), hiddenHand: ['SA'] });
  assert.throws(() => session.commit(0, 'take-0'));
  assert.equal(session.node().kind, 'actor');
  const state = { stage: 'actor', step: 0, count: 3, secrets: [7, 8, 9, 10] } as const;
  const mutableState = { ...state, secrets: Array.from<number>(state.secrets) };
  const bound = bindSession(f.module, mutableState, f.adapters);
  mutableState.secrets[0] = 99;
  const protectedPacket = bound.packet(0);
  assert.notEqual(protectedPacket.gameId, 'test-token');
  if (protectedPacket.gameId === 'test-token' || protectedPacket.gameId === 'trix')
    throw new Error('Unexpected registered fixture branch');
  assert.equal(protectedPacket.observation.scores[0], 0);
  assert.throws(() => json({ n: Number.NaN }));
  assert.throws(() =>
    json({
      get hidden() {
        return 'secret';
      },
    }),
  );
});

test('M01 V1 action bodies remain valid and mixed V1/V2 commands are rejected', () => {
  const envelope = { commandId: 'cmd', gameId: 'game', expectedRevision: 1, controlLeaseToken: 'lease' };
  const v1 = { ...envelope, action: { kind: 'play', card: 'C2' } };
  const v2 = { ...envelope, publicSchemaVersion: '2.0.0', candidateId: 'play-C2' };
  assert.equal(validateContract('ActionsRequest', v1), true);
  assert.equal(validateContract('VersionedActionsRequest', v1), true);
  assert.equal(validateContract('VersionedActionsRequest', v2), true);
  assert.equal(validateContract('ActionsRequest', v2), false);
  assert.equal(validateContract('VersionedActionsRequest', { ...v2, action: v1.action }), false);
  assert.equal(validateContract('VersionedActionsRequest', { ...v1, candidateId: 'x' }), false);
});

test('M01 provider eligibility preserves the full 286-candidate sealed action space', () => {
  assert.deepEqual(
    providerEligibility({ candidates: Array.from({ length: 286 }, (_, i) => ({ id: `pass-${i}` })) }),
    { kind: 'unsupported-action-space', candidateCount: 286 },
  );
  assert.deepEqual(providerEligibility({ candidates: [{ id: 'only' }] }), {
    kind: 'forced',
    candidateCount: 1,
  });
});

test('M01 demo contracts accept only installed-frame intent shapes, never arbitrary positions', () => {
  assert.equal(validateContract('DemoFrameRequest', { kind: 'open', contentVersion: 'demo-1' }), true);
  assert.equal(
    validateContract('DemoFrameRequest', {
      kind: 'choose',
      contentVersion: 'demo-1',
      nodeId: 'n1',
      choiceId: 'c1',
    }),
    true,
  );
  assert.equal(validateContract('DemoFrameRequest', { kind: 'replay', contentVersion: 'demo-1' }), true);
  for (const extra of ['position', 'seed', 'action', 'candidateId', 'plan'])
    assert.equal(
      validateContract('DemoFrameRequest', { kind: 'open', contentVersion: 'demo-1', [extra]: {} }),
      false,
    );
  assert.equal(
    validateContract('DemoFrame', {
      contentVersion: 'demo-1',
      nodeId: 'n1',
      label: 'demo',
      title: 'Example',
      body: 'A finite authored frame.',
      cards: ['C2'],
      choices: [{ id: 'c1', label: 'Continue' }],
      complete: false,
    }),
    true,
  );
});

const freeOffer = {
  id: 'fixture-free',
  version: '1',
  enabled: true,
  kind: 'free',
  targets: [{ gameId: 'hearts', variantId: 'solo' }],
  play: true,
  coach: {
    tools: ['hint'],
    allowance: {
      kind: 'limited',
      limit: 2,
      unit: 'hand',
      period: 'day',
      timezone: 'UTC',
      bucketId: 'stable-bucket',
    },
  },
  continuation: 'finish-admitted-unit',
  activation: 'automatic',
  validitySeconds: null,
};
test('M01 launch policy parameters freeze exact scopes, precedence and verified record context', () => {
  const policy = {
    id: 'fixture-policy',
    version: '1',
    accessGeneration: 0,
    precedence: ['fixture-free'],
    offers: [freeOffer],
  };
  const grant = {
    id: 'grant-1',
    beneficiaryId: 'user-1',
    source: { kind: 'free', id: 'identity-1' },
    terms: freeOffer,
    validFrom: 100,
    validUntil: 200,
    revokedAt: null,
    accessGeneration: 0,
  };
  const unit = { id: 'hand-1', kind: 'hand', atAdmissionBoundary: false };
  const input = {
    policy,
    grants: [grant],
    beneficiaryId: 'user-1',
    target: { gameId: 'hearts', variantId: 'solo' },
    operation: {
      kind: 'play',
      intent: 'continue',
      sessionId: 's1',
      unit,
      admission: {
        id: 'a1',
        grantId: 'grant-1',
        sessionId: 's1',
        unitId: 'hand-1',
        admittedAt: 100,
        expiresAt: 200,
        revoked: false,
      },
    },
    usage: [
      {
        bucketId: 'stable-bucket',
        beneficiaryId: 'user-1',
        periodStart: 100,
        periodEnd: 200,
        used: 1,
        reservations: [{ id: 'r1', offer: { id: 'fixture-free', version: '1' }, units: 1 }],
      },
    ],
    now: 150,
  };
  assert.equal(accessResolverInputCodec.parse(input).grants[0].terms.coach.allowance.kind, 'limited');
  assert.throws(() => accessOfferPolicyCodec.parse({ ...policy, precedence: [] }));
  assert.throws(() =>
    accessOfferPolicyCodec.parse({
      ...policy,
      offers: [{ ...freeOffer, targets: [{ gameId: 'hearts', variantId: 'partners' }] }],
    }),
  );
  assert.throws(() =>
    accessOfferPolicyCodec.parse({ ...policy, offers: [{ ...freeOffer, kind: 'access-trial' }] }),
  );
  assert.throws(() => verifiedGrantCodec.parse({ ...grant, validUntil: 90 }));
  assert.throws(() => accessResolverInputCodec.parse({ ...input, plan: 'paid' }));
  assert.throws(() => accessResolverInputCodec.parse({ ...input, now: '150' }));
  assert.throws(() =>
    accessResolverInputCodec.parse({ ...input, grants: [{ ...grant, beneficiaryId: 'another-user' }] }),
  );
  assert.throws(() =>
    accessResolverInputCodec.parse({
      ...input,
      operation: { ...input.operation, admission: { ...input.operation.admission, unitId: 'other-hand' } },
    }),
  );
  assert.throws(() => accessResolverInputCodec.parse({ ...input, usage: [{ ...input.usage[0], used: -1 }] }));
  assert.equal(
    accessOperationCodec.parse({
      kind: 'read-saved',
      result: {
        id: 'result',
        ownerId: 'user-1',
        sessionId: 's1',
        delivered: true,
        scope: 'retained',
        retainedUntil: null,
      },
    }).kind,
    'read-saved',
  );
  assert.equal(
    accessOperationCodec.parse({ kind: 'coach', toolId: 'hint', sessionId: 's1', unit, existingUnlock: null })
      .kind,
    'coach',
  );
});

test('M01 packet/view/analysis identity is enforced after generated shape validation', async () => {
  const f = fixture();
  const view = f.adapters.view;
  f.adapters.view = (value) => ({ ...view(value), seat: 1 });
  assert.throws(() =>
    f.registry().createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 }).view(0),
  );
  f.adapters.analyze = async () => ({
    candidateId: 'take-0',
    analysis: { ...analysis(), gameId: 'spades', variantId: 'partners' },
  });
  await assert.rejects(
    f
      .registry()
      .createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 })
      .prepare(0, 'policy'),
  );
  const packet = f.adapters.packet;
  f.adapters.packet = (input, candidates) => ({ ...packet(input, candidates), seat: 1 });
  assert.throws(() =>
    f.registry().createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 }).packet(0),
  );
});

test('M01 creation event projections are validated before binding the new session', () => {
  const f = fixture(),
    create = f.module.create;
  f.module.create = (config, material) => ({
    ...create(config, material),
    events: [{ step: 0, privateSecret: 7 }],
  });
  f.module.projectEvent = () => ({ privateSecret: 7 });
  assert.throws(() =>
    f.registry().createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 }),
  );
});

test('M01 raw root/fragments resolve independently without private schemas or generator-only reference repair', () => {
  const ajv = new Ajv2020({ strict: true });
  for (const path of ['games/hearts.schema.json', 'games/spades.schema.json', 'games/token.schema.json', 'contracts.schema.json']) {
    const schema: object = JSON.parse(readFileSync(new URL('../../shared/' + path, import.meta.url), 'utf8'));
    ajv.addSchema(schema);
  }
  const validator = ajv.getSchema(
    'https://trickscoach.com/schemas/local-v1.json#/$defs/RegisteredActorPacket',
  );
  assert.ok(validator);
  const f = fixture();
  assert.equal(
    validator(
      f.registry().createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 }).packet(0),
    ),
    true,
  );
  const tokenPacket = {
    publicSchemaVersion: '2.0.0', gameId: 'test-token', variantId: 'neighbour-teams',
    seat: 0, phase: 'reveal',
    observation: {
      gameId: 'test-token', variant: 'neighbour-teams', seat: 0, phase: 'reveal',
      own: [1, 5, 9, 13, 17], held: [5, 5, 5, 5], current: [], cycles: [],
      collections: [0, 0, 0, 0], competition: [{ id: 'A', seats: [0, 1] }, { id: 'B', seats: [2, 3] }],
      turn: 0, winners: [],
    },
    candidates: [{ id: 'reveal:1', public: { kind: 'reveal', token: 1 } }],
  };
  const tokenValidator = ajv.getSchema(
    'https://trickscoach.com/schemas/games/token.schema.json#/$defs/TokenActorPacket',
  );
  assert.ok(tokenValidator);
  assert.equal(tokenValidator(tokenPacket), true);
  assert.equal(validator(tokenPacket), true);
  assert.equal(validator({ ...tokenPacket, observation: { ...tokenPacket.observation, hidden: [2] } }), false);
});
