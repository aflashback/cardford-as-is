import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdviceView, CommandEnvelope, GameAction, Mode, Preferences, SessionView } from '../../shared/contracts';
import { api, ApiFailure } from './client';

type Pending = { path: string; body: unknown; method?: string };
export function useSession() {
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = useRef<SessionView | null>(null);
  const pending = useRef<Pending | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const accept = useCallback((value: SessionView) => { generation.current++; current.current = value; setSession(value); return value; }, []);
  const refresh = useCallback(async () => {
    const requestGeneration = ++generation.current;
    const value = await api('/api/session', 'SessionView');
    if (requestGeneration !== generation.current || (current.current?.game.id === value.game.id && current.current.revision > value.revision)) return current.current ?? value;
    accept(value); return value;
  }, [accept]);
  useEffect(() => { void refresh().catch(e => setError(e instanceof Error ? e.message : 'Could not connect.')); }, [refresh]);
  const envelope = useCallback((): CommandEnvelope => {
    const value = current.current;
    if (!value) throw new Error('The table is still loading.');
    return { commandId: crypto.randomUUID(), gameId: value.game.id, expectedRevision: value.revision, controlLeaseToken: value.controlLeaseToken };
  }, []);
  const submit = useCallback(async (operation: Pending): Promise<boolean> => {
    if (inFlight.current || (pending.current && pending.current !== operation)) return false;
    generation.current++; inFlight.current = true; pending.current = operation; setBusy(true); setError('');
    try { accept(await api(operation.path, 'SessionView', operation.body, operation.method)); pending.current = null; return true; }
    catch (e) {
      if (e instanceof ApiFailure && e.current) accept(e.current);
      if (e instanceof ApiFailure && e.status < 500) pending.current = null;
      setError(e instanceof Error ? e.message : 'Could not save this move. Retry.'); return false;
    } finally { inFlight.current = false; setBusy(false); }
  }, [accept]);
  const mutate = useCallback((path: string, extra: object = {}) => submit({ path, body: { ...envelope(), ...extra } }), [submit, envelope]);
  const action = (action: GameAction) => mutate('/api/session/actions', { action });
  const newGame = (mode: Mode) => submit({ path: '/api/sessions', body: { commandId: crypto.randomUUID(), mode, expectedActiveGameId: current.current?.game.id ?? null } });
  const preferences = (preferences: Preferences) => submit({ path: '/api/preferences', method: 'PUT', body: { commandId: crypto.randomUUID(), preferences } });
  const advice = async (requestedLevel: 1 | 2 | 3): Promise<AdviceView> => {
    const value = current.current;
    if (!value) throw new Error('The table is still loading.');
    return api('/api/session/advice', 'AdviceView', { ...envelope(), decisionId: value.decisionId, requestedLevel });
  };
  const unlock = async (requestedLevel: 1 | 2 | 3) => {
    const value = current.current;
    if (!value) throw new Error('The table is still loading.');
    const result = await api('/api/coaching/hand-unlocks', 'HandUnlockView', { requestId: crypto.randomUUID(), gameId: value.game.id, handId: `${value.game.id}:${value.game.handNumber}`, decisionId: value.decisionId, expectedRevision: value.revision, requestedLevel, controlLeaseToken: value.controlLeaseToken });
    if (current.current?.decisionId === value.decisionId) accept({ ...current.current, access: result.access });
    return result.advice;
  };
  return { session, error, busy, refresh, envelope, action, newGame, preferences, advice, unlock, mutate, retry: () => pending.current ? submit(pending.current) : refresh().then(() => true).catch(() => false), clearError: () => setError('') };
}
