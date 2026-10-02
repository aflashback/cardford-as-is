import assert from 'node:assert/strict';
import test from 'node:test';
import { apply, collectTrick, actionId, cardSuit, trickWinner, legalActions, type Card, type GameAction, type PrivateGame, type Suit } from '../game/index.ts';
import { getMemory, observe, type SeatObservation } from '../observations/index.ts';
import { analyzeDecision, listReasoningProfiles, costOf, getReasoningProfile, getLegacyReasoningProfile, type ReasonClaim } from '../strategy/index.ts';
import { explain } from '../coaching/templates.ts';
import { checkSpadesClaims } from '../games/spades/evaluation/claims/check.ts';
import { COPY_BUDGET } from '../coaching/types.ts';
import { sourceState, observedSources } from './support/observed-spades.ts';
import { bidAll, spadesDeal, playSequence, rotateSpadesFixture } from './support/spades-fixtures.ts';

const POLICY = 'spades-cases-4.0.0';
const candidate = (obs: SeatObservation) => analyzeDecision(obs, POLICY);
const inspect = (state: PrivateGame) => {
  const obs = observe(state, state.turn!);
  const analysis = candidate(obs);
  return { obs, analysis, advice: explain(obs, analysis) };
};
const matched = (obs: SeatObservation, id: string) => candidate(obs).scenarioIds.includes(id);
const applyLegal = (state: PrivateGame, action: GameAction) => {
  assert.ok(action.kind !== 'pass', 'Spades fixtures have no pass action');
  return apply(state, action);
};

test('CASE-06 registers an inline selectable profile while retaining the live default', () => {
  assert.ok(listReasoningProfiles('spades-solo').includes(POLICY));
  assert.equal(costOf(getReasoningProfile(POLICY, 'spades-partners')), 'inline');
  const obs = observe(sourceState('bid-lower-bound'), 0);
  assert.equal(analyzeDecision(obs).policyVersion, 'spades-tactics-2.1.0');
  assert.equal(candidate(obs).trace?.catalogVersion, 'spades-cases-1.0.0');
  assert.equal(getLegacyReasoningProfile('spades-solo').policyVersion, 'spades-tactics-2.1.0');
  assert.equal(getLegacyReasoningProfile('spades-partners').policyVersion, 'spades-tactics-2.1.0');
  assert.equal(getLegacyReasoningProfile('hearts').policyVersion, 'hearts-baseline-1.0.0');
  assert.throws(() => getLegacyReasoningProfile('unknown-game'));
});

test('CASE-01 rejects a retained spade that cannot guarantee entry and a second own side suit', () => {
  for (const [own, otherSeat, other] of [['SJ', 2, 'S5'], ['H4', 1, 'C3']] as const) {
    const alternate = sourceState('partner-resource');
    alternate.hands[0][alternate.hands[0].indexOf(own)] = other;
    alternate.hands[otherSeat][alternate.hands[otherSeat].indexOf(other)] = own;
    const state = rotateSpadesFixture(alternate, 0);
    const { analysis } = inspect(state);
    assert.equal(analysis.facts.knowledgeComplete, true);
    assert.equal(analysis.scenarioIds.includes('CASE-01'), false);
    const checked = checkSpadesClaims(state, 0, [{ predicate: 'case-partner-resource', args: { partner: 2, suit: 'H', entry: 'S10' } }]);
    assert.equal(checked.falseClaims.length, 1);
  }
});

test('CASE-01 offers a partner ruff instead of drawing their trump and keeps an unbeatable entry', () => {
  for (const id of ['partner-resource', 'partner-resource-last-entry']) {
    const { analysis, advice } = inspect(sourceState(id));
    assert.ok(analysis.scenarioIds.includes('CASE-01'));
    assert.equal(analysis.action.kind, 'play');
    if (analysis.action.kind === 'play') assert.equal(cardSuit(analysis.action.card), 'H');
    assert.ok(analysis.trace?.candidates.find((entry) => entry.actionId === actionId(analysis.action))?.effects.some((effect) => effect.id === 'CASE-01.preserve-partner-trump'));
    assert.match(advice.reason, /partner can win with a spade/);
    assert.equal(analysis.trace?.selectedActionId, actionId(analysis.action));
    assert.deepEqual(analysis.candidates.filter((entry) => entry.disposition === 'selected').map((entry) => actionId(entry.action)), [actionId(analysis.action)]);
  }
});

