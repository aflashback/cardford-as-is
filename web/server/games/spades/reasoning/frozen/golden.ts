import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionId, apply, collectTrick, createGame, fullDeck, type Card, type Seat } from '../../../../game/index.ts';
import type { GameAction } from '../../../../game/kernel/types.ts';
import { observe, type SeatObservation } from '../../../../observations/index.ts';

export type GoldenMode = 'spades-solo' | 'spades-partners';
export type GoldenHand = { mode: GoldenMode; seed: number; decisions: number; sha256: string };
export type GoldenCorpus = {
  schemaVersion: '1.0.0';
  policyVersion: string;
  sourceCommit: string;
  dealGenerator: 'lcg-1664525-mod';
  seeds: number[];
  hands: GoldenHand[];
  /** Complete action sequences for the first seed of each mode, for human diagnosis. */
  samples: { mode: GoldenMode; seed: number; actions: string[] }[];
};

export const GOLDEN_SEEDS: readonly number[] = Array.from({ length: 24 }, (_, index) => 610001 + index);

/** Historical generator, kept only so frozen evidence stays reproducible. */
export function historicalDeck(seed: number): Card[] {
  const deck = fullDeck();
  let value = seed >>> 0;
  for (let i = deck.length - 1; i > 0; i--) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    const j = value % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function playGoldenHand(
  mode: GoldenMode,
  seed: number,
  choose: (observation: SeatObservation) => GameAction,
): string[] {
  let state = createGame({ id: `golden-${seed}`, mode, dealer: (seed % 4) as Seat }, historicalDeck(seed));
  const actions: string[] = [];
  let guard = 0;
  while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
    if (++guard > 80) throw new Error(`Golden hand did not finish: ${mode}/${seed}`);
    if (state.phase === 'trick-end') {
      state = collectTrick(state);
      continue;
    }
    if (state.turn === null) throw new Error('Golden hand has no actor.');
    const selected = choose(observe(state, state.turn));
    if (selected.kind === 'pass') throw new Error('Spades has no pass.');
    actions.push(`${state.turn}:${actionId(selected)}`);
    state = apply(state, selected);
  }
  return actions;
}

export const sequenceHash = (actions: readonly string[]) =>
  createHash('sha256').update(actions.join('\n')).digest('hex');

export function buildGoldenCorpus(
  policyVersion: string,
  sourceCommit: string,
  choose: (observation: SeatObservation) => GameAction,
): GoldenCorpus {
  const hands: GoldenHand[] = [];
  const samples: GoldenCorpus['samples'] = [];
  for (const mode of ['spades-solo', 'spades-partners'] as const)
    for (const seed of GOLDEN_SEEDS) {
      const actions = playGoldenHand(mode, seed, choose);
      hands.push({ mode, seed, decisions: actions.length, sha256: sequenceHash(actions) });
      if (seed === GOLDEN_SEEDS[0]) samples.push({ mode, seed, actions });
    }
  return {
    schemaVersion: '1.0.0', policyVersion, sourceCommit,
    dealGenerator: 'lcg-1664525-mod', seeds: [...GOLDEN_SEEDS], hands, samples,
  };
}

export const normalizedSha256 = (path: string) =>
  createHash('sha256').update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).digest('hex');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [kind, output, commit] = process.argv.slice(2);
  if (!['live-spades', 'baseline'].includes(kind) || !output || !commit)
    throw new Error('Usage: golden.ts <live-spades|baseline> <output.json> <sourceCommit>');
  if (existsSync(output)) throw new Error('Refusing to overwrite frozen golden evidence.');
  let corpus: GoldenCorpus;
  if (kind === 'baseline') {
    const { chooseBaselineAction, BASELINE_POLICY_VERSION } = await import('../../../../strategy/baseline.ts');
    corpus = buildGoldenCorpus(BASELINE_POLICY_VERSION, commit, chooseBaselineAction);
  } else {
    // Generated from the live production pack at the source commit, never from the snapshot itself.
    const { getReasoningPack } = await import('../../../../strategy/registry.ts');
    const pack = getReasoningPack('spades-partners');
    corpus = buildGoldenCorpus(pack.policyVersion, commit, (observation) => pack.analyze(observation).action);
  }
  writeFileSync(output, JSON.stringify(corpus, null, 2) + '\n');
  process.stdout.write(`${corpus.policyVersion}: ${corpus.hands.length} golden hands\n`);
}
