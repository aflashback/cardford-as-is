import { useEffect, useState } from 'react';
import type {
  CoachAccess,
  CommandEnvelope,
  ReviewIndex,
  ReviewTrial,
  ReviewView,
  SessionView,
} from '../../shared/contracts';
import { api } from '../api/client';
import { cardLabel } from '../api/display';

export function ReviewPanel({
  session,
  envelope,
}: {
  session: SessionView;
  envelope: () => CommandEnvelope;
}) {
  const [index, setIndex] = useState<ReviewIndex | null>(null);
  const [review, setReview] = useState<ReviewView | null>(null);
  const [trial, setTrial] = useState<ReviewTrial | null>(null);
  const [step, setStep] = useState(0);
  const [hand, setHand] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sourceAccess, setSourceAccess] = useState<CoachAccess | null>(null);
  const [pendingCard, setPendingCard] = useState<string | null>(null);
  useEffect(() => {
    void api('/api/session/reviews?scope=match', 'ReviewIndex')
      .then(setIndex)
      .catch((e) => setError(e instanceof Error ? e.message : 'Replay unavailable.'));
  }, []);
  async function open(decisionId: string) {
    setBusy(true);
    setError('');
    setTrial(null);
    setStep(0);
    setSourceAccess(null);
    setPendingCard(null);
    try {
      const result = await api(`/api/session/reviews/${encodeURIComponent(decisionId)}?step=0`, 'ReviewView');
      setReview(result);
      const game = result.frames[0]?.game;
      if (game)
        setSourceAccess(
          await api(
            `/api/coaching/access?handId=${encodeURIComponent(`${game.id}:${game.handNumber}`)}`,
            'CoachAccess',
          ),
        );
    } catch (e) {
      setReview(null);
      setError(e instanceof Error ? e.message : 'Replay unavailable.');
    } finally {
      setBusy(false);
    }
  }
  async function alternative(card: string, unlock = false) {
    if (!review || busy || !sourceAccess) return;
    if (!sourceAccess.handUnlocked && sourceAccess.remainingHands !== null && !unlock) {
      setPendingCard(card);
      return;
    }
    setBusy(true);
    setError('');
    try {
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
        setSourceAccess(result.access);
      }
      setPendingCard(null);
      setTrial(
        await api(`/api/session/reviews/${encodeURIComponent(review.decisionId)}/trials`, 'ReviewTrial', {
          ...envelope(),
          decisionId: review.decisionId,
          trialId: crypto.randomUUID(),
          alternative: { kind: 'play', card },
        }),
      );
      setStep(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Continuation unavailable.');
    } finally {
      setBusy(false);
    }
  }
  const frames = trial?.frames ?? review?.frames ?? [];
  const frame = frames[Math.min(step, Math.max(0, frames.length - 1))];
  const hands = [...new Set(index?.cases.map((item) => item.handNumber) ?? [])];
  return (
    <div className="review-panel">
      <p>Your live table is paused. Review does not change its cards or score.</p>
      {error && <p role="alert">{error}</p>}
      <label>
        Hand{' '}
        <select value={hand ?? ''} onChange={(e) => setHand(e.target.value ? Number(e.target.value) : null)}>
          <option value="">All current-game hands</option>
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
        {index?.cases.length === 0 && <p>No recorded choices yet. Play a turn to begin.</p>}
      </div>
      {frame && (
        <section className="review-evidence">
          <h3>{trial ? 'Possible continuation' : 'Original'}</h3>
          {trial && <p>A sampled possibility, not a prediction or a new live result.</p>}
          <p>
            Hand {frame.game.handNumber} · {frame.game.phase}
          </p>
          <h4>What you knew</h4>
          <p>Your cards: {frame.game.hand.map(cardLabel).join(', ')}</p>
          <p>
            Visible trick:{' '}
            {frame.game.trick.map((play) => `Seat ${play.seat}: ${cardLabel(play.card)}`).join('; ') ||
              'No cards played'}
          </p>
          {frame.notes.map((note, position) => (
            <p key={position}>{note}</p>
          ))}
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
            session.access.canPlay &&
            frame.game.legalActions.some((action) => action.kind === 'play') && (
              <details>
                <summary>Explore another card</summary>
                <p>This is separate from your live game.</p>
                <div className="review-alternatives">
                  {frame.game.legalActions.flatMap((action) =>
                    action.kind === 'play'
                      ? [
                          <button
                            key={action.card}
                            className="text-button"
                            disabled={busy}
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
              <p>Use one coached hand for this reviewed hand? This will not unlock other hands.</p>
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
