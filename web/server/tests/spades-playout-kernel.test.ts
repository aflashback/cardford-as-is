import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import {
  actionId,
  apply,
  collectTrick,
  createGame,
  fullDeck,
  legalActions,
  type PrivateGame,
  type Seat,
} from '../game/index.ts';
import { competitionFor, teammatesOf } from '../game/kernel/competition.ts';
import { createRandom, shuffled } from '../strategy/plan/random.ts';
import {
  PHASE_DONE,
  actionIdOfMove,
  applyMove,
  cloneWorld,
  legalMoves,
  moveFromAction,
  scoreWorld,
  worldFromState,
  type SpadesWorld,
} from '../games/spades/playout/kernel.ts';
import { playoutMove } from '../games/spades/playout/policy.ts';

type SpadesMode = 'spades-solo' | 'spades-partners';
const MODES: SpadesMode[] = ['spades-solo', 'spades-partners'];
const mateFor = (mode: SpadesMode) => {
  const competition = competitionFor(mode);
  return ([0, 1, 2, 3] as Seat[]).map((seat) => teammatesOf(competition, seat)[0] ?? -1);
};
const snapshot = (world: SpadesWorld) =>
  JSON.stringify({
    ...world,
    mate: [...world.mate], hands: [...world.hands], bids: [...world.bids], tricks: [...world.tricks],
    scores: [...world.scores], bags: [...world.bags], played: [...world.played], voids: [...world.voids],
    // Trick slots beyond trickLen are scratch space.
    trickSeat: [...world.trickSeat].slice(0, world.trickLen),
    trickCard: [...world.trickCard].slice(0, world.trickLen),
  });
const start = (mode: SpadesMode, seed: number): PrivateGame =>
  createGame({ id: `kernel-${seed}`, mode, dealer: (seed % 4) as Seat }, shuffled(fullDeck(), createRandom(seed)));

test('SG-02: playout kernel matches production legality, trick winners and scoring on random legal hands', () => {
  const buffer: number[] = [];
  for (const mode of MODES)
    for (let seed = 3_000_001; seed <= 3_000_060; seed++) {
      const random = createRandom(seed, 7);
      let state = start(mode, seed);
      // Carry bags into some hands so the ten-bag boundary is exercised.
      if (seed % 3 === 0) {
        const bags = random.below(10);
        state.bags = (mode === 'spades-partners' ? [bags, 9 - bags, bags, 9 - bags] : [bags, 1, 9, 4]) as typeof state.bags;
      }
      const world = worldFromState(state, mateFor(mode));
      let guard = 0;
      while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
        assert.ok(++guard < 90);
        if (state.phase === 'trick-end') {
          state = collectTrick(state);
          if (state.phase === 'play')
            assert.equal(snapshot(worldFromState(state, mateFor(mode))), snapshot(world), `rebuild ${mode}/${seed}`);
          continue;
        }
        const seat = state.turn!;
        assert.equal(world.turn, seat);
        const expected = legalActions(state, seat).map(actionId).sort();
        const count = legalMoves(world, buffer);
        assert.deepEqual(buffer.slice(0, count).map(actionIdOfMove).sort(), expected, `legal ${mode}/${seed}`);
        assert.equal(snapshot(worldFromState(state, mateFor(mode))), snapshot(world), `mid-trick ${mode}/${seed}`);
        const action = legalActions(state, seat)[random.below(expected.length)];
        if (action.kind === 'pass') throw new Error('Spades has no pass.');
        applyMove(world, moveFromAction(action));
        state = apply(state, action);
      }
      assert.equal(world.phase, PHASE_DONE);
      assert.deepEqual([...world.tricks], state.tricks);
      const scored = scoreWorld(world);
      assert.deepEqual(scored.delta, state.handResult!.points, `delta ${mode}/${seed}`);
      assert.deepEqual(scored.bags, state.bags, `bags ${mode}/${seed}`);
      assert.deepEqual(scored.score, state.scores, `score ${mode}/${seed}`);
    }
});

test('SG-02 / GR-06: the playout policy reads only the acting seat and public state', () => {
  const buffer: number[] = [];
  for (const mode of MODES)
    for (let seed = 3_100_001; seed <= 3_100_030; seed++) {
      const world = worldFromState(start(mode, seed), mateFor(mode));
      const random = createRandom(seed, 3);
      let guard = 0;
      while (world.phase !== PHASE_DONE) {
        assert.ok(++guard < 60);
        const seat = world.turn;
        const chosen = playoutMove(world);
        const count = legalMoves(world, buffer);
        assert.ok(buffer.slice(0, count).includes(chosen), `illegal playout move ${mode}/${seed}`);
        // Redistribute every concealed card among the other seats, keeping each hand size.
        const hidden = cloneWorld(world);
        const others = [0, 1, 2, 3].filter((other) => other !== seat);
        const cards: number[] = [];
        const sizes = others.map((other) => {
          let size = 0;
          for (let suit = 0; suit < 4; suit++)
            for (let rank = 0; rank < 13; rank++)
              if (hidden.hands[other * 4 + suit] & (1 << rank)) {
                cards.push(suit * 13 + rank);
                size++;
              }
          for (let suit = 0; suit < 4; suit++) hidden.hands[other * 4 + suit] = 0;
          return size;
        });
        const mixed = shuffled(cards, random);
        let offset = 0;
        others.forEach((other, index) => {
          for (const card of mixed.slice(offset, offset + sizes[index]))
            hidden.hands[other * 4 + Math.floor(card / 13)] |= 1 << (card % 13);
          offset += sizes[index];
        });
        assert.equal(playoutMove(hidden), chosen, `hidden cards changed the playout move ${mode}/${seed}`);
        applyMove(world, chosen);
      }
    }
});

test('SG-02: playout kernel work is small enough for a bounded decision budget', () => {
  const base = worldFromState(start('spades-partners', 3_200_001), mateFor('spades-partners'));
  const started = performance.now();
  const hands = 2000;
  let tricks = 0;
  for (let index = 0; index < hands; index++) {
    const world = cloneWorld(base);
    while (world.phase !== PHASE_DONE) applyMove(world, playoutMove(world));
    tricks += world.completed;
  }
  const perHand = (performance.now() - started) / hands;
  assert.equal(tricks, hands * 13);
  // Generous bound: a regression to engine-level cost (about 8 ms per hand) must fail.
  assert.ok(perHand < 1, `playout hand took ${perHand.toFixed(3)} ms`);
});
