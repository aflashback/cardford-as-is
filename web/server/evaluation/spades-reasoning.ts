import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  actionId,
  apply,
  collectTrick,
  createGame,
  fullDeck,
  legalActions,
  nextHand,
  trickWinner,
  type Card,
  type PrivateGame,
  type Seat,
} from '../game/index.ts';
import { observe } from '../observations/index.ts';
import { analyzeDecision, POLICY_VERSION } from '../strategy/index.ts';
import { chooseBaselineAction, BASELINE_POLICY_VERSION } from '../strategy/baseline.ts';

type Mode = 'spades-solo' | 'spades-partners';
type Arm = 'new-vs-baseline' | 'baseline-vs-baseline' | 'all-new' | 'new-team-vs-baseline';
type CarryoverContext = 'nine-bags' | 'near-match';
type Outcomes = {
  seat: Seat;
  score: number;
  scoreMargin: number;
  tricks: number;
  contractBid: number;
  creditedTricks: number;
  contractMet: boolean;
  nilBids: number;
  nilSuccesses: number;
  failedNilTricks: number;
  overtricks: number;
  bagsAdded: number;
  bagPenalties: number;
  newBags: number;
  startingScore: number;
  endingScore: number;
  oldBags: number;
};
type HandRow = {
  mode: Mode;
  seed: number;
  dealer: Seat;
  actorSeat: Seat | null;
  arm: Arm;
  transitions: number;
  decisions: number;
  forcedDecisions: number;
  elapsedMs: number;
  scenarioCounts: Record<string, number>;
  outcomes: Outcomes[];
  context: 'zero-start' | CarryoverContext;
  handNumber: number;
  startingScores: number[];
  startingBags: number[];
  matchComplete: boolean;
  newPolicySeats: Seat[];
};

export const SPADES_REASONING_MANIFEST = {
  id: 'spades-reasoning-comparison-2026-09-29',
  purpose:
    'Bounded deterministic regression and exploratory synthetic comparison; no strategy certification.',
  modes: ['spades-solo', 'spades-partners'] as Mode[],
  comparisonSeeds: Array.from({ length: 24 }, (_, index) => 72001 + index),
  actorSeats: [0, 1, 2, 3] as Seat[],
  arms: ['new-vs-baseline', 'baseline-vs-baseline', 'all-new'] as Arm[],
  pairedHandsPerMode: 192,
  compositionHandsPerMode: 24,
  budget: { hands: 432, maxTransitionsPerHand: 80, networkRequests: 0 },
  continuationBudget: { hands: 32, networkRequests: 0 },
  continuationSeeds: Array.from({ length: 8 }, (_, index) => 172001 + index),
  continuationContexts: ['nine-bags', 'near-match'] as CarryoverContext[],
  matchedTeamBudget: { hands: 48, networkRequests: 0 },
  matchedTeamActorSeats: [0, 1] as Seat[],
  matchedTeamDesign:
    'Both seats of the selected partnership use the new policy; the opposing partnership uses the frozen baseline. Pair each hand with the same seed, dealer and team from baseline-vs-baseline. These 48 hands are counted separately.',
  scoreMargin:
    'Own score minus largest opposing competitor hand score; in partnership this is team score minus opposing team score.',
  grouping:
    'All modes, seats and arms for one deal seed are correlated. Preserve seed grouping in any later inference.',
  limitations: [
    'Comparison seeds are fixed before this run but are an exploratory regression set, not a final held-out strength test.',
    'The frozen local baseline is the only opponent family in the paired comparison.',
    'Paired comparison hands start with zero prior score and bags. Separate reachable carryover cases test scoring/termination, not comparative match strength.',
    'All-new composition hands test interaction and termination; they are not independent paired strength measurements.',
    'Matched-team results test coordination against this one synthetic opponent family; they do not certify general partnership strength.',
    'Scenario counts show encountered conditions, not independently labelled strategic correctness.',
    'No human expertise, calibrated probabilities, causal learning benefit or optimal play is established.',
  ],
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

function validateState(state: PrivateGame): void {
  const publicPlays = [
    ...state.history.flatMap((trick) => trick.plays),
    ...(state.phase === 'trick-end' ? [] : state.trick),
  ];
  const cards = [...state.hands.flat(), ...publicPlays.map((play) => play.card)];
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards).size, 52);
  assert.equal(
    state.tricks.reduce((sum, n) => sum + n, 0),
    state.history.length,
  );
  for (const trick of state.history) {
    assert.equal(trick.plays.length, 4);
    assert.equal(new Set(trick.plays.map((play) => play.seat)).size, 4);
    assert.equal(trickWinner(trick.plays, state.mode), trick.winner);
    for (let index = 1; index < 4; index++)
      assert.equal(trick.plays[index].seat, (trick.plays[index - 1].seat + 1) % 4);
  }
  if (state.phase === 'play' && state.trick.length === 0 && state.history.length > 0)
    assert.equal(state.turn, state.history.at(-1)!.winner);
  assert.ok(state.bags.every((bags) => Number.isInteger(bags) && bags >= 0 && bags <= 9));
  assert.ok(state.scores.every(Number.isInteger));
}

