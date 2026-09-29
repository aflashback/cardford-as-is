import assert from 'node:assert/strict';
import {
  apply,
  collectTrick,
  createGame,
  fullDeck,
  type Card,
  type Four,
  type PrivateGame,
  type Seat,
} from '../../game/index.ts';

export type SpadesMode = 'spades-solo' | 'spades-partners';

/** Reserve relevant cards, fill every hand, then use the real clockwise deal. */
export function spadesDeal(
  reserved: Four<Card[]>,
  mode: SpadesMode = 'spades-partners',
  dealer: Seat = 3,
): PrivateGame {
  const hands = structuredClone(reserved);
  const allocated = new Set(hands.flat());
  assert.equal(allocated.size, hands.flat().length, 'Fixture cards must be distinct.');
  assert.ok(hands.every((hand) => hand.length <= 13));
  for (const card of fullDeck().filter((card) => !allocated.has(card))) {
    const seat = hands.findIndex((hand) => hand.length < 13);
    assert.notEqual(seat, -1);
    hands[seat].push(card);
  }
  assert.ok(hands.every((hand) => hand.length === 13));
  const deck: Card[] = [];
  for (let n = 0; n < 13; n++)
    for (let offset = 1; offset <= 4; offset++) deck.push(hands[(dealer + offset) % 4][n]);
  return createGame({ id: 'reachable-spades-fixture', mode, dealer }, deck);
}

export function bidAll(initial: PrivateGame, bids: Four<number>): PrivateGame {
  let state = initial;
  for (let n = 0; n < 4; n++) {
    assert.equal(state.phase, 'bid');
    assert.notEqual(state.turn, null);
    state = apply(state, { kind: 'bid', seat: state.turn!, bid: bids[state.turn!] });
  }
  return state;
}

/** Replay through legality checks; never patch counters or hands in a playing state. */
export function playSequence(initial: PrivateGame, cards: Card[]): PrivateGame {
  let state = initial;
  for (const card of cards) {
    if (state.phase === 'trick-end') state = collectTrick(state);
    assert.equal(state.phase, 'play');
    assert.notEqual(state.turn, null);
    state = apply(state, { kind: 'play', seat: state.turn!, card });
  }
  return state;
}

export function contractMadeNil(mode: SpadesMode = 'spades-partners'): PrivateGame {
  const state = bidAll(
    spadesDeal(
      [
        ['CA', 'C2', 'H2', 'HA'],
        ['C3', 'CK', 'H3'],
        ['C4', 'C5', 'HK'],
        ['C6', 'C7', 'H4'],
      ],
      mode,
    ),
    [1, 3, 0, 3],
  );
  return playSequence(state, ['CA', 'C3', 'C4', 'C6', 'C2', 'CK', 'C5', 'C7', 'H3', 'HK', 'H4']);
}

/** All other players followed low while an unseen ace was deliberately retained. */
export function kingWinsWithUnseenAce(bids: Four<number> = [2, 2, 2, 2]): PrivateGame {
  return playSequence(
    bidAll(
      spadesDeal(
        [
          ['HK', 'H5'],
          ['H2', 'H6', 'HA'],
          ['H3', 'H7'],
          ['H4', 'H8'],
        ],
        'spades-solo',
      ),
      bids,
    ),
    ['HK', 'H2', 'H3', 'H4'],
  );
}

/** All thirteen spades are public before a threatened positive partner leads HQ. */
export function threatenedPartnerWinner(): PrivateGame {
  return playSequence(
    bidAll(
      spadesDeal(
        [
          ['C4', 'S6', 'S7', 'SQ', 'H2', 'HA'],
          ['S2', 'S3', 'S8', 'SK', 'HK', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'],
          ['C2', 'S4', 'S9', 'SA', 'HQ'],
          ['C3', 'S5', 'S10', 'SJ', 'H3'],
        ],
        'spades-partners',
        1,
      ),
      [3, 3, 3, 3],
    ),
    [
      'C2',
      'C3',
      'C4',
      'S2',
      'S3',
      'S4',
      'S5',
      'S6',
      'S7',
      'S8',
      'S9',
      'S10',
      'SJ',
      'SQ',
      'SK',
      'SA',
      'HQ',
      'H3',
    ],
  );
}

/** South's Nil survived three legal tricks, but SA is now forced before fourth seat. */
export function certainNilFailureBeforeFourth(): PrivateGame {
  return playSequence(
    bidAll(
      spadesDeal(
        [
          ['C4', 'S5', 'S8', 'SA', 'H2'],
          ['S2', 'S3', 'S9', 'SK', 'HK', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'],
          ['C2', 'S4', 'S10', 'SJ', 'HQ'],
          ['C3', 'S6', 'S7', 'SQ', 'H3'],
        ],
        'spades-solo',
        1,
      ),
      [0, 3, 3, 3],
    ),
    ['C2', 'C3', 'C4', 'S2', 'S3', 'S4', 'S6', 'S5', 'S7', 'S8', 'S9', 'S10', 'SJ', 'SQ'],
  );
}

export function partnerRuffAndOverruff(): PrivateGame {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  return collectTrick(
    playSequence(
      bidAll(
        spadesDeal([
          ranks.map((rank) => 'C' + rank),
          ranks.map((rank) => 'H' + rank),
          [...ranks.slice(0, 6).map((rank) => 'D' + rank), ...ranks.slice(0, 7).map((rank) => 'S' + rank)],
          [...ranks.slice(6).map((rank) => 'D' + rank), ...ranks.slice(7).map((rank) => 'S' + rank)],
        ]),
        [4, 3, 3, 3],
      ),
      ['CA', 'H2', 'D2', 'D8'],
    ),
  );
}

/** Rotate a reached position by rebuilding its initial deal and replaying its actions. */
export function rotateSpadesFixture(source: PrivateGame, offset: number): PrivateGame {
  assert.ok(source.mode !== 'hearts');
  const seatAt = (seat: Seat) => ((seat + offset) % 4) as Seat;
  const initialHands = structuredClone(source.hands);
  const plays = [
    ...source.history.flatMap((trick) => trick.plays),
    ...(source.phase === 'trick-end' ? [] : source.trick),
  ];
  for (const play of plays) initialHands[play.seat].push(play.card);
  const rotated: Four<Card[]> = [[], [], [], []];
  const bids: Four<number> = [0, 0, 0, 0];
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    rotated[seatAt(seat)] = initialHands[seat];
    assert.notEqual(source.bids[seat], null);
    bids[seatAt(seat)] = source.bids[seat]!;
  }
  let state = playSequence(
    bidAll(spadesDeal(rotated, source.mode, seatAt(source.dealer)), bids),
    plays.map((play) => play.card),
  );
  if (source.phase === 'play' && state.phase === 'trick-end') state = collectTrick(state);
  assert.equal(state.phase, source.phase);
  assert.equal(state.turn, source.turn === null ? null : seatAt(source.turn));
  return state;
}

export function seededSpadesDeck(seed: number): Card[] {
  const deck = fullDeck();
  let value = seed >>> 0;
  for (let i = deck.length - 1; i > 0; i--) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    const j = value % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function assertSpadesConservation(state: PrivateGame): void {
  const cards = [
    ...state.hands.flat(),
    ...state.history.flatMap((trick) => trick.plays.map((play) => play.card)),
    ...(state.phase === 'trick-end' ? [] : state.trick.map((play) => play.card)),
  ];
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards).size, 52);
  assert.equal(
    state.tricks.reduce((sum, n) => sum + n, 0),
    state.history.length,
  );
}
