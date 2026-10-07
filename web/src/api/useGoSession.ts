import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdviceView, CommandEnvelope, ContractName, ContractTypes, GameAction,
  LocalServicePrepareView, Mode, NewSessionRequest, PlatformSessionView, Preferences } from '../../shared/local-service.contracts.ts';
import { validateContract } from '../../shared/local-service.validation.ts';
import { api, ApiFailure } from './client.ts';
import { clearLeases, readLease, retainLease } from './controlLease.ts';
import { clearPendingCommands } from './pendingCommands.ts';
import { clearGoPending, executeGo, readGoPending, recoverGoPending, restoreGoPending } from './goPendingCommands.ts';
import { presentation, resolveCandidate } from './presentation.ts';
import type { ClientSession } from './sessionModel.ts';

async function delay(signal?: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 150);
    signal?.addEventListener('abort', abort, {once:true});
  });
}
export function useGoSession() {
  const [session, setSession] = useState<ClientSession|null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const wire = useRef<PlatformSessionView|null>(null);
  const current = useRef<ClientSession|null>(null);
  const owner = useRef<string|null>(null);
  const generation = useRef(0);
  const ownerGeneration = useRef(0);
  const inFlight = useRef(false);
  const preparing = useRef(false);
  const boot = useRef<Promise<unknown>|null>(null);
  const prepared = useRef(new Map<string, LocalServicePrepareView>());
  const failedPreparation = useRef<{gameId:string; revision:number; workIds:string[]}|null>(null);
  const invalidateOwner = useCallback((playerId?: string) => {
    generation.current++; ownerGeneration.current++;
    clearPendingCommands(); clearLeases(); prepared.current.clear();
    wire.current = null; current.current = null; setSession(null);
    failedPreparation.current = null;
    owner.current = playerId ?? null;
    setError('The signed-in player changed. Reconnect before continuing.');
  }, []);
  const verifyOwner = useCallback(async () => {
    const identity = await api('/api/identity', 'IdentityView');
    if (owner.current && identity.playerId !== owner.current) {
      invalidateOwner(identity.playerId);
      throw new ApiFailure('The signed-in player changed. Reconnect before continuing.', 401, 'UNAUTHENTICATED');
    }
    owner.current = identity.playerId;
    return identity.playerId;
  }, [invalidateOwner]);
  const accept = useCallback(async (value: PlatformSessionView, requestGeneration:number) => {
    const s = value.session;
    if (owner.current && value.playerId !== owner.current) {
      invalidateOwner(value.playerId);
      throw new ApiFailure('The signed-in player changed. Reconnect before continuing.', 401, 'UNAUTHENTICATED');
    }
    const lease = s ? await readLease(value.playerId, s.gameId) : null;
    if (requestGeneration !== generation.current) return current.current;
    if (owner.current !== value.playerId) return current.current;
    const model: ClientSession|null = s ? {
      game:presentation(s.view, s.presentation, s.actor, s.gameId), revision:s.revision,
      decisionId:s.decisionId, preferences:value.preferences.preferences,
      access:{canPlay:s.playable && s.access.play.allowed, canCoach:s.access.coach.allowed,
        remainingHands:s.access.allowance.kind === 'unlimited' ? null : s.access.allowance.remaining ?? 0,
        resetsAt:s.access.allowance.resetsAt, handUnlocked:s.access.handUnlocked,
        canStartWork:s.access.canStartWork, localMock:s.access.localMock},
      source:'code', controlLeaseToken:s.control.owned && lease?.generation === s.control.controlGeneration ? lease.token : 'view-only',
      stats:s.stats,
    } : null;
    if (current.current?.game.id !== model?.game.id || current.current?.revision !== model?.revision)
      prepared.current.clear();
    wire.current = value; current.current = model; setSession(model);
    return model;
  }, [invalidateOwner]);
  const read = useCallback(async () => {
    const requestGeneration = ++generation.current;
    const value = await api('/api/platform/session', 'PlatformSessionView');
    if (requestGeneration !== generation.current ||
        (wire.current?.session?.gameId === value.session?.gameId &&
          (wire.current?.session?.revision ?? -1) > (value.session?.revision ?? -1))) return current.current;
    return accept(value, requestGeneration);
  }, [accept]);
  const refresh = useCallback(async (): Promise<ClientSession> => {
    const value = await read();
    if (!value) throw new Error('No active table. Open Account to check practice access.');
    return value;
  }, [read]);
  const applyReceipt = useCallback(async (value: unknown, gameId: string) => {
    if (validateContract('LocalServiceCommandReceipt', value) && value.controlLeaseToken && value.controlGeneration !== undefined)
      await retainLease(owner.current!, value.gameId, value.controlLeaseToken, value.controlGeneration);
    else if (validateContract('LocalControlView', value))
      await retainLease(owner.current!, gameId, value.controlLeaseToken, value.controlGeneration);
  }, []);
  const initialize = useCallback(async () => {
    const identity = await api('/api/local/session', 'IdentityView', {});
    if (owner.current && owner.current !== identity.playerId) invalidateOwner(identity.playerId);
    owner.current = identity.playerId;
    await read();
    const pending = readGoPending('session', identity.playerId);
    if (pending) {
      setError('A previous request has an unconfirmed outcome. Retry to check it before continuing.');
      return;
    }
    if (!wire.current?.session) {
      const choice = wire.current?.catalog.find(item => item.mode === 'spades-partners');
      if (!choice?.start.allowed) throw new Error('Practice is unavailable for this account. Open Account to check access.');
      const receipt = await executeGo('session', '/api/sessions', 'LocalServiceCommandReceipt', {
        commandId:crypto.randomUUID(), selector:choice.selector, expectedActiveGameId:null,
        expectedRevision:null, controlLeaseToken:null,
      }, identity.playerId, 'opening');
      await applyReceipt(receipt, receipt.gameId);
      await read();
    }
  }, [read, invalidateOwner, applyReceipt]);
  useEffect(() => {
    boot.current ??= initialize();
    void boot.current.catch(e => setError(e instanceof Error ? e.message : 'Could not connect.'));
  }, [initialize]);
  const envelope = useCallback((): CommandEnvelope => {
    const value = current.current;
    if (!value) throw new Error('The table is still loading.');
    if (value.controlLeaseToken === 'view-only') throw new Error('Take control of this table before continuing.');
    return {commandId:crypto.randomUUID(), gameId:value.game.id, expectedRevision:value.revision,
      controlLeaseToken:value.controlLeaseToken};
  }, []);
  const command = useCallback(async <N extends ContractName>(path:string, output:N, body:unknown): Promise<ContractTypes[N]> => {
    if (inFlight.current) throw new Error('A request is already being confirmed.');
    const captured = ownerGeneration.current;
    inFlight.current = true; setBusy(true); setError(''); generation.current++;
    try {
      const playerId = await verifyOwner();
      if (captured !== ownerGeneration.current) throw new Error('Reconnect before continuing.');
      const instance = current.current?.game.id ?? 'opening';
      const result = await executeGo('session', path, output, body, playerId, instance);
      if (captured !== ownerGeneration.current) throw new Error('The signed-in player changed.');
      await applyReceipt(result, instance);
      await read();
      return result;
    } catch (e) {
      if (captured === ownerGeneration.current) setError(e instanceof Error ? e.message : 'Could not confirm this request.');
      throw e;
    } finally { inFlight.current = false; setBusy(false); }
  }, [verifyOwner, applyReceipt, read]);
  const prepare = useCallback(async (purpose:'human-analysis'|'bot-action'|'coach-advice', signal?:AbortSignal) => {
    await verifyOwner();
    const {gameId, expectedRevision, controlLeaseToken} = envelope();
    const cacheKey = `${gameId}:${expectedRevision}:${controlLeaseToken}:${purpose}`;
    const cached = prepared.current.get(cacheKey);
    if (cached) return cached;
    let work = await api('/api/session/prepare', 'LocalServicePrepareView', {gameId, expectedRevision, controlLeaseToken, purpose}, 'POST', signal);
    const deadline = Date.now() + 35_000;
    for (;;) {
      if (signal?.aborted) throw signal.reason;
      const all = await Promise.all(work.workIds.map(id => api(`/api/work/${encodeURIComponent(id)}`, 'LocalServicePrepareView', undefined, 'GET', signal)));
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
      await delay(signal);
    }
  }, [verifyOwner, envelope]);
  const action = async (action:GameAction): Promise<boolean> => {
    if (preparing.current || inFlight.current) return false;
    preparing.current = true; setBusy(true); setError('');
    try {
      const source = wire.current?.session;
      const candidateId = resolveCandidate(source?.actor ?? null, action);
      const work = await prepare('human-analysis');
      if (wire.current?.session?.decisionId !== source?.decisionId) throw new Error('The table changed. Choose your action again.');
      await command('/api/session/actions', 'LocalServiceCommandReceipt', {...envelope(), candidateId,
        preparedDecisionId:work.preparedDecisionId!, preparedWorkIds:work.workIds});
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
  const mutate = async (path:string, extra:object = {}): Promise<boolean> => {
    try {
      const s = wire.current?.session;
      if (path === '/api/session/control') {
        if (!s) throw new Error('The table is still loading.');
        await command(path, 'LocalControlView', {commandId:crypto.randomUUID(), gameId:s.gameId,
          expectedRevision:s.revision, expectedControlGeneration:s.control.controlGeneration});
      } else {
        await command(path, 'LocalServiceCommandReceipt', {...envelope(), ...extra});
        // A confirmed normal continuation spans the two recorded V2 operations.
        // A chance position restored by reload starts here with its own explicit confirmation.
        if (path === '/api/session/next-hand' && s?.node.kind === 'round-complete' &&
            wire.current?.session?.node.kind === 'chance')
          await command(path, 'LocalServiceCommandReceipt', envelope());
      }
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not confirm this request.'); return false; }
  };
  const advice = async (requestedLevel:1|2|3):Promise<AdviceView> => {
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
  return {
    session, error, busy, refresh, envelope, action, mutate, invalidateOwner,
    newGame: async (mode:Mode, selection:Pick<NewSessionRequest,'scenarioId'|'replayScenario'> = {}) => {
      try {
        if (selection.scenarioId || selection.replayScenario) throw new Error('Selected deals are unavailable in this Go build.');
        const choice = wire.current?.catalog.find(item => item.mode === mode);
        if (!choice) throw new Error('This game is unavailable.');
        const s = wire.current?.session;
        await command('/api/sessions', 'LocalServiceCommandReceipt', {commandId:crypto.randomUUID(), selector:choice.selector,
          expectedActiveGameId:s?.gameId ?? null, expectedRevision:s?.revision ?? null,
          controlLeaseToken:s ? envelope().controlLeaseToken : null});
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
    prepareBot: async (signal?:AbortSignal) => {
      const work = await prepare('bot-action', signal);
      return {preparedDecisionId:work.preparedDecisionId!, decisionId:wire.current!.session!.decisionId,
        revision:work.revision, source:work.source ?? 'code' as const};
    },
    advanceAutomatic: () => mutate('/api/session/advance', {kind:'automatic', transitionId:wire.current?.session?.node.transitionId}),
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
            await Promise.all(failed.workIds.map(id=>api(`/api/work/${encodeURIComponent(id)}/retry`, 'LocalServicePrepareView', {controlLeaseToken})));
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
