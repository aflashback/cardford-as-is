import { fullDeck, sorted, cardSuit } from '../game/cards.ts';
import { four, SEATS, type Card, type PrivateGame, type Seat, type Four } from '../game/kernel/types.ts';
import { assertObservation, getMemory, type SeatObservation } from '../observations/index.ts';
export const SAMPLER_VERSION = 'uniform-constraint-counting-1.0.0';
export class SampleUnavailableError extends Error {
  readonly reason: 'inconsistent-observation' | 'impossible' | 'budget-exhausted';
  constructor(reason: SampleUnavailableError['reason']) {
    super(`Sample unavailable: ${reason}.`);
    this.name = 'SampleUnavailableError';
    this.reason = reason;
  }
}
const unavailable = (): never => {
  throw new SampleUnavailableError('inconsistent-observation');
};
function randomSource(seed: number): () => number {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let x = Math.imul(value ^ (value >>> 15), 1 | value);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return (x ^ (x >>> 14)) >>> 0;
  };
}
function below(limit: bigint, random: () => number): bigint {
  if (limit <= 0n) throw new SampleUnavailableError('impossible');
  if (limit === 1n) return 0n;
  const bits = limit.toString(2).length,
    words = Math.ceil(bits / 32),
    mask = (1n << BigInt(bits)) - 1n;
  for (let attempt = 0; attempt < 256; attempt++) {
    let value = 0n;
    for (let n = 0; n < words; n++) value = (value << 32n) | BigInt(random());
    value &= mask;
    if (value < limit) return value;
  }
  throw new SampleUnavailableError('budget-exhausted');
}
function choose(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  let v = 1n;
  for (let i = 1; i <= k; i++) v = (v * BigInt(n - i + 1)) / BigInt(i);
  return v;
}
type Allocation = [number, number, number];
/** Uniform feasible assignments, conditioned only on exact knowledge. No bid-based strength weighting. */
export function sampleWorld(observation: SeatObservation, seed: number): PrivateGame {
  assertObservation(observation);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error('A uint32 sampling seed is required.');
  const obs = observation,
    random = randomSource(seed);
  const publicCards = new Set<Card>();
  for (const trick of obs.history)
    for (const p of trick.plays) {
      if (publicCards.has(p.card)) unavailable();
      publicCards.add(p.card);
    }
  for (const p of obs.trick) {
    if (publicCards.has(p.card)) {
      if (
        obs.phase !== 'trick-end' ||
        !obs.history.at(-1)?.plays.some((q) => q.card === p.card && q.seat === p.seat)
      )
        unavailable();
    } else publicCards.add(p.card);
  }
  if (
    obs.hand.some((c) => publicCards.has(c)) ||
    obs.handSizes.reduce((a, b) => a + b, 0) + publicCards.size !== 52
  )
    unavailable();
  if (
    obs.heartsBroken !== [...publicCards].some((c) => cardSuit(c) === 'H') ||
    obs.spadesBroken !== [...publicCards].some((c) => cardSuit(c) === 'S')
  )
    unavailable();
  const hands: Four<Card[]> = four(() => []);
  hands[obs.seat] = [...obs.hand];
  const unknownSeats = SEATS.filter((s) => s !== obs.seat);
  const known = new Set(obs.hand);
  const voids = getMemory(obs);
  const restrictedTo = new Map<Seat, 'H' | 'S'>(),
    penaltyOnly = new Set<Seat>();
  const chronology = [...obs.history.map((t) => t.plays), ...(obs.phase === 'trick-end' ? [] : [obs.trick])];
  let heartsBroken = false,
    spadesBroken = false;
  for (let trickIndex = 0; trickIndex < chronology.length; trickIndex++) {
    const plays = chronology[trickIndex];
    if (!plays.length) continue;
    const lead = cardSuit(plays[0].card);
    if (obs.mode === 'hearts' && lead === 'H' && !heartsBroken) restrictedTo.set(plays[0].seat, 'H');
    if (obs.mode !== 'hearts' && lead === 'S' && !spadesBroken) restrictedTo.set(plays[0].seat, 'S');
    for (const play of plays) {
      if (
        obs.mode === 'hearts' &&
        trickIndex === 0 &&
        lead === 'C' &&
        cardSuit(play.card) !== 'C' &&
        (cardSuit(play.card) === 'H' || play.card === 'SQ')
      )
        penaltyOnly.add(play.seat);
      if (cardSuit(play.card) === 'H') heartsBroken = true;
      if (cardSuit(play.card) === 'S') spadesBroken = true;
    }
  }
  const forbidden = (seat: Seat, card: Card) =>
    voids.find((m) => m.suit === cardSuit(card))!.voidSeats.includes(seat) ||
    (restrictedTo.has(seat) && cardSuit(card) !== restrictedTo.get(seat)) ||
    (penaltyOnly.has(seat) && cardSuit(card) !== 'H' && card !== 'SQ') ||
    (obs.mode === 'hearts' &&
      obs.phase === 'play' &&
      !obs.history.length &&
      !obs.trick.length &&
      card === 'C2' &&
      seat !== obs.turn);
  if (obs.hand.some((c) => forbidden(obs.seat, c))) unavailable();
  for (const holding of obs.knownHoldings) {
    if (
      known.has(holding.card) ||
      publicCards.has(holding.card) ||
      holding.seat === obs.seat ||
      forbidden(holding.seat, holding.card)
    )
      unavailable();
    known.add(holding.card);
    hands[holding.seat].push(holding.card);
  }
  // The outgoing private pass is an exact ownership constraint until its cards are publicly played.
  const expectedHoldings =
    obs.pass.to === null
      ? []
      : obs.pass.outgoing
          .filter((c) => !publicCards.has(c))
          .map((card) => `${obs.pass.to}:${card}`)
          .sort();
  if (
    JSON.stringify(expectedHoldings) !==
    JSON.stringify(obs.knownHoldings.map((h) => `${h.seat}:${h.card}`).sort())
  )
    unavailable();
  const caps = unknownSeats.map((s) => obs.handSizes[s] - hands[s].length) as Allocation;
  if (caps.some((c) => c < 0)) unavailable();
  const unknown = fullDeck().filter((c) => !known.has(c) && !publicCards.has(c));
  if (unknown.length !== caps.reduce((a, b) => a + b, 0)) unavailable();
  // Cards with the same permitted-seat mask are exchangeable for counting purposes.
  // This also handles the queen exception in a forced first-trick Hearts penalty discard.
  const masks = new Map<string, { cards: Card[]; allowed: boolean[] }>();
  for (const card of unknown) {
    const allowed = unknownSeats.map((seat) => !forbidden(seat, card));
    const key = allowed.map((a) => (a ? '1' : '0')).join('');
    const group = masks.get(key) ?? { cards: [], allowed };
    group.cards.push(card);
    masks.set(key, group);
  }
  const groups = [...masks.values()];
  const categories = groups.map((g) => g.cards),
    allowed = groups.map((g) => g.allowed);
  let operations = 0;
  const cache = new Map<string, bigint>();
  function allocations(index: number, capacity: Allocation): Allocation[] {
    const n = categories[index].length,
      limits = capacity.map((c, s) => (allowed[index][s] ? Math.min(c, n) : 0));
    const result: Allocation[] = [];
    for (let a = 0; a <= limits[0]; a++)
      for (let b = 0; b <= limits[1]; b++) {
        const c = n - a - b;
        if (c >= 0 && c <= limits[2]) result.push([a, b, c]);
      }
    return result;
  }
  function weight(index: number, allocation: Allocation): bigint {
    return (
      choose(categories[index].length, allocation[0]) *
      choose(categories[index].length - allocation[0], allocation[1])
    );
  }
  function count(index: number, capacity: Allocation): bigint {
    if (++operations > 250000) throw new SampleUnavailableError('budget-exhausted');
    if (index === groups.length) return capacity.every((c) => c === 0) ? 1n : 0n;
    const key = `${index}:${capacity.join(',')}`;
    const saved = cache.get(key);
    if (saved !== undefined) return saved;
    let result = 0n;
    for (const allocation of allocations(index, capacity)) {
      const remaining = capacity.map((c, s) => c - allocation[s]) as Allocation;
      result += weight(index, allocation) * count(index + 1, remaining);
    }
    cache.set(key, result);
    return result;
  }
  if (count(0, caps) === 0n) throw new SampleUnavailableError('impossible');
  let capacity = caps;
  for (let index = 0; index < groups.length; index++) {
    let draw = below(count(index, capacity), random);
    let selected: Allocation | undefined;
    for (const allocation of allocations(index, capacity)) {
      const remaining = capacity.map((c, s) => c - allocation[s]) as Allocation;
      const ways = weight(index, allocation) * count(index + 1, remaining);
      if (draw < ways) {
        selected = allocation;
        break;
      }
      draw -= ways;
    }
    if (!selected) throw new SampleUnavailableError('impossible');
    const cards = [...categories[index]];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Number(below(BigInt(i + 1), random));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    let offset = 0;
    for (let s = 0; s < 3; s++) {
      hands[unknownSeats[s]].push(...cards.slice(offset, offset + selected[s]));
      offset += selected[s];
    }
    capacity = capacity.map((c, s) => c - selected![s]) as Allocation;
  }
  const passes = four(() => ({
    outgoing: [] as Card[],
    incoming: [] as Card[],
    to: null as Seat | null,
    from: null as Seat | null,
  }));
  passes[obs.seat] = structuredClone(obs.pass);
  const state: PrivateGame = {
    id: 'sampled-world',
    mode: obs.mode,
    moduleVersion: '1.0.0',
    ruleProfileId: obs.ruleProfileId,
    eventSchemaVersion: '1.0.0',
    phase: obs.phase,
    hands: hands.map(sorted) as Four<Card[]>,
    bids: [...obs.bids] as Four<number | null>,
    tricks: [...obs.tricks] as Four<number>,
    scores: [...obs.scores] as Four<number>,
    bags: [...obs.bags] as Four<number>,
    trick: structuredClone(obs.trick),
    history: structuredClone(obs.history),
    turn: obs.turn,
    dealer: obs.dealer,
    handNumber: obs.handNumber,
    heartsBroken: obs.heartsBroken,
    spadesBroken: obs.spadesBroken,
    events: structuredClone(obs.events),
    passDirection: obs.passDirection,
    passes,
  };
  if (obs.handResult) state.handResult = structuredClone(obs.handResult);
  return state;
}
