# CFL-14: South's King discard after a partner return

Owner authorization: “ok lets do that step”, 10 October 2026, continuing [CFL-13](trix-king-return.md). This protocol is declared before opening the new campaign's results. It isolates the partner response that the North lead comparison could not establish. It is a bounded development experiment, with no runtime policy or UI change.

## Question and actor boundary

At the original controlled-double witness, North has led 3♦ and West has discarded 6♠. South holds A♣/3♣/4♣/5♣/6♣ and K♥/2♥/3♥/4♥/5♥/6♥. Should South discard the doubled K♥ now, or retain it and discard another card? Compare **all eleven legal choices**, using combined NS request points. Basic and Complex remain separate.

Bind South's saved observation at actor-record ordinal 16 in the CFL-12 `six-low-hearts-outside-ace-east` / `partner-return-to-publicly-known-void` controlled-HK-double Baseline witness. The ten public plays are `DA,D8,S4,D2,D4,DK,S5,C2,D3,S6`. South is seat/turn 0, with two complete tricks and two plays in trick three; remaining counts are `[11,10,10,11]`.

The native input contains only South's observation and the exact current Partners rule pin. Source fixture hands, other-seat observations, future witness cards and results never enter the sampler or the selectors. Reconstruct fresh plausible worlds from **South's** information. Do not reuse the North-conditioned CFL-13 allocations. Retain the frozen CFL-12 archive and verify its exact hash and build before extracting this record.

## Fixed comparison

- Version `trix-king-discard-1.0.0`; two cases, Basic Partners and Complex Partners, one consumed original scenario family.
- Reference root A♣ (`play:CA`), alternative K♥ (`play:HK`). Also report each unchanged policy's actual selected root and every other legal card. The reference is a declared comparison, not an acceptable-action label.
- Sixteen feasible allocations in each of two reproducible streams, `king-discard-primary` and `king-discard-confirmation`. Seed from the semantic actor observation, exact pin, study version and stream/ordinal. Sample with replacement; report repeats. “Confirmation” names a second sampling stream, not fresh-family strength validation.
- Four continuation environments: all Baseline; all Ownership Comparison; NS Comparison versus EW Baseline; NS Baseline versus EW Comparison. Baseline is `trix-deterministic-1.0.0`; Comparison is `trix-ownership-comparison-1.0.0`. Keep these versions and their action choices unchanged.
- Every root and profile shares each sampled allocation. After the imposed South root, each future action uses only that seat's observation and its declared policy. Continue to thirteen complete tricks.
- Retain full NS/EW score ledgers and component totals, king net points, king capturer and release timing, and the complete first compared trick. The South root is its third play. Immediate release is overall play 11 / continuation play 1; ten public plays precede the comparison.

This is two cases × 32 worlds × four profiles × eleven roots = **2,816 complete continuations**, **118,272 accepted continuation plays** (42 per root). Each case is capped at 16,000,000 sampler operations and 200,000 native steps. Build and study each have a 300-second process-tree watchdog; study output is capped at 128 MiB. Only fully paired worlds count. Incomplete work produces no rankings. No post-result budget, case or policy expansion belongs to this campaign.

## Required counterexample and interpretation

Replay two native deals with the same public prefix. In the second, exchange East's 5♦/6♦ with North's 8♥/9♥. South's entire observation must remain equal and deterministic selectors must make the same choice. In the original, East must follow diamonds above North's 3♦; in the twin, East is diamond-void and North captures a king discarded now. These are mechanical counterexample tests, not extra sampled cases or independent families. Preserve a legal continuation showing whether retaining the king can escape it later; distinguish immediate capture proof from policy-dependent final score.

The twin establishes uncertainty, not equal probability of the two deals. Constraint-only allocation sampling does not calibrate real-player intentions or the probability that North intended an escape. Any separate exact allocation count must state its uniform-allocation assumptions and cannot convert intent into a fact.

