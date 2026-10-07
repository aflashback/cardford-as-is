# M04F native database investigation — initial inspection

6 October 2026; read-only source/evidence review at `e0956a5`. No PostgreSQL startup, database query, test rerun, timeout change or source change was performed for this initial report. The archived failures remain unresolved. Passing later tests are evidence for those runs, not proof of a root cause or repair.

## What the retained evidence establishes

| Observation | Supported inference | What is missing |
| --- | --- | --- |
| M04A's first full run failed `TestM03StoreReplayChanceCheckpointsAndHandGrowth` at revision 22 with `timeout: context deadline exceeded`, followed by `DROP SCHEMA` SQLSTATE `55P03`. Its test elapsed time was 13.63 seconds. | A bounded command failed and teardown also encountered a lock. The stored fixture stayed at revision 22. | The original command error has no acquire, reconciliation, publication or commit stage; no contemporaneous backend/blocker snapshot exists. |
| M04C's preliminary full run failed `TestLocalServiceAdviceControlDeletionAndRestart` in fixture migration setup with `transaction.body: timeout: context deadline exceeded` (7.25-second test). | The failure occurred during setup, before that test's gameplay/history. | The original capture predates specific migration-statement stages and has no elapsed spans or failure-time backend snapshot. |
| M04D's targeted run passed nine configured-record cases, then failed `TestM04DConfiguredCoachingIndependentOfCoarsePlayPermission` with `store.create-schema` and Windows TCP `connectex` timeout (1.02-second test). | This particular failure was a new connection attempt, before schema/migration/gameplay work. Growing game history is not its immediate cause. | Listener/socket/server state during the connection failure was not captured. |
| Earlier M04C broad test selections overlapped older database suites; a subsequent standalone command startup also failed to connect. Final captures use `go test -p=1`. | Overlap could aggravate shared-resource contention; it cannot alone explain all recorded connection failures. | An identical narrow serialized workload with failure-time connection and SQL spans. |
| Later M04A/C diagnostics observed no blockers; later native queries and complete captures passed. | PostgreSQL was responsive at those later times. | A later idle snapshot cannot establish server state at the original failure. |

Evidence: [M04A failure](../m04/go-full-initial-failed-native.jsonl), [M04A later snapshot](../m04/database-after-initial-failure.json), [M04A fixture verification](../m04/database-failed-test-cleanup.json), [M04C preliminary capture](../m04c/go-full-pre-freeze-native.jsonl), [M04C review](../m04c/review.md), [M04D targeted failure](../m04d/targeted-pre-freeze-native.txt), [M04E review](../m04e/review.md).

These are at least two failure classes: a TCP connection failure and a bounded transaction/command failure. One explanation must not be assumed to cover both.

## Where the current budgets apply

`OpenStore` defaults to a five-second query/operation limit, one-second lock limit and four pool connections. It sets pgx `ConnectTimeout` to the same query limit, plus PostgreSQL statement, lock and idle-in-transaction limits. The create-schema/ping context includes acquiring or connecting, then the SQL operation. A `store.create-schema` stage alone therefore needs the error class or connect span to distinguish a failed dial from SQL.

`withTx` uses one bounded context across pool acquisition, `BEGIN`, the SQL body and `COMMIT`; each statement does not get another five seconds. Deferred rollback has its own bounded cleanup context. `Load` similarly bounds the database reads/commit, then performs private decoding/validation after returning the connection. `Commit` reconciles first, performs typed CPU/serialization work without a database connection, then enters bounded publication. Service contexts can impose a shorter caller deadline. A whole-command duration must therefore retain SQL, CPU and enclosing-deadline spans separately.

`pgxpool.BeginTx` combines acquire and `BEGIN`, so current `.begin` tags do not distinguish a depleted pool, ping/reconnect or a slow begin statement. Existing `.body` tags can cover multiple statements. `ApplyMigrations` installs all migrations in a single bounded transaction and takes database-wide advisory lock `972701`, even for different isolated schemas. Concurrent fixture migrations can contend on that lock. This is an inspected mechanism, not proof that it caused an archived failure.

