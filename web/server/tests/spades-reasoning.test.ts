import assert from 'node:assert/strict';
import test from 'node:test';
import {
  actionId,
  apply,
  collectTrick,
  fullDeck,
  trickWinner,
  type Card,
  type Four,
  type PrivateGame,
  type Seat,
} from '../game/index.ts';
import { scoreCompetitor } from '../game/spades/score.ts';
import { observe } from '../observations/index.ts';
import { analyzeDecision, chooseAction, POLICY_VERSION } from '../strategy/index.ts';
import { explain } from '../coaching/templates.ts';
import { sampleWorld } from '../strategy/sampler.ts';
import {
  assertSpadesConservation,
  bidAll,
  contractMadeNil,
  certainNilFailureBeforeFourth,
  kingWinsWithUnseenAce,
  partnerRuffAndOverruff,
  playSequence,
  rotateSpadesFixture,
  spadesDeal,
  threatenedPartnerWinner,
  type SpadesMode,
} from './support/spades-fixtures.ts';

function fourthSeatHearts(bids: Four<number>, hand: Card[] = ['H2', 'HA'], mode: SpadesMode = 'spades-solo') {
  return playSequence(bidAll(spadesDeal([hand, ['H3'], ['HK'], ['H4']], mode, 0), bids), ['H3', 'HK', 'H4']);
}

function inspect(state: PrivateGame) {
  assertSpadesConservation(state);
  assert.notEqual(state.turn, null);
  const obs = observe(state, state.turn!);
  const before = structuredClone(obs);
  const analysis = analyzeDecision(obs);
  assert.deepEqual(obs, before, 'Reasoning must preserve its frozen observation.');
  assert.deepEqual(analysis.action, chooseAction(obs));
  assert.equal(analysis.policyVersion, POLICY_VERSION);
  assert.ok(obs.legalActions.some((action) => actionId(action) === actionId(analysis.action)));
  assert.equal(analysis.candidates.length, obs.legalActions.length);
  assert.equal(
    new Set(analysis.candidates.map((candidate) => actionId(candidate.action))).size,
    obs.legalActions.length,
  );
  return { obs, analysis };
}

test('SPADES S01: all legal bids/cards survive reasoning; unbroken spades cannot be led with side suits', () => {
  const bidState = spadesDeal([['S2', 'C2'], [], [], []], 'spades-solo');
  const bid = inspect(bidState);
  assert.equal(bid.obs.legalActions.length, 14);
  const state = bidAll(bidState, [2, 2, 2, 2]);
  const { obs, analysis } = inspect(state);
  assert.ok(obs.legalActions.every((action) => action.kind === 'play' && !action.card.startsWith('S')));
  assert.equal(analysis.facts.partner, null);
});

test('SPADES S02: off-suit play proves only the led-suit void; declining to trump proves no spade void', () => {
  const suits = ['C', 'D', 'H', 'S'];
  const state = playSequence(
    bidAll(
      spadesDeal(
        suits.map((suit) => fullDeck().filter((card) => card[0] === suit)) as Four<Card[]>,
        'spades-solo',
      ),
      [2, 2, 2, 2],
    ),
    ['CA', 'D2'],
  );
  const { analysis } = inspect(state);
  assert.ok(analysis.facts.voids.C.includes(1));
  assert.ok(!analysis.facts.voids.S.includes(1));
});

test('SPADES S03: a king winning never locates the unplayed ace or proves a follower void', () => {
  const state = collectTrick(kingWinsWithUnseenAce());
  const { analysis } = inspect(state);
  assert.deepEqual(analysis.facts.possibleOwners.find((entry) => entry.card === 'HA')?.seats, [1, 2, 3]);
  assert.deepEqual(analysis.facts.voids.H, []);
  for (const seat of [1, 2, 3] as Seat[]) {
    const alternate = structuredClone(state);
    if (seat !== 1) {
      const ownIndex = alternate.hands[1].indexOf('HA');
      const otherIndex = alternate.hands[seat].indexOf(seat === 2 ? 'H7' : 'H8');
      [alternate.hands[1][ownIndex], alternate.hands[seat][otherIndex]] = [
        alternate.hands[seat][otherIndex],
        alternate.hands[1][ownIndex],
      ];
    }
    assertSpadesConservation(alternate);
    assert.ok(alternate.hands[seat].includes('HA'));
    assert.deepEqual(observe(alternate, 0), observe(state, 0));
    assert.deepEqual(analyzeDecision(observe(alternate, 0)), analysis);
  }
});

