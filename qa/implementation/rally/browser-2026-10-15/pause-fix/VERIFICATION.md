# Consistent pause — 14 October 2026 (Toronto)

CR-UX-008 owner-authorized fix of all four pause-review findings. Actual native game at http://127.0.0.1:4174/, main checkout C:\repos\test-jev. Provider off, deterministic code players, local-test identity and fixture payments. No commit or deployment performed.

## Implemented

- One shared persistent pause intent for Hearts, Spades Solo/Partners and all four Trix variants. App blur, hidden/page lifecycle events, portrait and initial table entry require explicit Resume. Focus restoration/refresh does not clear it.
- The route waits for the owned table's stop acknowledgment before Account or Demo can replace it. Failure leaves the paused table available for recovery. View-only tabs can navigate without stopping another tab's runner. Cleanup also requests a stop.
- Manual pause is non-dismissible: no X, Escape or backdrop action can start play. Initial focus is the Resume button (Take control when required).
- Every game exposes Settings and Choose game while paused. Closing them returns to the paused screen; newly selected games open paused. Normal temporary menus/Why opened during active play may return to play if no persistent pause happened in the meantime.
- Pause intent invalidates pending Resume tickets, including during table removal. Late refresh/start responses cannot clear a newer pause. Existing authoritative command/control generations and bot commit fences are retained.

No backend schema, rules, card art, gestures or completed-trick timing changes were needed.

## Source and build evidence

The new dismissal and navigation regressions failed before implementation. The unmount/late-Resume regression also failed before its guard was added.

```powershell
node --test --test-isolation=none web/tests/pause-lifecycle.test.ts web/tests/trick-playback.test.ts web/tests/rally-native-coach-integration.test.ts web/tests/realtime-stream.test.ts web/tests/client-recovery.test.ts web/tests/go-pending.test.ts
```

**89 passed, zero failed/skipped.** Covers confirmed/failed exit, stale guard cleanup, focus/visibility/page lifecycle policy, view-only ownership, pending Resume cancellation, paused game selection, fourth-card dwell and transport/reconciliation boundaries.

`npm run typecheck --workspace web` passed. The final Go-targeted `npm run build --workspace web` passed TypeScript and Vite; the pre-existing bundle-size advisory remains. The existing external Playwright suite's Resume labels were updated; that suite was not run because rendered checks used the visible built-in browser as requested.

## Final-build built-in browser checks

Each row passed: Settings and full game choices while paused; close returns to pause; Escape and backdrop stay paused; explicit Resume; focus loss/re-entry remains paused; active table to Account confirms stop; Account return snapshot is already server-paused and the Resume screen remains visible.

| Mode | Landscape CSS viewport |
| --- | --- |
| Hearts | 667×375 |
| Spades Solo | 844×390 |
| Spades Partners | 1024×768 |
| Trix Basic Solo | 568×320 |
| Trix Basic Partners | 1280×800 |
| Trix Complex Solo | 592×579 |
| Trix Complex Partners | 568×320 |

The browser was visible for actions. Its normal automation forces focus, so opening a second test tab did not produce a real blur. The accepted focus test temporarily disabled Chromium focus emulation, observed blur and the stop, then restored focus emulation and confirmed the pause remained. This was done for every mode. Visibility/pagehide/pageshow behavior has focused source tests; these are not physical OS suspension/termination tests.

Additional final-build checks: 390×844 phone portrait gate followed by the original landscape remained paused; a normal Why session returned to live play; leaving during Why returned to the manual pause screen. One preview cue was saved using normal controls. The saved replay had one frame, so this checks the pause/return interaction rather than multi-frame playback pacing.

Snapshots and screenshots: `{mode}-settings`, `{mode}-chooser`, `{mode}-focus-return`, `{mode}-account-return`; additional `final-portrait-return`, `final-why`, and `review-ready`. Browser network flags/statuses are in `browser-results.json`; credentials and private payloads are omitted. All recorded pause/resume HTTP responses succeeded and every Account-return snapshot reported running:false. Browser console had no retained warnings/errors.

These are Chromium viewport checks, not physical iOS/Safari certification. Current game left paused, temporary viewport override reset and focus emulation restored. Settings and Choose game are ready for annotation.

## Main source

- `web/src/table/pauseLifecycle.ts`, `useGamePause.ts`: shared persistent intent, resume invalidation and exit guard.
- `web/src/table/PauseDialog.tsx`, `Dialog.tsx`: explicit Resume and paused navigation.
- `web/src/App.tsx`, `web/src/games/trix/Table.tsx`: route gate and all-mode integration.

`verify-evidence.mjs` validates the seven-mode receipts, screenshots' pause controls, network outcomes and current served build assets, writing `verified-evidence.json` and refreshing the local startup receipt.
