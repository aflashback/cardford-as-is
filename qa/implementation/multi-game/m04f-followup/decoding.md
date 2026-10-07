# Operation decoding follow-up

Starting at `b822d0d`, `sessions.DecodeOperation` first validated a closed typed operation and then strictly decoded the same bytes again. It now returns the typed value from that first complete validation. The historical journal calls the same internal decoder under its existing document/parser bounds; the public service decoder retains its separate 256 KiB limit. Every shape, participant, identifier, opaque chance-material, Unicode, duplicate-key and numeric check remains. No policy, schema, output pin, record reader or game behavior changed.

Native Windows, pinned Go 1.26.8, Ryzen 9 5900HX. The benchmark uses the same five fixed legal operation byte strings before and after, 100 ms per benchmark and three samples. Reported times are sample medians; this is decoder cost, not request latency or capacity.

| Operation | Before median | After median | Allocations before → after |
|---|---:|---:|---:|
| Actor | 20.128 µs | 10.662 µs | 273 → 137 |
| Sealed | 63.349 µs | 32.847 µs | 849 → 427 |
| Automatic | 16.143 µs | 8.044 µs | 206 → 104 |
| Chance, full recorded deck | 136.379 µs | 77.706 µs | 2,279 → 1,340 |
| Continue round | 10.031 µs | 5.423 µs | 131 → 66 |

The new behavior checks passed against the original implementation before editing and passed afterward. Final focused verification passed five named tests plus 19 subtests, covering unchanged operation values, input/output isolation, invalid shapes/semantics, the differing service/journal byte bounds, strict historical document import and all three game lifecycles. Package test time was 0.823 seconds. `git diff --check` passed.

Exact commands, input test source hashes, dependency/source hashes and output hashes are in [before](decoding-before.json) and [after](decoding-after.json); raw benchmark and regression output is alongside them. Each Go command used `-timeout=30m`; every run finished in seconds. No database, provider or full repository suite was run for this change. Jev remains off.
