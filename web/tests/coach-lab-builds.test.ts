import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { preserveBuild, resolveBuild, sourceDigest } from '../../scripts/coach-lab-builds.mjs';

test('frozen lab builds survive later working-source and common-worker changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coach-build-'));
  try {
    const source = join(dir, 'checkout'); mkdirSync(source);
    const worker = join(dir, 'current-worker');
    const sha = (value: string) => createHash('sha256').update(value).digest('hex');
    writeFileSync(join(source, 'policy.go'), 'original policy'); writeFileSync(worker, 'original worker');
    const hashes = { 'policy.go': sha('original policy') };
    const pins = { sourceDigest: sourceDigest(hashes), binaryDigest: sha('original worker') };
    const bundle = preserveBuild(dir, source, hashes, pins, worker);
    writeFileSync(join(source, 'policy.go'), 'later policy'); writeFileSync(worker, 'later worker');
    assert.deepEqual(resolveBuild(dir, hashes, pins), bundle);
    assert.equal(readFileSync(join(bundle.sourceRoot, 'policy.go'), 'utf8'), 'original policy');
    assert.equal(readFileSync(bundle.binaryPath, 'utf8'), 'original worker');
    writeFileSync(join(bundle.sourceRoot, 'policy.go'), 'tampered');
    assert.throws(() => resolveBuild(dir, hashes, pins), /frozen source changed/i);
    assert.throws(() => preserveBuild(dir, source, hashes, pins, worker), /source changed/i);
    const unsafe = { '../outside.go': sha('x') };
    assert.throws(() => resolveBuild(dir, unsafe, { ...pins, sourceDigest: sourceDigest(unsafe) }), /unsafe/i);
  } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('coach-build-'));
    rmSync(dir, { recursive: true, force: true });
  }
});
