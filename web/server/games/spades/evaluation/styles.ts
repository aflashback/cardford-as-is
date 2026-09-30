import { createHash } from 'node:crypto';
import { cardRank, cardSuit } from '../../../game/cards.ts';
import type { Card, GameAction } from '../../../game/kernel/types.ts';
import { actionId } from '../../../game/rules.ts';
import type { SeatPolicy } from '../../../evaluation/gate/contracts.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import { chooseBaselineAction } from '../../../strategy/baseline.ts';
import { createRandom, hashText } from '../../../strategy/plan/random.ts';
import type { DecisionAnalysis } from '../../../strategy/types.ts';
import { spadesObservationKey } from '../plan/pack.ts';
import { analyzeFrozenSpades } from '../reasoning/frozen/spades-tactics-2.1.0/index.ts';

/**
 * SG-05: table styles for the strength gate.
 *
 * Every style is a pure function of one seat observation. The re-weighted styles read
 * the frozen 2.1.0 policy's private trace and multiply its effect groups by declared
 * weights; bids move the frozen bid by a declared offset and a hand-only Nil ceiling.
 * No frozen file is edited and nothing here reads the playout continuation policy, so
 * the playout model cannot imitate the tables it is later measured against.
 *
 * Weights, offsets and ceilings are named heuristics. They describe a way of playing,
 * not a claim of good play.
 */
export const SPADES_STYLE_VERSION = 'spades-styles-1.0.0';

export type SpadesSeatPolicy = SeatPolicy<SeatObservation, GameAction> & {
  /** Present when the selector produces a complete analysis that the coach can render. */
  analyze?: (observation: SeatObservation) => DecisionAnalysis;
};

export type SpadesStyleSpec = {
  id: string;
  summary: string;
  /** `held-out` styles are read only by confirmation manifests. */
  partition: 'development' | 'held-out';
  /** The table position a held-out style is reserved for. */
  reservedFor: 'any' | 'opposing' | 'teammate';
  /** Added to the frozen policy's positive bid; the result stays within 1..13. */
  bidOffset: number;
  /** The offset applies only to a frozen bid inside this closed range; `null` leaves that side open. */
  bidOffsetFrom: number | null;
  bidOffsetUpTo: number | null;
  /** Bid Nil when the hand-only risk is at most this value. `null` keeps the frozen Nil decision. */
  nilRiskCeiling: number | null;
  /** Decline a frozen Nil when the hand-only risk is above this value. `null` never declines. */
  nilRiskRefusal: number | null;
  /** Multiplier per effect ID prefix; the longest matching prefix applies; unlisted effects keep 1. */
  weights: Record<string, number>;
};

