import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(process.env.CONTRACT_DEPENDENCY_ROOT ? resolve(process.env.CONTRACT_DEPENDENCY_ROOT, 'package.json') : import.meta.url);
const { compile } = require('json-schema-to-typescript');
const { Ajv2020 } = require('ajv/dist/2020.js');
const standalone = require('ajv/dist/standalone/index.js').default;
const base = resolve(dirname(fileURLToPath(import.meta.url)), '../shared');
const schema = JSON.parse(await readFile(resolve(base, 'contracts.schema.json'), 'utf8'));
// Only these public fragments may enter the active bundle. Private schemas and
// arbitrary filesystem/network references are never resolved by the compiler.
const publicFragments = ['hearts', 'spades'];
const references = new Map();
const schemaLocations = new Map();
for (const name of Object.keys(schema.$defs)) references.set(`${schema.$id}#/$defs/${name}`, `#/$defs/${name}`);
for (const game of publicFragments) {
  const path = `./games/${game}.schema.json`;
  const fragment = JSON.parse(await readFile(resolve(base, path), 'utf8'));
  for (const [name, definition] of Object.entries(fragment.$defs)) {
    if (Object.hasOwn(schema.$defs, name)) throw new Error(`Duplicate public definition: ${name}`);
    schema.$defs[name] = definition;
    references.set(`${path}#/$defs/${name}`, `#/$defs/${name}`);
    schemaLocations.set(name, `${path}#/$defs/${name}`);
  }
}
function resolvePublicReferences(value) {
  if (Array.isArray(value)) { value.forEach(resolvePublicReferences); return; }
  if (value === null || typeof value !== 'object') return;
  if ('$ref' in value) {
    if (references.has(value.$ref)) value.$ref = references.get(value.$ref);
    else if (!value.$ref.startsWith('#/$defs/') || !Object.hasOwn(schema.$defs, value.$ref.slice(8)))
      throw new Error(`Unregistered public schema reference: ${value.$ref}`);
  }
  Object.values(value).forEach(resolvePublicReferences);
}
resolvePublicReferences(schema);
const names = Object.keys(schema.$defs);
const banner = '/* Generated from contracts.schema.json. Do not edit; run npm run contracts:generate. */';
const types = await compile(schema, 'PublicContracts', { bannerComment: banner, additionalProperties: false, enableConstEnums: false, format: true, style: { singleQuote: true, semi: true, printWidth: 120 }, unknownAny: true, ignoreMinAndMaxItems: true });
const mapping = `\nexport interface ContractTypes {\n${names.map(n => `  ${n}: ${n};`).join('\n')}\n}\nexport type ContractName = keyof ContractTypes;\n`;
const ajv = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, removeAdditional: false, useDefaults: false, code: { source: true, esm: true, lines: true } });
ajv.addSchema(schema);
let compiled = standalone(ajv, Object.fromEntries(names.map(n => ['validate' + n, schema.$id + '#/$defs/' + n])));
const runtimeImports = [];
compiled = compiled.replace(/require\("([^"]+)"\)\.default/g, (_match, moduleName) => {
  const binding = 'ajvRuntime' + runtimeImports.length;
  runtimeImports.push(`import ${binding} from '${moduleName}.js';`);
  return `(typeof ${binding} === 'function' ? ${binding} : ${binding}.default)`;
});
compiled = banner + '\n' + runtimeImports.join('\n') + '\n' + compiled.trimEnd() + '\n';
const declarations = banner + "\nimport type { ValidateFunction } from 'ajv';\nimport type { ContractTypes } from './contracts.ts';\n" + names.map(n => `export const validate${n}: ValidateFunction<ContractTypes['${n}']>;`).join('\n') + '\n';
const validation = `${banner}\nimport * as compiled from './validators.mjs';\nimport type { ValidateFunction } from 'ajv';\nimport type { ContractName, ContractTypes } from './contracts.ts';\nconst validators: { [N in ContractName]: ValidateFunction<ContractTypes[N]> } = {\n${names.map(n => `  ${n}: compiled.validate${n},`).join('\n')}\n};\nexport function contractValidator<N extends ContractName>(name: N): ValidateFunction<ContractTypes[N]> {\n  return validators[name];\n}\nexport function validateContract<N extends ContractName>(name: N, value: unknown): value is ContractTypes[N] {\n  return contractValidator(name)(value);\n}\nexport function assertContract<N extends ContractName>(name: N, value: unknown): asserts value is ContractTypes[N] {\n  if (!validateContract(name, value)) throw new TypeError('Invalid ' + name);\n}\n${names.map(n => `export const validate${n} = contractValidator('${n}');`).join('\n')}\n`;
// Paths are an inventory; DTO bodies always reference the same canonical schema.
const routes = [
  ['get','/api/dev/scenarios',null,'DevScenariosView'],
  ['get','/api/session',null,'SessionView'], ['post','/api/session/control','CommandEnvelope','SessionView'], ['post','/api/session/notes','CommandEnvelope','NotesView'], ['post','/api/sessions','NewSessionRequest','SessionView'],
  ['post','/api/session/actions','ActionsRequest','SessionView'], ['post','/api/session/prepare','PrepareRequest','PrepareView'],
  ['post','/api/session/advance','AdvanceRequest','SessionView'], ['post','/api/session/next-hand','NextHandRequest','SessionView'],
  ['post','/api/session/advice','AdviceRequest','AdviceView'], ['post','/api/session/exposures','ExposureRequest','AcceptedView'],
  ['put','/api/preferences','PreferencesRequest','SessionView'], ['get','/api/coaching/access',null,'CoachAccess'],
  ['post','/api/coaching/hand-unlocks','HandUnlockRequest','HandUnlockView'], ['get','/api/session/recap',null,'RecapView'],
  ['get','/api/session/reviews',null,'ReviewIndex'], ['get','/api/session/reviews/{decisionId}',null,'ReviewView'],
  ['post','/api/session/reviews/{decisionId}/trials','TrialRequest','ReviewTrial'],
  ['post','/api/subscription/preview','BillingPreviewRequest','BillingPreview'], ['post','/api/subscription/change','BillingConfirmRequest','BillingOperation'], ['get','/api/family',null,'FamilyView'], ['post','/api/family','FamilyCommand','FamilyView'], ['get','/api/account/export',null,'ExportView'], ['post','/api/account/delete','AccountDeleteRequest','AccountDeleteView'], ['get','/api/account',null,'AccountView'], ['post','/api/account','AccountCommand','AccountView'],
];
const openapi = { openapi: '3.1.0', info: { title: 'CardFord local V1', version: '1.0.0' }, paths: {}, components: { schemas: Object.fromEntries(names.map(n => [n, { $ref: schemaLocations.get(n) ?? `./contracts.schema.json#/$defs/${n}` }])) } };
for (const [method,path,input,output] of routes) {
  const operation = { responses: { '200': { description: 'Validated public view', content: { 'application/json': { schema: { $ref: `#/components/schemas/${output}` } } } }, default: { description: 'Safe typed error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } } } };
  if (input) operation.requestBody = { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${input}` } } } };
  if (path.includes('{decisionId}')) operation.parameters = [{ name: 'decisionId', in: 'path', required: true, schema: { type: 'string', minLength: 1, maxLength: 256 } }];
  if (method === 'post' && path.startsWith('/api/session')) {
    operation.parameters ??= [];
    operation.parameters.push({ name: 'x-tricks-tab', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 256 } });
  }
  openapi.paths[path] ??= {};
  openapi.paths[path][method] = operation;
}
const files = { 'validators.mjs': compiled, 'validators.d.mts': declarations, 'contracts.ts': types + mapping, 'validation.ts': validation, 'openapi.json': JSON.stringify(openapi,null,2)+'\n' };
let stale = false;
for (const [name,content] of Object.entries(files)) {
  const target = resolve(base,name);
  if (process.argv.includes('--check')) {
    const actual = await readFile(target,'utf8').catch(() => '');
    if (actual !== content) { console.error('Generated contract differs: ' + name); stale = true; }
  } else await writeFile(target,content);
}
if (stale) process.exitCode = 1;
else console.log(process.argv.includes('--check') ? 'Contract artifacts are current.' : 'Generated contracts, validators and OpenAPI.');
