# Collection pause

The original six authored hands are complete: three deals in Solo and the same three in Partners. Each has 56 accepted decisions and a passing replay audit. Collection is paused at the owner's request. Do not start another hand until the owner asks to resume.

`solo-void` decisions 39–56 used reconstructed seat-only player contexts because the original contexts were unavailable. Manual packet corrections are listed in `transport-incidents.json`. These records are useful for discovering questions but are not pristine controlled model trials.

The separate [eight-hand proposal](next-batch-proposal.md) is validated as 52-card setups and remains **unplayed**. It is one possible continuation, not an automatic next step. The other option is to review the consequential decisions in the six completed hands and select counterfactual branches or unseen evaluation deals. Keep Solo and Partners results separate.

To verify the paused state from repository root:

```text
node qa/experiments/2026-09-30-two-suit-batch/verify-records.mjs
node qa/experiments/2026-09-30-two-suit-batch/check-public-proof.mjs
node qa/experiments/2026-09-30-two-suit-batch/materialize-next-batch.mjs validate
```

No Jev or OpenRouter call occurred in this collection. No runtime policy was changed.
