# Native Windows development and measurement

6 October 2026 UTC (5 October Toronto). [CR-ARCH-004](../../decisions/CR-ARCH-004-native-windows-performance.md) supersedes the WSL toolchain instructions for current work. Historical M02/M02A evidence remains unchanged.

Use native Windows x64 for **both** Node and Go, from this checkout. The selected local stack is Node 24.19.0, Go 1.26.8, PostgreSQL 16.15 and LLVM-MinGW 23.1.2. Go 1.27.1 was the latest stable release inspected, but failed the same-source Windows CPU-profile control; 1.26.8 is the maintained previous line and passed that control. `GOTOOLCHAIN=local` prevents a module directive from silently selecting another Go installation. Upgrade only after repeating the Windows profiling, race, database and parity gates.

**6 October local-development decision:** native Windows is the default for M03 and subsequent local work, including application runs, database migrations, Node regression checks and Go tests. The owner left the environment choice open after the completed investigation. Existing Podman data is retained for deliberate recovery of older saved games; WSL/Podman is not required by this workflow. The [closeout inventory](../../../qa/implementation/multi-game/m03/comparison-closeout.json) records removed temporary comparison builds, controls, obsolete compilers and downloads. The checked-in results and reproduction source remain available.

The [tool manifest](../../../scripts/windows-tools.json) pins archives and SHA-256 values. Go and LLVM-MinGW hashes come from their publishers. PostgreSQL's hash records the official EDB HTTPS download; it is not an independently published vendor digest. Node 24.19.0 must already be installed natively. The wrapper verifies actual executable versions; no global PATH, Windows service, existing `.env.local`, saved-game database or package lock is changed. Tools, caches and the disposable cluster live under ignored `.local/`.

Run these from the repository in PowerShell:

```powershell
node scripts/windows-env.mjs setup
node scripts/windows-env.mjs status
node scripts/windows-env.mjs pg:start
node scripts/windows-env.mjs go test ./server/... -count=1
node scripts/windows-env.mjs go test -race -short ./server/... -count=1
node scripts/windows-env.mjs go vet ./server/...
node scripts/windows-env.mjs node --test --test-isolation=none web/tests/*.test.ts web/server/tests/*.test.ts
node scripts/windows-env.mjs npm run contracts:check
node scripts/windows-env.mjs node scripts/m02a-contracts.mjs --check
node scripts/windows-env.mjs npm run typecheck
```

`setup` checks installed executable versions and downloads only tools whose executables are missing. It verifies downloaded archive hashes before extraction. Download archives are disposable; deleting them does not trigger another download when the tool is already installed. Git for Windows curl is used when installed; otherwise Node HTTPS is used. The native C compiler is needed only for `-race`; ordinary tests/builds use `CGO_ENABLED=0`. A sandbox may require permission to launch native child executables; an `EPERM` launch error is not a failing application test.

Run these suites sequentially against the local database. The complete normal Go run includes the 100-hand codec and 25-hand SQL growth checks; `-race -short` skips only those long growth fixtures while retaining ordinary concurrency and recovery tests. Record the two skips explicitly. Suite duration is not a Node/Go comparison.

`pg:start` creates a separate, password-authenticated local cluster on **127.0.0.1:54331**, with `cardford_windows` and `cardford_windows_test`. It reuses only that recognized project cluster; it does not delete data. Credentials remain in ignored `.local/windows-postgres/credentials.json`, never in evidence. The wrapper provides `DATABASE_URL` and `TEST_DATABASE_URL` to child processes and selects local identity, fixture billing and Jev off. Go test stores still require `_test` and isolated `m03_` schemas. M04C adds a separate explicit local-service activation path: loopback PostgreSQL with the fixed `cardford_go_local` schema. Node tests apply the existing canonical migrations to the isolated test database. `pg:stop` stops only this project cluster. PostgreSQL is not needed during replay timings.

This recognized loopback cluster has no TLS listener. The wrapper explicitly sets `sslmode=disable` for its local URLs and `PGSSLMODE`; it never applies this setting to a remote database. A bounded M03 diagnostic confirmed that pgx's default TLS preference opened two TCP connections per session against this server, while explicit local mode opened one. This removes unnecessary fallback, without changing production database policy or relaxing operation timeouts. [Diagnostic evidence](../../../qa/implementation/multi-game/m03/native-db-setup.md).

M03 also encountered intermittent native TCP failures whose precise cause was not established. Preserve failure output and inspect local PostgreSQL/transport state if they recur; do not hide failures with retries or relax product timeouts. The final Node verification uses a fresh disposable test database after the checksum guard correctly rejected an earlier unpublished draft of migration 007. Committed migrations remain immutable; subsequent changes use a new forward migration. Development data was preserved.

