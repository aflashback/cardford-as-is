import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGame,
  apply,
  collectTrick,
  fullDeck,
  type Seat,
  type Card,
  type Four,
  type AcceptedAction,
} from '../game/index.ts';
import { observe } from '../observations/index.ts';
import { chooseAction } from '../strategy/index.ts';
import { replay, type ReplayCommand } from '../game/replay.ts';
test('REPLAY: explicit original all-seat passes, bids, plays and collection reproduce every state', () => {
  for (const mode of ['hearts', 'spades-solo', 'spades-partners'] as const) {
    const config = { id: 'replay', mode, dealer: 3 as Seat };
    const deal = fullDeck();
    let state = createGame(config, deal);
    const commands: ReplayCommand[] = [];
    for (let i = 0; i < 80 && !['hand-end', 'match-end'].includes(state.phase); i++) {
      if (state.phase === 'trick-end') {
        commands.push({ type: 'collect-trick' });
        state = collectTrick(state);
      } else {
        let action: AcceptedAction;
        if (state.phase === 'pass') {
          const passes = ([0, 1, 2, 3] as Seat[]).map((seat) => {
            const a = chooseAction(observe(state, seat));
            return a.kind === 'pass' ? a.cards : [];
          }) as Four<Card[]>;
          action = { kind: 'pass-bundle', passes };
        } else {
          const a = chooseAction(observe(state, state.turn!));
          assert.notEqual(a.kind, 'pass');
          action = a as AcceptedAction;
        }
        commands.push({ type: 'action', action });
        state = apply(state, action);
      }
      assert.deepEqual(replay(config, deal, commands), state, `${mode} command ${i}`);
    }
    assert.equal(state.history.length, 13);
    assert.throws(() => replay(config, deal, commands, '9.0.0'));
  }
});
test('REPLAY: recorded human pass overrides current policy without recomputing any seat', () => {
  const config = { id: 'chosen', mode: 'hearts' as const, dealer: 3 as Seat };
  const deck = fullDeck();
  const start = createGame(config, deck);
  const passes = start.hands.map((h) => h.slice(-3)) as Four<Card[]>;
  const action: AcceptedAction = { kind: 'pass-bundle', passes };
  const end = apply(start, action);
  assert.deepEqual(replay(config, deck, [{ type: 'action', action }]), end);
  assert.deepEqual(end.passes[0].outgoing, passes[0]);
});
