/** Offline development review material. This module never invokes a strategic policy or provider. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  actionId, apply, cardRank, cardSuit, collectTrick, createGame,
  type Card, type Four, type GameAction, type Play, type Seat, type Trick,
} from '../../game/index.ts';
import { assertObservation, getMemory, observe, type SeatObservation } from '../../observations/index.ts';
import { validateHumanLabels, type HumanLabelSummary } from './labels.ts';

export type ReviewMode = 'spades-solo' | 'spades-partners';
/** Explicit player information allowlist. No event prose, inferred tactic, answer or source identity. */
export type ReviewPacket = {
  mode: ReviewMode;
  seat: Seat;
  moduleVersion: '1.0.0';
  ruleProfileId: string;
  observationSchemaVersion: '1.0.0';
  featureVersion: '1.0.0';
  phase: 'bid' | 'play';
  hand: Card[];
  handSizes: number[];
  bids: (number | null)[];
  tricks: number[];
  scores: number[];
  bags: number[];
  trick: Play[];
  history: Trick[];
  turn: Seat;
  dealer: Seat;
  handNumber: number;
  spadesBroken: boolean;
  legalActions: string[];
};
export type ReviewCase = { id: string; familyId: string; mode: ReviewMode; packet: ReviewPacket; packetHash: string };
export type ReviewPack = {
  schemaVersion: 'spades-review-pack-1.0.0';
  cases: ReviewCase[];
  coverage: Record<string, unknown>;
  sources: { path: string; sha256: string }[];
};
export type ReviewPackAudit = { cases: number; sourceFiles: number; labels: HumanLabelSummary };
const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const browser = 'qa/experiments/2026-10-02-browser-baseline';
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const hashObject = (value: unknown) => digest(JSON.stringify(value));
const clonePlay = (play: Play): Play => ({ seat: play.seat, card: play.card });

export function projectReviewPacket(observation: SeatObservation): ReviewPacket {
  assertObservation(observation);
  assert.ok(observation.mode !== 'hearts', 'Review pack supports Spades only');
  assert.ok(observation.phase === 'bid' || observation.phase === 'play', 'Pre-action packet required');
  assert.equal(observation.turn, observation.seat, 'Review the active actor');
  assert.ok(observation.legalActions.length > 1, 'Forced moves are not strategic review cases');
  return {
    mode: observation.mode, seat: observation.seat, moduleVersion: observation.moduleVersion,
    ruleProfileId: observation.ruleProfileId, observationSchemaVersion: observation.observationSchemaVersion,
    featureVersion: observation.featureVersion, phase: observation.phase,
    hand: [...observation.hand], handSizes: [...observation.handSizes], bids: [...observation.bids],
    tricks: [...observation.tricks], scores: [...observation.scores], bags: [...observation.bags],
    trick: observation.trick.map(clonePlay),
    history: observation.history.map(trick => ({ plays: trick.plays.map(clonePlay), winner: trick.winner })),
    turn: observation.seat, dealer: observation.dealer, handNumber: observation.handNumber,
    spadesBroken: observation.spadesBroken, legalActions: observation.legalActions.map(actionId),
  };
}

