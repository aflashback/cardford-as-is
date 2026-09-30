import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  actionId,
  apply,
  collectTrick,
  createGame,
  fullDeck,
  legalActions,
  nextHand,
  type Card,
  type Four,
  type GameAction,
  type PrivateGame,
  type Seat,
} from '../game/index.ts';
import { competitionFor } from '../game/kernel/competition.ts';
import { observe, type SeatObservation } from '../observations/index.ts';
import { chooseBaselineAction } from '../strategy/baseline.ts';
import {
  analyzeDecision,
  costOf,
  getReasoningPack,
  getReasoningProfile,
  listReasoningProfiles,
  readSavedAnalysis,
} from '../strategy/index.ts';
import { decide, type DecisionBudget } from '../strategy/plan/contract.ts';
import { createRandom, hashText, shuffled, type Random } from '../strategy/plan/random.ts';
import { createWorldSampler } from '../strategy/sampler.ts';
import {
  PHASE_DONE,
  actionIdOfMove,
  applyMove,
  cardIndex,
  cloneWorld,
  legalMoves,
  moveFromAction,
  scoreWorld,
  worldFromState,
  type HeartsWorld,
} from '../games/hearts/plan/kernel.ts';
import { SEALED_STEP_LIMITATION, createHeartsPlayoutModel, observationWorld } from '../games/hearts/plan/model.ts';
import { createHeartsPlanningPack, equivalentCards, heartsObservationKey } from '../games/hearts/plan/pack.ts';
import { deriveHeartsPlan } from '../games/hearts/plan/planner.ts';
import { playoutMove } from '../games/hearts/plan/policy.ts';
import {
  HEARTS_PLAN_POLICY_VERSION,
  HEARTS_PLAN_PROFILE,
  analyzeHeartsPlan,
  heartsPlanProfiles,
} from '../games/hearts/plan/profiles.ts';
import {
  F_INTENT,
  F_STANCE,
  HEARTS_STANCE_IDS,
  INTENT_AVOID,
  INTENT_RUN,
  INTENT_STOP,
  STANCE_FIELDS,
  STANCE_RUN,
  STANCE_STOP,
  deriveStance,
} from '../games/hearts/plan/stance.ts';

const SEATS: Seat[] = [0, 1, 2, 3];
const deal = (seed: number, hand: number): Card[] => shuffled(fullDeck(), createRandom(seed, 100 + hand));
const newGame = (seed: number, label: string): PrivateGame =>
  createGame({ id: `hearts-${label}-${seed}`, mode: 'hearts', dealer: (seed % 4) as Seat }, deal(seed, 0));
const randomPasses = (state: PrivateGame, random: Random) =>
  SEATS.map((seat) => shuffled(state.hands[seat], random).slice(0, 3)) as Four<Card[]>;
const baselinePasses = (state: PrivateGame) =>
  SEATS.map((seat) => {
    const action = chooseBaselineAction(observe(state, seat));
    if (action.kind !== 'pass') throw new Error('A pass was expected.');
    return action.cards;
  }) as Four<Card[]>;
const playCard = (action: GameAction): { kind: 'play'; seat: Seat; card: Card } => {
  if (action.kind !== 'play') throw new Error('A card play was expected.');
  return action;
};
const snapshot = (world: HeartsWorld) =>
  JSON.stringify({
    ...world,
    hands: [...world.hands], scores: [...world.scores], points: [...world.points],
    heartsTaken: [...world.heartsTaken], played: [...world.played], voids: [...world.voids],
    // Trick slots beyond trickLen are scratch space.
    trickSeat: [...world.trickSeat].slice(0, world.trickLen),
    trickCard: [...world.trickCard].slice(0, world.trickLen),
  });
/** Points before any reversal, counted here without the kernel or the production scorer. */
const rawPoints = (state: PrivateGame) => {
  const points = [0, 0, 0, 0];
  for (const trick of state.history)
    for (const play of trick.plays) points[trick.winner] += play.card === 'SQ' ? 13 : play.card[0] === 'H' ? 1 : 0;
  return points;
};
/** A hand with no pass and exactly these cards: hand 4 of the rotation, reached here by direct construction. */
function fromHands(hands: Four<Card[]>, label: string): PrivateGame {
  const deck: Card[] = [];
  for (let index = 0; index < 13; index++) for (const seat of SEATS) deck.push(hands[seat][index]);
  const state = createGame({ id: `hearts-${label}`, mode: 'hearts', dealer: 3 }, deck);
  for (const seat of SEATS) assert.deepEqual([...state.hands[seat]].sort(), [...hands[seat]].sort());
  state.handNumber = 4;
  state.passDirection = 'hold';
  state.phase = 'play';
  state.turn = SEATS.find((seat) => state.hands[seat].includes('C2'))!;
  return state;
}
/** Seat 0 holds the two of clubs and the three top cards of every suit; the rest is shuffled. */
function commandingDeal(seed: number): PrivateGame {
  const top = ['C2', ...['C', 'D', 'H', 'S'].flatMap((suit) => ['A', 'K', 'Q'].map((rank) => suit + rank))];
  const rest = shuffled(
    fullDeck().filter((card) => !top.includes(card)),
    createRandom(seed, 5),
  );
  return fromHands([top, rest.slice(0, 13), rest.slice(13, 26), rest.slice(26, 39)], `command-${seed}`);
}
/** Seat 1 holds no club: every heart, or a mixed hand with the queen of spades. */
function shortClubDeal(seed: number, allHearts: boolean): PrivateGame {
  const suit = (letter: string) => fullDeck().filter((card) => card[0] === letter);
  const chosen = allHearts
    ? suit('H')
    : ['H2', 'H5', 'H9', 'HK', 'SQ', 'SA', 'S3', 'D2', 'D7', 'DJ', 'DA', 'S9', 'H3'];
  const rest = shuffled(
    fullDeck().filter((card) => !chosen.includes(card)),
    createRandom(seed, 5),
  );
  return fromHands([rest.slice(0, 13), chosen, rest.slice(13, 26), rest.slice(26, 39)], `short-${seed}-${allHearts}`);
}
const highest = (actions: GameAction[]) =>
  actions.map(playCard).reduce((best, action) => (cardIndex(action.card) % 13 > cardIndex(best.card) % 13 ? action : best));

