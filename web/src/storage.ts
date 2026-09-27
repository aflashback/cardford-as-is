import { trickWinner, type GameState } from './game.ts';

export type CoachMode = 'asked' | 'nudges' | 'after';
export type GameSpeed = 1 | 1.2 | 1.4;
export interface HandStats { decisions: number; helped: number; suggestions: number }
export interface SavedGame { version: 1; game: GameState; coachMode: CoachMode; gameSpeed?: GameSpeed; stats: HandStats; exposure: number; exposureTurn: string }
const KEY = 'jev.active.v1';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const count = (value: unknown): value is number => integer(value) && value >= 0;
const seat = (value: unknown) => integer(value) && value >= 0 && value < 4;
const card = (value: unknown): value is string => typeof value === 'string' && /^[CDHS](?:[2-9]|10|J|Q|K|A)$/.test(value);
const member = (value: unknown, options: string[]) => typeof value === 'string' && options.includes(value);
const four = (value: unknown, valid: (item: unknown) => boolean) => Array.isArray(value) && value.length === 4 && value.every(valid);
const bag = (value: unknown) => count(value) && value < 10;
const play = (value: unknown) => record(value) && seat(value.seat) && card(value.card);

/** Validate the whole snapshot before any saved value reaches render or game logic. */
export function validateSaved(value: unknown): value is SavedGame {
  if (!record(value) || value.version !== 1 || !record(value.game) || !record(value.stats)) return false;
  if (!member(value.coachMode, ['asked', 'nudges', 'after']) || !count(value.exposure) || value.exposure > 3 || typeof value.exposureTurn !== 'string') return false;
  if ('gameSpeed' in value && value.gameSpeed !== 1 && value.gameSpeed !== 1.2 && value.gameSpeed !== 1.4) return false;
  const stats = value.stats;
  if (!count(stats.decisions) || !count(stats.helped) || !count(stats.suggestions) || stats.helped > stats.decisions || stats.suggestions > stats.helped) return false;

  const game = value.game;
  if (typeof game.id !== 'string' || !game.id || !count(game.seed) || game.seed > 0xffffffff || !count(game.handNumber) || game.handNumber < 1) return false;
  if (!member(game.mode, ['hearts', 'spades-solo', 'spades-partners']) || !member(game.phase, ['pass', 'bid', 'play', 'trick-end', 'hand-end', 'match-end'])) return false;
  if (!seat(game.turn) || !seat(game.dealer) || !member(game.passDirection, ['left', 'right', 'across', 'hold'])) return false;
  if (typeof game.heartsBroken !== 'boolean' || typeof game.spadesBroken !== 'boolean') return false;
  if (!four(game.hands, hand => Array.isArray(hand) && hand.length <= 13 && hand.every(card))) return false;
  if (!four(game.bids, bid => bid === null || (count(bid) && bid <= 13)) || !four(game.scores, integer) || !four(game.bags, bag) || !four(game.tricks, tricks => count(tricks) && tricks <= 13)) return false;
  if (!Array.isArray(game.trick) || game.trick.length > 4 || !game.trick.every(play)) return false;
  if (!Array.isArray(game.history) || game.history.length > 13 || !game.history.every(trick => record(trick) && seat(trick.winner) && Array.isArray(trick.plays) && trick.plays.length === 4 && trick.plays.every(play))) return false;
  if (!Array.isArray(game.received) || ![0, 3].includes(game.received.length) || !game.received.every(card) || new Set(game.received).size !== game.received.length) return false;
  if (!Array.isArray(game.events) || !game.events.every(event => record(event) && count(event.id) && event.id > 0 && typeof event.type === 'string' && typeof event.message === 'string' && (event.seat === undefined || seat(event.seat)) && (event.card === undefined || card(event.card)))) return false;
  if (game.handResult !== undefined && (!record(game.handResult) || !four(game.handResult.points, integer) || !four(game.handResult.bags, bag) || (game.handResult.winner !== undefined && !seat(game.handResult.winner)))) return false;

  // Structural checks above make it safe to inspect deck and phase consistency.
  const state = game as unknown as GameState;
  const tricks = [...state.history.map(trick => trick.plays), state.trick];
  for (const plays of tricks) {
    if (new Set(plays.map(item => item.seat)).size !== plays.length) return false;
    if (plays.some((item, index) => index > 0 && item.seat !== (plays[index - 1].seat + 1) % 4)) return false;
  }
  const deck = [...state.hands.flat(), ...tricks.flatMap(plays => plays.map(item => item.card))];
  if (deck.length !== 52 || new Set(deck).size !== 52) return false;
  if (state.hands.some((hand, player) => hand.length !== 13 - state.history.length - Number(state.trick.some(item => item.seat === player)))) return false;
  if (state.tricks.some((taken, player) => taken !== state.history.filter(trick => trick.winner === player).length)) return false;
  if (state.history.some(trick => trick.winner !== trickWinner(trick.plays, state.mode))) return false;
  if (state.mode === 'spades-partners' && (state.scores[0] !== state.scores[2] || state.scores[1] !== state.scores[3] || state.bags[0] !== state.bags[2] || state.bags[1] !== state.bags[3])) return false;
  if (state.mode === 'hearts' && state.bids.some(bid => bid !== null)) return false;

  const ended = state.phase === 'hand-end' || state.phase === 'match-end';
  if (ended !== (state.history.length === 13) || ended !== (state.handResult !== undefined)) return false;
  if (state.phase === 'match-end' && state.handResult?.winner === undefined) return false;
  if (state.phase === 'trick-end' ? state.trick.length !== 4 : state.trick.length === 4) return false;
  if ((state.phase === 'pass' || state.phase === 'bid' || ended) && state.trick.length !== 0) return false;
  if (state.phase === 'pass' && (state.mode !== 'hearts' || state.passDirection === 'hold' || state.history.length > 0)) return false;
  if (state.phase === 'bid' && (state.mode === 'hearts' || state.history.length > 0 || state.bids[state.turn] !== null)) return false;
  if (state.mode !== 'hearts' && state.phase !== 'bid' && state.bids.some(bid => bid === null)) return false;
  if (state.phase === 'play' && state.trick.length > 0 && state.turn !== (state.trick[state.trick.length - 1].seat + 1) % 4) return false;
  if (state.phase === 'bid') {
    const bidsMade = state.bids.filter(bid => bid !== null).length;
    if (state.turn !== (state.dealer + 1 + bidsMade) % 4) return false;
    for (let offset = 0; offset < 4; offset++) {
      if ((state.bids[(state.dealer + 1 + offset) % 4] !== null) !== (offset < bidsMade)) return false;
    }
  }
  if (state.phase === 'trick-end' && state.turn !== trickWinner(state.trick, state.mode)) return false;
  if (state.phase === 'play' || state.phase === 'trick-end') {
    const lastWinner = state.history[state.history.length - 1]?.winner;
    if (state.mode === 'hearts' && lastWinner === undefined) {
      if (state.trick.length ? state.trick[0].card !== 'C2' : !state.hands[state.turn].includes('C2')) return false;
    } else {
      const expectedLeader = lastWinner ?? (state.dealer + 1) % 4;
      if (state.trick.length ? state.trick[0].seat !== expectedLeader : state.turn !== expectedLeader) return false;
    }
  }
  return true;
}

export function readSaved(): SavedGame | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    return validateSaved(parsed) ? parsed : null;
  } catch { return null; }
}

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('jev-internal-games', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('games', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}

export async function saveGame(saved: SavedGame): Promise<boolean> {
  let currentSaved = true;
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { currentSaved = false; }
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('games', 'readwrite');
      transaction.objectStore('games').put({ id: saved.game.id, updatedAt: Date.now(), ...saved });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch { return false; }
  return currentSaved;
}
