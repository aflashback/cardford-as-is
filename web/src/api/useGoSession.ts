import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdviceView, CommandEnvelope, ContractName, ContractTypes, GameAction,
  LocalServicePrepareView, Mode, NewSessionRequest, PlatformSessionView, Preferences, RealtimePlaybackRequest, RealtimePlaybackView, TrixAdvice } from '../../shared/local-service.contracts.ts';
import { validateContract } from '../../shared/local-service.validation.ts';
import { api, ApiFailure } from './client.ts';
import { clearLeases, readLease, retainLease } from './controlLease.ts';
import { clearPendingCommands } from './pendingCommands.ts';
import { clearGoPending, executeGo, readGoPending, recoverGoPending, restoreGoPending } from './goPendingCommands.ts';
import { presentation, resolveCandidate } from './presentation.ts';
import type { ClientSession, ClientTrixSession } from './sessionModel.ts';
import { bindTrixPresentation } from '../games/trix/adapter.ts';
import { RealtimeStream } from './realtimeStream.ts';
import { onAuthInvalidated, onAuthAccessSuspended } from './authLifecycle.ts';
import { PresentationQueue } from './presentationQueue.ts';
import {retainStopIntent,readStopIntent,clearStopIntent} from './stopIntent.ts';
import type {PauseReason} from '../table/sessionLifecycle.ts';
import { authMode } from '../auth/transport.ts';
import { authSession } from '../auth/session.ts';

