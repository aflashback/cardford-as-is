import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { readConfig } from '../config.ts';
import {
  BLOCKED_ROW,
  assertNoModelFigures,
  renderComparisonReport,
  runOfflineComparison,
  type Figure,
} from '../evaluation/jev-offline/report.ts';
import {
  SYNTHETIC_PROVENANCE,
  SYNTHETIC_RESPONSES,
  SYNTHETIC_SELECTOR,
  VALIDATOR_CLASS,
  checkResponse,
  createSyntheticFixtureArm,
  diagnoseResponse,
  syntheticPositions,
  type FieldCategory,
  type SyntheticPosition,
} from '../evaluation/jev-offline/fixtures.ts';
import {
  CANDIDATE_ENCODING,
  CODE_FACTS_LABEL,
  DERIVED_ANALYSIS_LABEL,
  EXPERIMENT_ID_PLACEHOLDER,
  OFFLINE_HARNESS_VERSION,
  PROMPT_VERSIONS,
  buildJ0Payload,
  buildJ1Payload,
  canonicalCandidateIds,
  serializePayload,
  type SpadesMode,
} from '../evaluation/jev-offline/payloads.ts';
import {
  FORCED_LABEL,
  LIVE_RUN_BLOCKED,
  NO_MODEL_OBSERVED,
  createBlockedArm,
  createD0Arm,
  createD1Arm,
  denominators,
  withForcedBypass,
  type Arm,
  type SelectorOutcome,
} from '../evaluation/jev-offline/selectors.ts';
import { competitionFor, teammatesOf } from '../game/kernel/competition.ts';
import {
  actionId,
  apply,
  cardLabel,
  collectTrick,
  createGame,
  fullDeck,
  sorted,
  type Card,
  type Four,
  type PrivateGame,
  type Seat,
} from '../game/index.ts';
import { buildFacts } from '../games/spades/reasoning/knowledge.ts';
import { analyzeFrozenSpades } from '../games/spades/reasoning/frozen/spades-tactics-2.1.0/index.ts';
import { observe, type SeatObservation } from '../observations/index.ts';
import { JEV_MODEL, buildDecisionRequest, validateResult } from '../providers/openrouter.ts';
import { analyzeDecision } from '../strategy/index.ts';
import { createRandom, shuffled } from '../strategy/plan/random.ts';
import type { DecisionAnalysis } from '../strategy/types.ts';

const D1_INLINE = 'spades-plan-3.0.0';
const D1_SEARCH = 'spades-plan-3.4.0';
const SEEDS = [11, 12, 13, 14, 15, 16];
const MODES: SpadesMode[] = ['spades-solo', 'spades-partners'];
const HARNESS_FILES = ['selectors.ts', 'payloads.ts', 'fixtures.ts', 'report.ts'];
const POSITION_LABEL = 'jev-offline-positions';
/** Pinned after review of the instruction text. Update only together with the prompt version. */
const PROMPT_TEXT_PINS: Record<string, string[]> = {
  'J0 spades-solo': ['f96a23e3'],
  'J1 spades-solo': ['07ac0842'],
  'J0 spades-partners': ['074b318c'],
  'J1 spades-partners': ['c06173d5'],
};

const SELECTION_KEYS = [
  'selected',
  'selectedActionId',
  'selectedBy',
  'selectedId',
  'disposition',
  'recommendation',
  'recommended',
  'action',
  'score',
  'effects',
  'delta',
  'tieOrder',
  'rank',
  'order',
  'utility',
  'utilities',
  'mean',
  'standardError',
  'behindLeader',
  'leaderId',
  'comparable',
  'comparableIds',
  'comparableActionIds',
  'search',
  'estimate',
  'estimates',
  'cue',
  'cueText',
  'reasons',
  'reasonIds',
  'trace',
  'decision',
  'scenarioIds',
  'worlds',
];
const PRIVATE_KEYS = [
  'seed',
  'seeds',
  'label',
  'labels',
  'rubric',
  'acceptable',
  'playerId',
  'userId',
  'accountId',
  'gameId',
  'identity',
  'hands',
  'events',
  'positionId',
];
const ANALYSIS_KEYS = [
  'stance',
  'stanceId',
  'plan',
  'hypotheses',
  'derivedAnalysis',
  'evidence',
  'evidenceKinds',
];

function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) keysOf(item, found);
  else if (typeof value === 'object' && value !== null)
    for (const [key, item] of Object.entries(value)) {
      found.add(key);
      // Candidate identifiers are keys of the criteria map; they are data, not field names.
      if (key !== 'criteria') keysOf(item, found);
    }
  return found;
}
const count = (text: string, part: string): number => text.split(part).length - 1;
const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
const quoted = (text: string): string => JSON.stringify(text).slice(1, -1);

