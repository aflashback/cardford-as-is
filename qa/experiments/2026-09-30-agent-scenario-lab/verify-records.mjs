// Offline integrity checks after the engine replay audits. No provider calls.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const hash = x => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const results = [];
for (const id of ['solo-control-01', 'partners-nil-race-01']) {
  const record = read(`records/${id}.json`);
  const audit = read(`records/${id}.audit.json`);
  assert.equal(record.decisions.length, 56);
  assert.equal(audit.complete, true);
  assert.equal(audit.boundaryChecks, 56);
  assert.equal(audit.uniquePlayed, 52);
  assert.equal(audit.tricks, 13);
  assert.equal(audit.accepted, record.decisions.length);
  assert.deepEqual(audit.result, record.result);
  assert.equal(record.jevCalls, 0);
  for (const [index, d] of record.decisions.entries()) {
    assert.equal(d.seq, index + 1);
    assert.equal(hash(d.rawResponse), d.responseHash);
    assert.equal(hash(d.packet), d.packetHash);
    const match = /^(BID: (?:[0-9]|1[0-3])|PLAY: [CDHS](?:[2-9JQKA]|10))\r?\n\r?\n([^\r\n]+)$/.exec(d.rawResponse.trim());
    assert.ok(match);
    assert.equal(match[2], d.justification);
    const words = d.justification.trim().split(/\s+/).length;
    assert.ok(words >= 15 && words <= 100);
    assert.equal(match[1], d.action.kind === 'bid' ? `BID: ${d.action.bid}` : `PLAY: ${d.action.card}`);
    assert.equal(d.seat, d.packet.seat);
    assert.equal(d.seat, d.action.seat);
    assert.equal(d.name, d.packet.name);
    assert.ok(d.agent.endsWith('/' + d.name.toLowerCase()));
    assert.equal(d.forced, d.packet.legalActions.length === 1);
  }
  results.push({ episodeId: id, status: 'passed', decisions: 56, rejected: record.rejections.length,
    forced: record.decisions.filter(d => d.forced).length,
    differencesFromD0: audit.comparisons.filter(d => d.agent !== d.d0).length,
    differencesFromD1: audit.comparisons.filter(d => d.agent !== d.d1).length,
    comparisonsAreNotCorrectnessLabels: true });
}
const result = { status: 'passed', episodes: results, scope: 'Saved record integrity plus existing engine replay reports; not an audit of model internals or manual transport messages.' };
writeFileSync(new URL('./records/integrity.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