function outcomes(
  state: PrivateGame,
  seat: Seat,
  startingScores: number[],
  startingBags: number[],
): Outcomes {
  assert.ok(state.handResult);
  const group: Seat[] = state.mode === 'spades-partners' ? [seat, ((seat + 2) % 4) as Seat] : [seat];
  const contractBid = group.reduce<number>((sum, player) => sum + (state.bids[player] ?? 0), 0);
  const creditedTricks = group.reduce<number>(
    (sum, player) => sum + (state.bids[player] === 0 ? 0 : state.tricks[player]),
    0,
  );
  const contractMet = creditedTricks >= contractBid;
  const nilBids = group.filter((player) => state.bids[player] === 0).length;
  const nilSuccesses = group.filter(
    (player) => state.bids[player] === 0 && state.tricks[player] === 0,
  ).length;
  const failedNilTricks = group.reduce<number>(
    (sum, player) => sum + (state.bids[player] === 0 ? state.tricks[player] : 0),
    0,
  );
  const overtricks = contractMet ? creditedTricks - contractBid : 0;
  const bagsAdded = overtricks + failedNilTricks;
  const oldBags = startingBags[seat];
  const bagPenalties = 100 * Math.floor((oldBags + bagsAdded) / 10);
  const score =
    (contractMet ? 10 : -10) * contractBid + 100 * (2 * nilSuccesses - nilBids) + overtricks - bagPenalties;
  assert.equal(
    state.handResult.points[seat],
    score,
    'Independent arithmetic agrees with completed hand scoring.',
  );
  assert.equal(state.bags[seat], (oldBags + bagsAdded) % 10);
  assert.equal(state.scores[seat], startingScores[seat] + score);
  const opponents = ([0, 1, 2, 3] as Seat[]).filter((player) => !group.includes(player));
  return {
    seat,
    score,
    scoreMargin: score - Math.max(...opponents.map((player) => state.handResult!.points[player])),
    tricks: group.reduce<number>((sum, player) => sum + state.tricks[player], 0),
    contractBid,
    creditedTricks,
    contractMet,
    nilBids,
    nilSuccesses,
    failedNilTricks,
    overtricks,
    bagsAdded,
    bagPenalties,
    newBags: state.bags[seat],
    startingScore: startingScores[seat],
    endingScore: state.scores[seat],
    oldBags,
  };
}

