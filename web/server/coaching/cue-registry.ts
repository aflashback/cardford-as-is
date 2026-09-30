import { heartsLegacyCues } from '../games/hearts/coaching/cues-legacy.ts';
import { spadesLegacyCues } from '../games/spades/coaching/cues-legacy.ts';
import { spadesPlanCues } from '../games/spades/coaching/cues-v2.ts';
import type { DecisionAnalysis } from '../strategy/types.ts';
import type { CuePack } from './types.ts';

/**
 * GP-05 / COACH-12: trusted, build-time registered cue packs. Each game pack owns its
 * wording; the shared coach only picks the pack by the policy version in the analysis.
 *
 * `forced: 'shared'` packs were written when the shared renderer produced the forced-play
 * envelope, and keep it. `forced: 'own'` packs render forced plays themselves so that the
 * advice carries their cue version and typed claims.
 */
export type CueRegistration = {
  pack: CuePack;
  forced: 'shared' | 'own';
  /** Catalog modes whose analyses saved before the plan layer fall back to this pack. */
  legacyModes: readonly string[];
};

const registrations: readonly CueRegistration[] = [
  { pack: spadesLegacyCues, forced: 'shared', legacyModes: ['spades-solo', 'spades-partners'] },
  { pack: heartsLegacyCues, forced: 'shared', legacyModes: ['hearts'] },
  { pack: spadesPlanCues, forced: 'own', legacyModes: [] },
];

export function listCuePacks(): CuePack[] {
  return registrations.map((entry) => entry.pack);
}

/**
 * Exactly one pack renders a policy version. An analysis saved before the plan layer
 * (schema 1.0.0) under a policy version no pack names keeps the wording it always had.
 * A plan-layer analysis no pack names fails closed: wording written for another policy
 * is never shown for it.
 */
export function resolveCuePack(
  analysis: Pick<DecisionAnalysis, 'policyVersion' | 'schemaVersion'>,
  mode: string,
): CueRegistration {
  const matches = registrations.filter((entry) => entry.pack.renders(analysis.policyVersion));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`More than one cue pack renders policy: ${analysis.policyVersion}`);
  const legacy = registrations.filter((entry) => entry.legacyModes.includes(mode));
  if (analysis.schemaVersion === '1.0.0' && legacy.length === 1) return legacy[0];
  throw new Error(`No cue pack renders policy: ${analysis.policyVersion}`);
}

export function getCuePack(policyVersion: string, mode: string): CuePack {
  const matches = registrations.filter((entry) => entry.pack.renders(policyVersion));
  if (matches.length !== 1) throw new Error(`No unique cue pack for policy ${policyVersion} in mode: ${mode}`);
  return matches[0].pack;
}
