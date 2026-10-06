# Native Windows Spades diagnostic

Unchanged source: commit `064001a61e26338cc9209566fd63957c461c26f9`.
Tool: Go 1.27.1, Windows/amd64, installed at
`C:\repos\test-jev\.local\windows-tools\go\bin\go.exe`.
Executable SHA-256:
`d3ccdb604eafa6031133aefe1a3db24f0bb7362b857bc2125ac4e4c178b4b490`.
The diagnostic test executable was
`C:\repos\test-jev\.local\perf-audit\spades.test.exe`, SHA-256
`802f9ae71760a9c3e9d8192894b67913afe5caea4aaa9e26b8800ac833182060`.

These commands ran from `C:\repos\test-jev` through a normal, non-elevated
PowerShell tool invocation. Explicit overrides were `GOTOOLCHAIN=local` and
`GOCACHE=C:\repos\test-jev\.local\windows-tools\gocache`. No GC, preemption,
processor-count, profiling-rate or runtime-workaround flags were set. The
Spades test only needs standard-library dependencies.

```text
go test ./server/internal/games/spades -run ^TestFrozenCorpus$ -count=1
go test ./server/internal/games/spades -run ^TestFrozenCorpus$ -count=1 -memprofile .local/perf-audit/spades-alloc-only.pprof -o .local/perf-audit/spades.test.exe
go test ./server/internal/games/spades -run ^TestFrozenCorpus$ -count=1 -cpuprofile .local/perf-audit/spades-cpu-retry.pprof -memprofile .local/perf-audit/spades-alloc-retry.pprof -o .local/perf-audit/spades.test.exe
```

The unprofiled run passed (3.891 s reported by Go testing). Allocation-only
profiling passed (4.230 s). CPU-plus-allocation profiling failed twice inside
the Go runtime while scanning a parked goroutine's stack, with
`unexpected return pc for runtime.gopark called from 0x1` and
`fatal error: unknown caller pc`. The first CPU output was empty. The retry's
complete stdout/stderr is preserved in
`spades-go1271-cpu-profile-failure.log`. No successful CPU profile or benchmark
claim is made from either failed attempt.

The sampled allocation-only profile recorded 1,371.27 MiB cumulative allocation
and approximately 23.75 million objects. This is allocation churn, not live
memory or peak RSS. Reflection map/slice allocation, JSON decoder buffers and
temporary JSON values are the largest flat allocation sites; `checkShape`
accounts for 47.77% of sampled allocated objects cumulatively, and
`Decoder.Token` accounts for 35.57% cumulatively. Cumulative call-tree entries
can overlap and must not be summed as disjoint percentages.

This existing corpus unit test diagnoses the repeated boundary implementation.
It is not the matched-work benchmark: it includes assertions, round hashes and
its own projection schedule. The original M02A evidence remains untouched.