/** Another selection for the same analysis: every selection-bearing field is changed. */
function withOtherSelection(analysis: DecisionAnalysis, selectedId: string): DecisionAnalysis {
  const other = structuredClone(analysis);
  const previous = actionId(other.action);
  const chosen = other.candidates.find((candidate) => actionId(candidate.action) === selectedId)!;
  const moved = other.candidates
    .find((candidate) => actionId(candidate.action) === previous)!
    .reasonIds.filter((id) => id.startsWith('PLAN.'));
  other.action = structuredClone(chosen.action);
  for (const candidate of other.candidates) {
    candidate.reasonIds = candidate.reasonIds.filter((id) => !moved.includes(id));
    candidate.disposition = candidate === chosen ? 'selected' : 'alternative';
  }
  chosen.reasonIds = [...moved, ...chosen.reasonIds];
  other.candidates = [chosen, ...other.candidates.filter((candidate) => candidate !== chosen).reverse()];
  for (const reason of other.reasons) if (moved.includes(reason.id)) reason.actionIds = [selectedId];
  if (other.trace) {
    other.trace.selectedActionId = selectedId;
    other.trace.candidates.reverse();
    for (const candidate of other.trace.candidates) candidate.score = -(candidate.score ?? 0);
  }
  if (other.schemaVersion === '1.1.0') {
    other.decision.selectedBy = 'search-tiebreak';
    other.decision.stanceId = 'spades.deny-tricks';
    other.decision.comparableActionIds = [previous];
    other.decision.coach = { outcome: 'several-reasonable', explanation: 'facts-only' };
    if (other.search) {
      other.search.leaderId = `${selectedId} @ spades.deny-tricks`;
      other.search.comparableIds = [];
      for (const candidate of other.search.candidates) candidate.mean = -candidate.mean;
    }
    other.plan.estimates = [];
  }
  return other;
}

/** Plays the frozen baseline in every seat for a number of decisions. */
function reach(mode: SpadesMode, seed: number, decisions: number): PrivateGame {
  let state = createGame(
    { id: 'private-identity-canary', mode, dealer: (seed % 4) as Seat },
    shuffled(fullDeck(), createRandom(seed, 0x7e57)),
  );
  for (let index = 0; index < decisions; index++) {
    if (state.phase === 'trick-end') state = collectTrick(state);
    const action = analyzeFrozenSpades(observe(state, state.turn!)).action;
    if (action.kind === 'pass') throw new Error('Spades has no pass.');
    state = apply(state, action);
  }
  return state.phase === 'trick-end' ? collectTrick(state) : state;
}

/** Redistributes every card the seat cannot see among the other seats, keeping hand sizes. */
function permuteConcealed(state: PrivateGame, seat: Seat, seed: number): PrivateGame {
  const next = structuredClone(state);
  const others = ([0, 1, 2, 3] as Seat[]).filter((other) => other !== seat);
  for (let attempt = 0; attempt < 8; attempt++) {
    const pool = shuffled(
      others.flatMap((other) => state.hands[other]),
      createRandom(seed, 0x7e58 + attempt),
    );
    let at = 0;
    for (const other of others) {
      next.hands[other] = sorted(pool.slice(at, at + state.hands[other].length));
      at += state.hands[other].length;
    }
    if (JSON.stringify(next.hands) !== JSON.stringify(state.hands)) return next;
  }
  throw new Error('The concealed cards could not be rearranged.');
}

