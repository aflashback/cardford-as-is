import test from 'node:test';
import assert from 'node:assert/strict';

test('ownership comparison is opt-in with exact current and historical pins in both arm directions', async () => {
  const { createDevelopmentManifest } = await import('../../scripts/coach-lab.mjs');
  const { freezeLabRun } = await import('../server/evaluation/multi-game/lab/freeze.ts');
  const comparison = 'trix-ownership-comparison-1.0.0';
  for (const variant of ['basic-solo', 'basic-partners', 'complex-solo', 'complex-partners']) {
    const options = { game: `trix-${variant}`, runId: `comparison-${variant}`, sourceHashes: { 'go.mod': 'a'.repeat(64) }, binaryDigest: 'b'.repeat(64) };
    for (const [candidatePolicy, referencePolicy] of [[comparison, 'trix-ownership-1.0.0'], ['trix-ownership-1.0.0', comparison]]) {
      const manifest = createDevelopmentManifest({ ...options, candidatePolicy, referencePolicy });
      for (const [moduleVersion, ruleVersion] of [['2.2.0', variant.endsWith('partners') ? '1.1.0' : '1.0.0'], ['2.0.0', '1.0.0'], ...(variant.endsWith('partners') ? [['2.1.0', '1.1.0']] : [])]) {
        const exact = structuredClone(manifest);
        exact.lab.selector.moduleVersion = moduleVersion;
        exact.lab.selector.ruleProfileId = exact.base.ruleProfile.id = `trix-${variant}-${ruleVersion}`;
        const frozen = freezeLabRun(exact);
        assert.equal(frozen.envelope.base.candidate.id, candidatePolicy);
        assert.equal(frozen.envelope.base.reference.id, referencePolicy);
        assert.ok(frozen.envelope.lab.seatPolicies.every(pin => pin.id === referencePolicy && pin.version === '1.0.0'));
        assert.equal(frozen.confirmationEligible, false);
      }
      const invalid = structuredClone(manifest);
      invalid.lab.seatPolicies[0].version = '2.0.0';
      assert.throws(() => freezeLabRun(invalid), /policy\/version/i);
    }
    const defaults = createDevelopmentManifest(options);
    assert.equal(defaults.base.candidate.id, 'trix-reasoning-1.0.0');
    assert.equal(defaults.base.reference.id, 'trix-deterministic-1.0.0');
    assert.throws(() => createDevelopmentManifest({ ...options, candidatePolicy: 'trix-ownership-comparison-9.0.0' }), /policy/i);
  }
  for (const game of ['spades-partners', 'spades-solo', 'hearts-solo']) {
    assert.throws(() => createDevelopmentManifest({ game, runId: 'foreign-comparison', sourceHashes: { 'go.mod': 'a'.repeat(64) }, binaryDigest: 'b'.repeat(64), candidatePolicy: comparison }), /Trix/i);
  }
});

