# Trix shared-table UI acceptance — 8 October 2026

The owner-authorized UI follow-up is implemented for Basic Solo, Basic Partners, Complex Solo and Complex Partners under [CR-UX-007](../../../planning/decisions/CR-UX-007-trix-shared-table.md). The running review app uses normal random deals and native Go/PostgreSQL, with fixture local access/payments and provider off. Bots and coach use deterministic code. No commit, push or deployment was requested.

The later UX-31–UX-34 follow-up adds one proportional card face, in-hand doubling without an overlay, manual scores and native round history, the centred South human badge, and named landscape-device targets. Its current checks and fresh performance capture are recorded in [shared-card follow-up acceptance](shared-card-followup.md). The checks and timing table below describe the earlier UX-25–UX-30 iteration.

## Implemented requirements

| Requirement | Result and evidence |
|---|---|
| UX-25 | Spades/Hearts and all four Trix variants import the actual shared card, hand, seat, count-fan, trick/history, dialog and rotation components. Trick-taking uses the accepted Spades pile geometry and led-suit depth without inheriting Spades trump. Illegal cards fade; prepared cards rise/tilt; double activation sends once. Routine kingdom/deal/rules text and sidebar request/score cards are removed. Request/total points occupy compact seat tags. The permanent heading-free last-trick box stays above the coach. |
| UX-26 | Four vertical suit lanes align at Jacks. Full 52-card fixture checks expose every rank and suit, including `elementFromPoint` checks against card/seat occlusion. Five supported landscape/desktop viewports pass. [854px](shared-table/vertical-layout-854.png), [844px](shared-table/vertical-layout-844.png), [568px](shared-table/vertical-layout-568.png). |
| UX-27 | A server-confirmed forced layout pass advances automatically at the shared pace. `Pass` appears above the avatar and clears when a card changes the public board. No client-invented pass action. |
| UX-28 | The server atomically collects the fourth trick card; a presentation-only hold displays the completed public trick before the next action or final results. Pause keeps the table mounted/inert, cancels bot preparation and preserves remaining collection time. Resume removes the overlay immediately and refreshes/reconciles in the background. |
| UX-29 | `Double?` shows only the eligible held queens/King of Hearts for the request. Single selection and double-click/tap selection match an exact server subset; the second click no longer deselects the queen. Confirmed announcements are read-only beside the declarer and disappear when publicly played. All four variants, King-only, skip and touch cases pass. Native owner-browser review confirmed a Queen of Hearts declaration and announcement. |
| UX-30 | [Shared design guide](../../../docs/14-card-table-design-guide.md), watched native-backed development, Chrome CPU/timeline captures and separate navigation/active-table Lighthouse audits are available. Shared speed presets retain the earlier 30% boost: delays are divided by `speed × 1.3`. |

The guide identifies the shared source components and game-owned exceptions. Artwork, legality, authoritative scoring, stored decisions and contracts retain their existing boundaries. No server phase or rule change was needed for the display pause or doubling-selection fix.

## Earlier UX-25–UX-30 executed checks

Every native/test command below used `node scripts/bounded-native-run.mjs -- node scripts/windows-env.mjs` from `C:\repos\test-jev`, with the existing cumulative watchdog. Commands are shown after that prefix.

