import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { competitorOf } from '../../game/kernel/competition.ts';
import type { Seat } from '../../game/kernel/types.ts';
import type {
  Arm,
  GateAdapter,
  GateRoundRow,
  GateShadowRow,
  Placement,
  Population,
  RoundOutcome,
  RoundStart,
  SeatPolicy,
} from './contracts.ts';
import { pickPositions } from './deals.ts';

/**
 * SG-05: one work unit is one (mode, seed) with every population, start, style, placement,
 * rotation and arm, so a cluster is always produced whole and by one thread. The unit reads
 * nothing but the adapter and its plan, and its rows hold no clock value.
 */
export const WORKER_KIND = 'gate-unit-worker-1.0.0';

export type AnyAdapter = GateAdapter<unknown, unknown, unknown>;
export type AnyPolicy = SeatPolicy<unknown, unknown>;

export type UnitPlan = {
  gameId: string;
  /** Style IDs of this run, in manifest order. */
  styles: string[];
  /** The reference arm comes first and the candidate arm second. */
  arms: { arm: Arm; policy: string }[];
  populations: Population[];
  stream: { maxRounds: number; startsPerSeed: number | null };
};

export type UnitResult = {
  mode: string;
  seed: number;
  /** One serialised `GateRoundRow` per entry. */
  rounds: string[];
  /** One serialised `GateShadowRow` per entry. */
  shadows: string[];
};

export type WorkerStart = { kind: typeof WORKER_KIND; adapterModule: string; adapterExport: string; plan: UnitPlan };
export type WorkerRequest = { type: 'unit'; unit: number; mode: string; seed: number } | { type: 'stop' };
export type WorkerReply =
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | { type: 'done'; unit: number; result: UnitResult }
  | { type: 'error'; unit: number; mode: string; seed: number; message: string };

const SEATS: readonly Seat[] = [0, 1, 2, 3];
const SELECT_STREAM = 0x5e1ec7;
const ADAPTER_MEMBERS = [
  'competition',
  'nonInferiorityMargin',
  'materiality',
  'styles',
  'placements',
  'zeroStart',
  'streamStarts',
  'playRound',
  'measure',
  'metricNames',
  'shadow',
  'policy',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function moduleUrl(module: string): string {
  if (/^(file|data|node):/.test(module)) return module;
  return pathToFileURL(isAbsolute(module) ? module : resolve(module)).href;
}

/** Loads the adapter, or calls the exported factory that builds it. */
export async function loadAdapter(module: string, exportName: string): Promise<AnyAdapter> {
  const loaded: unknown = await import(moduleUrl(module));
  if (!isRecord(loaded) || !(exportName in loaded))
    throw new Error(`Module ${module} has no export named ${exportName}.`);
  const exported = loaded[exportName];
  const adapter: unknown = typeof exported === 'function' ? await (exported as () => unknown)() : exported;
  if (!isRecord(adapter) || typeof adapter.gameId !== 'string' || !Array.isArray(adapter.modes))
    throw new Error(`Export ${exportName} of ${module} is not a gate adapter.`);
  for (const member of ADAPTER_MEMBERS)
    if (typeof adapter[member] !== 'function') throw new Error(`The gate adapter lacks ${member}().`);
  return adapter as unknown as AnyAdapter;
}

const count = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new Error(`${name} must be a non-negative integer.`);
  return value;
};

