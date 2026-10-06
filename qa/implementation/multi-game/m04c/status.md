# M04C — Authenticated durable Go service

**Passed scoped local-service acceptance, 6 October 2026 (Toronto).** Native Windows; Node 24.19.0, Go 1.26.8 and PostgreSQL 16.15. Starting commit `bbca6fe`; the delivery commit contains this report and its source/evidence manifests. Requirements: local service portions of MG-02/04/05/06/09 and SYS-03/04/05/06/07/08/09/10; full M04 remains open. The intermittent native database timeout has an explicit unresolved follow-up below.

## Delivered scope

The explicit `cmd/cardford` loopback API now connects server-issued local identity and tab control to V2 Hearts Solo, Spades Solo and Spades Partners, compact PostgreSQL records, bounded original-policy preparation, immutable original advice and durable command recovery. Opening/replacement, control takeover and accepted game commands publish their original receipt atomically. Only the human's permitted advice is public; the server retains bot choices, private events and actual deals.

Forward migration 008 adds local credential hashes, leases and public-intent receipts. Account erasure authenticates and locks its owner, deletes that owner's records atomically, and leaves the ordinary immutable-history guards active. The Go and Node migration runners still share the canonical SQL and checksum ledger. Original migrations 001–007, root public schema/generated client artifacts, original TypeScript game/policy code and earlier milestone evidence are preserved.

The existing React interface and TypeScript service remain active. This API is an explicit local fixture service in the separate `cardford_go_local` schema; it does not activate hosted identity, real purchases or the final UI connection. Full V1 platform history retains the original reader. No V1/V2 conversion or policy substitution occurs.

## Acceptance evidence

The preliminary [real HTTP/PostgreSQL integration run](service-integration-native.txt) passed all three full hands, original advice, replay, separate continuation/chance, replacements, cross-instance original receipts, conflicting retries, ownership, control takeover, restart retry and erasure. The final full run below repeats those flows after the review fixes. The complete-preparation bridge also checks **280 decisions across five original streams**, including every saved help level; the original policy regression still verifies all **6,380 decisions**.

[Review findings and native database observations](review.md). [verify.mjs](verify.mjs) records each command, source/output hashes, host, timestamps and provider mode. Database suites run serially, including `go test -p=1`; operation deadlines are unchanged. The [native command smoke](command-smoke.mjs) compiles and launches the actual executable, restarts its process, confirms identical receipts/advice and erases its account in a newly owned test schema. Its process restart uses Windows termination; it does not claim graceful signal delivery.

Commands below run after `node scripts/windows-env.mjs`. Source-stable acceptance uses manifest SHA-256 `513038ed12011c3301fc850de24f9ca90cb0c4921c1dc949466bc543f9e85b09`.

| Check | Native command | Result / evidence |
|---|---|---|
| Full Go/PostgreSQL | `go test -p=1 ./server/... -count=1 -json` | **1,206** passing tests/subtests, 16 tested packages, no failed/skipped tests; [manifest](go-full.json), [output](go-full-native.jsonl) |
| Native race detector | `go test -p=1 ./server/... -race -short -count=1 -json` | **1,204** passing tests/subtests, 16 tested packages, no failures; two expected skips; [manifest](go-race.json), [output](go-race-native.jsonl) |
| Static checks | `go vet ./server/...` | Passed; [manifest](go-vet.json) |
| Generated Go contracts | `node scripts/m02a-contracts.mjs --check` | **119 definitions, 288 actual Ajv fixtures, 9 RNG vectors**; [manifest](go-contracts.json) |
| Preserved and additive public bundles | `npm run contracts:check` | Passed; [manifest](public-contracts.json) |
| TypeScript | `npm run typecheck` | Passed; [manifest](typecheck.json) |
| Original import boundaries | `node qa/implementation/multi-game/m04b/generate-boundaries.ts --check` | **78 cases** reproduced; [manifest](boundary-check.json) |
| Numeric/Unicode boundaries | `node qa/implementation/multi-game/m04b/generate-edges.ts --check` | **21 cases** reproduced; [manifest](edge-check.json) |
| Preserved Node regressions | `node --test --test-isolation=none web/server/tests/module-parity.test.ts web/server/tests/hearts-module-validation.test.ts web/server/tests/coach-legacy-parity.test.ts web/server/tests/frozen-baseline.test.ts` | **32/32**, no failures/skips; [manifest](node-reference.json) |
| Actual compiled command | `node qa/implementation/multi-game/m04c/command-smoke.mjs` | Startup, original advice, process restart, identical receipts/advice and erasure passed; [manifest](service-command.json), [output](service-command-native.txt) |

