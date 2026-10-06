import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AdviceView,
  CommandEnvelope,
  GameAction,
  Mode,
  Preferences,
  SessionView,
  NewSessionRequest,
} from '../../shared/contracts';
import { api, ApiFailure } from './client';
import {
  clearPending,
  clearPendingCommands,
  pendingCommandId,
  readPending,
  restorePending,
  storePending,
  type PendingOperation,
  type StoredPending,
} from './pendingCommands';

export function useSession() {
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = useRef<SessionView | null>(null);
  const pending = useRef<PendingOperation | null>(null);
  const durablePending = useRef<StoredPending | null>(null);
  const owner = useRef<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const ownerGeneration = useRef(0);
  const boot = useRef<Promise<SessionView> | null>(null);
  const accept = useCallback((value: SessionView) => {
    generation.current++;
    current.current = value;
    setSession(value);
    return value;
  }, []);
  const refresh = useCallback(async () => {
    const requestGeneration = ++generation.current;
    const value = await api('/api/session', 'SessionView');
    if (
      requestGeneration !== generation.current ||
      (current.current?.game.id === value.game.id && current.current.revision > value.revision)
    )
      return current.current ?? value;
    accept(value);
    return value;
  }, [accept]);
  const invalidateOwner = useCallback((playerId?: string) => {
    ownerGeneration.current++;
    generation.current++;
    clearPendingCommands();
    pending.current = null;
    durablePending.current = null;
    current.current = null;
    setSession(null);
    if (playerId) owner.current = playerId;
    setError('The signed-in player changed. Reconnect before continuing.');
  }, []);
  const verifyOwner = useCallback(async () => {
    const identity = await api('/api/identity', 'IdentityView');
    if (owner.current && owner.current !== identity.playerId) {
      invalidateOwner(identity.playerId);
      throw new ApiFailure(
        'The signed-in player changed. Reconnect before continuing.',
        401,
        'UNAUTHENTICATED',
      );
    }
    owner.current = identity.playerId;
    return identity.playerId;
  }, [invalidateOwner]);
  const initialize = useCallback(async () => {
    const requestGeneration = ++generation.current;
    const requestOwnerGeneration = ownerGeneration.current;
    let value: SessionView | null = null;
    let openingError: unknown;
    try {
      // This existing read establishes the anonymous local session cookie.
      value = await api('/api/session', 'SessionView');
    } catch (e) {
      openingError = e;
    }
    let playerId: string;
    try {
      playerId = await verifyOwner();
    } catch (e) {
      throw openingError ?? e;
    }
    if (requestGeneration !== generation.current || requestOwnerGeneration !== ownerGeneration.current)
      return current.current ?? value ?? Promise.reject(openingError);
    const stored = readPending('session', playerId);
    durablePending.current = stored;
    // Owned receipt recovery remains available when the active view is unreadable.
    if (!value) throw openingError;
    const operation = stored ? await restorePending(stored, value) : null;
    if (requestGeneration !== generation.current || requestOwnerGeneration !== ownerGeneration.current)
      return current.current ?? value;
    pending.current = operation;
    accept(value);
    if (stored)
      setError('A previous request has an unconfirmed outcome. Retry to check it before continuing.');
    return value;
  }, [accept, verifyOwner]);
  useEffect(() => {
    boot.current ??= initialize();
    void boot.current.catch((e) => setError(e instanceof Error ? e.message : 'Could not connect.'));
  }, [initialize]);
  const envelope = useCallback((): CommandEnvelope => {
    const value = current.current;
    if (!value) throw new Error('The table is still loading.');
    return {
      commandId: crypto.randomUUID(),
      gameId: value.game.id,
      expectedRevision: value.revision,
      controlLeaseToken: value.controlLeaseToken,
    };
  }, []);
  const submit = useCallback(
    async (operation: PendingOperation): Promise<boolean> => {
      if (
        inFlight.current ||
        (pending.current && pending.current !== operation) ||
        (durablePending.current && pendingCommandId(durablePending.current) !== pendingCommandId(operation))
      )
        return false;
      const retrying = pending.current === operation;
      const requestOwnerGeneration = ownerGeneration.current;
      generation.current++;
      inFlight.current = true;
      setBusy(true);
      setError('');
      try {
        const playerId = await verifyOwner();
        if (!current.current || requestOwnerGeneration !== ownerGeneration.current)
          throw new ApiFailure(
            'Reconnect to load your current table before continuing.',
            409,
            'STALE_REVISION',
          );
        if (retrying) {
          const status = await api(
            `/api/commands/${encodeURIComponent(pendingCommandId(operation))}`,
            'CommandStatusView',
          );
          if (requestOwnerGeneration !== ownerGeneration.current) return false;
          if (status.status === 'accepted') {
            clearPending('session', pendingCommandId(operation));
            pending.current = null;
            durablePending.current = null;
            await refresh();
            return true;
          }
        }
        pending.current = operation;
        durablePending.current ??= await storePending(
          'session',
          operation,
          playerId,
          current.current!.game.id,
        );
        if (requestOwnerGeneration !== ownerGeneration.current) {
          clearPending('session', pendingCommandId(operation));
          durablePending.current = null;
          return false;
        }
        await api(operation.path, 'SessionView', operation.body, operation.method);
        if (requestOwnerGeneration !== ownerGeneration.current) return false;
        clearPending('session', pendingCommandId(operation));
        pending.current = null;
        durablePending.current = null;
        await refresh();
        return true;
      } catch (e) {
        if (requestOwnerGeneration !== ownerGeneration.current) return false;
        if (e instanceof ApiFailure && e.current) accept(e.current);
        if (e instanceof ApiFailure && e.status < 500) {
          clearPending('session', pendingCommandId(operation));
          pending.current = null;
          durablePending.current = null;
        }
        setError(e instanceof Error ? e.message : 'Could not save this move. Retry.');
        return false;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [accept, refresh, verifyOwner],
  );
  const mutate = useCallback(
    (path: string, extra: object = {}) => submit({ path, body: { ...envelope(), ...extra } }),
    [submit, envelope],
  );
  const action = (action: GameAction) => mutate('/api/session/actions', { action });
  const newGame = (mode: Mode, selection: Pick<NewSessionRequest, 'scenarioId' | 'replayScenario'> = {}) =>
    submit({
      path: '/api/sessions',
      body: {
        commandId: crypto.randomUUID(),
        mode,
        expectedActiveGameId: current.current?.game.id ?? null,
        ...selection,
      },
    });
  const preferences = (preferences: Preferences) =>
    submit({
      path: '/api/preferences',
      method: 'PUT',
      body: { commandId: crypto.randomUUID(), preferences },
    });
  const advice = async (requestedLevel: 1 | 2 | 3): Promise<AdviceView> => {
    const requestOwnerGeneration = ownerGeneration.current;
    await verifyOwner();
    if (requestOwnerGeneration !== ownerGeneration.current) throw new Error('Reconnect before continuing.');
    const value = current.current;
    if (!value) throw new Error('The table is still loading.');
    const result = await api('/api/session/advice', 'AdviceView', {
      ...envelope(),
      decisionId: value.decisionId,
      requestedLevel,
    });
    if (requestOwnerGeneration !== ownerGeneration.current)
      throw new ApiFailure(
        'The signed-in player changed. Reconnect before continuing.',
        401,
        'UNAUTHENTICATED',
      );
    return result;
  };
  const unlock = async (requestedLevel: 1 | 2 | 3) => {
    const requestOwnerGeneration = ownerGeneration.current;
    await verifyOwner();
    if (requestOwnerGeneration !== ownerGeneration.current) throw new Error('Reconnect before continuing.');
    const value = current.current;
    if (!value) throw new Error('The table is still loading.');
    const result = await api('/api/coaching/hand-unlocks', 'HandUnlockView', {
      requestId: crypto.randomUUID(),
      gameId: value.game.id,
      handId: `${value.game.id}:${value.game.handNumber}`,
      decisionId: value.decisionId,
      expectedRevision: value.revision,
      requestedLevel,
      controlLeaseToken: value.controlLeaseToken,
    });
    if (requestOwnerGeneration !== ownerGeneration.current)
      throw new ApiFailure(
        'The signed-in player changed. Reconnect before continuing.',
        401,
        'UNAUTHENTICATED',
      );
    if (current.current?.decisionId === value.decisionId)
      accept({ ...current.current, access: result.access });
    return result.advice;
  };
  return {
    session,
    error,
    busy,
    refresh,
    envelope,
    action,
    newGame,
    preferences,
    advice,
    unlock,
    mutate,
    invalidateOwner,
    retry: async () => {
      if (pending.current) return submit(pending.current);
      const requestOwnerGeneration = ownerGeneration.current;
      try {
        if (!owner.current) {
          await initialize();
          if (requestOwnerGeneration !== ownerGeneration.current) return false;
          if (pending.current) return submit(pending.current);
        }
        const playerId = await verifyOwner();
        if (requestOwnerGeneration !== ownerGeneration.current) return false;
        durablePending.current ??= readPending('session', playerId);
        if (durablePending.current) {
          const id = pendingCommandId(durablePending.current);
          const status = await api(`/api/commands/${encodeURIComponent(id)}`, 'CommandStatusView');
          if (requestOwnerGeneration !== ownerGeneration.current) return false;
          const value = await refresh();
          if (requestOwnerGeneration !== ownerGeneration.current) return false;
          if (status.status === 'accepted') {
            clearPending('session', id);
            durablePending.current = null;
          } else {
            const restored = await restorePending(durablePending.current, value);
            if (requestOwnerGeneration !== ownerGeneration.current) return false;
            if (restored) {
              pending.current = restored;
              return submit(restored);
            }
            clearPending('session', id);
            durablePending.current = null;
            setError(
              'The table or control changed. The previous request was not accepted; choose your next action.',
            );
            return false;
          }
        } else await refresh();
        setError('');
        return true;
      } catch (e) {
        if (requestOwnerGeneration !== ownerGeneration.current) return false;
        setError(e instanceof Error ? e.message : 'Could not reconnect.');
        return false;
      }
    },
    clearError: () => setError(''),
  };
}