const finite = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number.`);
  return value;
};

const texts = (value: unknown, name: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    throw new Error(`${name} must be a list of text values.`);
  return [...(value as string[])];
};

/** Stable text of plain data, used to notice an adapter that changes a start while playing. */
function fingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'bigint') return `${item}n`;
    if (typeof item === 'function') return 'function';
    if (item instanceof Map) return { map: [...item.entries()] };
    if (item instanceof Set) return { set: [...item.values()] };
    if (ArrayBuffer.isView(item) && !(item instanceof DataView)) return Array.from(item as unknown as ArrayLike<number>);
    return item;
  });
}

export function styleLabel(placement: Placement): string {
  const named = placement.others.filter((id): id is string => id !== null);
  return [...new Set(named)].join('+');
}

function checkPlacement(placement: Placement, styles: ReadonlyMap<string, AnyPolicy>, mode: string): void {
  const where = `Placement ${placement.configuration} in ${mode}`;
  if (typeof placement.configuration !== 'string' || placement.configuration.length === 0)
    throw new Error('A placement needs a configuration name.');
  count(placement.rotation, `${where}: rotation`);
  if (!Array.isArray(placement.others) || placement.others.length !== SEATS.length)
    throw new Error(`${where} must name one entry per seat.`);
  if (placement.evaluated.length === 0 || new Set(placement.evaluated).size !== placement.evaluated.length)
    throw new Error(`${where} must evaluate at least one seat, each once.`);
  for (const seat of SEATS) {
    const style = placement.others[seat];
    const evaluated = placement.evaluated.includes(seat);
    if (evaluated !== (style === null)) throw new Error(`${where} must mark exactly the evaluated seats with null.`);
    if (style !== null && !styles.has(style)) throw new Error(`${where} names a style outside this run: ${style}`);
  }
  if (styleLabel(placement).length === 0) throw new Error(`${where} leaves no seat to a style.`);
}

function startsOf(
  adapter: AnyAdapter,
  plan: UnitPlan,
  population: Population,
  mode: string,
  seed: number,
  reference: AnyPolicy,
): RoundStart<unknown>[] {
  let starts: RoundStart<unknown>[];
  if (population === 'zero-start') starts = [adapter.zeroStart(mode, seed)];
  else if (population === 'in-match') {
    const all = adapter.streamStarts(mode, seed, reference, plan.stream.maxRounds);
    if (all.length > plan.stream.maxRounds) throw new Error('The adapter returned more starts than the round limit.');
    const kept = pickPositions(all.length, plan.stream.startsPerSeed ?? all.length, seed, SELECT_STREAM);
    starts = kept.map((position) => all[position]);
  } else {
    if (!adapter.stressStarts) throw new Error('The adapter declares no stress starts.');
    starts = adapter.stressStarts(mode, seed);
  }
  const seen = new Set<number>();
  for (const start of starts) {
    if (start.population !== population)
      throw new Error(`A ${population} start was labelled ${String(start.population)}.`);
    count(start.index, 'start.index');
    if (seen.has(start.index)) throw new Error(`Two ${population} starts share index ${start.index}.`);
    seen.add(start.index);
    texts(start.strata, 'start.strata');
  }
  return starts;
}

function safetyOf(outcome: RoundOutcome): GateRoundRow['safety'] {
  return {
    illegalActions: count(outcome.illegalActions, 'outcome.illegalActions'),
    scoreMismatches: count(outcome.scoreMismatches, 'outcome.scoreMismatches'),
    informationBreaches:
      outcome.informationBreaches === undefined
        ? null
        : count(outcome.informationBreaches, 'outcome.informationBreaches'),
  };
}

/** Plays one cluster. Rows are built field by field from an allowlist. */
export function runUnit(adapter: AnyAdapter, plan: UnitPlan, mode: string, seed: number): UnitResult {
  if (adapter.gameId !== plan.gameId)
    throw new Error(`The adapter serves ${adapter.gameId}; the manifest names ${plan.gameId}.`);
  if (!adapter.modes.includes(mode)) throw new Error(`The adapter does not serve mode ${mode}.`);
  const competition = adapter.competition(mode);
  const metricNames = adapter.metricNames(mode);
  const available = new Map(adapter.styles(mode).map((style) => [style.id, style]));
  const styles = new Map<string, AnyPolicy>();
  for (const id of plan.styles) {
    const style = available.get(id);
    if (!style) throw new Error(`The adapter has no style named ${id} in ${mode}.`);
    styles.set(id, style);
  }
  const arms = plan.arms.map(({ arm, policy }) => ({ arm, policy: adapter.policy(policy, mode) }));
  const reference = arms.find((entry) => entry.arm === 'reference');
  const candidate = arms.find((entry) => entry.arm === 'candidate');
  if (!reference || !candidate) throw new Error('A unit needs a reference arm and a candidate arm.');
  for (const { arm, policy } of arms)
    if (policy.role === 'diagnostic') throw new Error(`The ${arm} arm cannot use a diagnostic policy: ${policy.id}`);
  const placements = adapter.placements(mode, plan.styles);
  for (const placement of placements) checkPlacement(placement, styles, mode);

  const seatPolicies = (placement: Placement, evaluated: AnyPolicy): AnyPolicy[] =>
    SEATS.map((seat) => {
      const style = placement.others[seat];
      return style === null ? evaluated : styles.get(style)!;
    });

  const result: UnitResult = { mode, seed, rounds: [], shadows: [] };
  for (const population of plan.populations)
    for (const start of startsOf(adapter, plan, population, mode, seed, reference.policy)) {
      const before = fingerprint(start);
      for (const placement of placements) {
        const style = styleLabel(placement);
        const competitors = [...new Set(placement.evaluated.map((seat) => competitorOf(competition, seat).id))];
        for (const { arm, policy } of arms) {
          const policies = seatPolicies(placement, policy);
          const outcome = adapter.playRound(start, policies);
          if (outcome.mode !== mode) throw new Error(`A round of ${mode} reported mode ${outcome.mode}.`);
          const actionsHash = createHash('sha256')
            .update(texts(outcome.actions, 'outcome.actions').join('\n'))
            .digest('hex')
            .slice(0, 16);
          const safety = safetyOf(outcome);
          for (const competitorId of competitors) {
            const measured = adapter.measure(outcome, competitorId);
            const extra = Object.keys(measured.metrics).filter((name) => !metricNames.includes(name));
            if (extra.length > 0) throw new Error(`The adapter measured undeclared figures: ${extra.join(', ')}`);
            const metrics: Record<string, number> = {};
            for (const name of metricNames) metrics[name] = finite(measured.metrics[name], `metrics.${name}`);
            if (typeof measured.roundEndedSession !== 'boolean')
              throw new Error('roundEndedSession must be true or false.');
            const row: GateRoundRow = {
              seed,
              mode,
              population,
              index: start.index,
              strata: [...start.strata],
              style,
              configuration: placement.configuration,
              rotation: placement.rotation,
              arm,
              policyBySeat: policies.map((entry) => entry.id),
              competitorId,
              margin: finite(measured.margin, 'margin'),
              own: finite(measured.own, 'own'),
              metrics,
              actionsHash,
              roundEndedSession: measured.roundEndedSession,
              safety,
            };
            result.rounds.push(JSON.stringify(row));
          }
        }
        for (const base of arms) {
          if (base.arm !== 'reference' && base.arm !== 'previous') continue;
          const compared = adapter.shadow(
            start,
            seatPolicies(placement, base.policy),
            placement.evaluated,
            candidate.policy,
          );
          const eligible = count(compared.eligible, 'shadow.eligible');
          const changed = count(compared.changed, 'shadow.changed');
          if (changed > eligible) throw new Error('A shadow comparison changed more decisions than were eligible.');
          const row: GateShadowRow = {
            seed,
            mode,
            style,
            configuration: placement.configuration,
            rotation: placement.rotation,
            eligible,
            changed,
            unforced: count(compared.unforced, 'shadow.unforced'),
            coach: {
              suggestions: count(compared.coach.suggestions, 'coach.suggestions'),
              severalReasonable: count(compared.coach.severalReasonable, 'coach.severalReasonable'),
              factsOnly: count(compared.coach.factsOnly, 'coach.factsOnly'),
              claimsChecked: count(compared.coach.claimsChecked, 'coach.claimsChecked'),
              claimsFalse: count(compared.coach.claimsFalse, 'coach.claimsFalse'),
              claimsNotCheckable: count(compared.coach.claimsNotCheckable, 'coach.claimsNotCheckable'),
              falseClaimIds: texts(compared.coach.falseClaimIds, 'coach.falseClaimIds'),
            },
            population,
            index: start.index,
            against: base.arm,
          };
          result.shadows.push(JSON.stringify(row));
        }
      }
      if (fingerprint(start) !== before)
        throw new Error(`The adapter changed a ${population} start while playing; the arms no longer share it.`);
    }
  return result;
}

const describe = (error: unknown) => (error instanceof Error ? (error.stack ?? error.message) : String(error));

function isWorkerStart(value: unknown): value is WorkerStart {
  return isRecord(value) && value.kind === WORKER_KIND;
}

if (!isMainThread && parentPort && isWorkerStart(workerData)) {
  const port = parentPort;
  const start = workerData;
  const reply = (message: WorkerReply) => port.postMessage(message);
  let adapter: AnyAdapter | null = null;
  port.on('message', (request: WorkerRequest) => {
    if (request.type === 'stop') {
      port.close();
      return;
    }
    try {
      if (!adapter) throw new Error('A unit arrived before the adapter was ready.');
      reply({ type: 'done', unit: request.unit, result: runUnit(adapter, start.plan, request.mode, request.seed) });
    } catch (error) {
      reply({ type: 'error', unit: request.unit, mode: request.mode, seed: request.seed, message: describe(error) });
    }
  });
  loadAdapter(start.adapterModule, start.adapterExport).then(
    (loaded) => {
      adapter = loaded;
      reply({ type: 'ready' });
    },
    (error: unknown) => reply({ type: 'failed', message: describe(error) }),
  );
}
