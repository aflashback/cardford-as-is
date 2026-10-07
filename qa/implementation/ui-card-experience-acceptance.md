# Shared card table UI acceptance — 7 October 2026

Requirements: [CR-UX-006](../../planning/decisions/CR-UX-006-card-table-experience.md), UX-18 through UX-23. Changes are in `web/src/App.tsx`, `web/src/styles.css` and the public-card-only visual depth adapter `web/src/api/tablePresentation.ts`. Both backend hooks use this shared React table.

Passed on 7 October 2026:

| Command | Actual result |
|---|---|
| `node scripts/bounded-native-run.mjs -- node scripts/windows-env.mjs npm run typecheck` | Passed frontend and server TypeScript checks. |
| `node scripts/bounded-native-run.mjs -- node scripts/windows-env.mjs node node_modules/@playwright/test/cli.js test -c web/e2e/playwright.config.ts web/e2e/table.spec.ts` | All 42 Chrome browser fixture tests passed in 1.4 minutes. |
| Same browser command with `--grep "last trick"` after adding selected-card review images | Passed, including all eleven layout viewports. |
| `$env:VITE_BACKEND='go'; node scripts/bounded-native-run.mjs -- node scripts/windows-env.mjs npm run build` | TypeScript/Vite production build passed. Vite reports the existing large-chunk warning. Shared `web/dist` now targets the Go backend; Node reference startup requires rebuilding with `VITE_BACKEND=node` as documented in LOCAL-README. |
| `node scripts/bounded-native-run.mjs -- node scripts/windows-env.mjs npm run check:artifacts` | Passed browser boundary and generated artifact checks, 28 reachable source modules. |
| `git diff --check` | Passed. |

Interaction evidence includes all three modes, a second click 200 ms after selecting near a card's bottom edge, unchanged button geometry, real emulated touch taps 180 ms apart, exactly one play command, off-turn preparation without autoplay, server legal-set changes, keyboard access, and separate passing/bidding confirmation. Trick fixtures check all four progressive winner projections, trump versus led-suit presentation, rank depth and 15% edge overlap. Counts come from the supplied public `handCounts`; no opponent hands are fetched.

Layout checks cover 1920×1080, 1280×800, 1024×768, 800×600, 700×700, 768×1024, 700×701, 844×390, 667×375, 667×320 and 568×320. A further 480×320 hand check verifies increasing overlap rather than losing card access. Portrait-phone rotation gates remain covered. Measurements wait for the app's viewport-height update so consecutive resize cases do not compare stale geometry.

Reviewed screenshots:

- [Desktop selected hand, faded illegal cards and history above coach](ui-card-experience/selected-hand-desktop.png)
- [Landscape phone selected hand and history above coach](ui-card-experience/selected-hand-phone.png)
- [Hearts pile](ui-card-experience/hearts-pile-desktop.png), [landscape phone](ui-card-experience/hearts-pile-phone.png)
- [Spades Solo pile](ui-card-experience/spades-solo-pile-desktop.png), [landscape phone](ui-card-experience/spades-solo-pile-phone.png)
- [Spades Partners pile](ui-card-experience/spades-partners-pile-desktop.png), [landscape phone](ui-card-experience/spades-partners-pile-phone.png)

The first browser run exposed outdated test expectations and a resize-measurement race; both were corrected before the complete passing run. Initial sandbox validation could not spawn Node subprocesses (`EPERM`); the same bounded checks ran successfully with reviewed execution outside that sandbox. No package or toolchain installation was needed.

These are browser fixtures with server-shaped public responses, not fresh live backend games. Provider mode is fixture/code; live Jev was not invoked and no model ID was observed. Physical touch devices and screen readers were not tested. No rules, scoring, backend authority, API contracts or stored-game migrations change. Strategy strength, hosted access and payment verification remain outside this UI work. Changes are uncommitted for owner review.
