# M11 provider fixtures and evaluation readiness

**Status: partial.** MG-11/MG-13–14 fixture and bounded development-readiness work passed. Strategic confirmation/promotion remains **blocked**: fresh evidence has **zero changed decisions**, no independent labels, no complete-match or unfamiliar-style study, and no promotion authority. No Jev/live-provider call was made; no current observed model is claimed.

## Implemented scope

- `providers/eligibility.ts` classifies the complete legal space. In the explicitly selected V2 adapter, Hearts' 286-choice pass phase returns `unsupported-action-space` before credentials, attempt admission or dispatch; it is never reduced to fit. Off/zero-cap/forced paths remain non-dispatching.
- `providers/diagnostics.ts` and the explicit `openrouter-v2.ts` adapter return known field categories for invalid fixtures. Arbitrary response values, unknown keys, error prose and secret canaries are excluded. V2 exports `selectWithJevV2` and `OPENROUTER_ADAPTER_VERSION = openrouter-decisions-2.0.0`; experiment and attempt-port version pins are mandatory, and outcomes/accounting records carry that pin. Original `openrouter.ts` is restored byte-for-byte to the frozen V1 oracle and remains the existing/default import. Only the new V2 fixtures select the successor; no runtime provider is activated. The retained V1 SQL smoke adapter still stores its original status/model/cost projection, so V2 needs a future explicitly versioned durable consumer before actual dispatch; this packet does not claim durable V2 category/version storage or a database migration.
- `evaluation/multi-game/manifest.ts` requires all named study decisions, immutable source/rule/policy hashes, objective/horizon, explicit family split, rotations/seats, environments and finite stop/compute limits. Confirmation refuses missing gain/harm/power/sample/multiplicity/authority, unsealed seeds and the current pending corpus. No study defaults or fictitious confirming manifest are supplied.
- `write-evaluation-readiness.ts` writes/checks source-hashed **development-only** manifests for Hearts Solo, Spades Solo and Spades Partners. Hearts/Solo are prepared baseline readiness only, without an executed changed-policy comparison. Tarneeb/Trix are rejected until their own profile gates.
- `direct-jev-packets.ts` defines new explicitly versioned J0 rules/own/public history/legal choices and J1 additional exact code facts. Neither accepts a local analysis/action, weight, case ranking or cue; both retain the complete legal set. Legacy SG-06 J0/J1 meanings and archived evidence remain unchanged. Unsupported Hearts pass returns no request.
- The new Go test package `server/internal/evaluation/partnerdevelopment` runs only under explicit opt-in, refuses an existing output directory and records every actor-safe packet/analysis/advice/action plus original hashes. Policy calls receive only `spades.Observe` projections; private engine state/deal seeds never enter reasoning. Normal runtime code/CLI, frozen 2.1 policy and historical archives are unchanged by this harness.

## Fresh bounded Go development evidence

One invocation, `development-001`: **8 deterministic fresh seed families, 16 complete paired hands, 896 accepted actor decisions**. Reference is frozen Go `spades-tactics-2.1.0`; candidate changes only seat 0 to `spades-partner-resource-5.0.0`; all other seats retain tactics 2.1. Both arms consume the same initial deal/dealer within each family and run their own complete trajectories. The SHA-256 counter/Fisher-Yates rejection generator is reproducible; seeds remain offline evaluation provenance.

**Actual result:** **0 changed candidate decisions; 0 offer activations; 1 conserve activation; 0 legal breaches; 0 bot/coach selection mismatches.** All hands completed; no censored or unused starts in this invocation. The one conserve case selected the same card as the frozen policy. No extra run or seed extension was made. This is a sparse activation/coverage result, not evidence of playing strength, full-match value or learning. Unknown human acceptable sets remain unreviewed. Do not transfer old SG per-hand/both-teammates thresholds to this single-seat development hand comparison.

`development-001/manifest.json` pins 50 actual source/toolchain files. An immediate post-run byte-hash check found **zero source changes**. `actor-decisions.jsonl` has 12,318,454 bytes and SHA-256 `1abb7ef75175113602d60226e985cac9721c11ebca83349f5ddba2361c6c8878`; the recorded results hash matches. Later code changes require a new run identity; preserve this original capture. Full archives combine actor trajectories and related arms and are private maintenance evidence, not a blind-review assignment. Future reviewer packets must withhold other seats, future history, seeds, answers and related arms until original labels freeze.

## Actual checks

The initial unsupported-action-space behavioral fixture failed with `Invalid provider candidate set.` before the narrow integration. A later TypeScript check found one `unknown` arithmetic narrowing issue in diagnostics; fixed before the final check. Bare `gofmt` was absent from PATH; the pinned native executable formatted the new test. Initial sandbox watchdog launch returned `spawn EPERM`; the authorized native escalation then passed. There was no approval rejection and no provider/DB dispatch.

