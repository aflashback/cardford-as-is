# CR-ARCH-006 — Resource-aware pause, foreground leases and expiry

15 October 2026, Toronto. Owner approved implementation after reviewing the pause/session-lifecycle plan.

## Approved scope

- Implement shared interruption handling across Hearts Solo, Spades Solo/Partners and Trix Basic/Complex Solo/Partners. Preserve explicit Resume after leaving, losing connection, unsupported phone layout or reopening. Keep Settings and Choose game available while paused.
- Use PostgreSQL as authoritative storage. Expire resumability after **300 seconds for Free** and **3600 seconds for Paid**, based on server-verified access. Preserve original rules, accepted moves, historical advice, creation/financial/usage receipts and account identity.
- Separate immediate frontend pause, confirmed server pause, foreground permission, connection lifetime and retained state. Connection loss has its own visible explanation. Reconnect alone never authorizes play.
- Initial foreground policy: renewal every 5 seconds, lifetime 15 seconds, checked at final serialized acceptance. Cancel queued/executing game work on pause and release dormant runners. A shared indexed scheduler handles missing clients without a final lifecycle request.
- New games start paused with a deadline. Repeated pause, refresh, ping/pong and non-controlling traffic never extend it. Late renewal cannot revive an expired lease. Existing games retain durable history and adopt the lifecycle policy on explicit Resume.
- Expiry invalidates active runtime and prevents resumption. PostgreSQL history and dependent coaching/receipt data remain subject to existing retention contracts; this is not blanket permission to destroy historical data or reuse whole-account erasure.
- Keep requested foreground Coach/Why interaction available while held. Suspend hidden/away timers, transport recovery, polling and speculation. Preserve confirmed fourth-card presentation and reject stale Resume completions.

## Capacity target and evidence boundary

The owner confirmed a future production target of **100,000 concurrent independent players**, each with three deterministic bots, distributed across servers. No multiplayer synchronization is required. Bot seats are not continuously occupied workers: admit work for decisions and release it while paused or waiting for the human.

The owner requested **staging capacity measurement as later work**: measure per-server API/WebSocket capacity, bot decisions per second and CPU cost, PostgreSQL load, memory and recovery storms, then estimate replicas with headroom. Do not assume the bottleneck or claim 100K readiness from local tests. This delivery must bound resources, avoid per-paused-game work and record measured local limits and remaining distributed-routing requirements.

## Redis decision

Redis is deferred and may be investigated as a **transient cache** for recent transactions/history, pause/restart retrieval, stage loading or dashboards. It will **not replace PostgreSQL persistence or become an independent game authority** under this decision. Cached entries must be owner-scoped, versioned and rebuildable. The earlier plan's Redis-authoritative migration and completion-only SQL option are withdrawn from implementation scope.

## Contract and implementation ruling

Reuse authenticated `/api/session/playback` and its receipt/generation fences instead of introducing parallel lifecycle commands. Add explicit resume/pause/hold/release-hold intent and reason, actor-safe lifecycle metadata on the playback view, and authenticated `/api/session/presence` renewal. Old receipts remain readable without new fields. Existing playback generation is the lifecycle authority epoch.

PL-F01–F11 and applicable PL-N01–N12 targets are traced in the [plan](../../docs/superpowers/plans/2026-10-15-pause-session-lifecycle.md) and [specification](../../docs/superpowers/specs/2026-10-15-pause-session-lifecycle-design.md). Minimal operational diagnostics support this delivery; new support capture, paid replay, training datasets, Redis and hosted deployment remain separate work.

Progress and evidence: [implementation ledger](../../qa/implementation/rally/pause-session-lifecycle/IMPLEMENTATION.md). Planned tests are not pass claims.

## 15 October follow-up planning direction

The owner requested research and a follow-up plan only while hosted signup/login is implemented separately. Desktop engine/device simulation is sufficient for this phase; physical-device testing is outside its acceptance scope. Research current and roughly three-to-four-year-old OS/browser behavior, observable call/lock/network interruption outcomes, one controlling page/connection and easily configurable Free/Paid retention. Current 300/3600-second values remain unchanged. Ending login or destroying the saved game on every socket drop is an investigated alternative, not an approved runtime change.

See the [research supplement](../../docs/superpowers/specs/2026-10-15-pause-browser-and-connection-followup.md) and [gated follow-up plan](../../docs/superpowers/plans/2026-10-15-pause-browser-and-connection-followup.md). No new product behavior or test pass is established by those documents.