test('CASE-01 rejects reachable missing partner void, uncertain opponent trump, and absent own entry', () => {
  for (const id of ['partner-not-yet-void', 'opponent-trump-not-excluded', 'partner-resource-no-entry']) {
    const { analysis } = inspect(sourceState(id));
    assert.equal(analysis.facts.knowledgeComplete, true);
    assert.equal(analysis.scenarioIds.includes('CASE-01'), false, id);
  }
});

test('CASE-01 rejects Solo, either Nil, fulfilled contract and missing public trump proof', () => {
  for (const mode of ['spades-solo', 'spades-partners'] as const) {
    const state = sourceState('partner-resource', (episode) => { episode.mode = mode; });
    if (mode === 'spades-solo') assert.equal(matched(observe(state, 0), 'CASE-01'), false);
  }
  for (const bids of [[0, 3, 4, 3], [8, 3, 0, 3], [2, 3, 2, 3]]) {
    const obs = observe(sourceState('partner-resource'), 0);
    obs.bids = bids;
    assert.equal(matched(obs, 'CASE-01'), false);
  }
  const incomplete = observe(sourceState('partner-resource'), 0);
  incomplete.history = [];
  incomplete.events = [];
  incomplete.memory = getMemory(incomplete);
  assert.equal(matched(incomplete, 'CASE-01'), false);
});

test('CASE-01 preserves opposing live and failed Nil priorities in reachable positions', () => {
  const nilOpening = sourceState('partner-resource');
  nilOpening.bids[3] = 0;
  const live = rotateSpadesFixture(nilOpening, 0);
  const failed = collectTrick(playSequence(live, ['H4', 'HK', 'C2', 'HA', 'D4', 'SJ', 'D5', 'DQ']));
  assert.equal(live.tricks[3], 0);
  assert.equal(failed.tricks[3], 1);
  for (const state of [live, failed]) {
    const { analysis } = inspect(state);
    assert.equal(analysis.facts.knowledgeComplete, true);
    assert.equal(analysis.scenarioIds.includes('CASE-01'), false);
    const entry = state === live ? 'SJ' : 'S10';
    const checked = checkSpadesClaims(state, 0, [{ predicate: 'case-partner-resource', args: { partner: 2, suit: 'H', entry } }]);
    assert.equal(checked.falseClaims.length, 1);
  }
});

test('CASE-02 no-entry proof suppresses an impossible contract plan without claiming team failure', () => {
  const { analysis, advice } = inspect(sourceState('no-entry'));
  assert.ok(analysis.scenarioIds.includes('CASE-02'));
  assert.equal(analysis.schemaVersion, '1.1.0');
  if (analysis.schemaVersion !== '1.1.0') return;
  assert.equal(analysis.decision.planSupported, false);
  assert.equal(analysis.decision.coach.explanation, 'facts-only');
  assert.ok(!analysis.reasons.some((reason) => reason.id === 'PLAN.stance'));
  assert.match(advice.notice, /cannot win another trick/);
  assert.doesNotMatch(JSON.stringify(advice), /make your contract|keep.*higher.*later/i);
  const partnerState = sourceState('no-entry', (episode) => { episode.mode = 'spades-partners'; });
  const partnerCue = inspect(partnerState).advice;
  assert.doesNotMatch(partnerCue.notice, /team.*cannot|team.*out of reach/);
});

test('CASE-02 proof is removed on lead, with one outside suit card, or with incomplete history', () => {
  const state = sourceState('no-entry');
  let led = sourceState('sweep-forced');
  while (led.phase !== 'trick-end') led = applyLegal(led, legalActions(led, led.turn!)[0]);
  led = collectTrick(led);
  const onLead = observe(led, led.turn!);
  assert.ok(onLead.hand.every((card) => cardSuit(card) === 'H'));
  assert.equal(candidate(onLead).facts.knowledgeComplete, true);
  assert.equal(matched(onLead, 'CASE-02'), false);
  const changed = sourceState('no-entry-outside-heart');
  assert.equal(matched(observe(changed, changed.turn!), 'CASE-02'), false);
  const incomplete = observe(state, 0);
  incomplete.history = [];
  incomplete.events = [];
  incomplete.memory = getMemory(incomplete);
  assert.equal(matched(incomplete, 'CASE-02'), false);
});

