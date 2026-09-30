import assert from 'node:assert/strict';
import test from 'node:test';
import {
  apply,
  collectTrick,
  createGame,
  fullDeck,
  legalActions,
  nextHand,
  type Card,
  type Four,
  type Mode,
  type PrivateGame,
  type Seat,
} from '../game/index.ts';
import { observe, type SeatObservation } from '../observations/index.ts';
import { createRandom, shuffled, type Random } from '../strategy/plan/random.ts';
import { SampleUnavailableError, createWorldSampler, sampleWorld } from '../strategy/sampler.ts';

/**
 * GP-04: the prepare-once sampler must be the same sampler. `sampleWorld` is left untouched in
 * source, so every comparison below is between two separately written code paths.
 */
const SEATS: Seat[] = [0, 1, 2, 3];
const SEEDS: number[] = Array.from({ length: 256 }, (_, index) =>
  index < 128 ? index : index === 255 ? 0xffffffff : Math.imul(index, 0x9e3779b1) >>> 0,
);

function passCards(state: PrivateGame, random: Random): PrivateGame {
  const passes = state.hands.map((hand) => shuffled(hand, random).slice(0, 3)) as Four<Card[]>;
  return apply(state, { kind: 'pass-bundle', passes });
}

/** Seeded random legal play through the production engine, so every position is reachable. */
function reach(mode: Mode, seed: number, stop: (state: PrivateGame) => boolean): PrivateGame {
  const random = createRandom(seed, 11);
  let state = createGame(
    { id: `parity-${mode}-${seed}`, mode, dealer: (seed % 4) as Seat },
    shuffled(fullDeck(), createRandom(seed)),
  );
  for (let guard = 0; guard < 400; guard++) {
    if (stop(state)) return state;
    if (state.phase === 'pass') state = passCards(state, random);
    else if (state.phase === 'trick-end') state = collectTrick(state);
    else if (state.phase === 'hand-end') state = nextHand(state, shuffled(fullDeck(), createRandom(seed + guard, 5)));
    else if (state.phase === 'match-end') break;
    else {
      const actions = legalActions(state, state.turn!);
      const action = actions[random.below(actions.length)];
      if (action.kind === 'pass') throw new Error('A sealed pass is not a turn action.');
      state = apply(state, action);
    }
  }
  throw new Error(`Position not reached for ${mode}/${seed}.`);
}

const playing = (tricks: number, cards: number) => (state: PrivateGame) =>
  state.phase === 'play' && state.history.length === tricks && state.trick.length === cards;
const bidding = (placed: number) => (state: PrivateGame) =>
  state.phase === 'bid' && state.bids.filter((bid) => bid !== null).length === placed;

type Stage = 'commitment' | 'early' | 'mid' | 'late' | 'other';
type Position = { label: string; stage: Stage; observation: SeatObservation };
function positions(): Position[] {
  const result: Position[] = [];
  const add = (label: string, stage: Stage, state: PrivateGame, seat: Seat) =>
    result.push({ label: `${label}, seat ${seat}`, stage, observation: observe(state, seat) });
  let seed = 7_100_001;
  for (const mode of ['spades-solo', 'spades-partners'] as const) {
    const stages: [string, Stage, (state: PrivateGame) => boolean][] = [
      ['bid, none placed', 'commitment', bidding(0)],
      ['bid, two placed', 'commitment', bidding(2)],
      ['second trick lead', 'early', playing(1, 0)],
      ['first trick third card', 'early', playing(0, 2)],
      ['seventh trick second card', 'mid', playing(6, 1)],
      ['eighth trick fourth card', 'mid', playing(7, 3)],
      ['eleventh trick lead', 'late', playing(10, 0)],
      ['twelfth trick third card', 'late', playing(11, 2)],
      ['last trick second card', 'late', playing(12, 1)],
    ];
    for (const [label, stage, stop] of stages) {
      const state = reach(mode, seed++, stop);
      add(`${mode} ${label}`, stage, state, state.turn!);
    }
    // A seat that is not acting, and a completed trick still on the table.
    const watching = reach(mode, seed++, playing(5, 2));
    add(`${mode} sixth trick, watching`, 'other', watching, ((watching.turn! + 2) % 4) as Seat);
    const resolved = reach(mode, seed++, (state) => state.phase === 'trick-end' && state.history.length === 9);
    add(`${mode} completed ninth trick on the table`, 'other', resolved, resolved.turn!);
    // Later hand of a match: scores, bags and a long event log are carried.
    const later = reach(mode, seed++, (state) => state.handNumber === 2 && playing(4, 1)(state));
    add(`${mode} second hand, fifth trick`, 'other', later, later.turn!);
  }
  const hearts: [string, Stage, (state: PrivateGame) => boolean][] = [
    ['sealed pass', 'commitment', (state) => state.phase === 'pass'],
    ['opening lead after the pass', 'early', playing(0, 0)],
    ['first trick third card', 'early', playing(0, 2)],
    ['second trick second card', 'early', playing(1, 1)],
    ['seventh trick lead', 'mid', playing(6, 0)],
    ['eighth trick fourth card', 'mid', playing(7, 3)],
    ['eleventh trick second card', 'late', playing(10, 1)],
    ['last trick lead', 'late', playing(12, 0)],
  ];
  for (const [label, stage, stop] of hearts) {
    const state = reach('hearts', seed++, stop);
    for (const seat of state.turn === null ? SEATS.slice(0, 2) : [state.turn, ((state.turn + 1) % 4) as Seat])
      add(`hearts ${label}`, stage, state, seat);
  }
  return result;
}

