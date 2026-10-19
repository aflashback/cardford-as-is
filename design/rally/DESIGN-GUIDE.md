# CardFord Rally — design guide

**Version 1.1.0 · 13 October 2026 · DESIGN-R09**

The owner approved the Rally direction and selected PNG/SVG artwork, closing the original design review. **DESIGN-R09 adds owner-requested responsive refinements for review** on that same visual baseline. It does not claim a second completed visual acceptance. Production game implementation remains separate; mock coaching, payments, ratings and access rules are not production services.

[Open the approved table](approved/#play) · [Interactive design system](design-system/) · [Component reference](design-system/COMPONENTS.md) · [Sticker gallery](assets/stickers/) · [Package notes](README.md)

## Direction

The table is the main interface. A compact top HUD holds the game switch, team or player scores, and essential actions on larger screens. Short landscape phones use a 52px left control strip to release the full height for cards. Scores, history, preferences and account controls appear on demand. Coach is one optional window on the left, with a visible character sticker that can open or close it.

Design for adults 18+, primarily ages 30–60, who want a quiet, ad-free 10–15 minute card session. Use recognizable card-game language, short action labels and visible state changes. Keep game text brief; put explanation behind **Why**. Do not add persistent side navigation, a permanent coaching rail, a dashboard around the table, promotional banners or an explanatory footer during play.

Rally's visual identity combines chalk surfaces, dark ink, muted green felt and vermilion actions. Dark and warm themes are authored alternatives. Warm reduces the use of blue in the palette; it is not a medical or sleep benefit claim. The existing CardFord symbol remains the mark. Rally is the direction name, not a newly designed logo.

## Snapshot and authority

Use the [approved mock](approved/#play) as the behavior reference and [SOURCE.json](approved/SOURCE.json) for the original working-file provenance, copies and hashes. Historical source paths do not require retaining the superseded competition or working folders. The internal `concept=studio` key is preserved to select Rally's existing board behavior; the public reference name is Rally.

The design system's primary source is this packaged snapshot:

| Layer | Snapshot source | Responsibility |
|---|---|---|
| Shell | [style.css](approved/style.css), [responsive.css](approved/responsive.css), [app.js](approved/app.js), [index.html](approved/index.html) | HUD and compact side strip, routes, setup, dialogs, theme selection, orientation |
| Coach | [coaching.css](approved/coaching.css), [coaching.js](approved/coaching.js) | Optional window, pin, sticker attention, local sessions, explanation and feedback |
| Board | [board-theme.css](approved/shared/board-theme.css), [board.tsx](approved/shared/board.tsx), [useRallyFit.ts](approved/shared/useRallyFit.ts), [rally-fit.mjs](approved/shared/rally-fit.mjs), [RallyJacksLayout.tsx](approved/shared/RallyJacksLayout.tsx) | Felt, seats, phase prompts, measured responsive allocation, live/replay presentation |
| Canonical cards | [CardPrimitives.tsx](approved/shared/vendor/src/table/CardPrimitives.tsx), [HandCards.tsx](approved/shared/vendor/src/table/HandCards.tsx), [card-face.css](approved/shared/vendor/src/table/card-face.css), [hand-gestures.css](approved/shared/vendor/src/table/hand-gestures.css) | Card artwork, geometry, hand actions and motion |
| Tokens | [tokens.json](design-system/tokens.json), [tokens.css](design-system/tokens.css) | Source-traced reference exports; not a production token migration |

The owner-approved Rally shell and surrounding table presentation supersede the older non-card visual direction for this mock. The canonical card and gesture contract remains preserved. Do not apply Rally palette variables to the artwork or replace the card components with reference-page illustrations.

## Themes: preserve the two scopes

Shell and board share a family of colors, but do not share every value. The iframe has its own stylesheet cascade. Flattening the palettes would change the selected mock.

| Shell variable | Light | Dark | Warm |
|---|---|---|---|
| `--bg` | `#eee9dc` | `#191e1a` | `#241c16` |
| `--surface` | `#f8f4e9` | `#273027` | `#352a1f` |
| `--ink` | `#242820` | `#f1eadb` | `#f2dbb5` |
| `--muted` | `#5d6257` | `#b0b7a8` | `#c6ab85` |
| `--line` | `#cacaba` | `#495247` | `#68533b` |
| `--accent` | `#bd442d` | `#ee7659` | `#da9160` |
| `--accent-ink` | `#fff6e6` | `#241c16` | `#241c16` |
| `--tint` | `#e7dbcb` | `#39372a` | `#4b3725` |
| `--felt` | `#d8ddcc` | `#293b30` | `#423526` |

Source: [shell theme declarations](approved/style.css), lines 4–6. Light uses `color-scheme: light`; dark and warm use `dark`.

| Board variable | Light | Dark | Warm |
|---|---|---|---|
| `--board-bg` | `#eee9dc` | `#191e1a` | `#241c16` |
| `--board-ink` | `#242820` | `#f1eadb` | `#f2dbb5` |
| `--board-muted` | `#59604f` | `#c1c8b5` | `#c7af8c` |
| `--board-felt` | `#d8ddcc` | `#293b30` | `#423526` |
| `--board-line` | `#bcc4af` | `#49614e` | `#736044` |
| `--board-accent` | `#bd442d` | `#ee7659` | `#da9160` |
| `--accent-ink` | `#fff` | `#201e19` | `#241c16` |
| `--badge` | `#f8f4e9` | `#273027` | `#352a1f` |
| `--badge-ink` | `#242820` | `#f1eadb` | `#f2dbb5` |

Source: [board theme declarations](approved/shared/board-theme.css), `:root` and the retained `data-concept=studio` light/dark/warm rules. Exact current line pointers are recorded in the token manifest. The light board accent text is inherited from the base rule. It differs from the shell's cream accent text. Keep this inheritance explicit.

The reference exports `--rally-shell-*` and `--rally-board-*` aliases. These names prevent accidental scope merging; the approved mock continues to use its original variables. Each JSON token records its value, source file, line, selector and property. Rebuild only from the approved snapshot with `node design/rally/design-system/build-tokens.mjs`.

## Type, spacing and shape

Use the packaged variable fonts. **DM Sans** is body text, controls, card typography and most labels (`Rally` in shell CSS). **Manrope** is the shell's `h1`, `h2`, `h3` and `.hud-score b` (`RallyDisplay`). Do not assume every numerical score uses Manrope: result values and score-table cells inherit their own shell styles. Both font licenses are included with the assets.

| Role | Current treatment |
|---|---|
| Body | 16px / 1.45, DM Sans |
| Headings | Weight 780, line height 1.08, tracking −.045em |
| Page title | 44px base; 54px at ≥1100px; 39px at ≤800px; 35px at ≤599px; 33px in short landscape |
| HUD score | Manrope, 25px / 750, line height 1, tracking −.05em, tabular numerals; compact top-HUD variants remain. The short-phone side strip uses a named Scores icon instead of visible totals. |
| Primary/secondary action | 14px / 750, 48px minimum height; Coach actions are 44px minimum |
| Coach recommendation | 20px / 1.2 heading; 13px / 1.5 base body; compact 18px / 12px; large-screen body 14px |
| Metadata | 9–12px depending on component; not the size for the primary decision |

These are observed component values, not a newly imposed spacing scale. Common gaps are 4, 6, 8, 10, 12, 16, 20 and 24px. Keep the source's local optical adjustments. Buttons use 8px corners, segments and fields 7px, game tiles 12px, and dialogs/Coach 16px (12px in compact Coach). Board phase prompts retain larger rounding: 22px base, 30px action pills, 32px double prompt; tight phone prompt rules may use 14px. Do not globally normalize these.

Rally's base Spades/Hearts felt uses a 130px radius. Trix uses 22px at the base size; the shared short-height rule at ≤520px overrides it to 24px. The geometry is responsive, not a fixed drawn illustration. Player badge overrides use 9px corners. A restrained inset line defines the felt.

## Shell and responsive layout

Keep one compact control area. At width ≤1000px and height ≤430px in landscape, the play HUD becomes a **52px left strip** with five 44px targets: home, game, scores, pause and menu. Coach remains reachable from its sticker. The game iframe gets the full viewport height after safe-area allocation. Outside that short-phone rule, the top HUD remains 56px, or 48px at height ≤480px in landscape. Safe areas are counted by the outer frame. Use `100dvh`, `viewport-fit=cover`, and the source inset rules. The play page does not scroll; non-game pages and dialog bodies can.

The existing `#game-board` iframe stays mounted. Themes, settings, scores, coaching, portrait rotation and pause must not replace it or reset the hand. Coach overlays the table by default. Explicit pinning creates a left lane only when the measured table-screen width is at least **760px**. Below that width, pin controls are unavailable and an existing pin preference temporarily displays as an overlay. The preference survives closing, navigation, reload and the narrow viewport.

| Zero-inset CSS viewport | Controls | Table-screen dimensions | Coach width / edge | Effective iframe if pin requested |
|---|---|---|---|---|
| 1280 × 720 | 56px top | 1280 × 664 | 281.6 / 12 | 974.4 × 664, pinned |
| 844 × 390 | 52px left | 792 × 390 | 204 / 8 | 572 × 390, pinned |
| 756 × 352 | 52px left | 704 × 352 | 204 / 8 | 704 × 352, overlay fallback |
| 568 × 320 | 52px left | 516 × 320 | 204 / 8 | 516 × 320, overlay fallback |

These are source formula calculations in CSS pixels, not measured screenshots. Pinned width subtracts Coach width, left edge and column gap. At width ≥901px and height ≥481px, Coach width is `clamp(240px, 22vw, 320px)` and its height limit is `min(560px, 70dvh)`. Compact width remains 204px with a 380px base height limit. The actual panel is also constrained by available table height, hand clearance and edges; its body scrolls. The board reports measured hand clearance to the shell, which bounds it between 72px and 65% of the viewport height. The older breakpoint clearances remain initialization fallbacks only. Stickers stay 72px desktop or 52px compact, with 12px or 8px edges. Actual devices can have nonzero safe areas.

Portrait phones satisfy `innerWidth < 700 && innerHeight > innerWidth`. The game becomes inert, card/table controls and Coach are hidden, and a brief “Turn to play. Your hand is paused.” gate appears. A native dialog closes on that transition. Account remains reachable. Returning to landscape reveals the same hand; pending live collection and replay advancement are frozen while blocked. The gate is a safety state, not a second game layout.

Use the [responsive workbench](responsive.html), including the [568 × 320 Trix Jacks example](responsive.html?device=se1&mode=trix-basic-partners&phase=jacks). Its named presets are representative CSS viewport classes, with descriptor provenance where verified. They do not emulate Safari, DPR, touch, notches or browser chrome. Fit/100% changes the review display scale while the iframe retains its chosen CSS dimensions. Resize and rotation preserve the hand; an explicit Load demo or a valid one-time URL scenario loads a new fixture. The reviewer and reference sketch do not themselves prove fit.

## Coach: one optional window

All cue, selection, post-play, review, rating, Why, feedback and history content stays in the same left Coach window. Its responsive outer size stays stable as content changes; it has a scrollable body, width-gated pin button and **X** close button. There is no Coach footer, scrim or second explanation dialog. The design-system's 240px/204px Coach specimens are nominal examples; the workbench demonstrates actual viewport-dependent allocation.

The waiting sticker stays visible during landscape play even when the window is open, so it can toggle the window both ways. Closing acknowledges the current decision. A new decision may re-arm the whistle only when fresh coaching is available. The exact attention cases are **Trix doubling**, **Spades bidding**, and **Hearts passing**. It does not signal Hearts bidding. Whistle attention is a visual/accessible cue; there is no sound, charge or automatic opening. The launcher exposes `aria-expanded`, `aria-controls`, a meaningful image alternative and a polite status message.

The selected character is **The Regular**, an adult human editorial illustration. Keep the selected PNGs: Waiting v2, Whistle v3, Thinking v2, Explaining v2 and Reading v8. Only waiting/whistle are currently wired to the launcher. The other poses are approved asset options, not promises of additional live states. The owner has also approved the SVG derivatives documented in the [PNG/SVG comparisons](assets/stickers/); the approved mock still uses the PNG artwork.

| State | Presentation and behavior |
|---|---|
| Open without a session | Brief request choices; no advice or allowance use from opening |
| Cue | Short before-selection cue; saved-example label when the current context is not the fixture |
| Selected | Exact selected card names for Hearts pass or Trix double; still unconfirmed |
| Confirmed | Retire pending language even while closed or in “When I ask”; no extra use |
| Played | Optional confirmed post-play comment; previous cue archived when play changes |
| Saved | Reloaded or outdated material clearly marked as a saved example |
| Review | Two compact recommendations, Strength and Next practice, each with Why and feedback |
| Rating | Sample 1,240 and 4 of 8 fictional peers; not a real population or measured skill |
| Why / playback | Guided history on the game view with previous/next, play/pause, seek, history and exit |
| Feedback | Helpful/Not helpful plus optional reason/note, attached to that exact item and local only |
| Exhausted | “0 free today”; next request blocked, current session and its Why/feedback retained |
| Unlocked | “Unlocked · demo”; unlimited local requests, no purchase |
| Portrait / other route | Window and sticker hidden; replay timer paused |

Why shows authored historical cards in place of the visible live board while keeping the underlying hand mounted and frozen. Exit returns to that same hand. It does not simulate alternative moves or prove a recommendation was optimal. Use a frame's `moment` label, such as **Pass left** or **Doubling**, when provided; otherwise use its trick number. The playback range remains the same DOM node during frame updates. Feedback, modal interruptions, tab hiding, portrait and the end of the sequence pause advancement.

Explicit panel navigation moves focus to the panel body. Automatic comments do not pull focus from the hand. Close returns focus to the launcher/HUD. Votes retain usable focus after rendering. Timing modes are **When I ask**, **Occasional cues**, and **After the hand**. They operate only within an explicitly requested, accessible session; they never consume a fresh session automatically.

The local allowance is provisional mock behavior: two explicitly requested sessions per local calendar day. A session includes its cue, related comment, Why/replay and feedback. Toggle, navigation, selection, playback and feedback do not independently spend it. A new demo/game clears the active session without refunding daily use. The next local day resets use; Demo Unlock changes only the local preview state. Do not translate this into production entitlement, billing or server-policy claims.

## Games and adjacent screens

The setup keeps the native three pace choices **1×, 1.2×, 1.4×** and seven modes: Hearts Solo; Spades Solo/Partners; Trix Basic Solo/Partners; Trix Complex Solo/Partners. Basic requests are Diamonds, Lutoosh, Queens, The King and Trix Jacks. Complex requests are All combined and Trix Jacks. Do not introduce unsupported selected-deal modes or online matchmaking.

Scores, completed request history, saved play review, results, preferences and the account/family/data flows are concise functional prototypes. Trix score detail uses Current / Kingdom / Total; request history does not perform what-if simulation. The account, invitation preview, family allowance, plan and data controls are mock-only. Nothing is sent to a family member; there is no real purchase, deletion endpoint or backend account change. Audio is a disabled future option. Current product and Coach text is English; translations are not implemented.

## Card and interaction preservation

The canonical face uses the same 82.4 / 57.6 proportion, rank/suit art, opaque card body, scaling and stack rules across hand, trick, history and announcements. Card ink remains `#253e4d`, red ink `#b54b61`, face `#fbfcfb`, border `#d3dddf`, and unavailable face background `#d6d7d6` in the copied source. Do not recolor them for dark/warm themes or lower the whole card's opacity. Other cards must not show through an unavailable card.

Preserve the source hold-to-lift/drag corridor, release threshold, immediate double activation, queue cancellation, keyboard and reduced-motion behavior. Ordinary play goes directly to a played event; do not add a new selection-confirmation screen. Hearts passing and Trix doubling have selection followed by explicit confirmation.

Rally's approved Trix double cue is a small `translateY(-6%) rotate(4deg)` face tilt with normal overlap order (`z-index: auto`). It must not raise the selected card across its neighbors. The original artwork is unchanged. Confirmed public cards and replay are distinct from live selection. The last completed trick has a reserved upper-right pocket during live trick play, while the hand keeps its full allocation. Pocket layout, dense hands, Jacks lanes and announcements remain shared board responsibilities.

R09 sizes surrounding contexts from the actual iframe after the side strip or pinned lane takes its space. Hand width and lift allocation, avatar/label sizes, trick-card width and preview dimensions adapt to that available rectangle. The authored `RallyJacksLayout` measures public occupied ranks and fits its four lanes into clear space around badges/announcements, using the unchanged canonical `CardFace`. It may change context size and lane arrangement as public ranks grow. This responsive wrapper does not change game rules, hidden information, card art or gesture hooks. Source-derived fit calculations are not a guarantee of rendered legibility at every size.

## Motion and accessibility

Shell motion is restrained: icon feedback 120ms, toast 150ms, unpinned Coach entry 180ms from the left. Reduced-motion rules remove transitions/animations. Keep the existing canonical card return/throw behavior; the source distinguishes confirmed live throws from historical seek and initial loads. No continuous character animation or audio is introduced.

Current source provisions include 44px icon targets, 48px primary shell actions, native disabled states, icon labels/titles, a skip link, visible keyboard focus, accessible card names, polite playback captions, orientation input blocking and reduced-motion styles. Shell focus is a 3px accent outline with 3px offset. Coach body focus is 2px inset; the sticker uses a 2px outline with 2px offset. Preserve those distinctions.

The reference page calculates selected color-pair contrast directly from theme tokens. These calculations are useful evidence for those pairs only. Small metadata, native form controls, text zoom, long labels, hand keyboard access, screen-reader announcements, focus across iframe/dialog boundaries and narrow landscape collision cases remain part of future production validation. Completed owner design approval is not a full WCAG, browser, Safari, physical-device or production certification.

## Review and handoff

The owner completed the original Rally design review, including SVG derivatives. R09 responsive refinements are now available for review without changing that approved direction. Source and offline tests establish a separate evidence record for syntax, token consistency, message/state contracts and arithmetic geometry. Agent-run HTML/UI rendering, browser and device testing was not run because the earlier browser security restriction remains in force. Standalone SVG asset rasterizations were inspected separately; see [asset-only inspection evidence](assets/stickers/asset-inspection.json). Owner approval does not retroactively change those test receipts.

Use the [package evidence report](evidence/package-report.md) and the [verification instructions](README.md) for current receipts. Before production implementation, separately review the landscape/portrait matrix, zoom, keyboard and assistive technology, long content, all themes, phase prompts, pin/close, local-data boundaries and same-hand restoration. Preserve the distinction between an approved direction, a passing offline check and a production feature.

The design-system page is an isolated reference. Its theme controls, Coach examples and schematic layout controls do not change the mock's game, allowance or feedback. Its code deliberately does not import production UI, contact an API or redraw canonical cards.
