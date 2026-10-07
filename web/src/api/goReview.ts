import type { PlatformAdviceView, PlatformReviewAccessView, PlatformReviewStatus, ReviewTrial } from '../../shared/local-service.contracts.ts';
import { api, ApiFailure, definiteFailure } from './client.ts';
import { clearGoPending, executeGo, restoreGoPending, type GoPending } from './goPendingCommands.ts';

export function originalAdviceMode(access:PlatformReviewAccessView|null):'saved'|'new'|'unavailable' {
  if (access?.savedAdviceLevels.includes(3)) return 'saved';
  return access?.advice.allowed ? 'new' : 'unavailable';
}

export async function loadOriginalAdvice(access:PlatformReviewAccessView|null, decisionId:string,
  publish:()=>Promise<PlatformAdviceView>):Promise<PlatformAdviceView> {
  const mode=originalAdviceMode(access);
  if (mode==='saved') return api(`/api/platform/reviews/${encodeURIComponent(decisionId)}/advice`,'PlatformAdviceView');
  if (mode==='new') return publish();
  throw new Error('Coaching is unavailable for this original hand.');
}

export async function goTrial(pending:GoPending, retry:boolean, signal?:AbortSignal):Promise<ReviewTrial> {
  try { return await runTrial(pending,retry,signal); }
  catch (error) {
    if (definiteFailure(error)) clearGoPending('review');
    throw error;
  }
}

async function runTrial(pending:GoPending, retry:boolean, signal?:AbortSignal):Promise<ReviewTrial> {
  const commandId = String(pending.body.commandId);
  let status:PlatformReviewStatus;
  try { status = await api(`/api/platform/review-trials/${encodeURIComponent(commandId)}`, 'PlatformReviewStatus', undefined, 'GET', signal); }
  catch (error) {
    if (!(error instanceof ApiFailure) || error.status !== 404) throw error;
    status = await executeGo('review', pending.path, 'PlatformReviewStatus', await restoreGoPending(pending), pending.ownerId, pending.gameId);
  }
  if ((status.status === 'expired' || status.status === 'unavailable') && retry)
    status = await api(pending.path, 'PlatformReviewStatus', await restoreGoPending(pending), 'POST', signal);
  const deadline = Date.now() + 35_000;
  while (status.status === 'queued' || status.status === 'running') {
    if (signal?.aborted) throw signal.reason;
    if (Date.now() >= deadline) throw new Error('Continuation is still pending. Retry the same continuation to check it.');
    await new Promise<void>((resolve,reject)=>{
      const aborted=()=>{clearTimeout(timer);reject(signal?.reason);};
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',aborted);resolve();},150);
      signal?.addEventListener('abort',aborted,{once:true});
    });
    status = await api(`/api/platform/review-trials/${encodeURIComponent(commandId)}`, 'PlatformReviewStatus', undefined, 'GET', signal);
  }
  if (status.status !== 'completed' || !status.result)
    throw new Error('Continuation stopped. Retry the same continuation when ready.');
  clearGoPending('review');
  return status.result;
}
