import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { exportRawGame } from '../../scripts/trix-scenario-collection/raw-export.mjs';
import { projectPlayerPacket } from '../../scripts/trix-scenario-collection/contracts.mjs';
import { seededDeck } from '../../scripts/trix-scenario-collection/runner.mjs';
import { appendEvent, jsonBytes, putBlob, safePath, sha, writeImmutable } from '../../scripts/trix-scenario-collection/journal.mjs';

const plan = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../planning/implementation/coach-lab/trix-scenario-collection/campaign.plan.json'), 'utf8'));
function fixture(t) {
  const scratch = resolve(tmpdir()), root = mkdtempSync(resolve(scratch, 'trix-raw-export-'));
  t.after(() => { assert.ok(root.startsWith(scratch)); rmSync(root, { recursive: true, force: true }); });
  const episodeId = 'synthetic-game', variant = 'basic-solo', request = 'king';
  const pin = { ...plan.pins, variantId: variant, ruleProfileId: plan.phases[0].ruleProfileId };
  const cards = seededDeck('raw-export-synthetic'), totals = [0, 1, 2, 3].map(actor => ({ id: `seat-${actor}`, seats: [actor], total: 0 }));
  const commits = [], reviews = [], accepted = [];
  for (let revision = 0; revision < 52; revision++) {
    const actor = revision % 4, card = cards[revision], decisionId = `${episodeId}:${revision}:${actor}`;
    const nativePacket = { publicSchemaVersion: '1.2.0', gameId: 'trix', variantId: variant, seat: actor, phase: 'playing', observation: { id: episodeId, gameId: 'trix', variantId: variant, seat: actor, phase: 'playing', turn: actor, kingdom: 1, dealNumber: 1, owner: 3, request, remainingRequests: [], hand: [card], handCounts: [1, 1, 1, 1], trick: [], tricks: [], declarations: [], board: ['C', 'D', 'H', 'S'].map(suit => ({ suit, low: 0, high: 0 })), finishOrder: [], passes: [], ledger: [], withheldBonuses: [], lastExternalLeader: [null, null, null, null], totals, requestTotals: totals, kingdomTotals: totals, winners: [], layoutHistory: { version: '1.0.0', status: 'available', turns: [] } }, candidates: [{ id: `play:${card}`, public: { kind: 'play-card', card } }] };
    const packet = projectPlayerPacket(nativePacket, pin, revision, `synthetic-invocation-${revision}`, { name: 'Synthetic Trix fixture', description: 'Synthetic schema fixture.', text: 'Follow suit. Native scoring is authoritative.', objective: 'own-request-points' });
    const packetRef = putBlob(root, packet), response = { card: packet.legalOptions[0].card, reasoning: `Synthetic rationale ${revision}.`, confidence: revision % 101 }, rawRef = putBlob(root, jsonBytes(response));
    const receiptRef = putBlob(root, { hostAgentId: 'synthetic-player', responseHash: rawRef.sha256 });
    const savedRef = putBlob(root, { response, rawRef, receiptRef, candidateId: `play:${card}`, admission: { admitted: true }, job: { packetRef, nativePacketRef: putBlob(root, nativePacket), actor, revision, phase: 'playing', pin, parentThreadId: 'synthetic-parent', privateWire: 'PRIVATE_WIRE_SENTINEL' } });
    commits.push({ decisionId, episodeId, variant, request, revision, actor, phase: 'playing', forced: true, selectedCandidateId: `play:${card}`, responseHash: rawRef.sha256, receiptHash: receiptRef.sha256, savedRef, frameRef: putBlob(root, { hiddenHands: 'PRIVATE_FRAME_SENTINEL', deck: cards, seed: 'PRIVATE_SEED_SENTINEL' }) });
    const review = { decisionId, packetHash: packetRef.sha256, reviewVersion: 'trix-luna-review-1.0.0', provenance: 'llm-proposal', rationaleStatus: 'forced', checks: ['facts', 'objective', 'material-alternatives', 'tactical-purpose', 'uncertainty'].map(id => ({ id, status: 'supported', explanation: 'Synthetic fixture.', evidenceRefs: ['actor:/ownHand/0'] })), categoryIds: ['HK'], explanationIssues: [], hypotheses: [], missedOpportunity: null, limitations: ['Synthetic fixture, no model calls.'] };
    accepted.push(review); reviews.push({ stage: 'decision', subjectId: decisionId, reviewRef: putBlob(root, review), originalRef: putBlob(root, review), reviewerReceiptRef: putBlob(root, { contextMode: 'independent-review', responseHash: sha(jsonBytes(review)) }) });
  }
  const native = { status: 'completed', completedTricks: 13, acceptedPlays: 52, nativeTerminalPhase: 'round-complete', scoreTotals: totals, componentTotals: {}, ledger: [], withheldBonuses: [], tricks: Array.from({ length: 13 }, (_, i) => ({ number: i + 1, leader: 0, winner: 0, plays: cards.slice(i * 4, i * 4 + 4).map((card, seat) => ({ seat, card })) })) };
  const gameProposal = { episodeId, reviewVersion: 'trix-luna-game-review-1.0.0', provenance: 'llm-proposal', complete: true, quality: 'insufficient-evidence', summary: 'Synthetic retrospective fixture.', seatSummaries: [0, 1, 2, 3].map(actor => ({ actor, summary: 'Synthetic fixture.', reviewedDecisions: 13, uncertainty: ['Fixture only.'], correctionDecisionIds: [] })), nativeTotals: { scoreTotals: totals, componentTotals: {} }, supportedMissedOpportunityRefs: [], explanationIssueCounts: { adequate: 0, 'incomplete-explanation': 0, 'unsupported-claim': 0, 'incorrect-fact': 0, uncertain: 0, forced: 52 }, usefulPatternRefs: [], counterexampleRefs: [], limitations: ['Synthetic fixture.'] };
  reviews.push({ stage: 'game', subjectId: episodeId, reviewRef: putBlob(root, { ...gameProposal, frozenDecisionReviewDigest: sha(jsonBytes(accepted)) }), originalRef: putBlob(root, gameProposal), reviewerReceiptRef: putBlob(root, { contextMode: 'independent-review', responseHash: sha(jsonBytes(gameProposal)) }) });
  const manifest = { schemaVersion: 'trix-scenario-run-1.0.0', runId: 'synthetic-run', corpusId: plan.corpusId, mode: 'fixture', plan, planHash: sha(jsonBytes(plan)), build: { sourceDigest: 'a'.repeat(64), binaryDigest: 'b'.repeat(64) } };
  writeImmutable(safePath(root, 'manifest.json'), jsonBytes(manifest));
  const state = { commits, reviews, outcomes: [{ episodeId, variant, request, outcomeRef: putBlob(root, native), frameRef: commits.at(-1).frameRef }], episodes: [{ episodeId, deck: cards, seed: 'PRIVATE_SEED_SENTINEL' }] };
  return { collector: { root, manifest, state: () => state }, state, episodeId, native };
}