function runHand(
  mode: Mode,
  seed: number,
  actorSeat: Seat | null,
  arm: Arm,
  initial?: PrivateGame,
  context: HandRow['context'] = 'zero-start',
): HandRow {
  const dealer = initial?.dealer ?? ((seed % 4) as Seat);
  let state = initial
    ? structuredClone(initial)
    : createGame({ id: 'spades-reasoning-evaluation', mode, dealer }, deckFor(seed));
  const startingScores = [...state.scores];
  const startingBags = [...state.bags];
  const initialScoredEvents = state.events.filter((event) => event.type === 'hand-scored').length;
  if (arm === 'new-team-vs-baseline') {
    assert.equal(mode, 'spades-partners');
    assert.ok(actorSeat === 0 || actorSeat === 1);
  }
  const newPolicySeats: Seat[] =
    arm === 'all-new'
      ? [0, 1, 2, 3]
      : arm === 'new-team-vs-baseline'
        ? [actorSeat!, ((actorSeat! + 2) % 4) as Seat]
        : arm === 'new-vs-baseline'
          ? [actorSeat!]
          : [];
  const started = performance.now();
  const scenarioCounts: Record<string, number> = {};
  let transitions = 0;
  let decisions = 0;
  let forcedDecisions = 0;
  validateState(state);
  while (!['hand-end', 'match-end'].includes(state.phase)) {
    if (++transitions > SPADES_REASONING_MANIFEST.budget.maxTransitionsPerHand)
      throw new Error(`Transition budget exceeded: ${mode}/${seed}/${actorSeat}/${arm}.`);
    if (state.phase === 'trick-end') state = collectTrick(state);
    else {
      assert.notEqual(state.turn, null);
      const actor = state.turn!;
      const observation = observe(state, actor);
      const analysis = analyzeDecision(observation);
      const useNew = newPolicySeats.includes(actor);
      const selected = useNew ? analysis.action : chooseBaselineAction(observation);
      assert.notEqual(selected.kind, 'pass');
      assert.ok(legalActions(state, actor).some((action) => actionId(action) === actionId(selected)));
      assert.equal(selected.seat, actor);
      decisions++;
      if (observation.legalActions.length === 1) forcedDecisions++;
      for (const scenario of analysis.scenarioIds)
        scenarioCounts[scenario] = (scenarioCounts[scenario] ?? 0) + 1;
      if (selected.kind !== 'pass') state = apply(state, selected);
    }
    validateState(state);
  }
  assert.equal(state.history.length, 13);
  assert.equal(state.history.flatMap((trick) => trick.plays).length, 52);
  assert.ok(state.hands.every((hand) => hand.length === 0));
  assert.equal(state.events.filter((event) => event.type === 'hand-scored').length - initialScoredEvents, 1);
  assert.equal(decisions, 56);
  return {
    mode,
    seed,
    dealer,
    actorSeat,
    arm,
    transitions,
    decisions,
    forcedDecisions,
    elapsedMs: Math.round((performance.now() - started) * 100) / 100,
    scenarioCounts,
    outcomes: (actorSeat === null
      ? ((mode === 'spades-partners' ? [0, 1] : [0, 1, 2, 3]) as Seat[])
      : [actorSeat]
    ).map((seat) => outcomes(state, seat, startingScores, startingBags)),
    context,
    handNumber: state.handNumber,
    startingScores,
    startingBags,
    matchComplete: state.phase === 'match-end',
    newPolicySeats,
  };
}

/** Complete scripted legal hands establish carryover; no score/bag counter is patched. */
function carryoverState(mode: Mode, context: CarryoverContext): PrivateGame {
  const suitDeck = (dealer: Seat) => {
    const hands = ['S', 'C', 'D', 'H'].map((suit) => fullDeck().filter((card) => card[0] === suit));
    const deck: Card[] = [];
    for (let rank = 0; rank < 13; rank++)
      for (let offset = 1; offset <= 4; offset++) deck.push(hands[(dealer + offset) % 4][rank]);
    return deck;
  };
  const handCount = context === 'nine-bags' ? 1 : mode === 'spades-solo' ? 4 : 2;
  const bid = context === 'nine-bags' ? 4 : 12;
  let state = createGame({ id: 'reachable-carryover', mode, dealer: 3 }, suitDeck(3));
  for (let hand = 0; hand < handCount; hand++) {
    for (let transitions = 0; !['hand-end', 'match-end'].includes(state.phase); transitions++) {
      assert.ok(transitions < 80);
      if (state.phase === 'trick-end') state = collectTrick(state);
      else if (state.phase === 'bid')
        state = apply(state, {
          kind: 'bid',
          seat: state.turn!,
          bid: state.turn === 0 ? bid : state.turn === 2 ? 0 : 3,
        });
      else {
        const action = legalActions(state, state.turn!)[0];
        assert.notEqual(action.kind, 'pass');
        if (action.kind !== 'pass') state = apply(state, action);
      }
      validateState(state);
    }
    assert.equal(state.phase, 'hand-end');
    assert.equal(state.tricks[0], 13);
    if (hand + 1 < handCount) state = nextHand(state, suitDeck(((state.dealer + 1) % 4) as Seat));
  }
  if (context === 'nine-bags') assert.equal(state.bags[0], 9);
  else assert.equal(state.scores[0], mode === 'spades-solo' ? 484 : 442);
  return state;
}

