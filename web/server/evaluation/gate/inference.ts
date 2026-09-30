import { createRandom } from '../../strategy/plan/random.ts';
import type { Interval } from './contracts.ts';

/**
 * SG-05: seed-clustered inference. The cluster is the seed: every style, placement,
 * rotation and arm of a seed is averaged into one value before anything is resampled.
 * All draws come from one seeded generator, so a report can be reproduced exactly.
 */
export const INFERENCE_VERSION = 'cluster-bootstrap-1.0.0';

/** Percentile intervals at or above this many clusters; bias-corrected and accelerated below it. */
export const PERCENTILE_MIN_CLUSTERS = 400;

export type BootstrapMethod = 'percentile' | 'bca';

export type BootstrapOptions = {
  seed: number;
  resamples: number;
  confidence: number;
  /** `auto` chooses by the cluster count. The explicit methods exist for comparison checks. */
  method?: 'auto' | BootstrapMethod;
};

/**
 * Cluster positions for every resample. Two figures bootstrapped with the same plan are
 * resampled jointly: resample k holds the same clusters for both.
 */
export type ResamplePlan = {
  seed: number;
  clusters: number;
  resamples: number;
  draws: Uint16Array | Uint32Array;
};

const BOOTSTRAP_STREAM = 0;

function assertConfidence(confidence: number): void {
  if (!(confidence > 0 && confidence < 1)) throw new Error('confidence must lie strictly between 0 and 1.');
}

