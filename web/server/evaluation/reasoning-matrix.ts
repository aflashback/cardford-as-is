import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  actionId,
  apply,
  collectTrick,
  createGame,
  fullDeck,
  legalActions,
  type Card,
  type PrivateGame,
  type Seat,
} from '../game/index.ts';
import { cardRank } from '../game/cards.ts';
import { scoreCompetitor } from '../game/spades/score.ts';
import { observe, type SeatObservation } from '../observations/index.ts';
import { analyzeDecision, POLICY_VERSION } from '../strategy/index.ts';
import { chooseBaselineAction } from '../strategy/baseline.ts';
import type { DecisionAnalysis } from '../strategy/types.ts';

type Mode = 'spades-solo' | 'spades-partners';
type Style = 'baseline' | 'conservative' | 'assertive';
type Arm = 'reference' | 'one-new' | 'team-new';

export const REASONING_MATRIX_MANIFEST = {
  id: 'spades-reasoning-fresh-style-matrix-2026-09-29',
  requirementId: 'GR-08',
  seeds: Array.from({ length: 12 }, (_, index) => 840001 + index),
  modes: ['spades-solo', 'spades-partners'] as Mode[],
  styles: ['baseline', 'conservative', 'assertive'] as Style[],
  arms: { 'spades-solo': ['reference', 'one-new'], 'spades-partners': ['reference', 'one-new', 'team-new'] } as Record<Mode, Arm[]>,
  maxTransitionsPerHand: 80,
  networkRequests: 0,
  styleDefinitions: {
    baseline: 'Frozen local baseline selects bids and cards.',
    conservative: 'Synthetic stress style: baseline bid minus one, then lowest legal rank.',
    assertive: 'Synthetic stress style: baseline bid plus one, then highest legal rank.',
  },
  pairing: 'For each original deal seed and style, compare candidate and reference on the same deck, dealer and assessed competitor. The seed, not a hand row, is the independent deal group.',
  limitations: [
    'This is a deterministic local policy comparison against three synthetic styles, not human or expert play.',
    'The same deal seeds appear in multiple styles and arms; those rows are correlated.',
    'Only one complete hand per arm is played from zero score and bags. Match outcomes and carryover effects are not measured here.',
    'No independently accepted action labels are used; score differences alone cannot certify advice quality.',
    'No Jev request, provider fallback, calibration or user learning is measured.',
  ],
} as const;

export type MatrixHand = {
  id: string;
  seed: number;
  mode: Mode;
  style: Style;
  arm: Arm;
  dealer: Seat;
  actorSeat: Seat;
  newPolicySeats: Seat[];
  policyVersion: string;
  transitions: number;
  decisions: number;
  selectedActions: { seat: Seat; actionId: string }[];
  bidsBySeat: number[];
  tricksBySeat: number[];
  forcedDecisions: number;
  providerCalls: 0;
  fallbackCount: 0;
  elapsedMs: number;
  score: number;
  scoreMargin: number;
  contractBid: number;
  creditedTricks: number;
  contractMet: boolean;
  nilBids: number;
  nilSuccesses: number;
  bagsAdded: number;
  bagPenalty: number;
  scenarioCounts: Record<string, number>;
  matchComplete: boolean;
};

