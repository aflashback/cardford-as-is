# Rally live UI regression review

Owner request: verify the native game against the approved Rally mock, fix layout/style in batches, and use the internal browser with screenshots and annotations. Requirement: CR-UX-008.

## Method

1. Keep the actual game on port 4174 available for annotated review. Keep reference inspection separate. Do not change the approved mock or canonical card artwork/gestures.
2. Set a **measured CSS viewport**, rather than assuming a browser resize equals CSS pixels. The current browser has zoom/DPR scaling; record actual innerWidth/innerHeight with each capture.
3. Inspect one form factor at a time. Record the phase, variant, theme, Coach state, geometry, screenshot and outcome. A source test is not a rendered pass.
4. Group related defects into a batch. Run focused tests/typecheck/build, restart the owned native server, reload, then repeat the same affected states. Add neighboring-size/state regressions where the fix changes shared layout.
5. Close a batch only after the screenshots and functional controls agree. Record remaining gaps instead of treating unvisited states as passing.

## Form factors

Core rendered comparisons: SE1 568x320; SE2/3 667x375; iPhone12 844x390 (plus tighter browser 750x340); iPad Mini 1024x768; desktop 1440x900. Additional breakpoints: the 18 approved profiles in design/rally/device-profiles.js, including tablet Air/Pro, 1920x1080 and 2560x1080. Portrait/landscape return is a separate state test.

These are Chromium CSS viewport checks. They do not establish physical-device, Safari/WebKit, touch-hardware, browser-chrome or notch acceptance.

## Game/state matrix

- Hearts Solo: passing (0/1/3 selections), committed pass, legal/disabled hand cards, trick and last trick, scores.
- Spades Solo and Partners: bid/nil, committed bid, trick and last trick, team/individual scores.
- Trix Basic Solo/Partners and Complex Solo/Partners: request menu, doubling (unselected/selected/confirmed), trick play and last trick, Jacks (opening and populated lanes), deal/game results and scores.
- Shared: full/short hand, overlay/closed/pinned Coach, cue/selection/post-choice/review/rating notes, feedback, Why history/previous/next/play/seek/back-to-live, menu/settings, three themes, pause/reconnect and portrait return.

## Batches

### 1 — Reported defects and shared Coach geometry

- [x] Confirm Coach PNG 404 root cause; allow only approved PNG assets in native server.
- [x] Verify five live PNG responses, content types and original-byte hashes.
- [x] Fix Coach measurement capturing an initially-null ancestor ref; track fit/live/replay position changes.
- [x] Match approved full-viewport height cap, safe-bottom sticker inset and 44px Why seek target.
- [x] Move pass/bid confirmation from hand toolbar into center table prompt; adapt narrow available table width.
- [x] Build/restart/reload combined fixes.
- [x] Repeat core viewport screenshots, pass control/player separation, Coach/hand separation, pin fallback and Why return.

### 2 — Game phases and form-factor sweep

- [ ] Reach native phase scenarios using normal UI or documented isolated native fixtures.
- [ ] Record all seven variants and their supported phases without inventing gameplay state.
- [ ] Traverse approved viewport profiles; inspect images and measured bounds, overlays and scores.
- [ ] Record and batch any additional defects; repeat affected cases after changes.

### 3 — Interaction and evidence closeout

- [ ] Exercise multiframe Why playback and return to unchanged live hand.
- [ ] Exercise feedback, theme changes, scores and portrait return.
- [ ] Run appropriate focused regression suite and canonical-card hash check.
- [ ] Publish evidence/status, keep actual game open for browser annotations, reset temporary viewport override.

## Capture validity

Batch 1 retest: SE1/SE2/iPhone12/iPad/desktop pass+Coach screenshots are saved as `batch1-*`. Passing 0/1/3 selection and enabled confirmation were exercised. A native saved bidding Why frame returned to the identical live hand and retained the pending Nil choice. All five PNGs render. Forty focused JS checks passed and the seven protected card/gesture/motion files match their baseline hashes.

Batch 2 in progress: native Spades Partners bidding and a settled second trick/last-trick state have 18 viewport captures each (`spades-partners-bid-*`, `spades-partners-play-*`). Scores were captured at four core sizes. Existing review dialog was inspected on SE. A native overall Coach review exposes 13 real saved frames; next and keyboard seek to frame 13 were exercised. Remaining checks are still open.

Additional findings queued for batch 2: legacy absolute positioning makes Nil escape the bid action row; a legacy mint bidding icon lacks contrast; Why retains the prior body's scroll position and redundant tool navigation occupies compact playback space.

Browser annotations are arriving from the actual game. The first supplied user screenshot confirms the pass button covering South; the second screenshot was captured after a pause/reconnect transition, so its pixel marker alone is not evidence of the pass location. The selected DOM target and first screenshot agree.

Initial browser screenshots can catch the Coach slide-in animation mid-frame. Treat settled DOM geometry and a subsequent screenshot as the layout evidence. Browser screenshot helpers crop incorrectly at the current browser zoom; captures use the documented per-tab CDP screenshot capability with measured zoom-adjusted bounds where needed.

### Batch 2 focused regression evidence

Executed the following combined suite under a 120-second process watchdog: **72 passed, 0 failed, 0 skipped** (about 0.76 seconds of test execution).

```text
node --test --test-isolation=none web/tests/rally-native-coach-integration.test.ts web/tests/rally-phase-prompts.test.ts web/tests/rally-responsive.test.ts web/tests/rally-coach-presentation.test.ts web/tests/rally-replay-contract.test.ts web/tests/rally-coach-client.test.ts web/tests/rally-coach-auth-cleanup.test.ts
```

The seven protected card/gesture/motion files match all **7/7 SHA-256 entries** in `../canonical-baseline.json`. The feedback Reason select has a valid implicit association with its wrapping label and no conflicting accessible-name attribute; the reported label-locator mismatch did not establish an accessibility defect, so its markup was unchanged. These are source/behavioral regression and integrity results, not completion of rendered QA.

### Batch 4 focused regression evidence

Current-source verification before the next rendered retest: **76 passed, 0 failed, 0 skipped**, including compact request/declaration bounds and feedback editor focus/scroll behavior. The seven suites ran together under a `spawnSync` 120-second watchdog; test execution took about 1.02 seconds.

```text
node --test --test-isolation=none web/tests/rally-native-coach-integration.test.ts web/tests/rally-phase-prompts.test.ts web/tests/rally-responsive.test.ts web/tests/rally-coach-presentation.test.ts web/tests/rally-replay-contract.test.ts web/tests/rally-coach-client.test.ts web/tests/rally-coach-auth-cleanup.test.ts
```

All **7/7 canonical SHA-256 entries** in `../canonical-baseline.json` still match. This pass used no browser, build, server restart or database tests. It establishes focused source/behavioral regression and card-file integrity; the feedback opening fix still requires its rebuilt browser retest.

Read-only inspection of `trix-basic-solo-jacks-full-why-{se1,iphone12,ipad,desktop}.jpg` found Back, playback and seek controls visible at all four sizes. The Coach drawer covers part of the left public layout as the approved overlay tradeoff; these captures do not establish visibility of the covered ranks or physical-device readability. The inspected Why captures contain no modal and therefore do not close the separate scores/settings/history/pause/results coverage items.
