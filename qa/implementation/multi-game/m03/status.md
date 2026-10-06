# M03 durable records — passed within private adapter scope

Completed 6 October 2026 (Toronto), from `6310d6e` on `codex/current-game-modules-m02`. Comparison cleanup is committed as `67d8daf`; the following M03 implementation commit contains this report and its evidence. [Execution scope](../../../../planning/implementation/multi-game/m03-execution.md) and [private contract](../../../../planning/implementation/multi-game/private-records.md).

## Delivered

- Closed the Go/Node comparison, gracefully stopped the historical Podman test database, and removed **1,331,472,713 bytes** of disposable builds, profiles, obsolete compilers and downloads. Original evidence, source harnesses, selected tools, development/saved-game data and unrelated work remain preserved. [Cleanup inventory](comparison-closeout.json).
- Selected **native Windows** for subsequent local Node, Go and PostgreSQL work. Pins remain Node 24.19.0, Go 1.26.8, PostgreSQL 16.15 and LLVM-MinGW 23.1.2 through `scripts/windows-env.mjs`. Setup remains usable after download-cache cleanup.
- Added closed versioned metadata/documents, immutable original opening chance and accepted operations, game-owned compact state, append-only events, original decision/advice and exposure records. Trusted historical readers can verify replay and original advice while rejecting new play.
- Added one atomic PostgreSQL publication for snapshot, history, decision reference, allowance and original command response; owned reconciliation survives revision/game/access changes under current read authorization. Go shares Node's canonical migration directory, checksum ledger and advisory lock; only forward migration 007 is new.
- Added durable duplicate-suppressed work, bounded attempt leases, immutable issued results, stale access/control/unit/revision fences, explicit unfinished retry and expired-result successors. Trial/offer/grant records preserve purchased terms; finishing rights survive legitimate control changes, revocation still denies, and one hand is charged once across period changes.

These deliver the M03 private-storage portions of MG-03/05/09/16 and SYS-03–07/10, plus bounded SYS-12 growth evidence. They do not close the later HTTP/client/reasoning acceptance in those shared requirements.

After final verification, the native project database was gracefully stopped; its port has no listener and no task test process remains. [Shutdown record](shutdown.json). The preserved app/UI, policy files, first six migrations, lockfiles and original M02/M02A/comparison/evaluation archives have no diff against `6310d6e`. [Delivery checks](delivery-checks.json) verify source/output hashes, local report links and absence of private database credentials in this evidence.

## Final native verification

All database suites below ran serially on the same native Windows host and project-local PostgreSQL, using the distinct `cardford_windows_test` database and isolated test schemas. Jev was off, billing was fixture mode, and no live provider/model request occurred. Observed live model ID: none; provider fixtures do not supply strategy evidence.

| Check | Result | Exact command, source hashes and output |
|---|---|---|
| Complete Go suite, including both long-history fixtures | 478 test/subtest passes (477 regular checks plus the temporary connection diagnostic); zero failures/skips | [Manifest](go-full.json), [raw output](go-full-native.jsonl) |
| Native Go race detector, `-short` | 475 test/subtest passes; zero failures; two documented skips | [Manifest](go-race.json), [raw output](go-race-native.jsonl) |
| Existing complete Node app/server suite | 493/493; zero failures/skips | [Manifest](node-full.json), [raw output](node-full-native.txt) |
| Go vet / dependency integrity | Passed | [Vet](go-vet.json), [modules](go-mod.json) |
| Public contracts / generated Go parity / TypeScript / browser import boundary | Passed | [Public contracts](public-contracts.json), [Go parity](go-contracts.json), [TypeScript](typecheck.json), [browser boundary](boundaries.json), all through the native wrapper |

The race run skips only `TestRecordLongHistoryGrowth` and `TestM03StoreReplayChanceCheckpointsAndHandGrowth`; both passed in the complete normal run. Race coverage includes the ordinary two-instance concurrency, reclaim, rollback, expiry and original-record tests. Growth was not rerun under race instrumentation. Timing in these checks is diagnostic, not a language comparison or service-capacity claim.

