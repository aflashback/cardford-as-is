import assert from 'node:assert/strict';
import test from 'node:test';
import {
  actionId,
  apply,
  collectTrick,
  createGame,
  fullDeck,
  legalActions,
  sorted,
  type Card,
  type Four,
  type PrivateGame,
  type Seat,
} from '../game/index.ts';
import { competitionFor, competitorOf, opposingCompetitors, teammatesOf } from '../game/kernel/competition.ts';
import { scoreCompetitor } from '../game/spades/score.ts';
import { observe, type SeatObservation } from '../observations/index.ts';
import { evaluateCandidates } from '../strategy/plan/evaluate.ts';
import { createRandom, shuffled } from '../strategy/plan/random.ts';
import { SAMPLER_VERSION } from '../strategy/sampler.ts';
import {
  PHASE_DONE,
  SPADES_KERNEL_VERSION,
  actionIdOfMove,
  cardIndex,
  cardName,
  emptyWorld,
  moveFromAction,
  rankOf,
  suitOf,
  worldFromState,
  type SpadesWorld,
} from '../games/spades/playout/kernel.ts';
import {
  BID_CONSISTENCY_VERSION,
  DEFAULT_SPADES_OBJECTIVE,
  SPADES_OBJECTIVE_VERSION,
  SPADES_PLAYOUT_EVENTS,
  createSpadesPlayoutModel,
  spadesObjectiveId,
  type SpadesModelOptions,
  type SpadesObjective,
} from '../games/spades/playout/model.ts';
import { estimateTricks, playoutMove } from '../games/spades/playout/policy.ts';
import { bidAll, playSequence, spadesDeal, type SpadesMode } from './support/spades-fixtures.ts';

const SEATS: Seat[] = [0, 1, 2, 3];
const MODES: SpadesMode[] = ['spades-solo', 'spades-partners'];
const WEIGHTINGS = ['uniform', 'bid-consistency'] as const;
type Style = 'policy' | 'random' | 'wild';
const mateFor = (mode: string) => SEATS.map((seat) => teammatesOf(competitionFor(mode), seat)[0] ?? -1);

const dealt = (mode: SpadesMode, seed: number): PrivateGame =>
  createGame(
    { id: `model-${mode}-${seed}`, mode, dealer: (seed % 4) as Seat },
    shuffled(fullDeck(), createRandom(seed)),
  );
/**
 * Every position is reached through the production engine. `policy` follows the playout
 * continuation, `random` plays seeded random legal cards, `wild` also bids at random.
 */
function reach(
  mode: SpadesMode,
  seed: number,
  style: Style,
  stop: (state: PrivateGame) => boolean,
  from: PrivateGame = dealt(mode, seed),
): PrivateGame | null {
  const random = createRandom(seed, 13);
  let state = from;
  for (let guard = 0; guard < 120; guard++) {
    if (stop(state)) return state;
    if (state.phase === 'trick-end') {
      state = collectTrick(state);
      continue;
    }
    if (state.phase !== 'bid' && state.phase !== 'play') return null;
    const actions = legalActions(state, state.turn!);
    const free = state.phase === 'play' ? style !== 'policy' : style === 'wild';
    const chosen = free
      ? actions[random.below(actions.length)]
      : actions.find(
          (entry) => actionId(entry) === actionIdOfMove(playoutMove(worldFromState(state, mateFor(mode)))),
        );
    if (!chosen || chosen.kind === 'pass') throw new Error('No legal continuation.');
    state = apply(state, chosen);
  }
  return null;
}
const playing =
  (tricks: number, cards: number, choices = 1) =>
  (state: PrivateGame) =>
    state.phase === 'play' &&
    state.history.length === tricks &&
    state.trick.length === cards &&
    legalActions(state, state.turn!).length >= choices;
const bidding = (placed: number) => (state: PrivateGame) =>
  state.phase === 'bid' && state.bids.filter((bid) => bid !== null).length === placed;

const publicPlays = (observation: SeatObservation) => [
  ...observation.history.flatMap((trick) => trick.plays),
  ...observation.trick,
];

/** Written from the rules, not from the kernel: failing to follow, and an unbroken spade lead. */
function publicVoids(observation: SeatObservation): Set<string>[] {
  const voids = SEATS.map(() => new Set<string>());
  let broken = false;
  for (const plays of [...observation.history.map((trick) => trick.plays), observation.trick]) {
    if (!plays.length) continue;
    const led = plays[0].card[0];
    if (led === 'S' && !broken) for (const suit of ['C', 'D', 'H']) voids[plays[0].seat].add(suit);
    for (const play of plays) {
      if (play.card[0] !== led) voids[play.seat].add(led);
      if (play.card[0] === 'S') broken = true;
    }
  }
  return voids;
}

function cardsOf(world: SpadesWorld, seat: number): Card[] {
  const cards: Card[] = [];
  for (let suit = 0; suit < 4; suit++)
    for (let rank = 0; rank < 13; rank++)
      if (world.hands[seat * 4 + suit] & (1 << rank)) cards.push(cardName(suit * 13 + rank));
  return cards;
}
const worldKey = (world: SpadesWorld) => [...world.hands].join(',');

