import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Pool } from 'pg';
import { testDatabase } from '../billing/database-test.ts';
import { newIdentity, hashToken } from '../records/repository.ts';
import type { GameDocument } from '../records/types.ts';
import type { Advice } from '../coaching/templates.ts';
import { GameService } from '../http/game-service.ts';
import type { SessionView } from '../../shared/contracts.ts';

type Saved = {
  analysis: { policyVersion: string; action: unknown };
  adviceSnapshot: Advice;
};
type Document = GameDocument & {
  tableType?: 'practice-bots';
  decisionAnalyses?: Record<string, Saved>;
};
const envelope = (view: SessionView) => ({
  commandId: randomUUID(),
  gameId: view.game.id,
  expectedRevision: view.revision,
  controlLeaseToken: view.controlLeaseToken,
});
async function readDocument(pool: Pool, gameId: string): Promise<Document> {
  return (await pool.query<{ document: Document }>('SELECT document FROM games WHERE id=$1', [gameId]))
    .rows[0]!.document;
}
async function fixture(pool: Pool, exhausted = false) {
  const token = await newIdentity(pool);
  const context = { token, tab: randomUUID() };
  const service = new GameService(pool);
  const id = (
    await pool.query<{ player_id: string }>('SELECT player_id FROM sessions WHERE token_hash=$1', [
      hashToken(token),
    ])
  ).rows[0]!.player_id;
  const first = await service.session(context);
  await service.preferences(context, {
    commandId: randomUUID(),
    preferences: { coachMode: 'after', gameSpeed: 1 },
  });
  if (exhausted) {
    await pool.query("UPDATE players SET profile=jsonb_set(profile,'{plan}','\"practice\"') WHERE id=$1", [
      id,
    ]);
    for (let hand = 100; hand < 104; hand++)
      await pool.query(
        "INSERT INTO coached_hands(player_id,game_id,hand_number,period) VALUES($1,$2,$3,(now() AT TIME ZONE 'UTC')::date)",
        [id, first.game.id, hand],
      );
  }
  const view = await service.newSession(context, {
    commandId: randomUUID(),
    mode: 'hearts',
    expectedActiveGameId: first.game.id,
  });
  return { id, context, service, view };
}

test('COACH-09: quiet exhausted play stores human analysis without guidance, assistance or charge', async (t) => {
  const pool = await testDatabase(t);
  if (!pool) return;
  const f = await fixture(pool, true);
  assert.equal(f.view.preferences.coachMode, 'after');
  assert.equal(f.view.access.remainingHands, 0);
  assert.equal(f.view.access.canPlay, true);
  const before = await readDocument(pool, f.view.game.id);
  assert.equal(before.tableType, 'practice-bots');
  const saved = before.decisionAnalyses?.[f.view.decisionId];
  assert.ok(saved, 'eligible quiet human decision must have persisted analysis');
  assert.ok(saved.adviceSnapshot.pass?.length === 3);
  assert.deepEqual(before.exposure, {});
  assert.deepEqual(before.savedAdvice, {});
  assert.equal(before.pendingExposure ?? 0, 0);
  assert.deepEqual(before.stats, { decisions: 0, helped: 0, suggestions: 0 });
  assert.equal(JSON.stringify(f.view).includes('decisionAnalyses'), false);

  const body = { ...envelope(f.view), action: f.view.game.legalActions[0]! };
  const next = await f.service.action(f.context, body);
  assert.deepEqual(await f.service.action(f.context, body), next);
  const after = await readDocument(pool, f.view.game.id);
  assert.deepEqual(after.decisionAnalyses?.[f.view.decisionId], saved);
  assert.equal(after.decisions.length, 1);
  assert.equal(after.decisions[0]!.assisted, false);
  assert.deepEqual(after.stats, { decisions: 1, helped: 0, suggestions: 0 });
  assert.deepEqual(after.savedAdvice, {});
  assert.deepEqual(after.exposure, {});
  assert.equal(
    (await pool.query('SELECT count(*) FROM coached_hands WHERE player_id=$1', [f.id])).rows[0].count,
    '4',
  );
});

test('COACH-10: later authorized review reveals the original saved explanation and policy', async (t) => {
  const pool = await testDatabase(t);
  if (!pool) return;
  const f = await fixture(pool);
  const document = await readDocument(pool, f.view.game.id);
  const saved = document.decisionAnalyses?.[f.view.decisionId];
  assert.ok(saved);
  // A stored historic revision intentionally differs from today's renderer.
  saved.analysis.policyVersion = 'historical-fixture-1';
  saved.adviceSnapshot.policyVersion = 'historical-fixture-1';
  saved.adviceSnapshot.reason = 'Historical authored explanation.';
  await pool.query('UPDATE games SET document=$1 WHERE id=$2', [document, f.view.game.id]);
  const next = await f.service.action(f.context, {
    ...envelope(f.view),
    action: f.view.game.legalActions[0]!,
  });
  const unlocked = await f.service.unlock(f.context, {
    requestId: randomUUID(),
    gameId: next.game.id,
    expectedRevision: next.revision,
    controlLeaseToken: next.controlLeaseToken,
    handId: `${next.game.id}:1`,
    decisionId: f.view.decisionId,
    requestedLevel: 2,
  });
  assert.equal(unlocked.advice.reason, 'Historical authored explanation.');
  assert.equal(unlocked.advice.suggestion, '');
  assert.equal(unlocked.advice.pass, undefined);
  assert.equal(JSON.stringify(unlocked).includes('candidates'), false);
  const persisted = await readDocument(pool, next.game.id);
  assert.deepEqual(persisted.decisionAnalyses?.[f.view.decisionId], saved);
  assert.equal(persisted.decisions[0]!.assisted, false, 'later review cannot rewrite prior assistance');
  assert.equal(persisted.exposure[f.view.decisionId], 2);
});

