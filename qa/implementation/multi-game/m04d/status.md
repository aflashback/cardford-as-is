# M04D — Authored online demo and exact-target offers

6 October 2026 (Toronto). Starting commit `7639d22`; the delivery commit contains this report and its evidence. **Passed scoped local acceptance.** Requirements: MG-15 and the M04D backend portion of MG-16, retaining M04C's authentication, ownership, control, revision and idempotency checks. Full M04 remains open.

## Delivered behavior

- The same five authored demo frames and nine edges live in the Go server. Anonymous open/choice/replay uses the frozen DTOs, strict validation and `no-store`. The React demo waits for each response, keeps an inert last-confirmed frame on failure, retries the same request and rejects stale responses. No demo identity, game, provider, training or allowance work is created.
- The pure access resolver uses exact game/variant and tool, authoritative admissions/unlocks/usage, immutable verified grants and explicit server time. It selects one applicable grant by configured precedence; exhaustion cannot consume another offer's quota. Play and coaching remain independent, including coaching an owned unit after separate play permission expires.
- Forward migration 009 adds an explicit configured-identity flag and original coached-unit unlocks. It preserves legacy charges through a deterministic backfill. Automatic free grants, multi-target once-per-identity access trials, allowance spending and original receipts are durable. Concurrent retry, restart, replacement, expiry and security revocation retain their fences.
- Offer edits cannot reset an existing bucket/calendar or rewrite purchased terms. Disabled/removed free or trial scope blocks future admissions; recorded units and original unlocks follow their pinned continuation rule. Security revocation still overrides access, including the original grant behind saved advice.
- Bounded strict configuration rejects unsupported targets, tools, calendars and units. Current installed modes declare `hand`; storage supports UTC day and lifetime, with the frozen wire `grant` period explicitly mapped to lifetime. Week/month/non-UTC configuration is rejected.

The new `/api/access/offers`, `/api/access/resolve`, `/api/access/trials` and `/api/access/unlocks` contracts are separate from legacy `AccountView.offers`. Original root schemas, game implementations/policies, migrations 001–008 and earlier acceptance archives remain preserved.

## Local execution

```powershell
node scripts/windows-env.mjs pg:start
node scripts/windows-env.mjs npm run build
node scripts/windows-env.mjs go run ./server/cmd/cardford --migrations web/server/records/migrations --access-policy server/internal/access/launch.json --web web/dist
```

Open `http://127.0.0.1:4174/#demo`. The launch policy contains **no offers**. To exercise unlimited configured local practice through the API, explicitly select `server/internal/access/local-fixture.json`; these are fixture values, not chosen launch terms. Omitting `--access-policy` retains the separate M04C fixture harness. Identities cannot silently cross configured/fixture modes; logout remains available.

The optional `--web` serves only an explicitly selected bounded public build. Demo browser acceptance uses this single Go listener and the real React component. Normal Node gameplay remains the original service. Its demo endpoint is absent, so the updated component accurately reports that the online example is unavailable there. The complete practice/account client envelope and offer controls are M04E; this slice does not claim their activation.

## Verification

Final commands and source/output manifests are captured by [verify.mjs](verify.mjs). [Browser harness](browser-smoke.mjs) uses the separately compiled executable and frontend build, records their hashes, uses the isolated native `_test` database, refuses a preexisting schema, runs real-Go browser requests and cleans up only its own schema/processes. Successful demo responses are never mocked; explicit error fixtures exercise the unavailable state.

Commands below run after `node scripts/windows-env.mjs`. Native versions: Node 24.19.0, Go 1.26.8 and PostgreSQL 16.15. Final source manifest SHA-256: `d6d16ce00483071636ea7fe5b57ea126b0c52f8db73678d5c72460f1702e59e6`.

