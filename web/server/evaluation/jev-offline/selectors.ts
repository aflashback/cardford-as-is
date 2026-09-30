import { actionId } from '../../game/rules.ts';
import {
  FROZEN_SPADES_POLICY_VERSION,
  analyzeFrozenSpades,
} from '../../games/spades/reasoning/frozen/spades-tactics-2.1.0/index.ts';
import { assertObservation, type SeatObservation } from '../../observations/index.ts';
import { getReasoningProfile, listReasoningProfiles } from '../../strategy/registry.ts';
import type { DecisionAnalysis } from '../../strategy/types.ts';
import { isSpadesMode, type SpadesMode } from './payloads.ts';

/**
 * SG-06: one selector interface for every comparison arm. A selector sees the acting
 * seat's observation and the complete legal set, nothing else. No selector here can
 * reach a provider: the two model arms are either blocked or a labelled synthetic fixture.
 */
export type SelectorOutcome =
  | {
      status: 'selected';
      actionId: string;
      provenance: 'code' | 'forced' | 'synthetic-fixture';
      policyOrModel: string;
    }
  | { status: 'unavailable'; reason: string }
  | { status: 'blocked'; reason: string };

export type Selector = (observation: SeatObservation, candidateIds: string[]) => SelectorOutcome;

export type ArmId = 'D0' | 'D1' | 'J0' | 'J1';
export type ModelArmId = Extract<ArmId, 'J0' | 'J1'>;
/** There is no live kind. Adding one is a recorded owner decision behind the EV-07 gate. */
export type SelectorKind = 'local-policy' | 'synthetic-fixture' | 'blocked';
export type Arm = {
  id: ArmId;
  kind: SelectorKind;
  policyOrModel: string;
  select: Selector;
};

export const LIVE_RUN_BLOCKED = 'live run needs owner-approved budget and provider-readiness gate (EV-07)';
export const FORCED_LABEL = 'none — forced move';
export const NO_MODEL_OBSERVED = 'none — no live request';
const SPADES_MODES: readonly SpadesMode[] = ['spades-solo', 'spades-partners'];

/** Every arm receives the complete legal set. A shortlist belongs to a separate, declared study. */
export function admit(observation: SeatObservation, candidateIds: string[]): { forced: boolean } {
  assertObservation(observation);
  if (!isSpadesMode(observation.mode))
    throw new Error('The offline comparison covers Spades Solo and Spades Partners only.');
  const legal = observation.legalActions.map(actionId);
  if (!legal.length) throw new Error('No decision is available for this seat.');
  if (
    !Array.isArray(candidateIds) ||
    candidateIds.some((id) => typeof id !== 'string') ||
    new Set(candidateIds).size !== candidateIds.length ||
    candidateIds.length !== legal.length ||
    candidateIds.some((id) => !legal.includes(id))
  )
    throw new Error('Every arm receives the complete legal set.');
  return { forced: legal.length === 1 };
}

/** Forced decisions bypass every arm. They carry no strategic choice and enter no strategic denominator. */
export function withForcedBypass(select: Selector): Selector {
  return (observation, candidateIds) => {
    if (admit(observation, candidateIds).forced)
      return {
        status: 'selected',
        actionId: candidateIds[0],
        provenance: 'forced',
        policyOrModel: FORCED_LABEL,
      };
    return select(observation, candidateIds);
  };
}

function localChoice(
  analyze: () => DecisionAnalysis,
  policyVersion: string,
  candidateIds: string[],
): SelectorOutcome {
  let analysis: DecisionAnalysis;
  try {
    analysis = analyze();
  } catch {
    // A failure stays in the denominator. No other policy is substituted.
    return { status: 'unavailable', reason: 'local-policy-error' };
  }
  if (analysis.policyVersion !== policyVersion)
    return { status: 'unavailable', reason: 'local-policy-version-mismatch' };
  const selected = actionId(analysis.action);
  if (!candidateIds.includes(selected))
    return { status: 'unavailable', reason: 'local-policy-illegal-action' };
  return { status: 'selected', actionId: selected, provenance: 'code', policyOrModel: policyVersion };
}

/** D0: the frozen baseline snapshot. */
export function createD0Arm(): Arm {
  return {
    id: 'D0',
    kind: 'local-policy',
    policyOrModel: FROZEN_SPADES_POLICY_VERSION,
    select: withForcedBypass((observation, candidateIds) =>
      localChoice(() => analyzeFrozenSpades(observation), FROZEN_SPADES_POLICY_VERSION, candidateIds),
    ),
  };
}

/** Analysis of one registered profile. Unknown versions fail closed when the arm is created. */
export function registeredAnalysis(
  policyVersion: string,
): (observation: SeatObservation) => DecisionAnalysis {
  if (SPADES_MODES.some((mode) => !listReasoningProfiles(mode).includes(policyVersion)))
    throw new Error(`No registered Spades profile: ${policyVersion}`);
  return (observation) => getReasoningProfile(policyVersion, observation.mode).analyze(observation);
}

/** D1: a registered local profile, named by its policy version. */
export function createD1Arm(policyVersion: string): Arm {
  const analyze = registeredAnalysis(policyVersion);
  return {
    id: 'D1',
    kind: 'local-policy',
    policyOrModel: policyVersion,
    select: withForcedBypass((observation, candidateIds) =>
      localChoice(() => analyze(observation), policyVersion, candidateIds),
    ),
  };
}

/** J0 or J1 without a fixture: the arm reports that it is blocked and selects nothing. */
export function createBlockedArm(id: ModelArmId): Arm {
  return {
    id,
    kind: 'blocked',
    policyOrModel: NO_MODEL_OBSERVED,
    select: withForcedBypass(() => ({ status: 'blocked', reason: LIVE_RUN_BLOCKED })),
  };
}

export const isForced = (outcome: SelectorOutcome): boolean =>
  outcome.status === 'selected' && outcome.provenance === 'forced';

export type Denominators = {
  decisions: number;
  /** Excluded from every strategic figure. */
  forced: number;
  /** Unavailable and blocked outcomes stay inside this count. */
  strategic: number;
  selected: number;
  unavailable: number;
  blocked: number;
};

export function denominators(outcomes: readonly SelectorOutcome[]): Denominators {
  const strategic = outcomes.filter((outcome) => !isForced(outcome));
  return {
    decisions: outcomes.length,
    forced: outcomes.length - strategic.length,
    strategic: strategic.length,
    selected: strategic.filter((outcome) => outcome.status === 'selected').length,
    unavailable: strategic.filter((outcome) => outcome.status === 'unavailable').length,
    blocked: strategic.filter((outcome) => outcome.status === 'blocked').length,
  };
}
