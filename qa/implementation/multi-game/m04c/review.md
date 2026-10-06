# M04C integration review

Independent review covered service/records authorization, V2 compact persistence, complete original preparation, staged transitions, historical output and public contracts. The coordinator integrated the findings and ran native acceptance. This file records findings within M04C; full M04 remains open.

- M03's V1 snapshot/digest contract and M04B's V2 lifecycle are distinct. The new adapter uses game-owned compact persistence and explicit V2 commands; it preserves V1 readers instead of translating old histories.
- Original full policy analysis, registered projection and all three original advice levels now share one preparation. An exact private output reader preserves these bytes for historical delivery.
- Bootstrap required an atomic receipt, prior active-game identity/revision and control rotation. A pre-transaction revision check alone was insufficient; the store now checks the old revision under the owner lock.
- Public command intents include operation, tab and complete body. A private game-command digest alone cannot detect a retry that changes its browser lease or requested candidate.
- The first integrated three-mode test caught lowercase internal errors being converted to a generic HTTP 503. The service now maps these to the existing strict public error codes; the changed-input retry returns 409.
- Control acquisition must compare the control generation, which can differ from the access generation after a grant change. The original implementation compared access generation; review corrected it and added a divergence regression.
- New public platform definitions must not overwrite the original M04B schema fingerprint or M02A evidence. They are additive registered schema inputs; current generated validation fixtures move out of the archived M02A directory.
- Prepared bot output remains private. Only a human `coach-advice` decision is eligible for the advice endpoint. Delivery records an exposure attempt; it does not claim the person viewed it.
- First delivery of prepared advice must recheck current coaching permission and the original grant/tool under the owner lock. That check was initially missing. A regression now denies a first exposure after coaching revocation, while allowing previously delivered historical advice with current read permission. Session revocation still blocks delivery.
- Staged acceptance initially trusted a disposition captured by an earlier codec. It now rechecks the currently installed policy before accepting the staged transition, so a read-only codec cannot execute a previously prepared stage.
- The original-output reader initially compared only selected advice fields. It now validates all three saved levels against the frozen original projection, including alternatives and every cue field, while returning issued bytes. Unknown action kinds were already rejected by strict round-trip decoding; explicit closed-shape checks add defense without claiming that as a newly discovered bypass.
- Service fixture cleanup now registers before opening/migrating either pool. Failed setup closes opened pools and removes its own schema instead of leaving a partial fixture behind.

## Native database observation

A service-test run on 6 October around 15:44 Toronto failed to connect twice to native PostgreSQL at `127.0.0.1:54331` with Windows `connectex` timeout. Some early tests overlapped because broad test-name patterns also selected older database suites. A later standalone command startup also failed without that overlap. These preliminary failures were observed in tool output; they were not captured as standalone raw files.

The first broad capture is retained as [pre-freeze output](go-full-pre-freeze-native.jsonl) and [manifest](go-full-pre-freeze.json). It passed every other package, including records, but failed `TestLocalServiceAdviceControlDeletionAndRestart` during migration setup with `transaction.body: timeout: context deadline exceeded`. Its 291.9-second duration is not a performance result. It also observed source changes for the final review fixes, so it cannot establish final acceptance. More precise stages now identify pool opening, load, reconciliation, publication and each migration/ledger step; startup only prints whitelisted stage names and error classes, never driver values.

PostgreSQL remained running. Read-only diagnostics at 19:55:34Z connected through Node in 100 ms, observed one idle client with no blockers, and completed in 113 ms; a native pgx connection/query at 19:56:36Z passed in 77 ms. [Node diagnostic source](readonly-db-diagnostic.mjs.txt) and [pgx source](readonly-pgx.go.txt) are retained. Their timing output was tool-captured, not a saved benchmark. The log recorded a checkpoint from 15:42:21 to 15:44:25 (1,121 buffers and 8,144 synchronized files). With `checkpoint_completion_target=0.9`, checkpoint writing is paced; its elapsed duration does not establish stalled I/O or explain a connection failure. No connection cap, blocker or server resource error was observed in the later snapshot. No timeout or PostgreSQL configuration was changed.

Final database suites run serially, including `go test -p=1`. Later passes establish those runs, not the cause or resolution of the intermittent native failure. Keep this operational follow-up open before full M04 activation.

Final cleanup found a leftover idle backend from the early 19:45:41Z canceled-test fixture. Its schema was already absent, no OS TCP client or Go/test process remained, and it held no observed blockers. It was terminated only after matching its PID, exact application name, database, idle state and start-time interval. Three other isolated schemas were tied to the failed setups by their migration times and fixture contents before removal. This improves teardown evidence; it does not establish the original timeout's cause. The final snapshot is empty and the test-started database is stopped.

## Original reference inventory

The unchanged M04B oracle generator inventories every `.ts`/`.json` file under the original server/shared trees. Running its `--check` in the expanded checkout therefore failed: the four new local-service files expand its source array from 251 to 255 entries. [The failed check](oracle-check.json) and [raw output](oracle-check-native.txt) are retained unchanged.

An independent [verification helper](original-reference-check.mjs.txt) checked every original source hash, extracted 267 original tracked files from `bbca6fe`, verified each Git blob and ran the unchanged generator there. That check passed. A second disposable mirror added exactly the four new files and regenerated privately; replacing only its source inventory reproduced the original corpus byte-for-byte. The [manifest](original-reference-manifest.json) and [output](original-reference-native.txt) establish that gameplay, analysis, advice, decisions and session checkpoints did not drift. Neither the original generator nor any checked-in golden was changed to accept a new hash.

## Limits

The service is an explicit local fixture API. The original app is still active, and no production backend or existing UI cutover is claimed. Full match history remains bounded but grows; compact writes do not imply constant-size reads. Review continuations, configurable offers and authored demo remain outside this slice. Jev remains off with zero requests; human review and strategic promotion remain deferred.
