import { actionId } from '../game/rules.ts';
import type { GameAction } from '../game/kernel/types.ts';
import { assertObservation, type SeatObservation } from '../observations/index.ts';
import { chooseBaselineAction } from './baseline.ts';
import { buildFacts } from './facts.ts';
import { analyzeSpades } from './spades.ts';
import type { DecisionAnalysis } from './types.ts';
export type { DecisionAnalysis, DecisionFacts, DecisionReason, CardOutcome, NilStatus } from './types.ts';
export { suggestBid } from './baseline.ts';
export const POLICY_VERSION = 'spades-tactics-2.0.0';

/** One seat-safe result is shared by bot execution and human coaching. */
export function analyzeDecision(obs: SeatObservation): DecisionAnalysis {
  assertObservation(obs);
  if (!obs.legalActions.length) throw new Error('No decision is available for this seat.');
  const facts = buildFacts(obs);
  if (obs.mode !== 'hearts') return analyzeSpades(obs, facts, POLICY_VERSION);
  const action = chooseBaselineAction(obs);
  const forced = obs.legalActions.length === 1;
  return {
    schemaVersion: '1.0.0',
    policyVersion: POLICY_VERSION,
    provenance: forced ? 'forced' : 'code',
    action,
    scenarioIds: [],
    facts,
    reasons: [
      {
        id: 'hearts.baseline',
        kind: forced ? 'fact' : 'heuristic',
        text: forced
          ? 'Only one legal action exists.'
          : 'Hearts retains the original local policy for this decision.',
      },
    ],
    candidates: obs.legalActions.map((a) => ({
      action: structuredClone(a),
      reasonIds: ['hearts.baseline'],
      disposition: actionId(a) === actionId(action) ? 'selected' : 'alternative',
      evidence: forced ? 'exact' : 'heuristic',
    })),
    limitations: ['Hearts delegates to the retained baseline; this version adds Spades tactics only.'],
  };
}
export function chooseAction(obs: SeatObservation): GameAction {
  return analyzeDecision(obs).action;
}
