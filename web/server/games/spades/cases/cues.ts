import { cardLabel } from '../../../game/cards.ts';
import { actionId } from '../../../game/rules.ts';
import type { Advice, CuePack } from '../../../coaching/types.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import type { DecisionAnalysis, ReasonClaim } from '../../../strategy/types.ts';
import { renderSpadesCues } from '../coaching/cues-v2.ts';
import { assessObservedCases, unbeatableLeadCue } from './proofs.ts';
import { OBSERVED_CASE_POLICY } from './profile.ts';

export const OBSERVED_CASE_CUES = 'spades-cases-cues-1.0.0';
const SUITS = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' } as const;
const SEATS = ['South', 'West', 'North', 'East'];

/** CASE-06: new wording belongs only to this policy; predicates use the selected action. */
export function renderObservedSpades(obs: SeatObservation, analysis: DecisionAnalysis): Advice {
  if (analysis.schemaVersion !== '1.1.0' || analysis.policyVersion !== OBSERVED_CASE_POLICY)
    throw new Error('Observed cases require their own plan-layer analysis.');
  const base = renderSpadesCues(obs, analysis).advice;
  const action = analysis.action;
  if (action.kind !== 'play') return { ...base, cueVersion: OBSERVED_CASE_CUES };
  const cases = assessObservedCases(obs, analysis.facts);
  const forced = analysis.provenance === 'forced';
  const id = actionId(action);
  const claims = (entry: ReasonClaim): ReasonClaim[] => forced
    ? [entry, { predicate: 'forced-action', args: { actionId: id } }] : [entry];
  const forcedSuggestion = `Play the ${cardLabel(action.card)}; it is your only legal card.`;
  const reasonIds = (caseId: string) => forced ? [caseId, 'S01.forced'] : [caseId];
  if (cases.sweep) {
    const several = !forced && cases.sweep.actionIds.length > 1;
    const { card: _card, consideredCards: _considered, ...rest } = base;
    return {
      ...rest, cueVersion: OBSERVED_CASE_CUES, evidence: 'exact', explanation: 'facts-only',
      reasonIds: reasonIds('CASE-03.public-sweep'),
      outcome: several ? 'several-reasonable' : 'suggestion',
      ...(forced ? { card: action.card } : {}),
      focus: 'Remaining tricks decided',
      notice: `${SEATS[cases.sweep.winner]} controls the remaining ${SUITS[cases.sweep.suit]} run.`,
      reason: 'Every remaining card of that suit belongs to the next leader; no spade can interrupt the run.',
      suggestion: forced ? forcedSuggestion : 'Several legal discards have the same result.',
      claims: claims({ predicate: 'case-public-sweep', args: { winner: cases.sweep.winner, suit: cases.sweep.suit } }),
    };
  }
  if (cases.noEntry) return {
    ...base, cueVersion: OBSERVED_CASE_CUES, evidence: 'exact', outcome: 'suggestion', explanation: 'facts-only',
    reasonIds: reasonIds('CASE-02.no-entry'),
    focus: 'No route to the lead', notice: 'You cannot win another trick this hand.',
    reason: `You hold every remaining card in ${SUITS[cases.noEntry.suit]} and cannot get the lead to play them.`,
    suggestion: forced ? forcedSuggestion : 'Choose a legal discard.',
    claims: claims({ predicate: 'case-no-entry', args: { suit: cases.noEntry.suit } }),
  };
  if (!forced && cases.partnerResource?.actionIds.includes(id)) {
    const resource = cases.partnerResource;
    return {
      ...base, cueVersion: OBSERVED_CASE_CUES, evidence: 'heuristic',
      reasonIds: reasonIds('CASE-01.preserve-partner-trump'),
      focus: 'Keep partner’s spades',
      notice: `Opponents are out of spades; partner is void in ${SUITS[resource.suit]}.`,
      reason: `Your partner can win with a spade; keep your ${cardLabel(resource.entry)} to take the lead later.`,
      suggestion: `Consider the ${cardLabel(action.card)} to let your partner use a spade.`,
      claims: [{ predicate: 'case-partner-resource', args: { partner: resource.partner, suit: resource.suit, entry: resource.entry } }],
    };
  }
  if (unbeatableLeadCue(obs, analysis.facts, id)) return {
    ...base, cueVersion: OBSERVED_CASE_CUES,
    reasonIds: reasonIds('CASE-04.unbeatable-lead'),
    focus: 'Unbeatable lead', notice: 'No legal reply can beat this card.',
    reason: 'This lead cannot be beaten.',
    suggestion: `Consider the ${cardLabel(action.card)} to take this trick.`,
    claims: [{ predicate: 'guaranteed-winner', args: { actionId: id, winner: obs.seat } }],
  };
  return { ...base, cueVersion: OBSERVED_CASE_CUES };
}

export const observedSpadesCues: CuePack = {
  id: 'spades-observed-cases', cueVersion: OBSERVED_CASE_CUES,
  renders: (version) => version === OBSERVED_CASE_POLICY, render: renderObservedSpades,
};
