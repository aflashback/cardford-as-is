import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  actionId, apply, collectTrick, createGame, legalActions, nextHand,
  type AcceptedAction, type Card, type GameAction, type GameConfig, type PrivateGame,
  type Seat,
} from '../../game/legacy/v1.ts';
import { observe, type SeatObservation } from '../../game/legacy/observation.ts';
import type { Module } from '../../game/kernel/module.ts';
import type { BoundSession } from '../../game/kernel/session.ts';
import { parseDocumentEnvelope } from '../../records/game-document.ts';
import { heartsModule } from '../../games/hearts/module.ts';
import { fromV1Hearts, toV1Hearts } from '../../games/hearts/compatibility.ts';
import { toV1HeartsObservation } from '../../games/hearts/observation.ts';
import { spadesModuleFor } from '../../games/spades/module.ts';
import { fromV1Spades, toV1Spades } from '../../games/spades/compatibility.ts';
import { observeV1Spades } from '../../games/spades/observation.ts';
import { createRegisteredSession, decodeRegisteredDocument } from '../../games/registrations.ts';
import { analyzeDecision, type DecisionAnalysis } from '../../strategy/index.ts';
import { json } from '../../game/kernel/codec.ts';

export type SavedCommand =
  | { type: 'action'; action: AcceptedAction }
  | { type: 'collect-trick' }
  | { type: 'next-hand'; deal: Card[] };
export type SelectedAnalysis = Pick<DecisionAnalysis, 'schemaVersion' | 'policyVersion' | 'action' | 'reasons' | 'limitations'>;
export type SavedParityCase = {
  config: GameConfig;
  seed: number;
  deal: Card[];
  commands: SavedCommand[];
  samples: { commandIndex: number; seat: Seat; analysis: SelectedAnalysis }[];
  rounds: { hand: number; passDirection: string; points: number[]; bags: number[]; scores: number[]; stateSha256: string }[];
  finalSha256: string;
};
export const savedCorpus = JSON.parse(readFileSync(new URL('../fixtures/legacy-module-document.json', import.meta.url), 'utf8')) as {
  schemaVersion: string;
  provenance: string;
  cases: SavedParityCase[];
};
/** Capture used UTF-16 lexical key ordering; the kernel uses locale ordering. */
function capturedCanonical(raw: unknown): string {
  const value = json(raw);
  if (Array.isArray(value)) return '[' + value.map(capturedCanonical).join(',') + ']';
  if (typeof value === 'object' && value !== null)
    return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => JSON.stringify(key) + ':' + capturedCanonical(item)).join(',') + '}';
  return JSON.stringify(value);
}
export const hashState = (state: PrivateGame) => createHash('sha256').update(capturedCanonical(state)).digest('hex');
export const selectedAnalysis = (value: DecisionAnalysis): SelectedAnalysis => ({
  schemaVersion: value.schemaVersion,
  policyVersion: value.policyVersion,
  action: value.action,
  reasons: value.reasons,
  limitations: value.limitations,
});
const seats: Seat[] = [0, 1, 2, 3];

/** Heterogeneous private types stay in this typed closure, never an unchecked cast. */
function adapter<S, O, A extends GameAction, E, Q, C, V, F, G>(
  module: Module<S, O, A, E, Q, C, V, F, G>,
  toV1: (state: S) => PrivateGame,
  fromV1: (state: PrivateGame) => S,
  safeV1: (state: S, seat: Seat) => SeatObservation,
) {
  const state = (session: BoundSession) => module.stateCodec.parse(parseDocumentEnvelope(session.serializePrivate()).payload);
  return {
    pin: module.pin,
    create(config: GameConfig, deck: Card[]): BoundSession {
      const { gameId, variantId, moduleVersion, ruleProfileId } = module.pin;
      return createRegisteredSession({ gameId, variantId, moduleVersion, ruleProfileId }, { id: config.id, dealer: config.dealer }, { kind: 'deal', deck });
    },
    legacy: (session: BoundSession) => toV1(state(session)),
    safe: (session: BoundSession, seat: Seat) => safeV1(state(session), seat),
    candidates: (session: BoundSession, seat: Seat): { id: string; action: GameAction }[] => module.candidates(module.observe(state(session), seat)).map(candidate => ({ id: candidate.id, action: candidate.action })),
    observe: (session: BoundSession, seat: Seat): unknown => module.observe(state(session), seat),
    withLegacy(session: BoundSession, legacy: PrivateGame): BoundSession {
      const document = parseDocumentEnvelope(session.serializePrivate());
      return decodeRegisteredDocument({ ...document, payload: module.stateCodec.encode(fromV1(legacy)) });
    },
  };
}
export function harness(mode: GameConfig['mode']) {
  return mode === 'hearts'
    ? adapter(heartsModule, toV1Hearts, fromV1Hearts, (state, seat) => toV1HeartsObservation(heartsModule.observe(state, seat)))
    : adapter(spadesModuleFor(mode === 'spades-solo' ? 'solo' : 'partners'), toV1Spades, fromV1Spades, observeV1Spades);
}

