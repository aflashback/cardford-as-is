# CR-UX-004 — Less text during practice

**Recorded:** 27 September 2026. **Approval:** the owner's explicit request in this chat to favor visual cues for experienced players, show the last trick on the left without a pop-up or player names, shorten pop-ups, and use “Play again.”

## Decision and reason

Players already know the rules and want practice. Repeating the turn, contract progress and restricted-suit state as sentences competes with the cards and scores.

Use the active-seat ring/dot and concise numeric trick/bid counters. Preserve turn announcements and descriptive card/counter labels for assistive technology. Remove the visible turn/lead instructions, default hand objective and broken/unbroken suit caption. Cards unavailable on the human turn are grey with a small lock; availability comes exclusively from the current server legal-action list. The presentation applies equally to Hearts and Spades and requires no suit-specific legality in the UI.

Show the latest completed public trick at the lower left of the table. Four small cards retain their seat positions; an outline/check marks the winner. Player names are accessible labels only. Reading this view never opens notes, unlocks a coached hand or calls the provider. Hide it before the first completed trick and clear it when the hand history resets.

Use short settings labels and game-picker copy. Keep public card counts and known voids visible in notes; expand rules, played cards and Hearts private pass memory on request. Collapse explanatory recap/review details. Preserve Original/Possible continuation distinctions, suggestion provenance, usage confirmation and recovery messages.

“Play again” at hand end sends the existing next-hand command and preserves match scores. At match end it starts a new game of the same mode through the existing new-game command. Choosing another mode remains available from the game picker.

## Requirements

| ID | Acceptance |
|---|---|
| UX-13 | Turn and bid/trick progress use visual cues and numbers; redundant sentences are absent from the visible table. Unavailable cards are marked and disabled using the server legal set; legal restricted-suit exceptions remain playable. Keyboard/screen-reader context remains available. |
| UX-14 | Last trick is visible at the table's left without visible player names or a dialog; positions and winner remain identifiable. No notes/unlock request occurs. It fits desktop, tablet portrait and supported landscape phones, and clears for the next hand. |
| UX-15 | Settings, game picker, notes, recap and review use short copy with optional details. Expandable dialog content is reachable by keyboard; focus stays in the dialog and returns on close. Provenance, usage and recovery information remain available. |
| UX-16 | Play again continues the current match after a hand or restarts the same mode after match completion, with one explicit existing server command. |

## Alternatives and compatibility

Rejected: retaining duplicate status sentences; adding another status badge for every rule; requiring a pop-up for last-trick recall; implementing client-side Spades restrictions. These add reading or duplicate rule authority.

This supersedes the corresponding visible-copy and last-trick placement entries in planning/01. The original specification pack remains historical. No rule, scoring, observation, provider, event schema, API schema or authored coaching-template semantics change. Existing stored games and advice need no migration; historical advice is not rewritten. The earlier completed-match button opened the picker; the new button repeats the same game as requested.

## Affected checks and evidence

`web/e2e/table.spec.ts` covers legal availability, off-turn preparation, last-trick visibility/geometry, both Play again outcomes, and expandable dialog keyboard navigation. The existing local-service journeys check all three game modes, coaching, accepted play, pause and review against PostgreSQL. Build/typecheck and browser dependency checks preserve the server-only boundary.

Actual outcomes and limitations are recorded in [the verification report](../../qa/implementation/ui-cues-acceptance.md). These requirements do not close external hosted, provider, physical-device or screen-reader gates.
