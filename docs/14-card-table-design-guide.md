# CardFord card-table design guide

Spades is the reference experience for every installed card game. This guide records the owner's accepted table changes in [CR-UX-006](../planning/decisions/CR-UX-006-card-table-experience.md) and [CR-UX-007](../planning/decisions/CR-UX-007-trix-shared-table.md). It is an implementation contract for reuse, not a new visual direction.

## Table structure

Keep a quiet header with brand, game/variant and icon controls. The main area contains the four-seat table and a right rail. Reserve the heading-free last-trick box above the coach from the beginning; it stays empty until a trick completes. Put the human badge at the centred South edge of the table, using the same avatar/name/count component as the opponents. Keep the overlapping hand in a separate row below, centred on the table rather than the entire screen.

The shared header is 20% shorter than its original breakpoint heights: 65.6 px on wide desktops, 54.4 px below 1100 px width, 48 px in landscape up to 720 px high, 36.8 px up to 520 px high and 33.6 px up to 350 px high. Short-landscape controls fit within it; brand and card artwork remain unchanged.

The game selector is 32 px high across games with 4 px vertical padding and 8 px between its labels. Use the shared Dialog's compact variant for the Trix catalog: 420 px wide, 14 px padding, 6 px option gaps and a minimum 48 px option height. Keep full variant names and existing keyboard behavior; this does not change the Hearts/Spades setup steps.

The decorative felt is scaled to 90% width and height around its centre. Keep the table coordinate system unchanged so player tags, trick cards, announced faces/backs and the held hand retain their positions and sizes. Tags may sit on or outside the felt edge. Adaptive Jack lanes alone use the remaining visible interior to fit larger cards.

Do not put routine rule explanations, deal/kingdom counters or request lists in the playing surface. Game choice, settings, detailed scores and review use the shared dialog. Request choice appears only when the server asks the human to choose. Doubling uses the small non-overlay control described below. The next request starts after the final trick's display pause; no request-complete popup opens.

## Shared components

| Component | Responsibility | Game adapter supplies |
|---|---|---|
| `table/CardPrimitives.tsx` — `CardFace` | Original rank/suit artwork used everywhere | Public card ID |
| `table/ScoreTotals.tsx` | Heading-free corner totals and leading/trailing colours | Confirmed competitor groups, game totals and score direction |
| `PlayerBadge` | Seat, avatar, partner cue, public announcements | Active seat, declared partner, score/status content |
| `RemainingCards` | Card-back fan and exact accessible count | Server's remaining-card count |
| `TrickCards` | Seat positions and visual pile | Public plays, confirmed winner, presentation depth |
| `LastTrickCards` | Permanent history box and winner cue | Latest public completed trick |
| `table/HandCards.tsx` + `useHandGestures.ts` | Stable pointer targets, hold/drag, double activation, queued play and keyboard access | Own cards, legal choices, turn/phase, decision/deal identity and server-command callback |
| `table/Dialog.tsx` | Focus trap, dismissal and focus return | Content and dismissal action |
| `table/useViewport.ts` | Viewport height and phone rotation gate | No game rules |
| `table/RotationGate.tsx` | Shared landscape prompt and account/example access | No game rules |
| `table/playback.ts` | All preset playback delays | Saved speed preference |
| `table/useCardThrows.ts` | Short confirmed-play flight from hand/fan to the existing face | Deal identity, public turn, pause state and speed |

Use the common `.app-shell`, `.topbar`, `.game-shell`, `.play-space`, `.table-stage`, `.table-zone`, `.coach-rail`, `.hand-section` and card classes. `table/card-face.css` owns every proportion of the artwork. `table/table-layout.css` is loaded after legacy `styles.css` in both production and fixture entries; it owns the four-seat placement and separate hand row. Game CSS may style its unique phase content; it must not recreate seats, normal hands, trick piles or card faces. Trix's `Card.tsx` is an alias to the shared face.

