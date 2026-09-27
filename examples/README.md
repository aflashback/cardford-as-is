# Example provenance and scope

All examples are original **synthetic planning fixtures**. No Jev request was sent. Responses, confidence, tokens and latency are invented values solely to illustrate contracts; they are not performance evidence or an endorsement of the selected card.

`observation-playing.json` is a plausible current first-trick information set (two cards publicly played), not a persisted full deal. The human South has two legal hearts. Bidding is a separate initial-position example with the same illustrative hand assigned to North. Observations intentionally do not contain hidden hands or seeds.

Scoring and rule-unit fixtures specify small pure-function cases. They are not playable complete drills and do not replace the complete scenarios the implementation must create. The test-only solo manifest is an extension-contract illustration; it is excluded from the production catalog. Its referenced test state schemas and the production private-state schema are explicit implementation deliverables, not supplied finished schema files.

Schemas enforce shape. Additional semantic checks are required: competition partition and supported mode; action ID/payload agreement; current actor and phase; exact candidate membership; hand/card conservation; legal history; facts; model pin; probability sum/argmax; and source/provenance consistency. See `qa/spec-validation.md` for checks actually run on this pack.
