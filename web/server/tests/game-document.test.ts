import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeDocument } from '../records/game-document.ts';
import { parseDocumentEnvelope } from '../records/game-document.ts';
import { fixture, analysis } from './support/module-contract-fixture.ts';
import { bindSession } from '../game/kernel/session.ts';
import { json } from '../game/kernel/codec.ts';
import { createRegistration, createRegistry } from '../game/kernel/registry.ts';
import { installed } from './support/module-contract-fixture.ts';

test('M01 unknown and unavailable V2 documents fail closed without a newest-version fallback', () => {
  assert.throws(() => decodeDocument({ documentVersion: '2.0.0', pin: { gameId: 'uninstalled' } }));
  assert.throws(() => decodeDocument({ documentVersion: '3.0.0' }));
  assert.throws(() => decodeDocument({ state: {} }));
});

test('M01 injected registration round-trips an independent private payload through the real facade route', () => {
  const f = fixture(),
    registry = f.registry();
  const session = registry.createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 });
  const document = session.serializePrivate();
  const decoded = registry.decodeDocument(document);
  assert.deepEqual(decoded.serializePrivate(), document);
  assert.deepEqual(decoded.packet(0), session.packet(0));
  assert.deepEqual(
    decoded.commit(0, 'take-2').next.serializePrivate(),
    session.commit(0, 'take-2').next.serializePrivate(),
  );
  assert.throws(() => decodeDocument(document)); // The fixture is never installed in production.
});

test('M01 malformed private payloads and unknown fields fail before a session is bound', () => {
  const f = fixture(),
    registry = f.registry();
  const document = parseDocumentEnvelope(
    registry
      .createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 })
      .serializePrivate(),
  );
  for (const payload of [
    { stage: 'actor', step: 0, count: 3, secrets: [7, 8, 9, 10], concealed: [] },
    { stage: 'actor', step: '0', count: 3, secrets: [7, 8, 9, 10] },
    { stage: 'actor', step: 0, count: 3, secrets: [7, 8, 9] },
    { stage: 'invented', step: 0, count: 3, secrets: [7, 8, 9, 10] },
    { mode: 'spades-partners', hands: [] },
  ])
    assert.throws(() => registry.decodeDocument({ ...document, payload }));
  assert.throws(() => registry.decodeDocument({ ...document, unknown: [] }));
  assert.throws(() =>
    registry.createRegisteredSession(f.selector, { stage: 'actor', count: 3, hidden: [] }, { amount: 0 }),
  );
  assert.throws(() =>
    registry.createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: Number.NaN }),
  );
});

test('M01 every stored pin is exact; registering a newer module does not upgrade history', () => {
  const f = fixture(),
    old = createRegistration(f.descriptor, f.module, f.adapters);
  const session = createRegistry([old], installed).createRegisteredSession(
    f.selector,
    { stage: 'actor', count: 3 },
    { amount: 0 },
  );
  const document = parseDocumentEnvelope(session.serializePrivate());
  const newer = createRegistration(
    { ...f.descriptor, moduleVersion: '2.0.0' },
    { ...f.module, pin: { ...f.module.pin, moduleVersion: '2.0.0' } },
    f.adapters,
  );
  const registry = createRegistry([old, newer], installed);
  assert.deepEqual(registry.decodeDocument(document).pin, old.pin);
  for (const key of Object.keys(document.pin))
    assert.throws(() =>
      registry.decodeDocument({ ...document, pin: { ...document.pin, [key]: 'uninstalled' } }),
    );
  assert.throws(() => createRegistry([newer], installed).decodeDocument(document));
  assert.throws(() => registry.decodeDocument({ ...document, documentVersion: '1.0.0' }));
});

test('M01 competition, controllers and journal/audit versions are strict private document metadata', () => {
  const f = fixture(),
    registry = f.registry();
  const document = parseDocumentEnvelope(
    registry
      .createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 })
      .serializePrivate(),
  );
  assert.throws(() =>
    registry.decodeDocument({
      ...document,
      competition: {
        mode: 'partnership',
        competitors: [
          { id: 'a', seats: [0, 2] },
          { id: 'b', seats: [1, 3] },
        ],
      },
    }),
  );
  assert.throws(() =>
    registry.decodeDocument({
      ...document,
      controllers: document.controllers.map((value) => ({ ...value, kind: 'human' })),
    }),
  );
  assert.throws(() =>
    registry.decodeDocument({ ...document, journal: { ...document.journal, version: '9.0.0' } }),
  );
  assert.throws(() =>
    registry.decodeDocument({ ...document, audits: { ...document.audits, version: '9.0.0' } }),
  );
  assert.throws(() =>
    registry.decodeDocument({ ...document, journal: { version: '2.0.0', revision: 1, entries: [] } }),
  );
  assert.throws(() =>
    registry.decodeDocument({
      ...document,
      journal: {
        version: '2.0.0',
        revision: 1,
        entries: [
          {
            revision: 1,
            commandId: 'cmd',
            operation: { kind: 'actor', seat: 0, candidateId: 'take-0', action: { take: 1 } },
          },
        ],
      },
    }),
  );
});