test('SPADES S03/S13: extreme public bids do not change exact possible ownership', () => {
  const ordinary = inspect(collectTrick(kingWinsWithUnseenAce())).analysis;
  const extreme = inspect(collectTrick(kingWinsWithUnseenAce([2, 13, 0, 1]))).analysis;
  assert.deepEqual(extreme.facts.possibleOwners, ordinary.facts.possibleOwners);
  assert.deepEqual(extreme.facts.voids, ordinary.facts.voids);
});

test('SPADES S01/S09: reached singleton is forced and correctly identifies the next bag penalty', () => {
  const state = bidAll(
    spadesDeal(
      ['S', 'C', 'D', 'H'].map((suit) => fullDeck().filter((card) => card[0] === suit)) as Four<Card[]>,
      'spades-solo',
    ),
    [3, 3, 3, 3],
  );
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const reached = collectTrick(
    playSequence(
      state,
      ranks.flatMap((rank) => ['S', 'C', 'D', 'H'].map((suit) => suit + rank)),
    ),
  );
  const { obs, analysis } = inspect(reached);
  assert.equal(obs.legalActions.length, 1);
  assert.equal(analysis.provenance, 'forced');
  assert.equal(explain(obs).provenance, 'forced');
  assert.equal(analysis.facts.bagRoom, 1);
  assert.equal(analysis.facts.nextOrdinaryBagDelta, -99);
});

test('SPADES S04: a side-suit ace is not a guaranteed trick with an unknown later player', () => {
  const state = playSequence(
    bidAll(spadesDeal([['H2', 'HA'], ['S2'], ['HK'], ['H3']], 'spades-solo', 1), [2, 2, 2, 2]),
    ['HK', 'H3'],
  );
  const { analysis } = inspect(state);
  const outcome = analysis.facts.cardOutcomes.find((entry) => entry.actionId === 'play:HA');
  assert.equal(outcome?.currentWinner, 0);
  assert.equal(outcome?.guaranteedWinner, null);
  assert.ok(outcome?.canBeOvertakenBy.includes(1));
});

test('SPADES S04/S05: final-seat safe underplay protects a live solo Nil', () => {
  const state = fourthSeatHearts([0, 2, 2, 2]);
  const { analysis } = inspect(state);
  assert.equal(analysis.facts.ownNil, 'live');
  assert.deepEqual(analysis.action, { kind: 'play', seat: 0, card: 'H2' });
  assert.equal(
    analysis.facts.cardOutcomes.find((entry) => entry.actionId === 'play:H2')?.guaranteedWinner,
    2,
  );
  assert.equal(apply(state, analysis.action).tricks[0], 0);
});

test('SPADES S06: when every final-seat play wins, Nil failure is exact and unavoidable', () => {
  const state = playSequence(
    bidAll(spadesDeal([['HK', 'HA'], ['H2'], ['H3'], ['H4']], 'spades-solo', 0), [0, 2, 2, 2]),
    ['H2', 'H3', 'H4'],
  );
  const { analysis } = inspect(state);
  assert.ok(analysis.facts.cardOutcomes.every((entry) => entry.guaranteedWinner === 0));
  for (const action of observe(state, 0).legalActions) {
    assert.notEqual(action.kind, 'pass');
    if (action.kind !== 'pass') assert.equal(apply(state, action).tricks[0], 1);
  }
});

test('SPADES S06: a forced ace of trump proves Nil failure before fourth seat', () => {
  const { analysis } = inspect(certainNilFailureBeforeFourth());
  assert.equal(analysis.facts.ownNil, 'live');
  assert.deepEqual(analysis.facts.actorsAfter, [1]);
  assert.equal(analysis.candidates.length, 1);
  assert.equal(analysis.facts.cardOutcomes[0].guaranteedWinner, 0);
  assert.doesNotMatch(
    analysis.reasons.map((reason) => reason.text).join(' '),
    /failure is not yet certain|rescue is uncertain|may still overtake you/i,
  );
});

test('SPADES S09: ninth-to-tenth ordinary bag has exact marginal value -99, independent of tactical choice', () => {
  const made = scoreCompetitor({ bids: [3], tricks: [3], oldBags: 9 });
  const extra = scoreCompetitor({ bids: [3], tricks: [4], oldBags: 9 });
  assert.equal(extra.delta - made.delta, -99);
  assert.equal(extra.bags, 0);
  assert.equal(scoreCompetitor({ bids: [3], tricks: [4], oldBags: 8 }).delta - made.delta, 1);
});

