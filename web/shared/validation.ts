/* Generated from contracts.schema.json. Do not edit; run npm run contracts:generate. */
import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from './contracts.schema.json' with { type: 'json' };
import type { ValidateFunction } from 'ajv';
import type { ContractName, ContractTypes } from './contracts.ts';
const ajv = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, removeAdditional: false, useDefaults: false });
ajv.addSchema(schema);
const validators = new Map<ContractName, ValidateFunction>();
export function contractValidator<N extends ContractName>(name: N): ValidateFunction<ContractTypes[N]> {
  let validator = validators.get(name);
  if (!validator) {
    validator = ajv.getSchema(schema.$id + '#/$defs/' + name);
    if (!validator) throw new Error('Unknown contract: ' + name);
    validators.set(name, validator);
  }
  return validator as ValidateFunction<ContractTypes[N]>;
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
