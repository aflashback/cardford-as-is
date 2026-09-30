import assert from 'node:assert/strict';
import test from 'node:test';
import { apply, collectTrick, createGame, fullDeck, type Card, type PrivateGame, type Seat } from '../game/index.ts';
import { observe, type SeatObservation } from '../observations/index.ts';
import { decide, type Decision } from '../strategy/plan/contract.ts';
import { createRandom, shuffled } from '../strategy/plan/random.ts';
import { PLAN_BUDGET_CEILING } from '../strategy/plan/types.ts';
import { cardName, type SpadesWorld } from '../games/spades/playout/kernel.ts';
import type { SpadesPlayoutModel } from '../games/spades/playout/model.ts';
import { createSpadesPlanningPack } from '../games/spades/plan/pack.ts';
import { SPADES_PROFILES, analyzeSpadesPlan, getSpadesProfile } from '../games/spades/plan/profiles.ts';
import { buildFacts } from '../games/spades/reasoning/knowledge.ts';
import { analyzeSpades } from '../games/spades/reasoning/policy.ts';
import { bidAll, playSequence, spadesDeal, type SpadesMode } from './support/spades-fixtures.ts';

/**
 * GP-04: budgets are work counts. Nothing here reads a clock; every assertion is about how
 * many models, worlds and playout steps one decision used.
 */
const MODES: SpadesMode[] = ['spades-solo', 'spades-partners'];
const PROFILE = getSpadesProfile('spades-plan-3.4.0');
const BUDGET = PROFILE.budget;
const CARDS_IN_DEAL = 52;
const STANCE_SEPARATOR = ' @ ';

type Counted = {
  decision: Decision;
  models: number;
  samples: number;
  worlds: SpadesWorld[];
  diagnostics: SpadesPlayoutModel['diagnostics'];
};

/** One decision through the shared orchestrator, counting what the Spades pack was asked to do. */
function decideCounted(observation: SeatObservation): Counted {
  const facts = buildFacts(observation);
  const tactical = analyzeSpades(observation, facts, PROFILE.policyVersion);
  const pack = createSpadesPlanningPack(tactical, facts, PROFILE.model);
  const counted: Omit<Counted, 'decision'> = {
    models: 0,
    samples: 0,
    worlds: [],
    diagnostics: { rejectionFallbacks: 0, weightingFallback: false },
  };
  const decision = decide(
    {
      ...pack,
      playout(seen) {
        counted.models++;
        const model = pack.playout(seen);
        counted.diagnostics = (model as unknown as SpadesPlayoutModel).diagnostics;
        return {
          ...model,
          sample(seed) {
            counted.samples++;
            const sampled = model.sample(seed);
            if (sampled) counted.worlds.push(model.clone(sampled.world));
            return sampled;
          },
        };
      },
    },
    observation,
    BUDGET,
    PROFILE.selection,
  );
  return { decision, ...counted };
}

const start = (mode: SpadesMode, seed: number): PrivateGame =>
  createGame(
    { id: `budget-${mode}-${seed}`, mode, dealer: (seed % 4) as Seat },
    shuffled(fullDeck(), createRandom(seed)),
  );

function cardsOf(world: SpadesWorld, seat: number): Card[] {
  const cards: Card[] = [];
  for (let suit = 0; suit < 4; suit++)
    for (let rank = 0; rank < 13; rank++)
      if (world.hands[seat * 4 + suit] & (1 << rank)) cards.push(cardName(suit * 13 + rank));
  return cards;
}

