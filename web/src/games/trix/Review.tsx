import { useEffect, useRef, useState } from 'react';
import type {
  ReviewIndex,
  ReviewView,
  TrixAdvice,
  TrixReviewFrame,
} from '../../../shared/local-service.contracts.ts';
import { api } from '../../api/client.ts';
import { onAuthInvalidated } from '../../api/authLifecycle.ts';
import { cardLabel } from '../../api/display.ts';
import { LayoutBoard } from './LayoutBoard.tsx';
import { ScoreSheet } from './ScoreSheet.tsx';
import { playerNames, requestLabel } from './adapter.ts';
export function TrixReview() {
  const [index, setIndex] = useState<ReviewIndex | null>(null),
    [review, setReview] = useState<ReviewView | null>(null),
    [step, setStep] = useState(0),
    [advice, setAdvice] = useState<TrixAdvice | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const invalidated = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    const request = generation.current;
    const disconnectAuth = onAuthInvalidated(() => {
      generation.current++;
      invalidated.current = true;
      abort.abort();
      setIndex(null); setReview(null); setAdvice(null); setStep(0); setBusy(false);
      setError('The signed-in session ended. Reconnect before continuing.');
    });
    void api('/api/platform/reviews', 'ReviewIndex', undefined, 'GET', abort.signal)
      .then((value) => { if (!invalidated.current && request === generation.current) setIndex(value); })
      .catch((e) => {
        if (!abort.signal.aborted && !invalidated.current && request === generation.current)
          setError(e instanceof Error ? e.message : 'Review unavailable.');
      });
    return () => {
      disconnectAuth();
      abort.abort();
      generation.current++;
    };
  }, []);
  async function open(id: string) {
    if (invalidated.current) return;
    const request = ++generation.current;
    setBusy(true);
    setError('');
    setAdvice(null);
    setStep(0);
    try {
      const value = await api(`/api/platform/reviews/${encodeURIComponent(id)}`, 'ReviewView');
      if (!invalidated.current && request === generation.current) setReview(value);
    } catch (e) {
      if (!invalidated.current && request === generation.current) setError(e instanceof Error ? e.message : 'Review unavailable.');
    } finally {
      if (!invalidated.current && request === generation.current) setBusy(false);
    }
  }
  async function savedAdvice() {
    if (!review || invalidated.current) return;
    const request = generation.current;
    setBusy(true);
    setError('');
    try {
      const value = await api(
        `/api/platform/reviews/${encodeURIComponent(review.decisionId)}/advice`,
        'PlatformAdviceView',
      );
      if (!('gameId' in value.advice) || value.advice.gameId !== 'trix')
        throw new Error('The saved hint belongs to another game.');
      if (!invalidated.current && request === generation.current) setAdvice(value.advice);
    } catch (e) {
      if (!invalidated.current && request === generation.current)
        setError(e instanceof Error ? e.message : 'No saved hint was revealed for this decision.');
    } finally {
      if (!invalidated.current && request === generation.current) setBusy(false);
    }
  }
  const frames = (review?.frames ?? []).filter(
      (f): f is TrixReviewFrame => 'gameId' in f.game && f.game.gameId === 'trix',
    ),
    frame = frames[Math.min(step, Math.max(0, frames.length - 1))],
    o = frame?.game.observation;
  const cases = index?.cases.filter((c) => !['play', 'bid', 'pass'].includes(c.action.kind)) ?? [];
  return (
    <section className="trix-review" aria-label="Saved Trix decisions">
      <p>Original information and saved cues from your decisions.</p>
      {error && <p role="alert">{error}</p>}
      <label>
        Decision{' '}
        <select
          value={review?.decisionId ?? ''}
          disabled={busy || invalidated.current}
          onChange={(e) => e.target.value && void open(e.target.value)}
        >
          <option value="">Choose a saved decision</option>
          {cases.map((c) => (
            <option key={c.decisionId} value={c.decisionId}>
              Deal {c.handNumber}: {c.summary}
              {c.assisted ? ' · cue revealed' : ''}
            </option>
          ))}
        </select>
      </label>
      {index && cases.length === 0 && <p>No saved Trix decisions yet.</p>}
      {o && (
        <>
          <h3>
            Original · {requestLabel(o.request)} · Deal {o.dealNumber}
          </h3>
          <p>
            Phase: {o.phase.replace(/-/g, ' ')} ·{' '}
            {o.turn === null ? 'Request finished' : `${playerNames[o.turn]} to act`}
          </p>
          <p>Your cards: {o.hand.map(cardLabel).join(', ') || 'None left'}</p>
          {o.phase === 'layout' ? (
            <div className="trix-review-board">
              <LayoutBoard board={o.board} partners={o.variantId.endsWith('partners')} />
            </div>
          ) : (
            <p>
              Visible trick:{' '}
              {o.trick.map((p) => `${playerNames[p.seat]}: ${cardLabel(p.card)}`).join('; ') ||
                'No cards played'}
            </p>
          )}
          {frame?.notes.map((note, i) => (
            <p key={i}>{note}</p>
          ))}
          <div className="review-navigation">
            <button
              className="text-button"
              disabled={busy || step === 0}
              onClick={() => setStep((s) => s - 1)}
            >
              Previous
            </button>
            <span>
              {step + 1} / {frames.length}
            </span>
            <button
              className="text-button"
              disabled={busy || step + 1 >= frames.length}
              onClick={() => setStep((s) => s + 1)}
            >
              Next
            </button>
          </div>
          {advice ? (
            <section aria-label="Original saved coach cue">
              <h4>{advice.title}</h4>
              <p>{advice.text}</p>
              <small>
                {advice.origin === 'forced' ? 'Forced move' : 'Saved code hint'} · {advice.policyVersion}
              </small>
            </section>
          ) : (
            <button className="text-button" disabled={busy} onClick={() => void savedAdvice()}>
              Show saved coach cue
            </button>
          )}
          <details>
            <summary>Scores at this moment</summary>
            <ScoreSheet observation={o} />
          </details>
        </>
      )}
    </section>
  );
}
