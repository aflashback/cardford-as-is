# Browser baseline

12/12 measured hands verified complete; 14 created sessions. Seat order: South / West / North / East. South is the Luna browser player; other seats are programmed bots. Partial records remain listed below; their decisions and scores are excluded from verified aggregates.

| Run | Bids | Tricks | Points | South margin |
|---|---|---|---|---|
| control-solo-baseline | 7/3/0/2 | 9/3/0/1 | 72/30/100/-20 | 35.3 |
| control-solo-candidate | 7/3/0/2 | 9/3/0/1 | 72/30/100/-20 | 35.3 |
| control-partners-baseline | 6/3/0/2 | 8/4/0/1 | 162/50/162/50 | 112.0 |
| control-partners-candidate | 6/3/0/2 | 8/4/0/1 | 162/50/162/50 | 112.0 |
| sweep-solo-candidate | 1/5/5/1 | 0/1/12/0 | -10/-50/57/-10 | -9.0 |
| sweep-solo-baseline | 1/5/5/1 | 0/1/12/0 | -10/-50/57/-10 | -9.0 |
| sweep-partners-candidate | 1/5/5/1 | 0/1/12/0 | 66/-60/66/-60 | 126.0 |
| sweep-partners-baseline | 1/5/5/1 | 0/1/12/0 | 66/-60/66/-60 | 126.0 |
| resources-solo-baseline | 3/2/5/2 | 5/1/5/2 | 32/-20/50/20 | 15.3 |
| resources-solo-candidate | 3/2/5/2 | 5/1/5/2 | 32/-20/50/20 | 15.3 |
| resources-partners-baseline | 3/2/5/2 | 5/1/5/2 | 82/-40/82/-40 | 122.0 |
| resources-partners-candidate | 3/2/5/2 | 6/0/6/1 | 84/-40/84/-40 | 124.0 |

## Coverage and factual checks

Human/bot counts include every replayed bid and card decision, including forced moves. Several-reasonable counts are outcomes of the original cue. C/F/U means confirmed / false / unresolved; the final number is input typed claims. Untyped wording is not validated by these counts.

Cues comprise original saved South advice and retrospective rendering from original bot analyses; bot cues were not issued during play.

Original evidence remains unchanged. Fresh analysis/advice is compared in JSON's persisted form (negative zero becomes zero; undefined object fields are omitted and undefined array entries become null).

| Mode / arm | Complete / planned hands | Decisions H/B | Forced H/B | Several-reasonable H/B |
|---|---|---|---|---|
| spades-solo / baseline | 3/3 | 42/126 | 7/25 | 0/0 |
| spades-solo / candidate | 3/3 | 42/126 | 7/25 | 0/0 |
| spades-partners / baseline | 3/3 | 42/126 | 7/25 | 0/0 |
| spades-partners / candidate | 3/3 | 42/126 | 6/26 | 0/0 |

| Mode / arm | Original cue C/F/U / inputs | Original analysis reason C/F/U / inputs |
|---|---|---|
| spades-solo / baseline | 0/0/0 / 0 | 0/0/0 / 0 |
| spades-solo / candidate | 591/0/0 / 591 | 1994/0/0 / 1994 |
| spades-partners / baseline | 0/0/0 / 0 | 0/0/0 / 0 |
| spades-partners / candidate | 617/0/0 / 617 | 3115/0/0 / 3115 |

336/672 cue records and 336/672 analysis records carry no typed claim fields. The independent checker uses a bound of 256; unresolved claims remain unresolved. No false typed claims found in the replayed decisions.

| Mode / arm | CASE-01 O/S | CASE-02 O/S | CASE-03 O/S | CASE-04 O/S |
|---|---|---|---|---|
| spades-solo / baseline | 0/0 | 0/9 | 0/0 | 0/21 |
| spades-solo / candidate | 0/0 | 9/9 | 0/0 | 21/21 |
| spades-partners / baseline | 0/2 | 0/8 | 0/0 | 0/14 |
| spades-partners / candidate | 1/1 | 5/5 | 0/0 | 12/12 |

O is the stored original analysis; S is the candidate recomputed on the same seat observation, an offline shadow diagnostic. Baseline originals do not emit CASE identifiers. Counts use the decision denominators above; role splits and per-predicate verdicts are in [audit.json](audit.json). A zero count stays a miss; no added games fill it.

## Descriptive paired outcomes

| Fixed pair | Status | Candidate minus baseline South points | Candidate minus baseline South margin |
|---|---|---|---|
| baseline-control-solo | complete | 0 | 0.0 |
| baseline-control-partners | complete | 0 | 0.0 |
| baseline-sweep-solo | complete | 0 | 0.0 |
| baseline-sweep-partners | complete | 0 | 0.0 |
| baseline-resources-solo | complete | 0 | 0.0 |
| baseline-resources-partners | complete | 2 | 2.0 |

spades-solo: 3/3 complete pairs; mean point difference 0.0, mean margin difference 0.0; spades-partners: 3/3 complete pairs; mean point difference 0.7, mean margin difference 0.7. Incomplete pairs have no difference or mean contribution. Solo margin is South minus the mean of the other three scores; Partners margin is the South/North team minus the other team, counted once.

## Agent and source evidence

- Recorded player attempts: 82; valid transport 82, accepted 77, rejected 5. Forced choices and identical-packet reuse need no new model attempt.
- Format-revalidated committed choices: **2**, including 1 identical-packet reuses (1 across arms); 2 in verified complete hands and 0 recorded in incomplete hands. These use 1 original rejected attempts through 1 recovery files. Original rejection records remain unchanged in the raw attempt counts. [Revalidation records](revalidations/) and audit.json retain each committed choice's original transport, source run/arm, and recovery pointer. 1 revalidation files exist; an uncommitted recovery file is not counted as a committed choice.
- Observer packets queued 48; responses 48, valid transport 45, accepted 45, rejected 3, awaiting response 0. Accepted public checkpoints 33; accepted retrospective reviews 12. Unreadable agent evidence files: 0, retained and flagged in audit.json.
- Observer judgments are agent evidence, not expert labels or factual-checker verdicts. They are never feedback to the player. Exact prompts/responses and rejections: [transport](transport/); captured observer inputs: [observer jobs](observer-jobs/).
- Jev calls: **0**. Runtime bots use deterministic code. Research agents use the configured model in [transport configuration](transport/config.json); its exact backend snapshot is not independently exposed.
- Raw browser hands: [runs](runs/), [public views](public/), [private replay](private/). Source links and case coverage: [case ledger](case-ledger.md), [source replay](source-audit.json), [frozen manifest](manifest.json), [code snapshot](code-snapshot.json).
- [Seat packets](seat-packets.jsonl) are future evaluation inputs; send one seat packet per model call. [Baseline decisions](baseline-decisions.jsonl) are separate evaluation targets and must not enter a decision-model prompt.

These three authored pairs per mode describe table behavior with all three bots changed. They are familiar development deals, not held-out evidence, a representative win-rate estimate, or proof of stronger play. Original claims, shadow diagnostics, and observer judgments remain separate.

The candidate composes plan 3.0, which retains the 2.1 action order. CASE-01 adds a conditional preference; the other new cases refine proofs and cues. Matching actions or scores on a pair do not establish strategic strength.