function assertWork(label: string, observation: SeatObservation, result: Counted, stepsPerLine: number): string {
  const { decision, models, samples } = result;
  const search = decision.search;
  assert.ok(search, `${label}: playouts ran`);
  assert.equal(search.status, 'completed', label);
  assert.deepEqual(search.budget, { worlds: BUDGET.maxWorlds, maxSteps: BUDGET.maxSteps }, label);
  // One model for the whole decision: the observation is validated and the public base is built once.
  assert.equal(models, 1, `${label}: playout models built`);
  // One draw per requested world: every draw was usable and none was repeated.
  assert.equal(samples, BUDGET.maxWorlds, `${label}: sample calls`);
  assert.equal(search.worldsUsed, BUDGET.maxWorlds, `${label}: worlds used`);
  assert.equal(result.worlds.length, search.worldsUsed, `${label}: sampled worlds against worlds used`);
  assert.ok(search.effectiveWorlds > 0 && search.effectiveWorlds <= search.worldsUsed + 1e-9, label);
  // Every searched line is played to the end of the hand on every world, so the step count is exact.
  const lines = search.candidates.length;
  const stances = new Set(search.candidates.map((entry) => entry.moveId.split(STANCE_SEPARATOR)[1])).size;
  assert.ok(stances >= 1 && stances <= BUDGET.maxStances, label);
  assert.ok(lines >= 2 && lines <= BUDGET.maxSearchedCandidates * stances, label);
  assert.equal(search.steps, lines * search.worldsUsed * stepsPerLine, `${label}: playout steps`);
  assert.ok(search.steps <= BUDGET.maxSteps, `${label}: ${search.steps} steps`);
  // Every legal action is searched, merged into a searched one, or recorded as not searched.
  const merged = Object.values(decision.merged).flat().length;
  assert.equal(lines / stances + decision.notSearchedIds.length + merged, observation.legalActions.length, label);
  return `${label}: 1 model, ${samples} sample calls, ${search.worldsUsed} worlds, ${lines} lines, ${search.steps} of ${BUDGET.maxSteps} steps`;
}

test('GP-04: every profile budget sits inside the declared ceiling and cannot truncate a Spades decision', () => {
  for (const profile of SPADES_PROFILES) {
    const { maxWorlds, maxSearchedCandidates, maxStances, maxSteps } = profile.budget;
    for (const value of [maxWorlds, maxSearchedCandidates, maxStances, maxSteps])
      assert.ok(Number.isInteger(value) && value >= 1, profile.policyVersion);
    assert.ok(maxWorlds <= PLAN_BUDGET_CEILING.worlds, profile.policyVersion);
    assert.ok(maxSteps <= PLAN_BUDGET_CEILING.maxSteps, profile.policyVersion);
    // Longest line: four bids and fifty-two cards. Most lines: every searched action under every stance.
    const worst = maxSearchedCandidates * maxStances * maxWorlds * (4 + CARDS_IN_DEAL);
    assert.ok(worst <= maxSteps, `${profile.policyVersion}: worst case ${worst} steps against ${maxSteps}`);
  }
});

test('GP-04: a 14-bid decision uses the requested worlds within the step budget', (t) => {
  for (const mode of MODES)
    for (const [seed, placed] of [
      [8_800_001, 0],
      [8_800_002, 1],
      [8_800_003, 3],
    ]) {
      let state = start(mode, seed);
      for (let bid = 0; bid < placed; bid++) state = apply(state, { kind: 'bid', seat: state.turn!, bid: 2 + bid });
      const observation = observe(state, state.turn!);
      assert.equal(observation.legalActions.length, 14);
      const label = `${mode}/${seed}, ${placed} bids placed`;
      const result = decideCounted(observation);
      t.diagnostic(assertWork(label, observation, result, 4 - placed + CARDS_IN_DEAL));
      assert.equal(result.decision.search!.candidates.length, 14, `${label}: every bid is searched`);
      assert.deepEqual(result.decision.notSearchedIds, []);
      // The full analysis reports the same work and the same sampled worlds.
      const analysis = analyzeSpadesPlan(observation, PROFILE);
      assert.deepEqual(analysis.search, result.decision.search, label);
    }
});

