import type { Mode } from '../../../../../game/kernel/types.ts';
import type { SeatObservation } from '../../../../../observations/index.ts';
import type { DecisionAnalysis } from '../../../../../strategy/types.ts';
import { buildFacts } from './knowledge.ts';
import { analyzeSpades } from './policy.ts';

/**
 * SG-01: comparison baseline D0. A source snapshot of the policy that shipped as
 * spades-tactics-2.1.0, including its known defects. Never edit these files;
 * strategy changes belong to a new policy version.
 */
export const FROZEN_SPADES_POLICY_VERSION = 'spades-tactics-2.1.0';
export const FROZEN_SPADES_MODES: readonly Mode[] = ['spades-solo', 'spades-partners'];

export function analyzeFrozenSpades(observation: SeatObservation): DecisionAnalysis {
  if (!FROZEN_SPADES_MODES.includes(observation.mode))
    throw new Error('The frozen Spades baseline requires a Spades observation.');
  return analyzeSpades(observation, buildFacts(observation), FROZEN_SPADES_POLICY_VERSION);
}
