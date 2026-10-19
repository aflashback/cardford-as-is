# Rally Live UI Implementation Plan

> For agentic workers: execute the approved design using the current coordinated agents; preserve existing uncommitted work. The owner explicitly requested implementation, so no new design approval is needed.

**Goal:** Apply approved Rally DESIGN-R09 to the actual seven-mode CardFord UI.

**Architecture:** Retain the existing React session controllers, commands and card primitives. Introduce reusable presentation components for the header, themes, Coach and measured table layout. Persist new Coach sessions, items and feedback through native APIs; keep the replaceable mock intelligence explicit and separate from real game state and entitlement enforcement.

**Tech Stack:** Existing React 19, TypeScript, Vite, CSS, native Go/PostgreSQL APIs and retained Node reference. No new dependency is required.

**Spec:** `design/rally/DESIGN-GUIDE.md`, `planning/decisions/CR-UX-008-rally-live-ui.md`.

## Global constraints

- Preserve artwork, rank/suit geometry, legal selection, unavailable cards, gestures and motion.
- 52px left controls on landscape screens ≤1000px wide and ≤430px high; 44px icon targets.
- Overlay Coach by default; pin only with ≥760px available table-screen width, preserving the preference when narrow.
- Keep real access, controller leases, command revisions, saved advice and actor-safe history authoritative.
- No claims of real rankings or trained advice from preview content. Feedback persistence, quota and entitlement checks are real; payment availability remains accurately labelled.

## Review focus

1. Rotation, theme changes and Coach toggles must preserve the live hand and stop blocked playback.
2. Stale advice after a confirmed choice must not describe the next decision.
3. Pin/overlay resize must preserve coaching state without spending access.
4. SE Jacks, full hands and public announcements must fit without changing artwork.
5. Account/review recovery, local-test labels and paid confirmations must remain truthful.

## Tasks

- [x] Audit current implementation, approved guide and API capabilities; baseline `npm --prefix web run typecheck` passed.
- [x] Root: `App.tsx`, `RallyHeader.tsx`, `rally-shell.css`, `main.tsx`: common HUD, menu/scores, settings theme, mounted portrait gate, shared Coach integration, all-mode setup pace.
- [x] Board agent: typed responsive geometry/hook and table CSS, Trix table integration and Jacks fitting. Invoke fitting before throw measurements; fit real trick cards only; retain historical review fallback.
- [x] Coach agent: left overlay/pin/sticker lifecycle, server allowance display, supplied live advice and saved review, focus/attention behavior and meaningful lifecycle tests.
- [x] Pages agent: local theme provider/picker, approved stickers, account/family/data/demo/review presentation; retain API handlers and confirmations.
- [x] Integrate and run typecheck/build plus focused new and existing presentation/recovery tests. Record failures and unrun browser/device checks separately.
- [x] Inspect the final source diff and capabilities against every guide section. Start or reuse the real local app for owner review if runtime prerequisites are available; do not replace it with the design mock.

No agent may reset, revert or commit unrelated work. The owner has now explicitly authorized the backend supporting every Coach UI flow, using replaceable mock intelligence. The following stages extend the original presentation plan.

## Full UI and service coverage

| User experience | Implementation and source of truth |
|---|---|
| Resume / choose one of seven modes / pace | Existing catalog and start commands; save pace before any mode starts |
| Table / cards / legal selection / doubling / pass / bids | Existing authoritative game, canonical cards and input hooks; Rally context layout |
| Scores / completed requests / results | Native scores and public history, concise Rally dialogs |
| Portrait / pause / reconnect / other tab | Mounted hand, blocked input, server playback pause, existing lease/recovery paths |
| Light / dark / warm | Approved palettes and fonts, resilient local preference; no card recoloring |
| Coach closed / whistle / open / pinned | Waiting/whistle assets; no request or charge from presentation changes |
| Cue before selecting | Explicit request creates persisted Coach session and first mock-provider item |
| Comment after selecting | Related item in the same session, with actor-owned selection validation; pending language stays unconfirmed |
| Confirmation / post-play comment | Related item only after server-confirmed play; preserve original item and context |
| Overall review | Requested review session with compact Strength / Next practice preview items and Why/feedback |
| Player comparison | Clearly labelled mock benchmark item, mode/cohort/provider version; never called a real-player or calibrated rating |
| Why | Owner-checked replay references and mock explanation; render permitted saved/current frames on the game view |
| Playback | Previous/next, play/pause, seek and history list in Coach; frozen live table remains mounted beneath read-only history |
| Feedback | Helpful / Not helpful, reason and optional note; persisted against exact item with revision and idempotency |
| Two daily sessions / exhausted / paid unlimited | New server ledger, UTC reset, atomic charge-on-create; old hand/request balances remain separate |
| Saved sessions / reload / stale advice | Persisted immutable items; distinguish current decision from saved context; recover uncertain writes by command ID |
| Account / plans / family / data | Existing supported APIs and confirmations, plus Coach records in export/erasure; configured payment availability stays truthful |
| Audio / other languages | Audio remains unavailable as designed; English mock content declares language/provider metadata and accepts future replacement |

## Stage 1 — UI foundation

Port the approved design and maintain the existing game behavior. Shared interfaces are `RallyHeader`, `AppearanceProvider`, `CoachWindow`, `useResponsiveTableFit`, and `RallyReplayTable({frame,caption})`. The replay renderer accepts only the existing public `ReviewFrame` union and contains no commands, hidden state, timers or network calls.

