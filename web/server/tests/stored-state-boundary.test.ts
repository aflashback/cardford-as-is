import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { testDatabase } from '../billing/database-test.ts';
import { GameService } from '../http/game-service.ts';
import { newIdentity, ownedTransaction, saveGame } from '../records/repository.ts';
import type { GameDocument } from '../records/types.ts';
import type { SessionView } from '../../shared/contracts.ts';

test('stored rules/state are validated before any gameplay callback and corruption remains untouched', async (t) => {
  const pool = await testDatabase(t); if (!pool) return;
  for (const mode of ['hearts', 'spades-solo', 'spades-partners'] as const) {
    const context = { token: await newIdentity(pool), tab: randomUUID() };
    const service: GameService = new GameService(pool);
    const initial = await service.session(context);
    const view: SessionView = await service.newSession(context, {
      commandId: randomUUID(), mode, expectedActiveGameId: initial.game.id,
    });
    const original: GameDocument = (await pool.query<{ document: GameDocument }>('SELECT document FROM games WHERE id=$1', [view.game.id])).rows[0]!.document;
    const invalidStates = [
      { ...original.state, hands: [original.state.hands[0], original.state.hands[0], original.state.hands[2], original.state.hands[3]] },
      { ...original.state, hiddenExtra: original.state.hands },
      { ...original.state, moduleVersion: 'uninstalled-version' },
      { ...original.state, id: randomUUID() },
      { ...original.state, scores: [999, 999, 999, 999] },
    ];
    for (const state of invalidStates) {
      const corrupt = { ...original, state };
      await pool.query('UPDATE games SET document=$1 WHERE id=$2', [corrupt, view.game.id]);
      let calls = 0;
      await assert.rejects(ownedTransaction(pool, context.token, async () => { calls++; }), /saved game state/i);
      assert.equal(calls, 0, `${mode}: corruption reached the gameplay callback`);
      assert.deepEqual((await pool.query('SELECT document FROM games WHERE id=$1', [view.game.id])).rows[0]!.document, corrupt);
    }
  }
});

test('save validates the active state and rolls back instead of persisting a corrupt update', async (t) => {
  const pool = await testDatabase(t); if (!pool) return;
  const context = { token: await newIdentity(pool), tab: randomUUID() };
  const view = await new GameService(pool).session(context);
  const original = (await pool.query('SELECT revision,document FROM games WHERE id=$1', [view.game.id])).rows[0];
  await assert.rejects(ownedTransaction(pool, context.token, async (client, _player, game) => {
    assert.ok(game);
    game.document.state.hands[0][0] = game.document.state.hands[1][0]!;
    game.revision++;
    await saveGame(client, game);
  }), /saved game state/i);
  assert.deepEqual((await pool.query('SELECT revision,document FROM games WHERE id=$1', [view.game.id])).rows[0], original);
});

test('valid load/save preserves original records and does not supply a missing historical policy', async (t) => {
  const pool = await testDatabase(t); if (!pool) return;
  const context = { token: await newIdentity(pool), tab: randomUUID() };
  const view = await new GameService(pool).session(context);
  await pool.query("UPDATE games SET document=document-'reasoningPolicy' WHERE id=$1", [view.game.id]);
  const original = (await pool.query('SELECT document FROM games WHERE id=$1', [view.game.id])).rows[0]!.document;
  await ownedTransaction(pool, context.token, async (client, _player, game) => {
    assert.ok(game);
    assert.equal(game.document.reasoningPolicy, undefined);
    await saveGame(client, game);
  });
  assert.deepEqual((await pool.query('SELECT document FROM games WHERE id=$1', [view.game.id])).rows[0]!.document, original);
});

test('owned receipt lookup can omit an unavailable active game without weakening identity checks', async (t) => {
  const pool = await testDatabase(t); if (!pool) return;
  const token = await newIdentity(pool);
  const view = await new GameService(pool).session({ token, tab: randomUUID() });
  await pool.query("UPDATE games SET document=jsonb_set(document,'{state,moduleVersion}','\"unavailable\"') WHERE id=$1", [view.game.id]);
  await ownedTransaction(pool, token, async (_client, player, game) => {
    assert.equal(player.active_game_id, view.game.id);
    assert.ok(game === null, 'receipt lookup must omit the active game');
  }, { loadGame: false });
  await assert.rejects(ownedTransaction(pool, 'not-a-session', async () => assert.fail('unauthenticated callback'), { loadGame: false }), /session/i);
});