The pinned local pgx `v5.11.0` implementation confirms that `Commit`/`Rollback` release pooled connections and a failed begin releases its acquire. Canceled connections can close asynchronously; `asyncClose` has a separate 15-second cleanup window. The pool destructor waits for `CleanupDone` with its own 15-second bound. Current M03 fixture teardown closes both pools before dropping the schema, which is materially better than the older drop-before-close ordering described in M04A review. A pool's acquired count reaching zero does not by itself demonstrate that all cancellation sockets/server sessions have disappeared.

No missing rollback/release was identified in the inspected `withTx`, `Load` or pgx transaction paths. This is not a blanket leak-free claim. In particular, records `storeTestOpen` registers cleanup after the first `OpenStore`, whereas service setup registers before opening either store; uncertain first-open failure deserves exact fixture cleanup evidence.

Relevant implementation: [store limits and transaction cleanup](../../../../server/internal/records/store.go), [load/commit](../../../../server/internal/records/store_documents.go), [migration stages](../../../../server/internal/records/store_migrations.go), [records fixture setup](../../../../server/internal/records/store_integration_test.go), [service fixture setup](../../../../server/internal/service/integration_test.go), [controlled cancellation regression](../../../../server/internal/records/local_service_test.go).

## Focused next diagnostic run

Run only after the coordinator assigns the single native database slot. Keep ordinary runtime timeouts, integrity checks, random deals and PostgreSQL configuration unchanged. Do not run the full suite or full race suite to investigate a connect failure.

1. Capture connection/acquire/statement spans for the existing controlled cases:
   `node scripts/windows-env.mjs go test -p=1 ./server/internal/records -run '^(TestM04CancellationStageAndPoolRecovery|TestM03StoreLockAndPoolWaitsAreBounded)$' -count=1 -json`.
   These already create a known owner-lock wait, cancel a command, check pool recovery and reject pool starvation. They distinguish instrumentation correctness from an intermittent uncontrolled failure.
2. Run the exact previously failing short case:
   `node scripts/windows-env.mjs go test -p=1 ./server/internal/records -run '^TestM04DConfiguredCoachingIndependentOfCoarsePlayPermission$' -count=1 -json`.
   If it passes, permit a finite five-iteration setup/teardown sample rather than an open-ended retry-until-green loop. Stop and preserve the first failure; passing samples do not close the earlier cause.
3. Exercise one narrow service setup/preparation command, then a reproducible short native archive at the previously failing revision range. Keep the 25-hand `TestM03StoreReplayChanceCheckpointsAndHandGrowth` as a separate growth acceptance gate after narrower attribution. Its ordinary M04E duration was 108.90 seconds; it is unnecessary for first-stage connection diagnosis.

Observe PostgreSQL from a separate bounded diagnostic connection while the known wait is still present. Retain only application name, PID, wait type/event, blocker PIDs, state, ages and socket-state counts; never store SQL text, arguments, connection configurations, cookies or credentials. Correlate observations by a diagnostic run ID and times. Start observation before the target operation; the current [M04E read-only helper](../m04e/database-diagnostic.mjs) run only after a completed failure can miss the relevant wait.

## Minimal diagnostic improvements to evaluate

- Use pgx's existing `AcquireTracer`, `ConnectTracer`, `QueryTracer` and `ReleaseTracer` in an opt-in test diagnostic path. Store only fixed allowlisted operation/stage labels, duration, starting/remaining deadline, PID where available, connection counts and sanitized error class/SQLSTATE. Ignore `TraceQueryStartData.SQL/Args` and `TraceConnectStartData.ConnConfig` in report serialization. Fixed query classification may inspect SQL internally without emitting it.
- Distinguish acquire/connect/transaction begin, reconciliation, publication statements, commit, rollback and pool close. Retain a bounded ring of spans; on failure dump that ring plus the contemporaneous read-only snapshot. This adds attribution without changing the timeout or transaction boundary.
- Verify the tracer with controlled lock cancellation and pool starvation first. Require no partial accepted command, successful later load/commit, all acquired connections released, schema cleanup and a sanitized report. Keep raw errors out of public reports; `StageError.Error()` wraps driver text, while the command startup sanitizer already allowlists stages and error classes.