function deckFor(seed: number): Card[] {
  const deck = fullDeck();
  let value = seed >>> 0;
  for (let i = deck.length - 1; i > 0; i--) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    const j = value % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function styleAction(observation: SeatObservation, style: Style) {
  const base = chooseBaselineAction(observation);
  if (style === 'baseline') return base;
  if (observation.phase === 'bid') {
    if (base.kind !== 'bid') throw new Error('Expected a baseline bid.');
    const bid = Math.max(0, Math.min(13, base.bid + (style === 'conservative' ? -1 : 1)));
    const selected = observation.legalActions.find((candidate) => candidate.kind === 'bid' && candidate.bid === bid);
    if (!selected || selected.kind !== 'bid') throw new Error(`Missing legal style bid: ${bid}`);
    return selected;
  }
  const cards = observation.legalActions.filter((candidate) => candidate.kind === 'play');
  cards.sort((left, right) => cardRank(left.card) - cardRank(right.card) || left.card.localeCompare(right.card));
  const selected = style === 'conservative' ? cards[0] : cards.at(-1);
  if (!selected) throw new Error('No legal style card.');
  return selected;
}

function runHand(
  mode: Mode,
  style: Style,
  seed: number,
  arm: Arm,
  analyze: (observation: SeatObservation) => DecisionAnalysis,
  policyVersion: string,
): MatrixHand {
  const dealer = (seed % 4) as Seat;
  const actorSeat = ((seed + 1) % 4) as Seat;
  const newPolicySeats: Seat[] = arm === 'reference' ? [] : arm === 'one-new' ? [actorSeat] : [actorSeat, ((actorSeat + 2) % 4) as Seat];
  let state = createGame({ id: `reasoning-matrix-${seed}`, mode, dealer }, deckFor(seed));
  const started = performance.now();
  const scenarioCounts: Record<string, number> = {};
  let transitions = 0;
  let decisions = 0;
  let forcedDecisions = 0;
  const selectedActions: { seat: Seat; actionId: string }[] = [];
  while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
    if (++transitions > REASONING_MATRIX_MANIFEST.maxTransitionsPerHand)
      throw new Error(`Transition budget exceeded: ${mode}/${style}/${seed}/${arm}`);
    if (state.phase === 'trick-end') {
      state = collectTrick(state);
      continue;
    }
    const actor = state.turn;
    if (actor === null) throw new Error('Active matrix hand has no actor.');
    const observation = observe(state, actor);
    const useNew = newPolicySeats.includes(actor);
    const analysis = useNew ? analyze(observation) : null;
    const selected = analysis ? analysis.action : styleAction(observation, style);
    if (selected.kind === 'pass') throw new Error('Spades matrix cannot pass.');
    if (!legalActions(state, actor).some((candidate) => actionId(candidate) === actionId(selected)))
      throw new Error(`Policy selected an illegal action: ${mode}/${style}/${seed}/${arm}`);
    if (selected.seat !== actor) throw new Error('Policy selected another seat.');
    if (observation.legalActions.length === 1) forcedDecisions++;
    if (analysis)
      for (const scenario of analysis.scenarioIds)
        scenarioCounts[scenario] = (scenarioCounts[scenario] ?? 0) + 1;
    selectedActions.push({ seat: actor, actionId: actionId(selected) });
    state = apply(state, selected);
    decisions++;
  }
  assert.equal(decisions, 56);
  assert.equal(state.history.length, 13);
  assert.ok(state.hands.every((hand) => hand.length === 0));
  assert.ok(state.handResult);
  const group = mode === 'spades-partners' ? [actorSeat, ((actorSeat + 2) % 4) as Seat] : [actorSeat];
  const opponents = ([0, 1, 2, 3] as Seat[]).filter((seat) => !group.includes(seat));
  const contractBid = group.reduce<number>((sum, seat) => sum + (state.bids[seat] ?? 0), 0);
  const creditedTricks = group.reduce<number>((sum, seat) => sum + (state.bids[seat] === 0 ? 0 : state.tricks[seat]), 0);
  const nilBids = group.filter((seat) => state.bids[seat] === 0).length;
  const nilSuccesses = group.filter((seat) => state.bids[seat] === 0 && state.tricks[seat] === 0).length;
  const bagsAdded = Math.max(0, creditedTricks - contractBid) +
    group.reduce<number>((sum, seat) => sum + (state.bids[seat] === 0 ? state.tricks[seat] : 0), 0);
  const score = state.handResult.points[actorSeat];
  const independentScore = scoreCompetitor({
    bids: group.map((seat) => state.bids[seat] ?? 0),
    tricks: group.map((seat) => state.tricks[seat]),
    oldBags: 0,
  });
  assert.equal(independentScore.delta, score);
  assert.equal(independentScore.bags, state.bags[actorSeat]);
  return {
    id: `${mode}/${style}/${seed}/${arm}`,
    seed, mode, style, arm, dealer, actorSeat, newPolicySeats,
    policyVersion,
    transitions, decisions, selectedActions,
    bidsBySeat: state.bids.map((bid) => bid ?? 0),
    tricksBySeat: [...state.tricks],
    forcedDecisions,
    providerCalls: 0, fallbackCount: 0,
    elapsedMs: Math.round((performance.now() - started) * 100) / 100,
    score,
    scoreMargin: score - Math.max(...opponents.map((seat) => state.handResult!.points[seat])),
    contractBid, creditedTricks, contractMet: creditedTricks >= contractBid,
    nilBids, nilSuccesses, bagsAdded,
    bagPenalty: 100 * Math.floor(bagsAdded / 10),
    scenarioCounts,
    matchComplete: state.phase === 'match-end',
  };
}

