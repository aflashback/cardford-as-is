import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERCENTILE_MIN_CLUSTERS,
  bonferroniConfidence,
  clusterBootstrap,
  clusterRatioBootstrap,
  createResamplePlan,
  normalCdf,
  normalQuantile,
  pairedDifferences,
  wilson,
  type PairedRow,
} from '../evaluation/gate/inference.ts';
import { createRandom } from '../strategy/plan/random.ts';

const near = (actual: number, expected: number, tolerance: number, label: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const spread = (values: readonly number[]) => {
  const centre = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - centre) ** 2, 0) / values.length);
};

/** Symmetric around zero by construction: every value appears with its mirror image. */
function mirrored(pairs: number, seed: number): number[] {
  const random = createRandom(seed, 11);
  const values: number[] = [];
  for (let index = 0; index < pairs; index++) {
    const value = (random.unit() + random.unit() + random.unit() - 1.5) * 20;
    values.push(value, -value);
  }
  return values;
}

/** Drawn from a distribution that is symmetric around zero; the sample itself is not. */
function centred(count: number, seed: number): number[] {
  const random = createRandom(seed, 13);
  return Array.from({ length: count }, () => (random.unit() + random.unit() + random.unit() - 1.5) * 20);
}

/** Right-skewed with a known mean of `scale`. */
function skewed(count: number, seed: number, scale: number): number[] {
  const random = createRandom(seed, 12);
  return Array.from({ length: count }, () => -Math.log(1 - random.unit()) * scale);
}

test('SG-05: normal distribution helpers match published values', () => {
  near(normalCdf(0), 0.5, 1e-15, 'cdf(0)');
  near(normalCdf(1), 0.8413447460685429, 1e-12, 'cdf(1)');
  near(normalCdf(-2.5), 0.006209665325776132, 1e-12, 'cdf(-2.5)');
  near(normalCdf(3), 0.9986501019683699, 1e-12, 'cdf(3)');
  near(normalCdf(1.959963984540054), 0.975, 1e-12, 'cdf(1.96)');
  near(normalQuantile(0.975), 1.959963984540054, 1e-9, 'quantile(0.975)');
  near(normalQuantile(0.5), 0, 1e-12, 'quantile(0.5)');
  near(normalQuantile(0.001), -3.090232306167813, 1e-9, 'quantile(0.001)');
  near(normalQuantile(0.995), 2.5758293035489, 1e-9, 'quantile(0.995)');
  for (const probability of [0.0004, 0.01, 0.2, 0.5, 0.9, 0.9996])
    near(normalCdf(normalQuantile(probability)), probability, 1e-12, `round trip ${probability}`);
  assert.throws(() => normalQuantile(1.2), /between 0 and 1/);
});

test('SG-05: constant data gives a zero-width interval under both methods', () => {
  for (const clusters of [2, 50, PERCENTILE_MIN_CLUSTERS + 100])
    for (const method of ['auto', 'percentile', 'bca'] as const) {
      const interval = clusterBootstrap(Array(clusters).fill(0.1), { seed: 77, resamples: 400, confidence: 0.95, method });
      assert.equal(interval.lower, interval.estimate, `${clusters} ${method} lower`);
      assert.equal(interval.upper, interval.estimate, `${clusters} ${method} upper`);
      assert.equal(interval.clusters, clusters);
      assert.equal(interval.resamples, 400);
    }
});

test('SG-05: the method follows the cluster count', () => {
  const options = { seed: 5, resamples: 200, confidence: 0.95 };
  const values = mirrored(PERCENTILE_MIN_CLUSTERS / 2, 3_200_001);
  assert.equal(clusterBootstrap(values, options).method, 'percentile');
  assert.equal(clusterBootstrap(values.slice(1), options).method, 'bca');
  assert.equal(clusterBootstrap(values, { ...options, method: 'bca' }).method, 'bca');
});

test('SG-05: symmetric data gives an interval centred on the mean with the analytic width', () => {
  for (const [pairs, seed] of [
    [100, 3_200_011],
    [300, 3_200_012],
  ] as const) {
    const values = mirrored(pairs, seed);
    const interval = clusterBootstrap(values, { seed: 2026, resamples: 10_000, confidence: 0.95 });
    const width = interval.upper - interval.lower;
    near(interval.estimate, 0, 1e-12, 'estimate');
    assert.ok(interval.lower < 0 && interval.upper > 0);
    near(interval.upper - interval.estimate, interval.estimate - interval.lower, 0.06 * width, 'symmetry');
    // Bootstrap standard error of a mean is the population-form spread over root n.
    const analytic = 2 * 1.959963984540054 * (spread(values) / Math.sqrt(values.length));
    near(width, analytic, 0.04 * analytic, 'width');
  }
});

