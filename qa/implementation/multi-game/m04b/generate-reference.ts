// Private acceptance oracle. Reads preserved TypeScript code; never imports Go.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { actionId, apply, collectTrick, createGame, fullDeck, nextHand, type Card, type Four, type GameConfig, type Seat } from '../../../../web/server/game/legacy/v1.ts';
import { observe } from '../../../../web/server/game/legacy/observation.ts';
import { analyzeDecision } from '../../../../web/server/strategy/index.ts';
import { explain } from '../../../../web/server/coaching/templates.ts';
import { projectAdvice } from '../../../../web/server/coaching/project.ts';
import { createRandom, shuffled } from '../../../../web/server/strategy/plan/random.ts';
import { historicalDeck, sequenceHash } from '../../../../web/server/games/spades/reasoning/frozen/golden.ts';
import { legacyCueHash } from '../../../../web/server/games/spades/coaching/legacy-golden.ts';
import { harness, savedCorpus, type SavedCommand } from '../../../../web/server/tests/support/module-parity.ts';
import type { BoundSession } from '../../../../web/server/game/kernel/session.ts';

const root = resolve(import.meta.dirname, '../../../..');
const target = resolve(import.meta.dirname, 'reference-corpus.json');
const seats: Seat[] = [0, 1, 2, 3];
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  const encoded = JSON.stringify(value);
  assert.notEqual(encoded, undefined);
  return encoded!;
}
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const hash = (value: unknown) => sha(canonical(value));
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const counts = { decisions: 0, forced: 0, noDecisionAdvice: 0, sessions: 0, sessionCheckpoints: 0, prepared: 0 };
const scenarios: Record<string, number> = {};
const reasons: Record<string, number> = {};
const samples: unknown[] = [];
const seen = new Set<string>();

function originalCase(config: GameConfig, deal: Card[], scripted?: SavedCommand[]) {
  let state = createGame(config, deal);
  const commands: SavedCommand[] = [];
  const checkpoints: unknown[] = [];
  const rendered: Parameters<typeof legacyCueHash>[0][number][] = [];
  const actions: string[] = [];
  function capture() {
    const decisions = seats.flatMap(seat => {
      const obs = observe(state, seat);
      if (!obs.legalActions.length) return [];
      const analysis = analyzeDecision(obs), advice = explain(obs, analysis);
      const projections = [1, 2, 3].map(level => projectAdvice(advice, level as 1 | 2 | 3, 'original-decision'));
      counts.decisions++;
      if (analysis.provenance === 'forced') counts.forced++;
      for (const id of analysis.scenarioIds) scenarios[id] = (scenarios[id] ?? 0) + 1;
      for (const reason of analysis.reasons) reasons[reason.id] = (reasons[reason.id] ?? 0) + 1;
      const key = config.mode + ':' + obs.phase + ':' + advice.focus;
      if (!seen.has(key)) {
        seen.add(key);
        samples.push({ caseId: config.id, commandIndex: commands.length - 1, seat, observation: obs, analysis, advice, projections });
      }
      rendered.push({ seat, actionId: actionId(analysis.action), advice });
      actions.push(`${seat}:${actionId(analysis.action)}`);
      return [{ seat, actionId: actionId(analysis.action), observation: hash(obs), analysis: hash(analysis), advice: hash(advice), projections: projections.map(hash) }];
    });
    // No-decision advice is included at every lifecycle boundary, for every ineligible seat.
    const waiting = seats.flatMap(seat => {
      const obs = observe(state, seat);
      if (obs.legalActions.length) return [];
      counts.noDecisionAdvice++;
      return [{ seat, advice: hash(explain(obs)) }];
    });
    checkpoints.push({ commandIndex: commands.length - 1, decisions, waiting });
  }
  capture();
  function commit(command: SavedCommand) {
    state = command.type === 'action' ? apply(state, command.action)
      : command.type === 'collect-trick' ? collectTrick(state) : nextHand(state, command.deal);
    commands.push(command);
    capture();
  }
  if (scripted) for (const command of scripted) commit(command);
  else {
    while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
      assert.ok(commands.length < 90, 'Single-hand oracle bound');
      if (state.phase === 'trick-end') commit({ type: 'collect-trick' });
      else if (state.phase === 'pass') {
        const passes = seats.map(seat => {
          const action = analyzeDecision(observe(state, seat)).action;
          assert.equal(action.kind, 'pass');
          return action.kind === 'pass' ? action.cards : [];
        }) as Four<Card[]>;
        commit({ type: 'action', action: { kind: 'pass-bundle', passes } });
      } else {
        assert.notEqual(state.turn, null);
        const action = analyzeDecision(observe(state, state.turn!)).action;
        assert.notEqual(action.kind, 'pass');
        if (action.kind === 'pass') throw Error('Unexpected pass');
        commit({ type: 'action', action });
      }
    }
  }
  rendered.push({ seat: 0, actionId: 'none', advice: explain(observe(state, 0)) });
  return { config, deal, commands, checkpoints, cueSequenceHash: legacyCueHash(rendered), actionSequenceHash: sequenceHash(actions) };
}

