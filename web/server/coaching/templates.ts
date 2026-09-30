import { cardLabel, cardSuit } from '../game/cards.ts';
import { actionId } from '../game/rules.ts';
import { assertObservation, type SeatObservation } from '../observations/index.ts';
import { analyzeDecision, getReasoningPack } from '../strategy/index.ts';
import type { DecisionAnalysis } from '../strategy/types.ts';
import { resolveCuePack } from './cue-registry.ts';

export type { Advice } from './types.ts';
import type { Advice } from './types.ts';

/**
 * One analysis drives bots and coach. This shared entry point validates the decision,
 * renders the two envelopes that carry no strategy (no decision, forced play) and hands
 * every other decision to the cue pack registered for the analysis's policy version.
 */
export function explain(obs: SeatObservation, suppliedAnalysis?: DecisionAnalysis): Advice {
  assertObservation(obs);
  if (!obs.legalActions.length)
    return {
      provenance: 'code',
      policyVersion: getReasoningPack(obs.mode).policyVersion,
      reasonIds: [],
      evidence: 'exact',
      focus: obs.phase === 'hand-end' || obs.phase === 'match-end' ? 'Hand complete' : 'Watch the table',
      notice: 'No decision for you right now.',
      reason: 'The memory aid shows facts from this hand’s public plays.',
      suggestion: '',
    };
  const analysis = suppliedAnalysis ?? analyzeDecision(obs);
  if (
    analysis.action.seat !== obs.seat ||
    !obs.legalActions.some((action) => actionId(action) === actionId(analysis.action))
  )
    throw new Error('Analysis does not match this legal decision.');
  const registration = resolveCuePack(analysis, obs.mode);
  const action = analysis.action;
  if (registration.forced === 'shared' && analysis.provenance === 'forced' && action.kind === 'play') {
    const selected = analysis.candidates.find((candidate) => candidate.disposition === 'selected');
    const led = obs.trick.length ? cardSuit(obs.trick[0].card) : undefined;
    return {
      provenance: analysis.provenance,
      policyVersion: analysis.policyVersion,
      reasonIds: [...(selected?.reasonIds ?? [])],
      evidence: selected?.evidence ?? ('heuristic' as const),
      card: action.card,
      ...(led ? { highlightSuit: led } : {}),
      focus: 'One legal play',
      notice: `${cardLabel(action.card)} is your only legal card.`,
      reason: 'The rules leave no strategic choice on this turn.',
      suggestion: `Play ${cardLabel(action.card)}.`,
    };
  }
  return registration.pack.render(obs, analysis);
}
