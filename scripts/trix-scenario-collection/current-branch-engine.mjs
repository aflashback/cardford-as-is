// TSC-01/06: explicit owner-selected current working-tree engine; no source archive.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { runBoundedNative, MAX_TEST_RUN_MS } from '../bounded-native-run.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Git is informative metadata. An absent repository, unborn HEAD or absent Git
// does not prevent using the available game code in the selected directory.
export function readRepositoryMetadata(repositoryPath, { git = spawnSync } = {}) {
  const root = resolve(repositoryPath);
  const options = { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 1 << 20 };
  const head = git('git', ['rev-parse', '--verify', 'HEAD'], options);
  const status = git('git', ['status', '--porcelain', '--untracked-files=normal'], options);
  return {
    repositoryPath: root,
    commitSha: !head.error && head.status === 0 ? String(head.stdout ?? '').trim() : '',
    dirty: !status.error && status.status === 0 ? String(status.stdout ?? '').trim().length > 0 : null,
    gitAvailable: !head.error || !status.error,
  };
}

export function verifyCurrentBranchEngine(engine) {
  assert.equal(engine?.schemaVersion, 'trix-current-branch-engine-1.0.0');
  assert.ok(isAbsolute(engine.repositoryPath) && isAbsolute(engine.executablePath), 'Explicit absolute current engine paths required');
  assert.equal(engine.sourceRoot, resolve(engine.repositoryPath), 'Current engine source must be the selected repository');
  assert.equal(typeof engine.commitSha, 'string', 'Optional commit SHA must be a string');
  assert.match(engine.executableSha256, /^[a-f0-9]{64}$/);
  assert.equal(hash(readFileSync(engine.executablePath)), engine.executableSha256, 'Current engine executable changed');
  return engine;
}

// This builds in the actual current checkout, including its uncommitted edits.
// The caller owns the explicit runtime binary location and records the returned
// metadata in its run evidence. Neither the run manifest nor journal is touched.
export async function buildCurrentBranchEngine({ repositoryPath, executablePath, milliseconds = MAX_TEST_RUN_MS, goExecutable } = {}, { run = runBoundedNative, git = spawnSync } = {}) {
  assert.ok(typeof repositoryPath === 'string' && isAbsolute(repositoryPath), 'Explicit absolute repository path required');
  assert.ok(typeof executablePath === 'string' && isAbsolute(executablePath), 'Explicit absolute runtime executable path required');
  assert.ok(Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds <= MAX_TEST_RUN_MS, 'Build deadline must be positive and at most 30 minutes');
  const root = resolve(repositoryPath), output = resolve(executablePath);
  assert.ok(!existsSync(output), 'Choose a fresh runtime executable path');
  assert.ok(existsSync(resolve(root, 'server/cmd/trixcollection/main.go')), 'Current Trix collection command unavailable');
  const pins = JSON.parse(readFileSync(resolve(root, 'scripts/windows-tools.json'), 'utf8'));
  const tools = resolve(root, '.local/windows-tools');
  const go = goExecutable ?? resolve(tools, pins.go.executable);
  assert.ok(isAbsolute(go) && existsSync(go), 'Current native Go executable unavailable');
  const env = { ...process.env, GOTOOLCHAIN: 'local', GOCACHE: resolve(tools, 'gocache'), GOMODCACHE: resolve(tools, 'gomodcache'), GOOS: 'windows', GOARCH: 'amd64', GOFLAGS: '', CGO_ENABLED: '0' };
  mkdirSync(dirname(output), { recursive: true });
  const build = await run(go, ['build', '-buildvcs=false', '-o', output, './server/cmd/trixcollection'], { cwd: root, env, milliseconds });
  assert.equal(build.status, 'passed', `Current Trix engine build failed: ${build.error ?? build.output ?? build.status}`);
  const metadata = readRepositoryMetadata(root, { git });
  return verifyCurrentBranchEngine({
    schemaVersion: 'trix-current-branch-engine-1.0.0',
    ...metadata,
    sourceRoot: root,
    executablePath: output,
    executableSha256: hash(readFileSync(output)),
    build: { goExecutable: go, milliseconds, status: build.status, elapsedMs: build.elapsedMs },
  });
}
