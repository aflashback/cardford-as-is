import { useEffect, useRef, useState } from 'react';
import type { TrixObservation } from '../../../shared/local-service.contracts';
import { completedTrickDelay } from '../../table/playback';

/** Show the server's collected four-card trick before exposing the next decision.
 * This is presentation only: no rules, scoring, receipt or persisted phase changes.
 */
export function useTrickPlayback(observation: TrixObservation, paused: boolean, speed: number, nativeHeld?: boolean) {
  const key = `${observation.id}:${observation.dealNumber}`;
  const latest = observation.tricks[observation.tricks.length - 1];
  const [seen, setSeen] = useState({ key, number: latest?.number ?? 0 });
  // A recovery snapshot may already contain the next lead. Keep the collected
  // public trick until it has been presented, rather than treating that lead as
  // proof that the player saw the fourth card.
  const waiting = seen.key === key ? observation.tricks.find(trick => trick.number > seen.number) : undefined;
  const clock = useRef({ key: '', remaining: 0 });
  useEffect(() => {
    if (seen.key !== key)
      setSeen({ key, number: latest?.number ?? 0 });
  }, [key, latest?.number, observation.trick.length, seen.key, seen.number]);
  useEffect(() => {
    // The native queue owns a single paint-acknowledged clock for cards,
    // controls and pending frames. Do not race it with another local timer.
    if (nativeHeld !== undefined) return;
    if (!waiting) return;
    const trickKey = `${key}:${waiting.number}`;
    if (clock.current.key !== trickKey) clock.current = { key: trickKey, remaining: completedTrickDelay(speed) };
    if (paused) return;
    let started: number | undefined;
    let timer: number | undefined;
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        started = performance.now();
        timer = window.setTimeout(() => setSeen({ key, number: waiting.number }), clock.current.remaining);
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      if (started !== undefined)
        clock.current.remaining = Math.max(0, clock.current.remaining - (performance.now() - started));
    };
  }, [key, waiting?.number, paused, speed, nativeHeld]);
  return nativeHeld === undefined ? waiting : nativeHeld ? latest : undefined;
}
