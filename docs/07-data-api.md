# 07 — Data model, API and state consistency

## A. Contract authority

`contracts/openapi.yaml` describes the client/server boundary. `contracts/decision-observation.schema.json` defines the only local input to a strategic provider. `contracts/decision-record.schema.json` records an accepted recommendation/choice. The provider HTTP subset has separate request/response schemas; do not confuse the local envelope with the vendor payload.

Use JSON Schema draft 2020-12 and OpenAPI 3.1. Generate TypeScript types from the schemas during implementation; do not maintain divergent manual DTO definitions. JSON Schema establishes structure. Domain checks—card uniqueness, turn order, exact candidate membership, phase consistency, probability sum, ownership and scoring—remain explicit program validation.

Card IDs are `C2`…`CA`, `D2`…`DA`, `H2`…`HA`, `S2`…`SA`, with `10`, `J`, `Q`, `K`, `A` as rank suffixes. Seats are `N,E,S,W`. Competition membership is explicit: either four singleton competitors or two two-seat teams. In the Spades module, teams are `NS,EW` and action IDs are `bid:0`…`bid:13` or `play:<cardId>`. These are not hard-coded shared action enums. IDs are stable and not translated. Display labels are separate.

## B. Persisted entities

| Table | Important columns / invariants |
|---|---|
| `guests` | ID, hashed random cookie token, CSRF token, created/expiry/last-seen times; no email/name required |
| `sessions` | Owner, game ID, module version, competition configuration, mode, play mode, lifecycle, module phase, versions, human seat, rule profile, current snapshot, version, parent/fork metadata, exposure flag |
| `hands` | Session/hand index, original private deal, dealer, initial scores/bags, final breakdown; private data never in ordinary API views |
| `events` | Session, monotonic event sequence, commit/state version, type, private payload, actor/source, command ID, timestamp |
| `commands` | Guest/session, UUID, request digest, stored response/status; unique scope prevents double commit |
| `decision_jobs` | Session/branch/version/seat/purpose unique key, frozen observation reference, status, lease, attempts, error class, next-eligible time |
| `decisions` | Frozen observation, choice/distribution, provider and version metadata, timing/usage; source labels cannot be overwritten |
| `advice_views` | Human pre-action version, advice status, decision ID, hint level shown, rendered fact/template IDs |
| `drill_attempts` | Guest, drill/content/rule version, answer, correctness, hint level, retry/exposure flags, timestamp |
| `skill_progress` | Rebuildable aggregate of attempts; never an unsupported model-derived mastery score |
| `schema_migrations` | Applied database migration version and checksum |

Store JSON payloads as validated canonical text alongside indexed relational identifiers. Persist decimal probabilities as returned numbers, not rounded display values. Use UTC timestamps and integer counters. Server event logs contain private deals; never expose them directly to the browser or ordinary logs.

A retry branch uses a new session ID and branch ID, references the parent and materializes the fork state. Parent records are immutable. Deleting a root session deletes its owned descendant branches, jobs and derived advice in a transaction or recoverable cleanup job. Guest deletion removes all owned data and invalidates the cookie.

## C. API surface

All paths begin `/api/v1`. Health checks are separate from business responses.

| Method/path | Purpose | Important behavior |
|---|---|---|
| `POST /guest` | Create or resume browser guest and return CSRF token | Origin checked; secure HttpOnly cookie; rate limited |
| `GET /games` | Registered supported games and capabilities | Only implemented/enabled games; no selectable future placeholders |
| `POST /sessions` | Create a guided/practice hand or match | Select game, approved rule profile, supported competition, immutable `jev` or `demo` mode |
| `GET /sessions/{id}` | Current human-safe view | No store; private cards excluded; includes worker/advice status |
| `POST /sessions/{id}/actions` | Confirm human bid/card | UUID idempotency; expected version; legal action only |
| `POST /sessions/{id}/hints` | Record/reveal hint stage | Same frozen pre-action advice; does not change game version |
| `POST /sessions/{id}/next-hand` | Advance a nonterminal match | Hand must be complete; rotates dealer; increments version |
| `POST /sessions/{id}/retry-decision` | Retry a failed current bot/advice job | Bounded cooldown; no new game action until validated |
| `GET /sessions/{id}/review` | Public-history review and recorded human advice | Completed hand only in v1; no hidden-card disclosure |
| `POST /sessions/{id}/reveal` | Explicit hindsight review of complete hands | Records exposure; returns owner-authorized full-hand reveal |
| `POST /sessions/{id}/fork` | Retry before a historical human decision | New session; no edits to parent; server computes exposure |
| `DELETE /sessions/{id}` | Delete owned session and descendants | Cancels pending work; deletion is idempotent |
| `GET /drills` | Game-filtered original drill catalog and current progress | No hidden answer key; required gameId query |
| `GET /drills/{id}` | Safe exercise view | Complete authored fixture lives server-side |
| `POST /drills/{id}/attempts` | Submit exercise answer | Server computes result; idempotent attempt UUID |
| `GET /progress` | Game-filtered skill/progress view | Required gameId; separates assisted, repeated and unaided attempts |
| `DELETE /guest/data` | Delete this guest and all owned data | Requires CSRF; clears cookie |

