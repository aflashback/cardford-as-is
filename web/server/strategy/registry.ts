import type { Mode } from '../game/kernel/types.ts';
import type { SeatObservation } from '../observations/index.ts';
import type { DecisionAnalysis } from './types.ts';
import { heartsReasoning } from '../games/hearts/reasoning/manifest.ts';
import { heartsPlanProfiles } from '../games/hearts/plan/profiles.ts';
import { spadesReasoning } from '../games/spades/reasoning/manifest.ts';
import { spadesPlanProfiles } from '../games/spades/plan/profiles.ts';
import { observedSpadesProfile } from '../games/spades/cases/profile.ts';

/** Trusted, build-time registered strategy modules. */
export interface ReasoningPack {
  readonly modes: readonly Mode[];
  readonly policyVersion: string;
  /**
   * `inline` analysis is cheap enough for the request path. `bounded-search` analysis
   * runs playouts and must be computed outside any database transaction.
   */
  readonly cost?: 'inline' | 'bounded-search';
  analyze(observation: SeatObservation): DecisionAnalysis;
}
export type Policy = (observation: SeatObservation) => DecisionAnalysis;

/** Live defaults: exactly one pack per catalog mode. Changing one is a recorded owner decision. */
const packs: readonly ReasoningPack[] = [heartsReasoning, spadesReasoning];
/** Every selectable policy, including the defaults. Non-default profiles serve evaluation and local trials. */
const profiles: readonly ReasoningPack[] = [...packs, ...spadesPlanProfiles, ...heartsPlanProfiles, observedSpadesProfile];

export function getReasoningPack(mode: string): ReasoningPack {
  const matches = packs.filter((pack) => pack.modes.includes(mode as Mode));
  if (matches.length !== 1) throw new Error(`No unique reasoning pack for mode: ${mode}`);
  return matches[0];
}

export function registeredReasoningModes(): Mode[] {
  return packs.flatMap((pack) => [...pack.modes]);
}

/** SG-05: an explicitly named policy for one mode. Unknown names fail closed. */
export function getReasoningProfile(policyVersion: string, mode: string): ReasoningPack {
  const matches = profiles.filter(
    (pack) => pack.policyVersion === policyVersion && pack.modes.includes(mode as Mode),
  );
  if (matches.length !== 1) throw new Error(`No unique reasoning profile ${policyVersion} for mode: ${mode}`);
  return matches[0];
}

/** Historical documents without a pin retain their original, explicitly supported policy. */
export function getLegacyReasoningProfile(mode: string): ReasoningPack {
  switch (mode) {
    case 'hearts': return getReasoningProfile('hearts-baseline-1.0.0', mode);
    case 'spades-solo':
    case 'spades-partners': return getReasoningProfile('spades-tactics-2.1.0', mode);
    default: throw new Error(`No legacy reasoning profile for mode: ${mode}`);
  }
}

export function listReasoningProfiles(mode: string): string[] {
  return profiles.filter((pack) => pack.modes.includes(mode as Mode)).map((pack) => pack.policyVersion);
}

export const costOf = (pack: ReasoningPack): 'inline' | 'bounded-search' => pack.cost ?? 'inline';
