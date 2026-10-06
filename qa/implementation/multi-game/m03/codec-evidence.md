# M03 contract / compact codec evidence

Native toolchain: `node scripts/windows-env.mjs` (pinned Go 1.26.8).

Observed red before compact persistence implementation:

Command: `node scripts/windows-env.mjs go test ./server/internal/games/spades -run TestStorageSnapshotSeparatesEvents -count=1`

```text
--- FAIL: TestStorageSnapshotSeparatesEvents (0.00s)
    storage_test.go:21: validated snapshots do not yet expose compact persistence
FAIL
FAIL cardford/server/internal/games/spades 0.293s
```

The initial sandbox launch hit Windows `spawnSync go.exe EPERM`; the real regression failure above came from the approved native wrapper execution. The line number refers to the test before gofmt.

Observed final focused evidence:

- `node scripts/windows-env.mjs go test ./server/internal/records -run TestRecord -count=1 -v`: passed; saved output `codec-tests.txt` and growth measurements `codec-growth.json`.
- Subsequent access-unit binding test: `node scripts/windows-env.mjs go test ./server/internal/records -short -run TestRecord -count=1`: passed, package reported 1.253s.
- Independent original corpus expectations were read from `web/server/tests/fixtures/legacy-module-document.json`, never regenerated. Both complete Spades modes retained the frozen final hashes. Hearts test preserves all four sealed-pass knowledge projections and rejects unsupported later play.

Growth measures payload/serialization bytes, not PostgreSQL disk pages or a capacity tier. Durations are observations on the local machine and may include concurrent test work. Exact all-four-seat original projections match at 1, 10 and 100 hands. New decisions store packet version/digest and exact original analysis/advice bytes; they do not repeat full observation packets.

Explicit limits: archive at most 100,000 events and 16 MiB payload; compact state at most 256 KiB. The frozen V1 policy packet contains all prior events, so compatible reads load that append-only archive once at the explicit import/projection boundary. This work removes duplicate history writes; it does not claim constant historical read cost. `ReadLegacyState` preserves supported original V1 state bytes read-only; importing a complete old TypeScript platform document still requires its original reader. Only trusted exact module readers are accepted, and storage policy registrations do not establish runtime policy implementation or strength.
