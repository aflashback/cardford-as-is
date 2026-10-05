import assert from 'node:assert/strict';
import test from 'node:test';
import { cardLabel, cardSuit, fullDeck, sorted } from '../game/cards.ts';
import type { Card, Seat } from '../game/kernel/types.ts';
import { readLegacyGame } from '../game/legacy/reader.ts';
import { observe as frozenObserve } from '../game/legacy/observation.ts';
import {
  applySpadesAction,
  collectSpadesTrick,
  createSpadesGame,
  legalSpadesActions,
  nextSpadesHand,
} from '../games/spades/engine.ts';
import {
  fromV1Spades,
  projectV1SpadesState,
  renderV1SpadesState,
  toV1Spades,
} from '../games/spades/compatibility.ts';
import { assertSpadesState, type SpadesMode, type SpadesState } from '../games/spades/state.ts';
import { observeSpades, observeV1Spades, originalSpadesObservation } from '../games/spades/observation.ts';

function placeBids(initial: SpadesState): SpadesState {
  let state = initial;
  for (let i = 0; i < 4; i++) {
    assert.notEqual(state.turn, null);
    state = applySpadesAction(state, { kind: 'bid', seat: state.turn!, bid: 1 });
  }
  return state;
}
function biddingComplete(mode: SpadesMode = 'spades-solo'): SpadesState {
  return placeBids(createSpadesGame({ id: 'validation', mode, dealer: 0 }, fullDeck()));
}
function finishHand(initial: SpadesState): SpadesState {
  let state = initial;
  while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
    if (state.phase === 'trick-end') state = collectSpadesTrick(state);
    else {
      assert.notEqual(state.turn, null);
      state = applySpadesAction(state, legalSpadesActions(state, state.turn!)[0]);
    }
  }
  return state;
}
function replaceLatestPlay(state: SpadesState, card: Card): void {
  const played = state.trick.at(-1)!;
  assert.ok(state.hands[played.seat].includes(card));
  state.hands[played.seat] = sorted([
    ...state.hands[played.seat].filter((held) => held !== card),
    played.card,
  ]);
  played.card = card;
  const event = state.events.at(-1)!;
  assert.equal(event.type, 'card-played');
  event.card = card;
  event.message = `${['You', 'West', 'North', 'East'][played.seat]} played ${cardLabel(card)}.`;
  state.spadesBroken = cardSuit(card) === 'S';
  state.compatibility.heartsBroken = cardSuit(card) === 'H';
}
const illegalLead = (): SpadesState => {
  const state = applySpadesAction(biddingComplete(), { kind: 'play', seat: 1, card: 'C2' });
  replaceLatestPlay(state, 'S3');
  return state;
};