test('GP-06: Hearts playout kernel matches production legality, trick winners and points on 60 seeded hands', () => {
  const buffer: number[] = [];
  const directions = new Set<string>();
  let hands = 0;
  for (let seed = 4_000_001; hands < 60; seed++) {
    const random = createRandom(seed, 7);
    let state = newGame(seed, 'kernel');
    for (let hand = 0; hand < 4 && hands < 60; hand++) {
      directions.add(state.passDirection);
      if (state.phase === 'pass') state = apply(state, { kind: 'pass-bundle', passes: randomPasses(state, random) });
      const world = worldFromState(state);
      let guard = 0;
      while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
        assert.ok(++guard < 80);
        if (state.phase === 'trick-end') {
          assert.equal(world.leader, state.history.at(-1)!.winner, `winner ${seed}/${hand}`);
          assert.deepEqual([...world.points], rawPoints(state), `points ${seed}/${hand}`);
          assert.equal(snapshot(worldFromState(state)), snapshot(world), `trick-end rebuild ${seed}/${hand}`);
          state = collectTrick(state);
          continue;
        }
        const seat = state.turn!;
        assert.equal(world.turn, seat);
        assert.equal(world.heartsBroken, state.heartsBroken);
        const expected = legalActions(state, seat).map(actionId).sort();
        const count = legalMoves(world, buffer);
        assert.deepEqual(buffer.slice(0, count).map(actionIdOfMove).sort(), expected, `legal ${seed}/${hand}`);
        assert.equal(snapshot(worldFromState(state)), snapshot(world), `rebuild ${seed}/${hand}`);
        const action = playCard(legalActions(state, seat)[random.below(expected.length)]);
        applyMove(world, moveFromAction(action));
        state = apply(state, action);
      }
      assert.equal(world.phase, PHASE_DONE);
      const scored = scoreWorld(world);
      assert.deepEqual(scored.points, state.handResult!.points, `hand points ${seed}/${hand}`);
      assert.deepEqual(scored.score, state.scores, `match score ${seed}/${hand}`);
      hands++;
      if (state.phase !== 'hand-end') break;
      state = nextHand(state, deal(seed, hand + 1));
    }
  }
  assert.equal(hands, 60);
  assert.deepEqual([...directions].sort(), ['across', 'hold', 'left', 'right']);
});

test('GP-06: Hearts playout kernel matches production scoring when one seat takes every point', () => {
  const buffer: number[] = [];
  for (const seed of [4_100_001, 4_100_002, 4_100_003]) {
    const random = createRandom(seed, 7);
    let state = commandingDeal(seed);
    const world = worldFromState(state);
    while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
      if (state.phase === 'trick-end') {
        assert.equal(world.leader, state.history.at(-1)!.winner);
        state = collectTrick(state);
        continue;
      }
      const seat = state.turn!;
      const legal = legalActions(state, seat);
      const count = legalMoves(world, buffer);
      assert.deepEqual(buffer.slice(0, count).map(actionIdOfMove).sort(), legal.map(actionId).sort());
      const action = seat === 0 ? highest(legal) : playCard(legal[random.below(legal.length)]);
      applyMove(world, moveFromAction(action));
      state = apply(state, action);
    }
    assert.deepEqual([...world.points], [26, 0, 0, 0]);
    assert.deepEqual(state.handResult!.points, [0, 26, 26, 26]);
    assert.deepEqual(scoreWorld(world).points, state.handResult!.points);
    assert.deepEqual(scoreWorld(world).score, state.scores);
  }
});

test('GP-06: Hearts playout kernel refuses the sealed pass and impossible input', () => {
  const state = newGame(4_150_001, 'refuse');
  assert.equal(state.phase, 'pass');
  assert.throws(() => worldFromState(state), /sealed pass is not modelled/);
  const spades = createGame({ id: 'not-hearts', mode: 'spades-solo', dealer: 0 }, deal(4_150_001, 0));
  assert.throws(() => worldFromState({ ...spades, phase: 'play' }), /Hearts state is required/);
  const playing = apply(state, { kind: 'pass-bundle', passes: baselinePasses(state) });
  const world = worldFromState(playing);
  const held = cardIndex(playing.hands[playing.turn!][0]);
  const missing = cardIndex(playing.hands[SEATS.find((seat) => seat !== playing.turn)!][0]);
  assert.throws(() => applyMove(cloneWorld(world), missing), /not in hand/);
  assert.doesNotThrow(() => applyMove(cloneWorld(world), held));
  assert.throws(() => scoreWorld(world), /completed hand/);
  const doubled = structuredClone(playing);
  doubled.hands[1][0] = doubled.hands[0][0];
  assert.throws(() => worldFromState(doubled), /appears twice/);
});

