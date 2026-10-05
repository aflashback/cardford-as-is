import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createGame, fullDeck, nextSeat, trickWinner, type Seat } from '../game/index.ts';
import { assertObservation, getMemory, observe, type SeatObservation } from '../observations/index.ts';
import { auditReviewPack, buildReviewPack, projectReviewPacket, writeReviewPack, type ReviewCase, type ReviewPacket } from '../evaluation/spades-pack/review.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const folder = 'qa/experiments/2026-10-04-spades-evaluation-pack/review';
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const read = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), 'utf8')) as T;
const pack = buildReviewPack();
type Pointer = { archive: string; path: string; seq?: number; line?: number; runId?: string; arm?: string; syntheticScorePrefix: boolean };
type Index = { sources: { path: string; sha256: string }[]; cases: { id: string; packetHash: string; stratum: string; sources: Pointer[] }[] };
const index = read<Index>(`${folder}/private/source-index.json`);
const packetKeys = ['mode', 'seat', 'moduleVersion', 'ruleProfileId', 'observationSchemaVersion', 'featureVersion',
  'phase', 'hand', 'handSizes', 'bids', 'tricks', 'scores', 'bags', 'trick', 'history', 'turn', 'dealer',
  'handNumber', 'spadesBroken', 'legalActions'];
function boundaryObservation(packet: ReviewPacket): SeatObservation {
  return { ...structuredClone(packet), heartsBroken: false, events: [], passDirection: 'left',
    pass: { outgoing: [], incoming: [], to: null, from: null }, knownHoldings: [], memory: getMemory(packet),
    legalActions: packet.legalActions.map(id => id.startsWith('bid:') ?
      { kind: 'bid', seat: packet.seat, bid: Number(id.slice(4)) } :
      { kind: 'play', seat: packet.seat, card: id.slice(5) }) };
}

test('frozen review files reproduce a 32-case pack sourced from all four archives', () => {
  assert.equal(pack.schemaVersion, 'spades-review-pack-1.0.0');
  assert.equal(pack.cases.length, 32);
  assert.deepEqual(read<{ cases: ReviewCase[] }>(`${folder}/cases.json`).cases, pack.cases);
  assert.deepEqual(read(`${folder}/coverage.json`), pack.coverage);
  assert.deepEqual(index.sources, pack.sources);
  assert.deepEqual(pack.coverage.replay, { textDecisions: 706, browserDecisions: 672,
    textHands: { complete: 11, partial: 3, unstarted: 2 } });
  for (const archive of ['agent-scenario-lab', 'two-suit-batch', 'expanded-batch', 'browser-baseline'])
    assert.ok(index.cases.some(row => row.sources.some(source => source.archive === archive)), archive);
  for (const source of pack.sources) assert.equal(sha(readFileSync(join(root, source.path))), source.sha256, source.path);
});

test('blind cases allowlist player information and contain no answer, tactic or source fields', () => {
  const files = read<{ cases: ReviewCase[] }>(`${folder}/cases.json`);
  assert.deepEqual(Object.keys(files).sort(), ['cases', 'schemaVersion']);
  for (const reviewCase of pack.cases) {
    assert.match(reviewCase.id, /^case-\d{3}$/);
    assert.match(reviewCase.familyId, /^family-\d{3}$/);
    assert.deepEqual(Object.keys(reviewCase).sort(), ['familyId', 'id', 'mode', 'packet', 'packetHash']);
    assert.deepEqual(Object.keys(reviewCase.packet).sort(), [...packetKeys].sort());
    assert.equal(reviewCase.packetHash, sha(JSON.stringify(reviewCase.packet)));
    assert.equal(reviewCase.mode, reviewCase.packet.mode);
    assert.ok(reviewCase.packet.legalActions.length > 1);
    const permittedCards = new Set([...reviewCase.packet.hand,
      ...reviewCase.packet.history.flatMap(trick => trick.plays.map(play => play.card)),
      ...reviewCase.packet.trick.map(play => play.card)]);
    const inspect = (value: unknown): void => {
      if (typeof value === 'string' && /^[CDHS](?:[2-9]|10|J|Q|K|A)$/.test(value)) assert.ok(permittedCards.has(value));
      if (Array.isArray(value)) value.forEach(inspect);
      else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
        assert.ok(!/(^hands$|source|fixture|paragraph|justification|actionChoice|selected|prediction|cue|policy|agent|answer|reason|tactic)/i.test(key), key);
        inspect(item);
      }
    };
    inspect(reviewCase.packet);
  }
});

