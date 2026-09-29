import type { Mode } from '../game/kernel/types.ts';
import type { SeatObservation } from '../observations/index.ts';
import type { DecisionAnalysis } from './types.ts';
import { heartsReasoning } from '../games/hearts/reasoning/manifest.ts';
import { spadesReasoning } from '../games/spades/reasoning/manifest.ts';

/** Trusted, build-time registered strategy modules. */
export interface ReasoningPack {
  readonly modes: readonly Mode[];
  readonly policyVersion: string;
  analyze(observation: SeatObservation): DecisionAnalysis;
}

const packs: readonly ReasoningPack[] = [heartsReasoning, spadesReasoning];

export function getReasoningPack(mode: string): ReasoningPack {
  const matches = packs.filter((pack) => pack.modes.includes(mode as Mode));
  if (matches.length !== 1) throw new Error(`No unique reasoning pack for mode: ${mode}`);
  return matches[0];
}

export function registeredReasoningModes(): Mode[] {
  return packs.flatMap((pack) => [...pack.modes]);
}
