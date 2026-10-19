# Pause lifecycle capacity evidence and staging plan

15 October 2026. Target confirmed in the implementation conversation: **100,000 concurrent independent games, each with one human and three deterministic bots, across multiple servers.** This is not online multiplayer. PostgreSQL remains authoritative. Redis is deferred and may later serve as a transient cache; it is not part of this implementation or an assumed solution to the limits below.

Current evidence does **not** establish per-server capacity or a server count. The local service deliberately has small admission limits and process-local ownership. Staging capacity tests and infrastructure are later work. This packet supplies a bounded local records harness, source-grounded gaps, and the measurements needed for that later sizing exercise.

## Verification status

| Check | Current result |
|---|---|
| Read-only source audit of realtime, playback, scheduler, record store and outbox | Completed; findings below |
| `node --check qa/implementation/rally/pause-session-lifecycle/capacity/run.mjs` | Passed |
| Direct launcher rejection of `--games=129` | Passed before any database access |
| Overlay Go fixture formatting | Passed with pinned native `gofmt` |
| Lifecycle integration measurements | **Passed:** final 128-game/eight-client records workload; evidence below |
| Two-store expiry sweep fixture | **Passed:** 128 unique expired games, no duplicates, preserved game rows and cleared active pointers |
| HTTP/WS/bot per-server or 100,000-game capacity | **Not run; deferred staging work** |

The final report captures a stable records-package fingerprint and individual source/migration hashes **at measurement time**. Subsequent integration review added formatting and control/read-validity fixes; those later changes were not load-tested again. The source audit below describes the reviewed implementation, while quantitative results belong to the immutable captured snapshot. Two earlier 32-game records runs passed their assertions, but the first launcher could not assemble Go's chunked JSON output and the second intentionally rejected a changing source manifest. Those preliminary runs are not used for the quantitative results below. The launcher now assembles output chunks and rejects changes in measured records/migration inputs. Service files are context only because the harness does not compile/run the service; any changes to those during a run are reported separately.

Native child-process creation is restricted by the default execution sandbox here; the concrete bounded native test ran under its narrow approved command escalation. No infrastructure or large load was requested for this stage.

## Measured local result

[Final machine-readable evidence](evidence/2026-10-16T01-48-47-422Z-g128-c8.json), recorded at 01:48:47 UTC on 16 October / 21:48:47 Toronto on 15 October. Exact command:

```powershell
node scripts/windows-env.mjs node qa/implementation/rally/pause-session-lifecycle/capacity/run.mjs --games=128 --clients=8 --rounds=3
```

The command passed in 8.10 seconds, including native launcher, Go build/test and fixture cleanup. Setup of 128 independent identities/games took 1.06 seconds. Hardware reported AMD Ryzen 9 5900HX, 16 logical CPUs, Windows x64, approximately 31.4 GiB host RAM; Go 1.26.8, Node 24.19.0. This was a shared local machine, not a dedicated benchmark host.

| Actual observation | Result |
|---|---|
| New Resume latency, 128 operations | p50 5.46 ms, p95 12.85 ms, p99 102.14 ms |
| Increasing foreground renewals, three rounds of 128 | Per-round p99 2.81–3.64 ms; 35.65–38.16 ms burst wall time |
| Duplicate renewals, 128 operations | p99 2.92 ms; no deadline extension |
| Explicit pause or forced-late renewal, 128 operations | p99 8.02 ms; late renewal kept original lease deadline as pause origin |
| Repeated pause, 128 operations | p99 5.24 ms; no retention extension |
| Two competing expiry sweepers, batch size eight | 128 unique expiries, zero duplicates, 35 bounded calls, 120.75 ms drain wall time |
| Resume after expiry and expired-state reads | All 128 rejected resurrection and retained the typed expired outcome |
| Final database state | 128 game rows preserved, zero active pointers/running games/paused games/work rows; 576 service receipts and 1,024 outbox rows retained |
| SQL pools | Four connections maximum per store, two stores; 1,451 acquisitions total; 1,119 empty-pool acquisitions; zero canceled acquisitions; zero acquired connections after operations |
| Cumulative SQL acquisition duration | 2,266.27 ms across concurrent requests; this is accumulated acquisition time, not wall time or query execution time |
| Go test-process resources | Four goroutines before/after; heap allocated after GC 4,021,736 bytes vs 3,719,440 before; 16,231,152 total allocation bytes during stages; seven GC cycles |
| Entire isolated schema relation bytes | 4,980,736 bytes including fixture account/grant/history/receipt/outbox tables and index/schema overhead |