test('M01 direct binding also rejects an adapter that serializes extra fields or changes state', () => {
  const f = fixture();
  const state = { stage: 'actor', step: 0, count: 3, secrets: [7, 8, 9, 10] } as const;
  const value = { ...state, secrets: [...state.secrets] };
  assert.throws(() =>
    bindSession(f.module, value, {
      ...f.adapters,
      document: (state) => json({ ...state, hidden: true }),
    }).serializePrivate(),
  );
  assert.throws(() =>
    bindSession(f.module, value, {
      ...f.adapters,
      document: (state) => json({ ...state, step: 99 }),
    }).serializePrivate(),
  );
});

test('M01 historical decode cannot activate a mutable session when its UI capability is unavailable', () => {
  const f = fixture(),
    registration = createRegistration(f.descriptor, f.module, f.adapters);
  const document = f
    .registry()
    .createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 })
    .serializePrivate();
  const unavailable = createRegistry([registration], { ...installed, ui: [] });
  assert.deepEqual(unavailable.catalog(installed.engine, installed.ui), []);
  assert.throws(() => unavailable.decodeDocument(document));
});

test('M01 module pin drift before a later create or decode cannot relabel historical state', () => {
  const f = fixture(),
    registry = f.registry();
  const document = registry
    .createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 })
    .serializePrivate();
  Object.defineProperty(f.module, 'pin', { value: { ...f.module.pin, moduleVersion: '2.0.0' } });
  assert.throws(() => registry.decodeDocument(document));
  assert.throws(() =>
    registry.createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 }),
  );
});

test('M01 a new-session selector cannot name two schema pins regardless of registration order', () => {
  const f = fixture(),
    original = createRegistration(f.descriptor, f.module, f.adapters);
  for (const schema of [
    'stateSchemaVersion',
    'observationSchemaVersion',
    'publicSchemaVersion',
    'eventSchemaVersion',
  ] as const) {
    const alternate = createRegistration(
      f.descriptor,
      { ...f.module, pin: { ...f.module.pin, [schema]: '3.0.0' } },
      f.adapters,
    );
    for (const order of [
      [original, alternate],
      [alternate, original],
    ])
      assert.throws(() => createRegistry(order, installed), /Duplicate installed selector/);
  }
});

test('M01 saved analysis cannot retain facts attributed to a different selected action', () => {
  const f = fixture(),
    registry = f.registry();
  const base = parseDocumentEnvelope(
    registry
      .createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 })
      .serializePrivate(),
  );
  const savedAnalysis = {
    ...analysis(),
    facts: [
      {
        id: 'reason-1',
        kind: 'exact',
        summary: 'Selected action evidence',
        evidence: ['fixture'],
        candidateId: 'take-0',
      },
    ],
  };
  const audit = {
    id: 'audit-1',
    policyId: 'counter-policy@1',
    inputDigest: 'a'.repeat(64),
    observationSchemaVersion: base.pin.observationSchemaVersion,
    analysis: savedAnalysis,
  };
  const valid = { ...base, audits: { version: '2.0.0', entries: [audit] } };
  assert.deepEqual(registry.decodeDocument(valid).serializePrivate(), valid);
  const invalid = {
    ...valid,
    audits: {
      version: '2.0.0',
      entries: [
        {
          ...audit,
          analysis: { ...savedAnalysis, facts: [{ ...savedAnalysis.facts[0], candidateId: 'take-1' }] },
        },
      ],
    },
  };
  assert.throws(() => parseDocumentEnvelope(invalid), /selected-action evidence/);
  assert.throws(() => registry.decodeDocument(invalid), /selected-action evidence/);
});

test('M01 saved analysis rejects reversed uncertainty intervals while preserving valid original estimates', () => {
  const f = fixture(),
    registry = f.registry();
  const base = parseDocumentEnvelope(
    registry
      .createRegisteredSession(f.selector, { stage: 'actor', count: 3 }, { amount: 0 })
      .serializePrivate(),
  );
  const estimate = {
    competitorId: 'p0',
    metric: 'score',
    event: 'fixture-result',
    unit: 'round',
    population: 'fixture-only',
    value: 0.5,
    estimator: { id: 'fixture', version: '1' },
    uncertainty: { method: { id: 'fixture-interval', version: '1' }, lower: 0, upper: 1 },
  };
  const audit = {
    id: 'audit-1',
    policyId: 'counter-policy@1',
    inputDigest: 'a'.repeat(64),
    observationSchemaVersion: base.pin.observationSchemaVersion,
    analysis: { ...analysis(), estimates: [estimate] },
  };
  const valid = { ...base, audits: { version: '2.0.0', entries: [audit] } };
  assert.deepEqual(registry.decodeDocument(valid).serializePrivate(), valid);
  const invalid = {
    ...valid,
    audits: {
      version: '2.0.0',
      entries: [
        {
          ...audit,
          analysis: {
            ...audit.analysis,
            estimates: [{ ...estimate, uncertainty: { ...estimate.uncertainty, lower: 1, upper: 0 } }],
          },
        },
      ],
    },
  };
  assert.throws(() => parseDocumentEnvelope(invalid), /uncertainty interval/);
  assert.throws(() => registry.decodeDocument(invalid), /uncertainty interval/);
});
