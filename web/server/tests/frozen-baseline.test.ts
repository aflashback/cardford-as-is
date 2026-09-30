import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chooseBaselineAction, BASELINE_POLICY_VERSION } from '../strategy/baseline.ts';
import {
  analyzeFrozenSpades,
  FROZEN_SPADES_POLICY_VERSION,
} from '../games/spades/reasoning/frozen/spades-tactics-2.1.0/index.ts';
import {
  buildGoldenCorpus,
  normalizedSha256,
  type GoldenCorpus,
} from '../games/spades/reasoning/frozen/golden.ts';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const frozen = fileURLToPath(new URL('../games/spades/reasoning/frozen/', import.meta.url));
const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
type Manifest = {
  policyVersion: string;
  sourceCommit: string;
  files: { snapshot: string; source: string; sourceSha256: string; snapshotSha256: string }[];
  golden: { file: string; sha256: string };
  benchmark: { policyVersion: string; source: string; sourceSha256: string; golden: string; goldenSha256: string };
};
const manifest = json<Manifest>(`${frozen}spades-tactics-2.1.0/manifest.json`);

test('SG-01: frozen Spades snapshot files match their pinned hashes', () => {
  assert.equal(manifest.policyVersion, FROZEN_SPADES_POLICY_VERSION);
  assert.equal(manifest.files.length, 8);
  for (const file of manifest.files)
    assert.equal(
      normalizedSha256(`${frozen}spades-tactics-2.1.0/${file.snapshot}`),
      file.snapshotSha256,
      `Frozen snapshot changed: ${file.snapshot}`,
    );
  assert.equal(normalizedSha256(`${frozen}spades-tactics-2.1.0/golden.json`), manifest.golden.sha256);
});

test('SG-01: frozen Spades snapshot reproduces every golden decision recorded from the live 2.1.0 pack', () => {
  const golden = json<GoldenCorpus>(`${frozen}spades-tactics-2.1.0/golden.json`);
  assert.equal(golden.policyVersion, FROZEN_SPADES_POLICY_VERSION);
  assert.equal(golden.sourceCommit, manifest.sourceCommit);
  const replayed = buildGoldenCorpus(
    FROZEN_SPADES_POLICY_VERSION,
    golden.sourceCommit,
    (observation) => analyzeFrozenSpades(observation).action,
  );
  assert.equal(replayed.hands.length, 48);
  assert.ok(replayed.hands.every((hand) => hand.decisions === 56));
  assert.deepEqual(replayed.samples, golden.samples);
  assert.deepEqual(replayed.hands, golden.hands);
});

test('SG-01: frozen Spades baseline rejects a non-Spades observation', () => {
  assert.throws(() =>
    analyzeFrozenSpades({ mode: 'hearts' } as unknown as Parameters<typeof analyzeFrozenSpades>[0]),
  );
});

test('SG-01: the local benchmark policy source and behavior are pinned', () => {
  assert.equal(manifest.benchmark.policyVersion, BASELINE_POLICY_VERSION);
  assert.equal(
    normalizedSha256(`${repo}${manifest.benchmark.source}`),
    manifest.benchmark.sourceSha256,
    'local-baseline-1.0.0 is a frozen benchmark; add a new policy instead of editing it.',
  );
  const golden = json<GoldenCorpus>(`${frozen}local-baseline-1.0.0.golden.json`);
  assert.equal(normalizedSha256(`${frozen}local-baseline-1.0.0.golden.json`), manifest.benchmark.goldenSha256);
  const replayed = buildGoldenCorpus(BASELINE_POLICY_VERSION, golden.sourceCommit, chooseBaselineAction);
  assert.deepEqual(replayed.hands, golden.hands);
});