test('GP-06: Hearts playout kernel mirrors the first-trick and unbroken-hearts rules', () => {
  const buffer: number[] = [];
  let guardedDiscards = 0,
    pointDiscards = 0,
    heldBackLeads = 0;
  for (const allHearts of [false, true])
    for (const seed of [4_160_001, 4_160_002, 4_160_003, 4_160_004]) {
      const random = createRandom(seed, 7);
      let state = shortClubDeal(seed, allHearts);
      const world = worldFromState(state);
      while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
        if (state.phase === 'trick-end') {
          assert.equal(world.leader, state.history.at(-1)!.winner);
          assert.deepEqual([...world.points], rawPoints(state));
          state = collectTrick(state);
          continue;
        }
        const seat = state.turn!;
        const legal = legalActions(state, seat);
        const count = legalMoves(world, buffer);
        assert.deepEqual(buffer.slice(0, count).map(actionIdOfMove).sort(), legal.map(actionId).sort());
        assert.equal(world.heartsBroken, state.heartsBroken);
        const hand = state.hands[seat];
        if (!state.history.length && state.trick.length && !hand.some((card) => card[0] === 'C')) {
          const safe = hand.filter((card) => card[0] !== 'H' && card !== 'SQ');
          if (safe.length) {
            guardedDiscards++;
            assert.deepEqual(legal.map((action) => playCard(action).card).sort(), [...safe].sort());
          } else {
            pointDiscards++;
            assert.equal(legal.length, hand.length);
          }
        }
        if (state.history.length && !state.trick.length && !state.heartsBroken) {
          const others = hand.filter((card) => card[0] !== 'H');
          if (others.length && others.length < hand.length) {
            heldBackLeads++;
            assert.ok(legal.every((action) => playCard(action).card[0] !== 'H'));
          }
        }
        const action = playCard(legal[random.below(legal.length)]);
        applyMove(world, moveFromAction(action));
        state = apply(state, action);
      }
      assert.deepEqual(scoreWorld(world).points, state.handResult!.points);
    }
  assert.ok(guardedDiscards >= 4, 'a first-trick discard with a safe card was exercised');
  assert.ok(pointDiscards >= 4, 'a first-trick discard without a safe card was exercised');
  assert.ok(heldBackLeads > 0, 'a lead before hearts were broken was exercised');
});

const withIntent = (world: HeartsWorld, seat: number, intent: number) => {
  const copy = cloneWorld(world);
  copy.focal = intent ? seat : -1;
  copy.focalIntent = intent;
  return copy;
};

test('GP-04: the Hearts continuation policy reads only the acting seat and public state', () => {
  const buffer: number[] = [];
  const scratch = new Int16Array(STANCE_FIELDS);
  const stances = new Set<number>();
  const intents = new Set<number>();
  let decisions = 0,
    redistributed = 0,
    passKnowledge = 0;
  const games: PrivateGame[] = [];
  for (let seed = 4_200_001; seed <= 4_200_010; seed++) {
    const state = newGame(seed, 'policy');
    games.push(apply(state, { kind: 'pass-bundle', passes: baselinePasses(state) }));
  }
  for (const seed of [4_210_001, 4_210_002]) games.push(commandingDeal(seed));
  games.forEach((start, game) => {
    let state = start;
    while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
      if (state.phase === 'trick-end') {
        state = collectTrick(state);
        continue;
      }
      const seat = state.turn!;
      const world = worldFromState(state);
      const observation = observe(state, seat);
      if (observation.knownHoldings.length) passKnowledge++;
      // Other hands consistent with this seat's view: its own cards, public play and the cards it passed.
      const sampler = createWorldSampler(observation);
      const variants = [observationWorld(observation)];
      for (let draw = 0; draw < 3; draw++) {
        const hands = sampler.draw(hashText(`policy/${game}/${decisions}/${draw}`));
        assert.deepEqual(hands[seat], state.hands[seat]);
        for (const known of observation.knownHoldings) assert.ok(hands[known.seat].includes(known.card));
        if (JSON.stringify(hands) !== JSON.stringify(state.hands)) redistributed++;
        variants.push(worldFromState({ ...state, hands }));
      }
      for (const intent of [0, INTENT_AVOID, INTENT_STOP, INTENT_RUN]) {
        const actual = withIntent(world, seat, intent);
        const expected = playoutMove(actual);
        const count = legalMoves(actual, buffer);
        assert.ok(buffer.slice(0, count).includes(expected), `illegal playout move ${game}/${decisions}`);
        deriveStance(actual, seat, scratch);
        intents.add(scratch[F_INTENT]);
        for (const variant of variants)
          assert.equal(
            playoutMove(withIntent(variant, seat, intent)),
            expected,
            `concealed cards changed the playout move ${game}/${decisions}/${intent}`,
          );
      }
      deriveStance(world, seat, scratch);
      stances.add(scratch[F_STANCE]);
      decisions++;
      state = apply(state, { kind: 'play', seat, card: actionIdOfMove(playoutMove(world)).slice('play:'.length) });
    }
    assert.equal(state.handResult!.points.reduce((sum, value) => sum + value, 0) % 26, 0);
  });
  assert.equal(decisions, games.length * 52);
  assert.ok(redistributed > decisions, 'the concealed cards really were redistributed');
  assert.ok(passKnowledge > 0, 'cards passed by the seat constrained some redistributions');
  assert.deepEqual([...stances].sort(), [0, 1, 2, 3], 'every play stance was reached');
  assert.deepEqual([...intents].sort(), [INTENT_AVOID, INTENT_STOP, INTENT_RUN]);
});

/** Engine position reached by seat 0 playing its highest card and the others their lowest. */
function commandingPosition(seed: number, until: (state: PrivateGame) => boolean): PrivateGame {
  let state = commandingDeal(seed);
  while (!(state.phase === 'play' && until(state))) {
    if (state.phase === 'hand-end' || state.phase === 'match-end') throw new Error('The position was not reached.');
    if (state.phase === 'trick-end') {
      state = collectTrick(state);
      continue;
    }
    const legal = legalActions(state, state.turn!);
    state = apply(state, state.turn === 0 ? highest(legal) : playCard(legal[0]));
  }
  return state;
}