function assertFinite(values: readonly number[], name: string): void {
  for (const value of values)
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must hold finite numbers.`);
}

export function createResamplePlan(clusters: number, seed: number, resamples: number): ResamplePlan {
  if (!Number.isInteger(clusters) || clusters < 2) throw new Error('A cluster interval needs at least two clusters.');
  if (!Number.isInteger(resamples) || resamples < 100) throw new Error('resamples must be an integer of at least 100.');
  const random = createRandom(seed, BOOTSTRAP_STREAM);
  const length = clusters * resamples;
  const draws = clusters <= 0x10000 ? new Uint16Array(length) : new Uint32Array(length);
  for (let position = 0; position < length; position++) draws[position] = random.below(clusters);
  return { seed, clusters, resamples, draws };
}

function planFor(clusters: number, options: BootstrapOptions, plan: ResamplePlan | undefined): ResamplePlan {
  if (!plan) return createResamplePlan(clusters, options.seed, options.resamples);
  if (plan.clusters !== clusters || plan.seed !== options.seed || plan.resamples !== options.resamples)
    throw new Error('The resample plan does not match the cluster count, seed and resample count.');
  return plan;
}

/** Standard normal distribution function, accurate to double precision (Hart's rational forms). */
export function normalCdf(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  const size = Math.abs(x);
  let tail: number;
  if (size > 37) tail = 0;
  else {
    const density = Math.exp((-size * size) / 2);
    if (size < 7.07106781186547) {
      let upper = 3.52624965998911e-2 * size + 0.700383064443688;
      upper = upper * size + 6.37396220353165;
      upper = upper * size + 33.912866078383;
      upper = upper * size + 112.079291497871;
      upper = upper * size + 221.213596169931;
      upper = upper * size + 220.206867912376;
      let lower = 8.83883476483184e-2 * size + 1.75566716318264;
      lower = lower * size + 16.064177579207;
      lower = lower * size + 86.7807322029461;
      lower = lower * size + 296.564248779674;
      lower = lower * size + 637.333633378831;
      lower = lower * size + 793.826512519948;
      lower = lower * size + 440.413735824752;
      tail = (density * upper) / lower;
    } else {
      let chain = size + 0.65;
      chain = size + 4 / chain;
      chain = size + 3 / chain;
      chain = size + 2 / chain;
      chain = size + 1 / chain;
      tail = density / chain / 2.506628274631;
    }
  }
  return x > 0 ? 1 - tail : tail;
}

const A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1,
  2.506628277459239,
];
const B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1,
];
const C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968,
  2.938163982698783,
];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

/** Inverse of `normalCdf` (Acklam's rational forms with one correction step). */
export function normalQuantile(probability: number): number {
  if (!(probability >= 0 && probability <= 1)) throw new Error('probability must lie between 0 and 1.');
  if (probability === 0) return Number.NEGATIVE_INFINITY;
  if (probability === 1) return Number.POSITIVE_INFINITY;
  const low = 0.02425;
  let x: number;
  if (probability < low) {
    const q = Math.sqrt(-2 * Math.log(probability));
    x =
      (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  } else if (probability <= 1 - low) {
    const q = probability - 0.5;
    const r = q * q;
    x =
      ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) /
      (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - probability));
    x =
      -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  }
  const error = normalCdf(x) - probability;
  const step = error * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - step / (1 + (x * step) / 2);
}

/** Quantile of an ascending list with linear interpolation between neighbours. */
function quantile(sorted: Float64Array, probability: number): number {
  const position = Math.min(Math.max(probability, 0), 1) * (sorted.length - 1);
  const below = Math.floor(position);
  const above = Math.ceil(position);
  return sorted[below] + (position - below) * (sorted[above] - sorted[below]);
}

/** Acceleration from leave-one-cluster-out estimates. Zero when they do not vary. */
function acceleration(leaveOneOut: Float64Array): number {
  let total = 0;
  for (const value of leaveOneOut) total += value;
  const centre = total / leaveOneOut.length;
  let squares = 0;
  let cubes = 0;
  for (const value of leaveOneOut) {
    const gap = centre - value;
    squares += gap * gap;
    cubes += gap * gap * gap;
  }
  if (squares === 0) return 0;
  const result = cubes / (6 * Math.pow(squares, 1.5));
  return Number.isFinite(result) ? result : 0;
}

function finish(
  estimate: number,
  replicates: Float64Array,
  leaveOneOut: Float64Array,
  options: BootstrapOptions,
): Interval {
  const clusters = leaveOneOut.length;
  const requested = options.method ?? 'auto';
  const method: BootstrapMethod =
    requested === 'auto' ? (clusters >= PERCENTILE_MIN_CLUSTERS ? 'percentile' : 'bca') : requested;
  const sorted = Float64Array.from(replicates).sort();
  const tail = (1 - options.confidence) / 2;
  let lowerAt = tail;
  let upperAt = 1 - tail;
  if (method === 'bca') {
    let below = 0;
    let equal = 0;
    for (const value of replicates) {
      if (value < estimate) below++;
      else if (value === estimate) equal++;
    }
    const edge = 1 / (2 * replicates.length);
    const share = Math.min(Math.max((below + equal / 2) / replicates.length, edge), 1 - edge);
    const bias = normalQuantile(share);
    const skew = acceleration(leaveOneOut);
    const adjust = (probability: number): number | null => {
      const z = bias + normalQuantile(probability);
      const scale = 1 - skew * z;
      return scale > 0 ? normalCdf(bias + z / scale) : null;
    };
    const lowerAdjusted = adjust(tail);
    const upperAdjusted = adjust(1 - tail);
    if (lowerAdjusted !== null && upperAdjusted !== null) {
      lowerAt = lowerAdjusted;
      upperAt = upperAdjusted;
    }
  }
  return {
    estimate,
    lower: quantile(sorted, lowerAt),
    upper: quantile(sorted, upperAt),
    method,
    clusters,
    resamples: replicates.length,
  };
}

/** Interval for the mean of one value per cluster. */
export function clusterBootstrap(
  valuesByCluster: readonly number[],
  options: BootstrapOptions,
  plan?: ResamplePlan,
): Interval {
  assertConfidence(options.confidence);
  assertFinite(valuesByCluster, 'valuesByCluster');
  const clusters = valuesByCluster.length;
  const { draws, resamples } = planFor(clusters, options, plan);
  const values = Float64Array.from(valuesByCluster);
  let total = 0;
  for (const value of values) total += value;
  const estimate = total / clusters;
  const replicates = new Float64Array(resamples);
  for (let resample = 0, position = 0; resample < resamples; resample++) {
    let sum = 0;
    for (let draw = 0; draw < clusters; draw++, position++) sum += values[draws[position]];
    replicates[resample] = sum / clusters;
  }
  const leaveOneOut = new Float64Array(clusters);
  for (let cluster = 0; cluster < clusters; cluster++) leaveOneOut[cluster] = (total - values[cluster]) / (clusters - 1);
  return finish(estimate, replicates, leaveOneOut, options);
}

/**
 * Interval for a rate whose numerator and denominator are both summed over clusters.
 * Every cluster needs a positive denominator, so no resample is undefined.
 */
export function clusterRatioBootstrap(
  numerators: readonly number[],
  denominators: readonly number[],
  options: BootstrapOptions,
  plan?: ResamplePlan,
): Interval {
  assertConfidence(options.confidence);
  assertFinite(numerators, 'numerators');
  assertFinite(denominators, 'denominators');
  if (numerators.length !== denominators.length)
    throw new Error('numerators and denominators must describe the same clusters.');
  if (denominators.some((value) => value <= 0)) throw new Error('Every cluster needs a positive denominator.');
  const clusters = numerators.length;
  const { draws, resamples } = planFor(clusters, options, plan);
  const top = Float64Array.from(numerators);
  const bottom = Float64Array.from(denominators);
  let topTotal = 0;
  let bottomTotal = 0;
  for (let cluster = 0; cluster < clusters; cluster++) {
    topTotal += top[cluster];
    bottomTotal += bottom[cluster];
  }
  const replicates = new Float64Array(resamples);
  for (let resample = 0, position = 0; resample < resamples; resample++) {
    let topSum = 0;
    let bottomSum = 0;
    for (let draw = 0; draw < clusters; draw++, position++) {
      topSum += top[draws[position]];
      bottomSum += bottom[draws[position]];
    }
    replicates[resample] = topSum / bottomSum;
  }
  const leaveOneOut = new Float64Array(clusters);
  for (let cluster = 0; cluster < clusters; cluster++)
    leaveOneOut[cluster] = (topTotal - top[cluster]) / (bottomTotal - bottom[cluster]);
  return finish(topTotal / bottomTotal, replicates, leaveOneOut, options);
}

/** Wilson score interval for a proportion of independent events. */
export function wilson(successes: number, n: number, confidence: number): Interval {
  assertConfidence(confidence);
  if (!Number.isInteger(n) || n < 1) throw new Error('n must be a positive integer.');
  if (!Number.isInteger(successes) || successes < 0 || successes > n)
    throw new Error('successes must be an integer from 0 to n.');
  const z = normalQuantile(1 - (1 - confidence) / 2);
  const share = successes / n;
  const scale = 1 + (z * z) / n;
  const centre = (share + (z * z) / (2 * n)) / scale;
  const half = (z * Math.sqrt((share * (1 - share)) / n + (z * z) / (4 * n * n))) / scale;
  return {
    estimate: share,
    lower: successes === 0 ? 0 : Math.max(0, centre - half),
    upper: successes === n ? 1 : Math.min(1, centre + half),
    method: 'wilson',
    clusters: n,
    resamples: 0,
  };
}

/** Confidence for each of `comparisons` intervals so that they hold jointly at `confidence`. */
export function bonferroniConfidence(confidence: number, comparisons: number): number {
  assertConfidence(confidence);
  if (!Number.isInteger(comparisons) || comparisons < 1) throw new Error('comparisons must be a positive integer.');
  return 1 - (1 - confidence) / comparisons;
}

export type PairedRow = {
  /** The seed. */
  cluster: number;
  /** Rows of one group are averaged first; groups then weigh equally inside the cluster. */
  group?: string;
  /** Names one paired unit inside the cluster, for example a placement and rotation. */
  unit: string;
  arm: string;
  value: number;
};

export type PairedDifferences = {
  /** Ascending. */
  clusters: number[];
  /** One averaged difference per cluster, in the same order. */
  values: number[];
  /** Complete pairs behind each cluster value. */
  pairs: number[];
  /** Units that lacked one arm and were left out. */
  unpaired: number;
};

/**
 * Averages `minuend - subtrahend` over the paired units of each cluster. A unit counts
 * only when it has exactly one row for each arm.
 */
export function pairedDifferences(
  rows: readonly PairedRow[],
  arms: { minuend: string; subtrahend: string } = { minuend: 'candidate', subtrahend: 'reference' },
): PairedDifferences {
  if (arms.minuend === arms.subtrahend) throw new Error('A paired difference needs two different arms.');
  type Unit = { minuend: number[]; subtrahend: number[] };
  const byCluster = new Map<number, Map<string, Map<string, Unit>>>();
  for (const row of rows) {
    if (row.arm !== arms.minuend && row.arm !== arms.subtrahend) continue;
    if (!Number.isFinite(row.value)) throw new Error('Paired rows must hold finite values.');
    const groups = byCluster.get(row.cluster) ?? new Map<string, Map<string, Unit>>();
    byCluster.set(row.cluster, groups);
    const units = groups.get(row.group ?? '') ?? new Map<string, Unit>();
    groups.set(row.group ?? '', units);
    const unit = units.get(row.unit) ?? { minuend: [], subtrahend: [] };
    units.set(row.unit, unit);
    (row.arm === arms.minuend ? unit.minuend : unit.subtrahend).push(row.value);
  }
  const result: PairedDifferences = { clusters: [], values: [], pairs: [], unpaired: 0 };
  for (const cluster of [...byCluster.keys()].sort((left, right) => left - right)) {
    let groupTotal = 0;
    let groupCount = 0;
    let pairs = 0;
    const groups = byCluster.get(cluster)!;
    for (const group of [...groups.keys()].sort()) {
      let total = 0;
      let count = 0;
      const units = groups.get(group)!;
      for (const name of [...units.keys()].sort()) {
        const unit = units.get(name)!;
        if (unit.minuend.length !== 1 || unit.subtrahend.length !== 1) {
          result.unpaired++;
          continue;
        }
        total += unit.minuend[0] - unit.subtrahend[0];
        count++;
      }
      if (count === 0) continue;
      groupTotal += total / count;
      groupCount++;
      pairs += count;
    }
    if (groupCount === 0) continue;
    result.clusters.push(cluster);
    result.values.push(groupTotal / groupCount);
    result.pairs.push(pairs);
  }
  return result;
}
