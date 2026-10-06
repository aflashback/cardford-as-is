# M02A — portable contracts and Go/PostgreSQL slice

**Passed for the bounded M02A scope; proceed with Go + PostgreSQL to M03.** Starting commit `b476914`, branch `codex/current-game-modules-m02`. The owner's next-item instruction authorizes this implementation after the urgent repairs. [Execution contract](../../../../planning/implementation/multi-game/m02a-execution.md) · [portable semantics](../../../../planning/implementation/multi-game/portable-semantics.md) · [machine-readable verification](verification.json).

The current TypeScript app and React experience remain authoritative and byte-unchanged. This deliverable is an unexposed compatibility harness, not a replacement production server. No provider requests, Jev model, spend, human review, hosting changes or policy/default changes occurred.

## Verified behavior

| Gate | Executed result |
|---|---|
| Toolchain/dependencies | Go 1.27.1, standard `net/http`, pgx/v5 5.11.0, jsonschema/v6 6.0.3; root module `cardford`; exact `go.sum`; `go mod verify` passed. Official archive SHA-256 is frozen in the execution contract. |
| Public contracts | 99 generated definitions, 248 actual Ajv fixtures, strict byte/parser boundary, checked typed or opaque bindings. Generation drift checks passed; [contract detail](contracts/status.md). |
| Deterministic primitives | Exact original canonical bytes/digests on the documented supported domains, UTF-16 ordering/text hashing, binary64 rounding and uint32 RNG vectors; original command digest captured through the TS repository function. Unsupported legacy keys fail explicitly. |
| Frozen independent corpus | Exported all **687** original checkpoints across three modes/ten hands, actual deals/commands and recorded policy samples. Original fixture/final hashes unchanged. Export SHA-256 `d33fecab42e2fda9d53b60dcd1341aa12bf86d6b5f4dfcce835ee21e8f267b94`. |
| Go replay scope | **422 exact checkpoints**: 210 Solo, 210 Partners, two opening Hearts checkpoints. Private state, all four actor observations, complete legal actions, candidate order and public views match original hashes; every view validates against the active schema. Six complete Spades hands include collection and actual-deal redeal boundaries. |
| Hearts representative seam | All 286 opening pass candidates per actor; atomic four-seat passing, own pass memory and safe opening projections. Four original complete-hand scores and one moon boundary match. Later play/round continuation is explicitly unsupported in this Go module. |
| HTTP/PostgreSQL seam | Complete Partners hand: **69** persisted transitions; 56 player actions through strict HTTP handling plus 13 internal collections. Reloaded every checkpoint, revision increments exact, original first-hand golden matched. **349,462** cumulative state bytes and **63,913** player-response bytes; **457.312 ms** total local test wall time. These are fixture observations, not API percentiles. |
| Failure bounds | Invalid/duplicate/private fields, malformed stored state, identity/variant mismatch, ownership denial, stale revisions, concurrent publication, cancellation/stalled body and two-slot overload checks passed. No connection held during game computation. Disposable random schemas in the existing `_test` database were removed. |
| Reusable boundary | Injected registry keeps game rules out of the kernel; non-card counter fixture exercises the same facade. Fixed command/input/frame limits, streaming checkpoints, cooperative cancellation and admission tests passed. |
| Integrated checks | **388 passed test/subtest events across six tested packages; zero failed or skipped tests**. Two additional packages compile without standalone tests. `go vet ./server/...`, Go module verification, Go generation checks, corpus drift checks and existing TS contracts check passed. [Exact Go event stream](go-tests.jsonl). |

## Resource result and decision

Predeclared limits: at most 256 commands per replay, 1 MiB counted input, 256 KiB private checkpoint, 512 KiB whole emitted frame; two active jobs and no waiting queue per executor. Local replay target below 10 seconds and 256 MiB observed process RSS. HTTP/database contexts have two-second deadlines. These are cooperative/logical limits, not hard process memory/CPU containment or service-wide admission.

Five measured runs after one warmup, same Linux/WSL machine, Go 1.27.1 versus Node 24.19.0. Each run replays the same **419 transitions**, emits **422 checkpoints**, and produces the same final hashes and byte totals: **5,164,794** state bytes, **2,023,622** public-view bytes and **28,070,878** complete private-frame bytes. These cumulative frame bytes are test output, not one retained response or production payload.

