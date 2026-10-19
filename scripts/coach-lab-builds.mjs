// LAB-01/03: retain the exact worker and source bytes needed after a rule change.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, posix, resolve } from 'node:path';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const sourceDigest = hashes => sha(JSON.stringify(Object.entries(hashes).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
function description(home, sourceHashes, pins) {
  for (const hash of [pins.sourceDigest, pins.binaryDigest]) assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(sourceDigest(sourceHashes), pins.sourceDigest, 'Build source graph mismatch');
  const files = Object.keys(sourceHashes).sort();
  assert.ok(files.length, 'Build source graph required');
  for (const file of files) {
    assert.ok(file && file !== '.' && !isAbsolute(file) && !file.includes('\\') && !file.includes(':') && file !== '..' && !file.startsWith('../') && posix.normalize(file) === file, 'Unsafe build source path');
    assert.match(sourceHashes[file], /^[a-f0-9]{64}$/);
  }
  const directory = resolve(home, 'builds', pins.sourceDigest, pins.binaryDigest);
  const metadata = { schemaVersion: 'coach-lab-build-1.0.0', ...pins, sourceFiles: files };
  return { directory, sourceRoot: resolve(directory, 'source'), binaryPath: resolve(directory, process.platform === 'win32' ? 'worker.exe' : 'worker'), metadata, files };
}
function writeOnce(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) assert.ok(readFileSync(path).equals(Buffer.from(bytes)), 'Frozen build bytes changed');
  else writeFileSync(path, bytes, { flag: 'wx' });
}
export function preserveBuild(home, repository, sourceHashes, pins, worker) {
  const bundle = description(home, sourceHashes, pins);
  for (const file of bundle.files) {
    const bytes = readFileSync(resolve(repository, file));
    assert.equal(sha(bytes), sourceHashes[file], `Source changed before preservation: ${file}`);
    writeOnce(resolve(bundle.sourceRoot, file), bytes);
  }
  const bytes = readFileSync(worker);
  assert.equal(sha(bytes), pins.binaryDigest, 'Worker changed before preservation');
  writeOnce(bundle.binaryPath, bytes);
  // Publish the complete marker last. Partial bundles are never runnable.
  writeOnce(resolve(bundle.directory, 'build.json'), JSON.stringify(bundle.metadata, null, 2) + '\n');
  return resolveBuild(home, sourceHashes, pins);
}
export function resolveBuild(home, sourceHashes, pins) {
  const bundle = description(home, sourceHashes, pins);
  const marker = resolve(bundle.directory, 'build.json');
  assert.ok(existsSync(marker), 'Frozen build is missing. Create a new run; preserve the old archive.');
  assert.equal(readFileSync(marker, 'utf8'), JSON.stringify(bundle.metadata, null, 2) + '\n', 'Frozen build metadata mismatch');
  for (const file of bundle.files) assert.equal(sha(readFileSync(resolve(bundle.sourceRoot, file))), sourceHashes[file], `Frozen source changed: ${file}`);
  assert.equal(sha(readFileSync(bundle.binaryPath)), pins.binaryDigest, 'Frozen worker changed');
  return { sourceRoot: bundle.sourceRoot, binaryPath: bundle.binaryPath, directory: bundle.directory };
}
