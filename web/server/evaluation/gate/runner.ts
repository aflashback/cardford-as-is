import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { GATE_SCHEMA_VERSION, type Arm, type GateRunManifest, type Population } from './contracts.ts';
import { assertReadable, consume, type LedgerEntry } from './seeds.ts';
import {
  WORKER_KIND,
  loadAdapter,
  moduleUrl,
  runUnit,
  type AnyAdapter,
  type UnitPlan,
  type UnitResult,
  type WorkerReply,
  type WorkerRequest,
  type WorkerStart,
} from './worker.ts';

/**
 * SG-05: the shared gate runner. It owns seeds, pairing, work units and shards; the game
 * adapter owns everything about the game. Shards are cut by seed block, never by worker,
 * so their bytes do not depend on how many workers ran.
 */
export const RUNNER_VERSION = 'gate-runner-1.0.0';

export const DEFAULT_SHARD_SIZE = 50;
export const DEFAULT_MAX_ROUNDS = 100;
const POPULATIONS: readonly Population[] = ['zero-start', 'in-match', 'stress'];

export type RunOptions = {
  /** File URL or path of the module that exports the adapter. */
  adapterModule: string;
  /** Name of the export holding the adapter, or a function that returns it. */
  adapterExport: string;
  referencePolicy: string;
  candidatePolicy: string;
  previousPolicy?: string;
  /** Harm-floor comparison policy, played in the same seats. */
  floorPolicy?: string;
  /** Worker threads. 0 plays every unit in the calling thread. */
  workers: number;
  outDir: string;
  populations: readonly Population[];
  /** Seeds per shard file. */
  shardSize?: number;
  /** Bounds for the `in-match` population; the manifest's own bounds win. */
  stream?: { maxRounds: number; startsPerSeed?: number };
  /** Needed for a confirmation manifest. Both values are recorded verbatim. */
  confirmation?: { commit: string; date: string };
  /** Replacements for checks; a real run leaves them unset. */
  ledger?: readonly LedgerEntry[];
  ledgerStatePath?: string;
  onProgress?: (done: number, total: number) => void;
};

export type ShardRecord = {
  file: string;
  kind: 'rounds' | 'shadows';
  mode: string;
  from: number;
  count: number;
  rows: number;
  sha256: string;
};

export type RunSummary = {
  schemaVersion: typeof GATE_SCHEMA_VERSION;
  runner: typeof RUNNER_VERSION;
  runId: string;
  manifestId: string;
  manifestHash: string;
  purpose: GateRunManifest['purpose'];
  gameId: string;
  /** Recorded verbatim from the caller; `null` on a development run without one. */
  commit: string | null;
  policies: Record<Arm, string | null>;
  modes: string[];
  styles: string[];
  populations: Population[];
  stream: UnitPlan['stream'];
  seeds: GateRunManifest['seeds'];
  shardSize: number;
  units: number;
  rows: { rounds: number; shadows: number };
  shards: ShardRecord[];
  /** SHA-256 over the shard names and hashes in order. */
  rowsHash: string;
  notes: string[];
  /** Not part of the evidence: it may differ between two runs with identical rows. */
  runtime: { workers: number };
};