test('every packet preserves all public plays, winners, turn order, remaining counts and complete legal set', () => {
  for (const { packet } of pack.cases) {
    assertObservation(boundaryObservation(packet));
    const publicCards = [...packet.history.flatMap(trick => trick.plays), ...packet.trick].map(play => play.card);
    assert.equal(new Set([...packet.hand, ...publicCards]).size, packet.hand.length + publicCards.length);
    let leader = nextSeat(packet.dealer);
    const wins = [0, 0, 0, 0];
    for (const trick of packet.history) {
      assert.equal(trick.plays.length, 4);
      for (const [position, play] of trick.plays.entries()) assert.equal(play.seat, (leader + position) % 4);
      assert.equal(trickWinner(trick.plays, packet.mode), trick.winner);
      wins[trick.winner]++;
      leader = trick.winner;
    }
    assert.deepEqual(packet.tricks, wins);
    for (const [position, play] of packet.trick.entries()) assert.equal(play.seat, (leader + position) % 4);
    for (let seat = 0; seat < 4; seat++)
      assert.equal(packet.handSizes[seat], 13 - packet.history.length - packet.trick.filter(play => play.seat === seat).length);
    assert.equal(packet.hand.length, packet.handSizes[packet.seat]);
    assert.equal(packet.spadesBroken, publicCards.some(card => card.startsWith('S')));
    assert.equal(packet.seat, packet.turn);
    if (packet.phase === 'play') {
      assert.ok(packet.bids.every(bid => bid !== null));
      assert.equal(packet.turn, (leader + packet.trick.length) % 4);
    } else {
      assert.equal(packet.history.length, 0); assert.equal(packet.trick.length, 0);
      const made = packet.bids.filter(bid => bid !== null).length;
      assert.equal(packet.turn, (nextSeat(packet.dealer) + made) % 4);
      for (let offset = 0; offset < 4; offset++)
        assert.equal(packet.bids[(nextSeat(packet.dealer) + offset) % 4] !== null, offset < made);
      assert.deepEqual(packet.legalActions, Array.from({ length: 14 }, (_, bid) => `bid:${bid}`));
    }
  }
});

test('private provenance points to original own cards/history and deduplicates identical browser arms', () => {
  assert.equal(new Set(pack.cases.map(row => row.packetHash)).size, pack.cases.length);
  assert.ok(index.cases.some(row => row.sources.some(source => source.arm === 'baseline') && row.sources.some(source => source.arm === 'candidate')));
  for (const row of index.cases) {
    const reviewCase = pack.cases.find(reviewCase => reviewCase.id === row.id)!;
    assert.ok(reviewCase); assert.equal(row.packetHash, reviewCase.packetHash);
    for (const pointer of row.sources) {
      assert.ok(pack.sources.some(source => source.path === pointer.path));
      if (pointer.seq !== undefined) {
        const saved = read<{ decisions: { seq: number; packet: { hand: string[]; completedTricks: unknown; currentTrick: unknown; legalActions: string[] } }[] }>(pointer.path);
        const packet = saved.decisions.find(decision => decision.seq === pointer.seq)!.packet;
        assert.deepEqual(packet.hand, reviewCase.packet.hand);
        assert.deepEqual(packet.completedTricks, reviewCase.packet.history);
        assert.deepEqual(packet.currentTrick, reviewCase.packet.trick);
        assert.deepEqual([...packet.legalActions].sort(), [...reviewCase.packet.legalActions].sort());
      } else {
        assert.ok(pointer.line);
        const saved = JSON.parse(readFileSync(join(root, pointer.path), 'utf8').trim().split(/\r?\n/)[pointer.line - 1]) as { runId: string; observation: SeatObservation };
        assert.equal(saved.runId, pointer.runId);
        assert.deepEqual(projectReviewPacket(saved.observation), reviewCase.packet);
      }
    }
  }
  const scoreCases = index.cases.filter(row => row.stratum === 'score-pressure-context');
  assert.equal(scoreCases.length, 6);
  assert.ok(scoreCases.every(row => row.sources.every(source => source.syntheticScorePrefix)));
  assert.ok((pack.coverage.holes as string[]).some(hole => hole.includes('synthetic')));
  assert.ok((pack.coverage.holes as string[]).some(hole => hole.includes('Signal')));
});

