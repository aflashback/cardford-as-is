# Next authored Spades sample — proposal only

**Status superseded by [expanded collection results](../2026-09-30-expanded-batch/results.md).** The owner resumed these eight cases. This document and its JSON remain the original fixture definitions; the JSON's `planned-unplayed` label is historical. Actual completed, partial and unstarted counts come from the expanded records. The original six hands remain frozen. No optimal-bid, probability or strength claim follows from an authored setup alone.

## What each pair asks

| Pair | Exact change from the named existing deal | Question worth observing | Limit |
|---|---|---|---|
| Partner leads | `void` hands unchanged; dealer 3 → 1, so Jason bids and leads first and Maya bids third | Does seeing two public bids before bidding and acting after Jason change Maya's plan? In Solo, Jason is still an opponent. | Order and newly visible bids interact; this is not a pure seat-order effect. |
| Long trumps at Jason | `void` hands unchanged except complete Leo/Jason hand swap; dealer remains 3 | How does the same opening Maya hand play when the long trump holding belongs to her teammate in Partners? | Other suit holdings move with the swapped hands. In Solo, every other seat remains an opponent. |
| Late score and bags | `spread` deal and dealer unchanged; scores/bags set to the exact values in the JSON | Do a near-500 score and nine existing Maya/team bags change bids, contract protection, and surplus-trick choices? | Score and bag pressure change together. Synthetic stress state, not a proved reachable match prefix. Split them in a follow-up if a decision changes. |
| Honor gap | `spread` deal and dealer unchanged; swap Maya's S10 with Jason's S9, and Maya's SQ with Sarah's S7 | Does a plan that worked with the top five spades still make sense when Maya has five spades with gaps? | Maya sees her different cards; hidden owners must not enter her packet. |

The eight IDs, exact scores/bags, and lossless transformations are in [next-batch-proposal.json](next-batch-proposal.json). `node qa/experiments/2026-09-30-two-suit-batch/materialize-next-batch.mjs validate` checks complete decks and starting context; `materialize` prints the full 52-card deals. This generator does not add the cases to the existing referee or claim any play has occurred. The whole family, its Solo/Partners twin, and all continuations belong to one development group; none is a fresh holdout test.

## High-information opponent-choice fork

The existing `void` deal offers a particularly clean fork: after Maya leads H4, heart-void Leo may legally play a small spade to take the trick **or** discard a side-suit card and save his spades. Keep the same public bids and legal prefix, then compare fresh continuations from those two legal states. First replay both prefixes through the production reducer, and confirm the chosen cards are still in Leo's hand at the fork. Label this a **scripted counterfactual**, separate from the original text-player games in which each agent freely chooses its own move. One forced fork shows the consequence of that choice under continuation policies; it does not establish a general opponent style or an optimal response.

For controlled style robustness later, reuse the *same* materialized deal, dealer, mode, scores, and bags while only the opposing policy changes. Candidate policy families are contract protection, contract disruption, Nil cover/attack, and bag avoidance, but freeze actual implementations and verify they choose differently at relevant positions before using style labels. The acting bot/coach receives only its own cards and public history. The opponent's policy ID and all hidden hands stay in evaluator metadata. Report each style separately and keep Solo and Partners results separate. The free text-player protocol provides no controlled style assignment; observed humanlike variation may be described after play, not treated as an experimental treatment.

## Collection and interpretation

1. Use the expanded collection's saved continuation point. Keep the original six-hand batch and these fixture definitions frozen.
2. Materialize the next proposals and run engine/deck validation. Use fresh opaque player task names. Give each player only the frozen rules, its own hand, public state, and legal choices. Never include fixture ID, intended lesson, transforms, another hand, or another player's reason.
3. Save every accepted decision, public packet, explanation, trick, and score. Replay/audit the full hand. Count invalid or missing responses separately; do not silently substitute bot moves.
4. Review a few consequential bid/play moments before seeing the bot or coach answer. Record several reasonable alternatives, publicly provable facts, questionable explanations, and whether a short cue would help. A realized win does not prove the move was best.
5. Repeat any informative opening observation with fresh contexts to distinguish response variability from information gained during play. For alternate bids or cards, continue both branches afresh; never assign a different bid to the old unchanged play sequence and call its resulting score evidence.

These are targeted discovery cases. They cannot estimate general strength or success probabilities. Any later promotion needs new, unseen deal families; fair policy matchups; independent review; and the separate Solo/Partners gates already specified in `docs/superpowers/plans/2026-09-29-scenario-and-jev-evaluation.md`.
