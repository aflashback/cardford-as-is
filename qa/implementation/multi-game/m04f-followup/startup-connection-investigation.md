# Native local startup connection diagnosis and bounded recovery

7 October 2026, native Windows, pinned Go 1.26.8 / pgx 5.11.0 / PostgreSQL 16.15. This investigation made no PostgreSQL configuration, security, timeout, tool-version or stored-schema changes. The two live probes used the isolated test database and `Ping` only; neither created nor deleted data.

## Finding and limits

The archived [prepared-request failure](prepared-partners-1.txt) reports a TCP `connectex` failure during the first store opening and completes in 1.40 seconds. Its Windows error text exactly matches `Win32Exception(10060).Message`: Winsock `WSAETIMEDOUT`. This is before a PostgreSQL connection and schema query, not a game-history or SQL timeout. The later browser log retains only `store.create-schema, class=failure`, so that later error cannot independently be assigned the same numeric code.

Two inspected runtime details explain why this failure can be early and poorly classified:

- Pinned Go `src/net/fd_windows.go:151-165` attempts `SIO_TCP_INITIAL_RTO` with `TCP_INITIAL_RTO_NO_SYN_RETRANSMISSIONS` on supported Windows loopback sockets. The ioctl's return is ignored; success was not observed here. This source-supported mechanism is consistent with an OS dial failure before the app's five-second deadline. It does not establish why a connection attempt was missed, or implicate PostgreSQL, a firewall, endpoint protection, or the scheduler.
- Pinned Go `src/syscall/syscall_windows.go` implements `Errno.Timeout()` using Go's synthetic `ETIMEDOUT`, not Winsock 10060. A wrapped Winsock failure can therefore escape the existing `net.Error.Timeout()` log classification and become `class=failure`.

Microsoft documents [initial TCP retransmission configuration](https://learn.microsoft.com/en-us/windows/win32/winsock/sio-tcp-initial-rto) and [Winsock error 10060](https://learn.microsoft.com/en-us/windows/win32/winsock/windows-sockets-error-codes-2). No packet trace or new naturally failing numeric-code capture was obtained. Six predeclared live cold openings passed; their success does not establish the underlying cause or eliminate future network failure.

## Implemented behavior

`records.StartupDiagnostics` is opt-in and bounded to 32 spans. `StoreOptions.StartupDiagnostics` records dial, whole connection, acquire and query timing, original/remaining context budgets, allowlisted error class, numeric OS code, and validated SQLSTATE. It retains no address, connection configuration, SQL, arguments or raw error text. Capture stops when `OpenStore` returns. Set `CARDFORD_DB_STARTUP_DIAGNOSTICS=1` for a structured stderr report from the local CLI. Each socket attempt remains visible even when the final connection succeeds. The `startup.connect` context has no deadline because puddle deliberately detaches connection construction from the acquire cancellation; the dial itself receives the pgx limit, now additionally capped at the original startup deadline.

During explicit `LocalService` startup on Windows, exactly one replacement socket is allowed after a 50 ms delay when all guards hold: TCP network, numeric loopback target, `net.OpError.Op == dial`, `os.SyscallError.Syscall == connectex`, numeric error 10060, no returned connection, and a live context. Both attempts share the inherited deadline and are capped at the original store-opening deadline. Cancellation interrupts the delay. The second failure remains final. No SQL, authentication, schema creation, complete acquisition, command or transaction is retried. Permission/refused/read/other-syscall/nonloopback failures are unchanged. The retry wrapper deactivates after `OpenStore` returns; later pool dials and all non-local stores keep their original behavior.

The failed native `net.Dialer` attempt owns disposal of its unsuccessful socket. The wrapper does not replace or discard any non-nil connection returned by a dial function, and passes the successful replacement connection to pgx ownership. The pure unit tests use `net.Pipe` and close both ends.

This is bounded startup resilience for an observed pre-connection failure class. The lower-layer cause remains unproven; this change does not claim a repaired Windows network stack.

## Evidence

All commands used `scripts/bounded-native-run.mjs --seconds=30` and the pinned native `scripts/windows-env.mjs` wrapper, with no retries of a failed workload.

| Capture | Result |
| --- | --- |
| [Before-change production-pool probe](startup-pool-probe-before-retry.txt) | Exactly three cold pool openings; passed in 0.20 s, watchdog 3.07 s. TCP dial 1.07–3.13 ms; connection 65.55–69.76 ms. Retry was not installed and this earlier probe used the test-store path. |
| [Focused deterministic tests](startup-dial-focused.txt) | Diagnostic sanitization and original-error/deadline preservation; recovery on one injected 10060; maximum two attempts; IPv4/IPv6 loopback; cancellation/deadline during delay; permission, refused, hostname, nonloopback, UDP, read, other-syscall and untyped-error guards; non-local-store guard; post-startup deactivation. Passed, watchdog 4.83 s. |
| [Final local-service pool probe](startup-pool-probe-final.txt) | Exactly three cold openings through `LocalService` with the retry installed, using `cardford_windows_test` and read-only Ping. Passed in 0.25 s, watchdog 5.42 s. TCP dial 1.57–3.72 ms; connection 75.55–96.73 ms. Each required one socket, so the natural recovery branch was not exercised. Also passed returned-connection ownership guard. |

The live probe is opt-in: `CARDFORD_DB_STARTUP_PROBE=1` with `go test -p=1 ./server/internal/records -run '^TestStartupDiagnosticsWindowsProbe$' -count=1 -v`. It checks the exact native isolated target, has a 20-second overall context, uses ordinary five-second store limits, and stops on its first failed sample. The CLI handoff and browser interaction are separate coordinator acceptance checks.
