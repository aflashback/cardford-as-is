import { useEffect, useRef, useState } from 'react';
import type { TrixRoundIndex, TrixRoundHistory } from '../../../shared/local-service.contracts';
import { api } from '../../api/client';
import { cardLabel } from '../../api/display';
import { playerNames, requestLabel } from './adapter';
import { ScoreSheet, scoreName } from './ScoreSheet';

function recipientName(entry: TrixRoundHistory['ledger'][number], scores: TrixRoundHistory['totals']) {
  const recipient = entry.recipient;
  return recipient.kind === 'seat' ? playerNames[recipient.seat]
    : scoreName(scores.find(s => s.id === recipient.competitor) ?? { seats: [] });
}

// Mounted only by an explicit history click. Scores and immutable breakdowns
// come from the native server; the live observation has no score ledger.
export function RoundHistory({ gameId }: { gameId: string }) {
  const [index, setIndex] = useState<TrixRoundIndex | null>(null);
  const [round, setRound] = useState<TrixRoundHistory | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const detail = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    setError('');
    // Let a cancelled mount settle before starting I/O (including Strict Mode
    // effect rehearsal); reopening still reads the current completed rounds.
    void Promise.resolve().then(async () => {
        if (abort.signal.aborted) return;
        const value = await api('/api/platform/rounds', 'TrixRoundIndex', undefined, 'GET', abort.signal);
        if (value.gameId !== gameId) throw new Error('This history belongs to another game.');
        if (!abort.signal.aborted) setIndex(value);
      }).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'History unavailable.'); });
    return () => { abort.abort(); detail.current?.abort(); };
  }, [gameId, attempt]);
  async function open(id: string) {
    detail.current?.abort();
    const abort = new AbortController();
    detail.current = abort;
    setBusy(true); setError(''); setRound(null);
    try {
      const value = await api(`/api/platform/rounds/${encodeURIComponent(id)}`, 'TrixRoundHistory', undefined, 'GET', abort.signal);
      if (value.gameId !== gameId || value.round.id !== id) throw new Error('This breakdown does not match the selected round.');
      if (!abort.signal.aborted) setRound(value);
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Breakdown unavailable.');
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <section className="trix-round-history" aria-label="Round history" aria-busy={busy || (!index && !error)}>
    {error && <p role="alert">{error} <button className="text-button" onClick={() => setAttempt(n => n + 1)}>Retry</button></p>}
    {!index && !error && <p role="status">Loading…</p>}
    {index && <div className="trix-round-list">{index.rounds.map(saved => <button key={saved.id}
      className="subtle-button" aria-pressed={round?.round.id === saved.id} onClick={() => void open(saved.id)}>
      Round {saved.dealNumber} · {requestLabel(saved.request)}
    </button>)}</div>}
    {busy && <p role="status">Loading…</p>}
    {round && <>
      <h3>Round {round.round.dealNumber} · {requestLabel(round.round.request)}</h3>
      <ScoreSheet observation={round} />
      <table className="trix-breakdown" aria-label="Score breakdown"><thead><tr>
        <th scope="col">Player</th><th scope="col">Card / play</th><th scope="col">Points</th>
      </tr></thead><tbody>{round.ledger.map((entry, i) => <tr key={i}>
        <td>{recipientName(entry, round.totals)}</td>
        <td>{entry.card ? cardLabel(entry.card) : entry.finish ? `Finish ${entry.finish}` : `Trick ${entry.trick}`}
          {entry.component === 'double-bonus' ? ' · double bonus' : ''}</td>
        <td>{entry.delta > 0 ? '+' : ''}{entry.delta}</td>
      </tr>)}</tbody></table>
      {round.withheldBonuses.map(bonus => <p key={bonus.declarationRef + bonus.card}>
        {cardLabel(bonus.card)} · +{bonus.bonusValue} unassigned
      </p>)}
    </>}
  </section>;
}
