import { cardLabel, cardSuit } from '../game/cards.ts';
import { actionId } from '../game/rules.ts';
import type { Card, Suit } from '../game/kernel/types.ts';
import { assertObservation, type SeatObservation } from '../observations/index.ts';
import { analyzeDecision, POLICY_VERSION } from '../strategy/index.ts';
import type { DecisionAnalysis } from '../strategy/types.ts';

export type Advice = {
  focus: string;
  notice: string;
  reason: string;
  suggestion: string;
  card?: Card;
  pass?: Card[];
  bid?: number;
  highlightSuit?: Suit;
  provenance: 'code' | 'forced';
  policyVersion: string;
  reasonIds: string[];
  evidence: 'exact' | 'heuristic';
};

/** Display a small set of complete reasons; the saved analysis keeps every reason. */
function reasonText(analysis: DecisionAnalysis, preferred: string[] = []): string {
  const selected = analysis.candidates.find((candidate) => candidate.disposition === 'selected');
  const available = selected?.reasonIds ?? [];
  const ids = [...new Set([...preferred, ...available])].filter((id) => available.includes(id));
  const statements: string[] = [];
  for (const id of ids) {
    const reason = analysis.reasons.find((entry) => entry.id === id);
    if (!reason || [...statements, reason.text].join(' ').length > 1700) continue;
    statements.push(reason.text);
    if (statements.length === 2) break;
  }
  return statements.join(' ');
}

/** Original templates consume the same selected action and reason IDs as bots. */
export function explain(obs: SeatObservation, suppliedAnalysis?: DecisionAnalysis): Advice {
  assertObservation(obs);
  if (!obs.legalActions.length)
    return {
      provenance: 'code',
      policyVersion: POLICY_VERSION,
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
  if (action.kind === 'bid')
    return {
      ...base,
      focus: obs.mode === 'spades-partners' ? 'Your team contract' : 'Your own contract',
      notice: 'Count likely tricks before bidding.',
      reason: reasonText(analysis),
      suggestion: `Consider ${action.bid}. It is a starting estimate, not a guarantee.`,
      bid: action.bid,
    };
  const card = action.card;
  const led = obs.trick.length ? cardSuit(obs.trick[0].card) : undefined;
  const payload = { ...base, card, ...(led ? { highlightSuit: led } : {}) };
  if (analysis.provenance === 'forced')
    return {
      ...payload,
      focus: 'One legal play',
      notice: `${cardLabel(card)} is your only legal card.`,
      reason: 'The rules leave no strategic choice on this turn.',
      suggestion: `Play ${cardLabel(card)}.`,
    };
  if (obs.mode === 'hearts') {
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
  }

  const facts = analysis.facts;
  const outcome = facts.cardOutcomes.find((entry) => entry.actionId === actionId(action));
  const winsNow = outcome?.currentWinner === obs.seat;
  const has = (id: string) => base.reasonIds.includes(id);
  const reason = (...ids: string[]) => reasonText(analysis, ids);
  const lead = obs.trick.length === 0;
  const cue = (focus: string, notice: string, explanation: string, suggestion: string): Advice => ({
    ...payload,
    focus,
    notice,
    reason: explanation,
    suggestion,
  });

  // Selected partnership cover precedes own failed-Nil/bag wording.
  if (outcome?.coversPartnerNil)
    return cue(
      'Cover your partner’s Nil',
      facts.ownNil === 'live'
        ? 'Both Nil commitments are still live.'
        : 'Your Nil partner is currently ahead.',
      facts.ownNil === 'live'
        ? reason('P04.cover-tradeoff', 'P04.double-nil')
        : reason('P02.live-nil-cover', 'S04.turn-order'),
      `Consider ${cardLabel(card)} to take the trick off your partner.`,
    );
  if (has('P02.covering-lead') || has('P02.cover-before-partner'))
    return cue(
      'Give your Nil partner cover',
      'Your partner’s Nil is still live.',
      reason(has('P02.covering-lead') ? 'P02.covering-lead' : 'P02.cover-before-partner', 'S04.turn-order'),
      `Consider ${cardLabel(card)} to give your partner room to duck.`,
    );
  if (has('P03.no-cover'))
    return cue(
      'No legal Nil cover',
      'Your Nil partner is currently ahead.',
      reason('P03.no-cover', 'S04.turn-order'),
      `No covering play is available; consider ${cardLabel(card)}.`,
    );
  if (facts.ownNil === 'live') {
    const canUnderplay = facts.cardOutcomes.some((entry) => entry.currentWinner !== obs.seat);
    return cue(
      'Protect your Nil',
      facts.partnerNil === 'live' ? 'Both Nil commitments are still live.' : 'You bid Nil: take no tricks.',
      reason(
        !lead && !winsNow ? 'S05.shed-risk' : 'S06.no-underplay',
        facts.partnerNil === 'live' ? 'P04.double-nil' : 'S04.turn-order',
      ),
      lead
        ? `Consider ${cardLabel(card)} as a low lead.`
        : !winsNow
          ? `Consider ${cardLabel(card)} to stay below the current winner.`
          : canUnderplay
            ? `Consider ${cardLabel(card)} only with its Nil tradeoff in mind.`
            : `Consider ${cardLabel(card)}; no legal card stays below the current winner.`,
    );
  }
  if (facts.ownNil === 'failed')
    return cue(
      'Avoid more bags',
      'Your Nil has already broken.',
      reason('S07.failed-nil', 'S09.limit-bags'),
      `Consider ${cardLabel(card)} while limiting further bags.`,
    );
  if (facts.partner !== null && facts.currentWinner === facts.partner && facts.partnerNil === 'none')
    return cue(
      winsNow ? 'Consider taking the lead' : 'Partner is currently ahead',
      'Your partner has the winning card so far.',
      reason(winsNow ? 'P09.protect-partner' : 'P01.conserve-under-partner', 'S04.turn-order'),
      winsNow
        ? `Consider ${cardLabel(card)} if taking the lead serves the team.`
        : `Consider ${cardLabel(card)} to leave partner ahead for now.`,
    );
  if (has('P06.offer-ruff'))
    return cue(
      'Offer partner a possible ruff',
      'Your partner has shown a void in this suit.',
      reason('P06.offer-ruff', 'P06.partner-void'),
      `Consider leading ${cardLabel(card)}; a partner ruff is a possibility.`,
    );
  if (has('S12.leave-nil-winning'))
    return cue(
      'Pressure the opposing Nil',
      'An opposing Nil is currently winning.',
      reason('S12.leave-nil-winning', 'S04.turn-order'),
      `Consider ${cardLabel(card)} to leave that player ahead.`,
    );
  if ((facts.contractNeeded ?? 0) > 0) {
    const need = facts.contractNeeded!;
    const tactic = lead
      ? has('S10.cash-control')
        ? 'S10.cash-control'
        : 'S10.develop-suit'
      : winsNow
        ? 'S08.economical-winner'
        : 'S08.preserve-control';
    return cue(
      facts.partner === null ? 'Your own contract' : 'Your team contract',
      `${need} credited ${need === 1 ? 'trick is' : 'tricks are'} still needed.`,
      reason(tactic, 'S04.turn-order'),
      winsNow && !lead
        ? `Consider ${cardLabel(card)} for the current lead.`
        : `Consider ${cardLabel(card)} while preserving useful control.`,
    );
  }
  return cue(
    'Manage the bags',
    'The positive contract is met.',
    reason('S09.contract-met', lead ? 'S09.low-lead' : 'S09.limit-bags'),
    `Consider ${cardLabel(card)} while weighing extra-trick risk.`,
  );
}
