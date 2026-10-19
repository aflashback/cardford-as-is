import type { TrixCandidate } from './adapter.ts';
import { requestLabel } from './adapter.ts';
export function RequestPicker({
  candidates,
  disabled,
  onChoose,
}: {
  candidates: readonly TrixCandidate[];
  disabled: boolean;
  onChoose: (id: string) => void;
}) {
  return (
    <section className="trix-request-picker" aria-label="Choose a request">
      <h2>Choose a game</h2>
      <div className="trix-request-options">
        {candidates.map(
          (c) =>
            c.public.kind === 'choose-request' && (
              <button key={c.id} disabled={disabled} onClick={() => onChoose(c.id)}>
                <strong>{requestLabel(c.public.request)}</strong>
              </button>
            ),
        )}
      </div>
    </section>
  );
}