The proposed production-pool tracer has not been implemented. The narrower synthetic probe below is the coordinator's selected first step.

## Prepared synthetic probe

After that initial inspection, the coordinator approved an opt-in [raw-pgx staged probe](database_probe.go) and [capture wrapper](database-probe.mjs). Native compilation and the single serialized execution described below passed. Production store pooling, complete commands/history, provider execution and runtime comparison are explicitly outside its scope.

The probe validates native Windows and the exact existing loopback test database, uses three finite iterations, and stops on the first failure. Each iteration opens one cold pgx connection, creates a unique schema with an atomic ownership nonce, applies the current canonical migrations, commits a tiny synthetic row, closes/reopens to verify that row and ledger, then removes only its own nonce-verified schema. There is no workload retry. Cleanup is a single independently reported attempt after either success or failure. No existing application schema is selected or reset.

It records cold TCP dial/connection, each SQL step, transaction commit/rollback, close and cleanup timings without SQL, arguments, connection configuration or raw driver errors. The complete migration transaction has one five-second budget across begin, advisory lock, ledger, all migration SQL and commit. Other operation groups are bounded at five seconds; PostgreSQL statement/idle limits remain five seconds and lock limits one second. Diagnostic timing does not reset those deadlines. The first failure triggers concurrent sanitized activity/wait/blocker and socket-count capture under one shared three-second observer deadline before ordinary cleanup. The capture records migration and tool/source hashes and rejects source drift.

Executable command after assignment of the database slot:

`node scripts/windows-env.mjs node qa/implementation/multi-game/m04f/database-probe.mjs --run`

The wrapper writes a distinct timestamped `database-probe-*.json` instead of overwriting prior failures. Its default invocation only prints the opt-in command. A successful probe would establish those synthetic connect/SQL/cleanup samples, never closure of the older timeouts or production pooling reliability.

Preparation validation: pinned native Go build passed; JavaScript syntax check and default opt-in guard passed. The first wrapped build encountered sandbox `spawnSync EPERM` while launching `go version`; direct invocation of the same pinned native Go executable with project module/cache paths compiled successfully. No database operation was attempted during preparation.

## Single captured execution

The coordinator ran the opt-in command once at `2026-10-07T02:55:52Z` (6 October, Toronto). The [structured capture](database-probe-20261007025552750.json) passed three requested iterations in **3,172.4372 ms**, exit code zero, with `sourceUnchanged:true`. That process-capture duration excludes the preceding build. Source/migration/tool manifest digest: `d9c4ac37a7097b117634444e968f6b673eafa06b54395e4a88739d756fea0369`. A subsequent read-only hash comparison matched every captured source entry to its current file. No second probe or database test was run by this investigator.

All three iterations recorded successful cold connection, owned schema creation, ten migration applications/ledger inserts, tiny transaction, fresh reconnect/read and owned cleanup. `cleanupOK:true` and successful `cleanup.drop`/`cleanup.close` spans are present for each distinct `m03_probe_` schema. No span has a failure and the failure observer did not run. This capture establishes successful server-acknowledged schema removal; it does not claim an independent post-cleanup database inventory.

| Recorded stage | Minimum ms | Maximum ms |
| --- | ---: | ---: |
| Cold TCP dial | 1.0227 | 3.1642 |
| Whole cold connection | 65.1432 | 91.8450 |
| Atomic schema/ownership-marker transaction | 10.3161 | 60.5976 |
| Whole migration transaction | 480.7639 | 524.7534 |
| Migration advisory-lock statement | 0.0000 | 3.8515 |
| Individual migration application | 0.0000 | 174.2897 |
| Migration commit | 2.6979 | 5.7782 |
| Tiny transaction | 29.1994 | 68.8018 |
| Fresh reopen connection | 64.6522 | 66.2308 |
| Fresh row/ledger-count read | 1.0340 | 1.5344 |
| Cleanup connection | 65.1191 | 70.8640 |
| Owned-schema drop | 117.8840 | 121.6195 |
| Whole ownership-check/drop operation | 121.4101 | 124.1709 |

