import type { PrivateGame, AcceptedAction, GameAction as DomainAction, Seat } from '../game/index.ts';
import type { SeatObservation } from '../observations/types.ts';
import type { DecisionAnalysis } from '../strategy/types.ts';
import type { Advice } from '../coaching/templates.ts';
import type {
  AdviceView,
  GameAction,
  Preferences,
  LegacyReviewFrame as ReviewFrame,
  SessionStats,
  DevScenarioView,
} from '../../shared/contracts.ts';

export interface PlayerProfile {
  displayName: string;
  preferences: Preferences;
  plan: 'practice' | 'unlimited' | 'family';
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  billingMode: 'fixture';
  scheduledPlan?: 'practice' | 'unlimited' | 'family' | null;
}
export interface PlayerRow {
  id: string;
  profile: PlayerProfile;
  active_game_id: string | null;
  access_generation: number;
}
export interface DecisionRecord {
  id: string;
  handNumber: number;
  action: GameAction;
  assisted: boolean;
  observation: SeatObservation;
  before: ReviewFrame;
  after: ReviewFrame;
}
export interface SavedDecisionAnalysis {
  analysis: DecisionAnalysis;
  adviceSnapshot: Advice;
}
/** AUDIT-01: attribution identifies evidence for the future pin, not every historical move. */
export interface ReasoningPolicyPin {
  policyVersion: string;
  attribution: 'new-session' | 'legacy-saved-analysis' | 'legacy-default';
}
/** Private job data, never a player or strategy input envelope. */
export interface PreparedBotDecision {
  kind: 'bot-decision';
  schemaVersion: '1.0.0';
  decisionId: string;
  revision: number;
  seat: Seat;
  policyVersion: string;
  action: DomainAction;
  observation: SeatObservation;
  analysis: DecisionAnalysis;
}
/** AUDIT-02/03: immutable evidence of the action actually accepted, including legacy absence. */
export interface BotDecisionAudit {
  schemaVersion: '1.0.0';
  decisionId: string;
  revision: number;
  handNumber: number;
  seat: Seat;
  action: DomainAction;
  policyVersion: string | null;
  originalAnalysis: 'available' | 'unavailable-legacy-job';
  observation: SeatObservation | null;
  analysis: DecisionAnalysis | null;
}
export interface GameDocument {
  /** Missing in legacy documents until future policy attribution is resolved. */
  reasoningPolicy?: ReasoningPolicyPin;
  /** Original bot evidence is private and separate from human coaching history. */
  botDecisionAudits?: Record<string, BotDecisionAudit>;
  /** RD-03: immutable provenance for the selected opening deal, never strategy input. */
  openingScenario?: { metadata: DevScenarioView; dealer: PrivateGame['dealer'] };
  /** Missing only in legacy documents; multiplayer is not an enabled runtime. */
  tableType?: 'practice-bots';
  /** Private analysis is independent of coaching access and issued guidance. */
  decisionAnalyses?: Record<string, SavedDecisionAnalysis>;
  state: PrivateGame;
  control: { tab: string; token: string };
  stats: SessionStats;
  exposure: Record<string, number>;
  pendingExposure?: number;
  savedAdvice: Record<string, AdviceView>;
  decisions: DecisionRecord[];
  frames: ReviewFrame[];
  deals: string[][];
  actions: (
    { kind: 'action'; action: AcceptedAction } | { kind: 'collect' } | { kind: 'next-hand'; deck: string[] }
  )[];
}
export interface GameRow {
  id: string;
  player_id: string;
  revision: number;
  document: GameDocument;
}
