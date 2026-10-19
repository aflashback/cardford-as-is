# CFL-13: compare the public partner-return opportunity

Owner continuation, 10 October 2026: proceed from the protected King scenario dataset to compare North's low diamond return with its saved baseline spade choice, then consider a narrow shared deterministic bot/coach rule only if the evidence supports it.

## Fixed inputs and comparison

Use the accepted CFL-12 archive `king-20261010-v3`, fixture `six-low-hearts-outside-ace-east`, Baseline profile, controlled K♥ double, witness `partner-return-to-publicly-known-void`. Extract only North's actor record at ordinal 14, after two completed tricks, separately for Basic Partners and Complex Partners. Pin the original archive bytes, retained source/binary, exact rules and actor observation. Exclude other observations, author hands, later plays, saved outcomes and witness answers from the native input. The two input cases are `king-return-basic-partners` and `king-return-complex-partners`.

The historical choice is `play:S2`; the proposed lead is `play:D3`. Compare **all eleven legal roots**, retaining both this historical reference and each continuation profile's own current root suggestion. Do not compare only a convenient pair or mistake an imposed root for a bot-selected move.

For each observation, sample sixteen feasible remaining allocations in each of two fixed semantic-observation-seeded streams (`king-return-primary`, `king-return-confirmation`). All roots and profiles share each sampled allocation. Reconstruct the full native public history and match the actor observation before using a world. Sampling respects hard public constraints; it does not infer opponents' intentions or condition on the original private deal. Samples may repeat; report distinct allocations and repeats separately. These consumed positions remain one authored development family.

North does not know South's original six-heart shape; do not preserve that author-only condition in sampled hands. Keep the public opening-owner H7 constraint. Basic and Complex have different semantic observations and separate sampled allocations; do not claim physical world pairing across variants.

Four fixed continuation environments:

| ID | South/North | East/West |
| --- | --- | --- |
| `all-baseline` | Original Baseline | Original Baseline |
| `all-comparison` | Ownership Comparison | Ownership Comparison |
| `ns-comparison` | Ownership Comparison | Original Baseline |
| `ns-baseline` | Original Baseline | Ownership Comparison |

Every subsequent choice uses only that acting seat's observation. No per-world optimal continuation, hidden-hand oracle, policy mixing between roots or forced partner discard. Finish all thirteen tricks and record full NS request points, component ledger, king net points, king capturer and timing, and all four plays of the first compared trick, including South's actual response.

## The two partners know different things

North knows South and West are diamond-void. North's own remaining diamonds, plus public history, place the outside 5♦/6♦ with East. This proves North's 3♦ lead loses to East. South does not see North's remaining diamonds and may not be able to prove that East still holds a diamond. A public low lead can suggest a plan without proving intention.

Therefore North's deduction cannot be copied into South's coach facts. Assess the lead and the partner response separately. Basic has only the king component; Complex also trades off other penalties. A conditional Basic bound under a particular partner policy is not a general Complex rule.

## Fixed budget and interpretation

This campaign has two cases × 32 sampled worlds × four environments × eleven roots = 2,816 complete continuations, with at most 123,904 accepted continuation plays (44 per root). Each case has a 16,000,000 sampler-operation cap and 200,000 native-step cap. Build and study invocations each have a 300-second watchdog; native output is bounded to 128 MiB. No expansion, new distributions or policy adjustment after inspecting results. Incomplete worlds are not counted as paired outcomes; incomplete studies retain evidence without rankings.

Report each stream and environment separately: paired full-team point changes, worse/equal/better counts, observed minimum/maximum changes, king outcomes and South's first-trick release frequency. Also compare the proposed lead to each profile's own selected root. These are diagnostics under fixed continuations, not calibrated win probabilities, independent trials or a strength gate.

Only consider an action-changing candidate if the two streams agree on the direction of improvement, the full Complex objective supports it, and the actual profile choice/partner response does not reverse that conclusion. If effects reverse by environment or the partner fails to release the king, preserve the adverse evidence and identify the missing observable condition or coordination behavior first. Even favorable evidence requires fresh counterexamples and validation before live promotion. Do not introduce a rule merely to complete this milestone.

## Deliverables and checks

- Reusable, strict, actor-only native comparison and bounded private operator; original CFL-12 dataset and runtime policies remain intact.
- Immutable input/source/binary/result receipts, a readable comparison report and scoped recommendations.
- Tests for archive/actor binding, unknown hidden-field rejection, native history reconstruction, same-world pairing, full-score arithmetic, partner-response recording, incomplete work, and source drift.
- Focused checks, the fixed campaign, then the integrated lab gate. Record actual outcomes, including failures and rejected rule hypotheses.