The expiry drain's arithmetic rate is about 1,060 games/second for this tiny burst. Fresh-renewal burst rates were about 3,354–3,591 records operations/second. Neither figure is sustained HTTP throughput, a PostgreSQL production limit, payload-purge throughput, or an estimate of servers needed. The fixture preserves historical payloads and creates no bot/coach work. SQL acquisition counts are not statement counts. The goroutine/heap snapshots and zero acquired connections are local observations, not proof of a long-running leak-free service or service worker cancellation.

## Repeatable isolated check

From `C:\repos\test-jev`:

```powershell
node scripts/windows-env.mjs node qa/implementation/rally/pause-session-lifecycle/capacity/run.mjs --games=32 --clients=4 --rounds=3
```

The existing native PostgreSQL cluster must already be available. The launcher does not start or stop the app or database. It requires a loopback `TEST_DATABASE_URL`, a database name ending `_test`, and a target different from the application database. The Go constructor additionally requires a random `m03_` test schema. Existing test cleanup drops only that schema after closing both pools. The launcher never prints credentials, and its reports contain no game IDs, owners, hands, cookies, lease tokens, or raw game payloads.

`pause_capacity_test.go.txt` is a Go test source file exposed to the existing records test package through `go -overlay`; no server file is created or overwritten. The test creates independent fixture identities/games and calls the actual records methods. It measures burst Resume, increasing and duplicate foreground renewals, explicit pause, late renewal, repeated pause, competing bounded expiry sweeps, Resume after expiry and expired-state reads. It checks zero acquired SQL connections after the calls, no work rows in this records-only fixture, preserved game rows, and lifecycle counts. Its deadlines are advanced only inside the random test schema. This is accelerated expiry correctness, not observation of real five-minute/one-hour clocks.

Bounds: 1–128 fixture games, 1–8 clients, 1–4 renewal rounds; 100-second Go timeout, 110-second launcher watchdog. Default is 32 games and four clients. Failures stop the run and do not produce a passing report. A skipped test cannot produce evidence. Measurements and SHA-256 source hashes are saved under `evidence/`. The source hashes matter because HEAD alone does not identify concurrent, uncommitted implementation changes.

No browser, HTTP listener, WebSocket, bot decision, coach job, public host, or manual-review game is exercised. No production CPU, WAL, network, service queue cancellation, or per-server throughput is measured. Operations are burst requests without the five-second client timer. Tiny percentile samples describe this fixture only; they are not production SLOs or extrapolations to 100,000 games.

## Current multi-instance blockers

These are observed in the local implementation, not speculative shortcomings in PostgreSQL or an assessment of a future cloud provider.

