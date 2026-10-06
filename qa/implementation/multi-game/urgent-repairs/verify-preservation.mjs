import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

// Run from the repository root. No credentials, database or network access.
const base = '5ddebc5d9b113cb381c16d7f7c406ab732db8d08';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const prior = JSON.parse(await readFile('qa/implementation/multi-game/m02/preservation.json', 'utf8'));
const immutablePaths = [
  'web/server/records/migrations', 'web/server/game', 'web/server/games',
  'qa/experiments', 'qa/implementation/multi-game/m02',
  'qa/implementation/multi-game/system-review',
  'qa/implementation/multi-game/system-review-2026-10-05.md',
  'web/src/styles', 'web/public', 'package.json', 'web/package.json',
];
const tree = new Map(git('ls-tree', '-r', '-z', base).toString().split('\0').filter(Boolean).map((entry) => {
  const match = /^\d+ blob ([a-f0-9]+)\t(.+)$/s.exec(entry);
  assert.ok(match, 'Expected a regular tracked file.');
  return [match[2], match[1]];
}));
const listed = [...tree.keys()].filter((file) => immutablePaths.some((path) => file === path || file.startsWith(`${path}/`)));
const preserved = [];
for (const file of [...new Set([...prior.preserved.map((item) => item.file), ...listed])].sort()) {
  const bytes = await readFile(file);
  const originalBlob = tree.get(file);
  assert.ok(originalBlob, `Missing original file: ${file}`);
  const currentBlob = createHash(originalBlob.length === 40 ? 'sha1' : 'sha256')
    .update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(currentBlob, originalBlob, `Original artifact changed: ${file}`);
  preserved.push({ file, sha256: sha(bytes), gitBlob: originalBlob });
}
const schemaFile = 'web/shared/contracts.schema.json';
const original = JSON.parse(git('show', `${base}:${schemaFile}`).toString());
const current = JSON.parse(await readFile(schemaFile, 'utf8'));
for (const [name, definition] of Object.entries(original.$defs)) {
  assert.deepEqual(current.$defs[name], definition, `Original public definition changed: ${name}`);
}
const report = {
  baseHead: base, command: 'node qa/implementation/multi-game/urgent-repairs/verify-preservation.mjs',
  passed: true, fileCount: preserved.length, preserved,
  publicSchema: {
    unchangedDefinitions: Object.keys(original.$defs).length,
    addedDefinitions: Object.keys(current.$defs).filter((name) => !(name in original.$defs)),
  },
  limitations: ['Only listed original files and public definitions are asserted; new code has separate regression evidence.'],
};
await writeFile('qa/implementation/multi-game/urgent-repairs/preservation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, fileCount: report.fileCount, publicSchema: report.publicSchema }));
