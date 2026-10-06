# M03 durable work, access and review evidence

Private adapter only; no production listener, current Node runtime activation,
offer resolver, live provider, strategy port, or user-facing review simulation.
Base: `6310d6e`. Native Windows Go 1.26.8, PostgreSQL 16.15, Node 24.19.0.

## Implemented boundaries

- `QueueWork` validates the actual policy/input/actor/window/unit and persists a
  unique logical identity before dispatch. `ClaimWork` returns a finite lease;
  competing live claims fail. Expired attempts are reclaimed with a larger fence
  and a retained attempt row. No database connection survives the method call.
- `PublishWork` validates the original analysis, advice, selected eligible
  candidate, policy, actor and input through the installed codec outside SQL.
  Its short transaction rechecks access/control generation, exact grant target,
  tool, live revision/window and lease expiry, then writes one immutable canonical
  decision plus a work/receipt pointer. Retrying cannot replace issued bytes.
- `RequeueWork` explicitly retries expired/rejected/canceled unfinished work while
  preserving attempt history. `RetryExpiredResult` instead creates a new identity
  with an immutable predecessor reference after an issued receipt expires.
  Concurrent retries converge on one successor; ordinary queue calls reject a
  predecessor nonce. Old receipts remain independently readable.
- Command acceptance checks the same immutable prepared-result binding and its
  work expiry. Already accepted command reconciliation uses its original receipt
  under current owner/read authorization instead of performing another mutation.
- `CreateAccess`/`ChangeAccess` never reset generations. Grants freeze the offer,
  source, exact game/variant, bucket and purchased terms; revocation is explicit.
  Deterministic bot/human analysis works with play-only grants. Delivered advice
  and review require coaching permission plus the configured tool.
- Trial activation is unique by server owner and stable trial key, independently
  of policy version, proposed grant ID or device. Allowance usage keys are
  owner/bucket/period; charges are part of accepted-command SQL and unique by
  admitted unit, including across command retries, grant changes and midnight.
  An existing unit charge remains attributed to its original period.
- Unit identity comes from the game-owned codec. Natural expiry can finish only
  an originally admitted owner/game/unit/grant. A fresh request can retain this
  right across device/control changes; stale work still fails its generation
  fence. Security grant revocation overrides continuation.
- Review alternatives are independent immutable records referring to an accepted
  parent decision and an eligible candidate at its replayed original source.
  Result bytes are preserved, not regenerated. `future_exposed` conservatively
  records whether the live revision had advanced beyond the parent revision.
  Original parent analysis is unchanged. Supported original readers validate
  historical bytes; unknown readers fail closed.

## Limits

Work lifetime is at most 10 minutes; an execution lease is at most 30 seconds.
Store operations retain the finite query/lock/pool limits from `StoreOptions`
(defaults: 5 seconds / 1 second / 4 connections). Work identity and result reads
are private server records, not player-route DTOs. The worker execution itself is
outside the records package; these leases do not provide hard CPU containment.

This private access seam supports UTC day and lifetime buckets only; unsupported
calendars fail closed. Bucket period/timezone cannot change under an existing
stable bucket. The private purpose mapping requests configured `advice` and
`review-alternative` tools; the general M04 offer resolver remains unimplemented.

## Actual test history

Command:

```powershell
node scripts/windows-env.mjs go test ./server/internal/records -run 'TestM03(Work|AccessTrial|Allowance|Natural|Review|Expired)' -count=1 -v
```

The first setup attempts failed on the new fixture's relative migration path,
card encoding order, and an invalid `AdviceView.source` fixture enum. Those test
fixtures were corrected; no production contract or frozen oracle was changed.

One concrete behavior failure was retained from the 13.464-second run:

```text
=== RUN   TestM03ReviewAlternativeIndependentOriginalAndFutureExposure
    trials_test.go:25: completed alternative provenance mutable
--- FAIL: TestM03ReviewAlternativeIndependentOriginalAndFutureExposure (1.02s)
```

The test directly updated a completed review row's future-exposure provenance.
Migration 007's owner added the missing completed-review UPDATE/DELETE guard.
The following run passed the entire focused suite in 16.306 seconds, including
two-instance work reclaim, immutable original bytes, access/control/window/
revision fences, play-only/tool boundaries, trial activation, atomic allowance,
natural expiry, immutable review provenance, terminal retry and issued expiry.

After adding module-owned unit binding and immutable successor retries, a later
run encountered shared native PostgreSQL failures before continuing:

```text
TestM03AccessTrialActivationAndPurchasedTerms:
ERROR: canceling statement due to lock timeout (SQLSTATE 55P03)
TestM03AllowanceAtomicCommandStableAcrossGrantPolicy:
context deadline exceeded
TestM03NaturalExpiryOnlyFinishesRecordedUnit:
127.0.0.1:54331 ... connectex: A connection attempt failed ...
TestM03ReviewAlternativeIndependentOriginalAndFutureExposure:
context deadline exceeded
TestM03WorkTwoInstancesReclaimAndImmutableReceipt: PASS (0.81s)
```

This is recorded as a failed environment-dependent run, not a pass or a reason
to increase database timeouts. Final post-change verification is recorded below.

Final normal and race verification is serialized by the parent agent. Its
`go-full-native.jsonl` and `go-race-native.jsonl` evidence in this directory are authoritative
once captured; this agent stopped further database test runs to avoid contention.
Do not infer a post-change pass from the earlier 16.306-second run.

Owned regression names:

- `TestM03AccessTrialActivationAndPurchasedTerms`
- `TestM03AllowanceAtomicCommandStableAcrossGrantPolicy`
- `TestM03AdmittedUnitChargeRemainsInOriginalPeriod`
- `TestM03NaturalExpiryOnlyFinishesRecordedUnit`
- `TestM03ReviewAlternativeIndependentOriginalAndFutureExposure`
- `TestM03WorkTwoInstancesReclaimAndImmutableReceipt`
- `TestM03WorkAdmissionFences`
- `TestM03WorkPlayOnlyBaselineAndToolFence`
- `TestM03WorkFiniteExpiryRequeueAndCancel`
- `TestM03ExpiredIssuedWorkCannotAcceptNewCommand`

Review additions after the earlier green run cover actual module unit identity,
fresh control/device continuation with stale-work rejection, independent
coach-only grants, queued cancellation, expired completed-work successor
uniqueness, and the original-period charge retained across midnight. The latter
was identified by independent review; it is not claimed as a separately observed
red run. `ReadPrepared` also verifies every persisted work-to-decision binding
before returning the original independently replay-validated decision.
