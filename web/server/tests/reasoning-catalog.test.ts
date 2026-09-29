import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SPADES_SCENARIOS,
  validateScenarioCatalog,
  type ScenarioDefinition,
} from '../games/spades/reasoning/catalog.ts';

test('GR-02: every Spades family has one reviewed variant and evidence status', () => {
  assert.equal(SPADES_SCENARIOS.length, 26);
  assert.deepEqual(
    SPADES_SCENARIOS.map((scenario) => scenario.id).sort(),
    [
      ...Array.from({ length: 14 }, (_, n) => `S${String(n + 1).padStart(2, '0')}`),
      ...Array.from({ length: 12 }, (_, n) => `P${String(n + 1).padStart(2, '0')}`),
    ].sort(),
  );
  assert.doesNotThrow(() => validateScenarioCatalog(SPADES_SCENARIOS));
  assert.ok(SPADES_SCENARIOS.every((s) => s.status !== 'independently-reviewed'));
});

test('GR-02: catalog rejects duplicate, unsupported variant and unbacked evidence', () => {
  const base: ScenarioDefinition = {
    id: 'P08',
    title: 'Partner signals',
    modes: ['spades-partners'],
    phases: ['play'],
    evidence: 'heuristic',
    status: 'cataloged',
    caseIds: [],
    cueIds: [],
  };
  assert.throws(() => validateScenarioCatalog([base, base]), /Duplicate/);
  assert.throws(() => validateScenarioCatalog([{ ...base, modes: ['spades-solo'] }]), /partner/);
  assert.throws(
    () => validateScenarioCatalog([{ ...base, status: 'tactic-tested' }]),
    /case and cue/,
  );
});
