import type { Card, Four, PassMemory, Play, Seat, Trick } from '../../game/kernel/types.ts';

export const HEARTS_RULE_PROFILE = 'hearts-training-1.0.0';
export type HeartsPhase = 'pass' | 'play' | 'trick-end' | 'hand-end' | 'match-end' | 'awaiting-deal';
export type HeartsConfig = { id: string; dealer: Seat };
export type HeartsAction =
  { kind: 'play'; seat: Seat; card: Card } | { kind: 'pass'; seat: Seat; cards: Card[] };
export type HeartsAcceptedAction =
  { kind: 'play'; seat: Seat; card: Card } | { kind: 'pass-bundle'; passes: Four<Card[]> };
export type HeartsEvent = {
  id: number;
  type:
    | 'hand-started'
    | 'card-played'
    | 'cards-passed'
    | 'trick-resolved'
    | 'trick-collected'
    | 'moon-shot'
    | 'hand-scored';
  message: string;
  seat?: Seat;
  card?: Card;
};
export type HeartsHandResult = { points: Four<number>; winner?: Seat };
/** Hearts owns its state. Only the explicit V1 bridge retains the historical cross-game flag. */
export type HeartsState = {
  id: string;
  moduleVersion: '2.0.0';
  stateSchemaVersion: '2.0.0';
  ruleProfileId: 'hearts-training-1.0.0';
  eventSchemaVersion: '2.0.0';
  phase: HeartsPhase;
  hands: Four<Card[]>;
  tricks: Four<number>;
  scores: Four<number>;
  trick: Play[];
  history: Trick[];
  turn: Seat | null;
  dealer: Seat;
  handNumber: number;
  heartsBroken: boolean;
  events: HeartsEvent[];
  handResult?: HeartsHandResult;
  passDirection: 'left' | 'right' | 'across' | 'hold';
  passes: Four<PassMemory>;
  v1Compatibility: { moduleVersion: '1.0.0'; eventSchemaVersion: '1.0.0'; spadesBroken: boolean };
};
export type HeartsChance = { kind: 'request-deal'; roundNumber: number } | { kind: 'deal'; deck: Card[] };
export type HeartsLegalContext = {
  phase: HeartsPhase;
  turn: Seat | null;
  hand: Card[];
  trick: Play[];
  history: Trick[];
  heartsBroken: boolean;
};
export { heartsStateCodec } from './codec.ts';
export { fromV1Hearts, toV1Hearts } from './compatibility.ts';