## Card geometry and gestures

- Active trick cards use the accepted sizes: 57.6 × 82.4 px on desktop, with common responsive overrides. They are 20% smaller than the former design. Render only cards actually played.
- Keep North/West/East/South placement. North and South overlap the side cards by 8% of height; West and East have a gap of 20% of width. Rank/suit corners are inset beyond the overlap. The winning card is on the highest layer. Spades alone supplies trump to the depth adapter; Hearts and Trix do not inherit it.
- Card faces emphasize the upper-left rank/suit and lower-right suit, without reproducing a physical deck. Every context uses exactly the same aspect ratio, corner position, proportional fonts, border, radius, colours and pip placement; only `--card-width` changes. This includes held, trick, Jack-layout, doubled and last-trick cards. Hand overlap starts at 40% of card width and increases to 62% as available width narrows. Keep illegal cards solid and opaque, with suit colours retained, full-strength rank/suit ink and an opaque background mixed 70% card white with 30% neutral grey (#d6d7d6); disable them without a lock icon. Never lower the whole face's opacity: overlapping cards must not show through. During request choice, show the full hand in normal colours with interaction disabled. During your doubling turn, only eligible cards are selectable; all other cards keep their suit colours but use the greyer opaque unavailable background.
- Hover and ordinary pointer clicks/taps do nothing. Hold a legal card for 200 ms during the human turn to lift it 22% and expose the entire face above the other cards. Keep the actual button fixed. Drag the face within the hand-to-table corridor, clamped to 10% tolerance along and across its length. Release at least halfway toward the table inside the corridor to play; near-hand or out-of-corridor releases return in 140 ms without submitting. Dragging is unavailable off turn. Cancel unfinished picks on pointer cancellation, blur, resize, pause or decision change.
- Double-click/tap on turn gives an immediate small 10% lift and starts the request in the same event task. Do not wait for a pop timer before contacting the server. Keep that face lifted during preparation/confirmation; busy disables further input without dropping it back into the hand. Rejection restores the original face. Off turn, double activation queues the card, shown with a 10% lift, to play automatically on the next legal human turn. Double again or press Escape to cancel; another double-activated card replaces it. Cancel on a new deal, card removal, phase departure or an illegal next-turn card. A pause retains the queue without sending; reload clears it. The adapter still rechecks the current server legal set and prevents duplicate submission.
- Enter/Space explicitly plays or queues; left/right arrows move between enabled cards. During Hearts passing or Trix doubling, hold or Space toggles selection; double-click/tap or Enter selects and retains a selected card. Those phases still need separate confirmation and keep the existing selected-face cue. Keep semantic labels, focus cues and reduced-motion support. Pointer-only interactions must not replace keyboard access.
- Display remaining cards as fans: 1–4 individually countable, 5–8 countable with closer overlap, 9–13 dense. Zero has no backs. Exact counts remain accessible; other players' card identities stay private.
- Keep the South player badge rounded on all four corners with bottom padding beneath its fan. Never hide its avatar at narrow review widths. The active seat has a clear gold avatar ring and a warm name/score highlight. The compact partner icon carries an accessible label; do not add the visible word Partner to the name.
- Put four equal score squares in a compass arrangement in the top-left table corner, clear of the North and West badges. Position replaces visible compass labels; accessible labels retain seat and player names. Partners repeat the confirmed team value at both seats, while solo games keep individual scores. Keep current-round values at the player badges. The score adapter supplies competitor totals and direction: lowest leads in Hearts, highest in Spades/Trix. Compare competitors before repeating team totals: green means leading, red trailing, and a tied lead stays neutral. Accessible text conveys the same status. Reserve four digits plus a minus sign; compact larger numbers without losing the exact accessible/tooltip value. Do not sum repeated team totals.

## Playback and pause

Next-turn double activation remains available during opponent server work. Preserve its first click across opponent decisions in the same deal; starting a new deal or leaving play resets it. The queue is local until the current human decision permits submission. Pause, errors and view-only access still block input. A stationary pickup can be the first press of a double-click/tap; only an actual drag consumes the click on release. The 200 ms hold tolerates small pre-pickup movement, bounded by `max(16 px, min(40% card width, 10% hand-to-table distance))`, so a slight mouse/finger drift does not cancel it. The established drag corridor applies after pickup.

The three saved preferences remain 1, 1.2 and 1.4. Divide the old 900 ms turn and 2100 ms collection delays by `speed × 1.3`: at 1×, approximately 692 and 1615 ms. These pauses are separate from backend preparation and network latency.

Queued cards lift immediately without a transition; selection-only phases retain their 80 ms transition. An on-turn double activation lifts immediately and submits in the same event task. Human-action preparation status reads run sequentially without an added polling sleep; each read waits for its HTTP response before the next begins. Background bot/coach checks retain their 150 ms sleep. Server work and confirmation still determine when a play is accepted. The hold-to-drag threshold remains 200 ms.

Newly confirmed cards throw from their lifted or dropped hand position to the final table face; opponents use their public card-back fan as the origin. Use the same transform-only flight for tricks and Trix Jacks: `150 / (speed × 1.3)` ms, about 115 ms at 1×, halved from 231 ms. A temporary, inaccessible, pointer-transparent copy of the canonical face travels above the table while the destination stays in place. Restore the destination at its normal pile depth on landing. No initial-load, new-deal, history or multi-card catch-up animation; no concealed identities or speculative plays. Reduced motion skips return and flight transitions; pause, resize and unmount settle visuals immediately. A double activation immediately acknowledges and rechecks legality before submitting; the confirmed flight does not block input. The old card-entry fade/shift is disabled so there is only one entry motion.

Trix atomically collects a trick on the server's fourth play. Display that completed public trick for the shared collection delay before enabling the next action, including the last trick of a request. Never add a fake engine phase or recompute official scoring to hold the picture.

Pause keeps the table mounted behind an inert overlay, cancels pending bot preparation, and freezes the remaining collection time. Resume removes the overlay immediately and refreshes in the background. Stale, canceled or unconfirmed work still uses the existing authoritative transport and recovery fences.

## Trix-specific phases

Call the layout request **Trix Jacks** in every variant; the family name remains Trix. In new Partners games, an automatic server announcement may provide hidden two-card holder counts followed by revealed card/seat pairs after the first four turns, including passes. Render those counts as card backs in the same badge area as doubled cards, then render the revealed twos with the shared face. Never infer the reveal from a timer, hand contents or local turn counting. Do not place concealed card IDs in the DOM, add confirmation controls, or change normal opening legality. Remove a revealed announcement face when that two is publicly played. See [CR-GAME-002](../planning/decisions/CR-GAME-002-trix-jacks-twos-announcement.md).

The Jack board has four vertical suit lanes, aligned on Jacks. Higher ranks grow upward and lower ranks downward. Overlap tightly enough to expose just each rank; the front card supplies the suit. Remove the separate row of suit headers. Empty lanes have no J placeholder. The layout fitter measures the felt, badges and announcements, then uses the largest clear rectangle for all 13 ranks in each suit (up to 56 px card width). It may adjust the board sideways to avoid an announcement; announcement and badge positions do not move. Card size is stable as a lane fills. All 52 ranks must remain visible without crossing player labels. All faces still use the shared artwork. This compact board is the exception to the common trick pile, not a second card design.

North-seat announcements sit 14 px to the right of the badge at the upper table edge, with their bottom 8 px above the badge's bottom. This owner-anchored position separates them from the Jack lanes in both face-down and revealed states. Position them absolutely so they do not widen the name badge or change card sizes. Their anchor remains independent of adaptive Jack sizing; the board fits into the clear interior. Other seats retain their existing table-side announcement positions. Announced twos, faces and backs, are 20% larger than the earlier announcement size: 43.2 px wide on desktop and 31.68 px in short landscape, with the same shared card proportions. This enlargement is specific to twos and does not resize doubled queens or kings.

When the confirmed legal choice is a layout pass, send it automatically at the shared pace. Show `Pass` above that player's avatar until a card changes the public board. Do not invent a pass when legal cards are available.

Doubling uses a small `Double?` control on the felt immediately above the South badge, without a page overlay. If no cards are eligible to double, hide this control and automatically submit the server's empty declaration on the active human turn, respecting pause, busy, access and error gates. Otherwise select the eligible queens and/or King of Hearts in the actual hand; the control shows small read-only previews of the selected cards. Other cards use the shared opaque, 30%-greyer background with unchanged rank/suit colours during the player's doubling turn. Eligibility comes from the server's candidates for the current request. The chosen subset must match a server candidate. Confirm once with `Double`, or decline with the separate `Pass` action even after selecting cards. Clear the selection after confirmation and phase changes. Announce confirmed doubled cards beside the declaring seat as read-only faces, 20% larger than the earlier announcements, with no lift or tilt; remove each announcement when that card appears in public play.

Show a small crown on the kingdom owner's avatar throughout the kingdom in every Trix variant, with the accessible label and tooltip identifying kingdom ownership. Ownership is independent of the active turn and partner marker. The game header identifies Basic/Complex and Solo/Partners.

Individual current-request points sit in each compact player tag, including Partners. The server projects four `requestSeatTotals` integers from the current-deal seat recipients before removing the ledger from live packets. Competitor-only doubling bonuses remain in combined team totals; do not split or duplicate them into player tags. Historical observations can still read their own ledger. The four corner squares show game totals with no visible heading or scope switch. Clicking a player score or the Scores icon opens a simple Current / Kingdom / Total table. Scores never open automatically after a request. The Score history link becomes available after the first completed request, fetches only a list on opening, and fetches a frozen score breakdown only when a round is selected. Native endpoints read the existing persisted ledger and enforce owner/current-game access. Live transport omits the ledger; decision-time native observations and original saved advice retain it.

## Visual tokens and review

Use DM Sans for card/body text and Manrope for branding/headings. Preserve the shared ink `#273844`, muted text `#586c77`, surface `#edf1f2`, felt `#24465a`, mint `#c7e5df`, gold `#e3bd77` and line `#d9e1e4`. The muted text was darkened after the active-table contrast audit. Decorative card glyphs are hidden from assistive technology; the containing control or image supplies the complete card name. Game-switch accessible names include the visible game and variant. Use short transform/opacity transitions; do not add continuous animation or elaborate effects.

The supported responsive review matrix uses the installed named Playwright landscape profiles, including browser chrome, plus desktop 1280 × 800. Do not treat an arbitrary tiny browser window as the phone design target.

| Landscape profile | CSS viewport |
|---|---|
| iPhone 17 Pro | 756 × 352 |
| iPhone 17 Pro Max | 838 × 390 |
| Galaxy S24 | 780 × 360 |
| Pixel 9 Pro | 900 × 375 |
| iPad (generation 11) | 944 × 656 |
| iPad Pro 11 | 1194 × 834 |

The 854 × 668 browser-review window is an additional preview, not a phone profile. Portrait phones below 700 px wide show the rotation gate. Check dense hands, four trick cards clear of the player badges, fixed history geometry, full Jack lanes, doubling, pass cues and pause/resume. Short landscape stacks use small vertical steps and staggered columns so every rank and the front card suit remain exposed. A fixture screenshot proves layout; real native gameplay proves server-command integration. These checks emulate CSS sizes in Chrome, not physical-device or Safari acceptance. Chrome traces and Lighthouse navigation scores are separate evidence and do not establish universal smoothness or strategy strength.

Current evidence: [Trix shared-table acceptance](../qa/implementation/trix/shared-table-ui.md).