| Command | Observed result |
|---|---|
| `npm run typecheck` | Passed frontend and server TypeScript, 12.8 seconds. |
| `node web/node_modules/typescript/bin/tsc -p web/e2e/tsconfig.trix-ui.json` | Passed typed fixture/native browser checks; final recheck 3.3 seconds. |
| `node node_modules/@playwright/test/cli.js test -c web/e2e/playwright.config.ts web/e2e/table.spec.ts web/e2e/trix-ui.spec.ts --reporter=line --trace=retain-on-failure` | **78/78 passed** in 202.3 seconds: 54 existing shared-table checks and 24 Trix checks. Covers all variants, five lane viewports, all three collection speeds, fourth/final-card display, pause remaining-time, slow-refresh resume/canceled-bot restart, automatic pass, doubling, touch, off-turn preparation and portrait gate. |
| Same fixture command with `--grep 'shared trick\|doubling popup\|single card activation\|delayed double-click target\|new game wizard\|last trick stays\|portrait phone shows\|off-turn double-click'` | After the Lighthouse contrast/accessibility-label changes, **16/16 affected checks passed** in 39.2 seconds. |
| `node node_modules/@playwright/test/cli.js test -c web/e2e/trix-ui-live.config.ts` | Each of the four variants passed against the actual watched app. Latest family invocation passed Basic Solo, Complex Solo and Complex Partners; Basic Partners' cold opening timed out, then its focused `--grep basic-partners` recheck passed in 8.8 seconds. This is four cumulative passes, not one uninterrupted 4/4 family run. |
| `node --test --test-isolation=none web/tests/trix-adapter.test.ts` | **4/4 passed**, exact doubling subsets, legal play/layout/pass separation, public lane projection and variant/actor/source binding. |
| `go test ./server/internal/games/trix -run '^TestTrixAllThirtyTwoDoubleSubsets$' -count=1 -timeout=30s` | Passed all 32 native declaration subsets, 2.8 seconds including process setup. |
| `$env:VITE_BACKEND = 'go'` then `npm run build` | Final production build passed in 11.4 seconds; Vite reported the existing large single bundle warning. |
| `node web/scripts/check-artifacts.mjs` | Passed final build: 43 reachable source modules, no forbidden server identifiers or source maps. |
| `git diff --check` | Passed. |

The native smoke creates a fresh identity and a normal random first request, chooses/declares when needed, double-clicks one legal card, verifies exactly one accepted human play, observes the four-card hold or Jack lane, then pauses/resumes and reloads the same paused game. Public receipts and screenshots: [Basic Solo](shared-table/native-basic-solo.json), [Basic Partners](shared-table/native-basic-partners.json), [Complex Solo](shared-table/native-complex-solo.json), [Complex Partners](shared-table/native-complex-partners.json). These checks establish first-request integration, not complete uninterrupted Trix sessions or every native phase in each random deal.

Earlier fixture failures exposed a one-pixel overlapping border hiding lane headers, a stale wizard-copy assertion and clock-boundary timing in the tests. Those were corrected before the 78/78 run. A cold fixture load and native loopback connection failures also occurred. Earlier native harness retries were affected by Node-side cookie/request timing and clicking a stale disabled request control; the public read now uses the Chrome-origin request and the harness checks enabled controls. No authoritative checks were weakened.

## Earlier UX-25–UX-30 Chrome DevTools and Lighthouse

The production-build profiling helper launches its own bounded Go listener against the guarded native **test database** and a fresh headless Chrome profile. It does not share the owner's identity/control lease. Captures use Chrome **154.0.8037.98**, Lighthouse **13.5.0**, desktop **1280 × 800**, Basic Solo, provider off and normal random first requests. All four variants have functional browser coverage, but this performance sample covers one variant. The before build was preserved before this UI change. The two requests/deals differ, so this is not a paired benchmark or proof of a percentage performance improvement.

| Measurement | Preserved before build | Earlier UX-25–UX-30 build |
|---|---:|---:|
| Gameplay sample | 31.43 seconds | 31.22 seconds |
| Human UI actions | 10 | 7 |
| Accepted commands, including setup | 41 | 26 |
| Pause/resume cycles | 2 | 2 |
| Observed frame interval, p95 | 20.1 ms | 20.1 ms |
| Frame gaps over 50 ms | 0 | 0 |
| Largest recorded main-thread event | 2.81 ms | 3.67 ms |
| Total sampled CPU idle | 93.60% | 93.54% |
| API duration, p95 / maximum | 51.74 / 207.18 ms | 41.22 / 61.08 ms |
| Observed resume response | 42.15 / 42.37 ms | 41.72 / 42.93 ms |
| JavaScript / failed-request errors | 0 / 0 | 0 / 0 |
| Navigation: performance / accessibility / best practices | 100 / 96 / 100 | **100 / 100 / 100** |
| Active table: accessibility / best practices | 96 / 100 | **100 / 100** |
| Navigation total blocking time / layout shift | 0 ms / 0 | 0 ms / 0 |

The final trace's longest layout was 3.67 ms; style recalculation peaked at 1.74 ms and paint at 0.72 ms. CPU samples were mostly idle; the largest sampled script work included the automation's DOM queries, with no recorded rendering event near 50 ms. This bounded sample did not reproduce a rendering stall. Raw trace categories do not include complete `RunTask` durations, so this conclusion uses the frame observer and the individual recorded events rather than claiming a full main-thread task census.

