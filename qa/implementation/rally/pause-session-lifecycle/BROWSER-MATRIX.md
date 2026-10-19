# Visible browser verification matrix

Scope: current checkout and actual Go service on `http://127.0.0.1:4174`, not the approved HTML mock. This file defines required coverage; actual results and remaining checks are recorded in [VERIFICATION.md](VERIFICATION.md) and the browser artifacts. Use the visible Codex browser so the owner can annotate it. Stop browser interaction when the owner takes over.

15 October planning update: the owner accepts desktop simulation for this phase and defers integration until the separate hosted-login work is ready. The [follow-up plan](../../../../docs/superpowers/plans/2026-10-15-pause-browser-and-connection-followup.md) adds actual-engine labeling, network/lifecycle fault classes, phase boundaries and connection ownership. It does not mark any additional case passed or change running policy.

## Coverage

Modes: Hearts Solo; Spades Solo and Partners; Trix Basic Solo, Basic Partners, Complex Solo and Complex Partners.

Landscape CSS viewports: older iPhone SE 568×320, iPhone SE 667×375, iPhone 12 844×390, iPad 1024×768 and desktop 1440×900. Portrait return is checked at 390×844. These are Chromium layout/emulation checks, not physical iOS or Android certification.

For each mode, start from the game chooser, explicitly Resume, pause, and confirm Settings/Choose game remain available. Capture the paused surface at all landscape sizes, checking visible controls, readable reason/deadline, no page overflow or broken artwork, and no table movement while paused. Resume once and confirm a legal player action or bot transition still works.

## Lifecycle cases

| Case | Required observation | Evidence kind |
|---|---|---|
| Manual Pause | Local input stops immediately; server reports paused; original expiry stays fixed | UI and sanitized network metadata |
| Portrait then landscape | Unsupported layout blocks play; return offers explicit Resume | Native viewport change and UI |
| Focus/tab away then return | Local stop; no automatic Resume; reason explains absence | Browser focus/visibility behavior and network |
| Connection loss then recovery | Connection-specific explanation, no silent play; explicit Resume after recovery | Browser network emulation and network |
| Pause acknowledgment lost | Receipt reconciliation cannot convert an old Resume into play | Deterministic transport tests plus browser recovery |
| Settings and game selection | Accessible while paused; closing them leaves paused state | UI |
| Coach/Why holds | Requested coaching remains usable; final hold release continues only if no interruption occurred | UI and server phase |
| Hidden/settled paused | Socket closes; no per-game heartbeat/recovery polling; no bot runner retained | Network and backend tests |
| Idle | Warning at 120s; interruption after the additional 30s; explicit Resume | Visible elapsed-time check and reducer tests |
| Free expiry | Original 300s deadline; expired game cannot resume; chooser available | Real elapsed browser check and accelerated SQL tests |
| Paid expiry | Server chooses 3600s from verified entitlement, not browser claim | Isolated backend clock/entitlement tests; real one-hour browser soak recorded separately |
| Restart/reload | Saved state rehydrates paused; no automatic playback | Latest server and browser reload |
| Concurrent/late commands | Expiry and control generations reject stale work; history/receipts remain | Isolated backend tests |

Real phone calls, screen lock, OS process eviction and carrier behavior are outside this phase. Test the corresponding observable interruption/failure classes on desktop and label them as simulations. Physical behavior cannot be claimed from synthetic focus, viewport or offline events; preserve those observations as not run rather than treating them as a completion blocker for the agreed desktop scope.

## Evidence handling

`browser-review.mjs` captures the full native browser viewport, DOM text and geometry. Its network recorder keeps only route/method/status, lifecycle reason/phase/generation/deadlines and connection events. It does not persist credentials, request headers, control tokens or game-state payloads. Screenshot/DOM evidence contains only the player's visible table.

Record the native binary and built asset hashes after restart. Restore temporary network/focus/viewport overrides before leaving the review tab open. If a case fails, fix its cause and rerun the affected case and shared regression checks; do not relabel a failed capture as passing.
