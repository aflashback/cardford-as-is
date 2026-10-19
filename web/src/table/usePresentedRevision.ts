import { useEffect } from 'react';

/** Acknowledge a displayed revision after the table has had a paint opportunity.
 * Wire revisions stay current; this only starts the presentation queue's dwell.
 */
export function usePresentedRevision(frame: {revision: number}, notePresented?: (revision: number) => void) {
  useEffect(() => {
    if (!notePresented) return;
    let animationFrame = requestAnimationFrame(() => {
      animationFrame = requestAnimationFrame(() => notePresented(frame.revision));
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [frame, notePresented]);
}
