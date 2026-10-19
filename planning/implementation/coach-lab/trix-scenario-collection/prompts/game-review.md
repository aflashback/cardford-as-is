# trix-luna-game-review-1.0.0

Review one completed Trix penalty request. The four players' decision-time reviews have already been frozen. This is a separate retrospective assessment. Do not rewrite their earlier knowledge with later information or infer effort/optimality from final scores.

{{episodeIdentityAndPins}}

{{completePublicPlayHistory}}

{{nativeFinalScoresAndComponents}}

{{frozenDecisionReviewSummary}}

{{auditAndReplayReceipt}}

Return JSON containing `complete` (only if the native receipt says 13 tricks), `quality` (`supported`, `mixed`, `insufficient-evidence`), `summary`, `seatSummaries`, `supportedMissedOpportunityRefs`, `usefulPatternRefs`, `counterexampleRefs`, and `limitations`.

The collector supplies `episodeId`, `reviewVersion`, `provenance`, `nativeTotals`, `explanationIssueCounts` and each seat's `reviewedDecisions` from this assigned job, native outcome and accepted saved reviews. Omit those metadata fields from your JSON. `seatSummaries` contains exactly four objects with `actor` (native 0=S, 1=W, 2=N, 3=E), `summary`, `uncertainty` (string array), and `correctionDecisionIds` (only frozen decisions with independently verified corrections). `supportedMissedOpportunityRefs`, `usefulPatternRefs`, and `counterexampleRefs` are arrays of actual frozen decision IDs. A useful pattern or counterexample reference describes retrospective context and does not itself prove an earlier action inferior. Use empty arrays when no supported references exist. `limitations` is a string array. Do not add fields outside the supplied model-response schema.

Collector-owned metadata:

- `auditAndReplayReceipt.exactSavedCounts` contains totals computed from accepted saved review statuses and committed native actors. Use it as context for your summaries. The collector attaches these exact totals after receiving your analysis; you do not need to count, copy, or output them.
- Native scores, record identifiers, schema version and provenance are also attached by code. Any echoed metadata is replaced by authoritative saved values, with the changes logged separately. Your summaries, evidence references, seat assignments, statuses and correction claims are not repaired or reassigned by this adapter.
- A native move being forced remains separate from the saved explanation's `rationaleStatus`. Discuss explanation errors without inventing a better action or changing a saved status.

Correction-reference eligibility and ownership:

- A correction is an independently verified better action already recorded in an accepted frozen decision review. A decision is eligible only when that frozen review has a non-null `missedOpportunity`. Use that accepted correction exactly; do not invent a correction from the public history, final score, or your own retrospective judgment.
- For each `seatSummaries` object, look up every proposed `correctionDecisionIds` entry in the supplied `episodeIdentityAndPins.decisionActors` mapping. Its native `actor` must equal that seat object's `actor`. Cross-check the decision ID's final actor component against that mapping. Never move a reference to a different seat because a summary discusses another player. Native seat identity is always 0=S, 1=W, 2=N, 3=E.
- An `explanationIssues` entry, a check marked `issue`, or a rationale status such as `incorrect-fact`, `unsupported-claim`, `incomplete-explanation`, or `uncertain` is not proof of a better action. Describe those explanation problems in the seat's `summary` and, where useful, reference the actual frozen decision in `counterexampleRefs`; do not put them in `correctionDecisionIds` unless the accepted frozen `missedOpportunity` is non-null.
- `supportedMissedOpportunityRefs` must use only the same eligible frozen decisions with non-null `missedOpportunity`. A forced move or an adequate explanation with no accepted missed opportunity cannot become an action correction.
- If all frozen `missedOpportunity` values are null, every seat's `correctionDecisionIds` and the top-level `supportedMissedOpportunityRefs` must be empty arrays, even when the game has factual explanation errors or mixed quality. Do not add references just to fill an array.
- Before returning JSON, check that every correction reference exists in the frozen reviews, meets the eligibility rule, belongs to the correct native actor, and appears at most once in its array. Check all other reference arrays against actual frozen decision IDs too. Use empty arrays when support is missing; keep the uncertainty in prose.

For every seat, summarize review coverage, stated-rationale quality, uncertainty and any independently supported correction. Quote native totals exactly. Partners results must include team bonuses once and report both team and component totals. Complex results must retain king, queen, diamond and trick costs separately so one successful escape cannot conceal a poor overall score.

Answer whether the available records support a useful, well-reasoned game, or show mixed/insufficient evidence. Do not say all players “did their best” as a proved fact. Record losses, sound choices with bad outcomes, ambiguous choices and failed rationales as well as successes. Game quality does not itself qualify every move for the curated dataset.