An independent pre-campaign calculation gives a useful check. Seven unseen diamonds can be held only by North or East. The opening-owner rule publicly fixes H7 with East, leaving ten free slots each for North and East and ten for West. There are 23 other unrestricted unseen cards. Thus there are `C(23,10) × C(20,10) = 211,373,057,896` compatible remaining allocations, of which `C(23,10) × C(13,3) = 327,202,876` leave East diamond-void. Under this specific uniform allocation measure, the fraction is **1/646**. Immediate HK has exact mean king-component points `75 − 225/646`, approximately 74.6517, under that measure. This is not a real-player calibrated probability, and it says nothing by itself about whether retaining HK scores better. A 32-world sample may miss the rare adverse class entirely.

Report the two streams and all four environments separately: paired full-team changes, worse/equal/better counts, observed min/max, king outcomes and immediate releases. Do not pool variants, count reused worlds as independent trials, or infer accuracy from a successful authored deal. Compare roots within one fixed environment before attributing a difference to South's immediate choice.

Consider a coordinated action-changing candidate only if the full-team improvement is consistent in both streams and the declared environments, and its observable trigger, uncertainty handling and counterexamples are explicit. A favorable development average still requires a separately frozen candidate and fresh distributions/opponents before strength validation. If evidence ties, reverses or lacks a justified guard, preserve the findings and specify the missing experiment; do not introduce a rule just to complete this step.

Bots and coach must eventually share any justified decision and its deterministic evidence. A later coach explanation must distinguish known cards/voids from an assumption about the partner. No model chooses a card or supplies a missing game fact.

## Owner clarification: using hints from choices

The owner explicitly asked during implementation whether inferred hints from other players and the partner were being used. The current code records conditional signals for a king double, voluntary heart leads and voluntary/repeated Jacks choices, but they do not weight actions or plausible-hand sampling. The low diamond return in this position has no implemented partner-intent likelihood. CFL-14 is therefore the **facts-only allocation reference**, with policy-dependent future play. It cannot establish the full quality of an inference-aware coach.

The next inference experiment must compare this reference with a separate versioned deterministic interpretation of choices:

1. Reconstruct each earlier decision from the information that player could have held **at that time** in each hypothetical allocation. Save the chosen card, native legal alternatives, score objective and possible partner benefit. Never borrow the actual private hand or a future public event.
2. Separate forced behavior, publicly proved voluntary choice and a choice that is voluntary only under a hypothetical allocation. A forced card supplies no additional preference evidence beyond its hard legal constraints.
3. Model alternative explanations for a low return: help the doubled king escape, reduce the leader's own risk, pursue another Complex objective, or choose imperfectly. Specify inspectable likelihood assumptions before results; give every hard-feasible legal action positive support. Do not treat an existing bot as an infallible expert or repeated readings of one play as independent evidence.
4. Reweight the same feasible allocations and rerun/report the same legal-root comparisons, with sensitivity to the stated assumptions and effective sample size. Sparse samples cannot represent the rare twin class reliably; stratify or enumerate the relevant class with correct allocation weights and preserve both classes.
5. Compare inferred claims with later revelations only in a separate retrospective calibration record. Test the resulting action and shared reason on fresh scenario variations and unfamiliar deterministic opponents before promoting a bot/coach rule.

This inference layer remains the next implementation stage; no likelihood constants or behavioral weights are silently introduced into the frozen CFL-14 reference.

## Deliverables and validation

1. Native actor-only discard comparison, partial-trick replay and identical-observation counterexample checks.
2. Bounded private operator with frozen input/source/binary receipts, independent ledger/chronology checks and readable all-root summaries.
3. The fixed two-case campaign and a report separating observed results, interpretation and unfinished work.
4. Focused native and Node checks followed by the integrated lab gate. Preserve failed runs and source drift; use a fresh output directory for any corrected run.

Results and executable instructions: [CFL-14 acceptance record](../../../qa/evaluation/coach-lab/trix-king-discard.md).
