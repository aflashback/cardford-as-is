# CFL-12: protected King of Hearts scenario family

Owner direction, 10 October 2026: build a dataset of predefined card distributions representing tactical patterns. Begin with K♥ held alongside five other hearts in Basic/Complex Solo, then exercise partnership play. Cover positive situations and counterexamples; do not enumerate every possible deal or play sequence.

## Purpose and boundaries

The lab authors know the complete fixture distribution so they can construct and verify an escape or trap. Each playing bot and coach still receives only its own observation. A legal authored line proves that the line is possible on that distribution. It does not prove that a player could infer the hidden cards, that opponents will cooperate, or that the initial hand guarantees victory.

Classify the situation using decision-time facts: K♥ ownership, lower-heart cover, own A♥, side-suit counts/voids/singletons, opening responsibility, public declarations and observed suit failures. Keep the author's pattern tags and expected outcome outside policy inputs. A declaration proves who holds the declared king; taking a trick or leading a suit does not establish a unique intention. Store conditional signals separately from proved public facts.

This iteration builds the first reusable scenario dataset and executes existing deterministic policies. It does not invent a six-hearts doubling threshold or promote a new bot policy. A subsequent narrow rule needs actor-visible conditions, counterexamples and fresh validation. No runtime model or UI work.

## Fixed corpus and execution

- Six to eight complete authored 52-card distributions, thirteen unique cards per seat. South owns K♥ with five other hearts. Include five lower hearts with an outside ace, an own-ace counterexample, side-suit escape, exhausted cover/forced-heart tail, partner/own-team capture, and at least one pair with the same South hand but changed concealed allocation. The immutable corpus fixes the final exact count before execution.
- Each fixture has one to three short legal witness prefixes ending after the K♥ trick. Expected capturer is authored independently; doubling bonus arithmetic is checked literally. Witnesses use only a K♥ declaration; other doubles are declined. Finish all thirteen tricks using a declared deterministic continuation. Label the prefix as authored, not bot-selected or an optimal policy.
- Run the corpus in this order: Basic Solo, Complex Solo, Basic Partners, Complex Partners. Use the installed current native pin for each, retaining exact rule/schema IDs. Basic target request is `king`; Complex target is `complex`. The request is fixed to study this family; record the natural request suggestion separately.
- Two unchanged profiles: every seat uses the frozen original baseline, or every seat uses Ownership Comparison. These are two declared environments, not independent origin samples or broad opponent coverage.
- Three policy arms: natural declarations; controlled K♥ double with all other declarations declined; controlled no doubles. Play after declarations is always observation-only policy selection. Record policy suggestions separately from imposed actions so an intervention never masquerades as coach advice.
- At most 8 fixtures × 4 variants × (6 policy runs + 3 witnesses) = 288 request runs. Each has at most 57 actions (request + four declarations + 52 plays). Global native work cap 20,000 accepted actions; no adaptive expansion after seeing results. Operator build cap 300 seconds, study cap 300 seconds, native output cap 256 MiB.

## Outcomes and feedback

Basic Solo primary measure: South's complete request points. Partners primary measure: combined South/North request points, including direct team bonuses once. Complex measures the complete objective and separately shows king, queen, diamond, trick and double-bonus components. A successful K♥ escape may still have a poor Complex result. Preserve the K♥ capturer, capturing leader, bonus recipient, prior-leader provenance and withheld bonus.

Pair doubled/undoubled runs within the same fixture, variant and continuation profile. The declaration can change later play, so its total score difference is a conditional intervention result, not just the arithmetic cost of the king. Natural declarations remain a separate behavior measurement. Never label a bot mistake solely because an authored full-hand witness scores better.

Keep three layers separate:

1. **Authored scenario:** private distribution, pattern family and witness, with provenance and construction limits.
2. **Player evidence:** the actor's cards/public history, legal choices, features, saved deterministic suggestion, executed action and whether execution was imposed. A future judge receives only the intended actor packet.
3. **Retrospective outcome:** public plays, native component ledger and complete request score. These evaluate the earlier choice but do not become facts in its explanation.

The gap register should identify missing behavior or explanatory support as hypotheses with fixture/decision references. A count of favorable scripted paths is not coach accuracy, prevalence, a win probability or playing-strength evidence. Preserve harmful and ambiguous cases alongside successful cases. Distribution relatives and Basic/Complex reuse remain grouped under their physical fixture family.

## Verification and continuation

Check complete unique decks, legal witness replay, all-thirteen-trick completion, literal K♥ score/bonus routing in all four variants, hidden-allocation invariance of identical actor observations, actor-only feature extraction, intervention/advice separation, paired-arm completeness, component arithmetic and bounded incomplete-run handling. Freeze source/corpus/native binary and retain receipts. Run the relevant integrated lab gate after implementation.

Use the report to select one missing observable pattern before changing shared bot/coach decisions. Reuse this corpus as development/regression evidence, then validate any action-changing candidate on newly authored variations and fresh sessions. The first family deliberately excludes Trix Jacks and other penalty families until this workflow is useful and verified.