test('GP-02: the Hearts plan is a pure function of the seat observation with exact stances and goals', () => {
  const ids = new Set<string>(HEARTS_STANCE_IDS);
  let plans = 0;
  for (let seed = 4_300_001; seed <= 4_300_008; seed++) {
    let state = newGame(seed, 'plan');
    for (const seat of SEATS) {
      const pass = deriveHeartsPlan(observe(state, seat));
      assert.equal(pass.decisionKind, 'commitment');
      assert.equal(pass.stance.id, 'hearts.choose-pass');
      assert.deepEqual(pass.competing, []);
      assert.deepEqual(pass.teammates, []);
      assert.ok(pass.goals.every((goal) => goal.beneficiary === 'self'));
      assert.ok(pass.limitations.includes(SEALED_STEP_LIMITATION));
      assert.deepEqual(createHeartsPlanningPack().stances(observe(state, seat), pass), ['hearts.choose-pass']);
    }
    state = apply(state, { kind: 'pass-bundle', passes: baselinePasses(state) });
    while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
      if (state.phase === 'trick-end') {
        state = collectTrick(state);
        continue;
      }
      const taken = rawPoints(state);
      for (const seat of SEATS) {
        const observation = observe(state, seat);
        const plan = deriveHeartsPlan(observation);
        plans++;
        assert.deepEqual(deriveHeartsPlan(structuredClone(observation)), plan);
        // Presentation text and the event log never reach the plan.
        assert.deepEqual(deriveHeartsPlan({ ...observation, events: [], legalActions: [] }), plan);
        assert.equal(plan.decisionKind, 'play');
        assert.equal(plan.phaseId, 'hearts.playing');
        assert.ok(ids.has(plan.stance.id) && plan.stance.id !== 'hearts.choose-pass');
        assert.equal(plan.stance.evidence, 'exact');
        assert.deepEqual(plan.teammates, []);
        assert.equal(
          plan.competitorId,
          competitionFor('hearts').competitors.find((entry) => entry.seats.includes(seat))!.id,
        );
        assert.deepEqual(plan.estimates, []);
        assert.deepEqual(
          plan.goals.map((goal) => goal.priority),
          plan.goals.map((_, index) => index + 1),
        );
        for (const goal of plan.goals) {
          assert.equal(goal.beneficiary, 'self');
          assert.equal(goal.evidence, 'exact');
          assert.ok(goal.progress && ['at-most', 'exactly'].includes(goal.progress.comparator), goal.id);
          assert.ok(goal.against === null || !goal.against.seats.includes(seat));
        }
        const first = plan.goals.find((goal) => goal.id === 'hearts.take-no-points')!;
        assert.equal(first.progress!.current, taken[seat]);
        assert.equal(
          first.status,
          taken[seat] > 0 ? 'failed' : taken.reduce((sum, value) => sum + value, 0) === 26 ? 'secured' : 'open',
        );
        // Revisions form one chain that ends at the stance reported now.
        plan.revisions.forEach((revision, index) => {
          assert.notEqual(revision.from, revision.to);
          if (index) assert.equal(revision.from, plan.revisions[index - 1].to);
        });
        if (plan.revisions.length) assert.equal(plan.revisions.at(-1)!.to, plan.stance.id);
      }
      state = apply(state, playCard(chooseBaselineAction(observe(state, state.turn!))));
    }
  }
  assert.ok(plans > 1000);
});

test('GP-02: Hearts stances follow who holds the points taken so far', () => {
  // Seat 0 has just captured the queen of spades and holds every point taken so far.
  const state = commandingPosition(4_310_001, (next) => rawPoints(next)[0] >= 13 && next.trick.length === 0);
  const taken = rawPoints(state);
  assert.deepEqual(taken.slice(1), [0, 0, 0]);
  const runner = deriveHeartsPlan(observe(state, 0));
  assert.equal(runner.stance.id, 'hearts.run-every-point');
  assert.deepEqual(
    runner.competing.map((entry) => entry.stanceId),
    ['hearts.avoid-points'],
  );
  assert.equal(runner.goals[0].id, 'hearts.take-every-point');
  assert.deepEqual(runner.goals[0].progress, {
    unit: 'points', comparator: 'exactly', target: 26, current: taken[0], remainingOpportunities: 26 - taken[0],
  });
  assert.equal(runner.revisions.at(-1)!.trigger, 'own-run-live');
  assert.deepEqual(createHeartsPlanningPack().stances(observe(state, 0), runner), [
    'hearts.run-every-point',
    'hearts.avoid-points',
  ]);
  for (const seat of [1, 2, 3] as Seat[]) {
    const plan = deriveHeartsPlan(observe(state, seat));
    assert.equal(plan.stance.id, 'hearts.stop-a-runner');
    assert.equal(plan.goals[0].id, 'hearts.hold-a-runner:south');
    assert.deepEqual(plan.goals[0].against, { competitorIds: ['south'], seats: [0] });
    assert.equal(plan.goals[0].status, 'open');
    assert.deepEqual(plan.goals[0].progress, {
      unit: 'points', comparator: 'at-most', target: 25, current: taken[0], remainingOpportunities: 26 - taken[0],
    });
    assert.equal(plan.revisions.at(-1)!.trigger, 'one-seat-holds-every-point');
    assert.equal(plan.revisions.at(-1)!.to, 'hearts.stop-a-runner');
    assert.deepEqual(createHeartsPlanningPack().stances(observe(state, seat), plan), [
      'hearts.stop-a-runner',
      'hearts.avoid-points',
    ]);
  }
  // Before any point is taken nobody is running: the stance depends on the seat's own dangerous cards only.
  const opening = commandingDeal(4_310_001);
  assert.equal(deriveHeartsPlan(observe(opening, 0)).stance.id, 'hearts.shed-dangerous-cards');
  for (const seat of [1, 2, 3] as Seat[])
    assert.equal(deriveHeartsPlan(observe(opening, seat)).stance.id, 'hearts.avoid-points');
});