test('COACH-10: legacy review keeps issued advice but cannot invent missing original analysis', async (t) => {
  const pool = await testDatabase(t);
  if (!pool) return;
  const f = await fixture(pool);
  const issued = await f.service.advice(f.context, {
    ...envelope(f.view),
    decisionId: f.view.decisionId,
    requestedLevel: 1,
  });
  const next = await f.service.action(f.context, {
    ...envelope(f.view),
    action: f.view.game.legalActions[0]!,
  });
  await pool.query("UPDATE games SET document=document-'decisionAnalyses' WHERE id=$1", [next.game.id]);
  assert.deepEqual(
    await f.service.advice(f.context, {
      ...envelope(next),
      decisionId: f.view.decisionId,
      requestedLevel: 1,
    }),
    issued,
  );
  await assert.rejects(
    f.service.unlock(f.context, {
      requestId: randomUUID(),
      gameId: next.game.id,
      expectedRevision: next.revision,
      controlLeaseToken: next.controlLeaseToken,
      handId: `${next.game.id}:1`,
      decisionId: f.view.decisionId,
      requestedLevel: 2,
    }),
    /original.*analysis.*unavailable/i,
  );
  const review = await f.service.review(f.context, f.view.decisionId);
  assert.ok(review.frames.length > 0, 'factual replay remains available');
  const index = await f.service.reviews(f.context);
  assert.match(index.cases[0]!.summary, /original.*analysis.*unavailable/i);
});

test('COACH-09: rejected actions roll back fallback analysis and accepted retries persist exactly once', async (t) => {
  const pool = await testDatabase(t);
  if (!pool) return;
  const f = await fixture(pool);
  await pool.query("UPDATE games SET document=document-'decisionAnalyses' WHERE id=$1", [f.view.game.id]);
  const before = await readDocument(pool, f.view.game.id);
  await assert.rejects(
    f.service.action(f.context, {
      ...envelope(f.view),
      action: { kind: 'pass', cards: ['C2', 'C2', 'C2'] },
    }),
    /not legal/i,
  );
  assert.deepEqual(await readDocument(pool, f.view.game.id), before);
  const body = { ...envelope(f.view), action: f.view.game.legalActions[0]! };
  const next = await f.service.action(f.context, body);
  assert.deepEqual(await f.service.action(f.context, body), next);
  const after = await readDocument(pool, f.view.game.id);
  assert.ok(after.decisionAnalyses?.[f.view.decisionId]);
  assert.equal(after.decisions.length, 1);
  assert.equal(
    (await pool.query('SELECT count(*) FROM game_events WHERE game_id=$1', [f.view.game.id])).rows[0].count,
    '1',
  );
});

for (const mode of ['spades-solo', 'spades-partners'] as const)
  test(`COACH-09: each ${mode} human turn is saved before play, including forced decisions`, async (t) => {
    const pool = await testDatabase(t);
    if (!pool) return;
    const f = await fixture(pool, true);
    let view = await f.service.newSession(f.context, {
      commandId: randomUUID(),
      mode,
      expectedActiveGameId: f.view.game.id,
    });
    let accepted = 0;
    let forced = 0;
    for (let step = 0; !['hand-end', 'match-end'].includes(view.game.phase) && step < 100; step++) {
      if (view.game.legalActions.length) {
        const document = await readDocument(pool, view.game.id);
        const saved = document.decisionAnalyses?.[view.decisionId];
        assert.ok(saved, `analysis missing before human decision ${view.decisionId}`);
        const wasForced = view.game.legalActions.length === 1;
        const decisionsBefore = view.stats.decisions;
        if (wasForced) {
          forced++;
          assert.equal(saved.adviceSnapshot.provenance, 'forced');
        }
        view = await f.service.action(f.context, {
          ...envelope(view),
          action: view.game.legalActions[0]!,
        });
        accepted++;
        if (wasForced) assert.equal(view.stats.decisions, decisionsBefore);
      } else if (view.game.phase === 'trick-end') {
        view = await f.service.advance(f.context, { ...envelope(view), kind: 'collect-trick' });
      } else {
        const prepared = await f.service.prepare(f.context, envelope(view));
        view = await f.service.advance(f.context, {
          ...envelope(view),
          kind: 'bot',
          preparedDecisionId: prepared.preparedDecisionId,
        });
      }
    }
    assert.equal(view.game.phase, 'hand-end');
    assert.equal(accepted, 14, 'one bid and thirteen human card decisions');
    assert.ok(forced >= 1, 'the final card must be forced');
    const final = await readDocument(pool, view.game.id);
    assert.equal(Object.keys(final.decisionAnalyses ?? {}).length, 14);
    assert.equal(final.decisions.length, 14);
    assert.ok(final.decisions.every((decision) => !decision.assisted));
    assert.deepEqual(final.savedAdvice, {});
    assert.deepEqual(final.exposure, {});
    assert.equal(final.stats.helped, 0);
    assert.equal(final.stats.suggestions, 0);
    assert.equal(
      (await pool.query('SELECT count(*) FROM coached_hands WHERE player_id=$1', [f.id])).rows[0].count,
      '4',
    );
  });
