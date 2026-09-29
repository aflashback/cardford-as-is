# CR-UX-005 — CardFord game entry and quieter table

**Recorded:** 28 September 2026. **Approval:** the owner's explicit UI instructions in this chat.

The supplied CardFord SVG mark is used at the table's top-left brand link and browser favicon, paired with live CardFord text on loading and portrait rotate screens. A large quiet monochrome version appears behind the portrait instructions. The supplied wordmark SVG currently spells `Cardford`, so the app composes the mark with text to keep the approved `CardFord` spelling until the capitalization decision is resolved. No generated art or avatar system is added. Source files remain in `planning/brand/cardford/svg`; runtime copies are in `web/public/brand`.

Starting another game uses a full-page two-step setup flow. First choose game speed, then choose a game. The game card itself saves any changed pace and sends the existing new-game command; there is no separate Start game button. Cancelling setup changes neither pace nor game. Coaching mode stays in Settings. The flow uses the current three modes and has room for more typed game modules later. The text says “You and three well trained players.” The game and pace selection are accessible by keyboard and the flow can be closed without starting a game.

During play, omit the top hand/trick counter, top cumulative scoreboard, “Low score wins” and table-notes entry. The seat bid/trick counters, current trick and last-trick cue remain. Cumulative score remains available in the hand recap; game review remains accessible. Removing the notes entry does not change server observations or the existing notes API. It also removes the client path that could unlock a hand merely to open notes; coaching help remains an explicit action.

| ID | Acceptance |
|---|---|
| UX-18 | Supplied CardFord SVGs appear at loading, top-left brand and portrait rotate gate; the background mark is decorative and subdued. Responsive table and rotate layouts remain usable. |
| UX-19 | New game setup occupies the page, with pace then mode. Card activation saves pace and starts the chosen mode once through the existing versioned commands. Coach settings contain no speed choice. Cancel preserves the current game and pace. |
| UX-20 | No visible table-notes action, top hand/trick line, top cumulative scores or “Low score wins” text. Seat counters and recap/review remain. |

Alternatives rejected: keeping a modal game picker, adding a second Start button, putting game pace in coach settings, or replacing recap scores. The change is presentation and command sequencing only. No rules, score arithmetic, game-state schema, event schema or provider behavior change. Existing stored games need no migration. Acceptance evidence is [the UI report](../../qa/implementation/cardford-minimal-ui-acceptance.md).