export const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** JSON with object keys in ascending order at every depth, so equal values give equal text. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const text = JSON.stringify(value);
    if (text === undefined) throw new Error('A canonical value cannot hold undefined or a function.');
    return text;
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const fields = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${fields.join(',')}}`;
}

export const hashManifest = (manifest: GateRunManifest): string => sha256(canonicalJson(manifest));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const isUint32 = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

/** Checks the shape of a parsed manifest. It fails closed on an unknown version. */
export function assertManifest(value: unknown): asserts value is GateRunManifest {
  const fail = (reason: string): never => {
    throw new Error(`The gate manifest is not valid: ${reason}`);
  };
  if (!isRecord(value)) return fail('it is not an object.');
  if (value.schemaVersion !== GATE_SCHEMA_VERSION) fail(`schemaVersion must be ${GATE_SCHEMA_VERSION}.`);
  for (const field of ['id', 'gameId', 'reference', 'candidate', 'dealGenerator'] as const)
    if (!isText(value[field])) fail(`${field} must be text.`);
  if (!/^[A-Za-z0-9._-]+$/.test(value.id as string)) fail('id may hold letters, digits, dots, dashes and underscores.');
  if (value.purpose !== 'development' && value.purpose !== 'confirmation') fail('purpose is unknown.');
  if (value.previous !== null && !isText(value.previous)) fail('previous must be text or null.');
  if (!isTextList(value.modes) || value.modes.length === 0 || new Set(value.modes).size !== value.modes.length)
    fail('modes must be a list of different names.');
  if (!isTextList(value.styles) || value.styles.length === 0) fail('styles must name at least one style.');
  if (!isTextList(value.heldOutStyles)) fail('heldOutStyles must be a list.');
  const styles = [...(value.styles as string[]), ...(value.heldOutStyles as string[])];
  if (new Set(styles).size !== styles.length) fail('a style is listed twice.');
  if (!POPULATIONS.includes(value.population as Population)) fail('population is unknown.');
  const seeds = value.seeds;
  if (!isRecord(seeds) || !isUint32(seeds.from) || !isUint32(seeds.count) || seeds.count < 1 || !isText(seeds.ledgerEntry))
    fail('seeds must hold from, count and ledgerEntry.');
  const primary = value.primary;
  if (!isRecord(primary)) return fail('primary must name one estimand per mode.');
  for (const mode of value.modes as string[]) {
    const entry = primary[mode];
    if (!isRecord(entry) || !isText(entry.configuration) || !isText(entry.estimand))
      fail(`primary.${mode} must hold configuration and estimand.`);
  }
  const thresholds = value.thresholds;
  if (!isRecord(thresholds) || !isRecord(thresholds.nonInferiority)) return fail('thresholds are missing.');
  for (const mode of value.modes as string[]) {
    const bound = thresholds.nonInferiority[mode];
    if (typeof bound !== 'number' || !(bound > 0)) fail(`thresholds.nonInferiority.${mode} must be positive.`);
  }
  for (const field of ['minSeedsWithChange', 'minChangedDecisions'] as const)
    if (!isUint32(thresholds[field])) fail(`thresholds.${field} must be a non-negative integer.`);
  const confidence = thresholds.confidence;
  if (typeof confidence !== 'number' || !(confidence > 0 && confidence < 1)) fail('thresholds.confidence is out of range.');
  const bootstrap = value.bootstrap;
  if (!isRecord(bootstrap) || !isUint32(bootstrap.seed) || !isUint32(bootstrap.resamples) || bootstrap.resamples < 100)
    fail('bootstrap must hold a seed and at least 100 resamples.');
  if (!Array.isArray(value.notes) || value.notes.some((note) => typeof note !== 'string')) fail('notes must be a list.');
  if (value.adapter !== undefined && (!isRecord(value.adapter) || !isText(value.adapter.module) || !isText(value.adapter.export)))
    fail('adapter must hold module and export.');
  if (value.stream !== undefined) {
    const stream = value.stream;
    if (!isRecord(stream) || !isUint32(stream.maxRounds) || stream.maxRounds < 1) fail('stream.maxRounds must be positive.');
    else if (stream.startsPerSeed !== undefined && (!isUint32(stream.startsPerSeed) || stream.startsPerSeed < 1))
      fail('stream.startsPerSeed must be positive.');
  }
  if (value.floor !== undefined && value.floor !== null && !isText(value.floor)) fail('floor must be text or null.');
}

/** Style IDs of a run: held-out styles join only a confirmation run. */
export function stylesOf(manifest: GateRunManifest): string[] {
  return manifest.purpose === 'confirmation' ? [...manifest.styles, ...manifest.heldOutStyles] : [...manifest.styles];
}

export const runIdOf = (manifest: GateRunManifest): string => `${manifest.id}-${hashManifest(manifest).slice(0, 12)}`;

const slug = (text: string) => text.replace(/[^A-Za-z0-9-]/g, '_');

type Unit = { mode: string; seed: number; shard: number };
type Shard = { mode: string; from: number; count: number; first: number; waiting: number };

function layout(manifest: GateRunManifest, shardSize: number): { units: Unit[]; shards: Shard[] } {
  const units: Unit[] = [];
  const shards: Shard[] = [];
  for (const mode of manifest.modes)
    for (let offset = 0; offset < manifest.seeds.count; offset += shardSize) {
      const size = Math.min(shardSize, manifest.seeds.count - offset);
      shards.push({ mode, from: manifest.seeds.from + offset, count: size, first: units.length, waiting: size });
      for (let step = 0; step < size; step++)
        units.push({ mode, seed: manifest.seeds.from + offset + step, shard: shards.length - 1 });
    }
  return { units, shards };
}

/** Checks everything that can be checked without reading a seed. */
function preflight(adapter: AnyAdapter, manifest: GateRunManifest, plan: UnitPlan): void {
  if (adapter.gameId !== manifest.gameId)
    throw new Error(`The adapter serves ${adapter.gameId}; the manifest names ${manifest.gameId}.`);
  for (const mode of manifest.modes) {
    if (!adapter.modes.includes(mode)) throw new Error(`The adapter does not serve mode ${mode}.`);
    const known = new Set(adapter.styles(mode).map((style) => style.id));
    for (const style of plan.styles)
      if (!known.has(style)) throw new Error(`The adapter has no style named ${style} in ${mode}.`);
    for (const { arm, policy } of plan.arms)
      if (adapter.policy(policy, mode).role === 'diagnostic')
        throw new Error(`The ${arm} arm cannot use a diagnostic policy: ${policy}`);
    const configurations = new Set(adapter.placements(mode, plan.styles).map((entry) => entry.configuration));
    const primary = manifest.primary[mode].configuration;
    if (!configurations.has(primary))
      throw new Error(`The primary configuration ${primary} has no placement in ${mode}.`);
  }
  if (plan.populations.includes('stress') && !adapter.stressStarts)
    throw new Error('The adapter declares no stress starts.');
}

async function playInline(
  adapter: AnyAdapter,
  plan: UnitPlan,
  units: readonly Unit[],
  finished: (unit: number, result: UnitResult) => void,
): Promise<void> {
  for (let unit = 0; unit < units.length; unit++) {
    const { mode, seed } = units[unit];
    try {
      finished(unit, runUnit(adapter, plan, mode, seed));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Unit failed for mode ${mode}, seed ${seed}: ${reason}`, { cause: error });
    }
  }
}

