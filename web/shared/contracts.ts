/* Generated from contracts.schema.json. Do not edit; run npm run contracts:generate. */

/**
 * Canonical public transport contract. Generated artifacts must not be edited. Private domain types remain independent.
 */
export type PublicContracts =
  | Mode
  | Seat
  | Card
  | Suit
  | Phase
  | GameAction
  | Play
  | Trick
  | HandResult
  | GameView
  | Preferences
  | Plan
  | PaidPlan
  | CoachAccess
  | SessionStats
  | SessionView
  | AdviceView
  | CommandEnvelope
  | NewSessionRequest
  | ActionsRequest
  | PrepareRequest
  | PrepareView
  | AdvanceRequest
  | NextHandRequest
  | AdviceRequest
  | PreferencesRequest
  | HandUnlockRequest
  | HandUnlockView
  | ExposureRequest
  | AcceptedView
  | ReviewFrame
  | ReviewCase
  | ReviewIndex
  | ReviewView
  | TrialRequest
  | ReviewTrial
  | RecapView
  | SubscriptionView
  | OfferView
  | AccountView
  | AccountCommand
  | ApiError
  | ReviewQuery
  | ReviewStepQuery
  | AccessQuery
  | SuitMemory
  | NotesView
  | BillingPreviewRequest
  | BillingPreview
  | BillingConfirmRequest
  | BillingOperation
  | FamilyMember
  | FamilyInvitation
  | FamilyView
  | FamilyCommand;
export type Mode = 'hearts' | 'spades-solo' | 'spades-partners';
export type Seat = 0 | 1 | 2 | 3;
export type Card = string;
export type Suit = 'C' | 'D' | 'H' | 'S';
export type Phase = 'pass' | 'bid' | 'play' | 'trick-end' | 'hand-end' | 'match-end';
export type GameAction =
  | {
      kind: 'bid';
      bid: number;
    }
  | {
      kind: 'play';
      card: Card;
    }
  | {
      kind: 'pass';
      /**
       * @minItems 3
       * @maxItems 3
       */
      cards: Card[];
    };
export type Plan = 'demo' | 'practice' | 'unlimited' | 'family';
export type PaidPlan = 'practice' | 'unlimited' | 'family';
export type AdvanceRequest =
  | {
      commandId: string;
      gameId: string;
      expectedRevision: number;
      controlLeaseToken: string;
      kind: 'bot';
      preparedDecisionId: string;
    }
  | {
      commandId: string;
      gameId: string;
      expectedRevision: number;
      controlLeaseToken: string;
      kind: 'collect-trick';
    };
export type AccountCommand =
  | {
      commandId: string;
      action: 'select-plan';
      plan: PaidPlan;
    }
  | {
      commandId: string;
      action: 'cancel' | 'resume';
    };
export type BillingPreviewRequest =
  | {
      action: 'select-plan';
      plan: PaidPlan;
    }
  | {
      action: 'cancel' | 'resume';
    };
export type FamilyCommand =
  | {
      commandId: string;
      action: 'create';
    }
  | {
      commandId: string;
      action: 'invite';
      inviteeId: string;
      seatClass: 'unlimited' | 'limited';
    }
  | {
      commandId: string;
      action: 'accept';
      token: string;
      acknowledgeIndividualCoverage: boolean;
    }
  | {
      commandId: string;
      action: 'revoke-invite';
      invitationId: string;
    }
  | {
      commandId: string;
      action: 'remove';
      assignmentId: string;
    }
  | {
      commandId: string;
      action: 'leave';
    };

