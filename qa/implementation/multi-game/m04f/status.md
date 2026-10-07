# M04F — First measured history-performance slice

**First slice implemented and verified; M04F/default activation remains open.** Started from `e0956a5` on 6 October 2026 (Toronto), following the request to explain long tests and start the next work. Native Windows and the existing Go/PostgreSQL/React choices remain unchanged. [Execution scope](../../../../planning/implementation/multi-game/m04f-execution.md).

## Why tests took so long

The [audit of retained output](test-costs.json) puts the normal Go suite at **6m 04s**, race-short at **19m 28s**, and all 16 final M04E captures at **36.15 minutes**. The old harness runs packages serially and disables successful-test caching. Race instrumentation adds substantial overhead even to deterministic parity and fixture builders. These are useful once at a frozen integration gate, but too expensive for each small edit.

Two incomplete normal-random browser runs consumed another **57.29 minutes**, without completing Solo or running Partners. Their limitations remain recorded. Repeated completion attempts were a poor diagnostic for growing request cost; bounded profiling should have started sooner. Suite timings do not compare Go and Node or describe production latency.

The new [focused runner](../../../../scripts/m04-focused-checks.mjs) provides explicit `fast`, `history`, `persistence`, `concurrency`, `parity`, `growth` and `release` selections. Pure iteration permits Go's cache; persistence and race checks run fresh. It preserves the original ten-minute test-binary deadline and product operation limits, fails on missing tests/unexpected skips and never starts PostgreSQL automatically. [Commands, coverage and full-gate criteria](test-strategy.md).

## Changes and measurements

- Spades reducers retain deep copies at import/binding and copy mutable state and the event array, while sharing only immutable past event values. Three spare event slots avoid a second whole-array copy on append. Retained snapshots, rejected operations, concurrent branches and exported data remain isolated.
- Shared event handling invokes every viewer callback. It validates each distinct projected byte sequence fully, then reuses that result only for identical copied bytes within that one event. There is no cross-event/global cache or skipped viewer-specific check.
- No rules, policy, schema, historical command/checkpoint validation, output pins, operation deadlines, UI or persistence semantics changed.

The [profile summary](profile-summary.json) verifies output hashes and the identical private replay input/timed benchmark. Values below are medians of three samples on the same native host, with normal instrumentation. They are observations from these small controlled workloads, not service-capacity or statistical-significance claims.

| Work | Before | After | Allocation evidence |
|---|---:|---:|---|
| One reducer bid after 20 legal synthetic Partners hands | 233 µs | 40 µs | 2,569 → 67 allocations; 295 → 119 KB |
| Replay/checkpoint validation, one saved Solo hand | 64.6 ms | 55.0 ms | 31.2 → 27.2 MB allocated |
| Replay/checkpoint validation, three saved Solo hands | 205.4 ms | 172.1 ms | 99.9 → 85.4 MB allocated |
| Replay/checkpoint validation, five saved Solo hands | 366.7 ms | 307.7 ms | 173.8 → 145.3 MB; 4.29 → 3.75 million allocations |

Replay checks every original command, intermediate checkpoint and resulting archive. It excludes SQL, file loading, prepared policy work and delivered help from its timed loops. The retained terminal archive supplies legal histories only. `replay-before` is the baseline, `replay-after` isolates the clone change, and `replay-final` includes both changes. The runner gained the final output label without changing the timed Go benchmark, iteration counts, input or profile settings. The initial benchmark used the wrong node name (`round-boundary` instead of `round-complete`); its failure/output manifest remain in `replay-initial-harness-failure.*`. That manifest retains its original output filename; the renamed failure text matches its hash.

[CPU](replay-before-cpu.txt), [cumulative CPU](replay-before-cumulative.txt) and [allocation](replay-before-allocations.txt) profiles show strict JSON parsing/canonicalization/schema validation dominates the wider replay. Event copying was only one contributor. Source review also identified duplicate strict decoding in `sessions.DecodeOperation`; it remains unchanged and is a focused follow-up candidate. Full-history replay itself still grows with history.

## Verification

- Six focused Spades checks and three targeted Spades race checks passed, including immutable concurrent branches, failed-transition rollback and detached output. [Regression output](clone-regressions.txt), [race output](clone-race.txt), [source capture](clone-after.json).
- Seven kernel checks and three targeted kernel race checks passed, with seven adversarial projection subcases in each relevant run: different viewer output, reused mutable buffers, malformed/duplicate/unknown fields, wrong pins, hidden events and later callback errors. [Normal output](event-projection-regressions.txt), [race output](event-projection-race.txt), [source capture](event-projection-checks.json).
- Fresh [history selection](history-checks/report.json): 19 named checks passed in 10.51 seconds, with no missing tests or skips and unchanged source.
- Fresh [complete frozen parity selection](parity-checks/report.json): nine named tests passed in 59.60 seconds, with no missing tests or skips and unchanged source.
- Four [history safety checks](history-safety.json) passed: 100-hand codec growth, malformed archive/checkpoint, substituted origins and original historical advice. Test times total 11.91 seconds. Vet passed.
- Independent source review found no actionable issue in the three runtime changes. Full browser/full race acceptance, the 25-hand database growth test and normal-match soaks were not rerun for this first slice; the previous M04E results remain evidence for their recorded commit, not fresh acceptance of these changes.

## Database and remaining work

The [database investigation](database-investigation.md) distinguishes old connection-stage failures from transaction/migration failures. A single [bounded diagnostic](database-probe-20261007025552750.json) passed three cold-connect/schema/migration/tiny-transaction/reopen cycles in 3.17 seconds, retaining one shared five-second migration deadline and the one-second lock limit. Cold connections took 65–92 ms; all ten migrations took 481–525 ms; all owned schemas were removed. The synthetic raw-pgx probe does not exercise production pooling or complete game commands. Its failure observer was not triggered; the earlier cause remains unresolved.

Next: retain a reproducible corpus with actual prepared decisions and delivered help at 1/10/20 hands; measure complete request paths and equivalent traced/untraced runs, then address the dominant replay/JSON costs without weakening validation. Complete normal Spades matches and the frozen-source milestone gate after those remedies. This first slice does not activate Go by default or close M04.

[Delivery checks](delivery-checks.json) and [cleanup](cleanup.json) record the final source/output preservation and native cleanup. Jev stayed **off**, with **zero live requests** and **no observed model**. Human review, hosting, payments and native packaging remain deferred.
