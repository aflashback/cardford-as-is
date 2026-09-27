import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceTrick, botStep, createGame, nextHand, passCards, type GameState, type Mode } from '../src/game.ts';
import * as storage from '../src/storage.ts';

function saved(game = createGame('spades-partners', 31)): storage.SavedGame {
  return { version: 1, game, coachMode: 'asked', stats: { decisions: 4, helped: 2, suggestions: 1 }, exposure: 2, exposureTurn: '' };
}

test('an incomplete persisted state is rejected before App can hydrate it', context => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  context.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => JSON.stringify({ version: 1, game: { hands: [[], [], [], []] }, stats: {}, exposureTurn: '' }),
  } });
  assert.equal(storage.readSaved(), null);
});

test('saved metadata rejects unsupported versions, modes, impossible counts and hint levels', () => {
  const changes: Array<(value: any) => void> = [
    value => { value.version = 2; },
    value => { value.coachMode = 'always'; },
    value => { value.stats = null; },
    value => { value.stats.decisions = -1; },
    value => { value.stats.helped = 5; },
    value => { value.stats.suggestions = 3; },
    value => { value.stats.decisions = 1.5; },
    value => { value.exposure = 4; },
    value => { value.exposure = NaN; },
    value => { value.exposureTurn = 12; },
  ];
  for (const change of changes) {
    const value = saved();
    change(value);
    assert.equal(storage.validateSaved(value), false, change.toString());
  }
  for (const value of [null, [], 'saved', 3, {}, { version: 1 }]) assert.equal(storage.validateSaved(value), false);
});

test('unsupported saved speeds cannot reach the playback timer', () => {
  for (const gameSpeed of [0, -1, 1.1, 2, '1.2', null, undefined, NaN, Infinity, {}, []]) {
    assert.equal(storage.validateSaved({ ...saved(), gameSpeed }), false, `speed: ${String(gameSpeed)}`);
  }
});

test('supported speeds survive save hydration without changing the game', context => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  context.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  let serialized = '';
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => serialized } });
  for (const gameSpeed of [1, 1.2, 1.4]) {
    const fixture = { ...saved(), gameSpeed };
    serialized = JSON.stringify(fixture);
    assert.deepEqual(storage.readSaved(), fixture);
  }
});

test('malformed card, action, scoring and history fields never reach the UI', () => {
  const changes: Array<(value: any) => void> = [
    value => { value.game.mode = 'poker'; },
    value => { value.game.phase = 'unknown'; },
    value => { value.game.id = ''; },
    value => { value.game.seed = Infinity; },
    value => { value.game.handNumber = 0; },
    value => { value.game.dealer = 4; },
    value => { value.game.turn = -1; },
    value => { value.game.passDirection = 'up'; },
    value => { value.game.heartsBroken = 'false'; },
    value => { value.game.spadesBroken = null; },
    value => { value.game.hands[0] = {}; },
    value => { value.game.hands[0][0] = 'ST'; },
    value => { value.game.hands[0][0] = value.game.hands[1][0]; },
    value => { value.game.hands[0].pop(); },
    value => { value.game.trick = null; },
    value => { value.game.trick = [{ seat: 4, card: 'CA' }]; },
    value => { value.game.history = [{ winner: 0, plays: 'bad' }]; },
    value => { value.game.bids = [3, null, 2]; },
    value => { value.game.bids = [3, null, 2, 14]; },
    value => { value.game.scores = [0, 0, 0, '50']; },
    value => { value.game.scores = [0, Infinity, 0, 0]; },
    value => { value.game.tricks = [1, 0, 0, 0]; },
    value => { value.game.bags = [0, 0, 0, 10]; },
    value => { value.game.received = ['CA', 'CA', 'CA']; },
    value => { value.game.events = [{ id: 1, type: 'hand', message: {} }]; },
    value => { value.game.events = [{ id: 1, type: 'play', message: 'test', card: 'bad' }]; },
  ];
  for (const change of changes) {
    const value = saved();
    change(value);
    assert.equal(storage.validateSaved(value), false, change.toString());
  }
});

test('all legitimate engine phases can be saved and reloaded without mutation', () => {
  const phases = new Set<string>();
  for (const mode of ['hearts', 'spades-solo', 'spades-partners'] as Mode[]) {
    let game = createGame(mode, 39);
    for (let hand = 0; hand < 4; hand++) {
      for (let step = 0; step < 100; step++) {
        const fixture = saved(game);
        const before = structuredClone(fixture);
        assert.equal(storage.validateSaved(fixture), true, `${mode} ${game.phase}, trick ${game.history.length}`);
        assert.deepEqual(fixture, before);
        assert.equal(storage.validateSaved(JSON.parse(JSON.stringify(fixture))), true);
        phases.add(game.phase);
        if (game.phase === 'hand-end' || game.phase === 'match-end') break;
        if (game.phase === 'pass') game = passCards(game, game.hands[0].slice(0, 3));
        else if (game.phase === 'trick-end') game = advanceTrick(game);
        else game = botStep(game);
      }
      if (game.phase === 'match-end') break;
      game = nextHand(game);
    }
  }
  assert.ok(['pass', 'bid', 'play', 'trick-end', 'hand-end'].every(phase => phases.has(phase)));
});

test('completed saves require a valid result and terminal saves require a winner', () => {
  let game = createGame('spades-solo', 7);
  game.scores = [490, 0, 0, 0];
  while (game.phase !== 'hand-end' && game.phase !== 'match-end') {
    game = game.phase === 'trick-end' ? advanceTrick(game) : botStep(game);
  }
  const fixture = saved(game);
  assert.equal(storage.validateSaved(fixture), true);
  assert.equal(storage.validateSaved({ ...fixture, game: { ...game, handResult: undefined } }), false);
  assert.equal(storage.validateSaved({ ...fixture, game: { ...game, handResult: { points: ['bad'], bags: [] } } }), false);
  assert.equal(storage.validateSaved({ ...fixture, game: { ...game, phase: 'match-end', handResult: { ...game.handResult, winner: undefined } } }), false);
});

test('impossible saved actors and trick winners are rejected instead of stalling bot playback', () => {
  const bidding = saved();
  bidding.game.turn = ((bidding.game.turn + 1) % 4) as GameState['turn'];
  assert.equal(storage.validateSaved(bidding), false, 'bidding starts clockwise after the dealer');

  let hearts = createGame('hearts', 5);
  hearts = passCards(hearts, hearts.hands[0].slice(0, 3));
  hearts.turn = ((hearts.turn + 1) % 4) as GameState['turn'];
  assert.equal(storage.validateSaved(saved(hearts)), false, 'only the two of clubs holder can lead the first trick');

  let game = createGame('spades-solo', 7);
  while (game.phase !== 'trick-end') game = botStep(game);
  const wrongTurn = { ...game, turn: ((game.turn + 1) % 4) as GameState['turn'] };
  assert.equal(storage.validateSaved(saved(wrongTurn)), false);
  game = advanceTrick(game);
  const winner = game.history[0].winner;
  const wrongWinner = ((winner + 1) % 4) as GameState['turn'];
  game.history[0].winner = wrongWinner;
  game.tricks[winner] = 0;
  game.tricks[wrongWinner] = 1;
  game.turn = wrongWinner;
  assert.equal(storage.validateSaved(saved(game)), false, 'a recorded winner must agree with the public cards');
});

test('valid local saves round-trip and invalid JSON falls back safely', context => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  context.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  let serialized = JSON.stringify(saved());
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => serialized } });
  assert.deepEqual(storage.readSaved(), saved());
  serialized = '{invalid';
  assert.equal(storage.readSaved(), null);
});