export const SPADES_STYLE_SPECS: readonly SpadesStyleSpec[] = [
  {
    id: 'cautious-contract',
    summary: 'Bids one below the frozen estimate and spends high cards early to secure the contract.',
    partition: 'development',
    reservedFor: 'any',
    bidOffset: -1,
    bidOffsetFrom: null,
    bidOffsetUpTo: null,
    nilRiskCeiling: null,
    nilRiskRefusal: 1.5,
    weights: {
      'S08.economical-winner': 1.5,
      'S08.resource-cost': -0.5,
      'S08.preserve-control': -1,
      'S10.lead-control': 1.5,
      'S10.guaranteed-lead': 2,
      'S10.known-ruff-risk': 2,
      'S09.low-lead': 1.5,
    },
  },
  {
    id: 'aggressive-setter',
    summary: 'Bids one above the frozen estimate and keeps taking tricks to set opposing contracts.',
    partition: 'development',
    reservedFor: 'any',
    bidOffset: 1,
    bidOffsetFrom: null,
    bidOffsetUpTo: null,
    nilRiskCeiling: null,
    nilRiskRefusal: 1,
    weights: {
      'S09.limit-bags': -1,
      'S09.low-lead': -1,
      'S08.resource-cost': 0.25,
      'S10.keep-trump': -1,
      'S11.keep-trump': -2,
      'P01.conserve-under-partner': 0.5,
      'P09.protect-partner': 0.5,
      'tie.economical-rank': -1,
    },
  },
  {
    id: 'nil-seeker',
    summary: 'Bids Nil on any hand under a hand-only risk ceiling and attacks or protects Nil bids first.',
    partition: 'development',
    reservedFor: 'any',
    bidOffset: 0,
    bidOffsetFrom: null,
    bidOffsetUpTo: null,
    nilRiskCeiling: 3,
    nilRiskRefusal: null,
    weights: {
      'S05.shed-risk': 1.5,
      'S06.rescue': 1.5,
      'S12': 2.5,
      'P02': 1.5,
      'S08.preserve-control': 2,
      'S10.lead-control': 0.5,
      'S09.low-lead': 0.5,
    },
  },
  {
    id: 'bag-dodger',
    summary: 'Keeps the frozen bid, stops taking tricks once the contract is met and sheds high losers.',
    partition: 'development',
    reservedFor: 'any',
    bidOffset: 0,
    bidOffsetFrom: null,
    bidOffsetUpTo: null,
    nilRiskCeiling: null,
    nilRiskRefusal: null,
    weights: {
      'S09': 3,
      'S08.economical-winner': 0.6,
      'S08.resource-cost': 2,
      'S08.preserve-control': -2,
      'S10.lead-control': -0.5,
      'S10.guaranteed-lead': 0.5,
      'tie.economical-rank': -1,
    },
  },
  {
    id: 'trump-hoarder',
    summary: 'Held out. Declines to ruff or lead trump until the hand forces it.',
    partition: 'held-out',
    reservedFor: 'opposing',
    bidOffset: 0,
    bidOffsetFrom: null,
    bidOffsetUpTo: null,
    nilRiskCeiling: null,
    nilRiskRefusal: null,
    weights: {
      'S08.resource-cost': 5,
      'S10.keep-trump': 5,
      'S11.keep-trump': 5,
      'P11.preserve-ruff': 3,
      'S10.lead-control': 1.5,
    },
  },
  {
    id: 'high-leader',
    summary: 'Held out. Leads high cards from any suit and overtakes its teammate more readily.',
    partition: 'held-out',
    reservedFor: 'teammate',
    bidOffset: 0,
    bidOffsetFrom: null,
    bidOffsetUpTo: null,
    nilRiskCeiling: null,
    nilRiskRefusal: null,
    weights: {
      'S10.lead-control': -1,
      'S10.guaranteed-lead': 2,
      'S09.low-lead': -0.5,
      'P01.conserve-under-partner': 0.25,
      'P09.protect-partner': -0.5,
      'tie.economical-rank': -1,
    },
  },
];

export const D0_STYLE_ID = 'd0';
export const BASELINE_STYLE_ID = 'baseline';
export const RANDOM_LEGAL_STYLE_ID = 'random-legal';

/** Styles available to development manifests, in report order. */
export const DEVELOPMENT_STYLE_IDS: readonly string[] = [
  D0_STYLE_ID,
  BASELINE_STYLE_ID,
  ...SPADES_STYLE_SPECS.filter((spec) => spec.partition === 'development').map((spec) => spec.id),
];
/** Styles read only by confirmation manifests: one opposing style and one teammate style. */
export const HELD_OUT_STYLE_IDS: readonly string[] = SPADES_STYLE_SPECS.filter(
  (spec) => spec.partition === 'held-out',
).map((spec) => spec.id);
export const HELD_OUT_OPPOSING_STYLE_ID = 'trump-hoarder';
export const HELD_OUT_TEAMMATE_STYLE_ID = 'high-leader';
export const DIAGNOSTIC_STYLE_IDS: readonly string[] = [RANDOM_LEGAL_STYLE_ID];

/**
 * Hand-only Nil risk: how many cards are likely to be forced into winning a trick.
 * Uncalibrated. It reads nothing but the thirteen cards of one hand.
 */
