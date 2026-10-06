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
