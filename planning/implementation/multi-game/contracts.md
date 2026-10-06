# Multi-game implementation contracts

Target interfaces for [the main plan](../../../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md). **M01 foundation implemented 5 October 2026:** typed modules/facade, registration and document codecs, closed public fragments, demo/access/coached-unit DTOs, game-owned reasoning facets and the client platform declaration. M02 supplies the current Hearts/Spades modules and V1 compatibility dispatch; [M02 evidence](../../../qa/implementation/multi-game/m02/status.md) records its acceptance. V2 persistence and HTTP/client activation remain M03–M04. Existing game records, rule profiles and policy pins remain immutable. Keep the current `web` workspace and lockfile; these are dependency boundaries, not new packages or services.

## Production module boundary

**Go implementation update, M04B:** [the generic facade](../../../server/internal/gamekernel/session.go), [installed registry](../../../server/internal/sessions/registry.go) and game-owned session adapters implement the frozen M02 lifecycle and public projections alongside the original V1 snapshot API. [M04B evidence](../../../qa/implementation/multi-game/m04b/status.md) compares full preparation digests/analyses, documents, views, events and import boundaries. The registered view is still a game-owned table fragment; the owner/revision/control/access/decision platform envelope and durable service composition remain M04C and later M04 work. No new public DTO fields or implicit V1 conversions are introduced.

**Backend amendment:** [CR-ARCH-003](../../decisions/CR-ARCH-003-backend-stack-and-system-readiness.md) retains these semantics and the compiled M01/M02 TypeScript reference while targeting Go/PostgreSQL. [M02A](backend-readiness.md) freezes language-neutral wire, digest, RNG and numeric behavior before porting. The proposed declarations below use TypeScript notation for explanation; they are not permission to add future backend implementations only in TypeScript. Public JSON schemas remain authoritative in both languages. Separately versioned platform/session/decision records and an immutable replay anchor must be defined before M03 activates the currently closed `2.0.0` module envelope.

Create `web/server/game/kernel/module.ts` and `web/server/game/kernel/session.ts`. Move the independent seat/competition definitions into `kernel/seats.ts` and retain compatibility re-exports for frozen consumers. Seat IDs retain the current 0–3 mapping; turn order is module-owned, not numeric increment in shared code.

