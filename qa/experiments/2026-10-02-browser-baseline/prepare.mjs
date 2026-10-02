// Offline provenance checks and fixed opening catalog. Never alters discovery archives.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createGame, apply, collectTrick, legalActions, actionId } from '../../../web/server/game/index.ts';
import { observe } from '../../../web/server/observations/index.ts';
import { parseDevScenarios } from '../../../web/server/dev-scenarios.ts';

const directory = fileURLToPath(new URL('./', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = path => JSON.parse(readFileSync(root + path, 'utf8'));
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const batches = ['2026-09-30-agent-scenario-lab', '2026-09-30-two-suit-batch', '2026-09-30-expanded-batch'];
const sources = [];
let accepted = 0, complete = 0, partial = 0, unstarted = 0;
for (const batch of batches) {
  const path = `qa/experiments/${batch}/deals.json`;
  for (const episode of read(path).episodes) {
    const recordPath = `qa/experiments/${batch}/records/${episode.id}.json`;
    if (!existsSync(root + recordPath)) { unstarted++; sources.push({ path, episode: episode.id, status: 'unstarted', dealHash: sha(episode) }); continue; }
    const record = read(recordPath);
    assert.equal(record.dealHash, sha(episode));
    const first = (episode.dealer + 1) % 4;
    const deck = Array.from({ length: 52 }, (_, i) => episode.hands[(first + i) % 4][Math.floor(i / 4)]);
    let state = createGame({ id: episode.id, mode: episode.mode, dealer: episode.dealer }, deck);
    state.scores = [...episode.scores]; state.bags = [...episode.bags];
    for (const [i, decision] of record.decisions.entries()) {
      assert.equal(decision.seq, i + 1);
      assert.equal(decision.packetHash, sha(decision.packet));
      const obs = observe(state, state.turn), packet = decision.packet;
      assert.equal(packet.game, obs.mode); assert.equal(packet.seat, obs.seat);
      for (const [saved, actual] of [['hand', 'hand'], ['bids', 'bids'], ['tricks', 'tricks'], ['scores', 'scores'], ['bags', 'bags'], ['completedTricks', 'history'], ['currentTrick', 'trick']]) assert.deepEqual(packet[saved], obs[actual]);
      assert.deepEqual([...packet.legalActions].sort(), legalActions(state, state.turn).map(actionId).sort());
      assert.ok(packet.legalActions.includes(actionId(decision.action)));
      state = apply(state, decision.action);
      if (state.phase === 'trick-end') state = collectTrick(state);
      accepted++;
    }
    const done = ['hand-end', 'match-end'].includes(state.phase);
    if (done) complete++; else if (record.decisions.length) partial++; else unstarted++;
    sources.push({ path, episode: episode.id, recordPath, recordFileHash: sha(readFileSync(root + recordPath, 'utf8')), dealHash: sha(episode), decisions: record.decisions.length, status: done ? 'complete' : record.decisions.length ? 'partial' : 'unstarted', finalPhase: state.phase });
  }
}
assert.deepEqual({ accepted, complete, partial, unstarted }, { accepted: 706, complete: 11, partial: 3, unstarted: 2 });
mkdirSync(directory, { recursive: true });
writeFileSync(directory + 'source-audit.json', JSON.stringify({ schemaVersion: 'source-replay-1.0.0', accepted, complete, partial, unstarted, checks: ['source deal hash', 'accepted packet hash', 'seat-scoped cards/public history', 'legal action list', 'accepted action', 'full deterministic replay'], sources }, null, 2) + '\n');

const groups = [
  { id: 'control', batch: batches[0], source: () => 'solo-control-01', rotation: 0, cases: ['CASE-04', 'Nil regression'], limitation: 'Partners is a new zero-start mode twin of the Solo control deal.' },
  { id: 'sweep', batch: batches[1], source: mode => `${mode}-spread`, rotation: 2, cases: ['CASE-03', 'CASE-04'], limitation: 'Opening shape does not guarantee the archived public proof becomes reachable.' },
  { id: 'resources', batch: batches[2], source: mode => `${mode}-void-trumps-at-jason`, rotation: 2, cases: ['CASE-01', 'CASE-02', 'CASE-04'], limitation: 'CASE-01 additionally needs an unmet positive team contract when its public premises become known.' },
];
const scenarios = [], fixtures = [], runs = [];
for (const group of groups) for (const mode of ['solo', 'partners']) {
  const source = read(`qa/experiments/${group.batch}/deals.json`).episodes.find(e => e.id === group.source(mode));
  assert.ok(source);
  const hands = [0, 1, 2, 3].map(seat => [...source.hands[(seat - group.rotation + 4) % 4]]);
  const id = `baseline-${group.id}-${mode}`;
  const scenario = { id, version: '1.0.0', label: `${group.id[0].toUpperCase()}${group.id.slice(1)} ${mode}`, mode: `spades-${mode}`, dealer: (source.dealer + group.rotation) % 4, hands: Object.fromEntries(['south', 'west', 'north', 'east'].map((name, i) => [name, hands[i]])) };
  scenarios.push(scenario);
  fixtures.push({ id, mode: scenario.mode, source: `qa/experiments/${group.batch}/deals.json#${source.id}`, sourceDealHash: sha(source), rotation: group.rotation, openingScores: [0, 0, 0, 0], openingBags: [0, 0, 0, 0], cases: group.cases, limitation: group.limitation, scenarioHash: sha(scenario) });
  // Alternating arm order is fixed before seeing any outcomes.
  const order = group.id === 'sweep' ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
  for (const arm of order) runs.push({ id: `${group.id}-${mode}-${arm}`, scenarioId: id, mode: scenario.mode, arm, policy: arm === 'baseline' ? 'spades-tactics-2.1.0' : 'spades-cases-4.0.0' });
}
const catalog = { schemaVersion: '1.0.0', scenarios };
parseDevScenarios(catalog);
const manifest = { schemaVersion: 'browser-baseline-1.0.0', frozenBeforePlay: true, dependencyCommit: '21cf9df', player: { model: 'gpt-6-luna', effort: 'xhigh', seat: 0, context: 'Fresh own-hand and public-history packet; coaching hidden; no tools.' }, observer: { model: 'gpt-6-luna', effort: 'xhigh', context: 'Public packet checkpoints while playing; original bot audits only after completion; no feedback to player.' }, runtime: { jev: 'off', source: 'deterministic code', identities: 2, bootstrapPartnersSessions: 2 }, limits: { measuredHands: 12, measuredPerMode: 6, totalCreatedExpected: 14, maxCreated: 20, maxCreatedPerMode: 10 }, protocol: { forcedActions: 'Apply the sole legal action through DOM, record forced, no player model call.', matchingPackets: 'Reuse exactly matching recorded Luna choice across arms; record source.', retries: 'At most two attempts on unchanged packet; never substitute a move.', outcomes: 'Descriptive paired table outcomes; no isolated bot strength or representative win-rate claim.', caseMisses: 'Report without extra games or changing fixtures.' }, catalogHash: sha(catalog), fixtures, runs };
for (const [name, value] of [['dev-deals.json', catalog], ['manifest.json', manifest]]) {
  const contents = JSON.stringify(value, null, 2) + '\n';
  if (existsSync(directory + name)) assert.equal(readFileSync(directory + name, 'utf8'), contents, `Frozen ${name} differs`);
  else writeFileSync(directory + name, contents);
}
console.log(JSON.stringify({ accepted, complete, partial, unstarted, fixtures: scenarios.length, plannedHands: runs.length }));
