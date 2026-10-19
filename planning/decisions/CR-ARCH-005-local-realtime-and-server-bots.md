# CR-ARCH-005 — Local WebSocket updates and server-owned bot progression

9 October 2026 Toronto. Approved by the owner in the implementation conversation.

The collaborative [plan](https://chatgpt.com/space/page_aa786c6820048191a6afaf419fb8579f) remains local-first. The latest instruction supersedes its browser-driven bot pacing: Go owns bot preparation, decisions and automatic transitions. React animates committed server views. Explicit human actions, pause/resume, control and recovery remain authenticated HTTP commands.

- RT-01: HTTP commands keep existing authority, revision checks, receipts and reconciliation. Notify immediately after commit; no server animation sleep or normal-path polling gate.
- RT-02: Persist a current seat-zero projection and exact committed safe projection in the bounded transactional outbox with the original accepted receipt. Terminal work and control/access changes enter the same owner-scoped sequence.
- RT-03: Four public message families: session.view, work.updated, control.changed and access.changed. One receive-only socket per tab. Generated Go/TypeScript contracts are canonical.
- RT-04: Connect and buffer before a cursor-consistent snapshot. Ignore duplicate frames; gaps, overflow, reconnect or invalid frames recover through one bounded coordinator. Retain intermediate healthy-stream revisions for presentation.
- RT-05: Backend bots run through existing deterministic preparation/mutation paths, under captured authenticated session/control authority. Durable playback generations fence pause; restart requires fresh resume. Stop at human and chance/round boundaries. Browser controls animation speed only.
- RT-06: Exact Origin/Host and cookie-bound connection admission; no caller-chosen owner/channel. Per-owner/global connection limits, negotiation rate limits, bounded frames/queues, deadlines, heartbeat and slow-consumer closure. Reauthorize every delivery; no leases, credentials, hidden hands or private analysis in push payloads.
- RT-07: Authentication invalidation clears mounted private state and rejects late responses. Keep existing tab leases in sessionStorage and unresolved intents in localStorage; keep stream IDs/cursors/views in memory. Account deletion removes every new derived row, including undelivered events; finite retention also applies to failed delivery.

  Resume recovery: when a saved table opens without this tab's control lease, expose an explicit **Take control** action inside the pause dialog. A successful claim keeps the table paused until **Resume** is selected. Closing the dialog must not implicitly claim control, and recovery errors must be visible within the dialog.
- RT-08: Socket delivery disabled with CARDFORD_REALTIME=off uses bounded HTTP recovery. No alternate game authority or runtime model dependency.
- RT-09: Validate atomicity, authorization/revocation, exact revisions, reconnect races, real browser WebSocket delivery, server-owned bots, pause fences and generated contracts. Record actual local evidence and limitations.
- RT-10: Cloud provider adapter, real hosted identity, TLS/WSS, managed-secret handling, infrastructure, public abuse limits and measured 100K concurrency remain staging/production gates. Local admission limits and tests do not establish cloud capacity.

Implementation interfaces: `web/shared/realtime.schema.json`, `server/internal/records/realtime_*.go`, `server/internal/service/realtime.go`, `server/internal/http/realtime.go`, and the shared React realtime adapter. Delivery evidence is maintained in `qa/implementation/realtime-acceptance.md`.