The declarations below explain the frozen boundary; the exported types in `kernel/module.ts` and `kernel/session.ts` are the compiled source of truth. Public `RegisteredActorPacket`, `RegisteredSessionView` and `RegisteredAnalysis` are generated closed unions described below. Domain state/action types are independent of HTTP DTOs. M02 installs the current games and their exhaustive decoder in `games/registrations.ts`; `records/game-document-codec.ts` parses the envelope without importing installed games. [CR-ARCH-002](../../decisions/CR-ARCH-002-current-game-module-extraction.md) records this placement and the V1 compatibility boundary.

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
type AccessUnit = { id: string; kind: string; atAdmissionBoundary: boolean };
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
  accessUnit(state: S): AccessUnit | null;
}
```

`Q` contains typed request/result variants owned by the game, such as a complete shuffled deck; no shared deck size or rank ordering. The factory parses configuration before calling `create`. `projectEvent` output is validated by the module's closed actor-event schema; it is not an unvalidated public JSON blob. Codecs reject unknown fields, malformed cards, unsupported pins and non-finite numbers; they never strip sensitive fields to make an observation pass.

`accessUnit` exposes only stable game-owned unit identity/kind/admission boundaries, not permission or private state. M04's server policy decides access. Current Hearts/Spades map their existing coached hands; a new game must declare its own unit instead of inheriting a 13-trick assumption. The ID is stable within that session across reloads/offer changes. This is the CR-IMPL-004 launch-policy seam, not billing inside the reducer.

### Binding heterogeneous modules without unchecked casts

Create `web/server/games/registrations.ts` with an exhaustive `(gameId, moduleVersion)` decoder. Each branch parses the matching saved payload and calls the generic factory below **inside that branch**. Do not erase a registry to `Module<unknown,...>` or cast unrelated state/action unions together.

`bindSession<S,O,A,E,Q,C,V,F,G>(module, state, registrationAdapters): BoundSession` captures `S` in its closure. `RegistrationAdapters<S,O,E,Q,C,V,F>` supplies `chanceCodec: Codec<Q>`, `eventCodec: Codec<E>`, `packet(input: O, candidates: readonly {id: string; public: C}[]): RegisteredActorPacket`, `view(view: V): RegisteredSessionView`, `analyze(input: O, facts: F, policyId: string): Promise<{candidateId: string; analysis: RegisteredAnalysis}>`, and `document(state: S): Json`. Public adapter results are schema-validated before return; private encoding is validated before save. Shared services receive only this facade:

```ts
interface BoundSession {
  readonly pin: Pin;
  node(): Node<Json>;
  accessUnit(): AccessUnit | null;
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

M01 defines `RegistrationDescriptor` in `kernel/registry.ts`: immutable `gameId`, `moduleVersion`, supported variants with rule profiles/competition, schema IDs, required engine/UI capability IDs, supported table types, supported horizon IDs and default policy pins. Capability IDs refer to installed handlers, not Boolean feature claims. M02 supplies each concrete typed registration and its `initialChanceRequest(config): Q` in `games/registrations.ts`; these pure module capabilities do not activate V2 HTTP/client routes.

The same exhaustive registry exports `createRegisteredSession(selector, rawConfig: unknown, rawMaterial: unknown): BoundSession`, `decodeDocument(raw: unknown): BoundSession` and `catalog(engineHandlers, uiHandlers)`. `selector` contains exact game/variant/module/rule IDs; only new-session default resolution may fill an installed default. A concrete branch parses its configuration/chance codecs, calls pure `create`, validates state/events and binds it. Startup/catalog verifies all schema IDs/handlers and supported competition/table combinations; missing capability excludes/rejects the variant. The test factory injects a test registration through this same route; production's installed set excludes it. Shared services never invent game configuration or supply a newer version when decoding an old session.

### Persistence and transport

- New document discriminator: `documentVersion: '2.0.0'`, `pin`, `competition`, `controllers`, validated module payload and separately versioned journal/audits. Competition stays exactly four individual seats or two pairs. Controllers initially allow the existing practice table only; four-human play is not activated.
- Legacy document without the discriminator goes through a strict V1 decoder and its original reducer/reader. Preserve `action`, `collect`, `next-hand` journal entries, revision boundaries, deals and original advice. Unknown/ambiguous versions allow original-data export/read-only display where supported and reject gameplay; never select the newest installed module.
- Keep `web/shared/contracts.schema.json` as the **only active public schema root**. Store each new game branch once in `web/shared/games/spades.schema.json`, `hearts.schema.json`, `tarneeb.schema.json` or `trix.schema.json`; the root references those authoritative public fragments. Extend the existing generator to resolve only these registered public references and generate closed V2 packet/view/analysis unions alongside frozen V1 definitions. Private schemas live under each server game and are never bundled into public artifacts. Do not copy the root historical `contracts/` pack into the active DTO pipeline.
- `NewSessionRequest` gains a validated registered game/variant selector. Existing `mode` requests map to their frozen registrations. Action requests discriminate V1 action payloads from V2 `candidateId`; reject mixed fields. Responses expose their public schema discriminator. Review renders each original schema via its corresponding adapter.
- Existing code profiles remain default. A module-owned compatibility policy adapter may call frozen Spades tactics with the original safe observation format. Keep its bytes/choices attributable; do not modify the frozen pack or claim a stronger profile because plumbing changed.
- Hearts sealed passing initially retains one frozen atomic bundle in practice mode. All seat inputs precede all exchange mutations. No separate submission is exposed. A later separately persisted barrier requires a new journal/job version and logical identity `(game, revision, window, seat, purpose)`; today's `jobs UNIQUE(game_id,revision)` must not be bypassed.
- At an automatic node, no policy decides the operation. New/redeal chance consumes privately persisted random material; confirmation before the next round remains a human control. Retain existing pause/advance behavior and separate collection revisions for V1.

M03 implements the [platform record contract](backend-readiness.md#platform-records-and-replay-before-v2-activation), including session reasoning-policy pins, original actor packets/full analysis/advice, exposure, control/access admission metadata and opening configuration/chance anchor. The current module envelope/audit alone does not carry or validate all these fields. Use explicit separately versioned records and validated bindings; do not append undeclared fields to `2.0.0`. Issued prepared receipts are immutable, starting access generation is captured before computation, and owned accepted-command reconciliation remains available after preconditions for new work change.

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
  maxSamplerOperations: number; maxSetupOperations: number;
};
// Runtime port, not a persisted/wire object. CPU code must check it.
type ExecutionContext = {
  cancelled(): boolean;
  remainingMs(): number | null; // null only for declared offline fixed-work runs
  admissionClass: 'live-play' | 'coach' | 'review' | 'offline';
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
    samplerOperations: number; setupOperations: number;
    stoppedBy: keyof RunBudget | null };
  executionStatus: 'completed' | 'budget-exhausted' | 'cancelled' | 'deadline';
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
  budget: RunBudget, comparison: Comparison, provenance: RunProvenance,
  execution: ExecutionContext
): PairedResult;
```

The comparison is game-owned and versioned; `-1` means left is preferred, `0` equivalent and `1` right is preferred. Candidates are resolved from the root actor's permitted packet, including a sealed participant when supported; other sealed choices stay frozen until atomic application. Costs are counted before exceeding their caps. Validate provenance against the installed components; report null selection when no comparison is justified. Payoff does not imply shared partner information.

These M05 budget/context additions are planned, not implemented M01 exports. Freeze the charged sampler/setup operation definitions and memory reservation accounting in M02A/M05; observed process memory is a separate measurement from deterministic reserved workspace. Guard every root, continuation and next-world operation, including terminal roots. Operational interruption covers setup, sampling, facts, cloning and encoding, not only the rollout loop. A canceled HTTP wait does not establish that its command was uncommitted. Store stop reason/partial coverage and recheck original authorization before publication; never silently downgrade a pinned policy to meet a deadline. See [work limits](backend-readiness.md#work-limits-and-operational-interruption).

Sampling weight is finite and positive on every hard-feasible holding under the declared soft model; zero/invalid weight cannot silently turn a possible holding into an exact impossibility. Uniform sampling uses weight 1. Persist provenance, coverage and terminal/cutoff distinction with the decision, not only a free-text assumptions array. Uncertainty is absent rather than invented when an estimator cannot supply a justified interval.

Compare candidates on the same completed worlds. If a world cannot complete all compared candidates, keep its work/trace but exclude it from terminal paired arithmetic. Report completion-conditioned estimates, missingness and model assumptions; uncertainty does not cover model bias. A cutoff value is a named heuristic, never a finished outcome. No independent perfect-information optimization of future actors is permitted. ISMCTS requires a separately versioned information-set experiment, not a renamed flat rollout.

## Provider and coach contract

`providerEligibility(packet)` returns `forced`, `eligible` or `unsupported-action-space` with the exact candidate count. Hearts has 286 legal three-card passes: code policies retain them all; Jev receives no truncated/factored substitute. Forced choices call no provider. Jev remains off; explicit unavailable/unsupported results never secretly switch a live policy to a code bot.

One saved analysis supplies bot choice and human coach cues. Selected-action claims carry game-owned predicates/evidence, exceptions and applicability. Display preferences and entitlement affect exposure, not computation. A changed action invalidates reasons tied to the old selection; facts-only or several reasonable choices remain legitimate. Original snapshots survive resume and newer policy registration.
