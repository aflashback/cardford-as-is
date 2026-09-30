import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionId, apply, collectTrick, createGame, fullDeck, type Four, type Seat } from '../../../game/index.ts';
import type { Card, Mode } from '../../../game/kernel/types.ts';
import { observe, type SeatObservation } from '../../../observations/index.ts';
import { createRandom, shuffled } from '../../../strategy/plan/random.ts';
import type { DecisionAnalysis } from '../../../strategy/types.ts';
import type { Advice } from '../../../coaching/types.ts';

/**
 * COACH-12 / CR-STRAT-009 compatibility: advice rendered for the live default
 * policies ('spades-tactics-2.1.0', 'hearts-baseline-1.0.0') was recorded from the
 * shared renderer before cue text moved into per-pack modules. The parity test
 * replays the same hands and requires byte-identical advice.
 */
export type LegacyCueHand = { mode: Mode; seed: number; decisions: number; sha256: string };
export type LegacyCueCorpus = {
  schemaVersion: '1.0.0';
  recordedFrom: string;
  dealGenerator: string;
  policyVersions: Record<string, string>;
  hands: LegacyCueHand[];
  /** Every rendered advice object of the first seed of each mode, for human diagnosis. */
  samples: { mode: Mode; seed: number; advice: { seat: Seat; actionId: string; advice: Advice }[] }[];
};

export const LEGACY_CUE_FIRST_SEED = 3_300_001;
export const LEGACY_CUE_HANDS: readonly { mode: Mode; hands: number }[] = [
  { mode: 'spades-solo', hands: 24 },
  { mode: 'spades-partners', hands: 24 },
  { mode: 'hearts', hands: 8 },
];

export type LegacyRenderer = (observation: SeatObservation, analysis?: DecisionAnalysis) => Advice;
export type LegacyAnalyzer = (observation: SeatObservation) => DecisionAnalysis;

const SEATS: Seat[] = [0, 1, 2, 3];

/** Plays one seeded hand with the supplied analysis and renders advice at every decision of every seat. */
export function renderLegacyHand(
  mode: Mode,
  seed: number,
  analyze: LegacyAnalyzer,
  render: LegacyRenderer,
): { seat: Seat; actionId: string; advice: Advice }[] {
  const deck = shuffled(fullDeck(), createRandom(seed));
  let state = createGame({ id: `legacy-cue-${seed}`, mode, dealer: (seed % 4) as Seat }, deck);
  const rendered: { seat: Seat; actionId: string; advice: Advice }[] = [];
  const decide = (seat: Seat) => {
    const observation = observe(state, seat);
    const analysis = analyze(observation);
    rendered.push({ seat, actionId: actionId(analysis.action), advice: render(observation, analysis) });
    return analysis.action;
  };
  let guard = 0;
  while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
    if (++guard > 90) throw new Error(`Legacy cue hand did not finish: ${mode}/${seed}`);
    if (state.phase === 'trick-end') {
      state = collectTrick(state);
      continue;
    }
    if (state.phase === 'pass') {
      const passes = SEATS.map((seat) => {
        const action = decide(seat);
        if (action.kind !== 'pass') throw new Error('A pass was expected.');
        return [...action.cards];
      }) as Four<Card[]>;
      state = apply(state, { kind: 'pass-bundle', passes });
      continue;
    }
    if (state.turn === null) throw new Error('Legacy cue hand has no actor.');
    const action = decide(state.turn);
    if (action.kind === 'pass') throw new Error('No pass is available here.');
    state = apply(state, action);
  }
  // The envelope shown when no decision is pending is part of the frozen wording.
  rendered.push({ seat: 0, actionId: 'none', advice: render(observe(state, 0)) });
  return rendered;
}

export const legacyCueHash = (rendered: readonly { seat: Seat; actionId: string; advice: Advice }[]) =>
  createHash('sha256')
    .update(rendered.map((entry) => JSON.stringify(entry)).join('\n'))
    .digest('hex');

export function buildLegacyCueCorpus(
  recordedFrom: string,
  policyVersionOf: (mode: Mode) => string,
  analyze: LegacyAnalyzer,
  render: LegacyRenderer,
): LegacyCueCorpus {
  const hands: LegacyCueHand[] = [];
  const samples: LegacyCueCorpus['samples'] = [];
  const policyVersions: Record<string, string> = {};
  for (const { mode, hands: count } of LEGACY_CUE_HANDS) {
    policyVersions[mode] = policyVersionOf(mode);
    for (let index = 0; index < count; index++) {
      const seed = LEGACY_CUE_FIRST_SEED + index;
      const rendered = renderLegacyHand(mode, seed, analyze, render);
      hands.push({ mode, seed, decisions: rendered.length, sha256: legacyCueHash(rendered) });
      if (index === 0) samples.push({ mode, seed, advice: rendered });
    }
  }
  return {
    schemaVersion: '1.0.0',
    recordedFrom,
    dealGenerator: 'shuffled(fullDeck(), createRandom(seed)); dealer = seed % 4',
    policyVersions,
    hands,
    samples,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [output, recordedFrom] = process.argv.slice(2);
  if (!output || !recordedFrom) throw new Error('Usage: legacy-golden.ts <output.json> <recordedFrom>');
  if (existsSync(output)) throw new Error('Refusing to overwrite recorded legacy cue evidence.');
  const { getReasoningPack } = await import('../../../strategy/registry.ts');
  const { explain } = await import('../../../coaching/templates.ts');
  const corpus = buildLegacyCueCorpus(
    recordedFrom,
    (mode) => getReasoningPack(mode).policyVersion,
    (observation) => getReasoningPack(observation.mode).analyze(observation),
    explain,
  );
  writeFileSync(output, JSON.stringify(corpus, null, 2) + '\n');
  process.stdout.write(`${corpus.hands.length} legacy cue hands recorded\n`);
}
