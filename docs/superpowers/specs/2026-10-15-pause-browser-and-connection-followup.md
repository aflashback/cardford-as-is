# Pause interruptions, connection ownership and configurable retention

15 October 2026, America/Toronto. **Research and planning only. No application code, configuration, tests or running server changed by this follow-up.**

This supplements [CR-ARCH-006](../../../planning/decisions/CR-ARCH-006-pause-presence-and-expiry.md), the [pause specification](2026-10-15-pause-session-lifecycle-design.md) and the [recorded implementation evidence](../../../qa/implementation/rally/pause-session-lifecycle/VERIFICATION.md). The [follow-up plan](../plans/2026-10-15-pause-browser-and-connection-followup.md) is gated on the separately developed hosted-login integration.

## 1. Owner direction and decision status

| Item | Status for this follow-up |
|---|---|
| Hosted signup/login | Separate work. Do not implement or replan its provider setup here. Consume its verified account, session identity and revocation boundary when ready. |
| Browser/device validation | Desktop browser engines, viewport simulation and controlled lifecycle/network faults are the accepted scope for this phase. Physical phone testing is outside this phase, not a blocker for completing this plan. |
| Historical platforms | Research current public versions and roughly three-to-four-year-old OS families. Distinguish an older OS with an updated browser from an old browser binary. |
| Account policy | One resumable unfinished game and one controlling play window for Free and Paid. New successful login supersedes older logins, implemented by the separate login work. |
| One socket / lost socket | Investigate. A dropped connection ending live-play permission is recommended; revoking login or deleting the retained game on every socket loss is not recommended and is not approved by this document. |
| Retention duration | Make Free and Paid values operationally configurable. Existing 5-minute/60-minute defaults remain unchanged. Ten minutes for Free or a shorter Paid window are candidates, not selected values. |
| PostgreSQL / Redis | PostgreSQL remains authoritative. Redis is future transient caching only. No storage migration, infrastructure or staging load test is performed here. |

The earlier verification report remains a historical record. Its unrun device cases have not become passes; their acceptance scope has been narrowed for this planning phase.

## 2. What the browser can and cannot tell us

These source statements are separate from the proposed CardFord behavior.

