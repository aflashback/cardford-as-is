# Compatibility, requirements and verification map

Proposed acceptance requirements for [the main plan](../../../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md). **No requirement below is marked implemented by writing this file.** M00 records the numbered change decision and indexes adopted IDs without replacing earlier game requirements.

| ID | Required behavior | Task / primary evidence |
|---|---|---|
| MG-01 | Versioned typed modules and validated configuration; exact four-seat competition/controller separation | M00/M01; module-contract tests, rule dossiers |
| MG-02 | State, phase, direction, deck, action, score, objective and presentation are game-owned | M02/M08/M09; module parity/new-game rule tests |
| MG-03 | Closed generated public schemas; independently validated private state on load/save | M01/M03; generation checks/document/storage tests |
| MG-04 | Production service/persistence/replay use the bound module, not a bypass interface | M02/M04/M06; actual module-production tests |
| MG-05 | Every commit retains ownership, lease, expected revision, idempotency and prepared-work fencing | M03/M04; two-instance/retry/stale tests |
| MG-06 | Supported controls and complete user journeys precede catalog exposure; unsupported modes fail closed | M04/M06/M08/M09/M12; capability/service/browser evidence |
| MG-07 | Policies receive own/public/retained permitted information only; no actual concealed deal or private partner memory | M05/M06/M10; actor invariance/reveal/continuation parity tests |
| MG-08 | Explicit actor/sealed/automatic/chance nodes, game horizon/payoff/comparator, bounded work and honest cutoff evidence | M05/M06/M09; horizon/budget/genericity tests |
| MG-09 | Legacy journals, policy pins, original packets/analysis/advice and exposure attribution survive unchanged | M02/M03/M04/M09; immutable hashes/replay/review tests |
| MG-10 | Typed versioned case trigger, proof, exception, effect, claim, cue, provenance and conflict resolution | M07/M10; catalog/counterexample/selected-action tests |
| MG-11 | Research completeness/duplicates/labels/occurrence/strategic confirmation stay distinct; coach visibility never alters analysis | M07/M10–M12; ledger/visibility/independent evaluation |
| MG-12 | Standard selected Tarneeb/Jawaker profiles only; new variant requires its own rules/objective/evidence | M00/M08/M09; frozen rule sources/scoring fixtures |
| MG-13 | Independent per-variant/horizon evidence gates playing-strength, calibration and learning claims/promotion | M11/M12; sealed manifests/gate/human study and owner decision |
| MG-14 | Jev only runtime strategic model; forced/off/unsupported/capped calls send nothing, all legal options retained | M06/M11; provider fixtures/ledger/eligibility tests |
| MG-15 | Online finite demo: every frame/choice/replay requires a validated server response; no offline continuation | M01/M04; demo-service/demo-online tests |
| MG-16 | Configurable verified free/access-trial/paid grants by exact game/variant; play/coach/read separation and stable quotas | M01/M03/M04; access-policy/access-offers tests |
| MG-17 | One React frontend and public assets with isolated transport/lifecycle; native feasibility remains explicit and deferred | M01/M04/M12; client-boundary/resume tests and later device evidence |
| MG-18 | First playable web slice has private correct play, durable recovery, bounded failure/work and usable keyboard/touch controls | M04/M06; basic quality checklist and current-game journeys |

## Migration and rollback

| Layer | Compatible migration | Regression / rollback boundary |
|---|---|---|
| Current rules | Same frozen Hearts/Spades profiles behind versioned registrations | Exact score/legality/replay goldens; new semantics require new profile, never overwriting old |
| HTTP | V1 requests/views still accepted; V2 is discriminated, candidate-ID based | Reject mixed bodies; no reinterpretation under header guessing; current UI retained until integrated V2 adapter |
| Saved document | Decode missing discriminator through strict V1 reader; new sessions use validated V2 | No bulk history rewrite; unknown/ambiguous versions read-only/export-safe; don't backfill original analysis |
| Journal | V1 action/collect/next-hand operations retain their original revisions | New automatic batching is a different engine/journal version and cannot replay V1 |
| Policy | Existing defaults and pinned selectable profiles remain available | Never change an existing game's pin on restart; old code/snapshot remains installed or gameplay fails closed |
| Jobs | Keep current practice atomic bundles and existing attempt/access fences | Separate per-seat sealed work requires explicit new persistence identity and migration; no disabling uniqueness to make it run |
| Views/exports | Independently project safe actor data, public statistics and original permitted advice | Private bot audit/deal/hash and partner notes never enter public APIs; optional future reveal does not contaminate earlier packets |
| Trials | Versioned branch reducer and original exposed-future provenance | New future actions require new safe decisions; no replaying original divergent future blindly |
| Archives/gates | All raw source hashes and consumed held-out ledgers remain immutable | Derived reports get separate versions; no erased failed result or recycled held-out seed |

Rollback disables new session creation for the affected registration/policy and keeps installed compatible readers for its saved sessions. It does not point an existing session at the newest/previous policy or delete data. If code cannot safely resume that pin, provide explicit read-only review/export through its supported projection. Revert a failed migration before public activation; after activation use a forward-compatible repair rather than removing persisted schema support.

Additive private document/schema changes do not automatically require a SQL migration. Do not edit the checksummed five existing migration files. Any future per-seat job/reveal protocol migration must be a new SQL file with compatibility/concurrency tests. PostgreSQL remains the database; old SQLite prose and the original Spades-only scope are superseded by CR-IMPL-001–003.

## Reviewable milestone record

`qa/implementation/multi-game/status.md` tracks `not-started`, `in-progress`, `passed`, `partial` or `blocked`, with dependency evidence. Every milestone writes an evidence JSON/Markdown pair containing requirement IDs, commit/hash, exact commands/exit statuses, passed/failed/skipped counts, failure seeds, observed provider mode/model, schema/profile/policy/continuation versions, defects and next unit. A fixture response is marked synthetic; a counter-module test is conformance, never strategy evidence.

For this planning pass, reviewers inspected source without executing product tests, games or providers. Validation is limited to documentation links, existing versus planned path inventory, requirement coverage, declared interface/fixture consistency and `git diff --check`. The implementation commands above are future acceptance gates, not results from this plan.

## Independent review incorporated

The architecture planning agent (Astra, extra-high) checked production dispatch, unknown-row validation, V1 collection journals, sealed Hearts and 286-choice eligibility. The reasoning planning agent (Sol 6.1, extra-high) checked default policy preservation, missing token/genericity evidence, actor projection/horizons, source-ledger separation and confirming/human gates. Their review is planning input, not a performed integration test. The integrator verified the actual `providers/openrouter.ts` path and five migration filenames, correcting guessed paths before producing the plan.
