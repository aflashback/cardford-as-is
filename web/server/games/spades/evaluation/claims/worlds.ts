import { cardSuit, fullDeck } from '../../../../game/cards.ts';
import { SEATS, type Card, type Mode, type Play, type PrivateGame, type Seat, type Suit } from '../../../../game/kernel/types.ts';
import { legalCards, trickWinner } from '../../../../game/rules.ts';
import type { SeatObservation } from '../../../../observations/index.ts';

/**
 * COACH-15: what one seat can know, and exact decisions over every deal that fits it.
 *
 * Evaluation only. Nothing here reads the fact builder. The constraints are the ones the
 * playout kernel and the world sampler use: a seat that failed to follow a suit holds none
 * of it, and a seat that led trump before trump was broken holds only trump.
 */
export const CLAIM_WORLDS_VERSION = 'spades-claim-worlds-1.0.0';
/** Declared ceiling on feasibility decisions or enumerated deals for one claim. */
export const CLAIM_WORLD_BOUND = 200_000;

export type VoidEvidence = {
  seat: Seat;
  suit: Suit;
  /** 1-based trick number in which the public evidence appeared. */
  trick: number;
  kind: 'failed-to-follow' | 'led-trump-before-broken';
};

export type SeatKnowledge = {
  mode: Mode;
  seat: Seat;
  /** The three seats whose cards are concealed from `seat`. */
  others: Seat[];
  /** Unplayed cards that are not in the seat's own hand. */
  unknown: Card[];
  /** Cards still held, by seat. Public. */
  capacity: number[];
  /** Suits each seat is publicly known not to hold. */
  excluded: Set<Suit>[];
  evidence: VoidEvidence[];
  /** False when card counts do not add up; no universal claim can then be confirmed. */
  consistent: boolean;
};

const SIDE_SUITS: readonly Suit[] = ['C', 'D', 'H'];

/** Public plays of this hand in order; a finished trick still on the table is counted once. */
export function publicTricks(view: Pick<SeatObservation, 'history' | 'trick' | 'phase'>): Play[][] {
  return [...view.history.map((trick) => trick.plays), ...(view.phase === 'trick-end' ? [] : [view.trick])].filter(
    (plays) => plays.length > 0,
  );
}

export function seatKnowledge(observation: SeatObservation): SeatKnowledge {
  if (observation.mode !== 'spades-solo' && observation.mode !== 'spades-partners')
    throw new Error('A Spades observation is required.');
  const excluded: Set<Suit>[] = SEATS.map(() => new Set<Suit>());
  const evidence: VoidEvidence[] = [];
  const note = (seat: Seat, suit: Suit, trick: number, kind: VoidEvidence['kind']) => {
    if (excluded[seat].has(suit)) return;
    excluded[seat].add(suit);
    evidence.push({ seat, suit, trick, kind });
  };
  const seen = new Set<Card>();
  let broken = false;
  let duplicate = false;
  publicTricks(observation).forEach((plays, index) => {
    const led = cardSuit(plays[0].card);
    if (led === 'S' && !broken)
      for (const suit of SIDE_SUITS) note(plays[0].seat, suit, index + 1, 'led-trump-before-broken');
    for (const play of plays) {
      if (seen.has(play.card)) duplicate = true;
      seen.add(play.card);
      const suit = cardSuit(play.card);
      if (suit !== led) note(play.seat, led, index + 1, 'failed-to-follow');
      if (suit === 'S') broken = true;
    }
  });
  const own = new Set(observation.hand);
  const unknown = fullDeck().filter((card) => !seen.has(card) && !own.has(card));
  const others = SEATS.filter((seat) => seat !== observation.seat);
  const capacity = SEATS.map((seat) => observation.handSizes[seat]);
  const consistent =
    !duplicate &&
    observation.hand.every((card) => !seen.has(card)) &&
    capacity[observation.seat] === observation.hand.length &&
    others.reduce<number>((sum, seat) => sum + capacity[seat], 0) === unknown.length &&
    observation.knownHoldings.length === 0;
  return { mode: observation.mode, seat: observation.seat, others, unknown, capacity, excluded, evidence, consistent };
}

