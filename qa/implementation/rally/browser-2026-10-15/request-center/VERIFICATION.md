# CR-UX-008 — centered Trix request picker

Verified 15 October 2026 against the current checkout at `http://127.0.0.1:4174/#`, using the visible built-in browser. No commit was requested or created.

## Finding and correction

The annotated 592 × 579 view had two interacting causes:

- The previous trick and the request wrapper were unkeyed `div` alternatives. React reused the fitted trick node, retaining inline `left: 228.5px; top: 194.013px; visibility: visible` on `.trix-center`.
- Rally centered requests only when the available main height was at most 520px. This pane had about 523px, so it inherited legacy asymmetric insets, a single column and a clipped scrolling panel. The picker was roughly 75px right and 82px below the felt center; its scroll height was 167px in a 147px panel. See `before.jpg` and `before.json`.

The actual trick and request/result wrappers now have distinct keys. All Rally request screens reset the legacy insets and center on the felt, with separate normal/compact control sizing and reserved side badge lanes. Choices retain at least 44px targets without internal scrolling. Only presentation changes; no backend, game rule, candidate, card-face or gesture changes.

## Passed checks

```powershell
node --test --test-isolation=none web/tests/rally-phase-prompts.test.ts web/tests/rally-responsive.test.ts web/tests/rally-player-content.test.ts
$env:VITE_BACKEND='go'; npm run build --workspace web
node qa/implementation/rally/browser-2026-10-15/request-center/verify-evidence.mjs
```

67 source checks passed. The new regressions failed before the fix on the missing phase identities and missing noncompact center rules. Existing compact five-choice allocation, Jacks geometry and player details also passed. TypeScript and Vite production build passed; Vite retains its existing large-chunk advisory.

64 rendered captures passed: 18 landscape presets plus the reported 592 × 579 pane and two height-breakpoint cases, each with Coach closed, overlay and pin preferred, then the restored native review view. Requested 592 × 577 rounded to an observed 592 × 578; it still exercises the noncompact side. All JSON records retain measured viewport dimensions. Narrow layouts automatically use overlay when pinning is unavailable.

Every capture has the picker centered within 1 CSS pixel on both axes (largest observed deviation 0.011px), no inherited inline coordinates, no internal picker scrolling, all current choices inside the panel, targets at least 44px within fractional rendering tolerance, and no overlap with player tags or the hand. Page, image, Coach and hand geometry checks also passed. Overlay Coach may intentionally cover table content while open; these checks do not claim unobscured pointer access through it.

Phone examples include SE 568 × 320 and 667 × 375, iPhone 12 844 × 390 and the tighter 750 × 340 browser class. Tablet examples span 1024 × 768 through 1366 × 1024; desktop spans 1440 × 900 through 2560 × 1080. Representative screenshots were visually reviewed. `browser-review.mjs` runs through existing CUA handles and only resizes/reads the page; game and Coach actions remain explicit UI steps. Native browser screenshots replace the direct CDP images because that capture path cropped wider views at this app's zoom.

The same native server executable was restarted after rebuilding `web/dist`. `verified.json` proves health `local-test / local / fixture / off / ready` and byte equality between served assets and this checkout's build, with SHA-256 hashes. No runtime AI provider/model was used.

## Scope and handoff

Live captures use the owner's existing **Complex Partners** request with two choices. The current hand, scores and unselected request were preserved. Five-choice Basic allocation is covered by source checks, not a new live Basic game. The post-round node-identity regression is source-checked; this pass did not play another complete request to repeat the transition. CSS viewport testing in the embedded browser is not physical-device or Safari validation.

`summary.json` indexes all 64 cases; each has `.json`, `.txt` and complete `.jpg` evidence. `final-review.jpg` shows the restored 592 × 579 review pane. Coach was closed, the original pin preference restored, and temporary viewport overrides reset. The actual game tab remains available for annotations.
