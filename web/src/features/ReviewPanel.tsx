import { useEffect, useRef, useState } from 'react';
import type {
  AdviceView,
  CoachAccess,
  CommandEnvelope,
  ReviewIndex,
  ReviewTrial,
  ReviewView,
  SessionView,
  TrialRequest,
} from '../../shared/contracts';
import { api, ApiFailure, definiteFailure } from '../api/client';
import { cardLabel } from '../api/display';
import type { ClientSession, ClientAccess } from '../api/sessionModel';
import { reviewCandidate } from '../api/presentation';
import type { PlatformReviewAccessView } from '../../shared/local-service.contracts';
import { backend } from '../platform/web';
import { clearGoPending, executeGo, readGoPending, restoreGoPending, storeGoPending, type GoPending } from '../api/goPendingCommands';
import { goTrial, loadOriginalAdvice, originalAdviceMode } from '../api/goReview';
import {
  clearPending,
  clearPendingCommands,
  pendingCommandId,
  readPending,
  restorePending,
  storePending,
  type StoredPending,
} from '../api/pendingCommands';

export function ReviewPanel({
  session,
  envelope,
  onOwnerChanged,
}: {
  session: ClientSession;
  envelope: () => CommandEnvelope;
  onOwnerChanged?: (playerId: string) => void;
}) {
  const [index, setIndex] = useState<ReviewIndex | null>(null);
  const [review, setReview] = useState<ReviewView | null>(null);
  const [trial, setTrial] = useState<ReviewTrial | null>(null);
  const [step, setStep] = useState(0);
  const [hand, setHand] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sourceAccess, setSourceAccess] = useState<ClientAccess | null>(null);
  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const [advice, setAdvice] = useState<AdviceView | null>(null);
  const [pendingAdvice, setPendingAdvice] = useState(false);
  const [pendingTrial, setPendingTrial] = useState<StoredPending | null>(null);
  const [goPending, setGoPending] = useState<GoPending | null>(null);
  const [goAccess, setGoAccess] = useState<PlatformReviewAccessView | null>(null);
  const reviewAbort = useRef(new AbortController());
  const trialRequest = useRef<TrialRequest | null>(null);
  const trialInFlight = useRef(false);
  const owner = useRef<string | null>(null);
  const generation = useRef(0);
  const invalidated = useRef(false);
  const isCurrent = (requestGeneration: number) =>
    requestGeneration === generation.current && !invalidated.current;
  function invalidateOwner(playerId: string) {
    generation.current++;
    invalidated.current = true;
    clearPendingCommands();
    setIndex(null);
    setReview(null);
    setTrial(null);
    setAdvice(null);
    setSourceAccess(null);
    setPendingCard(null);
    setPendingAdvice(false);
    setPendingTrial(null);
    setGoPending(null);
    setGoAccess(null);
    setHand(null);
    setStep(0);
    trialRequest.current = null;
    owner.current = playerId;
    setBusy(false);
    setError('The signed-in player changed. Reopen review before continuing.');
    onOwnerChanged?.(playerId);
  }
  useEffect(() => {
    reviewAbort.current = new AbortController();
    const requestGeneration = generation.current;
    let active = true;
    void api(backend === 'go' ? '/api/platform/reviews' : '/api/session/reviews?scope=match', 'ReviewIndex')
      .then((value) => {
        if (active && isCurrent(requestGeneration)) setIndex(value);
      })
      .catch((e) => {
        if (active && isCurrent(requestGeneration))
          setError(e instanceof Error ? e.message : 'Replay unavailable.');
      });
    void api('/api/identity', 'IdentityView')
      .then((identity) => {
        if (!active || !isCurrent(requestGeneration)) return;
        if (owner.current && owner.current !== identity.playerId) {
          invalidateOwner(identity.playerId);
          return;
        }
        owner.current = identity.playerId;
        if (backend === 'go') {
          const stored = readGoPending('review', identity.playerId);
          setGoPending(stored);
          if (stored) setError('A review request has an unconfirmed outcome. Retry the same request.');
          return;
        }
        const stored = readPending('review', identity.playerId);
        setPendingTrial(stored);
        if (stored) setError('A continuation has an unconfirmed outcome. Retry the same continuation.');
      })
      .catch((e) => {
        if (active && isCurrent(requestGeneration))
          setError(e instanceof Error ? e.message : 'Could not verify the player.');
      });
    return () => {
      active = false;
      reviewAbort.current.abort();
      generation.current++;
    };
  }, []);
  async function verifyOwner() {
    if (invalidated.current) throw new Error('Reopen review to load your current table before continuing.');
    const identity = await api('/api/identity', 'IdentityView');
    if (owner.current && owner.current !== identity.playerId) {
      invalidateOwner(identity.playerId);
      throw new ApiFailure(
        'The signed-in player changed. Reopen review before continuing.',
        401,
        'UNAUTHENTICATED',
      );
    }
    owner.current = identity.playerId;
    return identity.playerId;
  }
  async function retryTrial() {
    if (backend === 'go') {
      if (!goPending || trialInFlight.current) return;
      const requestGeneration = generation.current;
      trialInFlight.current = true; setBusy(true); setError('');
      try {
        await verifyOwner();
        const decisionId = String(goPending.body.decisionId);
        await open(decisionId);
        if (!isCurrent(requestGeneration)) return;
        if (goPending.path === '/api/platform/advice') {
          const result = await executeGo('review', goPending.path, 'PlatformAdviceView', await restoreGoPending(goPending), owner.current!, goPending.gameId);
          if (!isCurrent(requestGeneration)) return;
          setAdvice(result.advice);
        } else {
          const result = await goTrial(goPending, true, reviewAbort.current.signal);
          if (!isCurrent(requestGeneration)) return;
          setTrial(result); setStep(0);
        }
        clearGoPending('review'); setGoPending(null);
      } catch (e) {
        if (isCurrent(requestGeneration)) {
          if (definiteFailure(e)) clearGoPending('review');
          setGoPending(readGoPending('review',owner.current!));
          setError(e instanceof Error ? e.message : 'Review request unavailable.');
        }
      }
      finally { trialInFlight.current = false; if (isCurrent(requestGeneration)) setBusy(false); }
      return;
    }
    if (!pendingTrial || trialInFlight.current) return;
    const requestGeneration = generation.current;
    trialInFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await verifyOwner();
      if (!isCurrent(requestGeneration)) return;
      const id = pendingCommandId(pendingTrial);
      let result: ReviewTrial | null = null;
      try {
        result = await api(`/api/review-trials/${encodeURIComponent(id)}`, 'ReviewTrial');
      } catch (e) {
        if (!isCurrent(requestGeneration)) return;
        if (!(e instanceof ApiFailure) || e.status !== 404) throw e;
      }
      if (!isCurrent(requestGeneration)) return;
      if (!result) {
        const fresh = await api('/api/session', 'SessionView');
        if (!isCurrent(requestGeneration)) return;
        const restored = trialRequest.current
          ? { ...pendingTrial.operation, body: trialRequest.current }
          : await restorePending(pendingTrial, fresh);
        if (!isCurrent(requestGeneration)) return;
        if (!restored || fresh.game.id !== pendingTrial.gameId) {
          clearPending('review', id);
          setPendingTrial(null);
          trialRequest.current = null;
          throw new Error(
            'The table or control changed. Reopen the original decision before choosing another continuation.',
          );
        }
        trialRequest.current = restored.body as TrialRequest;
        result = await api(restored.path, 'ReviewTrial', restored.body);
      }
      if (!isCurrent(requestGeneration)) return;
      setTrial(result);
      setStep(0);
      clearPending('review', id);
      setPendingTrial(null);
      trialRequest.current = null;
    } catch (e) {
      if (!isCurrent(requestGeneration)) return;
      if (definiteFailure(e) && e.status !== 404) {
        clearPending('review');
        setPendingTrial(null);
        trialRequest.current = null;
      }
      setError(e instanceof Error ? e.message : 'Continuation unavailable.');
    } finally {
      trialInFlight.current = false;
      if (isCurrent(requestGeneration)) setBusy(false);
    }
  }
  async function open(decisionId: string) {
    const requestGeneration = generation.current;
    setBusy(true);
    setError('');
    setTrial(null);
    setStep(0);
    setSourceAccess(null);
    setPendingCard(null);
    setAdvice(null);
    setPendingAdvice(false);
    try {
      await verifyOwner();
      if (!isCurrent(requestGeneration)) return;
      const result = await api(backend === 'go' ? `/api/platform/reviews/${encodeURIComponent(decisionId)}` : `/api/session/reviews/${encodeURIComponent(decisionId)}?step=0`, 'ReviewView');
      if (!isCurrent(requestGeneration)) return;
      setReview(result);
      const game = result.frames[0]?.game;
      if (game) {
        if (backend === 'go') {
          const access = await api(`/api/platform/reviews/${encodeURIComponent(decisionId)}/access`, 'PlatformReviewAccessView');
          if (isCurrent(requestGeneration)) {
            setGoAccess(access);
            setSourceAccess({canPlay:session.access.canPlay, canCoach:access.advice.allowed,
              remainingHands:access.advice.remaining, resetsAt:null, handUnlocked:access.unlocked,
              canStartWork:access.advice.allowed, localMock:true});
          }
          return;
        }
        const access = await api(
          `/api/coaching/access?handId=${encodeURIComponent(`${game.id}:${game.handNumber}`)}`,
          'CoachAccess',
        );
        if (isCurrent(requestGeneration)) setSourceAccess(access);
      }
    } catch (e) {
      if (!isCurrent(requestGeneration)) return;
      setReview(null);
      setError(e instanceof Error ? e.message : 'Replay unavailable.');
    } finally {
      if (isCurrent(requestGeneration)) setBusy(false);
    }
  }
  async function originalAdvice(unlock = false) {
    if (!review || busy || !sourceAccess) return;
    const requestGeneration = generation.current;
    const savedReadable = backend === 'go' && originalAdviceMode(goAccess) === 'saved';
    if (!savedReadable && !sourceAccess.handUnlocked && sourceAccess.remainingHands === 0) {
      setError('All coached hands are used today. You can still review your original play.');
      setPendingAdvice(false);
      return;
    }
    if (!savedReadable && !sourceAccess.handUnlocked && sourceAccess.remainingHands !== null && !unlock) {
      setPendingAdvice(true);
      setPendingCard(null);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await verifyOwner();
      if (!isCurrent(requestGeneration)) return;
      if (backend === 'go') {
        const result = await loadOriginalAdvice(goAccess,review.decisionId,()=>{
          const request = {...envelope(), decisionId:review.decisionId, requestedLevel:3 as const,
            unlock:unlock || (!sourceAccess.handUnlocked && sourceAccess.remainingHands === null)};
          return executeGo('review', '/api/platform/advice', 'PlatformAdviceView', request, owner.current!, request.gameId);
        });
        if (!isCurrent(requestGeneration)) return;
        setAdvice(result.advice); setPendingAdvice(false);
        const access = await api(`/api/platform/reviews/${encodeURIComponent(review.decisionId)}/access`, 'PlatformReviewAccessView');
        if (isCurrent(requestGeneration)) { setGoAccess(access); setSourceAccess({...sourceAccess, handUnlocked:access.unlocked}); }
        return;
      }
      const source = review.frames[0]?.game;
      if (!source) throw new Error('Original decision is unavailable.');
      const command = envelope();
      const result = await api('/api/coaching/hand-unlocks', 'HandUnlockView', {
        requestId: crypto.randomUUID(),
        gameId: source.id,
        handId: `${source.id}:${source.handNumber}`,
        decisionId: review.decisionId,
        expectedRevision: command.expectedRevision,
        requestedLevel: 3,
        controlLeaseToken: command.controlLeaseToken,
      });
      if (!isCurrent(requestGeneration)) return;
      setSourceAccess(result.access);
      setAdvice(result.advice);
      setPendingAdvice(false);
    } catch (e) {
      if (!isCurrent(requestGeneration)) return;
      if (backend === 'go') setGoPending(readGoPending('review', owner.current!));
      setError(e instanceof Error ? e.message : 'Original advice unavailable.');
    } finally {
      if (isCurrent(requestGeneration)) setBusy(false);
    }
  }
  async function alternative(card: string, unlock = false) {
    if (!review || busy || trialInFlight.current || pendingTrial || goPending || !sourceAccess) return;
    const requestGeneration = generation.current;
    setPendingAdvice(false);
    if (!sourceAccess.handUnlocked && sourceAccess.remainingHands !== null && !unlock) {
      setPendingCard(card);
      return;
    }
    setBusy(true);
    trialInFlight.current = true;
    setError('');
    try {
      const playerId = await verifyOwner();
      if (!isCurrent(requestGeneration)) return;
      if (backend === 'go') {
        if (!goAccess?.reviewAlternative.allowed) throw new Error('A continuation is unavailable for this original hand.');
        if (!sourceAccess.handUnlocked) {
          const issued = await executeGo('review', '/api/platform/advice', 'PlatformAdviceView',
            {...envelope(), decisionId:review.decisionId, requestedLevel:1, unlock:true}, playerId, session.game.id);
          if (!isCurrent(requestGeneration)) return;
          setSourceAccess({...sourceAccess, handUnlocked:issued.unlocked});
        }
        const source = review.frames[0]?.game;
        if (!source) throw new Error('Original decision is unavailable.');
        const request = {...envelope(), decisionId:review.decisionId, trialId:crypto.randomUUID(), alternativeCandidateId:reviewCandidate(source, card)};
        const stored = await storeGoPending('review', `/api/platform/reviews/${encodeURIComponent(review.decisionId)}/trials`, request, playerId, request.gameId);
        setPendingCard(null); setGoPending(stored);
        const result = await goTrial(stored, false, reviewAbort.current.signal);
        if (!isCurrent(requestGeneration)) return;
        setTrial(result); setGoPending(null); setStep(0);
        return;
      }
      if (!sourceAccess.handUnlocked) {
        const source = review.frames[0]?.game;
        if (!source) throw new Error('Original decision is unavailable.');
        const command = envelope();
        const result = await api('/api/coaching/hand-unlocks', 'HandUnlockView', {
          requestId: crypto.randomUUID(),
          gameId: source.id,
          handId: `${source.id}:${source.handNumber}`,
          decisionId: review.decisionId,
          expectedRevision: command.expectedRevision,
          requestedLevel: 1,
          controlLeaseToken: command.controlLeaseToken,
        });
        if (!isCurrent(requestGeneration)) return;
        setSourceAccess(result.access);
      }
      setPendingCard(null);
      const path = `/api/session/reviews/${encodeURIComponent(review.decisionId)}/trials`;
      const request: TrialRequest = {
        ...envelope(),
        decisionId: review.decisionId,
        trialId: crypto.randomUUID(),
        alternative: { kind: 'play', card: card as TrialRequest['alternative']['card'] },
      };
      trialRequest.current = request;
      const stored = await storePending('review', { path, body: request }, playerId, request.gameId);
      if (!isCurrent(requestGeneration)) {
        clearPending('review', request.commandId);
        return;
      }
      setPendingTrial(stored);
      const result = await api(path, 'ReviewTrial', request);
      if (!isCurrent(requestGeneration)) return;
      setTrial(result);
      clearPending('review', request.commandId);
      setPendingTrial(null);
      trialRequest.current = null;
      setStep(0);
    } catch (e) {
      if (!isCurrent(requestGeneration)) return;
      if (backend === 'go') setGoPending(readGoPending('review', owner.current!));
      if (definiteFailure(e)) {
        clearPending('review');
        setPendingTrial(null);
        trialRequest.current = null;
      }
      setError(e instanceof Error ? e.message : 'Continuation unavailable.');
    } finally {
      trialInFlight.current = false;
      if (isCurrent(requestGeneration)) setBusy(false);
    }
  }
  const frames = trial?.frames ?? review?.frames ?? [];
  const frame = frames[Math.min(step, Math.max(0, frames.length - 1))];
  const hands = [...new Set(index?.cases.map((item) => item.handNumber) ?? [])];
  return (
    <div className="review-panel">
      {error && <p role="alert">{error}</p>}
      {(pendingTrial || goPending) && (
        <button className="text-button" disabled={busy} onClick={() => void retryTrial()}>
          {goPending?.path === '/api/platform/advice' ? 'Retry same advice' : 'Retry same continuation'}
        </button>
      )}
      <label>
        Hand{' '}
        <select value={hand ?? ''} onChange={(e) => setHand(e.target.value ? Number(e.target.value) : null)}>
          <option value="">All hands</option>
          {hands.map((number) => (
            <option key={number} value={number}>
              {number}
            </option>
          ))}
        </select>
      </label>
      <div className="review-choices">
        {index?.cases
          .filter((item) => hand === null || item.handNumber === hand)
          .map((item) => (
            <button
              key={item.decisionId}
              className="text-button"
              disabled={busy}
              onClick={() => void open(item.decisionId)}
            >
              Hand {item.handNumber}: {item.summary} {item.assisted ? '· help issued' : ''}
            </button>
          ))}
        {index?.cases.length === 0 && <p>No plays to review yet.</p>}
      </div>
      {frame && (
        <section className="review-evidence">
          <h3>{trial ? 'Possible continuation' : 'Original'}</h3>
          {trial && <p>Sampled play. Live game unchanged.</p>}
          <p>Hand {frame.game.handNumber}</p>
          <h4>What you knew</h4>
          <p>Your cards: {frame.game.hand.map(cardLabel).join(', ')}</p>
          <p>
            Visible trick:{' '}
            {frame.game.trick.map((play) => `Seat ${play.seat}: ${cardLabel(play.card)}`).join('; ') ||
              'No cards played'}
          </p>
          {!trial && step === 0 && sourceAccess && (
            <section aria-label="Original coach advice">
              {advice ? (
                <>
                  <h4>Advice at your decision</h4>
                  <p>
                    {advice.focus}: {advice.notice}
                  </p>
                  <p>{advice.reason}</p>
                  <p>{advice.suggestion}</p>
                </>
              ) : (
                <button className="text-button" disabled={busy || (backend === 'go' && originalAdviceMode(goAccess) === 'unavailable')} onClick={() => void originalAdvice()}>
                  Show original coach advice
                </button>
              )}
              {pendingAdvice && (
                <div className="fixture-notice">
                  <p>
                    Use one coached hand to reveal its saved advice. This keeps the original help record
                    unchanged.
                  </p>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void originalAdvice(true)}
                  >
                    Use coached hand
                  </button>
                  <button className="text-button" disabled={busy} onClick={() => setPendingAdvice(false)}>
                    Not now
                  </button>
                </div>
              )}
            </section>
          )}
          {frame.notes.length > 0 && (
            <details>
              <summary>Details</summary>
              {frame.notes.map((note, position) => (
                <p key={position}>{note}</p>
              ))}
            </details>
          )}
          <div className="review-navigation">
            <button
              className="text-button"
              disabled={step === 0 || busy}
              onClick={() => setStep((value) => value - 1)}
            >
              Previous
            </button>
            <span>
              {step + 1} / {frames.length}
            </span>
            <button
              className="text-button"
              disabled={step + 1 >= frames.length || busy}
              onClick={() => setStep((value) => value + 1)}
            >
              Next
            </button>
          </div>
          {trial ? (
            <button
              className="text-button"
              onClick={() => {
                setTrial(null);
                setStep(0);
              }}
            >
              Back to Original
            </button>
          ) : (
            sourceAccess &&
            (backend === 'go' ? goAccess?.reviewAlternative.allowed : session.access.canPlay) &&
            frame.game.legalActions.some((action) => action.kind === 'play') && (
              <details>
                <summary>Explore another card</summary>
                <div className="review-alternatives">
                  {frame.game.legalActions.flatMap((action) =>
                    action.kind === 'play'
                      ? [
                          <button
                            key={action.card}
                            className="text-button"
                            disabled={busy || !!pendingTrial}
                            onClick={() => void alternative(action.card)}
                          >
                            {cardLabel(action.card)}
                          </button>,
                        ]
                      : [],
                  )}
                </div>
              </details>
            )
          )}
          {pendingCard && (
            <div className="fixture-notice">
              <p>Unlock help for this hand only.</p>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void alternative(pendingCard, true)}
              >
                Use coached hand
              </button>
              <button className="text-button" disabled={busy} onClick={() => setPendingCard(null)}>
                Not now
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
