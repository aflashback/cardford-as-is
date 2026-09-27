import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceTrick, botStep, cardLabel, cardRank, cardSuit, createGame, legalCards,
  nextHand, passCards, playCard, recommendCard, submitBid, suggestBid, trickWinner,
  type Card, type GameState, type Mode, type Seat,
} from '../src/game.ts';

const modes: Mode[] = ['hearts', 'spades-solo', 'spades-partners'];

function playing(mode: Mode = 'hearts'): GameState {
  return { ...createGame(mode, 7), phase: 'play', turn: 0, hands: [[], [], [], []],
    bids: [3, 3, 3, 3], trick: [], history: [], tricks: [0, 0, 0, 0] };
}

function finishHand(initial: GameState) {
  let state = initial;
  for (let step = 0; step < 100 && !['hand-end', 'match-end'].includes(state.phase); step++) {
    if (state.phase === 'pass') state = passCards(state, state.hands[0].slice(0, 3));
    else if (state.phase === 'trick-end') state = advanceTrick(state);
    else state = botStep(state);
    const cards = [...state.hands.flat(), ...state.trick.map(p => p.card), ...state.history.flatMap(t => t.plays.map(p => p.card))];
    assert.equal(cards.length, 52, 'all cards remain accounted for');
    assert.equal(new Set(cards).size, 52, 'no card is duplicated');
  }
  assert.ok(['hand-end', 'match-end'].includes(state.phase), 'one hand terminates in a bounded action count');
  return state;
}

function scoreSpades(mode: Mode, bids: number[], desiredTricks: number[], scores = [0, 0, 0, 0], bags = [0, 0, 0, 0]) {
  const winner = desiredTricks.findIndex(n => n > 0) as Seat;
  const state = playing(mode);
  state.phase = 'trick-end';
  state.bids = bids;
  state.scores = scores;
  state.bags = bags;
  state.tricks = desiredTricks.map((n, seat) => n - Number(seat === winner));
  state.history = Array.from({ length: 12 }, () => ({ plays: [], winner: 0 as Seat }));
  state.trick = [0, 1, 2, 3].map(seat => ({ seat: seat as Seat, card: seat === winner ? 'CA' : `C${seat + 2}` }));
  return advanceTrick(state);
}

test('seeded deal has thirteen unique cards per seat and can be reproduced', () => {
  for (const mode of modes) {
    const state = createGame(mode, 91);
    assert.deepEqual(state.hands.map(h => h.length), [13, 13, 13, 13]);
    assert.equal(new Set(state.hands.flat()).size, 52);
    assert.deepEqual(createGame(mode, 91), state);
    assert.notDeepEqual(createGame(mode, 92).hands, state.hands);
  }
  assert.equal(cardSuit('D10'), 'D');
  assert.equal(cardRank('D10'), 10);
  assert.equal(cardRank('SA'), 14);
  assert.equal(cardLabel('HQ'), 'Queen of Hearts');
});

test('Hearts forces the two of clubs to open and following suit overrides point avoidance', () => {
  const state = playing();
  state.hands[0] = ['C2', 'CA', 'H2'];
  assert.deepEqual(legalCards(state), ['C2']);
  state.trick = [{ seat: 3, card: 'S2' }];
  state.hands[0] = ['SQ', 'H2', 'C3'];
  assert.deepEqual(legalCards(state), ['SQ']);
});

test('Hearts excludes first-trick points when a safe discard exists, with the all-points exception', () => {
  const state = playing();
  state.trick = [{ seat: 3, card: 'C2' }];
  state.hands[0] = ['SQ', 'H2', 'D3'];
  assert.deepEqual(legalCards(state), ['D3']);
  state.hands[0] = ['SQ', 'H2'];
  assert.deepEqual(legalCards(state), ['SQ', 'H2']);
});

test('Hearts and Spades enforce unbroken suit leads, with forced-suit exceptions', () => {
  for (const [mode, blocked] of [['hearts', 'H'], ['spades-solo', 'S']] as const) {
    const state = playing(mode);
    state.history = [{ winner: 1, plays: [] }];
    state.hands[0] = [`${blocked}2`, 'D3'];
    assert.deepEqual(legalCards(state), ['D3']);
    state.hands[0] = [`${blocked}2`, `${blocked}A`];
    assert.equal(legalCards(state).length, 2);
    const changed = playCard(state, `${blocked}2`);
    assert.equal(mode === 'hearts' ? changed.heartsBroken : changed.spadesBroken, true);
  }
});

