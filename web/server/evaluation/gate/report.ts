import {
  GATE_SCHEMA_VERSION,
  type Arm,
  type GateRoundRow,
  type GateRunManifest,
  type GateShadowRow,
  type GateStatus,
  type Interval,
  type Population,
  type RoundRow,
  type ShadowRow,
} from './contracts.ts';
import {
  INFERENCE_VERSION,
  bonferroniConfidence,
  clusterBootstrap,
  clusterRatioBootstrap,
  createResamplePlan,
  wilson,
  type ResamplePlan,
} from './inference.ts';
import {
  RULE_VERSION,
  decideStatus,
  promotionStatus,
  type ChangeCounts,
  type PromotionDecision,
  type RuleDecision,
  type SafetyCounts,
} from './rule.ts';
import { hashManifest, stylesOf } from './runner.ts';
import type { AnyAdapter } from './worker.ts';

/**
 * SG-05: the gate report. Every figure is a paired difference averaged inside a seed, and
 * every interval resamples seeds. Modes are never pooled. The report states what was
 * measured on synthetic starts; it makes no statement about play against people.
 */
export const REPORT_VERSION = 'gate-report-1.0.0';
export const STATUS_SCOPE = 'on synthetic hands against the listed styles';
/** Name of the equal-weight pool of every non-diagnostic style. */
export const POOLED = 'all-styles';
/** A rate with fewer events than this gets a Wilson interval. */
export const RATE_EVENT_FLOOR = 100;

export type ContrastName = 'candidate-reference' | 'candidate-previous' | 'reference-floor' | 'candidate-floor';

const CONTRASTS: readonly { name: ContrastName; minuend: Arm; subtrahend: Arm; ruled: boolean }[] = [
  { name: 'candidate-reference', minuend: 'candidate', subtrahend: 'reference', ruled: true },
  { name: 'candidate-previous', minuend: 'candidate', subtrahend: 'previous', ruled: true },
  { name: 'reference-floor', minuend: 'reference', subtrahend: 'floor', ruled: false },
  { name: 'candidate-floor', minuend: 'candidate', subtrahend: 'floor', ruled: false },
];
const ARMS: readonly Arm[] = ['reference', 'candidate', 'previous', 'floor'];
const CORE_FIGURES = ['margin', 'own'] as const;

export type Figure =
  | { measurable: false }
  | {
      measurable: true;
      /** `null` with fewer than two clusters. */
      difference: Interval | null;
      clusters: number;
    };

export type ArmFigure = { mean: number; events: number; rounds: number };

export type DecisionCounts = {
  clusters: number;
  seedsWithChange: number;
  unforced: number;
  eligible: number;
  changed: number;
};

export type CellSummary = {
  population: Population;
  configuration: string;
  /** A style label, or `all-styles` for the equal-weight pool. */
  style: string;
  role: 'pooled' | 'style' | 'diagnostic';
  /** A declared trigger name when the cell holds only starts with that trigger. */
  stratum: string | null;
  contrast: ContrastName;
  clusters: number;
  pairs: number;
  unpaired: number;
  /** Paired rounds whose action sequences differ between the two arms. */
  divergentRounds: number;
  figures: Record<string, Figure>;
  arms: Record<string, Record<string, ArmFigure>>;
  decisions: DecisionCounts | null;
  /** Descriptive only. The decision of a mode is its primary block. */
  descriptive: { status: GateStatus; reasons: string[] } | null;
};

export type Rate = { events: number; denominator: number; rate: number | null; interval: Interval | null };

export type CoachSummary = {
  population: Population;
  /** A configuration name, or `all`. */
  configuration: string;
  clusters: number;
  /** Every unforced decision of an evaluated seat. Every rate below uses it. */
  unforced: number;
  suggestions: Rate;
  severalReasonable: Rate;
  factsOnly: Rate;
  claims: { checked: number; notCheckable: number; false: Rate; falseClaimIds: string[] };
};

export type SubgroupSummary = {
  id: string;
  clusters: number;
  confidence: number;
  interval: Interval | null;
  /** Upper bound below zero at the adjusted confidence. */
  worse: boolean;
  /** Upper bound below minus the materiality of the mode. */
  material: boolean;
};

export type EstimandSummary = {
  contrast: ContrastName;
  population: Population;
  configuration: string;
  estimand: string;
  clusters: number;
  interval: Interval | null;
  ownInterval: Interval | null;
  subgroups: SubgroupSummary[];
  changed: ChangeCounts;
  parity: { comparedDecisions: number; changedDecisions: number; divergentRounds: number };
  status: GateStatus;
  reasons: string[];
  guards: RuleDecision['guards'];
};

export type SafetySummary = SafetyCounts & {
  roundsPlayed: number;
  /** False when at least one round came without a check of seat views. */
  informationChecked: boolean;
};

export type ModeSummary = {
  mode: string;
  clusters: number;
  nonInferiorityMargin: number;
  materiality: number;
  primary: EstimandSummary;
  /** Candidate against the previously accepted profile, when that arm was played. */
  incremental: EstimandSummary | null;
  /** Harm-floor contrasts on the primary placement, when that arm was played. Reported without a status. */
  floor: { contrast: ContrastName; margin: Figure; own: Figure }[];
  safety: SafetySummary;
  cells: CellSummary[];
  coach: CoachSummary[];
};

export type GateSummary = {
  schemaVersion: typeof GATE_SCHEMA_VERSION;
  report: typeof REPORT_VERSION;
  rule: typeof RULE_VERSION;
  inference: typeof INFERENCE_VERSION;
  scope: typeof STATUS_SCOPE;
  manifestId: string;
  manifestHash: string;
  purpose: GateRunManifest['purpose'];
  gameId: string;
  policies: Record<Arm, string | null>;
  styles: { id: string; role: 'style' | 'diagnostic'; heldOut: boolean }[];
  seeds: GateRunManifest['seeds'];
  confidence: number;
  bootstrap: GateRunManifest['bootstrap'];
  thresholds: GateRunManifest['thresholds'];
  modes: ModeSummary[];
  promotion: PromotionDecision & { targetMode: string | null };
  notes: string[];
};

