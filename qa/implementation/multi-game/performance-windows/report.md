# Native Windows performance and toolchain review

6 October 2026 UTC (5 October Toronto). Starting revision `064001a61e26338cc9209566fd63957c461c26f9`. Requirements IMPL-02–04, MG-01–04/MG-09, SYS-01/02/12. This investigation precedes M03 and implements the owner's request for an equal-host comparison, performance review and a suitable native development environment.

## Finding and decision

The old result exposed a **costly implementation boundary**, not evidence that Go was the wrong backend language. Both original workers ran under Linux/WSL; they did not mix Windows Node with containerized Go. They did, however, perform substantially different internal work to produce matching outputs. The original 4,709.920 ms Go / 1,008.091 ms Node result remains historical and must not be compared directly with the new Windows timings.

Retain Go + PostgreSQL as the replacement direction and the working TypeScript service as the reference. Use native Windows for both runtimes now. [CR-ARCH-004](../../../../planning/decisions/CR-ARCH-004-native-windows-performance.md) records the architecture correction; [setup and exact commands](../../../../planning/implementation/multi-game/windows-development.md) are executable without WSL or Podman. No production backend or UI switch occurred.

## What needed correction

For the 420 Spades checkpoints and 418 transitions in the old facade, source inspection found:

| Repeated work | Original Go byte facade | New Go snapshot path |
|---|---:|---:|
| Strict full private-state JSON decoding | 5,878 | 2 initial imports |
| Semantic state/history validations | 6,298 | 420 |
| Public memory reconstruction per checkpoint | 8 | 4 |
| Separate projection/candidate legal enumerations per checkpoint | 12 | 4 |
| Complete frame serializations per checkpoint | 2 | 1 |

The old path fed about 72.2 MB through full private-state decoding while Node retained objects. Its JSON decoder checked tokens, recursively checked shapes and decoded typed values; repeatedly calling that boundary magnified reflection, allocation and history validation. The early native allocation-only diagnostic confirmed JSON/reflection churn, recording 1,371.27 MiB of cumulative allocations in the original Spades corpus test. That is a different diagnostic workload and **not** retained memory or the final benchmark.

The fix strictly imports external state once, keeps an immutable game-owned typed snapshot, clones on transition, validates the new state, and derives each actor's view/candidates from one observation. Exported bytes and arrays cannot mutate private state. Replay reuses one checked frame encoding. The HTTP/PostgreSQL slice uses one import, one transition, one export and two actor projections per accepted request, while retaining ownership, revision, identity, schema, cancellation and size checks.

Files are now read once per benchmark child, outside warm-job timing, with input preparation reported separately. The review found no evidence that disk I/O explained the old multi-second gap. Public generated DTO decoding can still repeat nested checks; that API was outside the old timed replay and was not weakened or rewritten speculatively.

## Toolchain control

The current native setup uses Node **24.19.0**, Go **1.26.8**, PostgreSQL **16.15**, and LLVM-MinGW **23.1.2** for the race detector. Tools and caches are project-local; the existing JavaScript lockfile, Go dependencies and `.env.local` are unchanged. PostgreSQL used a separate password-authenticated loopback cluster and `_test` database, then was stopped before replay timing. Clean stop/start was verified.

Go **1.27.1 was the latest stable release inspected**, so the original version number was not obsolete. It was insufficiently verified for this Windows workflow. Ordinary tests and an allocation-only profile passed, but CPU profiling caused runtime stack-scanning crashes. A control compiled the **same original source and fixture**, with the same compatible module minimum and flags, using both native compilers:

| Native compiler | CPU-profiled control |
|---|---|
| Go 1.27.1 | 3/3 runtime crashes, in addition to two earlier failures |
| Go 1.26.8 | 3/3 passes, plus an earlier successful CPU/allocation diagnostic |

