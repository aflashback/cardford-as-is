import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditReviewPack, writeReviewPack } from './review.ts';
import { assertPilotManifest, auditPilot, pilotCanonicalJson, pilotSourceHashes, runPilot,
  type PilotManifest, type PilotPair } from './pilot.ts';
import { buildPilotReport, pilotReportMarkdown } from './report.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const pack = join(root, 'qa/experiments/2026-10-04-spades-evaluation-pack');
const review = join(pack, 'review');
const pilot = join(pack, 'pilot');
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const write = (name: string, value: unknown) => writeFileSync(join(pilot, name), `${JSON.stringify(value, null, 2)}\n`);
const manifestPath = join(pilot, 'pilot-manifest.json');
function loadManifest(): PilotManifest {
  const value = read(manifestPath);
  assertPilotManifest(value);
  return value;
}
function auditReview() {
  return auditReviewPack(review);
}
function prepare() {
  writeReviewPack(review); // Checks existing evidence and preserves all human annotations.
  mkdirSync(pilot, { recursive: true });
  if (existsSync(manifestPath)) {
    const frozen = loadManifest();
    if (pilotCanonicalJson(frozen.sourceHashes) !== pilotCanonicalJson(pilotSourceHashes()))
      throw new Error('The frozen pilot source changed; create a separately identified experiment.');
    return { review: auditReview(), manifest: 'already frozen', plannedStreams: 256 };
  }
  const manifest: PilotManifest = { schemaVersion: 'spades-match-pilot-1.0.0', purpose: 'development-pilot',
    reference: 'spades-tactics-2.1.0', candidate: 'spades-cases-4.0.0', modes: ['spades-solo', 'spades-partners'],
    seeds: { ledgerEntry: 'matches-development', from: 8_000_001, count: 8 }, maxHands: 100,
    environments: [
      { id: 'cautious-support', byMode: {
        'spades-solo': [null, 'aggressive-setter', 'bag-dodger', 'cautious-contract'],
        'spades-partners': [null, 'aggressive-setter', 'cautious-contract', 'bag-dodger'] } },
      { id: 'nil-support', byMode: {
        'spades-solo': [null, 'cautious-contract', 'nil-seeker', 'aggressive-setter'],
        'spades-partners': [null, 'cautious-contract', 'nil-seeker', 'aggressive-setter'] } },
    ], rotations: [0, 1, 2, 3],
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceHashes: pilotSourceHashes() };
  assertPilotManifest(manifest);
  write('pilot-manifest.json', manifest);
  return { review: auditReview(), manifest: 'frozen before run', plannedStreams: 256 };
}
function writeReport(manifest: PilotManifest, rows: readonly PilotPair[], rowsHash: string, totalPairs: number) {
  const result = buildPilotReport(manifest, rows);
  write('results.json', { ...result, manifestHash: createHash('sha256').update(pilotCanonicalJson(manifest)).digest('hex'),
    rowsHash, sourceCommit: manifest.sourceCommit });
  writeFileSync(join(pilot, 'results.md'), pilotReportMarkdown(result));
  return { pairs: rows.length, plannedPairs: totalPairs,
    modes: result.modes.map(mode => ({ mode: mode.mode, observedPairs: mode.observedPairs,
      changedTrajectories: mode.pairsWithTrajectoryChange, pairedFinalMargin: mode.pairedBoundedFinalMarginMean })),
    promotion: false, humanReview: 'pending' };
}
function report() {
  const manifest = loadManifest();
  const checked = auditPilot(manifest, pilot);
  return writeReport(manifest, checked.rows, checked.rowsHash, checked.totalPairs);
}

const commands = process.argv.slice(2);
if (commands.length !== 1 || !['prepare', 'run', 'report', 'audit'].includes(commands[0]))
  throw new Error('Usage: node web/server/evaluation/spades-pack/cli.ts prepare|run|report|audit');
if (commands[0] === 'prepare') console.log(JSON.stringify(prepare()));
else if (commands[0] === 'run') {
  const manifest = loadManifest();
  const result = runPilot(manifest, { outDir: pilot,
    onProgress: (done, total) => { if (done === 0 || done % 8 === 0 || done === total) console.log(JSON.stringify({ completedPairs: done, plannedPairs: total })); } });
  const { rows: _rows, interruption: _interruption, ...metadata } = result;
  write('run.json', metadata);
  console.log(JSON.stringify({ status: result.status, completedPairs: result.completedPairs, plannedPairs: result.totalPairs }));
  // The runner has verified these records; avoid an extra full replay outside its time budget.
  console.log(JSON.stringify(writeReport(manifest, result.rows, result.rowsHash, result.totalPairs)));
} else if (commands[0] === 'report') console.log(JSON.stringify(report()));
else {
  const checked = auditPilot(loadManifest(), pilot);
  console.log(JSON.stringify({ review: auditReview(), validatedPairs: checked.rows.length,
    plannedPairs: checked.totalPairs, rowsHash: checked.rowsHash, providerCalls: 0 }));
}
