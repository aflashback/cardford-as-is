import assert from 'node:assert/strict';
import test from 'node:test';
import { apply, type Seat } from '../game/index.ts';
import { observe } from '../observations/index.ts';
import { assessBids } from '../games/spades/reasoning/bidding.ts';
import { compareOutcomes, evaluateOutcome } from '../games/spades/reasoning/objectives.ts';
import { spadesDeal, bidAll } from './support/spades-fixtures.ts';

function biddingAt(seat: Seat, prior: number[], mode: 'spades-solo' | 'spades-partners') {
  let game = spadesDeal([[], [], [], []], mode);
  assert.equal(game.turn, 0);
  for (const bid of prior) {
    const bidder = game.turn!;
    game = apply(game, { kind: 'bid', seat: bidder, bid });
  }
  assert.equal(game.turn, seat);
  return observe(game, seat);
}

test('GR-04 S13 keeps all fourteen bids legal while rejecting an impossible combined positive contract', () => {
  const obs = biddingAt(2, [12, 1], 'spades-partners');
  const assessment = assessBids(obs);
  assert.equal(assessment.candidates.length, 14);
  assert.deepEqual(assessment.candidates.map((c) => c.bid), Array.from({ length: 14 }, (_, n) => n));
  assert.equal(assessment.candidates.find((c) => c.bid === 2)?.contractFeasible, false);
  assert.equal(assessment.candidates.find((c) => c.bid === 1)?.contractFeasible, true);
  assert.equal(assessment.selectedBid, 1);
  assert.match(assessment.reasons.join(' '), /13 tricks|public/i);
});

test('GR-04 S13 treats opposing bids as soft commitments, never ownership or a guarantee', () => {
  const low = assessBids(biddingAt(1, [1], 'spades-solo'));
  const high = assessBids(biddingAt(1, [13], 'spades-solo'));
  assert.equal(low.candidates.length, high.candidates.length);
  assert.ok(high.selectedBid < low.selectedBid);
  assert.match(high.limitations.join(' '), /unverified|uncertain|not.*proof/i);
  assert.doesNotMatch(JSON.stringify(high), /owns|guaranteed opponent|win probability/i);
});

test('GR-04 S13 excludes Nil when own ace of spades guarantees one trick', () => {
  const state = spadesDeal([['SA'], [], [], []], 'spades-solo');
  const assessment = assessBids(observe(state, 0));
  assert.equal(assessment.candidates.find((c) => c.bid === 0)?.nilFeasible, false);
  assert.ok(assessment.selectedBid >= 1);
});

test('GR-04 S13 does not choose a known-failed Nil when no team contract can be made', () => {
  let state = spadesDeal([[], [], ['SA'], []]);
  state = apply(state, { kind: 'bid', seat: 0, bid: 13 });
  state = apply(state, { kind: 'bid', seat: 1, bid: 1 });
  const assessment = assessBids(observe(state, 2));
  assert.equal(assessment.candidates.every((c) => !c.contractFeasible || !c.nilFeasible), true);
  assert.equal(assessment.selectedBid, 1);
  assert.match(assessment.limitations.join(' '), /neither a successful Nil nor a makeable/i);
});

test('GR-04 S12 evaluates an ordinary opposing set with exact Solo scoring', () => {
  const obs = observe(bidAll(spadesDeal([[], [], [], []], 'spades-solo'), [3, 4, 3, 3]), 0);
  const compared = compareOutcomes(obs, [
    { id: 'opponent-makes', tricks: [3, 4, 3, 3] },
    { id: 'opponent-set', tricks: [4, 3, 3, 3] },
  ]);
  assert.equal(compared[0].competitors[1].delta, 40);
  assert.equal(compared[1].competitors[1].delta, -40);
  assert.equal(compared[1].focal.score, 31);
  assert.equal(compared[0].focal.score, 30);
  assert.equal(compared[1].preferenceRank, 1);
  assert.equal(compared[0].evidence, 'exact-given-projection');
});

test('GR-04 S12 compares team opponents and tenth-bag cost through the frozen scorer', () => {
  const state = bidAll(spadesDeal([[], [], [], []]), [2, 3, 2, 3]);
  state.bags = [9, 0, 9, 0];
  const obs = observe(state, 0);
  const plans = compareOutcomes(obs, [
    { id: 'bag', tricks: [3, 3, 2, 5] },
    { id: 'no-bag', tricks: [2, 4, 2, 5] },
  ]);
  assert.equal(plans[0].focal.delta, -59);
  assert.equal(plans[1].focal.delta, 40);
  assert.equal(plans[1].preferenceRank, 1);
  assert.equal(plans[0].competitors.length, 2);
  assert.deepEqual(plans[0].competitors[0].seats, [0, 2]);
  assert.deepEqual(plans[0].competitors[1].seats, [1, 3]);
});

test('GR-04 S14 resolves a terminal result after all competitors score, including tied target', () => {
  const state = bidAll(spadesDeal([[], [], [], []]), [3, 3, 3, 3]);
  state.scores = [470, 469, 470, 469];
  const obs = observe(state, 0);
  const tie = evaluateOutcome(obs, [3, 3, 3, 4]);
  assert.equal(tie.matchWinner, null);
  assert.equal(tie.matchStatus, 'continuing');
  const win = evaluateOutcome(obs, [4, 3, 3, 3]);
  assert.equal(win.matchWinner, 0);
  assert.equal(win.matchStatus, 'focal-win');
  assert.equal(win.focal.score, 531);
});

test('GR-04 S14 rejects incomplete or impossible projections instead of forecasting hidden tricks', () => {
  const obs = observe(bidAll(spadesDeal([[], [], [], []], 'spades-solo'), [3, 3, 3, 3]), 0);
  assert.throws(() => evaluateOutcome(obs, [3, 3, 3, 3]), /thirteen/);
  assert.throws(() => evaluateOutcome(obs, [-1, 4, 4, 6]), /nonnegative/);
  assert.match(evaluateOutcome(obs, [4, 3, 3, 3]).limitations.join(' '), /projection.*not.*forecast/i);
});
