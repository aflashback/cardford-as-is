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
  | RegisteredPresentation
  | RegisteredAdvice
  | CoachSupport
  | CoachReason
  | CoachMessage
  | CoachMessageView;
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
export type ReviewFrame = LegacyReviewFrame | TrixReviewFrame;
export type TrixTwoAnnouncements = TrixTwoAnnouncementsHidden | TrixTwoAnnouncementsRevealed;
export type TrixRecipient = TrixSeatRecipient | TrixTeamRecipient;
export type TrixLayoutTurn = TrixLayoutPlacement | TrixLayoutForcedPass;
export type TrixAction = TrixChooseRequest | TrixDeclareDoubles | TrixPlayCard | TrixLayoutCard | TrixLayoutPassAction;
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
export type RegisteredActorPacket = HeartsActorPacket | SpadesActorPacket | TokenActorPacket | TrixActorPacket;
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
export type RegisteredSessionView = HeartsSessionView | SpadesSessionView | TokenSessionView | TrixSessionView;
export type RegisteredAnalysis = HeartsAnalysis | SpadesAnalysis | TokenAnalysis | TrixAnalysis;
export type RegisteredActorEvent = HeartsActorEvent | SpadesActorEvent | TokenActorEvent | TrixActorEvent;
export type RegisteredTarget =
  | {
      gameId: 'hearts';
      variantId: 'solo';
    }
  | {
      gameId: 'spades';
      variantId: 'solo' | 'partners';
    }
  | TokenTarget
  | TrixTarget;
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
export type RegisteredPresentation = GameView | TokenPresentation | TrixPresentation;
export type RegisteredAdvice = AdviceView | TrixAdvice;

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
  source: 'code' | 'jev' | 'forced' | 'fallback' | 'demo';
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
export interface LegacyReviewFrame {
  game: GameView;
  action: GameAction | null;
  decisionId: string;
  /**
   * @maxItems 20
   */
  notes: string[];
}
export interface TrixReviewFrame {
  game: TrixPresentation;
  action: TrixAction | null;
  decisionId: string;
  /**
   * @minItems 0
   * @maxItems 20
   */
  notes: string[];
}
export interface TrixPresentation {
  id: string;
  gameId: 'trix';
  variantId: 'basic-solo' | 'basic-partners' | 'complex-solo' | 'complex-partners';
  seat: Seat;
  observation: TrixObservation;
}
export interface TrixObservation {
  id: string;
  gameId: 'trix';
  variantId: 'basic-solo' | 'basic-partners' | 'complex-solo' | 'complex-partners';
  seat: Seat;
  phase: 'choose-request' | 'declare-doubles' | 'playing' | 'layout' | 'round-complete' | 'chance' | 'session-complete';
  turn: Seat | null;
  kingdom: number;
  dealNumber: number;
  owner: Seat;
  request: ('diamonds' | 'lutoosh' | 'queens' | 'king' | 'complex' | 'trix') | null;
  /**
   * @minItems 0
   * @maxItems 5
   */
  remainingRequests: ('diamonds' | 'lutoosh' | 'queens' | 'king' | 'complex' | 'trix')[];
  /**
   * @minItems 0
   * @maxItems 13
   */
  hand: Card[];
  twoAnnouncements?: TrixTwoAnnouncements;
  /**
   * @minItems 4
   * @maxItems 4
   */
  handCounts: number[];
  /**
   * @minItems 0
   * @maxItems 4
   */
  trick: TrixPlay[];
  /**
   * @minItems 0
   * @maxItems 13
   */
  tricks: TrixTrick[];
  /**
   * @minItems 0
   * @maxItems 4
   */
  declarations: TrixDeclaration[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  board: TrixRow[];
  /**
   * @minItems 0
   * @maxItems 4
   */
  finishOrder: Seat[];
  /**
   * @minItems 0
   * @maxItems 10000
   */
  passes: TrixLayoutPass[];
  /**
   * @minItems 0
   * @maxItems 10000
   */
  ledger: TrixLedgerEntry[];
  /**
   * @minItems 0
   * @maxItems 10000
   */
  withheldBonuses: TrixWithheldBonus[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  lastExternalLeader: (TrixLeadSource | null)[];
  /**
   * @minItems 2
   * @maxItems 4
   */
  totals: TrixScore[];
  /**
   * @minItems 2
   * @maxItems 4
   */
  requestTotals: TrixScore[];
  /**
   * Live presentation only: current-deal points assigned to each seat by the server ledger, in seat order. Excludes competitor-only team bonuses. Optional for immutable historical observations.
   *
   * @minItems 4
   * @maxItems 4
   */
  requestSeatTotals?: number[];
  /**
   * @minItems 2
   * @maxItems 4
   */
  kingdomTotals: TrixScore[];
  /**
   * @minItems 0
   * @maxItems 4
   */
  winners: string[];
  layoutHistory?: TrixLayoutHistory;
}
export interface TrixTwoAnnouncementsHidden {
  status: 'hidden';
  /**
   * @minItems 4
   * @maxItems 4
   */
  counts: number[];
}
export interface TrixTwoAnnouncementsRevealed {
  status: 'revealed';
  /**
   * @minItems 4
   * @maxItems 4
   */
  cards: TrixTwoAnnouncementCard[];
}
export interface TrixTwoAnnouncementCard {
  seat: Seat;
  card: 'C2' | 'D2' | 'H2' | 'S2';
}
export interface TrixPlay {
  seat: Seat;
  card: Card;
}
export interface TrixTrick {
  number: number;
  leader: Seat;
  winner: Seat;
  /**
   * @minItems 4
   * @maxItems 4
   */
  plays: TrixPlay[];
}
export interface TrixDeclaration {
  seat: Seat;
  /**
   * @minItems 0
   * @maxItems 5
   */
  cards: Card[];
  ref: string;
}
export interface TrixRow {
  suit: 'C' | 'D' | 'H' | 'S';
  low: number;
  high: number;
}
export interface TrixLayoutPass {
  seat: Seat;
  /**
   * @minItems 4
   * @maxItems 4
   */
  board: TrixRow[];
  ref: string;
}
export interface TrixLedgerEntry {
  dealNumber: number;
  kingdom: number;
  request: 'diamonds' | 'lutoosh' | 'queens' | 'king' | 'complex' | 'trix';
  trick: number;
  finish: number;
  recipient: TrixRecipient;
  component: 'diamond' | 'trick' | 'queen' | 'king' | 'double-bonus' | 'layout-finish';
  card?: Card;
  delta: number;
  declarationRef?: string;
  leadSourceRef?: string;
}
export interface TrixSeatRecipient {
  kind: 'seat';
  seat: Seat;
}
export interface TrixTeamRecipient {
  kind: 'competitor';
  competitor: string;
}
export interface TrixWithheldBonus {
  dealNumber: number;
  trick: number;
  card: Card;
  bonusValue: 25 | 75;
  reason: 'no_previous_external_leader';
  declarationRef: string;
}
export interface TrixLeadSource {
  seat: Seat;
  trick: number;
}
export interface TrixScore {
  id: string;
  /**
   * @minItems 1
   * @maxItems 2
   */
  seats: Seat[];
  total: number;
}
export interface TrixLayoutHistory {
  version: '1.0.0';
  status: 'available';
  /**
   * @minItems 0
   * @maxItems 208
   */
  turns: TrixLayoutTurn[];
}
export interface TrixLayoutPlacement {
  ordinal: number;
  seat: Seat;
  kind: 'layout-card';
  card: Card;
  /**
   * @minItems 4
   * @maxItems 4
   */
  boardBefore: TrixRow[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  handCountsBefore: number[];
  twoAnnouncementsBefore: TrixTwoAnnouncements | null;
}
export interface TrixLayoutForcedPass {
  ordinal: number;
  seat: Seat;
  kind: 'layout-pass';
  /**
   * @minItems 4
   * @maxItems 4
   */
  boardBefore: TrixRow[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  handCountsBefore: number[];
  twoAnnouncementsBefore: TrixTwoAnnouncements | null;
}
export interface TrixChooseRequest {
  kind: 'choose-request';
  request: 'diamonds' | 'lutoosh' | 'queens' | 'king' | 'complex' | 'trix';
}
export interface TrixDeclareDoubles {
  kind: 'declare-doubles';
  /**
   * @minItems 0
   * @maxItems 5
   */
  cards?: ('CQ' | 'DQ' | 'HQ' | 'SQ' | 'HK')[];
}
export interface TrixPlayCard {
  kind: 'play-card';
  card: Card;
}
export interface TrixLayoutCard {
  kind: 'layout-card';
  card: Card;
}
export interface TrixLayoutPassAction {
  kind: 'layout-pass';
}
export interface ReviewCase {
  decisionId: string;
  handNumber: number;
  action: GameAction | TrixAction;
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
    | 'session_renewal_required'
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
export interface TokenActorPacket {
  publicSchemaVersion: '2.0.0';
  gameId: 'test-token';
  variantId: 'individual' | 'neighbour-teams';
  seat: Seat;
  phase: 'token-layout' | 'reveal' | 'collect' | 'complete';
  observation: TokenObservation;
  /**
   * @maxItems 5
   */
  candidates: TokenCandidate[];
}
export interface TokenObservation {
  gameId: 'test-token';
  variant: 'individual' | 'neighbour-teams';
  seat: Seat;
  phase: 'chance' | 'reveal' | 'collect' | 'complete';
  /**
   * @maxItems 5
   */
  own: number[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  held: number[];
  /**
   * @maxItems 4
   */
  current: TokenReveal[];
  /**
   * @maxItems 5
   */
  cycles: TokenCycle[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  collections: number[];
  /**
   * @minItems 2
   * @maxItems 4
   */
  competition: TokenCompetitor[];
  turn: Seat | null;
  /**
   * @maxItems 4
   */
  winners: string[];
}
export interface TokenReveal {
  seat: Seat;
  token: number;
}
export interface TokenCycle {
  /**
   * @minItems 4
   * @maxItems 4
   */
  reveals: TokenReveal[];
  collector: Seat;
}
export interface TokenCompetitor {
  id: string;
  /**
   * @minItems 1
   * @maxItems 2
   */
  seats: Seat[];
}
export interface TokenCandidate {
  id: string;
  public: TokenRevealAction;
}
export interface TokenRevealAction {
  kind: 'reveal';
  token: number;
}
export interface TrixActorPacket {
  publicSchemaVersion: '1.0.0' | '1.1.0' | '1.2.0';
  gameId: 'trix';
  variantId: 'basic-solo' | 'basic-partners' | 'complex-solo' | 'complex-partners';
  seat: Seat;
  phase: 'choose-request' | 'declare-doubles' | 'playing' | 'layout' | 'round-complete' | 'chance' | 'session-complete';
  observation: TrixObservation;
  /**
   * @minItems 1
   * @maxItems 32
   */
  candidates: TrixPublicCandidate[];
}
export interface TrixPublicCandidate {
  id: string;
  public: TrixAction;
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
export interface TokenSessionView {
  publicSchemaVersion: '2.0.0';
  gameId: 'test-token';
  variantId: 'individual' | 'neighbour-teams';
  seat: Seat;
  phase: 'token-layout' | 'reveal' | 'collect' | 'complete';
  table: TokenObservation;
  accessUnit: CoachedUnit | null;
}
export interface TrixSessionView {
  publicSchemaVersion: '1.0.0' | '1.1.0' | '1.2.0';
  gameId: 'trix';
  variantId: 'basic-solo' | 'basic-partners' | 'complex-solo' | 'complex-partners';
  seat: Seat;
  phase: 'choose-request' | 'declare-doubles' | 'playing' | 'layout' | 'round-complete' | 'chance' | 'session-complete';
  table: TrixObservation;
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
export interface TokenAnalysis {
  publicSchemaVersion: '2.0.0';
  gameId: 'test-token';
  variantId: 'individual' | 'neighbour-teams';
  origin: 'demo' | 'forced';
  selectedCandidateId: string;
  objective: ReasoningObjective;
  horizon: ReasoningHorizon;
  facts: ReasoningFact[];
  estimates: ReasoningEstimate[];
  scenarios: ReasoningScenario[];
  assumptions: string[];
}
export interface TrixAnalysis {
  publicSchemaVersion: '1.0.0' | '1.1.0' | '1.2.0';
  gameId: 'trix';
  variantId: 'basic-solo' | 'basic-partners' | 'complex-solo' | 'complex-partners';
  origin: 'code' | 'forced';
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
export interface TokenActorEvent {
  publicSchemaVersion: '2.0.0';
  gameId: 'test-token';
  variantId: 'individual' | 'neighbour-teams';
  eventSchemaVersion: '2.0.0';
  id: string;
  type: 'layout-requested' | 'tokens-assigned' | 'token-revealed' | 'cycle-collected';
  seat: Seat | null;
  token: number | null;
}
export interface TrixActorEvent {
  publicSchemaVersion: '1.0.0' | '1.1.0' | '1.2.0';
  gameId: 'trix';
  variantId: 'basic-solo' | 'basic-partners' | 'complex-solo' | 'complex-partners';
  eventSchemaVersion: '1.0.0';
  id: string;
  type: string;
  message: string;
  seat?: Seat | null;
  card?: Card | null;
}
export interface TokenTarget {
  gameId: 'test-token';
  variantId: 'individual' | 'neighbour-teams';
}
export interface TrixTarget {
  gameId: 'trix';
  variantId: 'basic-solo' | 'basic-partners' | 'complex-solo' | 'complex-partners';
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
export interface TokenPresentation {
  id: string;
  gameId: 'test-token';
  variantId: 'individual' | 'neighbour-teams';
  seat: Seat;
  observation: TokenObservation;
}
export interface TrixAdvice {
  gameId: 'trix';
  variantId: 'basic-solo' | 'basic-partners' | 'complex-solo' | 'complex-partners';
  decisionId: string;
  level: 1 | 2 | 3;
  origin: 'code' | 'forced';
  title: string;
  text: string;
  policyVersion: string;
  recommendedCandidateId?: string;
  /**
   * @minItems 0
   * @maxItems 32
   */
  alternatives?: string[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  evidenceRefs: string[];
}
export interface CoachSupport {
  id: string;
  kind: 'exact' | 'conditional' | 'policy';
  text: string;
}
export interface CoachReason {
  summary: string;
  /**
   * @maxItems 64
   */
  support: CoachSupport[];
  /**
   * @maxItems 32
   */
  alternatives: string[];
  /**
   * @maxItems 32
   */
  limitations: string[];
}
export interface CoachMessage {
  presentationVersion: 'coach-advice-2.0.0';
  decisionId: string;
  policyVersion: string;
  cueVersion: string;
  status: 'insufficient-reason' | 'tactical' | 'only-option' | 'no-clear-preference';
  selectedAction: string;
  cue: string;
  reason: CoachReason;
}
export interface CoachMessageView {
  presentationVersion: 'coach-advice-2.0.0';
  decisionId: string;
  status: 'tactical' | 'only-option' | 'no-clear-preference' | 'insufficient-reason';
  selectedAction: string;
  cue: string;
  view: 'recommendation' | 'reason';
  reason?: CoachReason;
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
  RegisteredPresentation: RegisteredPresentation;
  RegisteredAdvice: RegisteredAdvice;
  CoachSupport: CoachSupport;
  CoachReason: CoachReason;
  CoachMessage: CoachMessage;
  CoachMessageView: CoachMessageView;
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
  TokenReveal: TokenReveal;
  TokenCycle: TokenCycle;
  TokenCompetitor: TokenCompetitor;
  TokenObservation: TokenObservation;
  TokenCandidate: TokenCandidate;
  TokenActorPacket: TokenActorPacket;
  TokenSessionView: TokenSessionView;
  TokenAnalysis: TokenAnalysis;
  TokenActorEvent: TokenActorEvent;
  TokenPresentation: TokenPresentation;
  TrixAction: TrixAction;
  TrixPlay: TrixPlay;
  TrixTrick: TrixTrick;
  TrixDeclaration: TrixDeclaration;
  TrixRow: TrixRow;
  TrixLayoutPass: TrixLayoutPass;
  TrixLeadSource: TrixLeadSource;
  TrixRecipient: TrixRecipient;
  TrixLedgerEntry: TrixLedgerEntry;
  TrixWithheldBonus: TrixWithheldBonus;
  TrixScore: TrixScore;
  TrixTwoAnnouncements: TrixTwoAnnouncements;
  TrixObservation: TrixObservation;
  TrixActorPacket: TrixActorPacket;
  TrixSessionView: TrixSessionView;
  TrixPresentation: TrixPresentation;
  TrixAnalysis: TrixAnalysis;
  TrixActorEvent: TrixActorEvent;
  TrixAdvice: TrixAdvice;
  TrixReviewFrame: TrixReviewFrame;
  TrixLayoutTurn: TrixLayoutTurn;
  TrixLayoutHistory: TrixLayoutHistory;
}
export type ContractName = keyof ContractTypes;