export function runReasoningMatrix(options: {
  seeds?: readonly number[];
  outputPath?: string;
  /** Evaluation-only injection for frozen-policy comparisons. */
  analyzer?: (observation: SeatObservation) => DecisionAnalysis;
  policyVersion?: string;
} = {}) {
  if (options.analyzer && !options.policyVersion)
    throw new Error('An injected analyzer needs its explicit policy version.');
  const seeds = [...(options.seeds ?? REASONING_MATRIX_MANIFEST.seeds)];
  if (!seeds.length) throw new Error('Reasoning matrix needs at least one deal seed.');
  if (new Set(seeds).size !== seeds.length) throw new Error('Duplicate seed in reasoning matrix.');
  if (seeds.some((seed) => !Number.isInteger(seed) || seed < 840001 || seed > 849999))
    throw new Error('Reserved seed range; use fresh matrix seeds 840001–849999.');
  const hands: MatrixHand[] = [];
  for (const seed of seeds)
    for (const mode of REASONING_MATRIX_MANIFEST.modes)
      for (const style of REASONING_MATRIX_MANIFEST.styles)
        for (const arm of REASONING_MATRIX_MANIFEST.arms[mode])
          hands.push(runHand(mode, style, seed, arm, options.analyzer ?? analyzeDecision, options.policyVersion ?? POLICY_VERSION));
  const pairedDifferences = hands.filter((hand) => hand.arm !== 'reference').map((candidate) => {
    const reference = hands.find((hand) => hand.seed === candidate.seed && hand.mode === candidate.mode && hand.style === candidate.style && hand.arm === 'reference');
    if (!reference) throw new Error(`Missing matrix reference: ${candidate.id}`);
    assert.equal(candidate.dealer, reference.dealer);
    assert.equal(candidate.actorSeat, reference.actorSeat);
    return {
      seed: candidate.seed, mode: candidate.mode, style: candidate.style, arm: candidate.arm,
      candidateId: candidate.id, referenceId: reference.id,
      scoreDifference: candidate.score - reference.score,
      scoreMarginDifference: candidate.scoreMargin - reference.scoreMargin,
      contractMetDifference: Number(candidate.contractMet) - Number(reference.contractMet),
      nilSuccessDifference: candidate.nilSuccesses - reference.nilSuccesses,
      bagPenaltyDifference: candidate.bagPenalty - reference.bagPenalty,
    };
  });
  const seedGroups = seeds.map((seed) => ({
    seed,
    handCount: hands.filter((hand) => hand.seed === seed).length,
    comparisonCount: pairedDifferences.filter((pair) => pair.seed === seed).length,
  }));
  const summaries = REASONING_MATRIX_MANIFEST.modes.flatMap((mode) =>
    REASONING_MATRIX_MANIFEST.styles.flatMap((style) =>
      REASONING_MATRIX_MANIFEST.arms[mode].filter((arm) => arm !== 'reference').map((arm) => {
        const pairs = pairedDifferences.filter((row) => row.mode === mode && row.style === style && row.arm === arm);
        const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
        const candidates = pairs.map((pair) => hands.find((hand) => hand.id === pair.candidateId)!);
        const references = pairs.map((pair) => hands.find((hand) => hand.id === pair.referenceId)!);
        return {
          mode, style, arm, seedGroups: pairs.length,
          meanScoreDifference: mean(pairs.map((row) => row.scoreDifference)),
          meanScoreMarginDifference: mean(pairs.map((row) => row.scoreMarginDifference)),
          contractMetDifference: pairs.reduce((sum, row) => sum + row.contractMetDifference, 0),
          nilSuccessDifference: pairs.reduce((sum, row) => sum + row.nilSuccessDifference, 0),
          bagPenaltyDifference: pairs.reduce((sum, row) => sum + row.bagPenaltyDifference, 0),
          candidateHandsWithNil: candidates.filter((hand) => hand.nilBids > 0).length,
          candidateHandsWithBagPenalty: candidates.filter((hand) => hand.bagPenalty > 0).length,
          candidateMatchCompletions: candidates.filter((hand) => hand.matchComplete).length,
          meanCandidateElapsedMs: mean(candidates.map((hand) => hand.elapsedMs)),
          meanReferenceElapsedMs: mean(references.map((hand) => hand.elapsedMs)),
          fallbackCount: candidates.reduce((sum, hand) => sum + hand.fallbackCount, 0),
        };
      }),
    ),
  );
  const report = {
    schemaVersion: '1.0.0' as const,
    manifest: REASONING_MATRIX_MANIFEST,
    policyVersion: options.policyVersion ?? POLICY_VERSION,
    seedGroups,
    hands,
    pairedDifferences,
    summaries,
    independentActionLabels: 0,
    strengthStatus: 'exploratory-only' as const,
    matchOutcomeStatus: 'not-measured' as const,
    providerMode: 'local-code' as const,
    observedModelId: null,
  };
  if (options.outputPath) writeFileSync(options.outputPath, JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runReasoningMatrix({ outputPath: process.argv[2] });
  process.stdout.write(JSON.stringify({
    seedGroups: result.seedGroups.length,
    hands: result.hands.length,
    pairedComparisons: result.pairedDifferences.length,
    policyVersion: result.policyVersion,
    summaries: result.summaries,
    limitations: result.manifest.limitations,
  }, null, 2) + '\n');
}
