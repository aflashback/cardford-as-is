# Multi-game implementation contracts

Target interfaces for [the main plan](../../../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md). **Proposed, not implemented.** Existing game records, rule profiles and policy pins remain immutable. Keep the current `web` workspace and lockfile; these are dependency boundaries, not new packages or services.

## Production module boundary

Create `web/server/game/kernel/module.ts` and `web/server/game/kernel/session.ts`. Move the independent seat/competition definitions into `kernel/seats.ts` and retain compatibility re-exports for frozen consumers. Seat IDs retain the current 0–3 mapping; turn order is module-owned, not numeric increment in shared code.

The following declarations are the contract for these future files. Public `RegisteredActorPacket`, `RegisteredSessionView` and `RegisteredAnalysis` are generated closed unions described below. Domain state/action types are independent of HTTP DTOs.

```ts
type Seat = 0 | 1 | 2 | 3;
type Json = null | boolean | number | string | readonly Json[] |
  { readonly [key: string]: Json };
interface Codec<T> { parse(raw: unknown): T; encode(value: T): Json }
type Pin = {
  gameId: string; variantId: string; moduleVersion: string;
  ruleProfileId: string; stateSchemaVersion: string;
  observationSchemaVersion: string; publicSchemaVersion: string;
  eventSchemaVersion: string;
};
type Node<Q> =
  | { kind: 'actor'; phase: string; seat: Seat }
  | { kind: 'sealed'; phase: string; windowId: string; actors: readonly Seat[] }
  | { kind: 'automatic'; phase: string; transitionId: string }
  | { kind: 'chance'; phase: string; requestId: string; request: Q }
  | { kind: 'round-complete'; phase: string }
  | { kind: 'session-complete'; phase: string };
type Operation<A, Q> =
  | { kind: 'actor'; seat: Seat; action: A }
  | { kind: 'sealed'; windowId: string;
      actions: readonly { seat: Seat; action: A }[] }
  | { kind: 'automatic'; transitionId: string }
  | { kind: 'chance'; requestId: string; material: Q }
  | { kind: 'continue-round' };
type Transition<S, E> = { state: S; events: readonly E[] };
type Candidate<A, C> = { id: string; action: A; public: C };
interface Module<S, O, A, E, Q, C, V, F, G> {
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
}
```

`Q` contains typed request/result variants owned by the game, such as a complete shuffled deck; no shared deck size or rank ordering. The factory parses configuration before calling `create`. `projectEvent` output is validated by the module's closed actor-event schema; it is not an unvalidated public JSON blob. Codecs reject unknown fields, malformed cards, unsupported pins and non-finite numbers; they never strip sensitive fields to make an observation pass.

### Binding heterogeneous modules without unchecked casts

Create `web/server/games/registrations.ts` with an exhaustive `(gameId, moduleVersion)` decoder. Each branch parses the matching saved payload and calls the generic factory below **inside that branch**. Do not erase a registry to `Module<unknown,...>` or cast unrelated state/action unions together.

`bindSession<S,O,A,E,Q,C,V,F,G>(module, state, registrationAdapters): BoundSession` captures `S` in its closure. `RegistrationAdapters<S,O,E,Q,C,V,F>` supplies `chanceCodec: Codec<Q>`, `eventCodec: Codec<E>`, `packet(input: O, candidates: readonly {id: string; public: C}[]): RegisteredActorPacket`, `view(view: V): RegisteredSessionView`, `analyze(input: O, facts: F, policyId: string): Promise<{candidateId: string; analysis: RegisteredAnalysis}>`, and `document(state: S): Json`. Public adapter results are schema-validated before return; private encoding is validated before save. Shared services receive only this facade:

```ts
interface BoundSession {
  readonly pin: Pin;
  node(): Node<Json>;
  serializePrivate(): Json; // repository use only, never a provider/view
  packet(actor: Seat): RegisteredActorPacket;
  view(actor: Seat): RegisteredSessionView;
  prepare(actor: Seat, policyId: string): Promise<PreparedDecision>;
  commit(actor: Seat, candidateId: string): BoundTransition;
  commitSealed(windowId: string, choices: readonly SeatChoice[]): BoundTransition;
  advance(transitionId: string): BoundTransition;
  supplyChance(requestId: string, material: Json): BoundTransition;
  continueRound(): BoundTransition;
}
type SeatChoice = { seat: Seat; candidateId: string };
type PreparedDecision = {
  actor: Seat; candidateId: string; inputDigest: string;
  policyId: string; observationSchemaVersion: string;
  analysis: RegisteredAnalysis;
};
type BoundTransition = { next: BoundSession; privateEvents: readonly Json[] };
```

The factory resolves candidate IDs to typed `A` values, rechecks eligibility and calls the reducer; it cannot trust a stored/provider candidate. `prepare` freezes the actor input before asynchronous analysis and runs outside a database transaction; both code and provider adapters use that input. All service commands retain owner, control lease, expected revision, command ID/digest and access-generation checks. Binding does not replace those checks. `serializePrivate` and private events are stored through repository-only ports; player/provider paths accept independently validated public packets, never this serialization. Enforce imports and serialized-input tests in addition to TypeScript.