export type SummaryOptions = {
  /** Policies that were played, when they differ from the manifest. */
  policies?: Record<Arm, string | null>;
  /** Mode whose improvement a promotion would rest on. */
  targetMode?: string | null;
  notes?: readonly string[];
};

type ContrastSeries = {
  seeds: number[];
  pairs: number;
  unpaired: number;
  divergent: number;
  figures: number[][];
};
type ArmTotals = { clusters: number; rounds: number; sums: Float64Array; events: Float64Array };
type ShadowTotals = DecisionCounts;
type CellStore = {
  population: Population;
  configuration: string;
  style: string;
  role: CellSummary['role'];
  stratum: string | null;
  contrasts: Map<ContrastName, ContrastSeries>;
  arms: Map<Arm, ArmTotals>;
  shadows: Map<string, ShadowTotals>;
};
type CoachStore = {
  population: Population;
  configuration: string;
  unforced: number[];
  suggestions: number[];
  severalReasonable: number[];
  factsOnly: number[];
  claimsChecked: number[];
  claimsFalse: number[];
  claimsNotCheckable: number[];
  falseClaimIds: Set<string>;
};
type ModeStore = {
  mode: string;
  figures: string[];
  roles: Map<string, 'style' | 'diagnostic'>;
  clusters: Set<number>;
  cells: Map<string, CellStore>;
  coach: Map<string, CoachStore>;
  safety: SafetySummary;
  safetyRecorded: boolean;
  parity: Map<string, { unforced: number; changed: number }>;
  divergent: Map<ContrastName, number>;
};

type ClusterContrast = { pairs: number; unpaired: number; divergent: number; diffs: Float64Array };
type ClusterArm = { rounds: number; means: Float64Array; events: Float64Array };
type ClusterCell = { contrasts: Map<ContrastName, ClusterContrast>; arms: Map<Arm, ClusterArm> };
type Unit = { strata: readonly string[]; rows: Map<Arm, GateRoundRow> };

export type Summarizer = {
  /** Adds every row of one (mode, seed). A seed may be added once per mode. */
  addCluster(mode: string, seed: number, rows: readonly GateRoundRow[], shadows: readonly GateShadowRow[]): void;
  finish(): GateSummary;
};

const cellKey = (population: string, configuration: string, style: string, stratum: string | null) =>
  JSON.stringify([population, configuration, style, stratum]);

const valueOf = (row: GateRoundRow, figure: string): number =>
  figure === 'margin' ? row.margin : figure === 'own' ? row.own : row.metrics[figure];

