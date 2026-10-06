import type { ContractName, ContractTypes } from '../../shared/contracts';
import { validateContract } from '../../shared/validation.ts';
import { clearPendingCommands } from './pendingCommands.ts';

export const API_REQUEST_TIMEOUT_MS = 15_000;

let volatileTab = '';
export function tabId(): string {
  if (!volatileTab) {
    try {
      volatileTab = sessionStorage.getItem('tricks-tab') || crypto.randomUUID();
      sessionStorage.setItem('tricks-tab', volatileTab);
    } catch {
      volatileTab = crypto.randomUUID();
    }
  }
  return volatileTab;
}
export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly current?: ContractTypes['SessionView'];
  constructor(
    message: string,
    status: number,
    code: string,
    current?: ContractTypes['SessionView'],
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.current = current;
  }
}
export async function api<N extends ContractName>(
  path: string,
  type: N,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
  signal?: AbortSignal,
  timeoutMs = API_REQUEST_TIMEOUT_MS,
): Promise<ContractTypes[N]> {
  if (path === '/api/logout') clearPendingCommands();
  const controller = new AbortController();
  let timeoutError: ApiFailure | undefined;
  let interrupt: (reason: unknown) => void = () => undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    interrupt = reject;
  });
  const onAbort = () => {
    controller.abort(signal?.reason);
    interrupt(signal?.reason ?? new DOMException('The request was aborted.', 'AbortError'));
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const timer = setTimeout(() => {
    timeoutError = new ApiFailure(
      body === undefined
        ? 'Connection timed out. Reconnect to try again.'
        : 'The request timed out. Its outcome is unconfirmed. Retry the same request.',
      503,
      'REQUEST_TIMEOUT',
    );
    controller.abort(timeoutError);
    interrupt(timeoutError);
  }, timeoutMs);
  try {
    const response = await Promise.race([
      fetch(path, {
        method,
        credentials: 'same-origin',
        signal: controller.signal,
        headers: {
          'x-tricks-tab': tabId(),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'x-tricks-client': '1' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      interrupted,
    ]);
    if (response.status === 401) clearPendingCommands();
    const value: unknown = await Promise.race([response.json(), interrupted]);
    if (!response.ok) {
      if (validateContract('ApiError', value)) {
        throw new ApiFailure(value.message, response.status, value.code, value.current);
      }
      throw new ApiFailure(
        'The service could not complete this request.',
        response.status,
        'SERVICE_UNAVAILABLE',
      );
    }
    if (!validateContract(type, value))
      throw new ApiFailure(
        'The server returned an unsupported response. Reconnect or retry the same request.',
        502,
        'INVALID_RESPONSE',
      );
    return value;
  } catch (error) {
    if (timeoutError) throw timeoutError;
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
