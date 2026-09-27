import type { ApiError } from '../../shared/contracts.ts';
export class ApiFailure extends Error {
  readonly status: number;
  readonly code: ApiError['code'];
  constructor(status: number, code: ApiError['code'], message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function invalid(message: string): never {
  throw new ApiFailure(400, 'INVALID_COMMAND', message);
}
