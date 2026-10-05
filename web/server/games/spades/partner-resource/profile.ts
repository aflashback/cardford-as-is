import { actionId } from '../../../game/rules.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import type { ReasoningPack } from '../../../strategy/registry.ts';
import type { DecisionAnalysisV11, DecisionReason } from '../../../strategy/types.ts';
import { analyzeObservedSpades } from '../cases/profile.ts';
import { unbeatableLeadCue } from '../cases/proofs.ts';
import { assessPartnerResources } from './proofs.ts';

export const PARTNER_RESOURCE_POLICY = 'spades-partner-resource-4.1.0';
export const PARTNER_RESOURCE_CATALOG = 'spades-partner-resource-1.0.0';
const PREFERENCE = 200; // Conditional order only, never calibrated value.

/** PR-01/02: an opt-in successor; 3.0, 4.0, rules, bids and live defaults stay frozen. */
export function analyzePartnerResources(obs: SeatObservation): DecisionAnalysisV11 {
  const analysis = analyzeObservedSpades(obs);
  analysis.policyVersion = PARTNER_RESOURCE_POLICY;
  if (obs.mode === 'spades-solo') {
    if (analysis.trace) {
      analysis.trace.policyVersion = PARTNER_RESOURCE_POLICY;
      analysis.trace.catalogVersion = PARTNER_RESOURCE_CATALOG;
    }
    return analysis;
  }
  const assessment = assessPartnerResources(obs, analysis.facts);
  const forced = analysis.provenance === 'forced';
  // Replace only the retained CASE-01 preference, rather than stacking it twice.
  const replaced = new Set(['CASE-01.preserve-partner-trump', 'CASE-04.unbeatable-lead', 'PLAN.stance']);
  analysis.reasons = analysis.reasons.filter((reason) => !replaced.has(reason.id));
  analysis.scenarioIds = analysis.scenarioIds.filter((id) => id !== 'CASE-01' && id !== 'CASE-04');
  for (const candidate of analysis.candidates)
    candidate.reasonIds = candidate.reasonIds.filter((id) => !replaced.has(id));
  for (const candidate of analysis.trace?.candidates ?? []) {
    candidate.score =
      (candidate.score ?? 0) -
      candidate.effects
        .filter((effect) => effect.id === 'CASE-01.preserve-partner-trump')
        .reduce((sum, effect) => sum + effect.delta, 0);
    candidate.effects = candidate.effects.filter((effect) => !replaced.has(effect.id));
  }
  const add = (reason: DecisionReason) => {
    analysis.reasons.push(reason);
    for (const candidate of analysis.candidates)
      if (!reason.actionIds || reason.actionIds.includes(actionId(candidate.action)))
        candidate.reasonIds.unshift(reason.id);
  };
  const offer = assessment.offer;
  const conserve = assessment.conserve;
  const preferenceIds = !forced ? (offer?.actionIds ?? conserve?.actionIds ?? []) : [];
  if (preferenceIds.length) {
    analysis.scenarioIds.push('CASE-01');
    const reason: DecisionReason = offer
      ? {
          id: 'CASE-01.offer-safe-ruff',
          kind: 'heuristic',
          actionIds: preferenceIds,
          text: 'Public resources permit a partner ruff while retaining a master trump entry. Prefer offering that route; partner is free to discard instead.',
          claims: [
            {
              predicate: 'partner-safe-ruff-resource',
              args: {
                partner: offer.partner,
                suit: offer.suit,
                entry: offer.entry,
                trumpFloor: offer.trumpFloor,
              },
            },
          ],
        }
      : {
          id: 'CASE-01.partner-secure',
          kind: 'heuristic',
          actionIds: preferenceIds,
          text: 'Partner already has a secure credited winner; retain the extra winning resource instead of taking the same team trick.',
          claims: preferenceIds.map((id) => ({
            predicate: 'guaranteed-winner',
            args: { actionId: id, winner: conserve!.partner },
          })),
        };
    add(reason);
    for (const candidate of analysis.trace?.candidates ?? [])
      if (preferenceIds.includes(candidate.actionId)) {
        candidate.score = (candidate.score ?? 0) + PREFERENCE;
        candidate.effects.push({ id: reason.id, delta: PREFERENCE });
      }
  }
  for (const guard of assessment.checks)
    if (!guard.holds) analysis.limitations.push(`CASE-01 guard not established: ${guard.id}.`);
  if (!offer && !conserve && assessment.checks.length) {
    const missing = assessment.checks.filter((guard) => !guard.holds).map((guard) => guard.id);
    add({
      id: 'CASE-01.not-established',
      kind: 'heuristic',
      text: `Partner resource preference withheld: ${missing.join(', ') || 'no useful resource action'}.`,
    });
  }
  if (!forced) {
    const selected = analysis.trace?.candidates.toSorted(
      (a, b) => (b.score ?? 0) - (a.score ?? 0) || a.tieOrder - b.tieOrder,
    )[0]?.actionId;
    if (selected)
      analysis.action = structuredClone(obs.legalActions.find((action) => actionId(action) === selected)!);
  }
  const id = actionId(analysis.action);
  if (unbeatableLeadCue(obs, analysis.facts, id)) {
    analysis.scenarioIds.push('CASE-04');
    add({
      id: 'CASE-04.unbeatable-lead',
      kind: 'fact',
      actionIds: [id],
      text: 'No legal response can beat the selected lead.',
      claims: [{ predicate: 'guaranteed-winner', args: { actionId: id, winner: obs.seat } }],
    });
  }
  for (const candidate of analysis.candidates)
    candidate.disposition = actionId(candidate.action) === id ? 'selected' : 'alternative';
  analysis.candidates.sort(
    (a, b) => Number(b.disposition === 'selected') - Number(a.disposition === 'selected'),
  );
  if (preferenceIds.includes(id)) {
    // The prior coarse stance was written for a different action; the family explains this one.
    analysis.decision.planSupported = false;
    analysis.decision.coach.explanation = 'supported';
    analysis.decision.coach.outcome = 'suggestion';
    analysis.decision.comparableActionIds = [];
    analysis.decision.tiedActionIds = [];
  } else if (analysis.decision.planSupported)
    add({
      id: 'PLAN.stance',
      kind: 'fact',
      actionIds: [id],
      text: `One plan: ${analysis.plan.stance.title.toLowerCase()}.`,
      claims: [{ predicate: 'plan-stance', args: { stanceId: analysis.plan.stance.id } }],
    });
  if (analysis.trace) {
    analysis.trace.policyVersion = PARTNER_RESOURCE_POLICY;
    analysis.trace.catalogVersion = PARTNER_RESOURCE_CATALOG;
    analysis.trace.selectedActionId = id;
    analysis.trace.scenarioChecks = analysis.trace.scenarioChecks.filter(
      (entry) => entry.id !== 'CASE-01' && entry.id !== 'CASE-04',
    );
    analysis.trace.scenarioChecks.push({
      id: 'CASE-01',
      result: analysis.scenarioIds.includes('CASE-01') ? 'matched' : 'not-matched',
    });
    analysis.trace.scenarioChecks.push(
      ...assessment.checks.map((guard) => ({
        id: `CASE-01.${guard.id}`,
        result: guard.holds ? ('matched' as const) : ('not-matched' as const),
      })),
    );
    analysis.trace.limitations.push(
      'PR-01: exact eligibility is distinct from the conditional ruff/conservation ordering; partner need not trump.',
    );
  }
  return analysis;
}

export const partnerResourceProfile: ReasoningPack = {
  modes: ['spades-solo', 'spades-partners'],
  policyVersion: PARTNER_RESOURCE_POLICY,
  cost: 'inline',
  analyze: analyzePartnerResources,
};