function summarize(rows: HandRow[], mode: Mode, arm: Arm) {
  const hands = rows.filter((row) => row.mode === mode && row.arm === arm);
  const results = hands.flatMap((row) => row.outcomes);
  const total = (
    field: keyof Pick<
      Outcomes,
      | 'score'
      | 'scoreMargin'
      | 'creditedTricks'
      | 'nilBids'
      | 'nilSuccesses'
      | 'failedNilTricks'
      | 'overtricks'
      | 'bagsAdded'
      | 'bagPenalties'
      | 'newBags'
    >,
  ) => results.reduce((sum, row) => sum + row[field], 0);
  const scenarioCounts: Record<string, number> = {};
  for (const hand of hands)
    for (const [scenario, count] of Object.entries(hand.scenarioCounts))
      scenarioCounts[scenario] = (scenarioCounts[scenario] ?? 0) + count;
  return {
    mode,
    arm,
    hands: hands.length,
    competitorOutcomes: results.length,
    meanHandScore: total('score') / results.length,
    meanScoreMargin: total('scoreMargin') / results.length,
    contractsMade: results.filter((row) => row.contractMet).length,
    positiveContracts: results.filter((row) => row.contractBid > 0).length,
    positiveContractsMade: results.filter((row) => row.contractBid > 0 && row.contractMet).length,
    nilBids: total('nilBids'),
    nilSuccesses: total('nilSuccesses'),
    failedNilTricks: total('failedNilTricks'),
    overtricks: total('overtricks'),
    bagsAdded: total('bagsAdded'),
    bagPenalties: total('bagPenalties'),
    meanResidualBags: total('newBags') / results.length,
    forcedDecisions: hands.reduce((sum, row) => sum + row.forcedDecisions, 0),
    scenarioCounts,
  };
}