test('changing all concealed hands cannot change a packet and unexpected strategic fields are rejected', () => {
  for (const mode of ['spades-solo', 'spades-partners'] as const) {
    const state = createGame({ id: 'hidden-permutation', mode, dealer: 3 }, fullDeck());
    const original = observe(state, 0), packet = projectReviewPacket(original);
    const changed = structuredClone(state);
    const other = [1, 2, 3] as Seat[];
    const concealed = other.flatMap(seat => changed.hands[seat]).reverse();
    for (const [position, seat] of other.entries()) changed.hands[seat] = concealed.slice(position * 13, (position + 1) * 13);
    assert.notDeepEqual(state.hands.slice(1), changed.hands.slice(1));
    assert.deepEqual(projectReviewPacket(observe(changed, 0)), packet);
    for (const key of ['hands', 'selectedAction', 'policy', 'agentParagraph', 'predictedAnswer'])
      assert.throws(() => projectReviewPacket({ ...original, [key]: state.hands } as SeatObservation), /unexpected observation/);
    const nested = structuredClone(original);
    nested.trick = [{ seat: 1, card: state.hands[1][0], hiddenHand: state.hands[2] } as never];
    assert.throws(() => projectReviewPacket(nested), /unexpected observation/);
    packet.hand.pop(); packet.history.push({ plays: [], winner: 0 });
    assert.deepEqual(observe(state, 0), original, 'Projector must deep-copy mutable arrays');
  }
});

test('human labels are blank, permit unknown/contested and regenerate without archived answers', () => {
  type Label = { id: string; packetHash: string; reviewerId: null; reviewedAt: null; status: string;
    acceptableActions: string[]; unacceptableActions: string[]; alternatives: string[];
    rationale: null; uncertainty: null; dispute: null };
  const labels = read<{ instructions: string; cases: Label[] }>(`${folder}/human-labels.json`);
  assert.match(labels.instructions, /supported, unknown or contested/);
  assert.equal(labels.cases.length, pack.cases.length);
  for (const [position, label] of labels.cases.entries()) {
    assert.equal(label.id, pack.cases[position].id); assert.equal(label.packetHash, pack.cases[position].packetHash);
    assert.equal(label.status, 'unknown');
    for (const key of ['reviewerId', 'reviewedAt', 'rationale', 'uncertainty', 'dispute'] as const) assert.equal(label[key], null);
    for (const key of ['acceptableActions', 'unacceptableActions', 'alternatives'] as const) assert.deepEqual(label[key], []);
  }
  const temporary = mkdtempSync(join(tmpdir(), 'cardford-review-test-'));
  try {
    writeReviewPack(temporary);
    for (const file of ['cases.json', 'coverage.json', 'human-labels.json', 'private/source-index.json', 'README.md'])
      assert.equal(readFileSync(join(temporary, file), 'utf8'), readFileSync(join(root, folder, file), 'utf8'), file);
  } finally {
    assert.ok(resolve(temporary).startsWith(resolve(tmpdir())) && temporary.includes('cardford-review-test-'));
    rmSync(temporary, { recursive: true });
  }
});