function assertConsistent(observation: SeatObservation, world: SpadesWorld, label: string): void {
  const played = new Set(publicPlays(observation).map((play) => play.card));
  const voids = publicVoids(observation);
  const held = new Set<Card>();
  for (const seat of SEATS) {
    const hand = cardsOf(world, seat);
    assert.equal(hand.length, observation.handSizes[seat], `${label}: hand size of seat ${seat}`);
    if (seat === observation.seat) assert.deepEqual(hand, sorted(observation.hand), `${label}: own hand`);
    for (const card of hand) {
      assert.ok(!played.has(card), `${label}: ${card} was already played`);
      assert.ok(!held.has(card), `${label}: ${card} is held twice`);
      assert.ok(!voids[seat].has(card[0]), `${label}: seat ${seat} is publicly void but holds ${card}`);
      held.add(card);
    }
  }
  assert.equal(held.size + played.size, 52, `${label}: all 52 cards are accounted for`);
  assert.equal(world.turn, observation.seat, `${label}: acting seat`);
  assert.deepEqual([...world.bids], observation.bids.map((bid) => bid ?? -1), `${label}: bids`);
  assert.deepEqual([...world.tricks], observation.tricks, `${label}: tricks`);
  assert.deepEqual([...world.scores], observation.scores, `${label}: scores`);
  assert.deepEqual([...world.bags], observation.bags, `${label}: bags`);
  assert.equal(world.completed, observation.history.length, `${label}: completed tricks`);
  assert.deepEqual(
    [...world.trickCard].slice(0, world.trickLen).map(cardName),
    observation.trick.map((play) => play.card),
    `${label}: current trick`,
  );
}

/** Every assignment of the concealed cards that the public facts allow. */
function enumerateWorlds(observation: SeatObservation): SpadesWorld[] {
  const seen = new Set([...publicPlays(observation).map((play) => play.card), ...observation.hand]);
  const concealed = fullDeck().filter((card) => !seen.has(card));
  const voids = publicVoids(observation);
  const others = SEATS.filter((seat) => seat !== observation.seat);
  const hands = SEATS.map((seat) => (seat === observation.seat ? [...observation.hand] : [])) as Four<Card[]>;
  const worlds: SpadesWorld[] = [];
  const place = (index: number) => {
    if (index === concealed.length) {
      worlds.push(
        worldFromState(
          {
            mode: observation.mode, phase: observation.phase, hands,
            bids: observation.bids as Four<number | null>, tricks: observation.tricks as Four<number>,
            scores: observation.scores as Four<number>, bags: observation.bags as Four<number>,
            dealer: observation.dealer, history: observation.history, trick: observation.trick,
            turn: observation.turn,
          },
          mateFor(observation.mode),
        ),
      );
      return;
    }
    const card = concealed[index];
    for (const seat of others) {
      if (hands[seat].length >= observation.handSizes[seat] || voids[seat].has(card[0])) continue;
      hands[seat].push(card);
      place(index + 1);
      hands[seat].pop();
    }
  };
  place(0);
  return worlds;
}

/** The declared bid likelihood, restated here so that the model is checked against its declaration. */
const BID_SPREAD = 1.5;
const WEIGHT_FLOOR = 1e-6;
function declaredWeight(
  observation: SeatObservation,
  world: SpadesWorld,
  weighting: (typeof WEIGHTINGS)[number],
  spread = BID_SPREAD,
): number {
  if (weighting === 'uniform') return 1;
  const original = new Uint16Array(16);
  let weight = 1;
  for (const seat of SEATS) {
    const bid = observation.bids[seat];
    if (seat === observation.seat || bid === null) continue;
    // The hand the seat bid on: what it holds now and what it has played.
    for (let suit = 0; suit < 4; suit++) original[seat * 4 + suit] = world.hands[seat * 4 + suit];
    for (const play of publicPlays(observation))
      if (play.seat === seat) original[seat * 4 + suitOf(cardIndex(play.card))] |= 1 << rankOf(cardIndex(play.card));
    const distance = (bid - estimateTricks(original, seat)) / spread;
    weight *= Math.exp(-0.5 * distance * distance);
  }
  return Math.max(weight, WEIGHT_FLOOR);
}

type Spot = { label: string; observation: SeatObservation };
function spot(mode: SpadesMode, seed: number, style: Style, stop: (state: PrivateGame) => boolean, label: string): Spot | null {
  const state = reach(mode, seed, style, stop);
  return state ? { label: `${mode}/${style}/${seed} ${label}`, observation: observe(state, state.turn!) } : null;
}

const STAGES: [string, (state: PrivateGame) => boolean][] = [
  ['bid, none placed', bidding(0)],
  ['bid, one placed', bidding(1)],
  ['bid, three placed', bidding(3)],
  ['first lead', playing(0, 0)],
  ['first trick, fourth card', playing(0, 3)],
  ['third trick, second card', playing(2, 1)],
  ['sixth trick, lead', playing(5, 0)],
  ['seventh trick, third card', playing(6, 2)],
  ['ninth trick, fourth card', playing(8, 3)],
  ['eleventh trick, lead', playing(10, 0)],
  ['twelfth trick, second card', playing(11, 1)],
  ['last trick, third card', playing(12, 2)],
];
function stagedSpots(): Spot[] {
  const spots: Spot[] = [];
  let seed = 8_100_001;
  for (const mode of MODES)
    for (const style of ['policy', 'random', 'wild'] as const)
      for (const [label, stop] of STAGES) {
        const found = spot(mode, seed++, style, stop, label);
        if (!found) throw new Error(`Stage not reached: ${mode}/${style} ${label}`);
        spots.push(found);
      }
  return spots;
}

