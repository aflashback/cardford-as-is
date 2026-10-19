# 08 — Review findings, evidence and maintenance

[Index](README.md) · [Decision register](07-decisions.md)

## Review conclusion

The current source has coherent boundaries for authoritative game execution, actor-safe projections, durable commands, deterministic work and explicit pause/recovery. It has moved substantially beyond the original numbered architecture document: Go/PostgreSQL, local WebSockets, server-owned bots, foreground leases and a separate real-auth profile are present.

The main architectural limits are the local, process-bound execution topology; incomplete production identity/payment lifecycle; and documentation that spans several historical implementations. This is an architecture/source review, not a security certification, load test or release sign-off.

## Findings

| ID | Finding and evidence | Implication for review |
|---|---|---|
| AR-01 | [03](../../03-architecture.md) is explicitly historical but still gives the main detailed Node/SQLite/Jev/polling diagram; [12](../../12-multi-game-extensibility.md) still contains old three-mode/TypeScript/sequential-only descriptions while current Go modules include Trix and sealed nodes | Use this folder as the current descriptive entry point. Preserve normative rule history; reconcile obsolete prose deliberately rather than treating it as runtime truth |
| AR-02 | [service](../../../server/internal/service/service.go), [scheduler](../../../server/internal/service/scheduler.go), [bot manager](../../../server/internal/service/bot_playback.go) and [hub](../../../server/internal/service/realtime.go) keep queues/runners/subscriptions in process | SQL durability is not evidence of cross-replica work placement or socket fanout. Review these before any distributed architecture claim |
| AR-03 | [AuthHandler](../../../server/internal/http/auth.go) and [auth records](../../../server/internal/records/auth.go) implement local sign-in/replacement/logout, while external provider revocation, app deletion and identity linking remain incomplete | Current authentication is a local foundation. External account disable alone does not revoke an existing twelve-hour app session |
| AR-04 | [Real-auth route filter](../../../server/internal/http/auth.go) blocks fixture billing/family/delete/trial paths; [operator grant](../../../server/cmd/cardford-auth/grant.go) creates test access, and Paddle exists in [plans](../../superpowers/plans/2026-10-14-paddle-identity-release.md) | A working Account page or Paid test grant is not commercial subscription implementation. Reuse only proven server-side access invariants |
| AR-05 | [Gameplay help](../../../server/internal/service/platform_review.go) uses original saved deterministic analysis; [Coach preview](../../../server/internal/service/platform_coach.go) invokes [MockProvider](../../../server/internal/coachui/provider.go) | Keep the two flows distinct. Preview content/fictional rating does not prove coaching quality or skill assessment |
| AR-06 | [History reader](../../../server/internal/records/store_history.go) validates replay integrity; [Trix acceptance](../../../qa/implementation/trix/status.md) records long-session/resource limitations | Preserve integrity checks while measuring real cost. No throughput or long-session improvement is established by documenting the current optimization boundaries |
| AR-07 | [Pause evidence](../../../qa/implementation/rally/pause-session-lifecycle/VERIFICATION.md) records bounded success and still-open fault/device/soak coverage | Source handles lease/deadline boundaries, but wider interruption behavior and Paid soak remain acceptance work |
| AR-08 | [package.json](../../../package.json) still routes `start` to Node; Go uses `start:go`, shared web output is build-selected, and canonical SQL lives under `web/server` | Setup documentation must name the profile. Reference code, build tooling and migration ownership are easy to misread as active runtime components |
| AR-09 | HEAD is accompanied by many modified and untracked files | This review describes the inspected working tree. A clean reproducible release baseline requires separately capturing/committing the intended implementation; no commit is created here |

These are review observations and unfinished acceptance boundaries. They are not instructions to redesign or implement a future platform in this documentation task.

## Existing evidence inspected

| Evidence | What it records | What this review does not infer |
|---|---|---|
| [Realtime acceptance](../../../qa/implementation/realtime-acceptance.md) | Scoped transport, service and real-browser work for local WebSocket/server progression | Hosted fanout, multi-instance correctness or capacity |
| [Pause implementation](../../../qa/implementation/rally/pause-session-lifecycle/IMPLEMENTATION.md) and [verification](../../../qa/implementation/rally/pause-session-lifecycle/VERIFICATION.md) | Focused tests, seven-mode paused-layout captures, observed Free expiry/restart, recovery and idle pause on identified local builds | Complete fault matrix, physical-device behavior, Paid one-hour soak or staging capacity |
| [Auth-local STATUS](../../../qa/implementation/auth-local/STATUS.md) | Focused Node/Go checks, mocked browser tests, a real Keycloak Chrome workflow, build/OTP checks and owned restart persistence | Social-provider integration, external revocation, full MFA/recovery/linking/erasure, regional isolation or production readiness |
| [Trix status](../../../qa/implementation/trix/status.md) | Four-variant functional evidence and explicit full-session/resource limitations | Strategy strength or uninterrupted full-campaign performance across every variant |
| [M04E](../../../qa/implementation/multi-game/m04e/status.md) and [M12](../../../qa/implementation/multi-game/m12/status.md) | Earlier Go-platform integration and experimental policy evidence | Automatic acceptance of all subsequent working-tree changes |

