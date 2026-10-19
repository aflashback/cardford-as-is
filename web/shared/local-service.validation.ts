/* Generated from contracts.schema.json. Do not edit; run npm run contracts:generate. */
import * as compiled from './local-service.validators.mjs';
import type { ValidateFunction } from 'ajv';
import type { ContractName, ContractTypes } from './local-service.contracts.ts';
const validators: { [N in ContractName]: ValidateFunction<ContractTypes[N]> } = {
  Mode: compiled.validateMode,
  Seat: compiled.validateSeat,
  Card: compiled.validateCard,
  Suit: compiled.validateSuit,
  Phase: compiled.validatePhase,
  GameAction: compiled.validateGameAction,
  Play: compiled.validatePlay,
  Trick: compiled.validateTrick,
  HandResult: compiled.validateHandResult,
  GameView: compiled.validateGameView,
  Preferences: compiled.validatePreferences,
  Plan: compiled.validatePlan,
  PaidPlan: compiled.validatePaidPlan,
  CoachAccess: compiled.validateCoachAccess,
  SessionStats: compiled.validateSessionStats,
  SessionView: compiled.validateSessionView,
  AdviceView: compiled.validateAdviceView,
  CommandEnvelope: compiled.validateCommandEnvelope,
  NewSessionRequest: compiled.validateNewSessionRequest,
  ActionsRequest: compiled.validateActionsRequest,
  PrepareRequest: compiled.validatePrepareRequest,
  CommandStatusView: compiled.validateCommandStatusView,
  IdentityView: compiled.validateIdentityView,
  PrepareView: compiled.validatePrepareView,
  AdvanceRequest: compiled.validateAdvanceRequest,
  NextHandRequest: compiled.validateNextHandRequest,
  AdviceRequest: compiled.validateAdviceRequest,
  PreferencesRequest: compiled.validatePreferencesRequest,
  HandUnlockRequest: compiled.validateHandUnlockRequest,
  HandUnlockView: compiled.validateHandUnlockView,
  ExposureRequest: compiled.validateExposureRequest,
  AcceptedView: compiled.validateAcceptedView,
  ReviewFrame: compiled.validateReviewFrame,
  ReviewCase: compiled.validateReviewCase,
  ReviewIndex: compiled.validateReviewIndex,
  ReviewView: compiled.validateReviewView,
  TrialRequest: compiled.validateTrialRequest,
  ReviewTrial: compiled.validateReviewTrial,
  RecapView: compiled.validateRecapView,
  SubscriptionView: compiled.validateSubscriptionView,
  OfferView: compiled.validateOfferView,
  AccountView: compiled.validateAccountView,
  AccountCommand: compiled.validateAccountCommand,
  ApiError: compiled.validateApiError,
  ReviewQuery: compiled.validateReviewQuery,
  ReviewStepQuery: compiled.validateReviewStepQuery,
  AccessQuery: compiled.validateAccessQuery,
  SuitMemory: compiled.validateSuitMemory,
  NotesView: compiled.validateNotesView,
  BillingPreviewRequest: compiled.validateBillingPreviewRequest,
  BillingPreview: compiled.validateBillingPreview,
  BillingConfirmRequest: compiled.validateBillingConfirmRequest,
  BillingOperation: compiled.validateBillingOperation,
  FamilyMember: compiled.validateFamilyMember,
  FamilyInvitation: compiled.validateFamilyInvitation,
  FamilyView: compiled.validateFamilyView,
  FamilyCommand: compiled.validateFamilyCommand,
  AccountDeleteRequest: compiled.validateAccountDeleteRequest,
  AccountDeleteView: compiled.validateAccountDeleteView,
  ExportView: compiled.validateExportView,
  ScenarioId: compiled.validateScenarioId,
  DevScenarioView: compiled.validateDevScenarioView,
  DevScenariosView: compiled.validateDevScenariosView,
  VersionedComponent: compiled.validateVersionedComponent,
  ModulePin: compiled.validateModulePin,
  CoachedUnit: compiled.validateCoachedUnit,
  ReasoningObjective: compiled.validateReasoningObjective,
  ReasoningHorizon: compiled.validateReasoningHorizon,
  ReasoningEstimate: compiled.validateReasoningEstimate,
  ReasoningScenario: compiled.validateReasoningScenario,
  ReasoningFact: compiled.validateReasoningFact,
  RegisteredActorPacket: compiled.validateRegisteredActorPacket,
  RegisteredSessionView: compiled.validateRegisteredSessionView,
  RegisteredAnalysis: compiled.validateRegisteredAnalysis,
  RegisteredActorEvent: compiled.validateRegisteredActorEvent,
  RegisteredTarget: compiled.validateRegisteredTarget,
  RegisteredSelector: compiled.validateRegisteredSelector,
  V2ActionsRequest: compiled.validateV2ActionsRequest,
  VersionedActionsRequest: compiled.validateVersionedActionsRequest,
  V2NewSessionRequest: compiled.validateV2NewSessionRequest,
  VersionedNewSessionRequest: compiled.validateVersionedNewSessionRequest,
  DemoFrameRequest: compiled.validateDemoFrameRequest,
  DemoFrame: compiled.validateDemoFrame,
  AccessAllowance: compiled.validateAccessAllowance,
  AccessOffer: compiled.validateAccessOffer,
  AccessOfferPolicy: compiled.validateAccessOfferPolicy,
  AccessDecision: compiled.validateAccessDecision,
  RegisteredPresentation: compiled.validateRegisteredPresentation,
  RegisteredAdvice: compiled.validateRegisteredAdvice,
  CoachSupport: compiled.validateCoachSupport,
  CoachReason: compiled.validateCoachReason,
  CoachMessage: compiled.validateCoachMessage,
  CoachMessageView: compiled.validateCoachMessageView,
  HeartsCandidate: compiled.validateHeartsCandidate,
  HeartsObservation: compiled.validateHeartsObservation,
  HeartsActorPacket: compiled.validateHeartsActorPacket,
  HeartsSessionView: compiled.validateHeartsSessionView,
  HeartsAnalysis: compiled.validateHeartsAnalysis,
  HeartsActorEvent: compiled.validateHeartsActorEvent,
  SpadesCandidate: compiled.validateSpadesCandidate,
  SpadesObservation: compiled.validateSpadesObservation,
  SpadesActorPacket: compiled.validateSpadesActorPacket,
  SpadesSessionView: compiled.validateSpadesSessionView,
  SpadesAnalysis: compiled.validateSpadesAnalysis,
  SpadesActorEvent: compiled.validateSpadesActorEvent,
  TokenReveal: compiled.validateTokenReveal,
  TokenCycle: compiled.validateTokenCycle,
  TokenCompetitor: compiled.validateTokenCompetitor,
  TokenObservation: compiled.validateTokenObservation,
  TokenCandidate: compiled.validateTokenCandidate,
  TokenActorPacket: compiled.validateTokenActorPacket,
  TokenSessionView: compiled.validateTokenSessionView,
  TokenAnalysis: compiled.validateTokenAnalysis,
  TokenActorEvent: compiled.validateTokenActorEvent,
  TokenPresentation: compiled.validateTokenPresentation,
  TrixAction: compiled.validateTrixAction,
  TrixPlay: compiled.validateTrixPlay,
  TrixTrick: compiled.validateTrixTrick,
  TrixDeclaration: compiled.validateTrixDeclaration,
  TrixRow: compiled.validateTrixRow,
  TrixLayoutPass: compiled.validateTrixLayoutPass,
  TrixLeadSource: compiled.validateTrixLeadSource,
  TrixRecipient: compiled.validateTrixRecipient,
  TrixLedgerEntry: compiled.validateTrixLedgerEntry,
  TrixWithheldBonus: compiled.validateTrixWithheldBonus,
  TrixScore: compiled.validateTrixScore,
  TrixTwoAnnouncements: compiled.validateTrixTwoAnnouncements,
  TrixObservation: compiled.validateTrixObservation,
  TrixActorPacket: compiled.validateTrixActorPacket,
  TrixSessionView: compiled.validateTrixSessionView,
  TrixPresentation: compiled.validateTrixPresentation,
  TrixAnalysis: compiled.validateTrixAnalysis,
  TrixActorEvent: compiled.validateTrixActorEvent,
  TrixAdvice: compiled.validateTrixAdvice,
  TrixReviewFrame: compiled.validateTrixReviewFrame,
  TrixLayoutTurn: compiled.validateTrixLayoutTurn,
  TrixLayoutHistory: compiled.validateTrixLayoutHistory,
  LocalServiceWorkRetryRequest: compiled.validateLocalServiceWorkRetryRequest,
  LocalServiceEmptyRequest: compiled.validateLocalServiceEmptyRequest,
  LocalServiceSelector: compiled.validateLocalServiceSelector,
  LocalServiceNode: compiled.validateLocalServiceNode,
  LocalServiceControl: compiled.validateLocalServiceControl,
  LocalServiceSession: compiled.validateLocalServiceSession,
  LocalServiceSessionView: compiled.validateLocalServiceSessionView,
  LocalServiceNewSessionRequest: compiled.validateLocalServiceNewSessionRequest,
  LocalServiceControlRequest: compiled.validateLocalServiceControlRequest,
  LocalControlView: compiled.validateLocalControlView,
  LocalServiceActionRequest: compiled.validateLocalServiceActionRequest,
  LocalServicePrepareRequest: compiled.validateLocalServicePrepareRequest,
  LocalServicePrepareView: compiled.validateLocalServicePrepareView,
  LocalServiceAdvanceRequest: compiled.validateLocalServiceAdvanceRequest,
  LocalServiceNextHandRequest: compiled.validateLocalServiceNextHandRequest,
  LocalServiceCommandReceipt: compiled.validateLocalServiceCommandReceipt,
  LocalServiceDecisionView: compiled.validateLocalServiceDecisionView,
  LocalServiceHealthView: compiled.validateLocalServiceHealthView,
  LocalServiceReconcileRequest: compiled.validateLocalServiceReconcileRequest,
  LocalServiceRecoveredReceipt: compiled.validateLocalServiceRecoveredReceipt,
  LocalServiceAccessRequest: compiled.validateLocalServiceAccessRequest,
  LocalServiceTrialRequest: compiled.validateLocalServiceTrialRequest,
  LocalServiceTrialReceipt: compiled.validateLocalServiceTrialReceipt,
  LocalServiceUnlockRequest: compiled.validateLocalServiceUnlockRequest,
  LocalServiceUnlockReceipt: compiled.validateLocalServiceUnlockReceipt,
  PlatformAllowanceView: compiled.validatePlatformAllowanceView,
  PlatformAccessView: compiled.validatePlatformAccessView,
  PlatformReviewAccessView: compiled.validatePlatformReviewAccessView,
  PlatformCompetition: compiled.validatePlatformCompetition,
  PlatformController: compiled.validatePlatformController,
  PlatformCatalogEntry: compiled.validatePlatformCatalogEntry,
  PlatformSession: compiled.validatePlatformSession,
  PlatformSessionView: compiled.validatePlatformSessionView,
  PlatformReconcileRequest: compiled.validatePlatformReconcileRequest,
  PlatformRecoveredReceipt: compiled.validatePlatformRecoveredReceipt,
  PlatformReconcileView: compiled.validatePlatformReconcileView,
  CatalogMode: compiled.validateCatalogMode,
  TrixCompletedRound: compiled.validateTrixCompletedRound,
  TrixRoundIndex: compiled.validateTrixRoundIndex,
  TrixRoundHistory: compiled.validateTrixRoundHistory,
  PlatformPreferencesView: compiled.validatePlatformPreferencesView,
  PlatformPreferencesRequest: compiled.validatePlatformPreferencesRequest,
  PlatformAccountAvailability: compiled.validatePlatformAccountAvailability,
  PlatformAccountView: compiled.validatePlatformAccountView,
  PlatformExportDecision: compiled.validatePlatformExportDecision,
  PlatformExportView: compiled.validatePlatformExportView,
  PlatformFixtureAccountView: compiled.validatePlatformFixtureAccountView,
  PlatformFamilyCommand: compiled.validatePlatformFamilyCommand,
  PlatformAdviceRequest: compiled.validatePlatformAdviceRequest,
  PlatformNotesRequest: compiled.validatePlatformNotesRequest,
  PlatformReviewTrialRequest: compiled.validatePlatformReviewTrialRequest,
  PlatformReviewExposureRequest: compiled.validatePlatformReviewExposureRequest,
  PlatformReviewStatus: compiled.validatePlatformReviewStatus,
  PlatformAdviceView: compiled.validatePlatformAdviceView,
  CoachUIProvider: compiled.validateCoachUIProvider,
  CoachUIAccess: compiled.validateCoachUIAccess,
  CoachUIFeedback: compiled.validateCoachUIFeedback,
  CoachUIRatingPreview: compiled.validateCoachUIRatingPreview,
  CoachUIItem: compiled.validateCoachUIItem,
  CoachUISessionSummary: compiled.validateCoachUISessionSummary,
  CoachUISession: compiled.validateCoachUISession,
  CoachUIStatusView: compiled.validateCoachUIStatusView,
  CoachUISessionView: compiled.validateCoachUISessionView,
  CoachUIStartRequest: compiled.validateCoachUIStartRequest,
  CoachUIItemRequest: compiled.validateCoachUIItemRequest,
  CoachUIFeedbackRequest: compiled.validateCoachUIFeedbackRequest,
  CoachUIFeedbackView: compiled.validateCoachUIFeedbackView,
  CoachUIReplayView: compiled.validateCoachUIReplayView,
  RealtimePlaybackRequest: compiled.validateRealtimePlaybackRequest,
  RealtimePlaybackView: compiled.validateRealtimePlaybackView,
  RealtimeNegotiateView: compiled.validateRealtimeNegotiateView,
  RealtimeSnapshotRequest: compiled.validateRealtimeSnapshotRequest,
  RealtimeSnapshot: compiled.validateRealtimeSnapshot,
  RealtimeMessage: compiled.validateRealtimeMessage,
  RealtimePresenceRequest: compiled.validateRealtimePresenceRequest,
};
export function contractValidator<N extends ContractName>(name: N): ValidateFunction<ContractTypes[N]> {
  return validators[name];
}
export function validateContract<N extends ContractName>(name: N, value: unknown): value is ContractTypes[N] {
  return contractValidator(name)(value);
}
export function assertContract<N extends ContractName>(name: N, value: unknown): asserts value is ContractTypes[N] {
  if (!validateContract(name, value)) throw new TypeError('Invalid ' + name);
}
export const validateMode = contractValidator('Mode');
export const validateSeat = contractValidator('Seat');
export const validateCard = contractValidator('Card');
export const validateSuit = contractValidator('Suit');
export const validatePhase = contractValidator('Phase');
export const validateGameAction = contractValidator('GameAction');
export const validatePlay = contractValidator('Play');
export const validateTrick = contractValidator('Trick');
export const validateHandResult = contractValidator('HandResult');
export const validateGameView = contractValidator('GameView');
export const validatePreferences = contractValidator('Preferences');
export const validatePlan = contractValidator('Plan');
export const validatePaidPlan = contractValidator('PaidPlan');
export const validateCoachAccess = contractValidator('CoachAccess');
export const validateSessionStats = contractValidator('SessionStats');
export const validateSessionView = contractValidator('SessionView');
export const validateAdviceView = contractValidator('AdviceView');
export const validateCommandEnvelope = contractValidator('CommandEnvelope');
export const validateNewSessionRequest = contractValidator('NewSessionRequest');
export const validateActionsRequest = contractValidator('ActionsRequest');
export const validatePrepareRequest = contractValidator('PrepareRequest');
export const validateCommandStatusView = contractValidator('CommandStatusView');
export const validateIdentityView = contractValidator('IdentityView');
export const validatePrepareView = contractValidator('PrepareView');
export const validateAdvanceRequest = contractValidator('AdvanceRequest');
export const validateNextHandRequest = contractValidator('NextHandRequest');
export const validateAdviceRequest = contractValidator('AdviceRequest');
export const validatePreferencesRequest = contractValidator('PreferencesRequest');
export const validateHandUnlockRequest = contractValidator('HandUnlockRequest');
export const validateHandUnlockView = contractValidator('HandUnlockView');
export const validateExposureRequest = contractValidator('ExposureRequest');
export const validateAcceptedView = contractValidator('AcceptedView');
export const validateReviewFrame = contractValidator('ReviewFrame');
export const validateReviewCase = contractValidator('ReviewCase');
export const validateReviewIndex = contractValidator('ReviewIndex');
export const validateReviewView = contractValidator('ReviewView');
export const validateTrialRequest = contractValidator('TrialRequest');
export const validateReviewTrial = contractValidator('ReviewTrial');
export const validateRecapView = contractValidator('RecapView');
export const validateSubscriptionView = contractValidator('SubscriptionView');
export const validateOfferView = contractValidator('OfferView');
export const validateAccountView = contractValidator('AccountView');
export const validateAccountCommand = contractValidator('AccountCommand');
export const validateApiError = contractValidator('ApiError');
export const validateReviewQuery = contractValidator('ReviewQuery');
export const validateReviewStepQuery = contractValidator('ReviewStepQuery');
export const validateAccessQuery = contractValidator('AccessQuery');
export const validateSuitMemory = contractValidator('SuitMemory');
export const validateNotesView = contractValidator('NotesView');
export const validateBillingPreviewRequest = contractValidator('BillingPreviewRequest');
export const validateBillingPreview = contractValidator('BillingPreview');
export const validateBillingConfirmRequest = contractValidator('BillingConfirmRequest');
export const validateBillingOperation = contractValidator('BillingOperation');
export const validateFamilyMember = contractValidator('FamilyMember');
export const validateFamilyInvitation = contractValidator('FamilyInvitation');
export const validateFamilyView = contractValidator('FamilyView');
export const validateFamilyCommand = contractValidator('FamilyCommand');
export const validateAccountDeleteRequest = contractValidator('AccountDeleteRequest');
export const validateAccountDeleteView = contractValidator('AccountDeleteView');
export const validateExportView = contractValidator('ExportView');
export const validateScenarioId = contractValidator('ScenarioId');
export const validateDevScenarioView = contractValidator('DevScenarioView');
export const validateDevScenariosView = contractValidator('DevScenariosView');
export const validateVersionedComponent = contractValidator('VersionedComponent');
export const validateModulePin = contractValidator('ModulePin');
export const validateCoachedUnit = contractValidator('CoachedUnit');
export const validateReasoningObjective = contractValidator('ReasoningObjective');
export const validateReasoningHorizon = contractValidator('ReasoningHorizon');
export const validateReasoningEstimate = contractValidator('ReasoningEstimate');
export const validateReasoningScenario = contractValidator('ReasoningScenario');
export const validateReasoningFact = contractValidator('ReasoningFact');
export const validateRegisteredActorPacket = contractValidator('RegisteredActorPacket');
export const validateRegisteredSessionView = contractValidator('RegisteredSessionView');
export const validateRegisteredAnalysis = contractValidator('RegisteredAnalysis');
export const validateRegisteredActorEvent = contractValidator('RegisteredActorEvent');
export const validateRegisteredTarget = contractValidator('RegisteredTarget');
export const validateRegisteredSelector = contractValidator('RegisteredSelector');
export const validateV2ActionsRequest = contractValidator('V2ActionsRequest');
export const validateVersionedActionsRequest = contractValidator('VersionedActionsRequest');
export const validateV2NewSessionRequest = contractValidator('V2NewSessionRequest');
export const validateVersionedNewSessionRequest = contractValidator('VersionedNewSessionRequest');
export const validateDemoFrameRequest = contractValidator('DemoFrameRequest');
export const validateDemoFrame = contractValidator('DemoFrame');
export const validateAccessAllowance = contractValidator('AccessAllowance');
export const validateAccessOffer = contractValidator('AccessOffer');
export const validateAccessOfferPolicy = contractValidator('AccessOfferPolicy');
export const validateAccessDecision = contractValidator('AccessDecision');
export const validateRegisteredPresentation = contractValidator('RegisteredPresentation');
export const validateRegisteredAdvice = contractValidator('RegisteredAdvice');
export const validateCoachSupport = contractValidator('CoachSupport');
export const validateCoachReason = contractValidator('CoachReason');
export const validateCoachMessage = contractValidator('CoachMessage');
export const validateCoachMessageView = contractValidator('CoachMessageView');
export const validateHeartsCandidate = contractValidator('HeartsCandidate');
export const validateHeartsObservation = contractValidator('HeartsObservation');
export const validateHeartsActorPacket = contractValidator('HeartsActorPacket');
export const validateHeartsSessionView = contractValidator('HeartsSessionView');
export const validateHeartsAnalysis = contractValidator('HeartsAnalysis');
export const validateHeartsActorEvent = contractValidator('HeartsActorEvent');
export const validateSpadesCandidate = contractValidator('SpadesCandidate');
export const validateSpadesObservation = contractValidator('SpadesObservation');
export const validateSpadesActorPacket = contractValidator('SpadesActorPacket');
export const validateSpadesSessionView = contractValidator('SpadesSessionView');
export const validateSpadesAnalysis = contractValidator('SpadesAnalysis');
export const validateSpadesActorEvent = contractValidator('SpadesActorEvent');
export const validateTokenReveal = contractValidator('TokenReveal');
export const validateTokenCycle = contractValidator('TokenCycle');
export const validateTokenCompetitor = contractValidator('TokenCompetitor');
export const validateTokenObservation = contractValidator('TokenObservation');
export const validateTokenCandidate = contractValidator('TokenCandidate');
export const validateTokenActorPacket = contractValidator('TokenActorPacket');
export const validateTokenSessionView = contractValidator('TokenSessionView');
export const validateTokenAnalysis = contractValidator('TokenAnalysis');
export const validateTokenActorEvent = contractValidator('TokenActorEvent');
export const validateTokenPresentation = contractValidator('TokenPresentation');
export const validateTrixAction = contractValidator('TrixAction');
export const validateTrixPlay = contractValidator('TrixPlay');
export const validateTrixTrick = contractValidator('TrixTrick');
export const validateTrixDeclaration = contractValidator('TrixDeclaration');
export const validateTrixRow = contractValidator('TrixRow');
export const validateTrixLayoutPass = contractValidator('TrixLayoutPass');
export const validateTrixLeadSource = contractValidator('TrixLeadSource');
export const validateTrixRecipient = contractValidator('TrixRecipient');
export const validateTrixLedgerEntry = contractValidator('TrixLedgerEntry');
export const validateTrixWithheldBonus = contractValidator('TrixWithheldBonus');
export const validateTrixScore = contractValidator('TrixScore');
export const validateTrixTwoAnnouncements = contractValidator('TrixTwoAnnouncements');
export const validateTrixObservation = contractValidator('TrixObservation');
export const validateTrixActorPacket = contractValidator('TrixActorPacket');
export const validateTrixSessionView = contractValidator('TrixSessionView');
export const validateTrixPresentation = contractValidator('TrixPresentation');
export const validateTrixAnalysis = contractValidator('TrixAnalysis');
export const validateTrixActorEvent = contractValidator('TrixActorEvent');
export const validateTrixAdvice = contractValidator('TrixAdvice');
export const validateTrixReviewFrame = contractValidator('TrixReviewFrame');
export const validateTrixLayoutTurn = contractValidator('TrixLayoutTurn');
export const validateTrixLayoutHistory = contractValidator('TrixLayoutHistory');
export const validateLocalServiceWorkRetryRequest = contractValidator('LocalServiceWorkRetryRequest');
export const validateLocalServiceEmptyRequest = contractValidator('LocalServiceEmptyRequest');
export const validateLocalServiceSelector = contractValidator('LocalServiceSelector');
export const validateLocalServiceNode = contractValidator('LocalServiceNode');
export const validateLocalServiceControl = contractValidator('LocalServiceControl');
export const validateLocalServiceSession = contractValidator('LocalServiceSession');
export const validateLocalServiceSessionView = contractValidator('LocalServiceSessionView');
export const validateLocalServiceNewSessionRequest = contractValidator('LocalServiceNewSessionRequest');
export const validateLocalServiceControlRequest = contractValidator('LocalServiceControlRequest');
export const validateLocalControlView = contractValidator('LocalControlView');
export const validateLocalServiceActionRequest = contractValidator('LocalServiceActionRequest');
export const validateLocalServicePrepareRequest = contractValidator('LocalServicePrepareRequest');
export const validateLocalServicePrepareView = contractValidator('LocalServicePrepareView');
export const validateLocalServiceAdvanceRequest = contractValidator('LocalServiceAdvanceRequest');
export const validateLocalServiceNextHandRequest = contractValidator('LocalServiceNextHandRequest');
export const validateLocalServiceCommandReceipt = contractValidator('LocalServiceCommandReceipt');
export const validateLocalServiceDecisionView = contractValidator('LocalServiceDecisionView');
export const validateLocalServiceHealthView = contractValidator('LocalServiceHealthView');
export const validateLocalServiceReconcileRequest = contractValidator('LocalServiceReconcileRequest');
export const validateLocalServiceRecoveredReceipt = contractValidator('LocalServiceRecoveredReceipt');
export const validateLocalServiceAccessRequest = contractValidator('LocalServiceAccessRequest');
export const validateLocalServiceTrialRequest = contractValidator('LocalServiceTrialRequest');
export const validateLocalServiceTrialReceipt = contractValidator('LocalServiceTrialReceipt');
export const validateLocalServiceUnlockRequest = contractValidator('LocalServiceUnlockRequest');
export const validateLocalServiceUnlockReceipt = contractValidator('LocalServiceUnlockReceipt');
export const validatePlatformAllowanceView = contractValidator('PlatformAllowanceView');
export const validatePlatformAccessView = contractValidator('PlatformAccessView');
export const validatePlatformReviewAccessView = contractValidator('PlatformReviewAccessView');
export const validatePlatformCompetition = contractValidator('PlatformCompetition');
export const validatePlatformController = contractValidator('PlatformController');
export const validatePlatformCatalogEntry = contractValidator('PlatformCatalogEntry');
export const validatePlatformSession = contractValidator('PlatformSession');
export const validatePlatformSessionView = contractValidator('PlatformSessionView');
export const validatePlatformReconcileRequest = contractValidator('PlatformReconcileRequest');
export const validatePlatformRecoveredReceipt = contractValidator('PlatformRecoveredReceipt');
export const validatePlatformReconcileView = contractValidator('PlatformReconcileView');
export const validateCatalogMode = contractValidator('CatalogMode');
export const validateTrixCompletedRound = contractValidator('TrixCompletedRound');
export const validateTrixRoundIndex = contractValidator('TrixRoundIndex');
export const validateTrixRoundHistory = contractValidator('TrixRoundHistory');
export const validatePlatformPreferencesView = contractValidator('PlatformPreferencesView');
export const validatePlatformPreferencesRequest = contractValidator('PlatformPreferencesRequest');
export const validatePlatformAccountAvailability = contractValidator('PlatformAccountAvailability');
export const validatePlatformAccountView = contractValidator('PlatformAccountView');
export const validatePlatformExportDecision = contractValidator('PlatformExportDecision');
export const validatePlatformExportView = contractValidator('PlatformExportView');
export const validatePlatformFixtureAccountView = contractValidator('PlatformFixtureAccountView');
export const validatePlatformFamilyCommand = contractValidator('PlatformFamilyCommand');
export const validatePlatformAdviceRequest = contractValidator('PlatformAdviceRequest');
export const validatePlatformNotesRequest = contractValidator('PlatformNotesRequest');
export const validatePlatformReviewTrialRequest = contractValidator('PlatformReviewTrialRequest');
export const validatePlatformReviewExposureRequest = contractValidator('PlatformReviewExposureRequest');
export const validatePlatformReviewStatus = contractValidator('PlatformReviewStatus');
export const validatePlatformAdviceView = contractValidator('PlatformAdviceView');
export const validateCoachUIProvider = contractValidator('CoachUIProvider');
export const validateCoachUIAccess = contractValidator('CoachUIAccess');
export const validateCoachUIFeedback = contractValidator('CoachUIFeedback');
export const validateCoachUIRatingPreview = contractValidator('CoachUIRatingPreview');
export const validateCoachUIItem = contractValidator('CoachUIItem');
export const validateCoachUISessionSummary = contractValidator('CoachUISessionSummary');
export const validateCoachUISession = contractValidator('CoachUISession');
export const validateCoachUIStatusView = contractValidator('CoachUIStatusView');
export const validateCoachUISessionView = contractValidator('CoachUISessionView');
export const validateCoachUIStartRequest = contractValidator('CoachUIStartRequest');
export const validateCoachUIItemRequest = contractValidator('CoachUIItemRequest');
export const validateCoachUIFeedbackRequest = contractValidator('CoachUIFeedbackRequest');
export const validateCoachUIFeedbackView = contractValidator('CoachUIFeedbackView');
export const validateCoachUIReplayView = contractValidator('CoachUIReplayView');
export const validateRealtimePlaybackRequest = contractValidator('RealtimePlaybackRequest');
export const validateRealtimePlaybackView = contractValidator('RealtimePlaybackView');
export const validateRealtimeNegotiateView = contractValidator('RealtimeNegotiateView');
export const validateRealtimeSnapshotRequest = contractValidator('RealtimeSnapshotRequest');
export const validateRealtimeSnapshot = contractValidator('RealtimeSnapshot');
export const validateRealtimeMessage = contractValidator('RealtimeMessage');
export const validateRealtimePresenceRequest = contractValidator('RealtimePresenceRequest');