export function createSummarizer(
  manifest: GateRunManifest,
  adapter: AnyAdapter,
  options: SummaryOptions = {},
): Summarizer {
  const runStyles = stylesOf(manifest);
  const stores = new Map<string, ModeStore>();
  for (const mode of manifest.modes) {
    const roles = new Map<string, 'style' | 'diagnostic'>();
    for (const style of adapter.styles(mode)) roles.set(style.id, style.role === 'diagnostic' ? 'diagnostic' : 'style');
    stores.set(mode, {
      mode,
      figures: [...CORE_FIGURES, ...adapter.metricNames(mode)],
      roles,
      clusters: new Set(),
      cells: new Map(),
      coach: new Map(),
      safety: {
        illegalActions: 0,
        scoreMismatches: 0,
        falseClaims: 0,
        informationBreaches: 0,
        roundsPlayed: 0,
        informationChecked: true,
      },
      safetyRecorded: true,
      parity: new Map(),
      divergent: new Map(),
    });
  }

  /** A label such as `a+b` is diagnostic as soon as one of its parts is. */
  const roleOf = (store: ModeStore, label: string): 'style' | 'diagnostic' =>
    label.split('+').some((id) => store.roles.get(id) === 'diagnostic') ? 'diagnostic' : 'style';

  const cellOf = (
    store: ModeStore,
    population: Population,
    configuration: string,
    style: string,
    stratum: string | null,
  ): CellStore => {
    const key = cellKey(population, configuration, style, stratum);
    let cell = store.cells.get(key);
    if (!cell) {
      cell = {
        population,
        configuration,
        style,
        role: style === POOLED ? 'pooled' : roleOf(store, style),
        stratum,
        contrasts: new Map(),
        arms: new Map(),
        shadows: new Map(),
      };
      store.cells.set(key, cell);
    }
    return cell;
  };

  const measure = (store: ModeStore, units: Iterable<Unit>, stratum: string | null): ClusterCell => {
    const width = store.figures.length;
    const result: ClusterCell = { contrasts: new Map(), arms: new Map() };
    const selected = [...units].filter((unit) => stratum === null || unit.strata.includes(stratum));
    for (const arm of ARMS) {
      const entry: ClusterArm = { rounds: 0, means: new Float64Array(width), events: new Float64Array(width) };
      for (const unit of selected) {
        const row = unit.rows.get(arm);
        if (!row) continue;
        entry.rounds++;
        for (let figure = 0; figure < width; figure++) {
          const value = valueOf(row, store.figures[figure]);
          entry.means[figure] += value;
          if (value !== 0) entry.events[figure]++;
        }
      }
      if (entry.rounds === 0) continue;
      for (let figure = 0; figure < width; figure++) entry.means[figure] /= entry.rounds;
      result.arms.set(arm, entry);
    }
    for (const contrast of CONTRASTS) {
      const entry: ClusterContrast = { pairs: 0, unpaired: 0, divergent: 0, diffs: new Float64Array(width) };
      for (const unit of selected) {
        const upper = unit.rows.get(contrast.minuend);
        const lower = unit.rows.get(contrast.subtrahend);
        if (!upper || !lower) {
          if (upper || lower) entry.unpaired++;
          continue;
        }
        entry.pairs++;
        if (upper.actionsHash !== lower.actionsHash) entry.divergent++;
        for (let figure = 0; figure < width; figure++)
          entry.diffs[figure] += valueOf(upper, store.figures[figure]) - valueOf(lower, store.figures[figure]);
      }
      if (entry.pairs === 0) continue;
      for (let figure = 0; figure < width; figure++) entry.diffs[figure] /= entry.pairs;
      result.contrasts.set(contrast.name, entry);
    }
    return result;
  };

  /** Equal weights over the style cells of one cluster. */
  const pool = (store: ModeStore, parts: readonly ClusterCell[]): ClusterCell => {
    const width = store.figures.length;
    const result: ClusterCell = { contrasts: new Map(), arms: new Map() };
    for (const arm of ARMS) {
      const present = parts.flatMap((part) => part.arms.get(arm) ?? []);
      if (present.length === 0) continue;
      const entry: ClusterArm = { rounds: 0, means: new Float64Array(width), events: new Float64Array(width) };
      for (const part of present) {
        entry.rounds += part.rounds;
        for (let figure = 0; figure < width; figure++) {
          entry.means[figure] += part.means[figure] / present.length;
          entry.events[figure] += part.events[figure];
        }
      }
      result.arms.set(arm, entry);
    }
    for (const contrast of CONTRASTS) {
      const present = parts.flatMap((part) => part.contrasts.get(contrast.name) ?? []);
      const unpaired = parts.reduce((sum, part) => sum + (part.contrasts.get(contrast.name)?.unpaired ?? 0), 0);
      if (present.length === 0) continue;
      const entry: ClusterContrast = { pairs: 0, unpaired, divergent: 0, diffs: new Float64Array(width) };
      for (const part of present) {
        entry.pairs += part.pairs;
        entry.divergent += part.divergent;
        for (let figure = 0; figure < width; figure++) entry.diffs[figure] += part.diffs[figure] / present.length;
      }
      result.contrasts.set(contrast.name, entry);
    }
    return result;
  };

  const record = (store: ModeStore, cell: CellStore, seed: number, measured: ClusterCell): void => {
    const width = store.figures.length;
    for (const [arm, entry] of measured.arms) {
      const totals = cell.arms.get(arm) ?? {
        clusters: 0,
        rounds: 0,
        sums: new Float64Array(width),
        events: new Float64Array(width),
      };
      cell.arms.set(arm, totals);
      totals.clusters++;
      totals.rounds += entry.rounds;
      for (let figure = 0; figure < width; figure++) {
        totals.sums[figure] += entry.means[figure];
        totals.events[figure] += entry.events[figure];
      }
    }
    for (const [name, entry] of measured.contrasts) {
      const series = cell.contrasts.get(name) ?? {
        seeds: [],
        pairs: 0,
        unpaired: 0,
        divergent: 0,
        figures: store.figures.map(() => []),
      };
      cell.contrasts.set(name, series);
      series.seeds.push(seed);
      series.pairs += entry.pairs;
      series.unpaired += entry.unpaired;
      series.divergent += entry.divergent;
      for (let figure = 0; figure < width; figure++) series.figures[figure].push(entry.diffs[figure]);
    }
  };

  const addShadow = (cell: CellStore, against: string, counts: Omit<DecisionCounts, 'clusters' | 'seedsWithChange'>) => {
    const totals = cell.shadows.get(against) ?? { clusters: 0, seedsWithChange: 0, unforced: 0, eligible: 0, changed: 0 };
    cell.shadows.set(against, totals);
    totals.clusters++;
    if (counts.changed > 0) totals.seedsWithChange++;
    totals.unforced += counts.unforced;
    totals.eligible += counts.eligible;
    totals.changed += counts.changed;
  };

  const addCluster: Summarizer['addCluster'] = (mode, seed, rows, shadows) => {
    const store = stores.get(mode);
    if (!store) throw new Error(`Rows name mode ${mode}, which the manifest does not list.`);
    if (store.clusters.has(seed)) throw new Error(`Seed ${seed} was added twice for mode ${mode}.`);
    store.clusters.add(seed);

    const cells = new Map<string, { population: Population; configuration: string; style: string; units: Map<string, Unit> }>();
    const strataAt = new Map<string, readonly string[]>();
    const outcomes = new Set<string>();
    for (const row of rows) {
      if (row.mode !== mode || row.seed !== seed) throw new Error(`A row of seed ${row.seed} was added to seed ${seed}.`);
      const key = cellKey(row.population, row.configuration, row.style, null);
      const cell = cells.get(key) ?? {
        population: row.population,
        configuration: row.configuration,
        style: row.style,
        units: new Map<string, Unit>(),
      };
      cells.set(key, cell);
      const unitKey = JSON.stringify([row.index, row.rotation, row.competitorId]);
      const unit = cell.units.get(unitKey) ?? { strata: row.strata, rows: new Map<Arm, GateRoundRow>() };
      cell.units.set(unitKey, unit);
      if (unit.rows.has(row.arm)) throw new Error(`Seed ${seed} holds two ${row.arm} rows for one paired unit.`);
      unit.rows.set(row.arm, row);
      strataAt.set(JSON.stringify([row.population, row.index]), row.strata);

      const outcome = JSON.stringify([row.population, row.index, row.configuration, row.style, row.rotation, row.arm]);
      if (outcomes.has(outcome)) continue;
      outcomes.add(outcome);
      store.safety.roundsPlayed++;
      const safety = (row as Partial<GateRoundRow>).safety;
      if (!safety) {
        store.safetyRecorded = false;
        store.safety.informationChecked = false;
        continue;
      }
      store.safety.illegalActions += safety.illegalActions;
      store.safety.scoreMismatches += safety.scoreMismatches;
      if (safety.informationBreaches === null) store.safety.informationChecked = false;
      else store.safety.informationBreaches += safety.informationBreaches;
    }

    // Style cells, then the equal-weight pool of the non-diagnostic ones, with and without a trigger.
    const pools = new Map<string, { population: Population; configuration: string; stratum: string | null; parts: ClusterCell[] }>();
    for (const cell of cells.values()) {
      const strata = new Set<string>();
      for (const unit of cell.units.values()) for (const name of unit.strata) strata.add(name);
      for (const stratum of [null, ...[...strata].sort()]) {
        const measured = measure(store, cell.units.values(), stratum);
        if (stratum === null) record(store, cellOf(store, cell.population, cell.configuration, cell.style, null), seed, measured);
        if (roleOf(store, cell.style) === 'diagnostic') continue;
        const key = cellKey(cell.population, cell.configuration, POOLED, stratum);
        const group = pools.get(key) ?? {
          population: cell.population,
          configuration: cell.configuration,
          stratum,
          parts: [],
        };
        pools.set(key, group);
        group.parts.push(measured);
      }
    }
    for (const group of pools.values())
      record(
        store,
        cellOf(store, group.population, group.configuration, POOLED, group.stratum),
        seed,
        pool(store, group.parts),
      );

    type Sum = Omit<DecisionCounts, 'clusters' | 'seedsWithChange'>;
    const shadowSums = new Map<string, { cell: CellStore; against: string; sum: Sum }>();
    const coachSums = new Map<string, { store: CoachStore; sum: Record<string, number> }>();
    const addTo = (cell: CellStore, against: string, row: GateShadowRow) => {
      const key = `${cellKey(cell.population, cell.configuration, cell.style, cell.stratum)}|${against}`;
      const entry = shadowSums.get(key) ?? { cell, against, sum: { unforced: 0, eligible: 0, changed: 0 } };
      shadowSums.set(key, entry);
      entry.sum.unforced += row.unforced;
      entry.sum.eligible += row.eligible;
      entry.sum.changed += row.changed;
    };
    for (const raw of shadows) {
      if (raw.mode !== mode || raw.seed !== seed) throw new Error(`A row of seed ${raw.seed} was added to seed ${seed}.`);
      const row: GateShadowRow = {
        ...raw,
        population: (raw as Partial<GateShadowRow>).population ?? manifest.population,
        index: (raw as Partial<GateShadowRow>).index ?? 0,
        against: (raw as Partial<GateShadowRow>).against ?? 'reference',
      };
      store.safety.falseClaims += row.coach.claimsFalse;
      const parity = store.parity.get(row.against) ?? { unforced: 0, changed: 0 };
      store.parity.set(row.against, parity);
      parity.unforced += row.unforced;
      parity.changed += row.changed;
      addTo(cellOf(store, row.population, row.configuration, row.style, null), row.against, row);
      if (roleOf(store, row.style) === 'diagnostic') continue;
      addTo(cellOf(store, row.population, row.configuration, POOLED, null), row.against, row);
      for (const stratum of strataAt.get(JSON.stringify([row.population, row.index])) ?? [])
        addTo(cellOf(store, row.population, row.configuration, POOLED, stratum), row.against, row);
      if (row.against !== 'reference') continue;
      for (const configuration of ['all', row.configuration]) {
        const key = JSON.stringify([row.population, configuration]);
        let coach = store.coach.get(key);
        if (!coach) {
          coach = {
            population: row.population,
            configuration,
            unforced: [],
            suggestions: [],
            severalReasonable: [],
            factsOnly: [],
            claimsChecked: [],
            claimsFalse: [],
            claimsNotCheckable: [],
            falseClaimIds: new Set(),
          };
          store.coach.set(key, coach);
        }
        const entry = coachSums.get(key) ?? {
          store: coach,
          sum: {
            unforced: 0,
            suggestions: 0,
            severalReasonable: 0,
            factsOnly: 0,
            claimsChecked: 0,
            claimsFalse: 0,
            claimsNotCheckable: 0,
          },
        };
        coachSums.set(key, entry);
        entry.sum.unforced += row.unforced;
        entry.sum.suggestions += row.coach.suggestions;
        entry.sum.severalReasonable += row.coach.severalReasonable;
        entry.sum.factsOnly += row.coach.factsOnly;
        entry.sum.claimsChecked += row.coach.claimsChecked;
        entry.sum.claimsFalse += row.coach.claimsFalse;
        entry.sum.claimsNotCheckable += row.coach.claimsNotCheckable;
        for (const id of row.coach.falseClaimIds) coach.falseClaimIds.add(id);
      }
    }
    for (const { cell, against, sum } of shadowSums.values()) addShadow(cell, against, sum);
    for (const { store: coach, sum } of coachSums.values()) {
      coach.unforced.push(sum.unforced);
      coach.suggestions.push(sum.suggestions);
      coach.severalReasonable.push(sum.severalReasonable);
      coach.factsOnly.push(sum.factsOnly);
      coach.claimsChecked.push(sum.claimsChecked);
      coach.claimsFalse.push(sum.claimsFalse);
      coach.claimsNotCheckable.push(sum.claimsNotCheckable);
    }
  };

  const finish = (): GateSummary => {
    const confidence = manifest.thresholds.confidence;
    const plans: ResamplePlan[] = [];
    const planFor = (clusters: number): ResamplePlan => {
      const found = plans.find((plan) => plan.clusters === clusters);
      if (found) return found;
      const plan = createResamplePlan(clusters, manifest.bootstrap.seed, manifest.bootstrap.resamples);
      plans.unshift(plan);
      plans.length = Math.min(plans.length, 3);
      return plan;
    };
    const base = { seed: manifest.bootstrap.seed, resamples: manifest.bootstrap.resamples };
    /** Values arrive in the order the seeds were added; the interval reads them in ascending seed order. */
    const intervalOf = (series: ContrastSeries, figure: number, level: number): Interval | null => {
      if (series.seeds.length < 2) return null;
      const order = series.seeds.map((_, position) => position).sort((a, b) => series.seeds[a] - series.seeds[b]);
      const values = order.map((position) => series.figures[figure][position]);
      return clusterBootstrap(values, { ...base, confidence: level }, planFor(values.length));
    };
    const figureOf = (
      store: ModeStore,
      cell: CellStore,
      series: ContrastSeries,
      name: string,
      level = confidence,
    ): Figure => {
      const strata = cell.stratum === null ? undefined : [cell.stratum];
      if (adapter.measurable && !adapter.measurable(name, cell.population, strata)) return { measurable: false };
      return {
        measurable: true,
        difference: intervalOf(series, store.figures.indexOf(name), level),
        clusters: series.seeds.length,
      };
    };
    const differenceOf = (figure: Figure | undefined): Interval | null =>
      figure && figure.measurable ? figure.difference : null;
    const rateOf = (events: readonly number[], denominators: readonly number[]): Rate => {
      const total = events.reduce((sum, value) => sum + value, 0);
      const denominator = denominators.reduce((sum, value) => sum + value, 0);
      if (denominator === 0) return { events: total, denominator, rate: null, interval: null };
      const clustered =
        total >= RATE_EVENT_FLOOR && denominators.length >= 2 && denominators.every((value) => value > 0);
      const interval = clustered
        ? clusterRatioBootstrap(events, denominators, { ...base, confidence }, planFor(denominators.length))
        : total <= denominator
          ? wilson(total, denominator, confidence)
          : null;
      return { events: total, denominator, rate: total / denominator, interval };
    };

    const notes = [...manifest.notes, ...(options.notes ?? [])];
    const modes: ModeSummary[] = [];
    for (const mode of manifest.modes) {
      const store = stores.get(mode)!;
      const declared = manifest.thresholds.nonInferiority[mode];
      const bound = adapter.nonInferiorityMargin(mode);
      if (bound !== declared)
        notes.push(`Mode ${mode}: the manifest bound of ${declared} is used; the adapter names ${bound}.`);
      if (!store.safetyRecorded)
        notes.push(`Mode ${mode}: some rows carry no safety counts, so the counts below are incomplete.`);
      const safety: SafetyCounts = {
        illegalActions: store.safety.illegalActions,
        scoreMismatches: store.safety.scoreMismatches,
        falseClaims: store.safety.falseClaims,
        informationBreaches: store.safety.informationBreaches,
      };
      const thresholds = manifest.thresholds;
      const played = new Set<ContrastName>();
      for (const cell of store.cells.values()) for (const name of cell.contrasts.keys()) played.add(name);
      const divergentOf = (name: ContrastName) => {
        let total = 0;
        for (const cell of store.cells.values())
          if (cell.style !== POOLED && cell.stratum === null) total += cell.contrasts.get(name)?.divergent ?? 0;
        return total;
      };

      const estimand = (contrast: ContrastName, against: string): EstimandSummary => {
        const { configuration, estimand: text } = manifest.primary[mode];
        const population = manifest.population;
        const pooled = store.cells.get(cellKey(population, configuration, POOLED, null));
        const series = pooled?.contrasts.get(contrast);
        const interval = pooled && series ? differenceOf(figureOf(store, pooled, series, 'margin')) : null;
        const ownInterval = pooled && series ? differenceOf(figureOf(store, pooled, series, 'own')) : null;
        const members = [...store.cells.values()]
          .filter(
            (cell) =>
              cell.population === population &&
              cell.configuration === configuration &&
              cell.stratum === null &&
              cell.role === 'style' &&
              cell.contrasts.has(contrast),
          )
          .sort((left, right) => (left.style < right.style ? -1 : 1));
        const level = members.length > 0 ? bonferroniConfidence(confidence, members.length) : confidence;
        const subgroups = members.map((cell): SubgroupSummary => {
          const figure = differenceOf(figureOf(store, cell, cell.contrasts.get(contrast)!, 'margin', level));
          return {
            id: cell.style,
            clusters: cell.contrasts.get(contrast)!.seeds.length,
            confidence: level,
            interval: figure,
            worse: figure !== null && figure.upper < 0,
            material: figure !== null && figure.upper < -adapter.materiality(mode),
          };
        });
        const counts = pooled?.shadows.get(against);
        const changed: ChangeCounts = {
          seedsWithChange: counts?.seedsWithChange ?? 0,
          changedDecisions: counts?.changed ?? 0,
        };
        const parity = {
          comparedDecisions: store.parity.get(against)?.unforced ?? 0,
          changedDecisions: store.parity.get(against)?.changed ?? 0,
          divergentRounds: divergentOf(contrast),
        };
        const measured = subgroups.flatMap((entry) => (entry.interval ? [{ id: entry.id, interval: entry.interval }] : []));
        const decision = decideStatus({
          interval,
          nonInferiorityMargin: declared,
          safety,
          changed,
          thresholds,
          parity,
          guards: {
            ownScoreInterval: ownInterval,
            subgroups: measured.length === subgroups.length && measured.length > 0 ? measured : undefined,
          },
        });
        return {
          contrast,
          population,
          configuration,
          estimand: text,
          clusters: series?.seeds.length ?? 0,
          interval,
          ownInterval,
          subgroups,
          changed,
          parity,
          status: decision.status,
          reasons: decision.reasons,
          guards: decision.guards,
        };
      };

      const cells: CellSummary[] = [];
      const ordered = [...store.cells.values()].sort((left, right) => {
        const a = [left.population, left.configuration, left.stratum ?? '', left.role === 'pooled' ? '' : left.style];
        const b = [right.population, right.configuration, right.stratum ?? '', right.role === 'pooled' ? '' : right.style];
        for (let part = 0; part < a.length; part++) if (a[part] !== b[part]) return a[part] < b[part] ? -1 : 1;
        return 0;
      });
      for (const cell of ordered)
        for (const contrast of CONTRASTS) {
          const series = cell.contrasts.get(contrast.name);
          if (!series) continue;
          const names = contrast.ruled ? store.figures : [...CORE_FIGURES];
          const figures: Record<string, Figure> = {};
          for (const name of names) figures[name] = figureOf(store, cell, series, name);
          const arms: CellSummary['arms'] = {};
          for (const arm of [contrast.minuend, contrast.subtrahend]) {
            const totals = cell.arms.get(arm);
            if (!totals) continue;
            arms[arm] = {};
            for (const name of names) {
              const position = store.figures.indexOf(name);
              arms[arm][name] = {
                mean: totals.sums[position] / totals.clusters,
                events: totals.events[position],
                rounds: totals.rounds,
              };
            }
          }
          const decisions = contrast.ruled ? (cell.shadows.get(contrast.subtrahend) ?? null) : null;
          const descriptive =
            contrast.ruled && decisions
              ? decideStatus({
                  interval: differenceOf(figures.margin),
                  nonInferiorityMargin: declared,
                  safety,
                  changed: { seedsWithChange: decisions.seedsWithChange, changedDecisions: decisions.changed },
                  thresholds,
                  parity: {
                    comparedDecisions: decisions.unforced,
                    changedDecisions: decisions.changed,
                    divergentRounds: series.divergent,
                  },
                })
              : null;
          cells.push({
            population: cell.population,
            configuration: cell.configuration,
            style: cell.style,
            role: cell.role,
            stratum: cell.stratum,
            contrast: contrast.name,
            clusters: series.seeds.length,
            pairs: series.pairs,
            unpaired: series.unpaired,
            divergentRounds: series.divergent,
            figures,
            arms,
            decisions: decisions ? { ...decisions } : null,
            descriptive: descriptive ? { status: descriptive.status, reasons: descriptive.reasons } : null,
          });
        }

      const coach = [...store.coach.values()]
        .sort((left, right) => {
          const a = [left.population, left.configuration === 'all' ? '' : left.configuration];
          const b = [right.population, right.configuration === 'all' ? '' : right.configuration];
          for (let part = 0; part < a.length; part++) if (a[part] !== b[part]) return a[part] < b[part] ? -1 : 1;
          return 0;
        })
        .map(
          (entry): CoachSummary => ({
            population: entry.population,
            configuration: entry.configuration,
            clusters: entry.unforced.length,
            unforced: entry.unforced.reduce((sum, value) => sum + value, 0),
            suggestions: rateOf(entry.suggestions, entry.unforced),
            severalReasonable: rateOf(entry.severalReasonable, entry.unforced),
            factsOnly: rateOf(entry.factsOnly, entry.unforced),
            claims: {
              checked: entry.claimsChecked.reduce((sum, value) => sum + value, 0),
              notCheckable: entry.claimsNotCheckable.reduce((sum, value) => sum + value, 0),
              false: rateOf(entry.claimsFalse, entry.claimsChecked),
              falseClaimIds: [...entry.falseClaimIds].sort().slice(0, 50),
            },
          }),
        );

      const floorCell = store.cells.get(cellKey(manifest.population, manifest.primary[mode].configuration, POOLED, null));
      const floor = (['reference-floor', 'candidate-floor'] as const).flatMap((contrast) => {
        const series = floorCell?.contrasts.get(contrast);
        if (!floorCell || !series) return [];
        return [
          {
            contrast,
            margin: figureOf(store, floorCell, series, 'margin'),
            own: figureOf(store, floorCell, series, 'own'),
          },
        ];
      });

      modes.push({
        mode,
        clusters: store.clusters.size,
        nonInferiorityMargin: declared,
        materiality: adapter.materiality(mode),
        primary: estimand('candidate-reference', 'reference'),
        incremental: played.has('candidate-previous') ? estimand('candidate-previous', 'previous') : null,
        floor,
        safety: { ...store.safety },
        cells,
        coach,
      });
    }

    const targetMode = options.targetMode ?? null;
    const guardsByMode: Record<string, { status: GateStatus; guards: RuleDecision['guards'] }> = {};
    for (const entry of modes) guardsByMode[entry.mode] = { status: entry.primary.status, guards: entry.primary.guards };
    // Labels, waiver and approval are never supplied by this code; they do not exist in this milestone.
    const promotion = promotionStatus({
      targetMode: targetMode ?? '',
      modes: guardsByMode,
      falseClaims: modes.reduce((sum, entry) => sum + entry.safety.falseClaims, 0),
      informationChecked: modes.every((entry) => entry.safety.informationChecked && entry.safety.roundsPlayed > 0),
      confirmation: manifest.purpose === 'confirmation',
      humanLabels: null,
      ownerWaiver: null,
      ownerApproval: null,
    });
    if (targetMode === null)
      promotion.reasons = [
        ...promotion.reasons.filter((reason) => !reason.startsWith('no result for the targeted mode')),
        'no targeted mode is declared',
      ];

    const heldOut = new Set(manifest.heldOutStyles);
    const roles = stores.get(manifest.modes[0])!.roles;
    return {
      schemaVersion: GATE_SCHEMA_VERSION,
      report: REPORT_VERSION,
      rule: RULE_VERSION,
      inference: INFERENCE_VERSION,
      scope: STATUS_SCOPE,
      manifestId: manifest.id,
      manifestHash: hashManifest(manifest),
      purpose: manifest.purpose,
      gameId: manifest.gameId,
      policies: options.policies ?? {
        reference: manifest.reference,
        candidate: manifest.candidate,
        previous: manifest.previous,
        floor: manifest.floor ?? null,
      },
      styles: runStyles.map((id) => ({ id, role: roles.get(id) ?? 'style', heldOut: heldOut.has(id) })),
      seeds: { ...manifest.seeds },
      confidence,
      bootstrap: { ...manifest.bootstrap },
      thresholds: { ...manifest.thresholds, nonInferiority: { ...manifest.thresholds.nonInferiority } },
      modes,
      promotion: { ...promotion, targetMode },
      notes,
    };
  };

  return { addCluster, finish };
}

