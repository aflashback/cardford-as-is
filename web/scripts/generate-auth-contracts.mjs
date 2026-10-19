import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { compile } = require('json-schema-to-typescript');
const { Ajv2020 } = require('ajv/dist/2020.js');
const standalone = require('ajv/dist/standalone/index.js').default;
const base = resolve(dirname(fileURLToPath(import.meta.url)), '../shared');
const schema = JSON.parse(await readFile(resolve(base, 'auth.schema.json'), 'utf8'));
const banner = '/* Generated from auth.schema.json. Do not edit; run npm run contracts:auth:generate. */';
const types = await compile(schema, 'AuthStatusView', {
  bannerComment: banner, additionalProperties: false, enableConstEnums: false, unknownAny: true,
  style: { singleQuote: true, semi: true, printWidth: 120 },
});
const ajv = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, removeAdditional: false,
  useDefaults: false, code: { source: true, esm: true, lines: true } });
const validate = ajv.compile(schema);
const imports = [];
let runtime = standalone(ajv, validate).replace(/require\("([^"]+)"\)\.default/g, (_match, moduleName) => {
  const name = `ajvRuntime${imports.length}`;
  imports.push(`import ${name} from '${moduleName}.js';`);
  return `(typeof ${name} === 'function' ? ${name} : ${name}.default)`;
});
runtime = banner + '\n' + imports.join('\n') + '\n' + runtime.trimEnd() + '\n';
const outputs = new Map([
  ['auth.contracts.ts', types],
  ['auth.validators.mjs', runtime],
  ['auth.validators.d.mts', `${banner}\nimport type { ValidateFunction } from 'ajv';\nimport type { AuthStatusView } from './auth.contracts.ts';\nexport const validate: ValidateFunction<AuthStatusView>;\nexport default validate;\n`],
  ['auth.validation.ts', `${banner}\nimport validate from './auth.validators.mjs';\nimport type { AuthStatusView } from './auth.contracts.ts';\nexport function validateAuthStatus(value: unknown): value is AuthStatusView {\n  return validate(value);\n}\n`],
]);
const check = process.argv.includes('--check');
for (const [name, content] of outputs) {
  const path = resolve(base, name);
  if (check) {
    if (await readFile(path, 'utf8') !== content) throw new Error(`Stale authentication contract: ${name}`);
  } else {
    await writeFile(path, content);
  }
}
console.log(check ? 'Authentication contracts are current.' : 'Authentication contracts generated.');
