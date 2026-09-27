/** Local, deterministic training rules. This state is not a server security boundary. */
export type Mode = 'hearts' | 'spades-solo' | 'spades-partners';
export type Seat = 0 | 1 | 2 | 3;
export type Card = string;
export type Suit = 'C' | 'D' | 'H' | 'S';
export type Play = { seat: Seat; card: Card };
export type Trick = { plays: Play[]; winner: Seat };
export type GameEvent = { id: number; type: string; message: string; seat?: Seat; card?: Card };
export type GameState = {
  id: string;
  seed: number;
  mode: Mode;
  phase: 'pass' | 'bid' | 'play' | 'trick-end' | 'hand-end' | 'match-end';
  hands: Card[][];
  bids: (number | null)[];
  tricks: number[];
  scores: number[];
  bags: number[];
  trick: Play[];
  history: Trick[];
  turn: Seat;
  dealer: Seat;
  handNumber: number;
  heartsBroken: boolean;
  spadesBroken: boolean;
  events: GameEvent[];
  handResult?: { points: number[]; bags: number[]; winner?: Seat };
  passDirection: 'left' | 'right' | 'across' | 'hold';
  received: Card[];
};

const SUITS: Suit[] = ['C', 'D', 'H', 'S'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SEATS: Seat[] = [0, 1, 2, 3];
const seatName = (seat: Seat) => ['You', 'West', 'North', 'East'][seat];
const nextSeat = (seat: Seat) => ((seat + 1) % 4) as Seat;

export function cardSuit(card: Card): Suit {
  if (!/^[CDHS](?:[2-9]|10|J|Q|K|A)$/.test(card)) throw new Error(`Invalid card: ${card}`);
  return card[0] as Suit;
}

export function cardRank(card: Card): number {
  cardSuit(card);
  return RANKS.indexOf(card.slice(1)) + 2;
}

export function cardLabel(card: Card): string {
  const suit = { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' }[cardSuit(card)];
  const rank = ({ J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' } as Record<string, string>)[card.slice(1)] ?? card.slice(1);
  return `${rank} of ${suit}`;
}

function sorted(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => SUITS.indexOf(cardSuit(a)) - SUITS.indexOf(cardSuit(b)) || cardRank(a) - cardRank(b));
}

function seedNumber(seed: number | string): number {
  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) throw new Error('A finite seed is required.');
    return seed >>> 0;
  }
  let result = 2166136261;
  for (const character of seed) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

function randomSource(seed: number): () => number {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let x = Math.imul(value ^ (value >>> 15), 1 | value);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function emit(state: GameState, type: string, message: string, details: { seat?: Seat; card?: Card } = {}) {
  state.events.push({ id: (state.events[state.events.length - 1]?.id ?? 0) + 1, type, message, ...details });
}

function deal(state: GameState): GameState {
  const next = structuredClone(state);
  const random = randomSource((next.seed + Math.imul(next.handNumber, 0x9e3779b9)) >>> 0);
  const deck = SUITS.flatMap(suit => RANKS.map(rank => `${suit}${rank}`));
  for (let index = deck.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [deck[index], deck[other]] = [deck[other], deck[index]];
  }
  next.hands = [[], [], [], []];
  const first = nextSeat(next.dealer);
  for (let index = 0; index < deck.length; index++) next.hands[(first + index) % 4].push(deck[index]);
  next.hands = next.hands.map(sorted);
  next.bids = [null, null, null, null];
  next.tricks = [0, 0, 0, 0];
  next.trick = [];
  next.history = [];
  next.received = [];
  next.heartsBroken = false;
  next.spadesBroken = false;
  delete next.handResult;
  next.passDirection = (['left', 'right', 'across', 'hold'] as const)[(next.handNumber - 1) % 4];
  next.phase = next.mode === 'hearts' ? (next.passDirection === 'hold' ? 'play' : 'pass') : 'bid';
  next.turn = next.mode === 'hearts' ? next.hands.findIndex(hand => hand.includes('C2')) as Seat : first;
  emit(next, 'hand-started', `Hand ${next.handNumber} dealt. ${next.mode === 'hearts' ? (next.passDirection === 'hold' ? 'No pass this hand.' : `Pass three cards ${next.passDirection}.`) : `${seatName(first)} bid first.`}`);
  return next;
}

export function createGame(mode: Mode, seed: number | string = Date.now()): GameState {
  if (!['hearts', 'spades-solo', 'spades-partners'].includes(mode)) throw new Error('Unknown game mode.');
  const numericSeed = seedNumber(seed);
  return deal({
    id: `${mode}-${numericSeed.toString(16)}`, seed: numericSeed, mode, phase: 'bid',
    hands: [[], [], [], []], bids: [null, null, null, null], tricks: [0, 0, 0, 0],
    scores: [0, 0, 0, 0], bags: [0, 0, 0, 0], trick: [], history: [], turn: 0,
    dealer: Math.floor(randomSource(numericSeed)() * 4) as Seat, handNumber: 1,
    heartsBroken: false, spadesBroken: false, events: [], passDirection: 'left', received: [],
  });
}

const isHeartPoint = (card: Card) => cardSuit(card) === 'H' || card === 'SQ';

export function legalCards(state: GameState, seat: Seat = state.turn): Card[] {
  if (state.phase !== 'play' || seat !== state.turn) return [];
  const hand = state.hands[seat];
  if (state.trick.length > 0) {
    const following = hand.filter(card => cardSuit(card) === cardSuit(state.trick[0].card));
    if (following.length) return following;
    if (state.mode === 'hearts' && state.history.length === 0) {
      const safe = hand.filter(card => !isHeartPoint(card));
      if (safe.length) return safe;
    }
    return [...hand];
  }
  if (state.mode === 'hearts' && state.history.length === 0) return hand.filter(card => card === 'C2');
  const restrictedSuit = state.mode === 'hearts' ? 'H' : 'S';
  const broken = state.mode === 'hearts' ? state.heartsBroken : state.spadesBroken;
  if (!broken) {
    const others = hand.filter(card => cardSuit(card) !== restrictedSuit);
    if (others.length) return others;
  }
  return [...hand];
}

export function trickWinner(plays: Play[], mode: Mode): Seat {
  if (!plays.length) throw new Error('An empty trick has no winner.');
  const lead = cardSuit(plays[0].card);
  const trump = mode !== 'hearts' && plays.some(play => cardSuit(play.card) === 'S') ? 'S' : lead;
  return plays.filter(play => cardSuit(play.card) === trump)
    .reduce((best, play) => cardRank(play.card) > cardRank(best.card) ? play : best).seat;
}

export function playCard(state: GameState, card: Card): GameState {
  if (state.phase !== 'play') throw new Error('Cards can only be played during a trick.');
  if (!legalCards(state).includes(card)) throw new Error(`${cardLabel(card)} is not a legal play.`);
  const next = structuredClone(state);
  const seat = next.turn;
  next.hands[seat] = next.hands[seat].filter(held => held !== card);
  next.trick.push({ seat, card });
  if (cardSuit(card) === 'H') next.heartsBroken = true;
  if (cardSuit(card) === 'S') next.spadesBroken = true;
  emit(next, 'card-played', `${seatName(seat)} played ${cardLabel(card)}.`, { seat, card });
  if (next.trick.length === 4) {
    next.phase = 'trick-end';
    next.turn = trickWinner(next.trick, next.mode);
  } else next.turn = nextSeat(seat);
  return next;
}

export function submitBid(state: GameState, bid: number): GameState {
  if (state.phase !== 'bid' || state.bids[state.turn] !== null) throw new Error('It is not time to bid.');
  if (!Number.isInteger(bid) || bid < 0 || bid > 13) throw new Error('Choose a whole-number bid from 0 to 13.');
  const next = structuredClone(state);
  const seat = next.turn;
  next.bids[seat] = bid;
  emit(next, 'bid-placed', `${seatName(seat)} bid ${bid === 0 ? 'Nil' : bid}.`, { seat });
  next.turn = nextSeat(seat);
  if (next.bids.every(value => value !== null)) {
    next.phase = 'play';
    next.turn = nextSeat(next.dealer);
  }
  return next;
}

function choosePass(hand: Card[]): Card[] {
  const burden = (card: Card) => (card === 'SQ' ? 100 : cardSuit(card) === 'S' && cardRank(card) > 12 ? 80 : cardSuit(card) === 'H' ? 30 : 0) + cardRank(card);
  return [...hand].sort((a, b) => burden(b) - burden(a)).slice(0, 3);
}

export function passCards(state: GameState, cards: Card[]): GameState {
  if (state.mode !== 'hearts' || state.phase !== 'pass' || state.passDirection === 'hold') throw new Error('There is no pass to make.');
  if (cards.length !== 3 || new Set(cards).size !== 3 || cards.some(card => !state.hands[0].includes(card))) throw new Error('Select three different cards from your hand.');
  const passes = state.hands.map((hand, seat) => seat === 0 ? [...cards] : choosePass(hand));
  const offset = { left: 1, right: 3, across: 2 }[state.passDirection];
  const next = structuredClone(state);
  next.hands = state.hands.map((hand, seat) => hand.filter(card => !passes[seat].includes(card)));
  for (const seat of SEATS) next.hands[(seat + offset) % 4].push(...passes[seat]);
  next.hands = next.hands.map(sorted);
  next.received = [...passes[(4 - offset) % 4]];
  next.phase = 'play';
  next.turn = next.hands.findIndex(hand => hand.includes('C2')) as Seat;
  emit(next, 'cards-passed', `Three cards passed ${next.passDirection}. ${seatName(next.turn)} lead with the 2 of Clubs.`);
  return next;
}

function scoreHand(state: GameState) {
  const points = [0, 0, 0, 0];
  if (state.mode === 'hearts') {
    for (const trick of state.history) for (const play of trick.plays) points[trick.winner] += play.card === 'SQ' ? 13 : cardSuit(play.card) === 'H' ? 1 : 0;
    const moon = points.findIndex(value => value === 26);
    if (moon !== -1) {
      for (const seat of SEATS) points[seat] = seat === moon ? 0 : 26;
      emit(state, 'moon-shot', `${seatName(moon as Seat)} shot the moon. Everyone else receives 26 points.`);
    }
    for (const seat of SEATS) state.scores[seat] += points[seat];
  } else {
    const groups: Seat[][] = state.mode === 'spades-partners' ? [[0, 2], [1, 3]] : [[0], [1], [2], [3]];
    for (const group of groups) {
      let contract = 0;
      let contractTricks = 0;
      let failedNilTricks = 0;
      let nilPoints = 0;
      for (const seat of group) {
        const bid = state.bids[seat];
        if (bid === null) throw new Error('All bids must be recorded before scoring.');
        if (bid === 0) {
          nilPoints += state.tricks[seat] === 0 ? 100 : -100;
          failedNilTricks += state.tricks[seat];
        } else {
          contract += bid;
          contractTricks += state.tricks[seat];
        }
      }
      const made = contractTricks >= contract;
      const overtricks = made ? contractTricks - contract : 0;
      const allBags = state.bags[group[0]] + overtricks + failedNilTricks;
      const delta = (made ? 10 : -10) * contract + nilPoints + overtricks - 100 * Math.floor(allBags / 10);
      const newScore = state.scores[group[0]] + delta;
      for (const seat of group) {
        points[seat] = delta;
        state.scores[seat] = newScore;
        state.bags[seat] = allBags % 10;
      }
    }
  }
  state.phase = 'hand-end';
  state.handResult = { points, bags: [...state.bags] };
  const contenders: Seat[] = state.mode === 'spades-partners' ? [0, 1] : SEATS;
  const targetReached = Math.max(...state.scores) >= (state.mode === 'hearts' ? 100 : 500);
  if (targetReached) {
    const bestScore = state.mode === 'hearts' ? Math.min(...state.scores) : Math.max(...state.scores);
    const winners = contenders.filter(seat => state.scores[seat] === bestScore);
    if (winners.length === 1) {
      state.phase = 'match-end';
      state.handResult.winner = winners[0];
    }
  }
  emit(state, 'hand-scored', `Hand ${state.handNumber} scored. ${state.phase === 'match-end' ? 'Match complete.' : 'Review the result before the next deal.'}`);
}

export function advanceTrick(state: GameState): GameState {
  if (state.phase !== 'trick-end' || state.trick.length !== 4) throw new Error('The trick is not complete.');
  const next = structuredClone(state);
  const winner = trickWinner(next.trick, next.mode);
  next.history.push({ plays: next.trick, winner });
  next.trick = [];
  next.tricks[winner]++;
  next.turn = winner;
  next.phase = 'play';
  emit(next, 'trick-collected', `${seatName(winner)} took trick ${next.history.length}.`, { seat: winner });
  if (next.history.length === 13) scoreHand(next);
  return next;
}

export function nextHand(state: GameState): GameState {
  if (state.phase !== 'hand-end') throw new Error('Finish and review this hand before dealing another.');
  return deal({ ...state, dealer: nextSeat(state.dealer), handNumber: state.handNumber + 1 });
}

/** A transparent, conservative estimate using only this hand; not a probability. */
export function suggestBid(hand: Card[]): number {
  let estimate = 0;
  for (const suit of SUITS) {
    const cards = hand.filter(card => cardSuit(card) === suit);
    if (suit === 'S') {
      for (const card of cards) estimate += cardRank(card) >= 12 ? 1 : cardRank(card) >= 10 ? 0.65 : 0.25;
      if (cards.length > 4) estimate += (cards.length - 4) * 0.4;
    } else {
      if (cards.some(card => cardRank(card) === 14)) estimate++;
      if (cards.length >= 2 && cards.some(card => cardRank(card) === 13)) estimate += 0.55;
      if (cards.length >= 3 && cards.some(card => cardRank(card) === 12)) estimate += 0.2;
    }
  }
  const highSpades = hand.some(card => cardSuit(card) === 'S' && cardRank(card) > 9);
  if (estimate < 0.9 && !highSpades && hand.filter(card => cardSuit(card) === 'S').length <= 2) return 0;
  return Math.max(1, Math.min(13, Math.round(estimate)));
}

/** Local practice strategy: own hand plus public trick, bids and counters only. */
export function recommendCard(state: GameState, seat: Seat = state.turn): Card {
  const legal = legalCards(state, seat);
  if (!legal.length) throw new Error('No card recommendation is available outside this turn.');
  const low = [...legal].sort((a, b) => cardRank(a) - cardRank(b) || SUITS.indexOf(cardSuit(a)) - SUITS.indexOf(cardSuit(b)));
  if (!state.trick.length) return low[0];
  const currentWinner = trickWinner(state.trick, state.mode);
  const losers = low.filter(card => trickWinner([...state.trick, { seat, card }], state.mode) !== seat);
  const winners = low.filter(card => !losers.includes(card));
  if (state.mode === 'hearts') {
    if (losers.length) return [...losers].sort((a, b) => (b === 'SQ' ? 100 : cardSuit(b) === 'H' ? 20 : 0) + cardRank(b) - ((a === 'SQ' ? 100 : cardSuit(a) === 'H' ? 20 : 0) + cardRank(a)))[0];
    return low[0];
  }
  const bid = state.bids[seat] ?? 0;
  if (bid === 0) return losers[losers.length - 1] ?? low[0];
  const partner = ((seat + 2) % 4) as Seat;
  if (state.mode === 'spades-partners' && currentWinner === partner && state.bids[partner] !== 0) return low.find(card => losers.includes(card)) ?? low[0];
  const needed = state.mode === 'spades-partners'
    ? (state.bids[seat] ?? 0) + (state.bids[partner] ?? 0) - state.tricks[seat] - (state.bids[partner] === 0 ? 0 : state.tricks[partner])
    : bid - state.tricks[seat];
  if (needed > 0 && winners.length) return winners.find(card => cardSuit(card) !== 'S') ?? winners[0];
  return losers[0] ?? low[0];
}

/** One deterministic action; callers decide animation timing and human control. */
export function botStep(state: GameState): GameState {
  if (state.phase === 'bid') return submitBid(state, suggestBid(state.hands[state.turn]));
  if (state.phase === 'play') return playCard(state, recommendCard(state));
  throw new Error('A bot can act only while bidding or playing.');
}
