# Centered Jacks — 14 October 2026

CR-UX-008 owner follow-up. Status: implemented, rebuilt from current source and verified in the visible built-in browser at the actual main server, `http://127.0.0.1:4174/`.

## Root cause and change

The previous fitter maximized face size first and moved the board into any clear rectangle. At the owner's 686×579 viewport, the board was **138.39 CSS px right of the felt center**. Single-stack checks passed but did not assert centering. The new evidence helper records center deviations separately.

Jacks now fits symmetrically around the actual felt center on both axes. Its four player tags use one horizontal row. The table receives the space previously reserved above the hand for lifting; resting hand size and position are preserved, with the existing lift/drag allowed over the table or player tag. Coach clearance still includes the possible lift. These presentation changes are scoped to Jacks and shared by live and saved tables. No backend, card artwork, legal-action or gesture changes are required.

## Verification

- `node --test --test-isolation=none web/tests/rally-responsive.test.ts web/tests/rally-announcements.test.ts web/tests/rally-phase-prompts.test.ts`: **59 passed, 0 failed/skipped**. Exact-center and reclaimed-lift regressions failed against the earlier implementation. The expanded actual-hook matrix covers 4,608 side-announcement placements, including 2,816 compact cases, 25 valid distributions, hidden/revealed wrappers and opening/dense boards. No null placement or name/hand collision. The broader phase matrix checks 1,134 source allocations, 162 trick fits and 324 Jacks fits.
- Native Go, TypeScript and Vite builds passed. Main listener PID 36016 was verified against `C:\repos\test-jev\.local\cardford.exe`; health ready with local-test identity, fixture payments, provider off. Existing large-bundle warning remains. Database/game preserved; no QA listener or alternate source folder was used.
- **18 landscape profiles**, 568×320 through 2560×1080, plus the owner's **686×579** viewport: all applicable bounds, clearances, single-stack and exact felt-center checks passed. Maximum observed center error is less than **0.02 CSS px** on either axis. Existing hand: 37 public cards, full Ace-to-two Clubs stack, three revealed West twos.
- At the owner's viewport the felt is **25.99 CSS px taller**. Resting hand-card position and dimensions are identical before and after. The four player tags are horizontal; South remains centered near the lower edge.
- **Coach and saved Why** checked at 568×320, 844×390, 1024×768 and 1440×900; desktop floating and pinned modes also checked. All applicable checks passed. The saved cue contains one frame, so this verifies saved layout and return to live play, not multi-frame navigation.
- Performed a real mouse hold, moved the lifted 4 of diamonds over the South tag/table edge, returned it to the hand and released without playing. [Overlay screenshot](centering-hand-overlay-current.jpg). The game hand and scores were preserved.
- The six original card-artwork/gesture/motion files still match the integrity baseline byte for byte. CardPrimitives retains only the previous authorized Joe display-name import/export change; its hash is unchanged by this follow-up. `git diff --check` passed. Independent bounded review found no high-confidence regression.

## Evidence and limits

Final browser evidence uses helper **v9**: `centered-final-*.jpg/json/txt` (28 cases). It captures the actual viewport without temporary screenshot resizing. The earlier `centering-*` v8 measurements remain diagnostic evidence; v9 screenshots supersede their image captures. Before evidence: `centering-before-current.jpg/json/txt`.

[Current browser view](centered-final-current.jpg) · [iPhone SE](centered-final-se1.jpg) · [iPhone 12](centered-final-iphone12.jpg) · [iPad](centered-final-ipad.jpg) · [desktop](centered-final-desktop.jpg) · [desktop Why](centered-final-why-desktop.jpg).

The dense SE stack has **17.59 CSS px** faces in the captured hand; conservative source fixtures reach 15.7 px. Ranks remain exposed, but physical-device readability and touch acceptance remain manual checks. Hidden twos and alternate distributions were tested as source geometry, not by replacing the owner's live hand. Other phases retain their existing layout and passed source regressions; they were not replayed through every game in this follow-up.

Returned to live play, restored Coach pin preference, closed Coach, and reset the temporary viewport override to 686×579. This report does not close the separate full-game review, intermittent server-pause investigation, or physical-device acceptance.
