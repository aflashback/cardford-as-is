import type { Card, Suit } from '../game/kernel/types.ts';
import type { SeatObservation } from '../observations/index.ts';
import type { DecisionAnalysis, DecisionEvidence, ReasonClaim } from '../strategy/types.ts';

/**
 * Authored advice frozen with each human decision. Fields added for cue version 2
 * are optional, so advice saved earlier stays valid and is never backfilled.
 */
export type Advice = {
  focus: string;
  notice: string;
  reason: string;
  suggestion: string;
  card?: Card;
  pass?: Card[];
  bid?: number;
  highlightSuit?: Suit;
  provenance: 'code' | 'forced';
  policyVersion: string;
  reasonIds: string[];
  evidence: DecisionEvidence;
  /** Version of the authored cue text. Absent on advice saved before cue versions existed. */
  cueVersion?: string;
  /** COACH-14: `several-reasonable` names no single action; absent means a legacy suggestion. */
  outcome?: 'suggestion' | 'several-reasonable';
  /** COACH-12: `facts-only` shows exact context without a strategic explanation. */
  explanation?: 'supported' | 'facts-only';
  /** Named only when the outcome is `several-reasonable`; two or three distinct choices. */
  consideredCards?: Card[];
  consideredBids?: number[];
  /** COACH-15: typed claims behind every factual sentence in this advice. */
  claims?: ReasonClaim[];
};

/** Word budgets from planning/04: heading, cue, context and suggestion. */
export const COPY_BUDGET = { focus: 6, notice: 18, reason: 35, suggestion: 35 } as const;

/**
 * GP-05 / COACH-12: each game pack owns its cue text. The shared coach only
 * dispatches by the policy version recorded in the analysis.
 */
export interface CuePack {
  readonly id: string;
  readonly cueVersion: string;
  /** Whether this pack renders analyses produced under the given policy version. */
  renders(policyVersion: string): boolean;
  render(observation: SeatObservation, analysis: DecisionAnalysis): Advice;
}
