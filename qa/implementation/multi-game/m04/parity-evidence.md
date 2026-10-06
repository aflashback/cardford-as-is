# M04 Hearts parity evidence

This is bounded original-rules/projection evidence, not HTTP activation, a reasoning-policy port, a strategy claim, or a performance comparison. All commands ran on native Windows; no database or benchmark was started by this parity task.

## Frozen independent oracle

`generate-hearts-parity.ts` imports the preserved original TypeScript V1 reducers and observation functions plus the existing safe-view projection. It imports no Go results. Expectations use recursive UTF-16 lexical JSON key ordering and SHA-256 over canonical UTF-8 bytes. Every checkpoint records the full private-state hash and four-actor observation, complete legal-action, candidate-ID and safe-view hashes. Initial state, actual opening and later deals, and every accepted command are retained. Source fingerprints include the exporter itself.

The frozen `hearts-parity-corpus.json` is **701,460 bytes**, SHA-256 **5228fac300405533bd6e3c76a845395272cd3ed94febb6efaadf2d8c6afa5e44**. The initial unaccepted export was replaced once to add the requested no-overwrite exporter guard; this is the final frozen fingerprint. `--write` now refuses to overwrite an existing corpus, and `--check` only compares bytes.

| Case | Commands / exact checkpoints | Independently generated coverage |
|---|---:|---|
| `m04-hearts-seeded-mixed` | 66 / 67 | Complete deterministic mixed hand; 286 sealed-pass candidates per actor; points `[4,3,19,0]` |
| `m04-hearts-moon-tie-then-match` | 333 / 334 | Five reachable hands; left/right/across/hold/left; moon winners 0/1/0/1/0; fourth-hand scores `[52,52,104,104]` remain `hand-end`; fifth-hand `[52,78,130,130]` reaches `match-end`, winner 0 |

The moon construction reverses each actual pass to author valid opening hands, then submits the recorded sealed passes and legal plays through the original reducer. It never patches scores, phase, history or other private state. Existing M02/M02A fixtures remain unchanged. These 401 new checkpoints supplement the full original corpus.

Generation and independent regeneration check:

```powershell
node qa/implementation/multi-game/m04/generate-hearts-parity.ts --write
node qa/implementation/multi-game/m04/generate-hearts-parity.ts --check
```

Both succeeded for the final frozen source. Exact output: `corpus-generated.json` and `corpus-checked.json`. Generation is not a passing Go assertion.

## Initial regression evidence

1. `node scripts/windows-env.mjs go test ./server/internal/compatibility -run TestOriginalCorpus -count=1 -v` initially failed to launch native Go with `EPERM` inside the sandbox. `original-corpus-initial.txt` preserves the environmental failure; no application test ran.
2. The same authorized native command outside that sandbox captured `original-corpus-red.txt`: Hearts exceeded the existing 256-command request budget when its previous first-command-only exemption was removed; both Spades cases passed 210 checkpoints each, and all five Hearts scoring fixtures passed.
3. The parity test now replays complete corpora in 64-command native chunks, reopening the last exact checkpoint each time. Each boundary reimport is compared to the same frozen expected hash and four-actor projections; unique checkpoints are counted once. The production maximum of 256 commands and other execution limits remain unchanged.
4. `node scripts/windows-env.mjs go test ./server/internal/compatibility -run '^TestOriginalCorpus/hearts$' -count=1 -v` then failed at command 1, the first card play: `invalid closed Hearts shape`. `original-hearts-play-red.txt` is the actual missing-play regression evidence.
5. A new-corpus attempt overlapped the engine agent's incomplete edits and did not compile (`checkedState`, `createState`, and other functions not yet present). `new-hearts-corpus-incomplete-port.txt` preserves this intermediate build failure; it is not behavioral red evidence.

## Focused integrated parity

After the first complete Go Hearts port compiled, this native check passed:

```powershell
node scripts/windows-env.mjs go test ./server/internal/compatibility -run '^(TestOriginalCorpus|TestM04HeartsCorpus)$' -count=1 -v
```

`parity-first-integrated.txt` records zero failures or skips: 267 original Hearts checkpoints, 210 Spades Solo, 210 Spades Partners, 67 new mixed Hearts and 334 new moon/tie/match Hearts checkpoints. That is **1,088 unique exact checkpoints across all four actors**, including **668 Hearts checkpoints**, plus five existing Hearts scoring fixtures. Chunk-boundary reimports also matched. No generated expectation changed to make Go pass. The 16.469-second package duration is test diagnostics only.

Final whole-milestone verification after all engine/records edits is recorded separately by the milestone verifier. No database, whole-server suite or benchmark was run by this parity task.
