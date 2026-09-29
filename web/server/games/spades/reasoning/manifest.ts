import type { ReasoningPack } from '../../../strategy/registry.ts';
import { buildFacts } from '../../../strategy/facts.ts';
import { analyzeSpades } from '../../../strategy/spades.ts';

export const SPADES_POLICY_VERSION = 'spades-tactics-2.0.0';

export const spadesReasoning: ReasoningPack = {
  modes: ['spades-solo', 'spades-partners'],
  policyVersion: SPADES_POLICY_VERSION,
  analyze(obs) {
    return analyzeSpades(obs, buildFacts(obs), SPADES_POLICY_VERSION);
  },
};
