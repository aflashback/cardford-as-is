import assert from 'node:assert/strict';
import test from 'node:test';
import type { GateStatus, Interval } from '../evaluation/gate/contracts.ts';
import { bonferroniConfidence, clusterBootstrap } from '../evaluation/gate/inference.ts';
import { decideStatus, promotionStatus, type PromotionInput, type RuleInput } from '../evaluation/gate/rule.ts';

const interval = (lower: number, upper: number): Interval => ({
  estimate: (lower + upper) / 2,
  lower,
  upper,
  method: 'percentile',
  clusters: 1_200,
  resamples: 10_000,
});

const clean = { illegalActions: 0, scoreMismatches: 0, falseClaims: 0, informationBreaches: 0 };
const enough = { seedsWithChange: 640, changedDecisions: 2_900 };
const thresholds = { minSeedsWithChange: 200, minChangedDecisions: 500 };

const input = (overrides: Partial<RuleInput> = {}): RuleInput => ({
  interval: interval(-1, 3),
  nonInferiorityMargin: 5,
  safety: clean,
  changed: enough,
  thresholds,
  ...overrides,
});

const statusOf = (overrides: Partial<RuleInput>): GateStatus => decideStatus(input(overrides)).status;

test('SG-05: each row of the ordered rule is reached by its own condition', () => {
  assert.equal(statusOf({ safety: { ...clean, illegalActions: 1 } }), 'blocked');
  assert.equal(statusOf({ changed: { seedsWithChange: 0, changedDecisions: 0 } }), 'unchanged');
  assert.equal(statusOf({ interval: interval(-6, -0.5) }), 'worse');
  assert.equal(statusOf({ interval: interval(0.2, 4) }), 'improved');
  assert.equal(statusOf({ interval: interval(-4.9, 2) }), 'non-inferior');
  assert.equal(statusOf({ interval: interval(-7, 2) }), 'inconclusive');
});

test('SG-05: every safety failure blocks, whatever the interval says', () => {
  for (const key of ['illegalActions', 'scoreMismatches', 'falseClaims', 'informationBreaches'] as const)
    for (const bounds of [interval(2, 4), interval(-4, -2), interval(-1, 1)]) {
      const decision = decideStatus(input({ interval: bounds, safety: { ...clean, [key]: 1 } }));
      assert.equal(decision.status, 'blocked', key);
      assert.equal(decision.reasons.length, 1);
    }
  const all = decideStatus(
    input({
      safety: { illegalActions: 2, scoreMismatches: 1, falseClaims: 3, informationBreaches: 1 },
      changed: { seedsWithChange: 0, changedDecisions: 0 },
    }),
  );
  assert.equal(all.status, 'blocked', 'blocked precedes unchanged');
  assert.deepEqual(all.reasons, [
    '2 illegal action(s)',
    '1 score mismatch(es)',
    '3 false fact claim(s)',
    '1 hidden-information breach(es)',
  ]);
});

test('SG-05: unchanged needs proven parity and precedes the interval rows', () => {
  const unchanged = decideStatus(
    input({ interval: interval(0, 0), parity: { comparedDecisions: 9_000, changedDecisions: 0, divergentRounds: 0 } }),
  );
  assert.equal(unchanged.status, 'unchanged');
  assert.deepEqual(unchanged.reasons, ['0 of 9000 compared decisions changed']);
  // Parity over the whole mode wins over the counts of the primary placement.
  assert.equal(
    statusOf({
      changed: { seedsWithChange: 0, changedDecisions: 0 },
      parity: { comparedDecisions: 9_000, changedDecisions: 12 },
      interval: interval(0, 0),
    }),
    'inconclusive',
  );
  const unproven = decideStatus(
    input({ interval: null, parity: { comparedDecisions: 0, changedDecisions: 0 }, changed: { seedsWithChange: 0, changedDecisions: 0 } }),
  );
  assert.equal(unproven.status, 'inconclusive');
  assert.match(unproven.reasons.join(' | '), /parity is not proven/);
  const divergent = decideStatus(
    input({
      interval: interval(-0.5, 0.5),
      changed: { seedsWithChange: 0, changedDecisions: 0 },
      parity: { comparedDecisions: 9_000, changedDecisions: 0, divergentRounds: 4 },
    }),
  );
  assert.equal(divergent.status, 'inconclusive');
  assert.match(divergent.reasons.join(' | '), /4 paired round\(s\) differ/);
});