test('GP-06: Hearts equivalence never merges across the trick in progress or the queen of spades', () => {
  const hands: Four<Card[]> = [
    ['C2', 'C3', 'C4', 'C9', 'CJ', 'D2', 'D3', 'H5', 'H6', 'H8', 'SJ', 'SQ', 'SK'],
    ['C5', 'C6', 'C7', 'C8', 'C10', 'D4', 'D5', 'D6', 'H2', 'H3', 'H4', 'S2', 'S3'],
    ['CQ', 'CK', 'CA', 'D7', 'D8', 'D9', 'D10', 'H7', 'H9', 'H10', 'S4', 'S5', 'S6'],
    ['DJ', 'DQ', 'DK', 'DA', 'HJ', 'HQ', 'HK', 'HA', 'S7', 'S8', 'S9', 'S10', 'SA'],
  ];
  let state = fromHands(hands, 'equivalence');
  const groups = (next: PrivateGame, seat: Seat) =>
    equivalentCards(
      observationWorld(observe(next, seat)),
      seat,
      observe(next, seat).legalActions.map((action) => playCard(action).card),
    );
  // Opening lead: one legal card, nothing to merge.
  assert.deepEqual(groups(state, 0), []);
  for (const card of ['C2', 'C5', 'CQ', 'DJ']) state = apply(state, { kind: 'play', seat: state.turn!, card });
  state = collectTrick(state);
  assert.equal(state.turn, 2);
  state = apply(state, { kind: 'play', seat: 2, card: 'S4' });
  state = apply(state, { kind: 'play', seat: 3, card: 'S7' });
  // Seat 0 follows spades: the jack and king touch through its own queen, and the queen stays apart.
  assert.deepEqual(groups(state, 0), [['SJ', 'SK']]);
  state = apply(state, { kind: 'play', seat: 0, card: 'SK' });
  state = apply(state, { kind: 'play', seat: 1, card: 'S2' });
  state = collectTrick(state);
  assert.equal(state.turn, 0);
  // Seat 0 leads with hearts unbroken: the 3 and 4 of clubs touch, and so do the 2 and 3 of diamonds.
  // The 9 and jack of clubs do not, because the 10 is still held elsewhere.
  assert.deepEqual(groups(state, 0), [
    ['C3', 'C4'],
    ['D2', 'D3'],
  ]);
  for (const card of ['C9', 'C10', 'CK', 'HJ']) state = apply(state, { kind: 'play', seat: state.turn!, card });
  state = collectTrick(state);
  assert.equal(state.turn, 2);
  state = apply(state, { kind: 'play', seat: 2, card: 'H7' });
  state = apply(state, { kind: 'play', seat: 3, card: 'HQ' });
  // Hearts are led and the 7 lies on the table: seat 0's 6 is below it and its 8 above it, so they stay distinct.
  assert.deepEqual(groups(state, 0), [['H5', 'H6']]);
  const decision = decide(createHeartsPlanningPack(), observe(state, 0), HEARTS_PLAN_PROFILE.budget);
  assert.deepEqual(decision.merged, { 'play:H5': ['play:H6'] });
  const searched = decision.search!.candidates.map((entry) => entry.moveId.split(' @ ')[0]);
  assert.deepEqual([...new Set(searched)].sort(), ['play:H5', 'play:H8']);
});

/** Every Hearts decision of `hands` seeded hands, four hands to a game so each pass direction occurs. */
function everyDecision(
  firstSeed: number,
  hands: number,
  label: string,
  choose: (observation: SeatObservation, where: string) => GameAction,
): { states: PrivateGame[]; directions: Set<string> } {
  const states: PrivateGame[] = [];
  const directions = new Set<string>();
  for (let seed = firstSeed; states.length < hands; seed++) {
    let state = newGame(seed, label);
    for (let hand = 0; hand < 4 && states.length < hands; hand++) {
      directions.add(state.passDirection);
      if (state.phase === 'pass') {
        const sealed = state;
        const passes = SEATS.map((seat) => {
          const action = choose(observe(sealed, seat), `${seed}/${hand}/pass/${seat}`);
          if (action.kind !== 'pass') throw new Error('A pass was expected.');
          return action.cards;
        }) as Four<Card[]>;
        state = apply(state, { kind: 'pass-bundle', passes });
      }
      let step = 0;
      while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
        if (state.phase === 'trick-end') {
          state = collectTrick(state);
          continue;
        }
        const seat = state.turn!;
        const action = choose(observe(state, seat), `${seed}/${hand}/${step++}/${seat}`);
        assert.ok(
          legalActions(state, seat).some((legal) => actionId(legal) === actionId(action)),
          `illegal action ${seed}/${hand}/${step}`,
        );
        state = apply(state, playCard(action));
      }
      states.push(state);
      if (state.phase !== 'hand-end') break;
      state = nextHand(state, deal(seed, hand + 1));
    }
  }
  return { states, directions };
}
/** Either the 26 points of the hand are shared out, or one seat took them all and the other three score 26. */
function assertConserved(points: number[], where: string) {
  const total = points.reduce((sum, value) => sum + value, 0);
  const reversed = [...points].sort((a, b) => a - b).join(',') === '0,26,26,26';
  assert.ok(reversed || (total === 26 && points.every((value) => value >= 0 && value < 26)), `points ${where}: ${points}`);
}

/** FNV-1a of every decision of the live default over the 24 hands, recorded from hearts-baseline-1.0.0. */
const GOLDEN_BASELINE_DECISIONS = 3183225529;

