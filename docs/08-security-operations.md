# 08 — Security, privacy and local operation

## A. Threat model

This is a low-stakes coaching pilot, not a wagering platform. It still handles a paid API credential, private per-seat information, browser identities and mutable game state. Protect against cross-guest access, hidden-card disclosure, command tampering/replay, request floods, malicious strings, leaked provider credentials, corrupted persistence and stale worker responses.

Treat the browser and model response as untrusted. Guest authorization is checked on every resource lookup, including review, reveal, fork, progress and delete. A guessed UUID cannot grant access. Web views are allowlisted projections. A browser inspection must not reveal opponent hands before an authorized post-hand reveal.

There are no user-supplied prompts, arbitrary URLs, uploads, chat or executable lessons in v1. Provider prompts contain fixed authored instructions and structured engine facts only. Escape text in the UI, enforce a restrictive CSP, reject oversized JSON, and never evaluate model output as code or HTML. The adapter's egress host is fixed; do not expose a proxy endpoint accepting arbitrary provider URLs.

## B. Secret and mode configuration

The `.env.example` is a planning template, not a working secret file. `TYPESAFE_API_KEY` is server-side only and must never use a `VITE_` prefix. Do not request that an owner paste keys into chat, commit them, embed them in frontend builds, or print them in test logs. The owner supplies credentials through local environment or the chosen host's secret mechanism during implementation.

`AI_MODE=jev` selects live integration. Missing credentials produce a clear blocked-live status, not success and not automatic demo. `AI_MODE=demo` selects deterministic development behavior. Both environments must visibly identify the source of play. The actual app should refuse configuration combinations that imply a Jev session is playable without a key.

Pin model, prompt and feature versions. Keep the provider origin non-user-configurable in production. Configure timeout, max retry count, global concurrency, per-guest limits and daily input-token ceiling. When usage ceilings are exceeded, pause new decisions and preserve sessions. Do not bypass a budget with undocumented fallback accounts or models.

## C. Initial safeguards and limits

Proposed pilot defaults: ten active sessions, four concurrent provider requests, 60 state-changing requests per minute per guest, 600 safe reads per minute per guest, 32KB client command bodies, and 30-day data retention. Rate-limit guest creation by a trusted client-address mechanism behind the reverse proxy; never trust arbitrary forwarded headers. Tune these numbers from load tests.

A guest can resume several sessions but only one bot turn per session applies at a time. Cap queued advice per guest, prioritize bot decisions and cancel obsolete speculative work. Add process-wide provider error/usage counters and a manual pause toggle. Circuit breaking is distinct from deleting games or changing their mode.

## D. Deployment reference

Develop locally first. Future required commands are `pnpm install`, `pnpm dev`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `pnpm start`, implemented by the coding agent. They do not exist in this specification-only pack.

Build one non-root container with a pinned supported Node image, compiled web/API assets, production dependencies only, health/readiness endpoints and graceful shutdown. Use a persistent local volume for SQLite; no ephemeral filesystem, network share or multiple writable replicas. A reverse proxy terminates TLS and sets body/request limits. Bind the backend privately when behind that proxy. The SQLite suitability reference is research R17; this specific single-instance choice is ours.

On shutdown, stop leasing jobs, bound waiting for in-flight work and leave uncommitted jobs recoverable. On restart, verify migrations, recover expired leases, check snapshots and resume legal pending turns. Never replay provider calls from raw logs as game commands.

Create backups with a SQLite-safe backup mechanism, not by copying a live database file while ignoring its WAL. A restore exercise is a release test. Local development may use disposable fixtures; production backup access is restricted and backup expiration matches the documented retention schedule. No Kubernetes or cloud-specific managed service is needed for the pilot.

## E. Observability and error budgets

Expose lightweight liveness and readiness checks. Readiness reports database/migration health and configured mode, without secrets. A temporarily unavailable provider should be visible as dependency degradation, not trigger a container restart loop that loses all progress.

Collect decision latency including retries, provider errors, invalid responses, stale discarded decisions, queue age, input-token usage, forced-action count, state conflicts, unauthorized access denials and deletion/cleanup results. Aggregate by model/prompt/feature version and decision kind. Do not log private deal payloads by default.

Initial targets: p95 local command processing under 150ms excluding model work; p95 strategic advice under 2.5 seconds at ten active sessions; hard request-group deadline four seconds. These are targets to test, not claims about Jev or the eventual host. Fail gracefully when missed; game correctness outranks animation or speed.

## F. Privacy and deletion

Explain that card-game observations are sent to TypeSafe and browser-linked progress is retained on the app server. No name/email is required. Provider non-training language must not be rewritten as a universal zero-retention guarantee; current terms require review (research R02).

Offer session deletion and full guest deletion. Remove descendants, decisions, observations, attempts and identifiers; cancel outstanding jobs so a late response cannot recreate data. Backups expire on a declared schedule, so do not promise instantaneous removal from every historical backup. Do not enable third-party behavioral analytics for v1.