test('SPADES P02/P12: reached contract-made position covers live partner Nil; solo treats opposite as opponent', () => {
  const partner = contractMadeNil();
  assert.deepEqual(partner.tricks, [1, 1, 0, 0]);
  const { analysis } = inspect(partner);
  assert.equal(analysis.facts.partner, 2);
  assert.equal(analysis.facts.partnerNil, 'live');
  assert.equal(analysis.facts.contractNeeded, 0);
  assert.deepEqual(analysis.action, { kind: 'play', seat: 0, card: 'HA' });
  assert.equal(
    analysis.facts.cardOutcomes.find((entry) => entry.actionId === 'play:HA')?.coversPartnerNil,
    true,
  );
  assert.equal(apply(partner, { kind: 'play', seat: 0, card: 'H2' }).tricks[2], 1);
  assert.equal(apply(partner, { kind: 'play', seat: 0, card: 'HA' }).tricks[2], 0);
  const solo = inspect(contractMadeNil('spades-solo'));
  assert.equal(solo.analysis.facts.partner, null);
  assert.equal(solo.analysis.facts.partnerNil, null);
  assert.deepEqual(solo.analysis.action, { kind: 'play', seat: 0, card: 'H2' });
  assert.doesNotMatch(JSON.stringify(explain(solo.obs)), /partner|your team/i);
});

test('SPADES P02: overtaking Nil partner protects partner even when a later opponent may trump', () => {
  const state = playSequence(
    bidAll(spadesDeal([['H2', 'HA'], ['S2'], ['HK'], ['H3']], 'spades-partners', 1), [2, 2, 0, 2]),
    ['HK', 'H3'],
  );
  const { analysis } = inspect(state);
  const cover = analysis.facts.cardOutcomes.find((entry) => entry.actionId === 'play:HA');
  assert.equal(cover?.coversPartnerNil, true);
  assert.equal(cover?.guaranteedWinner, null);
  assert.deepEqual(analysis.action, { kind: 'play', seat: 0, card: 'HA' });
  for (let seed = 0; seed < 16; seed++) {
    const sampled = sampleWorld(observe(state, 0), seed);
    const afterCover = apply(sampled, { kind: 'play', seat: 0, card: 'HA' });
    for (const action of observe(afterCover, 1).legalActions) {
      assert.notEqual(action.kind, 'pass');
      if (action.kind !== 'pass')
        assert.notEqual(trickWinner(apply(afterCover, action).trick, state.mode), 2);
    }
  }
});

test('SPADES P03: no legal covering card is factual; a live Nil partner is not praised as a winner', () => {
  const state = fourthSeatHearts([2, 2, 0, 2], ['H2', 'HQ'], 'spades-partners');
  const { obs, analysis } = inspect(state);
  assert.ok(analysis.facts.cardOutcomes.every((entry) => !entry.coversPartnerNil));
  assert.ok(analysis.facts.cardOutcomes.every((entry) => entry.guaranteedWinner === 2));
  assert.match(explain(obs).reason, /No legal card|cannot cover|no covering/i);
});

test('SPADES P03: a partner Nil already winning with SA cannot be rescued by a later opponent', () => {
  const state = playSequence(
    bidAll(
      spadesDeal(
        ['C', 'D', 'S', 'H'].map((suit) => fullDeck().filter((card) => card[0] === suit)) as Four<Card[]>,
        'spades-partners',
        1,
      ),
      [3, 3, 0, 3],
    ),
    ['SA', 'H2'],
  );
  const { analysis } = inspect(state);
  assert.equal(analysis.facts.partnerNil, 'live');
  assert.deepEqual(analysis.facts.actorsAfter, [1]);
  assert.ok(analysis.facts.cardOutcomes.every((entry) => entry.guaranteedWinner === 2));
  assert.doesNotMatch(
    analysis.reasons.find((reason) => reason.id === 'P03.no-cover')?.text ?? '',
    /may still rescue/i,
  );
});

test('SPADES P04: both-Nil analysis identifies two commitments without claiming a universal winning choice', () => {
  const { analysis } = inspect(fourthSeatHearts([0, 2, 0, 2], ['H2', 'HA'], 'spades-partners'));
  assert.equal(analysis.facts.ownNil, 'live');
  assert.equal(analysis.facts.partnerNil, 'live');
  assert.equal(analysis.facts.contractBid, 0);
  assert.equal(analysis.candidates.length, 2);
});

test('SPADES P05/P10: failed Nil tricks never satisfy a positive partner contract', () => {
  const state = playSequence(
    bidAll(spadesDeal([['CA'], ['C2'], ['C3'], ['C4']], 'spades-partners'), [0, 2, 3, 2]),
    ['CA', 'C2', 'C3', 'C4'],
  );
  const { analysis } = inspect(collectTrick(state));
  assert.equal(analysis.facts.ownNil, 'failed');
  assert.equal(analysis.facts.contractBid, 3);
  assert.equal(analysis.facts.creditedTricks, 0);
  assert.equal(analysis.facts.contractNeeded, 3);
  assert.equal(scoreCompetitor({ bids: [0, 3], tricks: [1, 2], oldBags: 0 }).delta, -130);
});