export interface Play {
  seat: Seat;
  card: Card;
}
export interface Trick {
  /**
   * @minItems 4
   * @maxItems 4
   */
  plays: Play[];
  winner: Seat;
}
export interface HandResult {
  /**
   * @minItems 4
   * @maxItems 4
   */
  points: number[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  bags: number[];
  winner?: Seat;
}
export interface GameView {
  id: string;
  mode: Mode;
  phase: Phase;
  /**
   * @maxItems 13
   */
  hand: Card[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  handCounts: number[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  bids: (number | null)[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  tricks: number[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  scores: number[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  bags: number[];
  /**
   * @maxItems 4
   */
  trick: Play[];
  /**
   * @maxItems 13
   */
  history: Trick[];
  turn: Seat | null;
  dealer: Seat;
  handNumber: number;
  heartsBroken: boolean;
  spadesBroken: boolean;
  passDirection: 'left' | 'right' | 'across' | 'hold';
  /**
   * @maxItems 3
   */
  received: Card[];
  /**
   * @maxItems 3
   */
  outgoing: Card[];
  handResult: HandResult | null;
  currentWinner: Seat | null;
  /**
   * @maxItems 286
   */
  legalActions: GameAction[];
}
export interface Preferences {
  coachMode: 'asked' | 'nudges' | 'after';
  gameSpeed: 1 | 1.2 | 1.4;
}
export interface CoachAccess {
  plan: Plan;
  coverage: 'none' | 'active' | 'expired';
  canPlay: boolean;
  canCoach: boolean;
  remainingHands: number | null;
  resetsAt: string | null;
  handUnlocked: boolean;
  canStartWork: boolean;
  localMock: boolean;
}
export interface SessionStats {
  decisions: number;
  helped: number;
  suggestions: number;
}
export interface SessionView {
  game: GameView;
  revision: number;
  decisionId: string;
  preferences: Preferences;
  access: CoachAccess;
  source: 'code' | 'demo';
  controlLeaseToken: string;
  stats: SessionStats;
}
export interface AdviceView {
  focus: string;
  notice: string;
  reason: string;
  suggestion: string;
  card?: Card;
  /**
   * @minItems 3
   * @maxItems 3
   */
  pass?: Card[];
  bid?: number;
  highlightSuit?: Suit;
  source: 'code' | 'jev' | 'forced' | 'fallback';
  decisionId: string;
  requestedLevel: 1 | 2 | 3;
}
export interface CommandEnvelope {
  commandId: string;
  gameId: string;
  expectedRevision: number;
  controlLeaseToken: string;
}
export interface NewSessionRequest {
  commandId: string;
  mode: Mode;
  expectedActiveGameId: string | null;
}
export interface ActionsRequest {
  commandId: string;
  gameId: string;
  expectedRevision: number;
  controlLeaseToken: string;
  action: GameAction;
}
export interface PrepareRequest {
  commandId: string;
  gameId: string;
  expectedRevision: number;
  controlLeaseToken: string;
}
export interface PrepareView {
  preparedDecisionId: string;
  decisionId: string;
  revision: number;
  source: 'code' | 'forced';
}
export interface NextHandRequest {
  commandId: string;
  gameId: string;
  expectedRevision: number;
  controlLeaseToken: string;
}
export interface AdviceRequest {
  commandId: string;
  gameId: string;
  expectedRevision: number;
  controlLeaseToken: string;
  decisionId: string;
  requestedLevel: 1 | 2 | 3;
}
export interface PreferencesRequest {
  commandId: string;
  preferences: Preferences;
}
export interface HandUnlockRequest {
  requestId: string;
  gameId: string;
  handId: string;
  decisionId: string;
  expectedRevision: number;
  requestedLevel: 1 | 2 | 3;
  controlLeaseToken: string;
}
export interface HandUnlockView {
  access: CoachAccess;
  advice: AdviceView;
}
export interface ExposureRequest {
  gameId: string;
  decisionId: string;
  eventId: string;
  displayedLevel: 1 | 2 | 3;
}
export interface AcceptedView {
  accepted: true;
}
export interface ReviewFrame {
  game: GameView;
  action: GameAction | null;
  decisionId: string;
  /**
   * @maxItems 20
   */
  notes: string[];
}
export interface ReviewCase {
  decisionId: string;
  handNumber: number;
  action: GameAction;
  assisted: boolean;
  status: 'not-assessed' | 'supported' | 'reasonable' | 'review';
  summary: string;
}
export interface ReviewIndex {
  /**
   * @maxItems 1000
   */
  cases: ReviewCase[];
}
export interface ReviewView {
  decisionId: string;
  label: 'Original';
  liveRevision: number;
  /**
   * @maxItems 1000
   */
  frames: ReviewFrame[];
}
export interface TrialRequest {
  commandId: string;
  gameId: string;
  expectedRevision: number;
  controlLeaseToken: string;
  trialId: string;
  alternative: {
    kind: 'play';
    card: Card;
  };
  decisionId: string;
}
export interface ReviewTrial {
  trialId: string;
  decisionId: string;
  label: 'Possible continuation';
  liveRevision: number;
  /**
   * @maxItems 5
   */
  frames: ReviewFrame[];
}
export interface RecapView {
  handNumber: number;
  result: HandResult | null;
  assessmentStatus: 'pending' | 'ready' | 'partial';
  message: string;
  stats: SessionStats;
}
export interface SubscriptionView {
  status: 'none' | 'active' | 'past_due' | 'canceled' | 'local-mock';
  plan: PaidPlan | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  billingAvailable: boolean;
}
export interface OfferView {
  id: PaidPlan;
  name: string;
  description: string;
  price: null;
  currency: null;
}
export interface AccountView {
  authMode: 'local-test' | 'managed';
  player: {
    displayName: string;
  };
  access: CoachAccess;
  subscription: SubscriptionView;
  /**
   * @maxItems 3
   */
  offers: OfferView[];
}
export interface ApiError {
  code:
    | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'STALE_REVISION'
    | 'LEASE_LOST'
    | 'QUOTA_EXHAUSTED'
    | 'INVALID_COMMAND'
    | 'IDEMPOTENCY_CONFLICT'
    | 'NOT_FOUND'
    | 'PAYMENT_PENDING'
    | 'SERVICE_UNAVAILABLE';
  message: string;
  current?: SessionView;
}
export interface ReviewQuery {
  scope?: 'hand' | 'match';
  handNumber?: string;
}
export interface ReviewStepQuery {
  step?: string;
}
export interface AccessQuery {
  handId?: string;
}
export interface SuitMemory {
  suit: Suit;
  played: number;
  remaining: number;
  /**
   * @maxItems 4
   */
  voidSeats: Seat[];
  /**
   * @maxItems 13
   */
  playedCards?: Card[];
}
export interface NotesView {
  /**
   * @maxItems 4
   */
  memory: SuitMemory[];
  /**
   * @maxItems 3
   */
  outgoing: Card[];
  /**
   * @maxItems 3
   */
  received: Card[];
  /**
   * @maxItems 13
   */
  history: Trick[];
}
export interface BillingPreview {
  previewId: string;
  action: 'select-plan' | 'cancel' | 'resume';
  plan: PaidPlan;
  effectiveAt: string;
  expiresAt: string;
  amountDueNow: null;
  currency: null;
  mode: 'fixture';
  notice: string;
}
export interface BillingConfirmRequest {
  commandId: string;
  previewId: string;
}
export interface BillingOperation {
  operationId: string;
  status: 'confirmed' | 'scheduled';
  effectiveAt: string;
  plan: PaidPlan;
  cancelAtPeriodEnd: boolean;
  mode: 'fixture';
  message: string;
}
export interface FamilyMember {
  assignmentId: string;
  playerId: string;
  displayName: string;
  seatClass: 'unlimited' | 'limited';
  status: 'active' | 'held';
  periodEnd: string;
}
export interface FamilyInvitation {
  invitationId: string;
  inviteeId: string;
  seatClass: 'unlimited' | 'limited';
  expiresAt: string;
  token?: string;
}
export interface FamilyView {
  familyId: string | null;
  role: 'none' | 'payer' | 'member';
  payer: {
    playerId: string;
    displayName: string;
  } | null;
  /**
   * @maxItems 5
   */
  members: FamilyMember[];
  /**
   * @maxItems 4
   */
  invitations: FamilyInvitation[];
  periodEnd: string | null;
  localMock: true;
}

export interface ContractTypes {
  Mode: Mode;
  Seat: Seat;
  Card: Card;
  Suit: Suit;
  Phase: Phase;
  GameAction: GameAction;
  Play: Play;
  Trick: Trick;
  HandResult: HandResult;
  GameView: GameView;
  Preferences: Preferences;
  Plan: Plan;
  PaidPlan: PaidPlan;
  CoachAccess: CoachAccess;
  SessionStats: SessionStats;
  SessionView: SessionView;
  AdviceView: AdviceView;
  CommandEnvelope: CommandEnvelope;
  NewSessionRequest: NewSessionRequest;
  ActionsRequest: ActionsRequest;
  PrepareRequest: PrepareRequest;
  PrepareView: PrepareView;
  AdvanceRequest: AdvanceRequest;
  NextHandRequest: NextHandRequest;
  AdviceRequest: AdviceRequest;
  PreferencesRequest: PreferencesRequest;
  HandUnlockRequest: HandUnlockRequest;
  HandUnlockView: HandUnlockView;
  ExposureRequest: ExposureRequest;
  AcceptedView: AcceptedView;
  ReviewFrame: ReviewFrame;
  ReviewCase: ReviewCase;
  ReviewIndex: ReviewIndex;
  ReviewView: ReviewView;
  TrialRequest: TrialRequest;
  ReviewTrial: ReviewTrial;
  RecapView: RecapView;
  SubscriptionView: SubscriptionView;
  OfferView: OfferView;
  AccountView: AccountView;
  AccountCommand: AccountCommand;
  ApiError: ApiError;
  ReviewQuery: ReviewQuery;
  ReviewStepQuery: ReviewStepQuery;
  AccessQuery: AccessQuery;
  SuitMemory: SuitMemory;
  NotesView: NotesView;
  BillingPreviewRequest: BillingPreviewRequest;
  BillingPreview: BillingPreview;
  BillingConfirmRequest: BillingConfirmRequest;
  BillingOperation: BillingOperation;
  FamilyMember: FamilyMember;
  FamilyInvitation: FamilyInvitation;
  FamilyView: FamilyView;
  FamilyCommand: FamilyCommand;
}
export type ContractName = keyof ContractTypes;
