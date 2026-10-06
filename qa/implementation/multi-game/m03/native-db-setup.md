# Native database setup investigation

6 October 2026. This bounded investigation followed the retained full-Go failure in `go-full-initial-failed-native.jsonl`: five tests failed while opening a native PostgreSQL connection, without reaching their assertions. The long SQL growth/replay test passed in that run. The failed setup interval was approximately 08:44:25–08:44:40 EDT.

## Evidence

- The native PostgreSQL log shows the server started at 08:05:35 EDT and no shutdown, restart, crash, connection-cap error, or server startup failure around the failed interval. It records a client connection abort and the deliberately induced lock error from the bounded-wait regression. Checkpoint entries were ordinary. The listener PID remained 44400; its process start time remained 08:05:35.
- At least three failed connection reports include `server refused TLS connection` followed by a failed fallback TCP connection. Other failures contain only TCP connection failures or an operation deadline. No connection string or credential is reproduced here.
- The installed pgx 5.11.0 source documents a default `sslmode=prefer` configuration with a TLS attempt and a plaintext fallback. The native wrapper had not specified `sslmode`. The local PostgreSQL server returned `SHOW ssl = off` in every successful diagnostic connection.

The read-only diagnostic executed 20 alternating pairs of direct pgx connections. Even-numbered pairs tried `prefer` first; odd-numbered pairs tried `disable` first. Each connection had a five-second context/connect timeout and a one-second statement timeout, queried only `SHOW ssl`, then closed. A wrapper around the configured dial function counted actual TCP dials. It did not change database or operating-system settings.

Executed command:

```powershell
node scripts/windows-env.mjs go test ./server/internal/records -run TestM03NativeConnectionDiagnostic -count=1 -v
```

The temporary test has been removed from the normal package. Its exact source is preserved as [native-db-connect-probe.go.txt](native-db-connect-probe.go.txt), SHA-256 `0569c178467aa8c3aebe77203a1df9ba341ba5e10740a4f0d94d641bed0a4d57`. A copy remains in ignored `.local/m03-connection-diagnostic_test.go` and can be invoked explicitly with `node scripts/windows-env.mjs go test .local/m03-connection-diagnostic_test.go -run TestM03NativeConnectionDiagnostic -count=1 -v`. The frozen diagnostic source explicitly selects each mode, regardless of a later wrapper default.

| Explicit mode | Successful connections | TCP dials per connection | Configured TLS fallbacks | Median connect/query/close time | Mean | Range |
|---|---:|---:|---:|---:|---:|---:|
| `prefer` | 20/20 | 2 | 1 | 124 ms | 141.8 ms | 122–304 ms |
| `disable` | 20/20 | 1 | 0 | 64 ms | 72.6 ms | 62–237 ms |

Exact observed durations, in pair order, are preserved in [native-db-connect-results.json](native-db-connect-results.json). The diagnostic test passed in 4.32 seconds; the package reported 4.669 seconds.

## Decision and limits

The native loopback-only wrapper should explicitly use `sslmode=disable` because its provisioned server has SSL disabled. This removes one rejected negotiation and one extra native PostgreSQL connection startup from each ordinary connection. It does not alter Store query, lock, pool, connection or operation caps; it does not suppress failed assertions or add setup retries.

**This experiment does not prove that TLS fallback caused every earlier SYN/connection timeout.** All 40 diagnostic connections succeeded once the earlier failure interval had ended. The evidence establishes a configuration mismatch and measurable unnecessary connection work. The integrator must retain the failed full run and verify the affected tests and full native suite after applying the loopback configuration correction. Hosted TLS policy is outside this local fixture change.

## Follow-up after the later Node connection failures

Read-only checks at **09:01:18–09:01:46 EDT**, before the integrator's subsequent graceful native-cluster restart, found:

| Observation | Result |
|---|---|
| All TCP sockets from `netstat -ano -p tcp` | 232: 115 `CLOSE_WAIT`, 96 `ESTABLISHED`, 21 `LISTENING` |
| All `TIME_WAIT` / `SYN_SENT` sockets | 0 / 0 at the captured instant |
| Native PostgreSQL port 54331 | One listener, PID 44400; no established, pending or `TIME_WAIT` connections |
| IPv4 and IPv6 dynamic TCP port ranges | Each starts at 1024 with 64,511 ports |
| System warning/error events in the preceding 35 minutes | The event query returned `NoMatchingEventsFound`, not a permissions failure; no TCP 4227/4231, resource exhaustion or disk warning was observed |
| PostgreSQL startup identity before the deliberate restart | Listener and background processes still had the original 08:05:35 EDT start time |

The sanitized PostgreSQL log window **08:54–08:59 EDT (12:54–12:59 UTC)** contained a client reset at 08:55:20, two statement timeouts with client aborts at 08:58:28, and an ordinary checkpoint completion at 08:58:36. It contained no server restart, crash, PANIC, out-of-memory report, connection-cap report or backend-creation failure. The checkpoint recorded 1.607 seconds of synchronization across 8,013 files; its 180.806-second overall background duration is not by itself evidence of a disk stall.

These snapshots show no current socket/port exhaustion or server-failure indicator. They were taken after the failed calls, so they cannot rule out a transient condition during those calls. The later connection timeouts/resets remain unattributed by this bounded investigation. No runtime caps, retries, operating-system security settings or application source were changed by this follow-up. The separate draft-migration checksum mismatch has a known cause (a previously applied unpublished draft), and must not be grouped with the unexplained transport failures.
