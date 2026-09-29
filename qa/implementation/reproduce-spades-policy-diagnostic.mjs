/** Local evaluation-only replay of the frozen 2.0.0 source against the current matrix. */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runReasoningMatrix } from '../../web/server/evaluation/reasoning-matrix.ts';
import { buildFacts } from '../../web/server/games/spades/reasoning/knowledge.ts';

const baseCommit = 'fb7ce6feb655a4f9afd5a8863dd62d27853d623d';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const policyPath = resolve(repo, 'web/server/games/spades/reasoning/policy.ts');
const previousSource = execFileSync(
  'git', ['show', `${baseCommit}:web/server/games/spades/reasoning/policy.ts`],
  { cwd: repo, encoding: 'utf8' },
);
const rebasedSource = previousSource.replace(/from '(\.[^']+)'/g, (_match, specifier) =>
  `from '${pathToFileURL(resolve(dirname(policyPath), specifier)).href}'`);
const temporaryPolicy = join(tmpdir(), `spades-policy-v2-${randomUUID()}.ts`);
writeFileSync(temporaryPolicy, rebasedSource);
let prior;
try {
  const legacy = await import(pathToFileURL(temporaryPolicy).href);
  prior = runReasoningMatrix({
    analyzer: (observation) => legacy.analyzeSpades(observation, buildFacts(observation), 'spades-tactics-2.0.0'),
    policyVersion: 'spades-tactics-2.0.0',
  });
} finally {
  unlinkSync(temporaryPolicy);
}
const current = runReasoningMatrix();
const currentById = new Map(current.hands.map((hand) => [hand.id, hand]));
const oldById = new Map(prior.hands.map((hand) => [hand.id, hand]));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const policyChanges = current.hands.map((hand) => {
  const old = oldById.get(hand.id);
  if (!old) throw new Error(`Missing 2.0.0 hand: ${hand.id}`);
  return {
    id: hand.id,
    seed: hand.seed,
    mode: hand.mode,
    style: hand.style,
    arm: hand.arm,
    bidChanged: !same(hand.bidsBySeat, old.bidsBySeat),
    actionDifferences: hand.selectedActions.filter((action, index) => !same(action, old.selectedActions[index])).length,
    scoreChanged: hand.score !== old.score,
    scoreMarginChanged: hand.scoreMargin !== old.scoreMargin,
    currentScore: hand.score,
    previousScore: old.score,
  };
});
const negativePairs = current.pairedDifferences
  .filter((pair) => pair.mode === 'spades-partners' && pair.style === 'baseline' && pair.scoreMarginDifference < 0)
  .sort((left, right) => left.scoreMarginDifference - right.scoreMarginDifference);
const topSeeds = [...new Set(negativePairs.map((pair) => pair.seed))].slice(0, 4);
const caseRows = topSeeds.flatMap((seed) =>
  (['one-new', 'team-new']).map((arm) => {
    const candidate = current.hands.find((hand) => hand.seed === seed && hand.mode === 'spades-partners' && hand.style === 'baseline' && hand.arm === arm);
    const reference = current.hands.find((hand) => hand.seed === seed && hand.mode === 'spades-partners' && hand.style === 'baseline' && hand.arm === 'reference');
    if (!candidate || !reference) throw new Error(`Missing diagnostic pair: ${seed}/${arm}`);
    const old = oldById.get(candidate.id);
    if (!old) throw new Error(`Missing old diagnostic hand: ${candidate.id}`);
    const firstDivergence = candidate.selectedActions.findIndex((action, index) => !same(action, reference.selectedActions[index]));
    const priorFirstDivergence = candidate.selectedActions.findIndex((action, index) => !same(action, old.selectedActions[index]));
    return {
      seed, arm,
      scoreMarginDifference: candidate.scoreMargin - reference.scoreMargin,
      scoreDifference: candidate.score - reference.score,
      candidate: {
        bidsBySeat: candidate.bidsBySeat,
        tricksBySeat: candidate.tricksBySeat,
        contractBid: candidate.contractBid,
        creditedTricks: candidate.creditedTricks,
        contractMet: candidate.contractMet,
        score: candidate.score,
        scoreMargin: candidate.scoreMargin,
      },
      reference: {
        bidsBySeat: reference.bidsBySeat,
        tricksBySeat: reference.tricksBySeat,
        contractBid: reference.contractBid,
        creditedTricks: reference.creditedTricks,
        contractMet: reference.contractMet,
        score: reference.score,
        scoreMargin: reference.scoreMargin,
      },
      bidsDifferFromReference: !same(candidate.bidsBySeat, reference.bidsBySeat),
      firstDivergenceFromReference: firstDivergence < 0 ? null : {
        decisionIndex: firstDivergence,
        candidate: candidate.selectedActions[firstDivergence],
        reference: reference.selectedActions[firstDivergence],
      },
      differsFromTwoPointZero: !same(candidate.selectedActions, old.selectedActions),
      firstDivergenceFromTwoPointZero: priorFirstDivergence < 0 ? null : {
        decisionIndex: priorFirstDivergence,
        current: candidate.selectedActions[priorFirstDivergence],
        previous: old.selectedActions[priorFirstDivergence],
      },
    };
  }),
);
const report = {
  schemaVersion: '1.0.0',
  baseCommit,
  previousPolicy: prior.policyVersion,
  currentPolicy: current.policyVersion,
  originalDealSeeds: current.seedGroups.length,
  handsPerPolicy: current.hands.length,
  policyChangeSummary: {
    handsWithDifferentBids: policyChanges.filter((row) => row.bidChanged).length,
    handsWithDifferentActions: policyChanges.filter((row) => row.actionDifferences > 0).length,
    handsWithDifferentScores: policyChanges.filter((row) => row.scoreChanged).length,
    handsWithDifferentScoreMargins: policyChanges.filter((row) => row.scoreMarginChanged).length,
  },
  topNegativeBaselinePartnerSeeds: caseRows,
  policyChanges,
  limitations: [
    'The 2.0.0 policy source is loaded from the pinned local Git commit for a deterministic offline comparison.',
    'Both runs use current unchanged rules, observations and baseline style; this isolates policy behavior for these deal seeds.',
    'This analysis attributes bid versus card action differences. It does not infer strategic causes or certify better actions.',
  ],
};
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify({ policyChangeSummary: report.policyChangeSummary, topNegativeBaselinePartnerSeeds: caseRows }, null, 2) + '\n');
