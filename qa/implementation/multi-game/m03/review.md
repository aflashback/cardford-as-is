# M03 independent review

6 October 2026. Reviewed the working M03 change against `6310d6e`, under the authorized unexposed Go persistence scope. Read `AGENTS.md`, the M03 execution and private-record contracts, and backend readiness SYS-03–07/10. The review covered `server/internal/records`, the Spades/Hearts compact storage adapters, canonical migration 007, and the restricted Node migration helper. The current Node/UI authority, M04 activation, full Hearts/policy ports, hosting and strategic quality are outside this review.

No additional open source-level correctness finding was identified after the changes below. Final integration and race verification of the latest changes remains pending at this review handoff; use the coordinator's final M03 status and logs for those results.

## Findings and disposition

| Finding | Impact and location | Resolution / regression |
|---|---|---|
| P2: trusted historical readers could not reconstruct original advice | `codec.go` registered historical readers without an opening constructor. `ReadDecision` and `ReadPrepared` reconstruct their source through `ReplayVisit` and `ValidateAnchor`, which rejected every such reader. The module could show a current position while its saved advice and replay were unavailable. | Added an explicit required trusted `HistoricalReader.ReplayStart` in `server/internal/records/codec.go:30` and bound it only to the read-only registration at line 142. `Start`, `Advance` and policy registration still reject historical execution. `TestRecordHistoricalReaderReplaysWithoutEnablingPlay` passed. The database regression `TestM03HistoricalReaderPreservesOriginalPreparedAdvice` is added for final integration verification. |
| P2: accepted command histories could exceed the historical reader's effective budget | Publication and live loading capped command bytes alone, while `loadHistory` counted the opening anchor against that same cap. Commands in the final anchor-sized portion could be accepted, then make replay and saved advice unreadable. | The store owner independently aligned the boundary during review: `server/internal/records/store_history.go:50` counts command bytes alone and bounds the anchor separately; read accounting includes both. Added `TestM03StoreCommandCapReservesIndependentAnchorBudget`, using legal preserved command whitespace to exercise the actual near-cap boundary. Final integration verification pending. |
| P2: one admitted unit could be charged again after UTC midnight | The allowance charge lookup and uniqueness included the period. A hand spanning two days could consume a second allowance despite its previous charge. | The coordinator accepted the once-per-unit interpretation. The owner removed period from the unit-charge identity in `server/internal/records/access.go:324` and migration 007's unique constraint at line 154, while preserving the original charge period. Added `TestM03AdmittedUnitChargeRemainsInOriginalPeriod`. Final integration verification pending. |

The historical-only regression uses the unchanged original module pin, original anchor, accepted command and original decision bytes. A separate codec installs the same exact trusted Spades implementation only through the historical-reader interface, with no execution policy registration. It does not relabel records as another module or manufacture compatibility by repinning them.

## Reviewed guarantees and limits

- Strict private envelopes, game-owned payload validation, immutable snapshot binding, original packet digest/candidate binding and trusted reader lookup fail closed. Player projections remain game-owned; private records are not public response DTOs.
- Acceptance reconciles an existing owned command before checking permission for new work. The full command digest binds game, resulting revision and operation. Current read authorization gates recovered original outcomes.
- Publication takes short owner/game locks after game decoding and work. Snapshot, appended events, command/checkpoint, decision references, allowance charge and original response share a transaction. Prepared results retain original bytes, lease/attempt fences and immutable completed rows.
- The already-in-progress unit/expiry fixes were inspected: the game supplies the current unit; an expired finishing grant cannot cross to a next hand; current authorized control can finish an admitted unit; unfinished retries preserve attempt history; expired issued results retain their original row and use one successor identity.
- The original six SQL migrations have no diff against `6310d6e`. Go pins their checksums and shares Node's canonical directory, `schema_migrations` ledger and advisory lock. The helper restricts itself to the isolated `_test` database and explicit `m03_` schema.
- Frozen Spades observations still read the bounded complete event archive. Compact writes do not establish constant-size reads. No production capacity or complete replacement-service claim follows from this review.

## Checks performed by this reviewer

Passed through the pinned native Windows wrapper:

```text
node scripts/windows-env.mjs go test ./server/internal/records -run 'TestRecord(ClosedUntrustedEnvelope|ArchiveAndInvalidStateFailClosed|ExactPolicyModuleAndReadOnlyReaders|OpeningAnchorBindsConfigChanceAndCheckpoint|DecisionBindingsAndOriginalBytes|SupportedOriginalLegacyStateBytes|CommandDigestBindsEntireIntent|DecisionCommandAndWindowBinding|HeartsSealedOpeningRestoresKnownHoldings|ReplayFrozenOriginalCorpus)$|TestM03CanonicalMigrationPins$' -count=1 -v
```

All 11 selected top-level tests passed, including the frozen Solo and Partners replay fixtures. The initial restricted attempt failed to spawn native Go with `EPERM`; the approved native rerun passed. This was an environment restriction, not a failing assertion.

After the historical-reader fix, both selected unit tests passed:

```text
node scripts/windows-env.mjs go test ./server/internal/records -run '^TestRecordHistoricalReaderReplaysWithoutEnablingPlay$|^TestRecordExactPolicyModuleAndReadOnlyReaders$' -count=1 -v
```

The changed codec and historical tests were formatted with pinned Go `gofmt`. `git diff --check` passed for tracked changes at review handoff. Database suites, final Node regressions, full native Go and race checks are left to the coordinator's serial final run; they are not claimed as passed here. No comparison rerun, live provider call or heavy growth experiment was performed by this reviewer.

## Coordinator verification after review

The final native [full Go run](go-full.json) and [race run](go-race.json) pass all three review regressions. The race run skips only the two separately passed long-growth fixtures. The fresh final [Node run](node-full.json) passes 493/493. [Milestone status](status.md) retains the earlier connection/setup failures, stale draft test migration and their diagnostic/reset evidence. This closes the pending verification above; it does not represent another independent review.