The implementation/source hashes match across all nine captured native checks. The full Go run also included the temporary read-only connection diagnostic before its removal from the normal package; its exact source is archived and its hash matches the extra entry in that run's manifest. The eight subsequent manifests match the remaining source set exactly. No implementation changed between these checks. Earlier real failures and their repairs remain in [codec evidence](codec-evidence.md), [store evidence](store-evidence.md), and [work evidence](work-evidence.md).

An overlapping development run hit native PostgreSQL lock/connect timeouts. The [first full Go run](go-full-initial-failed.json) also recorded five connection/setup failures before assertions, with 472 test/subtest passes; its [raw output](go-full-initial-failed-native.jsonl) is retained. A [bounded connection diagnostic](native-db-setup.md) confirmed that default TLS preference opened two connections against the local server with TLS disabled. The wrapper now explicitly configures this recognized loopback-only cluster; the five affected tests and complete Go/race suites passed. This removes measured unnecessary fallback but does not prove the cause of every earlier TCP timeout.

The [first final-source Node run](node-full-initial-failed.json) retained 473 passes and six failures, including database connection errors and a checksum mismatch from the unpublished earlier draft of migration 007 still installed in the test database. Its [raw output](node-full-initial-failed-native.txt) is preserved. The checksum guard correctly refused that draft. After all processes ended, the project cluster was gracefully restarted and only the idle disposable test database was recreated, preserving the development database ([reset evidence](test-database-reset.json)). The final full Node rerun passed 493/493. Later OS/TCP checks found no current exhaustion or server-crash indicator; earlier transport failures remain unattributed. Finite database limits were not relaxed. These final suites ran serially. An earlier full Node run before the final 007 refinements had also passed; this report's acceptance uses the fresh final rerun.

## Growth and review

[100-hand codec evidence](codec-growth.json) preserves exact observations for all four actors at 1, 10 and 100 hands. Compact game state is 2,176 / 2,182 / 2,186 bytes; the original full state is 9,405 / 75,306 / 741,962 bytes. Event history is stored separately once.

[25-hand SQL evidence](sql-growth.json) covers 1,749 accepted commands, 2,100 events and all 24 actual later deals, verifying every persisted replay checkpoint. Current document size is 3,066 / 3,075 / 3,077 bytes at 1 / 10 / 25 hands. Last transition writes are 3,522 / 3,536 / 3,543 bytes. Stored payload grows linearly; ordinary load bytes grow from 17,080 to 363,241 because the frozen original policy retains the full event archive. These measures exclude SQL indexes/WAL, protocol overhead and non-game tables.

[Independent review](review.md) identified and closed historical-reader replay, a near-cap archive-budget mismatch and cross-period double charging. Their regressions passed in both final Go runs. Coordinator review also closed full command-intent hashing, actual-unit/expiry fences, generation-preserving finish rights, finite retries and completed-review immutability. No open correctness finding remains in the scoped review; this is not a production security/capacity assessment.

## Remaining gates and next work

**Next: M04 service/client integration.** The Go record adapter remains restricted to isolated test schemas; the existing TypeScript server and UI continue to own normal play. M04 must provide authenticated player-safe projections, HTTP/reconnect recovery, current-game dispatch and offer resolution. Full Hearts and original reasoning-policy ports retain their parity gates; registering a storage policy is not proof that its algorithm is implemented. Complete old V1 platform documents still use their original TypeScript reader; there is no bulk history rewrite or silent policy replacement.

The store bounds hot state to 256 KiB, each event/command archive to 16 MiB and events to 100,000, with finite pool/query/lock limits. Preserved historical observations/replay still grow with history. Earlier native TCP errors remain an environmental follow-up if they recur; the passing rerun does not establish their root cause. A production account-erasure path must explicitly handle immutable-record constraints before activation. M05 owns bounded reasoning/continuation execution. No UI redesign, comparison rerun, hosting, live provider, strategy promotion, human review or learning claim is included.
