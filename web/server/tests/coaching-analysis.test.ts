import assert from 'node:assert/strict';
import test from 'node:test';
import { collectTrick, createGame, fullDeck } from '../game/index.ts';
import { bidAll, contractMadeNil, playSequence, spadesDeal } from './support/spades-fixtures.ts';
import { observe } from '../observations/index.ts';
import { analyzeDecision } from '../strategy/index.ts';
import { explain } from '../coaching/templates.ts';

function bidDecision() {
  const state = createGame({ id: 'coach-analysis', mode: 'spades-solo', dealer: 3 }, fullDeck());
  const observation = observe(state, 0);
  return { observation, analysis: analyzeDecision(observation) };
}

test('STRAT-07: coach preserves selected reason order independently of the analysis catalog order', () => {
  const { observation, analysis } = bidDecision();
  const selected = analysis.candidates.find((candidate) => candidate.disposition === 'selected')!;
  selected.reasonIds = ['fixture.first', 'fixture.second'];
  analysis.reasons = [
    { id: 'fixture.second', kind: 'heuristic', text: 'The alternative depends on future play.' },
    { id: 'fixture.first', kind: 'fact', text: 'The current contract is public.' },
  ];
  const advice = explain(observation, analysis);
  assert.equal(advice.reason, 'The current contract is public. The alternative depends on future play.');
  assert.deepEqual(advice.reasonIds, ['fixture.first', 'fixture.second']);
});

test('COACH-09: expanded authored evidence fits the public advice limit without losing internal reason IDs', () => {
  const { observation, analysis } = bidDecision();
  const selected = analysis.candidates.find((candidate) => candidate.disposition === 'selected')!;
  const sentence =
    'This fixture represents a complete authored explanation with evidence and its limitations. ';
  const text = sentence.repeat(8).trim();
  analysis.reasons = Array.from({ length: 6 }, (_, index) => ({
    id: `fixture.${index}`,
    kind: 'heuristic' as const,
    text,
  }));
  selected.reasonIds = analysis.reasons.map((reason) => reason.id);
  const advice = explain(observation, analysis);
  assert.ok(
    advice.reason.length <= 1700,
    'public explanation must leave room within the 2000-character contract',
  );
  assert.ok(advice.reason.endsWith('.'), 'only complete authored statements are included');
  assert.deepEqual(advice.reasonIds, selected.reasonIds, 'the saved internal record keeps all reasoning IDs');
  assert.equal(analysis.reasons.length, 6);
});

test('KNOW-05: coaching rejects a recommendation assigned to a different seat', () => {
  const { observation, analysis } = bidDecision();
  analysis.action.seat = 1;
  assert.throws(() => explain(observation, analysis), /does not match/);
});

test('COACH P02: a Nil cover cue takes priority after the positive contract is met', () => {
  const advice = explain(observe(contractMadeNil(), 0));
  assert.equal(advice.card, 'HA');
  assert.match(advice.focus, /cover.*Nil/i);
  assert.match(advice.suggestion, /off your partner/i);
  assert.ok(advice.reason.length < 400, 'show the relevant cover evidence, not every scenario fact');
});

test('COACH P02/S07: failed own Nil can cover a live partner without denying legal underplays', () => {
  const state = playSequence(
    bidAll(
      spadesDeal([
        ['CA', 'C2', 'H2', 'HA'],
        ['C3', 'CK', 'H3'],
        ['C4', 'C5', 'HK'],
        ['C6', 'C7', 'H4'],
      ]),
      [0, 3, 0, 3],
    ),
    ['CA', 'C3', 'C4', 'C6', 'C2', 'CK', 'C5', 'C7', 'H3', 'HK', 'H4'],
  );
  const obs = observe(state, 0);
  assert.equal(obs.tricks[0], 1);
  assert.ok(obs.legalActions.some((action) => action.kind === 'play' && action.card === 'H2'));
  const advice = explain(obs);
  assert.equal(advice.card, 'HA');
  assert.match(advice.focus, /cover.*Nil/i);
  assert.match(advice.suggestion, /off your partner/i);
  assert.doesNotMatch(advice.suggestion, /no legal card stays below/i);
});

test('COACH P06: a partner void cue presents a ruff as a possibility', () => {
  const state = collectTrick(
    playSequence(
      bidAll(
        spadesDeal([
          ['CA', 'C2'],
          ['C3'],
          ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'DJ', 'DQ', 'DK', 'S2'],
          ['C4'],
        ]),
        [3, 3, 3, 3],
      ),
      ['CA', 'C3', 'D2', 'C4'],
    ),
  );
  const obs = observe(state, 0);
  const analysis = analyzeDecision(obs);
  assert.ok(analysis.facts.voids.C.includes(2));
  const advice = explain(obs, analysis);
  assert.match(advice.focus, /ruff|void/i);
  assert.match(advice.reason, /possible|may/i);
  assert.doesNotMatch(advice.reason, /partner will ruff|partner wins/i);
});

test('COACH S08: solo contract cue names the individual objective', () => {
  const state = playSequence(
    bidAll(spadesDeal([['H2', 'HA'], ['H3'], ['HK'], ['H4']], 'spades-solo', 0), [3, 3, 3, 3]),
    ['H3', 'HK', 'H4'],
  );
  const advice = explain(observe(state, 0));
  assert.equal(advice.card, 'HA');
  assert.match(advice.focus, /contract/i);
  assert.match(advice.notice, /3.*tricks/i);
  assert.doesNotMatch(JSON.stringify(advice), /partner|your team/i);
});
