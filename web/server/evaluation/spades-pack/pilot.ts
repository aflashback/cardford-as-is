import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { actionId, cardRank, createGame, nextHand, type Card, type GameAction, type PrivateGame, type Seat } from '../../game/index.ts';
import { competitionFor, competitorOf } from '../../game/kernel/competition.ts';
import { assertObservation, type SeatObservation } from '../../observations/index.ts';
import { dealerOf, spadesGateAdapter, spadesStreamDeal, SPADES_DEAL_GENERATOR } from '../../games/spades/evaluation/adapter.ts';
import { measureSpadesRound, scoreMismatches, type SpadesGateMode, type SpadesRoundResult } from '../../games/spades/evaluation/metrics.ts';
import { walkSpadesRound } from '../../games/spades/evaluation/shadow.ts';
import { DEVELOPMENT_STYLE_IDS } from '../../games/spades/evaluation/styles.ts';
import type { SeatPolicy } from '../gate/contracts.ts';
import { assertReadable, entryOf } from '../gate/seeds.ts';

/** SG-05 / COACH-12: offline development evidence only; no promotion decision. */
export const PILOT_SCHEMA_VERSION = 'spades-match-pilot-1.0.0';
export const PILOT_MAX_WALL_MS = 20 * 60 * 1000;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const MODES: readonly SpadesGateMode[] = ['spades-solo', 'spades-partners'];
const SEATS: readonly Seat[] = [0, 1, 2, 3];
type Policy = SeatPolicy<SeatObservation, GameAction>;
export type PilotEnvironment = {
  id: string;
  /** Offset clockwise from the evaluated seat. Only offset zero is evaluated. */
  byMode: Record<SpadesGateMode, [null, string, string, string]>;
};
const FIXED_ENVIRONMENTS: readonly PilotEnvironment['byMode'][] = [
  {
    'spades-solo': [null, 'aggressive-setter', 'bag-dodger', 'cautious-contract'],
    'spades-partners': [null, 'aggressive-setter', 'cautious-contract', 'bag-dodger'],
  },
  {
    'spades-solo': [null, 'cautious-contract', 'nil-seeker', 'aggressive-setter'],
    'spades-partners': [null, 'cautious-contract', 'nil-seeker', 'aggressive-setter'],
  },
];
export type PilotManifest = {
  schemaVersion: typeof PILOT_SCHEMA_VERSION;
  purpose: 'development-pilot';
  reference: string;
  candidate: string;
  modes: SpadesGateMode[];
  seeds: { ledgerEntry: 'matches-development'; from: number; count: number };
  maxHands: number;
  environments: PilotEnvironment[];
  rotations: Seat[];
  sourceCommit: string;
  sourceHashes: Record<string, string>;
};
export type PilotHand = {
  index: number;
  dealer: Seat;
  /** Private evaluation archive, never a policy input or public application DTO. */
  deck: Card[];
  dealHash: string;
  actions: string[];
  actionHash: string;
  observationHash: string;
  result: SpadesRoundResult;
  measured: ReturnType<typeof measureSpadesRound>;
};
export type PilotStream = {
  arm: 'reference' | 'candidate';
  policy: string;
  seatPolicies: string[];
  competitorId: string;
  competitorSeats: Seat[];
  hands: number;
  completed: boolean;
  censored: boolean;
  censorReason: 'hand-cap' | null;
  winner: Seat | null;
  winnerCompetitorId: string | null;
  focalWon: boolean | null;
  scores: number[];
  bags: number[];
  finalMargin: number;
  totalOwn: number;
  totalHandMargin: number;
  metrics: Record<string, number>;
  decisions: number;
  evaluatedDecisions: number;
  evaluatedUnforcedDecisions: number;
  /** Hashes exclude arm labels, so an identity control has identical trajectories. */
  dealHash: string;
  actionHash: string;
  observationHash: string;
  trajectoryHash: string;
  journal: PilotHand[];
  /** No timing, cue checking, or truth labels are inferred from action replay. */
  cueChecks: 'not-run';
};
export type PilotPair = {
  id: string;
  seed: number;
  mode: SpadesGateMode;
  evaluatedSeat: Seat;
  environmentId: string;
  reference: PilotStream;
  candidate: PilotStream;
};
export type PilotInterruption = {
  pairId: string;
  arm: PilotStream['arm'];
  seed: number;
  mode: SpadesGateMode;
  evaluatedSeat: Seat;
  environmentId: string;
  /** Neither arm of an interrupted pair enters the completed-pair rows. */
  reason: 'wall-cap';
  completedHands: number;
  journal: PilotHand[];
  lastState: PrivateGame;
  /** A finished reference arm is diagnostic only until its candidate arm finishes. */
  completedReference: PilotStream | null;
};
export type PilotResult = {
  schemaVersion: typeof PILOT_SCHEMA_VERSION;
  manifestHash: string;
  sourceCommit: string;
  status: 'complete' | 'wall-cap';
  totalPairs: number;
  completedPairs: number;
  resumedPairs: number;
  totalStreams: number;
  rows: PilotPair[];
  rowsHash: string;
  checkpointFile: 'pilot-checkpoint.json';
  rowsFile: 'pilot-pairs.jsonl';
  interruption: PilotInterruption | null;
};
type Cell = Pick<PilotPair, 'id' | 'seed' | 'mode' | 'evaluatedSeat' | 'environmentId'>;
type Checkpoint = {
  schemaVersion: typeof PILOT_SCHEMA_VERSION;
  manifestHash: string;
  sourceHashes: Record<string, string>;
  rowsHash: string;
  rows: PilotPair[];
};

