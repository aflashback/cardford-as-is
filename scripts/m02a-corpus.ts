// Private test-only export. Never served by the app; original goldens are read-only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  apply,
  collectTrick,
  createGame,
  nextHand,
  legalActions,
  actionId,
} from '../web/server/game/legacy/v1.ts';
import { observe } from '../web/server/game/legacy/observation.ts';
import { observationView } from '../web/server/http/views.ts';
import { scoreHearts } from '../web/server/game/hearts/score.ts';
import { savedCorpus, hashState } from '../web/server/tests/support/module-parity.ts';
import { canonicalJson } from '../web/server/evaluation/gate/runner.ts';

const root = resolve(import.meta.dirname, '..');
const digest = (v: unknown) => createHash('sha256').update(canonicalJson(v)).digest('hex');
const sourcePaths = [
  'web/server/tests/fixtures/legacy-module-document.json',
  'web/server/game/legacy/v1.ts',
  'web/server/game/legacy/observation.ts',
  'web/server/game/legacy/rules.ts',
  'web/server/game/hearts/score.ts',
  'web/server/http/views.ts',
];
const sources = Object.fromEntries(
  sourcePaths.map((p) => [
    p,
    createHash('sha256')
      .update(readFileSync(resolve(root, p)))
      .digest('hex'),
  ]),
);
const scoring: unknown[] = [];
const cases = savedCorpus.cases.map((saved) => {
  let state = createGame(saved.config, saved.deal);
  const checkpoints: unknown[] = [];
  function capture(index: number) {
    checkpoints.push({
      commandIndex: index,
      stateSha256: hashState(state),
      observations: [0, 1, 2, 3].map((s) => digest(observe(state, s))),
      legal: [0, 1, 2, 3].map((s) => digest(legalActions(state, s))),
      candidateIds: [0, 1, 2, 3].map((s) => digest(legalActions(state, s).map(actionId))),
      views: [0, 1, 2, 3].map((s) => digest(observationView(state.id, observe(state, s)))),
    });
  }
  capture(-1);
  for (const [index, c] of saved.commands.entries()) {
    state =
      c.type === 'action'
        ? apply(state, c.action)
        : c.type === 'collect-trick'
          ? collectTrick(state)
          : nextHand(state, c.deal);
    capture(index);
    if (state.mode === 'hearts' && c.type === 'collect-trick' && state.handResult)
      scoring.push({
        label: `original-hand-${state.handNumber}`,
        history: state.history,
        points: scoreHearts(state.history),
      });
  }
  assert.equal(hashState(state), saved.finalSha256, 'Original fixture must not drift');
  return { mode: saved.config.mode, checkpoints, recordedPolicySamples: saved.samples };
});
// Complete, valid winner/order scoring boundary: one seat wins all 13 tricks.
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const moon = ranks.map((r) => ({
  winner: 0,
  plays: [
    { seat: 0, card: `C${r}` },
    { seat: 1, card: `D${r}` },
    { seat: 2, card: `H${r}` },
    { seat: 3, card: `S${r}` },
  ],
}));
scoring.push({ label: 'complete-moon', history: moon, points: scoreHearts(moon) });
const output =
  JSON.stringify(
    { schemaVersion: 'm02a-corpus-1', privateTestOnly: true, sources, cases, heartsScoring: scoring },
    null,
    2,
  ) + '\n';
const file = resolve(root, 'qa/implementation/multi-game/m02a/corpus/original-expectations.json');
if (process.argv.includes('--check'))
  assert.equal(readFileSync(file, 'utf8'), output, 'M02A corpus export drift');
else {
  mkdirSync(resolve(file, '..'), { recursive: true });
  writeFileSync(file, output);
}
console.log(
  JSON.stringify({
    cases: cases.length,
    checkpoints: cases.reduce((n, c) => n + c.checkpoints.length, 0),
    sha256: createHash('sha256').update(output).digest('hex'),
    scoring: scoring.length,
  }),
);