type Episode = { id: string; mode: ReviewMode; dealer: Seat; hands: Four<Card[]>; scores: Four<number>; bags: Four<number> };
type ResearchPacket = {
  game: ReviewMode; ruleProfile: string; seat: Seat; phase: string; hand: Card[];
  dealer: Seat; bids: (number | null)[]; tricks: number[]; scores: number[]; bags: number[];
  completedTricks: Trick[]; currentTrick: Play[]; spadesBroken: boolean; legalActions: string[];
};
type TextRecord = { dealHash: string; decisions: { seq: number; packet: ResearchPacket; packetHash: string; action: GameAction }[] };
type SourceAudit = { accepted: number; complete: number; partial: number; unstarted: number; sources: {
  path: string; episode: string; recordPath?: string; recordFileHash?: string; dealHash?: string;
  decisions?: number; status: 'complete' | 'partial' | 'unstarted'; finalPhase?: string;
}[] };
type BrowserRow = { id: string; runId: string; observationHash: string; observation: SeatObservation };
type BrowserManifest = { catalogHash: string; runs: { id: string; mode: ReviewMode; scenarioId: string; arm: string }[] };
type BrowserAudit = {
  runId: string; gameId: string; capturedAfterHand: boolean; deals: Card[][];
  openingScenario: { dealer: Seat; metadata: { id: string } }; state: ReturnType<typeof createGame>;
  actions: ({ kind: 'action'; action: GameAction } | { kind: 'collect' })[];
  humanDecisions: { id: string; observation: SeatObservation }[];
  botDecisionAudits: Record<string, { decisionId: string; observation: SeatObservation; revision: number }>;
};
type SourcePointer = {
  archive: 'agent-scenario-lab' | 'two-suit-batch' | 'expanded-batch' | 'browser-baseline';
  path: string; seq?: number; line?: number; episode?: string; runId?: string; arm?: string;
  status: 'complete' | 'partial'; syntheticScorePrefix: boolean;
};
type Candidate = { packet: ReviewPacket; packetHash: string; sourceFamily: string; pointers: SourcePointer[] };
type Stratum = 'bidding' | 'nil-cover-context' | 'nil-attack-context' | 'entry-resource-context' | 'public-void-context' | 'score-pressure-context';
const strata: { name: Stratum; modes: ReviewMode[]; quota: number }[] = [
  { name: 'bidding', modes: ['spades-solo', 'spades-partners'], quota: 4 },
  { name: 'nil-cover-context', modes: ['spades-partners'], quota: 2 },
  { name: 'nil-attack-context', modes: ['spades-solo', 'spades-partners'], quota: 2 },
  { name: 'entry-resource-context', modes: ['spades-solo', 'spades-partners'], quota: 3 },
  { name: 'public-void-context', modes: ['spades-solo', 'spades-partners'], quota: 3 },
  { name: 'score-pressure-context', modes: ['spades-solo', 'spades-partners'], quota: 3 },
];
function sourceFamily(name: string): string {
  // Conservatively keep related authored deals, changed hidden distributions and whole-table rotations together.
  if (name.includes('nil-race')) return 'authored-nil-race';
  if (name.includes('control')) return 'authored-control';
  return 'authored-two-suit-and-extensions';
}
function qualifies(packet: ReviewPacket, stratum: Stratum): boolean {
  if (stratum === 'bidding') return packet.phase === 'bid';
  if (packet.phase !== 'play' || packet.history.length < 1) return false;
  const partner = ((packet.seat + 2) % 4) as Seat;
  const liveNil = (seat: number) => packet.bids[seat] === 0 && packet.tricks[seat] === 0;
  if (stratum === 'nil-cover-context')
    return packet.mode === 'spades-partners' && liveNil(partner) && packet.bids[packet.seat] !== 0 &&
      (packet.trick.length === 0 || packet.trick.some(play => play.seat === partner));
  if (stratum === 'nil-attack-context')
    return packet.bids[packet.seat] !== 0 && packet.bids.some((_, seat) => seat !== packet.seat &&
      (packet.mode === 'spades-solo' || seat !== partner) && liveNil(seat) &&
      (packet.trick.length === 0 || packet.trick.some(play => play.seat === seat)));
  if (stratum === 'entry-resource-context')
    return packet.history.length >= 2 && packet.legalActions.length >= 3 && packet.trick.length <= 1 &&
      packet.hand.filter(card => cardSuit(card) === 'S').length >= 2 &&
      packet.hand.some(card => cardSuit(card) !== 'S' && cardRank(card) >= 12);
  if (stratum === 'public-void-context')
    return packet.history.length >= 3 && getMemory(packet).some(suit => suit.voidSeats.some(seat => seat !== packet.seat));
  return packet.scores.some(score => score >= 400) || packet.bags.some(bags => bags >= 8);
}

