import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionId, apply, collectTrick, legalActions, trickWinner, type Seat } from '../game/index.ts';
import { observe, getMemory } from '../observations/index.ts';
import { analyzeDecision, chooseAction, getReasoningPack } from '../strategy/index.ts';
import { explain } from '../coaching/templates.ts';
import { assessPartnerResources } from '../games/spades/partner-resource/proofs.ts';
import { PARTNER_RESOURCE_POLICY } from '../games/spades/partner-resource/profile.ts';
import {
  PARTNER_FIXTURES,
  partnerFixture,
  replayPartnerFixture,
} from '../evaluation/partner-cases/fixtures.ts';
import { checkSpadesClaims } from '../games/spades/evaluation/claims/check.ts';
import { COPY_BUDGET } from '../coaching/types.ts';
import { sourceState } from './support/observed-spades.ts';

test('partner family changes the two-suit lead through the shared bot/coach selector', () => {
  const state = partnerFixture('useful-second-suit');
  const obs = observe(state, state.turn!);
  const old = analyzeDecision(obs, 'spades-cases-4.0.0');
  const fresh = analyzeDecision(obs, PARTNER_RESOURCE_POLICY);
  assert.equal(actionId(old.action), 'play:SJ');
  assert.equal(actionId(fresh.action), 'play:H5');
  assert.deepEqual(chooseAction(obs, PARTNER_RESOURCE_POLICY), fresh.action);
  assert.equal(explain(obs, fresh).card, 'H5');
  assert.ok(fresh.scenarioIds.includes('CASE-01'));
  assert.equal(getReasoningPack(obs.mode).policyVersion, 'spades-tactics-2.1.0');
});

test('all guard counterexamples withhold the family and retain the reference action', () => {
  const guards = {
    'own-nil': 'own-positive',
    'partner-nil': 'partner-positive',
    'opponent-nil': 'no-live-opponent-nil',
    'contract-made-bag': 'contract-needed',
    'no-entry': 'retained-master-entry',
    'hidden-owner': 'partner-trump-proved',
    'unsafe-overruff': 'ruff-safe-H',
  } as const;
  for (const [id, guard] of Object.entries(guards)) {
    const state = partnerFixture(id as keyof typeof guards);
    const obs = observe(state, state.turn!);
    const analysis = analyzeDecision(obs, PARTNER_RESOURCE_POLICY);
    assert.equal(analysis.scenarioIds.includes('CASE-01'), false, id);
    assert.ok(
      analysis.trace?.scenarioChecks.some(
        (entry) => entry.id === `CASE-01.${guard}` && entry.result === 'not-matched',
      ),
      id,
    );
    assert.deepEqual(analysis.action, analyzeDecision(obs, 'spades-cases-4.0.0').action, id);
    assert.ok(
      analysis.reasons.some((reason) => reason.id === 'CASE-01.not-established'),
      id,
    );
  }
  const bagState = partnerFixture('contract-made-bag');
  const bagAnalysis = analyzeDecision(observe(bagState, 0), PARTNER_RESOURCE_POLICY);
  assert.equal(bagAnalysis.facts.nextOrdinaryBagDelta, -99);
  assert.equal(bagAnalysis.facts.contractNeeded, 0);
});

test('unsafe lead has a reachable actual overruff and hidden ownership remains uncertain', () => {
  let state = partnerFixture('unsafe-overruff');
  for (const card of ['H4', 'HK', 'S4', 'S7'])
    state = apply(state, { kind: 'play', seat: state.turn!, card });
  assert.equal(trickWinner(state.trick, state.mode), 3);
  const hidden = partnerFixture('hidden-owner');
  const obs = observe(hidden, 0);
  const analysis = analyzeDecision(obs, PARTNER_RESOURCE_POLICY);
  assert.ok(analysis.facts.possibleOwners.some((owner) => owner.card === 'S7' && owner.seats.length > 1));
  assert.equal(analysis.scenarioIds.includes('CASE-01'), false);
});

