import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeRegisteredDocument } from '../../../../web/server/games/registrations.ts';

const target = resolve(import.meta.dirname, 'edge-corpus.json');
const boundary = JSON.parse(readFileSync(new URL('./boundary-corpus.json', import.meta.url), 'utf8'));
const cases: unknown[] = [];
for (const original of boundary.cases.filter((c: { label: string }) => c.label === 'original')) {
  const add = (label: string, change: (raw: string) => string) => {
    const raw = change(JSON.stringify(original.document));
    let accepted = true, document: unknown = null;
    try { document = decodeRegisteredDocument(JSON.parse(raw)).serializePrivate(); } catch { accepted = false; }
    cases.push({mode: original.mode, label, raw, accepted, document});
  };
  add('integer-exponent', raw => raw.replaceAll(/"dealer":(\d+)/g, '"dealer":$1e0'));
  add('integer-decimal', raw => raw.replaceAll('"handNumber":1', '"handNumber":1.0'));
  add('fractional-integer', raw => raw.replaceAll('"handNumber":1', '"handNumber":1.5'));
  add('overflow-integer', raw => raw.replaceAll('"handNumber":1', '"handNumber":1e999'));
  add('long-nonbmp-id', raw => {const value = JSON.parse(raw);value.payload.id = '😀'.repeat(200);return JSON.stringify(value);});
  add('long-nonbmp-message', raw => {const value = JSON.parse(raw);value.payload.events[0].message = '😀'.repeat(1500);return JSON.stringify(value);});
  add('overlong-message', raw => {const value = JSON.parse(raw);value.payload.events[0].message = '😀'.repeat(2001);return JSON.stringify(value);});
}
assert.equal(process.platform, 'win32');assert.equal(process.version, 'v24.19.0');
const output = JSON.stringify({schemaVersion:'1.0.0',provenance:'Original TypeScript import semantics for numeric spellings and Unicode codepoint versus UTF16 lengths',cases})+'\n';
if(process.argv.includes('--write')){assert.equal(existsSync(target),false,'Refusing overwrite');writeFileSync(target,output);}
else if(process.argv.includes('--check'))assert.equal(readFileSync(target,'utf8'),output,'Edge oracle drift');
else throw Error('Use --write once or --check');
console.log(JSON.stringify({cases:cases.length,sha256:createHash('sha256').update(output).digest('hex')}));