/** Summary of rows held in memory. Rows may arrive in any order. */
export function summarize(
  rows: Iterable<GateRoundRow | RoundRow>,
  shadowRows: Iterable<GateShadowRow | ShadowRow>,
  manifest: GateRunManifest,
  adapter: AnyAdapter,
  options: SummaryOptions = {},
): GateSummary {
  const clusters = new Map<string, { mode: string; seed: number; rows: GateRoundRow[]; shadows: GateShadowRow[] }>();
  const clusterOf = (mode: string, seed: number) => {
    const key = JSON.stringify([mode, seed]);
    const cluster = clusters.get(key) ?? { mode, seed, rows: [], shadows: [] };
    clusters.set(key, cluster);
    return cluster;
  };
  for (const row of rows) clusterOf(row.mode, row.seed).rows.push(row as GateRoundRow);
  for (const row of shadowRows) clusterOf(row.mode, row.seed).shadows.push(row as GateShadowRow);
  const summarizer = createSummarizer(manifest, adapter, options);
  const ordered = [...clusters.values()].sort(
    (left, right) => manifest.modes.indexOf(left.mode) - manifest.modes.indexOf(right.mode) || left.seed - right.seed,
  );
  for (const cluster of ordered) summarizer.addCluster(cluster.mode, cluster.seed, cluster.rows, cluster.shadows);
  return summarizer.finish();
}

