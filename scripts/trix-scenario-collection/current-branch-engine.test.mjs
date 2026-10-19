import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { buildCurrentBranchEngine, readRepositoryMetadata } from './current-branch-engine.mjs';
import { Collector, initializeRun, repository } from './runner.mjs';

const missingGit = () => ({ error: { code: 'ENOENT' }, status: null, stdout: '' });
const noCommit = (_file, args) => ({ status: args.includes('rev-parse') ? 128 : 0, stdout: '' });

test('Git absence or a repository without a commit produces an optional empty SHA', () => {
  assert.deepEqual(readRepositoryMetadata(repository, { git: missingGit }), { repositoryPath: resolve(repository), commitSha: '', dirty: null, gitAvailable: false });
  assert.deepEqual(readRepositoryMetadata(repository, { git: noCommit }), { repositoryPath: resolve(repository), commitSha: '', dirty: false, gitAvailable: true });
  const git = (_file, args) => ({ status: 0, stdout: args.includes('rev-parse') ? 'a'.repeat(40) + '\n' : ' M server/current.go\n' });
  assert.equal(readRepositoryMetadata(repository, { git }).dirty, true);
  assert.equal(readRepositoryMetadata(repository, { git }).commitSha, 'a'.repeat(40));
});

test('current engine builds the actual working tree and Collector bypasses missing archives without rewriting the manifest', async t => {
  const home = mkdtempSync(resolve(tmpdir(), 'trix-current-engine-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const executablePath = resolve(home, 'runtime', 'trixcollection.exe');
  const calls = [];
  const engine = await buildCurrentBranchEngine({ repositoryPath: repository, executablePath, milliseconds: 1000 }, {
    git: missingGit,
    run: async (executable, args, options) => {
      calls.push({ executable, args, options });
      writeFileSync(args[args.indexOf('-o') + 1], 'synthetic-test-binary');
      return { status: 'passed', elapsedMs: 1 };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.cwd, resolve(repository));
  assert.equal(calls[0].options.milliseconds, 1000);
  assert.deepEqual(calls[0].args, ['build', '-buildvcs=false', '-o', executablePath, './server/cmd/trixcollection']);
  assert.equal(engine.commitSha, '');
  assert.equal(engine.sourceRoot, resolve(repository));
  assert.match(engine.executableSha256, /^[a-f0-9]{64}$/);
  assert.equal(engine.sourceHashes, undefined);
  const plan = JSON.parse(readFileSync(resolve(repository, 'planning/implementation/coach-lab/trix-scenario-collection/campaign.plan.json')));
  const { root } = initializeRun({ runId: 'current-engine-fixture', plan, home, fixture: true, archive: false, seed: 'test' });
  const manifestPath = resolve(root, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath));
  manifest.mode = 'live';
  manifest.build = { sourceDigest: 'missing-archive', binaryDigest: 'missing-binary' };
  writeFileSync(manifestPath, JSON.stringify(manifest) + '\n');
  const before = readFileSync(manifestPath);
  const collector = new Collector(root, { currentBranchEngine: engine });
  assert.equal(collector.sourceRoot, resolve(repository));
  assert.equal(collector.templateRoot, resolve(repository, 'planning/implementation/coach-lab/trix-scenario-collection/prompts'));
  assert.deepEqual(collector.currentBranchEngine, engine);
  assert.deepEqual(readFileSync(manifestPath), before);
  writeFileSync(executablePath, 'changed');
  assert.throws(() => new Collector(root, { currentBranchEngine: engine }), /Current engine executable changed/);
});
