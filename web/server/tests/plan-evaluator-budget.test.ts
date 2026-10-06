import assert from 'node:assert/strict';
import test from 'node:test';
import { decide, type PlanningPack } from '../strategy/plan/contract.ts';
import { evaluateCandidates, PLAN_EVALUATOR_VERSION } from '../strategy/plan/evaluate.ts';
import type { PlayoutModel, SearchSummary } from '../strategy/plan/types.ts';
import { readSavedAnalysis } from '../strategy/types.ts';
import { getReasoningPack } from '../strategy/registry.ts';
import { HEARTS_PLAN_PROFILE } from '../games/hearts/plan/profiles.ts';
import { SPADES_PROFILES } from '../games/spades/plan/profiles.ts';

type World = { remaining: number; source: number; candidate: number | null };
type Sample = { steps: number; weight: number; values: [number, number]; hits: [number, number] };
const terminal = (values: [number, number] = [2, 1], weight = 1): Sample =>
  ({ steps: 1, weight, values, hits: [1, 0] });

function fixture(samples: readonly (Sample | null)[]) {
  const calls = { sample: 0, clone: 0, apply: 0, defaultMove: 0, utility: 0, events: 0 };
  const model: PlayoutModel<World, number> = {
    id: 'budget-boundary-fixture', version: '1.0.0',
    allocationModel: 'authored-paired-worlds', continuationPolicy: 'counted-continuation',
    sample() {
      const source = calls.sample++;
      const sampled = samples[source];
      return sampled ? { world: { remaining: sampled.steps, source, candidate: null }, weight: sampled.weight } : null;
    },
    clone(world) { calls.clone++; return { ...world }; },
    actor: (world) => world.remaining ? 0 : null,
    apply(world, move) {
      calls.apply++;
      assert.ok(world.remaining > 0, 'only unfinished lines may consume a step');
      if (move) world.candidate = move;
      world.remaining--;
    },
    defaultMove() { calls.defaultMove++; return 0; },
    moveId: String,
    utility(world) {
      calls.utility++;
      assert.equal(world.remaining, 0, 'utility is terminal only');
      return samples[world.source]!.values[world.candidate! - 1];
    },
    events(world) {
      calls.events++;
      assert.equal(world.remaining, 0, 'events are terminal only');
      return { hit: samples[world.source]!.hits[world.candidate! - 1] };
    },
  };
  return { model, calls };
}

function assertBounded(summary: SearchSummary, applied: number, cap: number) {
  assert.equal(summary.steps, applied, 'reported steps count actual applies');
  assert.ok(applied <= cap, `${applied} applied operations exceed cap ${cap}`);
}

test('SYS-02: zero step and world caps reject before any model work', () => {
  for (const budget of [{ worlds: 1, maxSteps: 0 }, { worlds: 0, maxSteps: 1 }]) {
    const { model, calls } = fixture([terminal()]);
    assert.throws(() => evaluateCandidates(model, [1, 2], budget, 123), /declared ceiling/);
    assert.deepEqual(calls, { sample: 0, clone: 0, apply: 0, defaultMove: 0, utility: 0, events: 0 });
  }
});

test('SYS-02: one terminal root cannot start the next candidate after cap one', () => {
  const { model, calls } = fixture([terminal(), terminal()]);
  const summary = evaluateCandidates(model, [1, 2], { worlds: 2, maxSteps: 1 }, 123);
  assertBounded(summary, calls.apply, 1);
  assert.equal(summary.status, 'unavailable');
  assert.equal(summary.reason, 'budget-exhausted-before-first-world');
  assert.equal(summary.worldsUsed, 0);
  assert.equal(summary.effectiveWorlds, 0);
  assert.equal(summary.leaderId, null);
  assert.deepEqual(summary.candidates, []);
  assert.deepEqual(summary.comparableIds, []);
  assert.equal(calls.sample, 1);
  assert.equal(calls.clone, 1);
  assert.equal(calls.defaultMove, 0);
});

test('SYS-02: a sole terminal root exactly at cap one completes', () => {
  const { model, calls } = fixture([terminal()]);
  const summary = evaluateCandidates(model, [1], { worlds: 1, maxSteps: 1 }, 123);
  assertBounded(summary, calls.apply, 1);
  assert.equal(summary.status, 'completed');
  assert.equal(summary.reason, undefined);
  assert.equal(summary.worldsUsed, 1);
  assert.equal(summary.candidates[0].mean, 2);
});

test('SYS-02: an exhausted completed world prevents sampling or cloning the next world', () => {
  const { model, calls } = fixture([terminal(), terminal()]);
  const summary = evaluateCandidates(model, [1, 2], { worlds: 2, maxSteps: 2 }, 123);
  assertBounded(summary, calls.apply, 2);
  assert.equal(summary.status, 'truncated');
  assert.equal(summary.reason, 'step-budget-exhausted');
  assert.equal(summary.worldsUsed, 1);
  assert.equal(calls.sample, 1);
  assert.equal(calls.clone, 2);
});