test('CASE-03 public sweep gives equivalent defender discards without a preferred card', () => {
  const { analysis, advice } = inspect(sourceState('sweep'));
  assert.ok(analysis.scenarioIds.includes('CASE-03'));
  assert.equal(advice.outcome, 'several-reasonable');
  assert.equal(advice.card, undefined);
  assert.match(advice.suggestion, /same result/);
  assert.doesNotMatch(JSON.stringify(advice), /make.*contract|keep.*later/i);
  assert.equal(analysis.schemaVersion, '1.1.0');
  if (analysis.schemaVersion === '1.1.0') {
    assert.equal(analysis.decision.comparableActionIds.length, analysis.candidates.length - 1);
    assert.equal(analysis.decision.planSupported, false);
  }
});

test('CASE-03 first proven position remains forced; earlier public position proves no sweep', () => {
  const { analysis, advice } = inspect(sourceState('sweep-forced'));
  assert.ok(analysis.scenarioIds.includes('CASE-03'));
  assert.equal(analysis.provenance, 'forced');
  assert.equal(advice.provenance, 'forced');
  assert.equal(advice.outcome, 'suggestion');
  assert.equal(advice.card, 'S9');
  assert.equal(inspect(sourceState('sweep-earlier')).analysis.scenarioIds.includes('CASE-03'), false);
});

test('CASE-03 no-entry by itself does not assert all other outcomes equivalent', () => {
  const { analysis, advice } = inspect(sourceState('no-entry'));
  assert.ok(analysis.scenarioIds.includes('CASE-02'));
  assert.equal(analysis.scenarioIds.includes('CASE-03'), false);
  assert.notEqual(advice.outcome, 'several-reasonable');
});

test('CASE-03 a fixed next winner with another remaining suit or trump cannot prove a sweep', () => {
  const mixed = sourceState('no-entry-outside-heart');
  const mixedAnalysis = inspect(mixed).analysis;
  assert.ok(mixedAnalysis.facts.cardOutcomes.every((outcome) => outcome.guaranteedWinner === 1));
  assert.ok(mixed.hands[1].some((card) => cardSuit(card) === 'C') && mixed.hands[1].some((card) => cardSuit(card) === 'D'));
  assert.ok(!mixedAnalysis.facts.outstandingCards.some((card) => cardSuit(card) === 'S'));
  assert.equal(mixedAnalysis.scenarioIds.includes('CASE-03'), false);
  assert.equal(checkSpadesClaims(mixed, mixed.turn!, [{ predicate: 'case-public-sweep', args: { winner: 1, suit: 'C' } }]).falseClaims.length, 1);

  const outsideTrump = sourceState('sweep-forced');
  outsideTrump.hands[0][outsideTrump.hands[0].indexOf('H6')] = 'S9';
  outsideTrump.hands[2][outsideTrump.hands[2].indexOf('S9')] = 'H6';
  const replayed = rotateSpadesFixture(outsideTrump, 0);
  const { analysis } = inspect(replayed);
  assert.ok(analysis.facts.cardOutcomes.every((outcome) => outcome.guaranteedWinner === 0));
  assert.ok(analysis.facts.possibleOwners.some((entry) => entry.card === 'S9' && entry.seats.includes(0)));
  assert.equal(analysis.scenarioIds.includes('CASE-03'), false);
  assert.equal(checkSpadesClaims(replayed, replayed.turn!, [{ predicate: 'case-public-sweep', args: { winner: 0, suit: 'H' } }]).falseClaims.length, 1);
});

test('CASE-03 every candidate preserves the sweep against contrasting complete legal continuations', () => {
  for (const mode of ['spades-solo', 'spades-partners'] as const) {
    const source = sourceState('sweep', (episode) => { episode.mode = mode; });
    for (const action of legalActions(source, source.turn!)) {
      for (const reverse of [false, true]) {
        let state = applyLegal(source, action);
        while (state.phase === 'play' || state.phase === 'trick-end') {
          if (state.phase === 'trick-end') {
            assert.equal(trickWinner(state.trick, state.mode), 0);
            state = collectTrick(state);
          } else {
            const choices = legalActions(state, state.turn!);
            state = applyLegal(state, reverse ? choices.at(-1)! : choices[0]);
          }
        }
        assert.deepEqual(state.tricks, [11, 1, 0, 1]);
        assert.deepEqual(state.handResult?.points, mode === 'spades-solo' ? [92, 10, -10, -30] : [101, -40, 101, -40]);
      }
    }
  }
});

