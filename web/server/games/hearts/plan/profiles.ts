import { actionId } from '../../../game/rules.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import { chooseBaselineAction } from '../../../strategy/baseline.ts';
import { buildFacts } from '../../../strategy/facts.ts';
import {
  DEFAULT_SELECTION_RULE,
  decide,
  type Decision,
  type DecisionBudget,
  type SelectionRule,
} from '../../../strategy/plan/contract.ts';
import type { GamePlan, PlanEstimate, SearchSummary } from '../../../strategy/plan/types.ts';
import type { ReasoningPack } from '../../../strategy/registry.ts';
import type {
  DecisionAnalysisV11,
  DecisionEvidence,
  DecisionReason,
  ReasonClaim,
} from '../../../strategy/types.ts';
import { SEALED_STEP_LIMITATION, type HeartsModelOptions } from './model.ts';
import { createHeartsPlanningPack } from './pack.ts';
import { deriveHeartsPlan } from './planner.ts';

export const HEARTS_PLAN_POLICY_VERSION = 'hearts-plan-1.0.0';
export const HEARTS_PLAN_CATALOG_VERSION = 'hearts-plan-catalog-1.0.0';

/** Closed vocabulary of machine-checkable Hearts claims. Both are recomputed from the seat observation. */
export const HEARTS_CLAIM_PREDICATES = {
  'forced-action': 'state-exact',
  'plan-stance': 'state-exact',
} as const;
export type HeartsClaimPredicate = keyof typeof HEARTS_CLAIM_PREDICATES;
const claim = (predicate: HeartsClaimPredicate, args: ReasonClaim['args']): ReasonClaim => ({ predicate, args });

export type HeartsProfile = {
  policyVersion: string;
  budget: DecisionBudget;
  selection: SelectionRule;
  model: HeartsModelOptions;
};

/** At most 13 cards under 2 stances on 32 worlds of at most 52 plays: the step ceiling is never reached. */
export const HEARTS_PLAN_PROFILE: HeartsProfile = {
  policyVersion: HEARTS_PLAN_POLICY_VERSION,
  budget: { maxWorlds: 32, maxSearchedCandidates: 13, maxStances: 2, maxSteps: 100_000 },
  selection: DEFAULT_SELECTION_RULE,
  model: {},
};

const EVENT_LABELS: Record<string, string> = {
  tookNoPoints: 'This seat takes no points in this hand.',
  tookQueen: 'This seat takes the queen of spades in this hand.',
  tookEveryPoint: 'This seat takes every point in this hand.',
  anotherTookEveryPoint: 'Another seat takes every point in this hand.',
  matchWon: 'This hand ends the match in favour of this seat.',
  matchLost: 'This hand ends the match in favour of another seat.',
};

function estimates(search: SearchSummary, selectedMoveId: string): PlanEstimate[] {
  const chosen = search.candidates.find((entry) => entry.moveId === selectedMoveId);
  if (!chosen) return [];
  const common = {
    horizon: 'round' as const,
    calibrated: false as const,
    information: 'seat-observation' as const,
    allocationModel: search.allocationModel,
    continuationPolicy: search.continuationPolicy,
    population: `Worlds drawn from ${search.allocationModel} given this seat observation; every seat follows ${search.continuationPolicy}.`,
    worlds: search.worldsUsed,
    effectiveWorlds: search.effectiveWorlds,
    seed: search.seed,
    evidence: 'sampled-estimate' as const,
  };
  return [
    {
      ...common,
      id: 'hearts.estimate.relativePoints',
      event: 'Mean of the other seats’ points for this hand minus this seat’s points, with the match term.',
      kind: 'mean' as const,
      unit: 'points',
      value: chosen.mean,
      standardError: chosen.standardError,
    },
    ...Object.keys(EVENT_LABELS).map((event) => {
      const value = chosen.events[event] ?? 0;
      return {
        ...common,
        id: `hearts.estimate.${event}`,
        event: EVENT_LABELS[event],
        kind: 'frequency' as const,
        unit: 'share of sampled worlds',
        value,
        standardError:
          search.effectiveWorlds > 1 ? Math.sqrt((value * (1 - value)) / search.effectiveWorlds) : null,
      };
    }),
  ];
}

/**
 * One analysis for bot and coach. The retained baseline supplies the tactical preference;
 * unforced plays add bounded playouts through the shared orchestrator. The pass keeps the
 * baseline ranking and is never searched.
 */