test('SYS-02: exactly completing every terminal paired world reports completed', () => {
  const { model, calls } = fixture([terminal(), terminal()]);
  const summary = evaluateCandidates(model, [1, 2], { worlds: 2, maxSteps: 4 }, 123);
  assertBounded(summary, calls.apply, 4);
  assert.equal(summary.status, 'completed');
  assert.equal(summary.reason, undefined);
  assert.equal(summary.worldsUsed, 2);
  assert.equal(calls.sample, 2);
  assert.equal(calls.clone, 4);
});

test('SYS-02: an exhausted nonterminal root prevents default selection and continuation', () => {
  const { model, calls } = fixture([{ ...terminal(), steps: 2 }]);
  const summary = evaluateCandidates(model, [1, 2], { worlds: 1, maxSteps: 1 }, 123);
  assertBounded(summary, calls.apply, 1);
  assert.equal(summary.status, 'unavailable');
  assert.equal(summary.reason, 'budget-exhausted-before-first-world');
  assert.equal(calls.defaultMove, 0);
  assert.equal(calls.utility, 0);
  assert.equal(calls.events, 0);
});

test('SYS-02: a terminal continuation cannot start another candidate after the cap', () => {
  const { model, calls } = fixture([{ ...terminal(), steps: 2 }]);
  const summary = evaluateCandidates(model, [1, 2], { worlds: 1, maxSteps: 2 }, 123);
  assertBounded(summary, calls.apply, 2);
  assert.equal(summary.status, 'unavailable');
  assert.equal(summary.worldsUsed, 0);
  assert.equal(calls.clone, 1);
  assert.equal(calls.defaultMove, 1);
});

test('SYS-02: exactly completing paired continuations at the cap reports completed', () => {
  const { model, calls } = fixture([{ ...terminal(), steps: 2 }]);
  const summary = evaluateCandidates(model, [1, 2], { worlds: 1, maxSteps: 4 }, 123);
  assertBounded(summary, calls.apply, 4);
  assert.equal(summary.status, 'completed');
  assert.equal(summary.worldsUsed, 1);
  assert.equal(calls.defaultMove, 2);
});

test('SYS-02: interrupted continuation worlds contribute neither values nor events', () => {
  const { model, calls } = fixture([
    { ...terminal(), steps: 2 },
    { ...terminal([9999, -8888], 100), steps: 2 },
  ]);
  const summary = evaluateCandidates(model, [1, 2], { worlds: 2, maxSteps: 5 }, 123);
  assertBounded(summary, calls.apply, 5);
  assert.equal(summary.status, 'truncated');
  assert.equal(summary.worldsUsed, 1);
  assert.equal(summary.effectiveWorlds, 1);
  assert.deepEqual(summary.candidates.map((candidate) => ({
    mean: candidate.mean, error: candidate.standardError, behind: candidate.behindLeader,
    pairedError: candidate.behindLeaderStandardError, events: candidate.events,
  })), [
    { mean: 2, error: null, behind: 0, pairedError: 0, events: { hit: 1 } },
    { mean: 1, error: null, behind: 1, pairedError: null, events: { hit: 0 } },
  ]);
  assert.equal(calls.sample, 2);
  assert.equal(calls.clone, 3);
  assert.equal(calls.defaultMove, 2);
  assert.equal(calls.utility, 2);
  assert.equal(calls.events, 2);
});

test('SYS-02: a terminal candidate in an incomplete world is excluded from paired arithmetic', () => {
  const { model, calls } = fixture([
    terminal([2, 1], 1),
    { ...terminal([10, 6], 3), hits: [0, 1] },
    terminal([9999, -8888], 100),
  ]);
  const summary = evaluateCandidates(model, [1, 2], { worlds: 3, maxSteps: 5 }, 123, { z: 1.5, floor: 1 });
  assertBounded(summary, calls.apply, 5);
  assert.equal(summary.status, 'truncated');
  assert.equal(summary.worldsUsed, 2);
  assert.equal(summary.effectiveWorlds, 1.6);
  assert.equal(summary.leaderId, '1');
  assert.deepEqual(summary.comparableIds, ['1']);
  assert.deepEqual(summary.candidates.map((candidate) => ({
    mean: candidate.mean, error: candidate.standardError, behind: candidate.behindLeader,
    pairedError: candidate.behindLeaderStandardError, events: candidate.events,
  })), [
    { mean: 8, error: Math.sqrt(72) / 4, behind: 0, pairedError: 0, events: { hit: 0.25 } },
    { mean: 4.75, error: Math.sqrt(28.125) / 4, behind: 3.25, pairedError: Math.sqrt(10.125) / 4, events: { hit: 0.75 } },
  ]);
  assert.equal(calls.sample, 3);
  assert.equal(calls.clone, 5);
});