/** Seat 0 cashes three aces and must then lead a spade before spades are broken. */
function unbrokenSpadeLead(mode: SpadesMode): PrivateGame {
  return playSequence(
    bidAll(
      spadesDeal(
        [
          ['S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'SJ', 'CA', 'DA', 'HA'],
          ['SQ', 'SK', 'C2', 'D2', 'H2'],
          ['SA', 'C3', 'D3', 'H3'],
          ['C4', 'D4', 'H4'],
        ],
        mode,
      ),
      [6, 2, 2, 1],
    ),
    ['CA', 'C2', 'C3', 'C4', 'DA', 'D2', 'D3', 'D4', 'HA', 'H2', 'H3', 'H4', 'S2'],
  );
}

/** Endings with at most three cards per seat, a real choice and real uncertainty. */
function endings(
  base: number,
  perGroup: number,
  minimumWorlds: number,
  maximumWorlds = 1680,
): (Spot & { worlds: SpadesWorld[] })[] {
  const found: (Spot & { worlds: SpadesWorld[] })[] = [];
  let group = 0;
  for (const mode of MODES)
    for (const style of ['policy', 'random'] as const) {
      let kept = 0;
      // Each mode and style reads its own deals.
      const first = base + 100 * group++;
      for (let seed = first; kept < perGroup && seed < first + 100; seed++) {
        const left = 2 + (seed % 2);
        const entry = spot(mode, seed, style, playing(13 - left, seed % 4, 2), `ending, ${left} cards, ${seed % 4} played`);
        if (!entry) continue;
        const worlds = enumerateWorlds(entry.observation);
        if (worlds.length < minimumWorlds || worlds.length > maximumWorlds) continue;
        found.push({ ...entry, worlds });
        kept++;
      }
      assert.equal(kept, perGroup, `not enough endings for ${mode}/${style}`);
    }
  return found;
}

/** Nil bids by the acting seat, by its teammate or neighbour, and by both sides. */
function nilSpots(): Spot[] {
  const spots: Spot[] = [];
  const patterns: Four<number>[] = [
    [0, 3, 4, 3],
    [4, 3, 0, 3],
    [3, 0, 4, 3],
    [0, 4, 0, 4],
    [4, 0, 4, 0],
  ];
  for (const mode of MODES)
    patterns.forEach((bids, at) => {
      for (const seed of [8_600_001 + at, 8_600_011 + at, 8_600_022 + at]) {
        const state = bidAll(dealt(mode, seed), bids);
        spots.push({ label: `${mode}/${seed} bids ${bids.join('-')}`, observation: observe(state, state.turn!) });
      }
    });
  return spots;
}

/**
 * Hands late in a match. Score and bags are set before the bidding starts, as the kernel
 * parity test does, so that the ten-bag line and the match target are within reach.
 */
function carriedSpots(): Spot[] {
  const spots: Spot[] = [];
  for (const mode of MODES)
    for (let seed = 8_700_001; seed <= 8_700_012; seed++) {
      const start = dealt(mode, seed);
      const partners = mode === 'spades-partners';
      start.scores = partners ? [450, 440, 450, 440] : [450, 440, 430, 445];
      start.bags = partners ? [9, 8, 9, 8] : [9, 8, 9, 7];
      const state = reach(mode, seed, seed % 2 ? 'policy' : 'random', playing(seed % 3, seed % 4), start);
      assert.ok(state);
      spots.push({ label: `${mode}/${seed} late in a match`, observation: observe(state, state.turn!) });
    }
  return spots;
}

const SPOTS = stagedSpots();

test('GP-04: every sampled world is consistent with the seat observation on both sampling paths', () => {
  let samples = 0,
    voided = 0;
  for (const { label, observation } of SPOTS) {
    const before = structuredClone(observation);
    if (publicVoids(observation).some((suits) => suits.size)) voided++;
    for (const weighting of WEIGHTINGS)
      for (const rejectionTries of [undefined, 0]) {
        const options: SpadesModelOptions = { weighting, ...(rejectionTries === undefined ? {} : { rejectionTries }) };
        const model = createSpadesPlayoutModel(observation, options);
        for (let seed = 0; seed < 24; seed++) {
          const sampled = model.sample(Math.imul(seed, 0x9e3779b1) >>> 0);
          assert.ok(sampled, `${label}: no world for seed ${seed}`);
          assertConsistent(observation, sampled.world, `${label} (${weighting}, tries ${rejectionTries ?? 'default'})`);
          samples++;
        }
        if (rejectionTries === 0) assert.equal(model.diagnostics.rejectionFallbacks, 24, `${label}: exact path`);
      }
    assert.deepEqual(observation, before, `${label}: observation mutated`);
  }
  assert.equal(samples, SPOTS.length * 96);
  assert.ok(voided >= 24, 'positions with public voids are present');
});

test('GP-04: an unbroken spade lead keeps every side-suit card out of the hand sampled for the leader', () => {
  for (const mode of MODES) {
    let state = unbrokenSpadeLead(mode);
    assert.equal(state.spadesBroken, true);
    assert.equal(state.history.length, 3);
    // Seat 1, seat 2 and seat 3 act in the spade trick; seat 2 then leads the next one.
    for (const card of ['SQ', 'SA', 'DK', null]) {
      if (state.phase === 'trick-end') state = collectTrick(state);
      const observation = observe(state, state.turn!);
      assert.ok(publicVoids(observation)[0].size === 3, 'the inference is public');
      for (const weighting of WEIGHTINGS) {
        const model = createSpadesPlayoutModel(observation, { weighting });
        for (let seed = 0; seed < 32; seed++) {
          const sampled = model.sample(seed);
          assert.ok(sampled);
          assertConsistent(observation, sampled.world, `${mode} unbroken lead`);
          assert.ok(cardsOf(sampled.world, 0).every((held) => held[0] === 'S'));
        }
        // Rejection cannot satisfy a nine-card all-spade hand; the exact sampler supplies the worlds.
        assert.equal(model.diagnostics.rejectionFallbacks, 32);
      }
      if (card) state = apply(state, { kind: 'play', seat: state.turn!, card });
    }
  }
});

const chiSquareCeiling = (cells: number) => cells - 1 + 4 * Math.sqrt(2 * (cells - 1));

test('GP-04: rejection and exact sampling agree with the uniform reference on enumerated endings', (t) => {
  const cases = endings(8_300_001, 3, 10, 700);
  let constrained = 0;
  for (const { label, observation, worlds } of cases) {
    const support = new Map(worlds.map((world) => [worldKey(world), 0]));
    assert.equal(support.size, worlds.length, `${label}: enumerated worlds are distinct`);
    if (publicVoids(observation).some((suits, seat) => seat !== observation.seat && suits.size)) constrained++;
    const draws = Math.max(4000, 40 * worlds.length);
    const expected = draws / worlds.length;
    const tally = (rejectionTries: number) => {
      const model = createSpadesPlayoutModel(observation, { weighting: 'uniform', rejectionTries });
      const counts = new Map(support);
      for (let seed = 0; seed < draws; seed++) {
        const sampled = model.sample(seed);
        assert.ok(sampled, `${label}: no world for seed ${seed}`);
        const key = worldKey(sampled.world);
        assert.ok(counts.has(key), `${label}: sampled world is outside the enumerated support`);
        counts.set(key, counts.get(key)! + 1);
      }
      return { counts, fallbacks: model.diagnostics.rejectionFallbacks };
    };
    const rejection = tally(100_000);
    const exact = tally(0);
    assert.equal(rejection.fallbacks, 0, `${label}: rejection path only`);
    assert.equal(exact.fallbacks, draws, `${label}: exact path only`);
    let rejectionFit = 0,
      exactFit = 0,
      homogeneity = 0;
    for (const key of support.keys()) {
      const a = rejection.counts.get(key)!,
        b = exact.counts.get(key)!;
      assert.ok(a > 0 && b > 0, `${label}: a feasible world was never drawn`);
      rejectionFit += (a - expected) ** 2 / expected;
      exactFit += (b - expected) ** 2 / expected;
      homogeneity += (a - b) ** 2 / (a + b);
    }
    const ceiling = chiSquareCeiling(worlds.length);
    const context = `${label}: ${worlds.length} worlds, ${draws} draws per path, seeds 0..${draws - 1}, ceiling ${ceiling.toFixed(1)}`;
    assert.ok(rejectionFit < ceiling, `rejection against uniform ${rejectionFit.toFixed(1)}; ${context}`);
    assert.ok(exactFit < ceiling, `exact against uniform ${exactFit.toFixed(1)}; ${context}`);
    assert.ok(homogeneity < ceiling, `rejection against exact ${homogeneity.toFixed(1)}; ${context}`);
    t.diagnostic(
      `${context}: rejection ${rejectionFit.toFixed(1)}, exact ${exactFit.toFixed(1)}, between paths ${homogeneity.toFixed(1)}`,
    );
  }
  assert.ok(constrained >= 3, 'endings with public voids are present');
  assert.ok(cases.filter((entry) => entry.worlds.length >= 100).length >= 3, 'larger supports are present');
});

/**
 * The two allocation models of the requirement, and the weighted one again with a sharper
 * likelihood. In a three-card ending the default spread moves the weights very little; the
 * sharper arm is where a sample that ignored its weights would be caught.
 */
const ARMS: { name: string; weighting: (typeof WEIGHTINGS)[number]; spread: number }[] = [
  { name: 'uniform', weighting: 'uniform', spread: BID_SPREAD },
  { name: 'bid-consistency', weighting: 'bid-consistency', spread: BID_SPREAD },
  { name: 'bid-consistency, spread 0.5', weighting: 'bid-consistency', spread: 0.5 },
];

test('GP-03: sampled event frequencies and paired differences match the exact reference within 4 standard errors', (t) => {
  const cases = endings(8_200_001, 4, 12);
  const budget = { worlds: 256, maxSteps: 400_000 };
  const rounding = 1e-9;
  let informativeEvents = 0,
    informativeDifferences = 0,
    comparisons = 0,
    largest = 0,
    weightsMatter = 0;
  for (const [index, { label, observation, worlds }] of cases.entries()) {
    assert.ok(observation.handSizes.every((size) => size <= 3));
    assert.ok(worlds.length <= 1680);
    const candidates = observation.legalActions.map((action) => {
      if (action.kind === 'pass') throw new Error('Spades has no pass.');
      return moveFromAction(action);
    });
    let unweighted: number[] = [];
    for (const { name, weighting, spread } of ARMS) {
      const model = createSpadesPlayoutModel(observation, { weighting, bidSpread: spread });
      const seed = 9_000_001 + index;
      const summary = evaluateCandidates(model, candidates, budget, seed);
      const context = `${label}, ${name}, seed ${seed}, ${worlds.length} feasible worlds`;
      assert.equal(summary.status, 'completed', context);
      assert.equal(summary.worldsUsed, 256, context);

      // Exact reference: every feasible world, the same continuation, the same weights.
      let total = 0;
      const utility = candidates.map(() => 0);
      const events = candidates.map(() => new Map<string, number>());
      for (const world of worlds) {
        const weight = declaredWeight(observation, world, weighting, spread);
        total += weight;
        candidates.forEach((candidate, at) => {
          const line = model.clone(world);
          model.apply(line, candidate);
          while (model.actor(line) !== null) model.apply(line, model.defaultMove(line));
          utility[at] += weight * model.utility(line);
          for (const [name, value] of Object.entries(model.events(line)))
            events[at].set(name, (events[at].get(name) ?? 0) + weight * value);
        });
      }
      const leader = summary.candidates.findIndex((entry) => entry.moveId === summary.leaderId);
      assert.ok(leader >= 0);
      if (weighting === 'uniform') unweighted = utility.map((value) => value / total);
      summary.candidates.forEach((entry, at) => {
        assert.equal(entry.moveId, actionIdOfMove(candidates[at]));
        // `rounding` covers sums over 256 weighted worlds against sums over the enumeration.
        const exactDifference = (utility[leader] - utility[at]) / total;
        if (
          weighting !== 'uniform' &&
          Math.abs(entry.behindLeader - (unweighted[leader] - unweighted[at])) >
            4 * entry.behindLeaderStandardError! + rounding
        )
          weightsMatter++;
        const reported = entry.behindLeaderStandardError;
        assert.notEqual(reported, null, context);
        const gap = Math.abs(entry.behindLeader - exactDifference);
        assert.ok(
          gap <= 4 * reported! + rounding,
          `${context}: ${entry.moveId} is ${entry.behindLeader} behind ${summary.leaderId}, exact ${exactDifference}, standard error ${reported}`,
        );
        comparisons++;
        if (reported! > 0) {
          informativeDifferences++;
          largest = Math.max(largest, gap / reported!);
        }
        assert.deepEqual(Object.keys(entry.events).sort(), [...events[at].keys()].sort(), context);
        for (const [name, frequency] of Object.entries(entry.events)) {
          const exact = events[at].get(name)! / total;
          // The standard error reported with a plan estimate of a frequency.
          const error = Math.sqrt((frequency * (1 - frequency)) / summary.effectiveWorlds);
          const miss = Math.abs(frequency - exact);
          assert.ok(
            miss <= 4 * error + rounding,
            `${context}: ${entry.moveId} ${name} sampled ${frequency}, exact ${exact}, standard error ${error}`,
          );
          comparisons++;
          if (error > 0) {
            informativeEvents++;
            largest = Math.max(largest, miss / error);
          }
        }
      });
    }
  }
  // The reference is not vacuous: many compared quantities really vary across worlds.
  assert.ok(comparisons >= 1200, `${comparisons} comparisons`);
  assert.ok(informativeEvents >= 60, `${informativeEvents} event frequencies strictly between 0 and 1`);
  assert.ok(informativeDifferences >= 24, `${informativeDifferences} paired differences with spread`);
  assert.ok(largest <= 4);
  // The unweighted reference is rejected for weighted samples somewhere, so the weights are in force.
  assert.ok(weightsMatter >= 1, 'no weighted sample is told apart from the unweighted reference');
  t.diagnostic(
    `${cases.length} endings x ${ARMS.length} allocation arms, 256 worlds each: ${comparisons} comparisons, ` +
      `${informativeEvents} frequencies and ${informativeDifferences} paired differences with spread, ` +
      `largest miss ${largest.toFixed(2)} standard errors; ` +
      `${weightsMatter} weighted differences lie more than 4 standard errors from the unweighted reference`,
  );
});

test('GP-03: every reported event is declared, is 0 or 1, and respects its condition', (t) => {
  const ids = SPADES_PLAYOUT_EVENTS.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of SPADES_PLAYOUT_EVENTS) {
    assert.match(entry.id, /^[a-z][A-Za-z]+$/);
    assert.ok(entry.event.length > 20 && entry.event.endsWith('.'), `${entry.id}: authored definition`);
    assert.equal(entry.horizon, 'round');
    assert.equal(entry.information, 'seat-observation');
    if (entry.appliesWhen !== null) {
      assert.equal(entry.role, 'outcome');
      const condition = SPADES_PLAYOUT_EVENTS.find((other) => other.id === entry.appliesWhen);
      assert.equal(condition?.role, 'condition', `${entry.id}: condition is declared`);
    }
  }
  const seen = new Map(ids.map((id) => [id, new Set<number>()]));
  let hands = 0;
  const spots = [...SPOTS, ...nilSpots(), ...carriedSpots()];
  for (const { label, observation } of spots) {
    const model = createSpadesPlayoutModel(observation);
    for (let seed = 0; seed < 6; seed++) {
      const sampled = model.sample(seed);
      assert.ok(sampled);
      const world = sampled.world;
      while (model.actor(world) !== null) model.apply(world, model.defaultMove(world));
      const events = model.events(world);
      assert.deepEqual(Object.keys(events).sort(), [...ids].sort(), `${label}: declared events only, all reported`);
      for (const [name, value] of Object.entries(events)) {
        assert.ok(value === 0 || value === 1, `${label}: ${name} is ${value}`);
        seen.get(name)!.add(value);
      }
      for (const entry of SPADES_PLAYOUT_EVENTS)
        if (entry.appliesWhen !== null)
          assert.ok(events[entry.id] <= events[entry.appliesWhen], `${label}: ${entry.id} without its condition`);
      assert.ok(events.matchWon + events.matchLost <= 1);
      assert.deepEqual(events, expectedEvents(observation, world), `${label}: events follow bids, tricks and scores`);
      if (observation.mode === 'spades-solo') assert.equal(events.teammateNil, 0, 'no teammate in Solo');
      hands++;
    }
  }
  assert.equal(hands, spots.length * 6);
  for (const id of ids) assert.equal(seen.get(id)!.size, 2, `${id} took both values`);
  t.diagnostic(`${hands} played-out hands from ${spots.length} positions; every declared event took both values`);
});

