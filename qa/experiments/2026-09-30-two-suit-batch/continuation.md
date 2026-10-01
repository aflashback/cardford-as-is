# Original batch complete

The original six authored hands are complete: three deals in Solo and the same three in Partners. Each has 56 accepted decisions and a passing replay audit. The owner subsequently resumed the eight proposed cases in the [expanded batch](../2026-09-30-expanded-batch/README.md); its results and continuation point are authoritative for that follow-up.

`solo-void` decisions 39–56 used reconstructed seat-only player contexts because the original contexts were unavailable. Manual packet corrections are listed in `transport-incidents.json`. These records are useful for discovering questions but are not pristine controlled model trials.

The separate [eight-hand proposal](next-batch-proposal.md) remains the historical fixture definition. Its original planned status is superseded by the expanded batch's actual records. Keep Solo and Partners results separate.

To verify this completed original batch from repository root:

```text
node qa/experiments/2026-09-30-two-suit-batch/verify-records.mjs
node qa/experiments/2026-09-30-two-suit-batch/check-public-proof.mjs
node qa/experiments/2026-09-30-two-suit-batch/materialize-next-batch.mjs validate
```

No Jev or OpenRouter call occurred in this collection. No runtime policy was changed.
