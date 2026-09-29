import type { Card, GameAction, Mode, Seat, Suit } from '../game/kernel/types.ts';

export type NilStatus = 'none' | 'live' | 'failed';
export type DecisionReason = {
  id: string;
  kind: 'fact' | 'heuristic';
  text: string;
  actionIds?: string[];
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
/** Derived only from own hand and public/legitimately retained knowledge. */
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
export type DecisionAnalysis = {
  schemaVersion: '1.0.0';
  policyVersion: string;
  provenance: 'code' | 'forced';
  action: GameAction;
  scenarioIds: string[];
  reasons: DecisionReason[];
  facts: DecisionFacts;
  candidates: {
    action: GameAction;
    reasonIds: string[];
    disposition: 'selected' | 'alternative';
    evidence: 'exact' | 'heuristic';
  }[];
  limitations: string[];
  /** Private audit data. Historical records may predate this trace. */
  trace?: DecisionTrace;
};

export type DecisionTrace = {
  schemaVersion: '1.0.0';
  policyVersion: string;
  catalogVersion: string;
  selectedActionId: string;
  selectedBy: 'forced' | 'heuristic-rank' | 'baseline';
  scenarioChecks: { id: string; result: 'matched' | 'not-matched' | 'not-applicable' }[];
  candidates: {
    actionId: string;
    score: number | null;
    effects: { id: string; delta: number }[];
    tieOrder: number;
  }[];
  limitations: string[];
};