[Control hashes and logs](toolchain/same-source-control.json) retain the evidence. [Go's release policy](https://go.dev/doc/devel/release) supports the previous major line. [Issue 81731](https://github.com/golang/go/issues/81731) reports similar Windows corruption; the local failure has not been proven to share that exact root cause. No preemption/GC workaround was applied. The wrapper enforces the selected version and `GOTOOLCHAIN=local`; a newer stable release must pass these Windows gates before replacing it.

## Native comparison

The [frozen protocol](protocol.md) runs all three variants sequentially on one Windows machine. Each measured child reads the same saved workload, runs three warmups and one measured job. Six repetitions cover all runtime-order permutations. Release binaries, workload and relevant source hashes are recorded. Tests, CPU profiling and allocation profiling do not run during timing.

Every job performs 419 transitions and emits 422 checkpoints with 1,688 observations, public views, candidate sets and public-schema checks. Original state, legal-action, observation, candidate and view hashes are checked separately at every checkpoint. Total emitted frames are 28,070,878 bytes in all variants. Only opening/pass Hearts is ported; the two Spades cases contain six complete hands. No strategy/provider work is timed.

Host: Windows `10.0.26200`, AMD Ryzen 9 5900HX, 16 logical CPUs, about 31.4 GiB RAM. [Raw six-run evidence and source hashes](benchmark.json), [compact calculated summary](summary.json), and [checkpoint verification](verification-native.json).

| Implementation | Warm job median (range) | CPU time median | Lifetime peak working set median |
|---|---:|---:|---:|
| Old Go facade, rebuilt on the selected toolchain | 9,304 ms (9,147–9,703) | 11,867 ms | 28.5 MiB |
| Revised Go typed snapshots | **679 ms (666–689)** | 844 ms | 26.2 MiB |
| Current Node reference | **1,239 ms (1,188–1,267)** | 1,351 ms | 160.3 MiB |

The typed Go path is **13.70× faster than its old facade** (92.70% lower warm wall time) on the same selected toolchain and native host. It takes 54.83% of current Node's time for this workload (Node/Go ratio 1.824). Source is unchanged throughout the series; all six samples are retained. CPU time includes all process threads and can exceed elapsed wall time. The legacy row is the old implementation under the new harness, including public-schema validation; it is not a reproduction of the old Linux experiment.

Input reading/JSON preparation medians are **5.21 ms for Go and 1.61 ms for Node**, measured outside each job. First-job medians are 9,065 ms / 703 ms / 1,293 ms respectively. These first jobs may use a warm OS file cache; they are not cold-disk tests. No disk-I/O rewrite is justified by these costs. Import/startup accounting remains separately available in the raw report.

These are **implementation comparisons with matching external obligations**. Current Node still runs its V1 compatibility readers: two semantic assertions, six JSON-copy traversals and two structured clones per Spades checkpoint, plus reducer/observation conversions. Optimized Go holds native typed state. The [protocol's internal-work table](protocol.md) makes that asymmetry explicit. Equal boundary counters do not establish equal algorithms or an intrinsic language-speed ranking. Lifetime peak working set includes imports and warmups; it is not per-request heap.

Separate [profile results](profiles.json), [calculated summary](profile-summary.json) and [raw profiles](profiles/) substantiate the source audit:

- Old Go: `Spades.DecodeState` accounts for **73.32% of sampled CPU** cumulatively and **85.35% of allocated bytes**. JSON shape checking, token parsing and reflection dominate its repeated boundary calls.
- Revised Go: public `GameView` validation is now the largest cumulative CPU component (**50.47%**, 1.08 sampled CPU-seconds across three warm jobs). It remains enabled; correctness checks were not removed to improve the score. Serialization is another visible cost.
- Separate cold/cumulative allocation captures drop from **3,072.4 MiB and 73.05 million objects** to **329.9 MiB and 5.22 million objects**, about **89.26% fewer allocated bytes**. These are cumulative allocations, not simultaneously retained memory; full allocation tracing is intentionally excluded from timing. Cumulative profile percentages overlap and must not be added.
- Node's whole-process V8 profile also shows the existing recursive JSON-copy helper and V1 conversion/validation costs. It includes imports and warmups, so its percentage distribution is not directly compared with Go's warm-only CPU capture.

This closes the demonstrated redundant-decoding defect. Consider schema-validator generation or further serialization changes only if the actual full-service budget requires them, with the same strict invalid-input corpus. Carry the remaining Node conversion overhead as reference-path debt; do not silently remove its safety checks or alter its role as the migration oracle.

## Verification and remaining work

[Verification and complete logs](verification.json): **493/493 Node tests** passed against native PostgreSQL; **406 Go test/subtest events across 46 top-level tests** passed both ordinarily and with the native race detector, with no failing or skipped tests. Two Go packages report no package-local test files; database behavior is exercised through HTTP tests. Go vet/module verification, generated contracts (99 definitions, 248 actual Ajv fixtures, nine RNG vectors), TypeScript typechecking and diff checks passed. A complete persisted Partners hand retains the original final checksum and byte outputs. The [independent code review](review.json) has no open findings; it caught and corrected CPU/allocation profiling contamination before measurement.

Original M02/M02A and strategy archives, frozen fixtures, rules/default policies, migrations, generated contracts and UI sources are unchanged. No browser rerun was needed for these backend/tooling changes. Jev is off; no model or provider spend, human labels or strength claims were introduced.

Next is **M03 durable records and replay anchors**, carrying the strict-import/typed-state boundary forward. M03–M06 still need complete Hearts/policy ports, compact snapshots and append-only history, maximum-history measurements, full HTTP/SQL/client journeys and bounded concurrency/cancellation evidence. Six replay samples do not establish application p95, capacity, strategy quality, or justify hosting/infrastructure work.
