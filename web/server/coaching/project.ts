import type { AdviceView } from '../../shared/contracts.ts';
import type { Advice } from './types.ts';

/**
 * COACH-14 / UX-21: the one projection from frozen advice to what a help level may show.
 *
 * | Level | Adds                                                              |
 * |-------|-------------------------------------------------------------------|
 * | 1     | focus, notice, highlightSuit                                      |
 * | 2     | reason                                                            |
 * | 3     | suggestion and either the action or the considered choices        |
 *
 * Versioned advice (cue version 2 onward) also returns outcome, explanation, evidence,
 * policy version and cue version at every level. Advice saved before cue versions existed
 * projects exactly as it always did: no field is added and none is backfilled.
 */
export function projectAdvice(advice: Advice, requestedLevel: 1 | 2 | 3, decisionId: string): AdviceView {
  if (requestedLevel !== 1 && requestedLevel !== 2 && requestedLevel !== 3)
    throw new Error('Unsupported help level.');
  const several = advice.outcome === 'several-reasonable';
  const consideredCards = advice.consideredCards ?? [];
  const consideredBids = advice.consideredBids ?? [];
  // Server assertion: an abstention never names a single action, at any level.
  if (several && (advice.card !== undefined || advice.pass !== undefined || advice.bid !== undefined))
    throw new Error('Advice with several reasonable choices must not carry a single action.');
  if (!several && (consideredCards.length || consideredBids.length))
    throw new Error('Considered choices belong only to advice with several reasonable choices.');
  if (consideredCards.length && consideredBids.length)
    throw new Error('Considered choices are either cards or bids.');
  for (const considered of [consideredCards, consideredBids])
    if (
      considered.length &&
      (considered.length < 2 || considered.length > 3 || new Set<unknown>(considered).size !== considered.length)
    )
      throw new Error('Two or three distinct considered choices are required.');

  const versioned = advice.cueVersion !== undefined;
  return {
    focus: advice.focus,
    notice: advice.notice,
    reason: requestedLevel >= 2 ? advice.reason : '',
    suggestion: requestedLevel === 3 ? advice.suggestion : '',
    source: advice.provenance,
    decisionId,
    requestedLevel,
    ...(requestedLevel === 3
      ? {
          ...(advice.card ? { card: advice.card } : {}),
          ...(advice.pass ? { pass: [...advice.pass] } : {}),
          ...(advice.bid !== undefined ? { bid: advice.bid } : {}),
          ...(consideredCards.length ? { consideredCards: [...consideredCards] } : {}),
          ...(consideredBids.length ? { consideredBids: [...consideredBids] } : {}),
        }
      : {}),
    ...(advice.highlightSuit ? { highlightSuit: advice.highlightSuit } : {}),
    ...(versioned
      ? {
          ...(advice.outcome ? { outcome: advice.outcome } : {}),
          ...(advice.explanation ? { explanation: advice.explanation } : {}),
          evidence: advice.evidence,
          policyVersion: advice.policyVersion,
          cueVersion: advice.cueVersion,
        }
      : {}),
  };
}