type Counters = { revision: number; collections: number; accepted: number; deals: number };
function count(counters: Counters, command: SavedCommand) {
  counters.revision++;
  if (command.type === 'collect-trick') counters.collections++;
  else if (command.type === 'action') counters.accepted++;
  else counters.deals++;
}
function snapshot(state: PrivateGame, events: unknown, counters: Counters, safe: (seat: Seat) => SeatObservation, ids: (seat: Seat) => string[], samples: SelectedAnalysis[]) {
  return { state, events, ...counters, observations: seats.map(safe), candidateIds: seats.map(ids), samples };
}

/** Independent frozen V1 reducer, rules and allowlisted observations are the oracle. */
export function replayV1(saved: SavedParityCase) {
  let state = createGame(saved.config, saved.deal);
  const counters: Counters = { revision: 0, collections: 0, accepted: 0, deals: 0 };
  const initial = snapshot(state, state.events, counters, seat => observe(state, seat), seat => legalActions(state, seat).map(actionId), []);
  const steps = [];
  for (const [index, command] of saved.commands.entries()) {
    const samples = saved.samples.filter(sample => sample.commandIndex === index).map(sample => selectedAnalysis(analyzeDecision(observe(state, sample.seat))));
    const previousEvents = state.events.length;
    if (command.type === 'action') state = apply(state, command.action);
    else if (command.type === 'collect-trick') state = collectTrick(state);
    else state = nextHand(state, command.deal);
    count(counters, command);
    steps.push(snapshot(state, state.events.slice(previousEvents), counters, seat => observe(state, seat), seat => legalActions(state, seat).map(actionId), samples));
  }
  return { initial, steps };
}

export function applySavedCommand(session: BoundSession, command: SavedCommand): { next: BoundSession; privateEvents: readonly unknown[] } {
  const node = session.node();
  if (command.type === 'action') {
    if (command.action.kind === 'pass-bundle') {
      assert.equal(node.kind, 'sealed');
      if (node.kind !== 'sealed') throw new Error('Expected a sealed window.');
      return session.commitSealed(node.windowId, seats.map(seat => ({ seat, candidateId: actionId({ kind: 'pass', seat, cards: command.action.kind === 'pass-bundle' ? command.action.passes[seat] : [] }) })));
    }
    return session.commit(command.action.seat, actionId(command.action));
  }
  if (command.type === 'collect-trick') {
    assert.equal(node.kind, 'automatic');
    if (node.kind !== 'automatic') throw new Error('Expected a collection.');
    return session.advance(node.transitionId);
  }
  assert.equal(node.kind, 'round-complete');
  const confirmation = session.continueRound();
  assert.equal(confirmation.privateEvents.length, 0, 'Round confirmation itself does not invent a V1 gameplay event.');
  const restoredConfirmation = decodeRegisteredDocument(confirmation.next.serializePrivate());
  const chance = restoredConfirmation.node();
  assert.equal(chance.kind, 'chance');
  if (chance.kind !== 'chance') throw new Error('Expected a new deal request.');
  const dealt = restoredConfirmation.supplyChance(chance.requestId, { kind: 'deal', deck: command.deal });
  return { next: dealt.next, privateEvents: [...confirmation.privateEvents, ...dealt.privateEvents] };
}

/** Uses the installed native modules, registry resolution, codecs and candidate IDs. */
export function replayThroughModule(saved: SavedParityCase) {
  const game = harness(saved.config.mode);
  let session = game.create(saved.config, saved.deal);
  let state = game.legacy(session);
  const counters: Counters = { revision: 0, collections: 0, accepted: 0, deals: 0 };
  const initial = snapshot(state, state.events, counters, seat => game.safe(session, seat), seat => game.candidates(session, seat).map(candidate => candidate.id), []);
  const steps = [];
  for (const [index, command] of saved.commands.entries()) {
    const samples = saved.samples.filter(sample => sample.commandIndex === index).map(sample => selectedAnalysis(analyzeDecision(game.safe(session, sample.seat))));
    const before = session.serializePrivate();
    const transition = applySavedCommand(session, command);
    assert.deepEqual(session.serializePrivate(), before, 'Accepted transitions must leave their source snapshot immutable.');
    session = transition.next;
    state = game.legacy(session);
    count(counters, command);
    // Decoding every checkpoint tests real state codec round-trip and continuation.
    session = decodeRegisteredDocument(session.serializePrivate());
    steps.push(snapshot(state, transition.privateEvents, counters, seat => game.safe(session, seat), seat => game.candidates(session, seat).map(candidate => candidate.id), samples));
  }
  return { initial, steps };
}
