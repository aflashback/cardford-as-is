import type { GameAction } from '../game/kernel/types.ts';
import { assertObservation, type SeatObservation } from '../observations/index.ts';
import { getReasoningPack, getReasoningProfile } from './registry.ts';
import type { DecisionAnalysis } from './types.ts';
export type {
  DecisionAnalysis,
  DecisionAnalysisV10,
  DecisionAnalysisV11,
  DecisionEvidence,
  DecisionFacts,
  DecisionReason,
  CardOutcome,
  NilStatus,
  PlanDecision,
  ReasonClaim,
} from './types.ts';
export { readSavedAnalysis } from './types.ts';
export { suggestBid } from './baseline.ts';
export {
  costOf,
  getReasoningPack,
  getReasoningProfile,
  getLegacyReasoningProfile,
  listReasoningProfiles,
  registeredReasoningModes,
  type Policy,
} from './registry.ts';
export { SPADES_POLICY_VERSION as POLICY_VERSION } from '../games/spades/reasoning/manifest.ts';

/**
 * One seat-safe result is shared by bot execution and human coaching.
 * Without a named policy the live default for the mode decides.
 */
export function analyzeDecision(obs: SeatObservation, policyVersion?: string): DecisionAnalysis {
  assertObservation(obs);
  if (!obs.legalActions.length) throw new Error('No decision is available for this seat.');
  const pack = policyVersion ? getReasoningProfile(policyVersion, obs.mode) : getReasoningPack(obs.mode);
  return pack.analyze(obs);
}
export function chooseAction(obs: SeatObservation, policyVersion?: string): GameAction {
  return analyzeDecision(obs, policyVersion).action;
}
