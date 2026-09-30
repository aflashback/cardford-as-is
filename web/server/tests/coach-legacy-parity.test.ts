import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createGame, fullDeck } from '../game/index.ts';
import { observe } from '../observations/index.ts';
import { explain } from '../coaching/templates.ts';
import { getCuePack, listCuePacks, resolveCuePack } from '../coaching/cue-registry.ts';
import { heartsLegacyCues } from '../games/hearts/coaching/cues-legacy.ts';
import { spadesLegacyCues } from '../games/spades/coaching/cues-legacy.ts';
import {
  LEGACY_CUE_FIRST_SEED,
  LEGACY_CUE_HANDS,
  buildLegacyCueCorpus,
  type LegacyCueCorpus,
} from '../games/spades/coaching/legacy-golden.ts';
import { analyzeDecision, getReasoningPack } from '../strategy/index.ts';

const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL('../games/spades/coaching/legacy-golden.json', import.meta.url)), 'utf8'),
) as LegacyCueCorpus;

let cached: LegacyCueCorpus | null = null;
const replay = (): LegacyCueCorpus =>
  (cached ??= buildLegacyCueCorpus(
    golden.recordedFrom,
    (mode) => getReasoningPack(mode).policyVersion,
    (observation) => getReasoningPack(observation.mode).analyze(observation),
    explain,
  ));

test('COACH-12: the recorded legacy cue corpus covers 24 hands per Spades mode and 8 Hearts hands', () => {
  assert.equal(golden.schemaVersion, '1.0.0');
  assert.deepEqual(golden.policyVersions, {
    'spades-solo': 'spades-tactics-2.1.0',
    'spades-partners': 'spades-tactics-2.1.0',
    hearts: 'hearts-baseline-1.0.0',
  });
  assert.deepEqual(
    LEGACY_CUE_HANDS.map((entry) => [entry.mode, entry.hands]),
    [
      ['spades-solo', 24],
      ['spades-partners', 24],
      ['hearts', 8],
    ],
  );
  assert.equal(golden.hands.length, 56);
  assert.equal(golden.hands[0].seed, LEGACY_CUE_FIRST_SEED);
  assert.equal(golden.samples.length, 3);
  assert.ok(golden.hands.every((hand) => /^[0-9a-f]{64}$/.test(hand.sha256) && hand.decisions > 50));
});

test('COACH-12: legacy cue packs reproduce every recorded advice object for the live default policies', () => {
  const replayed = replay();
  assert.deepEqual(replayed.policyVersions, golden.policyVersions);
  // Full samples first: a wording difference is then reported as text, not only as a hash.
  assert.deepEqual(replayed.samples, golden.samples);
  assert.deepEqual(replayed.hands, golden.hands);
});

test('COACH-12: legacy advice carries no cue version, outcome, explanation, considered choice or claim', () => {
  const added = ['cueVersion', 'outcome', 'explanation', 'consideredCards', 'consideredBids', 'claims'];
  for (const sample of replay().samples)
    for (const entry of sample.advice)
      for (const key of added)
        assert.equal(Object.hasOwn(entry.advice, key), false, `${sample.mode} advice gained ${key}`);
});

test('COACH-12: the cue registry dispatches by the policy version recorded in the analysis', () => {
  assert.equal(getCuePack('spades-tactics-2.1.0', 'spades-partners'), spadesLegacyCues);
  assert.equal(getCuePack('spades-tactics-2.0.0', 'spades-solo'), spadesLegacyCues);
  assert.equal(getCuePack('hearts-baseline-1.0.0', 'hearts'), heartsLegacyCues);
  assert.equal(spadesLegacyCues.cueVersion, 'spades-cues-1.0.0');
  assert.equal(heartsLegacyCues.cueVersion, 'hearts-cues-1.0.0');
  for (const version of ['spades-plan-3.0.0', 'spades-plan-3.1.0', 'spades-plan-3.2.0', 'spades-plan-3.3.0', 'spades-plan-3.4.0']) {
    const pack = getCuePack(version, 'spades-solo');
    assert.equal(pack.cueVersion, 'spades-cues-2.0.0');
    assert.equal(spadesLegacyCues.renders(version), false);
  }
  assert.equal(new Set(listCuePacks().map((pack) => pack.id)).size, listCuePacks().length);
  assert.throws(() => getCuePack('unknown-policy-9.9.9', 'spades-solo'), /No unique cue pack/);
});

test('COACH-12: an unnamed policy keeps legacy wording only for analyses saved before the plan layer', () => {
  assert.equal(
    resolveCuePack({ policyVersion: 'fixture-policy-0.0.1', schemaVersion: '1.0.0' }, 'spades-solo').pack,
    spadesLegacyCues,
  );
  assert.equal(
    resolveCuePack({ policyVersion: 'fixture-policy-0.0.1', schemaVersion: '1.0.0' }, 'hearts').pack,
    heartsLegacyCues,
  );
  assert.throws(
    () => resolveCuePack({ policyVersion: 'spades-plan-9.0.0', schemaVersion: '1.1.0' }, 'spades-solo'),
    /No cue pack renders policy/,
  );
});

test('COACH-12: plan-profile advice is rendered by cue version 2 and never by the legacy wording', () => {
  const state = createGame({ id: 'cue-dispatch', mode: 'spades-partners', dealer: 3 }, fullDeck());
  const observation = observe(state, 0);
  const legacy = explain(observation);
  assert.equal(legacy.policyVersion, 'spades-tactics-2.1.0');
  assert.equal(legacy.cueVersion, undefined);
  const planned = explain(observation, analyzeDecision(observation, 'spades-plan-3.0.0'));
  assert.equal(planned.policyVersion, 'spades-plan-3.0.0');
  assert.equal(planned.cueVersion, 'spades-cues-2.0.0');
  assert.notEqual(planned.notice, legacy.notice);
});
