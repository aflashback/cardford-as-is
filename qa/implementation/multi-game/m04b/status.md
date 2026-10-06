# M04B — Original policies and registered sessions

**Passed 6 October 2026 (Toronto).** Native Windows; Node 24.19.0, Go 1.26.8, PostgreSQL 16.15. Starting commit `e60324f`; the delivery commit contains this report and its source/evidence manifests. Requirements: the original-policy and session-interface prerequisites for MG-02/04/05/06/09 and SYS-03/06/10/12.

## Scope

The exact original Hearts and Spades default policies now have Go implementations, with game-owned coach rendering and the original help-level projection. The new generic `BoundSession` and concrete registered adapters supply immutable preparation, exact candidates and pins, atomic Hearts passing, automatic steps and distinct round confirmation/chance boundaries. The original V1 interfaces and histories remain separate.

Full M04 remains open. The TypeScript service and existing React UI remain active. This milestone does not expose a Go listener, activate the M03 test store, implement hosted infrastructure or claim stronger strategy.

## Independent reference evidence

- **107 original game streams:** the preserved 56-hand cue corpus, 48-hand frozen Spades policy corpus, and three saved multi-hand streams. The generator checks the old golden hashes before writing new expectations.
- **6,380 complete decisions**, including 1,282 forced actions: exact action, facts, reasons, candidate order, limitations, trace, coach advice and all three help levels. Another **25,392** no-decision advice envelopes are checked.
- **Five V2 game streams, 1,099 checkpoints and 888 preparations:** exact documents, lifecycle, private event suffixes, coached units, all four player views, eligible packets, registered analyses and input digests. Includes all Hearts pass directions, moon scoring, tied threshold, match completion and reopen at round/chance boundaries.
- **78 import-boundary cases** plus **21 numeric/Unicode cases**, generated from the original TypeScript reader rather than inferred from Go.

Reference generators refuse overwrite and support read-only `--check`. Full expectations and source fingerprints are in [reference-corpus.json](reference-corpus.json), with [boundary](boundary-corpus.json) and [edge](edge-corpus.json) cases. These are private test data; they are never imported by the application.

## Review and verification

[Review findings and limits](review.md). The initial missing-policy compilation failure is preserved in [initial-port-gap-native.txt](initial-port-gap-native.txt). The first full parity run passed in [first-parity-native.txt](first-parity-native.txt). Review then reproduced ten numeric/Unicode import discrepancies in [review-edges-initial-native.txt](review-edges-initial-native.txt); the final checks below confirm their correction. Independent final review found no remaining important defects within this milestone's scope.

All nine final acceptance captures exited **0**, with unchanged sources before/after each command and the same source-manifest SHA-256: `82f040c66df0f402fb824f7363d5e7f55c1aff31e8dd6834ec580ab4c36dbbe4`. Run each command below through `node scripts/windows-env.mjs`; [verify.mjs](verify.mjs) captures the exact command, source and output hashes.

| Check | Command after the native wrapper | Result / evidence |
|---|---|---|
| Full Go/PostgreSQL | `go test ./server/... -count=1 -json` | **862** passing tests/subtests, 14 packages, no failures/skips; [manifest](go-full.json), [output](go-full-native.jsonl) |
| Native race detector | `go test ./server/... -race -short -count=1 -json` | **860** passing tests/subtests, 14 packages, no failures; two expected short-mode skips; [manifest](go-race.json), [output](go-race-native.jsonl) |
| Go static checks | `go vet ./server/...` | Passed; [manifest](go-vet.json) |
| Go contract generation | `node scripts/m02a-contracts.mjs --check` | 99 definitions, 248 actual Ajv fixtures, 9 RNG vectors; [manifest](go-contracts.json) |
| Public contracts | `npm run contracts:check` | Generated artifacts current; [manifest](public-contracts.json) |
| Complete original oracle | `node qa/implementation/multi-game/m04b/generate-reference.ts --check` | Exact immutable corpus reproduced; [manifest](oracle-check.json) |
| Import boundaries | `node qa/implementation/multi-game/m04b/generate-boundaries.ts --check` | 78 cases reproduced; [manifest](boundary-check.json) |
| Numeric/Unicode boundaries | `node qa/implementation/multi-game/m04b/generate-edges.ts --check` | 21 cases reproduced; [manifest](edge-check.json) |
| Preserved Node regressions | `node --test --test-isolation=none web/server/tests/module-parity.test.ts web/server/tests/hearts-module-validation.test.ts web/server/tests/coach-legacy-parity.test.ts web/server/tests/frozen-baseline.test.ts` | **32/32**, no failures/skips; [manifest](node-reference.json), [output](node-reference-native.txt) |

The race run's two skips are `TestRecordLongHistoryGrowth` and `TestM03StoreReplayChanceCheckpointsAndHandGrowth`; both passed in the full normal run. The earlier M04A database timeout did not recur. These are acceptance runs, not a new performance comparison.

The earlier [oracle capture](oracle-check-pre-freeze.json) and [Node capture](node-reference-pre-freeze.json) passed their commands but observed a concurrent source change during final review. They are retained as pre-freeze evidence; only the later source-stable captures above establish acceptance.

[Delivery checks](delivery-checks.json) verify every captured source/output hash, documentation links, absent database credentials and unchanged original frontend/reference code, schemas, migrations, dependency locks and earlier evidence. Raw diagnostic logs retain their original formatting. [Database cleanup](database-after-tests.json) found no active clients or isolated test schemas; the test-started [native PostgreSQL was stopped](native-postgres-stop.txt), and port 54331 had no listener afterward. Temporary verification helpers are archived as text and removed from the ignored local work area.

## Remaining gates

M04C must connect authenticated ownership, control leases, exact policy/component/budget pins, full original analysis/advice and the V2 preparation result to durable prepared-work publication and receipt-first recovery. `PolicySupport` exposes only the two exact executable defaults; optional/unknown policies are unavailable for new Go execution, and original saved advice must not be rerendered through a fallback.

The M02 V2 document wrapper preserves its journal/audit metadata; it is not the M03 durable repository. Keep M03's test-store activation guard until service integration, historical readers and erasure are reviewed. The platform response/bootstrap contract, online demo, configurable access, existing UI adapters and real three-mode browser journeys still gate full M04 completion.

The original observation/history still grows with a match. This work removes unnecessary internal conversions/copies without claiming constant-size state or measured service capacity. The M04A native database cancellation/cleanup follow-up remains explicit. Jev is off, with **0 live requests** and **no observed model**. Human review and strength claims remain deferred.
