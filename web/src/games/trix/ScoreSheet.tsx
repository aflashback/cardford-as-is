import type { TrixObservation } from '../../../shared/local-service.contracts.ts';
import { playerNames } from './adapter.ts';
export function scoreName(score: { seats: number[] }): string {
  return score.seats.map((seat) => playerNames[seat]).join(' + ');
}
export function ScoreSheet({ observation: o }: {
  observation: Pick<TrixObservation, 'totals' | 'requestTotals' | 'kingdomTotals'>;
}) {
  return (
    <section className="trix-score-sheet" aria-label="Trix scores">
      <table>
        <thead>
          <tr>
            <th scope="col">{o.totals[0]?.seats.length === 2 ? 'Team' : 'Player'}</th>
            <th scope="col">Current</th>
            <th scope="col">Kingdom</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {o.totals.map((s) => (
            <tr key={s.id} className={s.seats.includes(0) ? 'trix-your-score' : ''}>
              <th scope="row">{scoreName(s)}</th>
              <td>{o.requestTotals.find((x) => x.id === s.id)?.total ?? 0}</td>
              <td>{o.kingdomTotals.find((x) => x.id === s.id)?.total ?? 0}</td>
              <td>
                <strong>{s.total}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