/** Independent restatement of the declared events from final bids, tricks, bags and scores. */
function expectedEvents(observation: SeatObservation, world: SpadesWorld): Record<string, number> {
  const competition = competitionFor(observation.mode);
  const seat = observation.seat;
  const own = competitorOf(competition, seat).seats;
  const mate = teammatesOf(competition, seat)[0];
  const sum = (seats: readonly Seat[], of: (member: Seat) => number) =>
    seats.reduce<number>((value, member) => value + of(member), 0);
  const positive = (seats: readonly Seat[]) => seats.filter((member) => world.bids[member] > 0);
  const contract = sum(positive(own), (member) => world.bids[member]);
  const credit = sum(positive(own), (member) => world.tricks[member]);
  const failedNil = sum(own.filter((member) => world.bids[member] === 0), (member) => world.tricks[member]);
  const final = SEATS.map((member) => {
    const members = competitorOf(competition, member).seats;
    return (
      world.scores[member] +
      scoreCompetitor({
        bids: members.map((entry) => world.bids[entry]),
        tricks: members.map((entry) => world.tricks[entry]),
        oldBags: world.bags[member],
      }).delta
    );
  });
  // The match ends only when one competitor alone holds the best score at or above the target.
  const best = Math.max(...final);
  const leaders = competition.competitors.filter((entry) => final[entry.seats[0]] === best);
  const decided = best >= 500 && leaders.length === 1;
  const flag = (value: boolean) => (value ? 1 : 0);
  return {
    positiveContract: flag(contract > 0),
    contractMade: flag(contract > 0 && credit >= contract),
    ownNil: flag(world.bids[seat] === 0),
    ownNilKept: flag(world.bids[seat] === 0 && world.tricks[seat] === 0),
    teammateNil: flag(mate !== undefined && world.bids[mate] === 0),
    teammateNilKept: flag(mate !== undefined && world.bids[mate] === 0 && world.tricks[mate] === 0),
    bagPenalty: flag(world.bags[seat] + Math.max(0, credit - contract) + failedNil >= 10),
    opposingContractSet: flag(
      opposingCompetitors(competition, seat).some((entry) => {
        const bidders = positive(entry.seats);
        return (
          bidders.length > 0 &&
          sum(bidders, (member) => world.tricks[member]) < sum(bidders, (member) => world.bids[member])
        );
      }),
    ),
    matchWon: flag(decided && leaders[0].seats.includes(seat)),
    matchLost: flag(decided && !leaders[0].seats.includes(seat)),
  };
}