```powershell
node --test --test-isolation=none web/server/tests/multi-game-evaluation.test.ts web/server/tests/provider-eligibility.test.ts web/server/tests/provider-diagnostics.test.ts web/server/tests/openrouter.test.ts web/server/tests/provider-ledger.test.ts web/server/tests/jev-offline.test.ts web/server/tests/gate-inference.test.ts web/server/tests/gate-rule.test.ts
node --test --test-isolation=none web/server/tests/direct-jev-packets.test.ts
node web/scripts/write-evaluation-readiness.ts
node web/scripts/write-evaluation-readiness.ts --check
node web/node_modules/typescript/bin/tsc -p web/tsconfig.server.json
$env:CARDFORD_PARTNER_DEVELOPMENT='1'
$env:CARDFORD_PARTNER_DEVELOPMENT_OUT='C:\repos\test-jev\qa\implementation\multi-game\m11\development-001'
node scripts/bounded-native-run.mjs --seconds=75 -- node scripts/windows-env.mjs go test ./server/internal/evaluation/partnerdevelopment -count=1 -timeout=65s -v
git diff --check
```

**Passed:** combined TS fixture/readiness run 63 tests (6.333 seconds), with **4 DB-ledger skips because `TEST_DATABASE_URL` was not provisioned**; separate direct-packet suite 2 tests; source-hashed readiness generation/check; server typecheck; pinned Go generator and complete-trajectory tests 2/2. Go test duration 3.082 seconds, fresh trajectory work 2.93 seconds; process-tree watchdog 4.938 seconds, no timeout/interruption/output cap. The harness had a 60-second cooperative cap, 65-second Go timeout and 75-second external watchdog, below the owner's 30-minute invocation ceiling. The original exhausted live smoke manifest/report and seed ledgers were not rewritten or resumed.

**Not run / remaining:** actual live Jev availability/model snapshot/usage, real DB provider-ledger tests, generic confirmation `run.ts` with durable run reservation and sealed-seed dispatch, independent human review/qualification, power/confirmation study decisions, unfamiliar teammate/opponent styles, new full-match comparison, default promotion and other game branches. The current label-index adapter explicitly cannot supply independently accepted labels; a later versioned adapter/corpus is required. Root owns M06 integration and M12 browser evidence. No commit created by this packet.

## Frozen-provider compatibility repair

The integrator's full Go acceptance found that modifying `openrouter.ts` violated the independent M04B oracle byte fingerprint even though its 6,380 policy comparisons passed in that separate run. This packet restored the provider from the original Git blob to exact SHA-256 `d0c3fa34f3e99a780b443f7789f982d17ae804d06ca77d5be72edddf909f852b`, matching the unchanged archived corpus. New behavior now resides in the intentionally separate `openrouter-v2.ts`; only the new M11 fixtures import `selectWithJevV2`. Original V1 tests/imports/default behavior and historical manifests remain unchanged. V2 requires the explicit adapter version on both experiment and attempt-port contracts, and emits it in outcomes/accounting; missing version pins fail before credential/admission work. No actual V2 provider call or durable V2 adapter was configured.

Actual repair checks:

```powershell
node --test --test-isolation=none web/server/tests/multi-game-evaluation.test.ts web/server/tests/provider-eligibility.test.ts web/server/tests/provider-diagnostics.test.ts web/server/tests/direct-jev-packets.test.ts web/server/tests/openrouter.test.ts
node web/node_modules/typescript/bin/tsc -p web/tsconfig.server.json
node --test --test-isolation=none web/server/tests/provider-eligibility.test.ts web/server/tests/provider-diagnostics.test.ts
node scripts/bounded-native-run.mjs --seconds=60 -- node scripts/windows-env.mjs go test ./server/internal/compatibility -run '^TestM04BOriginalSourceFingerprints$' -count=1 -timeout=45s -v
```

The first focused repair selection passed **25/25** (0.668 seconds) and server typecheck passed. After adding mandatory-version rejection coverage, the two new-adapter fixture files passed **5/5** (0.260 seconds). No DB/live calls or fresh-policy comparisons were run. The exact Go fingerprint check finished in 2.831 seconds under its watchdog but **failed** on `web/server/tests/module-contract.test.ts`; the provider mismatch was fixed. A read-only scan of all **251** archived source paths found five remaining mismatches: that M06 test plus `web/shared/contracts.schema.json`, `contracts.ts`, `openapi.json` and `validation.ts`; all other 246 paths match. Those shared-contract/test paths are outside this packet and were reported to the integrator for version-aware historical retention. No archived fingerprint was updated. `development-001` is untouched and does not depend on provider code.