export type Requirement = {
  /** Concealed cards that a named seat must hold. */
  holds?: readonly { seat: Seat; card: Card }[];
  /** Suits that a named seat must not hold, beyond the public evidence. */
  lacks?: readonly { seat: Seat; suit: Suit }[];
};

/**
 * Exact decision: does at least one deal fit the seat's knowledge and the requirement?
 * Cards go to seats with fixed hand sizes, so Hall's condition over the eight subsets of
 * the three concealed seats is necessary and sufficient.
 */
export function feasible(knowledge: SeatKnowledge, requirement: Requirement = {}): boolean {
  if (!knowledge.consistent) return false;
  const { others } = knowledge;
  const lacks = requirement.lacks ?? [];
  const allowed = (seat: Seat, card: Card) => {
    const suit = cardSuit(card);
    return (
      !knowledge.excluded[seat].has(suit) && !lacks.some((entry) => entry.seat === seat && entry.suit === suit)
    );
  };
  const room = others.map((seat) => knowledge.capacity[seat]);
  const pool = new Set(knowledge.unknown);
  for (const hold of requirement.holds ?? []) {
    const index = others.indexOf(hold.seat);
    if (index < 0 || !pool.has(hold.card) || !allowed(hold.seat, hold.card)) return false;
    pool.delete(hold.card);
    if (--room[index] < 0) return false;
  }
  // confined[mask] counts cards whose permitted seats are exactly `mask`.
  const confined = new Array<number>(8).fill(0);
  for (const card of pool) {
    let mask = 0;
    others.forEach((seat, index) => {
      if (allowed(seat, card)) mask |= 1 << index;
    });
    confined[mask]++;
  }
  if (confined[0] > 0) return false;
  for (let subset = 1; subset < 8; subset++) {
    let cards = 0,
      space = 0;
    for (let mask = 1; mask < 8; mask++) if ((mask & ~subset) === 0) cards += confined[mask];
    for (let index = 0; index < 3; index++) if (subset & (1 << index)) space += room[index];
    if (cards > space) return false;
  }
  return pool.size === room.reduce((sum, value) => sum + value, 0);
}

export type Enumeration = { complete: boolean; worlds: number };

/**
 * Visits every deal that fits the seat's knowledge, up to `bound`. `visit` receives the
 * concealed hands by seat and may return true to stop early. `complete` is true only when
 * every deal was visited.
 */
export function enumerateWorlds(
  knowledge: SeatKnowledge,
  bound: number,
  visit: (hands: Card[][]) => boolean | void,
): Enumeration {
  if (!knowledge.consistent) return { complete: false, worlds: 0 };
  const { others, unknown } = knowledge;
  const hands: Card[][] = SEATS.map(() => []);
  const room = SEATS.map((seat) => (others.includes(seat) ? knowledge.capacity[seat] : 0));
  // Suits are interchangeable inside a permitted-seat class, so room per class decides a dead end.
  const permitted = unknown.map((card) => others.filter((seat) => !knowledge.excluded[seat].has(cardSuit(card))));
  let worlds = 0;
  let stopped = false;
  let exceeded = false;
  const deadEnd = (from: number): boolean => {
    const confined = new Map<string, { seats: Seat[]; cards: number }>();
    for (let index = from; index < unknown.length; index++) {
      const key = permitted[index].join('');
      const entry = confined.get(key) ?? { seats: permitted[index], cards: 0 };
      entry.cards++;
      confined.set(key, entry);
    }
    for (let subset = 1; subset < 8; subset++) {
      const seats = others.filter((_, index) => subset & (1 << index));
      let cards = 0;
      for (const entry of confined.values()) if (entry.seats.every((seat) => seats.includes(seat))) cards += entry.cards;
      if (cards > seats.reduce<number>((sum, seat) => sum + room[seat], 0)) return true;
    }
    return false;
  };
  const place = (index: number) => {
    if (stopped || exceeded) return;
    if (index === unknown.length) {
      if (worlds >= bound) {
        exceeded = true;
        return;
      }
      worlds++;
      if (visit(hands.map((hand) => [...hand])) === true) stopped = true;
      return;
    }
    for (const seat of permitted[index]) {
      if (room[seat] === 0) continue;
      room[seat]--;
      hands[seat].push(unknown[index]);
      if (!deadEnd(index + 1)) place(index + 1);
      hands[seat].pop();
      room[seat]++;
      if (stopped || exceeded) return;
    }
  };
  if (!deadEnd(0)) place(0);
  return { complete: !stopped && !exceeded, worlds };
}

