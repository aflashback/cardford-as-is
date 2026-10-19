# Narrow Jacks and Coach launcher — 14 October 2026 (Toronto)

Requirement: CR-UX-008 owner browser annotations. Actual native app at http://127.0.0.1:4174/, main checkout C:\repos\test-jev. No alternate preview or fixture listener.

## Cause and correction

Solo and Partners already shared the fitter. The narrow 592×579 view still reserved obsolete 208px player boxes although its visible tags were only about 136–146px wide. Solo also reserved empty Partners-only announcement pockets. These constraints reduced its Jacks faces to 22.3px.

The fitter now reserves stable current name/score typography, avatar, full 13-card opponent fan, padding and gaps. It never measures the shrinking visible tag or fan. It reserves all Ace-to-two rank coordinates from the beginning. Partners retain permanent twos pockets; Solo omits them. Live, Why and legacy saved review pass the variant consistently.

The Coach launcher uses the native hidden attribute with an explicit display:none rule while the drawer is open. It is absent from layout and keyboard navigation. The existing close handler restores focus after it reappears. Both pinned and overlay modes use this behavior.

No backend, scoring, game rules, canonical card art, gestures or trick timing changed. No commit or deployment performed.

## Passed

- `node --test --test-isolation=none web/tests/rally-announcements.test.ts web/tests/rally-responsive.test.ts web/tests/rally-player-content.test.ts web/tests/rally-coach-presentation.test.ts`: **130 passed, zero failures/skips**. Covers all four variants, nineteen sizes including the reported panel, empty/full rank geometry, changing fan counts, hidden/revealed/consumed twos, Coach states and player score/count content.
- `npm run typecheck --workspace web`: passed.
- `VITE_BACKEND=go npm run build --workspace web`: TypeScript/Vite passed. The initial sandbox attempt could not spawn esbuild; the authorized build succeeded. Existing bundle-size advisory remains.
- Independent read-only review found no concrete defect in stable clearance, variant propagation, resize/pinning or launcher focus.
- Current served HTML/JS/CSS verified against the built files. Server restarted as PID 41500, local-test identity, fixture payments, provider off. Startup receipt: `.local/rally-review/server.json`.
- Built-in browser visible throughout; original Complex Solo hand preserved without playing cards or switching games. The annotated 592×579 viewport plus 568×320, 667×375, 844×390, 1024×768 and 1440×900 were captured with Coach closed, open and Why. All applicable capture geometry checks passed. Coach pin preference was preserved; temporary viewport override reset.
- At 592×579, card width increased **22.3 → 36.1 CSS px (62%)**, exactly centered on the felt. [Before](before-solo-592.jpg), [after](after-solo-592.jpg).
- Launcher absent while open at every tested preset; pinned desktop and tablet and desktop overlay checked. Closing at the reported size and desktop restored the sticker and keyboard focus. [Open Coach](after-coach-open-592.jpg), [pinned desktop](coach-desktop.jpg).
- Saved Why matched live open-Coach board/card geometry at all five presets; returned to live play successfully. [Phone Why](why-iphone12.jpg). One preview cue was saved using the normal UI.
- Browser console had no retained warnings/errors after verification. [Review-ready original hand](review-ready.jpg).

## Scope of evidence

These are Chromium viewport checks, not physical iOS/Safari acceptance. Current browser evidence is Complex Solo with three opening Jacks and its one-frame saved Why. Full-board progression, other variants and announcement distributions are source regression evidence in this change, not new live games. Existing Partners browser captures remain historical. The original hand remains ready for the user to review.
