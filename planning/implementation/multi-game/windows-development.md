# Native Windows development and measurement

6 October 2026 UTC (5 October Toronto). [CR-ARCH-004](../../decisions/CR-ARCH-004-native-windows-performance.md) supersedes the WSL toolchain instructions for current work. Historical M02/M02A evidence remains unchanged.

Use native Windows x64 for **both** Node and Go, from this checkout. The selected local stack is Node 24.19.0, Go 1.26.8, PostgreSQL 16.15 and LLVM-MinGW 23.1.2. Go 1.27.1 was the latest stable release inspected, but failed the same-source Windows CPU-profile control; 1.26.8 is the maintained previous line and passed that control. `GOTOOLCHAIN=local` prevents a module directive from silently selecting another Go installation. Upgrade only after repeating the Windows profiling, race, database and parity gates.

The [tool manifest](../../../scripts/windows-tools.json) pins archives and SHA-256 values. Go and LLVM-MinGW hashes come from their publishers. PostgreSQL's hash records the official EDB HTTPS download; it is not an independently published vendor digest. Node 24.19.0 must already be installed natively. The wrapper verifies actual executable versions; no global PATH, Windows service, existing `.env.local`, saved-game database or package lock is changed. Tools, caches and the disposable cluster live under ignored `.local/`.

Run these from the repository in PowerShell:

```powershell
node scripts/windows-env.mjs setup
node scripts/windows-env.mjs status
node scripts/windows-env.mjs pg:start
node scripts/windows-env.mjs go test ./server/... -count=1
node scripts/windows-env.mjs go test -race ./server/... -count=1
node scripts/windows-env.mjs go vet ./server/...
node scripts/windows-env.mjs node --test --test-isolation=none web/tests/*.test.ts web/server/tests/*.test.ts
node scripts/windows-env.mjs npm run contracts:check
node scripts/windows-env.mjs node scripts/m02a-contracts.mjs --check
node scripts/windows-env.mjs npm run typecheck
```

`setup` downloads only missing archives over verified HTTPS, checks their pinned hashes and extracts native binaries. Git for Windows curl is used when installed; otherwise Node HTTPS is used. Run downloads before measurements. The native C compiler is needed only for `-race`; ordinary tests/builds use `CGO_ENABLED=0`. A sandbox may require permission to launch native child executables; an `EPERM` launch error is not a failing application test.

`pg:start` creates a separate, password-authenticated local cluster on **127.0.0.1:54331**, with `cardford_windows` and `cardford_windows_test`. It reuses only that recognized project cluster; it does not delete data. Credentials remain in ignored `.local/windows-postgres/credentials.json`, never in evidence. The wrapper provides `DATABASE_URL` and `TEST_DATABASE_URL` to child processes and selects local identity, fixture billing and Jev off. The Go seam also refuses a database without `_test`. Node tests apply the existing canonical migrations to the isolated test database. `pg:stop` stops only this project cluster. PostgreSQL is not needed during replay timings.

The current production application remains TypeScript. To run it against the separate native development database, use `node scripts/windows-env.mjs npm run db:migrate`, then `node scripts/windows-env.mjs npm run dev`. Those commands retain the existing UI and local fixture modes; they do not activate the future Go backend.

Freeze source, stop compilers/tests/profilers, then run sequentially:

```powershell
node scripts/windows-env.mjs benchmark --out=.local/performance-windows/recheck
node scripts/windows-env.mjs profiles --out=.local/performance-windows/recheck
node scripts/windows-env.mjs pg:stop
```

Use a new evidence destination for a new measurement; never overwrite the checked-in experiment. The [protocol](../../../qa/implementation/multi-game/performance-windows/protocol.md) defines the exact replay workload and boundaries. `--verify-only` checks all original checkpoint hashes. The full run checks native OS/version/path, source/workload hashes, sequential order, equal warmup counts, work counters and output parity. Go CPU and allocation diagnostics use separate processes; Node CPU profiling includes imports and is labeled accordingly. Whole-suite test durations are not a Node-versus-Go benchmark.