const number = (value: number, digits = 2): string => {
  const text = value.toFixed(digits);
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
};
const bounds = (interval: Interval | null): string =>
  interval ? `${number(interval.lower)} to ${number(interval.upper)}` : 'too few seeds';
const difference = (figure: Figure | undefined): string =>
  !figure
    ? 'not reported'
    : !figure.measurable
      ? 'not-measurable'
      : figure.difference
        ? `${number(figure.difference.estimate)} (${bounds(figure.difference)})`
        : 'too few seeds';
const share = (rate: Rate): string =>
  rate.rate === null
    ? `${rate.events}/${rate.denominator}`
    : `${rate.events}/${rate.denominator} (${number(rate.rate * 100, 1)}%${
        rate.interval ? `; ${number(rate.interval.lower * 100, 1)}% to ${number(rate.interval.upper * 100, 1)}%` : ''
      })`;
const cellText = (text: string): string => text.replace(/\|/g, '/').replace(/\r?\n/g, ' ');
const table = (head: readonly string[], rows: readonly (readonly string[])[]): string[] => [
  `| ${head.join(' | ')} |`,
  `| ${head.map(() => '---').join(' | ')} |`,
  ...rows.map((row) => `| ${row.map(cellText).join(' | ')} |`),
];
const CONTRAST_TEXT: Record<ContrastName, string> = {
  'candidate-reference': 'candidate minus reference',
  'candidate-previous': 'candidate minus previous',
  'reference-floor': 'reference minus floor',
  'candidate-floor': 'candidate minus floor',
};