test('GP-03: bid-consistency follows its declared likelihood, stays positive and excludes no feasible world', () => {
  let floored = 0,
    varied = 0;
  for (const { label, observation } of SPOTS) {
    const weighted = createSpadesPlayoutModel(observation, { weighting: 'bid-consistency' });
    const uniform = createSpadesPlayoutModel(observation, { weighting: 'uniform' });
    const wide = createSpadesPlayoutModel(observation, { weighting: 'bid-consistency', bidSpread: 3 });
    const weights = new Set<number>();
    for (let seed = 0; seed < 24; seed++) {
      const sampled = weighted.sample(seed);
      const plain = uniform.sample(seed);
      const spread = wide.sample(seed);
      assert.ok(sampled && plain && spread);
      // Weighting re-weights the same worlds; it never changes which worlds are drawn.
      assert.equal(worldKey(sampled.world), worldKey(plain.world), `${label}: same world for seed ${seed}`);
      assert.equal(plain.weight, 1);
      assert.ok(Number.isFinite(sampled.weight) && sampled.weight >= WEIGHT_FLOOR && sampled.weight <= 1, label);
      const expected = declaredWeight(observation, sampled.world, 'bid-consistency');
      assert.ok(Math.abs(sampled.weight - expected) <= 1e-12 * expected, `${label}: ${sampled.weight} against ${expected}`);
      const expectedWide = declaredWeight(observation, spread.world, 'bid-consistency', 3);
      assert.ok(Math.abs(spread.weight - expectedWide) <= 1e-12 * expectedWide, `${label}: spread 3`);
      if (sampled.weight === WEIGHT_FLOOR) floored++;
      weights.add(sampled.weight);
    }
    if (weights.size > 1) varied++;
    if (observation.bids.every((bid, seat) => bid === null || seat === observation.seat))
      assert.deepEqual([...weights], [1], `${label}: no public bid, no weighting`);
  }
  assert.ok(varied >= 40, `${varied} positions where the weight differs between worlds`);
  assert.ok(floored > 0, 'a bid far from every holding reaches the floor and is still kept');

  // Every feasible world of an ending is drawn and carries a positive weight.
  for (const { label, observation, worlds } of endings(8_400_001, 1, 12)) {
    const model = createSpadesPlayoutModel(observation, { weighting: 'bid-consistency' });
    const drawn = new Map<string, number>();
    for (let seed = 0; seed < Math.max(4000, 40 * worlds.length); seed++) {
      const sampled = model.sample(seed);
      assert.ok(sampled);
      drawn.set(worldKey(sampled.world), sampled.weight);
    }
    assert.equal(drawn.size, worlds.length, `${label}: support of the weighted sampler`);
    for (const world of worlds) {
      const weight = drawn.get(worldKey(world));
      assert.ok(weight !== undefined && weight > 0, `${label}: a feasible world was excluded`);
      const expected = declaredWeight(observation, world, 'bid-consistency');
      assert.ok(Math.abs(weight - expected) <= 1e-12 * expected);
    }
  }

  // Bids that no holding explains: all four seats bid thirteen. Nothing is excluded.
  const state = bidAll(spadesDeal([[], [], [], []], 'spades-partners'), [13, 13, 13, 13]);
  const observation = observe(state, state.turn!);
  const model = createSpadesPlayoutModel(observation, { weighting: 'bid-consistency' });
  let atFloor = 0;
  for (let seed = 0; seed < 64; seed++) {
    const sampled = model.sample(seed);
    assert.ok(sampled && sampled.weight >= WEIGHT_FLOOR);
    if (sampled.weight === WEIGHT_FLOOR) atFloor++;
  }
  assert.ok(atFloor >= 56, `${atFloor} of 64 worlds sit on the floor`);
  const candidates = observation.legalActions.map((action) => moveFromAction(action as { kind: 'play'; card: Card }));
  const summary = evaluateCandidates(model, candidates, { worlds: 64, maxSteps: 400_000 }, 5);
  assert.equal(summary.status, 'completed');
  assert.equal(summary.worldsUsed, 64);
  assert.ok(summary.effectiveWorlds > 32, `${summary.effectiveWorlds} effective worlds`);
});

