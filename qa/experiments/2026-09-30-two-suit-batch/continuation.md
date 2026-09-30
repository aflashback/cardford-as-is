# Resume collection

Stopped for the earlier one-hour budget, not an engine error. Read `results.md` and `records/integrity.json` for the actual snapshot. Do not restart completed games or infer missing actions.

## Solo void

38 accepted decisions; next is Sarah, seat3, decision39. No response is pending and decision39 has not been requested. Existing contexts: `/root/s02_maya`, `/root/s02_leo`, `/root/s02_jason`, `/root/s02_sarah`. Continue the existing context if available. Generate the exact current packet with:

```text
node qa/experiments/2026-09-30-two-suit-batch/referee.mjs text solo-void
```

Send it to `/root/s02_sarah` preceded by “Choose one action under the same protocol.” Accept only the exact final response through the referee. Continue until56 decisions, then audit. Never give any player this file, the complete deal, review notes, another player's reasons or an outcome prediction.

If contexts are unavailable, label the resumed segment as reconstructed context: start from `templates/invocation.txt` with the current packet, then provide only that seat's own prior responses if needed. Do not claim exact continuation of the original model context.

## Concentrated pair

`solo-concentrated` and `partners-concentrated` are frozen, validated and not run. Use fresh opaque player task names `s03_maya/leo/jason/sarah` and `p03_maya/leo/jason/sarah`, fork history none. Use the frozen invocation template, own cards and full public packet only. Preserve the original Maya opening observation; do not reveal the distribution name or intended lesson.

## After collection

Audit each episode; run `verify-records.mjs`, `check-public-proof.mjs`, then `write-summary.mjs`. Update reviews and this continuation file to match actual evidence. Keep all cases in development. Add repeated runs and varied score/seat/opponent contexts before probabilities or strategic promotion. Do not silently turn missing agent moves into deterministic bot moves.