| Check | Native command | Result / evidence |
|---|---|---|
| Full Go/PostgreSQL | `go test -p=1 ./server/... -count=1 -json` | **1,336** passing tests/subtests, 18 tested packages, no failures; one platform skip; [manifest](go-full.json), [output](go-full-native.jsonl) |
| Native race detector | `go test -p=1 ./server/... -race -short -count=1 -json` | **1,334** passing tests/subtests, 18 tested packages, no failures; three documented skips; [manifest](go-race.json), [output](go-race-native.jsonl) |
| Static checks | `go vet ./server/...` | Passed; [manifest](go-vet.json) |
| Generated Go contracts | `node scripts/m02a-contracts.mjs --check` | **124 definitions, 298 actual Ajv fixtures, 9 RNG vectors**; [manifest](go-contracts.json) |
| Preserved and additive public bundles | `npm run contracts:check` | Passed; [manifest](public-contracts.json) |
| TypeScript | `npm run typecheck` | Passed; [manifest](typecheck.json) |
| Frontend build | `npm run build` | Passed; existing large-chunk warning retained; [manifest](build.json), [output](build-native.txt) |
| Go executable | `go build -o .local/m04d-cardford.exe ./server/cmd/cardford` | Passed; [manifest](go-build.json) |
| Real Go + React demo | `node qa/implementation/multi-game/m04d/browser-smoke.mjs` | **9/9**; all authored edges, failure/reconnect, delayed stale response, unavailable endpoint and actual invalid-request rejection; 15 persistence tables stayed empty; owned listener/schema cleaned up; [manifest](browser-smoke.json), [output](browser-smoke-native.txt) |
| Original import boundaries | `node qa/implementation/multi-game/m04b/generate-boundaries.ts --check` | **78 cases** reproduced; [manifest](boundary-check.json) |
| Numeric/Unicode boundaries | `node qa/implementation/multi-game/m04b/generate-edges.ts --check` | **21 cases** reproduced; [manifest](edge-check.json) |
| Preserved Node regressions | `node --test --test-isolation=none web/server/tests/module-parity.test.ts web/server/tests/hearts-module-validation.test.ts web/server/tests/coach-legacy-parity.test.ts web/server/tests/frozen-baseline.test.ts` | **32/32**, no failures/skips; [manifest](node-reference.json) |

`TestDemoWebRejectsSymlinkedBuildAsset` was skipped in both Go runs because this Windows session cannot create symlinks. The race run also intentionally skipped `TestRecordLongHistoryGrowth` and `TestM03StoreReplayChanceCheckpointsAndHandGrowth`; both passed in the normal run. `cmd/perf` has no test files and is excluded from the tested-package count. These are functional acceptance results, not Node/Go performance comparisons.

The [captured opening frame](online-authored-demo.png) retains the existing demo layout and content. Its SHA-256 is `90f52c90db4b1b56c07a02b4a2d8dc12f244db093982c23d1d9395fc6a0b440c`; it is a desktop snapshot, not broader responsive or accessibility acceptance.

[Integration review](review.md) records fixed findings and the retained native database failure. All twelve final checks passed against the same frozen source. [Delivery verification](verify-delivery.mjs) and its [result](delivery-checks.json) confirm source/output hashes, all **251** original reference sources, preserved prior evidence, documentation links and absent database credentials. Independent review findings are resolved within this scope; the separate native connection issue below remains open.

The [post-test database snapshot](database-after-tests.json) found no client backends or isolated test schemas. The inspection helper is [archived as text](database-snapshot.mjs.txt); restore it to `.local/m04d-db-snapshot.mjs` and run through the native wrapper to repeat the read-only check. The test-started [PostgreSQL instance was stopped](native-postgres-stop.txt), with [no listener remaining on port 54331](native-postgres-port-check.json). [Filesystem cleanup](filesystem-cleanup.json) removed this milestone's disposable executable, temporary helpers/logs and browser output after archiving the final evidence. Native tools, database data and earlier evidence remain.

## Remaining gates

The next slice is **M04E: complete platform response and preserved-client integration**, then actual three-mode browser journeys before full M04 activation. Configurable account availability/limits must use these server decisions during that cutover. Historical complete V1 platform records retain the original reader.

The native PostgreSQL connection-timeout cause remains unresolved. One preliminary M04D setup hit it after other serial tests passed; a focused rerun passed. Limits were not raised. A passing run establishes that run, not the cause or resolution of the earlier failure. Keep the operational follow-up open before full M04 activation.

This is bounded local acceptance, not measured production capacity or hosted identity/payment evidence. Jev remains **off**, with **0 live requests** and **no observed model**. Human reviews and strategy-strength evaluation remain deferred.