The Long Tasks observer is buffered and also records navigation work before the gameplay sample: one 52 ms entry before, and 64/71 ms entries after, at approximately 0.10–0.31 seconds after navigation. Those are retained in the receipts and are not relabeled as gameplay stalls or removed from the raw data. Frame intervals are headless observer measurements, not physical-device presentation FPS. Automated resume measurements include click/DOM-observation overhead.

The baseline requested the Node-only `/api/dev/scenarios` endpoint and received 404; the Go-targeted app no longer requests it. Active-table contrast findings led to darker shared muted/score/runtime text. Complete spoken card names are retained. All scored accessibility audits pass, while Lighthouse's experimental, zero-weight `label-content-name-mismatch` diagnostic still flags compact card glyphs and the header. The 100 category score does not mean every experimental diagnostic is cleared.

Navigation Lighthouse reloads the saved game paused; its performance score describes local loading. The separate snapshot audits the active game, and the Chrome trace samples actual human/bot gameplay. Remaining navigation diagnostics include the large bundle/unused code, unused CSS and back/forward-cache behavior. The artifact scan deliberately excludes source maps. These diagnostics and physical-device/mobile profiling remain follow-up work; there is no hosted, full-session latency or universal smoothness claim.

Earlier evidence: [analysis JSON](ui-performance/analysis-ux25-30.json), [navigation report](ui-performance/after-ux25-30/lighthouse.html), [active-table report](ui-performance/after-ux25-30/lighthouse-active.html), [gameplay receipt](ui-performance/after-ux25-30/gameplay.json), [CPU profile](ui-performance/after-ux25-30/chrome.cpuprofile), [compressed timeline](ui-performance/after-ux25-30/chrome-trace.json.gz). Decompress the timeline to JSON before importing into Chrome DevTools Performance; the `.cpuprofile` can be imported into the JavaScript CPU profiler. Trace compression was verified by byte-for-byte decompression checks.

The initial updated capture is retained in `ui-performance/after-initial/` with its 96 active-table accessibility result. The first baseline snapshot configuration failure is retained in `ui-performance/before-attempt/`; it was an inconsistent desktop/mobile emulation option, corrected before the successful baseline. No failed attempt is counted as a pass.

Reproduce the updated production capture after a Go-targeted build:

```powershell
node scripts/bounded-native-run.mjs -- node scripts/windows-env.mjs node scripts/profile-trix-ui.mjs after
node scripts/analyze-ui-profile.mjs
```

The helpers require the installed official Lighthouse package at `.local/ui-perf-tools/node_modules/lighthouse`, Chrome, the compiled `.local/cardford-ui-dev.exe` and the native test database. They close only their own temporary listener/browser. The `before` helper additionally needs the preserved `.local/ui-before-dist` baseline, which is an ignored local artifact.

## Watched owner-browser handoff

`npm run dev:go` builds the native binary, starts the API on **4176** and serves the Go-targeted Vite client with hot updates at **[4174](http://127.0.0.1:4174)**. Frontend source edits update automatically; Go changes require restarting this command. Ctrl+C stops both owned processes. `.local/go-ui-dev.json` records the current listener PIDs and origins. This receipt supersedes the older `.local/trix-live.json` handoff receipt for the currently running app.

The Vite proxy uses a bounded keepalive connection pool and a useful unavailable-service response. It rewrites only the authorized loopback frontend origin to the API's configured origin; other origins retain the native rejection. During the work, Windows loopback cold-start/proxy timeouts recurred. Successful focused native rechecks and the clean production sample do not prove the underlying OS/network cause resolved. The [earlier startup investigation](../multi-game/m04f-followup/startup-connection-investigation.md) remains applicable.

Earlier in-app browser review reconnected after hot updates, reclaimed the table's control lease, resumed immediately and displayed the existing Basic Solo game: three shared-style played cards, last-trick rail, card-back fans, faded illegal hand cards and a read-only doubled Queen of Hearts beside the human tag. The [earlier owner review screenshot](shared-table/owner-review.png) uses 854 × 668. The latest South-seat layout has a separate [owner review](shared-table/owner-south-seat-review.jpg) at the iPad landscape profile. The browser stays open at 4174; normal narrow side panels trigger the supported portrait rotation gate.

Full-session functional evidence and the unpassed combined resource gate remain separately recorded in [Trix baseline status](status.md). This follow-up does not convert earlier partial Basic runs or the failed combined campaign into uninterrupted passes.