Every report retains its own build/date/profile boundaries. Paths under ignored `.local/` in those reports are local historical artifacts, not a claim that those artifacts are committed or were regenerated here.

## Source map for the next review

| Topic | Start here |
|---|---|
| Composition and versions | [fixture main](../../../server/cmd/cardford/main.go), [auth main](../../../server/cmd/cardford-auth/main.go), [go.mod](../../../go.mod), [package-lock](../../../package-lock.json), [native pins](../../../scripts/windows-tools.json) |
| Route and request boundary | [local transport](../../../server/internal/http/local.go), [auth wrapper](../../../server/internal/http/auth.go), [public schemas](../../../web/shared/local-service.schema.json), [auth schema](../../../web/shared/auth.schema.json) |
| Runtime orchestration | [service](../../../server/internal/service/service.go), [mutations](../../../server/internal/service/mutations.go), [preparation](../../../server/internal/service/preparation.go), [bot playback](../../../server/internal/service/bot_playback.go) |
| Game semantics and versions | [kernel session](../../../server/internal/gamekernel/session.go), [registry](../../../server/internal/sessions/registry.go), [game modules](../../../server/internal/games/), [codec](../../../server/internal/records/codec.go) |
| Persistence and migration | [store](../../../server/internal/records/store.go), [commit](../../../server/internal/records/store_documents.go), [history](../../../server/internal/records/store_history.go), [migration reader](../../../server/internal/records/store_migrations.go) |
| Realtime and lifecycle | [service realtime](../../../server/internal/service/realtime.go), [outbox](../../../server/internal/records/realtime_outbox.go), [playback](../../../server/internal/records/realtime_playback.go), [retention](../../../server/internal/records/session_retention.go), [sweeper](../../../server/internal/service/session_lifecycle.go) |
| Browser recovery | [useGoSession](../../../web/src/api/useGoSession.ts), [realtimeStream](../../../web/src/api/realtimeStream.ts), [pending commands](../../../web/src/api/goPendingCommands.ts), [presentation queue](../../../web/src/api/presentationQueue.ts) |
| Identity | [OIDC](../../../server/internal/authn/oidc.go), [auth records](../../../server/internal/records/auth.go), [AuthSession](../../../web/src/auth/session.ts), [auth setup](../../development/local-auth.md) |
| Advice and Coach | [platform review](../../../server/internal/service/platform_review.go), [Trix review](../../../server/internal/service/platform_trix.go), [alternative trials](../../../server/internal/service/platform_review_trials.go), [Coach preview](../../../server/internal/service/platform_coach.go) |

## Checks performed for this documentation change

The final [documentation check report](documentation-check.json) records actual file/link/diagram-structure and reviewed-source drift checks. Diagram structure checks count and inspect Mermaid blocks; they do not prove renderer output. No application tests, browser acceptance tests, services, container operations, database migrations, collection campaigns or external provider calls were run for this review.

The source snapshot lists SHA-256 hashes for source/decision/evidence entry points referenced by these documents. It intentionally excludes private configuration and generated binaries. A matching hash establishes file identity, not behavioral correctness. It does not capture every transitive dependency or constitute a full reproducible build snapshot.

## Keeping this folder current

1. Start from the runtime entrypoints and launch scripts; identify the profile and actual working-tree revision before changing diagrams.
2. Trace each changed path through public contract, service, records and browser handling. Update the affected component and sequence together.
3. Record whether each claim is inspected source, newly executed evidence or inherited evidence from a named build. Retain failures and not-run checks.
4. Update the decision register by linking the approving record; do not invent retrospective rationale or silently change policy status.
5. Refresh the reviewed date/source snapshot after reinspection, validate local links and diagrams, and leave historical specifications explicitly historical.
6. Keep future alternatives in a separate proposal referencing this baseline. Include current-to-future changes and acceptance criteria before implementation.