test('rerunning extraction preserves a completed human review and rejects case/source drift before writing', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'cardford-review-test-'));
  try {
    writeReviewPack(temporary);
    const labelPath = join(temporary, 'human-labels.json');
    const labels = JSON.parse(readFileSync(labelPath, 'utf8')) as { cases: Record<string, unknown>[] };
    // Simulated review only in the temporary test pack, never presented as independent evidence.
    Object.assign(labels.cases[0], { reviewerId: 'simulated-test-reviewer', reviewedAt: '2026-10-04T12:00:00Z',
      status: 'supported', acceptableActions: [pack.cases[0].packet.legalActions[0]], rationale: 'Temporary test label.' });
    writeFileSync(labelPath, JSON.stringify(labels));
    const original = readFileSync(labelPath, 'utf8');
    writeReviewPack(temporary);
    assert.equal(readFileSync(labelPath, 'utf8'), original);
    for (const file of ['cases.json', 'private/source-index.json']) {
      const path = join(temporary, file), bytes = readFileSync(path, 'utf8');
      const corrupted = JSON.parse(bytes) as { cases: ReviewCase[]; sources?: { sha256: string }[] };
      if (file === 'cases.json') corrupted.cases[0].packetHash = '0'.repeat(64);
      else { assert.ok(corrupted.sources); corrupted.sources[0].sha256 = '0'.repeat(64); }
      writeFileSync(path, JSON.stringify(corrupted));
      assert.throws(() => writeReviewPack(temporary), /Frozen review artifact drift/);
      assert.equal(readFileSync(labelPath, 'utf8'), original);
      writeFileSync(path, bytes);
    }
  } finally {
    assert.ok(resolve(temporary).startsWith(resolve(tmpdir())) && temporary.includes('cardford-review-test-'));
    rmSync(temporary, { recursive: true });
  }
});

test('read-only audit preserves annotated human files and detects changed private source pointers', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'cardford-review-test-'));
  try {
    writeReviewPack(temporary);
    const labelPath = join(temporary, 'human-labels.json');
    const labels = JSON.parse(readFileSync(labelPath, 'utf8')) as Record<string, unknown>;
    labels.reviewerAdministrationNote = 'Temporary audit test annotation; preserve verbatim.';
    writeFileSync(labelPath, JSON.stringify(labels));
    const files = ['cases.json', 'coverage.json', 'human-labels.json', 'private/source-index.json', 'README.md'];
    const originalBytes = files.map(file => readFileSync(join(temporary, file), 'utf8'));
    const audit = auditReviewPack(temporary);
    assert.equal(audit.cases, pack.cases.length); assert.equal(audit.sourceFiles, pack.sources.length);
    assert.equal(audit.labels.pending, pack.cases.length); assert.equal(audit.labels.supported, 0);
    assert.deepEqual(files.map(file => readFileSync(join(temporary, file), 'utf8')), originalBytes);
    const privatePath = join(temporary, 'private/source-index.json');
    const corrupted = JSON.parse(readFileSync(privatePath, 'utf8')) as Index;
    corrupted.cases[0].sources[0].path = 'incorrect-source-pointer.json';
    writeFileSync(privatePath, JSON.stringify(corrupted));
    const corruptedBytes = files.map(file => readFileSync(join(temporary, file), 'utf8'));
    assert.throws(() => auditReviewPack(temporary), /Frozen review artifact drift: private\/source-index.json/);
    assert.deepEqual(files.map(file => readFileSync(join(temporary, file), 'utf8')), corruptedBytes);
  } finally {
    assert.ok(resolve(temporary).startsWith(resolve(tmpdir())) && temporary.includes('cardford-review-test-'));
    rmSync(temporary, { recursive: true });
  }
});