export type TrickSearch = {
  outcome: 'violation' | 'none' | 'bound-exceeded';
  /** Feasibility decisions spent. */
  evaluations: number;
  /** Plays of the later seats in the deal that breaks the claim. */
  witness?: Play[];
};

/** Seats that still play to the current trick after the actor, in turn order. */
export function seatsAfter(actor: Seat, playsBeforeActor: number): Seat[] {
  const later: Seat[] = [];
  for (let step = 1; step <= 3 - playsBeforeActor; step++) later.push(((actor + step) % 4) as Seat);
  return later;
}

/**
 * Exact search over the seat's knowledge: is there a deal, and legal plays by the later
 * seats in it, after which the trick winner fails `accept`? A later seat may play a card
 * of the led suit that it can hold, or any other card it can hold in a deal where it
 * holds none of the led suit.
 */
export function searchTrick(
  knowledge: SeatKnowledge,
  plays: readonly Play[],
  later: readonly Seat[],
  accept: (winner: Seat) => boolean,
  bound = CLAIM_WORLD_BOUND,
): TrickSearch {
  if (!plays.length) throw new Error('The trick needs a led card.');
  const led = cardSuit(plays[0].card);
  let evaluations = 0;
  let exceeded = false;
  const holds: { seat: Seat; card: Card }[] = [];
  const lacks: { seat: Seat; suit: Suit }[] = [];
  const line: Play[] = [...plays];
  const descend = (depth: number): Play[] | null => {
    if (depth === later.length) return accept(trickWinner(line, knowledge.mode)) ? null : line.slice(plays.length);
    const seat = later[depth];
    for (const card of knowledge.unknown) {
      if (holds.some((entry) => entry.card === card)) continue;
      if (++evaluations > bound) {
        exceeded = true;
        return null;
      }
      const offSuit = cardSuit(card) !== led;
      holds.push({ seat, card });
      if (offSuit) lacks.push({ seat, suit: led });
      let found: Play[] | null = null;
      if (feasible(knowledge, { holds, lacks })) {
        line.push({ seat, card });
        found = descend(depth + 1);
        line.pop();
      }
      holds.pop();
      if (offSuit) lacks.pop();
      if (found || exceeded) return found;
    }
    return null;
  };
  const witness = descend(0);
  if (witness) return { outcome: 'violation', evaluations, witness };
  return { outcome: exceeded ? 'bound-exceeded' : 'none', evaluations };
}

/**
 * The same question in the real deal: legal plays come from the engine and the true hands.
 * Returns the later plays that break the claim, or null when none exists.
 */
export function dealViolation(
  state: PrivateGame,
  plays: readonly Play[],
  later: readonly Seat[],
  accept: (winner: Seat) => boolean,
): Play[] | null {
  const line: Play[] = [...plays];
  const descend = (depth: number): Play[] | null => {
    if (depth === later.length) return accept(trickWinner(line, state.mode)) ? null : line.slice(plays.length);
    const seat = later[depth];
    const cards = legalCards(
      {
        mode: state.mode,
        phase: 'play',
        turn: seat,
        trick: line,
        history: state.history,
        heartsBroken: state.heartsBroken,
        spadesBroken: state.spadesBroken,
        hand: state.hands[seat],
      },
      seat,
    );
    for (const card of cards) {
      line.push({ seat, card });
      const found = descend(depth + 1);
      line.pop();
      if (found) return found;
    }
    return null;
  };
  return descend(0);
}