test('ownership opt-in freezes both arm directions across current and historical exact Trix pins', async () => {
  const { createDevelopmentManifest } = await import('../../scripts/coach-lab.mjs');
  const { freezeLabRun } = await import('../server/evaluation/multi-game/lab/freeze.ts');
  const ownership = 'trix-ownership-1.0.0';
  for (const variant of ['basic-solo', 'basic-partners', 'complex-solo', 'complex-partners']) {
    const options = { game: `trix-${variant}`, runId: `ownership-${variant}`, sourceHashes: { 'go.mod': 'a'.repeat(64) }, binaryDigest: 'b'.repeat(64) };
    for (const [candidatePolicy, referencePolicy] of [[ownership, 'trix-history-1.0.0'], ['trix-history-1.0.0', ownership]]) {
      const manifest = createDevelopmentManifest({ ...options, candidatePolicy, referencePolicy });
      assert.equal(manifest.base.candidate.id, candidatePolicy);
      assert.equal(manifest.base.reference.id, referencePolicy);
      assert.ok(manifest.lab.seatPolicies.every((p: { id: string; version: string }) => p.id === referencePolicy && p.version === '1.0.0'));
      for (const [moduleVersion, ruleVersion] of [['2.2.0', variant.endsWith('partners') ? '1.1.0' : '1.0.0'], ['2.0.0', '1.0.0'], ...(variant.endsWith('partners') ? [['2.1.0', '1.1.0']] : [])]) {
        const exact = structuredClone(manifest);
        exact.lab.selector.moduleVersion = moduleVersion;
        exact.lab.selector.ruleProfileId = exact.base.ruleProfile.id = `trix-${variant}-${ruleVersion}`;
        const frozen = freezeLabRun(exact);
        assert.equal(frozen.envelope.base.candidate.id, candidatePolicy);
        assert.equal(frozen.envelope.lab.sourceIdentity.sourceDigest, exact.base.candidate.hash);
        assert.equal(frozen.confirmationEligible, false);
      }
      const badVersion = structuredClone(manifest);
      badVersion.lab.seatPolicies[0].version = '2.0.0';
      assert.throws(() => freezeLabRun(badVersion), /policy\/version/i);
      const foreign = structuredClone(manifest);
      foreign.base.candidate.id = 'hearts-baseline-1.0.0';
      assert.throws(() => freezeLabRun(foreign), /policy/i);
    }
    assert.equal(createDevelopmentManifest(options).base.candidate.id, 'trix-reasoning-1.0.0');
    assert.throws(() => createDevelopmentManifest({ ...options, candidatePolicy: 'trix-ownership-9.0.0' }), /policy/i);
  }
  for (const game of ['spades-partners', 'spades-solo', 'hearts-solo']) {
    assert.throws(() => createDevelopmentManifest({ game, runId: 'foreign-ownership', sourceHashes: { 'go.mod': 'a'.repeat(64) }, binaryDigest: 'b'.repeat(64), candidatePolicy: ownership }), /Trix/i);
  }
});

test('operator creates a bounded private paired manifest without granting paid review or confirmation', async () => {
  const { createDevelopmentManifest } = await import('../../scripts/coach-lab.mjs');
  const hashes = { 'go.mod': 'a'.repeat(64), 'server/example.go': 'b'.repeat(64) };
  const m = createDevelopmentManifest({ game: 'spades-partners', runId: 'test-operator', familyCount: 1, seed: 'literal-seed', sourceHashes: hashes, binaryDigest: 'c'.repeat(64) });
  assert.equal(m.base.purpose, 'development');
  assert.equal(m.base.horizon, 'complete-match');
  assert.equal(m.base.families.length, 1);
  assert.equal(m.base.families[0].seed, 'literal-seed');
  assert.equal(m.base.candidate.id, 'spades-partner-resource-5.0.0');
  assert.equal(m.base.reference.id, 'spades-tactics-2.1.0');
  assert.deepEqual(m.base.seatAssignments, { candidate: [0], reference: [0] });
  assert.deepEqual(m.lab.judge, { mode: 'fixture', authorizedUsd: 0 });
  assert.equal(m.base.promotionAuthority, null);
  assert.ok(m.lab.caps.maxWallMs <= 1_200_000);
  assert.throws(() => createDevelopmentManifest({ game: 'tarneeb-partners', runId: 'unavailable', sourceHashes: hashes, binaryDigest: 'c'.repeat(64) }), /native.*not installed/i);
  assert.throws(() => createDevelopmentManifest({ game: 'spades-partners', runId: 'unsafe', familyCount: 100, sourceHashes: hashes, binaryDigest: 'c'.repeat(64) }), /famil/i);
});

test('operator mode selection keeps Hearts and Solo separate from partnership policies', async () => {
  const { createDevelopmentManifest } = await import('../../scripts/coach-lab.mjs');
  for (const [game, expected] of [['hearts-solo', 'hearts-baseline-1.0.0'], ['spades-solo', 'spades-tactics-2.1.0']] as const) {
    const m = createDevelopmentManifest({ game, runId: game, sourceHashes: { 'go.mod': 'a'.repeat(64) }, binaryDigest: 'b'.repeat(64) });
    assert.equal(m.base.candidate.id, expected);
    assert.equal(m.base.reference.id, expected);
    assert.ok(m.lab.seatPolicies.every((pin: { id: string }) => pin.id === expected));
  }
});