test('raw game retains all 52 forced rationales and confidence with exact hashes and idempotence', t => {
  const f = fixture(t), audit = { amendmentHash: 'c'.repeat(64) }, first = exportRawGame(f.collector, f.episodeId, { processingAudit: audit });
  assert.equal(first.directory, `raw-games/${f.episodeId}`); assert.equal(first.decisions, 52);
  const bytes = readFileSync(safePath(f.collector.root, `${first.directory}/decisions.jsonl`)), rows = bytes.toString().trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 52); assert.ok(rows.every(row => row.forced && row.acceptedDecisionReview.rationaleStatus === 'forced'));
  assert.equal(rows[51].originalResponse.reasoning, 'Synthetic rationale 51.'); assert.equal(rows[51].originalResponse.confidence, 51);
  assert.equal(first.source.files['decisions.jsonl'], sha(bytes)); assert.equal(first.source.mode, 'fixture'); assert.equal(first.source.selectedCaseCount, null);
  const gameBytes = readFileSync(safePath(f.collector.root, `${first.directory}/game.json`));
  assert.equal(first.source.files['game.json'], sha(gameBytes)); assert.deepEqual(JSON.parse(gameBytes.toString()).nativeOutcome, f.native);
  assert.equal(first.source.selectionDeferred, true); assert.equal(first.source.runtimeActivated, false); assert.equal(first.source.promotionEligible, false); assert.deepEqual(first.source.processingAudit, audit);
  assert.deepEqual(exportRawGame(f.collector, f.episodeId, { processingAudit: audit }), first);
  const bundle = bytes.toString() + readFileSync(safePath(f.collector.root, `${first.directory}/game.json`), 'utf8') + readFileSync(safePath(f.collector.root, `${first.directory}/source-manifest.json`), 'utf8');
  assert.doesNotMatch(bundle, /PRIVATE_|"deck"|"seed"|"snapshot"|"frameRef"|"nativePacketRef"|"privateWire"/);
  assert.match(bundle, /research-review-artifact/); assert.match(bundle, /never-player-or-reviewer-input/);
});