test('proved ruff is optional and retains own entry through exact legal responses', () => {
  for (const id of ['useful-original', 'useful-second-suit'] as const) {
    const source = partnerFixture(id);
    const obs = observe(source, 0);
    const chosen = analyzeDecision(obs, PARTNER_RESOURCE_POLICY).action;
    assert.equal(chosen.kind, 'play');
    let state = apply(source, chosen as Exclude<typeof chosen, { kind: 'pass' }>);
    state = apply(state, { kind: 'play', seat: 1, card: 'HK' });
    const partnerChoices = legalActions(state, 2);
    for (const response of partnerChoices) {
      assert.equal(response.kind, 'play');
      if (response.kind !== 'play' || response.card[0] !== 'S') continue;
      const next = apply(state, response);
      for (const last of legalActions(next, 3)) {
        if (last.kind !== 'play') continue;
        const completed = apply(next, last);
        assert.equal(trickWinner(completed.trick, completed.mode), 2);
        assert.ok(completed.hands[0].includes('SJ'));
      }
    }
    assert.ok(
      partnerChoices.some((action) => action.kind === 'play' && action.card[0] !== 'S'),
      'partner may legally decline',
    );
    const advice = explain(obs, analyzeDecision(obs, PARTNER_RESOURCE_POLICY));
    assert.equal(advice.evidence, 'heuristic');
    assert.match(advice.reason, /can choose|depend on play/);
  }
});

test('secure positive partner is left in control instead of spending another winner', () => {
  const state = partnerFixture('partner-secure');
  const obs = observe(state, 0);
  const analysis = analyzeDecision(obs, PARTNER_RESOURCE_POLICY);
  assert.equal(actionId(analysis.action), 'play:H5');
  assert.ok(analysis.reasons.some((reason) => reason.id === 'CASE-01.partner-secure'));
  assert.match(explain(obs, analysis).reason, /adds no team trick/);
  for (const action of legalActions(state, 0).filter(
    (action) => action.kind === 'play' && action.card[0] === 'H',
  )) {
    if (action.kind !== 'play') continue;
    const next = apply(state, action);
    for (const reply of legalActions(next, 1)) {
      if (reply.kind !== 'play') continue;
      assert.equal(trickWinner(apply(next, reply).trick, state.mode), 2);
    }
  }
});

test('independent checks reject forged resources and confirm every family cue within budgets', () => {
  for (const id of PARTNER_FIXTURES) {
    const state = partnerFixture(id);
    const obs = observe(state, state.turn!);
    const analysis = analyzeDecision(obs, PARTNER_RESOURCE_POLICY);
    const advice = explain(obs, analysis);
    const check = checkSpadesClaims(state, state.turn!, advice.claims ?? []);
    assert.deepEqual(check.falseClaims, [], id);
    assert.equal(check.notCheckable, 0, id);
    for (const field of Object.keys(COPY_BUDGET) as (keyof typeof COPY_BUDGET)[])
      assert.ok(advice[field].trim().split(/\s+/).length <= COPY_BUDGET[field], `${id}:${field}`);
    assert.ok(advice.reasonIds.every((id) => analysis.reasons.some((reason) => reason.id === id)));
  }
  for (const id of [
    'hidden-owner',
    'unsafe-overruff',
    'no-entry',
    'partner-nil',
    'contract-made-bag',
  ] as const) {
    const state = partnerFixture(id);
    const checked = checkSpadesClaims(state, state.turn!, [
      {
        predicate: 'partner-safe-ruff-resource',
        args: { partner: 2, suit: 'H', entry: 'SQ', trumpFloor: 7 },
      },
    ]);
    assert.equal(checked.falseClaims.length, 1, id);
  }
});

test('all seat rotations and indistinguishable hidden holdings preserve the shared analysis and cue', () => {
  for (const id of [
    'useful-original',
    'useful-second-suit',
    'hidden-owner',
    'unsafe-overruff',
    'partner-secure',
  ] as const) {
    const original = partnerFixture(id);
    const base = analyzeDecision(observe(original, 0), PARTNER_RESOURCE_POLICY);
    for (const offset of [0, 1, 2, 3] as Seat[]) {
      const state = partnerFixture(id, offset);
      const obs = observe(state, state.turn!);
      const alternate = partnerFixture(id, offset, true);
      assert.deepEqual(observe(alternate, state.turn!), obs);
      const analysis = analyzeDecision(obs, PARTNER_RESOURCE_POLICY);
      assert.equal(actionId(analysis.action), actionId(base.action));
      assert.deepEqual(analyzeDecision(observe(alternate, state.turn!), PARTNER_RESOURCE_POLICY), analysis);
      assert.deepEqual(explain(observe(alternate, state.turn!), analysis), explain(obs, analysis));
      assert.deepEqual(
        checkSpadesClaims(state, state.turn!, explain(obs, analysis).claims ?? []).falseClaims,
        [],
      );
    }
  }
});