function construct(): ReviewPack & { index: Record<string, unknown> } {
  const sources = new Map<string, string>();
  function bytes(path: string): Buffer {
    const value = readFileSync(join(repository, path));
    sources.set(path, digest(value));
    return value;
  }
  function read<T>(path: string): T { return JSON.parse(bytes(path).toString('utf8')) as T; }
  const candidates = new Map<string, Candidate>();
  let observations = 0, forced = 0, textCount = 0, browserCount = 0;
  function add(observation: SeatObservation, name: string, pointer: SourcePointer): void {
    assertObservation(observation);
    observations++;
    if (observation.legalActions.length === 1) { forced++; return; }
    const packet = projectReviewPacket(observation), packetHash = hashObject(packet);
    const previous = candidates.get(packetHash);
    if (previous) {
      assert.deepEqual(previous.packet, packet, 'Hash collision');
      // Same permitted input across nominal fixtures makes those fixture families dependent.
      assert.equal(previous.sourceFamily, sourceFamily(name), 'Overlapping source families need reconciliation');
      previous.pointers.push(pointer);
    } else candidates.set(packetHash, { packet, packetHash, sourceFamily: sourceFamily(name), pointers: [pointer] });
  }

  const audit = read<SourceAudit>(`${browser}/source-audit.json`);
  assert.equal(audit.accepted, 706);
  for (const entry of audit.sources) {
    const config = read<{ episodes: Episode[] }>(entry.path);
    const episode = config.episodes.find(episode => episode.id === entry.episode);
    assert.ok(episode, 'Source episode missing');
    if (entry.status === 'unstarted') continue;
    assert.ok(entry.recordPath && entry.recordFileHash && entry.dealHash);
    const recordBytes = bytes(entry.recordPath);
    assert.equal(digest(recordBytes), entry.recordFileHash, `Historical source changed: ${entry.recordPath}`);
    const record = JSON.parse(recordBytes.toString('utf8')) as TextRecord;
    assert.equal(hashObject(episode), entry.dealHash);
    assert.equal(record.dealHash, entry.dealHash);
    assert.equal(record.decisions.length, entry.decisions);
    const first = (episode.dealer + 1) % 4;
    const deck = Array.from({ length: 52 }, (_, index) => episode.hands[(first + index) % 4][Math.floor(index / 4)]);
    let state = createGame({ id: episode.id, mode: episode.mode, dealer: episode.dealer }, deck);
    state.scores = [...episode.scores]; state.bags = [...episode.bags];
    for (const [index, decision] of record.decisions.entries()) {
      assert.equal(decision.seq, index + 1);
      assert.equal(hashObject(decision.packet), decision.packetHash, 'Original packet hash changed');
      assert.ok(state.turn !== null);
      const observation = observe(state, state.turn);
      assertObservation(observation);
      const packet = decision.packet;
      for (const [old, current] of [
        ['game', 'mode'], ['ruleProfile', 'ruleProfileId'], ['seat', 'seat'], ['phase', 'phase'],
        ['dealer', 'dealer'], ['hand', 'hand'], ['bids', 'bids'], ['tricks', 'tricks'],
        ['scores', 'scores'], ['bags', 'bags'], ['completedTricks', 'history'], ['currentTrick', 'trick'],
        ['spadesBroken', 'spadesBroken'],
      ] as const) assert.deepEqual(packet[old], observation[current], `Archive projection mismatch: ${old}`);
      assert.deepEqual([...packet.legalActions].sort(), observation.legalActions.map(actionId).sort());
      const archive = entry.path.includes('agent-scenario-lab') ? 'agent-scenario-lab' :
        entry.path.includes('two-suit-batch') ? 'two-suit-batch' : 'expanded-batch';
      add(observation, episode.id, { archive, path: entry.recordPath, seq: decision.seq, episode: episode.id,
        status: entry.status, syntheticScorePrefix: episode.scores.some(score => score !== 0) || episode.bags.some(bags => bags !== 0) });
      assert.ok(observation.legalActions.some(action => actionId(action) === actionId(decision.action)), 'Illegal archived action');
      assert.ok(decision.action.kind !== 'pass', 'Spades records cannot contain a pass');
      state = apply(state, decision.action);
      if (state.phase === 'trick-end') state = collectTrick(state);
      textCount++;
    }
    assert.equal(state.phase, entry.finalPhase);
    if (entry.status === 'complete') assert.equal(state.history.length, 13);
  }
  assert.equal(textCount, audit.accepted);

  const manifest = read<BrowserManifest>(`${browser}/manifest.json`);
  const catalog = read<unknown>(`${browser}/dev-deals.json`);
  assert.equal(hashObject(catalog), manifest.catalogHash);
  read<unknown>(`${browser}/audit.json`);
  const rowPath = `${browser}/seat-packets.jsonl`;
  const rows = bytes(rowPath).toString('utf8').trim().split(/\r?\n/).map((line, index) =>
    ({ row: JSON.parse(line) as BrowserRow, line: index + 1 }));
  for (const run of manifest.runs) {
    const record = read<{ status: string; privateAudit: { file: string; hash: string } }>(`${browser}/runs/${run.id}.json`);
    assert.equal(record.status, 'complete', 'Incomplete browser runs cannot supply completed-hand evidence');
    const privatePath = `${browser}/${record.privateAudit.file}`;
    const saved = read<BrowserAudit>(privatePath);
    assert.equal(hashObject(saved), record.privateAudit.hash);
    assert.equal(saved.runId, run.id); assert.equal(saved.capturedAfterHand, true);
    assert.equal(saved.openingScenario.metadata.id, run.scenarioId);
    const savedRows = rows.filter(entry => entry.row.runId === run.id);
    assert.equal(savedRows.length, 56);
    let state = createGame({ id: saved.gameId, mode: run.mode, dealer: saved.openingScenario.dealer }, saved.deals[0]);
    let humanIndex = 0, botIndex = 0, decisionIndex = 0;
    const bots = Object.values(saved.botDecisionAudits).sort((a, b) => a.revision - b.revision);
    for (const action of saved.actions) {
      if (action.kind === 'collect') { state = collectTrick(state); continue; }
      assert.ok(state.turn !== null);
      const observation = observe(state, state.turn);
      assertObservation(observation);
      const decision = state.turn === 0 ? saved.humanDecisions[humanIndex++] : bots[botIndex++];
      assert.deepEqual(decision.observation, observation, 'Original browser observation differs from replay');
      const entry = savedRows[decisionIndex++];
      assert.equal(entry.row.id, 'id' in decision ? decision.id : decision.decisionId);
      assert.equal(entry.row.observationHash, hashObject(entry.row.observation));
      assertObservation(entry.row.observation);
      assert.deepEqual(entry.row.observation, observation, 'Browser JSONL projection differs from replay');
      add(observation, run.scenarioId, { archive: 'browser-baseline', path: rowPath, line: entry.line,
        runId: run.id, arm: run.arm, status: 'complete', syntheticScorePrefix: false });
      assert.ok(observation.legalActions.some(legal => actionId(legal) === actionId(action.action)));
      assert.ok(action.action.kind !== 'pass', 'Spades records cannot contain a pass');
      state = apply(state, action.action);
      browserCount++;
    }
    assert.equal(decisionIndex, 56); assert.equal(humanIndex, 14); assert.equal(botIndex, 42);
    assert.equal(state.history.length, 13);
    assert.deepEqual(state, saved.state, 'Final browser replay differs');
  }
  assert.equal(browserCount, rows.length); assert.equal(browserCount, 672);

  const all = [...candidates.values()];
  const chosen: { candidate: Candidate; stratum: Stratum }[] = [];
  const used = new Set<string>();
  const coverageRows: Record<string, unknown>[] = [];
  for (const stratum of strata) for (const mode of stratum.modes) {
    const pool = all.filter(candidate => candidate.packet.mode === mode && qualifies(candidate.packet, stratum.name));
    const selected: Candidate[] = [];
    for (let index = 0; index < stratum.quota; index++) {
      const available = pool.filter(candidate => !used.has(candidate.packetHash));
      // Balance seat, source archive and decision depth using public context, never an observed answer.
      const rank = (candidate: Candidate) => {
        const counts = chosen.filter(row => row.candidate.packet.mode === mode);
        const archive = candidate.pointers[0].archive;
        return counts.filter(row => row.candidate.pointers[0].archive === archive).length * 20 +
          selected.filter(row => row.packet.seat === candidate.packet.seat).length * 10 +
          selected.filter(row => row.packet.history.length === candidate.packet.history.length).length * 5;
      };
      available.sort((a, b) => rank(a) - rank(b) || a.packetHash.localeCompare(b.packetHash));
      const candidate = available[0];
      if (!candidate) break;
      used.add(candidate.packetHash); selected.push(candidate); chosen.push({ candidate, stratum: stratum.name });
    }
    coverageRows.push({ stratum: stratum.name, mode, requested: stratum.quota, availableUnique: pool.length,
      selected: selected.length, status: selected.length === stratum.quota ? 'context-filled-unreviewed' : 'unfilled' });
  }
  // Shuffle the presentation deterministically by input hash; no tactic-blocked ordering or suggestive identifiers.
  chosen.sort((a, b) => digest(`blind-order-v1:${a.candidate.packetHash}`).localeCompare(digest(`blind-order-v1:${b.candidate.packetHash}`)));
  const families = [...new Set(all.map(candidate => candidate.sourceFamily))].sort();
  const neutralFamily = (name: string) => `family-${String(families.indexOf(name) + 1).padStart(3, '0')}`;
  const cases = chosen.map(({ candidate }, index): ReviewCase => ({ id: `case-${String(index + 1).padStart(3, '0')}`,
    familyId: neutralFamily(candidate.sourceFamily), mode: candidate.packet.mode, packet: candidate.packet, packetHash: candidate.packetHash }));
  const sourceList = [...sources].sort(([a], [b]) => a.localeCompare(b)).map(([path, sha256]) => ({ path, sha256 }));
  const coverage: Record<string, unknown> = {
    schemaVersion: 'spades-review-coverage-1.0.0', selectedCases: cases.length,
    modes: Object.fromEntries(['spades-solo', 'spades-partners'].map(mode => [mode, cases.filter(row => row.mode === mode).length])),
    replay: { textDecisions: textCount, browserDecisions: browserCount, textHands: { complete: audit.complete, partial: audit.partial, unstarted: audit.unstarted } },
    deduplication: { inputObservations: observations, excludedForced: forced, uniqueNonforcedPackets: all.length,
      duplicateNonforcedOccurrences: observations - forced - all.length, selectedUniquePackets: cases.length },
    strata: coverageRows, relatedSourceFamilies: families.length,
    sourceArchiveCases: Object.fromEntries(['agent-scenario-lab', 'two-suit-batch', 'expanded-batch', 'browser-baseline'].map(archive =>
      [archive, chosen.filter(row => row.candidate.pointers.some(pointer => pointer.archive === archive)).length])),
    labels: { independentReviewed: 0, unknown: cases.length, contested: 0 },
    holes: [
      'All acceptable-action labels and independent reviewer identities are unfilled.',
      'Signal context is public play and established voids; intentional signal interpretation has no independent label.',
      'Score-pressure cases use synthetic carried scores/bags; no reachable complete match prefix is proved.',
      'No fresh held-out deals, unfamiliar teammates, natural prevalence sample or strategy-strength result.',
      'No independent counterworld/exception labels or exact end-position answer keys in this extraction.',
      'Nil cover has no Solo counterpart because Solo has no teammate.',
    ],
    limitations: [
      'Context selection is not an assertion that a tactical recommendation applies.',
      'Related deals, rotations and cross-arm duplicate observations are dependent development material.',
      'One reviewer must see one case at a time; combining private hands from different cases reveals information.',
      'Public bid order/current hand history is complete. Private prior agent paragraphs are excluded and not recoverable actor memory.',
      'Archived player answers, coach cues and outcomes are withheld; Jev/provider calls are zero.',
    ],
  };
  const index: Record<string, unknown> = {
    schemaVersion: 'spades-review-private-index-1.0.0', visibility: 'private-review-administrator', sources: sourceList,
    grouping: families.map(name => ({ familyId: neutralFamily(name), sourceFamily: name, split: 'development-only' })),
    cases: chosen.map(({ candidate, stratum }, index) => ({ id: cases[index].id, packetHash: candidate.packetHash,
      familyId: cases[index].familyId, stratum, sources: candidate.pointers,
      syntheticScorePrefix: candidate.pointers.some(pointer => pointer.syntheticScorePrefix) })),
  };
  return { schemaVersion: 'spades-review-pack-1.0.0', cases, coverage, sources: sourceList, index };
}

