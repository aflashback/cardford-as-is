# CR-STRAT-012: offline Trix scenario collection with Luna players

**Date:** 10 October 2026. **Status:** owner approved implementation and starting the bounded collection on 11 October 2026: “ok lets start”.

## Owner amendment — 11 October 2026

### Scoped review exception — 12 October 2026

The owner explicitly approved one replacement independent review for run `trix-luna-20261011-pilot`, review `decision-2a88878127fbd09bcff0b11f` / decision `basic-solo-3:36:0`, after its first attempt timed out and its second received prior campaign reviewer memory. This permits exactly one third call for that review. Preserve both earlier consumed attempts, their rejected settlements, incomplete/complete raw output and context evidence. Do not admit the second response or its contaminated context. The replacement must use the same frozen review prompt and actor evidence in a fresh, inspected memory-isolated Luna Max context.

The ordinary two-attempt cap remains for every other player/reviewer decision; every invocation keeps its 300-second absolute deadline. If the replacement fails, preserve its evidence and pause without a fourth call. The exception does not reset counters, change game outcomes, skip a review, or authorize selected-case export. Integrate the scoped allowance consistently into review import, historical validation and raw-game provenance before dispatch, with immutable source/context admission and independent review.

The direct human answer, exact question, target and limits are preserved in the run's `reports/review-memory-owner-authorization-20261012.json` (SHA256 `57668acf0f6a04106ba699b0c99631ebcd22e343be7aba4ac878ea5b6cbf68ad`). Earlier accepted calls retain their historically admitted context and separate ambient-memory limitation; do not relabel them as memory-isolated. Future memory-isolated calls require their own exact inspected context and transport policy. This approval is not evidence that implementation, admission or the replacement call has completed.

The 11 October amendment authorizes continuation of the existing collection without an aggregate 90-minute wall limit. The per-invocation limit remains 300 seconds, and the ordinary maximum remains two attempts per decision, subject only to the later scoped exception above. The four-variant phase order below is unchanged. Complete the planned request budget of 32 Basic Solo, 32 Complex Solo, 32 Basic Partners and 64 Complex Partners requests (160 total); the already completed Basic Solo Diamonds request counts as one of the 32 Basic Solo requests.

Keep the detailed reviews after each game: complete its decision reviews and game review as required before moving on. Selection and curation, including export of selected cases, are deferred to a later step. The later selected-case ceiling remains at most 1,000, while every raw attempt, response, action, outcome and review record remains retained. Selection is not required to continue or finish the planned games.

The 11 October 2026, 19:23 UTC checkpoint and its 90-minute limit document the earlier operating policy and historical state only. It remains an immutable account of that pause, including its private checkpoint reports; the amendment does not rewrite those records. The continuation processor is implemented. The CLI sequence freezes this amendment with `continue-campaign`, checks frozen admission with `campaign-check` (zero model calls and no journal changes), then runs `campaign`. The combined continuation/driver/policy suite passed 49/49; actual frozen CLI admission passed with zero model calls and an unchanged journal. See [the continuation implementation note](../../docs/superpowers/plans/2026-10-11-trix-campaign-continuation.md).

## Decision

Prepare a repeatable, isolated research exercise in which four logical seats use `gpt-6-luna` with reasoning effort `max` to select Trix penalty-request moves and supply a concise decision rationale before each move is applied. Run one seat invocation at a time. Collect Basic Solo, Complex Solo, Basic Partners, then Complex Partners. Exclude the Trix Jacks request and every non-Trix game.

This is an explicit owner-approved exception to CR-STRAT-011's restriction that offline models cannot act for a seat. The exception applies only to this separate data-collection harness. Production bots and the current coach remain deterministic; no model fallback, new default strategy, model training, or automatic promotion is part of this work.

The owner confirmed that the curation limit counts **selected coaching cases**, with every raw input, response, action and outcome retained. Targets/caps are 200 Basic Solo, 200 Complex Solo, 200 Basic Partners and 400 Complex Partners, totaling at most 1,000. The 11 October amendment defers this selection step until after campaign collection; targets do not justify lowering evidence quality or claiming exhaustive strategy coverage.

## Reason and alternatives

Use native Go gameplay plus external player invocations. This preserves authoritative legality/scoring and captures decisions at their original information boundary. Recreating Trix in a prompt risks rule drift. Adding Luna to the existing deterministic policy registry would misrepresent provenance and broaden the app's model boundary. Both alternatives are rejected.

## Compatibility and evidence

Preserve historical pins and records. Create a separate external-player journal and an explicit later lab import projection; never fabricate deterministic `DecisionTrace`, `originalAnalysis`, coach advice, human labels or policy pins for model moves. All claimed strategic gaps require decision-time evidence. Outcomes are a separate retrospective record.

Acceptance must cover variant/rules agreement across seats, hidden-hand isolation, native replay, doubles and team accounting, stale/duplicate responses, model/effort receipts, interruption recovery, quotas and family deduplication. Keep sampling-based suggestions distinct from proved missed opportunities.

## Prepared artifacts

- [Design](../../docs/superpowers/specs/2026-10-10-trix-scenario-collection-design.md)
- [Implementation plan](../../docs/superpowers/plans/2026-10-10-trix-scenario-collection.md)
- [Templates, campaign and runbook](../implementation/coach-lab/trix-scenario-collection/README.md)

This record authorizes the scoped collector and bounded host-assisted runs. Actual implementation and collection results are reported separately; approval is not evidence that games or strategy validation completed. A separate paid-provider budget is not authorized.