test('Spades native codec rejects an unbroken trump lead despite consistent final flags and counts', () => {
  assert.throws(() => assertSpadesState(illegalLead()));
});
test('Spades legacy reader rejects the same impossible lead', () => {
  const state = toV1Spades(applySpadesAction(biddingComplete(), { kind: 'play', seat: 1, card: 'C2' }));
  state.hands[1] = sorted([...state.hands[1].filter((card) => card !== 'S3'), 'C2']);
  state.trick = [{ seat: 1, card: 'S3' }];
  state.spadesBroken = true;
  state.events.at(-1)!.card = 'S3';
  state.events.at(-1)!.message = 'West played 3 of Spades.';
  assert.throws(() => readLegacyGame(state));
});
test('Spades native codec rejects a fabricated score and match winner', () => {
  const state = finishHand(biddingComplete());
  state.phase = 'match-end';
  state.scores = [-100, -100, -100, -100];
  state.handResult = { ...state.handResult!, points: [5000, 5000, 5000, 5000], winner: 2 };
  assert.throws(() => assertSpadesState(state));
});
test('Spades legacy reader rejects a fabricated score and match winner', () => {
  const state = toV1Spades(finishHand(biddingComplete()));
  state.phase = 'match-end';
  state.scores = [-100, -100, -100, -100];
  state.handResult = { ...state.handResult!, points: [5000, 5000, 5000, 5000], winner: 2 };
  assert.throws(() => readLegacyGame(state));
});
test('Spades native codec rejects failure to follow suit while that suit is held', () => {
  let state = applySpadesAction(biddingComplete(), { kind: 'play', seat: 1, card: 'C2' });
  const seat: Seat = 2;
  const offSuit = state.hands[seat].find((card) => cardSuit(card) !== 'C')!;
  state = applySpadesAction(state, legalSpadesActions(state, seat)[0]);
  replaceLatestPlay(state, offSuit);
  assert.throws(() => assertSpadesState(state));
});
for (const mode of ['spades-solo', 'spades-partners'] as const) {
  test(`Spades strict codec preserves ${mode} scores through carried bags and penalty thresholds`, () => {
    let state = finishHand(biddingComplete(mode));
    let sawCarry = false;
    let sawPenalty = false;
    for (let round = 0; round < 4; round++) {
      assert.doesNotThrow(() => assertSpadesState(state));
      assert.deepEqual(toV1Spades(fromV1Spades(toV1Spades(state))), toV1Spades(state));
      const previousBags = [...state.bags];
      sawCarry ||= previousBags.some((bags) => bags > 0);
      state = finishHand(placeBids(nextSpadesHand(state, fullDeck())));
      sawPenalty ||= state.handResult!.points.some((points) => points < 0);
      const corrupt = structuredClone(state);
      corrupt.handResult!.points[0] += 100;
      assert.throws(() => assertSpadesState(corrupt));
    }
    assert.ok(sawCarry);
    assert.ok(sawPenalty);
  });
}
test('Spades strict codec checks first-round bags, cumulative scores, winner and result phase separately', () => {
  const scored = finishHand(biddingComplete());
  for (const alter of [
    (state: SpadesState) => {
      state.handResult!.points[0]++;
    },
    (state: SpadesState) => {
      state.bags[0] = (state.bags[0] + 1) % 10;
      state.handResult!.bags[0] = state.bags[0];
    },
    (state: SpadesState) => {
      state.scores[0] = 500;
    },
    (state: SpadesState) => {
      state.handResult!.winner = 2;
      state.phase = 'match-end';
    },
    (state: SpadesState) => {
      state.phase = 'play';
    },
  ]) {
    const corrupt = structuredClone(scored);
    alter(corrupt);
    assert.throws(() => assertSpadesState(corrupt));
  }
});
test('Spades trusted projections preserve partial typed V1 fixtures and allowlist private canaries', () => {
  const legacy = toV1Spades(biddingComplete());
  legacy.hands[2].pop(); // Historical low-level tests deliberately use partial states.
  const extended = Object.assign(legacy, { privateCanary: { concealed: 'PRIVATE-CANARY' } });
  Object.assign(extended.events[0], { privateCanary: 'EVENT-CANARY' });
  const projected = projectV1SpadesState(extended);
  assert.equal(JSON.stringify(projected).includes('CANARY'), false);
  assert.deepEqual(observeV1Spades(projected, 0), frozenObserve(extended, 0));
  assert.throws(() => fromV1Spades(extended));
  assert.throws(() => toV1Spades(projected));
  const nativeCanary = Object.assign(projected, { privateCanary: 'NATIVE-CANARY' });
  const rendered = renderV1SpadesState(nativeCanary);
  assert.equal(JSON.stringify(rendered).includes('CANARY'), false);
  assert.deepEqual(frozenObserve(rendered, 0), frozenObserve(legacy, 0));
});
test('Spades policy input still rejects unexpected private fields after trusted projections are added', () => {
  const input = observeSpades(biddingComplete(), 0);
  assert.doesNotThrow(() => originalSpadesObservation(input));
  const corrupt = Object.assign(input, { privateCanary: 'CONCEALED-HAND' });
  assert.throws(() => originalSpadesObservation(corrupt));
});