test('Spades follows suit but permits first-trick trump when void', () => {
  const state = playing('spades-solo');
  state.trick = [{ seat: 3, card: 'CA' }];
  state.hands[0] = ['C2', 'SA', 'D2'];
  assert.deepEqual(legalCards(state), ['C2']);
  state.hands[0] = ['SA', 'D2'];
  assert.deepEqual(legalCards(state), ['SA', 'D2']);
  const changed = playCard(state, 'SA');
  assert.equal(changed.spadesBroken, true);
  assert.equal(changed.turn, 1);
});

test('illegal plays and invalid phase transitions leave original state unchanged', () => {
  const state = playing('spades-solo');
  state.hands[0] = ['C2', 'SA'];
  state.trick = [{ seat: 3, card: 'C3' }];
  const original = structuredClone(state);
  assert.throws(() => playCard(state, 'SA'));
  assert.throws(() => playCard(state, 'DA'));
  assert.throws(() => submitBid(state, 3));
  assert.throws(() => advanceTrick(state));
  assert.throws(() => nextHand(state));
  assert.deepEqual(state, original);
  const accepted = playCard(state, 'C2');
  assert.deepEqual(state, original);
  assert.deepEqual(accepted.hands[0], ['SA']);
});

test('tricks use the led suit in Hearts and highest trump in Spades', () => {
  const plays = [{ seat: 0 as Seat, card: 'H10' }, { seat: 1 as Seat, card: 'HA' }, { seat: 2 as Seat, card: 'S2' }, { seat: 3 as Seat, card: 'SA' }];
  assert.equal(trickWinner(plays, 'hearts'), 1);
  assert.equal(trickWinner(plays, 'spades-solo'), 3);
  assert.equal(trickWinner([{ seat: 0, card: 'C2' }, { seat: 1, card: 'DA' }], 'hearts'), 0);
});

test('fourth play pauses on the completed trick and the winner leads after collection', () => {
  let state = playing('spades-solo');
  state.turn = 3;
  state.hands[3] = ['C3'];
  state.trick = [{ seat: 0, card: 'C2' }, { seat: 1, card: 'CA' }, { seat: 2, card: 'CK' }];
  state = playCard(state, 'C3');
  assert.equal(state.phase, 'trick-end');
  assert.equal(state.trick.length, 4);
  state = advanceTrick(state);
  assert.equal(state.phase, 'play');
  assert.equal(state.turn, 1);
  assert.deepEqual(state.tricks, [0, 1, 0, 0]);
  assert.equal(state.trick.length, 0);
});

test('passing transfers exactly three cards to the selected direction without mutation', () => {
  for (const [direction, target] of [['left', 1], ['right', 3], ['across', 2]] as const) {
    const state = { ...createGame('hearts', 13), passDirection: direction };
    const original = structuredClone(state);
    const cards = state.hands[0].slice(0, 3);
    const changed = passCards(state, cards);
    assert.deepEqual(state, original);
    assert.ok(cards.every(card => changed.hands[target].includes(card)));
    assert.ok(cards.every(card => !changed.hands[0].includes(card)));
    assert.equal(changed.received.length, 3);
    assert.ok(changed.received.every(card => changed.hands[0].includes(card)));
    assert.equal(new Set(changed.hands.flat()).size, 52);
    assert.equal(changed.hands[changed.turn].includes('C2'), true);
    assert.equal(changed.phase, 'play');
  }
  const state = createGame('hearts', 13);
  assert.throws(() => passCards(state, state.hands[0].slice(0, 2)));
  assert.throws(() => passCards(state, Array(3).fill(state.hands[0][0])));
});

test('Spades accepts bids zero through thirteen in order and starts play after all four', () => {
  let state = createGame('spades-partners', 3);
  const first = state.turn;
  for (const value of [-1, 14, 1.5, NaN]) assert.throws(() => submitBid(state, value));
  for (const value of [0, 13, 13, 4]) state = submitBid(state, value);
  assert.equal(state.phase, 'play');
  assert.equal(state.turn, first);
  assert.equal(state.bids.filter(b => b === 13).length, 2);
  assert.throws(() => submitBid(state, 2));
});

