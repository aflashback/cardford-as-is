# M02 current-game extraction

Start: `ea09f81c3fe799350dac0d802795892ed4e39e8a`, branch `codex/current-game-modules-m02`. Scope: the owner's next-item instruction, MG-02/MG-03/MG-04/MG-09 preparation. Human strategy review remains deferred. Runtime Jev stays off, requests zero, observed model none.

M02 is complete on the verified integrated source, delivered by the focused commit `refactor: bind current games to registered modules`. M03 validated persistence and prepared work is the next unfinished milestone. The reports identify the pre-commit checkout and the exact tested runtime/source bytes; documentation finalization does not change those bytes.

| Unit | Status | Evidence |
|---|---|---|
| Starting frozen/replay/observation baseline | Passed | 14/14 tests; `baseline.json` |
| Independent original corpus | Captured | 684 legal commands, ten hands, 33 original analysis summaries; expected hashes frozen before facade changes |
| Hearts and both Spades native modules | Implemented | Game-owned state/rules/projections/codecs and exact V2 registrations |
| Parity / compatibility | Passed | Thirteen parity tests; original reducer and observations are independent oracles; all included in final 449/449 acceptance |
| Independent code review | Passed after repairs | Exact finding probes reject; 19/19 final private-codec regressions and 28/28 module/document tests; no outstanding scoped P1/P2 |
| Full acceptance | Passed on Linux/WSL | 449/449; zero failed/skipped/cancelled/todo; Node 24.19.0; same 61 files, unchanged assertions and timing thresholds; `final.json` |
| Windows contracts / typecheck / build | Passed | Each exit code zero; separate host results in `final.json` |
| Preservation / browser boundary | Passed | 47 unchanged files, three frozen original bodies, eight public files, four partnership archive files; 13 reachable browser modules checked |
| V2 persisted/service/client activation | Not run | M03–M04 remain later milestones |

Decisions and compatibility boundaries are in [CR-ARCH-002](../../../../planning/decisions/CR-ARCH-002-current-game-module-extraction.md). No rule/default/policy/history promotion or archived experiment rerun occurs here.

Run targeted parity:

```powershell
node --test --test-isolation=none web/server/tests/module-parity.test.ts
node --test --test-isolation=none web/server/tests/frozen-baseline.test.ts web/server/tests/replay.test.ts web/server/tests/observations.test.ts web/server/tests/rules.test.ts web/server/tests/hearts-plan.test.ts
```

Full verification records exact commands, versions, exit codes and counts in `final.json`. The native snapshot matched 1,137 source/fixture entries and 12,964 installed dependency entries before and after the full run; `native-source-manifest.json` records the source inventory. No dependency installation, assertion change or golden regeneration was used. The matching official Linux Node archive checksum is recorded in `final.json`. Snapshot directories are mode 700 and private environment copies are mode 600; credentials and environment digests are excluded from evidence. The task-owned snapshot and preparation/check helpers remain private local test artifacts.

Earlier failures are retained in `pre-retry.json`, `pre-tunnel.json`, `pre-process.json`, `pre-vm.json` and `pre-native.json`, with exact failures and complete local log hashes. Windows runs passed 445/449, 444/449, 441/449 and 441/449 and hit database connection errors; their exact cause remains unconfirmed. Linux mounted-source testing passed 447/449 with all database cases passing, but two wall-cap fixtures stopped before their intended delayed decisions. Source hashing inside the deadline was identified as a plausible mounted-filesystem contributor; the exact expiry point was not instrumented. On the native copy those fixtures passed 9/9 targeted and in the full suite. This supports filesystem sensitivity; it does not prove the cause of every earlier failure or verify Windows latency.

Temporary SSH tunnels and their route overrides were removed. Automatic approval review rejected an optional VM-address TCP relay because it could expose the database beyond localhost; it was never started. Final acceptance used the existing VM loopback database with no new listener. The saved-game database, `.env.local`, test container configuration and original test override remain unchanged. Live Jev and human evaluation were not run.

Reproduce against the current validated native snapshot (the verifier rejects changed original/copied inputs):

```powershell
$env:M02_TEST_PLATFORM = 'podman-wsl-native'
$env:M02_TEST_ISOLATION = 'none'
node --env-file=.env.local --env-file=.local/m00-test.env qa/implementation/multi-game/m02/verify.mjs final
```

To select the normal host route, set `$env:M02_TEST_PLATFORM = 'windows'` before the same verifier command; its connection limitation above remains unresolved. Existing DB-backed tests use the distinct isolated `cardford_m00_test` database at port 54330. Native codecs validate private state independently of generated public fragments. V1 policy and observation compatibility retains original metadata; unavailable versions return read-only status and never choose a newer policy. V2 persisted load/save/journals, cross-instance prepared-work fencing, HTTP/client activation and a new browser journey remain M03–M04.
