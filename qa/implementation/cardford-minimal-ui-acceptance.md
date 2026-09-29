# CardFord game entry and quiet table — 28 September 2026

Implements owner-approved [CR-UX-005](../../planning/decisions/CR-UX-005-game-entry.md), UX-18–20. Base: `38522d6`. Retrieve the resulting commit with `git log -1 --format=%H -- qa/implementation/cardford-minimal-ui-acceptance.md`.

The supplied CardFord SVG symbol appears in the top-left table link and browser favicon; the SVG symbol is paired with live CardFord text on connection/loading and portrait rotate screens. The portrait screen has a faint monochrome card watermark. A full-page pace step leads to three game cards. Each card starts its game using the existing authorized command; no separate Start game button. Coaching settings remain separate. The top hand/trick count, cumulative scoreboard, low-score caption and table-notes control are absent. Seat bid/trick counters, last trick, recap standings and review remain.

| Check from `C:\repos\test-jev` | Actual result |
|---|---|
| `npm run typecheck` | Passed: client and server TypeScript. |
| `npm run build` | Passed; existing Vite large-chunk advisory only. |
| `npm run check:artifacts` | Passed: browser boundary, 13 reachable modules and built artifacts. |
| `npm exec -- playwright test -c web/e2e/playwright.config.ts table.spec.ts` | Passed: 19 fixture browser tests, 21.9 seconds, on the final UI. |
| `npm exec -- playwright test -c web/e2e/live.config.ts --grep 'live (hearts\|spades-solo\|spades-partners):'` | Passed: 3 real local-service/PostgreSQL journeys, 27.5 seconds, on the final UI. |
| `git diff --check` | Passed. |

Visual inspection: [connection screen](cardford-minimal-loading.png), [new-game cards](cardford-minimal-wizard.png), [portrait rotate screen](cardford-minimal-portrait.png), [landscape phone table](cardford-minimal-table-phone.png). Browser fixtures assert the wizard has no picker dialog or Start game button, cancelling leaves pace and game unchanged, card selection saves pace then sends one new-game command, coach settings omit speed, and the requested table text is absent. The live journeys check game setup and accepted play in all three modes.

Initial test failures were stale test expectations for the removed picker/notes UI. A new logo test initially matched Vite's source `src/api/` URL as if it were an API route; the route was scoped to the real `/api/` prefix. The final targeted checks pass. These are test repairs, not application failures.

**Known open brand detail:** the supplied SVG wordmark visually spells `Cardford`, while the app's approved text name is `CardFord`. A capitalization clarification is pending. The runtime uses the SVG symbol plus live text, so the displayed name is consistent. No SVG artwork was altered. The supplied source assets in `planning/brand/cardford/svg` are retained and runtime copies are used in `web/public/brand`.

No game rules, scoring, API schema, event schema or stored data changed. The notes API still exists but has no table entry point. Runtime remains local-code strategy with Jev off; no model ID was observed. Physical-device, screen-reader speech, hosted deployment and live payment/provider checks were not run. Hosted identity/Stripe and W18/W19 release evidence remain the next unfinished project milestones.
