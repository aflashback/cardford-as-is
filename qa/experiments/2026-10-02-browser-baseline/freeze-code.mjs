import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = fileURLToPath(new URL('./', import.meta.url));
const files = {};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function visit(path) {
  for (const item of readdirSync(root + path, { withFileTypes: true })) {
    const next = `${path}/${item.name}`;
    if (item.isDirectory()) visit(next);
    else if (/\.(ts|tsx|js|mjs|json|css|html)$/.test(item.name)) files[next] = hash(readFileSync(root + next));
  }
}
for (const path of ['web/server', 'web/src', 'web/shared', 'web/dist']) visit(path);
for (const name of ['manifest.json', 'dev-deals.json', 'run-browser.mjs', 'transport.mjs', 'verify-hand.mjs', 'templates/player.md', 'templates/observer.md', 'templates/spades-rules.md']) files[`qa/experiments/2026-10-02-browser-baseline/${name}`] = hash(readFileSync(directory + name));
const value = { schemaVersion: 'browser-code-snapshot-1.0.0', parentCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(), node: process.version, files };
const target = directory + 'code-snapshot.json';
if (existsSync(target)) {
  const saved = JSON.parse(readFileSync(target, 'utf8'));
  const expected = { ...saved.files };
  for (const name of readdirSync(directory + 'provenance').filter(name => /^recorder-amendment-\d+\.json$/.test(name)).sort()) {
    const amendmentPath = directory + 'provenance/' + name;
    const amendment = JSON.parse(readFileSync(amendmentPath, 'utf8'));
    assert.equal(amendment.path, 'qa/experiments/2026-10-02-browser-baseline/run-browser.mjs');
    assert.equal(amendment.before, expected[amendment.path]);
    assert.equal(hash(readFileSync(directory + amendment.preservedOriginal)), amendment.before);
    expected[amendment.path] = amendment.after;
  }
  assert.deepEqual(value.files, expected, 'Measured code or input changed outside the recorded recorder amendment');
  console.log(`Verified ${Object.keys(files).length} source/build/input hashes`);
} else {
  writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
  console.log(`Frozen ${Object.keys(files).length} source/build/input hashes`);
}
