import { useCallback, useEffect, useRef, useState } from 'react';
import type { DemoFrame, DemoFrameRequest } from '../../shared/contracts';
import { api, ApiFailure } from '../api/client';
import { cardSuit } from '../api/display';

// The version identifies installed content; the authored graph stays on the server.
const contentVersion = 'spades-example-1.0.0';
const suits = { C: '♣', D: '♦', H: '♥', S: '♠' };
export function DemoPage() {
  const [frame, setFrame] = useState<DemoFrame | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const pending = useRef<DemoFrameRequest>({ kind: 'open', contentVersion });
  const sequence = useRef(0);
  const active = useRef<AbortController | null>(null);
  const request = useCallback(async (body: DemoFrameRequest) => {
    const ticket = ++sequence.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    pending.current = body;
    setBusy(true);
    setFailed(false);
    setUnavailable(false);
    try {
      const next = await api('/api/demo/frame', 'DemoFrame', body, 'POST', controller.signal);
      if (ticket !== sequence.current) return;
      if (next.contentVersion !== contentVersion) throw new Error('Unsupported demo version');
      setFrame(next);
    } catch (error) {
      if (ticket === sequence.current) {
        setFailed(true);
        setUnavailable(error instanceof ApiFailure && error.status === 404);
      }
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    void request({ kind: 'open', contentVersion });
    return () => { ++sequence.current; active.current?.abort(); };
  }, [request]);
  return (
    <main className="account-page demo-page">
      <header>
        <a className="wordmark" href="#">
          CardFord
        </a>
        <a className="text-button" href="#account">
          Account
        </a>
      </header>
      <p className="fixture-notice">Example game · fixed authored demo</p>
      <section className="account-section" aria-busy={busy}>
        <h1>{frame?.title ?? 'A short example game'}</h1>
        {frame && <>
        <div className="demo-cards" aria-label="Example cards">
          {frame.cards.map(card => <span key={card}>{card.slice(1)}{suits[cardSuit(card)]}</span>)}
        </div>
        <p>{frame.body}</p>
        <div className="demo-actions">
          {frame.choices.map(choice => (
            <button className="primary-button" key={choice.id} disabled={busy || failed}
              onClick={() => void request(frame.complete
                ? { kind: 'replay', contentVersion }
                : { kind: 'choose', contentVersion, nodeId: frame.nodeId, choiceId: choice.id })}>
              {choice.label}
            </button>
          ))}
        </div>
        </>}
        {busy && <p role="status">Connecting to the example…</p>}
        {failed && <div role="alert">
          <p>{unavailable ? 'The online example is not available on this service yet.' : 'Connection lost. Reconnect to continue the example.'}</p>
          {!unavailable && <button className="primary-button" onClick={() => void request(pending.current)}>Reconnect</button>}
        </div>}
      </section>
      <a className="text-button" href="#account">
        View membership
      </a>
    </main>
  );
}
