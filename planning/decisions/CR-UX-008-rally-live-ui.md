# CR-UX-008 — Approved Rally presentation on the live game

Owner authorization: 13 October 2026, following approval of DESIGN-R09. Implement the approved Rally design in the actual game UI using `design/rally/DESIGN-GUIDE.md` and its packaged mock. This supersedes the earlier design-only scope for this implementation. It does not change card rules, historical rule profiles, deterministic decision policies, hidden-information boundaries or payment authorization.

## Decision

Use React components and the existing native/legacy session controllers. Keep the canonical card faces, gestures, throws and server legal actions. Port responsive context sizing, short landscape side controls, last-trick pocket, the left overlay/pinned Coach, themes and surrounding pages. Preserve mounted hands during rotation and pause live/server playback when blocked. Source existing advice, review, scores, account and family state from their real APIs.

Do not copy mock identities, sample game history or client-local coaching allowance into live play. Existing server entitlements remain authoritative. The owner scope extension below authorizes new server-persisted, explicitly labelled preview intelligence and comparison items; their presentation does not claim real strategic assessment. Theme and Coach window/pin preferences are local presentation preferences only.

## Acceptance

- All seven native modes retain candidate/command, revision, control-lease, playback and recovery behavior.
- Coach opening, closing and pinning do not consume allowance; explicit requests retain server authorization and idempotency.
- Responsive allocation follows the approved 52px phone strip, 760px pin threshold and height-driven card contexts. Actual rendered/device acceptance remains distinct from source/numerical checks.
- Three palettes use the approved assets/fonts without recoloring canonical cards.
- Type checking, production client build, focused geometry/presentation/session regression checks, and capability gaps are recorded in `qa/implementation/rally/status.md`.

## Owner scope extension

The owner subsequently authorized the supporting backend: two free requested coaching sessions per day, paid unlimited access, persisted recommendations/comments, item feedback, overall review, rating presentation and interactive Why playback. Actual coach intelligence is deferred until the training-lab work is ready. Implement a replaceable, explicitly labelled mock provider now; do not use fabricated preview reasoning or peer comparisons as real intelligence or a real-player ranking.

Add a separate versioned Coach experience ledger and public contract. The stable owner/day quota uses the existing backend's UTC calendar. Existing hand/request unlocks and grant terms remain unchanged; new sessions never double-charge those ledgers. Unlimited admission requires a valid unlimited coaching grant (or clearly labelled local fixture equivalent); game play access remains separately enforced. Reads, toggles, related comments, Why, playback and feedback never consume another session.

Persist immutable provider-versioned items and actor-safe history references. Retain saved feedback by exact item, with revision checks. Include new account-owned records in export and erasure. No rescoring, historical-advice rewrite, trained-provider integration, real population rating claim, payment processor setup or deployment is implied.

## Owner annotation corrections — 14 October 2026

The owner rejected the three-column arrangement inside each Jacks suit. Each suit must retain one vertical overlapping stack at every viewport and in replay; Jacks align across suits. Fit card size to the available height without changing suit/rank artwork or game rules.

Announced twos, both hidden and revealed, may straddle the decorative felt rim. West/East announcements should prefer a lower position beside their owner, while clearing player names/scores and the hand; compact layouts may use the nearest clear position beside the same owner. Generic doubled-card declarations are unchanged.

Rename the default fourth-seat display name from Theo to Joe consistently in labels, teams, avatars and accessible/replay descriptions. This authorizes the display-name import/export change in the protected CardPrimitives file, but not changes to its card rendering or the other canonical gesture/motion files. Keep the original integrity baseline as historical evidence.

The owner explicitly permits backend changes when required. These three corrections use existing seat IDs, public rank ranges and server-owned hidden/revealed two announcements; they require no backend schema, stored-game or rule changes. Review the freshly built main checkout at port 4174, not a separate saved build or fixture listener. Acceptance evidence: `qa/implementation/rally/browser-2026-10-14/ANNOTATION-FIXES.md`.

### Follow-up: centered Jacks table

The owner requires the Jacks board to stay in the middle of the felt at all landscape sizes. Center on both axes before choosing the largest clear card size; do not shift the stack to a side to gain face size. Flatten Jacks player tags into one row (avatar, name, score and remaining-card fan), with South at the lower edge. Let the unchanged hand lift/drag overlap the table or tag, reclaiming its previously reserved blank strip for a taller table. Keep the resting hand fully visible and Coach clear of lifted cards. Apply the same presentation to saved Why frames. Other phases retain their existing layout. Evidence: `qa/implementation/rally/browser-2026-10-14/CENTERED-JACKS.md`.

### Follow-up: fixed Jacks footprint

The owner requires identical Jacks card size and rank positions from the empty board through the final Ace-to-two stacks, including the start of a new round. Reserve all thirteen ranks for every suit before the first play. Keep player-tag and three-two announcement pockets fixed as remaining hands and declarations disappear. Refit only for available layout dimensions (including a viewport change or pinned Coach), preserving the centered single-stack layout and applying it to Why frames. North announcements must remain inside short viewports. No backend or rule changes are required. Evidence: `qa/implementation/rally/browser-2026-10-14/FIXED-JACKS.md`.