| Observation per complete corpus run | Go compatibility slice | Optimized current Node facade |
|---|---:|---:|
| Wall time range | 4,614–4,826 ms | 987–1,041 ms |
| CPU time range, user + system | 5,471–5,741 ms | 1,030–1,076 ms |
| Observed process peak RSS | 12,568 KiB | 177,768 KiB |

Hardware: AMD Ryzen 9 5900HX, 16 logical CPUs, approximately 15.3 GiB visible RAM, Linux `6.18.33.2-microsoft-standard-WSL2`. Source manifest SHA-256: `227f4570d557b801c4143b687bdb110d0ebded6aa33dcd43b9a976d588082e5f`. `verification.json` binds exact source/dependency/migration hashes, raw samples and hardware.

Both implementations met the declared local budgets. **Go is slower in this prototype comparison.** It currently reparses/revalidates JSON at each facade entry, while the current Node path validates a checkpoint and uses trusted typed projections. Runtime/module initialization also differs; peak RSS includes it. This is evidence about these exact paths, not an isolated language-speed comparison. Profiling and reusing validated typed state are explicit M03/M05 follow-ups before production performance acceptance. The result supplies no reason to switch stacks now and no claim of superior Go throughput, capacity or strategy quality.

The replay measurement includes state validation, transitions and serialization but excludes database, strategy search and providers. The separate complete-hand HTTP/database fixture above supplies a bounded storage seam measurement; neither result measures the complete future service. Durable records, analysis execution and long-history growth remain later gates.

## Review, corrections and limits

Independent review found two concrete gaps, corrected before final verification: Hearts identity length now follows UTF-16 code units; HTTP rejects row/payload identity or variant mismatch before applying or publishing a transition. Regressions pass. Hearts scoring also checks next-leader continuity; it is independent scoring validation, not a complete historical follow-suit/reachability checker.

The first benchmark comparator mistakenly used the heavyweight M02 replay-validation harness. It was stopped; no timings from that attempt support this decision. The final comparator uses the installed optimized `game/index.ts`, game-owned observations and current active-state validation. The verifier also initially counted packages with no test files as skipped tests; it now distinguishes those package events from genuinely skipped tests. Earlier setup/syntax failures were corrected before the final passing run. No thresholds, original goldens or policy budgets were relaxed.

The race detector was **not run successfully**: this WSL toolchain lacks a C compiler/CGO support. Ordinary concurrent revision/admission tests passed. Rerun `go test -race ./server/...` in a compiler-equipped local/CI environment before service activation. No infrastructure installation was added for this check.

M02A deliberately leaves: full Hearts play, Go strategy/sampler/policy execution, complete platform/history schemas, prepared analysis and durable command receipts, real authentication/access/billing, full React replacement journeys, hard worker containment and production capacity unimplemented. Saved original policy choices are replay inputs, not proof of Go policy parity. JSON duplicate/surrogate rejection and limited legacy-key canonicalization require original readers or separately versioned migrations for unsupported historical values. See [contract limitations](contracts/status.md).

The six existing SQL migrations, original corpora/evidence, `web/`, JavaScript lockfiles, `.env.local`, and the unrelated `.claude/` were preserved. This turn did not rerun the entire Node/browser suite because no existing runtime/UI source changed; the prior urgent repair evidence remains historical, not relabeled as a new test run.

## Reproduce and continue

Install or select the frozen Go toolchain and Node 24, and supply only an isolated `TEST_DATABASE_URL` whose database ends `_test`. From the repository root on Linux:

```text
node --env-file=.local/m00-test.env scripts/m02a-verify.mjs
```

The script defaults to the verified ignored local Go path. Set `M02A_GO` for an existing Go 1.27.1 installation; generation uses its adjacent `gofmt`. It runs all Go checks, contract/corpus checks and builds the private benchmark binary. It creates no app listener. On this Windows host the same command ran via existing WSL with `.local/m02-linux-node/node-v24.19.0-linux-x64/bin/node`. Never use `npm run db:up` or redirect this harness at the saved application DB.

**Next: M03 durable platform records and replay anchors**, using the frozen Go/public contracts and preserved migrations. Define versioned session/decision/job records, compact active state and append-only history, immutable original analysis, command outcomes and publication fences before M04 activates the replacement service. Carry the urgent repair regressions forward. M05 bounded reasoning can proceed against the same contracts; human review and live Jev remain deferred.
