import { array, integer, json, object, string } from '../../game/kernel/codec.ts';
import {
  createRegistration,
  createRegistry,
  type InstalledHandlers,
  type RegistrationDescriptor,
} from '../../game/kernel/registry.ts';
import type { Codec, Module, RegistrationAdapters } from '../../game/kernel/module.ts';
import { assertSeat, type Seat } from '../../game/kernel/seats.ts';
import type {
  HeartsAnalysis,
  HeartsCandidate,
  HeartsObservation,
  HeartsSessionView,
} from '../../../shared/contracts.ts';

// An independent counter domain, using a closed Hearts public adapter fixture.
// This is contract-route evidence only, not extracted Hearts or M06 genericity evidence.
export type Stage = 'actor' | 'sealed' | 'automatic' | 'chance' | 'round' | 'done';
export type State = { stage: Stage; step: number; count: number; secrets: number[] };
export type Observation = { seat: Seat; phase: Stage; step: number; count: number; ownValue: number };
export type Action = { take: number };
export type Event = { step: number; privateSecret: number };
export type Chance = { amount: number };
export type Config = { stage: Stage; count: number };
export type Facts = { step: number };
function stage(raw: unknown): asserts raw is Stage {
  if (
    raw !== 'actor' &&
    raw !== 'sealed' &&
    raw !== 'automatic' &&
    raw !== 'chance' &&
    raw !== 'round' &&
    raw !== 'done'
  )
    throw new Error('Invalid stage.');
}
const codec = <T>(parse: (raw: unknown) => T): Codec<T> => ({ parse, encode: json });
const configCodec = codec<Config>((raw) => {
  object(raw, ['stage', 'count']);
  stage(raw.stage);
  integer(raw.count, 1);
  if (raw.count > 286) throw new Error('Too many fixture candidates.');
  return { stage: raw.stage, count: raw.count };
});
export const stateCodec = codec<State>((raw) => {
  object(raw, ['stage', 'step', 'count', 'secrets']);
  stage(raw.stage);
  integer(raw.step);
  integer(raw.count, 1);
  array(raw.secrets);
  if (raw.secrets.length !== 4 || raw.count > 286) throw new Error('Invalid fixture state.');
  const secrets = raw.secrets.map((value) => {
    integer(value);
    return value;
  });
  return { stage: raw.stage, step: raw.step, count: raw.count, secrets };
});
const observationCodec = codec<Observation>((raw) => {
  object(raw, ['seat', 'phase', 'step', 'count', 'ownValue']);
  assertSeat(raw.seat);
  stage(raw.phase);
  integer(raw.step);
  integer(raw.count, 1);
  integer(raw.ownValue);
  return { seat: raw.seat, phase: raw.phase, step: raw.step, count: raw.count, ownValue: raw.ownValue };
});
const chanceCodec = codec<Chance>((raw) => {
  object(raw, ['amount']);
  integer(raw.amount);
  return { amount: raw.amount };
});
const eventCodec = codec<Event>((raw) => {
  object(raw, ['step', 'privateSecret']);
  integer(raw.step);
  integer(raw.privateSecret);
  return { step: raw.step, privateSecret: raw.privateSecret };
});
const cards = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'CJ', 'CQ', 'CK', 'CA'];
const passes: HeartsCandidate[] = [];
for (let a = 0; a < 11; a++)
  for (let b = a + 1; b < 12; b++)
    for (let c = b + 1; c < 13; c++) passes.push({ kind: 'pass', cards: [cards[a], cards[b], cards[c]] });
