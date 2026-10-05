import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { actionId, createGame, type PrivateGame, type Seat } from '../../game/index.ts';
import { observe, type SeatObservation } from '../../observations/index.ts';
import { analyzeDecision, chooseAction } from '../../strategy/index.ts';
import { explain } from '../../coaching/templates.ts';
import { checkSpadesClaims } from '../../games/spades/evaluation/claims/check.ts';
import { spadesZeroDeal, SPADES_DEAL_GENERATOR } from '../../games/spades/evaluation/adapter.ts';
import { walkSpadesRound } from '../../games/spades/evaluation/shadow.ts';
import { PARTNER_RESOURCE_POLICY } from '../../games/spades/partner-resource/profile.ts';
import { pilotCanonicalJson, pilotSourceHashes } from '../spades-pack/pilot.ts';
import { PARTNER_FIXTURES, partnerFixture } from './fixtures.ts';

export const PARTNER_MEASUREMENT_SCHEMA = 'partner-resource-measurement-1.0.0';
/** Declared independent development range; no prior seed range or archived pilot is reused. */
export const PARTNER_FRESH_SEEDS = { from: 64_100_001, count: 64, purpose: 'fresh-development' } as const;
const hash = (value: unknown) => createHash('sha256').update(pilotCanonicalJson(value)).digest('hex');
const save = (directory: string, name: string, value: unknown) =>
  writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2) + '\n');
export type PartnerMeasurementOptions = {
  output: string;
  count?: number;
  references?: ('spades-plan-3.0.0' | 'spades-cases-4.0.0')[];
  maxWallMs?: number;
};
export type FirstPartnerDifference = {
  seed: number;
  reference: string;
  candidate: string;
  decisionIndex: number;
  actor: Seat;
  /** PRIVATE archive: production replay and later actor-safe projection only. */
  state: PrivateGame;
  observation: SeatObservation;
  prefix: string[];
  deck: string[];
  referenceActionId: string;
  candidateActionId: string;
  sourceHashesHash: string;
  observationHash: string;
};