test('SG-05: interval boundaries fall on the cautious side', () => {
  assert.equal(statusOf({ interval: interval(-3, 0) }), 'non-inferior', 'upper bound of exactly 0 is not worse');
  assert.equal(statusOf({ interval: interval(-3, -1e-9) }), 'worse');
  assert.equal(statusOf({ interval: interval(0, 3) }), 'non-inferior', 'lower bound of exactly 0 is not improved');
  assert.equal(statusOf({ interval: interval(1e-9, 3) }), 'improved');
  assert.equal(statusOf({ interval: interval(-5, 3) }), 'inconclusive', 'lower bound of exactly -delta is not non-inferior');
  assert.equal(statusOf({ interval: interval(-2.5, 3), nonInferiorityMargin: 2.5 }), 'inconclusive');
  assert.equal(statusOf({ interval: interval(-2.4, 3), nonInferiorityMargin: 2.5 }), 'non-inferior');
  assert.equal(statusOf({ interval: interval(-4, -1) }), 'worse', 'worse is read before non-inferior');
  assert.equal(statusOf({ interval: null }), 'inconclusive');
});

test('SG-05: evidence minimums withhold the favourable statuses and never soften worse', () => {
  const fewSeeds = { seedsWithChange: 199, changedDecisions: 2_000 };
  const fewDecisions = { seedsWithChange: 400, changedDecisions: 499 };
  for (const changed of [fewSeeds, fewDecisions]) {
    assert.equal(statusOf({ interval: interval(1, 4), changed }), 'inconclusive');
    assert.equal(statusOf({ interval: interval(-1, 4), changed }), 'inconclusive');
    assert.equal(statusOf({ interval: interval(-4, -1), changed }), 'worse');
  }
  assert.equal(statusOf({ interval: interval(1, 4), changed: { seedsWithChange: 200, changedDecisions: 500 } }), 'improved');
  const decision = decideStatus(input({ interval: interval(1, 4), changed: fewSeeds }));
  assert.deepEqual(decision.reasons, [
    'interval lower bound above 0, withheld',
    '199 seed(s) with a changed decision, fewer than 200',
  ]);
});

test('SG-05: a worse own score withholds improved and is reported beside non-inferior', () => {
  const held = decideStatus(input({ interval: interval(1, 4), guards: { ownScoreInterval: interval(-6, -1) } }));
  assert.equal(held.status, 'inconclusive');
  assert.equal(held.guards.ownScore, 'failed');
  assert.match(held.reasons.join(' | '), /own score interval upper bound below 0/);
  const kept = decideStatus(input({ interval: interval(1, 4), guards: { ownScoreInterval: interval(-6, 0.1) } }));
  assert.equal(kept.status, 'improved');
  assert.equal(kept.guards.ownScore, 'met');
  const beside = decideStatus(input({ interval: interval(-1, 4), guards: { ownScoreInterval: interval(-6, -1) } }));
  assert.equal(beside.status, 'non-inferior');
  assert.equal(beside.guards.ownScore, 'failed');
  assert.equal(decideStatus(input()).guards.ownScore, 'not-evaluated');
});

test('SG-05: the subgroup guard reads Bonferroni-adjusted intervals', () => {
  // A subgroup whose nominal interval lies below zero while its adjusted interval does not.
  const values = Array.from({ length: 120 }, (_, index) => -0.8 + ((index * 37) % 120) / 10 - 5.95);
  const options = { seed: 41, resamples: 4_000, confidence: 0.95 };
  const nominal = clusterBootstrap(values, options);
  const adjusted = clusterBootstrap(values, { ...options, confidence: bonferroniConfidence(0.95, 18) });
  assert.ok(adjusted.lower < nominal.lower && adjusted.upper > nominal.upper, 'adjustment widens the interval');
  assert.ok(nominal.upper < 0, `nominal upper ${nominal.upper}`);
  assert.ok(adjusted.upper >= 0, `adjusted upper ${adjusted.upper}`);
  const passing = decideStatus(
    input({ interval: interval(1, 4), guards: { subgroups: [{ id: 'steady', interval: adjusted }] } }),
  );
  assert.equal(passing.status, 'improved');
  assert.equal(passing.guards.subgroups, 'met');
  const failing = decideStatus(
    input({
      interval: interval(1, 4),
      guards: {
        subgroups: [
          { id: 'steady', interval: adjusted },
          { id: 'bold', interval: interval(-9, -2) },
        ],
      },
    }),
  );
  assert.equal(failing.status, 'inconclusive');
  assert.equal(failing.guards.subgroups, 'failed');
  assert.deepEqual(failing.guards.failedSubgroups, ['bold']);
});