test('raw export refuses pending decision/game reviews and incomplete native games before publication', t => {
  for (const stage of ['decision', 'game']) {
    const f = fixture(t); f.state.reviews.splice(f.state.reviews.findIndex(r => r.stage === stage), 1);
    assert.throws(() => exportRawGame(f.collector, f.episodeId), /review/);
    assert.equal(existsSync(safePath(f.collector.root, `raw-games/${f.episodeId}/source-manifest.json`)), false);
  }
  const f = fixture(t); f.state.outcomes[0].outcomeRef = putBlob(f.collector.root, { ...f.native, acceptedPlays: 51 });
  assert.throws(() => exportRawGame(f.collector, f.episodeId), /52/);
});

test('raw publication rejects changed accepted reviews and unsafe episode identifiers', t => {
  const f = fixture(t); exportRawGame(f.collector, f.episodeId);
  const original = JSON.parse(readFileSync(safePath(f.collector.root, f.state.reviews[0].reviewRef.path), 'utf8'));
  f.state.reviews[0].reviewRef = putBlob(f.collector.root, { ...original, limitations: ['Changed accepted review.'] });
  assert.throws(() => exportRawGame(f.collector, f.episodeId), /reviews changed|Immutable artifact changed/);
  assert.throws(() => exportRawGame(f.collector, '../outside'), /episode/i);
});

test('a new processor reuses the exact published audit only when the hash journal recognizes it', t => {
  const f = fixture(t), oldAudit = { originalSourceDigest: 'a'.repeat(64), nativeBinaryDigest: 'b'.repeat(64), reviewSourceDigest: 'c'.repeat(64) };
  appendEvent(f.collector.root, 'campaign-worker-started', { processingAudit: oldAudit });
  const first = exportRawGame(f.collector, f.episodeId, { processingAudit: oldAudit });
  const marker = safePath(f.collector.root, `${first.directory}/source-manifest.json`), before = readFileSync(marker);
  const newAudit = { ...oldAudit, reviewSourceDigest: 'd'.repeat(64) };
  appendEvent(f.collector.root, 'campaign-worker-started', { processingAudit: newAudit });
  assert.throws(() => exportRawGame(f.collector, f.episodeId, { processingAudit: newAudit }), /Immutable artifact changed/);
  assert.deepEqual(exportRawGame(f.collector, f.episodeId, { processingAudit: newAudit, reusePublishedAudit: true }), first);
  assert.ok(before.equals(readFileSync(marker)));
  const decisions = safePath(f.collector.root, `${first.directory}/decisions.jsonl`);
  writeFileSync(decisions, readFileSync(decisions, 'utf8').replace('Synthetic rationale 0.', 'Corrupted rationale 0.'));
  assert.throws(() => exportRawGame(f.collector, f.episodeId, { processingAudit: newAudit, reusePublishedAudit: true }), /Immutable artifact changed/);
});

test('reuse refuses an unrecognized published processing audit or changed original/native provenance', t => {
  const f = fixture(t), audit = { originalSourceDigest: 'a'.repeat(64), nativeBinaryDigest: 'b'.repeat(64), reviewSourceDigest: 'c'.repeat(64) };
  const first = exportRawGame(f.collector, f.episodeId, { processingAudit: audit });
  assert.throws(() => exportRawGame(f.collector, f.episodeId, { processingAudit: { ...audit, reviewSourceDigest: 'd'.repeat(64) }, reusePublishedAudit: true }), /recognized.*journal/i);
  appendEvent(f.collector.root, 'campaign-worker-started', { processingAudit: audit });
  const marker = safePath(f.collector.root, `${first.directory}/source-manifest.json`), published = JSON.parse(readFileSync(marker, 'utf8'));
  const invalid = { ...audit, nativeBinaryDigest: 'e'.repeat(64) };
  appendEvent(f.collector.root, 'campaign-worker-started', { processingAudit: invalid });
  writeFileSync(marker, jsonBytes({ ...published, processingAudit: invalid }));
  assert.throws(() => exportRawGame(f.collector, f.episodeId, { processingAudit: audit, reusePublishedAudit: true }), /native.*provenance/i);
});