test('partner golden scoring cases include failed Nil bags and multiple bag cycles', () => {
  const cases = [
    { bid: [3, 2], trick: [3, 2], old: [0, 0], result: [50, 0] },
    { bid: [3, 2], trick: [4, 3], old: [100, 4], result: [152, 6] },
    { bid: [3, 2], trick: [2, 2], old: [100, 4], result: [50, 4] },
    { bid: [3, 2], trick: [4, 3], old: [100, 9], result: [52, 1] },
    { bid: [0, 4], trick: [0, 4], old: [0, 0], result: [140, 0] },
    { bid: [0, 4], trick: [0, 3], old: [0, 0], result: [60, 0] },
    { bid: [0, 4], trick: [2, 4], old: [0, 0], result: [-60, 2] },
    { bid: [0, 4], trick: [2, 3], old: [150, 9], result: [-90, 1] },
    { bid: [0, 4], trick: [1, 6], old: [100, 8], result: [-58, 1] },
    { bid: [0, 0], trick: [2, 0], old: [0, 0], result: [0, 2] },
    { bid: [0, 0], trick: [6, 7], old: [100, 9], result: [-300, 2] },
    { bid: [13, 13], trick: [6, 7], old: [100, 3], result: [-160, 3] },
  ];
  for (const c of cases) {
    const state = scoreSpades('spades-partners', [c.bid[0], 1, c.bid[1], 1], [c.trick[0], 13 - c.trick[0] - c.trick[1], c.trick[1], 0],
      [c.old[0], 0, c.old[0], 0], [c.old[1], 0, c.old[1], 0]);
    assert.deepEqual([state.scores[0], state.bags[0]], c.result, JSON.stringify(c));
    assert.deepEqual([state.scores[2], state.bags[2]], c.result);
    assert.equal(state.handResult?.points[0], c.result[0] - c.old[0]);
  }
});

test('solo contracts and Nil are scored independently', () => {
  const state = scoreSpades('spades-solo', [0, 4, 3, 4], [0, 5, 2, 6]);
  assert.deepEqual(state.scores, [100, 41, -30, 42]);
  assert.deepEqual(state.bags, [0, 1, 0, 2]);
});

test('Hearts scores queen and hearts, including shooting the moon', () => {
  const state = playing();
  state.phase = 'trick-end';
  state.trick = [{ seat: 0, card: 'CA' }, { seat: 1, card: 'C2' }, { seat: 2, card: 'C3' }, { seat: 3, card: 'C4' }];
  state.history = Array.from({ length: 12 }, () => ({ winner: 1 as Seat, plays: [] }));
  state.history[0].plays = ['H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', 'HJ', 'HQ', 'HK', 'HA', 'SQ'].map(card => ({ seat: 0 as Seat, card }));
  assert.deepEqual(advanceTrick(state).scores, [26, 0, 26, 26]);
  state.history[0].plays.pop();
  state.history[1] = { winner: 2, plays: [{ seat: 0, card: 'SQ' }] };
  assert.deepEqual(advanceTrick(state).scores, [0, 13, 13, 0]);
});

test('Spades match ends at 500 with an untied lead and ties continue', () => {
  const winner = scoreSpades('spades-solo', [3, 3, 3, 3], [4, 3, 3, 3], [470, 400, 0, 0]);
  assert.equal(winner.phase, 'match-end');
  assert.equal(winner.handResult?.winner, 0);
  const tied = scoreSpades('spades-solo', [3, 3, 3, 3], [4, 3, 3, 3], [469, 470, 0, 0]);
  assert.equal(tied.phase, 'hand-end');
  assert.throws(() => nextHand(winner));
});

test('new hands rotate dealer and Hearts pass direction while preserving match totals', () => {
  let state = createGame('hearts', 5);
  for (const direction of ['right', 'across', 'hold', 'left']) {
    state = finishHand(state);
    const previous = state;
    state = nextHand(state);
    assert.equal(state.passDirection, direction);
    assert.equal(state.dealer, (previous.dealer + 1) % 4);
    assert.deepEqual(state.scores, previous.scores);
    assert.equal(state.handNumber, previous.handNumber + 1);
    assert.equal(state.history.length, 0);
    assert.equal(state.phase, direction === 'hold' ? 'play' : 'pass');
  }
});

test('recommendations and bot choices do not depend on opposing hidden cards', () => {
  for (const mode of modes) {
    let state = createGame(mode, 24);
    if (state.phase === 'pass') state = passCards(state, state.hands[0].slice(0, 3));
    while (state.phase === 'bid') state = submitBid(state, 3);
    const altered = structuredClone(state);
    for (let seat = 0; seat < 4; seat++) if (seat !== state.turn) altered.hands[seat] = ['CA'];
    assert.equal(recommendCard(altered), recommendCard(state));
    assert.equal(botStep(altered).trick.at(-1)?.card, botStep(state).trick.at(-1)?.card);
  }
  assert.ok(suggestBid(['SA', 'SK', 'SQ', 'SJ', 'S10', 'CA', 'DA', 'HA', 'C2', 'D2', 'H2', 'C3', 'D3']) >= 6);
});

test('all modes preserve the entire deck through complete seeded hands', () => {
  for (const mode of modes) for (let seed = 1; seed <= 30; seed++) {
    const state = finishHand(createGame(mode, seed));
    assert.equal(state.history.length, 13);
    assert.equal(state.tricks.reduce((sum, n) => sum + n, 0), 13);
    assert.deepEqual(state.hands, [[], [], [], []]);
    assert.ok(state.handResult);
  }
});