test('SG-05: BCa equals percentile for symmetric unskewed data within tolerance', () => {
  const values = mirrored(120, 3_200_021);
  const options = { seed: 99, resamples: 10_000, confidence: 0.95 };
  const percentile = clusterBootstrap(values, { ...options, method: 'percentile' });
  const corrected = clusterBootstrap(values, { ...options, method: 'bca' });
  const width = percentile.upper - percentile.lower;
  near(corrected.lower, percentile.lower, 0.03 * width, 'lower');
  near(corrected.upper, percentile.upper, 0.03 * width, 'upper');
  assert.equal(corrected.estimate, percentile.estimate);
});

test('SG-05: BCa moves both bounds towards the long tail of skewed data', () => {
  const values = skewed(60, 3_200_031, 10);
  const options = { seed: 99, resamples: 10_000, confidence: 0.95 };
  const percentile = clusterBootstrap(values, { ...options, method: 'percentile' });
  const corrected = clusterBootstrap(values, { ...options, method: 'bca' });
  assert.ok(corrected.lower > percentile.lower, 'lower bound moves up');
  assert.ok(corrected.upper > percentile.upper, 'upper bound moves up');
});

test('SG-05: intervals repeat exactly and one plan resamples figures jointly', () => {
  const values = skewed(80, 3_200_041, 4);
  const options = { seed: 123_456, resamples: 2_000, confidence: 0.9 };
  assert.deepEqual(clusterBootstrap(values, options), clusterBootstrap(values, options));
  const plan = createResamplePlan(values.length, options.seed, options.resamples);
  assert.deepEqual(clusterBootstrap(values, options, plan), clusterBootstrap(values, options));
  // A figure and its double share every resample, so the second interval is exactly twice the first.
  const doubled = clusterBootstrap(values.map((value) => value * 2), options, plan);
  const single = clusterBootstrap(values, options, plan);
  near(doubled.lower, 2 * single.lower, 1e-9, 'joint lower');
  near(doubled.upper, 2 * single.upper, 1e-9, 'joint upper');
  assert.notDeepEqual(clusterBootstrap(values, { ...options, seed: 123_457 }), single);
  assert.throws(() => clusterBootstrap(values.slice(1), options, plan), /does not match/);
});

test('SG-05: coverage simulation with fixed seeds stays near the nominal level', () => {
  const trials = 400;
  const truth = 10;
  const covered = { bca: 0, percentile: 0, symmetric: 0 };
  for (let trial = 0; trial < trials; trial++) {
    const values = skewed(40, 3_210_000 + trial, truth);
    const options = { seed: 3_220_000 + trial, resamples: 1_000, confidence: 0.95 };
    const plan = createResamplePlan(values.length, options.seed, options.resamples);
    const corrected = clusterBootstrap(values, { ...options, method: 'bca' }, plan);
    const percentile = clusterBootstrap(values, { ...options, method: 'percentile' }, plan);
    if (corrected.lower <= truth && truth <= corrected.upper) covered.bca++;
    if (percentile.lower <= truth && truth <= percentile.upper) covered.percentile++;
    const balanced = clusterBootstrap(centred(40, 3_230_000 + trial), options, plan);
    if (balanced.lower <= 0 && 0 <= balanced.upper) covered.symmetric++;
  }
  // Small skewed samples undercover a little; the bounds are fixed for these seeds.
  const share = (count: number) => count / trials;
  assert.ok(share(covered.bca) >= 0.9 && share(covered.bca) <= 0.98, `bca coverage ${share(covered.bca)}`);
  assert.ok(
    share(covered.percentile) >= 0.88 && share(covered.percentile) <= 0.98,
    `percentile coverage ${share(covered.percentile)}`,
  );
  assert.ok(
    share(covered.symmetric) >= 0.92 && share(covered.symmetric) <= 0.98,
    `symmetric coverage ${share(covered.symmetric)}`,
  );
});

test('SG-05: a clustered rate is resampled as a ratio of sums', () => {
  const denominators = Array.from({ length: 60 }, (_, index) => 10 + (index % 7));
  const flat = clusterRatioBootstrap(
    denominators.map((value) => value / 4),
    denominators,
    { seed: 8, resamples: 500, confidence: 0.95 },
  );
  near(flat.estimate, 0.25, 1e-12, 'estimate');
  near(flat.lower, 0.25, 1e-12, 'lower');
  near(flat.upper, 0.25, 1e-12, 'upper');
  const random = createRandom(3_200_051, 3);
  const numerators = denominators.map((value) => random.below(value + 1));
  const varied = clusterRatioBootstrap(numerators, denominators, { seed: 8, resamples: 2_000, confidence: 0.95 });
  near(varied.estimate, numerators.reduce((a, b) => a + b, 0) / denominators.reduce((a, b) => a + b, 0), 1e-12, 'ratio');
  assert.ok(varied.lower < varied.estimate && varied.estimate < varied.upper);
  assert.throws(
    () => clusterRatioBootstrap([1, 0], [2, 0], { seed: 8, resamples: 500, confidence: 0.95 }),
    /positive denominator/,
  );
});