test('SG-05: malformed rule input is refused', () => {
  assert.throws(() => decideStatus(input({ nonInferiorityMargin: 0 })), /positive number/);
  assert.throws(() => decideStatus(input({ nonInferiorityMargin: -5 })), /positive number/);
  assert.throws(() => decideStatus(input({ safety: { ...clean, falseClaims: -1 } })), /non-negative integer/);
  assert.throws(() => decideStatus(input({ changed: { seedsWithChange: 1.5, changedDecisions: 3 } })), /non-negative/);
  assert.throws(() => decideStatus(input({ interval: interval(3, 1) })), /ordered bounds/);
  assert.throws(() => decideStatus(input({ interval: { ...interval(1, 3), upper: Number.NaN } })), /finite/);
});

const met = { ownScore: 'met', subgroups: 'met', failedSubgroups: [] } as const;
const promotion = (overrides: Partial<PromotionInput> = {}): PromotionInput => ({
  targetMode: 'pairs',
  modes: {
    pairs: { status: 'improved', guards: { ...met, failedSubgroups: [] } },
    individual: { status: 'non-inferior', guards: { ...met, failedSubgroups: [] } },
  },
  falseClaims: 0,
  informationChecked: true,
  confirmation: true,
  humanLabels: null,
  ownerWaiver: null,
  ownerApproval: null,
  ...overrides,
});

test('SG-05: promotion is blocked whenever human labels or owner approval are absent', () => {
  const milestone = promotionStatus(promotion());
  assert.equal(milestone.status, 'blocked');
  assert.deepEqual(milestone.reasons, [
    'no labels from a competent human reviewer and no written owner waiver',
    'no recorded owner approval',
  ]);
  assert.equal(promotionStatus(promotion({ humanLabels: 'labels-record' })).status, 'blocked');
  assert.equal(promotionStatus(promotion({ ownerApproval: 'approval-record' })).status, 'blocked');
  assert.equal(promotionStatus(promotion({ ownerWaiver: '  ', ownerApproval: 'approval-record' })).status, 'blocked');
});

test('SG-05: with labels and approval recorded, every other condition still has to hold', () => {
  const recorded = { humanLabels: 'labels-record', ownerApproval: 'approval-record' };
  assert.deepEqual(promotionStatus(promotion(recorded)), { status: 'eligible', reasons: [] });
  assert.equal(promotionStatus(promotion({ ownerWaiver: 'waiver-record', ownerApproval: 'approval-record' })).status, 'eligible');
  const blockedBy = (overrides: Partial<PromotionInput>) => {
    const decision = promotionStatus(promotion({ ...recorded, ...overrides }));
    assert.equal(decision.status, 'blocked');
    return decision.reasons.join(' | ');
  };
  assert.match(blockedBy({ confirmation: false }), /development run/);
  assert.match(blockedBy({ falseClaims: 1 }), /1 false fact claim/);
  assert.match(blockedBy({ informationChecked: false }), /not checked/);
  assert.match(blockedBy({ targetMode: 'absent' }), /no result for the targeted mode/);
  assert.match(
    blockedBy({ modes: { pairs: { status: 'non-inferior', guards: { ...met, failedSubgroups: [] } } } }),
    /targeted mode pairs is non-inferior/,
  );
  assert.match(
    blockedBy({
      modes: {
        pairs: { status: 'improved', guards: { ...met, failedSubgroups: [] } },
        individual: { status: 'inconclusive', guards: { ...met, failedSubgroups: [] } },
      },
    }),
    /mode individual is inconclusive/,
  );
  assert.match(
    blockedBy({
      modes: {
        pairs: { status: 'improved', guards: { ...met, failedSubgroups: [] } },
        individual: {
          status: 'non-inferior',
          guards: { ownScore: 'failed', subgroups: 'not-evaluated', failedSubgroups: [] },
        },
      },
    }),
    /own score guard failed in mode individual.*subgroup guard not-evaluated in mode individual/,
  );
  // An unchanged mode has no differences to guard.
  assert.equal(
    promotionStatus(
      promotion({
        ...recorded,
        modes: {
          pairs: { status: 'improved', guards: { ...met, failedSubgroups: [] } },
          individual: {
            status: 'unchanged',
            guards: { ownScore: 'not-evaluated', subgroups: 'not-evaluated', failedSubgroups: [] },
          },
        },
      }),
    ).status,
    'eligible',
  );
});
