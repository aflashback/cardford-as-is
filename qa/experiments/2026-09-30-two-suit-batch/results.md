# Batch status and results

**6 of 6 planned hands complete; 336 accepted decisions saved.** Values below come from the record integrity check. These are individual hands, not completed matches. Seat order is Maya/Leo/Jason/Sarah; Partners scores repeat each team's total across its seats.

| Episode | Status | Decisions | Bids | Tricks so far/final | Final scores |
|---|---|---|---|---|---|
| solo-spread | passed | 56/56 | 9/1/1/3 | 11/1/0/1 | 92/10/-10/-30 |
| solo-void | passed | 56/56 | 10/4/2/1 | 5/4/3/1 | -100/40/21/10 |
| solo-concentrated | passed | 56/56 | 5/3/2/1 | 5/3/2/3 | 50/30/20/12 |
| partners-spread | passed | 56/56 | 8/0/1/4 | 11/0/0/2 | 92/60/92/60 |
| partners-void | passed | 56/56 | 9/5/1/1 | 5/5/2/1 | -100/60/-100/60 |
| partners-concentrated | passed | 56/56 | 5/3/2/1 | 5/3/3/2 | 71/41/71/41 |

## Findings

- The spread deal gives Maya11 tricks in both modes. Solo bid9 scores92; Partners team bid9 also scores92. This does not identify an optimal bid.
- Partners spread protects Leo's Nil but misses the team's positive contract: +100−40=60. Review the whole scored result.
- Partners void ends with Maya5 tricks and Jason2: their bid10 scores−100; opponents make6 for60. Maya's same13 cards produced11 tricks in spread and5 here. This supports studying entries and opposing trump length, while changed bids and play prevent a pure causal comparison.
- Public information proves the Solo spread endgame sweep; Jason nevertheless describes impossible queen-winning routes before correcting his explanation. The executable public-packet proof passes.
- In the void deal Maya identifies Leo's remaining trump correctly, then draws out her own trump entries. The collected continuation exposes the difference between removing opposing trump and preserving control. See the reviews for actual completed outcomes.
- Solo void ends with Maya5 tricks against a bid of10 (−100); Solo concentrated ends with exactly5 against a bid of5 (+50). Partners concentrated makes both team bids: Maya/Jason8 tricks against7 (+71), Leo/Sarah5 against4 (+41). These are observed paths, not optimality results.
- Identical opening packets produced different Maya bids across fresh runs: Solo9/10/5, Partners8/9/5. This batch cannot isolate deal effects from response variability or estimate probabilities.
- The concentrated pair contains publicly checkable reasoning errors: a player treated a queen as able to beat a king, and another repeatedly described an opponent as able to play a spade after that opponent had shown a spade void. These are candidates for fact-checking, not validated coaching rules.

## Checks and limits

Production replay, packet/response hashes and hidden-hand projection checks are saved in each audit. All six hands have56 decisions,52 unique cards and13 tricks. check-public-proof.mjs passes a specific public-information deduction and rejects that deduction at the earlier position.

No runtime bot/coach changes, Jev calls or OpenRouter usage. Provider: offline frontier subagents; exact model snapshot unavailable. No observed player tool actions; instruction-only restrictions and manual routing do not prove a hard sandbox. Corrected transport incidents are retained in transport-incidents.json.

This original batch ends at six completed hands. The owner subsequently resumed the eight proposed cases in the [expanded batch](../2026-09-30-expanded-batch/results.md). Manual-routing corrections and reconstructed player context in this original batch are disclosed in transport-incidents.json and continuation.md; no scripted fallback filled missing moves.

## Evidence

- [Decision review](review-notes.md), [Partners review](partners-review.md), [candidate cases](scenario-candidates.json).
- [Deals and intended coverage](design.md), [frozen protocol](README.md), [raw records and integrity](records/integrity.json), [unplayed next-batch proposal](next-batch-proposal.md).
- Repeat: node qa/experiments/2026-09-30-two-suit-batch/referee.mjs audit EPISODE_ID; then node qa/experiments/2026-09-30-two-suit-batch/verify-records.mjs; then node qa/experiments/2026-09-30-two-suit-batch/check-public-proof.mjs; then node qa/experiments/2026-09-30-two-suit-batch/write-summary.mjs.

Follow-up: use the expanded batch's current records and continuation point, then review consequential choices before runtime promotion. These discovery records alone do not justify runtime promotion.