| Observed source | Consequence for multiple instances | Required production work |
|---|---|---|
| `service/realtime.go`: negotiation stores `streamId` only in a local `bindings` map; connect and snapshot require that map entry. | Negotiation on A followed by connect/snapshot on B fails. | A reviewed connection-routing design, including reconnect/instance drain; a managed push adapter is an option already deferred by CR-ARCH-005. |
| `records/realtime_outbox.go`: global competing consumers claim one undelivered event per owner; `service/realtime.go:publish` enumerates only local sockets and returns success even with zero local recipients. | B can claim and acknowledge an A-connected owner's event without delivering it. Sticky HTTP routing alone does not fix a global outbox consumer on B. | Route committed events to every relevant connection host, or an authorized shared fan-out adapter. Preserve owner sequence, reauthorization, gap recovery, and durable publication intent. |
| `service/bot_playback.go`: runner map, credentials, striped command locks, and wake channels are local; durable playback carries `instance_id`. | Command/work wakeups on another server do not wake the owning runner. The new implementation separates durable running permission from a resident runner and removes runners at human boundaries, but does not provide distributed ownership/routing. | Define game/runner ownership and routing, safe lease takeover/drain, cross-instance wake delivery, and honest restart semantics. Test remote reads/renewals/pauses without treating a foreign instance as dead. |
| `service/bot_playback.go`: `maxPlaybackRunners = 18`; `service/service.go`: live scheduler has two workers and 18 combined reservations; review scheduler has one worker/five reservations. | At most 18 locally admitted active runners and two simultaneous live preparations, independent of socket count. Human-wait games now release their runner; 18 is not a cap on all foreground games. Merely increasing caps can hide overload and enlarge latency. | Measure deterministic preparation cost, runner residence and queue time per mode; derive bounded admission from cores, memory, DB budget and deadlines. |
| `service/realtime.go`: 256 bindings/process, four per owner; negotiation rate map is local. | Local limits are not a global account/abuse policy. `ceil(100000/256)=391` is only socket-limit arithmetic, not a deployable server estimate. | Measured per-host connection and traffic limit, global admission policy and reconnection-storm controls. |
| `records/store.go`: pool defaults to four connections, maximum 16; bounded query/lock timeouts. | API/bot/renewal/sweep/outbox requests compete for a small shared pool. Increasing server count multiplies PostgreSQL backend connections. | Measure acquisition waits separately from query time; define global connection budget and pooling strategy. |
| `service/realtime.go`: outbox purge once/minute with limit 256; record retention ten minutes. | Each process can purge at most about 4.27 rows/second through this path, regardless of new event rate. A retention duration does not ensure bounded bytes if cleanup cannot keep up. | Independent measured cleanup throughput, lag/bytes alarms, safe bounded batches, and backpressure/admission. |
| `service/realtime.go`: publish composes and authorizes messages per local binding; `Next` reauthorizes again. | Database reads and serialization per event/binding compete with game writes; socket count alone misses the work. | Measure complete publication cost, message bytes, safe projection size, queue lag and slow-consumer behavior. |

The prior single-process contract is explicit: [CR-ARCH-005](../../../../../planning/decisions/CR-ARCH-005-local-realtime-and-server-bots.md), RT-10, leaves hosted adapters, infrastructure, and measured 100K concurrency open. Raising local constants or adding Redis would not resolve ownership/routing correctness.

Expiry sweep requirements: owner/access and playback locks must follow the same order as Resume/commit; every selected deadline must be rechecked under the final lock. Two sweepers must not double-expire, move the original pause deadline, or resurrect a phase. A foreign process ID is not proof that its owner is dead. Unrelated games must remain independently serviceable. Sweep failure must leave logical read/commit deadline checks intact, and outage recovery must use the original deadline rather than assigning a new retention window.

The final service separates its one-second indexed sweep from a shared local reaper scheduled every 500 ms. One one-second deadline bounds the whole local inspection pass, with 250-ms per-item reads and conservative cancellation of remaining contexts when the pass runs out of time. Paused/human-wait games have no per-game poller. This resolves the initial audit's serial sweep/reap coupling; the records harness does not exercise these service reapers. Staging still needs to measure full cancellation drain and CPU/admission release under admitted load and faults, rather than infer a p99 guarantee from timer constants.

## Workload and sizing model

Three bots per game means 300,000 **bot seats**, not 300,000 continuously occupied computations. Most trick play is sequential; registered sealed windows can admit several preparations and must be measured separately. Size for bot decisions per second, the measured CPU distribution of those decisions, human command rate, publication, SQL, and retained memory. Forced actions, automatic transitions, bidding/request phases, and expensive coach analysis require their own rates/costs.