/** PR-04: bounded descriptive measurement; seed is the independent unit, rotations are related. */
export function runPartnerResourceMeasurement(options: PartnerMeasurementOptions) {
  const count = options.count ?? 32;
  if (!Number.isInteger(count) || count < 1 || count > PARTNER_FRESH_SEEDS.count)
    throw new Error('Fresh deal count must be 1..64.');
  const maxWallMs = options.maxWallMs ?? 60_000;
  if (!Number.isInteger(maxWallMs) || maxWallMs < 100 || maxWallMs > 60_000)
    throw new Error('Wall cap must be 100..60000 ms.');
  const references = options.references ?? ['spades-plan-3.0.0', 'spades-cases-4.0.0'];
  if (
    !references.length ||
    references.some((id) => id !== 'spades-plan-3.0.0' && id !== 'spades-cases-4.0.0') ||
    new Set(references).size !== references.length
  )
    throw new Error('Invalid reference policies.');
  const output = resolve(options.output);
  if (existsSync(resolve(output, 'manifest.json')) || existsSync(resolve(output, 'results.json')))
    throw new Error('Evidence output already exists; use a new run directory.');
  mkdirSync(output, { recursive: true });
  const sourceHashes = pilotSourceHashes();
  const sourceHashesHash = hash(sourceHashes);
  const manifest = {
    schemaVersion: PARTNER_MEASUREMENT_SCHEMA,
    purpose: 'fresh-development-description',
    mode: 'spades-partners',
    candidate: PARTNER_RESOURCE_POLICY,
    references,
    seeds: { ...PARTNER_FRESH_SEEDS, count },
    dealGenerator: SPADES_DEAL_GENERATOR,
    rotations: [0, 1, 2, 3],
    environment: 'all-other-seats-use-reference',
    maxWallMs,
    sourceHashes,
    sourceHashesHash,
    providerMode: 'offline',
    observedModelId: null,
    humanReview: 'not-run-owner-deferred',
    limits: [
      'One zero-start hand per seed/rotation/arm; no match experiment or strength gate.',
      'Related seat rotations and reference comparisons are not independent deals.',
      'Exact public resource proofs do not prove strategic superiority or teaching benefit.',
    ],
  };
  save(output, 'manifest.json', manifest);
  const fixtures = PARTNER_FIXTURES.map((id) => {
    const state = partnerFixture(id);
    const obs = observe(state, state.turn!);
    const candidate = analyzeDecision(obs, PARTNER_RESOURCE_POLICY);
    const advice = explain(obs, candidate);
    return {
      id,
      actor: obs.seat,
      observation: obs,
      observationHash: hash(obs),
      analysis: candidate,
      advice,
      claims: checkSpadesClaims(state, obs.seat, advice.claims ?? []),
      references: Object.fromEntries(
        references.map((reference) => [reference, actionId(analyzeDecision(obs, reference).action)]),
      ),
    };
  });
  save(output, 'fixture-report.json', {
    schemaVersion: PARTNER_MEASUREMENT_SCHEMA,
    partition: 'authored-development',
    fixtures,
  });
  let firstDifference: FirstPartnerDifference | null = null;
  const summaries = Object.fromEntries(
    references.map((reference) => [
      reference,
      {
        hands: 0,
        shadowUnforced: 0,
        offerActivations: 0,
        secureActivations: 0,
        changedActions: 0,
        illegalActions: 0,
        checkedClaims: 0,
        falseClaims: 0,
        notCheckableClaims: 0,
        pairedRows: 0,
        changedPairActionStreams: 0,
        marginDeltaSum: 0,
      },
    ]),
  );
  const rows: unknown[] = [];
  const visitedSeeds = new Set<number>();
  const pairedCoverage: Record<string, { reference: string; seed: number; actors: Seat[] }> = {};
  const started = performance.now();
  let capped = false;
  const policy = (id: string) => ({
    id,
    role: 'diagnostic' as const,
    choose: (obs: SeatObservation) => chooseAction(obs, id),
  });
  for (const reference of references) {
    const summary = summaries[reference];
    for (let index = 0; index < count; index++) {
      if (performance.now() - started > maxWallMs) {
        capped = true;
        break;
      }
      const seed = PARTNER_FRESH_SEEDS.from + index;
      const deck = spadesZeroDeal(seed);
      const initial = createGame(
        { id: 'offline-fresh-partner-deal', mode: 'spades-partners', dealer: (seed % 4) as Seat },
        deck,
      );
      const prefix: string[] = [];
      const referenceWalk = walkSpadesRound(
        initial,
        [policy(reference), policy(reference), policy(reference), policy(reference)],
        (decision) => {
          const obs = decision.observation;
          if (obs.legalActions.length > 1) {
            summary.shadowUnforced++;
            const candidate = analyzeDecision(obs, PARTNER_RESOURCE_POLICY);
            if (candidate.reasons.some((reason) => reason.id === 'CASE-01.offer-safe-ruff'))
              summary.offerActivations++;
            if (candidate.reasons.some((reason) => reason.id === 'CASE-01.partner-secure'))
              summary.secureActivations++;
            if (actionId(candidate.action) !== actionId(decision.applied)) {
              summary.changedActions++;
              if (firstDifference === null) {
                firstDifference = {
                  seed,
                  reference,
                  candidate: PARTNER_RESOURCE_POLICY,
                  decisionIndex: decision.index,
                  actor: obs.seat,
                  state: decision.state,
                  observation: obs,
                  prefix: [...prefix],
                  deck,
                  referenceActionId: actionId(decision.applied),
                  candidateActionId: actionId(candidate.action),
                  sourceHashesHash,
                  observationHash: hash(obs),
                };
                save(output, 'first-difference.private.json', firstDifference);
              }
            }
            if (candidate.scenarioIds.includes('CASE-01')) {
              const checked = checkSpadesClaims(
                decision.state,
                obs.seat,
                explain(obs, candidate).claims ?? [],
              );
              summary.checkedClaims += checked.checked;
              summary.falseClaims += checked.falseClaims.length;
              summary.notCheckableClaims += checked.notCheckable;
            }
          }
          prefix.push(`${decision.seat}:${actionId(decision.applied)}`);
        },
      );
      summary.hands++;
      visitedSeeds.add(seed);
      summary.illegalActions += referenceWalk.illegalActions;
      for (const actor of [0, 1, 2, 3] as Seat[]) {
        if (performance.now() - started > maxWallMs) {
          capped = true;
          break;
        }
        const choices = ([0, 1, 2, 3] as Seat[]).map((seat) =>
          policy(seat === actor ? PARTNER_RESOURCE_POLICY : reference),
        );
        const candidateWalk = walkSpadesRound(initial, choices);
        const opposing = (actor + 1) % 4;
        const referenceMargin =
          referenceWalk.end.handResult!.points[actor] - referenceWalk.end.handResult!.points[opposing];
        const candidateMargin =
          candidateWalk.end.handResult!.points[actor] - candidateWalk.end.handResult!.points[opposing];
        const changed = hash(referenceWalk.actions) !== hash(candidateWalk.actions);
        summary.illegalActions += candidateWalk.illegalActions;
        summary.pairedRows++;
        summary.changedPairActionStreams += Number(changed);
        summary.marginDeltaSum += candidateMargin - referenceMargin;
        const coverageKey = `${reference}:${seed}`;
        const coverage = pairedCoverage[coverageKey] ?? { reference, seed, actors: [] };
        coverage.actors.push(actor);
        pairedCoverage[coverageKey] = coverage;
        rows.push({
          seed,
          reference,
          candidate: PARTNER_RESOURCE_POLICY,
          actor,
          deck,
          deckHash: hash(deck),
          referenceActions: referenceWalk.actions,
          candidateActions: candidateWalk.actions,
          changed,
          referenceResult: referenceWalk.end.handResult,
          candidateResult: candidateWalk.end.handResult,
          referenceTricks: referenceWalk.end.tricks,
          candidateTricks: candidateWalk.end.tricks,
          referenceBids: referenceWalk.end.bids,
          candidateBids: candidateWalk.end.bids,
          referenceMargin,
          candidateMargin,
          delta: candidateMargin - referenceMargin,
        });
      }
      if (capped) break;
    }
    if (capped) break;
  }
  writeFileSync(
    resolve(output, 'pairs.private.jsonl'),
    rows.map((row) => JSON.stringify(row)).join('\n') + '\n',
  );
  const sourceHashesAfter = pilotSourceHashes();
  const sourceStable = hash(sourceHashesAfter) === sourceHashesHash;
  const result = {
    schemaVersion: PARTNER_MEASUREMENT_SCHEMA,
    status: capped ? 'wall-cap' : 'complete',
    elapsedMs: Math.round(performance.now() - started),
    sourceStable,
    sourceHashesHash,
    summaries,
    firstDifference: firstDifference ? 'first-difference.private.json' : null,
    providerMode: 'offline',
    observedModelId: null,
    plannedSeedCount: count,
    independentSeedCount: visitedSeeds.size,
    visitedSeeds: [...visitedSeeds].sort((a, b) => a - b),
    pairedCoverage: Object.values(pairedCoverage),
    strengthClaim: 'not-established',
    teachingBenefit: 'not-established',
    humanReview: 'not-run-owner-deferred',
  };
  save(output, 'results.json', result);
  return { output, result, firstDifference };
}
