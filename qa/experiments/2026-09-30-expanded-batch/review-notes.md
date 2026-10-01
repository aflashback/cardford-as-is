# Decisions worth reviewing

These are observed research-player choices and checks of public facts. The production coach was not evaluated by this run. These are not optimal-move labels or an independent expert review. Final completion and scores are in [results.md](results.md).

| Saved position | What the record shows | Candidate coaching point |
|---|---|---|
| Changed-order pair, decision7 | Maya trumps Jason's club ace in Solo, but discards H4 on his ace in Partners. Both are legal. Public bids differ too, so this is not a controlled mode-only comparison. | Consider whether taking the trick adds a team trick or spends a useful spade to replace a teammate's winner. Review the remaining opponent's possible response. |
| Partners changed order, decision31 | Jason says Sarah could overtake SK with a higher spade. SA has already been played. | The current king of spades cannot be beaten. Do not add an impossible risk to the cue. |
| Partners changed order, decision35 | Jason remains uncertain whether Sarah could trump. She has already failed to follow a spade lead. | A proved lack of spades should persist through the hand. |
| Solo long spades at Jason, decisions33/37 | Jason warns of an opponent trumping a future lead after all thirteen spades have been played. | Stop describing trump threats once none remain. |
| Solo long spades at Jason, decision35 | Maya keeps hearts for future leads, although she has only hearts, owns all remaining hearts, cannot win the current trick and no spades remain. | These hearts cannot win another trick this hand: she has no way to get the lead back. |
| Partners long spades at Jason, decision21 | Both opponents have shown no spades. Jason has shown no hearts, and every spade outside Maya's hand must be his. Maya still leads S10, forcing Jason to spend a spade. | Compare leading a heart while Jason can still win it, and keeping a spade to regain the lead later. This alternative has not been played; it is a review candidate, not a proved best move. |

`node qa/experiments/2026-09-30-expanded-batch/check-public-facts.mjs` verifies six public-information claims in the last five rows. It reads no other player's hand. The final row identifies a strategic alternative worth testing; the preceding rows expose specific explanation issues. These selected cases do not establish an error rate.

The next review should compare reasonable alternatives at bidding and at the last chance to keep a card that can regain the lead. Continue alternative plays from the same public position and compare new complete paths. Preserve uncertain ownership as uncertain; a single winning path cannot establish the best bid or a success probability.