Let:

- `N = 100000` concurrent human games; `f` is the fraction foreground/running or briefly held.
- `H` = measured seconds per full human-plus-bot action cycle; about three bot decisions per cycle is an illustrative trick-play approximation, not a guarantee across modes/phases.
- `D = 3 * N * f / H` bot decisions/second; measure actual D from representative traces.
- `c` = measured mean CPU milliseconds per bot preparation, with tail distributions tracked separately.
- `u` = target sustainable core utilization, for example an assumed `0.60` before measurement.
- Required bot CPU cores alone `>= D*c/(1000*u)`. This excludes API, projections, database clients, coach work, runtime/GC and failover reserve.

Illustrative arithmetic for `f=1` and the hypothetical utilization assumption above:

| Human-plus-bot cycle H | Bot decisions/s D | Cores if c=1 ms | Cores if c=5 ms | Cores if c=20 ms |
|---|---:|---:|---:|---:|
| 20 seconds | 15,000 | 25 | 125 | 500 |
| 10 seconds | 30,000 | 50 | 250 | 1,000 |
| 5 seconds | 60,000 | 100 | 500 | 2,000 |

These are **assumptions, not measurements or a hosting recommendation**. Preparation cost can vary materially by mode and decision complexity. Server bots can commit before browser animation completes, so a synchronized Resume can generate a sharper burst than steady human cadence suggests.

Foreground renewal alone is `N*f/5`: at `f=1`, 20,000 authenticated HTTP renewals/second before commands, snapshots or reconnects. Paused games should generate no renewals. Each successful renewal exercises authorization, a transaction, a row update and index/WAL effects; count actual SQL statements and bytes in dedicated staging rather than treating one HTTP request as one SQL statement.

That 20,000/s figure is policy arithmetic, not a benchmark. Later staging should compare the current interval with reviewed safe interval/coalescing candidates against the PostgreSQL write budget. A longer interval reduces average requests (`N*f/interval_seconds`) but also reduces retry opportunities inside the foreground lease, potentially increasing false pauses under latency/jitter. No interval or cache change is made here. Any coalescing proposal must preserve the monotonic sequence, original server deadline, durable generation/commit fence and conservative stop behavior; it cannot acknowledge an extension that the authoritative commit path cannot validate. Measure false pauses and deadline safety alongside requests, statements and WAL, and obtain a separately reviewed policy change before altering the running protocol.

For `K` equally loaded API/WS instances, initial steady-state estimates are `100000/K` sockets, `20000*f/K` renewals/s, and `D/K` bot decisions/s if bots remain colocated. A dedicated worker tier needs a separate ownership/credential design first. Required replicas are the ceiling of the largest measured constraint: sockets per host, HTTP throughput at latency target, bot CPU/queue budget, memory, network, and a shared DB budget. Then add the explicitly chosen availability reserve; for one-node-loss tolerance require `(K-1)*measured_safe_capacity >= target_peak`. A number derived only from CPU or open sockets is incomplete.

Use `ceil(simultaneously_admitted_runners/18)` only as local runner-cap arithmetic. It is incorrect to divide all 100,000 foreground games by 18, because human-wait games now have no resident runner. As an extreme synchronized burst, 100,000 games all requiring an admitted runner at the same instant would imply 5,556 processes under that unchanged cap before headroom; a production design should instead measure/bound the actual burst, queue and overload behavior. This is **not** a proposed architecture or server count.

Memory must include runner contexts/stacks, document and snapshot copies, deterministic search allocations, socket buffers, outbound queues, receipts/outbox and caches. The four-MiB queue cap is an upper bound, not allocated memory per healthy socket; if 100,000 consumers actually accumulated that amount, queued bytes alone would be about 391 GiB. Healthy message sizes/queues must be measured, with slow-consumer closure tested. Paused SQL rows do not require one resident runner/socket each.