async function delay(ms: number, signal?: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, {once:true});
  });
}
export function useGoSession() {
  const [session, setSession] = useState<ClientSession|null>(null);
  const [trixSession, setTrixSession] = useState<ClientTrixSession|null>(null);
  const [catalog, setCatalog] = useState<PlatformSessionView['catalog']>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [playbackRunning, setPlaybackRunning] = useState(false);
  const [presentationHeld, setPresentationHeld] = useState(false);
  const [playbackInterrupted, setPlaybackInterrupted] = useState(false);
  const [interruptionReason,setInterruptionReason]=useState<PauseReason>('reopened');
  const [streamStatus, setStreamStatus] = useState<'live'|'http'|'recovering'|'suspended'|'retry'>('recovering');
  const [lifecycle,setLifecycle] = useState<(RealtimePlaybackView&{receivedAt:number})|null>(null);
  const wire = useRef<PlatformSessionView|null>(null);
  const current = useRef<ClientSession|ClientTrixSession|null>(null);
  const displayed = useRef<ClientSession|ClientTrixSession|null>(null);
  const playback = useRef<RealtimePlaybackView>({running:false,generation:0});
  const playbackGame = useRef<string|null>(null);
  const requestedRunning = useRef<boolean|null>(null);
  const presentationPaused = useRef(false);
  const realtime = useRef<RealtimeStream|null>(null);
  const works = useRef(new Map<string, LocalServicePrepareView>());
  const workListeners = useRef(new Set<() => void>());
  const workSerial = useRef(0);
  const owner = useRef<string|null>(null);
  const controlOwned = useRef<{gameId:string; generation:number; owned:boolean}|null>(null);
  const generation = useRef(0);
  const ownerGeneration = useRef(0);
  const inFlight = useRef(false);
  const playbackRequest = useRef<Promise<boolean>|null>(null);
  const playbackIntent=useRef<{gameId:string;intent:'resume'|'pause'|'hold'|'release_hold';reason:PauseReason;epoch:number}>({gameId:'',intent:'pause',reason:'reopened',epoch:0});
  const eligibilityEpoch=useRef(0),foregroundEligible=useRef(!document.hidden);
  const presenceTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const presenceRequest=useRef<AbortController|null>(null);
  const presenceSequence=useRef({gameId:'',generation:-1,sequence:0});
  const reconcileStop=useRef<(()=>Promise<boolean>)|null>(null);
  const preparing = useRef(false);
  const boot = useRef<Promise<unknown>|null>(null);
  const disposal = useRef<ReturnType<typeof setTimeout>|null>(null);
  const disposed = useRef(false);
  const prepared = useRef(new Map<string, LocalServicePrepareView>());
  const failedPreparation = useRef<{gameId:string; revision:number; workIds:string[]}|null>(null);
  const preparationRequests=useRef(new Set<AbortController>());
  const show = useCallback((model:ClientSession|ClientTrixSession|null) => {
    displayed.current = model;
    if (model && 'gameId' in model.game) {setTrixSession(model as ClientTrixSession);setSession(null);}
    else {setSession(model as ClientSession|null);setTrixSession(null);}
  }, []);
  const presentationQueue = useRef<PresentationQueue | null>(null);
  presentationQueue.current ??= new PresentationQueue(show, undefined, setPresentationHeld);
  const notePresented = useCallback((revision: number) => presentationQueue.current?.notePresented(revision), []);
  const updatePlayback = useCallback((value:RealtimePlaybackView, gameId:string|null) => {
    const sameGame=playbackGame.current===gameId;
    if (playbackGame.current !== gameId) {
      playbackGame.current = gameId;
      playback.current = {running:false,generation:0};
      requestedRunning.current = null;
      setPlaybackInterrupted(false);
      playbackIntent.current={gameId:gameId??'',intent:'pause',reason:'reopened',epoch:playbackIntent.current.epoch+1};
      presentationPaused.current=true;
    }
    if (value.generation < playback.current.generation) return;
    const heldExpired=playback.current.phase==='held'&&value.phase==='paused'&&playbackIntent.current.intent!=='pause';
    if (value.phase!=='completed'&&(heldExpired||(playback.current.running && !value.running && requestedRunning.current !== false))) {
      setInterruptionReason(value.pauseReason??'lease_expired');
      setPlaybackInterrupted(true);
      setError('Play stopped on the server. Reconnect, then resume when ready.');
    }
    playback.current = value;
    // The receipt clock belongs to the retained session, so transient dialogs
    // cannot grant more displayed retention by unmounting and reopening.
    setLifecycle(previous=>({...value,receivedAt:sameGame&&previous?.generation===value.generation&&
      previous.serverNow===value.serverNow&&previous.expiresAt===value.expiresAt?previous.receivedAt:performance.now()}));
    realtime.current?.notePlayback(value.running);
    if(!value.running || playbackIntent.current.intent==='pause')realtime.current?.setPaused(true);
    setPlaybackRunning(value.running);
    presentationQueue.current?.setRunning(value.running && !presentationPaused.current);
  }, []);
  const noteWork = useCallback((work:LocalServicePrepareView) => {
    const previous = works.current.get(work.workId);
    if (previous && ['completed','rejected','canceled'].includes(previous.status) &&
        !['completed','rejected','canceled'].includes(work.status)) return;
    works.current.set(work.workId, work);
    if (works.current.size > 32) works.current.delete(works.current.keys().next().value!);
    workSerial.current++;
    for (const listener of workListeners.current) listener();
  }, []);
  const invalidateOwner = useCallback((playerId?: string) => {
    generation.current++; ownerGeneration.current++;
    clearPendingCommands(); clearLeases(); prepared.current.clear();
    for(const request of preparationRequests.current)request.abort();preparationRequests.current.clear();
    realtime.current?.close(); realtime.current = null;
    setStreamStatus('recovering');
    presentationQueue.current?.reset(null); works.current.clear();
    wire.current = null; current.current = null; setCatalog([]);
    controlOwned.current = null;
    playback.current = {running:false,generation:0}; setPlaybackRunning(false);
    playbackGame.current = null;
    requestedRunning.current = null; setPlaybackInterrupted(true);
    failedPreparation.current = null;
    owner.current = playerId ?? null;
    setError('The signed-in player changed. Reconnect before continuing.');
  }, [show]);
  const verifyOwner = useCallback(async () => {
    const identity = await api('/api/identity', 'IdentityView');
    if (owner.current && identity.playerId !== owner.current) {
      invalidateOwner(identity.playerId);
      throw new ApiFailure('The signed-in player changed. Reconnect before continuing.', 401, 'UNAUTHENTICATED');
    }
    owner.current = identity.playerId;
    return identity.playerId;
  }, [invalidateOwner]);
  const accept = useCallback(async (value: PlatformSessionView, requestGeneration:number,
    _immediate = false, source:'snapshot'|'shared' = 'snapshot') => {
    const s = value.session;
    if (owner.current && value.playerId !== owner.current) {
      invalidateOwner(value.playerId);
      throw new ApiFailure('The signed-in player changed. Reconnect before continuing.', 401, 'UNAUTHENTICATED');
    }
    const lease = s ? await readLease(value.playerId, s.gameId) : null;
    if (requestGeneration !== generation.current) return current.current;
    if (owner.current !== value.playerId) return current.current;
    if (s) {
      if (source === 'snapshot') controlOwned.current = {
        gameId:s.gameId, generation:s.control.controlGeneration, owned:s.control.owned,
      };
      else if (controlOwned.current?.gameId !== s.gameId ||
          controlOwned.current.generation !== s.control.controlGeneration)
        controlOwned.current = {gameId:s.gameId,generation:s.control.controlGeneration,owned:false};
    } else controlOwned.current = null;
    const isTrix = s?.view.gameId === 'trix' && 'gameId' in s.presentation && s.presentation.gameId === 'trix';
    const game = s ? isTrix && s.view.gameId === 'trix' && 'gameId' in s.presentation && s.presentation.gameId === 'trix'
      ? bindTrixPresentation(s.presentation,s.gameId,s.view.variantId,s.view.seat,s.view.phase,s.view.table)
      : presentation(s.view, s.presentation, s.actor, s.gameId) : null;
    if (isTrix && s?.actor && (s.actor.gameId !== 'trix' || s.actor.variantId !== s.view.variantId || s.actor.seat !== 0 || s.actor.phase !== s.view.phase || ('gameId' in s.presentation && JSON.stringify(s.actor.observation)!==JSON.stringify(s.presentation.observation))))
      throw new Error('The Trix decision does not match its table.');
    const common = s ? {revision:s.revision,
      decisionId:s.decisionId, preferences:value.preferences.preferences,
      access:{canPlay:s.playable && s.access.play.allowed, canCoach:s.access.coach.allowed,
        remainingHands:s.access.allowance.kind === 'unlimited' ? null : s.access.allowance.remaining ?? 0,
        resetsAt:s.access.allowance.resetsAt, handUnlocked:s.access.handUnlocked,
        canStartWork:s.access.canStartWork, localMock:s.access.localMock},
      source:'code' as const, controlLeaseToken:controlOwned.current?.owned &&
        lease?.generation === s.control.controlGeneration ? lease.token : 'view-only',
      stats:s.stats,
    } : null;
    const model:ClientSession|ClientTrixSession|null = common && game ? 'gameId' in game && game.gameId === 'trix'
      ? {...common,game,candidates:s?.actor?.gameId === 'trix' ? s.actor.candidates : [],node:s!.node}
      : {...common,game:game as ClientSession['game']} : null;
    if (current.current?.game.id !== model?.game.id || current.current?.revision !== model?.revision)
      prepared.current.clear();
    wire.current = value; current.current = model; setCatalog(value.catalog);
    const sensitiveChange = !model || displayed.current?.game.id !== model.game.id ||
      displayed.current?.controlLeaseToken !== model.controlLeaseToken ||
      displayed.current?.access.canPlay !== model.access.canPlay ||
      displayed.current?.access.canCoach !== model.access.canCoach;
    // Recovery/receipt snapshots update authority above, but cannot replace a
    // painted completion barrier. Security and game identity changes still reset.
    if (!model) presentationQueue.current?.reset(null);
    else presentationQueue.current?.accept(model, sensitiveChange || !displayed.current);
    return model;
  }, [invalidateOwner, show]);
  const read = useCallback(async () => {
    if (realtime.current) {
      await realtime.current.recover();
      return current.current;
    }
    const requestGeneration = ++generation.current;
    const value = await api('/api/platform/session', 'PlatformSessionView');
    return accept(value, requestGeneration, true);
  }, [accept]);
  const refresh = useCallback(async (): Promise<ClientSession|ClientTrixSession> => {
    const value = await read();
    if (!value) throw new Error('No active table. Open Account to check practice access.');
    return value;
  }, [read]);
  const applyReceipt = useCallback(async (value: unknown, gameId: string) => {
    let target = gameId;
    let controlGeneration:number|undefined;
    if (validateContract('LocalServiceCommandReceipt', value) && value.controlLeaseToken && value.controlGeneration !== undefined) {
      await retainLease(owner.current!, value.gameId, value.controlLeaseToken, value.controlGeneration);
      target = value.gameId;
      controlGeneration = value.controlGeneration;
    } else if (validateContract('LocalControlView', value)) {
      await retainLease(owner.current!, gameId, value.controlLeaseToken, value.controlGeneration);
      controlGeneration = value.controlGeneration;
    }
    if (controlGeneration !== undefined)
      controlOwned.current = {gameId:target,generation:controlGeneration,owned:true};
    if (wire.current?.session?.gameId === target &&
        wire.current.session.control.controlGeneration === controlGeneration &&
        (validateContract('LocalControlView', value) || validateContract('LocalServiceCommandReceipt', value)))
      await accept(wire.current, generation.current, true, 'shared');
  }, [accept]);
  const initialize = useCallback(async () => {
    const identity = authMode === 'keycloak'
      ? await api('/api/identity', 'IdentityView')
      : await api('/api/local/session', 'IdentityView', {});
    if (disposed.current) return;
    if (owner.current && owner.current !== identity.playerId) invalidateOwner(identity.playerId);
    owner.current = identity.playerId;
    const stream = new RealtimeStream({
      snapshot: async (value) => {
        setStreamStatus(stream.mode);
        updatePlayback(value.playback, value.view.session?.gameId ?? null);
        for (const work of value.works) noteWork(work);
        await accept(value.view, generation.current, true);
        const gameId=value.view.session?.gameId;
        if(gameId&&owner.current&&readStopIntent(owner.current,gameId)&&!playbackRequest.current)
          queueMicrotask(()=>{void reconcileStop.current?.();});
      },
      message: async (value) => {
        if (value.type === 'work.updated' && 'work' in value) noteWork(value.work);
        else if (value.type === 'session.view') {
          updatePlayback(value.playback, value.view.session?.gameId ?? null);
          await accept(value.view, generation.current, false, 'shared');
        } else if (value.type === 'control.changed' || value.type === 'access.changed') {
          generation.current++;
          presentationQueue.current?.reset(null);
          wire.current = null; current.current = null; setCatalog([]);
          controlOwned.current = null;
          queueMicrotask(() => { void realtime.current?.recoverAfterCurrent().catch((e) =>
            setError(e instanceof Error ? e.message : 'Could not recover the table.')); });
        }
      },
      disconnected: () => {
        setStreamStatus('recovering');
        if(current.current&&playbackIntent.current.intent!=='pause') {
          eligibilityEpoch.current++;
          presentationPaused.current=true;presentationQueue.current?.setRunning(false);
          setPlaybackInterrupted(true);
          setInterruptionReason('connection_lost');
          const gameId=current.current.game.id;
          playbackIntent.current={gameId,intent:'pause',reason:'connection_lost',epoch:playbackIntent.current.epoch+1};
          if(owner.current)retainStopIntent(owner.current,gameId,'connection_lost');
          queueMicrotask(()=>{void reconcileStop.current?.();});
        }
      },
      status:setStreamStatus,
    });
    realtime.current = stream;
    try { await stream.start(); }
    catch (error) {
      if (disposed.current || error instanceof ApiFailure && error.status === 401) throw error;
      await stream.recoverAfterCurrent();
    }
    if (disposed.current) { stream.close(); return; }
    const pending = readGoPending('session', identity.playerId);
    if (pending) {
      setError('A previous request has an unconfirmed outcome. Retry to check it before continuing.');
      return;
    }
    if (!wire.current?.session&&playback.current.phase!=='expired') {
      const choice = wire.current?.catalog.find(item => item.mode === 'spades-partners');
      if (!choice?.start.allowed) throw new Error('Practice is unavailable for this account. Open Account to check access.');
      const receipt = await executeGo('session', '/api/sessions', 'LocalServiceCommandReceipt', {
        commandId:crypto.randomUUID(), selector:choice.selector, expectedActiveGameId:null,
        expectedRevision:null, controlLeaseToken:null,
      }, identity.playerId, 'opening');
      await applyReceipt(receipt, receipt.gameId);
      await read();
    }
  }, [read, invalidateOwner, applyReceipt, accept, updatePlayback, noteWork]);
  useEffect(() => {
    disposed.current = false;
    if (disposal.current) clearTimeout(disposal.current);
    disposal.current = null;
    const disconnectAuth = onAuthInvalidated(() => invalidateOwner());
    const disconnectAccess=onAuthAccessSuspended(()=>{
      eligibilityEpoch.current++;
      presentationPaused.current=true;presentationQueue.current?.setRunning(false);
      playbackIntent.current={...playbackIntent.current,intent:'pause',epoch:playbackIntent.current.epoch+1};
      realtime.current?.suspend();presenceRequest.current?.abort();
      if(presenceTimer.current)clearTimeout(presenceTimer.current);presenceTimer.current=null;
      for(const request of preparationRequests.current)request.abort();preparationRequests.current.clear();
    });
    boot.current ??= initialize();
    void boot.current.catch(e => setError(e instanceof Error ? e.message : 'Could not connect.'));
    return () => { disconnectAuth();disconnectAccess(); disposal.current = setTimeout(() => {
      disposed.current = true;
      realtime.current?.close(); realtime.current = null;
      presentationQueue.current?.dispose();
    }, 0); };
  }, [initialize]);
  const envelope = useCallback((): CommandEnvelope => {
    const value = current.current;
    if (!value) throw new Error('The table is still loading.');
    if (presentationQueue.current?.isHolding() || displayed.current?.game.id !== value.game.id ||
        displayed.current?.revision !== value.revision || displayed.current?.decisionId !== value.decisionId)
      throw new Error('The table is catching up. Wait for the current turn.');
    if (value.controlLeaseToken === 'view-only') throw new Error('Take control of this table before continuing.');
    return {commandId:crypto.randomUUID(), gameId:value.game.id, expectedRevision:value.revision,
      controlLeaseToken:value.controlLeaseToken};
  }, []);
  const switchControlToken = useCallback((gameId:string):string => {
    const value = current.current;
    if (!value || value.game.id !== gameId)
      throw new Error('The active table changed. Choose the game again.');
    if (value.controlLeaseToken === 'view-only')
      throw new Error('Take control of this table before opening another game.');
    return value.controlLeaseToken;
  }, []);
  const setPlayback = useCallback(async (running:boolean,
    intent:'resume'|'pause'|'hold'|'release_hold'=running?'resume':'pause',reason:PauseReason='manual'):Promise<boolean> => {
    const capturedOwner=ownerGeneration.current,gameId=wire.current?.session?.gameId,playerId=owner.current;
    if(!gameId||!playerId||current.current?.controlLeaseToken==='view-only')return false;
    // Disconnect latches before React updates the table's pause reason. A
    // stale default stop from that render must retain the observed cause.
    if(intent==='pause'&&reason==='manual'&&playbackIntent.current.gameId===gameId&&
      playbackIntent.current.intent==='pause'&&playbackIntent.current.reason==='connection_lost')reason='connection_lost';
    if(playbackRequest.current&&playbackIntent.current.gameId===gameId&&playbackIntent.current.intent===intent&&playbackIntent.current.reason===reason)
      return playbackRequest.current;
    // A hold release can never clear a persistent interruption, including one
    // observed while its acknowledgement was in flight.
    if(intent==='release_hold'&&playbackIntent.current.intent==='pause')return false;
    const epoch=playbackIntent.current.epoch+1;
    playbackIntent.current={gameId,intent,reason,epoch};
    const foregroundEpoch=eligibilityEpoch.current;
    presentationPaused.current=true;
    presentationQueue.current?.setRunning(false);
    if(intent==='pause') {
      for(const request of preparationRequests.current)request.abort();preparationRequests.current.clear();
      retainStopIntent(playerId,gameId,reason);
      if(presenceTimer.current)clearTimeout(presenceTimer.current);presenceTimer.current=null;
      presenceRequest.current?.abort();presenceRequest.current=null;
      realtime.current?.setPaused(true);
      if(reason==='away')realtime.current?.suspend();
    } else if(intent==='hold')realtime.current?.setPaused(true);
    const stillCurrent=()=>capturedOwner===ownerGeneration.current&&wire.current?.session?.gameId===gameId&&!disposed.current;
    const eligible=()=>stillCurrent()&&epoch===playbackIntent.current.epoch&&foregroundEpoch===eligibilityEpoch.current&&
      foregroundEligible.current&&!document.hidden&&navigator.onLine;
    if(!running)requestedRunning.current=false;
    const previousRequest=playbackRequest.current;
    const task=(async()=>{
      try {
        if(previousRequest)await previousRequest.catch(()=>false);
        if(!stillCurrent()||(running&&!eligible())||(!running&&epoch!==playbackIntent.current.epoch))return false;
        if(running){
          if(authMode==='keycloak' && !await authSession.ensureAccess())return false;
          await verifyOwner();if(!eligible())return false;
          // Reconcile through HTTP while paused. Resume must commit before negotiation.
          await realtime.current?.recover();if(!eligible())return false;
        }
        // Stop deliberately bypasses identity preflight. Authentication and
        // control checks still happen on the server for the actual POST.
        const pending=readGoPending('playback',playerId);
        if(pending) {
          const original=await restoreGoPending(pending);
          if(!stillCurrent()||(running&&!eligible()))return false;
          // A superseded start may still have committed, but an unknown receipt
          // is never permission to resend that start while this device is away.
          const supersededStart=!running&&original.running===true;
          const recovered=supersededStart?await recoverGoPending(pending):await executeGo('playback','/api/session/playback','RealtimePlaybackView',original,playerId,pending.gameId);
          if(!stillCurrent()||(running&&!eligible()))return false;
          if(supersededStart)clearGoPending('playback');
          if(recovered&&pending.gameId===gameId&&validateContract('RealtimePlaybackView',recovered))updatePlayback(recovered,gameId);
        }
        if(!stillCurrent()||(running&&!eligible()))return false;
        const send=async(nextRunning:boolean,nextIntent:typeof intent,nextReason:PauseReason)=>{
          const s=wire.current?.session,model=current.current;
          if(!s||s.gameId!==gameId||!model||model.controlLeaseToken==='view-only')throw new Error('Take control before continuing.');
          const request:RealtimePlaybackRequest={commandId:crypto.randomUUID(),gameId,controlLeaseToken:model.controlLeaseToken,
            expectedControlGeneration:s.control.controlGeneration,expectedPlaybackGeneration:playback.current.generation,
            running:nextRunning,intent:nextIntent,reason:nextReason};
          const result=await executeGo('playback','/api/session/playback','RealtimePlaybackView',request,playerId,gameId);
          if(stillCurrent())updatePlayback(result,gameId);
          return result;
        };
        // A failed stop survives reload/transport recovery even if no UUID was
        // sent. Reconcile older receipts first, then confirm that stop before
        // allowing a fresh explicit Resume.
        const stop=readStopIntent(playerId,gameId);
        if(stop&&intent!=='pause') {
          if(playback.current.phase!=='paused'&&playback.current.phase!=='expired')await send(false,'pause',stop.reason);
          if(!eligible())return false;
          clearStopIntent(playerId,gameId);
        }
        const phase=playback.current.phase;
        const desiredPhase=intent==='hold'?'held':intent==='pause'?'paused':'running';
        requestedRunning.current=running;
        if(intent==='resume'||phase!==desiredPhase||(phase===undefined&&playback.current.running!==running))await send(running,intent,reason);
        if(!stillCurrent()||(running&&!eligible()))return false;
        if(running&&(!playback.current.running||(playback.current.phase!==undefined&&playback.current.phase!=='running'))){
          setInterruptionReason(playback.current.pauseReason??'lease_expired');
          setPlaybackInterrupted(true);setError(playback.current.phase==='expired'?'This game expired.':'The server kept this game paused. Resume again after recovery.');return false;
        }
        if(intent==='pause')clearStopIntent(playerId,gameId);
        requestedRunning.current=running;
        if(running){
          realtime.current?.setPaused(false);
          await realtime.current?.recoverAfterCurrent();
          if(!eligible()){realtime.current?.setPaused(true);return false;}
          presentationPaused.current=false;presentationQueue.current?.setRunning(true);setPlaybackInterrupted(false);setError('');}
        return true;
      }catch(e) {
        if(!stillCurrent()||(running&&!eligible()))return false;
        presentationPaused.current=true;presentationQueue.current?.setRunning(false);setPlaybackInterrupted(true);
        setInterruptionReason(intent==='pause'?reason:e instanceof ApiFailure?'service_unavailable':'connection_lost');
        setError(`Playback change is unconfirmed. Reconnect before continuing. ${e instanceof Error?e.message:''}`.trim());
        return false;
      }
    })();
    playbackRequest.current=task;
    try{return await task;}finally{if(playbackRequest.current===task)playbackRequest.current=null;}
  },[verifyOwner,updatePlayback]);
  reconcileStop.current=()=>setPlayback(false,'pause',readStopIntent(owner.current??'',wire.current?.session?.gameId??'')?.reason??playbackIntent.current.reason);
  useEffect(()=>{
    const interrupt=(reason:PauseReason)=>{
      foregroundEligible.current=false;eligibilityEpoch.current++;
      if(presenceTimer.current)clearTimeout(presenceTimer.current);presenceTimer.current=null;
      presenceRequest.current?.abort();presenceRequest.current=null;
      if(reason==='away')realtime.current?.suspend();
      if(current.current?.controlLeaseToken!=='view-only')void setPlayback(false,'pause',reason);
    };
    const away=()=>interrupt('away'),offline=()=>interrupt('connection_lost');
    const foreground=()=>{if(!document.hidden&&navigator.onLine)foregroundEligible.current=true;};
    const visibility=()=>{if(document.hidden)away();else foreground();};
    window.addEventListener('blur',away);window.addEventListener('pagehide',away);window.addEventListener('offline',offline);
    window.addEventListener('focus',foreground);window.addEventListener('online',foreground);document.addEventListener('visibilitychange',visibility);
    return ()=>{window.removeEventListener('blur',away);window.removeEventListener('pagehide',away);window.removeEventListener('offline',offline);
      window.removeEventListener('focus',foreground);window.removeEventListener('online',foreground);document.removeEventListener('visibilitychange',visibility);};
  },[setPlayback]);
  const activeGameId=session?.game.id??trixSession?.game.id;
  useEffect(()=>{
    const gameId=activeGameId,expectedGeneration=lifecycle?.generation;
    if(!gameId||expectedGeneration===undefined||!['running','held'].includes(lifecycle?.phase??''))return;
    let canceled=false;
    if(presenceSequence.current.gameId!==gameId||presenceSequence.current.generation!==expectedGeneration)
      presenceSequence.current={gameId,generation:expectedGeneration,sequence:0};
    const eligible=()=>!canceled&&!disposed.current&&foregroundEligible.current&&!document.hidden&&navigator.onLine&&
      wire.current?.session?.gameId===gameId&&playback.current.generation===expectedGeneration&&
      ['running','held'].includes(playback.current.phase??'')&&playbackIntent.current.intent!=='pause'&&
      current.current?.controlLeaseToken!=='view-only';
    const schedule=()=>{if(eligible())presenceTimer.current=setTimeout(()=>{presenceTimer.current=null;void renew();},4750+Math.floor(Math.random()*500));};
    const renew=async()=>{
      if(!eligible())return;
      const s=wire.current!.session!,model=current.current!,controller=new AbortController();presenceRequest.current=controller;
      try {
        const value=await api('/api/session/presence','RealtimePlaybackView',{gameId,controlLeaseToken:model.controlLeaseToken,
          expectedControlGeneration:s.control.controlGeneration,expectedPlaybackGeneration:expectedGeneration,sequence:++presenceSequence.current.sequence},'POST',controller.signal,5000);
        if(!eligible())return;
        updatePlayback(value,gameId);
        if(value.phase==='paused'||value.phase==='expired'){
          presentationPaused.current=true;presentationQueue.current?.setRunning(false);setPlaybackInterrupted(true);
          setInterruptionReason(value.pauseReason??'lease_expired');
          playbackIntent.current={gameId,intent:'pause',reason:value.pauseReason??'lease_expired',epoch:playbackIntent.current.epoch+1};
          return;
        }
      }catch(e){
        if(!eligible()||controller.signal.aborted)return;
        setPlaybackInterrupted(true);void setPlayback(false,'pause',e instanceof ApiFailure&&navigator.onLine?'service_unavailable':'connection_lost');
      }finally{if(presenceRequest.current===controller)presenceRequest.current=null;}
      schedule();
    };
    schedule();
    return ()=>{canceled=true;if(presenceTimer.current)clearTimeout(presenceTimer.current);presenceTimer.current=null;presenceRequest.current?.abort();presenceRequest.current=null;};
  },[activeGameId,lifecycle?.generation,lifecycle?.phase,setPlayback,updatePlayback]);
  const command = useCallback(async <N extends ContractName>(path:string, output:N, body:unknown): Promise<ContractTypes[N]> => {
    if (inFlight.current) throw new Error('A request is already being confirmed.');
    const captured = ownerGeneration.current;
    inFlight.current = true; setBusy(true); setError(''); generation.current++;
    try {
      const playerId = await verifyOwner();
      if (captured !== ownerGeneration.current) throw new Error('Reconnect before continuing.');
      const instance = current.current?.game.id ?? 'opening';
      const sequence = realtime.current?.sequence ?? -1;
      const result = await executeGo('session', path, output, body, playerId, instance);
      if (captured !== ownerGeneration.current) throw new Error('The signed-in player changed.');
      await applyReceipt(result, instance);
      const isReceipt = validateContract('LocalServiceCommandReceipt', result);
      const isControl = validateContract('LocalControlView', result);
      const confirmed = () => {
        if (isReceipt)
          return wire.current?.session?.gameId === result.gameId && wire.current.session.revision >= result.revision;
        if (isControl)
          return wire.current?.session?.control.controlGeneration === result.controlGeneration;
        return false;
      };
      const stream = realtime.current;
      if ((isReceipt || isControl) && stream?.connected && sequence >= 0) {
        const deadline = Date.now() + 1800;
        while (!confirmed() && Date.now() < deadline) {
          try { await stream.waitForSequence(stream.sequence, deadline - Date.now()); }
          catch { break; }
        }
      }
      if (!confirmed()) await read();
      if (isReceipt && confirmed() && displayed.current?.game.id === result.gameId &&
          displayed.current.revision < result.revision) {
        // A receipt may expedite ordinary lag, but never skip a public
        // completed-trick frame that the player has not finished seeing.
        presentationQueue.current?.expedite(result.revision);
      }
      return result;
    } catch (e) {
      if (captured === ownerGeneration.current) setError(e instanceof Error ? e.message : 'Could not confirm this request.');
      throw e;
    } finally { inFlight.current = false; setBusy(false); }
  }, [verifyOwner, applyReceipt, read, show]);
  const prepare = useCallback(async (purpose:'human-analysis'|'coach-advice', signal?:AbortSignal) => {
    const controller=new AbortController();preparationRequests.current.add(controller);
    signal=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    const capturedGame=wire.current?.session?.gameId,capturedEpoch=eligibilityEpoch.current;
    const eligible=()=>{
      if(signal?.aborted||document.hidden||!foregroundEligible.current||capturedEpoch!==eligibilityEpoch.current||wire.current?.session?.gameId!==capturedGame)
        throw signal?.reason??new DOMException('The table is paused while you are away.','AbortError');
    };
    try {
    await verifyOwner();
    eligible();
    const {gameId, expectedRevision, controlLeaseToken} = envelope();
    const cacheKey = `${gameId}:${expectedRevision}:${controlLeaseToken}:${purpose}`;
    const cached = prepared.current.get(cacheKey);
    if (cached) return cached;
    let work = await api('/api/session/prepare', 'LocalServicePrepareView', {gameId, expectedRevision, controlLeaseToken, purpose}, 'POST', signal);
    eligible();
    noteWork(work);
    // The initial snapshot closes the race between preparation's HTTP reply
    // and registering work IDs on the stream. Later updates arrive as pushes.
    if (realtime.current && work.workIds.some(id => !works.current.has(id))) {
      const snapshot = await realtime.current.recover(work.workIds);
      eligible();
      for (const item of snapshot.works) noteWork(item);
    }
    const deadline = Date.now() + 95_000 * Math.ceil(work.workIds.length / 2);
    for (;;) {
      eligible();
      let all = work.workIds.map(id => works.current.get(id)).filter((item):item is LocalServicePrepareView => !!item);
      if (all.length !== work.workIds.length || !realtime.current?.connected) {
        all = await Promise.all(work.workIds.map(id => api(`/api/work/${encodeURIComponent(id)}`, 'LocalServicePrepareView', undefined, 'GET', signal)));
        eligible();
        for (const item of all) noteWork(item);
      }
      if (all.some(item => item.status === 'rejected' || item.status === 'canceled')) {
        failedPreparation.current = {gameId,revision:expectedRevision,workIds:work.workIds};
        throw new Error('Preparation stopped. Retry to prepare this confirmed position.');
      }
      if (all.every(item => item.status === 'completed')) {
        const main = all.find(item => item.workId === work.workId)!;
        work = {...work, ...main, workIds:work.workIds, preparedDecisionId:work.workId};
        if (wire.current?.session?.gameId !== gameId || wire.current.session.revision !== expectedRevision)
          throw new Error('The table changed during preparation.');
        prepared.current.set(cacheKey, work);
        return work;
      }
      if (Date.now() >= deadline) throw new ApiFailure('Preparation remains unconfirmed. Retry to check this position.', 503, 'REQUEST_TIMEOUT');
      if (!realtime.current?.connected) { await delay(250, signal); continue; }
      const before = workSerial.current;
      try {
        await new Promise<void>((resolve, reject) => {
          const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); workListeners.current.delete(done); resolve(); };
          const abort = () => { clearTimeout(timer); workListeners.current.delete(done); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
          const timer = setTimeout(done, Math.min(5000, deadline - Date.now()));
          workListeners.current.add(done);
          signal?.addEventListener('abort', abort, {once:true});
          if (signal?.aborted) abort();
          else if (workSerial.current !== before) done();
        });
      } catch (e) { if (signal?.aborted) throw e; }
      if (before === workSerial.current && realtime.current?.connected)
        await realtime.current.recover(work.workIds);
    }
    }finally{preparationRequests.current.delete(controller);}
  }, [verifyOwner, envelope, noteWork]);
  const candidateAction = async (candidateId:string, onConfirmed?:(receipt:{gameId:string;revision:number})=>void): Promise<boolean> => {
    if (preparing.current || inFlight.current) return false;
    preparing.current = true; setBusy(true); setError('');
    try {
      const source = wire.current?.session;
      if (!source?.actor?.candidates.some(candidate=>candidate.id===candidateId)) throw new Error('That action is unavailable at this confirmed decision.');
      const work = await prepare('human-analysis');
      if(document.hidden||!foregroundEligible.current||playbackIntent.current.intent==='pause')throw new DOMException('The table is paused.','AbortError');
      if (wire.current?.session?.decisionId !== source?.decisionId) throw new Error('The table changed. Choose your action again.');
      const receipt = await command('/api/session/actions', 'LocalServiceCommandReceipt', {...envelope(), candidateId,
        preparedDecisionId:work.preparedDecisionId!, preparedWorkIds:work.workIds});
      // Presentation observers cannot change whether the authoritative move succeeded.
      try { onConfirmed?.({gameId:receipt.gameId, revision:receipt.revision}); } catch { /* The move is already saved. */ }
      return true;
    } catch (e) {
      if (e instanceof ApiFailure && e.status === 409) {
        const work = [...prepared.current.values()].find(item=>item.gameId === current.current?.game.id && item.revision === current.current?.revision);
        if (work) failedPreparation.current = {gameId:work.gameId,revision:work.revision,workIds:work.workIds};
        prepared.current.clear();
      }
      setError(e instanceof Error ? e.message : 'Could not save this move.'); return false;
    }
    finally { preparing.current = false; setBusy(false); }
  };
  const action = async (action:GameAction, onConfirmed?:(receipt:{gameId:string;revision:number})=>void): Promise<boolean> => {
    try {return await candidateAction(resolveCandidate(wire.current?.session?.actor ?? null,action), onConfirmed);}
    catch(e) {setError(e instanceof Error?e.message:'That action is unavailable.');return false;}
  };
  const mutate = async (path:string, extra:object = {}): Promise<boolean> => {
    try {
      if (path === '/api/session/advance') throw new Error('Automatic turns are controlled by the server.');
      const s = wire.current?.session;
      if (path === '/api/session/control') {
        if (!s) throw new Error('The table is still loading.');
        await command(path, 'LocalControlView', {commandId:crypto.randomUUID(), gameId:s.gameId,
          expectedRevision:s.revision, expectedControlGeneration:s.control.controlGeneration});
      } else {
        await command(path, 'LocalServiceCommandReceipt', {...envelope(), ...extra});
        // A confirmed normal continuation spans the two recorded V2 operations.
        // A restored chance position uses its own current command envelope;
        // table playback can invoke it only after the owner resumes the game.
        if (path === '/api/session/next-hand' && s?.node.kind === 'round-complete' &&
            wire.current?.session?.node.kind === 'chance')
          await command(path, 'LocalServiceCommandReceipt', envelope());
      }
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not confirm this request.'); return false; }
  };
  const loadAdvice = async (requestedLevel:1|2|3) => {
    let s = wire.current?.session;
    // Unlimited coaching keeps the original one-click flow, but still needs
    // the server's unit-bound unlock before its frozen advice can be delivered.
    if (s && !s.access.handUnlocked && s.access.coach.allowed && s.access.allowance.kind === 'unlimited') {
      await command('/api/access/unlocks', 'LocalServiceUnlockReceipt', {...envelope(), toolId:'advice'});
      s = wire.current?.session;
    }
    if (s?.actor) await prepare(s.access.handUnlocked && !s.access.play.allowed ? 'coach-advice' : 'human-analysis');
    const value = await command('/api/platform/advice', 'PlatformAdviceView', {...envelope(),
      decisionId:wire.current!.session!.decisionId, requestedLevel, unlock:false});
    return value.advice;
  };
  const advice = async (level:1|2|3):Promise<AdviceView> => {
    const value=await loadAdvice(level);
    if ('gameId' in value) throw new Error('This advice requires its registered game display.');
    return value;
  };
  const registeredAdvice = async (level:1|2|3):Promise<TrixAdvice> => {
    const value=await loadAdvice(level);
    if (!('gameId' in value) || value.gameId !== 'trix') throw new Error('The advice does not match this game.');
    return value;
  };
  const startRegistered = async (mode:string) => {
    try {
      const choice = wire.current?.catalog.find(item => item.mode === mode);
      if (!choice?.start.allowed) throw new Error('This game is unavailable for this account.');
      const s = wire.current?.session;
      await command('/api/sessions', 'LocalServiceCommandReceipt', {commandId:crypto.randomUUID(), selector:choice.selector,
        expectedActiveGameId:s?.gameId ?? null, expectedRevision:s?.revision ?? null,
        controlLeaseToken:s ? switchControlToken(s.gameId) : null});
      return true;
    } catch(e) {setError(e instanceof Error ? e.message : 'Could not open this game.');return false;}
  };
  return {
    session, trixSession, catalog, startRegistered, candidateAction, registeredAdvice, error, busy, refresh, envelope, action, mutate, invalidateOwner,
    playbackRunning, playbackInterrupted, streamStatus, setPlayback, notePresented, presentationHeld,lifecycle,interruptionReason,
    newGame: async (mode:Mode, selection:Pick<NewSessionRequest,'scenarioId'|'replayScenario'> = {}) => {
      try {
        if (selection.scenarioId || selection.replayScenario) throw new Error('Selected deals are unavailable in this Go build.');
        const choice = wire.current?.catalog.find(item => item.mode === mode);
        if (!choice) throw new Error('This game is unavailable.');
        const s = wire.current?.session;
        await command('/api/sessions', 'LocalServiceCommandReceipt', {commandId:crypto.randomUUID(), selector:choice.selector,
          expectedActiveGameId:s?.gameId ?? null, expectedRevision:s?.revision ?? null,
          controlLeaseToken:s ? switchControlToken(s.gameId) : null});
        return true;
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not open this game.'); return false; }
    },
    preferences: async (preferences:Preferences) => {
      try {
        await command('/api/preferences', 'PlatformPreferencesView', {commandId:crypto.randomUUID(),
          expectedPreferencesRevision:wire.current?.preferences.revision ?? 0, preferences});
        return true;
      } catch { return false; }
    },
    advice,
    unlock: async (level:1|2|3) => {
      await command('/api/access/unlocks', 'LocalServiceUnlockReceipt', {...envelope(), toolId:'advice'});
      await prepare('coach-advice');
      return advice(level);
    },
    exposure: (displayedLevel:1|2|3, decisionId:string) => command('/api/platform/exposures', 'AcceptedView', {
      commandId:crypto.randomUUID(), gameId:current.current!.game.id, decisionId, displayedLevel}),
    retry: async () => {
      try {
        setError('');
        if (!owner.current) { await initialize(); return !!current.current; }
        const playerId = await verifyOwner();
        const pending = readGoPending('session', playerId);
        if (pending) {
          setBusy(true);
          const recovered = await recoverGoPending(pending);
          const result = recovered ?? await api(pending.path, 'PlatformRecoveredReceipt', await restoreGoPending(pending));
          await applyReceipt(result, pending.gameId); clearGoPending('session');
          await read();
        } else {
          await read();
          const failed = failedPreparation.current;
          if (failed && wire.current?.session?.gameId === failed.gameId && wire.current.session.revision === failed.revision) {
            const {controlLeaseToken} = envelope();
            for (const id of failed.workIds) works.current.delete(id);
            const retried = await Promise.all(failed.workIds.map(id=>api(`/api/work/${encodeURIComponent(id)}/retry`, 'LocalServicePrepareView', {controlLeaseToken})));
            for (const item of retried) noteWork(item);
            prepared.current.clear();
          }
          failedPreparation.current = null;
        }
        return !!current.current;
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not reconnect.'); return false; }
      finally { setBusy(false); }
    },
    clearError: () => setError(''),
  };
}
