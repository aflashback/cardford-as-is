import type {
  Card,
  GameAction,
  GameEvent,
  HandResult,
  Mode,
  PassMemory,
  Phase,
  Play,
  Seat,
  Suit,
  Trick,
} from '../game/kernel/types.ts';
export type SuitMemory = { suit: Suit; played: number; remaining: number; voidSeats: Seat[] };
/** The complete strategy input: own cards plus public/own-pass knowledge, without identity. */
export type SeatObservation = {
  mode: Mode;
  seat: Seat;
  moduleVersion: '1.0.0';
  ruleProfileId: string;
  observationSchemaVersion: '1.0.0';
  featureVersion: '1.0.0';
  phase: Phase;
  hand: Card[];
  handSizes: number[];
  bids: (number | null)[];
  tricks: number[];
  scores: number[];
  bags: number[];
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
  pass: PassMemory;
  legalActions: GameAction[];
  memory: SuitMemory[];
  knownHoldings: { seat: Seat; card: Card }[];
};
