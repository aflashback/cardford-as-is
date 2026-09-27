# 06 — Responsive interaction and accessibility specification

## A. Visual direction

Create a plain, functional four-seat card table, not a casino or a graphical game world. Use a neutral light page, one flat muted table surface, white card faces, high-contrast text and a restrained action accent. No textures, 3D, canvas/WebGL renderer, animated characters, particles, illustrated backgrounds or photo assets. Distinguish hearts/diamonds from clubs/spades by visible suit symbols and labels, not color alone. This is an original design direction; no proprietary Chess.com assets or layout copies.

The dominant information is the user's hand, the current trick and whose turn it is. Score details and advice remain secondary until needed. Font: system UI stack; avoid a font download requirement. Each player is a small circle with an initial or generic user icon, a seat label and compact status. No avatar upload/customization is required. Cards use original HTML/CSS with accessible names such as “Queen of hearts.” No external images are necessary for v1.

## B. Routes and screen responsibilities

| Route | Screen |
|---|---|
| `/` | Start/resume, compact game selector (Spades only initially), play modes, rules summary, exercise entry |
| `/play/:sessionId` | Bidding and playing; safe reconnect and bot/advice status |
| `/review/:sessionId` | Hand summary, decision timeline, original-information review, retry |
| `/practice` | Skill catalog and progress |
| `/practice/:drillId` | Authored exercise, hint stages, result and retry |
| `/settings` | Motion, text size, sound off by default, delete local guest data |

No login, checkout, social feed or marketing site is part of the first release. A visible mode label says **Jev** or **Demo — basic bot** throughout play and review.

## C. Phone-first layout

At 360–599px CSS width, place a compact score/turn strip at the top. Show North above the public-card area and West/East at its sides; South stays below with the human’s hand. Each seat has one simple avatar/initial and remaining-card count. Spades adds bid/tricks; another game adds only its own declared status fields. Do not show hidden card faces or a fanned back for each card if that reduces usable space. The human's hand occupies a stable lower region.

For thirteen cards in portrait, use a wrapping, non-overlapping grid: six columns at 360px and seven when there is room, with a minimum 44px card control width and at least 8px spacing where feasible. At 320px or 200% text zoom, use five columns or fewer and allow vertical page scrolling. Suit/rank must remain visible on every card; horizontal scrolling must not be needed to discover a legal card. Do not force a tiny overlapping fan.

Keep the coach collapsed to a one-line status by default, expandable into an inline panel or accessible bottom sheet. Primary confirmation is sticky within the viewport safe area without covering the last card row. Short-height/landscape screens fall back to normal document flow. The page may scroll vertically; no clipping behind a fixed footer.

At 600–1023px, give the table more space and show an inline coach panel below or beside it. At 1024px and above, use a two-column layout: main table/hand plus a 300–360px coaching rail. Keep score and review content readable; do not merely stretch phone controls across a wide screen.

## D. Interaction details

Tap/click selects a legal card, then **Play [card]** confirms. Keyboard arrows or Tab move focus; Enter/Space selects; a clearly labelled confirmation button commits. Selection alone must never submit. During bidding, use fourteen labelled choices (Nil, 1–13) plus confirmation, with a brief explanation of Nil.

Illegal cards are visibly unavailable but remain discoverable to assistive technology using `aria-disabled` and explanatory help. Selecting an unavailable card shows the rule without changing the game. Do not rely on a tooltip available only on hover. Use a single roving-focus card group or predictable tab order; document and test the chosen pattern.

Announce turn changes and trick winners through a restrained live region. Do not announce every background poll. When a trick completes, keep its four public cards visible long enough to inspect; provide “Last trick.” Animation speed cannot change game legality or permit extra actions. Respect reduced-motion preferences.

## E. Required states

Provide intentional screens for initial loading, resumed session, waiting for a bot, advice pending, provider unavailable, expired guest session, request conflict, reconnecting, invalid action, hand complete, match complete and deleted/expired session. Error messages must explain whether the game was saved and what action is available.

On an ambiguous submit timeout, show “Checking whether your move was saved” and refetch or retry the same command ID. Do not invite a second independent play. A 409 refreshes the view and preserves only UI selection that remains legal. On a bot outage, keep the current hand visible and offer retry or return home; starting demo is a separate explicit session.

## F. Accessibility and acceptance matrix

Target WCAG 2.2 AA. The project chooses 44px minimum primary interactive controls, larger than the general 24px minimum criterion with its exceptions in research R19. Verify actual contrast, keyboard access, focus visibility, status announcements, reduced motion and 200% text resizing; do not declare compliance based only on an automated score.

Test at 320×568, 360×800, 390×844, 768×1024, 1280×800 and 1440×900 CSS pixels. Include phone landscape, iOS Safari and desktop Chromium/Firefox/WebKit coverage. Browser emulation is useful but not a substitute for a physical touch/screen-reader pass (R18).

Acceptance: all thirteen cards are individually identifiable; no page-wide horizontal overflow; suit/rank and turn are readable; bid and play confirmation are reachable with keyboard and touch; expanded coaching does not obscure a required action; focus returns correctly after sheets; review can be navigated without drag gestures. Capture screenshots of every main state at phone and desktop sizes in the implementation evidence, not in this planning pack.

## G. Stable layout, replaceable game details

The reusable visual regions are `Header`, `NorthSeat`, `WestSeat`, `PublicCardArea`, `EastSeat`, `SouthSeat`, `HumanHand`, `ActionControls`, `ScoreSummary` and `CoachPanel`. This is a layout contract, not a generated mockup. The renderer takes safe `TableView` data and optional trusted module components.

For Spades, the public area is a four-card trick and actions are bid or play. Individual competition displays four score rows and no partner badge; team competition displays two rows and explicit membership. Team membership never grants access to a teammate’s hand. Bidding, trump, trick counters and passing controls are shown only when the game module provides those capabilities. A future draw/discard game can replace the central-area and action-control components without replacing seats, cards, coach, history or sessions.

Card representation separates instance ID, face label and visibility; the generic UI does not assume every deck has 52 cards or a universal rank order. The first release supplies the standard 52-card deck only. Hidden zones expose counts, not secretly populated card arrays. Motion is limited to optional short state transitions, disabled under reduced motion; game state never waits for an animation.

Acceptance additions: a test-only four-individual configuration renders four score rows and zero partner/bid/trump placeholders. The same table works in phone portrait. A production build lists only games actually implemented. Module UI hooks cannot access private server state or arbitrary downloaded JavaScript.
