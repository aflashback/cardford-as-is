// Private, deterministic test-only oracle export. Never imported by the app.
// All expected behavior comes from the preserved original TypeScript V1 engine.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  actionId, apply, collectTrick, createGame, fullDeck, legalActions, nextHand,
  type AcceptedAction, type Card, type Four, type GameConfig, type PrivateGame, type Seat,
} from '../../../../web/server/game/legacy/v1.ts';
import { observe } from '../../../../web/server/game/legacy/observation.ts';
import { observationView } from '../../../../web/server/http/views.ts';

type Command = { type: 'action'; action: AcceptedAction } | { type: 'collect-trick' } | { type: 'next-hand'; deal: Card[] };
const root = resolve(import.meta.dirname, '../../../..');
const file = resolve(import.meta.dirname, 'hearts-parity-corpus.json');
const seats: Seat[] = [0, 1, 2, 3];
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  }
  const encoded = JSON.stringify(value);
  assert.notEqual(encoded, undefined, 'Oracle contains a non-JSON value');
  return encoded!;
}
const hashBytes = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const hash = (value: unknown) => hashBytes(canonical(value));
function random(seed: number) {
  let value = seed >>> 0;
  assert.notEqual(value, 0);
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
  };
}
function shuffled(next: () => number) {
  const deck = fullDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function build(id: string, deal: Card[]) {
  const config: GameConfig = { id, mode: 'hearts', dealer: 3 };
  let state = createGame(config, deal);
  const initialState = structuredClone(state);
  const commands: Command[] = [];
  const checkpoints: {
    commandIndex: number; stateSha256: string; observations: string[];
    legal: string[]; candidateIds: string[]; views: string[];
  }[] = [];
  const rounds: {
    commandIndex: number; handNumber: number; passDirection: string;
    phase: string; points: number[]; scores: number[]; winner: Seat | null;
  }[] = [];
  function capture() {
    checkpoints.push({
      commandIndex: commands.length - 1,
      stateSha256: hash(state),
      observations: seats.map(s => hash(observe(state, s))),
      legal: seats.map(s => hash(legalActions(state, s))),
      candidateIds: seats.map(s => hash(legalActions(state, s).map(actionId))),
      views: seats.map(s => hash(observationView(state.id, observe(state, s)))),
    });
  }
  capture();
  function command(c: Command) {
    state = c.type === 'action' ? apply(state, c.action)
      : c.type === 'collect-trick' ? collectTrick(state) : nextHand(state, c.deal);
    commands.push(structuredClone(c));
    capture();
    if (c.type === 'collect-trick' && state.handResult) {
      rounds.push({ commandIndex: commands.length - 1, handNumber: state.handNumber,
        passDirection: state.passDirection, phase: state.phase,
        points: [...state.handResult.points], scores: [...state.scores],
        winner: state.handResult.winner ?? null });
    }
  }
  function finishHand(select: (length: number) => number) {
    const start = commands.length;
    while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
      assert.ok(commands.length - start <= 66, 'Bounded single hand did not finish');
      if (state.phase === 'trick-end') command({ type: 'collect-trick' });
      else {
        assert.equal(state.phase, 'play');
        assert.notEqual(state.turn, null);
        const candidates = legalActions(state, state.turn!);
        const action = candidates[select(candidates.length)];
        assert.equal(action.kind, 'play');
        command({ type: 'action', action: action as AcceptedAction });
      }
    }
    assert.equal(state.history.length, 13);
    assert.deepEqual(state.hands.map(hand => hand.length), [0, 0, 0, 0]);
  }
  return { current: () => state, command, finishHand,
    result: () => ({ id, config, deal, initialState, commands, checkpoints, rounds }) };
}

// Reachable moon construction: the winner holds all clubs after the sealed pass;
// the other seats each hold one other suit. Invert the actual pass to author the
// opening deal. No scores, phases, history, or other state fields are modified.
function moonDeal(winner: Seat, dealer: Seat, handNumber: number) {
  const remainingSuits = ['D', 'H', 'S'];
  const desired = seats.map(seat => {
    const suit = seat === winner ? 'C' : remainingSuits.shift()!;
    return fullDeck().filter(card => card.startsWith(suit));
  });
  const offset = [1, 3, 2, 0][(handNumber - 1) % 4];
  const passes = seats.map(seat => desired[(seat + offset) % 4].slice(0, 3)) as Four<Card[]>;
  const before = offset === 0 ? desired : seats.map(seat => [...desired[seat].slice(3), ...passes[seat]]);
  const deck = Array.from({ length: 52 }, (_, index) => before[(dealer + 1 + index) % 4][Math.floor(index / 4)]);
  assert.equal(new Set(deck).size, 52);
  return { deck, passes, offset };
}

