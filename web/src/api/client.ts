import type { ContractName, ContractTypes } from '../../shared/local-service.contracts';
import { validateContract } from '../../shared/local-service.validation.ts';
import { clearPendingCommands } from './pendingCommands.ts';
import { clearLeases } from './controlLease.ts';
import { authEpoch, invalidateAuth, renewAuthAccess, noteAcceptedAuthActivity } from './authLifecycle.ts';
import { apiCredentials, apiUrl, authCsrf } from '../auth/transport.ts';

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
  readonly retryAfterMs?: number;
  constructor(
    message: string,
    status: number,
    code: string,
    current?: ContractTypes['SessionView'],
    retryAfterMs?: number,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.current = current;
    this.retryAfterMs = retryAfterMs;
  }
}
/** These transport outcomes require receipt recovery, even when HTTP is <500. */
export function definiteFailure(error: unknown): error is ApiFailure {
  return error instanceof ApiFailure && error.status < 500 &&
    error.status !== 408 && error.status !== 429;
}
export async function api<N extends ContractName>(
  path: string,
  type: N,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
  signal?: AbortSignal,
  timeoutMs = API_REQUEST_TIMEOUT_MS,
): Promise<ContractTypes[N]> {
  if (path === '/api/logout') { clearPendingCommands(); clearLeases(); invalidateAuth(); }
  const requestEpoch = authEpoch();
  const serializedBody = body === undefined ? undefined : JSON.stringify(body);
  const playbackStop=path==='/api/session/playback' && typeof body==='object' && body!==null && 'running' in body && body.running!==true;
  const passive=method==='GET' || method==='HEAD' || path.startsWith('/api/realtime/') || path.startsWith('/api/work/') || playbackStop ||
    ['/api/session/presence','/api/platform/exposures','/api/session/advance'].includes(path);
  const assertCurrent = () => {
    if (requestEpoch !== authEpoch())
      throw new ApiFailure('The signed-in session changed. Reconnect before continuing.', 401, 'UNAUTHENTICATED');
  };
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
    let response: Response;
    for (let attempt=0;;attempt++) {
    response = await Promise.race([
      fetch(apiUrl(path), {
        method,
        credentials: apiCredentials(),
        signal: controller.signal,
        headers: {
          'x-tricks-tab': tabId(),
          ...(method !== 'GET' && method !== 'HEAD' && authCsrf() ? {'X-CSRF-Token': authCsrf()!} : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'x-tricks-client': '1' }),
        },
        ...(body === undefined ? {} : { body: serializedBody }),
      }),
      interrupted,
    ]);
    assertCurrent();
    if (response.status !== 401) break;
    let failure:unknown;
    try { failure=await Promise.race([response.json(),interrupted]); } catch { /* An empty 401 remains terminal. */ }
    const renewable=typeof failure==='object' && failure!==null && 'code' in failure && failure.code==='session_renewal_required';
    if(renewable && attempt===0 && !passive && await Promise.race([renewAuthAccess(),interrupted])) {
      assertCurrent();
      if(controller.signal.aborted)throw controller.signal.reason;
      continue;
    }
    if(renewable)throw new ApiFailure('Continue to renew your session before returning to your table.',401,'session_renewal_required');
    clearPendingCommands(); clearLeases(); invalidateAuth();
    throw new ApiFailure('The signed-in session ended. Reconnect before continuing.', 401, 'UNAUTHENTICATED');
    }
    const value: unknown = await Promise.race([response.json(), interrupted]);
    assertCurrent();
    if (!response.ok) {
      const retryAfter = response.headers?.get('Retry-After');
      const retryAfterValue = retryAfter === null || retryAfter === undefined ? NaN :
        /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 :
          Date.parse(retryAfter) - Date.now();
      const retryAfterMs = Number.isFinite(retryAfterValue) ? Math.max(0,retryAfterValue) : undefined;
      if (validateContract('ApiError', value)) {
        throw new ApiFailure(value.message, response.status, value.code, value.current, retryAfterMs);
      }
      throw new ApiFailure(
        'The service could not complete this request.',
        response.status,
        'SERVICE_UNAVAILABLE',
        undefined,
        retryAfterMs,
      );
    }
    if (!validateContract(type, value))
      throw new ApiFailure(
        'The server returned an unsupported response. Reconnect or retry the same request.',
        502,
        'INVALID_RESPONSE',
      );
    if (type === 'AccountDeleteView' && (path === '/api/platform/account/delete' || path === '/api/account/delete')) {
      clearPendingCommands(); clearLeases(); invalidateAuth();
    }
    if(method!=='GET' && !passive)noteAcceptedAuthActivity();
    return value;
  } catch (error) {
    if (timeoutError) throw timeoutError;
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