Normal React gameplay and account controls still use the original TypeScript service. To run that app against the separate native development database, use `node scripts/windows-env.mjs npm run db:migrate`, then `node scripts/windows-env.mjs npm run dev`. Its online example accurately reports unavailable because the authored endpoint is implemented only in Go. Existing startup/Vite/game browser-test paths remain on Node until M04E's client cutover gate; the explicit Go demo path below is separate.

### M04C local Go API

The authenticated durable API has passed its scoped local-service acceptance; see [M04C evidence](../../../qa/implementation/multi-game/m04c/status.md). From the repository root, start the recognized native database and launch the separate API:

```powershell
node scripts/windows-env.mjs pg:start
node scripts/windows-env.mjs go run ./server/cmd/cardford --migrations web/server/records/migrations
```

The listener defaults to **http://127.0.0.1:4174** and serves the local API, without switching normal React gameplay. `--migrations` supplies the sole canonical migration directory; `CARDFORD_MIGRATIONS_DIR` is the environment alternative. Startup applies the checksum-checked sequence, including forward migrations 008 and 009, only in `cardford_go_local`. The original Node records are not migrated into Go sessions or rewritten.

The wrapper supplies explicit `APP_ENV=local`, `IDENTITY_MODE=local-test`, `BILLING_MODE=fixture` and `JEV_MODE=off`. The listener rejects hosted modes and non-loopback binding. Server-issued cookie identity, tab control and unlimited fixture grants are local development behavior, not hosted identity or commercial offer activation. A `PORT` override must have a matching `APP_ORIGIN` when that origin is set. Full original V1 platform history remains available through the original reader; no implicit V1/V2 conversion occurs.

Stop the API with Ctrl+C so requests, workers and its pool close. After finishing with all applications using this project cluster, stop PostgreSQL with `node scripts/windows-env.mjs pg:stop`; its data is retained. The [M04 sequence](m04-execution.md) records [M04D's scoped MG-15/MG-16 backend acceptance](../../../qa/implementation/multi-game/m04d/status.md), followed by M04E's complete platform/client integration and preserved three-mode journeys. The prior native PostgreSQL cause remains unresolved; a passing run does not close that follow-up.

### M04D online demo and configured offers

[M04D scoped acceptance](../../../qa/implementation/multi-game/m04d/status.md) passed for MG-15 and the MG-16 backend, including 9/9 real Go/React browser tests. The finite authored example uses `POST /api/demo/frame` and advances only after a validated server response. Build the existing React app, then explicitly serve it alongside Go for the public demo:

```powershell
node scripts/windows-env.mjs npm run build
node scripts/windows-env.mjs go run ./server/cmd/cardford --migrations web/server/records/migrations --access-policy server/internal/access/launch.json --web web/dist
```

Open [the local online example](http://127.0.0.1:4174/#demo). `--web web/dist` loads a bounded trusted build at startup; rebuild/restart after changing it. This path currently connects only the demo. Normal game/account views still require M04E adapters and the complete platform envelope.

The checked-in [launch policy](../../../server/internal/access/launch.json) deliberately has no offers, so it issues no play/coaching grant. To exercise selected server configuration locally, explicitly choose [local-fixture.json](../../../server/internal/access/local-fixture.json) instead. That file is a demonstration policy, with unlimited local advice coverage across the three current modes; it does not select launch values. Omitting `--access-policy` retains the M04C fixture constructor. Existing identity cookies are mode-bound; switching between fixture and configured modes rejects a mismatch instead of silently broadening access. Use a separate browser session for a deliberately different mode.

Configured grants are stored in the same separate Go schema with immutable original terms. UTC-day/lifetime calendars are supported; unsupported calendars fail startup validation. Access trials use their own once-per-identity ledger, independently of replay alternatives and Stripe trials. Live identity/payments/providers, full account UI, native packaging and hosting remain outside this local slice.

The Go/Node comparison is complete; these commands are retained for a future scoped investigation and are not part of routine milestone verification. For a new comparison, freeze source, stop compilers/tests/profilers, then run sequentially:

```powershell
node scripts/windows-env.mjs benchmark --out=.local/performance-windows/recheck
node scripts/windows-env.mjs profiles --out=.local/performance-windows/recheck
node scripts/windows-env.mjs pg:stop
```

Use a new evidence destination for a new measurement; never overwrite the checked-in experiment. The [protocol](../../../qa/implementation/multi-game/performance-windows/protocol.md) defines the exact replay workload and boundaries. `--verify-only` checks all original checkpoint hashes. The full run checks native OS/version/path, source/workload hashes, sequential order, equal warmup counts, work counters and output parity. Go CPU and allocation diagnostics use separate processes; Node CPU profiling includes imports and is labeled accordingly. Whole-suite test durations are not a Node-versus-Go benchmark.
