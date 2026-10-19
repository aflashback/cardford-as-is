// TSC-07/11: immutable artifacts and a durable, single-writer journal.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const jsonBytes = value => Buffer.from(JSON.stringify(value) + '\n');
export function safePath(root, name = '') {
  assert.equal(typeof name, 'string');
  assert.ok(!isAbsolute(name) && !name.includes('\\') && !name.includes(':') && !name.split('/').includes('..'), 'Unsafe artifact path');
  const base = resolve(root), target = resolve(base, name), rel = relative(base, target);
  assert.ok(rel === '' || !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel), 'Artifact escaped run root');
  let current = target;
  for (;;) {
    if (existsSync(current)) assert.ok(!lstatSync(current).isSymbolicLink(), 'Symlink artifact path rejected');
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return target;
}
export function writeImmutable(path, bytes) {
  const value = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    assert.ok(readFileSync(path).equals(value), 'Immutable artifact changed');
    return;
  }
  const fd = openSync(path, 'wx');
  try { writeFileSync(fd, value); fsyncSync(fd); } finally { closeSync(fd); }
}
export function putBlob(root, value) {
  const bytes = Buffer.isBuffer(value) ? value : jsonBytes(value);
  const digest = sha(bytes), path = `blobs/${digest}`;
  writeImmutable(safePath(root, path), bytes);
  return { path, sha256: digest };
}
export function getBlob(root, ref, json = true) {
  assert.deepEqual(Object.keys(ref).sort(), ['path', 'sha256']);
  assert.match(ref.sha256, /^[a-f0-9]{64}$/);
  assert.equal(ref.path, `blobs/${ref.sha256}`);
  const bytes = readFileSync(safePath(root, ref.path));
  assert.equal(sha(bytes), ref.sha256, 'Blob digest mismatch');
  return json ? JSON.parse(bytes.toString('utf8')) : bytes;
}
export function readJournal(root) {
  const path = safePath(root, 'private/journal.jsonl');
  if (!existsSync(path)) return [];
  const bytes = readFileSync(path, 'utf8');
  assert.ok(bytes === '' || bytes.endsWith('\n'), 'Torn journal tail; preserve evidence and stop');
  let prior = '0'.repeat(64);
  return bytes.split('\n').filter(Boolean).map((line, index) => {
    const row = JSON.parse(line);
    assert.deepEqual(Object.keys(row).sort(), ['at', 'data', 'hash', 'kind', 'previousHash', 'sequence']);
    assert.equal(row.sequence, index + 1); assert.equal(row.previousHash, prior);
    const { hash, ...body } = row;
    assert.equal(hash, sha(jsonBytes(body)), 'Journal hash mismatch');
    prior = hash; return row;
  });
}
export function appendEvent(root, kind, data) {
  assert.match(kind, /^[a-z][a-z-]+$/);
  const rows = readJournal(root);
  const body = { sequence: rows.length + 1, previousHash: rows.at(-1)?.hash ?? '0'.repeat(64), at: new Date().toISOString(), kind, data };
  const row = { ...body, hash: sha(jsonBytes(body)) };
  const path = safePath(root, 'private/journal.jsonl'); mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, 'a');
  try {
    const bytes = jsonBytes(row); let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
  } finally { closeSync(fd); }
  return row;
}
export function withRunLock(root, work) {
  safePath(root); mkdirSync(root, { recursive: true });
  const path = safePath(root, 'private/owner.lock'); mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    const lock = JSON.parse(readFileSync(path, 'utf8'));
    assert.ok(Number.isInteger(lock.pid) && lock.pid > 0, 'Invalid run lock');
    let alive = true;
    try { process.kill(lock.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    assert.ok(!alive, 'Run already owned; do not start a second worker');
    // Only a positively dead process's lock may be removed. Journal remains intact.
    unlinkSync(path);
  }
  const fd = openSync(path, 'wx');
  try {
    writeFileSync(fd, jsonBytes({ pid: process.pid, createdAt: new Date().toISOString() })); fsyncSync(fd);
    const result = work();
    assert.ok(!result || typeof result.then !== 'function', 'Run lock callback must be synchronous');
    return result;
  } finally { closeSync(fd); unlinkSync(path); }
}

// A separate lock serializes selection and publication across repeated runs.
export function withCorpusLock(home, corpusId, work) {
  assert.ok(typeof corpusId === 'string' && corpusId.trim().length > 0);
  return withRunLock(safePath(home, `corpus-locks/${sha(corpusId)}`), work);
}