export function nilRisk(hand: readonly Card[]): number {
  let risk = 0;
  for (const suit of ['C', 'D', 'H', 'S'] as const) {
    const ranks = hand
      .filter((card) => cardSuit(card) === suit)
      .map(cardRank)
      .sort((a, b) => a - b);
    if (suit === 'S') {
      for (const rank of ranks) risk += rank >= 12 ? 4 : rank >= 10 ? 1.5 : rank >= 8 ? 0.75 : 0.25;
      if (ranks.length > 3) risk += (ranks.length - 3) * 1.5;
      continue;
    }
    // The k-th lowest card of a side suit is comfortable up to rank 6 + 2k.
    ranks.forEach((rank, index) => {
      const comfortable = 6 + 2 * index;
      if (rank > comfortable) risk += (rank - comfortable) * 0.3;
    });
  }
  return risk;
}

const analyses = new WeakMap<SeatObservation, DecisionAnalysis>();
/** One frozen analysis per observation object, shared by every style asked about it. */
function frozenAnalysis(observation: SeatObservation): DecisionAnalysis {
  let analysis = analyses.get(observation);
  if (!analysis) {
    analysis = analyzeFrozenSpades(observation);
    analyses.set(observation, analysis);
  }
  return analysis;
}

function weightOf(spec: SpadesStyleSpec, effectId: string): number {
  let best = '';
  let weight = 1;
  for (const [prefix, value] of Object.entries(spec.weights))
    if (effectId.startsWith(prefix) && prefix.length > best.length) {
      best = prefix;
      weight = value;
    }
  return weight;
}

function requireLegal(observation: SeatObservation, id: string): GameAction {
  const found = observation.legalActions.find((action) => actionId(action) === id);
  if (!found || found.seat !== observation.seat) throw new Error(`Style selected an action outside the legal set: ${id}`);
  return structuredClone(found);
}

function styledBid(spec: SpadesStyleSpec, observation: SeatObservation, analysis: DecisionAnalysis): GameAction {
  if (analysis.action.kind !== 'bid' || !analysis.trace) throw new Error('A traced frozen bid is required.');
  const frozenBid = analysis.action.bid;
  const effect = (effects: { id: string; delta: number }[], id: string) =>
    effects.find((entry) => entry.id === id)?.delta ?? 0;
  const rows = analysis.trace.candidates.map((candidate) => ({
    id: candidate.actionId,
    bid: Number(candidate.actionId.slice('bid:'.length)),
    supported:
      effect(candidate.effects, 'S13.feasibility') === 0 && effect(candidate.effects, 'S13.known-failed-nil') === 0,
  }));
  const nilSupported = rows.some((row) => row.bid === 0 && row.supported);
  const risk = nilRisk(observation.hand);
  let nil = frozenBid === 0;
  if (nil && spec.nilRiskRefusal !== null && risk > spec.nilRiskRefusal) nil = false;
  if (!nil && spec.nilRiskCeiling !== null && risk <= spec.nilRiskCeiling && nilSupported) nil = true;
  if (nil && nilSupported) return requireLegal(observation, 'bid:0');
  const base = Math.max(1, frozenBid);
  const shifted =
    (spec.bidOffsetFrom === null || base >= spec.bidOffsetFrom) &&
    (spec.bidOffsetUpTo === null || base <= spec.bidOffsetUpTo);
  const wanted = Math.max(1, Math.min(13, base + (shifted ? spec.bidOffset : 0)));
  const positive = rows.filter((row) => row.bid > 0 && row.supported);
  if (!positive.length) return requireLegal(observation, actionId(analysis.action));
  const chosen = positive.toSorted((a, b) => Math.abs(a.bid - wanted) - Math.abs(b.bid - wanted) || a.bid - b.bid)[0];
  return requireLegal(observation, chosen.id);
}