test('GP-06: production Hearts stays on hearts-baseline-1.0.0 with identical decisions over 24 seeded hands', () => {
  const pack = getReasoningPack('hearts');
  assert.equal(pack.policyVersion, 'hearts-baseline-1.0.0');
  assert.equal(costOf(pack), 'inline');
  const log: string[] = [];
  const { states, directions } = everyDecision(4_400_001, 24, 'golden', (observation, where) => {
    const analysis = pack.analyze(observation);
    assert.equal(analysis.schemaVersion, '1.0.0');
    assert.equal(analysis.policyVersion, 'hearts-baseline-1.0.0');
    assert.equal(actionId(analysis.action), actionId(chooseBaselineAction(observation)), where);
    // Without a named policy the live default decides, and it is this pack.
    assert.deepEqual(analyzeDecision(observation), analysis, where);
    log.push(`${where}/${actionId(analysis.action)}`);
    return analysis.action;
  });
  assert.equal(states.length, 24);
  assert.deepEqual([...directions].sort(), ['across', 'hold', 'left', 'right']);
  for (const state of states) assertConserved(state.handResult!.points, state.id);
  assert.equal(log.length, 24 * 52 + 18 * 4);
  assert.equal(hashText(log.join('\n')), GOLDEN_BASELINE_DECISIONS, 'the retained baseline changed a decision');
});

test('GP-06: hearts-plan-1.0.0 is a selectable profile and never the default', () => {
  const listed = listReasoningProfiles('hearts');
  assert.ok(listed.includes('hearts-baseline-1.0.0'));
  assert.ok(listed.includes(HEARTS_PLAN_POLICY_VERSION));
  assert.equal(HEARTS_PLAN_POLICY_VERSION, 'hearts-plan-1.0.0');
  for (const mode of ['spades-solo', 'spades-partners']) {
    assert.ok(!listReasoningProfiles(mode).includes(HEARTS_PLAN_POLICY_VERSION));
    assert.throws(() => getReasoningProfile(HEARTS_PLAN_POLICY_VERSION, mode), /No unique reasoning profile/);
  }
  const profile = getReasoningProfile(HEARTS_PLAN_POLICY_VERSION, 'hearts');
  assert.equal(profile, heartsPlanProfiles[0]);
  assert.equal(heartsPlanProfiles.length, 1);
  assert.deepEqual(profile.modes, ['hearts']);
  assert.equal(costOf(profile), 'bounded-search');
  assert.notEqual(getReasoningPack('hearts'), profile);
  assert.equal(getReasoningPack('hearts').policyVersion, 'hearts-baseline-1.0.0');
  const state = newGame(4_450_001, 'default');
  assert.equal(analyzeDecision(observe(state, 0)).policyVersion, 'hearts-baseline-1.0.0');
  assert.equal(analyzeDecision(observe(state, 0), HEARTS_PLAN_POLICY_VERSION).policyVersion, 'hearts-plan-1.0.0');
});

test('GP-06: the Hearts pass keeps the baseline ranking and is never searched', () => {
  const pack = createHeartsPlanningPack();
  let passes = 0;
  const { directions } = everyDecision(4_460_001, 8, 'pass', (observation) => {
    const baseline = chooseBaselineAction(observation);
    if (observation.phase !== 'pass') return baseline;
    passes++;
    const analysis = analyzeDecision(observation, HEARTS_PLAN_POLICY_VERSION);
    assert.equal(analysis.schemaVersion, '1.1.0');
    if (analysis.schemaVersion !== '1.1.0') throw new Error('Schema 1.1.0 was expected.');
    assert.deepEqual(analysis.action, baseline);
    assert.equal(analysis.plan.decisionKind, 'commitment');
    assert.equal(analysis.plan.stance.id, 'hearts.choose-pass');
    assert.deepEqual(analysis.plan.competing, []);
    assert.deepEqual(analysis.plan.estimates, []);
    assert.equal(analysis.search, undefined);
    assert.equal(analysis.decision.selectedBy, 'tactical-order');
    assert.equal(analysis.trace?.selectedBy, 'baseline');
    assert.deepEqual(analysis.decision.families, []);
    assert.ok(analysis.limitations.includes(SEALED_STEP_LIMITATION));
    assert.equal(analysis.candidates.length, 286);
    assert.equal(new Set(analysis.candidates.map((entry) => actionId(entry.action))).size, 286);
    assert.deepEqual(
      analysis.candidates.filter((entry) => entry.disposition === 'selected').map((entry) => entry.action),
      [baseline],
    );
    assert.ok(analysis.candidates.every((entry) => entry.evidence === 'heuristic'));
    assert.deepEqual(analysis.facts, getReasoningPack('hearts').analyze(observation).facts);
    // The plan contract has no sealed simultaneous step: the pack fails closed instead of searching 286 triples.
    assert.throws(() => pack.candidates(observation), /sealed simultaneous step is not supported/);
    assert.throws(() => pack.playout(observation), /sealed simultaneous step is not supported/);
    assert.throws(() => createHeartsPlayoutModel(observation), /sealed simultaneous step is not supported/);
    assert.throws(() => decide(pack, observation, HEARTS_PLAN_PROFILE.budget), /sealed simultaneous step/);
    return analysis.action;
  });
  assert.equal(passes, 6 * 4);
  assert.deepEqual([...directions].sort(), ['across', 'hold', 'left', 'right']);
});

