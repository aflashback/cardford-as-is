# Compact player details — 14 October 2026

CR-UX-008 owner annotation follow-up. Implemented and rebuilt from the current checkout on the actual server at `http://127.0.0.1:4174/`.

## Changes

- Jacks tags use content width and normal small gaps. Opponent card fans use their intrinsic count width. The board fitter uses separate, invisible maximum clearance rectangles so shrinking tags never change the Ace-to-two footprint.
- Remove the actor's remaining-card indicator in live Trix, Hearts and Spades and their saved tables. Opponents retain their indicators. No empty actor detail wrapper remains during Jacks.
- Hide Jacks per-seat scores throughout the active request, including when one player finishes before the others. Show them at round/session completion. Other request scores, cumulative header totals and score access remain unchanged.
- No backend, scoring, legal-action, canonical card, gesture or motion changes. No commit or deployment.

## Verification

`node --test --test-isolation=none web/tests/rally-responsive.test.ts web/tests/rally-announcements.test.ts web/tests/rally-phase-prompts.test.ts web/tests/rally-player-content.test.ts`

**126 passed, zero failed/skipped.** Coverage includes four Trix variants, every actor seat, completed scores, other Trix requests, Hearts/Spades details and header totals. Geometry tests include 504 varying tag-width/count comparisons, 4,464 rank/two progression comparisons and 4,608 side-announcement placements across eighteen landscape profiles and Coach states.

Go, TypeScript and Vite builds passed. `latest-compact-tags`, native PID **38656**, exact executable `C:\repos\test-jev\.local\cardford.exe`; health ready and served assets match the current build. Existing large-bundle warning remains. Local-test identity, fixture payments, provider off. Database preserved; port 4191 untouched. Receipt and logs: `.local/rally-review/server.json`, `latest-compact-tags.*`.

**30 current browser captures** with helper v10: eighteen live Jacks landscape profiles, four Coach views, four dense saved Why views, current empty/progress/final views and request selection. All applicable bounds, image, announcement, hand and center checks pass. Viewports are measured in the evidence JSON; browser zoom can round a requested dimension by one CSS pixel.

The current table offered request selection after reload. Selected Trix Jacks and played the Jack of diamonds using its keyboard action, then observed the three bot plays and announced-twos reveal. No game was replaced or reset. At 686×579:

- Own card-count elements: **0**; active Jacks score controls: **0**.
- Visible tag widths: You **72.02px**, Leo **135.70px**, Maya **145.98px**, Joe **135.76px**, replacing the previous uniform208px boxes.
- Empty and progressed live board rectangles/card metrics are **identical**. Dense saved Why and early live boards also have identical rectangles/metrics on iPhone SE, iPhone12, iPad and desktop with matching Coach state.
- Real North, West and South twos were checked hidden/revealed. Other distributions are source geometry coverage.

Seven protected files match expected hashes (six original baseline hashes; CardPrimitives retains only its previously authorized Joe-name hash). Independent bounded source review found no actionable issue. `git diff --check` passed.

## Evidence and limits

[Current live table](compact-tags-final-actual.jpg) · [iPhone SE](compact-tags-live-se1.jpg) · [iPhone12](compact-tags-live-iphone12.jpg) · [iPad](compact-tags-live-ipad.jpg) · [desktop Why](compact-tags-why-desktop.jpg).

Current files: `compact-tags-{live,coach,why,final,request}*.jpg/json/txt`. `compact-tags-before-live.*` is historical before evidence.

Completed-result score visibility and alternate actors/variants were verified in executable content checks; this pass did not finish every game in the browser. The saved cue has one frame, so no multi-frame playback claim. Keyboard play was exercised; physical Safari, touch/double-tap and small-phone readability remain manual acceptance items. The separate full-game review and prior intermittent server-pause investigation remain open.

Returned to the actual live Jacks hand with Coach closed, pin preference preserved, and viewport reset to 686×579. The tab remains available for annotations.