A session view contains game/module/competition identity, session/branch IDs, mode, play mode, lifecycle, module phase, state version, rule version, human seat, public state, own hand, currently legal human actions, bot-job status and advice summary. It never includes the other hands. During a bot turn, the human legal action list is empty. During bidding, unannounced bids are null. An observation sent to Jev is for the currently deciding seat, which may differ from the human view.

Review advice is optional: unavailable or unfinished advice stays unavailable, not reconstructed from hindsight. Review returns one item per human pre-action decision, including bid decisions, with the actual action, safe original observation and optional accepted decision/advice. The frontend does not receive bot-private observation snapshots.

## D. Concurrency and failures

For game-changing requests, `commandId` is a UUID and `expectedStateVersion` is an integer. Validate body, authorize ownership, then check command deduplication before applying the version check. A retry of a committed identical command returns its original result even if the current session has advanced. A duplicate ID with different body is 409. Use fresh commands only for genuinely new actions.

Return 400 for malformed requests, 401 for no valid guest, 404 for unavailable or not-owned resources, 409 for stale phase/version or conflicting IDs, 422 for an illegal action or invalid domain input, 429 for app limits, and 503 for unavailable configuration/service where appropriate. Use a typed problem body with `code`, safe `message`, `requestId` and optional current version. Never include provider keys, stack traces or hidden state.

Failed background decisions are reported in the session's job status, not as a failed GET. `retry-decision` schedules work only for the unchanged original job version. Stale jobs are cancelled or discarded. Delete/expiry and worker apply race through the same transaction preconditions.

## E. Guest security and lifespan

Use a 256-bit random bearer cookie, store its hash, and enforce a 30-day guest lifetime. `HttpOnly`, `SameSite=Strict`, `Secure` in production, root path and no permissive domain. The development exception for non-TLS localhost is explicit. Credentials use same-origin requests; CORS is disabled except for a narrowly configured development proxy.

`POST /guest` validates the Origin and returns a per-guest CSRF token. All subsequent state-changing requests require `X-CSRF-Token` and an allowed Origin; GET endpoints are read-only apart from ordinary access telemetry. Existing guests may retrieve the same CSRF token through the checked bootstrap endpoint. Never put the bearer cookie token in local storage, URLs or provider inputs.

Expired guest data is removed by a daily local cleanup pass. Deletion and backup retention are documented in operations. This is single-browser continuity, not authenticated cross-device identity; adding accounts later requires a separate design and migration.

## F. Migration and traceability

Every session, observation, lesson attempt and decision records the relevant versions. API major version is `/v1`, schema baseline `1.0.0`, project spec `0.2.0`, rule profile `spades-training-1.0.0`, prompt `jev-decision-1.0.0`, and feature set `spades-facts-1.0.0`. These strings have different responsibilities; do not replace all of them with one application build number.

The implementation's database migrations and generated OpenAPI types are tested in CI. Golden fixtures refer to a rule profile explicitly. Contract changes require a schema/example update, an ADR or change note, and regression tests. Opaque server state and arbitrary JSON are not permitted shortcuts for client-facing objects.

## G. Module-aware transport

Public `gameData`, actions and observation payloads are discriminated unions generated from registered game schemas, not unrestricted `Record<string, unknown>` JSON. New union members are intentionally additive at release time. The server rejects an unsupported game/rule/mode/capability combination with `422 UNSUPPORTED_GAME_CONFIGURATION`; the UI cannot make it supported by setting a Boolean. Unknown module versions in saved sessions are read-only or unavailable, never interpreted using the newest rules.

Generic candidate envelopes contain an ID and a typed payload. `/actions` sends only the candidate ID, command ID and expected version; the server resolves the payload from the authoritative legal set. This prevents a client from forging a multi-card payload. The initial schema union includes only Spades. The extension test schema belongs in tests, not the production catalog. Namespaced skill IDs and game/module version fields prevent progress and cache collisions between games.

`POST /sessions` and `/fork` also accept command IDs so an ambiguous retry cannot create duplicate sessions/branches. Advancing a hand in a match is the current API label for advancing a completed module round; a later terminology change is additive or API-versioned.

## H. Session catalog and assistance integrity

`GET /sessions` returns owner-only session summaries, newest-updated first, with an opaque cursor and a bounded page size (default 20, maximum 100). It exposes game, phase, mode and score summaries, not private hands. This powers Home/resume after a reload without depending on client-stored session identifiers.

For a still-unplayed human decision, `suggestedActionId` and recommendation-specific notes must stay null/omitted from the returned advice until hint stage 3. Sending the answer and hiding it with CSS is not an acceptable learning boundary. Stages 1–2 contain only their intended concept/facts. After the action is committed, feedback and completed-hand review may show that historical suggestion without retroactively marking the earlier attempt as assisted. Advice jobs can finish regardless of hint exposure.

`POST /drills/{id}/hints` accepts an attempt UUID, exact content version and stage, records the exposure server-side, and returns only that stage's authored text. The first hint can create a pending attempt record; submitting an answer creates or finalizes that same owned attempt. An attempt UUID cannot be reassigned to another drill, content version or owner. A completed attempt cannot be overwritten. The submit body's reported hint stage is informational: assistance is at least the highest server-recorded exposure, and retries/repeated known scenarios remain separately flagged. Clients cannot lower the stored exposure.

`POST /sessions/{id}/hints` targets an active human decision by state version, is idempotent by command ID, and may only increase its exposure stage. It does not increment game state version. Historical advice is read through completed-hand review, not by pretending an old decision is still active.
