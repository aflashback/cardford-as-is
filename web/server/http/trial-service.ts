import { randomInt, randomUUID } from 'node:crypto';
import type { TrialRequest, ReviewTrial } from '../../shared/contracts.ts';
import { ownedTransaction, saveGame } from '../records/repository.ts';
import type { Database } from '../records/database.ts';
import { coachAccess, observationView } from './views.ts';
import { ApiFailure } from './errors.ts';
import type { RequestContext } from './game-service.ts';
import { TrialPool } from '../coaching/trial-pool.ts';
import { fingerprint } from '../billing/store.ts';

interface Job {
  id: string;
  digest: string;
  seed: number;
  status: string;
  result: ReviewTrial | null;
  access_generation: number;
  expires_at: Date;
  attempt_fence: number;
}
export class TrialService {
  readonly database: Database;
  readonly workers = new TrialPool();
  /** Named policy per mode for simulated seats; a mode without an entry uses the live default. */
  readonly policies: Partial<Record<string, string>>;
  constructor(database: Database, policies: Partial<Record<string, string>> = {}) {
    this.database = database;
    this.policies = { ...policies };
  }
  async run(context: RequestContext, body: TrialRequest): Promise<ReviewTrial> {
    const prepared = await ownedTransaction(this.database, context.token, async (client, player, game) => {
      if (!game || game.id !== body.gameId)
        throw new ApiFailure(404, 'NOT_FOUND', 'Review only your current game.');
      const digest = fingerprint(body);
      const existing = (
        await client.query<Job>('SELECT * FROM analysis_jobs WHERE player_id=$1 AND command_id=$2', [
          player.id,
          body.commandId,
        ])
      ).rows[0];
      if (existing && existing.digest !== digest)
        throw new ApiFailure(409, 'IDEMPOTENCY_CONFLICT', 'This trial request was already used.');
      if (existing?.status === 'ready')
        return {
          cached: existing.result!,
          job: existing,
          source: game.document.decisions.find((d) => d.id === body.decisionId)!,
          playerId: player.id,
        };
      if (game.revision !== body.expectedRevision)
        throw new ApiFailure(409, 'STALE_REVISION', 'The live table changed. Reopen review.');
      if (game.document.control.tab !== context.tab || game.document.control.token !== body.controlLeaseToken)
        throw new ApiFailure(409, 'LEASE_LOST', 'Take control before exploring a continuation.');
      const source = game.document.decisions.find((d) => d.id === body.decisionId);
      if (!source || source.action.kind !== 'play')
        throw new ApiFailure(400, 'INVALID_COMMAND', 'Choose a recorded card decision.');
      const access = await coachAccess(client, player, game, source.handNumber);
      if (!access.canStartWork || !access.handUnlocked)
        throw new ApiFailure(403, 'FORBIDDEN', 'Unlock coaching for the selected hand first.');
      if (!source.observation.legalActions.some((a) => a.kind === 'play' && a.card === body.alternative.card))
        throw new ApiFailure(400, 'INVALID_COMMAND', 'That card was not legal at this decision.');
      if (existing) {
        if (existing.digest !== digest)
          throw new ApiFailure(409, 'IDEMPOTENCY_CONFLICT', 'This trial request was already used.');
        if (existing.access_generation !== player.access_generation)
          throw new ApiFailure(403, 'FORBIDDEN', 'Access changed. Start a new trial.');
        if (existing.status === 'ready')
          return { cached: existing.result!, job: existing, source, playerId: player.id };
        if (existing.status === 'queued' && existing.expires_at.getTime() > Date.now())
          throw new ApiFailure(
            503,
            'SERVICE_UNAVAILABLE',
            'This continuation is still being prepared. Retry the same request.',
          );
      }
      await client.query(
        "UPDATE analysis_jobs SET status='expired' WHERE player_id=$1 AND status='queued' AND expires_at<=now()",
        [player.id],
      );
      if (
        (
          await client.query("SELECT 1 FROM analysis_jobs WHERE player_id=$1 AND status='queued'", [
            player.id,
          ])
        ).rowCount
      )
        throw new ApiFailure(503, 'SERVICE_UNAVAILABLE', 'One continuation is already being prepared.');
      const seed = existing?.seed ?? randomInt(2147483647),
        id = existing?.id ?? randomUUID();
      const job = (
        await client.query<Job>(
          "INSERT INTO analysis_jobs(id,player_id,game_id,command_id,digest,revision,access_generation,seed,status,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'queued',now()+interval '8 seconds') ON CONFLICT(player_id,command_id) DO UPDATE SET status='queued',expires_at=EXCLUDED.expires_at,attempt_fence=analysis_jobs.attempt_fence+1 RETURNING *",
          [id, player.id, game.id, body.commandId, digest, game.revision, player.access_generation, seed],
        )
      ).rows[0];
      return { cached: null, job, source, playerId: player.id };
    });
    if (prepared.cached) return prepared.cached;
    const result = await this.workers.run(
      prepared.source.observation,
      { kind: 'play', seat: 0, card: body.alternative.card },
      prepared.job.seed,
      this.policies[prepared.source.observation.mode],
    );
    const published = await ownedTransaction(this.database, context.token, async (client, player, game) => {
      const lease = (
        await client.query<Job & { valid: boolean }>(
          'SELECT *,expires_at>clock_timestamp() AS valid FROM analysis_jobs WHERE id=$1 FOR UPDATE',
          [prepared.job.id],
        )
      ).rows[0];
      if (
        !lease ||
        lease.status !== 'queued' ||
        !lease.valid ||
        lease.attempt_fence !== prepared.job.attempt_fence
      ) {
        if (lease?.attempt_fence === prepared.job.attempt_fence && lease.status === 'queued')
          await client.query("UPDATE analysis_jobs SET status='expired' WHERE id=$1", [prepared.job.id]);
        return {
          error: new ApiFailure(
            409,
            'STALE_REVISION',
            'The analysis lease expired. Start another continuation.',
          ),
        };
      }
      if (
        !game ||
        game.id !== body.gameId ||
        game.revision !== body.expectedRevision ||
        game.document.control.tab !== context.tab ||
        game.document.control.token !== body.controlLeaseToken ||
        player.access_generation !== prepared.job.access_generation
      ) {
        await client.query("UPDATE analysis_jobs SET status='expired' WHERE id=$1", [prepared.job.id]);
        return {
          error: new ApiFailure(
            409,
            'STALE_REVISION',
            'The live table or access changed; the continuation was discarded.',
          ),
        };
      }
      const access = await coachAccess(client, player, game, prepared.source.handNumber);
      if (!access.canStartWork || !access.handUnlocked) {
        await client.query("UPDATE analysis_jobs SET status='expired' WHERE id=$1", [prepared.job.id]);
        return { error: new ApiFailure(403, 'FORBIDDEN', 'New analysis is no longer covered.') };
      }
      if (result.status === 'unavailable') {
        await client.query("UPDATE analysis_jobs SET status='unavailable' WHERE id=$1", [prepared.job.id]);
        return { error: new ApiFailure(503, 'SERVICE_UNAVAILABLE', result.reason) };
      }
      const view: ReviewTrial = {
        trialId: body.trialId,
        decisionId: body.decisionId,
        label: 'Possible continuation',
        liveRevision: game.revision,
        frames: result.frames.map((obs, index) => ({
          game: observationView(game.id, obs),
          action: index === 1 ? body.alternative : null,
          decisionId: body.decisionId,
          notes: index === 0 ? result.limitations : [],
        })),
      };
      game.document.exposure[body.decisionId] = 3;
      game.document.pendingExposure = 3;
      await saveGame(client, game);
      await client.query("UPDATE analysis_jobs SET status='ready',result=$2 WHERE id=$1", [
        prepared.job.id,
        view,
      ]);
      return { view };
    });
    if (published.error) throw published.error;
    return published.view;
  }
  close() {
    return this.workers.close();
  }
}