const cueGolden = load('web/server/games/spades/coaching/legacy-golden.json');
const cases = cueGolden.hands.map((entry: { mode: GameConfig['mode']; seed: number; sha256: string }) => {
  const value = originalCase({ id: `legacy-cue-${entry.seed}`, mode: entry.mode, dealer: (entry.seed % 4) as Seat }, shuffled(fullDeck(), createRandom(entry.seed)));
  assert.equal(value.cueSequenceHash, entry.sha256, 'Preserved original cue corpus changed');
  return value;
});
const frozen = load('web/server/games/spades/reasoning/frozen/spades-tactics-2.1.0/golden.json');
for (const entry of frozen.hands) {
  const value = originalCase({ id: `golden-${entry.seed}`, mode: entry.mode, dealer: (entry.seed % 4) as Seat }, historicalDeck(entry.seed));
  assert.equal(value.actionSequenceHash, entry.sha256, 'Preserved original policy corpus changed');
  cases.push(value);
}
for (const saved of savedCorpus.cases) cases.push(originalCase(saved.config, saved.deal, saved.commands));

async function registeredCase(config: GameConfig, deal: Card[], commands: SavedCommand[]) {
  const game = harness(config.mode);
  let session = game.create(config, deal);
  const operations: unknown[] = [], checkpoints: unknown[] = [];
  async function capture(events: readonly unknown[]) {
    const node = session.node();
    const actors = node.kind === 'actor' ? [node.seat] : node.kind === 'sealed' ? [...node.actors] : [];
    const prepared = [];
    for (const actor of actors) {
      const policy = config.mode === 'hearts' ? 'hearts-baseline-1.0.0' : 'spades-tactics-2.1.0';
      prepared.push({ seat: actor, packet: hash(session.packet(actor)), prepared: hash(await session.prepare(actor, policy)) });
      counts.prepared++;
    }
    checkpoints.push({ operationIndex: operations.length - 1, document: hash(session.serializePrivate()), node: hash(node), accessUnit: hash(session.accessUnit()), views: seats.map(seat => hash(session.view(seat))), events: hash(events), prepared });
    counts.sessionCheckpoints++;
  }
  async function transition(operation: unknown, result: { next: BoundSession; privateEvents: readonly unknown[] }) {
    operations.push(operation);
    session = result.next;
    await capture(result.privateEvents);
  }
  await capture([]);
  for (const command of commands) {
    const node = session.node();
    if (command.type === 'next-hand') {
      await transition({ kind: 'continue-round' }, session.continueRound());
      const chance = session.node();
      assert.equal(chance.kind, 'chance');
      if (chance.kind !== 'chance') throw Error('Expected chance');
      const material = { kind: 'deal', deck: command.deal } as const;
      await transition({ kind: 'chance', requestId: chance.requestId, material }, session.supplyChance(chance.requestId, material));
    } else if (command.type === 'collect-trick') {
      assert.equal(node.kind, 'automatic');
      if (node.kind !== 'automatic') throw Error('Expected automatic');
      await transition({ kind: 'automatic', transitionId: node.transitionId }, session.advance(node.transitionId));
    } else if (command.action.kind === 'pass-bundle') {
      assert.equal(node.kind, 'sealed');
      if (node.kind !== 'sealed') throw Error('Expected sealed');
      const bundle = command.action;
      const choices = seats.map(seat => ({ seat, candidateId: actionId({ kind: 'pass', seat, cards: bundle.passes[seat] }) }));
      await transition({ kind: 'sealed', windowId: node.windowId, choices }, session.commitSealed(node.windowId, choices));
    } else {
      const actor = command.action.seat, candidateId = actionId(command.action);
      await transition({ kind: 'actor', actor, candidateId }, session.commit(actor, candidateId));
    }
  }
  counts.sessions++;
  return { config, deal, operations, checkpoints };
}
const sessions = [];
for (const saved of savedCorpus.cases) sessions.push(await registeredCase(saved.config, saved.deal, saved.commands));
const hearts = load('qa/implementation/multi-game/m04/hearts-parity-corpus.json');
for (const saved of hearts.cases) sessions.push(await registeredCase(saved.config, saved.deal, saved.commands));

function walk(path: string): string[] {
  return readdirSync(resolve(root, path), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${path}/${entry.name}`) : [`${path}/${entry.name}`]);
}
const sources = [...walk('web/server').filter(path => /\.(ts|json)$/.test(path)), ...walk('web/shared').filter(path => /\.(ts|json)$/.test(path)), 'qa/implementation/multi-game/m04/hearts-parity-corpus.json', 'qa/implementation/multi-game/m04b/generate-reference.ts'].sort().map(path => ({ path, sha256: sha(readFileSync(resolve(root, path))) }));
assert.equal(process.platform, 'win32');
assert.equal(process.version, 'v24.19.0');
const corpus = { schemaVersion: '1.0.0', provenance: 'Preserved TypeScript defaults and M02 V2 registered sessions; no Go-derived expectations', node: process.version, counts, scenarios, reasons, sources, cases, samples, sessions };
const output = JSON.stringify(corpus) + '\n';
if (process.argv.includes('--write')) {
  assert.equal(existsSync(target), false, 'Refusing to overwrite recorded oracle evidence');
  writeFileSync(target, output);
} else if (process.argv.includes('--check')) assert.equal(readFileSync(target, 'utf8'), output, 'Oracle drift');
else throw Error('Use --write once or --check');
console.log(JSON.stringify({ ...counts, cases: cases.length, bytes: Buffer.byteLength(output), sha256: sha(output), samples: samples.length }));