function styledAction(spec: SpadesStyleSpec, observation: SeatObservation): GameAction {
  const legal = observation.legalActions;
  if (!legal.length) throw new Error('No decision is available for this seat.');
  if (legal.length === 1) return structuredClone(legal[0]);
  const analysis = frozenAnalysis(observation);
  if (!analysis.trace) throw new Error('The frozen policy recorded no trace to re-weight.');
  if (observation.phase === 'bid') return styledBid(spec, observation, analysis);
  let best: { id: string; score: number; tieOrder: number } | null = null;
  for (const candidate of analysis.trace.candidates) {
    const score = candidate.effects.reduce((sum, entry) => sum + entry.delta * weightOf(spec, entry.id), 0);
    if (!best || score > best.score || (score === best.score && candidate.tieOrder < best.tieOrder))
      best = { id: candidate.actionId, score, tieOrder: candidate.tieOrder };
  }
  if (!best) throw new Error('The frozen trace holds no candidate.');
  return requireLegal(observation, best.id);
}

/** A style from a declared spec. Exported so that a test can build a variant without editing a pinned one. */
export const createReweightedStyle = (spec: SpadesStyleSpec): SpadesSeatPolicy => ({
  id: spec.id,
  role: 'style',
  choose: (observation) => styledAction(spec, observation),
});

const d0: SpadesSeatPolicy = {
  id: D0_STYLE_ID,
  role: 'reference',
  choose: (observation) => structuredClone(frozenAnalysis(observation).action),
  analyze: (observation) => frozenAnalysis(observation),
};

const baseline: SpadesSeatPolicy = {
  id: BASELINE_STYLE_ID,
  role: 'style',
  choose: (observation) => chooseBaselineAction(observation),
};

/**
 * Diagnostic only. The draw is a hash of the canonical observation key, so the same
 * observation always gives the same action and no stream is shared between seats.
 */
const randomLegal: SpadesSeatPolicy = {
  id: RANDOM_LEGAL_STYLE_ID,
  role: 'diagnostic',
  choose(observation) {
    const legal = observation.legalActions;
    if (!legal.length) throw new Error('No decision is available for this seat.');
    if (legal.length === 1) return structuredClone(legal[0]);
    const random = createRandom(hashText(spadesObservationKey(observation)), observation.seat);
    return structuredClone(legal[random.below(legal.length)]);
  },
};

const STYLES: readonly SpadesSeatPolicy[] = [d0, baseline, ...SPADES_STYLE_SPECS.map(createReweightedStyle), randomLegal];

const SPADES_MODES = ['spades-solo', 'spades-partners'];
function requireMode(mode: string): void {
  if (!SPADES_MODES.includes(mode)) throw new Error(`The Spades styles do not cover mode: ${mode}`);
}

/** Every declared style for the mode, including held-out and diagnostic ones. */
export function spadesStyles(mode: string): SpadesSeatPolicy[] {
  requireMode(mode);
  return [...STYLES];
}

export function findSpadesStyle(id: string): SpadesSeatPolicy | undefined {
  return STYLES.find((style) => style.id === id);
}

export function spadesStyle(id: string): SpadesSeatPolicy {
  const found = findSpadesStyle(id);
  if (!found) throw new Error(`Unknown Spades style: ${id}`);
  return found;
}

/** Non-diagnostic styles, including held-out ones. Only these may enter a decision rule. */
export const measuredStyleIds = (): string[] =>
  STYLES.filter((style) => style.role !== 'diagnostic').map((style) => style.id);

/** Pin for a re-weighted style: any change to its numbers changes this hash. */
export function styleSpecHash(id: string): string {
  const spec = SPADES_STYLE_SPECS.find((entry) => entry.id === id);
  if (!spec) throw new Error(`No re-weighted style is declared as: ${id}`);
  const weights = Object.fromEntries(Object.entries(spec.weights).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return createHash('sha256')
    .update(
      JSON.stringify([
        SPADES_STYLE_VERSION,
        spec.id,
        spec.bidOffset,
        spec.bidOffsetFrom,
        spec.bidOffsetUpTo,
        spec.nilRiskCeiling,
        spec.nilRiskRefusal,
        weights,
      ]),
    )
    .digest('hex');
}