export function analyzeHeartsPlan(
  observation: SeatObservation,
  profile: HeartsProfile = HEARTS_PLAN_PROFILE,
): DecisionAnalysisV11 {
  if (observation.mode !== 'hearts') throw new Error('A Hearts observation is required.');
  const facts = buildFacts(observation);
  const tactical = chooseBaselineAction(observation);
  const tacticalId = actionId(tactical);
  const forced = observation.legalActions.length === 1;
  const sealed = observation.phase === 'pass';
  const pack = createHeartsPlanningPack(profile.model);
  let decision: Decision | null = null;
  let plan: GamePlan;
  if (!forced && !sealed) {
    decision = decide(pack, observation, profile.budget, profile.selection);
    plan = decision.plan;
  } else plan = deriveHeartsPlan(observation);

  const selectedId = decision?.selectedId ?? tacticalId;
  const selected = observation.legalActions.find((action) => actionId(action) === selectedId);
  if (!selected) throw new Error('The plan selected an action outside the legal set.');
  const planSupported =
    decision?.planSupported ??
    (sealed ||
      pack.supports(observation, plan.stance.id, pack.candidates(observation).find((entry) => entry.id === selectedId)!));
  const search = decision?.search ?? undefined;
  const usable = decision !== null && (decision.selectedBy === 'search' || decision.selectedBy === 'search-tiebreak');
  const searched = new Set(
    usable && search ? search.candidates.map((entry) => entry.moveId.slice(0, entry.moveId.lastIndexOf(' @ '))) : [],
  );
  if (usable && search && decision)
    plan = { ...plan, estimates: estimates(search, `${selectedId} @ ${decision.stanceId}`) };

  const reasons: DecisionReason[] = [
    {
      id: 'hearts.baseline',
      kind: forced ? 'fact' : 'heuristic',
      text: forced ? 'Only one legal action exists.' : 'Hearts retains the original local policy for this decision.',
      actionIds: [tacticalId],
      claims: forced ? [claim('forced-action', { legalCount: 1 })] : [],
    },
  ];
  const planReasonIds: string[] = [];
  const add = (reason: DecisionReason) => {
    reasons.push(reason);
    planReasonIds.push(reason.id);
  };
  if (planSupported)
    add({
      id: 'PLAN.stance',
      kind: 'fact',
      text: sealed
        ? 'This step is the pass: choose three cards before any card is played.'
        : `One plan for this hand: ${plan.stance.title.toLowerCase()}. It follows the points and cards everyone can see.`,
      actionIds: [selectedId],
      claims: [claim('plan-stance', { stanceId: plan.stance.id })],
    });
  if (usable)
    add({
      id: 'PLAN.sampled',
      kind: 'heuristic',
      text: 'Across sampled deals that fit what you can see, this choice did no worse than the others for this plan. The other players are simulated simply, so treat it as an estimate.',
      actionIds: [selectedId],
      claims: [],
    });
  if (decision?.selectedBy === 'tactical-fallback')
    add({
      id: 'PLAN.fallback',
      kind: 'heuristic',
      text: 'Sampled deals were not usable for this decision, so the tactical order decided.',
      actionIds: [selectedId],
      claims: [],
    });

  const comparable = decision?.comparableIds ?? [];
  const ordered = [
    ...observation.legalActions.filter((action) => actionId(action) === selectedId),
    ...observation.legalActions.filter((action) => actionId(action) !== selectedId),
  ];
  const candidates = ordered.map((action) => {
    const id = actionId(action);
    const chosen = id === selectedId;
    const evidence: DecisionEvidence = forced ? 'exact' : searched.has(id) ? 'sampled-estimate' : 'heuristic';
    return {
      action: structuredClone(action),
      // Text written for the baseline's card is attached to that card only.
      reasonIds: [...(chosen ? planReasonIds : []), ...(id === tacticalId ? ['hearts.baseline'] : [])],
      disposition: chosen ? ('selected' as const) : ('alternative' as const),
      evidence,
    };
  });
  const limitations = [
    'Hearts keeps the retained baseline as its tactical order; playouts, where they run, reorder unforced plays only.',
    ...plan.limitations,
    ...(decision?.limitations ?? []),
    ...(search?.limitations ?? []),
  ];
  return {
    schemaVersion: '1.1.0',
    policyVersion: profile.policyVersion,
    provenance: forced ? 'forced' : 'code',
    action: structuredClone(selected),
    scenarioIds: [],
    reasons,
    facts,
    candidates,
    limitations,
    plan,
    decision: {
      selectedBy: forced ? 'forced' : (decision?.selectedBy ?? 'tactical-order'),
      stanceId: decision?.stanceId ?? plan.stance.id,
      planSupported,
      families: decision ? ['play'] : [],
      comparableActionIds: comparable,
      tiedActionIds: decision?.tiedIds ?? [],
      notSearchedActionIds: decision?.notSearchedIds ?? [],
      mergedActionIds: decision?.merged ?? {},
      resultingStances: decision?.resultingStances ?? {},
      selectionRule: profile.selection,
      coach: {
        outcome: comparable.length ? 'several-reasonable' : 'suggestion',
        explanation: selectedId === tacticalId || planSupported ? 'supported' : 'facts-only',
      },
    },
    ...(search ? { search } : {}),
    trace: {
      schemaVersion: '1.1.0',
      policyVersion: profile.policyVersion,
      catalogVersion: HEARTS_PLAN_CATALOG_VERSION,
      selectedActionId: selectedId,
      selectedBy: forced ? 'forced' : decision ? (decision.selectedBy === 'tactical-order' ? 'baseline' : decision.selectedBy) : 'baseline',
      scenarioChecks: [],
      candidates: ordered.map((action, tieOrder) => ({ actionId: actionId(action), score: null, effects: [], tieOrder })),
      limitations: [
        'The baseline ranks no card beyond its own choice, so candidates carry no tactical score.',
        'Playout values are recorded separately under search.',
        ...(sealed ? [SEALED_STEP_LIMITATION] : []),
      ],
    },
  };
}

/**
 * GP-06: Hearts plan profiles are a seam proof for tests and evaluation only.
 * Production Hearts stays on hearts-baseline-1.0.0 until Hearts has its own gate.
 */
export const heartsPlanProfiles: ReasoningPack[] = [
  {
    modes: ['hearts'],
    policyVersion: HEARTS_PLAN_POLICY_VERSION,
    cost: 'bounded-search',
    analyze: (observation: SeatObservation) => analyzeHeartsPlan(observation, HEARTS_PLAN_PROFILE),
  },
];