export function runSpadesReasoningEvaluation(outputPath?: string) {
  const started = performance.now();
  const rows: HandRow[] = [];
  for (const mode of SPADES_REASONING_MANIFEST.modes) {
    for (const seed of SPADES_REASONING_MANIFEST.comparisonSeeds) {
      for (const actor of SPADES_REASONING_MANIFEST.actorSeats)
        for (const arm of ['new-vs-baseline', 'baseline-vs-baseline'] as const)
          rows.push(runHand(mode, seed, actor, arm));
      rows.push(runHand(mode, seed, null, 'all-new'));
    }
  }
  assert.equal(rows.length, SPADES_REASONING_MANIFEST.budget.hands);
  const continuations: HandRow[] = [];
  for (const mode of SPADES_REASONING_MANIFEST.modes)
    for (const context of SPADES_REASONING_MANIFEST.continuationContexts) {
      const prior = carryoverState(mode, context);
      for (const seed of SPADES_REASONING_MANIFEST.continuationSeeds)
        continuations.push(runHand(mode, seed, null, 'all-new', nextHand(prior, deckFor(seed)), context));
    }
  assert.equal(continuations.length, SPADES_REASONING_MANIFEST.continuationBudget.hands);
  const matchedTeams: HandRow[] = [];
  for (const seed of SPADES_REASONING_MANIFEST.comparisonSeeds)
    for (const actor of SPADES_REASONING_MANIFEST.matchedTeamActorSeats)
      matchedTeams.push(runHand('spades-partners', seed, actor, 'new-team-vs-baseline'));
  assert.equal(matchedTeams.length, SPADES_REASONING_MANIFEST.matchedTeamBudget.hands);
  const matchedTeamReferences = matchedTeams.map((row) => {
    const reference = rows.find(
      (other) =>
        other.mode === 'spades-partners' &&
        other.seed === row.seed &&
        other.dealer === row.dealer &&
        other.actorSeat === row.actorSeat &&
        other.arm === 'baseline-vs-baseline',
    );
    assert.ok(reference, 'Every new-team result requires the identical baseline deal, dealer and team.');
    assert.equal(row.newPolicySeats.length, 2);
    assert.equal(reference.newPolicySeats.length, 0);
    return reference;
  });
  const matchedTeamDifferences = matchedTeams.map((row, index) => ({
    seed: row.seed,
    actorSeat: row.actorSeat,
    teamSeats: row.newPolicySeats,
    scoreDifference: row.outcomes[0].score - matchedTeamReferences[index].outcomes[0].score,
    scoreMarginDifference: row.outcomes[0].scoreMargin - matchedTeamReferences[index].outcomes[0].scoreMargin,
  }));
  const matchedTeamComparison = {
    mode: 'spades-partners',
    pairedHands: matchedTeams.length,
    independentDealSeeds: SPADES_REASONING_MANIFEST.comparisonSeeds.length,
    newTeamSummary: summarize(matchedTeams, 'spades-partners', 'new-team-vs-baseline'),
    baselineTeamSummary: summarize(matchedTeamReferences, 'spades-partners', 'baseline-vs-baseline'),
    meanScoreDifference:
      matchedTeamDifferences.reduce((sum, row) => sum + row.scoreDifference, 0) /
      matchedTeamDifferences.length,
    meanScoreMarginDifference:
      matchedTeamDifferences.reduce((sum, row) => sum + row.scoreMarginDifference, 0) /
      matchedTeamDifferences.length,
    differences: matchedTeamDifferences,
  };
  const comparisons = SPADES_REASONING_MANIFEST.modes.map((mode) => {
    const differences = rows
      .filter((row) => row.mode === mode && row.arm === 'new-vs-baseline')
      .map((row) => {
        const reference = rows.find(
          (other) =>
            other.mode === mode &&
            other.seed === row.seed &&
            other.actorSeat === row.actorSeat &&
            other.arm === 'baseline-vs-baseline',
        );
        assert.ok(reference);
        return {
          seed: row.seed,
          seat: row.actorSeat,
          scoreDifference: row.outcomes[0].score - reference.outcomes[0].score,
          scoreMarginDifference: row.outcomes[0].scoreMargin - reference.outcomes[0].scoreMargin,
        };
      });
    return {
      mode,
      pairedHands: differences.length,
      independentDealSeeds: SPADES_REASONING_MANIFEST.comparisonSeeds.length,
      meanScoreDifference:
        differences.reduce((sum, row) => sum + row.scoreDifference, 0) / differences.length,
      meanScoreMarginDifference:
        differences.reduce((sum, row) => sum + row.scoreMarginDifference, 0) / differences.length,
      differences,
    };
  });
  const result = {
    manifest: SPADES_REASONING_MANIFEST,
    manifestSha256: createHash('sha256').update(JSON.stringify(SPADES_REASONING_MANIFEST)).digest('hex'),
    status: 'completed-synthetic-comparison-no-promotion',
    policyVersion: POLICY_VERSION,
    baselinePolicyVersion: BASELINE_POLICY_VERSION,
    runtime: process.version,
    providerMode: 'off',
    observedModelId: null,
    networkRequests: 0,
    hands: rows.length + continuations.length + matchedTeams.length,
    comparisonHands: rows.length,
    continuationHands: continuations.length,
    matchedTeamHands: matchedTeams.length,
    elapsedMs: Math.round(performance.now() - started),
    summaries: SPADES_REASONING_MANIFEST.modes.flatMap((mode) =>
      SPADES_REASONING_MANIFEST.arms.map((arm) => summarize(rows, mode, arm)),
    ),
    comparisons,
    matchedTeamComparison,
    continuationSummaries: SPADES_REASONING_MANIFEST.modes.flatMap((mode) =>
      SPADES_REASONING_MANIFEST.continuationContexts.map((context) => {
        const selected = continuations.filter((row) => row.mode === mode && row.context === context);
        return {
          ...summarize(selected, mode, 'all-new'),
          context,
          startingScores: selected[0].startingScores,
          startingBags: selected[0].startingBags,
          previousHandsCompleted: selected[0].handNumber - 1,
          handsWithBagPenalty: selected.filter((row) =>
            row.outcomes.some((outcome) => outcome.bagPenalties > 0),
          ).length,
          matchCompletions: selected.filter((row) => row.matchComplete).length,
        };
      }),
    ),
    rows,
    continuations,
    matchedTeams,
  };
  if (outputPath) writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runSpadesReasoningEvaluation(process.argv[2]);
  process.stdout.write(
    JSON.stringify(
      {
        status: result.status,
        hands: result.hands,
        elapsedMs: result.elapsedMs,
        policyVersion: result.policyVersion,
        baselinePolicyVersion: result.baselinePolicyVersion,
        summaries: result.summaries,
        continuationSummaries: result.continuationSummaries,
        comparisons: result.comparisons.map(({ differences: _differences, ...comparison }) => comparison),
        matchedTeamComparison: (({ differences: _differences, ...comparison }) => comparison)(
          result.matchedTeamComparison,
        ),
      },
      null,
      2,
    ) + '\n',
  );
}