const seed = 0x48656172;
const rng = random(seed);
const mixed = build('m04-hearts-seeded-mixed', shuffled(rng));
const mixedPasses = seats.map(seat => {
  const candidates = legalActions(mixed.current(), seat);
  assert.equal(candidates.length, 286, 'Every sealed pass alternative remains represented');
  const selected = candidates[rng() % candidates.length];
  assert.equal(selected.kind, 'pass');
  return selected.kind === 'pass' ? selected.cards : [];
}) as Four<Card[]>;
mixed.command({ type: 'action', action: { kind: 'pass-bundle', passes: mixedPasses } });
mixed.finishHand(length => rng() % length);
assert.equal(mixed.current().handResult!.points.reduce((a, b) => a + b, 0), 26, 'Mixed fixture must not accidentally shoot the moon');

const moonWinners: Seat[] = [0, 1, 0, 1, 0];
const moon = build('m04-hearts-moon-tie-then-match', moonDeal(moonWinners[0], 3, 1).deck);
for (let index = 0; index < moonWinners.length; index++) {
  const hand = index + 1;
  const authored = moonDeal(moonWinners[index], ((3 + index) % 4) as Seat, hand);
  if (index > 0) moon.command({ type: 'next-hand', deal: authored.deck });
  if (authored.offset !== 0) moon.command({ type: 'action', action: { kind: 'pass-bundle', passes: authored.passes } });
  moon.finishHand(() => 0);
  assert.deepEqual(moon.current().handResult!.points, seats.map(seat => seat === moonWinners[index] ? 0 : 26));
  if (hand === 4) {
    assert.deepEqual(moon.current().scores, [52, 52, 104, 104]);
    assert.equal(moon.current().phase, 'hand-end', 'Tied lowest score must permit another hand');
    assert.equal(moon.current().handResult!.winner, undefined);
  }
}
assert.deepEqual(moon.current().scores, [52, 78, 130, 130]);
assert.equal(moon.current().phase, 'match-end');
assert.equal(moon.current().handResult!.winner, 0);
assert.deepEqual(moon.result().rounds.map(round => round.passDirection), ['left', 'right', 'across', 'hold', 'left']);
const sourcePaths = [
  'qa/implementation/multi-game/m04/generate-hearts-parity.ts',
  'web/server/game/legacy/v1.ts', 'web/server/game/legacy/types.ts',
  'web/server/game/legacy/observation.ts', 'web/server/game/legacy/rules.ts',
  'web/server/game/cards.ts', 'web/server/game/hearts/score.ts',
  'web/server/game/spades/score.ts', 'web/server/game/rules.ts',
  'web/server/game/kernel/seats.ts', 'web/server/game/kernel/types.ts',
  'web/server/http/views.ts',
];
const sources = Object.fromEntries(sourcePaths.map(path => [path, hashBytes(readFileSync(resolve(root, path)))]));
const corpus = {
  schemaVersion: 'm04-hearts-parity-1', privateTestOnly: true,
  provenance: 'Generated solely from preserved original TypeScript V1 reducers and projections. Go tests consume these fixed expectations and never regenerate them. All hands are reachable from recorded deals and commands without state edits.',
  canonicalization: 'Recursive JSON keys sorted by UTF-16 lexical order; SHA-256 over UTF-8 canonical JSON.',
  generator: { runtime: 'native Windows Node 24.19.0', mixedSeed: seed, rng: 'xorshift32; explicit unsigned return; test-only shuffle and legal-choice modulo' },
  sources, cases: [mixed.result(), moon.result()],
};
assert.equal(process.platform, 'win32', 'Use the selected native Windows runtime');
assert.equal(process.version, 'v24.19.0');
const output = JSON.stringify(corpus, null, 2) + '\n';
if (process.argv.includes('--check')) assert.equal(readFileSync(file, 'utf8'), output, 'Frozen M04 Hearts corpus drift');
else {
  assert.ok(process.argv.includes('--write'), 'Use --write for the first export or --check to verify frozen output');
  assert.ok(!existsSync(file), 'Refusing to overwrite an existing frozen M04 corpus');
  writeFileSync(file, output);
}
console.log(JSON.stringify({ operation: process.argv.includes('--check') ? 'checked' : 'generated',
  file: 'qa/implementation/multi-game/m04/hearts-parity-corpus.json', sha256: hashBytes(output), bytes: Buffer.byteLength(output),
  cases: corpus.cases.map(c => ({ id: c.id, commands: c.commands.length, checkpoints: c.checkpoints.length, rounds: c.rounds })) }, null, 2));
