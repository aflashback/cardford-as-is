# M03 durable PostgreSQL store evidence

6 October 2026. Base commit: `6310d6e`. Native Windows Go 1.26.8 and the project-local native PostgreSQL cluster; every new repository test uses a random `m03_` schema in the distinct `_test` database. Credentials were neither recorded nor printed. This is an unexposed private adapter; no production listener, provider call, UI activation, or rewrite of saved V1 games occurred.

## Implemented scope

`server/internal/records/store*.go` implements the durable store, strict checked load/save integration, atomic accepted command publication, current-read-authorized reconciliation, original decision/exposure reads, and replay verification. `007-versioned-platform-records.sql` is the only new canonical migration. The original six files retain the frozen SHA-256 pins. Go and Node share `schema_migrations(name,checksum)` and advisory lock `972701`; there is no second migration ledger.

- SYS-03/MG-03: untrusted stored document/event/command/anchor/decision bytes are decoded through closed private contracts and the installed game reader. Database-indexed ownership, revision, metadata, window and event bindings are compared to validated data. Loaded origins are privately retained and checked again during publication. SQL byte-size guards prevent oversized stored blobs from being transferred into the decoder.
- SYS-04/05/MG-05: accepted responses reconcile by owner, command identity and full versioned command-intent digest before new-work checks. Current read/privacy permission still applies. Reuse against another game or revision fails. Publication locks the owner before the game, then checks revision/window/original bytes, access/control generations, actual unit, grant terms and any issued prepared decision fence/expiry.
- SYS-06/MG-09: compact current snapshot, append-only events, immutable actual opening configuration/deal, actual later deal commands, per-command checkpoint hashes, original response bytes and allowance charge are committed together. Published work points to one canonical immutable decision row; acceptance links that same row. Exposure appends separately. Historical advice and analysis bytes retain their original formatting.
- SYS-07: pool acquisition, connection, SQL, lock and idle-transaction waits have finite limits. Engine decoding and transition work run without an acquired database connection. The adapter defaults to four connections, five-second query/operation waits and one-second lock waits; supported options remain bounded.
- SYS-10/MG-16: unavailable execution policies remain read-only through an installed compatible reader. Current control generation authorizes fresh work; original purchased unit-admission history permits finishing that actual unit after natural expiry, including a legitimate controller change. An expired grant cannot open the next hand, and revocation denies continuation.

## Executed red and repair evidence

1. `node scripts/windows-env.mjs go test ./server/internal/records -run TestM03CanonicalMigrationPins -count=1` first failed to compile with `undefined: ReadCanonicalMigrations`. The first sandboxed invocation could not spawn the native compiler (`EPERM`); the authorized native invocation produced the actual missing-implementation failure. The loader and seven-file pin check subsequently passed.
2. The first integrated store run rejected an invalid deterministic fixture deck (`T` instead of the contract's `10`). A later original-advice fixture was rejected because `AdviceView.source` requires `code`, `jev`, `forced` or `fallback`; the fixture now uses `code`, while its registered analysis remains explicitly `demo`. These were fixture defects, not evidence of runtime strategy behavior.
3. The first bounded-wait fixture used a 250 ms connection budget, which expired during native database startup before reaching its lock assertion. It now uses a one-second operation budget and a 50 ms lock wait; both deliberate lock contention and pool starvation settle within the asserted two-second ceiling.
4. After canonical window and prepared-work checks were added, fixtures using `bidding` instead of the actual `bid` phase and a one-minute lease exceeding the 30-second limit failed closed. Fixtures were corrected; the guards were retained.
5. The 25-hand growth test passed during a broader focused run whose separate prepared-work fixture still had that lease error. That broader invocation is **not** reported as an all-passing run.

## Executed passing checks

Commands run from the repository root through the native wrapper:

```powershell
node scripts/windows-env.mjs go test ./server/internal/records -run 'TestM03(Store|Canonical)' -short -count=1 -v
node scripts/windows-env.mjs go test ./server/internal/records -run 'TestM03Store(Expired|CPU|Readable|MalformedArchive)' -count=1 -v
node scripts/windows-env.mjs go test ./server/internal/records -run TestM03StoreCommandCapReservesIndependentAnchorBudget -count=1 -v
```

- First command: seven passing tests, with the separate long growth test intentionally skipped by `-short`; package time 7.630 s. Covers two repository instances, a fresh reopened store, one acceptance/one reconciliation/one charge, exact original advice, exposure retry, replaced-game history, privacy denial, changed-intent rejection, injected final-receipt failure with no partial snapshot/event/charge writes, malformed storage and substituted origins, unsupported-policy safe reads, real Node-to-Go and Go-to-Node migration adoption, checksum mismatch rejection, lock and pool bounds.
- Second command: four passing tests; package time 5.262 s. Covers a complete legal hand after natural grant expiry and controller change, denied next-hand/revoked-grant writes, game decoding with zero acquired pool connections, synthetic pre-publication limit checks, and deliberately corrupted event/checkpoint storage.
- Third command: one passing test; package time 2.949 s. Creates real accepted legal commands with insignificant JSON whitespace to place the stored command archive within 260 bytes of its 16 MiB cap. Replay still succeeds with the separately bounded immutable anchor. This specifically verifies that an accepted near-cap history cannot become unreadable because the anchor was double-counted against the command budget.

The integrator's final full Go, race and Node runs are recorded in the milestone status/evidence; the focused results above are not substitutes for those final checks.

## Native SQL growth and exact replay

`TestM03StoreReplayChanceCheckpointsAndHandGrowth` passed in 108.71 s in the executed growth run. It used legal deterministic Spades Partners play, bid 13 fixtures to keep the match running, a different actual recorded deck rotation for each later hand, two store instances, 1,749 accepted commands and 2,100 append-only events. Replay checked every accepted checkpoint and all 24 later actual draws, including explicit trick collection. The same archive also replayed with its execution policy unavailable through the supported read-only game reader.

| Completed hands | Revision | Compact document bytes | Event bytes | Command/receipt/checkpoint bytes | Stored payload total | Ordinary load bytes | Last command write bytes |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 69 | 3,066 | 14,014 | 22,766 | 41,357 | 17,080 | 3,522 |
| 10 | 699 | 3,075 | 142,607 | 234,854 | 382,047 | 145,682 | 3,536 |
| 25 | 1,749 | 3,077 | 360,164 | 589,934 | 954,686 | 363,241 | 3,543 |

These are encoded payload bytes measured from real SQL rows, not disk pages, WAL, network protocol overhead, index bytes or process RSS. Totals cover the game snapshot, immutable anchor, event records, command/response bytes and checkpoint hashes; they exclude access/work/account tables. The last command is a trick-collection transition, so this is a repeatable comparison rather than a universal maximum transition size. The test records run timing only for diagnostics; concurrent local verification means it is not a service-latency or capacity benchmark.

The compact hot writes remain bounded across hands. Ordinary reads increase with the exact preserved V1 event archive: those policy observations include all events. M03 loads that archive once at the explicit load boundary without replaying old commands on the ordinary load path. It does not claim constant-time reads, a new shortened policy input, strategy improvement, complete Hearts continuation, hosted capacity, or production activation. Event and command archives have explicit finite byte/count limits, checked before accepting growth.
