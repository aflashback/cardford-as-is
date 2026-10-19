import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// These tests catch accepting a changed actor packet or confusing a different
// run/pin with the archived decision before any native comparison is started.
const fixture = JSON.parse(readFileSync(new URL('../../server/internal/games/trix/testdata/layout-jacks-jd-s10.json', import.meta.url), 'utf8'));
const manifest = { runId: fixture.runId, lab: { selector: { gameId: 'trix', variantId: 'complex-partners', moduleVersion: '2.1.0', ruleProfileId: 'trix-complex-partners-1.1.0' } } };
const decision = { decisionId: fixture.caseId, actor: 3, revision: 4, phase: 'layout', inputDigest: fixture.archiveInputDigest, policyPin: { id: fixture.originalPolicyId }, selectedCandidateId: fixture.originalCandidateId, actorPacket: fixture.actorPacket, legalCandidates: fixture.actorPacket.candidates.map((c: { id: string, public: object }) => ({ id: c.id, action: c.public })) };

async function subject() {
  const module = await import('../../scripts/coach-lab-layout-case.mjs').catch(() => null);
  assert.ok(module, 'layout case study binding is not implemented');
  return module;
}

test('layout case study freezes the archived actor input and excludes later records', async () => {
  const { bindLayoutCase } = await subject();
  const bound = bindLayoutCase(fixture, manifest, [decision]);
  assert.equal(bound.originalCandidateId, 'layout:DJ');
  assert.equal(bound.pin.moduleVersion, '2.1.0');
  assert.equal(bound.pin.publicSchemaVersion, '1.1.0');
  assert.deepEqual(bound.actorPacket, fixture.actorPacket);
  assert.equal(Object.hasOwn(bound, 'originalAnalysis'), false);
});

test('layout case study rejects changed legal payload even with the same action ID', async () => {
  const { bindLayoutCase } = await subject();
  const changed = structuredClone(decision);
  changed.legalCandidates[0].action = { kind: 'layout-card', card: 'S10' };
  assert.throws(() => bindLayoutCase(fixture, manifest, [changed]), /legal.*payload/i);
});

test('layout case study refuses changed packet, duplicate case, or wrong manifest', async () => {
  const { bindLayoutCase } = await subject();
  const changed = structuredClone(decision);
  changed.actorPacket.observation.hand[0] = 'C2';
  assert.throws(() => bindLayoutCase(fixture, manifest, [changed]), /frozen actor packet/i);
  assert.throws(() => bindLayoutCase(fixture, manifest, [decision, decision]), /unique/i);
  const wrong = structuredClone(manifest);
  wrong.lab.selector.moduleVersion = '2.2.0';
  assert.throws(() => bindLayoutCase(fixture, wrong, [decision]), /pin/i);
});
