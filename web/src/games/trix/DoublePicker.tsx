import { doubleCandidate, type TrixCandidate } from './adapter.ts';
import type { Card } from '../../../shared/contracts.ts';
import { CardFace } from '../../table/CardPrimitives';
import { cardLabel } from '../../api/display';

/** Hand selection stays interactive; this small table prompt only previews it. */
export function DoublePicker({ candidates, selected, disabled, onConfirm }: {
  candidates: readonly TrixCandidate[]; selected: Card[]; disabled: boolean;
  onConfirm: (id: string) => void;
}) {
  const candidate = doubleCandidate(candidates, selected);
  const pass = doubleCandidate(candidates, []);
  return <aside className="trix-double-picker" aria-label="Double?">
    {selected.length > 0 && <div className="trix-double-preview" aria-label="Selected doubles">
      {selected.map(card => <span key={card} role="img" aria-label={cardLabel(card)}><CardFace card={card} /></span>)}
    </div>}
    <div className="trix-double-actions">
      <b>Double?</b>
      <button className="primary-button" disabled={disabled || !selected.length || !candidate}
        onClick={() => candidate && onConfirm(candidate.id)}>Double</button>
      <button className="subtle-button" disabled={disabled || !pass}
        onClick={() => pass && onConfirm(pass.id)}>Pass</button>
    </div>
  </aside>;
}