export function buildReviewPack(): ReviewPack {
  const { index: _privateIndex, ...pack } = construct();
  return pack;
}
function auditExisting(outDir: string, pack: ReturnType<typeof construct>): ReviewPackAudit {
  const expected = {
    'cases.json': { schemaVersion: pack.schemaVersion, cases: pack.cases },
    'coverage.json': pack.coverage,
    'private/source-index.json': pack.index,
  };
  const files = [...Object.keys(expected), 'human-labels.json', 'README.md'];
  assert.ok(files.every(path => existsSync(join(outDir, path))), 'Incomplete existing review pack; refusing replacement');
  for (const [path, value] of Object.entries(expected))
    assert.deepEqual(JSON.parse(readFileSync(join(outDir, path), 'utf8')), value, `Frozen review artifact drift: ${path}`);
  const labels = validateHumanLabels(pack.cases, JSON.parse(readFileSync(join(outDir, 'human-labels.json'), 'utf8')));
  return { cases: pack.cases.length, sourceFiles: pack.sources.length, labels };
}
/** Replays the original sources and audits all frozen artifacts without writing any review files. */
export function auditReviewPack(outDir: string): ReviewPackAudit {
  return auditExisting(outDir, construct());
}
export function writeReviewPack(outDir: string): void {
  const pack = construct();
  const files = ['cases.json', 'coverage.json', 'private/source-index.json', 'human-labels.json', 'README.md'];
  if (files.some(path => existsSync(join(outDir, path)))) {
    auditExisting(outDir, pack);
    // Original independent reviews and the frozen source/case files are immutable on regeneration.
    return;
  }
  mkdirSync(join(outDir, 'private'), { recursive: true });
  const write = (path: string, value: unknown) => writeFileSync(join(outDir, path), `${JSON.stringify(value, null, 2)}\n`);
  write('cases.json', { schemaVersion: pack.schemaVersion, cases: pack.cases });
  write('coverage.json', pack.coverage);
  write('human-labels.json', {
    schemaVersion: 'spades-review-human-labels-1.0.0',
    instructions: 'Label each unseen packet before viewing any archived answer, cue or outcome. Status is supported, unknown or contested. Each reviewer uses an independent copy; preserve originals before adjudication. Assign real reviewer identity only when a human review occurs. Unknown has no assessed acceptable set.',
    cases: pack.cases.map(reviewCase => ({ id: reviewCase.id, packetHash: reviewCase.packetHash,
      reviewerId: null, reviewedAt: null, status: 'unknown', acceptableActions: [], unacceptableActions: [],
      alternatives: [], assumptions: [], factualClaims: [], reachableException: null, counterworld: null,
      rationale: null, uncertainty: null, dispute: null })),
  });
  write('private/source-index.json', pack.index);
  writeFileSync(join(outDir, 'README.md'), `# Blind Spades development review pack\n\n${pack.cases.length} replayed, nonforced, deduplicated player packets. These are unreviewed development cases, with no accepted answers or expert verdicts.\n\nGive a human reviewer only one case from cases.json at a time and its blank human-labels.json entry. Family identifiers are neutral grouping markers. Do not supply private/source-index.json, source records, coverage strata, bot answers, player paragraphs, cues, later hands or outcomes until labels are frozen. Follow the assignment and exposure safeguards in ../human-review.md: keep one actor trajectory in chronological order, withhold cross-seat hands, later play and related mode/deal twins until its original labels are frozen, and flag/exclude exposed reviews. Randomizing all cases or showing one at a time does not by itself preserve blinding.\n\nReview status is supported, unknown or contested. Each reviewer uses an independent copy; preserve those originals before adjudication. Fill reviewer identity and acceptable alternatives from actual independent human review; an archived agent choice is never an answer key. The coverage file records context counts and unfilled evidence. Score pressure uses synthetic match prefixes. Related deals and rotations remain together as development material.\n\nRegenerate or validate from repository root:\n\n\`\`\`powershell\nnode --input-type=module -e "import {writeReviewPack} from './web/server/evaluation/spades-pack/review.ts'; writeReviewPack('qa/experiments/2026-10-04-spades-evaluation-pack/review');"\nnode --test --test-isolation=none web/server/tests/spades-review-pack.test.ts\n\`\`\`\n\nExisting complete packs are validated without rewriting any files, including human labels. Case, source or coverage drift fails closed. No runtime/default changes or Jev calls are part of extraction. Private provenance records source byte hashes and precise record sequence/JSONL line pointers.\n`);
}
