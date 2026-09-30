import { competitionFor, teammatesOf } from '../../../game/kernel/competition.ts';
import { actionId } from '../../../game/rules.ts';
import type { Mode } from '../../../game/kernel/types.ts';
import type { SeatObservation } from '../../../observations/index.ts';
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
  DecisionTraceV11,
} from '../../../strategy/types.ts';
import { buildFacts } from '../reasoning/knowledge.ts';
import { analyzeSpades } from '../reasoning/policy.ts';
import type { SpadesModelOptions } from '../playout/model.ts';
import { attachSpadesClaims } from './claims.ts';
import { createSpadesPlanningPack } from './pack.ts';
import { deriveSpadesPlan } from './planner.ts';

/** SG-05: the families a profile may change, in the order the milestone introduces them. */
export type SpadesFamily = 'bid' | 'double-nil' | 'lead' | 'full';
export type SpadesProfile = {
  policyVersion: string;
  families: readonly SpadesFamily[];
  budget: DecisionBudget;
  selection: SelectionRule;
  model: SpadesModelOptions;
};

/**
 * Tuned on development seeds 5_200_001..5_200_150 only (exploration range in the seed ledger):
 * more worlds and keeping the tactical preference inside the comparable set both helped.
 * Frozen before any confirmation range is read.
 */
const BUDGET: DecisionBudget = { maxWorlds: 128, maxSearchedCandidates: 14, maxStances: 2, maxSteps: 400_000 };
const SELECTION: SelectionRule = { ...DEFAULT_SELECTION_RULE, tieBreak: 'tactical-order' };
const MODEL: SpadesModelOptions = { weighting: 'bid-consistency' };

/**
 * Each behaviourally distinct profile has its own policy version.
 * 3.0.0 keeps the 2.1.0 action selection and adds the plan; later versions add one family each.
 */
export const SPADES_PROFILES: readonly SpadesProfile[] = [
  { policyVersion: 'spades-plan-3.0.0', families: [], budget: BUDGET, selection: SELECTION, model: MODEL },
  { policyVersion: 'spades-plan-3.1.0', families: ['bid'], budget: BUDGET, selection: SELECTION, model: MODEL },
  { policyVersion: 'spades-plan-3.2.0', families: ['bid', 'double-nil'], budget: BUDGET, selection: SELECTION, model: MODEL },
  { policyVersion: 'spades-plan-3.3.0', families: ['bid', 'double-nil', 'lead'], budget: BUDGET, selection: SELECTION, model: MODEL },
  { policyVersion: 'spades-plan-3.4.0', families: ['bid', 'double-nil', 'lead', 'full'], budget: BUDGET, selection: SELECTION, model: MODEL },
];

const EVENT_LABELS: Record<string, string> = {
  contractMade: 'The positive contract is made by the end of this hand.',
  ownNilKept: 'This seat takes no trick in this hand.',
  teammateNilKept: 'The Nil teammate takes no trick in this hand.',
  bagPenalty: 'The ten-bag penalty is charged at the end of this hand.',
  opposingContractSet: 'At least one opposing positive contract fails in this hand.',
  matchWon: 'This hand ends the match in favour of this competitor.',
  matchLost: 'This hand ends the match in favour of another competitor.',
};
const APPLIES: Record<string, string | null> = {
  contractMade: 'positiveContract',
  ownNilKept: 'ownNil',
  teammateNilKept: 'teammateNil',
  bagPenalty: null,
  opposingContractSet: null,
  matchWon: null,
  matchLost: null,
};

/** Families of the profile that are eligible at this decision. An empty list means no playouts. */
export function eligibleFamilies(profile: SpadesProfile, observation: SeatObservation): SpadesFamily[] {
  const seat = observation.seat;
  const mate = teammatesOf(competitionFor(observation.mode), seat)[0] ?? -1;
  const partners = mate >= 0;
  const live = (member: number) => member >= 0 && observation.bids[member] === 0 && observation.tricks[member] === 0;
  return profile.families.filter((family) => {
    if (family === 'bid') return observation.phase === 'bid';
    if (observation.phase !== 'play') return false;
    if (family === 'double-nil') return partners && live(seat) && live(mate);
    if (family === 'lead') return partners && observation.trick.length === 0;
    return true;
  });
}