test('operator admits installed Trix through a distinct V2 envelope', async () => {
  const { createDevelopmentManifest } = await import('../../scripts/coach-lab.mjs');
  const { freezeLabRun } = await import('../server/evaluation/multi-game/lab/freeze.ts');
  for (const variant of ['basic-solo', 'basic-partners', 'complex-solo', 'complex-partners']) {
    const m = createDevelopmentManifest({ game: `trix-${variant}`, runId: `trix-${variant}`, sourceHashes: { 'go.mod': 'a'.repeat(64) }, binaryDigest: 'b'.repeat(64) });
    assert.equal(m.schemaVersion, 'coach-lab-run-2.0.0');
    assert.equal(m.base.schemaVersion, 'multi-game-evaluation-2.0.0');
    const partners = variant.endsWith('partners');
    assert.equal(m.lab.selector.ruleProfileId, `trix-${variant}-${partners ? '1.1.0' : '1.0.0'}`);
    assert.equal(m.lab.selector.moduleVersion, '2.2.0');
    assert.deepEqual(m.lab.config, { id: `trix-${variant}`, variant });
    assert.equal(m.base.candidate.id, 'trix-reasoning-1.0.0');
    assert.equal(m.base.reference.id, 'trix-deterministic-1.0.0');
    assert.ok(m.lab.seatPolicies.every((pin: { id: string }) => pin.id === 'trix-deterministic-1.0.0'));
    assert.doesNotThrow(() => freezeLabRun(m));
  }
});

test('Trix manifest admission retains exact historical rules and rejects invented version pairs', async () => {
  const { createDevelopmentManifest } = await import('../../scripts/coach-lab.mjs');
  const { freezeLabRun } = await import('../server/evaluation/multi-game/lab/freeze.ts');
  for (const variant of ['basic-solo', 'basic-partners', 'complex-solo', 'complex-partners']) {
    const current = createDevelopmentManifest({ game: `trix-${variant}`, runId: `pins-${variant}`, sourceHashes: { 'go.mod': 'a'.repeat(64) }, binaryDigest: 'b'.repeat(64) });
    for (const [moduleVersion, ruleVersion] of [['2.0.0', '1.0.0'], ...(variant.endsWith('partners') ? [['2.1.0', '1.1.0']] : [])]) {
      const old = structuredClone(current);
      old.lab.selector.moduleVersion = moduleVersion;
      old.lab.selector.ruleProfileId = `trix-${variant}-${ruleVersion}`;
      old.base.ruleProfile.id = old.lab.selector.ruleProfileId;
      assert.doesNotThrow(() => freezeLabRun(old));
    }
    for (const [moduleVersion, ruleVersion] of [['2.2.0', '1.2.0'], ['9.0.0', '1.0.0'], ...(!variant.endsWith('partners') ? [['2.1.0', '1.1.0']] : [])]) {
      const invalid = structuredClone(current);
      invalid.lab.selector.moduleVersion = moduleVersion;
      invalid.lab.selector.ruleProfileId = `trix-${variant}-${ruleVersion}`;
      invalid.base.ruleProfile.id = invalid.lab.selector.ruleProfileId;
      assert.throws(() => freezeLabRun(invalid), /exact native module\/profile selector/);
    }
  }
});

test('Trix operator policy selection supports reversed paired arms and rejects foreign policies', async () => {
  const { createDevelopmentManifest } = await import('../../scripts/coach-lab.mjs');
  const options = { game: 'trix-basic-partners', runId: 'policy-choice', sourceHashes: { 'go.mod': 'a'.repeat(64) }, binaryDigest: 'b'.repeat(64) };
  const manifest = createDevelopmentManifest({ ...options, candidatePolicy: 'trix-deterministic-1.0.0', referencePolicy: 'trix-reasoning-1.0.0' });
  assert.equal(manifest.base.candidate.id, 'trix-deterministic-1.0.0');
  assert.equal(manifest.base.reference.id, 'trix-reasoning-1.0.0');
  assert.ok(manifest.lab.seatPolicies.every((pin: { id: string }) => pin.id === 'trix-reasoning-1.0.0'));
  assert.throws(() => createDevelopmentManifest({ ...options, candidatePolicy: 'spades-tactics-2.1.0' }), /policy/i);
});

