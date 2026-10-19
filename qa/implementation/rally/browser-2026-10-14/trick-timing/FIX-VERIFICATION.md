# Fourth-card presentation fix — 14 October 2026

Requirement: CR-UX-008, owner-authorized fourth-card landing and completed-trick dwell.

## Implemented

The native presentation queue advances independently of authoritative wire state. Each displayed frame receives a paint acknowledgement; a completed trick then reserves the existing throw duration plus the full reading interval. Receipt catch-up, incoming next leads and same-hand recovery snapshots preserve completion frames instead of replacing them. Missing completion frames can be reconstructed from public history. Initial loading does not replay old Trix history.

One native clock controls the central Trix cards, held-state action guard and release of queued frames. Pause/resume preserves its remaining time. A separate local pause flag prevents an earlier server-running response from restarting presentation. Last-trick pockets retain the previous trick until collection. The legacy Hearts/Spades timer also includes the landing allowance.

No backend behavior, rules, scoring, stored history, card faces, gestures or throw trajectory changed. `playback.ts` adds the combined interval without changing the existing pace constants. Game commands still use the current authoritative revision and reject a held/stale display.

## Built-in browser evidence

Actual native game at `http://127.0.0.1:4174/`, loaded from `C:\repos\test-jev`; no alternate checkout or fixture game server. Actions were performed through visible game controls. Public DOM visibility and card-flight transitions were sampled using requestAnimationFrame through the built-in browser. No hidden state or network payloads were used for the traces.

All seven modes passed at the fastest 1.4× pace:

| Mode | Landscape CSS viewport | Four settled cards visible | Evidence prefix |
| --- | --- | ---: | --- |
| Hearts | 1280×800 desktop | 1200.2 ms | `hearts-desktop-1.4` |
| Spades Solo | 667×375 iPhone SE | 1180.4 ms | `spades-solo-iphone-se-1.4` |
| Spades Partners | 1024×768 iPad | 1167.7 ms | `spades-partners-ipad-1.4` |
| Trix Basic Solo, Lutoosh | 667×375 iPhone SE | 1200.2 ms | `trix-basic-solo-iphone-se-1.4` |
| Trix Basic Partners, Queens | 844×390 iPhone 12 | 1200.3 ms | `trix-basic-partners-iphone12-1.4` |
| Trix Complex Solo, combined | 1024×768 iPad | 1189.1 ms | `trix-complex-solo-ipad-1.4` |
| Trix Complex Partners, combined | 1280×800 desktop | 1166.3 ms | `trix-complex-partners-desktop-final-1.4` |

Each prefix has a JSON frame trace and `-four.jpg` screenshot in this directory. Every trace shows a fourth-card flight, four settled faces, unchanged previous pocket during the hold, and pocket advancement at collection. Screenshots were visually inspected for all seven modes.

Additional rendered checks:

- Hearts paused during a completed trick on iPhone SE: cards preserved through 17.46 seconds of wall time; 1161.2 ms of unpaused settled visibility before collection.
- Trix paused during a completed trick: cards preserved through 16.87 seconds of wall time; 1165.2 ms of unpaused settled visibility before collection.
- A full 13-trick Trix Complex Partners round, including human and bot winners: all completion intervals retained. Final trick: 1180.0 ms of settled visibility before request completion; normal progression then reached the next deal.
- A Jacks request completed through normal UI controls while reaching that combined request; no completion barrier was introduced into its layout-card progression.
- Final browser console had no retained warnings/errors. Temporary tracing and network observation were removed; viewport override reset. Latest game left paused for review.

`node qa/implementation/rally/browser-2026-10-14/trick-timing/verify-traces.mjs` passed **20 recorded trick intervals**, producing `verified-traces.json`. Minimum unpaused settled visibility was 1161.2 ms, above the configured 1153.85 ms reading interval. Trace assertions allow two sampling frames of tolerance; the observed minimum did not need that allowance.

These are Chromium built-in-browser viewport checks, not physical iPhone/iPad or Safari certification. They cover the named modes and sampled requests, not every deal or every Trix request. Network/snapshot and all-pace edge cases below are deterministic source tests rather than induced live network failures.

## Source and build checks

The following bounded command passed **80 tests, zero failures or skips**, including 35 new playback checks:

```powershell
node --test --test-isolation=none web/tests/trick-playback.test.ts web/tests/realtime-stream.test.ts web/tests/client-recovery.test.ts web/tests/go-pending.test.ts web/tests/presentation.test.ts web/tests/rally-native-coach-integration.test.ts
```

Coverage includes delayed fourth cards at 1×/1.2×/1.4×, queued next leads, receipt/snapshot catch-up, multiple recovered completions sharing a revision, final trick/new deal ordering, pause/speed changes, initial history, security/game resets, ordinary queue trimming, authoritative envelopes and overlapping pause/resume.

The existing `web/e2e/table.spec.ts` legacy timing expectations were updated to include the landing allowance. That external Playwright suite was not run; rendered verification used the visible built-in browser as requested.

Frontend TypeScript passed. The main launcher passed Go build, TypeScript build and Go-connected Vite production build. Vite retains its existing large-bundle advisory. A direct sandboxed Vite attempt encountered process-spawn permission restrictions; the authorized hidden launcher completed the build and restart.

Live health is ready, local fixture access/payment, deterministic code players, provider off. Served assets matched local build bytes: `index-ZthvZnPI.js`, SHA-256 `543c99ee7c9a63b02045dd6973d7847fcfc738dc89dfeed051c68d93d42b5b9e`; CSS `index-Bqa4IZ6P.css` unchanged. Local startup receipt: `.local/rally-review/server.json`, native PID 35676 at verification.

## Separate observation

The first Hearts pass submission returned the native request layer's generic reconciliation error. Its four preparation jobs had completed normally; the server retained no detailed cause. The visible Retry flow reconciled it, a subsequent pass succeeded, and all following Hearts/trick checks passed. This is not established as caused by the presentation change and is not claimed fixed here. Earlier diagnosis artifacts describe the pre-fix behavior; the original reported incident's precise browser-paint cause remains unproven.
