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
  | CommandStatusView
  | IdentityView
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
  | FamilyCommand
  | AccountDeleteRequest
  | AccountDeleteView
  | ExportView
  | ScenarioId
  | DevScenarioView
  | DevScenariosView
  | VersionedComponent
  | ModulePin
  | CoachedUnit
  | ReasoningObjective
  | ReasoningHorizon
  | ReasoningEstimate
  | ReasoningScenario
  | ReasoningFact
  | RegisteredActorPacket
  | RegisteredSessionView
  | RegisteredAnalysis
  | RegisteredActorEvent
  | RegisteredTarget
  | RegisteredSelector
  | V2ActionsRequest
  | VersionedActionsRequest
  | V2NewSessionRequest
  | VersionedNewSessionRequest
  | DemoFrameRequest
  | DemoFrame
  | AccessAllowance
  | AccessOffer
  | AccessOfferPolicy
  | AccessDecision
  | LocalServiceWorkRetryRequest
  | LocalServiceEmptyRequest
  | LocalServiceSelector
  | LocalServiceNode
  | LocalServiceControl
  | LocalServiceSession
  | LocalServiceSessionView
  | LocalServiceNewSessionRequest
  | LocalServiceControlRequest
  | LocalControlView
  | LocalServiceActionRequest
  | LocalServicePrepareRequest
  | LocalServicePrepareView
  | LocalServiceAdvanceRequest
  | LocalServiceNextHandRequest
  | LocalServiceCommandReceipt
  | LocalServiceDecisionView
  | LocalServiceHealthView
  | LocalServiceReconcileRequest
  | LocalServiceRecoveredReceipt;
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
export type ScenarioId = string;
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
export type RegisteredActorPacket = HeartsActorPacket | SpadesActorPacket;
export type HeartsCandidate =
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
export type SpadesCandidate =
  | {
      kind: 'play';
      card: Card;
    }
  | {
      kind: 'bid';
      bid: number;
    };
export type RegisteredSessionView = HeartsSessionView | SpadesSessionView;
export type RegisteredAnalysis = HeartsAnalysis | SpadesAnalysis;
export type RegisteredActorEvent = HeartsActorEvent | SpadesActorEvent;
export type RegisteredTarget =
  | {
      gameId: 'hearts';
      variantId: 'solo';
    }
  | {
      gameId: 'spades';
      variantId: 'solo' | 'partners';
    };
export type VersionedActionsRequest = ActionsRequest | V2ActionsRequest;
export type VersionedNewSessionRequest = NewSessionRequest | V2NewSessionRequest;
export type DemoFrameRequest =
  | {
      kind: 'open';
      contentVersion: string;
    }
  | {
      kind: 'choose';
      contentVersion: string;
      nodeId: string;
      choiceId: string;
    }
  | {
      kind: 'replay';
      contentVersion: string;
    };
export type AccessAllowance =
  | {
      kind: 'unlimited';
    }
  | {
      kind: 'limited';
      limit: number;
      unit: string;
      period: 'day' | 'week' | 'month' | 'grant';
      timezone: string;
      bucketId: string;
    };
export type AccessDecision =
  | {
      accessGeneration: number;
      applied: {
        offer: VersionedComponent;
        grantId: string;
      }[];
      remaining: number | null;
      continuation: 'pause-at-expiry' | 'finish-admitted-unit' | 'owned-result';
      allowed: true;
      reason: 'grant' | 'admitted-unit' | 'existing-unlock' | 'owned-result';
    }
  | {
      accessGeneration: number;
      applied: {
        offer: VersionedComponent;
        grantId: string;
      }[];
      remaining: number | null;
      continuation: 'pause-at-expiry' | 'finish-admitted-unit' | 'owned-result';
      allowed: false;
      reason:
        | 'disabled'
        | 'no-grant'
        | 'wrong-target'
        | 'wrong-tool'
        | 'expired'
        | 'revoked'
        | 'exhausted'
        | 'not-owned'
        | 'not-admitted';
    };
