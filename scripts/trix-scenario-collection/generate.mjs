// JSON Schema remains authoritative. This generator performs no network reads.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { compile } = require('json-schema-to-typescript');
const root = new URL('../../contracts/trix-scenario-collection/', import.meta.url);
const files = readdirSync(root).filter(f => f.endsWith('.schema.json')).sort();
const schemas = new Map(files.map(file => [file, JSON.parse(readFileSync(new URL(file, root), 'utf8'))]));
const localTypes = new Map();
for (const [file, schema] of schemas) {
  if (!schema.title || !/^[A-Za-z][A-Za-z0-9]*$/.test(schema.title)) throw Error(`Schema requires a stable type title: ${file}`);
  for (const ref of [file, './' + file, schema.$id]) if (ref) localTypes.set(ref, schema.title);
}
const publicNames = new Set(['RegisteredActorPacket', 'ModulePin']);
const imports = new Set();
function generationSchema(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(generationSchema);
  if (value.$ref && !value.$ref.startsWith('#/')) {
    if (localTypes.has(value.$ref)) return { tsType: localTypes.get(value.$ref) };
    const match = /^https:\/\/trickscoach.com\/schemas\/local-v1.json#\/\$defs\/(\w+)$/.exec(value.$ref);
    if (!match || !publicNames.has(match[1])) throw Error(`Unapproved external schema reference: ${value.$ref}`);
    imports.add(match[1]); return { tsType: match[1] };
  }
  const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, generationSchema(child)]));
  // json-schema-to-typescript represents fixed 2020-12 tuples using its draft-07 tuple input.
  if (result.prefixItems) { result.additionalItems = result.items; result.items = result.prefixItems; delete result.prefixItems; }
  return result;
}
const outputs = [];
for (const file of files) {
  const schema = generationSchema(schemas.get(file));
  const name = schema.title || 'TrixScenario' + file.split('.')[0].split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
  outputs.push(await compile(schema, name, { bannerComment: '', unknownAny: true, ignoreMinAndMaxItems: true, declareExternallyReferenced: false }));
}
const importText = imports.size ? `import type { ${[...imports].sort().join(', ')} } from '../../web/shared/contracts.ts';\n` : '';
const bytes = '// GENERATED from contracts/trix-scenario-collection/*.schema.json. Do not edit.\n' + importText + outputs.join('\n');
const target = new URL('types.generated.d.mts', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== bytes) throw Error('Trix collection generated types differ; run scripts/trix-scenario-collection/generate.mjs');
} else writeFileSync(target, bytes);
