import assert from 'node:assert/strict';
import test from 'node:test';
import { spadesCaseCatalog, validateCaseCatalog } from '../games/spades/cases/catalog.ts';
import { resolveCases } from '../strategy/cases/resolve.ts';
import type { CaseDefinition } from '../strategy/cases/types.ts';
import { renderCaseCatalog } from '../../scripts/render-case-catalog.ts';
import { bytes } from '../evaluation/multi-game/research.ts';

test('M07 stable maintained IDs and linked cue/predicate definitions', () => {
  assert.deepEqual(spadesCaseCatalog.map(entry => entry.id), ['CASE-01', 'CASE-02', 'CASE-03', 'CASE-04']);
  assert.doesNotThrow(() => validateCaseCatalog(spadesCaseCatalog));
  assert.throws(() => validateCaseCatalog([{ ...spadesCaseCatalog[0], cue: { id: 'unknown', version: '1' } }]), /cue/);
  assert.throws(() => validateCaseCatalog([{ ...spadesCaseCatalog[0], predicates: ['invented'] }]), /predicate/);
});
test('M07 generated human-readable catalog matches source and keeps occurrence/label/confirmation gaps separate',()=>{
  const rendered=renderCaseCatalog();assert.equal(bytes('docs/generated/game-cases.md').toString('utf8'),rendered);
  assert.match(rendered,/zero occurrence remains an open gap/);assert.match(rendered,/336 legacy/);assert.match(rendered,/32 original blind-review entries are pending/);
});

const entry = (id: string, preferred: string[], priority = 1): CaseDefinition<number, string, string> => ({
  id, version: '1', family: 'test', variants: ['test'], phases: ['play'], summary: id,
  prerequisites: [], trigger: () => true, excluded: () => [], priority, conflictsWith: [],
  assess: () => ({ preferred, reasonable: [], evidence: 'heuristic', claims: [id], limitations: [] }),
  cue: { id, version: '1' }, fixtures: [], counterexamples: [], sources: [], review: 'hypothesis',
});
test('M07 equal or unequal heuristic priorities retain conflicting alternatives independent of file order', () => {
  for (const priority of [1, 2]) {
    const cases = [entry('a', ['x']), entry('b', ['y'], priority)];
    const opts = { legal: ['x','y'], actionId: (id: string) => id, selectedId: 'x' };
    const result = resolveCases(1, cases, opts);
    assert.deepEqual(result, resolveCases(1, cases.toReversed(), opts));
    assert.equal(result.appliedRule, null); assert.equal(result.conflicts.length, 1);
    assert.deepEqual(result.alternatives, ['x','y']); assert.deepEqual(result.selectedActionClaims, ['a']);
  }
});
test('M07 rejects illegal assessment and only a named versioned conflict rule resolves preferences', () => {
  assert.throws(() => resolveCases(1, [entry('a', ['outside'])], { legal: ['x'], actionId: id => id }), /illegal/);
  const result = resolveCases(1, [entry('a', ['x']), entry('b', ['y'])], {
    legal: ['x','y'], actionId: id => id, rule: { id: 'objective', version: '1', resolve: () => ['y'] }, selectedId: 'y',
  });
  assert.equal(result.appliedRule, 'objective@1'); assert.deepEqual(result.selectedActionClaims, ['b']);
});