test('CASE-02 public no-entry proof holds over complete legal continuations', () => {
  for (const reverse of [false, true]) {
    let state = sourceState('no-entry');
    const originalTricks = state.tricks[0];
    while (state.phase === 'play' || state.phase === 'trick-end') {
      if (state.phase === 'trick-end') state = collectTrick(state);
      else {
        const choices = legalActions(state, state.turn!);
        state = applyLegal(state, reverse ? choices.at(-1)! : choices[0]);
      }
    }
    assert.equal(state.tricks[0], originalTricks);
  }
});

test('CASE claims reject forged no-entry, sweep and partner-entry assertions independently', () => {
  const cases: { id: string; claim: ReasonClaim }[] = [
    { id: 'no-entry-outside-heart', claim: { predicate: 'case-no-entry', args: { suit: 'H' } } },
    { id: 'sweep-earlier', claim: { predicate: 'case-public-sweep', args: { winner: 0, suit: 'H' } } },
    { id: 'partner-resource', claim: { predicate: 'case-partner-resource', args: { partner: 2, suit: 'H', entry: 'H4' } } },
  ];
  for (const entry of cases) {
    const state = sourceState(entry.id);
    const result = checkSpadesClaims(state, state.turn!, [entry.claim]);
    assert.equal(result.falseClaims.length, 1);
  }
});

test('CASE-04 selected unbeatable side-suit lead eliminates impossible trump wording', () => {
  const { obs, analysis, advice } = inspect(sourceState('unbeatable-lead'));
  assert.deepEqual(analysis.action, { kind: 'play', seat: 2, card: 'DK' });
  assert.match(advice.reason, /cannot.*beat|unbeatable/i);
  assert.doesNotMatch(advice.reason, /only a spade|possible.*ruff/);
  const different = structuredClone(analysis);
  different.action = obs.legalActions.find((action) => action.kind === 'play' && action.card === 'D3') ?? obs.legalActions.find((action) => action.kind === 'play' && action.card === 'C2')!;
  for (const entry of different.candidates) entry.disposition = actionId(entry.action) === actionId(different.action) ? 'selected' : 'alternative';
  assert.doesNotMatch(explain(obs, different).reason, /cannot.*beat|unbeatable/i);
});

test('CASE-04 retains live own and partner Nil cue priority even with several unbeatable leads', () => {
  const spades = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map((rank) => 'S' + rank);
  for (const bids of [[0, 3, 3, 3], [3, 3, 0, 3]] as const) {
    const state = bidAll(spadesDeal([spades, [], [], []], 'spades-partners'), [...bids]);
    const { analysis, advice } = inspect(state);
    assert.ok(analysis.facts.cardOutcomes.every((outcome) => outcome.guaranteedWinner === 0));
    assert.equal(analysis.scenarioIds.includes('CASE-04'), false);
    assert.match(advice.notice, /Nil.*live/);
    assert.doesNotMatch(advice.focus, /Unbeatable/);
  }
});

test('CASE-01..04 new cues stay within copy budgets and name their actual case reasons', () => {
  for (const [id, reason] of [['partner-resource', 'CASE-01.preserve-partner-trump'], ['no-entry', 'CASE-02.no-entry'], ['sweep', 'CASE-03.public-sweep'], ['sweep-forced', 'CASE-03.public-sweep'], ['unbeatable-lead', 'CASE-04.unbeatable-lead']]) {
    const { analysis, advice } = inspect(sourceState(id));
    for (const level of Object.keys(COPY_BUDGET) as (keyof typeof COPY_BUDGET)[])
      assert.ok(advice[level].trim().split(/\s+/).length <= COPY_BUDGET[level], `${id}:${level}`);
    assert.ok(advice.reasonIds.includes(reason));
    assert.ok(advice.reasonIds.every((entry) => analysis.reasons.some((item) => item.id === entry)));
    assert.ok(!advice.reasonIds.includes('PLAN.stance'));
  }
});