async function playWithWorkers(
  start: WorkerStart,
  workerCount: number,
  units: readonly Unit[],
  finished: (unit: number, result: UnitResult) => void,
): Promise<void> {
  const workers: Worker[] = [];
  try {
    await new Promise<void>((resolveRun, rejectRun) => {
      let next = 0;
      let done = 0;
      let failed = false;
      const fail = (error: Error) => {
        if (failed) return;
        failed = true;
        rejectRun(error);
      };
      const send = (worker: Worker) => {
        if (failed || next >= units.length) return;
        const unit = next++;
        const request: WorkerRequest = { type: 'unit', unit, mode: units[unit].mode, seed: units[unit].seed };
        worker.postMessage(request);
      };
      for (let index = 0; index < Math.min(workerCount, units.length); index++) {
        const worker = new Worker(new URL('./worker.ts', import.meta.url), { workerData: start });
        workers.push(worker);
        worker.on('error', (error) => fail(error instanceof Error ? error : new Error(String(error))));
        worker.on('exit', (code) => {
          if (done < units.length) fail(new Error(`A gate worker stopped early with code ${code}.`));
        });
        worker.on('message', (reply: WorkerReply) => {
          if (failed) return;
          if (reply.type === 'failed') return fail(new Error(`A gate worker could not load the adapter: ${reply.message}`));
          if (reply.type === 'error')
            return fail(new Error(`Unit failed for mode ${reply.mode}, seed ${reply.seed}: ${reply.message}`));
          if (reply.type === 'done') {
            try {
              finished(reply.unit, reply.result);
            } catch (error) {
              return fail(error instanceof Error ? error : new Error(String(error)));
            }
            if (++done === units.length) return resolveRun();
          }
          send(worker);
        });
      }
    });
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}

function clearOutput(outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir))
    if (/^(rounds|shadows)-.*\.jsonl$/.test(name) || name === 'run.json') rmSync(join(outDir, name));
}