| Evidence class | Source finding | Consequence for CardFord |
|---|---|---|
| Web standard | Visibility is `visible` or `hidden`; the user agent determines system visibility and queues changes. Focus and visibility are distinct. [HTML visibility](https://html.spec.whatwg.org/multipage/interaction.html#page-visibility) | Use visibility and window-focus signals when delivered. A visible page can still lose focus in split view. |
| Web standard | `navigator.onLine` reports potential network availability, not successful access to our service; it is explicitly unreliable. [HTML online state](https://html.spec.whatwg.org/multipage/system-state.html#navigator.online) | Offline is a conservative pause hint. An online event allows an authenticated reachability check, never automatic Resume. |
| Chromium documentation | Hidden can be the last observed transition. Frozen freezable queues stop timers/fetch callbacks; discard may fire no event. [Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) | Do not require a final stop request, timer or close callback. Feature-detect Chromium lifecycle additions; keep a server-time fallback. |
| WebKit documentation | Inactive pages throttle timers and stop animation work; iOS tabs can be suspended completely. This 2019 guidance supplies no fixed suspension grace period. [WebKit power guidance](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/) | A background WebSocket or JavaScript timer cannot guarantee continued callbacks. No promise of a specific call/lock event sequence. |
| Protocol standard | WebSocket ping/pong can check whether the endpoint responds; abnormal loss may not include a clean close handshake. [RFC 6455](https://datatracker.ietf.org/doc/html/rfc6455#section-5.5.2) | Heartbeats detect transport failure within configured bounds. A responding socket does not establish user attention. |
| Optional API draft | `effectiveType` describes estimated network performance; its `4g` bucket is not a physical 4G-radio identifier and does not distinguish 5G. [Network Information draft](https://wicg.github.io/netinfo/) | Do not branch game rules or pause correctness on LTE/4G/5G labels. Treat network hints as optional diagnostics. |
| Test-tool documentation | Chrome Device Mode approximates viewport, touch, CPU and network behavior; it still runs desktop code. [Device Mode](https://developer.chrome.com/docs/devtools/device-mode) | Label results as simulated conditions. An iPhone preset in Chromium does not execute Safari. |
| Test-tool documentation | Engine testing can cover Chromium, Firefox and WebKit; the WebKit build is not branded Safari and platform differences remain. [Browser engines](https://playwright.dev/docs/browsers), [emulation](https://playwright.dev/docs/emulation) | Record the actual engine/build and host. Do not label a generic WebKit or user-agent override as a specific historical iOS release. These tools are future test options, not tools run in this task. |

No source reviewed defines one universal mapping from “incoming call on iOS/Android with LTE/5G” to a particular browser event sequence. Carrier, call presentation, OS process management and network paths can vary. The engineering contract should tolerate their observable outcomes instead of trying to identify the precise interruption.

### Observable interruption classes

| Scenario being represented | Desktop experiment to specify | Expected application outcome |
|---|---|---|
| Phone rotation / split view | Resize into unsupported geometry and restore it | Pause for layout; returning to valid geometry still requires Resume. |
| Switch tab/app / lock / full-screen call | Hide or blur; then separately suspend execution before the stop request completes | Immediate local block when notified; authenticated stop if delivered; otherwise original foreground deadline fences work. |
| Call banner with page still visible | Test visible+focused, visible+blurred, then fully hidden as separate cases | Blur/hidden pauses. A banner with no observable state change cannot reliably be detected; ordinary inactivity policy remains. |
| Browser killed / page discarded | Terminate document execution without a final callback | Missing permission renewal expires at server time. Reopening reconciles and remains paused. |
| Wi-Fi/cellular path changes but stays healthy | Keep transport and accepted requests healthy | No forced pause solely because a network label changed. |
| Brief blackout / old path silently dies | Drop responses or stall transport without a clean close, then restore | Pause when loss is observed or permission expires; recover state and require Resume. |
| HTTP works but WebSocket fails | Block only update transport | Apply the explicitly chosen transport policy in section 5; do not silently enable two authorities. |
| Stop/move response lost | Accept the command, withhold its response, then reconnect | Reconcile the original command receipt; never duplicate, roll back an accepted move or infer failure merely from timeout. |

There is no requirement that every phone event produces every row. These are failure-equivalence classes used to test the same application guarantees.

## 3. Current and older browser research lanes

Version anchors checked against primary publications on 15 October 2026: [Apple Safari release notes](https://developer.apple.com/documentation/safari-release-notes) list Safari 27.0 released 14 September and distinguish 27.2 beta; [Apple iOS enterprise notes](https://support.apple.com/en-za/148828) identify iOS/iPadOS 27. [Android's platform documentation](https://developer.android.com/about/versions/17) identifies Android 17 and prior families. The [Chrome release feed](https://chromereleases.googleblog.com/) lists stable 155 and separately labels Android 156 early-stable. These are research anchors, not installed or tested versions. Pin exact stable patch versions again at execution.

| Release cohort | Apple research target | Android research target | Desktop evidence to obtain later |
|---|---|---|---|
| Current / 2026 | iOS/iPadOS 27; Safari 27 family | Android 17; current stable Chromium-based browser | Current Chromium, branded Chrome/Edge where available, Firefox, WebKit; identify any actual Safari host separately. |
| 2025 | iOS/iPadOS 26; Safari 26 | Android 16 with a supported current browser | Relevant engine capability differences, not merely an older device preset. |
| 2024 | iOS/iPadOS 18; Safari 18 | Android 15 with a supported current browser | Historical engine lane only where an authentic version is obtainable. |
| 2023 | iOS/iPadOS 17; Safari 17 | Android 14 with a supported current browser | Three-year compatibility floor candidate. |
| 2022 | iOS/iPadOS 16; Safari 16 | Android 13 with a supported current browser | Four-year compatibility floor candidate. |

The Apple numbering jump means “latest minus four” is not a useful release-family calculation. An old Android OS need not run an old Chrome binary. If frozen 2022/2023 browser binaries become a product requirement, list and test them separately; do not infer them from the OS row.

Desktop coverage has three levels: actual available engines; geometry/input/network emulation within those engines; documented historical compatibility review. Unavailable historical engines remain **research-only**, not simulated passes. Apple OS simulation would require an appropriate host/runtime and is optional follow-up, not a physical-device requirement here. No software download or new test environment is authorized by this document alone.

Reuse landscape sizes 568×320, 667×375, 844×390, 1024×768 and 1440×900, plus portrait 390×844 and the review-pane resize case. The visible built-in browser remains the collaborative review surface. Other-engine execution must identify its tooling and evidence rather than pretending the built-in Chromium tab has changed engines.

### Concrete historical-browser compatibility gaps

These are source-audit findings, not reproduced browser failures or changes made in this task:

- [Connection recovery](../../../web/src/api/realtimeStream.ts) uses `URLSearchParams.size` to decide whether to append the negotiated `streamId` and work IDs. Without this property, a populated query is omitted and a WebSocket-bound snapshot can fail the subsequent stream-ID comparison. MDN's [compatibility data](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/URLSearchParams.json) records support from Safari 17, Chrome 113 and Firefox 112. The proposed Safari 16 lane therefore needs a compatible query-presence check and a focused recovery test before support can be claimed.
- [Preparation cancellation](../../../web/src/api/useGoSession.ts) calls `AbortSignal.any` when an optional external signal is supplied. Current internal callers omit that signal, so this is a latent capability gap rather than an established reachable failure. MDN's [compatibility data](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/AbortSignal.json) records support from Safari 17.4, Chrome 116 and Firefox 124. Before that branch is used on older targets, avoid the dependency or provide tested signal composition with cancellation-reason preservation and listener cleanup.

Audit actual runtime API usage against the selected minimum engine versions. A modern desktop viewport preset alone cannot establish these compatibility properties. The follow-up plan includes missing-capability tests; no compatibility patch is authorized by this research document.

## 4. Does the game phase change pausing?

**The pause rule is the same in every mode and phase. Recovery depends on whether an action was merely selected, submitted, or committed.** Waiting for a human bid/request is already a low-work boundary, but still needs presence expiry and retention. There should be no automatic human bid, pass or request merely because the user leaves.

| Boundary | Games/phases | Recovery contract |
|---|---|---|
| No action started | Hearts pass choice, Spades bidding, Trix request/doubling, human turn in tricks/Jacks | Restore the same accepted decision. Resume is explicit. No timeout-generated human action. |
| Local draft, not submitted | Selected Hearts pass cards, bid value, Trix double selection | Same-page draft may remain only if it matches the reconciled game/revision/decision and is still legal. Otherwise clear it. Restoring drafts after a full reload is not required. Never submit a draft automatically. |
| Gesture or queued automatic play | Dragging/lifted card or queued future card | Cancel gesture/queued autoplay on interruption. Return to a safe hand; fresh player action is required. |
| Click submits immediately | Trix request button, confirmed pass/bid/double/play | The click crosses into submitted-command handling; there is no invented intermediate request-selection phase. |
| Submitted, acceptance unknown | Any game command with a lost reply | Resolve the original command ID/body and authoritative revision before allowing a replacement command. A new login must use the same account-owned receipt recovery path without reviving old credentials. |
| Accepted before the stop boundary | Fourth card, trick collection, Jacks placement, completed pass/bid/double | Preserve accepted state. Pause does not undo it. Resume reconciles presentation; fourth-card visibility/dwell must not be skipped or replayed as a second game action. |
| Dealing / advancing / scoring | New round, kingdom or terminal results | Serialize pause against the transition. Preserve whichever valid state committed first; completed games remain completed. No partially committed round. |
| Why or blocking review | Temporary held state | Away changes hold into persistent pause. Closing Why cannot override a later interruption or takeover. Requested coaching does not grant gameplay permission. |

Source seams: [App](../../../web/src/App.tsx), [Trix table](../../../web/src/games/trix/Table.tsx), [gestures](../../../web/src/table/useHandGestures.ts), [pending commands](../../../web/src/api/goPendingCommands.ts), [session orchestration](../../../web/src/api/useGoSession.ts), [playback authority](../../../server/internal/records/realtime_playback.go). Existing behavior is not an exhaustive tested phase matrix; the follow-up plan gives the acceptance rows.

## 5. One window, one connection: recommended semantics

### Keep three lifetimes separate

1. **Login:** the verified account/application session, supplied by the separate login work. New verified login can revoke the previous one. A network outage alone need not sign the user out.
2. **Live play permission:** the one controlling page and its current authorized delivery connection. Losing that authority stops gameplay and work.
3. **Retained game:** the latest accepted checkpoint, kept without bots or a socket until its original expiry.

If “session is gone” means live play permission, it fits this design. If it means login and saved game are destroyed, a brief handover would defeat the resumability feature. The latter alternative is recorded as **not recommended**, not silently implemented.

### Which connection wins?

Use the latest **authorized takeover**, not whichever TCP/WebSocket connection happened to open last. New verified login wins according to the login transaction. A duplicate tab in that same login remains inactive until the user chooses **Continue here**. Ordinary focus, refresh, retry and background reconnect do not steal control.

The proposed invariant is **at most one authoritative gameplay update connection per account**; zero while settled-paused/away is expected. Account/settings pages need no observer game socket. Brief old/new transport overlap during replacement may exist, but only one generation may send accepted game updates or authorize play. Closing the old physical connection is cleanup; the durable fence is the authority. This works with HTTP mutations and does not turn the receive-only socket into a command channel.

The current code permits four owner connections in [realtime.go](../../../server/internal/service/realtime.go) and stores bindings in one process. It has one owner control record in [service_commands.go](../../../server/internal/records/service_commands.go). A control row is not proof of one browser document: [tab identity](../../../web/src/api/client.ts) and [control tokens](../../../web/src/api/controlLease.ts) persist in sessionStorage, which can initially be copied from an opener. [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage). A fresh document instance and a server-issued page/connection generation are therefore part of the integration plan.

```mermaid
sequenceDiagram
    participant A as Old page A
    participant S as Server authority
    participant B as New page B
    B->>S: Verified takeover with current login authority
    S->>S: Serialize account; replace page/connection generation; pause
    S-->>A: Superseded; stop updates and work
    S-->>B: Retained snapshot and original deadline
    A->>S: Delayed close or stale heartbeat
    S-->>A: Stale generation; cannot change B
    B->>S: Explicit Resume with fresh authority
    S-->>B: Running if foreground, eligible and unexpired
```

On an unexpected close of **the current** connection, conditionally pause that exact account/page/connection generation and cancel its work. On a delayed close of a superseded connection, do nothing to the replacement. A clean intentional pause/close preserves its original reason/deadline. Silent loss may have no immediate close callback; the existing server foreground deadline remains necessary.

Cross-server ownership and revocation must be authoritative even if an old server misses the notification. The process-local hub cannot provide that by changing `maxRealtimeOwnerConnections` from four to one. Reuse the login team's durable session generation and existing control/playback fences; add only the independently required page/connection generation. Define routing/invalidation with the existing [capacity blockers](../../../qa/implementation/rally/pause-session-lifecycle/capacity/README.md#current-multi-instance-blockers) before claiming multi-instance enforcement.

### Transport choice to review after login integration

| Option | Behavior | Recommendation/status |
|---|---|---|
| One controlling page with WS preferred and explicit HTTP fallback | An unexpected WS loss pauses. A supported, reconciled HTTP mode may resume only after explicit Resume under the same sole authority. At most one game socket when WS is used. | **Recommended for compatibility with the current contract.** Single-window control does not require removing the existing HTTP mode. No silent fallback that grants play. |
| One controlling page and WS required for live play | Lost WS pauses; HTTP can recover receipts/snapshot/settings, but cannot enable gameplay until a fresh authorized WS is healthy. | A valid simpler product choice if selected later. Changes existing HTTP-only behavior and requires coordinated schema/UI/command/presence checks. |
| Destroy login and retained game on every socket close | Any outage or intentional transport suspension ends the account session/game. | **Not recommended.** Conflicts with saved-game return and with intentional paused socket shutdown. |

No option changes the running implementation in this task. Preserve current explicit HTTP mode until the integration decision is made. Under either acceptable option, stale tabs cannot renew or play, reconnect cannot Resume by itself, and repeated events cannot extend retention.

## 6. Configurable Free/Paid retention

### Current source facts

- [StoreOptions](../../../server/internal/records/store.go) has `PauseFreeRetention` and `PausePaidRetention`, defaulting to 300 and 3600 seconds. Values must be whole seconds, Free at least one second, Paid at least Free and no more than 24 hours.
- [Startup wiring](../../../server/cmd/cardford/main.go) does not pass these options; [local config](../../../server/internal/http/local_config.go) exposes no retention settings. Programmatic configurability is implemented; operator configuration is not.
- [Lifecycle records](../../../server/internal/records/realtime_playback.go) pin the effective allowance at creation and explicit Resume. Repeated pause retains the deadline. Silent loss uses the old foreground deadline as the pause origin. The schema stores seconds with a 1..86400 bound.
- Paid selection uses verified grant provenance. Browser settings, local fixture flags or an unsigned tier claim cannot select Paid retention.

### Proposed operator surface

| Proposed setting | Initial default | Validation / handling |
|---|---:|---|
| `CARDFORD_PAUSE_FREE_MINUTES` | 5 | Integer 1..1440; missing uses default; explicit zero/negative/fraction/non-numeric value fails startup. |
| `CARDFORD_PAUSE_PAID_MINUTES` | 60 | Integer from Free value through 1440; reject Paid shorter than Free. |

Convert minutes once to existing whole-second store options. Do not add a second client-owned timeout. Retain second-granularity programmatic test options for accelerated fixtures. These environment names are **proposed and not available yet**.

The eventual hosted configuration loader owns production values; the local-only configuration guard must not become a hosted bypass. Log or expose effective non-secret durations and a configuration fingerprint through operator diagnostics. Use one reviewed configuration revision across replicas and a coordinated rollout/restart; a hot-edit admin UI is unnecessary for this first follow-up.

Rules for a configuration change:

1. Existing paused games keep the exact stored `pausedAt`, `expiresAt` and allowance.
2. Already-running/held games keep the allowance pinned at their last explicit Resume for their next pause.
3. New games and later successful explicit Resume use the new settings and current verified entitlement.
4. Login, token refresh, reconnect, read, duplicate pause and delayed sweeper never restart or lengthen an existing pause episode.
5. Rollback changes future adoption only; it does not rewrite existing deadlines or historical receipts. Immediate security revocation remains a separate authority.

The protocol's `pause-v1` value is currently constrained in SQL, schemas and indexed sweeps. Do not turn it into an arbitrary operator version string. A deployment configuration fingerprint can be separate; any durable configuration-revision field requires an explicit contract/migration change.

### Is one hour too long?

Not necessarily for CPU/socket resources: a properly paused game has no bot runner or per-game heartbeat/socket. It does increase the number of resumable records and the time users can return. Under a steady arrival assumption, retained paused population is approximately pause arrivals per second multiplied by retention seconds; it is not a count of continuously busy bots.

Current expiry preserves PostgreSQL game/history/receipt rows. Shortening resumability does **not** delete that history or solve its storage growth. Keep that distinction in any cost estimate.

Retain 5/60 now. Compare candidate policies such as 5/30 and 10/30 using return-time buckets, successful resumes, expired returns, retained-row footprint, cleanup lag and actual paused-work/socket counts. These are proposed measurements, not telemetry added today. Product can choose a new value without changing game rules once configuration is wired. No new Paid-duration promise is made by this research.

## 7. Planning acceptance and handoff

This document is complete when it distinguishes source guarantees, inferred fault classes, current implementation and proposed changes; names the unresolved transport decision; maps meaningful action boundaries; and provides an executable follow-up sequence after login is ready.

It does not require running a one-hour browser session today. Later validation should combine accelerated server-clock boundary/race tests with one bounded real-clock soak for the selected deployed policy. Long waits test timer drift/recovery/quiescence, while accelerated tests cover exact expiry arithmetic. Neither substitutes for the other.

Physical devices and carriers are outside this phase. Preserve the evidence label “desktop simulation / historical documentation review.” Staging capacity, Redis, paid replay/history products and provider signup remain separate work.
