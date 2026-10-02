import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { apply, collectTrick, createGame, legalActions, actionId, type Card, type Four, type GameAction, type PrivateGame, type Seat } from '../../game/index.ts';
import { observe } from '../../observations/index.ts';
import ledger from '../fixtures/spades-observed-sources.json' with { type: 'json' };

type Episode = { id: string; mode: 'spades-solo' | 'spades-partners'; dealer: Seat; hands: Four<Card[]>; scores: Four<number>; bags: Four<number> };
type Packet = { game: string; seat: Seat; hand: Card[]; bids: (number | null)[]; tricks: number[]; scores: number[]; bags: number[]; completedTricks: PrivateGame['history']; currentTrick: PrivateGame['trick']; legalActions: string[] };
type RecordFile = { dealHash: string; decisions: { seq: number; action: GameAction; packetHash: string; packet: Packet }[] };
const root = new URL('../../../../', import.meta.url);
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

/** Frozen source bytes plus production replay, never a cast of a partial research packet. */
export function sourceState(id: string, change?: (episode: Episode) => void): PrivateGame {
  const entry = ledger.sources.find((source) => source.id === id);
  assert.ok(entry, `Unknown source ${id}`);
  const bytes = readFileSync(new URL(entry.recordPath, root));
  assert.equal(digest(bytes), entry.recordSha256, 'Historical record changed');
  const record = JSON.parse(bytes.toString('utf8')) as RecordFile;
  const config = JSON.parse(readFileSync(new URL(`qa/experiments/${entry.batch}/deals.json`, root), 'utf8')) as { episodes: Episode[] };
  const original = config.episodes.find((episode) => episode.id === entry.episode);
  assert.ok(original);
  assert.equal(digest(JSON.stringify(original)), entry.dealSha256);
  assert.equal(record.dealHash, entry.dealSha256);
  const episode = structuredClone(original);
  change?.(episode);
  const first = (episode.dealer + 1) % 4;
  const deck = Array.from({ length: 52 }, (_, index) => episode.hands[(first + index) % 4][Math.floor(index / 4)]);
  let state = createGame({ id: episode.id, mode: episode.mode, dealer: episode.dealer }, deck);
  state.scores = [...episode.scores];
  state.bags = [...episode.bags];
  for (const decision of record.decisions) {
    assert.equal(digest(JSON.stringify(decision.packet)), decision.packetHash);
    const obs = observe(state, state.turn!);
    if (!change) {
      assert.equal(decision.packet.game, obs.mode);
      assert.equal(decision.packet.seat, obs.seat);
      assert.deepEqual(decision.packet.hand, obs.hand);
      assert.deepEqual(decision.packet.bids, obs.bids);
      assert.deepEqual(decision.packet.tricks, obs.tricks);
      assert.deepEqual(decision.packet.scores, obs.scores);
      assert.deepEqual(decision.packet.bags, obs.bags);
      assert.deepEqual(decision.packet.completedTricks, obs.history);
      assert.deepEqual(decision.packet.currentTrick, obs.trick);
      assert.deepEqual([...decision.packet.legalActions].sort(), legalActions(state, state.turn!).map(actionId).sort());
    }
    if (decision.seq === entry.seq) {
      assert.equal(decision.packetHash, entry.packetSha256);
      return state;
    }
    assert.ok(legalActions(state, state.turn!).some((action) => actionId(action) === actionId(decision.action)));
    assert.ok(decision.action.kind !== 'pass', 'Spades source actions must be bids or plays');
    state = apply(state, decision.action);
    if (state.phase === 'trick-end') state = collectTrick(state);
  }
  throw new Error('Source sequence not found');
}

export const observedSources = ledger.sources;