test('history candidate keeps the reasoning control and current Partners rules separately pinned', async () => {
  const { createDevelopmentManifest } = await import('../../scripts/coach-lab.mjs');
  const { freezeLabRun } = await import('../server/evaluation/multi-game/lab/freeze.ts');
  const manifest = createDevelopmentManifest({ game: 'trix-complex-partners', runId: 'history-isolation', sourceHashes: { 'go.mod': 'a'.repeat(64) }, binaryDigest: 'b'.repeat(64), candidatePolicy: 'trix-history-1.0.0', referencePolicy: 'trix-reasoning-1.0.0' });
  assert.equal(manifest.base.candidate.id, 'trix-history-1.0.0');
  assert.equal(manifest.base.reference.id, 'trix-reasoning-1.0.0');
  assert.ok(manifest.lab.seatPolicies.every((p: {id:string}) => p.id === 'trix-reasoning-1.0.0'));
  assert.equal(manifest.lab.selector.ruleProfileId, 'trix-complex-partners-1.1.0');
  assert.doesNotThrow(() => freezeLabRun(manifest));
});

test('frontier selection freezes exact candidate/control identities without changing Trix defaults', async () => {
  const { createDevelopmentManifest } = await import('../../scripts/coach-lab.mjs');
  const { freezeLabRun } = await import('../server/evaluation/multi-game/lab/freeze.ts');
  const frontier = 'trix-frontier-1.0.0';
  for (const variant of ['basic-solo', 'basic-partners', 'complex-solo', 'complex-partners']) {
    const options = { game: `trix-${variant}`, runId: `frontier-${variant}`, sourceHashes: { 'go.mod': 'a'.repeat(64) }, binaryDigest: 'b'.repeat(64) };
    for (const [candidatePolicy, referencePolicy] of [[frontier, 'trix-history-1.0.0'], ['trix-history-1.0.0', frontier]]) {
      const manifest = createDevelopmentManifest({ ...options, candidatePolicy, referencePolicy });
      assert.equal(manifest.base.candidate.id, candidatePolicy);
      assert.equal(manifest.base.reference.id, referencePolicy);
      assert.ok(manifest.lab.seatPolicies.every((pin: { id: string; version: string }) => pin.id === referencePolicy && pin.version === '1.0.0'));
      assert.equal(manifest.lab.selector.moduleVersion, '2.2.0');
      assert.equal(manifest.lab.selector.ruleProfileId, `trix-${variant}-${variant.endsWith('partners') ? '1.1.0' : '1.0.0'}`);
      assert.doesNotThrow(() => freezeLabRun(manifest));
      for (const [moduleVersion, ruleVersion] of [['2.0.0', '1.0.0'], ...(variant.endsWith('partners') ? [['2.1.0', '1.1.0']] : [])]) {
        const historical = structuredClone(manifest);
        historical.lab.selector.moduleVersion = moduleVersion;
        historical.lab.selector.ruleProfileId = historical.base.ruleProfile.id = `trix-${variant}-${ruleVersion}`;
        assert.doesNotThrow(() => freezeLabRun(historical));
      }
      const changed = structuredClone(manifest);
      changed.lab.seatPolicies[0].version = '2.0.0';
      assert.throws(() => freezeLabRun(changed), /policy\/version/);
    }
    const defaults = createDevelopmentManifest(options);
    assert.equal(defaults.base.candidate.id, 'trix-reasoning-1.0.0');
    assert.equal(defaults.base.reference.id, 'trix-deterministic-1.0.0');
    assert.throws(() => createDevelopmentManifest({ ...options, candidatePolicy: 'trix-frontier-9.0.0' }), /policy/i);
  }
  for (const game of ['spades-partners', 'spades-solo', 'hearts-solo']) {
    assert.throws(() => createDevelopmentManifest({ game, runId: 'foreign-frontier', sourceHashes: { 'go.mod': 'a'.repeat(64) }, binaryDigest: 'b'.repeat(64), candidatePolicy: frontier }), /Trix/i);
  }
});
