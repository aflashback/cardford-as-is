# M05 scoped runtime evidence

Date: 2026-10-06. Source base: `b822d0d`, with this slice uncommitted in the shared checkout. Native Windows x64, project-pinned Go 1.26.8 and Node 24.19.0 via `scripts/windows-env.mjs`. Jev remains off; no model was observed or called.

The actor-only runtime and optional installation pass focused checks. Real asynchronous HTTP/database acceptance now covers Spades bids, saved help and restart, and a four-actor Hearts sealed pass. Browser operation is owned by the parent integration lane. No strategy improvement or learning claim follows from these checks.

## Requirement evidence

| Requirement | Implemented and observed |
|---|---|
| MG-07 actor information | Generic and concrete indistinguishable-world tests; actual distinct Hearts/Partners synthetic deals give identical permitted root inputs and choices under fixed seed. Policies have no world parameter. |
| MG-07 chronology | Partner private event excluded, later reveal excluded from earlier memory, later reconstruction includes the reveal, and returned memory cannot mutate the original events. |
| MG-08 feasible worlds and beliefs | Positive finite support enforced; bounded sampler exactly matches retained seeded holdings for late play in all three modes. Synthetic Hearts exchange memories pass the production state validator. |
| MG-08 horizon/payoff | Production reducers finish all candidate branches; complete round scoring; fresh next-round chance; explicit two-round unfinished-match score cutoff. Generic round continuation preserves accumulated values. |
| SYS-02 budgets | Terminal roots, candidate cap, sampler/setup/memory limits, next-world exhaustion, incomplete paired-world exclusion and bounded automatic loops. Work is charged before its cap is exceeded. |
| SYS-08 interruption | Setup cancellation, expired deadline, sampler cancellation checkpoints and explicit status. Online runner admission classes require a deadline. Real async service execution completed under exact registered deadlines; existing durable canceled and late attempt publication regressions passed. |
| SYS-12 local resources | Focused and actual HTTP/database preparation timings recorded. Exact rollout tuples alone receive 90s execution / 95s lease limits; originals retain 20s / 25s with 30s maximum claims. Observed RSS/GC, long-history capacity and load claims remain unverified by this slice. |

## Actual red checks and corrections

The first pinned runner command failed six tests with `M05 actor-scoped runner not implemented`. The next memory/adapter command failed the two knowledge tests and all three concrete mode subtests with their explicit missing-behavior errors. The initial sandbox invocation could not spawn the pinned Go executable (`EPERM`); rerunning through authorized native execution established the real red tests.

During integration testing, a Spades failure exposed a shared pointer in the adapter's cached public projection across root branches. Refresh now decodes into a fresh observation; the complete multi-candidate test passes. A late-play Hearts failure (`noncanonical Hearts cards`) exposed unsorted reconstructed pass memories. Canonical sorting fixed that boundary; the production decoder and sampler parity tests now pass. Neither defect required changing a production rule or retained policy.

Optional installation and operational-limit tests first failed against explicit unimplemented functions. A saved-result tampering test then found that changing the public selected estimate could escape the first metadata validator; validation now requires the public estimate to equal the selected full private paired result. The complete ten-case tampering test is green.

## Passed commands

```powershell
node scripts/windows-env.mjs go test ./server/internal/strategy/... ./server/internal/games/cardcontinuation -json -count=1 -timeout=5m

node scripts/windows-env.mjs node --test --test-timeout=300000 --test-isolation=none web/server/tests/world-sampler-parity.test.ts web/server/tests/spades-playout-kernel.test.ts web/server/tests/spades-playout-model.test.ts web/server/tests/spades-playout-budget.test.ts
```

The final Go run passed **17 top-level tests / 30 cases including subtests**, with zero failed, skipped or timed-out tests. Machine-readable output: [focused-go.jsonl](focused-go.jsonl). Package times were knowledge 0.358 s, rollout 0.596 s and concrete adapters 14.985 s. Full one-world initial candidate comparisons took 0.54 s for Spades Solo, 0.51 s for Spades Partners and 12.94 s for Hearts (286 passes). These are focused fixture observations, not production latency percentiles.

The four untouched TypeScript reference files passed **19/19 tests**, zero failures/skips/cancellations, in 5000.8145 ms. Their existing optimized-kernel legality/scoring, uniform sampling and pinned budget checks remain green. Full suites were intentionally not run. Every follow-up invocation uses a native process-tree watchdog of at most three minutes.

Late-play paired work examples from the final run: one world/two root candidates/20 steps; Hearts 92 sampler and 182 setup units, reservation 71,508,096 bytes; both Spades modes 33 sampler and 182 setup units, reservation 71,557,248 bytes. These tests invoke the generic runner directly; the public convenience adapter adds its two explicit metadata/model setup units.

