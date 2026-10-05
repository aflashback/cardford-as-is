/** Private domain types. HTTP DTOs are generated separately from public schemas. */
export type Mode = 'hearts' | 'spades-solo' | 'spades-partners';
import type { Seat } from './seats.ts';
export type { Seat } from './seats.ts';
export type Card = string;
export type Suit = 'C' | 'D' | 'H' | 'S';
export type Four<T> = [T, T, T, T];
export type Phase = 'pass' | 'bid' | 'play' | 'trick-end' | 'hand-end' | 'match-end';
export type Play = { seat: Seat; card: Card };
export type Trick = { plays: Play[]; winner: Seat };
export type GameAction =
  | { kind: 'play'; seat: Seat; card: Card }
  | { kind: 'bid'; seat: Seat; bid: number }
  | { kind: 'pass'; seat: Seat; cards: Card[] };
export type AcceptedAction =
  Exclude<GameAction, { kind: 'pass' }> | { kind: 'pass-bundle'; passes: Four<Card[]> };
export type PassMemory = { outgoing: Card[]; incoming: Card[]; to: Seat | null; from: Seat | null };
export type HandResult = { points: number[]; bags: number[]; winner?: Seat };
export type GameEvent = {
  id: number;
  type:
    | 'hand-started'
    | 'bid-placed'
    | 'card-played'
    | 'cards-passed'
    | 'trick-resolved'
    | 'trick-collected'
    | 'moon-shot'
    | 'hand-scored';
  message: string;
  seat?: Seat;
  card?: Card;
  bid?: number;
};
export type GameConfig = { id: string; mode: Mode; dealer: Seat };
export type PrivateGame = {
  id: string;
  mode: Mode;
  moduleVersion: '1.0.0';
  ruleProfileId: string;
  eventSchemaVersion: '1.0.0';
  phase: Phase;
  hands: Four<Card[]>;
  bids: Four<number | null>;
  tricks: Four<number>;
  scores: Four<number>;
  bags: Four<number>;
  trick: Play[];
  history: Trick[];
  turn: Seat | null;
  dealer: Seat;
  handNumber: number;
  heartsBroken: boolean;
  spadesBroken: boolean;
  events: GameEvent[];
  handResult?: HandResult;
  passDirection: 'left' | 'right' | 'across' | 'hold';
  passes: Four<PassMemory>;
};
export type LegalContext = Pick<
  PrivateGame,
  'mode' | 'phase' | 'turn' | 'trick' | 'history' | 'heartsBroken' | 'spadesBroken'
> & { hand: Card[] };
export const SEATS: Seat[] = [0, 1, 2, 3];
export const SUITS: Suit[] = ['C', 'D', 'H', 'S'];
export const RULE_PROFILES: Record<Mode, string> = {
  hearts: 'hearts-training-1.0.0',
  'spades-solo': 'spades-solo-training-1.0.0',
  'spades-partners': 'spades-training-1.0.0',
};
export const nextSeat = (seat: Seat): Seat => ((seat + 1) % 4) as Seat;
export const four = <T>(make: () => T): Four<T> => [make(), make(), make(), make()];
export function assertSeat(seat: unknown): asserts seat is Seat {
  if (!Number.isInteger(seat) || !SEATS.includes(seat as Seat)) throw new Error('Invalid seat.');
}