The two race skips are `TestRecordLongHistoryGrowth` and `TestM03StoreReplayChanceCheckpointsAndHandGrowth`; both passed in the full normal run. `cmd/perf` reports no test files and is excluded from the 16 tested packages. Independent reviewers confirmed the recorded fixes; no important implementation findings remain open within this scope.

The unchanged original oracle cannot accept newly discovered file names in the expanded checkout. Its retained [failed check](oracle-check.json) is resolved by the [independent snapshot reproduction and exact inventory-difference proof](original-reference-manifest.json): 251/251 original hashes match, and all content outside the four-file inventory addition is identical. Reproduce by restoring [the archived helper](original-reference-check.mjs.txt) to `.local/m04c/original-reference-check.mjs` and running it through the native wrapper. The old generator and goldens remain untouched. This is a passing compatibility proof, not a strategy improvement result.

[Delivery checks](delivery-checks.json) verify final source/output hashes, original-file preservation, documentation links and absent database credentials. [Cleanup proof](database-cleanup-proof.json) identified three schemas from the early failed test setups and a stale idle test backend with no remaining OS client/test process. [Scoped cleanup](database-cleanup.json) removed only those remnants. The [final database snapshot](database-after-tests.json) has no clients or isolated schemas; the test-started [native database was stopped](native-postgres-stop.txt) and [port 54331 has no listener](native-postgres-port-check.txt). Development data is retained.

[Filesystem cleanup](filesystem-cleanup.json) removed about 62.6 MB of this milestone's disposable executable, reference mirrors and temporary helpers. The helper sources are archived as text; native tools, database data, previous evidence and unrelated local files remain.

## Run locally

From the repository root:

```powershell
node scripts/windows-env.mjs pg:start
node scripts/windows-env.mjs go run ./server/cmd/cardford --migrations web/server/records/migrations
```

The API listens on `http://127.0.0.1:4174`. The wrapper supplies explicit local identity, fixture billing and provider-off settings. Stop the service with Ctrl+C and stop the project database after other local clients are finished. [Environment and existing-app instructions](../../../../planning/implementation/multi-game/windows-development.md).

## Limits and next step

Two workers, sixteen queued reservations, finite HTTP/database/attempt limits and cancellation tests establish bounded local behavior, not measured production capacity. Compact writes avoid duplicating the event archive; observation digests and historical integrity replay still grow with match history. Saved advice validation checks the frozen original projection and returns the issued bytes; it does not rerun a policy or replace historical output.

The local bootstrap and chance factory currently serve only the three installed 52-card modes. Their fixed deck/dealer conventions do not establish the later non-card service conformance gate: move those conventions behind game-owned initialization/chance adapters before registering a different deck or non-card module. The generic lifecycle interface alone does not prove that full service path.

The next slice is **M04D: authored online demo and exact-target offers/access resolution**, followed by the complete platform envelope, existing-client adapters and actual three-mode browser acceptance. M04 remains open until those preserved-UI journeys pass. Review continuations, hosting, real identity/payments, Jev comparisons and human evaluation retain their later gates. Jev is **off**, with **0 live requests** and **no observed model**; no strategy-strength claim is made.