function terminal(
  mode: SpadesMode,
  bids: number[],
  tricks: number[],
  scores: number[],
  bags: number[],
): SpadesWorld {
  assert.equal(tricks.reduce((sum, value) => sum + value, 0), 13);
  const world = emptyWorld(mateFor(mode));
  world.bids.set(bids);
  world.tricks.set(tricks);
  world.scores.set(scores);
  world.bags.set(bags);
  world.phase = PHASE_DONE;
  world.completed = 13;
  return world;
}
/** A model whose focal seat is the given seat, in the given mode, from the same deal. */
function modelFor(mode: SpadesMode, seat: Seat, options: SpadesModelOptions = {}) {
  const state = reach(mode, 8_500_001, 'policy', (entry) => entry.phase === 'bid' && entry.turn === seat);
  assert.ok(state);
  return createSpadesPlayoutModel(observe(state, seat), options);
}
const close = (actual: number, expected: number, label: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} against ${expected}`);

test('SG-03: overriding the objective changes the recorded model version', () => {
  const { observation } = SPOTS[0];
  const standard = createSpadesPlayoutModel(observation);
  assert.equal(standard.version, `${SPADES_KERNEL_VERSION}+${SPADES_OBJECTIVE_VERSION}`);
  assert.equal(spadesObjectiveId(), SPADES_OBJECTIVE_VERSION);
  assert.equal(spadesObjectiveId(DEFAULT_SPADES_OBJECTIVE), SPADES_OBJECTIVE_VERSION);
  assert.equal(createSpadesPlayoutModel(observation, { objective: { ...DEFAULT_SPADES_OBJECTIVE } }).version, standard.version);
  assert.equal(createSpadesPlayoutModel(observation, { objective: { bagLiability: undefined } }).version, standard.version);

  const overrides: Partial<SpadesObjective>[] = [
    { bagLiability: 0 },
    { bagLiability: 5 },
    { bagLiability: 10.5 },
    { matchBonus: 0 },
    { matchBonus: 250 },
    { opposingReference: 'max' },
    { bagLiability: 5, matchBonus: 250 },
    { bagLiability: 5, opposingReference: 'max' },
    { bagLiability: 0, matchBonus: 0, opposingReference: 'max' },
  ];
  const versions = overrides.map((objective) => createSpadesPlayoutModel(observation, { objective }).version);
  assert.equal(new Set([standard.version, ...versions]).size, overrides.length + 1, 'no two objectives share a version');
  overrides.forEach((objective, at) => {
    assert.equal(createSpadesPlayoutModel(observation, { objective }).version, versions[at], 'deterministic');
    assert.ok(versions[at].startsWith(`${SPADES_KERNEL_VERSION}+${SPADES_OBJECTIVE_VERSION}[`));
    assert.ok(versions[at].endsWith(spadesObjectiveId(objective)));
    for (const [name, value] of Object.entries({ ...DEFAULT_SPADES_OBJECTIVE, ...objective }))
      assert.ok(versions[at].includes(`${name}=${value}`), `${versions[at]} names ${name}`);
  });
  for (const mode of MODES)
    for (const seat of SEATS)
      assert.equal(modelFor(mode, seat, { objective: { matchBonus: 250 } }).version, versions[4], 'same identity in every mode and seat');
  for (const objective of [{ bagLiability: NaN }, { matchBonus: Infinity }, { opposingReference: 'median' }])
    assert.throws(() => createSpadesPlayoutModel(observation, { objective: objective as Partial<SpadesObjective> }), /objective/);

  // The allocation model names its own constants in the same way.
  assert.equal(standard.allocationModel, `uniform-feasible weighted by ${BID_CONSISTENCY_VERSION}`);
  assert.equal(
    createSpadesPlayoutModel(observation, { weighting: 'uniform' }).allocationModel,
    `uniform-feasible (${SAMPLER_VERSION} fallback)`,
  );
  const named = [
    standard.allocationModel,
    createSpadesPlayoutModel(observation, { weighting: 'uniform' }).allocationModel,
    createSpadesPlayoutModel(observation, { bidSpread: 3 }).allocationModel,
    createSpadesPlayoutModel(observation, { rejectionTries: 0 }).allocationModel,
    createSpadesPlayoutModel(observation, { bidSpread: 3, rejectionTries: 0 }).allocationModel,
  ];
  assert.equal(new Set(named).size, named.length);
  assert.throws(() => createSpadesPlayoutModel(observation, { bidSpread: 0 }), /spread/);
  assert.throws(() => createSpadesPlayoutModel(observation, { rejectionTries: -1 }), /tries/);
});

test('SG-03: utility is scored by team in Partners and by seat in Solo for the same world', () => {
  const bids = [4, 3, 2, 4],
    tricks = [5, 3, 1, 4],
    zero = [0, 0, 0, 0];
  // Partners: 0 and 2 bid 6 and take 6 (+60, no bag); 1 and 3 bid 7 and take 7 (+70).
  close(modelFor('spades-partners', 0).utility(terminal('spades-partners', bids, tricks, zero, zero)), 60 - 70, 'Partners seat 0');
  close(modelFor('spades-partners', 2).utility(terminal('spades-partners', bids, tricks, zero, zero)), 60 - 70, 'Partners seat 2');
  close(modelFor('spades-partners', 1).utility(terminal('spades-partners', bids, tricks, zero, zero)), 70 - 60, 'Partners seat 1');
  // Solo: seat 0 makes 4 with one bag (41, less 10 liability); the others score 30, -20 and 40.
  close(modelFor('spades-solo', 0).utility(terminal('spades-solo', bids, tricks, zero, zero)), 31 - 50 / 3, 'Solo seat 0');
  close(modelFor('spades-solo', 2).utility(terminal('spades-solo', bids, tricks, zero, zero)), -20 - 101 / 3, 'Solo seat 2');
  close(
    modelFor('spades-solo', 0, { objective: { opposingReference: 'max' } }).utility(terminal('spades-solo', bids, tricks, zero, zero)),
    31 - 40,
    'Solo seat 0 against the best other seat',
  );
  close(
    modelFor('spades-solo', 0, { objective: { bagLiability: 0 } }).utility(terminal('spades-solo', bids, tricks, zero, zero)),
    41 - 50 / 3,
    'Solo seat 0 without bag liability',
  );
  // Partners with a Nil: seat 2 keeps Nil (+100) while seat 0 makes 4 with a bag; bags are the team's.
  const nilBids = [4, 3, 0, 4],
    nilTricks = [5, 4, 0, 4];
  close(
    modelFor('spades-partners', 0).utility(terminal('spades-partners', nilBids, nilTricks, zero, zero)),
    40 + 1 + 100 - 10 - (70 + 1 - 10),
    'Partners with a kept Nil',
  );
  close(
    modelFor('spades-solo', 0).utility(terminal('spades-solo', nilBids, nilTricks, zero, zero)),
    31 - (30 + 1 - 10 + 100 + 40) / 3,
    'Solo with another seat keeping Nil',
  );
  // The tenth bag: the penalty is charged by the scorer and the carried liability is released.
  const nine = [9, 0, 9, 0];
  const level = terminal('spades-partners', bids, [6, 3, 0, 4], zero, nine);
  assert.deepEqual(scoreCompetitor({ bids: [4, 2], tricks: [6, 0], oldBags: 9 }), { delta: 60, bags: 9 });
  close(modelFor('spades-partners', 0).utility(level), 60 - 70, 'nine bags carried, none added');
  const crossing = terminal('spades-partners', bids, [6, 3, 1, 3], zero, nine);
  assert.deepEqual(scoreCompetitor({ bids: [4, 2], tricks: [6, 1], oldBags: 9 }), { delta: 60 + 1 - 100, bags: 0 });
  // Own side: -39 scored, nine carried bags released at 10 each. Other side: bid 7, took 6.
  close(modelFor('spades-partners', 0).utility(crossing), -39 + 90 - -70, 'tenth bag');
  assert.equal(modelFor('spades-partners', 0).events(crossing).bagPenalty, 1);
  assert.equal(modelFor('spades-partners', 1).events(crossing).bagPenalty, 0);
  assert.equal(modelFor('spades-partners', 0).events(level).bagPenalty, 0);
});

test('SG-03: the match term applies only when the scored hand ends the match', () => {
  const bids = [4, 3, 2, 4],
    tricks = [5, 3, 1, 4],
    zero = [0, 0, 0, 0];
  const bonus = DEFAULT_SPADES_OBJECTIVE.matchBonus;
  const partners = (seat: Seat, scores: number[], objective?: Partial<SpadesObjective>) =>
    modelFor('spades-partners', seat, objective ? { objective } : {}).utility(
      terminal('spades-partners', bids, tricks, scores, zero),
    );
  close(partners(0, [430, 300, 430, 300]), -10, 'Partners, 490 to 370: no end');
  close(partners(0, [439, 429, 439, 429]), -10, 'Partners, both one point short');
  close(partners(0, [440, 300, 440, 300]), -10 + bonus, 'Partners, own team reaches 500');
  close(partners(2, [440, 300, 440, 300]), -10 + bonus, 'Partners, teammate view');
  close(partners(1, [440, 300, 440, 300]), 10 - bonus, 'Partners, opposing view');
  close(partners(0, [300, 430, 300, 430]), -10 - bonus, 'Partners, other team reaches 500');
  close(partners(0, [445, 440, 445, 440]), -10 - bonus, 'Partners, both pass 500 and the other team is ahead');
  close(partners(0, [450, 440, 450, 440]), -10, 'Partners, tied at 510: the match continues');
  close(partners(0, [440, 300, 440, 300], { matchBonus: 0 }), -10, 'Partners, match term switched off');
  close(partners(0, [440, 300, 440, 300], { matchBonus: 250 }), -10 + 250, 'Partners, other constant');

  const solo = (seat: Seat, scores: number[]) =>
    modelFor('spades-solo', seat).utility(terminal('spades-solo', bids, tricks, scores, zero));
  const margin = 31 - 50 / 3;
  close(solo(0, [458, 469, 100, 100]), margin, 'Solo, nobody reaches 500');
  close(solo(0, [459, 400, 100, 100]), margin + bonus, 'Solo, own seat reaches 500');
  close(solo(0, [400, 470, 100, 100]), margin - bonus, 'Solo, another seat reaches 500');
  close(solo(0, [459, 470, 100, 100]), margin, 'Solo, tied at 500: the match continues');
  close(solo(0, [470, 480, 100, 100]), margin + bonus, 'Solo, two pass 500 and own seat leads');
  close(solo(1, [470, 480, 100, 100]), 30 - (31 - 20 + 40) / 3 - bonus, 'Solo, two pass 500 and another seat leads');
  for (const [mode, seat, scores, won, lost] of [
    ['spades-partners', 0, [440, 300, 440, 300], 1, 0],
    ['spades-partners', 3, [440, 300, 440, 300], 0, 1],
    ['spades-partners', 0, [430, 300, 430, 300], 0, 0],
    ['spades-solo', 0, [459, 400, 100, 100], 1, 0],
    ['spades-solo', 3, [459, 400, 100, 100], 0, 1],
    ['spades-solo', 0, [459, 470, 100, 100], 0, 0],
  ] as [SpadesMode, Seat, number[], number, number][]) {
    const events = modelFor(mode, seat).events(terminal(mode, bids, tricks, scores, zero));
    assert.deepEqual([events.matchWon, events.matchLost], [won, lost], `${mode} seat ${seat} ${scores}`);
  }
});