test('Solo parity and retained profiles keep the original behavior available', () => {
  for (const id of ['no-entry', 'sweep', 'unbeatable-lead', 'bid-lower-bound']) {
    const state = sourceState(id);
    const obs = observe(state, state.turn!);
    const old = analyzeDecision(obs, 'spades-cases-4.0.0');
    const fresh = analyzeDecision(obs, PARTNER_RESOURCE_POLICY);
    assert.deepEqual(fresh.action, old.action);
    assert.deepEqual(fresh.facts, old.facts);
    assert.deepEqual(fresh.reasons, old.reasons);
    assert.deepEqual(fresh.scenarioIds, old.scenarioIds);
  }
});

test('incomplete public history and forged high partner trump fail closed', () => {
  const state = partnerFixture('useful-second-suit');
  const obs = observe(state, 0);
  const incomplete = structuredClone(obs);
  incomplete.history = [];
  incomplete.events = [];
  incomplete.memory = getMemory(incomplete);
  const analysis = analyzeDecision(incomplete, PARTNER_RESOURCE_POLICY);
  assert.equal(analysis.facts.knowledgeComplete, false);
  assert.equal(analysis.scenarioIds.includes('CASE-01'), false);
  for (const args of [
    { partner: 2, suit: 'H', entry: 'SJ', trumpFloor: 8 },
    { partner: 2, suit: 'H', entry: 'H5', trumpFloor: 7 },
    { partner: 1, suit: 'H', entry: 'SJ', trumpFloor: 7 },
    { partner: 2, suit: 'C', entry: 'SJ', trumpFloor: 7 },
  ])
    assert.equal(
      checkSpadesClaims(state, 0, [{ predicate: 'partner-safe-ruff-resource', args }]).falseClaims.length,
      1,
    );
});

test('coach family reason follows selected action and cannot be borrowed by a trump lead', () => {
  const state = partnerFixture('useful-second-suit');
  const obs = observe(state, 0);
  const analysis = analyzeDecision(obs, PARTNER_RESOURCE_POLICY);
  const advice = explain(obs, analysis);
  assert.ok(
    advice.reasonIds.every((reasonId) =>
      analysis.reasons
        .find((reason) => reason.id === reasonId)
        ?.actionIds?.includes(actionId(analysis.action)),
    ),
  );
  const changed = structuredClone(analysis);
  changed.action = obs.legalActions.find((action) => action.kind === 'play' && action.card === 'SJ')!;
  const differentCue = explain(obs, changed);
  assert.ok(!differentCue.reasonIds.includes('CASE-01.offer-safe-ruff'));
  assert.ok(!differentCue.claims?.some((claim) => claim.predicate === 'partner-safe-ruff-resource'));
});

test('partner resource feasibility checker honors its per-claim work ceiling', () => {
  const state = partnerFixture('useful-second-suit');
  const obs = observe(state, 0);
  const advice = explain(obs, analyzeDecision(obs, PARTNER_RESOURCE_POLICY));
  const checked = checkSpadesClaims(state, 0, advice.claims ?? [], { bound: 1 });
  assert.equal(checked.notCheckable, 1);
  assert.ok(
    checked.results.some(
      (item) =>
        item.claim.predicate === 'partner-safe-ruff-resource' &&
        item.verdict === 'not-checkable' &&
        item.reason === 'work-bound-exceeded',
    ),
  );
});

test('authored partner family reaches every position through reducer replay', () => {
  for (const id of PARTNER_FIXTURES) {
    const state = partnerFixture(id);
    assert.deepEqual(observe(replayPartnerFixture(state), state.turn!), observe(state, state.turn!), id);
    const analysis = analyzeDecision(observe(state, state.turn!), PARTNER_RESOURCE_POLICY);
    const proof = assessPartnerResources(observe(state, state.turn!), analysis.facts);
    assert.ok(proof);
  }
});
