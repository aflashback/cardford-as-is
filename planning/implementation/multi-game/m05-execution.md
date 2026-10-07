# M05 actor-scoped continuation planning

Date: 2026-10-06. Owner: reasoning. Requirements: MG-07, MG-08, SYS-02, SYS-08, SYS-12. Base checkout: `b822d0d`; integration remains on the current shared branch. No separate checkout or commit was created for this slice.

## Delivered runtime boundary

The new Go packages are `server/internal/strategy/rollout`, `server/internal/strategy/knowledge`, `server/internal/strategy/installation`, and the explicit current-card-game compatibility adapter `server/internal/games/cardcontinuation`. TypeScript remains the frozen reference. Existing policy pins and default selection remain unchanged. The optional profile uses the existing service routes and public schemas.

`cardcontinuation.Evaluate(ctx, permittedObservation, config)` returns the complete private `rollout.PairedResult`. `Config` declares the work budget, separate world/actor/chance seeds, horizon and admission class. `DefaultConfig()` is an explicit experimental configuration for `actor-rollout-2.0.0`. It compares all legal candidates on two synthetic worlds through the end of the current scored round. It supports all 14 Spades bids and all 286 Hearts passes.

The generic referee owns synthetic state and production transitions. `ActorPolicy.Choose` receives only `ActorInput`, its own `ActorMemory`, a seed derived from permitted information, the context and the work meter. The Go port adds cooperative context/work arguments and a referee memory-reconstruction method to the language-neutral contract. Neither actor policies nor the runner import a game implementation. The concrete adapter owns the explicit Hearts/Spades differences.

Hearts passing projects every participant before collecting choices and applies exactly one production pass bundle. Other participants' selections are reproducible across compared root candidates because their frozen inputs and seeds remain identical. Hypothetical private pass memories are reconstructed consistently from synthetic holdings plus public chronology; the root's remembered incoming/outgoing cards remain exact. Generic chronology excludes partner secrets and later reveals.

## Counted work and operational interruption

The deterministic charge units are:

- One world before a sampling request, even for a terminal root.
- One step before an actor commit, atomic sealed commit, automatic operation, round continuation or synthetic chance transition.
- One sampler unit for an outer sample request, each recursive feasibility-count invocation, each enumerated allocation position, each bounded random rejection attempt, and each shuffle draw attempt.
- One setup unit per declared validation, clone, projection/decode, actor facts/policy construction, memory reconstruction, state encoding/apply, horizon check or evaluation callback. The public concrete adapter reserves two additional units before metadata encoding and run-model construction.
- A conservative workspace reservation before sample/model work: 64 MiB for bounded 52-card counting and temporary integers, 16 KiB per permitted event plus 200 continuation events, 4 KiB per root candidate, and 128 bytes per requested world. This is a deterministic reservation, not measured process memory. Inputs exceeding the installed profile are rejected or exhausted explicitly.

Every charged operation checks cancellation/deadline before execution; nested sampler enumeration also checks before allocation. Online classes require a context deadline. Incomplete worlds remain excluded from comparison arithmetic. A result preserves completed-pair coverage and the exact stop reason without silently lowering the requested budget or dropping candidates. Cancellation before model construction returns no selected candidate and no invented input provenance.

## Horizons, scoring and compatibility

The adapter uses immutable production `Snapshot.Apply`/`Project` throughout. There is no separate optimized rules/scoring kernel to prove equivalent. The new bounded play sampler preserves the original feasibility-counting arithmetic and seeded draws; focused tests compare actual sampled holdings with `legacydecision.SampleHands` in all three modes.

Supported scopes are `current-round`, `two-rounds`, and `match-cutoff-two-rounds`, under `card-round@2.0.0`. A scored-round continuation preserves scores/bags and then requests a fresh synthetic shuffle. The match scope is explicitly a named score heuristic unless the actual synthetic match ended. The game-owned comparator minimizes Hearts actor points and maximizes the Spades actor/team score. Uncertainty is absent; sampled score comparisons establish neither calibration nor strategy strength.

Retained actor continuations use `hearts-baseline-1.0.0` and `spades-tactics-2.1.0`. Their observations contain only synthetic own cards, public history and permitted own exchange memory. Existing readers/defaults and the actual production concealed deal remain outside this API.

## Optional installation and durable reasoning

`installation.InstallActorRollout(codec, selectForNew)` installs all three exact policy tuples and executors through `ConfigureNewSessionPolicy`. False restores the original new-session selections while retaining readers/executors for saved rollout games. Repeated installation is idempotent and never replaces an installed executor. The external composition avoids an import cycle with the game engines. The parent integrator wires CLI selection and the service scheduler; this packet verifies that integration through real asynchronous HTTP and database calls.

The existing strict original-analysis envelope gains an optional typed `rollout` field. Original profiles omit it, preserving their original bytes. The new profile requires the exact budget, components, observation digest, seeds, two complete paired worlds, every legal candidate, terminal scores and matching selected/public estimates. Unknown fields, altered coverage/provenance/budget, a changed public estimate and hidden-world fields are rejected. Full original advice and all three advice levels derive from the same selected result. Historical reads retain issued bytes, including after restart with original new-session selection.

The named work budget is `actor-rollout-round-two-worlds-2.0.0`. Trusted registration adds operational `ExecutionLimits{Deadline:90s, Lease:95s}` only to the exact rollout tuples. `WorkLimits(module, policy)` and `WorkLimitsForPolicy(policy)` reject unknown/modified tuples; the latter also rejects conflicting limits across modules. Normal policies retain 20s deadlines, 25s leases and a 30s claim maximum. Claiming a longer lease verifies the stored module and full policy tuple. All claims have an absolute 95s bound. These operational limits do not change deterministic work budgets.

Cancellation or incomplete comparison returns no persistable decision. The worker saves rejected/canceled work status and keeps existing access, attempt and revision fences. The runner/error value retains detailed partial coverage for diagnostics; canceled partial result details are not currently persisted in a separate failed-work diagnostics envelope. No database connection belongs inside `Evaluate`.

Full-round Hearts passing is visibly expensive: the real four-actor, two-world sealed preparation took 59.574 seconds in a normal private deal. The existing asynchronous work route exposes waiting while each complete result is prepared. The test confirmed no live revision change during preparation and one atomic commit afterward. Candidate pruning or an undisclosed weaker fallback is not part of this implementation.

## Acceptance and changelog

2026-10-06: added the opt-in Go actor-only continuation machinery, positive-support validation, historical actor memory, complete paired arithmetic, charged sampler/setup/step/memory limits, fresh chance and named cutoff evaluation. Added exact optional installation, strict original decision metadata and per-policy operational limits. Actual asynchronous Spades bids/help/restart, Hearts four-actor sealed commit and durable canceled/late publication checks passed. Commands, timing, limitations and browser acceptance ownership are in [M05 evidence](../../../qa/implementation/multi-game/m05/status.md).
