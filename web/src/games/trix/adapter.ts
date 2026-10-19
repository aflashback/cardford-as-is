import type {
  Card,
  TrixAction,
  TrixObservation,
  TrixPresentation,
} from '../../../shared/local-service.contracts.ts';

export type TrixCandidate = { id: string; public: TrixAction };
export { playerNames } from '../../api/display.ts';
export const trixModes = [
  'trix-basic-solo',
  'trix-basic-partners',
  'trix-complex-solo',
  'trix-complex-partners',
] as const;
export function requestLabel(request: string | null): string {
  return request === null
    ? 'Choose a request'
    : ({
        diamonds: 'Diamonds',
        lutoosh: 'Lutoosh',
        queens: 'Queens',
        king: 'The King',
        complex: 'All combined',
        trix: 'Trix Jacks',
      }[request] ?? request);
}
export function requestGoal(request: string | null): string {
  return (
    {
      diamonds: 'Avoid taking diamonds · −10 each',
      lutoosh: 'Avoid taking tricks · −15 each',
      queens: 'Avoid taking queens · −25 each',
      king: 'Avoid taking the King of Hearts · −75',
      complex: 'Avoid diamonds, queens, the King of Hearts and tricks',
      trix: 'Open with Jacks, then place adjacent cards · finish early',
    }[request ?? ''] ?? 'Your kingdom owner chooses from the remaining requests.'
  );
}
export function variantLabel(variant: string): string {
  return `${variant.startsWith('complex') ? 'Complex' : 'Basic'} · ${variant.endsWith('partners') ? 'Partners' : 'Solo'}`;
}
export function eligibleDoubles(candidates: readonly TrixCandidate[]): Card[] {
  return [
    ...new Set(
      candidates.flatMap((c) => (c.public.kind === 'declare-doubles' ? (c.public.cards ?? []) : [])),
    ),
  ];
}
export function doubleCandidate(
  candidates: readonly TrixCandidate[],
  selected: readonly Card[],
): TrixCandidate | undefined {
  if (new Set(selected).size !== selected.length) return undefined;
  const matches = candidates.filter(
    (c) =>
      c.public.kind === 'declare-doubles' &&
      (c.public.cards ?? []).length === selected.length &&
      (c.public.cards ?? []).every((card) => selected.includes(card)),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
export function cardCandidate(candidates: readonly TrixCandidate[], card: Card): TrixCandidate | undefined {
  const matches = candidates.filter(
    (c) => (c.public.kind === 'play-card' || c.public.kind === 'layout-card') && c.public.card === card,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
export function boardCards(row: { suit: string; low: number; high: number }): Card[] {
  if (row.low === 0 || row.high === 0) return [];
  return Array.from(
    { length: row.high - row.low + 1 },
    (_, i) =>
      `${row.suit}${({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[row.low + i] ?? row.low + i}`,
  );
}
/** Name tags show only points the server ledger assigns to this player this deal.
 * Team-only bonuses remain in the team totals; they are never duplicated or split. */
export function seatRequestScore(observation: Pick<TrixObservation, 'dealNumber' | 'ledger' | 'requestSeatTotals'>, seat: number): number {
  if (observation.requestSeatTotals) return observation.requestSeatTotals[seat] ?? 0;
  // Original saved observations retain their ledger rather than live totals.
  return observation.ledger.reduce((total, entry) => total + (
    entry.dealNumber === observation.dealNumber && entry.recipient.kind === 'seat' && entry.recipient.seat === seat
      ? entry.delta : 0
  ), 0);
}
/** Only the server projection reveals owners/cards; the board removes played duplicates. */
export function seatTwoAnnouncements(observation: TrixObservation, seat: number) {
  const announcement = observation.twoAnnouncements;
  if (!observation.variantId.endsWith('partners') || observation.request !== 'trix' || !announcement)
    return null;
  if (announcement.status === 'hidden')
    return { status: 'hidden' as const, count: announcement.counts[seat] };
  const placed = new Set(observation.board.flatMap(boardCards));
  return {
    status: 'revealed' as const,
    cards: announcement.cards
      .filter((entry) => entry.seat === seat && !placed.has(entry.card))
      .map((entry) => entry.card),
  };
}
/** The view is safe only after the generated transport validator and registered binding agree. */
export function bindTrixPresentation(
  value: TrixPresentation,
  instanceId: string,
  variantId: string,
  seat: number,
  phase: string,
  observation: TrixObservation,
): TrixPresentation {
  if (
    seat !== 0 ||
    value.id !== instanceId ||
    value.gameId !== 'trix' ||
    value.variantId !== variantId ||
    value.seat !== seat ||
    value.observation.id !== instanceId ||
    value.observation.variantId !== variantId ||
    value.observation.seat !== seat ||
    value.observation.phase !== phase ||
    JSON.stringify(value.observation) !== JSON.stringify(observation)
  )
    throw new Error('The Trix table does not match its registered session.');
  return value;
}
