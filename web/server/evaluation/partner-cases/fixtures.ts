import {
  apply,
  collectTrick,
  createGame,
  legalActions,
  actionId,
  type Card,
  type Four,
  type PrivateGame,
  type Seat,
} from '../../game/index.ts';

export type PartnerFixtureId =
  | 'useful-original'
  | 'useful-second-suit'
  | 'unsafe-overruff'
  | 'hidden-owner'
  | 'own-nil'
  | 'partner-nil'
  | 'opponent-nil'
  | 'contract-made-bag'
  | 'no-entry'
  | 'partner-secure';
const HANDS: Four<Card[]> = [
  ['S10', 'SJ', 'SQ', 'SK', 'SA', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', 'HJ'],
  ['C3', 'C6', 'C9', 'CQ', 'CA', 'D2', 'D5', 'D8', 'DJ', 'H2', 'HQ', 'HK', 'S8'],
  ['C2', 'C5', 'C8', 'CJ', 'DQ', 'DK', 'DA', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'],
  ['C4', 'C7', 'C10', 'CK', 'D3', 'D4', 'D6', 'D7', 'D9', 'D10', 'H3', 'HA', 'S9'],
];
const PREFIX = [
  'HJ',
  'HQ',
  'S2',
  'H3',
  'DA',
  'D3',
  'SA',
  'D2',
  'SK',
  'S8',
  'S3',
  'S9',
  'SQ',
  'H2',
  'S4',
  'C4',
];
export const PARTNER_FIXTURES: readonly PartnerFixtureId[] = [
  'useful-original',
  'useful-second-suit',
  'unsafe-overruff',
  'hidden-owner',
  'own-nil',
  'partner-nil',
  'opponent-nil',
  'contract-made-bag',
  'no-entry',
  'partner-secure',
];

/** Private authored material is confined to offline fixtures, never policy/coach inputs. */
export function partnerFixture(id: PartnerFixtureId, offset = 0, hiddenSwap = false): PrivateGame {
  const hands = structuredClone(HANDS);
  const bids: Four<number> = [8, 3, 4, 3];
  let prefix = [...PREFIX];
  const swap = (a: Seat, cardA: Card, b: Seat, cardB: Card) => {
    hands[a][hands[a].indexOf(cardA)] = cardB;
    hands[b][hands[b].indexOf(cardB)] = cardA;
  };
  if (id === 'useful-second-suit') swap(0, 'H4', 1, 'C3');
  if (id === 'hidden-owner') prefix = prefix.slice(0, 12);
  if (id === 'unsafe-overruff') {
    // East can still hold trump; partner's exact ownership has not been proved.
    swap(2, 'S7', 3, 'D10');
    swap(3, 'HA', 1, 'C3');
    prefix = prefix.slice(0, 12);
  }
  if (id === 'own-nil') {
    bids[0] = 0;
    prefix = prefix.slice(0, 6);
  }
  if (id === 'partner-nil') {
    bids[2] = 0;
    prefix = [];
  }
  if (id === 'opponent-nil') bids[3] = 0;
  if (id === 'contract-made-bag') bids[0] = bids[2] = 2;
  if (id === 'no-entry') prefix.push('S10', 'C3', 'S5', 'D4', 'SJ', 'D5', 'S6', 'D6');
  if (id === 'partner-secure') prefix.push('H4', 'HK', 'S5', 'HA', 'DK', 'D4');
  if (hiddenSwap) swap(1, 'C6', 2, 'C5');
  const seatAt = (seat: number) => ((seat + offset) % 4) as Seat;
  const rotated: Four<Card[]> = [[], [], [], []];
  for (const seat of [0, 1, 2, 3] as Seat[]) rotated[seatAt(seat)] = hands[seat];
  const dealer = seatAt(3);
  const deck = Array.from({ length: 52 }, (_, i) => rotated[seatAt(i % 4)][Math.floor(i / 4)]);
  let state = createGame({ id: 'offline-partner-family', mode: 'spades-partners', dealer }, deck);
  if (id === 'contract-made-bag') state.bags = [9, 0, 9, 0];
  for (let i = 0; i < 4; i++) {
    const actor = state.turn!;
    const original = ((actor - offset + 4) % 4) as Seat;
    state = apply(state, { kind: 'bid', seat: actor, bid: bids[original] });
  }
  for (const card of prefix) {
    if (state.phase === 'trick-end') state = collectTrick(state);
    const action = legalActions(state, state.turn!).find(
      (item) => item.kind === 'play' && item.card === card,
    );
    if (!action || action.kind !== 'play')
      throw new Error(`Unreachable ${id}: ${card} at ${state.history.length + 1}`);
    state = apply(state, action);
  }
  if (state.phase === 'trick-end') state = collectTrick(state);
  return state;
}

/** Independent reducer replay from the complete initial deck and exact action prefix. */
export function replayPartnerFixture(source: PrivateGame): PrivateGame {
  const initial = structuredClone(source.hands);
  const plays = [...source.history.flatMap((trick) => trick.plays), ...source.trick];
  for (const play of plays) initial[play.seat].push(play.card);
  const deck = Array.from({ length: 52 }, (_, i) => initial[(source.dealer + 1 + i) % 4][Math.floor(i / 4)]);
  let state = createGame({ id: source.id, mode: source.mode, dealer: source.dealer }, deck);
  state.bags = [...source.bags];
  state.scores = [...source.scores];
  for (let i = 0; i < 4; i++)
    state = apply(state, { kind: 'bid', seat: state.turn!, bid: source.bids[state.turn!]! });
  for (const play of plays) {
    if (state.phase === 'trick-end') state = collectTrick(state);
    if (!legalActions(state, state.turn!).some((candidate) => actionId(candidate) === `play:${play.card}`))
      throw new Error('Illegal saved prefix');
    state = apply(state, { kind: 'play', ...play });
  }
  if (source.phase === 'play' && state.phase === 'trick-end') state = collectTrick(state);
  return state;
}