const POSITIONS = positions();

test('GP-04: prepared sampler draws equal sampleWorld hands for 256 seeds at every stage and mode', () => {
  const covered = new Set<string>();
  let knowledge = 0,
    voids = 0;
  for (const { label, stage, observation } of POSITIONS) {
    const before = structuredClone(observation);
    const sampler = createWorldSampler(observation);
    for (const seed of SEEDS)
      assert.deepEqual(sampler.draw(seed), sampleWorld(observation, seed).hands, `${label}, seed ${seed}`);
    assert.deepEqual(observation, before, `${label}: observation mutated`);
    covered.add(`${observation.mode}/${stage}`);
    if (observation.knownHoldings.length) knowledge++;
    if (observation.memory.some((memory) => memory.voidSeats.length)) voids++;
  }
  // The fixture set covers what the requirement names. Hearts has no bid; its commitment is the sealed pass.
  for (const mode of ['spades-solo', 'spades-partners', 'hearts'])
    for (const stage of ['commitment', 'early', 'mid', 'late'])
      assert.ok(covered.has(`${mode}/${stage}`), `missing ${mode} ${stage}`);
  assert.ok(knowledge >= 4, 'Hearts positions with retained pass knowledge are present');
  assert.ok(voids >= 8, 'positions with public voids are present');
});

test('GP-04: prepared sampler draws are independent of draw order and return fresh arrays', () => {
  const { observation } = POSITIONS.find((entry) => entry.label.startsWith('spades-partners seventh trick'))!;
  const forward = createWorldSampler(observation);
  const backward = createWorldSampler(observation);
  const first = SEEDS.slice(0, 48).map((seed) => forward.draw(seed));
  const second = [...SEEDS.slice(0, 48)].reverse().map((seed) => backward.draw(seed)).reverse();
  assert.deepEqual(first, second);
  const drawn = forward.draw(3);
  const copy = structuredClone(drawn);
  drawn[1].length = 0;
  drawn[observation.seat].push('XX');
  assert.deepEqual(forward.draw(3), copy);
  // The sampler keeps what it validated: later changes to the caller's object have no effect.
  const mutable = structuredClone(observation);
  const held = createWorldSampler(mutable);
  mutable.hand.length = 0;
  mutable.history.length = 0;
  assert.deepEqual(held.draw(3), copy);
});

test('GP-04: prepared sampler fails as sampleWorld does on invalid seeds and observations', () => {
  const { observation } = POSITIONS.find((entry) => entry.label.startsWith('spades-solo eleventh trick'))!;
  const sampler = createWorldSampler(observation);
  for (const seed of [-1, NaN, 1.5, 0x100000000]) {
    assert.throws(() => sampler.draw(seed), /uint32/);
    assert.throws(() => sampleWorld(observation, seed), /uint32/);
  }
  const mismatch = structuredClone(observation);
  mismatch.handSizes[(observation.seat + 1) % 4]++;
  const reason = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      return error instanceof SampleUnavailableError ? error.reason : `other: ${String(error)}`;
    }
    return 'no error';
  };
  assert.equal(reason(() => createWorldSampler(mismatch)), 'inconsistent-observation');
  assert.equal(reason(() => sampleWorld(mismatch, 1)), 'inconsistent-observation');
  const unknownField = Object.assign(structuredClone(observation), { hands: [] });
  assert.throws(() => createWorldSampler(unknownField as SeatObservation), /unexpected observation field/);

  // Public unbroken spade lead: the leader holds spades only. One spade too many is impossible.
  const state = createGame({ id: 'restriction', mode: 'spades-solo', dealer: 3 }, fullDeck());
  state.hands = ['S', 'C', 'D', 'H'].map((suit) => fullDeck().filter((card) => card[0] === suit)) as Four<Card[]>;
  state.phase = 'play';
  state.turn = 0;
  state.bids = [3, 3, 3, 3];
  const led = observe(apply(state, { kind: 'play', seat: 0, card: 'S2' }), 1);
  const restricted = createWorldSampler(led);
  for (const seed of SEEDS.slice(0, 32)) {
    const hands = restricted.draw(seed);
    assert.ok(hands[0].every((card) => card[0] === 'S'));
    assert.deepEqual(hands, sampleWorld(led, seed).hands);
  }
  const impossible = structuredClone(led);
  impossible.handSizes[0] = 13;
  impossible.handSizes[2] = 12;
  assert.equal(reason(() => createWorldSampler(impossible)), 'impossible');
  assert.equal(reason(() => sampleWorld(impossible, 1)), 'impossible');
});
