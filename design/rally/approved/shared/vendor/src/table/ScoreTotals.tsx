import type { Seat } from '../../shared/contracts';
import { playerNames } from './CardPrimitives';
import './score-totals.css';

const compass: Record<Seat, string> = { 0: 'South', 1: 'West', 2: 'North', 3: 'East' };
const order: readonly Seat[] = [2, 1, 3, 0];
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 0 });

/** Display confirmed competitor totals; the game supplies membership and score direction. */
export function ScoreTotals({ scores, direction }: {
  scores: readonly { id: string; seats: readonly Seat[]; total: number }[];
  direction: 'higher' | 'lower';
}) {
  const best = (direction === 'higher' ? Math.max : Math.min)(...scores.map(score => score.total));
  const leaders = scores.filter(score => score.total === best).length;
  return <aside className="table-totals" aria-label="Game score totals">
    <ul className="table-total-list">
      {order.map(seat => {
        const score = scores.find(score => score.seats.includes(seat));
        if (!score) return null;
        const status = score.total !== best ? 'trailing' : leaders === 1 ? 'leading' : 'tied';
        const description = `${compass[seat]} (${playerNames[seat]}), game ${score.seats.length > 1 ? 'team ' : ''}total ${score.total}, ${status === 'tied' ? 'tied for lead' : status}`;
        return <li key={seat} className={`table-total total-position-${seat} total-${status}`} data-seat={seat} title={description}>
          <strong aria-hidden="true">{Math.abs(score.total) < 10_000 ? score.total : compact.format(score.total)}</strong>
          <span className="sr-only">{description}</span>
        </li>;
      })}
    </ul>
  </aside>;
}