test('SPADES P07: a publicly proved spade void cannot become a possible partner ruff', () => {
  const state = playSequence(
    bidAll(
      spadesDeal(
        ['S', 'C', 'D', 'H'].map((suit) => fullDeck().filter((card) => card[0] === suit)) as Four<Card[]>,
      ),
      [3, 3, 3, 3],
    ),
    ['S2', 'C2', 'D2', 'H2'],
  );
  const { analysis } = inspect(collectTrick(state));
  assert.ok(analysis.facts.voids.S.includes(2));
  assert.ok(
    analysis.facts.possibleOwners
      .filter((entry) => entry.card.startsWith('S'))
      .every((entry) => !entry.seats.includes(2)),
  );
});

test('SPADES P06: public partner void permits a ruff but a later opponent can overruff', () => {
  const state = partnerRuffAndOverruff();
  const { analysis } = inspect(state);
  assert.ok(analysis.facts.voids.C.includes(2));
  assert.ok(analysis.facts.voids.C.includes(3));
  assert.ok(
    analysis.facts.possibleOwners.some((entry) => entry.card.startsWith('S') && entry.seats.includes(2)),
  );
  assert.ok(analysis.scenarioIds.includes('P06'));
  const offer = analysis.reasons.find((reason) => reason.id === 'P06.offer-ruff');
  assert.equal(offer?.kind, 'heuristic');
  assert.match(offer?.text ?? '', /overruff/i);
  const completed = playSequence(state, ['C2', 'H3', 'S2', 'S9']);
  assert.equal(completed.history.at(-1)?.winner, 3);
  assertSpadesConservation(completed);
});

test('SPADES P09: cover removes a possible opponent threat to partner while a credited contract is needed', () => {
  const state = threatenedPartnerWinner();
  const { analysis } = inspect(state);
  assert.equal(analysis.facts.currentWinner, 2);
  assert.ok((analysis.facts.contractNeeded ?? 0) > 0);
  assert.equal(analysis.facts.playedCards.filter((card) => card.startsWith('S')).length, 13);
  const duck = analysis.facts.cardOutcomes.find((entry) => entry.actionId === 'play:H2');
  const cover = analysis.facts.cardOutcomes.find((entry) => entry.actionId === 'play:HA');
  assert.ok(duck?.canBeOvertakenBy.includes(1));
  assert.equal(duck?.guaranteedWinner, null);
  assert.equal(cover?.guaranteedWinner, 0);
  assert.deepEqual(analysis.action, { kind: 'play', seat: 0, card: 'HA' });
  assert.ok(
    analysis.candidates
      .find((candidate) => candidate.disposition === 'selected')
      ?.reasonIds.includes('P09.protect-partner'),
  );
  assert.equal(playSequence(state, ['H2', 'HK']).history.at(-1)?.winner, 1);
  assert.equal(playSequence(state, ['HA', 'HK']).history.at(-1)?.winner, 0);
});

test('SPADES invariance: reachable seat rotations preserve selected card and scenario reasoning', () => {
  for (const mode of ['spades-solo', 'spades-partners'] as const) {
    const source = contractMadeNil(mode);
    const original = inspect(source).analysis;
    for (let offset = 1; offset < 4; offset++) {
      const rotated = inspect(rotateSpadesFixture(source, offset)).analysis;
      assert.equal(actionId(rotated.action), actionId(original.action));
      assert.equal(rotated.action.seat, offset);
      assert.deepEqual(rotated.scenarioIds, original.scenarioIds);
      assert.deepEqual(
        rotated.reasons.map((reason) => reason.id),
        original.reasons.map((reason) => reason.id),
      );
    }
  }
});

test('SPADES shared result: coach and bot select the identical action and policy from the same observation', () => {
  for (const state of [contractMadeNil(), contractMadeNil('spades-solo'), fourthSeatHearts([0, 2, 2, 2])]) {
    const { obs, analysis } = inspect(state);
    const advice = explain(obs);
    assert.equal(analysis.action.kind, 'play');
    if (analysis.action.kind === 'play') assert.equal(advice.card, analysis.action.card);
    assert.equal(advice.policyVersion, analysis.policyVersion);
    assert.equal(advice.provenance, analysis.provenance);
    assert.deepEqual(
      advice.reasonIds,
      analysis.candidates.find((candidate) => candidate.disposition === 'selected')?.reasonIds,
    );
    assert.doesNotMatch(JSON.stringify(advice), /\d+(?:\.\d+)?%|win probability|guaranteed best/i);
  }
});