test('SG-05: Wilson intervals match published values', () => {
  const half = wilson(5, 10, 0.95);
  near(half.lower, 0.2366, 5e-4, '5/10 lower');
  near(half.upper, 0.7634, 5e-4, '5/10 upper');
  assert.equal(half.method, 'wilson');
  assert.equal(half.clusters, 10);
  const none = wilson(0, 10, 0.95);
  assert.equal(none.lower, 0);
  near(none.upper, 3.841458820694124 / 13.841458820694124, 1e-9, '0/10 upper');
  const all = wilson(10, 10, 0.95);
  assert.equal(all.upper, 1);
  near(all.lower, 1 - none.upper, 1e-12, '10/10 lower');
  const large = wilson(81, 263, 0.95);
  near(large.lower, 0.2553, 5e-4, '81/263 lower');
  near(large.upper, 0.3662, 5e-4, '81/263 upper');
  assert.throws(() => wilson(3, 0, 0.95), /positive integer/);
  assert.throws(() => wilson(11, 10, 0.95), /0 to n/);
});

test('SG-05: Bonferroni adjustment splits the error rate', () => {
  near(bonferroniConfidence(0.95, 1), 0.95, 1e-15, 'one comparison');
  near(bonferroniConfidence(0.95, 5), 0.99, 1e-15, 'five comparisons');
  near(bonferroniConfidence(0.95, 18), 1 - 0.05 / 18, 1e-15, 'eighteen comparisons');
  assert.throws(() => bonferroniConfidence(0.95, 0), /positive integer/);
  assert.throws(() => bonferroniConfidence(1, 3), /strictly between/);
});

test('SG-05: paired differences average units inside a group and groups inside a cluster', () => {
  const row = (cluster: number, group: string, unit: string, arm: string, value: number): PairedRow => ({
    cluster,
    group,
    unit,
    arm,
    value,
  });
  const rows: PairedRow[] = [
    // Cluster 9: group a has differences 4 and 2 (mean 3); group b has one difference of -1.
    row(9, 'a', 'r0', 'candidate', 10),
    row(9, 'a', 'r0', 'reference', 6),
    row(9, 'a', 'r1', 'candidate', 5),
    row(9, 'a', 'r1', 'reference', 3),
    row(9, 'b', 'r0', 'candidate', 1),
    row(9, 'b', 'r0', 'reference', 2),
    // Cluster 4: one pair, one unit without its reference row, and an arm that is not compared.
    row(4, 'a', 'r0', 'candidate', 7),
    row(4, 'a', 'r0', 'reference', 7),
    row(4, 'a', 'r1', 'candidate', 100),
    row(4, 'a', 'r0', 'previous', 50),
    // Cluster 6 has no complete pair and gives no value.
    row(6, 'a', 'r0', 'reference', 1),
  ];
  const result = pairedDifferences(rows);
  assert.deepEqual(result.clusters, [4, 9]);
  assert.deepEqual(result.values, [0, 1]);
  assert.deepEqual(result.pairs, [1, 3]);
  assert.equal(result.unpaired, 2);
  const incremental = pairedDifferences(rows, { minuend: 'candidate', subtrahend: 'previous' });
  assert.deepEqual(incremental.clusters, [4]);
  assert.deepEqual(incremental.values, [-43]);
  assert.throws(() => pairedDifferences(rows, { minuend: 'candidate', subtrahend: 'candidate' }), /two different arms/);
  assert.throws(() => pairedDifferences([row(1, 'a', 'r0', 'candidate', Number.NaN)]), /finite/);
});

test('SG-05: malformed input is refused', () => {
  const options = { seed: 1, resamples: 500, confidence: 0.95 };
  assert.throws(() => clusterBootstrap([1], options), /at least two clusters/);
  assert.throws(() => clusterBootstrap([], options), /at least two clusters/);
  assert.throws(() => clusterBootstrap([1, Number.NaN], options), /finite/);
  assert.throws(() => clusterBootstrap([1, 2], { ...options, confidence: 1 }), /strictly between/);
  assert.throws(() => clusterBootstrap([1, 2], { ...options, resamples: 10 }), /at least 100/);
  assert.throws(() => clusterBootstrap([1, 2], { ...options, seed: -1 }), /unsigned 32-bit/);
});