test('GP-05: Hearts play decisions reach selection through the shared orchestrator', () => {
  const pack = createHeartsPlanningPack();
  const selectedBy = new Set<string>();
  let forced = 0,
    unforced = 0,
    changed = 0;
  const { states } = everyDecision(4_500_001, 3, 'decide', (observation, where) => {
    if (observation.phase === 'pass') return chooseBaselineAction(observation);
    const analysis = analyzeDecision(observation, HEARTS_PLAN_POLICY_VERSION);
    if (analysis.schemaVersion !== '1.1.0') throw new Error('Schema 1.1.0 was expected.');
    const legal = observation.legalActions.map(actionId);
    assert.equal(analysis.policyVersion, HEARTS_PLAN_POLICY_VERSION);
    assert.ok(legal.includes(actionId(analysis.action)), where);
    assert.deepEqual(analysis.candidates.map((entry) => actionId(entry.action)).sort(), [...legal].sort());
    assert.equal(analysis.candidates.filter((entry) => entry.disposition === 'selected').length, 1);
    assert.equal(actionId(analysis.candidates[0].action), actionId(analysis.action));
    // The facts field reuses the existing fact builder, exactly as the live Hearts pack does.
    assert.deepEqual(analysis.facts, getReasoningPack('hearts').analyze(observation).facts);
    assert.deepEqual(readSavedAnalysis(JSON.parse(JSON.stringify(analysis))), JSON.parse(JSON.stringify(analysis)));
    assert.equal(analysis.plan.decisionKind, 'play');
    assert.deepEqual(analysis.plan.teammates, []);
    assert.ok(analysis.plan.goals.every((goal) => goal.beneficiary === 'self'));
    for (const reason of analysis.reasons) assert.ok(Array.isArray(reason.claims), reason.id);
    selectedBy.add(analysis.decision.selectedBy);
    if (legal.length === 1) {
      forced++;
      assert.equal(analysis.provenance, 'forced');
      assert.equal(analysis.decision.selectedBy, 'forced');
      assert.equal(analysis.search, undefined);
      return analysis.action;
    }
    unforced++;
    if (actionId(analysis.action) !== actionId(chooseBaselineAction(observation))) changed++;
    // The profile adds nothing of its own to selection: the shared orchestrator gives the same decision.
    const decision = decide(pack, observation, HEARTS_PLAN_PROFILE.budget, HEARTS_PLAN_PROFILE.selection);
    assert.equal(decision.selectedId, actionId(analysis.action), where);
    assert.equal(decision.selectedBy, analysis.decision.selectedBy);
    assert.equal(decision.stanceId, analysis.decision.stanceId);
    assert.deepEqual(decision.comparableIds, analysis.decision.comparableActionIds);
    assert.deepEqual(decision.search ?? undefined, analysis.search);
    assert.deepEqual(pack.candidates(observation).map((entry) => entry.id).sort(), [...legal].sort());
    assert.equal(pack.candidates(observation)[0].id, actionId(chooseBaselineAction(observation)));
    if (analysis.search) {
      const search = analysis.search;
      assert.equal(search.modelId, 'hearts-playout-model');
      assert.equal(search.status, 'completed');
      assert.equal(search.worldsUsed, HEARTS_PLAN_PROFILE.budget.maxWorlds);
      assert.ok(search.steps <= HEARTS_PLAN_PROFILE.budget.maxSteps);
      assert.equal(search.seed, hashText(`${pack.id}|${heartsObservationKey(observation)}`));
      assert.match(search.allocationModel, /uniform-constraint-counting-1\.0\.0/);
      assert.equal(search.continuationPolicy, 'hearts-playout-1.0.0');
      assert.ok(analysis.candidates.some((entry) => entry.evidence === 'sampled-estimate'));
      // GP-03: every estimate names its event, assumptions and population, and is marked uncalibrated.
      assert.ok(analysis.plan.estimates.length > 0);
      for (const estimate of analysis.plan.estimates) {
        assert.equal(estimate.calibrated, false);
        assert.equal(estimate.information, 'seat-observation');
        assert.equal(estimate.evidence, 'sampled-estimate');
        assert.equal(estimate.horizon, 'round');
        assert.equal(estimate.allocationModel, search.allocationModel);
        assert.equal(estimate.continuationPolicy, search.continuationPolicy);
        assert.equal(estimate.worlds, search.worldsUsed);
        assert.equal(estimate.seed, search.seed);
        assert.ok(estimate.event.length > 0 && estimate.unit.length > 0 && estimate.population.length > 0);
        if (estimate.kind === 'frequency') assert.ok(estimate.value >= 0 && estimate.value <= 1);
      }
    } else assert.equal(analysis.decision.selectedBy, 'tactical-order');
    if (unforced % 5 === 0) {
      // Same observation, same analysis: no clock, no shared random stream, no presentation text.
      assert.deepEqual(analyzeDecision(structuredClone(observation), HEARTS_PLAN_POLICY_VERSION), analysis);
      assert.deepEqual(analyzeDecision({ ...observation, events: [] }, HEARTS_PLAN_POLICY_VERSION), analysis);
    }
    return analysis.action;
  });
  for (const state of states) assertConserved(state.handResult!.points, state.id);
  assert.ok(forced > 0 && unforced > 100);
  assert.ok(changed > 0, 'the profile is behaviourally distinct from the baseline');
  assert.ok(selectedBy.has('search') && selectedBy.has('forced'));
  // A budget too small for one world falls back to the tactical order and says so.
  let starved = 0;
  everyDecision(4_510_001, 1, 'fallback', (observation) => {
    const baseline = chooseBaselineAction(observation);
    if (observation.phase === 'pass' || observation.legalActions.length < 2) return baseline;
    if (!decide(pack, observation, HEARTS_PLAN_PROFILE.budget).search || starved >= 5) return baseline;
    const budget: DecisionBudget = { ...HEARTS_PLAN_PROFILE.budget, maxSteps: 1 };
    const fallback = decide(pack, observation, budget);
    assert.equal(fallback.selectedBy, 'tactical-fallback');
    assert.equal(fallback.selectedId, actionId(baseline));
    assert.equal(fallback.search?.status, 'unavailable');
    assert.equal(fallback.limitations.length, 1);
    starved++;
    return baseline;
  });
  assert.equal(starved, 5);
});

