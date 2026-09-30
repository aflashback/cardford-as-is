import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GateRoundRow, GateRunManifest, GateShadowRow, Population } from './contracts.ts';
import { createSummarizer, renderMarkdown, type GateSummary, type SummaryOptions } from './report.ts';
import { assertManifest, runGate, runIdOf, sha256, type RunOptions, type RunSummary } from './runner.ts';
import { loadAdapter, type AnyAdapter } from './worker.ts';

export * from './contracts.ts';
export * from './deals.ts';
export * from './inference.ts';
export * from './report.ts';
export * from './rule.ts';
export * from './runner.ts';
export * from './seeds.ts';
export { loadAdapter, runUnit, type AnyAdapter, type AnyPolicy, type UnitPlan, type UnitResult } from './worker.ts';

/**
 * SG-05: command-line entry of the strength gate.
 *
 *   node web/server/evaluation/gate/index.ts <manifest.json> [--workers N] [--out dir]
 *     [--adapter module] [--adapter-export name] [--populations a,b] [--target-mode mode]
 *     [--commit hash] [--date text] [--shard-size N]
 *
 * A confirmation manifest needs --commit and --date. Both are recorded verbatim, and the
 * sealed seed range is marked as read before the first seed is touched.
 */
export const USAGE =
  'Usage: node web/server/evaluation/gate/index.ts <manifest.json> [--workers N] [--out dir] ' +
  '[--adapter module] [--adapter-export name] [--populations a,b] [--target-mode mode] ' +
  '[--commit hash] [--date text] [--shard-size N]';

export type CommandOutput = { log(text: string): void; error(text: string): void };

const FLAGS = [
  'workers',
  'out',
  'adapter',
  'adapter-export',
  'populations',
  'target-mode',
  'commit',
  'date',
  'shard-size',
  'ledger-state',
] as const;
type Flag = (typeof FLAGS)[number];

export function parseArguments(argv: readonly string[]): { manifestPath: string; flags: Partial<Record<Flag, string>> } {
  const flags: Partial<Record<Flag, string>> = {};
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const word = argv[index];
    if (!word.startsWith('--')) {
      positional.push(word);
      continue;
    }
    const name = word.slice(2) as Flag;
    const value = argv[index + 1];
    if (!FLAGS.includes(name)) throw new Error(`Unknown option ${word}.\n${USAGE}`);
    if (value === undefined || value.startsWith('--')) throw new Error(`Option ${word} needs a value.\n${USAGE}`);
    if (flags[name] !== undefined) throw new Error(`Option ${word} was given twice.`);
    flags[name] = value;
    index++;
  }
  if (positional.length !== 1) throw new Error(`Exactly one manifest path is needed.\n${USAGE}`);
  return { manifestPath: positional[0], flags };
}

const wholeNumber = (text: string, name: string): number => {
  if (!/^\d+$/.test(text)) throw new Error(`${name} must be a whole number.`);
  return Number(text);
};

function readLines<Row>(outDir: string, file: string, expected: string): Row[] {
  const text = readFileSync(join(outDir, file), 'utf8');
  if (sha256(text) !== expected) throw new Error(`Shard ${file} does not match its recorded hash.`);
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Row);
}

/** Reads the shards of a finished run one at a time and summarises them. */
export function summarizeRun(
  run: RunSummary,
  outDir: string,
  manifest: GateRunManifest,
  adapter: AnyAdapter,
  options: SummaryOptions = {},
): GateSummary {
  const summarizer = createSummarizer(manifest, adapter, {
    policies: run.policies,
    ...options,
    notes: [...run.notes, ...(options.notes ?? [])],
  });
  for (const rounds of run.shards.filter((shard) => shard.kind === 'rounds')) {
    const shadows = run.shards.find(
      (shard) => shard.kind === 'shadows' && shard.mode === rounds.mode && shard.from === rounds.from,
    );
    if (!shadows) throw new Error(`Shard ${rounds.file} has no shadow shard beside it.`);
    const bySeed = new Map<number, { rows: GateRoundRow[]; shadows: GateShadowRow[] }>();
    const clusterOf = (seed: number) => {
      const cluster = bySeed.get(seed) ?? { rows: [], shadows: [] };
      bySeed.set(seed, cluster);
      return cluster;
    };
    for (const row of readLines<GateRoundRow>(outDir, rounds.file, rounds.sha256)) clusterOf(row.seed).rows.push(row);
    for (const row of readLines<GateShadowRow>(outDir, shadows.file, shadows.sha256))
      clusterOf(row.seed).shadows.push(row);
    for (const seed of [...bySeed.keys()].sort((left, right) => left - right)) {
      const cluster = bySeed.get(seed)!;
      summarizer.addCluster(rounds.mode, seed, cluster.rows, cluster.shadows);
    }
  }
  return summarizer.finish();
}

export async function main(argv: readonly string[], output: CommandOutput = console): Promise<number> {
  try {
    const { manifestPath, flags } = parseArguments(argv);
    const manifest: unknown = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));
    assertManifest(manifest);
    const adapterModule = flags.adapter ?? manifest.adapter?.module;
    const adapterExport = flags['adapter-export'] ?? manifest.adapter?.export;
    if (!adapterModule || !adapterExport)
      throw new Error('No adapter is named. Give --adapter and --adapter-export, or declare adapter in the manifest.');
    if (manifest.purpose === 'confirmation' && (!flags.commit || !flags.date))
      throw new Error('A confirmation manifest needs --commit <hash> and --date <text>; both are recorded verbatim.');
    const populations = (flags.populations?.split(',') ?? [manifest.population]) as Population[];
    const outDir = resolve(flags.out ?? join('.local', 'gate', runIdOf(manifest)));
    const workers =
      flags.workers === undefined
        ? Math.max(1, Math.min(14, availableParallelism() - 2))
        : wholeNumber(flags.workers, '--workers');
    let reported = 0;
    const options: RunOptions = {
      adapterModule,
      adapterExport,
      referencePolicy: manifest.reference,
      candidatePolicy: manifest.candidate,
      workers,
      outDir,
      populations,
      shardSize: flags['shard-size'] === undefined ? undefined : wholeNumber(flags['shard-size'], '--shard-size'),
      confirmation: flags.commit && flags.date ? { commit: flags.commit, date: flags.date } : undefined,
      ledgerStatePath: flags['ledger-state'] === undefined ? undefined : resolve(flags['ledger-state']),
      onProgress: (done, total) => {
        const tenth = Math.floor((10 * done) / total);
        if (tenth === reported) return;
        reported = tenth;
        output.error(`${done}/${total} units`);
      },
    };
    const run = await runGate(manifest, options);
    const adapter = await loadAdapter(adapterModule, adapterExport);
    const report = summarizeRun(run, outDir, manifest, adapter, { targetMode: flags['target-mode'] ?? null });
    const summaryPath = join(outDir, 'summary.json');
    writeFileSync(summaryPath, `${JSON.stringify({ run, report }, null, 2)}\n`, 'utf8');
    writeFileSync(join(outDir, 'report.md'), renderMarkdown(report), 'utf8');
    output.log(summaryPath);
    return 0;
  } catch (error) {
    output.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await main(process.argv.slice(2));
