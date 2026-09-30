import type { Card, GameAction, Mode, Seat, Suit } from '../game/kernel/types.ts';
import type { SelectedBy, SelectionRule } from './plan/contract.ts';
import type { GamePlan, SearchSummary } from './plan/types.ts';

export type NilStatus = 'none' | 'live' | 'failed';
/** `sampled-estimate` exists only under analysis schema 1.1.0. */
export type DecisionEvidence = 'exact' | 'heuristic' | 'sampled-estimate';
/**
 * COACH-15: a typed, machine-checkable statement carried by a reason. The predicate
 * vocabulary is closed and owned by the game pack; checkers live in evaluation code.
 */
export type ReasonClaim = {
  predicate: string;
  args: Record<string, string | number | boolean | null>;
};
export type DecisionReason = {
  id: string;
  kind: 'fact' | 'heuristic';
  text: string;
  actionIds?: string[];
  /** Absent in analyses saved under schema 1.0.0. */
  claims?: ReasonClaim[];
};
export type CardOutcome = {
  actionId: string;
  currentWinner: Seat;
  guaranteedWinner: Seat | null;
  canBeOvertakenBy: Seat[];
  coversPartnerNil: boolean;
  trumpRisk: Seat[];
  isMaster: boolean;
};
/**
 * Derived only from own hand and public/legitimately retained knowledge.
 * Frozen for this milestone: the 2.1.0 snapshot compiles against this shape.
 */
export type DecisionFacts = {
  mode: Mode;
  seat: Seat;
  legalCount: number;
  ledSuit: Suit | null;
  currentWinner: Seat | null;
  actorsAfter: Seat[];
  tricksRemaining: number;
  ownBid: number | null;
  ownTricks: number;
  ownNil: NilStatus;
  partner: Seat | null;
  partnerNil: NilStatus | null;
  contractBid: number | null;
  creditedTricks: number | null;
  contractNeeded: number | null;
  oldBags: number | null;
  bagRoom: number | null;
  nextOrdinaryBagDelta: number | null;
  scoreToTarget: number | null;
  suitLengths: Record<Suit, number>;
  voids: Record<Suit, Seat[]>;
  playedCards: Card[];
  outstandingCards: Card[];
  possibleOwners: { card: Card; seats: Seat[] }[];
  knowledgeComplete: boolean;
  cardOutcomes: CardOutcome[];
};

export type AnalysisCandidate<Evidence extends DecisionEvidence> = {
  action: GameAction;
  reasonIds: string[];
  disposition: 'selected' | 'alternative';
  evidence: Evidence;
};

type AnalysisCommon = {
  policyVersion: string;
  provenance: 'code' | 'forced';
  action: GameAction;
  scenarioIds: string[];
  reasons: DecisionReason[];
  facts: DecisionFacts;
  limitations: string[];
};

/** Exactly the shape saved before the game-plan layer existed. Never rewritten. */
export type DecisionAnalysisV10 = AnalysisCommon & {
  schemaVersion: '1.0.0';
  candidates: AnalysisCandidate<'exact' | 'heuristic'>[];
  /** Private audit data. Historical records may predate this trace. */
  trace?: DecisionTraceV10;
};

/** GP-05: how the plan layer reached the selected action. */
export type PlanDecision = {
  selectedBy: SelectedBy;
  stanceId: string;
  planSupported: boolean;
  /** Families of this policy that were eligible at this decision. */
  families: string[];
  /** Distinct choices the evidence cannot separate from the selected one. */
  comparableActionIds: string[];
  /** Comparable choices whose estimated value is practically tied; these drive `several-reasonable`. */
  tiedActionIds: string[];
  notSearchedActionIds: string[];
  mergedActionIds: Record<string, string[]>;
  resultingStances: Record<string, string>;
  selectionRule: SelectionRule;
  /** Coach outcome fixed at analysis time so a later review shows the same result. */
  coach: { outcome: 'suggestion' | 'several-reasonable'; explanation: 'supported' | 'facts-only' };
};

export type DecisionAnalysisV11 = AnalysisCommon & {
  schemaVersion: '1.1.0';
  candidates: AnalysisCandidate<DecisionEvidence>[];
  plan: GamePlan;
  decision: PlanDecision;
  /** Present when playouts ran for this decision. */
  search?: SearchSummary;
  trace?: DecisionTraceV11;
};

export type DecisionAnalysis = DecisionAnalysisV10 | DecisionAnalysisV11;

type TraceCommon = {
  policyVersion: string;
  catalogVersion: string;
  selectedActionId: string;
  scenarioChecks: { id: string; result: 'matched' | 'not-matched' | 'not-applicable' }[];
  /** `score` is always the tactical ordering weight; playout values live only in `search`. */
  candidates: {
    actionId: string;
    score: number | null;
    effects: { id: string; delta: number }[];
    tieOrder: number;
  }[];
  limitations: string[];
};
export type DecisionTraceV10 = TraceCommon & {
  schemaVersion: '1.0.0';
  selectedBy: 'forced' | 'heuristic-rank' | 'baseline';
};
export type DecisionTraceV11 = TraceCommon & {
  schemaVersion: '1.1.0';
  selectedBy: 'forced' | 'heuristic-rank' | 'baseline' | 'search' | 'search-tiebreak' | 'tactical-fallback';
};
export type DecisionTrace = DecisionTraceV10 | DecisionTraceV11;

export const SUPPORTED_ANALYSIS_SCHEMAS = ['1.0.0', '1.1.0'] as const;

/**
 * The only reader for a saved analysis. An unknown or malformed version fails closed:
 * the caller reports that the original analysis is unavailable.
 */
export function readSavedAnalysis(value: unknown): DecisionAnalysis | null {
  if (typeof value !== 'object' || value === null) return null;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  if (!SUPPORTED_ANALYSIS_SCHEMAS.includes(version as (typeof SUPPORTED_ANALYSIS_SCHEMAS)[number])) return null;
  const analysis = value as DecisionAnalysis;
  if (
    typeof analysis.policyVersion !== 'string' ||
    typeof analysis.action !== 'object' ||
    analysis.action === null ||
    !Array.isArray(analysis.candidates) ||
    !Array.isArray(analysis.reasons)
  )
    return null;
  if (analysis.schemaVersion === '1.1.0' && (typeof analysis.plan !== 'object' || typeof analysis.decision !== 'object'))
    return null;
  return analysis;
}