Outbox storage is approximately `event_rate * retained_seconds * measured_row_and_index_bytes`, plus cleanup lag and WAL. At an illustrative 30,000 events/s, a ten-minute retained window contains 18 million events before lag. Bot decisions can generate more than one event. Current fixture relation sizes cannot stand in for this workload.

## Later staging test and acceptance plan

No staging infrastructure is created by this change. Before a server-count estimate, resolve the routing/ownership blockers above and specify the hardware, PostgreSQL sizing, connection budget, production identity, TLS and workload policy.

1. **Profile deterministic work.** Replay pinned representative decisions for all seven modes, separately measure bot vs coach, forced vs branching, trick/request/bid/round boundaries, and maximum supported history. Capture process CPU, allocations/GC, peak RSS and p50/p95/p99 service time. Preserve reproducible seeds/input classes without leaking private data to operational telemetry.
2. **Measure one API/WS server end to end.** Use isolated staging identities/games, controlled clients and pacing, live authenticated sockets, five-second jittered renewals, real game writes and publication. Increase the load in bounded steps until the chosen latency, errors, pool waits, queue, CPU/RSS, network or cleanup-lag gate is hit; report the highest sustained passing step. Record the exact mix, machine and duration. Do not run a 100K load first.
3. **Separate idle presence and active work.** Measure connected idle/human-thinking, running bot-heavy, temporarily held, paused/disconnected and returning groups. Paused-game checks must include zero per-game runner/work/renewal resources and shared-sweeper overhead separately. Include coach use and maximum public projection size rather than assuming every socket is idle.
4. **Validate at least two instances.** Route negotiation/connect/snapshot/HTTP renew/pause across hosts deliberately. Kill/drain a runner host; delay old workers; race two expiry sweepers with Resume/control changes. Prove no accepted bot transition after the durable fence, no duplicate commits/charges, original deadlines, owner isolation, and sequence/gap recovery. A single-node load result is insufficient even if its throughput is high.
5. **Apply faults and bursts.** Synchronized/resumed and jittered clients, websocket-only failure, HTTP-only failure, slow consumer, half-open connection, renewal loss near the 15-second deadline, database latency/outage, process restart, and an expiry backlog after outage. Measure false pauses, canceled-work drain and reconnect recovery. Keep rate limits and bounded overload responses enabled.
6. **Measure shared PostgreSQL.** Separate transaction/query execution, pool acquisition time, statement counts, connection peaks, row/index sizes, WAL bytes/s, checkpoints, dead tuples/vacuum, lock waits/deadlocks, outbox age/bytes and expiry/purge throughput. Use an isolated dedicated cluster for WAL/CPU measurements; shared local cluster counters are contaminated by other work. Lifecycle logical expiry and payload cleanup are distinct costs.
7. **Estimate and validate a cluster.** Calculate replicas from measured sustainable per-host capacity, workload peak factors and an explicit failover margin. Test a representative multi-host slice with a shared database, then scale progressively. A soak must exceed the paid retention window and outbox retention/cleanup cycle; observe a real free five-minute and paid one-hour expiry. Choose an explicit maximum tolerable sweep lag and verify catch-up rate exceeds the largest admitted backlog arrival rate.

Acceptance report must include p95/p99 command/renewal/publication latency, actual safe operations/s and connections/server, bot/coach service times and concurrency, CPU/RSS, DB wait/WAL/lock behavior, false pause and stale commit counts, cancellation drain, expired/purged rows/s and oldest backlog age. Record failed/aborted steps and all not-run faults. Define numeric SLOs before running; do not select favorable thresholds after seeing the results.

The current bounded local harness can establish records-path invariants and provide regression measurements. It cannot supply the missing HTTP/WS or bot capacity numbers, prove release readiness, or justify an estimate of the number of production servers.