### Registration and new-session creation

M01 defines `RegistrationDescriptor` in `kernel/registry.ts`: immutable `gameId`, `moduleVersion`, supported variants with rule profiles/competition, schema IDs, required engine/UI capability IDs, supported table types, supported horizon IDs and default policy pins. Capability IDs refer to installed handlers, not Boolean feature claims. M02 supplies each concrete typed registration and its `initialChanceRequest(config): Q`.

The same exhaustive registry exports `createRegisteredSession(selector, rawConfig: unknown, rawMaterial: unknown): BoundSession`, `decodeDocument(raw: unknown): BoundSession` and `catalog(engineHandlers, uiHandlers)`. `selector` contains exact game/variant/module/rule IDs; only new-session default resolution may fill an installed default. A concrete branch parses its configuration/chance codecs, calls pure `create`, validates state/events and binds it. Startup/catalog verifies all schema IDs/handlers and supported competition/table combinations; missing capability excludes/rejects the variant. The test factory injects a test registration through this same route; production's installed set excludes it. Shared services never invent game configuration or supply a newer version when decoding an old session.

### Persistence and transport

- New document discriminator: `documentVersion: '2.0.0'`, `pin`, `competition`, `controllers`, validated module payload and separately versioned journal/audits. Competition stays exactly four individual seats or two pairs. Controllers initially allow the existing practice table only; four-human play is not activated.
- Legacy document without the discriminator goes through a strict V1 decoder and its original reducer/reader. Preserve `action`, `collect`, `next-hand` journal entries, revision boundaries, deals and original advice. Unknown/ambiguous versions allow original-data export/read-only display where supported and reject gameplay; never select the newest installed module.
- Keep `web/shared/contracts.schema.json` as the **only active public schema root**. Store each new game branch once in `web/shared/games/spades.schema.json`, `hearts.schema.json`, `tarneeb.schema.json` or `trix.schema.json`; the root references those authoritative public fragments. Extend the existing generator to resolve only these registered public references and generate closed V2 packet/view/analysis unions alongside frozen V1 definitions. Private schemas live under each server game and are never bundled into public artifacts. Do not copy the root historical `contracts/` pack into the active DTO pipeline.
- `NewSessionRequest` gains a validated registered game/variant selector. Existing `mode` requests map to their frozen registrations. Action requests discriminate V1 action payloads from V2 `candidateId`; reject mixed fields. Responses expose their public schema discriminator. Review renders each original schema via its corresponding adapter.
- Existing code profiles remain default. A module-owned compatibility policy adapter may call frozen Spades tactics with the original safe observation format. Keep its bytes/choices attributable; do not modify the frozen pack or claim a stronger profile because plumbing changed.
- Hearts sealed passing initially retains one frozen atomic bundle in practice mode. All seat inputs precede all exchange mutations. No separate submission is exposed. A later separately persisted barrier requires a new journal/job version and logical identity `(game, revision, window, seat, purpose)`; today's `jobs UNIQUE(game_id,revision)` must not be bypassed.
- At an automatic node, no policy decides the operation. New/redeal chance consumes privately persisted random material; confirmation before the next round remains a human control. Retain existing pause/advance behavior and separate collection revisions for V1.

## Information-only planning

Create `web/server/strategy/rollout/types.ts`, `run.ts` and `actor-policy.ts`. Existing `strategy/plan` readers and profiles remain V1. A V2 referee contains complete **synthetic** worlds sampled from a permitted packet; the actual concealed deal is not an input to policy/search.

```ts
type ActorInput<O, C> = {
  seat: Seat; phase: string; observation: O;
  candidates: readonly { id: string; public: C }[];
  informationKey: string;
};
type ActorMemory = { version: string; value: Json };
type Horizon = { id: string; version: string; scope: string };
type Payoff = { competitorId: string; metrics: Readonly<Record<string, number>> };
type Evaluation =
  | { kind: 'terminal'; values: readonly Payoff[] }
  | { kind: 'cutoff'; values: readonly Payoff[]; evaluatorVersion: string;
      assumptions: readonly string[] };
interface ActorPolicy<O, C> {
  choose(input: ActorInput<O, C>, memory: ActorMemory, seed: number):
    { candidateId: string; memory: ActorMemory };
}
interface Referee<W, O, C> {
  sample(seed: number): { world: W; weight: number } | null;
  clone(world: W): W;
  node(world: W): Node<Json>;
  project(world: W, actor: Seat): ActorInput<O, C>;
  commit(world: W, actor: Seat, candidateId: string): W;
  commitSealed(world: W, windowId: string, choices: readonly SeatChoice[]): W;
  advance(world: W, seed: number): W;
  continueRound(world: W): W;
  reached(world: W, horizon: Horizon): boolean;
  evaluate(world: W, horizon: Horizon): Evaluation;
}
```