export async function runGate(manifest: GateRunManifest, options: RunOptions): Promise<RunSummary> {
  assertManifest(manifest);
  const notes: string[] = [];
  const confirmation = manifest.purpose === 'confirmation';

  const chosen: Record<Arm, string | null> = {
    reference: options.referencePolicy,
    candidate: options.candidatePolicy,
    previous: options.previousPolicy ?? manifest.previous ?? null,
    floor: options.floorPolicy ?? manifest.floor ?? null,
  };
  const declared: Record<Arm, string | null> = {
    reference: manifest.reference,
    candidate: manifest.candidate,
    previous: manifest.previous,
    floor: manifest.floor ?? null,
  };
  for (const arm of ['reference', 'candidate', 'previous', 'floor'] as const) {
    if (chosen[arm] === declared[arm]) continue;
    const text = `The ${arm} policy of this run is ${chosen[arm]}; the manifest declares ${declared[arm]}.`;
    if (confirmation) throw new Error(`${text} A confirmation run follows its manifest.`);
    notes.push(text);
  }
  if (!isText(chosen.reference) || !isText(chosen.candidate))
    throw new Error('A run needs a reference policy and a candidate policy.');

  const populations = [...new Set(options.populations)];
  if (populations.length === 0 || populations.some((name) => !POPULATIONS.includes(name)))
    throw new Error('A run needs at least one known population.');
  if (!populations.includes(manifest.population))
    throw new Error(`The run leaves out the primary population ${manifest.population}.`);

  const stream = {
    maxRounds: manifest.stream?.maxRounds ?? options.stream?.maxRounds ?? DEFAULT_MAX_ROUNDS,
    startsPerSeed: manifest.stream?.startsPerSeed ?? options.stream?.startsPerSeed ?? null,
  };
  const shardSize = options.shardSize ?? DEFAULT_SHARD_SIZE;
  if (!Number.isInteger(shardSize) || shardSize < 1) throw new Error('shardSize must be a positive integer.');
  if (!Number.isInteger(options.workers) || options.workers < 0 || options.workers > 64)
    throw new Error('workers must be an integer from 0 to 64.');

  const ledger = { ledger: options.ledger, statePath: options.ledgerStatePath };
  notes.push(...assertReadable(manifest, ledger));
  const record = options.confirmation;
  if (confirmation && (!record || !isText(record.commit?.trim()) || !isText(record.date?.trim())))
    throw new Error('A confirmation run records a commit hash and a date; neither was given.');

  const arms = (['reference', 'candidate', 'previous', 'floor'] as const).flatMap((arm) => {
    const policy = chosen[arm];
    return policy === null ? [] : [{ arm, policy }];
  });
  const plan: UnitPlan = { gameId: manifest.gameId, styles: stylesOf(manifest), arms, populations, stream };
  const adapterModule = moduleUrl(options.adapterModule);
  const adapter = await loadAdapter(adapterModule, options.adapterExport);
  preflight(adapter, manifest, plan);

  const manifestHash = hashManifest(manifest);
  // The read is recorded before the first seed is touched, so a stopped run still counts as read.
  if (confirmation && record)
    consume(
      {
        id: manifest.seeds.ledgerEntry,
        manifestId: manifest.id,
        manifestHash,
        commit: record.commit,
        date: record.date,
      },
      ledger,
    );

  clearOutput(options.outDir);
  const { units, shards } = layout(manifest, shardSize);
  const waiting = new Map<number, UnitResult>();
  const records: ShardRecord[][] = shards.map(() => []);
  const rows = { rounds: 0, shadows: 0 };
  let done = 0;
  const finished = (unit: number, result: UnitResult) => {
    const expected = units[unit];
    if (result.mode !== expected.mode || result.seed !== expected.seed || waiting.has(unit))
      throw new Error(`A worker answered for the wrong unit: mode ${result.mode}, seed ${result.seed}.`);
    waiting.set(unit, result);
    const shard = shards[expected.shard];
    options.onProgress?.(++done, units.length);
    if (--shard.waiting > 0) return;
    for (const kind of ['rounds', 'shadows'] as const) {
      const lines: string[] = [];
      for (let member = shard.first; member < shard.first + shard.count; member++) lines.push(...waiting.get(member)![kind]);
      const text = lines.map((line) => `${line}\n`).join('');
      const file = `${kind}-${slug(shard.mode)}-${shard.from}-${shard.from + shard.count - 1}.jsonl`;
      writeFileSync(join(options.outDir, file), text, 'utf8');
      rows[kind] += lines.length;
      records[expected.shard].push({
        file,
        kind,
        mode: shard.mode,
        from: shard.from,
        count: shard.count,
        rows: lines.length,
        sha256: sha256(text),
      });
    }
    for (let member = shard.first; member < shard.first + shard.count; member++) waiting.delete(member);
  };

  if (options.workers === 0) await playInline(adapter, plan, units, finished);
  else
    await playWithWorkers(
      { kind: WORKER_KIND, adapterModule, adapterExport: options.adapterExport, plan },
      options.workers,
      units,
      finished,
    );

  const written = records.flat();
  const summary: RunSummary = {
    schemaVersion: GATE_SCHEMA_VERSION,
    runner: RUNNER_VERSION,
    runId: runIdOf(manifest),
    manifestId: manifest.id,
    manifestHash,
    purpose: manifest.purpose,
    gameId: manifest.gameId,
    commit: record?.commit ?? null,
    policies: chosen,
    modes: [...manifest.modes],
    styles: plan.styles,
    populations,
    stream,
    seeds: { ...manifest.seeds },
    shardSize,
    units: units.length,
    rows,
    shards: written,
    rowsHash: sha256(written.map((shard) => `${shard.file}:${shard.sha256}\n`).join('')),
    notes,
    runtime: { workers: options.workers },
  };
  writeFileSync(join(options.outDir, 'run.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return summary;
}

/** Whether a finished run left its record in a folder. */
export const hasRun = (outDir: string): boolean => existsSync(join(outDir, 'run.json'));
