import { cardLabel, cardSuit } from '../../../game/cards.ts';
import type { Advice, CuePack } from '../../../coaching/types.ts';

export const HEARTS_LEGACY_CUE_VERSION = 'hearts-cues-1.0.0';

/**
 * The Hearts and pass wording shipped with `hearts-baseline-1.0.0`, moved here verbatim
 * from the shared renderer. It is frozen and adds no cue version, outcome or claim fields.
 * Its sentences describe the table and the rules only, so they hold for any selected
 * action; that is why this pack also renders the evaluation-only Hearts plan profiles.
 * The shared dispatcher renders forced plays and the no-decision envelope before this pack.
 */
export const heartsLegacyCues: CuePack = {
  id: 'hearts-cues-legacy',
  cueVersion: HEARTS_LEGACY_CUE_VERSION,
  renders: (policyVersion) => policyVersion.startsWith('hearts-'),
  render(obs, analysis): Advice {
    const selected = analysis.candidates.find((candidate) => candidate.disposition === 'selected');
    const base = {
      provenance: analysis.provenance,
      policyVersion: analysis.policyVersion,
      reasonIds: [...(selected?.reasonIds ?? [])],
      evidence: selected?.evidence ?? ('heuristic' as const),
    };
    const action = analysis.action;
    if (action.kind === 'pass')
      return {
        ...base,
        focus: 'Plan the whole pass',
        notice: 'Choose three cards before committing.',
        reason:
          'This local starting plan favors passing high cards. Keeping queen protection, a short suit or a possible moon plan can favor another. Received cards can change your suits.',
        suggestion: 'Consider these three together. Recheck your suits after receiving.',
        pass: [...action.cards],
      };
    if (action.kind !== 'play') throw new Error('Hearts has no bid.');
    const card = action.card;
    const led = obs.trick.length ? cardSuit(obs.trick[0].card) : undefined;
    const payload = { ...base, card, ...(led ? { highlightSuit: led } : {}) };
    const suitNames = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };
    return {
      ...payload,
      focus: led ? `${suitNames[led]} were led` : 'Choose your lead',
      notice: led
        ? obs.hand.some((entry) => cardSuit(entry) === led)
          ? `${suitNames[led]} were led. You must follow suit.`
          : `You have no ${suitNames[led]} to follow.`
        : `${obs.legalActions.length} cards are legal to lead.`,
      reason: 'Hearts and the queen carry points. A lower card does not always avoid taking the trick.',
      suggestion: `Consider ${cardLabel(card)}. Other plans can be reasonable.`,
    };
  },
};