describe('SG-06: offline Jev comparison harness', () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  let positions: SyntheticPosition[] = [];
  let strategic: SyntheticPosition[] = [];
  let forced: SyntheticPosition[] = [];

  before(() => {
    globalThis.fetch = (() => {
      networkCalls++;
      throw new Error('The offline harness must never reach the network.');
    }) as typeof globalThis.fetch;
    positions = MODES.flatMap((mode) => syntheticPositions(mode, SEEDS));
    strategic = positions.filter((position) => !position.forced);
    forced = positions.filter((position) => position.forced);
  });
  after(() => {
    globalThis.fetch = originalFetch;
  });

  const allArms = (): Arm[] => [
    createD0Arm(),
    createD1Arm(D1_SEARCH),
    createBlockedArm('J0'),
    createBlockedArm('J1'),
    createSyntheticFixtureArm('J0'),
    createSyntheticFixtureArm('J1', { derivedFrom: D1_SEARCH }),
  ];

  test('SG-06: sampled positions cover bids and plays in Solo and Partners', () => {
    for (const mode of MODES)
      for (const phase of ['bid', 'play'] as const)
        assert.ok(
          strategic.some((position) => position.mode === mode && position.phase === phase),
          `${mode} ${phase}`,
        );
    assert.ok(forced.length >= MODES.length * SEEDS.length, 'every hand ends with a forced last trick');
    assert.deepEqual(
      positions.map((position) => position.id),
      MODES.flatMap((mode) => syntheticPositions(mode, SEEDS)).map((position) => position.id),
      'positions are deterministic',
    );
  });

  test('SG-06: every arm shares one selector interface and receives the complete legal set', () => {
    for (const position of strategic) {
      const observation = position.observation;
      const ids = canonicalCandidateIds(observation);
      for (const arm of allArms()) {
        const untouched = structuredClone(observation);
        const outcome = arm.select(observation, [...ids]);
        assert.deepEqual(observation, untouched, 'a selector never changes its observation');
        if (arm.kind === 'blocked')
          assert.deepEqual(outcome, { status: 'blocked', reason: LIVE_RUN_BLOCKED });
        else {
          assert.equal(outcome.status, 'selected');
          if (outcome.status !== 'selected') continue;
          assert.ok(ids.includes(outcome.actionId));
          assert.equal(outcome.provenance, arm.kind === 'local-policy' ? 'code' : SYNTHETIC_PROVENANCE);
          assert.equal(outcome.policyOrModel, arm.policyOrModel);
        }
        assert.throws(() => arm.select(observation, ids.slice(1)), /complete legal set/);
        assert.throws(() => arm.select(observation, [...ids.slice(1), 'bid:99']), /complete legal set/);
        assert.throws(() => arm.select(observation, [...ids.slice(1), ids[1]]), /complete legal set/);
      }
      const d0 = createD0Arm().select(observation, ids);
      const d1 = createD1Arm(D1_SEARCH).select(observation, ids);
      assert.equal(
        d0.status === 'selected' && d0.actionId,
        actionId(analyzeFrozenSpades(observation).action),
      );
      assert.equal(d0.status === 'selected' && d0.policyOrModel, 'spades-tactics-2.1.0');
      assert.equal(
        d1.status === 'selected' && d1.actionId,
        actionId(analyzeDecision(observation, D1_SEARCH).action),
      );
    }
    assert.throws(() => createD1Arm('spades-plan-9.9.9'), /No registered Spades profile/);
    assert.throws(() => createD1Arm('hearts-baseline-1.0.0'), /No registered Spades profile/);
    assert.throws(() => createSyntheticFixtureArm('J1'), /policy version/);
    assert.throws(() => createSyntheticFixtureArm('J0', { derivedFrom: D1_INLINE }), /no local analysis/);
    const hearts = observe(createGame({ id: 'hearts', mode: 'hearts', dealer: 3 }, fullDeck()), 0);
    assert.throws(() => createD0Arm().select(hearts, hearts.legalActions.map(actionId)), /Spades/);
    assert.throws(() => buildJ0Payload(hearts), /Spades/);
  });

  test('SG-06: forced decisions bypass every arm and leave the strategic denominators', () => {
    assert.ok(forced.length > 0);
    const neverAsked = withForcedBypass(() => {
      throw new Error('A forced decision reached a selector.');
    });
    for (const position of forced) {
      const ids = canonicalCandidateIds(position.observation);
      assert.equal(ids.length, 1);
      const expected: SelectorOutcome = {
        status: 'selected',
        actionId: ids[0],
        provenance: 'forced',
        policyOrModel: FORCED_LABEL,
      };
      assert.deepEqual(neverAsked(position.observation, ids), expected);
      for (const arm of allArms()) assert.deepEqual(arm.select(position.observation, ids), expected);
      assert.throws(() => buildJ0Payload(position.observation), /Forced decisions bypass every arm/);
      assert.throws(
        () => buildJ1Payload(position.observation, analyzeFrozenSpades(position.observation)),
        /Forced decisions bypass every arm/,
      );
    }
    const rejected = SYNTHETIC_RESPONSES.find((response) => response.id === 'distribution-total-off')!;
    const run = (arm: Arm) =>
      denominators(
        positions.map((position) =>
          arm.select(position.observation, canonicalCandidateIds(position.observation)),
        ),
      );
    const base = { decisions: positions.length, forced: forced.length, strategic: strategic.length };
    assert.deepEqual(run(createD0Arm()), { ...base, selected: strategic.length, unavailable: 0, blocked: 0 });
    // Failures and blocked outcomes stay in the strategic denominator; nothing is substituted.
    assert.deepEqual(run(createSyntheticFixtureArm('J0', { response: rejected })), {
      ...base,
      selected: 0,
      unavailable: strategic.length,
      blocked: 0,
    });
    assert.deepEqual(run(createBlockedArm('J1')), {
      ...base,
      selected: 0,
      unavailable: 0,
      blocked: strategic.length,
    });
  });

  test('SG-06: J0 carries the adapter request, exact code facts and the full legal set', () => {
    for (const position of strategic) {
      const observation = position.observation;
      const payload = buildJ0Payload(observation);
      const ids = payload.candidateIds;
      const adapter = buildDecisionRequest(observation, ids);
      const state = payload.request.state as Record<string, unknown>;
      assert.equal(payload.request.model, JEV_MODEL);
      assert.deepEqual(payload.request.questions, adapter.questions);
      assert.deepEqual(Object.keys(state), [...Object.keys(adapter.state), 'codeFacts', 'legalSet']);
      for (const [key, value] of Object.entries(adapter.state)) assert.deepEqual(state[key], value, key);

      if (position.phase === 'bid')
        assert.deepEqual(
          ids,
          Array.from({ length: 14 }, (_, bid) => `bid:${bid}`),
        );
      else {
        assert.deepEqual([...ids].sort(), observation.legalActions.map(actionId).sort());
        assert.ok(ids.length > 1 && ids.length <= 13);
      }
      assert.deepEqual(
        payload.request.state.candidates.map((candidate) => candidate.id),
        ids,
      );
      assert.deepEqual(Object.keys(payload.request.questions.move.criteria), ids);
      assert.deepEqual(payload.request.state.legalSet, {
        complete: true,
        count: observation.legalActions.length,
        encoding: CANDIDATE_ENCODING,
      });

      // Exact code facts agree with the production fact builder; membership comes from competition data.
      const facts = buildFacts(observation);
      const code = payload.request.state.codeFacts;
      const competition = competitionFor(observation.mode);
      assert.equal(code.description, CODE_FACTS_LABEL);
      assert.equal(code.competition.partnerSeat, teammatesOf(competition, observation.seat)[0] ?? null);
      assert.equal(code.competition.partnerSeat, facts.partner);
      assert.equal(code.competition.kind, position.mode === 'spades-solo' ? 'individual' : 'partnership');
      assert.deepEqual(
        [
          observation.seat,
          ...code.competition.opponentSeats,
          ...(facts.partner === null ? [] : [facts.partner]),
        ].sort(),
        [0, 1, 2, 3],
      );
      assert.equal(code.contract.bid, facts.contractBid);
      assert.equal(code.contract.creditedTricks, facts.creditedTricks);
      assert.equal(code.contract.needed, facts.contractNeeded);
      assert.equal(code.nil.own, facts.ownNil);
      assert.equal(code.nil.partner, facts.partnerNil);
      assert.equal(code.bags.carried, facts.oldBags);
      assert.equal(code.bags.bagRoom, facts.bagRoom);
      assert.equal(code.tricksRemaining, facts.tricksRemaining);
    }
    const twin = (mode: SpadesMode) => buildJ0Payload(observe(reach(mode, 21, 9), reach(mode, 21, 9).turn!));
    assert.equal(twin('spades-solo').request.state.codeFacts.competition.partnerSeat, null);
    assert.notEqual(twin('spades-partners').request.state.codeFacts.competition.partnerSeat, null);
  });

  test('SG-06: J0 contains no local selection, order, weight, cue, stance or sampled value', () => {
    for (const position of strategic) {
      const observation = position.observation;
      const first = serializePayload(buildJ0Payload(observation));
      const analyses = [analyzeFrozenSpades(observation), analyzeDecision(observation, D1_SEARCH)];
      const text = serializePayload(buildJ0Payload(observation));
      assert.equal(text, first, 'running a local policy changes nothing in J0');
      assert.equal(/search|utilit|\bmeans?\b|playout|sampled|heuristic|hypothes|tactic/i.test(text), false);
      const keys = keysOf(JSON.parse(text));
      for (const key of [...SELECTION_KEYS, ...ANALYSIS_KEYS, ...PRIVATE_KEYS])
        assert.equal(keys.has(key), false, `J0 key ${key}`);
      // No candidate is singled out: every identifier occurs equally often.
      const ids = canonicalCandidateIds(observation);
      assert.deepEqual([...new Set(ids.map((id) => count(text, `"${id}"`)))], [3]);
      for (const analysis of analyses) {
        for (const reason of analysis.reasons) {
          assert.equal(text.includes(`"${reason.id}"`), false, reason.id);
          for (const sentence of sentences(reason.text))
            assert.equal(text.includes(quoted(sentence)), false, `cue text: ${sentence}`);
        }
        if (analysis.schemaVersion === '1.1.0') {
          assert.equal(text.includes(analysis.plan.stance.id), false);
          assert.equal(text.includes(quoted(analysis.plan.stance.title)), false);
          assert.equal(text.includes(analysis.decision.stanceId), false);
        }
      }
    }
  });

  test('SG-06: J1 adds labelled hypotheses and per-candidate evidence without the recommendation', () => {
    const seen = { hypothesis: 0, fact: 0, perCandidate: 0, plans: 0, withheldSentences: 0, searched: 0 };
    for (const position of strategic) {
      const observation = position.observation;
      const j0 = buildJ0Payload(observation);
      const ids = j0.candidateIds;
      for (const analysis of [
        analyzeFrozenSpades(observation),
        analyzeDecision(observation, D1_INLINE),
        analyzeDecision(observation, D1_SEARCH),
      ]) {
        const payload = buildJ1Payload(observation, analysis);
        const text = serializePayload(payload);
        const selected = actionId(analysis.action);
        const derived = payload.request.state.derivedAnalysis;

        // J1 is J0 plus the derived analysis.
        const state = payload.request.state as Record<string, unknown>;
        assert.deepEqual(Object.keys(state), [...Object.keys(j0.request.state), 'derivedAnalysis']);
        for (const [key, value] of Object.entries(j0.request.state)) assert.deepEqual(state[key], value, key);
        assert.deepEqual(payload.request.questions, j0.request.questions);
        assert.deepEqual(payload.derivedFrom, {
          policyVersion: analysis.policyVersion,
          analysisSchemaVersion: analysis.schemaVersion,
          plannerVersion: analysis.schemaVersion === '1.1.0' ? analysis.plan.plannerVersion : null,
        });

        // Everything derived is labelled, and it is what the local analysis said.
        assert.equal(derived.description, DERIVED_ANALYSIS_LABEL);
        const items = [...derived.shared, ...derived.candidates.flatMap((candidate) => candidate.evidence)];
        for (const item of items) {
          const reason = analysis.reasons.find((entry) => entry.id === item.id)!;
          assert.equal(item.kind, reason.kind === 'fact' ? 'fact-stated-by-local-analysis' : 'hypothesis');
          assert.ok(item.text.length > 0);
          for (const sentence of sentences(item.text)) assert.ok(reason.text.includes(sentence));
          if (item.kind === 'hypothesis') seen.hypothesis++;
          else seen.fact++;
        }
        for (const candidate of derived.candidates) {
          const source = analysis.candidates.find((entry) => actionId(entry.action) === candidate.id)!;
          for (const item of candidate.evidence) assert.ok(source.reasonIds.includes(item.id));
          seen.perCandidate += candidate.evidence.length;
        }
        assert.equal(derived.plan === null, analysis.schemaVersion === '1.0.0');
        if (analysis.schemaVersion === '1.1.0') {
          seen.plans++;
          // The plan's own stance comes from exact public counts, not from the playouts.
          assert.deepEqual(derived.plan?.stance, {
            id: analysis.plan.stance.id,
            title: analysis.plan.stance.title,
          });
          if (analysis.search) {
            seen.searched++;
            for (const candidate of analysis.search.candidates)
              if (!Number.isInteger(candidate.mean))
                assert.equal(text.includes(String(candidate.mean)), false);
          }
        }

        // No selection, order, weight or sampled value.
        const keys = keysOf(JSON.parse(text));
        for (const key of [...SELECTION_KEYS, ...PRIVATE_KEYS])
          assert.equal(keys.has(key), false, `J1 key ${key}`);
        assert.deepEqual([...new Set(ids.map((id) => count(text, `"${id}"`)))], [4]);
        assert.equal(/PLAN\./.test(text), false);
        assert.equal(/suggests bid/i.test(text), false);
        assert.equal(/\bbid(?:s|ding)?\s+(?:\d+|nil)\b/i.test(JSON.stringify(derived)), false);
        for (const card of observation.hand)
          assert.equal(JSON.stringify(derived).includes(cardLabel(card)), false, cardLabel(card));
        seen.withheldSentences += payload.withheld.sentencesNamingAnAction;
        assert.equal(payload.withheld.localSelection, 'not-read');
        assert.equal(payload.withheld.sampledValues, 'withheld');
        assert.equal(
          payload.withheld.reasonsOutsideEvidenceAllowlist,
          analysis.reasons.filter((reason) => reason.id.startsWith('PLAN.')).length,
        );

        // Another selection of the same analysis produces the same bytes.
        for (const other of [ids.find((id) => id !== selected)!, ids.findLast((id) => id !== selected)!]) {
          const changed = withOtherSelection(analysis, other);
          assert.equal(actionId(changed.action), other);
          assert.notDeepEqual(changed, analysis);
          assert.equal(serializePayload(buildJ1Payload(observation, changed)), text);
        }
      }
    }
    assert.ok(seen.hypothesis > 0 && seen.fact > 0 && seen.perCandidate > 0, JSON.stringify(seen));
    assert.ok(seen.plans > 0 && seen.searched > 0 && seen.withheldSentences > 0, JSON.stringify(seen));
  });

  test('SG-06: J1 evidence is the same whichever action the local policy selected', () => {
    let differentSelections = 0;
    for (const position of strategic) {
      const observation = position.observation;
      const tactical = analyzeDecision(observation, D1_INLINE);
      const searched = analyzeDecision(observation, D1_SEARCH);
      if (actionId(tactical.action) !== actionId(searched.action)) differentSelections++;
      const left = buildJ1Payload(observation, tactical).request.state.derivedAnalysis;
      const right = buildJ1Payload(observation, searched).request.state.derivedAnalysis;
      assert.deepEqual(left.shared, right.shared);
      assert.deepEqual(left.candidates, right.candidates);
      assert.deepEqual(left.plan, right.plan);
    }
    assert.ok(
      differentSelections > 0,
      'the sample contains decisions where the two profiles select differently',
    );
  });

  test('SG-06: J1 rejects an analysis of another decision or of part of the legal set', () => {
    const [first, second] = strategic.filter((position) => position.phase === 'play');
    const analysis = analyzeFrozenSpades(first.observation);
    assert.throws(() => buildJ1Payload(second.observation, analysis), /another decision|complete legal set/);
    const partial = structuredClone(analysis);
    partial.candidates.pop();
    assert.throws(() => buildJ1Payload(first.observation, partial), /complete legal set/);
    const unknown = { ...structuredClone(analysis), schemaVersion: '9.0.0' } as unknown as DecisionAnalysis;
    assert.throws(() => buildJ1Payload(first.observation, unknown), /unsupported shape/);
  });

  test('SG-06: candidate order is canonical and identical regardless of the local analysis', () => {
    let tacticalOrderDiffers = 0;
    for (const position of strategic) {
      const observation = position.observation;
      const ids = canonicalCandidateIds(observation);
      const expected =
        position.phase === 'bid'
          ? Array.from({ length: 14 }, (_, bid) => `bid:${bid}`)
          : sorted(observation.legalActions.map((action) => (action.kind === 'play' ? action.card : ''))).map(
              (card) => `play:${card}`,
            );
      assert.deepEqual(ids, expected);
      assert.deepEqual(buildJ0Payload(observation).candidateIds, expected);
      for (const analysis of [analyzeFrozenSpades(observation), analyzeDecision(observation, D1_SEARCH)]) {
        const payload = buildJ1Payload(observation, analysis);
        assert.deepEqual(payload.candidateIds, expected);
        assert.deepEqual(
          payload.request.state.candidates.map((candidate) => candidate.id),
          expected,
        );
        assert.deepEqual(Object.keys(payload.request.questions.move.criteria), expected);
        assert.deepEqual(
          payload.request.state.derivedAnalysis.candidates.map((candidate) => candidate.id),
          expected,
        );
        const tactical = analysis.candidates.map((candidate) => actionId(candidate.action));
        if (JSON.stringify(tactical) !== JSON.stringify(expected)) tacticalOrderDiffers++;
      }
    }
    assert.ok(
      tacticalOrderDiffers > 0,
      'the sample contains decisions whose tactical order is not canonical',
    );
  });

  test('SG-06: payloads carry their versions and a placeholder experiment, never seeds, identity or labels', () => {
    const pins = new Map<string, Set<string>>();
    for (const position of strategic) {
      const observation = position.observation;
      const j0 = buildJ0Payload(observation);
      const j1 = buildJ1Payload(observation, analyzeDecision(observation, D1_INLINE));
      for (const payload of [j0, j1]) {
        assert.equal(payload.harnessVersion, OFFLINE_HARNESS_VERSION);
        assert.equal(payload.dispatch, 'never-sent');
        assert.equal(payload.experimentId, EXPERIMENT_ID_PLACEHOLDER);
        assert.equal(payload.promptVersion, PROMPT_VERSIONS[payload.arm]);
        assert.equal(payload.featureVersion, observation.featureVersion);
        assert.equal(payload.observationSchemaVersion, observation.observationSchemaVersion);
        assert.equal(payload.ruleProfileId, observation.ruleProfileId);
        assert.equal(payload.request.state.ruleProfileId, observation.ruleProfileId);
        assert.equal(payload.candidateEncoding, CANDIDATE_ENCODING);
        assert.match(payload.promptTextHash, /^[0-9a-f]{8}$/);
        const key = `${payload.arm} ${position.mode}`;
        pins.set(key, (pins.get(key) ?? new Set()).add(payload.promptTextHash));
        const text = serializePayload(payload);
        for (const canary of [position.id, 'synthetic-position', 'private-identity-canary', POSITION_LABEL])
          assert.equal(text.includes(canary), false, canary);
        for (const key of PRIVATE_KEYS) assert.equal(keysOf(JSON.parse(text)).has(key), false, key);
      }
      // The closed observation validator refuses anything beyond the seat's own view.
      for (const extra of [
        { seed: 11 },
        { hands: [['SA']] },
        { playerId: 'canary' },
        { label: 'acceptable' },
        { id: 'game' },
      ]) {
        const widened = { ...structuredClone(observation), ...extra } as SeatObservation;
        assert.throws(() => buildJ0Payload(widened));
        assert.throws(() => buildJ1Payload(widened, analyzeFrozenSpades(observation)));
      }
    }
    // One instruction text per arm and mode. A changed hash means the prompt version must change too.
    assert.deepEqual(
      Object.fromEntries([...pins].map(([key, values]) => [key, [...values]])),
      PROMPT_TEXT_PINS,
    );
  });

  test('SG-06: permuting concealed cards leaves both payloads byte-identical', () => {
    let checked = 0;
    for (const mode of MODES)
      for (const [seed, decisions] of [
        [31, 1],
        [32, 3],
        [33, 9],
        [34, 22],
        [35, 37],
      ]) {
        const state = reach(mode, seed, decisions);
        const seat = state.turn!;
        const observation = observe(state, seat);
        if (observation.legalActions.length === 1) continue;
        const permuted = permuteConcealed(state, seat, seed);
        assert.notDeepEqual(permuted.hands, state.hands);
        assert.deepEqual(permuted.hands[seat], state.hands[seat]);
        const twin = observe(permuted, seat);
        assert.deepEqual(twin, observation);
        const j0 = serializePayload(buildJ0Payload(observation));
        assert.equal(serializePayload(buildJ0Payload(twin)), j0);
        const texts = [j0];
        for (const version of [D1_INLINE, D1_SEARCH]) {
          const j1 = serializePayload(buildJ1Payload(observation, analyzeDecision(observation, version)));
          assert.equal(serializePayload(buildJ1Payload(twin, analyzeDecision(twin, version))), j1);
          texts.push(j1);
        }
        // No concealed card is named anywhere, in either arrangement.
        const concealed = (hands: Four<Card[]>) =>
          hands.flatMap((hand, other) => (other === seat ? [] : hand));
        for (const card of new Set([...concealed(state.hands), ...concealed(permuted.hands)]))
          for (const text of texts) {
            assert.equal(text.includes(cardLabel(card)), false, cardLabel(card));
            assert.equal(text.includes(`"${card}"`) || text.includes(`:${card}"`), false, card);
          }
        checked++;
      }
    assert.ok(checked >= 6);
  });

  test('SG-06: the synthetic fixture is labelled, names no model and carries no strategy', () => {
    assert.equal(SYNTHETIC_PROVENANCE, 'synthetic-fixture');
    assert.equal(NO_MODEL_OBSERVED, 'none — no live request');
    assert.equal(
      SYNTHETIC_SELECTOR,
      'synthetic fixture (authored; not a Jev output); observed model: none — no live request',
    );
    for (const response of SYNTHETIC_RESPONSES) assert.equal(response.authored, true);
    for (const arm of [
      createSyntheticFixtureArm('J0'),
      createSyntheticFixtureArm('J1', { derivedFrom: D1_INLINE }),
    ]) {
      assert.equal(arm.kind, 'synthetic-fixture');
      assert.equal(arm.policyOrModel, SYNTHETIC_SELECTOR);
      for (const position of strategic) {
        const ids = canonicalCandidateIds(position.observation);
        const outcome = arm.select(position.observation, ids);
        assert.deepEqual(outcome, {
          status: 'selected',
          // Always the first candidate in canonical order, whatever the position.
          actionId: ids[0],
          provenance: 'synthetic-fixture',
          policyOrModel: SYNTHETIC_SELECTOR,
        });
        assert.equal(/typesafe|jev-1/i.test(JSON.stringify(outcome)), false);
      }
    }
    const body = SYNTHETIC_RESPONSES[0].body(['bid:0', 'bid:1']) as { fixture: string };
    assert.match(body.fixture, /authored; not a Jev output/);
  });

  test('SG-06: every validator failure class has a fixture and a redacted field-category diagnostic', () => {
    const candidateSets = [
      canonicalCandidateIds(strategic.find((position) => position.phase === 'bid')!.observation),
      canonicalCandidateIds(strategic.find((position) => position.phase === 'play')!.observation),
    ];
    const covered = new Set<FieldCategory>();
    const classes = new Set<string>();
    for (const ids of candidateSets)
      for (const response of SYNTHETIC_RESPONSES) {
        const body = response.body(ids);
        const check = checkResponse(response, ids);
        assert.equal(check.fixtureId, response.id);
        if (response.expected === 'accepted') {
          assert.equal(validateResult(body, ids).choice, ids[0]);
          assert.deepEqual(
            { accepted: check.accepted, validatorClass: check.validatorClass, diagnostic: check.diagnostic },
            { accepted: true, validatorClass: null, diagnostic: null },
          );
          continue;
        }
        covered.add(response.expected);
        classes.add(VALIDATOR_CLASS[response.expected]);
        assert.throws(
          () => validateResult(body, ids),
          { message: VALIDATOR_CLASS[response.expected] },
          response.id,
        );
        assert.equal(check.accepted, false);
        assert.equal(check.validatorClass, VALIDATOR_CLASS[response.expected]);
        assert.deepEqual(Object.keys(check.diagnostic!), ['category', 'field', 'validatorClass', 'redacted']);
        assert.equal(check.diagnostic!.category, response.expected);
        assert.equal(check.diagnostic!.validatorClass, VALIDATOR_CLASS[response.expected]);
        // Redacted: fixed words only. No number, candidate or fragment of the body.
        const diagnostic = JSON.stringify(diagnoseResponse(body, ids));
        assert.equal(/\d/.test(diagnostic), false, diagnostic);
        assert.equal(
          /bid:|play:|synthetic|outside-the-candidate-set|unpinned|typesafe/.test(diagnostic),
          false,
        );
        const arm = createSyntheticFixtureArm('J0', { response });
        const position = strategic.find(
          (entry) => canonicalCandidateIds(entry.observation).join() === ids.join(),
        )!;
        assert.deepEqual(arm.select(position.observation, ids), {
          status: 'unavailable',
          reason: `synthetic-fixture-invalid-response:${response.expected}`,
        });
      }
    assert.deepEqual(
      [...covered].sort(),
      Object.keys(VALIDATOR_CLASS).sort(),
      'every field category has a fixture',
    );
    // Every message the validator can throw is covered; a new validator class must get a fixture.
    const source = readFileSync(new URL('../providers/openrouter.ts', import.meta.url), 'utf8');
    const validator = source.slice(
      source.indexOf('export function validateResult'),
      source.indexOf('function retryDelay'),
    );
    const thrown = new Set([...validator.matchAll(/throw new Error\('([^']+)'\)/g)].map((match) => match[1]));
    assert.ok(thrown.size >= 6);
    assert.deepEqual([...classes].sort(), [...thrown].sort());
  });

  test('SG-06: the report blocks J0 and J1 rows and refuses model figures for a fixture', () => {
    assert.equal(
      BLOCKED_ROW,
      'blocked: live run needs owner-approved budget and provider-readiness gate (EV-07)',
    );
    const fixtureArms = [
      createD0Arm(),
      createD1Arm(D1_SEARCH),
      createSyntheticFixtureArm('J0'),
      createSyntheticFixtureArm('J1', { derivedFrom: D1_SEARCH }),
    ];
    const blockedArms = [
      createD0Arm(),
      createD1Arm(D1_SEARCH),
      createBlockedArm('J0'),
      createBlockedArm('J1'),
    ];
    for (const arms of [fixtureArms, blockedArms]) {
      const run = runOfflineComparison(positions, arms);
      const text = renderComparisonReport(run);
      assert.match(text, /Nothing was sent to any provider/);
      assert.match(text, /Observed model: none — no live request/);
      assert.ok(
        text.indexOf('## Spades Solo') > 0 &&
          text.indexOf('## Spades Partners') > text.indexOf('## Spades Solo'),
      );
      for (const mode of MODES) {
        const total = strategic.filter((position) => position.mode === mode).length;
        for (const arm of arms.slice(2))
          assert.ok(
            text.includes(`| ${arm.id} | ${arm.policyOrModel} | ${total} | — | — | — | ${BLOCKED_ROW} |`),
            `${mode} ${arm.id}`,
          );
      }
      const modelLines = text.split('\n').filter((line) => /\bJ[01]\b/.test(line));
      assert.ok(modelLines.length >= 4);
      for (const line of modelLines) assert.equal(/margin|accura|agree|differ|%/i.test(line), false, line);
      assert.equal(/source[^\n]*jev/i.test(text), false);

      const figure = (arm: Figure['arm'], kind: Figure['kind']): Figure => ({
        arm,
        mode: 'spades-partners',
        kind,
        value: 3.5,
        unit: 'points per hand',
        source: 'authored test value',
      });
      for (const arm of ['J0', 'J1'] as const)
        for (const kind of ['margin', 'accuracy', 'agreement'] as const)
          assert.throws(() => renderComparisonReport(run, [figure(arm, kind)]), /^Error: Refused: no /);
      assert.throws(
        () => renderComparisonReport(run, [figure('D1', 'margin'), figure('J0', 'margin')]),
        /Refused/,
      );
      assert.match(
        renderComparisonReport(run, [figure('D1', 'margin')]),
        /\| D1 \| margin \| 3\.5 points per hand \| authored test value \|/,
      );
      assert.throws(
        () => renderComparisonReport(run, [{ ...figure('D1', 'margin'), value: Number.NaN }]),
        /finite number/,
      );
    }
    assert.throws(() => assertNoModelFigures('| J0 | agreement with D1 | 80% |'), /Refused/);
    assert.throws(() => assertNoModelFigures('J1 margin +4 points per hand'), /Refused/);
    assert.doesNotThrow(() => assertNoModelFigures('| D1 | margin | 3.5 points per hand |'));
    // A local policy cannot be reported under a model label, and a fixture cannot pose as a local policy.
    assert.throws(() => runOfflineComparison(positions, [{ ...createD0Arm(), id: 'J0' }]), /wrong kind/);
    assert.throws(
      () => runOfflineComparison(positions, [{ ...createSyntheticFixtureArm('J0'), id: 'D1' }]),
      /wrong kind/,
    );
    assert.throws(() => runOfflineComparison(positions, [createD0Arm(), createD0Arm()]), /distinct/);
    const posing: Arm = {
      ...createBlockedArm('J0'),
      select: () => ({ status: 'selected', actionId: 'bid:3', provenance: 'code', policyOrModel: 'posing' }),
    };
    assert.throws(
      () =>
        runOfflineComparison(
          strategic.filter((position) => position.phase === 'bid'),
          [posing],
        ),
      /provenance its selector cannot have/,
    );
  });

  test('SG-06: no path emits source jev and no harness source can reach the network', () => {
    for (const name of HARNESS_FILES) {
      const source = readFileSync(new URL(`../evaluation/jev-offline/${name}`, import.meta.url), 'utf8');
      assert.equal(/['"`]jev['"`]/.test(source), false, `${name}: source jev`);
      assert.equal(
        /\bfetch\b|selectWithJev|loadOpenRouterKey|DECISIONS_URL|providers\/secrets|jev-smoke|node:https?|node:net|node:tls|node:dgram|node:dns|XMLHttpRequest|WebSocket|EventSource|\.env/.test(
          source,
        ),
        false,
        `${name}: network or credential path`,
      );
      assert.equal(
        /writeFile|appendFile|createWriteStream|node:fs/.test(source),
        false,
        `${name}: file output`,
      );
      assert.equal(/Math\.random|Date\.now|new Date|performance\.now/.test(source), false, `${name}: clock`);
      assert.equal(/\+\s*2\s*\)\s*%\s*4/.test(source), false, `${name}: seat arithmetic`);
    }
    const run = runOfflineComparison(positions, [
      createD0Arm(),
      createD1Arm(D1_INLINE),
      createSyntheticFixtureArm('J0'),
      createSyntheticFixtureArm('J1', { derivedFrom: D1_INLINE }),
    ]);
    const provenances = new Set(
      run.rows.flatMap((row) =>
        row.outcomes.map(({ outcome }) =>
          outcome.status === 'selected' ? outcome.provenance : outcome.status,
        ),
      ),
    );
    assert.deepEqual([...provenances].sort(), ['code', 'forced', 'synthetic-fixture']);
    assert.equal(/"(source|provenance)":"jev"/.test(JSON.stringify(run)), false);
    assert.equal(/typesafe/i.test(JSON.stringify(run)), false, 'no run record names a model');
  });

  test('SG-06: configuration still rejects any JEV_MODE other than off', () => {
    const local = {
      APP_ENV: 'local',
      IDENTITY_MODE: 'local-test',
      BILLING_MODE: 'fixture',
      DATABASE_URL: 'postgres://test@127.0.0.1/tricks',
      HOST: '127.0.0.1',
      PORT: '4173',
      APP_ORIGIN: 'http://127.0.0.1:4173',
    };
    assert.equal(readConfig(local).jevMode, 'off');
    assert.equal(readConfig({ ...local, JEV_MODE: 'off' }).jevMode, 'off');
    for (const mode of ['shadow', 'recommend'])
      assert.throws(() => readConfig({ ...local, JEV_MODE: mode }), /Jev runtime promotion is disabled/);
    for (const mode of ['live', 'on', 'auto', 'OFF', 'fixture', ''])
      assert.throws(() => readConfig({ ...local, JEV_MODE: mode }), /Invalid JEV_MODE/);
  });

  test('SG-06: no test in this file reached the network', () => {
    assert.equal(networkCalls, 0);
    assert.throws(() => globalThis.fetch('https://example.invalid/'), /must never reach the network/);
    networkCalls = 0;
  });
});
