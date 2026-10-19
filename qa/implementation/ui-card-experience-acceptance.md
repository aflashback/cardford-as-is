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

## Browser-comment follow-ups — 7 October 2026

Owner corrections supersede the original visual choices above: left/right active cards now have a gap of 20% of card width while retaining 15% vertical overlap with top/bottom cards. The history box reserves its full space before any completed trick, has no visible heading and empties at the next hand without shifting the coach. Remaining-card text is replaced by original CSS card backs: distinct cards at 1–4, a countable pack at 5–8 and a dense pack at 9–13. Exact counts remain screen-reader labels; zero renders no backs. All changes use the shared components in Hearts and both Spades variants.

After the spacing and history corrections, the complete table suite passed **45/45**. After the visual pack correction, the same bounded browser command with `--grep "remaining-card backs|public counts|history box|last trick|geometry"` passed **11/11** affected checks. It includes pack spacing at 4/8/13, updates to 0/1/5, coach and history bounds before/after the first trick, all existing layout viewports, and the reported 754×668 and 854×668 windows. The final Go-targeted production build, artifact boundary check and `git diff --check` passed. Full backend gameplay and physical-device testing were not repeated.

Reviewed evidence: [distinct/countable/dense card packs](ui-card-experience/visual-card-counts.png), [phone card packs](ui-card-experience/visual-card-counts-phone.png), [separated left/right cards](ui-card-experience/separated-side-cards.png). Existing review images above were refreshed from the final affected-check run.

The local app at `http://127.0.0.1:4174` was restarted because its handler retained the previous index page. The verified restart used the existing saved database and `partner-resources` profile; a fresh HTTP page read matches the final build's asset name and serves the visual pack styles. `.local/human-app-process.json` identifies the specific running process and logs. Refresh the browser to load the latest assets.

## Playback boost — UX-24

The owner requested all game speeds boosted by approximately 30%. Shared bot-turn/bidding and trick-collection delays now divide by `gameSpeed * 1.3`. Relative presets and saved preferences remain 1×/1.2×/1.4×. Compared with the former pacing, speed is 30% faster and deliberate wait durations are approximately 23% shorter. The 1× pauses are approximately 692 ms for bot turns and 1615 ms for trick collection; the 1.2× pauses are 577/1346 ms; the 1.4× pauses are 495/1154 ms. Browser timers truncate fractional milliseconds. Backend calculation and network time are additional.

The bounded browser command with `--grep "boosted pace|new game wizard|off-turn prepared"` passed **8/8** checks. Controlled-clock cases verify one bot/collection command at each preset's new delay and no earlier command. Existing pace staging and off-turn preparation checks also pass. The Go-targeted production build and `git diff --check` passed. The local app was restarted with its existing profile and saved database; its served JavaScript asset matches the new build.

## Fanned indicators and clearer ranks

The latest owner comments supersede the straight card packs and 15% vertical overlap described above. Remaining-card backs now form a fan at every count, with clearly countable exposure at 1–8 and denser overlap at 9–13. Active table cards overlap vertically by 8%; left/right cards retain their gap. Rank corners are inset 9 px horizontally and 10 px vertically on desktop, with proportional compact-layout insets.

The bounded browser command with `--grep "remaining-card fans|public counts|last trick|history box|boosted pace"` passed **16/16** checks. Checks cover fan density, all four progressive trick projections, unobscured rank hit testing, persistent history bounds, all six preset/phase timer combinations and the existing eleven viewport cases. Geometry checks now await placement-animation completion; an intermediate fixture-page connection timeout passed on the subsequent run. The final Go-targeted production build passed. Eleven review images were refreshed, including [fanned indicators](ui-card-experience/visual-card-counts.png) and [readable table ranks](ui-card-experience/separated-side-cards.png).

The first playback-build restart hit a transient database-initialization failure; a retry succeeded without changing the saved database. The final fan/readability build restart succeeded at `http://127.0.0.1:4174`, with a ready health response and served asset matching `web/dist/index.html`. The existing browser tab was reloaded and its saved Partners game resumed; the updated fans and inset ranks were visually checked. No new live gameplay commands were submitted during that inspection. Fixture validation does not establish physical-device or full live-backend gameplay acceptance.
