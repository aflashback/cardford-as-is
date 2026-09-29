import type { GameAction } from '../game/kernel/types.ts';
import { assertObservation, type SeatObservation } from '../observations/index.ts';
import { getReasoningPack } from './registry.ts';
import type { DecisionAnalysis } from './types.ts';
export type { DecisionAnalysis, DecisionFacts, DecisionReason, CardOutcome, NilStatus } from './types.ts';
export { suggestBid } from './baseline.ts';
export { getReasoningPack, registeredReasoningModes } from './registry.ts';
export { SPADES_POLICY_VERSION as POLICY_VERSION } from '../games/spades/reasoning/manifest.ts';

/** One seat-safe result is shared by bot execution and human coaching. */
export function analyzeDecision(obs: SeatObservation): DecisionAnalysis {
  assertObservation(obs);
  if (!obs.legalActions.length) throw new Error('No decision is available for this seat.');
  return getReasoningPack(obs.mode).analyze(obs);
}
export function chooseAction(obs: SeatObservation): GameAction {
  return analyzeDecision(obs).action;
}
