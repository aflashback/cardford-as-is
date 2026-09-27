# Bounded subagent assignments

All agents inherit root `AGENTS.md`. Read the relevant specification before editing. Report changed files, tests actually run, interfaces affected, unresolved assumptions and exact handoff needs. Never merge conflicting schemas independently.

## Lead integrator

Own root workspace, dependency lock, contracts, shared types and decisions. Coordinate W00–W08, approve interface changes, maintain a green integration branch and acceptance traceability. Begin with G0/engine, not decoration. Review every “complete” claim against evidence and separate real Jev from fixtures.

## Engine and observation agent

Own `packages/game-kernel`, `packages/observations` and the deterministic/observation parts of `games/spades`. Implement document 12’s module contract and the test-only four-individual conformance module. Implement the frozen rule profile, legal actions, pure reducer, scoring, state transitions, deterministic replay and safe projections. Inputs: documents 02/03/07/09, rule profile and golden cases. Prove conservation and scoring properties; test that hidden-hand permutations cannot change provider payloads. Do not implement network calls or create strategic ground truth by heuristic.

## Jev integration agent

Own `packages/decision-policy`, versioned runtime instructions and provider contract tests. Use the documented `state/questions/criteria` structure and pinned model, not a guessed chat-completion endpoint. Implement strict candidate/response validation, deadlines/retries, telemetry and the labelled basic demo policy. Produce G0 findings from authenticated calls only when available. Do not emit prose rationales or read the full game aggregate.

## Backend agent

Own `apps/server`, SQLite migrations, guest security, commands, jobs, safe views, historical review and branch persistence. Follow document 07 and OpenAPI. Prove idempotency, owner checks, restart recovery, deletion races and no transaction held across HTTP calls. Do not return opaque full-state JSON or put secrets in client responses.

## Frontend agent

Own `apps/web`, `packages/ui-table` and Spades presentation adapters. Use the same four-seat shell for individual/team configurations. Keep avatars as icons/initials; no decorative rendering engine. Build the phone-first coaching table, start/resume, bidding, confirmed card selection, scores, error/reconnect states, review and exercises. Use only safe typed API views. Follow document 06; no hidden cards in source, no tiny inaccessible fan, no placeholder-only core screens. Use an obvious demo badge when fixtures are used. Do not implement an independent authoritative scorer.

## Coaching and content agent

Own shared interfaces in `packages/coaching`/`packages/content` and Spades-owned original lessons/templates/drills in `games/spades/content`. Namespace skills by game. Author original predicate-backed feedback, staged hints, twelve complete tested drills and skill progress rules. Preserve the separation of fact, exercise answer and Jev suggestion. Work with the engine agent to prove accepted answers. Do not copy commercial lessons or invent model reasoning. A drill specification is not complete until its playable fixture and accepted-set tests exist.

## QA and evaluation agent

Own integration/E2E/property/evaluation harnesses and independent evidence. Design tests early, then run the staged strategy and UX evaluations. Test ambiguous advice, nil/bags, hidden-information leaks, outages, duplicate commands, mobile/zoom/keyboard and full journeys. Record skipped live tests explicitly. Do not let the same model's confidence serve as the truth label for its quality.

## Merge contract

No agent changes rule semantics, public DTO fields or prompt objectives without a small change request to the integrator. Each handoff identifies a reproducible test command and expected result. Integration means running the combined flow, not assuming separately passing mocked modules compose correctly.
