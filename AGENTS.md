# Instructions for implementing agents

This repository begins as a specification, not an implemented application. Implement only after the owner initiates the build. Preserve the researched decisions and report actual evidence, not planned tests as completed tests.

## Authority and reading order

Read `docs/12-multi-game-extensibility.md`, `README.md`, `docs/11-decisions-risks.md`, `docs/02-rules.md`, `docs/03-architecture.md`, `docs/04-jev-integration.md`, and the packet for your assigned work in `prompts/AGENT-WORK-PACKETS.md`.

Priority: explicit subsequent owner decision → numbered ADR/change record → normative rule specification → contracts plus their documented semantic invariants → other design documents → examples. A contradiction is a defect, not permission to silently choose a convenient meaning. Record and resolve it before depending on it.

“MUST” is a release requirement. “SHOULD” permits a documented reasoned exception. “MAY” is optional. All new public behavior needs a requirement ID, acceptance evidence and a changelog entry.

## Hard boundaries

1. Owner update, 7 October 2026: production bots always use deterministic code, with no runtime AI/learned decision model or provider calls. The coach currently shares that deterministic decision system. Offline LLM agents may review lab evidence; any future model assistance is coach-only, with selection, training and integration deferred. Jev exploration is removed from the active feedback-lab scope. See [CR-STRAT-011](planning/decisions/CR-STRAT-011-deterministic-feedback-lab.md). Owner update, 11 October 2026: [CR-STRAT-012](planning/decisions/CR-STRAT-012-offline-trix-scenario-collection.md) permits Luna Max players solely in the separate offline Trix discovery collector. It does not authorize production model decisions, training or automatic promotion.
2. Rules, arithmetic, legal actions, trick winners, score, features, permissions and state transitions are code. No model decides whether a card is legal.
3. No hidden-hand leakage. The provider adapter accepts a seat-scoped observation, never an authoritative game aggregate. Build output objects by allowlisting fields, not by deleting a few fields from a full aggregate.
4. No fictitious confidence, model results, expertise, calibration or passing tests. Demo output must be marked `demo`; forced moves must be marked `forced`.
5. No runtime “best move,” “blunder,” “accuracy,” or winning-probability display based solely on Choice probabilities. Do not grade the model against itself.
6. All state changes are authorized, version checked, idempotent and persisted. Never hold a database transaction open during a provider call.
7. Card art, teaching text and layout must be original or clearly licensed. Do not copy Chess.com or another card application's assets.

## Build discipline

Use the workspace/package boundaries in the architecture. Start with G0/G1. Freeze DTOs before parallel UI/backend work. Work in small, reviewable milestones. Every milestone must end with executable instructions and a report distinguishing passed, failed, blocked and not-run checks.

Public API schemas are the contract source of truth; generate TypeScript types and validation artifacts from them, or document a lossless generation strategy. Do not maintain three unrelated copies of the same DTO. Domain-state types remain independent of HTTP transport types.

Use strict TypeScript and no unchecked `any` across boundaries. Test deterministic reducers without network or clock access. Input validation must not silently strip unexpected sensitive fields at the model boundary. Preserve test seeds on failure. Test provider failures through fixtures rather than real outages.

Keep API keys in server-only environment/secrets. Never ask the owner to paste a key into a repository, a browser setting, or a chat transcript. Live tests may use an already provisioned server environment variable; otherwise mark them blocked.

## Completion report

Report the implemented requirements and commit references; exact test commands and results; real/demo provider mode; observed model ID; known defects; evidence locations; and the next unfinished milestone. Do not say “full working Jev app” when only fixture mode ran.

## Change control

Record the reason, alternatives, compatibility impact, affected tests and owner approval for changes to the rule profile, hidden-information policy, runtime AI boundary, scoring, or scope. Versions of rules, features, prompts, models, lessons and event schemas must travel with their data. Never rewrite historical advice with a newer model and present it as the original advice.

## Owner-approved extension and visual constraints

Do not put Spades bids/trump/NS-EW scoring or a universal partner assumption in shared services. Shared platform supports exactly four seats with either individual competition or two teams of two. Each module declares supported variants and capabilities. Adding a game is a typed, tested code module—not arbitrary JSON instructions loaded from a user. Ship only Spades in the initial catalog and add the test-only individual seam test.

Use a minimal responsive table with semantic cards and four simple icons/avatars. Do not introduce 3D graphics, animated characters, image generation, elaborate visual effects or an avatar customization subsystem.

## Local authentication development

Owner authorized Keycloak implementation on 16 October 2026. Read [the human and agent setup guide](docs/development/local-auth.md) before changing authentication, local services or identity-related tests. Keep Go, Vite and PostgreSQL native; run Keycloak in the dedicated Podman container. Use the separate real-auth entrypoint and generated auth contract; never enable hosting by weakening the existing fixture guards. Preserve existing native game databases and unrelated containers. Local credentials, certificates and email capture live under ignored `.local/auth/` and must never enter tool reports or Git. Use focused critical-path tests and report real-runtime evidence separately from mock results.
