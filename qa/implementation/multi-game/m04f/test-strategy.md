# M04F test cost and developer checks

The long runs have real safeguards, but repeating the complete acceptance bundle after each edit is unnecessarily expensive. The retained M04E captures put the full normal server suite at **364.28 seconds**, the race-short server suite at **1,168.31 seconds**, and all 16 final acceptance captures at **2,168.81 seconds (36.15 minutes)**. Those are recorded local wall times, including wrapper/build overhead, rather than predictions for another run or production performance measurements.

The [cost audit](test-costs.json) verifies the preserved output hashes and derives package/test times from actual JSONL events. It does not run a new database check or suite. The original M04E runner, evidence, tests and requirements remain unchanged.

## What consumed the time

| Package | Normal seconds | Race-short seconds |
|---|---:|---:|
| records | 213.098 | 344.194 |
| compatibility | 51.609 | 332.020 |
| service | 64.423 | 278.267 |
| Spades rules/snapshot | 14.436 | 105.195 |

The original runner deliberately uses `-p=1` and `-count=1`: packages execute serially and successful test results cannot come from Go's test-result cache. Go's compilation cache still applies. Serial database execution is retained here because the prior native PostgreSQL incident is unresolved; increasing package parallelism would change contention while diagnosing it.

`-short` only skips tests that explicitly consult `testing.Short()`. It does not make the remaining parity, lifecycle or fixture construction checks small. Under race instrumentation the terminal fixture builder consumed **169.63 seconds**, the three-mode service/recovery check **139.53 seconds**, and policy/advice parity **137.44 seconds**. Pure compatibility plus Spades rules/snapshot packages consumed **437.22 race seconds**. These tests are meaningful for immutable state, policy and replay compatibility, but repeatedly instrumenting their long deterministic corpora is a poor default for unrelated edits. The complete race-short suite remains an explicit release gate.

The normal suite's largest test, store chance/checkpoint/hand growth, consumed **108.90 seconds**. It tests actual persistence growth and should run after history/resource changes and at milestone verification; a smaller iteration check cannot replace it.

The first-candidate and coached normal-random browser attempts took **1,600.20** and **1,837.20 seconds** of complete harness wall time. Both left Solo incomplete and Partners unrun. Their inner command-loop bound excludes earlier Hearts/setup time. Together they cost **57.29 minutes** without closing three-mode match/resource acceptance. Some browser attempts exposed useful defects, so their elapsed time is not all waste. Repeating the same long driver before changing or measuring the history paths, however, supplies little new evidence. Terminal fixture browser acceptance took **56.99 seconds** with a deliberately narrower lifecycle claim. It does not replace normal match, coaching or resource evidence.

Do not add parent and child test times: they overlap. The machine-readable audit retains each top-level test and every package separately. This audit does not establish that history cost caused an older database failure, or that any policy is strategically strong.

## Developer commands

Run from the repository root. The [native selection runner](../../../../scripts/m04-focused-checks.mjs) has no default lane and rejects unknown options. Inspect selections without executing tests:

```powershell
node scripts/m04-focused-checks.mjs --list
node scripts/m04-focused-checks.mjs history --dry-run
node scripts/m04-focused-checks.mjs concurrency --dry-run
```

| Selection | Command | Use and limits |
|---|---|---|
| fast | `node scripts/m04-focused-checks.mjs fast` | All tests in 13 pure rule/projection/contract/kernel/coach/session packages; 98 top-level tests at initial validation. Uses Go's test-result cache. No database or UI acceptance. |
| history | `node scripts/m04-focused-checks.mjs history` | 19 named pure archive/replay, corruption, historical-reader and original-byte checks. Cache enabled. Excludes long growth, full preparation lifecycle and terminal fixture construction. |
| persistence | `node scripts/m04-focused-checks.mjs persistence` | Fresh targeted store, corruption, access, work, lease/revocation, historical advice, recovery/review and HTTP snapshot/identity tests; 65 initial top-level selections. Runs `-short`; selected long store-growth case explicitly skips. Does not cover all account/family/service journeys. |
| concurrency | `node scripts/m04-focused-checks.mjs concurrency` | Fresh race checks for 28 named concurrent/cancellation/admission/grant/work/receipt/revocation paths across five packages. Excludes deterministic parity/lifecycle corpora. It is focused race evidence, not the complete release race gate. |
| parity | `node scripts/m04-focused-checks.mjs parity` | All nine frozen compatibility tests with normal instrumentation. Cache enabled. Run when game/module/policy/codec boundaries change. |
| growth | `node scripts/m04-focused-checks.mjs growth` | Fresh normal runs of both long codec/store growth safeguards. No `-short` or `-race`. Run after changes to cumulative histories or checkpoint/replay storage. |
| release | `node scripts/m04-focused-checks.mjs release` | Fresh complete server normal suite, complete original race-short suite, then vet. Preserves the original gate semantics. Does not run builds, contracts, frontend, Node reference or browser acceptance. |

