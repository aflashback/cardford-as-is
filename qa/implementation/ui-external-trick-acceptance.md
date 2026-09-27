# External last trick — 27 September 2026

Implements the owner's follow-up in [CR-UX-004](../../planning/decisions/CR-UX-004-table-cues.md), requirements UX-14 and UX-17. Base: `8a66bbf`. Retrieve this change's commit with `git log -1 --format=%H -- qa/implementation/ui-external-trick-acceptance.md`.

The last trick occupies its own left column outside the table. The table shrinks while the hand retains the full available width. The miniature keeps seat positions and winner marking with no visible player names or dialog. Small landscape hands scroll horizontally; keyboard focus reveals the focused card. Short tablet windows scroll vertically to preserve usable cards. Portrait phones retain the existing rotate-to-play screen.

## Actual checks

Run from `C:\repos\test-jev`:

| Command | Result |
|---|---|
| `npm exec -- playwright test -c web/e2e/playwright.config.ts table.spec.ts` | Passed: 17 browser fixture tests. Geometry covers eleven viewports; short-tablet hand reachability and narrow-phone keyboard scrolling pass. |
| `npm run typecheck` | Passed: client and server. |
| `npm run build` | Passed; existing Vite chunk-size advisory remains. |
| `npm run check:artifacts` | Passed: 13 reachable client modules and built artifact checks. |
| `git diff --check` | Passed. |

Geometry sizes: 1920×1080, 1280×800, 1024×768, 800×600, 700×700, 768×1024, 700×701, 844×390, 667×375, 667×320, 568×320. Portrait rotation gates checked at 320×568 and 390×844. Assertions cover last trick outside the table, separation from players/current trick/coach, no horizontal page overflow, zero notes/unlock calls, accessible winner labels, and clearing on a new hand.

The smaller-phone check found a clipped 13-card hand; horizontal scrolling and focus reveal resolve it. Short-tablet page scrolling was checked separately. These are viewport tests in Chromium with safe-view API fixtures, not physical-device results.

## Visual evidence

- [Desktop](ui-external-trick-desktop.png)
- [Tablet portrait](ui-external-trick-tablet.png)
- [Compact window](ui-external-trick-compact-window.png)
- [Short tablet, full page](ui-external-trick-short-tablet.png)
- [Landscape phone](ui-external-trick-phone.png)
- [Small landscape phone](ui-external-trick-small-phone.png)

Screenshots were inspected for table/player/card placement. They show fixture state, not observed strategic advice.

## Limits and remaining work

No scoped failing checks remain. Physical devices, screen-reader speech, Safari/Firefox, zoom, server regression and live-service journeys were not rerun for this layout change. The app remains locally served at `http://127.0.0.1:4173`; run `npm start` if stopped. No production deployment is included.

Provider mode remains local-code strategy, Jev off, local-test identity and fixture billing. No runtime model was called or model ID observed. The finite demo is still labelled and its zero-API check passes. No rules, scoring, API or stored-data changes. The next unfinished project milestone remains hosted identity/Stripe and W18/W19 release evidence; this layout work does not close those gates.
