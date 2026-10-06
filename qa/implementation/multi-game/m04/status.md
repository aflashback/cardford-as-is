# M04A — Original Go Hearts prerequisite passed

Started 6 October 2026 (Toronto) from `dc0e44a`, branch `codex/current-game-modules-m02`. The owner authorized the next M04 step. [Execution scope and remaining sequence](../../../../planning/implementation/multi-game/m04-execution.md).

## Delivered in M04A

- Completed the original Go Hearts reducer beyond opening passing: legal play, trick collection, normal/moon scores, tied and uniquely won matches, later actual deals, dealer rotation and left/right/across/hold passing.
- Preserved original V1 pins, state/events, observations, complete legal choices/candidate order and safe views. Player knowledge updates with public plays/voids; passed cards disappear from known holdings when played. No policy, scoring rule or default changed.
- Added strict played-state/archive validation and compact persistence throughout the hand/match. Original decision binding now supports plays as well as sealed passes; original advice bytes, receipts and hand IDs survive later deals and reopen.
- Kept trusted transitions typed and immutable. State import does the historical validation; applying an already trusted snapshot does not decode the private state or reconstruct its history.
- Removed the parity test's first-pass-only exception without relaxing executor limits. Complete corpora run in bounded chunks and reopen at each chunk boundary.

These close the Hearts prerequisite for MG-02/03/04/09 and SYS-03/06/10/12. **M04 as a whole remains in progress.** The existing TypeScript service remains active and the React UI is unchanged. Go policy execution and authenticated service/client activation remain separate acceptance work.

## Independent evidence

[Parity report](parity-evidence.md): **1,088 exact checkpoints across all four actors**, including **668 Hearts checkpoints**, plus five scoring fixtures. This includes 267 unchanged original Hearts checkpoints across four hands, the unchanged Spades corpus, and 401 separate TS-generated Hearts checkpoints. The new corpus reaches mixed scoring, all passing directions, five moon hands, a tied lowest score after the 100-point threshold and the following uniquely won match. It never patches scores or phases to manufacture those outcomes. Its exporter refuses to overwrite the frozen corpus; `--check` verifies exact bytes and source fingerprints.

Record tests compact/reopen every original Hearts checkpoint, verify replay and archive preservation, and keep a complete terminal match readable when its execution policy is unavailable. A real PostgreSQL test commits a complete hand and the first play of hand 2, loads through another repository, reopens a fresh store, reconciles the original collection/next-hand receipts, and preserves fixture human analysis/advice bytes. This is storage acceptance, not a running policy or HTTP service.

[Independent review](review.md) reproduced and closed an `events:null` acceptance hole in both Hearts compact boundaries. The regression verifies all three modes; existing Spades decoding already rejected it. No other actionable Hearts finding remained in scope.

## Native verification

All checks use the same native Windows host through `scripts/windows-env.mjs`: Node 24.19.0, Go 1.26.8 and PostgreSQL 16.15; race uses the pinned LLVM-MinGW compiler. Database tests use `cardford_windows_test` and isolated schemas. Jev is off, requests are zero and observed live model ID is none. No comparison campaign or provider/human evaluation ran.

| Check | Result | Manifest / output |
|---|---|---|
| Complete Go suite, including long-history checks | 526 test/subtest passes, no failures or test skips | [Manifest](go-full.json), [output](go-full-native.jsonl) |
| Native race detector, short mode | 524 test/subtest passes; no failures; two existing growth skips | [Manifest](go-race.json), [output](go-race-native.jsonl) |
| Original TS Hearts/module/coach regressions | 28/28 passed; no failures/skips | [Manifest](node-reference.json), [output](node-reference-native.txt) |
| Frozen new TS oracle | Exact bytes/source fingerprints passed | [Manifest](oracle-check.json), [output](oracle-check-native.txt) |
| Generated Go and public contracts | Passed: 99 definitions, 248 Ajv fixtures, nine RNG vectors; public artifacts current | [Go](go-contracts.json), [public](public-contracts.json) |
| Go vet | Passed | [Manifest](go-vet.json), [output](go-vet-native.txt) |

Race short mode skips only `TestRecordLongHistoryGrowth` and `TestM03StoreReplayChanceCheckpointsAndHandGrowth`; both passed in the normal full suite. All seven final captures have the same source digest, unchanged source during execution, and verified output hashes. [Delivery checks](delivery-checks.json) also confirm no diff to the existing app/UI, Spades, public/kernel contracts, toolchains/lockfiles, canonical migrations or earlier evidence from `dc0e44a`. No browser run was needed for this unexposed Go slice; the complete M04 browser gate remains pending.

Source/document whitespace checks pass with Git's `cr-at-eol` setting and captured `.txt`/`.jsonl` logs excluded. Raw Windows output retains its original line endings and error-line trailing spaces so output hashes and failure evidence stay exact.

Exact reproducible commands are in each manifest and `verify.mjs`: run `node qa/implementation/multi-game/m04/verify.mjs <check-name>` after `node scripts/windows-env.mjs pg:start`. This runner captures source/output hashes and rejects source drift during a check. It is a correctness runner, not a benchmark. Focused earlier red/green outputs remain separate from these final captures.

After verification the task-started native database was [gracefully stopped](shutdown.json); port 54331 has no listener. Data and selected toolchains remain available. Temporary diagnostic source is archived as `database-diagnostic.mjs.txt`; no test process was left running.

The [first full run](go-full-initial-failed.json) passed the new Hearts SQL test but failed the unchanged Spades growth test at revision 22 with a context timeout and a secondary schema-cleanup lock timeout. The [raw failure](go-full-initial-failed-native.jsonl) is retained. A [read-only activity check](database-after-initial-failure.json) later found no remaining sessions/blockers. Only the [verified failed test schema](database-failed-test-cleanup.json) was removed; its stored revision was still 22. The unchanged complete rerun passed. No timeouts were raised, assertions weakened, development data reset or database restarted. The cause of the primary native timeout remains unproven; the passing retry does not close it. [Review and follow-up](review.md#native-database-follow-up).

## Remaining gates and next step

Next is **M04B: exact original policy execution and V2 session/service contracts** from the [execution sequence](../../../../planning/implementation/multi-game/m04-execution.md#remaining-sequence-and-activation-gates). Storage registration does not execute `hearts-baseline-1.0.0` or `spades-tactics-2.1.0`; port full facts/reasons/cues/advice before activating either. Preserve optional saved policies or make them explicitly read-only.

The V2 platform response/bootstrap/pending-command gaps, authenticated Go listener, access-offer resolver/atomic unlocks, online demo and actual three-mode browser recovery journey remain pending. No browser or hosted acceptance is claimed here. Full old platform documents keep their original reader; no bulk migration or repinning occurred.

V1 observations retain the full event archive. Immutable transitions still copy that slice and untrusted import validates previous public hands, so these costs grow with history within existing bounds. Larger Hearts/full-service measurement and native timeout/cancellation diagnostics remain explicit activation follow-ups. Hosting, human reviews, new games and strategic-strength claims remain deferred.