test('GP-04: a Hearts decision depends on the seat observation, never on the concealed deal', () => {
  let state = newGame(4_520_001, 'concealed');
  assert.throws(() => createHeartsPlayoutModel(observe(state, 0)), /sealed simultaneous step/);
  state = apply(state, { kind: 'pass-bundle', passes: baselinePasses(state) });
  let compared = 0,
    analysed = 0,
    otherDeals = 0,
    distinctSamples = 0;
  while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
    if (state.phase === 'trick-end') {
      state = collectTrick(state);
      continue;
    }
    const seat = state.turn!;
    const observation = observe(state, seat);
    if (observation.legalActions.length > 1) {
      const where = `${state.history.length}/${state.trick.length}`;
      // Another deal that fits this seat's view gives the same observation, so nothing downstream can differ.
      const hands = createWorldSampler(observation).draw(hashText(`concealed/${where}`));
      const other: PrivateGame = { ...state, hands };
      // Late in a hand the public play can leave a single deal that fits.
      if (JSON.stringify(other.hands) !== JSON.stringify(state.hands)) otherDeals++;
      assert.deepEqual(observe(other, seat), observation, where);
      if (compared % 6 === 0) {
        analysed++;
        assert.deepEqual(
          analyzeDecision(observe(other, seat), HEARTS_PLAN_POLICY_VERSION),
          analyzeDecision(observation, HEARTS_PLAN_POLICY_VERSION),
          where,
        );
      }
      // Sampled worlds keep this seat's cards and the cards it passed; the model never receives the deal.
      const model = createHeartsPlayoutModel(observation);
      const first = model.sample(7)!;
      const second = model.sample(8)!;
      const own = (world: HeartsWorld) => [...world.hands.slice(seat * 4, seat * 4 + 4)];
      assert.deepEqual(own(first.world), own(observationWorld(observation)), where);
      assert.deepEqual(own(second.world), own(first.world), where);
      if (snapshot(second.world) !== snapshot(first.world)) distinctSamples++;
      assert.equal(snapshot(model.sample(7)!.world), snapshot(first.world), where);
      assert.equal(first.weight, 1);
      for (const known of observation.knownHoldings) {
        const index = cardIndex(known.card);
        for (const sampled of [first, second])
          assert.ok(sampled.world.hands[known.seat * 4 + Math.floor(index / 13)] & (1 << (index % 13)), where);
      }
      for (const sampled of [first, second]) {
        const world = cloneWorld(sampled.world);
        while (model.actor(world) !== null) model.apply(world, model.defaultMove(world));
        assertConserved(scoreWorld(world).points, where);
        assert.ok(Number.isFinite(model.utility(world)));
        assert.ok(Object.values(model.events(world)).every((value) => value === 0 || value === 1));
      }
      compared++;
    }
    state = apply(state, playCard(chooseBaselineAction(observation)));
  }
  assert.ok(compared > 30 && analysed > 5);
  assert.ok(otherDeals > 25 && distinctSamples > 25);
});

test('GP-05: the Hearts pack reaches playouts only through the shared orchestrator', () => {
  const folder = new URL('../games/hearts/plan/', import.meta.url);
  const files = readdirSync(folder).filter((name) => name.endsWith('.ts'));
  assert.deepEqual([...files].sort(), [
    'kernel.ts', 'model.ts', 'pack.ts', 'planner.ts', 'policy.ts', 'profiles.ts', 'stance.ts',
  ]);
  for (const name of files) {
    const source = readFileSync(new URL(name, folder), 'utf8');
    assert.doesNotMatch(source, /plan\/evaluate\.ts/, `${name} runs playouts outside the orchestrator`);
    assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|new Date/, `${name} reads a clock or Math.random`);
    assert.doesNotMatch(source, /\+\s*2\)\s*%\s*4/, `${name} infers a seat by arithmetic`);
    assert.doesNotMatch(source, /games\/spades\//, `${name} imports the Spades pack`);
  }
  const contract = /import \{[^}]*\bdecide\b[^}]*\} from '\.\.\/\.\.\/\.\.\/strategy\/plan\/contract\.ts'/;
  assert.match(readFileSync(new URL('profiles.ts', folder), 'utf8'), contract);
  assert.match(readFileSync(new URL('../games/spades/plan/profiles.ts', import.meta.url), 'utf8'), contract);
});

/**
 * Exploratory only. Forty hands cannot separate two policies, the opponents are one weak
 * baseline, and nothing here is a gate result or a claim of strength.
 */
function exploratoryComparison(hands: number) {
  const focalOf = (where: string) => (Number(where.split('/')[0]) % 4) as Seat;
  const arm = (label: string, profile: boolean) =>
    everyDecision(4_600_001, hands, label, (observation, where) =>
      profile && observation.seat === focalOf(where)
        ? analyzeDecision(observation, HEARTS_PLAN_POLICY_VERSION).action
        : chooseBaselineAction(observation),
    ).states;
  const candidate = arm('explore-profile', true);
  const reference = arm('explore-baseline', false);
  const margin = (state: PrivateGame, seat: Seat) => {
    const points = state.handResult!.points;
    return (points.reduce((sum, value) => sum + value, 0) - points[seat]) / 3 - points[seat];
  };
  let difference = 0;
  candidate.forEach((state, index) => {
    const seat = (Number(state.id.split('-').at(-1)) % 4) as Seat;
    // Hands after the first of a game start from different scores in the two arms; only the deal is shared.
    difference += margin(state, seat) - margin(reference[index], seat);
  });
  return { candidate, reference, meanMarginDifference: difference / hands };
}

test('GP-06: exploratory Hearts comparison keeps every action legal and every hand at 26 points', (t) => {
  const result = exploratoryComparison(40);
  assert.equal(result.candidate.length, 40);
  assert.equal(result.reference.length, 40);
  for (const state of [...result.candidate, ...result.reference]) {
    assert.equal(state.history.length, 13);
    assertConserved(state.handResult!.points, state.id);
  }
  assert.ok(Number.isFinite(result.meanMarginDifference));
  t.diagnostic(
    `exploratory, not a strength result: hearts-plan-1.0.0 in one seat against hearts-baseline-1.0.0 in three, ` +
      `40 hands, mean margin difference ${result.meanMarginDifference.toFixed(2)} points per hand`,
  );
});