test('CASE-05 source cases retain bidding, public ownership and Nil facts', () => {
  for (const id of ['bid-lower-bound', 'nil-underplay', 'withheld-honor', 'ownership-counterexample', 'partner-threat']) {
    const state = sourceState(id);
    const obs = observe(state, state.turn!);
    const old = analyzeDecision(obs, 'spades-plan-3.0.0');
    const fresh = candidate(obs);
    assert.deepEqual(fresh.facts, old.facts);
    assert.deepEqual(fresh.action, old.action);
  }
  const { analysis } = inspect(sourceState('bid-lower-bound'));
  assert.deepEqual(analysis.action, { kind: 'bid', seat: 0, bid: 5 });
});

test('CASE-06 source hashes and reachable prefixes cover every saved experiment family', () => {
  assert.equal(new Set(observedSources.map((entry) => entry.batch)).size, 3);
  for (const entry of observedSources) assert.ok(sourceState(entry.id));
});

test('CASE-01..04 seat rotations preserve actions and factual cue claims', () => {
  for (const id of ['partner-resource', 'no-entry', 'sweep', 'unbeatable-lead']) {
    const source = sourceState(id);
    const original = inspect(source);
    for (const offset of [1, 2, 3]) {
      const state = rotateSpadesFixture(source, offset);
      const rotated = inspect(state);
      assert.equal(actionId(rotated.analysis.action), actionId(original.analysis.action));
      assert.deepEqual(rotated.analysis.scenarioIds, original.analysis.scenarioIds);
      const checked = checkSpadesClaims(state, state.turn!, rotated.advice.claims ?? []);
      assert.deepEqual(checked.falseClaims, []);
      assert.equal(checked.notCheckable, 0);
    }
  }
});

test('CASE-01..04 side-suit renaming preserves public predicates and independently checked cues', () => {
  const suits: Record<Suit, Suit> = { C: 'D', D: 'H', H: 'C', S: 'S' };
  const rename = (card: Card) => suits[cardSuit(card)] + card.slice(1);
  for (const id of ['partner-resource', 'no-entry', 'sweep', 'unbeatable-lead']) {
    const source = sourceState(id);
    const original = inspect(source);
    const renamed = structuredClone(source);
    for (const hand of renamed.hands) hand.splice(0, hand.length, ...hand.map(rename));
    for (const trick of renamed.history) for (const play of trick.plays) play.card = rename(play.card);
    for (const play of renamed.trick) play.card = rename(play.card);
    const reached = rotateSpadesFixture(renamed, 0);
    const fresh = inspect(reached);
    assert.deepEqual(fresh.analysis.scenarioIds.filter((entry) => entry.startsWith('CASE-')), original.analysis.scenarioIds.filter((entry) => entry.startsWith('CASE-')));
    assert.deepEqual(checkSpadesClaims(reached, reached.turn!, fresh.advice.claims ?? []).falseClaims, []);
    if (id === 'partner-resource' && original.analysis.action.kind === 'play' && fresh.analysis.action.kind === 'play')
      assert.equal(fresh.analysis.action.card, rename(original.analysis.action.card));
  }
});

test('CASE-01..04 changing compatible concealed cards cannot affect the seat analysis or cue', () => {
  for (const id of ['partner-resource', 'no-entry', 'sweep', 'unbeatable-lead']) {
    const state = sourceState(id);
    const actor = state.turn!;
    const others = [0, 1, 2, 3].filter((seat) => seat !== actor);
    const alternate = structuredClone(state);
    const a = others[0], b = others[1];
    const cardA = alternate.hands[a].find((card) => alternate.hands[b].some((other) => cardSuit(other) === cardSuit(card)));
    if (!cardA) continue;
    const cardB = alternate.hands[b].find((card) => cardSuit(card) === cardSuit(cardA))!;
    alternate.hands[a][alternate.hands[a].indexOf(cardA)] = cardB;
    alternate.hands[b][alternate.hands[b].indexOf(cardB)] = cardA;
    const replayed = rotateSpadesFixture(alternate, 0);
    assert.deepEqual(observe(replayed, actor), observe(state, actor));
    assert.deepEqual(inspect(replayed), inspect(state));
  }
});