Connection totals include their dial stage; transaction totals include their statements/commit and the completed-transaction rollback guard. These nested durations should not be added together. Recorded zero durations do not establish that an operation performed no work. The migration commit started with 4,481–4,521 ms remaining in its inherited five-second context, consistent with one shared transaction budget rather than a new budget for each statement.

Read-only report inspection found fixed stage names/timings, generated schema identifiers, source paths/hashes, explicit limits and the provider-off marker. No SQL text, SQL argument arrays, driver error message, connection URL/configuration, credential, cookie, header or token field is present. The failure-output/observer path was inspected in source and remains unexercised by this successful capture. No credential file was read for this inspection.

## Probe boundary review and remaining diagnosis

- Target parsing fails closed unless this is native Windows, `TEST_DATABASE_URL` differs from the application URL, and the parsed target is exactly `127.0.0.1:54331/cardford_windows_test` with the expected local role, no TLS or fallback target. Connection and migration stages inherit finite deadlines; the observer has its own shared three-second deadline.
- Schema name and nonce come from 128 random bits, and identifiers are quoted by pgx. Creation uses `CREATE SCHEMA` followed by its ownership marker in the same transaction. A pre-existing name fails creation rather than being reused. Cleanup requires that exact schema, the current role as owner and the exact run nonce before one drop attempt. An uncertain creation commit can therefore be checked without treating every schema owned by the role as disposable. A missing/foreign marker fails cleanup closed; absent schema is already clean. This is a fixture-ownership safeguard, not protection against a hostile administrator with the same database privileges.
- Failed transaction rollback and connection close have independently bounded cleanup spans. Cleanup failure marks the iteration failed and stops further samples. There is no retry-until-green loop, broad schema reset, PostgreSQL restart/configuration change or increase to product timeouts.
- The raw connection probe has no production pool acquire, workload contention, current/history decoding, prepared work, receipt reconciliation or real publication. It cannot reproduce or close production-pool starvation/cancellation behavior. The first-failure snapshot collector still needs a naturally occurring failure or separately authorized controlled validation before its runtime coverage can be claimed.

The archived connect and transaction failures remain open. This run supplies missing cold-connect/migration/cleanup stage evidence at this time and shows ample remaining budget in these three synthetic migration transactions. It does not identify the earlier primary failure, prove a repaired native environment, justify raising any timeout or satisfy complete normal Spades/history resource activation gates. Retain the production controlled cancellation/pool-wait regressions and an opt-in production failure-time tracer as the next relevant evidence; another full suite or repeated successful raw probe would add little causal information.

## Test-cost answer

The final M04E captures explain substantial cost without additional expensive tests: normal Go acceptance took 364.284 seconds and the serialized `-race -short` capture took 1,168.309 seconds. Selected tests below illustrate the difference; these are archived test-run times, not product latency benchmarks.

| Test | Normal seconds | Race seconds |
| --- | ---: | ---: |
| `TestM04ETerminalFixtureBuilder` | 26.91 | 169.63 |
| `TestLocalServiceThreeModesAndReceiptRecovery` | 27.12 | 139.53 |
| `TestM04BOriginalPoliciesAndAdvice` | 22.56 | 137.44 |
| `TestM03StoreReplayChanceCheckpointsAndHandGrowth` | 108.90 | skipped under `-short` |

Full milestone checks are justified by durable/recovery/information-boundary guarantees. Repeated complete normal-match browser attempts, full race runs during each small edit, and broad test selectors are expensive ways to answer narrow questions. Normal-match soak was correctly separated from required terminal fixtures after censored runs; its resource evidence remains open. Continue with exact affected regressions, narrowly instrumented native operations and one final required acceptance gate after changes stabilize.

Source evidence: [M04E normal capture](../m04e/go-full.json), [M04E normal events](../m04e/go-full-native.jsonl), [M04E race capture](../m04e/go-race.json), [M04E race events](../m04e/go-race-native.jsonl), [capture command definitions](../m04e/verify.mjs). Race-instrumented timings and these suite totals must not be used as Go/Node comparisons or capacity claims.