Use `--fresh` with `fast`, `history` or `parity` when fresh execution is required, for example `node scripts/m04-focused-checks.mjs history --fresh`. Cached success is suitable for unchanged deterministic iteration; it must be reported as cache-enabled, not as a fresh resource measurement.

Database selections require the isolated native test cluster already running. Start it explicitly only when needed:

```powershell
node scripts/windows-env.mjs pg:start
node scripts/m04-focused-checks.mjs persistence
```

The runner never starts PostgreSQL, changes product timeouts, uses WSL/Podman, downloads tools, or calls Jev. It delegates to the existing pinned native Windows wrapper and keeps Go's original ten-minute timeout per test binary, including release. Tests retain their owned temporary-schema cleanup and database identity fences. An absent/stopped database, an unexpected skip or a missing selected test fails the selection; it cannot become passing persistence evidence. The only selected persistence skip allowed is the existing `-short` store-growth case. Release permits precisely the existing Windows symlink, environment-gated terminal importer and race-short growth skips, recorded in its output.

Logs and manifests go to ignored `.local/m04-focused-checks/<timestamp>-<lane>/`, preserving prior acceptance captures. The manifest records exact commands, per-step elapsed time/exit status, source and harness SHA-256, output SHA-256, missing tests and unexpected skips. Source changes during execution fail the capture. Output is capped at 8 MiB per command and redacts the native local database password. Explicit tests are checked against declarations before execution so renamed tests do not silently disappear. Actual execution prints command/count summaries; `--dry-run` also prints every selected test. Generated pure check counts may grow with source changes; `--dry-run` is the current selection inventory.

## Checks for the next history/resource change

1. Begin with the [bounded replay profiler](profile-replay.mjs), which runs the implemented `BenchmarkM04FReplay` against the retained SHA-256-verified Solo archive. Use `node qa/implementation/multi-game/m04f/profile-replay.mjs before` before changing runtime code, then `node qa/implementation/multi-game/m04f/profile-replay.mjs after` after the narrow change. It uses `-run ^$ -bench ^BenchmarkM04FReplay$ -benchtime=3x -count=3 -benchmem -timeout=90s` with CPU/memory profiles, a 120-second wrapper bound and 4 MiB output cap. It refuses to overwrite an existing phase capture. Prefixes of one, three and five hands retain full replay/checkpoint validation. It excludes SQL, policy preparation and archive loading from timed loops; CPU profiles also include initial validation. It is a focused replay measurement, not a full request, match, historical-decision-read or production benchmark. No database startup is needed. Pair it with failure-time diagnostics when investigating the separate native database issue. Benchmarks are separate evidence from regression tests and exclude race instrumentation.
2. After a narrow change, run fresh `history`, the affected game package from `fast`, and normal `parity`. Preserve immutable branches, actor-safe projections, checkpoints, original historical decision bytes, strict corruption rejection and retired-reader restrictions.
3. For persistence/historical reader changes, run `persistence`; for shared memory, locks, worker/lease/control/receipt changes, also run `concurrency`. Run `growth` after cumulative-history work before calling that work accepted. Fix failures before broadening.
4. Once the milestone source is frozen, run `release` and all other required functional acceptance categories using the milestone capture directory. The original 16 M04E checks include generated contracts, frontend tests, typecheck/build, native/fixture builds, retained Node reference, boundary/edge fixtures, and three serial browser groups. A focused selection cannot stand in for those gates.
5. Revisit bounded normal Spades matches/resource evidence after profiling or implementation changes warrant it, with failure-time native database diagnostics. Preserve censored outcomes. Passing fixture acceptance, a green focused race run, or a faster benchmark does not authorize default Go activation or prove production capacity.

## Validation of this tooling

`node --check scripts/m04-focused-checks.mjs` passed. All seven selections passed `--dry-run` against declared tests: initially fast 98, history 19, persistence 65, concurrency 28, parity 9, growth 2, and release 215 top-level tests in each of its two complete runs plus vet. Later M04F tests may increase the automatic whole-package counts. Invalid/missing lanes and unsupported options are rejected. No database, full suite, browser match or benchmark was executed to validate this tooling. Actual capture/output-limit/child-shutdown behavior is implemented but not exercised by dry-run validation.