`Referee.advance` owns deterministic housekeeping and explicit synthetic chance, logging which occurred; it cannot read production deal material. `continueRound` crosses a scored round only when the declared horizon continues, preserving contract pools/scores and then requesting fresh chance. For a sealed node, project every participant before collecting any choices, then call `commitSealed` once; per-seat mutation during collection is forbidden. No partner memory or other actor observation reaches `choose`. Actor memory is initialized/reconstructed only from permitted private/public history; other actors' hypothetical memories are reconstructed from synthetic own information, never copied from real private plans. Information keys include remembered exchanges and reveal chronology. Policy seeds depend on declared run/actor information, never full-world hashes. With a fixed seed, indistinguishable inputs produce identical decisions.

Define these additional exports in `rollout/types.ts` and `run.ts`:

```ts
type VersionedComponent = { id: string; version: string };
type RunBudget = {
  maxWorlds: number; maxSteps: number;
  maxCandidates: number; maxMemoryBytes: number;
};
type RunProvenance = {
  sampler: VersionedComponent; prior: VersionedComponent;
  constraints: VersionedComponent; belief: VersionedComponent;
  continuation: VersionedComponent; objective: VersionedComponent;
  horizon: VersionedComponent; comparator: VersionedComponent;
  cutoffEvaluator: VersionedComponent | null;
  permittedInputDigest: string;
  seeds: { world: number; actor: number; chance: number };
};
type Estimate = {
  competitorId: string; metric: string;
  event: string; unit: string; population: string;
  value: number; estimator: VersionedComponent;
  uncertainty: { method: VersionedComponent; lower: number; upper: number } | null;
};
type CandidateEstimate =
  | { kind: 'terminal'; candidateId: string; estimates: readonly Estimate[] }
  | { kind: 'cutoff'; candidateId: string; estimates: readonly Estimate[];
      evaluator: VersionedComponent; assumptions: readonly string[] };
type PairedResult = {
  selectedId: string | null;
  comparableIds: readonly string[]; unsampledIds: readonly string[];
  provenance: RunProvenance;
  work: { worlds: number; steps: number; peakMemoryBytes: number;
    stoppedBy: keyof RunBudget | null };
  coverage: { attempted: number; feasible: number; completed: number;
    excluded: number; failed: number;
    samples: readonly { id: string; weight: number }[];
    weightSum: number; effectiveSampleCount: number;
    candidates: readonly { id: string; attempted: number; completed: number }[] };
  results: readonly CandidateEstimate[];
  assumptions: readonly string[];
};
interface Comparison {
  readonly pin: VersionedComponent;
  readonly metrics: readonly { competitorId: string; metric: string;
    direction: 'higher' | 'lower'; priority: number }[];
  compare(left: readonly Estimate[], right: readonly Estimate[]): -1 | 0 | 1;
}
declare function runPaired<W, O, C>(
  referee: Referee<W, O, C>,
  policiesBySeat: Readonly<Record<Seat, ActorPolicy<O, C>>>,
  horizon: Horizon, root: { seat: Seat; candidateIds: readonly string[] },
  budget: RunBudget, comparison: Comparison, provenance: RunProvenance
): PairedResult;
```

The comparison is game-owned and versioned; `-1` means left is preferred, `0` equivalent and `1` right is preferred. Candidates are resolved from the root actor's permitted packet, including a sealed participant when supported; other sealed choices stay frozen until atomic application. Costs are counted before exceeding their caps. Validate provenance against the installed components; report null selection when no comparison is justified. Payoff does not imply shared partner information.

Sampling weight is finite and positive on every hard-feasible holding under the declared soft model; zero/invalid weight cannot silently turn a possible holding into an exact impossibility. Uniform sampling uses weight 1. Persist provenance, coverage and terminal/cutoff distinction with the decision, not only a free-text assumptions array. Uncertainty is absent rather than invented when an estimator cannot supply a justified interval.

Compare candidates on the same completed worlds. If a world cannot complete all compared candidates, keep its work/trace but exclude it from terminal paired arithmetic. Report completion-conditioned estimates, missingness and model assumptions; uncertainty does not cover model bias. A cutoff value is a named heuristic, never a finished outcome. No independent perfect-information optimization of future actors is permitted. ISMCTS requires a separately versioned information-set experiment, not a renamed flat rollout.

## Provider and coach contract

`providerEligibility(packet)` returns `forced`, `eligible` or `unsupported-action-space` with the exact candidate count. Hearts has 286 legal three-card passes: code policies retain them all; Jev receives no truncated/factored substitute. Forced choices call no provider. Jev remains off; explicit unavailable/unsupported results never secretly switch a live policy to a code bot.

One saved analysis supplies bot choice and human coach cues. Selected-action claims carry game-owned predicates/evidence, exceptions and applicability. Display preferences and entitlement affect exposure, not computation. A changed action invalidates reasons tied to the old selection; facts-only or several reasonable choices remain legitimate. Original snapshots survive resume and newer policy registration.
