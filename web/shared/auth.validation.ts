/* Generated from auth.schema.json. Do not edit; run npm run contracts:auth:generate. */
import validate from './auth.validators.mjs';
import type { AuthStatusView } from './auth.contracts.ts';
export function validateAuthStatus(value: unknown): value is AuthStatusView {
  return validate(value);
}
