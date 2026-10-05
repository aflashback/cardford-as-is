import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { actionId, apply, collectTrick, createGame, legalActions, type Seat } from '../game/index.ts';
import { assertObservation, observe, type SeatObservation } from '../observations/index.ts';
import { analyzeDecision } from '../strategy/index.ts';
import { PARTNER_RESOURCE_POLICY } from '../games/spades/partner-resource/profile.ts';
import { JEV_MODEL, selectWithJev, type ProviderDependencies } from '../providers/openrouter.ts';
import { diagnoseResponse, type ResponseDiagnostic } from './jev-offline/fixtures.ts';
import { pilotCanonicalJson, pilotSourceHashes } from './spades-pack/pilot.ts';
import { spadesZeroDeal } from '../games/spades/evaluation/adapter.ts';
import { PARTNER_FRESH_SEEDS } from './partner-cases/measurement.ts';
import { assertSeat } from '../game/kernel/seats.ts';

/** Rebuild a packet from private development provenance; no stored aggregate is trusted. */
export function replayPartnerPacket(seed: number, actor: Seat, prefix: readonly string[]): SeatObservation {
  if (!Number.isSafeInteger(seed) || ![0, 1, 2, 3].includes(actor) || prefix.length > 56)
    throw new Error('Invalid bounded replay provenance.');
  let state = createGame(
    { id: 'offline-fresh-partner-deal', mode: 'spades-partners', dealer: (seed % 4) as Seat },
    spadesZeroDeal(seed),
  );
  for (const recorded of prefix) {
    if (state.phase === 'trick-end') state = collectTrick(state);
    const separator = recorded.indexOf(':');
    if (separator !== 1 || Number(recorded[0]) !== state.turn) throw new Error('Wrong replay actor.');
    const action = legalActions(state, state.turn!).find(
      (action) => actionId(action) === recorded.slice(separator + 1),
    );
    if (!action || action.kind === 'pass') throw new Error('Illegal replay prefix.');
    state = apply(state, action);
  }
  if (state.phase === 'trick-end') state = collectTrick(state);
  if (state.turn !== actor) throw new Error('Wrong replay decision actor.');
  return observe(state, actor);
}

export const PARTNER_JEV_EXPERIMENT = Object.freeze({
  id: 'partner-resource-fresh-shadow-2026-10-05-001',
  maxRequests: 1,
  maxCostUsd: 0.01,
});
export const PARTNER_JEV_DEADLINE_MS = 8000;
export const PARTNER_JEV_DATABASE_NAME = 'cardford_jev_comparison_20261005';
/** This one experiment uses a dedicated local ledger; URL aliases cannot select app/test data. */
export function requirePartnerJevDatabase(value: string | undefined, env: NodeJS.ProcessEnv): string {
  if (!value) throw new Error('An isolated durable comparison database is required.');
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.port !== '54330' ||
    decodeURIComponent(url.pathname) !== `/${PARTNER_JEV_DATABASE_NAME}` ||
    [env.DATABASE_URL, env.TEST_DATABASE_URL].some(
      (other) => other && decodeURIComponent(new URL(other).pathname) === decodeURIComponent(url.pathname),
    )
  )
    throw new Error('The dedicated local comparison ledger is required.');
  return value;
}
export type PartnerComparisonInput = {
  observation: SeatObservation;
  referenceActionId: string;
  candidateActionId: string;
  referencePolicy?: 'spades-plan-3.0.0' | 'spades-cases-4.0.0';
};
type Report = {
  experimentId: string;
  status: string;
  promotion: false;
  requests: number;
  requestedModel: string;
  observedModel: string | null;
  costUsd: number | null;
  costUnknown: boolean;
  diagnostic: ResponseDiagnostic | null;
  referenceActionId: string | null;
  candidateActionId: string | null;
  jevActionId: string | null;
};

/** The comparison recomputes both code choices; stale or altered packets fail before key access. */
export function validatePartnerComparison(input: PartnerComparisonInput): void {
  assertObservation(input.observation);
  if (input.observation.mode !== 'spades-partners' || input.observation.legalActions.length < 2)
    throw new Error('A non-forced Partners decision is required.');
  if (
    input.referencePolicy !== undefined &&
    !['spades-plan-3.0.0', 'spades-cases-4.0.0'].includes(input.referencePolicy)
  )
    throw new Error('Unknown comparison reference.');
  const reference = actionId(
    analyzeDecision(input.observation, input.referencePolicy ?? 'spades-cases-4.0.0').action,
  );
  const candidate = actionId(analyzeDecision(input.observation, PARTNER_RESOURCE_POLICY).action);
  if (
    reference === candidate ||
    reference !== input.referenceActionId ||
    candidate !== input.candidateActionId
  )
    throw new Error('A current, changed code decision is required.');
}

