# M06 trusted numeric-token conformance: scoped functional acceptance

This package is a test-only numeric-token fixture. Public application startup does not import or register it. Twenty distinct numeric tokens are assigned by explicit opaque `token-layout` chance to four seats. Each seat reveals one held token per cycle; the largest revealed token collects that cycle and opens the next. Five cycles finish the fixture. The competitor with the lowest collected total wins, with ties retained. Individual competition and neighbour teams `[0,1]` / `[2,3]` are supported. These rules belong to an explicitly installed test module; they make no public release or strategy claim.

`StartToken(config, material)` consumes module-owned raw JSON chance; empty material retains its chance node. `OpenToken` validates closed private state, conservation, owner-seat counts, public chronology, collectors and totals. `TokenSnapshot` implements the actual native `gamekernel.Snapshot` interface and exposes a lifecycle `Node`. Actor projections contain own tokens, public reveals/results, concealed counts and declared competitor partitions. Commands use explicit actor, automatic and chance cases without card/dealer/bid/trump fields.

The earlier [isolated check](../../../qa/implementation/multi-game/m04f/token-conformance.json) passed four top-level tests and two variant subtests in a 2.60-second native watchdog capture; Go package elapsed time was 0.267 seconds. It exercised detached immutable output, hidden-token ownership invariance, non-opposite competition, lowest-score results, strict rejection/corruption, opaque numeric chance and the actual native replay executor. It also checked the actual existing production catalog builder excludes `test-token`. That isolated check used no database or full suite. Source hashes were recorded after execution; this is not frozen-source milestone acceptance.

The M06 **non-card functional path passed** through actual service and browser integration. `TokenRegistry()` explicitly injects trusted compiled registrations into `records.NewServiceCodecWithRegistry` and the existing service constructor. Generated schemas include strictly closed numeric token packets, views, events, analysis and presentation. The real HTTP service test passed both variants through asynchronous preparation, all 25 transitions, PostgreSQL save/reload, two-instance receipt/lease recovery, stale revision rejection, authenticated foreign-principal denial and exact replay. Actual coach-advice unlock/preparation/poll/GET delivery also passed, preserving the saved schema and original bytes through replay. No application startup imports this package; TestOnly installations never enter the public catalog. The legacy `SnapshotModule.Start(config, []string)` bootstrap intentionally rejects tokens instead of fabricating cards; actual service/record replay uses opaque material.

The integrated seams share one trusted compiled registration across sessions, service catalog and records:

- Exact module pin/descriptor, game-owned metadata/policy/competition, and `Start(config, material json.RawMessage)` / `Open(private)` factories.
- Opaque bootstrap and next-chance material adapters, with an additive persisted representation that preserves original readers/anchors.
- A closed installed public-contract/schema branch for token packets, views, events and analyses. No arbitrary validator or runtime code upload.
- Explicit test-only injection into actual service/store/client composition; the public constructor retains the current three-mode catalog.

Those hooks now exist. The additive `openingMaterial` anchor field is omitted for old card anchors, preserving their saved format. `HistoricalReader.ReplayStartMaterial` verifies opaque retired-reader replay without enabling new work. Exact game-owned competitor groups cannot be rewritten as Spades teams. Original default metadata, policy execution on resume/restart, and old anchor bytes passed focused compatibility tests.

The separate `web/src/api/tokenConformance.ts` React adapter renders genuine numeric reveal choices and adjacent teams. Four focused numeric/card-adapter checks passed, including private/mismatched input rejection and busy controls. The real Chrome journeys passed both variants: actual human buttons, asynchronous bot/automatic service commands, reload with retained lease/projection, revision 25 terminal results and lowest-score winners, then unchanged original saved advice and terminal reload. No API response was mocked and no private engine state was injected. The loopback fixture is a test binary with trusted nonce-protected grant provisioning; normal startup never imports its routes or token module. Its schema was cleaned after the browser exited.

Optional token planner/provider and configured commercial offer conformance remain unsupported/unexercised; no such capability is advertised. Card-oriented historical review UI remains a compatibility adapter; exact numeric persisted replay is verified independently. This scoped fixture acceptance is not whole-product release acceptance. Demo first-legal output makes no strategic claim; provider off, zero model requests.

Bounded focused commands (PostgreSQL must already be available for the last command):

```powershell
node scripts/bounded-native-run.mjs --seconds=60 -- node scripts/windows-env.mjs go test ./server/internal/conformance ./server/internal/records -run '^(TestTokenInstalledPersistencePreparationAndReplay|TestNewSessionSelectionPreservesOriginalResumeAndAnchor|TestDefaultNewMetadataIsFrozen)$' -count=1 -timeout=30s
node scripts/bounded-native-run.mjs --seconds=60 -- node --test web/tests/token-conformance.test.ts web/tests/presentation.test.ts
node scripts/bounded-native-run.mjs --seconds=180 -- node scripts/windows-env.mjs go test ./server/internal/service -run '^TestM06TokenActualServiceOwnershipRecoveryAndNonCardLifecycle$' -count=1 -timeout=150s -v
node scripts/bounded-native-run.mjs --seconds=180 -- node scripts/windows-env.mjs node qa/implementation/multi-game/m06/browser-smoke.mjs
```

See [current M06 evidence](../../../qa/implementation/multi-game/m06/evidence.md), superseding the earlier isolated preparation capture in scope. No full/race/release suite ran. Each invocation is bounded below the owner's 30-minute ceiling; the browser harness completed in 21.39 seconds. Correctness timings do not establish production performance or strategy quality.
