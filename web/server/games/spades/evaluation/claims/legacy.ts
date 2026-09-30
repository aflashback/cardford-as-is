import { cardSuit } from '../../../../game/cards.ts';
import type { PrivateGame, Seat, Suit } from '../../../../game/kernel/types.ts';
import { actionId } from '../../../../game/rules.ts';
import { observe, type SeatObservation } from '../../../../observations/index.ts';
import type { DecisionAnalysis, DecisionReason, ReasonClaim } from '../../../../strategy/types.ts';
import { attachSpadesClaims, claim, claimKey, claimsShownFor } from '../../plan/claims.ts';
import { checkSpadesClaims, type ClaimCheck, type ClaimCheckOptions } from './check.ts';

/**
 * COACH-15: claims for an analysis that carries none, such as the frozen baseline D0
 * (schema 1.0.0). Claims come from two places only: the structured facts object, and the
 * known reason IDs read with the same sentence table the plan profiles use. A shown
 * reason that yields no typed claim is text only; its sentences count as not checkable.
 *
 * The facts object is the claim under test here, never the oracle: every claim is checked
 * by `checkSpadesClaims` against the authoritative state.
 */
export const LEGACY_CLAIMS_VERSION = 'spades-legacy-claims-1.0.0';
export const TEXT_ONLY = 'text-only';

export type ShownClaims = {
  claims: ReasonClaim[];
  /** Sentences of shown reasons that carry no typed claim. */
  textOnlySentences: number;
  textOnlyReasonIds: string[];
};

const SEATS: Seat[] = [0, 1, 2, 3];
const SUITS: Suit[] = ['C', 'D', 'H', 'S'];

/** Sentences end with a full stop, a question mark or an exclamation mark. */
export function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?])\s+/).filter((part) => part.trim().length > 0).length;
}

const selectedReasonIds = (analysis: DecisionAnalysis): string[] =>
  analysis.candidates.find((entry) => entry.disposition === 'selected')?.reasonIds ?? [];

function unique(claims: readonly ReasonClaim[]): ReasonClaim[] {
  const seen = new Set<string>();
  return claims.filter((entry) => {
    const key = claimKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Claims the structured facts object makes about the position and the selected action.
 * Works for every analysis schema, because both carry the same facts shape.
 */
export function factsClaims(observation: SeatObservation, analysis: DecisionAnalysis): ReasonClaim[] {
  const { facts } = analysis;
  const selected = actionId(analysis.action);
  const playing = analysis.action.kind === 'play';
  const claims: ReasonClaim[] = [claim('legal-count', { count: facts.legalCount })];
  if (facts.ownBid !== null) claims.push(claim('nil-status', { seat: facts.seat, status: facts.ownNil }));
  if (facts.partner !== null && facts.partnerNil !== null && observation.bids[facts.partner] !== null)
    claims.push(claim('nil-status', { seat: facts.partner, status: facts.partnerNil, relation: 'teammate' }));
  if (facts.contractNeeded !== null)
    claims.push(
      claim('contract-need', {
        needed: facts.contractNeeded,
        contract: facts.contractBid,
        credited: facts.creditedTricks,
      }),
    );
  if (facts.nextOrdinaryBagDelta !== null)
    claims.push(claim('next-bag-delta', { delta: facts.nextOrdinaryBagDelta }));
  for (const suit of SUITS) {
    claims.push(claim('own-suit-count', { suit, count: facts.suitLengths[suit] }));
    for (const seat of facts.voids[suit]) claims.push(claim('public-void', { seat, suit }));
  }
  if (!playing) return unique(claims);
  claims.push(claim('actors-after', { count: facts.actorsAfter.length }));
  if (facts.currentWinner !== null) claims.push(claim('current-winner', { seat: facts.currentWinner }));
  if (facts.ledSuit !== null && facts.suitLengths[facts.ledSuit] === 0)
    claims.push(claim('own-void-in-led-suit', { suit: facts.ledSuit }));
  // A seat that no unplayed card of a suit is allowed to reach is a claim of impossibility.
  for (const seat of SEATS) {
    if (seat === facts.seat || observation.handSizes[seat] === 0) continue;
    for (const suit of SUITS)
      if (!facts.possibleOwners.some((entry) => cardSuit(entry.card) === suit && entry.seats.includes(seat)))
        claims.push(claim('cannot-hold-suit', { seat, suit }));
  }
  const outcome = facts.cardOutcomes.find((entry) => entry.actionId === selected);
  if (outcome) {
    claims.push(claim('winner-after-action', { actionId: selected, winner: outcome.currentWinner }));
    claims.push(claim('action-is-master', { actionId: selected, master: outcome.isMaster }));
    if (outcome.guaranteedWinner !== null)
      claims.push(claim('guaranteed-winner', { actionId: selected, winner: outcome.guaranteedWinner }));
    if (facts.partner !== null)
      claims.push(
        claim('action-covers-teammate-nil', { actionId: selected, covers: outcome.coversPartnerNil }),
      );
  }
  return unique(claims);
}

/** Claims behind the reasons shown for the selected action, read from known reason IDs. */
export function reasonClaims(observation: SeatObservation, analysis: DecisionAnalysis): ShownClaims {
  const shownIds = selectedReasonIds(analysis);
  const shown = analysis.reasons.filter((reason) => shownIds.includes(reason.id));
  // Claims already on a reason are kept; a schema 1.0.0 reason has none.
  const claimed: DecisionReason[] = attachSpadesClaims(observation, analysis.facts, shown);
  const selected = actionId(analysis.action);
  const textOnly = claimed.filter(
    (reason) => claimsShownFor([reason], [reason.id], selected).length === 0,
  );
  return {
    claims: claimsShownFor(claimed, shownIds, selected),
    textOnlySentences: textOnly.reduce((sum, reason) => sum + sentenceCount(reason.text), 0),
    textOnlyReasonIds: textOnly.map((reason) => reason.id),
  };
}

/** Everything checkable about one analysis: facts-object claims plus shown-reason claims. */
export function deriveLegacyClaims(observation: SeatObservation, analysis: DecisionAnalysis): ShownClaims {
  const fromReasons = reasonClaims(observation, analysis);
  return { ...fromReasons, claims: unique([...factsClaims(observation, analysis), ...fromReasons.claims]) };
}

export type LegacyClaimCheck = ClaimCheck & { textOnlySentences: number; textOnlyReasonIds: string[] };

/**
 * Checks an analysis that carries no claims of its own. Text-only sentences are added to
 * `notCheckable` and listed under the `text-only` entry of `byPredicate`.
 */
export function checkLegacyAnalysis(
  state: PrivateGame,
  seat: Seat,
  analysis: DecisionAnalysis,
  options: ClaimCheckOptions = {},
): LegacyClaimCheck {
  const derived = deriveLegacyClaims(observe(state, seat), analysis);
  const checked = checkSpadesClaims(state, seat, derived.claims, options);
  return {
    ...checked,
    notCheckable: checked.notCheckable + derived.textOnlySentences,
    byPredicate: derived.textOnlySentences
      ? {
          ...checked.byPredicate,
          [TEXT_ONLY]: { checked: 0, false: 0, notCheckable: derived.textOnlySentences },
        }
      : checked.byPredicate,
    textOnlySentences: derived.textOnlySentences,
    textOnlyReasonIds: derived.textOnlyReasonIds,
  };
}