const header = { gameId: 'hearts', variantId: 'solo', publicSchemaVersion: '2.0.0' } as const;
function table(input: Observation): HeartsObservation {
  return {
    hand: [...cards],
    handCounts: [13, 13, 13, 13],
    scores: [input.step, 0, 0, 0],
    turn: input.phase === 'actor' ? input.seat : null,
    dealer: 0,
    roundNumber: 1,
    trick: [],
    history: [],
    heartsBroken: false,
    passDirection: 'left',
    pass: { outgoing: [], incoming: [], to: null, from: null },
  };
}
export function analysis(id = 'take-0'): HeartsAnalysis {
  return {
    ...header,
    origin: 'code',
    selectedCandidateId: id,
    objective: { id: 'counter-score', version: '1', metric: 'score', direction: 'higher' },
    horizon: { id: 'round', version: '1', scope: 'round' },
    facts: [],
    estimates: [],
    scenarios: [],
    assumptions: ['Synthetic contract fixture; no gameplay quality evidence.'],
  };
}
export const installed: InstalledHandlers = {
  engine: ['counter-engine'],
  ui: ['fixture-table'],
  schemas: ['counter-state-v1', 'counter-observation-v1', 'hearts-public-v2', 'counter-event-v1'],
};
export function fixture() {
  const observed: { seat: Seat; step: number; frozen: boolean }[] = [];
  const reduced: string[] = [];
  const module: Module<
    State,
    Observation,
    Action,
    Event,
    Chance,
    HeartsCandidate,
    HeartsSessionView,
    Facts,
    Config
  > = {
    pin: {
      gameId: 'hearts',
      variantId: 'solo',
      moduleVersion: '0.0.0-contract-fixture',
      ruleProfileId: 'counter-fixture-only',
      stateSchemaVersion: '1.0.0',
      observationSchemaVersion: '1.0.0',
      publicSchemaVersion: '2.0.0',
      eventSchemaVersion: '2.0.0',
    },
    stateCodec,
    observationCodec,
    configurationCodec: configCodec,
    create(config, material) {
      return {
        state: { stage: config.stage, count: config.count, step: material.amount, secrets: [7, 8, 9, 10] },
        events: [],
      };
    },
    node(state) {
      switch (state.stage) {
        case 'actor':
          return { kind: 'actor', phase: 'actor', seat: 0 };
        case 'sealed':
          return { kind: 'sealed', phase: 'sealed', windowId: 'window-1', actors: [0, 1, 2, 3] };
        case 'automatic':
          return { kind: 'automatic', phase: 'automatic', transitionId: 'collect' };
        case 'chance':
          return { kind: 'chance', phase: 'chance', requestId: 'deal', request: { amount: 0 } };
        case 'round':
          return { kind: 'round-complete', phase: 'round' };
        case 'done':
          return { kind: 'session-complete', phase: 'done' };
      }
    },
    observe(state, actor) {
      observed.push({
        seat: actor,
        step: state.step,
        frozen: Object.isFrozen(state) && Object.isFrozen(state.secrets),
      });
      return {
        seat: actor,
        phase: state.stage,
        step: state.step,
        count: state.count,
        ownValue: state.secrets[actor],
      };
    },
    candidates(input) {
      return Array.from({ length: input.count }, (_, i) => ({
        id: `take-${i}`,
        action: { take: i },
        public: passes[i],
      }));
    },
    reduce(state, operation) {
      reduced.push(operation.kind);
      const next: State = { ...state, secrets: [...state.secrets], step: state.step + 1 };
      switch (operation.kind) {
        case 'actor':
          next.step += operation.action.take;
          next.stage = 'automatic';
          break;
        case 'sealed':
          next.step += operation.actions.reduce((sum, action) => sum + action.action.take, 0);
          next.stage = 'done';
          break;
        case 'automatic':
          next.stage = 'chance';
          break;
        case 'chance':
          next.step += operation.material.amount;
          next.stage = 'round';
          break;
        case 'continue-round':
          next.stage = 'actor';
          break;
      }
      return { state: next, events: [{ step: next.step, privateSecret: state.secrets[0] }] };
    },
    projectEvent() {
      return null;
    },
    facts(input) {
      return { step: input.step };
    },
    table(input) {
      return {
        ...header,
        seat: input.seat,
        phase: input.phase,
        table: table(input),
        accessUnit: { id: 'unit-1', kind: 'fixture-round', atAdmissionBoundary: input.step === 0 },
      };
    },
    accessUnit(state) {
      return { id: 'unit-1', kind: 'fixture-round', atAdmissionBoundary: state.step === 0 };
    },
  };
  const adapters: RegistrationAdapters<
    State,
    Observation,
    Event,
    Chance,
    HeartsCandidate,
    HeartsSessionView,
    Facts
  > = {
    chanceCodec,
    eventCodec,
    packet(input, candidates) {
      return {
        ...header,
        seat: input.seat,
        phase: input.phase,
        observation: table(input),
        candidates: candidates.map((candidate) => ({ ...candidate })),
      };
    },
    view(value) {
      return value;
    },
    async analyze(input, facts, policyId) {
      string(policyId);
      if (!Object.isFrozen(input) || !Object.isFrozen(facts)) throw new Error('Unfrozen decision input.');
      return { candidateId: 'take-0', analysis: analysis() };
    },
    document: stateCodec.encode,
  };
  const descriptor: RegistrationDescriptor = {
    gameId: module.pin.gameId,
    moduleVersion: module.pin.moduleVersion,
    variants: [
      {
        id: 'solo',
        ruleProfileId: module.pin.ruleProfileId,
        competition: {
          mode: 'individual',
          competitors: [0, 1, 2, 3].map((seat) => {
            assertSeat(seat);
            return { id: `p${seat}`, seats: [seat] };
          }),
        },
        tableTypes: ['practice'],
        defaultPolicy: { id: 'counter-policy', version: '1' },
      },
    ],
    schemas: {
      state: 'counter-state-v1',
      observation: 'counter-observation-v1',
      public: 'hearts-public-v2',
      event: 'counter-event-v1',
    },
    requiredEngineCapabilities: ['counter-engine'],
    requiredUICapabilities: ['fixture-table'],
    supportedHorizonIds: ['round'],
  };
  const selector = {
    gameId: module.pin.gameId,
    variantId: module.pin.variantId,
    moduleVersion: module.pin.moduleVersion,
    ruleProfileId: module.pin.ruleProfileId,
  };
  const registry = () => createRegistry([createRegistration(descriptor, module, adapters)], installed);
  return { module, adapters, descriptor, selector, registry, observed, reduced };
}