const hashText = (text: string) => createHash('sha256').update(text).digest('hex');
export function pilotCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const text = JSON.stringify(value);
    if (text === undefined) throw new Error('Pilot evidence cannot contain undefined.');
    return text;
  }
  if (Array.isArray(value)) return `[${value.map(pilotCanonicalJson).join(',')}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${pilotCanonicalJson(item)}`).join(',')}}`;
}
const hash = (value: unknown) => hashText(pilotCanonicalJson(value));
const plain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function fields(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!plain(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
    throw new Error(`Invalid pilot ${label} fields.`);
}
const isHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isCount = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= max;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'tests') return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [relative(ROOT, path).split(sep).join('/')] : [];
  });
}
/** Includes shared helpers and every strategy/engine/coaching/observation implementation.
 * Only source files are read; environment and credentials are never opened. */
export const PILOT_SOURCE_FILES: readonly string[] = [
  ...sourceFiles(join(ROOT, 'web/server')),
  ...sourceFiles(join(ROOT, 'web/shared')),
].sort();
export function pilotSourceHashes(): Record<string, string> {
  return Object.fromEntries(PILOT_SOURCE_FILES.map((path) => [path, createHash('sha256').update(readFileSync(join(ROOT, path))).digest('hex')]));
}
function sourcePath(path: string): string {
  if (!path || path.includes('\\') || isAbsolute(path) || path.split('/').some((part) => part === '..' || part === '.' || part === ''))
    throw new Error(`Invalid pilot source path: ${path}`);
  if (!path.endsWith('.ts') && !path.endsWith('.json') && !path.endsWith('.md')) throw new Error(`Invalid pilot source extension: ${path}`);
  const absolute = resolve(ROOT, path);
  if (!absolute.startsWith(`${ROOT}${sep}`)) throw new Error('Pilot source path leaves the repository.');
  return absolute;
}
function assertSources(manifest: PilotManifest): void {
  // Re-enumeration detects newly added implementation dependencies as well as edits.
  const current = [...sourceFiles(join(ROOT, 'web/server')), ...sourceFiles(join(ROOT, 'web/shared'))].sort();
  for (const path of current) if (!Object.hasOwn(manifest.sourceHashes, path)) throw new Error(`Pilot source hash is missing: ${path}`);
  for (const [path, expected] of Object.entries(manifest.sourceHashes)) {
    const actual = createHash('sha256').update(readFileSync(sourcePath(path))).digest('hex');
    if (actual !== expected) throw new Error(`Pilot source changed since the manifest was frozen: ${path}`);
  }
}

export function assertPilotManifest(value: unknown): asserts value is PilotManifest {
  fields(value, ['schemaVersion', 'purpose', 'reference', 'candidate', 'modes', 'seeds', 'maxHands', 'environments', 'rotations', 'sourceCommit', 'sourceHashes'], 'manifest');
  if (value.schemaVersion !== PILOT_SCHEMA_VERSION || value.purpose !== 'development-pilot') throw new Error('Unknown pilot schema or purpose.');
  if (value.reference !== 'spades-tactics-2.1.0' || !['spades-cases-4.0.0', value.reference].includes(String(value.candidate))) throw new Error('Pilot requires the fixed registered reference and candidate, or an identity control.');
  if (!Array.isArray(value.modes) || hash(value.modes) !== hash(MODES)) throw new Error('Pilot modes must be Solo then Partners.');
  if (!Array.isArray(value.rotations) || hash(value.rotations) !== hash(SEATS)) throw new Error('Pilot rotates the evaluated policy through all four seats.');
  if (!isCount(value.maxHands, 100)) throw new Error('Pilot hand cap must be 1 through 100.');
  fields(value.seeds, ['ledgerEntry', 'from', 'count'], 'seeds');
  if (value.seeds.ledgerEntry !== 'matches-development' || value.seeds.from !== 8_000_001 || !isCount(value.seeds.count, 8)) throw new Error('Pilot requires at most eight matches-development seeds starting at 8000001.');
  const ledger = entryOf('matches-development');
  if (ledger.status !== 'open' || ledger.generator !== SPADES_DEAL_GENERATOR) throw new Error('Pilot seed ledger is not open under the declared generator.');
  assertReadable({ purpose: 'development', dealGenerator: SPADES_DEAL_GENERATOR, seeds: { ledgerEntry: 'matches-development', from: value.seeds.from, count: value.seeds.count } });
  if (!Array.isArray(value.environments) || value.environments.length !== 2) throw new Error('Pilot requires two fixed environments.');
  const ids = new Set<string>();
  for (const [index, environment] of value.environments.entries()) {
    fields(environment, ['id', 'byMode'], 'environment');
    if (typeof environment.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(environment.id) || ids.has(environment.id)) throw new Error('Pilot environment IDs must be distinct safe names.');
    ids.add(environment.id);
    fields(environment.byMode, MODES, 'environment modes');
    for (const mode of MODES) {
      const styles = environment.byMode[mode];
      if (!Array.isArray(styles) || styles.length !== 4 || styles[0] !== null || styles.slice(1).some((style) => typeof style !== 'string' || !DEVELOPMENT_STYLE_IDS.includes(style))) throw new Error('Pilot other-seat styles must be development styles, with only offset zero null.');
    }
    if (hash(environment.byMode) !== hash(FIXED_ENVIRONMENTS[index])) throw new Error('Pilot environments must follow the frozen relative-seat style combinations.');
  }
  if (typeof value.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(value.sourceCommit)) throw new Error('Pilot sourceCommit must be a full Git commit hash.');
  if (!plain(value.sourceHashes) || !Object.keys(value.sourceHashes).length || Object.values(value.sourceHashes).some((item) => !isHash(item))) throw new Error('Pilot requires SHA-256 source hashes.');
  for (const path of Object.keys(value.sourceHashes)) sourcePath(path);
  for (const mode of MODES) {
    for (const id of [value.reference as string, value.candidate as string]) {
      const policy = spadesGateAdapter.policy(id, mode);
      if (policy.role === 'diagnostic' || policy.id !== id) throw new Error('Pilot arm is not a registered measured policy.');
    }
  }
}
function cellsOf(manifest: PilotManifest): Cell[] {
  const cells: Cell[] = [];
  for (let offset = 0; offset < manifest.seeds.count; offset++) for (const mode of manifest.modes) for (const evaluatedSeat of manifest.rotations) for (const environment of manifest.environments) {
    const seed = manifest.seeds.from + offset;
    cells.push({ id: `${seed}-${mode}-${evaluatedSeat}-${environment.id}`, seed, mode, evaluatedSeat, environmentId: environment.id });
  }
  return cells;
}
function seatPolicyIds(manifest: PilotManifest, cell: Cell, policy: string): string[] {
  const environment = manifest.environments.find((entry) => entry.id === cell.environmentId);
  if (!environment) throw new Error('Unknown pilot environment.');
  return SEATS.map((seat) => {
    const offset = (seat + 4 - cell.evaluatedSeat) % 4;
    if (offset === 0) return policy;
    const id = environment.byMode[cell.mode][offset];
    if (id === null) throw new Error('Only the evaluated seat may omit a style.');
    return id;
  });
}
function checkedPolicies(policies: readonly Policy[]): Policy[] {
  return policies.map((policy, seat) => ({
    id: policy.id, role: policy.role,
    choose(observation) {
      assertObservation(observation);
      if (observation.seat !== seat || observation.turn !== seat) throw new Error('Pilot policy received another actor observation.');
      const selected = policy.choose(observation);
      if (!selected || selected.kind === 'pass' || selected.seat !== seat || !observation.legalActions.some((legal) => actionId(legal) === actionId(selected))) throw new Error(`Pilot policy selected an illegal action: ${policy.id}/${seat}`);
      return selected;
    },
  }));
}
const withoutEvents = (state: PrivateGame): PrivateGame => ({ ...state, events: [] });
function playHand(state: PrivateGame, deck: Card[], policies: readonly Policy[], focalSeat: Seat, checkTime: () => void, captureState: (state: PrivateGame) => void): { hand: PilotHand; end: PrivateGame; evaluated: number; unforced: number } {
  const observations: string[] = [];
  let evaluated = 0, unforced = 0;
  const walk = walkSpadesRound(state, checkedPolicies(policies), (decision) => {
    captureState(decision.state);
    checkTime();
    if (!decision.selectedLegally) throw new Error('Pilot walker attempted an illegal-action fallback.');
    observations.push(hash(decision.observation));
    if (decision.seat === focalSeat) { evaluated++; if (decision.legal.length > 1) unforced++; }
  });
  const end = walk.end;
  if (walk.illegalActions || !end.handResult || end.bids.some((bid) => bid === null)) throw new Error('Pilot hand did not produce a legal score.');
  const played = end.history.flatMap((trick) => trick.plays.map((play) => play.card));
  const result: SpadesRoundResult = {
    kind: 'spades-round-result', mode: state.mode as SpadesGateMode, handNumber: end.handNumber,
    startScores: [...state.scores], startBags: [...state.bags], bids: end.bids.map((bid) => bid ?? 0), tricks: [...end.tricks],
    points: [...end.handResult.points], scores: [...end.scores], bags: [...end.bags], ended: end.phase === 'match-end' ? 'match-end' : 'hand-end',
    winner: end.handResult.winner ?? null, decisions: walk.actions.length, cardsPlayed: new Set(played).size,
  };
  const recount = [0, 0, 0, 0];
  for (const trick of end.history) {
    const spades = trick.plays.filter((play) => play.card[0] === 'S');
    const pool = spades.length ? spades : trick.plays.filter((play) => play.card[0] === trick.plays[0].card[0]);
    const winner = pool.reduce((first, second) => cardRank(second.card) > cardRank(first.card) ? second : first);
    recount[winner.seat]++;
  }
  if (scoreMismatches(result, recount) || played.length !== 52 || result.cardsPlayed !== 52 || end.hands.some((hand) => hand.length)) throw new Error('Pilot score or card conservation check failed.');
  const competitor = competitorOf(competitionFor(state.mode), focalSeat);
  return {
    end, evaluated, unforced,
    hand: { index: state.handNumber - 1, dealer: state.dealer, deck: [...deck], dealHash: hash(deck), actions: walk.actions, actionHash: hash(walk.actions), observationHash: hash(observations), result, measured: measureSpadesRound(result, competitor.id) },
  };
}
function finishStream(cell: Cell, arm: PilotStream['arm'], policy: string, seatPolicies: string[], journal: PilotHand[], end: PrivateGame, evaluated: number, unforced: number): PilotStream {
  const competition = competitionFor(cell.mode);
  const own = competitorOf(competition, cell.evaluatedSeat);
  const others = competition.competitors.filter((entry) => entry.id !== own.id);
  const completed = end.phase === 'match-end';
  const winner = completed ? end.handResult?.winner ?? null : null;
  if (completed && winner === null) throw new Error('A finalized pilot match must have the production winner.');
  const winnerCompetitorId = winner === null ? null : competitorOf(competition, winner).id;
  const metrics: Record<string, number> = {};
  for (const hand of journal) for (const [metric, value] of Object.entries(hand.measured.metrics)) metrics[metric] = (metrics[metric] ?? 0) + value;
  return {
    arm, policy, seatPolicies, competitorId: own.id, competitorSeats: [...own.seats], hands: journal.length,
    completed, censored: !completed, censorReason: completed ? null : 'hand-cap', winner, winnerCompetitorId, focalWon: winnerCompetitorId === null ? null : winnerCompetitorId === own.id,
    scores: [...end.scores], bags: [...end.bags], finalMargin: end.scores[own.seats[0]] - others.reduce((sum, entry) => sum + end.scores[entry.seats[0]], 0) / others.length,
    totalOwn: journal.reduce((sum, hand) => sum + hand.measured.own, 0), totalHandMargin: journal.reduce((sum, hand) => sum + hand.measured.margin, 0), metrics,
    decisions: journal.reduce((sum, hand) => sum + hand.actions.length, 0), evaluatedDecisions: evaluated, evaluatedUnforcedDecisions: unforced,
    dealHash: hash(journal.map((hand) => hand.dealHash)), actionHash: hash(journal.map((hand) => hand.actionHash)), observationHash: hash(journal.map((hand) => hand.observationHash)), trajectoryHash: hash(journal), journal, cueChecks: 'not-run',
  };
}
class WallCap extends Error {}
/** A deadline while validating an existing archive rejects without rewriting evidence. */
export class PilotReplayDeadlineError extends Error {
  override name = 'PilotReplayDeadlineError';
}
function playStream(manifest: PilotManifest, cell: Cell, arm: PilotStream['arm'], checkTime: () => void, replay?: PilotStream): PilotStream {
  const policy = manifest[arm];
  const ids = seatPolicyIds(manifest, cell, policy);
  const policies = replay ? [] : ids.map((id) => spadesGateAdapter.policy(id, cell.mode));
  let state = withoutEvents(createGame({ id: `pilot:${cell.id}`, mode: cell.mode, dealer: dealerOf(cell.seed) }, spadesStreamDeal(cell.seed, 0)));
  const journal: PilotHand[] = [];
  let evaluated = 0, unforced = 0;
  try {
    const count = replay ? replay.journal.length : manifest.maxHands;
    if (!isCount(count, manifest.maxHands)) throw new Error('Checkpoint stream has an invalid hand count.');
    for (let index = 0; index < count; index++) {
      checkTime();
      const deck = spadesStreamDeal(cell.seed, index);
      let handPolicies: readonly Policy[] = policies;
      if (replay) {
        const saved = replay.journal[index];
        if (!saved || hash(saved.deck) !== hash(deck) || !Array.isArray(saved.actions) || saved.actions.some((id) => typeof id !== 'string')) throw new Error('Checkpoint deal/actions do not match the frozen stream.');
        let cursor = 0;
        handPolicies = ids.map((id) => ({ id, role: 'reference' as const, choose(observation) {
          const expected = saved.actions[cursor++];
          const action = observation.legalActions.find((legal) => `${observation.seat}:${actionId(legal)}` === expected);
          if (!action) throw new Error('Checkpoint action is illegal or belongs to the wrong seat.');
          return action;
        } }));
      }
      const walked = playHand(state, deck, handPolicies, cell.evaluatedSeat, checkTime, (current) => { state = current; });
      if (replay && hash(walked.hand) !== hash(replay.journal[index])) throw new Error('Checkpoint hand score or audit hash failed replay.');
      journal.push(walked.hand); evaluated += walked.evaluated; unforced += walked.unforced; state = walked.end;
      if (state.phase === 'match-end') {
        if (replay && journal.length !== replay.journal.length) throw new Error('Checkpoint continued beyond the finalized match.');
        break;
      }
      if (index + 1 < count) state = withoutEvents(nextHand(state, spadesStreamDeal(cell.seed, index + 1)));
    }
    if (state.phase !== 'match-end' && journal.length !== manifest.maxHands) throw new Error('Checkpoint contains a partial stream.');
    const result = finishStream(cell, arm, policy, ids, journal, state, evaluated, unforced);
    if (replay && hash(result) !== hash(replay)) throw new Error('Checkpoint stream metadata does not match replay.');
    return result;
  } catch (error) {
    if (error instanceof WallCap) {
      const interruption: PilotInterruption = { pairId: cell.id, arm, seed: cell.seed, mode: cell.mode, evaluatedSeat: cell.evaluatedSeat, environmentId: cell.environmentId, reason: 'wall-cap', completedHands: journal.length, journal, lastState: state, completedReference: null };
      throw Object.assign(error, { interruption });
    }
    throw error;
  }
}
const linesOf = (rows: PilotPair[]) => rows.map((row) => `${pilotCanonicalJson(row)}\n`).join('');
function atomicJson(path: string, value: unknown): void {
  const pending = `${path}.pending`;
  writeFileSync(pending, `${pilotCanonicalJson(value)}\n`, 'utf8');
  renameSync(pending, path);
}
function readCheckpoint(manifest: PilotManifest, outDir: string, cells: Cell[], manifestHash: string, checkTime: () => void = () => {}): PilotPair[] {
  const file = join(outDir, 'pilot-checkpoint.json');
  if (!existsSync(file)) {
    if (existsSync(join(outDir, 'pilot-pairs.jsonl'))) throw new Error('Pilot rows exist without their checkpoint.');
    return [];
  }
  checkTime();
  const saved: unknown = JSON.parse(readFileSync(file, 'utf8'));
  fields(saved, ['schemaVersion', 'manifestHash', 'sourceHashes', 'rowsHash', 'rows'], 'checkpoint');
  if (saved.schemaVersion !== PILOT_SCHEMA_VERSION || saved.manifestHash !== manifestHash || hash(saved.sourceHashes) !== hash(manifest.sourceHashes) || !Array.isArray(saved.rows) || saved.rows.length > cells.length) throw new Error('Stale or malformed pilot checkpoint.');
  if (saved.rowsHash !== hashText(linesOf(saved.rows as PilotPair[]))) throw new Error('Checkpoint rows hash failed.');
  checkTime();
  const rows: PilotPair[] = [];
  for (let index = 0; index < saved.rows.length; index++) {
    checkTime();
    const row: unknown = saved.rows[index];
    fields(row, ['id', 'seed', 'mode', 'evaluatedSeat', 'environmentId', 'reference', 'candidate'], 'pair');
    const cell = cells[index];
    for (const field of ['id', 'seed', 'mode', 'evaluatedSeat', 'environmentId'] as const) if (row[field] !== cell[field]) throw new Error('Checkpoint pairs are out of the frozen cell order.');
    if (!plain(row.reference) || !Array.isArray(row.reference.journal) || !plain(row.candidate) || !Array.isArray(row.candidate.journal)) throw new Error('Checkpoint must contain both complete arms.');
    const reference = playStream(manifest, cell, 'reference', checkTime, row.reference as unknown as PilotStream);
    const candidate = playStream(manifest, cell, 'candidate', checkTime, row.candidate as unknown as PilotStream);
    rows.push({ ...cell, reference, candidate });
  }
  if (existsSync(join(outDir, 'pilot-pairs.jsonl'))) {
    const exported = readFileSync(join(outDir, 'pilot-pairs.jsonl'), 'utf8');
    // The JSONL export may be an older complete prefix if execution stopped between
    // the atomic checkpoint and the next export. Every exported row still validates.
    if (!linesOf(rows).startsWith(exported) || (exported.length > 0 && !exported.endsWith('\n'))) throw new Error('Pilot exported rows differ from the validated checkpoint.');
  }
  checkTime();
  return rows;
}

/** Read-only verification of complete paired evidence through recorded-action replay. */
export function auditPilot(manifest: PilotManifest, outDir: string): { rows: PilotPair[]; rowsHash: string; totalPairs: number } {
  assertPilotManifest(manifest);
  assertSources(manifest);
  const directory = resolve(outDir);
  const file = join(directory, 'pilot-manifest.json');
  if (!existsSync(file) || hash(JSON.parse(readFileSync(file, 'utf8'))) !== hash(manifest)) throw new Error('Pilot archive manifest differs from the requested manifest.');
  const cells = cellsOf(manifest);
  const rows = readCheckpoint(manifest, directory, cells, hash(manifest));
  return { rows, rowsHash: hashText(linesOf(rows)), totalPairs: cells.length };
}

export function runPilot(manifest: PilotManifest, options: { outDir: string; maxWallMs?: number; onProgress?: (done: number, total: number) => void }): PilotResult {
  assertPilotManifest(manifest);
  assertSources(manifest);
  const maxWallMs = options.maxWallMs ?? PILOT_MAX_WALL_MS;
  if (!Number.isFinite(maxWallMs) || maxWallMs < 0 || maxWallMs > PILOT_MAX_WALL_MS) throw new Error('Pilot wall cap must be from zero through twenty minutes.');
  const outDir = resolve(options.outDir);
  const manifestFile = join(outDir, 'pilot-manifest.json');
  if (!existsSync(manifestFile) || hash(JSON.parse(readFileSync(manifestFile, 'utf8'))) !== hash(manifest)) throw new Error('Freeze the matching pilot-manifest.json in outDir before running.');
  const started = performance.now();
  const checkTime = () => { if (performance.now() - started >= maxWallMs) throw new WallCap('Pilot invocation reached its wall cap.'); };
  const cells = cellsOf(manifest), manifestHash = hash(manifest);
  let rows: PilotPair[];
  try {
    rows = readCheckpoint(manifest, outDir, cells, manifestHash, checkTime);
  } catch (error) {
    if (error instanceof WallCap) throw new PilotReplayDeadlineError('Pilot wall cap reached during checkpoint replay; existing evidence was not rewritten.', { cause: error });
    throw error;
  }
  const resumedPairs = rows.length;
  mkdirSync(outDir, { recursive: true });
  const save = () => atomicJson(join(outDir, 'pilot-checkpoint.json'), { schemaVersion: PILOT_SCHEMA_VERSION, manifestHash, sourceHashes: manifest.sourceHashes, rowsHash: hashText(linesOf(rows)), rows } satisfies Checkpoint);
  save();
  let interruption: PilotInterruption | null = null;
  let status: PilotResult['status'] = 'complete';
  options.onProgress?.(rows.length, cells.length);
  for (let index = rows.length; index < cells.length; index++) {
    const cell = cells[index];
    let completedReference: PilotStream | null = null;
    try {
      assertSources(manifest); checkTime();
      const reference = playStream(manifest, cell, 'reference', checkTime);
      completedReference = reference;
      const candidate = playStream(manifest, cell, 'candidate', checkTime);
      // A fully finished pair remains valid when the resource clock expires during
      // its final transition. Persist it, then enforce the cap before the next pair.
      assertSources(manifest);
      const referenceIds = reference.seatPolicies, candidateIds = candidate.seatPolicies;
      if (SEATS.some((seat) => seat !== cell.evaluatedSeat && referenceIds[seat] !== candidateIds[seat])) throw new Error('Pilot pair changed a non-evaluated seat.');
      rows.push({ ...cell, reference, candidate }); save();
      options.onProgress?.(rows.length, cells.length);
    } catch (error) {
      if (error instanceof WallCap) {
        status = 'wall-cap';
        const detail = (error as WallCap & { interruption?: PilotInterruption }).interruption;
        interruption = detail ? { ...detail, completedReference } : { pairId: cell.id, ...cell, arm: 'reference', reason: 'wall-cap', completedHands: 0, journal: [], lastState: withoutEvents(createGame({ id: `pilot:${cell.id}`, mode: cell.mode, dealer: dealerOf(cell.seed) }, spadesStreamDeal(cell.seed, 0))), completedReference: null };
        atomicJson(join(outDir, 'pilot-interruption.json'), interruption);
        break;
      }
      atomicJson(join(outDir, 'pilot-error.json'), { schemaVersion: PILOT_SCHEMA_VERSION, manifestHash, cell, completedPairs: rows.length, reason: error instanceof Error ? error.message : String(error) });
      writeFileSync(join(outDir, 'pilot-pairs.jsonl'), linesOf(rows), 'utf8');
      throw error;
    }
  }
  const text = linesOf(rows);
  const pending = join(outDir, 'pilot-pairs.jsonl.pending');
  writeFileSync(pending, text, 'utf8'); renameSync(pending, join(outDir, 'pilot-pairs.jsonl'));
  return { schemaVersion: PILOT_SCHEMA_VERSION, manifestHash, sourceCommit: manifest.sourceCommit, status, totalPairs: cells.length, completedPairs: rows.length, resumedPairs, totalStreams: cells.length * 2, rows, rowsHash: hashText(text), checkpointFile: 'pilot-checkpoint.json', rowsFile: 'pilot-pairs.jsonl', interruption };
}
