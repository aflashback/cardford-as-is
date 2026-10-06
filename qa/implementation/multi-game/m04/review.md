# M04A integrated review

Review scope: the original Go Hearts reducer, legal actions, safe projections, strict import, immutable snapshots, compact persistence, independent parity fixtures and record integration tests. This review does not accept production HTTP, policy execution, strategy quality or the complete M04 journey.

The compatibility reviewer independently inspected the engine/rules/observation/validation/snapshot implementation. The records reviewer inspected the game-owned storage and selected-command boundary. The coordinator reviewed both against the preserved V1 reducer and M03 contracts. Neither reviewer authored the production files they reviewed. The compatibility reviewer also checked the records tests' oracle indexing and real database publication/recovery coverage.

## Finding closed

The compact Hearts adapter accepted `events:null`, then normalized it when archived events were appended. That violated the required empty-array placeholder. A records regression reproduced acceptance in both document validation and opening. Both Hearts boundaries now require a non-null empty array. The regression also checks Spades Solo/Partners, whose existing strict decoder already rejected null; no Spades production change was needed.

Evidence: `records-hearts-null-archive-red-native.jsonl`, `records-compact-array-modes-native.jsonl`, then `records-hearts-final-green-native.jsonl`. The final full/race reports in [status](status.md) supersede these focused runs for integrated acceptance.

## Reviewed invariants and limits

- Import validates shapes, seats, cards and collection lengths before indexing; conservation and reconstructed legal chronology bind the current hand, pass memory, flags, scores and exact events. Earlier complete public hands reconstruct cumulative scores and cannot continue after a uniquely won match.
- Projection allowlists the actor's hand/pass, public cards/counts and permitted public deductions. A concealed-card swap leaves that actor's projection unchanged. Original four-actor hashes independently check exact output/candidate order.
- Trusted `Snapshot.Apply` clones typed state and invokes bounded reducer checks; it does not decode private JSON or reconstruct history. Rejected operations leave the source intact. Event reservations and score bounds precede play mutation.
- Records test the unchanged original four-hand corpus and the new reachable terminal match. The SQL test separately exercises a complete first hand and the first play of hand 2 through real commits, independent repository loads, a newly opened store, receipt reconciliation and replay. Saved human analysis/advice is explicitly a fixture, not evidence of an implemented policy or prepared-worker/HTTP flow.
- V1 event slices still copy with history during immutable transitions, and untrusted imports validate earlier public chronology. These costs are bounded and history-dependent; no constant-time, throughput or capacity claim is made. Larger Hearts histories remain part of subsequent full-path measurement before activation.

No other actionable Hearts finding remained in this scoped review. Actual final test results and any initial integration failures are recorded separately in [status](status.md).

## Native database follow-up

The first full suite passed the new Hearts SQL test but timed out at revision 22 in the unchanged Spades growth test. Later read-only database activity showed no remaining sessions/blockers; the retained test fixture was still at revision 22. Only its verified isolated schema was removed. No development data or time limit changed.

Read-only review found no missing rollback/pool release in `withTx`, `Commit` or `Load`. Test cleanup drops its schema before closing the primary pool; pgx can still be asynchronously closing a canceled connection, which could explain the secondary `DROP SCHEMA` lock timeout. No blocker snapshot was captured at failure, so this remains an explanation to reproduce, not an established root cause of either timeout. The primary error has insufficient stage information to distinguish reconciliation, publication or commit. Keep the existing native timeout follow-up in the service activation plan; a passing retry does not resolve that uncertainty.
