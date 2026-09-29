import { actionId } from '../../../game/rules.ts';
import { chooseBaselineAction } from '../../../strategy/baseline.ts';
import { buildFacts } from '../../../strategy/facts.ts';
import type { ReasoningPack } from '../../../strategy/registry.ts';

export const HEARTS_POLICY_VERSION = 'hearts-baseline-1.0.0';

export const heartsReasoning: ReasoningPack = {
  modes: ['hearts'],
  policyVersion: HEARTS_POLICY_VERSION,
  analyze(obs) {
    const action = chooseBaselineAction(obs);
    const forced = obs.legalActions.length === 1;
    return {
      schemaVersion: '1.0.0',
      policyVersion: HEARTS_POLICY_VERSION,
      provenance: forced ? 'forced' : 'code',
      action,
      scenarioIds: [],
      facts: buildFacts(obs),
      reasons: [
        {
          id: 'hearts.baseline',
          kind: forced ? 'fact' : 'heuristic',
          text: forced
            ? 'Only one legal action exists.'
            : 'Hearts retains the original local policy for this decision.',
        },
      ],
      candidates: obs.legalActions.map((candidate) => ({
        action: structuredClone(candidate),
        reasonIds: ['hearts.baseline'],
        disposition: actionId(candidate) === actionId(action) ? 'selected' : 'alternative',
        evidence: forced ? 'exact' : 'heuristic',
      })),
      limitations: ['Hearts delegates to the retained baseline; this version adds Spades tactics only.'],
      trace: {
        schemaVersion: '1.0.0',
        policyVersion: HEARTS_POLICY_VERSION,
        catalogVersion: 'hearts-baseline-catalog-1.0.0',
        selectedActionId: actionId(action),
        selectedBy: forced ? 'forced' : 'baseline',
        scenarioChecks: [],
        candidates: obs.legalActions.map((candidate, tieOrder) => ({
          actionId: actionId(candidate), score: null, effects: [], tieOrder,
        })),
        limitations: ['Hearts retains its uncalibrated local baseline.'],
      },
    };
  },
};