export type LocalServiceSelector =
  | {
      gameId: 'hearts';
      variantId: 'solo';
      moduleVersion: string;
      ruleProfileId: string;
    }
  | {
      gameId: 'spades';
      variantId: 'solo' | 'partners';
      moduleVersion: string;
      ruleProfileId: string;
    };
export type LocalServiceAdvanceRequest =
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
      kind: 'automatic';
      transitionId: string;
    };
export type LocalServiceReconcileRequest =
  | {
      commandId: string;
      operation: 'new-session';
      request: LocalServiceNewSessionRequest;
    }
  | {
      commandId: string;
      operation: 'control';
      request: LocalServiceControlRequest;
    }
  | {
      commandId: string;
      operation: 'action';
      request: LocalServiceActionRequest;
    }
  | {
      commandId: string;
      operation: 'advance';
      request: LocalServiceAdvanceRequest;
    }
  | {
      commandId: string;
      operation: 'next-hand';
      request: LocalServiceNextHandRequest;
    };
export type LocalServiceRecoveredReceipt = LocalServiceCommandReceipt | LocalControlView;

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
  scenario?: DevScenarioView;
}
export interface DevScenarioView {
  id: ScenarioId;
  version: string;
  label: string;
  mode: Mode;
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
  outcome?: 'suggestion' | 'several-reasonable';
  explanation?: 'supported' | 'facts-only';
  /**
   * @minItems 2
   * @maxItems 3
   */
  consideredCards?: Card[];
  /**
   * @minItems 2
   * @maxItems 3
   */
  consideredBids?: number[];
  evidence?: 'exact' | 'heuristic' | 'sampled-estimate';
  policyVersion?: string;
  cueVersion?: string;
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
  scenarioId?: ScenarioId;
  replayScenario?: true;
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
export interface CommandStatusView {
  status: 'accepted' | 'unknown';
}
export interface IdentityView {
  playerId: string;
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
    id: string;
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
export interface AccountDeleteRequest {
  commandId: string;
  confirmation: 'DELETE LOCAL ACCOUNT';
}
export interface AccountDeleteView {
  deleted: true;
  mode: 'local-test';
  message: string;
}
export interface ExportView {
  formatVersion: 'local-export-1';
  exportedAt: string;
  mode: 'local-test';
  player: {
    id: string;
    displayName: string;
    preferences: Preferences;
  };
  subscription: {
    plan: PaidPlan;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string;
  };
  /**
   * @maxItems 100000
   */
  games: {
    id: string;
    revision: number;
    /**
     * @maxItems 100000
     */
    frames: ReviewFrame[];
    /**
     * @maxItems 100000
     */
    advice: AdviceView[];
    stats: SessionStats;
  }[];
  /**
   * @maxItems 100000
   */
  coachedHands: {
    gameId: string;
    handNumber: number;
    period: string;
  }[];
  /**
   * @maxItems 100000
   */
  billing: BillingOperation[];
}
export interface DevScenariosView {
  /**
   * @maxItems 100
   */
  scenarios: DevScenarioView[];
}
export interface VersionedComponent {
  id: string;
  version: string;
}
export interface ModulePin {
  gameId: string;
  variantId: string;
  moduleVersion: string;
  ruleProfileId: string;
  stateSchemaVersion: string;
  observationSchemaVersion: string;
  publicSchemaVersion: string;
  eventSchemaVersion: string;
}
export interface CoachedUnit {
  id: string;
  kind: string;
  atAdmissionBoundary: boolean;
}
export interface ReasoningObjective {
  id: string;
  version: string;
  metric: string;
  direction: 'higher' | 'lower';
}
export interface ReasoningHorizon {
  id: string;
  version: string;
  scope: string;
}
export interface ReasoningEstimate {
  competitorId: string;
  metric: string;
  event: string;
  unit: string;
  population: string;
  value: number;
  estimator: VersionedComponent;
  uncertainty: {
    method: VersionedComponent;
    lower: number;
    upper: number;
  } | null;
}
export interface ReasoningScenario {
  id: string;
  version: string;
  applicability: 'applies' | 'possible' | 'excluded';
  evidence: string[];
  exceptions: string[];
}
export interface ReasoningFact {
  id: string;
  kind: 'exact' | 'inferred';
  summary: string;
  evidence: string[];
  candidateId: string | null;
}
export interface HeartsActorPacket {
  publicSchemaVersion: '2.0.0';
  gameId: 'hearts';
  variantId: 'solo';
  seat: Seat;
  phase: string;
  observation: HeartsObservation;
  /**
   * @minItems 1
   */
  candidates: {
    id: string;
    public: HeartsCandidate;
  }[];
}
export interface HeartsObservation {
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
  scores: number[];
  turn: Seat | null;
  dealer: Seat;
  roundNumber: number;
  /**
   * @maxItems 4
   */
  trick: Play[];
  /**
   * @maxItems 13
   */
  history: Trick[];
  heartsBroken: boolean;
  passDirection: 'left' | 'right' | 'across' | 'hold';
  pass: {
    /**
     * @maxItems 3
     */
    outgoing: Card[];
    /**
     * @maxItems 3
     */
    incoming: Card[];
    to: Seat | null;
    from: Seat | null;
  };
}
export interface SpadesActorPacket {
  publicSchemaVersion: '2.0.0';
  gameId: 'spades';
  variantId: 'solo' | 'partners';
  seat: Seat;
  phase: string;
  observation: SpadesObservation;
  /**
   * @minItems 1
   */
  candidates: {
    id: string;
    public: SpadesCandidate;
  }[];
}
export interface SpadesObservation {
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
  scores: number[];
  turn: Seat | null;
  dealer: Seat;
  roundNumber: number;
  /**
   * @maxItems 4
   */
  trick: Play[];
  /**
   * @maxItems 13
   */
  history: Trick[];
  spadesBroken: boolean;
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
  bags: number[];
}
export interface HeartsSessionView {
  publicSchemaVersion: '2.0.0';
  gameId: 'hearts';
  variantId: 'solo';
  seat: Seat;
  phase: string;
  table: HeartsObservation;
  accessUnit: CoachedUnit | null;
}
export interface SpadesSessionView {
  publicSchemaVersion: '2.0.0';
  gameId: 'spades';
  variantId: 'solo' | 'partners';
  seat: Seat;
  phase: string;
  table: SpadesObservation;
  accessUnit: CoachedUnit | null;
}
export interface HeartsAnalysis {
  publicSchemaVersion: '2.0.0';
  gameId: 'hearts';
  variantId: 'solo';
  origin: 'code' | 'demo' | 'forced' | 'jev';
  selectedCandidateId: string;
  objective: ReasoningObjective;
  horizon: ReasoningHorizon;
  facts: ReasoningFact[];
  estimates: ReasoningEstimate[];
  scenarios: ReasoningScenario[];
  assumptions: string[];
}
export interface SpadesAnalysis {
  publicSchemaVersion: '2.0.0';
  gameId: 'spades';
  variantId: 'solo' | 'partners';
  origin: 'code' | 'demo' | 'forced' | 'jev';
  selectedCandidateId: string;
  objective: ReasoningObjective;
  horizon: ReasoningHorizon;
  facts: ReasoningFact[];
  estimates: ReasoningEstimate[];
  scenarios: ReasoningScenario[];
  assumptions: string[];
}
export interface HeartsActorEvent {
  publicSchemaVersion: '2.0.0';
  gameId: 'hearts';
  variantId: 'solo';
  eventSchemaVersion: '2.0.0';
  id: string;
  type:
    | 'hand-started'
    | 'card-played'
    | 'cards-passed'
    | 'trick-resolved'
    | 'trick-collected'
    | 'moon-shot'
    | 'hand-scored';
  message: string;
  seat: Seat | null;
  card: Card | null;
  bid: null;
}
export interface SpadesActorEvent {
  publicSchemaVersion: '2.0.0';
  gameId: 'spades';
  variantId: 'solo' | 'partners';
  eventSchemaVersion: '2.0.0';
  id: string;
  type: 'hand-started' | 'bid-placed' | 'card-played' | 'trick-resolved' | 'trick-collected' | 'hand-scored';
  message: string;
  seat: Seat | null;
  card: Card | null;
  bid: number | null;
}
export interface RegisteredSelector {
  target: RegisteredTarget;
  moduleVersion: string;
  ruleProfileId: string;
}
export interface V2ActionsRequest {
  commandId: string;
  gameId: string;
  expectedRevision: number;
  controlLeaseToken: string;
  publicSchemaVersion: '2.0.0';
  candidateId: string;
}
export interface V2NewSessionRequest {
  commandId: string;
  gameId: string;
  expectedRevision: number;
  controlLeaseToken: string;
  publicSchemaVersion: '2.0.0';
  selector: RegisteredSelector;
}
export interface DemoFrame {
  contentVersion: string;
  nodeId: string;
  label: 'demo';
  title: string;
  body: string;
  cards: Card[];
  choices: {
    id: string;
    label: string;
  }[];
  complete: boolean;
}
export interface AccessOffer {
  id: string;
  version: string;
  enabled: boolean;
  kind: 'free' | 'access-trial' | 'paid';
  /**
   * @minItems 1
   */
  targets: RegisteredTarget[];
  play: boolean;
  coach: {
    tools: string[];
    allowance: AccessAllowance;
  };
  continuation: 'pause-at-expiry' | 'finish-admitted-unit';
  activation: 'automatic' | 'verified-purchase' | 'once-per-identity';
  validitySeconds: number | null;
}
export interface AccessOfferPolicy {
  id: string;
  version: string;
  accessGeneration: number;
  precedence: string[];
  offers: AccessOffer[];
}
export interface LocalServiceWorkRetryRequest {
  controlLeaseToken: string;
}
export interface LocalServiceEmptyRequest {}
export interface LocalServiceNode {
  kind: 'actor' | 'sealed' | 'automatic' | 'chance' | 'round-complete' | 'session-complete';
  phase: string;
  actor?: Seat;
  windowId?: string;
  transitionId?: string;
  requestId?: string;
}
export interface LocalServiceControl {
  owned: boolean;
  leaseToken: string | null;
  controlGeneration: number;
}
export interface LocalServiceSession {
  gameId: string;
  revision: number;
  playable: boolean;
  blockedReason: string | null;
  view: RegisteredSessionView;
  control: LocalServiceControl;
  node: LocalServiceNode;
}
export interface LocalServiceSessionView {
  serviceSchemaVersion: '1.0.0';
  activeGameId: string | null;
  session: LocalServiceSession | null;
}
export interface LocalServiceNewSessionRequest {
  commandId: string;
  selector: LocalServiceSelector;
  expectedActiveGameId: string | null;
  expectedRevision: number | null;
  controlLeaseToken: string | null;
}
export interface LocalServiceControlRequest {
  commandId: string;
  gameId: string;
  expectedRevision: number;
  expectedControlGeneration: number;
}
export interface LocalControlView {
  controlLeaseToken: string;
  expiresAt: string;
  accessGeneration: number;
  controlGeneration: number;
}
export interface LocalServiceActionRequest {
  commandId: string;
  gameId: string;
  expectedRevision: number;
  controlLeaseToken: string;
  candidateId: string;
  preparedDecisionId: string;
  /**
   * @minItems 1
   * @maxItems 4
   */
  preparedWorkIds: string[];
}
export interface LocalServicePrepareRequest {
  gameId: string;
  expectedRevision: number;
  controlLeaseToken: string;
  purpose: 'human-analysis' | 'bot-action' | 'coach-advice';
}
export interface LocalServicePrepareView {
  workId: string;
  /**
   * @minItems 1
   * @maxItems 4
   */
  workIds: string[];
  status: 'queued' | 'running' | 'completed' | 'rejected' | 'canceled';
  gameId: string;
  revision: number;
  purpose: 'human-analysis' | 'bot-action' | 'coach-advice';
  preparedDecisionId?: string;
  decisionId?: string;
  source?: 'code' | 'forced';
}
export interface LocalServiceNextHandRequest {
  commandId: string;
  gameId: string;
  expectedRevision: number;
  controlLeaseToken: string;
}
export interface LocalServiceCommandReceipt {
  commandId: string;
  gameId: string;
  revision: number;
  controlLeaseToken?: string;
  controlGeneration?: number;
}
export interface LocalServiceDecisionView {
  decisionId: string;
  gameId: string;
  revision: number;
  advice: AdviceView;
}
export interface LocalServiceHealthView {
  status: 'ready';
  mode: 'local' | 'test';
  identity: 'local-test';
  provider: 'off';
  payments: 'fixture';
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
  CommandStatusView: CommandStatusView;
  IdentityView: IdentityView;
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
  AccountDeleteRequest: AccountDeleteRequest;
  AccountDeleteView: AccountDeleteView;
  ExportView: ExportView;
  ScenarioId: ScenarioId;
  DevScenarioView: DevScenarioView;
  DevScenariosView: DevScenariosView;
  VersionedComponent: VersionedComponent;
  ModulePin: ModulePin;
  CoachedUnit: CoachedUnit;
  ReasoningObjective: ReasoningObjective;
  ReasoningHorizon: ReasoningHorizon;
  ReasoningEstimate: ReasoningEstimate;
  ReasoningScenario: ReasoningScenario;
  ReasoningFact: ReasoningFact;
  RegisteredActorPacket: RegisteredActorPacket;
  RegisteredSessionView: RegisteredSessionView;
  RegisteredAnalysis: RegisteredAnalysis;
  RegisteredActorEvent: RegisteredActorEvent;
  RegisteredTarget: RegisteredTarget;
  RegisteredSelector: RegisteredSelector;
  V2ActionsRequest: V2ActionsRequest;
  VersionedActionsRequest: VersionedActionsRequest;
  V2NewSessionRequest: V2NewSessionRequest;
  VersionedNewSessionRequest: VersionedNewSessionRequest;
  DemoFrameRequest: DemoFrameRequest;
  DemoFrame: DemoFrame;
  AccessAllowance: AccessAllowance;
  AccessOffer: AccessOffer;
  AccessOfferPolicy: AccessOfferPolicy;
  AccessDecision: AccessDecision;
  HeartsCandidate: HeartsCandidate;
  HeartsObservation: HeartsObservation;
  HeartsActorPacket: HeartsActorPacket;
  HeartsSessionView: HeartsSessionView;
  HeartsAnalysis: HeartsAnalysis;
  HeartsActorEvent: HeartsActorEvent;
  SpadesCandidate: SpadesCandidate;
  SpadesObservation: SpadesObservation;
  SpadesActorPacket: SpadesActorPacket;
  SpadesSessionView: SpadesSessionView;
  SpadesAnalysis: SpadesAnalysis;
  SpadesActorEvent: SpadesActorEvent;
  LocalServiceWorkRetryRequest: LocalServiceWorkRetryRequest;
  LocalServiceEmptyRequest: LocalServiceEmptyRequest;
  LocalServiceSelector: LocalServiceSelector;
  LocalServiceNode: LocalServiceNode;
  LocalServiceControl: LocalServiceControl;
  LocalServiceSession: LocalServiceSession;
  LocalServiceSessionView: LocalServiceSessionView;
  LocalServiceNewSessionRequest: LocalServiceNewSessionRequest;
  LocalServiceControlRequest: LocalServiceControlRequest;
  LocalControlView: LocalControlView;
  LocalServiceActionRequest: LocalServiceActionRequest;
  LocalServicePrepareRequest: LocalServicePrepareRequest;
  LocalServicePrepareView: LocalServicePrepareView;
  LocalServiceAdvanceRequest: LocalServiceAdvanceRequest;
  LocalServiceNextHandRequest: LocalServiceNextHandRequest;
  LocalServiceCommandReceipt: LocalServiceCommandReceipt;
  LocalServiceDecisionView: LocalServiceDecisionView;
  LocalServiceHealthView: LocalServiceHealthView;
  LocalServiceReconcileRequest: LocalServiceReconcileRequest;
  LocalServiceRecoveredReceipt: LocalServiceRecoveredReceipt;
}
export type ContractName = keyof ContractTypes;
