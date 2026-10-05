import { cardLabel } from '../../../game/cards.ts';
import { actionId } from '../../../game/rules.ts';
import type { Advice, CuePack } from '../../../coaching/types.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import type { DecisionAnalysis } from '../../../strategy/types.ts';
import { renderObservedSpades } from '../cases/cues.ts';
import { OBSERVED_CASE_POLICY } from '../cases/profile.ts';
import { PARTNER_RESOURCE_POLICY } from './profile.ts';

export const PARTNER_RESOURCE_CUES = 'spades-partner-resource-cues-1.0.0';
const SUITS: Record<string, string> = { C: 'clubs', D: 'diamonds', H: 'hearts' };

/** PR-02: consume the selected analysis reason; never recompute a different preference. */
export function renderPartnerResources(obs: SeatObservation, analysis: DecisionAnalysis): Advice {
  if (analysis.schemaVersion !== '1.1.0' || analysis.policyVersion !== PARTNER_RESOURCE_POLICY)
    throw new Error('Partner resources require their pinned analysis.');
  const base = {
    ...renderObservedSpades(obs, { ...analysis, policyVersion: OBSERVED_CASE_POLICY }),
    policyVersion: PARTNER_RESOURCE_POLICY,
    cueVersion: PARTNER_RESOURCE_CUES,
  };
  if (analysis.action.kind !== 'play' || analysis.provenance === 'forced') return base;
  const id = actionId(analysis.action);
  const reason = analysis.reasons.find(
    (entry) => entry.id.startsWith('CASE-01.') && entry.actionIds?.includes(id),
  );
  if (!reason) return base;
  if (reason.id === 'CASE-01.offer-safe-ruff') {
    const claim = reason.claims![0];
    return {
      ...base,
      card: analysis.action.card,
      evidence: 'heuristic',
      outcome: 'suggestion',
      explanation: 'supported',
      reasonIds: [reason.id],
      focus: 'Offer partner a ruff',
      notice: `Partner is void in ${SUITS[String(claim.args.suit)]}; a safe trump resource is proved.`,
      reason: `Partner can choose a winning ruff. Keep your ${cardLabel(String(claim.args.entry))} as an entry; future team tricks still depend on play.`,
      suggestion: `Consider ${cardLabel(analysis.action.card)} to offer the ruff.`,
      claims: [claim, { predicate: 'trump-optional', args: {} }],
    };
  }
  return {
    ...base,
    card: analysis.action.card,
    evidence: 'heuristic',
    outcome: 'suggestion',
    explanation: 'supported',
    reasonIds: [reason.id],
    focus: 'Partner’s trick is secure',
    notice: 'Partner already has a winning card that no reply can beat.',
    reason:
      'Taking this trick adds no team trick. Keep your extra winner available for later; its future use remains conditional.',
    suggestion: `Consider ${cardLabel(analysis.action.card)} to leave partner in control.`,
    claims: reason.claims!.filter((claim) => claim.args.actionId === id),
  };
}
export const partnerResourceCues: CuePack = {
  id: 'spades-partner-resource',
  cueVersion: PARTNER_RESOURCE_CUES,
  renders: (version) => version === PARTNER_RESOURCE_POLICY,
  render: renderPartnerResources,
};
