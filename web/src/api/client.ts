import type { ContractName, ContractTypes } from '../../shared/contracts';
import { validateContract } from '../../shared/validation';

let volatileTab = '';
export function tabId(): string {
  if (!volatileTab) {
    try { volatileTab = sessionStorage.getItem('tricks-tab') || crypto.randomUUID(); sessionStorage.setItem('tricks-tab', volatileTab); }
    catch { volatileTab = crypto.randomUUID(); }
  }
  return volatileTab;
}
export class ApiFailure extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string, public readonly current?: ContractTypes['SessionView']) { super(message); }
}
export async function api<N extends ContractName>(path: string, type: N, body?: unknown, method = body === undefined ? 'GET' : 'POST', signal?: AbortSignal): Promise<ContractTypes[N]> {
  const response = await fetch(path, { method, credentials: 'same-origin', signal, headers: { 'x-tricks-tab': tabId(), ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'x-tricks-client': '1' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value: unknown = await response.json();
  if (!response.ok) {
    if (validateContract('ApiError', value)) throw new ApiFailure(value.message, response.status, value.code, value.current);
    throw new ApiFailure('The service could not complete this request.', response.status, 'SERVICE_UNAVAILABLE');
  }
  if (!validateContract(type, value)) throw new ApiFailure('The server returned an unsupported response. Your table is unchanged.', 502, 'INVALID_RESPONSE');
  return value;
}
