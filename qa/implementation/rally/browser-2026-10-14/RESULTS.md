# Rally native UI — rendered review, 14 October 2026

CR-UX-008 follow-up. The review uses the actual Go-connected React game in the visible Codex browser, with screenshots and annotation available to the owner. The approved Rally mock remains unchanged.

**Status: closeout in progress.** Final Hearts coverage and rebuilt Pass-label verification are pending. This report does not declare every game state or physical device accepted.

## Fixes verified in the browser

| Defect | Change and observed result |
|---|---|
| Coach sticker requests returned 404 | Native static serving admits only the five approved PNGs. Live GET/HEAD, content types, original-byte hashes and rendered stickers agree. |
| Passing and bid controls covered the South player | Phase confirmation moved into the table prompt; compact player lanes leave room for actions. Hearts 0/1/3-card passing and both Spades modes were exercised. |
| Compact Nil escaped the bid row | Removed its inherited absolute placement in the Rally phase row; retained a 44px target. All 18 Solo bid sizes fit. |
| Coach measurement used an initially-null table ancestor | Position now follows mounted table/hand refs, resize, replay and pin transitions. Overlay clears the hand; wide-screen pin reserves width. |
| Why used scarce space for redundant tools and opened at stale scroll | Dedicated Why view puts Back, playback and seek first. Explicit navigation resets only the Coach scroll area. Live hand is restored after playback. |
| Basic Trix request list ran into hand/player space on small landscapes | Compact request grid and reserved badge lanes fit four/five choices with 44px targets. Both menus passed all 18 profiles. |
| Five confirmed doubles extended past the SE screen | Compact South declarations sit to the left of the badge. Complex Partners play passed all 18 sizes; core dark/warm captures also fit. |
| Feedback opened beneath the compact Coach viewport | Opening feedback focuses Reason and scrolls only the drawer. Rating and Why paths fit at four core sizes; editing retained focus and feedback saved. |
| Doubling Pass label inherited faint 10px text | Scoped theme-ink 12px styling is implemented and source-tested. Rebuilt browser check is pending. |

Canonical card artwork, ranks/suits, gestures and movement files retain their baseline bytes (7/7 SHA-256 matches). No rules, hidden-card visibility or playback deadlines were changed.

## Evidence method

See [the plan](REVIEW-PLAN.md), [scenario inventory](scenario-inventory.md) and [capture index](CAPTURES.md). Each captured state has a JPG, rendered DOM text and measured geometry JSON. Original failing captures remain as before evidence. A repeated successful capture is not retroactively applied to an earlier failure.

All seven modes are exercised through ordinary game controls. Trix uses a private, validated deterministic deal sequence on an isolated native listener at `http://localhost:4191/`, backed by the guarded local test database. The owner's actual app at `http://127.0.0.1:4174/` remains separate. No DOM mock or hidden-state game driver is used. Coach explanations and comparison ratings remain explicitly labelled preview intelligence.

Eighteen landscape profiles cover 568x320 through 2560x1080, including both SE sizes, iPhone 12/15/Pro Max, Pixel/Galaxy, iPad sizes, browser-height reductions and desktops. JSON records actual CSS width/height; pane zoom can produce a one-pixel difference. Geometry checks are paired with screenshot inspection. Entering drawer animations can produce transient pre-settlement bounds; those captures are retained and repeated after settlement.

## Current coverage

| Mode | Captured/exercised states |
|---|---|
| Hearts Solo | Initial main-app pass selection/Coach core sizes; isolated expanded pass/play review pending. |
| Spades Solo | Bidding and live trick/last trick at 18 profiles; individual scores at four core sizes. |
| Spades Partners | Bidding and live trick/last trick at 18 profiles; team scores, Nil, Coach review/feedback and Why at core sizes. |
| Trix Basic Solo | Request, four-card doubling, live trick/declarations, opening/dense Jacks across 18 profiles; short hands; complete Queens and Jacks requests; scores and Why with all 52 public Jacks cards. |
| Trix Basic Partners | Five-choice request, opening Jacks with concealed twos, revealed twos at 18 profiles; team scores. |
| Trix Complex Solo | Two-choice request, one/five selected doubles, live trick/last trick, dark/warm, Coach, settings and rotation. |
| Trix Complex Partners | Request, five selected doubles, confirmed declarations/live trick/last trick at 18 profiles; core scores/themes/feedback. |

Shared interactions include closed/overlay/pinned Coach and compact pin fallback; cue, selection and recorded-choice comments; review/rating previews; saved feedback across restart; Why previous/next/seek/play to end; return to identical live hand; Jacks queue and Escape cancellation; portrait gate and return with the same cards/pin preference. These are observed UI behaviors, not strategy-quality evidence.

## Tests and builds

- Latest seven-file focused client run: **81 passed, 0 failed, 0 skipped**, including the phase contrast regression.
- Safe playback diagnostic tests: **2 passed**. Native sticker-serving tests: **4 passed, 1 existing Windows symlink skip**.
- Native Go, TypeScript and Vite builds pass. Existing Vite large-chunk warning remains.
- Canonical protected files: **7/7 unchanged**. `git diff --check` passes.

The earlier broader database run remains incomplete/failing as recorded in [implementation status](../status.md); it is not superseded by UI checks or claimed as a pass.

## Remaining limits and observed reliability issue

Two unrequested native playback pauses occurred in Basic Solo/Partners Jacks. Both resumed normally through the UI without losing game state. Existing runner errors had no useful diagnostics, so a bounded, redacted stage/class diagnostic was added and tested. It logs no game IDs, cards, decks, credentials or raw database errors. The cause is **not established or fixed**; no timeout was weakened. Future reproduction should inspect `cardford_playback_runner_exit` in the local server log.

CSS viewport simulation does not establish physical iPhone/iPad, Safari/WebKit, touch/drag hardware, notch or browser-chrome acceptance. Not every 20/8-deal campaign, final match outcome, quota/payment state or every combination of theme and game was played. The local Coach account is labelled unlimited; current browser evidence does not establish paid checkout or a real-player rating.

No commits, publication or deployment were made. Unrelated checkout changes are preserved.
