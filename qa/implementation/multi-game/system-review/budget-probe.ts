import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { evaluateCandidates } from '../../../../web/server/strategy/plan/evaluate.ts';
import type { PlayoutModel } from '../../../../web/server/strategy/plan/types.ts';

/**
 * Pure deterministic model: each root move immediately finishes the round.
 * No application database, provider, network, clock or production game runs.
 * The process reports JSON and exits 1 when the budget invariant is violated.
 */
type World = { done: boolean };
let applied = 0;
const model: PlayoutModel<World, number> = {
  id: 'system-review-terminal-root',
  version: '1.0.0',
  allocationModel: 'synthetic-fixed-world',
  continuationPolicy: 'synthetic-terminal-root',
  sample: () => ({ world: { done: false }, weight: 1 }),
  clone: (world) => ({ ...world }),
  actor: (world) => (world.done ? null : 0),
  apply(world, _move) {
    applied++;
    world.done = true;
  },
  defaultMove: () => 0,
  moveId: String,
  utility: () => 1,
  events: () => ({}),
};

const candidates = [1, 2];
const budget = { worlds: 2, maxSteps: 1 };
const seed = 123;
const result = evaluateCandidates(model, candidates, budget, seed);
const invariantHolds = applied <= budget.maxSteps && result.steps <= budget.maxSteps;
const root = new URL('../../../../', import.meta.url);
const paths = [
  'web/server/strategy/plan/evaluate.ts',
  'web/server/strategy/plan/types.ts',
  'web/server/strategy/plan/random.ts',
  'qa/implementation/multi-game/system-review/budget-probe.ts',
];
const sourceHashes = Object.fromEntries(
  paths.map((path) => [
    path,
    createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex'),
  ]),
);

process.stdout.write(`${JSON.stringify({
  evidenceVersion: '1.0.0',
  kind: 'pure-deterministic-defect-probe',
  command: 'node qa/implementation/multi-game/system-review/budget-probe.ts',
  reviewedHead: 'aa36c85505bcd8f4c42e9967fe1df195e4f55fb9',
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  sourceHashes,
  inputs: { candidates, budget, seed, model: model.id, modelVersion: model.version },
  expectedInvariant: 'applied operations and reported steps do not exceed maxSteps',
  observed: {
    appliedOperations: applied,
    reportedSteps: result.steps,
    status: result.status,
    reason: result.reason ?? null,
    worldsUsed: result.worldsUsed,
    invariantHolds,
    expectedProcessExitCode: invariantHolds ? 0 : 1,
  },
  result,
}, null, 2)}\n`);
process.exitCode = invariantHolds ? 0 : 1;
