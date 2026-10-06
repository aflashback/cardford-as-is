# M02A Spades and generic replay evidence

The Go Spades compatibility slice preserves the original V1 wire state and both
game modes through the untouched saved corpus. The package owns typed state,
legal bids/plays, independent collection, actual recorded redeals, Solo/Partners
scoring, actor-safe V1 observations and the existing public `GameView` projection.
The generic registry/replay package imports no game packages or rules.

Implemented scope: MG-01–04, MG-09 and the bounded M02A portion of SYS-01/SYS-02.
This is a local compatibility seam. No player route, hosted authority, strategy
policy, provider, UI or historical golden was changed by this package work.

## Passed

Pinned Go 1.27.1 on the existing WSL environment:

```sh
GOTOOLCHAIN=local .local/m02a-toolchain/go/bin/go test ./server/internal/games/spades ./server/internal/gamekernel -count=1 -json
GOTOOLCHAIN=local .local/m02a-toolchain/go/bin/go vet ./server/internal/games/spades ./server/internal/gamekernel
```

The executable output is [go-tests.jsonl](go-tests.jsonl). Both packages passed;
`go vet` exited zero. The Spades suite replays all **three Solo and three Partners
hands** in the immutable ten-hand, three-mode original corpus. For each mode,
168 accepted actions, 39 collection revisions and two actual recorded redeals
match every original round hash and final hash. These are recorded policy
choices, not a Go implementation or evaluation of that policy.

Other checks cover failed/successful Nil, double Nil, failed Nil contract-credit
exclusion, repeated bag penalties, team score identity, canonical legal order,
unbroken Spades and follow-suit constraints, separate fourth-card/collection
boundaries, and actor-view invariance after hidden-hand permutations. Corrupt
state tests include missing/unknown/duplicate/wrong-case fields, optional nulls,
null collections/scalars, tuple lengths, numeric ranges, card conservation,
illegal saved renounces, invented match winners and changed scoring.

The generic executor is exercised through a non-card counter module. Tests prove
pre-dispatch input/command rejection, initial/every-checkpoint size checks,
projection limits, cancellation between transitions and seat projections,
streamed evidence frames, visitor failure cleanup and two admission slots with
no waiting queue. It retains the current checkpoint rather than accumulating the
full replay. Callers may stream a private test-only callback; retaining those
frames outside the executor is explicitly outside its memory claim.

## Limits and remaining gates

The executor enforces a maximum of 256 transitions, 256 KiB private state, 512 KiB
per serialized frame, 1 MiB preflight input, four distinct observer seats and two
concurrent jobs. Cancellation is cooperative between bounded module operations;
it does not forcibly interrupt a reducer or impose process memory containment.
These checks are not a full analysis executor, hard CPU limit or app capacity
claim. Public schemas remain authoritative and the integration layer validates
`SafeView` against their generated schema validators.

Race-enabled tests were attempted and remain **blocked** in this environment:

```text
go test -race ./server/internal/games/spades ./server/internal/gamekernel -count=1
go: -race requires cgo; enable cgo by setting CGO_ENABLED=1
```

A follow-up `command -v gcc` found no installed C compiler. No compiler was
installed for this optional check. Concurrency behavior tests passed without
the race detector; that does not replace race-detector evidence.

The full original-policy port, exhaustive compatibility acceptance, durable
platform lifecycle, cancellation inside long CPU operations, browser/service
journeys and production activation remain M03–M06 work. No real provider was
called and no strategy-strength or human-learning result is claimed.