Validate with TypeScript, typed geometry cases and existing Trix adapter tests. Preserve hashes of canonical art/gesture/throw sources in `qa/implementation/rally/canonical-baseline.json`.

## Stage 2 — Contract and mock provider

Add `web/shared/platform-coach.schema.json` to the canonical generator, then regenerate TypeScript/Ajv/OpenAPI and native Go bindings. Add `server/internal/coachui` with a small provider interface accepting only actor-safe presentation, phase, selected cards, confirmed public action and bounded history references. The default implementation is `ui-preview-v1`, always reports `mock: true`, and returns concise preview content. A later trained provider can replace that implementation without changing quota, persistence, feedback or playback routes.

API operations:

```text
GET  /api/platform/coach
POST /api/platform/coach/sessions
GET  /api/platform/coach/sessions/:id
POST /api/platform/coach/items
GET  /api/platform/coach/items/:id/replay
POST /api/platform/coach/feedback
```

Status exposes server time/reset, quota timezone, remaining requests/unlimited, provider identity and recent owned session summaries. A session binds owner, game, variant, source decision and provider version. Items have immutable IDs/kind/title/body/replay references and a revisioned feedback projection. Requests never accept owner, entitlement, clock, generated advice, rating or replay contents from the browser.

Command inputs use existing command ID and live revision/control envelopes. Related item kinds are selection, confirmation and post-play; validate each against its bound actor/source and reject fabricated confirmation. Session kinds are cue, review and rating. Rating preview identifies its fictional cohort; no real-player population service or assessment algorithm is implied.

Provider tests verify mock labelling, stable version, context bounds, no hidden fields, neutral content and no external calls. Contract tests reject unknown fields, oversized feedback and invalid enum combinations.

## Stage 3 — Persistence and admission

Use a forward `012-coach-ui.sql` migration and new `records/coach_ui.go` / `service/platform_coach.go`. Preserve every existing migration checksum. Reuse owner locking, command digest reconciliation and exact receipt storage. Generate provider output outside the publication lock; under the transaction, recheck owner/session, revision/control and permission before publishing.

- Quota key: owner + stable Coach experience bucket + database UTC day; changing provider/policy version cannot reset use.
- Initial item, session, quota increment and command receipt commit atomically. Concurrent final requests cannot overspend.
- Paid unlimited derives only from current valid server entitlement. Local fixture access remains labelled; client preferences grant nothing.
- New experience sessions do not call old hand/request unlock charging.
- Reopening/Why/feedback/selection/comments do not increment daily usage. Existing sessions remain readable after exhaustion.
- Feedback is append-only by item and expected revision; retries return the same receipt, conflicting edits report a conflict.
- Stored history references resolve through owner-checked public presentation, never private game snapshots or other-seat hands.
- Export includes owned sessions/items/feedback; erasure explicitly removes the new data and pending receipts according to the account flow.

Database tests cover idempotent start, two-store quota race, UTC rollover, restart persistence, active/expired unlimited grant, stale decision/lease, foreign owner, append validation, feedback conflict, immutable output, actor-safe replay, export and erasure. Use the isolated test database; a skipped test is not a pass.

## Stage 4 — Live Coach experience

Add a typed client/controller for the new routes with abort/owner invalidation, request generation guards and retained command identity after uncertain outcomes. Replace the legacy cue area in the native Rally table with the new session-backed experience. Retain the old backend/review path for historical advice and the Node reference; do not mix its balances with the new sessions.

The window presents Cue / Review / Rating and saved session history, shows Preview on every generated item and renders Why/feedback per item. Only explicit new-session actions spend one use. In Occasional cues mode, selection and confirmed-action events append to an already-requested open session; When I ask offers explicit comment actions. A new decision does not auto-spend. A server-confirmed move retires pending language and can append a factual post-play preview to its existing session. Closing the window stops automatic presentation without losing saved items.

Why pauses real playback before showing `RallyReplayTable`. Its toolbar steps/seeks through real permitted frames; explanation text is mocked. Exit restores the same live hand. Portrait, visibility changes, close, feedback editing and end-of-sequence stop replay timers. Range input identity and keyboard focus remain stable during frame changes.

Client tests cover duplicate clicks, late/out-of-order response, logout/owner switch, quota exhaustion with saved-item access, feedback retry/conflict, pin/rotation during playback and exact return to live state.

## Stage 5 — Integrated acceptance and handoff

Run generated-contract drift checks, frontend/server type checks, production client build, focused unit and isolated PostgreSQL integration suites. Audit the final change against the coverage table. Record exact run commands, successes, failures/skips and remaining rendered/device limitations in `qa/implementation/rally/status.md`. Start the actual native game for review when its local prerequisites are available. Preserve the approved mock as comparison material.

Release boundaries: intelligence is explicitly preview/mock, payment availability stays as currently configured, and synthetic rating cohorts are not real players. Browser/security-tool restrictions remain applicable; source checks must not be described as visual acceptance.

## Implementation handoff

Stages 1–4 are implemented. Stage 5 produced a native build, current contracts, 79 passing focused client/source tests, eight passing new native test groups across focused runs, preserved canonical hashes and a healthy actual game server on port4174. The broader five-minute database regression did not pass; exact deadlines, skips and the unrun rendering/device checks are recorded in [the verification report](../../../qa/implementation/rally/status.md). Visual acceptance and broader database stability remain separate follow-up gates.
