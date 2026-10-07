import assert from 'node:assert/strict';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { buildResearchLedger, normalizeActorPacket, sha256, loadFamilies, bytes, json, reviewRoot,buildLabelIndex } from '../evaluation/multi-game/research.ts';
import { ledgerOutputs } from '../../scripts/build-research-ledger.ts';
import { validateHumanLabels } from '../evaluation/spades-pack/labels.ts';
import type { ReviewCase } from '../evaluation/spades-pack/review.ts';

test('M07 imports original discovery bytes and accounts for incomplete/unused episodes', () => {
  const result = buildResearchLedger();
  assert.equal(result.rows.filter(row => row.sourceKind === 'text-discovery').length, 706);
  assert.equal(result.rows.filter(row => row.sourceKind === 'browser').length, 672);
  assert.equal(result.episodes.filter(row => row.status === 'unstarted').length, 2);
  assert.equal(result.episodes.filter(row => row.status === 'unused').length, 2);
  assert.equal(result.episodes.filter(row => row.sourceKind === 'browser' && row.status === 'complete').length, 12);
  assert.equal(result.rows.filter(row => row.typedClaimStatus === 'absent').length, 336);
  assert.ok(result.rows.filter(row => row.completeness === 'partial').every(row => !row.outcomeEligible));
  assert.ok(result.rows.every(row => row.labels === 'unreviewed' && row.labelRefs.length === 0));
  assert.equal(result.labels.length, 32);
  assert.ok(result.labels.every(row => row.status === 'pending'));
  assert.equal(result.rows.filter(row => row.sourceKind === 'browser' && row.hypotheses.includes('CASE-03')).length, 0);
  const groups = new Map<string, Set<string>>();
  for (const row of result.rows) {
    const families = groups.get(row.duplicatePacketGroup) ?? new Set<string>();
    families.add(row.originFamilyId); groups.set(row.duplicatePacketGroup, families);
  }
  assert.ok([...groups.values()].every(families => families.size === 1));
  assert.ok([...groups.values()].length < result.rows.length, 'paired packets reused');
});

test('M07 normalized duplicate hash excludes presentation only and retains objective and seat', () => {
  const packet = { game: 'spades-solo', seat: 0, hand: ['S2'], legalActions: ['play:S2'], scores: [0,0,0,0], phase: 'play' };
  assert.equal(sha256(normalizeActorPacket(packet)), sha256(normalizeActorPacket({ ...packet, name: 'ignored', names: [] })));
  assert.notEqual(sha256(normalizeActorPacket(packet)), sha256(normalizeActorPacket({ ...packet, seat: 1 })));
  assert.notEqual(sha256(normalizeActorPacket(packet)), sha256(normalizeActorPacket({ ...packet, game: 'spades-partners' })));
  assert.notEqual(sha256(normalizeActorPacket(packet)), sha256(normalizeActorPacket({ ...packet, scores: [490,0,0,0] })));
});

test('M07 rejects missing family assignments instead of guessing from filenames', () => {
  assert.throws(() => loadFamilies({ schemaVersion: 'research-families-1.0.0', families: [] }), /family|assignment/i);
});

test('M07 exact generated outputs match their source and both strict schemas validate every snapshot', () => {
  for(const [path,content] of ledgerOutputs()) assert.equal(bytes(path).toString('utf8'),content,path);
  const result=buildResearchLedger(),ajv=new Ajv2020({strict:true});
  const validateRow=ajv.compile(json('qa/research/multi-game/ledger.schema.json'));
  const validateLabel=ajv.compile(json('qa/evaluation/multi-game/labels.schema.json'));
  for(const row of result.rows) assert.ok(validateRow(row),JSON.stringify(validateRow.errors));
  for(const label of result.labels) assert.ok(validateLabel(label),JSON.stringify(validateLabel.errors));
  assert.equal(validateRow({...result.rows.find(row=>row.completeness==='partial')!,outcomeEligible:true}),false);
  assert.equal(validateLabel({...result.labels[0],acceptableIds:['outside']}),false);
  for(const [path,hash] of Object.entries(result.sourceHashes)) assert.equal(sha256(bytes(path)),hash,path);
});

test('M07 original label validator rejects unsupported candidates before indexing and pending remains distinct', () => {
  const cases=json<{cases:ReviewCase[]}>(reviewRoot+'cases.json').cases;
  const labels=json<{cases:Record<string,unknown>[]}>(reviewRoot+'human-labels.json');
  const bad=structuredClone(labels);bad.cases[0].acceptableActions=['play:ZZ'];
  assert.throws(()=>validateHumanLabels(cases,bad),/Invalid action/);
  assert.equal(buildLabelIndex().filter(label=>label.status==='unknown').length,0);
});
