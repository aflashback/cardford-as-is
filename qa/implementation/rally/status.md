# Rally live implementation — 13 October 2026

Scope: [CR-UX-008](../../../planning/decisions/CR-UX-008-rally-live-ui.md), [full implementation plan](../../../docs/superpowers/plans/2026-10-13-rally-live-ui.md), approved [Rally design guide](../../../design/rally/DESIGN-GUIDE.md). The owner's later authorization includes the actual UI and supporting backend. The approved design package is retained as a reference.

## Delivered

- Native seven-mode table shell, concise menus/scores/setup, three themes, approved fonts/stickers and themed account/family/data/review pages. Cards, gestures, throws, rules and existing saved advice remain canonical.
- Measured responsive table/hand/Jacks allocation, short landscape 52px side controls, a reserved last-trick pocket, restrained doubling, mounted portrait gate and theme-aware dialogs. Numerical allocation checks are distinct from rendered legibility.
- Left Coach overlay with X, waiting/whistle launcher and optional width-gated pinning. Presentation toggles do not request or spend coaching.
- Cue, selection comment, confirmed-choice/post-play comment, overall review, fictional comparison, saved sessions, feedback and Why playback on the game view. Live playback stops before a saved frame appears; the mounted live hand returns on exit. When I ask has explicit comment controls; Occasional cues can append related comments within an already-requested session.
- Native authenticated Coach API, immutable item/replay storage, separate two-per-UTC-day session ledger, valid paid/fixture unlimited admission, exact command receipt recovery, revisioned feedback, account export and erasure. Migration012 leaves the old hand/request allowance and previous migrations intact.
- Replaceable `coachui.Provider`, with the deterministic `ui-preview-v1` mock. Every output is explicitly marked Preview; ratings identify a fictional sample. No trained reasoning, real-player comparison or new payment-provider integration is claimed.

## Service boundary

```text
GET  /api/platform/coach
POST /api/platform/coach/sessions
GET  /api/platform/coach/sessions/:id
POST /api/platform/coach/items
GET  /api/platform/coach/items/:id/replay
POST /api/platform/coach/feedback
```

The browser supplies command intent, source revision/control and feedback only. The service checks ownership, active source, actor-zero legal selections and the actual recorded committed action. Feedback and history never consume another daily session. Replay contains only permitted actor-visible presentations, is bounded to 120 frames/1 MiB, and cannot issue game commands. Private views and lease credentials are excluded from pending intent storage; logout, 401 and confirmed erasure clear it even with Coach unmounted.

The native backend hosts these APIs. The Node reference retains historical advice/review behavior; it does not claim the new Coach service. Existing grants retain their historical hand/request terms. New session quota is independent, universal per owner/day, and resets at UTC midnight. Unlimited requires a current matching unlimited purchase/family entitlement or labelled local fixture equivalent.

## Verification performed

| Check | Observed result |
|---|---|
| Frontend and server TypeScript | Passed through the native watchdog/toolchain |
| Native Go backend build | Passed during local app startup |
| Go-connected production client | Passed; Vite reports a large-chunk warning (about 4.53 MB JS / 429 KB gzip) |
| Focused JS/source integration suite | **79 passed, 0 failed, 0 skipped** |
| New native Coach groups | **8 groups passed across focused runs**, including actual isolated PostgreSQL checks |
| Generated TS/Ajv/OpenAPI and Go drift | Passed |
| Browser-source/production artifact boundary | Passed; no forbidden server identifiers/source maps |
| Frozen canonical baseline | **7/7 byte-identical** to the pre-implementation hashes in `canonical-baseline.json` |
| Independent scoped source review | Feedback byte-cap and set-equivalent pass/double proof defects fixed; no remaining high-confidence blocker reported |

The focused client suite exercises exact-intent retries, failed persistence, owner/lease/TTL checks, auth cleanup, frame-request cancellation, confirmed receipts, pace-save ordering, geometry, theme handling and existing recovery/advice behavior. Some component tests execute actual extracted closures without a renderer; they are not mounted React, browser, touch or device tests.

Native Coach checks cover two-store quota contention, UTC rollover, separation from old allowances, exact receipts, current/expired/wrong-target paid access, stale control/revision, actor-safe selection and committed proof, immutable replay, feedback conflicts and long escaped notes, export and erasure. Maximum escaped feedback requires a 16 KiB database cap. Pass/double proof compares card sets while retaining the authoritative recorded action.

### Broader regression limitation

One broader serial `records/service/http/contracts/coachui` run was bounded to five minutes. It stopped after **295.5 seconds**, with **189 observed test passes, 6 failures and 2 skips**. This is an incomplete/failing broader run, not an overall pass. No CoachUI failure was observed. Failures concerned database connection/initialization/load deadlines:

- `TestM04DConfiguredInvalidTrialRollsBackEveryTarget`: `store.ping` deadline.
- `TestM04DConfiguredLastUnitCannotResetThroughNewSession`: create-schema deadline.
- `TestM04EPlatformTrialDurableRetryAndExpiryRead`: loopback database connection timeout.
- `TestM03StoreReplayChanceCheckpointsAndHandGrowth`: `load.commit` deadline.
- `TestM05ActorRolloutAsyncServicePersistenceAndRestart`: second-store connection timeout.
- `TestRealtimePlaybackPauseFencesQueuedBotAndRestartRequiresResume`: local-session HTTP 408.

Skipped: `TestM04ETerminalFixtureInstall`, `TestStartupDiagnosticsWindowsProbe`. Do not infer a newly verified full-game, performance or hosted-production acceptance from these results. The first local app startup also hit a create-schema deadline while this suite ran. No production timeout was weakened.

## Review

Use the actual native game at **http://127.0.0.1:4174/**. The design reference remains separately available at **http://127.0.0.1:4188/rally/approved/#play** while its design server is running.

After the broader test processes stopped, the fresh native build/start succeeded. Raw HTTP verification returned **200** for the app and `/api/health` reported `ready`, `identity: local-test`, `payments: fixture`, `provider: off`. This verifies service availability, not rendered appearance. The external model provider remains off; the internal Coach UI preview provider requires no model call.

1. Resume; choose Hearts, Spades or a Trix variant. Change pace and light/dark/warm in settings.
2. Open Coach using the left sticker; request Cue, Review or Rating. Its current allowance comes from the server. An existing unlimited fixture account is explicitly labelled; finite fixture accounts get two daily sessions.
3. Select pass/double/play cards and request a related comment; commit normally and request a comment on the recorded choice. Occasional cues enables related automatic comments without starting new sessions.
4. Open Why, step/seek/play saved frames, then return to the same live hand. Pin on a wide screen; close and rotate without creating a new session.
5. Vote, leave a note, reload and open Saved sessions. Inspect account coaching access and export.

Restart from the repository root with `npm run pg:start`, then `npm run start:go`. Do not start a competing listener on 4174. This task's hidden local launcher metadata/logs are under ignored `.local/rally-review/`.

**Historical limitation — initial 13 October delivery, before the rendered follow-up:** browser rendering, physical iPhone/iPad, Safari, touch/drag QA and new screenshots had not been run. Browser automation was unavailable under the restriction in effect at that time. This describes the earlier verification boundary, not the current browser status.

Rendered Chromium QA is now in progress; see the [14 October review plan and capture evidence](browser-2026-10-14/REVIEW-PLAN.md) for current coverage and open checks. Source checks are not visual acceptance, and CSS viewport captures do not establish physical-device, Safari or touch-hardware acceptance.

No commits, remote publication or production deployment were made. Existing unrelated checkout changes were preserved.