test('SYS-02: unavailable samples retain their sampling reason without consuming steps', () => {
  const { model, calls } = fixture([null, null]);
  const summary = evaluateCandidates(model, [1, 2], { worlds: 2, maxSteps: 1 }, 123);
  assertBounded(summary, calls.apply, 1);
  assert.equal(summary.status, 'unavailable');
  assert.equal(summary.reason, 'no-consistent-world');
  assert.equal(summary.worldsUsed, 0);
  assert.equal(calls.sample, 2);
  assert.equal(calls.clone, 0);
});

test('SYS-02: every fresh completion status identifies the guarded evaluator', () => {
  for (const [worlds, maxSteps, status] of [[1, 2, 'completed'], [2, 2, 'truncated'], [1, 1, 'unavailable']] as const) {
    const { model } = fixture([terminal(), terminal()]);
    const summary = evaluateCandidates(model, [1, 2], { worlds, maxSteps }, 123);
    assert.equal(summary.status, status);
    assert.equal(summary.evaluatorVersion, PLAN_EVALUATOR_VERSION);
    assert.equal(summary.evaluatorVersion, 'plan-evaluator-1.1.0');
  }
});

test('SYS-02: first-world exhaustion is attributed as a budget fallback at the caller', () => {
  const { model, calls } = fixture([terminal()]);
  const pack: PlanningPack<null, number, World> = {
    id: 'budget-boundary-pack', version: '1.0.0', modes: ['fixture'],
    competition: () => ({ mode: 'individual', competitors: [0, 1, 2, 3].map((seat) => ({ id: String(seat), seats: [seat as 0 | 1 | 2 | 3] })) }),
    observationKey: () => 'fixed-observation',
    candidates: () => [{ id: '1', move: 1 }, { id: '2', move: 2 }],
    plan: () => ({
      schemaVersion: '1.0.0', plannerVersion: 'fixture-1.0.0', mode: 'fixture', seat: 0,
      competitorId: '0', teammates: [], phaseId: 'fixture.play', decisionKind: 'play',
      stance: { id: 'fixture.default', title: 'Default', evidence: 'heuristic' },
      goals: [], competing: [], revisions: [], estimates: [], limitations: [],
    }),
    stances: () => ['fixture.default'], playout: () => model,
    withStance: (move) => move, supports: () => true,
  };
  const decision = decide(pack, null, { maxWorlds: 1, maxSearchedCandidates: 2, maxStances: 1, maxSteps: 1 });
  assert.equal(decision.selectedBy, 'tactical-fallback');
  assert.equal(decision.selectedId, '1');
  assert.deepEqual(decision.limitations, ['The playout budget ended early; the tactical order decides.']);
  assert.equal(decision.search?.reason, 'budget-exhausted-before-first-world');
  assert.equal(calls.apply, 1);
});

test('SYS-02: existing registered policy pins cannot reach the changed exhausted boundaries', () => {
  assert.equal(HEARTS_PLAN_PROFILE.policyVersion, 'hearts-plan-1.0.0');
  assert.deepEqual(SPADES_PROFILES.map((profile) => profile.policyVersion), [
    'spades-plan-3.0.0', 'spades-plan-3.1.0', 'spades-plan-3.2.0', 'spades-plan-3.3.0', 'spades-plan-3.4.0',
  ]);
  const { maxWorlds, maxSearchedCandidates, maxStances, maxSteps } = HEARTS_PLAN_PROFILE.budget;
  const heartsWorst = maxWorlds * maxSearchedCandidates * maxStances * 52;
  assert.equal(heartsWorst, 43_264);
  assert.ok(heartsWorst < maxSteps);
  for (const profile of SPADES_PROFILES) {
    const budget = profile.budget;
    const spadesWorst = budget.maxWorlds * budget.maxSearchedCandidates * budget.maxStances * (4 + 52);
    assert.equal(spadesWorst, 200_704);
    assert.ok(spadesWorst < budget.maxSteps, profile.policyVersion);
  }
  assert.equal(getReasoningPack('hearts').policyVersion, 'hearts-baseline-1.0.0');
  for (const mode of ['spades-solo', 'spades-partners'])
    assert.equal(getReasoningPack(mode).policyVersion, 'spades-tactics-2.1.0');
});

test('SYS-02: the saved-analysis reader preserves historical summaries without evaluator attribution', () => {
  const { model } = fixture([terminal()]);
  const { evaluatorVersion: _currentVersion, ...originalSearch } = evaluateCandidates(model, [1, 2], { worlds: 1, maxSteps: 2 }, 123);
  // The historical shape remains assignable and readable; reading never adds a newer attribution.
  const historical: SearchSummary = originalSearch;
  const saved = {
    schemaVersion: '1.1.0', policyVersion: 'hearts-plan-1.0.0',
    action: { kind: 'play', seat: 0, card: 'C2' }, candidates: [], reasons: [],
    plan: {}, decision: {}, search: historical,
  };
  const bytes = JSON.stringify(saved);
  const read = readSavedAnalysis(saved);
  assert.equal(read, saved);
  assert.equal(JSON.stringify(read), bytes);
  assert.ok(!('evaluatorVersion' in historical));
});
