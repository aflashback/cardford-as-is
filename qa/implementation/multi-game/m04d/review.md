# M04D integration review

Independent package and integration review covered exact-target offers, original quota reservations, control/revision/idempotency, anonymous demo transport and browser recovery. Findings below were corrected before final source freeze.

- A charged unit could switch grants/buckets and spend twice. A unit-level original unlock now pins the first recorded grant, tools, offer/version, bucket and period; the transaction serializes its allowance and command receipt.
- Existing M03 charges needed migration treatment. Migration 009 backfills their original unlocks without rewriting charges or usage. Where legacy data contains multiple charges for a unit, earliest recorded command revision wins, with stable command ID as the deterministic fallback for imported unbound charges.
- Persisted free/trial grants initially ignored later target/play/tool removal. The resolver now applies current scope to future admissions, while preserving recorded unit continuation and existing unlocks under their original terms. Purchased/family terms remain pinned.
- The service initially required a play grant before permitting coaching. Loading owned state is now separate from play admission. An eligible coach can unlock/read advice after a separate play grant expires; advancement remains denied. Sealed bot work waits for play permission, while complete human analysis remains available.
- A prepared coaching decision can use a different grant from play. Commit accepts that only for the same human, owner, unit, access/control generations and original purpose, then independently rechecks its grant, tool and unlock under the transaction lock.
- Saved advice retains natural-expiry access, but explicit revocation of its original source grant must fence the read. The records reader and first-delivery transaction now enforce that distinction.
- Context originally used one grant query per row under the owner lock. It now scans bounded validated grants in one query. Automatic free refresh batches existing targets, preserves original versions/revocation, and issues only genuinely new configured offers/targets. It does not extend an expired grant on reload.
- Configuration limits now match storage limits. Oversized configurations/identifiers, unsupported calendars/tools and bucket-calendar resets fail closed. Long unlimited-offer IDs use a stable hashed bucket without version-dependent resets.
- The existing Node server does not implement the new Go demo route. The component now shows an accurate unavailable state on 404 instead of an endless reconnect prompt. Go `--web` is the explicit browser acceptance path; full practice/account cutover remains M04E.

## Native observations

The first [full capture](go-full-before-count-fix.json) had one failure: `TestM03CanonicalMigrationCrossRuntimeLedger` still expected eight migrations after 009 was added. Every other package, including the configured service flows, passed. The assertion now compares the ledger with the actual canonical migration list; the focused cross-runtime test passed. [Original output](go-full-before-count-fix-native.jsonl) is retained. Final acceptance uses the corrected test source.

The [pre-freeze targeted capture](targeted-pre-freeze-native.txt) passed the three configured HTTP/service scenarios, both public demo tests and nine records cases. The tenth records case failed while opening its isolated schema with Windows `connectex` timeout at native PostgreSQL `127.0.0.1:54331`. Its focused rerun passed in 0.90 seconds. No timeout or database configuration was changed. The underlying intermittent native failure predates M04D and remains unresolved; the failed capture is preserved.

An early agent's broad HTTP check ran while PostgreSQL was intentionally stopped and reported connection refusal; that was not an acceptance run. It also observed the previously seen loopback listener timeout. The final database suites run serially. A preliminary continuation test was accidentally run twice in separate isolated schemas due to slot coordination; both passed and finished before final capture. Neither duplicate is counted as additional evidence.

Windows lacked symlink creation privilege for the static helper's symlink fixture. The final report records that skip separately from the two deliberately long race tests. Static-root containment is still enforced by `os.OpenRoot` and bounded allowlisted build loading; a skipped fixture is not a passed test.

## Scope

No new strategic policy, game rules, model, live purchase, hosted identity or UI redesign was introduced. The authored graph and deterministic access resolver perform no provider work. The complete platform/client acceptance and the native database follow-up remain open.
