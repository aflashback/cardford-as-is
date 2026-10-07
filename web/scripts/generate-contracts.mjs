import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(process.env.CONTRACT_DEPENDENCY_ROOT ? resolve(process.env.CONTRACT_DEPENDENCY_ROOT, 'package.json') : import.meta.url);
const { compile } = require('json-schema-to-typescript');
const { Ajv2020 } = require('ajv/dist/2020.js');
const standalone = require('ajv/dist/standalone/index.js').default;
const base = resolve(dirname(fileURLToPath(import.meta.url)), '../shared');
// Preserve the frozen original client artifacts. The second generated bundle
// combines their schemas with registered service fragments without introducing
// another editable definition tree.
for (const includePlatform of [false, true]) {
const schema = JSON.parse(await readFile(resolve(base, 'contracts.schema.json'), 'utf8'));
// Only these public fragments may enter the active bundle. Private schemas and
// arbitrary filesystem/network references are never resolved by the compiler.
const publicFragments = ['hearts', 'spades'];
const publicPlatformFragments = ['local-service', 'platform-service', 'platform-account', 'platform-review'];
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
for (const name of includePlatform ? publicPlatformFragments : []) {
  const path = `./${name}.schema.json`;
  const fragment = JSON.parse(await readFile(resolve(base, path), 'utf8'));
  for (const [name, definition] of Object.entries(fragment.$defs)) {
    if (Object.hasOwn(schema.$defs, name)) throw new Error(`Duplicate public definition: ${name}`);
    schema.$defs[name] = definition;
    schema.anyOf.push({ $ref: `#/$defs/${name}` });
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
  ['get','/api/identity',null,'IdentityView'],
  ['get','/api/commands/{commandId}',null,'CommandStatusView'],
  ['get','/api/review-trials/{commandId}',null,'ReviewTrial'],
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
  if (path.includes('{commandId}')) operation.parameters = [{ name: 'commandId', in: 'path', required: true, schema: { type: 'string', minLength: 1, maxLength: 256 } }];
  if (method === 'post' && path.startsWith('/api/session')) {
    operation.parameters ??= [];
    operation.parameters.push({ name: 'x-tricks-tab', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 256 } });
  }
  openapi.paths[path] ??= {};
  openapi.paths[path][method] = operation;
}
// M04C is a separate local listener; these routes do not change the V1 client
// contract or claim that its eventual platform UI envelope is implemented.
const localServiceRoutes = [
  ['get','/api/platform/session',null,'PlatformSessionView'],
  ['post','/api/platform/commands/reconcile','PlatformReconcileRequest','PlatformReconcileView'],
  ['get','/api/preferences',null,'PlatformPreferencesView'],
  ['post','/api/preferences','PlatformPreferencesRequest','PlatformPreferencesView'],
  ['get','/api/account',null,'PlatformAccountView'],
  ['get','/api/account/export',null,'PlatformExportView'],
  ['post','/api/platform/account/delete','AccountDeleteRequest','AccountDeleteView'],
  ['post','/api/subscription/preview','BillingPreviewRequest','BillingPreview'],
  ['post','/api/subscription/change','BillingConfirmRequest','BillingOperation'],
  ['get','/api/family',null,'FamilyView'],
  ['post','/api/family','PlatformFamilyCommand','FamilyView'],
  ['post','/api/platform/advice','PlatformAdviceRequest','PlatformAdviceView'],
  ['post','/api/platform/notes','PlatformNotesRequest','NotesView'],
  ['post','/api/platform/exposures','PlatformReviewExposureRequest','AcceptedView'],
  ['get','/api/platform/reviews',null,'ReviewIndex'],
  ['get','/api/platform/reviews/{decisionId}',null,'ReviewView'],
  ['get','/api/platform/reviews/{decisionId}/access',null,'PlatformReviewAccessView'],
  ['get','/api/platform/reviews/{decisionId}/advice',null,'PlatformAdviceView'],
  ['post','/api/platform/reviews/{decisionId}/trials','PlatformReviewTrialRequest','PlatformReviewStatus'],
  ['get','/api/platform/review-trials/{id}',null,'PlatformReviewStatus'],
  ['post','/api/demo/frame','DemoFrameRequest','DemoFrame'],
  ['get','/api/access/offers',null,'AccessOfferPolicy'],
  ['post','/api/access/resolve','LocalServiceAccessRequest','AccessDecision'],
  ['post','/api/access/trials','LocalServiceTrialRequest','LocalServiceTrialReceipt'],
  ['post','/api/access/unlocks','LocalServiceUnlockRequest','LocalServiceUnlockReceipt'],
  ['get','/api/health',null,'LocalServiceHealthView'],
  ['post','/api/local/session','LocalServiceEmptyRequest','IdentityView'],
  ['get','/api/identity',null,'IdentityView'],
  ['get','/api/session',null,'LocalServiceSessionView'],
  ['get','/api/sessions/{id}',null,'LocalServiceSessionView'],
  ['post','/api/sessions','LocalServiceNewSessionRequest','LocalServiceCommandReceipt'],
  ['post','/api/session/control','LocalServiceControlRequest','LocalControlView'],
  ['post','/api/session/actions','LocalServiceActionRequest','LocalServiceCommandReceipt'],
  ['post','/api/session/prepare','LocalServicePrepareRequest','LocalServicePrepareView'],
  ['post','/api/session/advance','LocalServiceAdvanceRequest','LocalServiceCommandReceipt'],
  ['post','/api/session/next-hand','LocalServiceNextHandRequest','LocalServiceCommandReceipt'],
  ['get','/api/work/{id}',null,'LocalServicePrepareView'],
  ['post','/api/work/{id}/retry','LocalServiceWorkRetryRequest','LocalServicePrepareView'],
  ['get','/api/decisions/{id}',null,'LocalServiceDecisionView'],
  ['post','/api/commands/reconcile','LocalServiceReconcileRequest','LocalServiceRecoveredReceipt'],
  ['post','/api/logout','LocalServiceEmptyRequest','AcceptedView'],
  ['post','/api/account/delete','LocalServiceEmptyRequest','AccountDeleteView'],
];
const localOpenapi = { openapi: '3.1.0', info: { title: 'CardFord M04C local fixture service', version: '1.0.0' }, paths: {}, components: { ...openapi.components, securitySchemes: { localSession: { type: 'apiKey', in: 'cookie', name: 'cf_local_session' } } } };
for (const [method,path,input,output] of localServiceRoutes) {
  const content = { 'application/json': { schema: { $ref: `#/components/schemas/${output}` } } };
  const operation = { responses: { '200': { description: 'Validated local service result', content }, default: { description: 'Safe typed error; reconcile an ambiguous command before retrying', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } } }, parameters: [] };
  if (output === 'LocalServicePrepareView') operation.responses['202'] = { description: 'Durable preparation pending; poll the listed work identities', content };
  if (input) operation.requestBody = { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${input}` } } } };
  if (path !== '/api/health' && path !== '/api/demo/frame') operation.parameters.push({ name: 'x-tricks-tab', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 80 } });
  if (method === 'post') operation.parameters.push({ name: 'x-tricks-client', in: 'header', required: true, schema: { const: '1' } });
  if (path.includes('{id}')) operation.parameters.push({ name: 'id', in: 'path', required: true, schema: { type: 'string', minLength: 1, maxLength: 256 } });
  if (path.includes('{decisionId}')) operation.parameters.push({ name: 'decisionId', in: 'path', required: true, schema: { type: 'string', minLength: 1, maxLength: 256 } });
  if (path !== '/api/health' && path !== '/api/local/session' && path !== '/api/demo/frame') operation.security = [{ localSession: [] }];
  localOpenapi.paths[path] ??= {};
  localOpenapi.paths[path][method] = operation;
}
const files = includePlatform ? {
  'local-service.validators.mjs': compiled,
  'local-service.validators.d.mts': declarations.replaceAll('./contracts.ts', './local-service.contracts.ts'),
  'local-service.contracts.ts': types + mapping,
  'local-service.validation.ts': validation.replaceAll('./validators.mjs', './local-service.validators.mjs').replaceAll('./contracts.ts', './local-service.contracts.ts'),
  'local-service.openapi.json': JSON.stringify(localOpenapi,null,2)+'\n',
} : { 'validators.mjs': compiled, 'validators.d.mts': declarations, 'contracts.ts': types + mapping, 'validation.ts': validation, 'openapi.json': JSON.stringify(openapi,null,2)+'\n' };
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
}
