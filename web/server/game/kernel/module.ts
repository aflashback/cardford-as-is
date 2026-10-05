import type {
  RegisteredActorPacket,
  RegisteredSessionView,
  RegisteredAnalysis,
} from '../../../shared/contracts.ts';
import type { Seat } from './seats.ts';
export type { Seat, Competition, Controller } from './seats.ts';
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export interface Codec<T> {
  parse(raw: unknown): T;
  encode(value: T): Json;
}
export type Pin = Readonly<{
  gameId: string;
  variantId: string;
  moduleVersion: string;
  ruleProfileId: string;
  stateSchemaVersion: string;
  observationSchemaVersion: string;
  publicSchemaVersion: string;
  eventSchemaVersion: string;
}>;
export type Node<Q> =
  | { kind: 'actor'; phase: string; seat: Seat }
  | { kind: 'sealed'; phase: string; windowId: string; actors: readonly Seat[] }
  | { kind: 'automatic'; phase: string; transitionId: string }
  | { kind: 'chance'; phase: string; requestId: string; request: Q }
  | { kind: 'round-complete'; phase: string }
  | { kind: 'session-complete'; phase: string };
export type Operation<A, Q> =
  | { kind: 'actor'; seat: Seat; action: A }
  | { kind: 'sealed'; windowId: string; actions: readonly { seat: Seat; action: A }[] }
  | { kind: 'automatic'; transitionId: string }
  | { kind: 'chance'; requestId: string; material: Q }
  | { kind: 'continue-round' };
export type Transition<S, E> = { state: S; events: readonly E[] };
export type Candidate<A, C> = { id: string; action: A; public: C };
export type AccessUnit = { id: string; kind: string; atAdmissionBoundary: boolean };
/** Concrete request construction is installed by each game in M02. */
export interface InitialChanceRequest<G, Q> {
  initialChanceRequest(config: G): Q;
}
export interface Module<S, O, A, E, Q, C, V, F, G> {
  readonly pin: Pin;
  readonly stateCodec: Codec<S>;
  readonly observationCodec: Codec<O>;
  readonly configurationCodec: Codec<G>;
  create(config: G, material: Q): Transition<S, E>;
  node(state: S): Node<Q>;
  observe(state: S, actor: Seat): O;
  candidates(input: O): readonly Candidate<A, C>[];
  reduce(state: S, operation: Operation<A, Q>): Transition<S, E>;
  projectEvent(event: E, viewer: Seat): Json | null;
  facts(input: O): F;
  table(input: O): V;
  accessUnit(state: S): AccessUnit | null;
}
export interface RegistrationAdapters<S, O, E, Q, C, V, F> {
  readonly chanceCodec: Codec<Q>;
  readonly eventCodec: Codec<E>;
  packet(input: O, candidates: readonly { id: string; public: C }[]): RegisteredActorPacket;
  view(view: V): RegisteredSessionView;
  analyze(
    input: O,
    facts: F,
    policyId: string,
  ): Promise<{ candidateId: string; analysis: RegisteredAnalysis }>;
  document(state: S): Json;
}

// Game-owned reasoning facets are independent of transport and complete worlds.
// Their concrete policies, samplers and evaluator installation belong to M05+.
export type VersionedComponent = Readonly<{ id: string; version: string }>;
export type Objective = VersionedComponent & { metric: string; direction: 'higher' | 'lower' };
export type Horizon = VersionedComponent & { scope: string };
export type Payoff = { competitorId: string; metrics: Readonly<Record<string, number>> };
export type Estimate = {
  competitorId: string;
  metric: string;
  event: string;
  unit: string;
  population: string;
  value: number;
  estimator: VersionedComponent;
  uncertainty: { method: VersionedComponent; lower: number; upper: number } | null;
};
export type Evaluation =
  | { kind: 'terminal'; values: readonly Payoff[] }
  | { kind: 'cutoff'; values: readonly Payoff[]; evaluatorVersion: string; assumptions: readonly string[] };
export interface ScoringFacet<S> {
  readonly objective: Objective;
  readonly horizons: readonly Horizon[];
  scores(state: S): readonly Payoff[];
  reached(state: S, horizon: Horizon): boolean;
  evaluate(state: S, horizon: Horizon): Evaluation;
}
export interface KnowledgeFacet<O, F> {
  readonly pin: VersionedComponent;
  facts(input: O): F;
  informationKey(input: O): string;
}
export type ScenarioEvidence = {
  id: string;
  version: string;
  applicability: 'applies' | 'possible' | 'excluded';
  evidence: readonly string[];
  exceptions: readonly string[];
};
export interface ScenarioFacet<O, F> {
  readonly pin: VersionedComponent;
  detect(input: O, facts: F): readonly ScenarioEvidence[];
}
export interface DecisionFacet<O, C, F> {
  readonly pin: VersionedComponent;
  readonly objective: Objective;
  readonly horizon: Horizon;
  analyze(
    input: O,
    candidates: readonly { id: string; public: C }[],
    facts: F,
  ): Promise<{
    candidateId: string | null;
    estimates: readonly Estimate[];
    scenarios: readonly ScenarioEvidence[];
    assumptions: readonly string[];
  }>;
}
