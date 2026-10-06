// Independent import acceptance/rejection evidence from preserved M02 code.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { harness, savedCorpus } from '../../../../web/server/tests/support/module-parity.ts';
import { decodeRegisteredDocument } from '../../../../web/server/games/registrations.ts';

const target = resolve(import.meta.dirname, 'boundary-corpus.json');
const cases: {mode: string; label: string; document: unknown; accepted: boolean}[] = [];
for (const saved of savedCorpus.cases) {
  const document = harness(saved.config.mode).create(saved.config, saved.deal).serializePrivate();
  // The test fixture deliberately edits unknown JSON; only the reference reader
  // decides validity. This is private importer evidence, never runtime state.
  const add = (label: string, mutate: (value: Record<string, any>) => void) => {
    const value = structuredClone(document) as Record<string, any>;
    mutate(value);
    let accepted = true;
    try { decodeRegisteredDocument(value); } catch { accepted = false; }
    cases.push({mode: saved.config.mode, label, document: value, accepted});
  };
  add('original', () => {});
  add('unknown-envelope-field', v => {v.privateCanary = true;});
  add('unknown-private-field', v => {v.payload.privateCanary = true;});
  add('missing-pin', v => {delete v.pin.moduleVersion;});
  add('future-module-pin', v => {v.pin.moduleVersion = '99.0.0';});
  add('mixed-public-pin', v => {v.pin.publicSchemaVersion = '1.0.0';});
  add('wrong-competition', v => {v.competition.competitors[0].seats = [1];});
  add('duplicate-controller', v => {v.controllers[1] = v.controllers[0];});
  add('wrong-human-seat', v => {v.controllers[0].kind = 'computer'; v.controllers[1].kind = 'human';});
  add('journal-revision-without-entry', v => {v.journal.revision = 1;});
  add('unknown-journal-field', v => {v.journal.privateCanary = true;});
  add('unknown-audit-field', v => {v.audits.privateCanary = true;});
  add('null-events', v => {v.payload.events = null;});
  add('empty-events', v => {v.payload.events = [];});
  add('reversed-holdings', v => {v.payload.hands = v.payload.hands.map((h: string[]) => h.reverse());});
  add('duplicate-card', v => {v.payload.hands[0][0] = v.payload.hands[1][0];});
  add('null-hand', v => {v.payload.hands[0] = null;});
  add('wrong-turn', v => {v.payload.turn = v.payload.turn === null ? 0 : (v.payload.turn + 1) % 4;});
  add('wrong-hand-number', v => {v.payload.handNumber = 2;});
  add('unsafe-score', v => {v.payload.scores[0] = Number.MAX_SAFE_INTEGER + 1;});
  add('changed-opening-score', v => {v.payload.scores[0] = 20;});
  add('unknown-event-field', v => {v.payload.events[0].privateCanary = true;});
  add('changed-event-message', v => {v.payload.events[0].message = 'Changed original text';});
  add('duplicate-event', v => {v.payload.events.push(v.payload.events[0]);});
  add('wrong-event-index', v => {v.payload.events[0].id = 2;});
  add('missing-private-pin', v => {delete v.payload.stateSchemaVersion;});
}
assert.equal(process.platform, 'win32');
assert.equal(process.version, 'v24.19.0');
const output = JSON.stringify({schemaVersion: '1.0.0', provenance: 'M02 TypeScript registry/state reader; authored import mutations only', node: process.version, cases}) + '\n';
if (process.argv.includes('--write')) {assert.equal(existsSync(target), false, 'Refusing overwrite');writeFileSync(target, output);}
else if (process.argv.includes('--check')) assert.equal(readFileSync(target, 'utf8'), output, 'Boundary oracle drift');
else throw Error('Use --write once or --check');
console.log(JSON.stringify({cases: cases.length, accepted: cases.filter(c => c.accepted).length, sha256: createHash('sha256').update(output).digest('hex')}));