function estimates(search: SearchSummary, selectedMoveId: string): PlanEstimate[] {
  const chosen = search.candidates.find((entry) => entry.moveId === selectedMoveId);
  if (!chosen) return [];
  return Object.keys(EVENT_LABELS)
    .filter((event) => {
      const gate = APPLIES[event];
      return gate === null || (chosen.events[gate] ?? 0) > 0;
    })
    .map((event) => {
      const value = chosen.events[event] ?? 0;
      return {
        id: `spades.estimate.${event}`,
        event: EVENT_LABELS[event],
        kind: 'frequency' as const,
        unit: 'share of sampled worlds',
        horizon: 'round' as const,
        calibrated: false as const,
        information: 'seat-observation' as const,
        allocationModel: search.allocationModel,
        continuationPolicy: search.continuationPolicy,
        population: `Worlds drawn from ${search.allocationModel} given this seat observation; every seat follows ${search.continuationPolicy}.`,
        worlds: search.worldsUsed,
        effectiveWorlds: search.effectiveWorlds,
        seed: search.seed,
        value,
        standardError:
          search.effectiveWorlds > 1 ? Math.sqrt((value * (1 - value)) / search.effectiveWorlds) : null,
        evidence: 'sampled-estimate' as const,
      };
    });
}

/**
 * One analysis for bot and coach. The tactical pass supplies the complete legal set,
 * exact facts and per-action reasons; eligible families add bounded playouts.
 */