/** Cap-one J0 shadow diagnostic. Only the adapter's own/public allowlist reaches the model. */
export async function comparePartnerWithJev(
  input: PartnerComparisonInput,
  live: boolean,
  deps: ProviderDependencies,
): Promise<Report> {
  const report: Report = {
    experimentId: PARTNER_JEV_EXPERIMENT.id,
    status: 'not-run-explicit-live-flag-required',
    promotion: false,
    requests: 0,
    requestedModel: JEV_MODEL,
    observedModel: null,
    costUsd: null,
    costUnknown: true,
    diagnostic: null,
    referenceActionId: null,
    candidateActionId: null,
    jevActionId: null,
  };
  if (!live) return report;
  validatePartnerComparison(input);
  report.referenceActionId = input.referenceActionId;
  report.candidateActionId = input.candidateActionId;
  const ids = input.observation.legalActions.map(actionId);
  const fetcher = deps.fetch ?? globalThis.fetch;
  let reservations = 0;
  const outcome = await selectWithJev(
    {
      observation: input.observation,
      candidateIds: ids,
      mode: 'shadow',
      experiment: PARTNER_JEV_EXPERIMENT,
      deadlineAt: Date.now() + PARTNER_JEV_DEADLINE_MS,
    },
    {
      ...deps,
      attempts: {
        reserve: async (experiment, model, deadline) => {
          if (reservations >= PARTNER_JEV_EXPERIMENT.maxRequests) return null;
          reservations++;
          return deps.attempts.reserve(experiment, model, deadline);
        },
        finish: (id, record, deadline) => deps.attempts.finish(id, record, deadline),
      },
      fetch: async (url, init) => {
        if (report.requests >= PARTNER_JEV_EXPERIMENT.maxRequests) throw new Error('Comparison request cap.');
        report.requests++;
        const response = await fetcher(url, init);
        // Read only a bounded clone, retaining fixed category words rather than raw values.
        if (response.ok) {
          try {
            const raw = await response.clone().text();
            report.diagnostic =
              raw.length <= 1_000_000
                ? diagnoseResponse(JSON.parse(raw), ids)
                : {
                    category: 'envelope',
                    field: '(body)',
                    validatorClass: 'Invalid provider response.',
                    redacted: true,
                  };
          } catch {
            report.diagnostic = {
              category: 'envelope',
              field: '(body)',
              validatorClass: 'Invalid provider response.',
              redacted: true,
            };
          }
        }
        return response;
      },
    },
  );
  report.status = outcome.status === 'unavailable' ? `unavailable-${outcome.reason}` : outcome.status;
  report.observedModel = outcome.observedModel;
  if (outcome.status === 'selected' || outcome.status === 'unavailable') report.costUsd = outcome.costUsd;
  report.costUnknown = report.costUsd === null;
  if (outcome.status === 'selected') report.jevActionId = outcome.choice;
  return report;
}