test('GP-04: a 13-card lead decision uses the requested worlds within the step budget', (t) => {
  for (const mode of MODES)
    for (const seed of [8_810_001, 8_810_002, 8_810_003]) {
      let state = start(mode, seed);
      // Bids differ by seat so that different stances, and so different line counts, are met.
      while (state.phase === 'bid') state = apply(state, { kind: 'bid', seat: state.turn!, bid: 1 + ((seed + state.turn!) % 4) });
      const observation = observe(state, state.turn!);
      assert.equal(observation.hand.length, 13);
      assert.equal(observation.history.length + observation.trick.length, 0);
      const label = `${mode}/${seed}, first lead with ${observation.legalActions.length} legal cards`;
      const result = decideCounted(observation);
      t.diagnostic(assertWork(label, observation, result, CARDS_IN_DEAL));
      const analysis = analyzeSpadesPlan(observation, PROFILE);
      assert.deepEqual(analysis.search, result.decision.search, label);
    }
});

/** Seat 1 shows out of clubs and seat 3 out of diamonds; seat 0 wins five tricks and leads again. */
function twoPublicVoids(mode: SpadesMode): PrivateGame {
  const state = playSequence(
    bidAll(
      spadesDeal(
        [
          ['CA', 'CK', 'C8', 'C9', 'DA', 'DK', 'D8', 'D9', 'HA', 'HK', 'SA', 'SK', 'S8'],
          ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'H2', 'H3', 'H4', 'H5', 'S2', 'S3', 'S4'],
          ['C10', 'CJ', 'CQ', 'D10', 'DJ', 'DQ', 'H10', 'HJ', 'HQ', 'S9', 'S10', 'SJ', 'SQ'],
          ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'H6', 'H7', 'H8', 'H9', 'S5', 'S6', 'S7'],
        ],
        mode,
      ),
      [4, 2, 3, 2],
    ),
    [
      ...['CA', 'H2', 'C10', 'C2'],
      ...['DA', 'D2', 'D10', 'H6'],
      ...['HA', 'H3', 'H10', 'H7'],
      ...['HK', 'H4', 'HJ', 'H8'],
      ...['CK', 'H5', 'CJ', 'C3'],
    ],
  );
  return collectTrick(state);
}

test('GP-04: a mid-hand position with two public voids still samples and records its fallbacks', (t) => {
  for (const mode of MODES) {
    const state = twoPublicVoids(mode);
    assert.equal(state.history.length, 5);
    assert.equal(state.spadesBroken, false);
    const observation = observe(state, state.turn!);
    assert.equal(observation.seat, 0);
    assert.deepEqual(
      observation.memory.map((memory) => [memory.suit, memory.voidSeats]),
      [
        ['C', [1]],
        ['D', [3]],
        ['H', []],
        ['S', []],
      ],
    );
    const label = `${mode}, sixth trick lead, two public voids`;
    const result = decideCounted(observation);
    const line = assertWork(label, observation, result, CARDS_IN_DEAL - 4 * observation.history.length);
    for (const world of result.worlds) {
      assert.ok(cardsOf(world, 1).every((card) => card[0] !== 'C'), `${label}: seat 1 holds a club`);
      assert.ok(cardsOf(world, 3).every((card) => card[0] !== 'D'), `${label}: seat 3 holds a diamond`);
      for (const seat of [0, 1, 2, 3]) assert.equal(cardsOf(world, seat).length, 8);
      assert.deepEqual(cardsOf(world, 0), observation.hand);
    }
    // Forty-eight rejection tries seldom satisfy both voids, so the exact sampler supplies worlds.
    const fallbacks = result.diagnostics.rejectionFallbacks;
    assert.ok(fallbacks > 0 && fallbacks <= BUDGET.maxWorlds, `${label}: ${fallbacks} fallbacks`);
    assert.ok(new Set(result.worlds.map((world) => [...world.hands].join(','))).size > BUDGET.maxWorlds / 2);
    t.diagnostic(`${line}, ${fallbacks} exact-sampler fallbacks`);
    const analysis = analyzeSpadesPlan(observation, PROFILE);
    assert.deepEqual(analysis.search, result.decision.search, label);
  }
});
