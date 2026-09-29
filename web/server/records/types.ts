import type { PrivateGame, AcceptedAction } from '../game/index.ts';
import type { SeatObservation } from '../observations/types.ts';
import type { DecisionAnalysis } from '../strategy/types.ts';
import type { Advice } from '../coaching/templates.ts';
import type {
  AdviceView,
  GameAction,
  Preferences,
  ReviewFrame,
  SessionStats,
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
export interface GameDocument {
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
