# M04F request and test-cost follow-up

Local work on 6 October 2026, native Windows Go 1.26.8, Node 24.19.0 and PostgreSQL 16.15. This follows the first slice at `b822d0d`; it is not a new Go-versus-Node comparison. Default backend activation remains open.

The earlier normal suite took 6m04s and race-short took 19m28s. Those are broad release checks, not sensible repeated edit checks. The old 57-minute unsuccessful browser attempts were excessive diagnostic runs. The native process-tree watchdog now imposes a whole-invocation ceiling of 30 minutes, including shutdown allowance. A stopped run exits 124 and leaves pending checks unverified. Short focused selections and ordinary Go caching are available.

## Implemented and measured

- [Strict parser](parser.md): preserve duplicate normalized keys, depth, Unicode/surrogate and binary64 semantics while avoiding per-token allocation. Differential oracle, frozen compatibility and 66,394 fuzz executions passed. Original policy/rule output stays pinned.
- [Operation decoder](decoding.md): a single strict typed decode preserves the service request and larger journal bounds. No permissive JSON decoder or ignored validation replaced the old boundary.
- Statistics extraction: per-store, exact-copied-byte LRU with SHA-256 lookup, 16 MiB and 1,024-entry ceilings. Only actor/revision/unforced scalars are cached; every request still checks current authentication and database rows. Changed or malformed bytes miss, and failures are never cached. The original analysis and registered non-card analysis have separate strict readers.
- [Same-host extraction benchmark](stats-benchmark.txt): median 1.241 ms and about 496 KB allocated per uncached extraction versus 8.003 microseconds and zero allocations on a warmed exact-byte hit. This narrow result is not total request throughput or capacity.
- [Actual ten-hand request run](prepared-partners-10-chance-fixed.txt): 708 revisions, 699 counted actor/automatic/chance commits, 560 prepared decisions and ten delivered coaching requests in 280.452 seconds of gameplay (286.096 seconds including invocation overhead). All ten hands completed; the match was still nonterminal. Bots used actual prepared choices; simulated human actions used a legal server-issued candidate. Every transition was followed by an actual HTTP table read.

Ten-hand median/p95 milliseconds: load 14.8/27.3; bot preparation 109.9/176.9; actor commit 285.1/525.3; table response 46.4/81.2. The growing cost remains material. [CPU](prepared-request-cpu.txt) and [allocation](prepared-request-allocations.txt) profiles show JSON/schema handling and allocation dominate; approximately 105.8 GB is cumulative allocation over the run, **not retained memory/RSS**. Private replayable rows and profiles stay in ignored `.local/m04f-request/`; public captures contain timings and hashes.

## Failures and limits retained

`prepared-partners-1` failed on initial Windows TCP connection before game work. The subsequent existing three-iteration raw-pgx probe passed in 3.10 seconds; that does not establish the intermittent failure's cause. `prepared-partners-10` then completed its first hand but exposed a diagnostic-harness omission: the separate next-deal chance step. Its failed capture remains intact. The corrected ten-hand run is a distinct capture, not an overwritten success.

The complete-request measurement is traced and has no equivalent untraced before/after pair. Its source receipt covers the named diagnostic/decoder/cache paths; other functional development occurred during the turn. Do not treat it as a frozen whole-tree release benchmark. No new 20-hand profile or uncensored normal-match browser soak was run. The remaining native connection cause, larger-history resource work, full normal-match evidence and default-start activation are still open. The explicit local Go human-test path can proceed independently.

## Explicit local startup resilience (SYS-01/SYS-08)

The subsequent [startup investigation](startup-connection-investigation.md) identifies Go's attempted Windows loopback no-retransmission setting and the mismatch between Winsock 10060 and Go's timeout classifier. The original packet/filter cause remains unproven. Only explicit local-service startup now retries one matching Windows loopback `dial/connectex/10060` failure after 50 ms within the same original deadline. No SQL operation is retried, other errors fail immediately, and the retry switches off after startup. Ordinary isolated store tests retain their old behavior. Sanitized opt-in pool diagnostics and deterministic error/ownership/cancellation tests passed; three cold production-pool openings passed. This mitigates a narrow startup failure without claiming that the underlying OS issue is resolved.

The final integration sweep caught a mistake in the added cache-revocation test: its internal fixture context had no authenticated principal, so it did not enter the local-service authorization boundary. The test now uses a real local identity for reads, warms the cache, revokes access, requires exact `ErrReadDenied`, restores access and retains the existing malformed-record checks. The focused database regression passed in 5.265 seconds; production authorization/cache code was unchanged. The broad failed result and corrected targeted result remain separate in [M12 receipts](../m12/verification/receipt.json).
