# CR-ARCH-004 — Native Windows toolchain and state boundaries

6 October 2026 UTC (5 October Toronto). Owner authority: investigate the faster Node result, review serialization/I/O, use an appropriate Go version, run both runtimes directly on the same Windows host, and settle/update the architecture before M03. Requirements: IMPL-02–04, MG-01–04/MG-09, SYS-01/02/12.

## Decision

Retain **Go + PostgreSQL** as the replacement backend direction, with the existing TypeScript app as the compatibility reference. The old M02A result is evidence about a deliberately strict JSON prototype, not a fair language-speed comparison or grounds for a Rust/Node switch. It compared the same outputs and used Linux/WSL for both workers, but Go repeatedly decoded, revalidated and projected state that Node kept as objects. The original report is preserved; the [native performance report](../../qa/implementation/multi-game/performance-windows/report.md) supersedes its architecture interpretation.

Use **native Windows x64 Node 24.19.0, Go 1.26.8 and PostgreSQL 16.15** for current development, diagnosis and comparisons. The root module and local wrapper pin Go; `GOTOOLCHAIN=local` forbids silent toolchain switching. No WSL/Podman step belongs in these commands. A later target-OS comparison must run both runtimes on that same target with the same protocol.

Go 1.27.1 was correctly identified as the latest stable release, but latest alone was an insufficient local acceptance criterion. Exact original source, flags, fixture and host passed three CPU-profiled runs on 1.26.8 and crashed in all three on 1.27.1. Ordinary 1.27.1 tests and allocation-only capture had passed. Pin the maintained 1.26.8 line until a later stable release passes profiling, race, contract and database checks on this host. The [release policy](https://go.dev/doc/devel/release) supports the previous major line. [Go issue 81731](https://github.com/golang/go/issues/81731) describes similar Windows stack corruption; matching symptoms do not prove an identical root cause. No runtime workaround or disabled preemption is used.

## Implementation boundary

1. Strictly decode and semantically validate **external** state at import/load. Public request schemas, duplicate-key rejection, surrogate/UTF-8 checks and closed private state remain enforced.
2. Inside a bounded operation, hold a game-owned, immutable **typed snapshot**. Apply clones private mutable fields and validates the resulting state once. No exported accessor returns mutable private state; no process-global snapshot cache or permissive decoder is introduced.
3. Build an actor observation once and derive its safe view and candidate IDs from that same result. Preserve player knowledge and sealed-choice boundaries. Export private state only at a real persistence/evidence boundary.
4. Encode each full evidence frame once, enforce the encoded byte cap, and reuse those bytes for hashing/output. The old byte facade remains a compatibility baseline; it must not become the hot loop of M03–M05.
5. Read frozen workload files outside warm-job timings, with their own preparation metric. Future service persistence still needs compact snapshots, append-only history, bounded history growth and revision fences; a JSON microbenchmark does not settle those database costs.

The additive snapshot path is exercised by replay and the unexposed Go HTTP/PostgreSQL seam. No production authority, frontend behavior, scoring, strategy defaults or historical advice changes. Full Hearts/policy/service ports remain future work.

## Evidence and limits

The native protocol verifies all 422 supported frozen checkpoints and measures 419 transitions, all four seats' observations/views/candidate IDs, strict public output checks, emitted frame bytes and hashing. Legacy Go is explicitly an unequal-internal-work baseline. Optimized Go and current Node perform the same declared boundary work; Node's V1 compatibility layer still performs additional cloning and validation internally. Report those differences instead of calling this intrinsic language speed.

Six sequential order permutations, equal warmups, release builds, exact hashes and separate cold/warm/input/CPU/working-set metrics control the local experiment. CPU and allocation profiles are separate diagnostics. Memory is lifetime Windows peak working set, not per-request heap. SQL, HTTP, policy/provider execution, long-history scaling, concurrency and hosted capacity are outside timed replay; their future gates remain required. Human review and live Jev remain deferred.

Affected plans: backend readiness, portable semantics, implementation entry points and SYS-12 measurement instructions. [Native setup](../implementation/multi-game/windows-development.md) replaces current WSL commands without rewriting historical M02/M02A evidence. Once this investigation's verification is complete, M03 durable records/replay remains the next implementation item.