export function analyzeSpadesPlan(observation: SeatObservation, profile: SpadesProfile): DecisionAnalysisV11 {
  const facts = buildFacts(observation);
  const tactical = analyzeSpades(observation, facts, profile.policyVersion);
  const families = eligibleFamilies(profile, observation);
  const forced = observation.legalActions.length === 1;
  const pack = createSpadesPlanningPack(tactical, facts, profile.model);
  let decision: Decision | null = null;
  let plan: GamePlan;
  if (!forced && families.length) {
    decision = decide(pack, observation, profile.budget, profile.selection);
    plan = decision.plan;
  } else plan = deriveSpadesPlan(observation);

  const tacticalId = actionId(tactical.action);
  const selectedId = decision?.selectedId ?? tacticalId;
  const selected = observation.legalActions.find((action) => actionId(action) === selectedId);
  if (!selected) throw new Error('The plan selected an action outside the legal set.');
  const planSupported =
    decision?.planSupported ??
    pack.supports(observation, plan.stance.id, pack.candidates(observation).find((entry) => entry.id === selectedId)!);
  const search = decision?.search ?? undefined;
  const usable = decision !== null && (decision.selectedBy === 'search' || decision.selectedBy === 'search-tiebreak');
  const searched = new Set(
    usable && search ? search.candidates.map((entry) => entry.moveId.slice(0, entry.moveId.lastIndexOf(' @ '))) : [],
  );
  const stanceMoveId = decision && usable ? `${selectedId} @ ${decision.stanceId}` : null;
  if (usable && search && stanceMoveId) plan = { ...plan, estimates: estimates(search, stanceMoveId) };

  const reasons: DecisionReason[] = tactical.reasons.map((reason) => ({ ...reason }));
  const planReasonIds: string[] = [];
  const add = (reason: DecisionReason) => {
    reasons.push(reason);
    planReasonIds.push(reason.id);
  };
  if (planSupported)
    add({
      id: 'PLAN.stance',
      kind: 'fact',
      text: `One plan for this hand: ${plan.stance.title.toLowerCase()}. It follows the bids and tricks everyone can see.`,
      actionIds: [selectedId],
      claims: [{ predicate: 'plan-stance', args: { stanceId: plan.stance.id } }],
    });
  if (usable)
    add({
      id: 'PLAN.sampled',
      kind: 'heuristic',
      text: 'Across sampled deals that fit what you can see, this choice did no worse than the others for this plan. The other players are simulated simply, so treat it as an estimate.',
      actionIds: [selectedId],
    });
  if (decision?.selectedBy === 'tactical-fallback')
    add({
      id: 'PLAN.fallback',
      kind: 'heuristic',
      text: 'Sampled deals were not usable for this decision, so the tactical order decided.',
      actionIds: [selectedId],
    });

  const comparable = decision?.comparableIds ?? [];
  const tied = decision?.tiedIds ?? [];
  const sameAsTactical = selectedId === tacticalId;
  const candidates = [
    ...tactical.candidates.filter((entry) => actionId(entry.action) === selectedId),
    ...tactical.candidates.filter((entry) => actionId(entry.action) !== selectedId),
  ].map((entry) => {
    const id = actionId(entry.action);
    const chosen = id === selectedId;
    const evidence: DecisionEvidence = forced ? 'exact' : searched.has(id) ? 'sampled-estimate' : 'heuristic';
    return {
      action: structuredClone(entry.action),
      reasonIds: chosen ? [...planReasonIds, ...entry.reasonIds] : [...entry.reasonIds],
      disposition: chosen ? ('selected' as const) : ('alternative' as const),
      evidence,
    };
  });
  const trace: DecisionTraceV11 | undefined = tactical.trace
    ? {
        ...tactical.trace,
        schemaVersion: '1.1.0',
        policyVersion: profile.policyVersion,
        selectedActionId: selectedId,
        selectedBy: forced ? 'forced' : decision ? (decision.selectedBy as DecisionTraceV11['selectedBy']) : 'heuristic-rank',
        limitations: [
          ...tactical.trace.limitations,
          'Candidate scores are tactical ordering weights. Playout values are recorded separately under search.',
        ],
      }
    : undefined;
  return {
    schemaVersion: '1.1.0',
    policyVersion: profile.policyVersion,
    provenance: forced ? 'forced' : 'code',
    action: structuredClone(selected),
    scenarioIds: [...tactical.scenarioIds],
    reasons: attachSpadesClaims(observation, facts, reasons),
    facts,
    candidates,
    limitations: [...tactical.limitations, ...plan.limitations, ...(decision?.limitations ?? []), ...(search?.limitations ?? [])],
    plan,
    decision: {
      selectedBy: forced ? 'forced' : (decision?.selectedBy ?? 'tactical-order'),
      stanceId: decision?.stanceId ?? plan.stance.id,
      planSupported,
      families,
      comparableActionIds: comparable,
      tiedActionIds: tied,
      notSearchedActionIds: decision?.notSearchedIds ?? [],
      mergedActionIds: decision?.merged ?? {},
      resultingStances: decision?.resultingStances ?? {},
      selectionRule: profile.selection,
      coach: {
        // COACH-14: when a distinct choice is practically tied the coach names no single one.
        outcome: tied.length ? 'several-reasonable' : 'suggestion',
        // COACH-12: tactical text written for another card is never shown for this one.
        explanation: sameAsTactical || planSupported ? 'supported' : 'facts-only',
      },
    },
    ...(search ? { search } : {}),
    ...(trace ? { trace } : {}),
  };
}

const MODES: readonly Mode[] = ['spades-solo', 'spades-partners'];
export const spadesPlanProfiles: ReasoningPack[] = SPADES_PROFILES.map((profile) => ({
  modes: MODES,
  policyVersion: profile.policyVersion,
  cost: profile.families.length ? ('bounded-search' as const) : ('inline' as const),
  analyze: (observation: SeatObservation) => analyzeSpadesPlan(observation, profile),
}));

export const getSpadesProfile = (policyVersion: string): SpadesProfile => {
  const found = SPADES_PROFILES.find((profile) => profile.policyVersion === policyVersion);
  if (!found) throw new Error(`Unknown Spades profile: ${policyVersion}`);
  return found;
};