async function cli(): Promise<void> {
  const live = process.argv.includes('--live');
  if (!live) {
    // No database, packet, credential or provider is accessed on this path.
    process.stdout.write(
      JSON.stringify({ status: 'not-run-explicit-live-flag-required', requests: 0, promotion: false }) + '\n',
    );
    return;
  }
  const directory = new URL('../../../qa/experiments/2026-10-05-partner-resource/', import.meta.url);
  if (existsSync(fileURLToPath(new URL('jev-result.json', directory)))) {
    process.stdout.write(
      JSON.stringify({ status: 'already-recorded-durable-cap-preserved', requests: 0, promotion: false }) +
        '\n',
    );
    return;
  }
  const raw: unknown = JSON.parse(
    await readFile(new URL('fresh/first-difference.private.json', directory), 'utf8'),
  );
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('observation' in raw) ||
    !('referenceActionId' in raw) ||
    typeof raw.referenceActionId !== 'string' ||
    !('candidateActionId' in raw) ||
    typeof raw.candidateActionId !== 'string'
  )
    throw new Error('Fresh comparison packet is unavailable.');
  assertObservation(raw.observation);
  if (
    !('seed' in raw) ||
    typeof raw.seed !== 'number' ||
    !Number.isSafeInteger(raw.seed) ||
    raw.seed < PARTNER_FRESH_SEEDS.from ||
    raw.seed >= PARTNER_FRESH_SEEDS.from + PARTNER_FRESH_SEEDS.count ||
    !('actor' in raw) ||
    !('prefix' in raw) ||
    !Array.isArray(raw.prefix) ||
    !raw.prefix.every((entry): entry is string => typeof entry === 'string')
  )
    throw new Error('Fresh replay provenance is unavailable.');
  assertSeat(raw.actor);
  const replayed = replayPartnerPacket(raw.seed, raw.actor, raw.prefix);
  if (pilotCanonicalJson(replayed) !== pilotCanonicalJson(raw.observation))
    throw new Error('Fresh packet differs from its production replay.');
  if (
    !('reference' in raw) ||
    (raw.reference !== 'spades-plan-3.0.0' && raw.reference !== 'spades-cases-4.0.0') ||
    !('sourceHashesHash' in raw) ||
    raw.sourceHashesHash !==
      createHash('sha256').update(pilotCanonicalJson(pilotSourceHashes())).digest('hex')
  )
    throw new Error('Fresh source manifest no longer matches.');
  const measurement: unknown = JSON.parse(await readFile(new URL('fresh/results.json', directory), 'utf8'));
  if (
    typeof measurement !== 'object' ||
    measurement === null ||
    !('sourceStable' in measurement) ||
    measurement.sourceStable !== true
  )
    throw new Error('Fresh measurement was not source stable.');
  const input: PartnerComparisonInput = {
    observation: raw.observation,
    referenceActionId: raw.referenceActionId,
    candidateActionId: raw.candidateActionId,
    referencePolicy: raw.reference,
  };
  validatePartnerComparison(input);
  const manifest =
    JSON.stringify(
      {
        ...PARTNER_JEV_EXPERIMENT,
        deadlineMs: PARTNER_JEV_DEADLINE_MS,
        mode: 'shadow',
        arm: 'J0',
        candidatePolicy: PARTNER_RESOURCE_POLICY,
        referencePolicy: input.referencePolicy,
        inputDigest: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
        promotion: false,
        stopOnUnknownCost: true,
        stopOnInvalidResponse: true,
      },
      null,
      2,
    ) + '\n';
  const manifestPath = new URL('jev-manifest.json', directory);
  try {
    await writeFile(manifestPath, manifest, { flag: 'wx' });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'EEXIST' ||
      (await readFile(manifestPath, 'utf8')) !== manifest
    )
      throw new Error('Comparison manifest is already bound to different input.');
  }
  // Separate durable comparison ledger, never the owner's saved-game DB or the test reset DB.
  const databaseUrl = requirePartnerJevDatabase(process.env.PARTNER_JEV_DATABASE_URL, process.env);
  try {
    await writeFile(
      new URL('jev-admission.json', directory),
      JSON.stringify(
        {
          experimentId: PARTNER_JEV_EXPERIMENT.id,
          inputDigest: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
          status: 'reserved-no-automatic-retry',
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      process.stdout.write(
        JSON.stringify({ status: 'already-admitted-no-retry', requests: 0, promotion: false }) + '\n',
      );
      return;
    }
    throw error;
  }
  const { createPool } = await import('../records/database.ts');
  const { migrate } = await import('../records/migrations.ts');
  const { durableAttemptPort } = await import('./jev-smoke.ts');
  const { loadOpenRouterKey } = await import('../providers/secrets.ts');
  const pool = createPool(databaseUrl);
  try {
    const identity = await pool.query('SELECT current_database() AS name');
    if (identity.rows[0]?.name !== PARTNER_JEV_DATABASE_NAME)
      throw new Error('Comparison database identity mismatch.');
    await migrate(pool);
    const report = await comparePartnerWithJev(input, true, {
      loadKey: (signal) => loadOpenRouterKey({ live: true, mode: 'shadow', maxRequests: 1, signal }),
      attempts: durableAttemptPort(pool),
    });
    // A rerun cannot overwrite the original result. The durable cap remains exhausted.
    await writeFile(new URL('jev-result.json', directory), JSON.stringify(report, null, 2) + '\n', {
      flag: 'wx',
    });
    process.stdout.write(JSON.stringify(report) + '\n');
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli().catch(() => {
    process.stdout.write(
      JSON.stringify({
        status: 'unavailable-packet-configuration-or-storage',
        requests: null,
        promotion: false,
      }) + '\n',
    );
    process.exitCode = 1;
  });
}