### Follow-up: compact player details

The owner rejected the oversized visible player boxes. Jacks tags must fit their contents, with stable invisible clearance used solely by the board fitter. Opponent fans may shrink as cards leave their hands without moving or resizing the board. Remove the actor's own remaining-card indicator from live and saved tables. Hide per-seat request scores while Jacks is in progress, in solo and partner modes; show them for completed results. Retain cumulative header totals, score-history access and scores in other requests/games. No backend or scoring changes are required. This supersedes visible fixed tag/fan widths from the preceding implementation. Evidence: `qa/implementation/rally/browser-2026-10-14/COMPACT-TAGS.md`.

### Follow-up: fourth-card landing and completed-trick dwell

The owner authorized a presentation sequencing correction for Hearts, Spades Solo/Partners and all four Trix variants during trick-taking requests. Show each confirmed public play, including the fourth card, in order. Let the fourth card finish its existing landing motion before starting the full completed-trick dwell at the selected pace. Reduced motion skips the flight, while retaining the visible completed-trick dwell. Only after that dwell may the last-trick pocket advance to the newly completed trick and the next lead become visible or playable. Keep the previous pocket contents during the landing and dwell; a first trick has no previous contents.

Pause, hidden-page and portrait/review interruptions must preserve the remaining presentation interval and must not replay a settled throw or release the next lead early. Incoming server events may remain queued while presentation finishes; they must not collapse away an undisplayed fourth card or its completed-trick dwell. Gate queued human plays and other next-decision controls on the displayed sequence. Reconnect snapshots and saved Why frames remain historical/current views rather than proof that an earlier animation was displayed.

This correction changes client presentation only. Native game state, fourth-card collection, legal actions, winners, scoring, command receipts, persisted history and server authority remain unchanged. Preserve canonical card rendering, gestures and throw motion. The existing public trick history supplies Trix's collected fourth card; no hidden-hand inference is required.

Acceptance record: `qa/implementation/rally/browser-2026-10-14/trick-timing/FIX-VERIFICATION.md`. Eighty bounded source tests passed, including all supported paces and recovery/queue boundaries. Twenty rendered trick intervals passed in the built-in browser across all seven modes at representative landscape sizes, with Hearts/Trix pause-resume and a final Trix trick. These viewport checks do not substitute for physical-device/Safari testing. The earlier public-record inspection establishes persistence and dispatcher delivery, not the original incident's browser-paint cause.

### Follow-up: narrow Solo Jacks and Coach launcher visibility

Owner annotations require the same usable, fixed Jacks sizing in Solo as Partners. Stable invisible player clearance must reflect the current name typography, avatar, maximum fan and end-of-request score, rather than the obsolete wide visible boxes. Solo must not reserve Partners-only twos pockets. Preserve all thirteen rank positions from opening to completion in every variant and in Why; keep permanent announcement pockets in Partners.

Hide the Coach launcher/sticker whenever its drawer is displayed, whether overlay or pinned. Closing restores the launcher and keyboard focus. No backend, rules, scoring, card art, gestures or playback-timing changes are needed. Verification: `qa/implementation/rally/browser-2026-10-15/jacks-coach/VERIFICATION.md`.

### Follow-up: consistent pause and safe table exit

Owner approval covers all seven game modes. App focus/visibility loss, leaving the table, phone portrait and reopening a table require an explicit Resume. Manual pause has no X, Escape or backdrop dismissal that restarts play. Keep Settings and Choose game available from the paused screen; closing either returns to that screen without resuming. A newly selected game opens paused.

Before in-app Account or Demo navigation removes an owned live table, block its inputs and confirm the server stop. Failed confirmation keeps the paused table visible for recovery. View-only tabs may leave without stopping the controlling tab. Cleanup and page lifecycle events also request a stop; a Resume response arriving after another pause or table removal must not restart progression. Preserve existing control leases, command receipts, presentation dwell and native bot commit fences. Normal temporary menus and Coach Why can return to play when they were opened from an active table and no persistent pause has occurred.

Acceptance evidence: `qa/implementation/rally/browser-2026-10-15/pause-fix/VERIFICATION.md`. The preceding pause-review report records the pre-fix findings.

### Follow-up: centered request selection

The owner requires the Trix request picker in the middle of the table at every supported landscape size. Apply centered, fully visible choices on both sides of the measured compact-height breakpoint, including narrow desktop panes and pinned Coach layouts. Keep player and hand lanes clear and preserve at least 44px choice targets. Give the imperatively fitted trick and the request/result container separate React identities so previous trick coordinates cannot carry into request selection. Rules, legal candidates, backend state and card rendering remain unchanged. Acceptance: `qa/implementation/rally/browser-2026-10-15/request-center/VERIFICATION.md`.
