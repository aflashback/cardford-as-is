import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createGame, fullDeck, actionId } from '../game/index.ts';
import { observe } from '../observations/index.ts';
import {
  JEV_MODEL,
  selectWithJev,
  beforeDeadline,
  type AttemptDeadline,
  type AttemptPort,
  type AttemptRecord,
} from '../providers/openrouter.ts';
import { loadOpenRouterKey } from '../providers/secrets.ts';
export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(destroy?: boolean): void;
}
export interface SqlPool {
  connect(): Promise<SqlClient>;
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}
/** Destroy timed-out sessions instead of waiting for rollback or returning busy clients to the pool. */
async function attemptTransaction<T>(
  pool: SqlPool,
  supplied: AttemptDeadline | undefined,
  work: (query: SqlClient['query']) => Promise<T>,
): Promise<T> {
  const deadline = supplied ?? { deadlineAt: Date.now() + 8000 };
  let abandoned = false;
  let acquired: SqlClient | undefined;
  let client: SqlClient;
  try {
    client = await beforeDeadline(async () => {
      const connected = await pool.connect();
      if (abandoned || deadline.signal?.aborted || Date.now() >= deadline.deadlineAt) {
        connected.release(true);
        throw new Error('Provider attempt connection expired.');
      }
      acquired = connected;
      return connected;
    }, deadline);
  } catch {
    abandoned = true;
    acquired?.release(true);
    throw new Error('Provider attempt admission storage is unavailable.');
  }
  let committed = false;
  try {
    const raw: SqlClient['query'] = (sql, values) =>
      beforeDeadline(() => client.query(sql, values), deadline);
    await raw('BEGIN');
    const query: SqlClient['query'] = async (sql, values) => {
      const remaining = Math.max(1, Math.floor(deadline.deadlineAt - Date.now()));
      await raw("SELECT set_config('statement_timeout',$1,true), set_config('lock_timeout',$1,true)", [
        `${remaining}ms`,
      ]);
      return raw(sql, values);
    };
    const result = await work(query);
    await query('COMMIT');
    committed = true;
    return result;
  } finally {
    // A lost COMMIT acknowledgement may have persisted a pending attempt; never delete/refund it.
    client.release(!committed);
  }
}
/** A pending/ambiguous attempt blocks further dispatch, including after process restart. */
export function durableAttemptPort(pool: SqlPool): AttemptPort {
  return {
    async reserve(experiment, requestedModel, deadline) {
      if (
        requestedModel !== JEV_MODEL ||
        !Number.isInteger(experiment.maxRequests) ||
        experiment.maxRequests < 1 ||
        experiment.maxRequests > 3 ||
        !Number.isFinite(experiment.maxCostUsd) ||
        experiment.maxCostUsd <= 0
      )
        throw new Error('Invalid durable experiment cap.');
      try {
        return await attemptTransaction(pool, deadline, async (query) => {
          await query('SELECT pg_advisory_xact_lock(hashtext($1))', [experiment.id]);
          const previous = await query('SELECT outcome FROM provider_attempts WHERE experiment_id=$1', [
            experiment.id,
          ]);
          let cost = 0,
            blocked = previous.rows.length >= experiment.maxRequests;
          for (const row of previous.rows) {
            let record: unknown;
            try {
              record = JSON.parse(String(row.outcome));
            } catch {
              record = null;
            }
            if (
              typeof record !== 'object' ||
              record === null ||
              !('costUsd' in record) ||
              typeof record.costUsd !== 'number' ||
              !Number.isFinite(record.costUsd) ||
              record.costUsd < 0
            )
              blocked = true;
            else cost += record.costUsd;
          }
          if (blocked || cost >= experiment.maxCostUsd) {
            return null;
          }
          const id = randomUUID();
          await query(
            'INSERT INTO provider_attempts(id,experiment_id,requested_model,outcome) VALUES($1,$2,$3,$4)',
            [
              id,
              experiment.id,
              requestedModel,
              JSON.stringify({ status: 'reserved', observedModel: null, costUsd: null }),
            ],
          );
          return id;
        });
      } catch {
        throw new Error('Provider attempt admission storage is unavailable.');
      }
    },
    async finish(id, record, deadline) {
      await attemptTransaction(pool, deadline, async (query) => {
        const saved = await query(
          'UPDATE provider_attempts SET observed_model=$2,outcome=$3 WHERE id=$1 RETURNING id',
          [
            id,
            record.observedModel,
            JSON.stringify({
              status: record.status,
              observedModel: record.observedModel,
              costUsd: record.costUsd,
            } satisfies AttemptRecord),
          ],
        );
        if (saved.rows.length !== 1) throw new Error('Attempt outcome was not persisted.');
      });
    },
  };
}
type SmokeReport = {
  status: string;
  requestedModel: string;
  observedModel: string | null;
  costUsd: number | null;
  costUnknown: boolean;
  promotion: false;
};
export async function runJevSmoke(live: boolean): Promise<SmokeReport> {
  if (!live)
    return {
      status: 'not-run-explicit-live-flag-required',
      requestedModel: JEV_MODEL,
      observedModel: null,
      costUsd: null,
      costUnknown: true,
      promotion: false,
    };
  const manifest = JSON.parse(
    await readFile(new URL('./jev-smoke-manifest.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>;
  if (
    manifest.maxRequests !== 1 ||
    manifest.requestedModel !== JEV_MODEL ||
    manifest.mode !== 'shadow' ||
    manifest.promotion !== false ||
    manifest.stopOnUnknownCost !== true ||
    manifest.deadlineMs !== 8000 ||
    typeof manifest.id !== 'string' ||
    typeof manifest.maxCostUsd !== 'number' ||
    manifest.maxCostUsd <= 0 ||
    manifest.maxCostUsd > 0.01
  )
    throw new Error('Invalid frozen Jev smoke manifest.');
  // Dynamic imports make no-live execution independent of DB initialization or credential configuration.
  const configUrl = new URL('../config.ts', import.meta.url).href;
  const config = (await import(configUrl)) as { loadLocalEnvironment: () => void };
  config.loadLocalEnvironment();
  if (process.env.JEV_MODE !== 'shadow' || process.env.JEV_MAX_REQUESTS !== '1')
    return {
      status: 'not-run-explicit-shadow-and-cap1-required',
      requestedModel: JEV_MODEL,
      observedModel: null,
      costUsd: null,
      costUnknown: true,
      promotion: false,
    };
  if (!process.env.DATABASE_URL) throw new Error('Smoke database configuration is unavailable.');
  const databaseUrl = new URL('../records/database.ts', import.meta.url).href;
  const database = (await import(databaseUrl)) as { createPool: (connectionString: string) => SqlPool };
  const pool = database.createPool(process.env.DATABASE_URL);
  try {
    const observation = observe(
      createGame({ id: 'synthetic-smoke-not-sent', mode: 'spades-solo', dealer: 3 }, fullDeck()),
      0,
    );
    const result = await selectWithJev(
      {
        observation,
        candidateIds: observation.legalActions.map(actionId),
        mode: 'shadow',
        experiment: { id: manifest.id, maxRequests: 1, maxCostUsd: manifest.maxCostUsd },
        deadlineAt: Date.now() + 8000,
      },
      {
        loadKey: (signal) => loadOpenRouterKey({ live: true, mode: 'shadow', maxRequests: 1, signal }),
        attempts: durableAttemptPort(pool),
      },
    );
    const costUsd = result.status === 'selected' || result.status === 'unavailable' ? result.costUsd : null;
    return {
      status: result.status === 'unavailable' ? `unavailable-${result.reason}` : result.status,
      requestedModel: JEV_MODEL,
      observedModel: result.observedModel,
      costUsd,
      costUnknown: costUsd === null,
      promotion: false,
    };
  } finally {
    // The decision deadline has already returned; pool cleanup may wait for a late acquisition
    // to be released. Production pool connectionTimeoutMillis bounds that acquisition to 3s.
    await pool.end();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const live = process.argv.slice(2).includes('--live');
  try {
    const report = await runJevSmoke(live);
    if (live)
      await writeFile(
        new URL('./evidence/jev-smoke.json', import.meta.url),
        JSON.stringify(report, null, 2) + '\n',
      );
    process.stdout.write(JSON.stringify(report) + '\n');
  } catch {
    process.stdout.write(
      JSON.stringify({
        status: 'unavailable-local-configuration-or-storage',
        requestedModel: JEV_MODEL,
        observedModel: null,
        costUsd: null,
        costUnknown: true,
        promotion: false,
      }) + '\n',
    );
    process.exitCode = 1;
  }
}
