import { actionId } from '../../../game/rules.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import type { ReasoningPack } from '../../../strategy/registry.ts';
import type { DecisionAnalysisV11, DecisionReason } from '../../../strategy/types.ts';
import { analyzeSpadesPlan, getSpadesProfile } from '../plan/profiles.ts';
import { assessObservedCases, unbeatableLeadCue } from './proofs.ts';

export const OBSERVED_CASE_POLICY = 'spades-cases-4.0.0';
/** Combined catalog extends the retained spades-catalog-1.0.0 tactical catalog. */
export const OBSERVED_CASE_CATALOG = 'spades-cases-1.0.0';
const PARTNER_PREFERENCE = 200; // Ordering only; no probability or strength estimate.

/** Inline successor to 3.0; original profiles, bidder, rules and saved advice stay frozen. */
export function analyzeObservedSpades(obs: SeatObservation): DecisionAnalysisV11 {
  const analysis = analyzeSpadesPlan(obs, getSpadesProfile('spades-plan-3.0.0'));
  analysis.policyVersion = OBSERVED_CASE_POLICY;
  const cases = assessObservedCases(obs, analysis.facts);
  const forced = obs.legalActions.length === 1;
  if (analysis.trace) {
    analysis.trace.policyVersion = OBSERVED_CASE_POLICY;
    analysis.trace.catalogVersion = OBSERVED_CASE_CATALOG;
    analysis.trace.limitations.push('This combined catalog adds CASE-01..04 to the retained 3.0 tactical catalog; ordering weights are not probabilities.');
  }

  const append = (id: string, reason: DecisionReason) => {
    analysis.scenarioIds.push(id);
    analysis.reasons.push(reason);
    for (const candidate of analysis.candidates)
      if (!reason.actionIds || reason.actionIds.includes(actionId(candidate.action))) candidate.reasonIds.unshift(reason.id);
  };
  if (cases.partnerResource && !forced) {
    const { actionIds, partner, suit, entry } = cases.partnerResource;
    append('CASE-01', {
      id: 'CASE-01.preserve-partner-trump', kind: 'heuristic', actionIds,
      text: 'Offer the positive partner a ruff while retaining an unbeatable trump entry; this is a conditional preference.',
      claims: [{ predicate: 'case-partner-resource', args: { partner, suit, entry } }],
    });
    for (const candidate of analysis.trace?.candidates ?? []) {
      if (!actionIds.includes(candidate.actionId)) continue;
      candidate.score = (candidate.score ?? 0) + PARTNER_PREFERENCE;
      candidate.effects.push({ id: 'CASE-01.preserve-partner-trump', delta: PARTNER_PREFERENCE });
    }
    const ranked = analysis.trace?.candidates.toSorted((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.tieOrder - b.tieOrder);
    const chosen = ranked?.[0]?.actionId;
    if (chosen) analysis.action = structuredClone(obs.legalActions.find((action) => actionId(action) === chosen)!);
  }
  if (cases.noEntry) append('CASE-02', {
    id: 'CASE-02.no-entry', kind: 'fact',
    text: 'This seat cannot win another trick: it owns every remaining card of its only side suit and cannot regain the lead.',
    claims: [{ predicate: 'case-no-entry', args: { suit: cases.noEntry.suit } }],
  });
  if (cases.noEntry)
    for (const candidate of analysis.trace?.candidates ?? []) candidate.effects.push({ id: 'CASE-02.no-entry', delta: 0 });
  if (cases.sweep) append('CASE-03', {
    id: 'CASE-03.public-sweep', kind: 'fact',
    text: 'The proved next leader owns the remaining suit monopoly without any remaining trump response; every legal defender discard has the same outcome.',
    claims: [{ predicate: 'case-public-sweep', args: { winner: cases.sweep.winner, suit: cases.sweep.suit } }],
  });
  if (cases.sweep)
    for (const candidate of analysis.trace?.candidates ?? []) candidate.effects.push({ id: 'CASE-03.public-sweep', delta: 0 });

  const selectedId = actionId(analysis.action);
  if (unbeatableLeadCue(obs, analysis.facts, selectedId)) append('CASE-04', {
    id: 'CASE-04.unbeatable-lead', kind: 'fact', actionIds: [selectedId],
    text: 'No legal response can beat the selected lead.',
    claims: [{ predicate: 'guaranteed-winner', args: { actionId: selectedId, winner: obs.seat } }],
  });
  if (analysis.scenarioIds.includes('CASE-04'))
    analysis.trace?.candidates.find((candidate) => candidate.actionId === selectedId)?.effects.push({ id: 'CASE-04.unbeatable-lead', delta: 0 });
  for (const candidate of analysis.candidates) candidate.disposition = actionId(candidate.action) === selectedId ? 'selected' : 'alternative';
  analysis.candidates.sort((a, b) => Number(b.disposition === 'selected') - Number(a.disposition === 'selected'));
  // A stance reason created for the original card cannot be borrowed by the new one.
  analysis.reasons = analysis.reasons.filter((reason) => reason.id !== 'PLAN.stance');
  for (const candidate of analysis.candidates) candidate.reasonIds = candidate.reasonIds.filter((id) => id !== 'PLAN.stance');
  if (cases.noEntry || cases.sweep) {
    analysis.decision.planSupported = false;
    analysis.decision.coach.explanation = 'facts-only';
    analysis.limitations.push('Exact entry/sweep proof overrides the coarse public-count plan; no unsupported future-control plan is shown.');
  } else if (analysis.decision.planSupported) {
    const reason: DecisionReason = {
      id: 'PLAN.stance', kind: 'fact', actionIds: [selectedId],
      text: `One plan: ${analysis.plan.stance.title.toLowerCase()}.`,
      claims: [{ predicate: 'plan-stance', args: { stanceId: analysis.plan.stance.id } }],
    };
    analysis.reasons.push(reason);
    analysis.candidates.find((candidate) => candidate.disposition === 'selected')!.reasonIds.unshift(reason.id);
  }
  if (cases.sweep && !forced) {
    const others = cases.sweep.actionIds.filter((id) => id !== selectedId);
    analysis.decision.comparableActionIds = others;
    analysis.decision.tiedActionIds = others;
    analysis.decision.coach.outcome = 'several-reasonable';
    for (const candidate of analysis.candidates) candidate.evidence = 'exact';
  }
  if (analysis.trace) {
    analysis.trace.selectedActionId = selectedId;
    analysis.trace.scenarioChecks.push(...['CASE-01', 'CASE-02', 'CASE-03', 'CASE-04'].map((id) => ({
      id, result: analysis.scenarioIds.includes(id) ? 'matched' as const : 'not-matched' as const,
    })));
  }
  return analysis;
}

export const observedSpadesProfile: ReasoningPack = {
  modes: ['spades-solo', 'spades-partners'], policyVersion: OBSERVED_CASE_POLICY, cost: 'inline', analyze: analyzeObservedSpades,
};
