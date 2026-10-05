import { array, object, string } from './codec.ts';

export type Seat = 0 | 1 | 2 | 3;
export const SEATS: readonly Seat[] = Object.freeze([0, 1, 2, 3]);
export type Competition = {
  mode: 'individual' | 'partnership';
  competitors: { id: string; seats: Seat[] }[];
};
export type Controller = { seat: Seat; kind: 'human' | 'computer' };
export function assertSeat(raw: unknown): asserts raw is Seat {
  if (raw !== 0 && raw !== 1 && raw !== 2 && raw !== 3) throw new TypeError('Invalid seat.');
}
export function parseCompetition(raw: unknown): Competition {
  object(raw, ['mode', 'competitors']);
  if (raw.mode !== 'individual' && raw.mode !== 'partnership')
    throw new TypeError('Unsupported competition mode.');
  array(raw.competitors);
  const competitors = raw.competitors.map((item) => {
    object(item, ['id', 'seats']);
    string(item.id);
    array(item.seats);
    const seats = item.seats.map((seat) => {
      assertSeat(seat);
      return seat;
    });
    return { id: item.id, seats };
  });
  const seats = competitors.flatMap((item) => item.seats);
  if (
    seats.length !== 4 ||
    new Set(seats).size !== 4 ||
    new Set(competitors.map((item) => item.id)).size !== competitors.length ||
    competitors.some((item) => item.seats.length !== (raw.mode === 'individual' ? 1 : 2))
  )
    throw new TypeError('Invalid four-seat competition.');
  return { mode: raw.mode, competitors };
}
export function validateCompetition(raw: Competition): void {
  parseCompetition(raw);
}
/** Only the existing practice control arrangement is activated by this contract. */
export function parseControllers(raw: unknown): readonly Controller[] {
  array(raw);
  const result = raw.map((item): Controller => {
    object(item, ['seat', 'kind']);
    assertSeat(item.seat);
    if (item.kind !== 'human' && item.kind !== 'computer') throw new TypeError('Invalid controller.');
    return { seat: item.seat, kind: item.kind };
  });
  if (
    result.length !== 4 ||
    new Set(result.map((item) => item.seat)).size !== 4 ||
    result.some((item) => item.kind !== (item.seat === 0 ? 'human' : 'computer'))
  )
    throw new TypeError('Only a four-seat South-human practice table is installed.');
  return result;
}