function estimandLines(entry: EstimandSummary, summary: GateSummary, mode: ModeSummary): string[] {
  const percent = number(summary.confidence * 100, 0);
  const lines = [
    ...table(
      ['Field', 'Value'],
      [
        ['Contrast', CONTRAST_TEXT[entry.contrast]],
        ['Estimand', entry.estimand],
        ['Population', entry.population],
        ['Configuration', entry.configuration],
        ['Seeds', String(entry.clusters)],
        ['Margin difference', entry.interval ? number(entry.interval.estimate) : 'too few seeds'],
        [`${percent}% interval`, entry.interval ? `${bounds(entry.interval)} (${entry.interval.method})` : 'too few seeds'],
        ['Own score difference', entry.ownInterval ? `${number(entry.ownInterval.estimate)} (${bounds(entry.ownInterval)})` : 'too few seeds'],
        ['Non-inferiority bound', `-${mode.nonInferiorityMargin}`],
        ['Seeds with a changed decision', `${entry.changed.seedsWithChange} (minimum ${summary.thresholds.minSeedsWithChange})`],
        ['Changed decisions', `${entry.changed.changedDecisions} (minimum ${summary.thresholds.minChangedDecisions})`],
        [
          'Decision parity over the mode',
          `${entry.parity.changedDecisions} of ${entry.parity.comparedDecisions} unforced decisions changed; ${entry.parity.divergentRounds} paired rounds differ`,
        ],
        ['Status', `\`${entry.status}\` ${STATUS_SCOPE}`],
        ['Reasons', entry.reasons.join('; ') || 'none'],
        ['Own score guard', entry.guards.ownScore],
        [
          'Style subgroup guard',
          entry.guards.failedSubgroups.length > 0
            ? `${entry.guards.subgroups}: ${entry.guards.failedSubgroups.join(', ')}`
            : entry.guards.subgroups,
        ],
      ],
    ),
    '',
  ];
  if (entry.subgroups.length > 0)
    lines.push(
      `Style subgroups at the adjusted confidence of ${number(entry.subgroups[0].confidence * 100, 3)}%:`,
      '',
      ...table(
        ['Style', 'Seeds', 'Margin difference', 'Adjusted interval', 'Below 0', `Below -${mode.materiality}`],
        entry.subgroups.map((subgroup) => [
          subgroup.id,
          String(subgroup.clusters),
          subgroup.interval ? number(subgroup.interval.estimate) : 'too few seeds',
          bounds(subgroup.interval),
          subgroup.worse ? 'yes' : 'no',
          subgroup.material ? 'yes' : 'no',
        ]),
      ),
      '',
    );
  return lines;
}