## Final installation and compatibility checks

```powershell
node scripts/bounded-native-run.mjs --seconds=180 -- node scripts/windows-env.mjs go test ./server/internal/strategy/... ./server/internal/games/cardcontinuation -json -count=1 -timeout=165s
node scripts/bounded-native-run.mjs --seconds=180 -- node scripts/windows-env.mjs go test ./server/internal/records ./server/internal/compatibility ./server/internal/service -run '^(TestExactPolicyOperationalLimitsKeepOriginalLeaseBound|TestOperationalLimitsRejectUnboundedAndUnknownPolicies|TestPolicyOnlyOperationalAdmissionRequiresConsistentExactRegistrations|TestM04CCompletePreparationOriginalOracle|TestSchedulerBoundsDedupAndCancellation|TestSchedulerRegisteredDeadlineRemainsBoundedAndCancelable)$' -json -count=1 -timeout=165s
```

The final runtime/install run passed **22 top-level tests / 48 cases including subtests**, zero failures/skips/timeouts. Package times: knowledge 0.261s, rollout 0.265s, adapters 14.942s, installation 31.041s; whole invocation 33.723s. [Full JSON output](integration-go.jsonl) includes the watchdog receipt. Installation covers all three modes, optional/repeated selection, canceled work producing no decision, ten metadata tampering cases and saved-policy execution after restoring original new-session defaults.

The second invocation passed **6 top-level tests / 11 cases including subtests**, zero failures/skips/timeouts, in 4.340s. [Full JSON output](compatibility-limits-go.jsonl) records exact policy/budget isolation, conflicting module limits, scheduler cancellation, and the independent original TypeScript hash oracle for analysis/advice/help levels (0.86s). The latter verifies more than 150 historical decisions across the five retained cue streams. Scoped `git diff --check` passed.

## Actual service acceptance

The new tests live in `server/internal/service/actor_rollout_test.go` and use the real authenticated HTTP routes, native isolated PostgreSQL fixture, normal private shuffles, asynchronous scheduler and strict persisted reader. No policy result is fabricated.

```powershell
node scripts/bounded-native-run.mjs --seconds=180 -- node scripts/windows-env.mjs go test ./server/internal/service -run '^TestM05ActorRolloutAsyncServicePersistenceAndRestart$' -v -count=1 -timeout=165s
node scripts/bounded-native-run.mjs --seconds=180 -- node scripts/windows-env.mjs go test ./server/internal/service -run '^TestM05ActorRolloutHeartsSealedFourActors$' -v -count=1 -timeout=165s
node scripts/bounded-native-run.mjs --seconds=180 -- node scripts/windows-env.mjs go test ./server/internal/records -run '^TestM03Work(TwoInstancesReclaimAndImmutableReceipt|FiniteExpiryRequeueAndCancel)$' -v -count=1 -timeout=165s
```

- Spades passed in **6.78s** (whole invocation 12.070s): three actual bot bids, human analysis and accepted bid, saved level-3 help from the same original result, byte-identical help after fresh-codec service restart with original new-session defaults, and a newly prepared saved-policy play after restart. Individual prepare waits were 1.218s, 1.123s, 1.023s, 1.127s and 0.799s.
- Hearts passed in **62.70s** (whole invocation 65.128s): all four sealed pass actors prepared complete two-world results in **59.574s**, persisted metadata validated, live revision stayed fixed while waiting, and one command atomically committed all four choices.
- Existing two-instance late/crashed-attempt and finite-expiry/cancel regressions passed in **0.99s / 1.04s**, package 2.417s (whole invocation 6.417s). The original 30-second lease maximum remains tested.

All three invocations exited zero, with no timeout, skip, watchdog interruption or output truncation. The DB lane was then released to the token-conformance integrator.

## Remaining acceptance and limitations

The final native CLI and actual Partners browser journey passed in [M12](../m12/status.md), including original saved advice, review continuation and next hand. Actor-rollout Hearts has real service acceptance above; no separate exhaustive Hearts browser journey is claimed. Full-round passing has a substantial observed local latency cost. Two worlds are a small, explicitly experimental comparison; no confidence/calibration is invented. Original pins/defaults remain unchanged. Completed decisions retain full aggregate reasoning/work/provenance; canceled/incomplete work saves terminal work status, while detailed partial results remain an in-process diagnostic rather than a separately persisted failed-work report. Human review, Jev comparisons, learning evidence, hosted execution and large-load capacity are unrun.
