# Fixed Jacks footprint — 14 October 2026

CR-UX-008 owner follow-up. Implemented in the actual current checkout and rebuilt on `http://127.0.0.1:4174/`. No alternate game folder or QA listener.

## Change

The fitter previously derived its first row and height from occupied ranks. Player-card fan widths and disappearing twos also changed its available space. It now reserves all thirteen ranks, Ace through two, in each of four vertical suit stacks from the beginning. Fixed player/fan widths and permanent maximum three-two pockets keep the fit independent of public round progress. North twos are bounded inside the short viewport. Live and Why use the same layout; viewport changes and Coach pinning still refit it.

No backend, game rules, scores, card artwork, gestures or motion changes were needed. Original card/gesture hashes still match the preserved baseline; CardPrimitives matches the previously authorized Joe-only update. No commit or deployment was performed.

## Verification

- `node --test --test-isolation=none web/tests/rally-responsive.test.ts web/tests/rally-announcements.test.ts web/tests/rally-phase-prompts.test.ts`: **99 passed, zero failed/skipped**. Fixed-range regressions failed on all eighteen profiles before the fix. The North clipping regression also failed before its correction.
- Source checks cover identical empty/single/asymmetric/full-board metrics and all 52 rank coordinates across eighteen profiles and Coach states; **4,464 actual-hook stability comparisons** across sixty reachable remaining-two distributions; **4,608 side placements**, plus North/South containment. Conservative fixtures reach 15.7px card width; this is geometry evidence, not physical readability acceptance.
- Go, TypeScript and Vite builds passed. Main PID **38652**, exact executable `C:\repos\test-jev\.local\cardford.exe`, health ready, local-test identity, fixture payments, provider off. Served HTML/JS/CSS match the current build. Receipt `.local/rally-review/server.json`; logs `latest-fixed-jacks.*`. Existing large-bundle warning remains. Database preserved; port 4191 untouched.
- **28 current browser captures**, using evidence helper v10: eighteen landscape sizes from 568×320 through 2560×1080; current 686×579 early/final views; Coach and Why on iPhone SE, iPhone 12, iPad and desktop. All applicable checks pass. Maximum measured felt-center deviation: **0.011 CSS px X / 0.006 CSS px Y**. One profile request (915px Pixel 7) measured 914px due browser zoom rounding; recorded in its JSON.
- The live early round has **5 public cards**. Saved Why has **37 public cards**, including a complete Ace-to-two Clubs stack and three revealed West twos. Their board rectangles and card metrics are **exactly identical** at each core size with matching Coach state. See [machine-readable comparisons](fixed-jacks-comparisons.json).

| CSS viewport | Early card width | Dense Why width |
|---|---:|---:|
| 568×320 | 17.6px | 17.6px |
| 844×390 | 23.9px | 23.9px |
| 1024×768 | 45.6px | 45.6px |
| 1440×900 | 54.7px | 54.7px |

- `git diff --check` passed. Independent bounded review found no substantive invariance defect.

## Evidence and limits

[Before opening layout](fixed-jacks-before-early.jpg) · [fixed opening layout](fixed-jacks-final-actual.jpg) · [iPhone SE opening](fixed-jacks-early-se1.jpg) · [iPhone SE Why](fixed-jacks-why-se1.jpg) · [desktop Why](fixed-jacks-why-desktop.jpg).

Before evidence correctly fails the new full-range check. Current evidence is `fixed-jacks-{early,coach,why,final}-*.jpg/json/txt`; earlier captures are historical. The saved cue has one frame, so this check verifies saved rendering and return to live play, not multi-frame playback. All-52-card completion, hidden twos and alternate announcement distributions were covered by source checks; the user's game was not replaced to produce them.

Physical Safari/touch and small-screen readability remain manual acceptance items. This patch does not close the broader all-game review or the prior intermittent server-pause investigation.

Returned to the live early Jacks hand, Coach closed with pin preference preserved, temporary viewport override reset to 686×579. The actual game remains visible for annotation.