/** A concise report with one section per mode. Rates always show their event counts. */
export function renderMarkdown(summary: GateSummary): string {
  const percent = number(summary.confidence * 100, 0);
  const lines: string[] = [
    `# Gate report: ${summary.manifestId}`,
    '',
    `Every status below is a reading of paired differences ${STATUS_SCOPE}. It is not a statement about play against people, and it promotes nothing.`,
    '',
    ...table(
      ['Field', 'Value'],
      [
        ['Manifest hash', summary.manifestHash],
        ['Purpose', summary.purpose],
        ['Game', summary.gameId],
        ['Reference policy', summary.policies.reference ?? 'none'],
        ['Candidate policy', summary.policies.candidate ?? 'none'],
        ['Previous policy', summary.policies.previous ?? 'none'],
        ['Floor policy', summary.policies.floor ?? 'none'],
        ['Seeds', `${summary.seeds.from} to ${summary.seeds.from + summary.seeds.count - 1} (${summary.seeds.ledgerEntry})`],
        [
          'Styles',
          summary.styles
            .map((style) => `${style.id}${style.role === 'diagnostic' ? ' (diagnostic)' : ''}${style.heldOut ? ' (held out)' : ''}`)
            .join(', '),
        ],
        ['Intervals', `${percent}%, ${summary.bootstrap.resamples} resamples of seeds, seed ${summary.bootstrap.seed}`],
        ['Rule', summary.rule],
      ],
    ),
    '',
    '## Promotion',
    '',
    `Promotion of a live default: \`${summary.promotion.status}\`.`,
    '',
    ...summary.promotion.reasons.map((reason) => `- ${reason}`),
    '',
  ];
  for (const mode of summary.modes) {
    lines.push(`## Mode: ${mode.mode}`, '', `Seeds read: ${mode.clusters}.`, '', '### Primary estimand', '');
    lines.push(...estimandLines(mode.primary, summary, mode));
    if (mode.incremental)
      lines.push('### Against the previous profile', '', ...estimandLines(mode.incremental, summary, mode));
    if (mode.floor.length > 0)
      lines.push(
        '### Harm floor',
        '',
        'Reported on the primary placement without a status.',
        '',
        ...table(
          ['Contrast', 'Margin difference', 'Own score difference'],
          mode.floor.map((entry) => [CONTRAST_TEXT[entry.contrast], difference(entry.margin), difference(entry.own)]),
        ),
        '',
      );
    lines.push(
      '### Safety',
      '',
      ...table(
        ['Rounds played', 'Illegal actions', 'Score mismatches', 'False fact claims', 'Hidden-information breaches'],
        [
          [
            String(mode.safety.roundsPlayed),
            String(mode.safety.illegalActions),
            String(mode.safety.scoreMismatches),
            String(mode.safety.falseClaims),
            mode.safety.informationChecked ? String(mode.safety.informationBreaches) : 'not checked in every round',
          ],
        ],
      ),
      '',
    );
    const ruled = mode.cells.filter((cell) => cell.contrast === 'candidate-reference');
    lines.push(
      '### By style and configuration',
      '',
      `Candidate minus reference. Statuses in this table are descriptive ${STATUS_SCOPE}.`,
      '',
      ...table(
        ['Population', 'Configuration', 'Style', 'Seeds', 'Margin difference', 'Own score difference', 'Changed / unforced', 'Seeds with change', 'Status'],
        ruled
          .filter((cell) => cell.stratum === null)
          .map((cell) => [
            cell.population,
            cell.configuration,
            cell.role === 'diagnostic' ? `${cell.style} (diagnostic)` : cell.style,
            String(cell.clusters),
            difference(cell.figures.margin),
            difference(cell.figures.own),
            cell.decisions ? `${cell.decisions.changed}/${cell.decisions.unforced}` : 'not compared',
            cell.decisions ? String(cell.decisions.seedsWithChange) : 'not compared',
            cell.descriptive ? cell.descriptive.status : 'none',
          ]),
      ),
      '',
    );
    const triggered = ruled.filter((cell) => cell.stratum !== null);
    if (triggered.length > 0)
      lines.push(
        '### Starts with a declared trigger',
        '',
        'Pooled styles. Only starts holding the trigger are averaged.',
        '',
        ...table(
          ['Population', 'Configuration', 'Trigger', 'Seeds', 'Pairs', 'Margin difference', 'Own score difference', 'Changed / unforced'],
          triggered.map((cell) => [
            cell.population,
            cell.configuration,
            cell.stratum ?? '',
            String(cell.clusters),
            String(cell.pairs),
            difference(cell.figures.margin),
            difference(cell.figures.own),
            cell.decisions ? `${cell.decisions.changed}/${cell.decisions.unforced}` : 'not compared',
          ]),
        ),
        '',
      );
    const pooled = ruled.filter((cell) => cell.role === 'pooled' && cell.stratum === null);
    lines.push(
      '### Figures per round',
      '',
      'Pooled styles. Events count the rounds in which the figure was not zero.',
      '',
      ...table(
        ['Population', 'Configuration', 'Figure', 'Reference mean', 'Candidate mean', `Difference (${percent}% interval)`, 'Events, reference', 'Events, candidate', 'Rounds per arm'],
        pooled.flatMap((cell) =>
          Object.keys(cell.figures).map((name) => {
            const figure = cell.figures[name];
            const reference = cell.arms.reference?.[name];
            const candidate = cell.arms.candidate?.[name];
            const shown = figure.measurable;
            return [
              cell.population,
              cell.configuration,
              name,
              shown && reference ? number(reference.mean) : 'not-measurable',
              shown && candidate ? number(candidate.mean) : 'not-measurable',
              difference(figure),
              shown && reference ? String(reference.events) : 'not-measurable',
              shown && candidate ? String(candidate.events) : 'not-measurable',
              reference ? String(reference.rounds) : '0',
            ];
          }),
        ),
      ),
      '',
      '### Coach',
      '',
      'Candidate advice on the reference trajectory. The denominator is every unforced decision of an evaluated seat.',
      '',
      ...table(
        ['Population', 'Configuration', 'Seeds', 'Unforced decisions', 'Suggestions', 'Several reasonable', 'Facts only', 'Claims checked', 'False claims', 'Not checkable'],
        mode.coach.map((entry) => [
          entry.population,
          entry.configuration,
          String(entry.clusters),
          String(entry.unforced),
          share(entry.suggestions),
          share(entry.severalReasonable),
          share(entry.factsOnly),
          String(entry.claims.checked),
          share(entry.claims.false),
          String(entry.claims.notCheckable),
        ]),
      ),
      '',
    );
    const falseIds = [...new Set(mode.coach.flatMap((entry) => entry.claims.falseClaimIds))].sort();
    if (falseIds.length > 0) lines.push(`False claim IDs: ${falseIds.join(', ')}`, '');
  }
  if (summary.notes.length > 0) lines.push('## Notes', '', ...summary.notes.map((note) => `- ${note}`), '');
  return `${lines.join('\n').trimEnd()}\n`;
}
