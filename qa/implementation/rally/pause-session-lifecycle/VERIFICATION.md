# Pause/session lifecycle verification

15 October 2026 Toronto / 16 October UTC. **Pause/expiry is implemented with bounded local verification.** The final offline/recovery retest, real Free expiry, seven-mode landscape pause review and 150.036-second idle autopause passed their observed scenarios. Physical devices, broader faults/phases, long soaks and staging capacity remain separate acceptance work. This is not a production release sign-off.

Authority: [CR-ARCH-006](../../../../planning/decisions/CR-ARCH-006-pause-presence-and-expiry.md). Requirements/scenarios: [design](../../../../docs/superpowers/specs/2026-10-15-pause-session-lifecycle-design.md). Progress: [implementation ledger](IMPLEMENTATION.md).

## Source, runtime and evidence boundary

| Item | Observed checkpoint / limit |
|---|---|
| Checkout | `C:\repos\test-jev`; uncommitted implementation plus unrelated existing changes; no commit, push or deployment requested |
| Runtime | Local Go/PostgreSQL and deterministic bots; local-test identity, fixture billing/access, Jev off. No runtime model ID/provider result applies |
| Actual server | PID 44092, `C:\repos\test-jev\.local\cardford.exe`, actual local service on port 4174; [updated manifest](build-manifest.json) records binary/source/asset SHA-256 hashes and current runtime details |
| Earlier geometry build | All 35 selected paused-layout captures record `index-Ctizdknu.js`; layout remained unchanged by the later recovery fix |
| Verified recovery/idle build | Saved offline/recovery/idle JSON captures identify `index-BS-kEy9R.js` on the earlier PID 39256. Final warning-layout captures use `index-B-IIS17u.js` / CSS `index-B8-fOB3W.css`, identified in the updated manifest; meaningful-input dismissal is recorded separately |
| Review diagnostics | Opt-in safe WebSocket close stage/class/age categories were enabled with `CARDFORD_REALTIME_DIAGNOSTICS=1` for the earlier recovery review; diagnostics are off in the current runtime. No credentials, owner identifiers or game payloads are logged by this new diagnostic |
| Capacity snapshot | [Immutable report](capacity/evidence/2026-10-16T01-48-47-422Z-g128-c8.json) contains HEAD, source hashes and records-package fingerprint from its run. Later integration fixes were not load-tested again |
| Test storage | Random schemas in the separate loopback `_test` database; no manual-review database/game purge |
| Browser tooling | Visible built-in Chromium browser, viewport changes and controlled browser events. CSS geometry is not physical device/Safari certification |
| Evidence retention | Browser JPG/JSON/TXT files are under [browser/](browser/); sanitized route/lifecycle trace is [network.json](browser/network.json). Existing `.local/` logs are working-checkout artifacts and may not be committed |

Capture checks establish page/dialog/control bounds and broken-image status for the captured state. They do not establish CPU cancellation, request quiescence, timer accuracy, full accessibility or behavior in every phase.

## Checks actually run

| Check | Result and evidence |
|---|---|
| Focused Go records/service/contracts selection | **Passed:** 24 top-level tests in [JSONL](../../../../.local/pause-lifecycle-go-tests.jsonl). [Package output](../../../../.local/pause-lifecycle-go-tests.log) also passes. The HTTP package reports **no tests selected** for this filter; do not describe this as its complete test suite |
| Separate focused HTTP selection | **Passed as reported by backend implementation agent:** `TestRealtime`, 0.423s, after opt-in close diagnostics were added. This is a focused selection, not the full HTTP suite |
| Service resource tests with race detector | **Passed:** 4.406s, [log](../../../../.local/pause-lifecycle-race-tests.log) |
| Focused frontend suite | **Passed:** 137 tests, zero failed/canceled/skipped, 1.068s, [recorded log](../../../../.local/pause-lifecycle-final-ui-tests.log). The later idle-warning styling passed its five-size browser layout retest |
| Generated contract artifacts | **Passed:** [log](../../../../.local/pause-final-contracts.log) |
| M02A contract/fixture checks | **Passed:** 212 definitions, 489 actual Ajv fixtures, nine RNG vectors, [log](../../../../.local/pause-final-m02a-contracts.log) |
| Frontend production build and actual load | **Passed locally within recorded scope:** saved recovery/idle captures use `BS-kEy9R`; the newer loaded `B-IIS17u` warning-placement build is recorded in the [manifest](build-manifest.json) and passed its five-size warning-layout check. Broader browser/device acceptance remains partial |
| Bounded records lifecycle workload | **Passed on captured snapshot:** 128 games, eight clients, three renewal rounds; [report](capacity/evidence/2026-10-16T01-48-47-422Z-g128-c8.json), [method and limitations](capacity/README.md) |

Exact recorded backend commands:

```powershell
node scripts/windows-env.mjs go test ./server/internal/records ./server/internal/service ./server/internal/http ./server/internal/contracts -run 'Test(SessionLifecycle|SessionResources|RealtimePlayback|RealtimeLazyProjectionAndErasure|Scheduler|M03CanonicalMigrationPins|.*Contract.*)' -count=1 -timeout=120s
node scripts/windows-env.mjs go test -race ./server/internal/service -run 'TestSessionResources' -count=1 -timeout=120s
npm run contracts:check
node scripts/windows-env.mjs node scripts/m02a-contracts.mjs --check
node scripts/windows-env.mjs node qa/implementation/rally/pause-session-lifecycle/capacity/run.mjs --games=128 --clients=8 --rounds=3
```

Exact recorded frontend selection:

```powershell
node --test --test-isolation=none web/tests/session-lifecycle.test.ts web/tests/pause-lifecycle.test.ts web/tests/playback-lifecycle.test.ts web/tests/session-resources.test.ts web/tests/table-lifecycle-resources.test.ts web/tests/realtime-stream.test.ts web/tests/client-recovery.test.ts web/tests/go-pending.test.ts web/tests/trick-playback.test.ts web/tests/rally-coach-client.test.ts web/tests/rally-coach-auth-cleanup.test.ts web/tests/rally-coach-presentation.test.ts
```

Backend passing cases include late renewal, paid policy pinning, sweep/Resume race and preserved history, time after owner-lock wait, legacy/completion behavior, in-flight/queued bot fencing, foreign-replica reads, human-wait runner release, eager queued-admission release, actual callback cancellation, concurrent admission, bounded cleanup, retired-runner Coach preservation and control takeover. Test callback deadlines are bounded regression assertions; they are not measured production p99 distributions.

The records workload observed fresh-renewal p99 of 2.81–3.64ms across three bursts. Two stores reported 128 unique expiries in 35 calls with zero duplicates, approximately 120.75ms fixture drain time. It preserved 128 game rows, cleared all active pointers and left zero acquired SQL connections. The fixture generated no bot/Coach work and did not exercise HTTP, WebSockets, service reaping, CPU capacity or sustained traffic. It cannot estimate a production server count.

## Seven-mode paused layout captures

**Passed for the captured paused surface:** all 35 selected JSON records have `noHorizontalPageOverflow`, `dialogsInside`, `controlsInside` and `noBrokenImages` true. All use `Ctizdknu`. Each image has a same-basename `.json` geometry record and `.txt` DOM snapshot.

| Mode | 568×320 | 667×375 | 844×390 | 1024×768 | 1440×900 |
|---|---|---|---|---|---|
| Hearts Solo | [JPG](browser/hearts-old-se-paused.jpg) | [JPG](browser/hearts-se-paused.jpg) | [JPG](browser/hearts-iphone12-paused.jpg) | [JPG](browser/hearts-ipad-paused.jpg) | [JPG](browser/hearts-desktop-paused.jpg) |
| Spades Solo | [JPG](browser/spades-solo-old-se-paused.jpg) | [JPG](browser/spades-solo-se-paused.jpg) | [JPG](browser/spades-solo-iphone12-paused.jpg) | [JPG](browser/spades-solo-ipad-paused.jpg) | [JPG](browser/spades-solo-desktop-paused.jpg) |
| Spades Partners | [JPG](browser/spades-partners-old-se-paused.jpg) | [JPG](browser/spades-partners-se-paused.jpg) | [JPG](browser/spades-partners-iphone12-paused.jpg) | [JPG](browser/spades-partners-ipad-paused.jpg) | [JPG](browser/spades-partners-desktop-paused.jpg) |
| Trix Basic Solo | [JPG](browser/trix-basic-solo-old-se-paused.jpg) | [JPG](browser/trix-basic-solo-se-paused.jpg) | [JPG](browser/trix-basic-solo-iphone12-paused.jpg) | [JPG](browser/trix-basic-solo-ipad-paused.jpg) | [JPG](browser/trix-basic-solo-desktop-paused.jpg) |
| Trix Basic Partners | [JPG](browser/trix-basic-partners-old-se-paused.jpg) | [JPG](browser/trix-basic-partners-se-paused.jpg) | [JPG](browser/trix-basic-partners-iphone12-paused.jpg) | [JPG](browser/trix-basic-partners-ipad-paused.jpg) | [JPG](browser/trix-basic-partners-desktop-paused.jpg) |
| Trix Complex Solo | [JPG](browser/trix-complex-solo-old-se-paused.jpg) | [JPG](browser/trix-complex-solo-se-paused.jpg) | [JPG](browser/trix-complex-solo-iphone12-paused.jpg) | [JPG](browser/trix-complex-solo-ipad-paused.jpg) | [JPG](browser/trix-complex-solo-desktop-paused.jpg) |
| Trix Complex Partners | [JPG](browser/trix-complex-partners-old-se-paused-final.jpg) | [JPG](browser/trix-complex-partners-se-paused-final.jpg) | [JPG](browser/trix-complex-partners-iphone12-paused-final.jpg) | [JPG](browser/trix-complex-partners-ipad-paused-final.jpg) | [JPG](browser/trix-complex-partners-desktop-paused-final.jpg) |

Settings opened from pause in all seven modes: [Hearts](browser/hearts-old-se-settings.jpg), [Spades Solo](browser/spades-solo-paused-settings.jpg), [Spades Partners](browser/spades-partners-paused-settings.jpg), [Trix Basic Solo](browser/trix-basic-solo-paused-settings.jpg), [Trix Basic Partners](browser/trix-basic-partners-paused-settings.jpg), [Trix Complex Solo](browser/trix-complex-solo-paused-settings.jpg), [Trix Complex Partners](browser/trix-complex-partners-paused-settings-final.jpg). At the smallest size, the [Trix Settings bottom controls](browser/trix-old-se-settings-bottom-reachable.jpg) were reached by scrolling; the original “After the hand” coaching preference was restored. Settings may scroll internally; this is an accessibility observation, not a claim that every Settings control fits simultaneously in 320px height.

These captures do not cover every mode/phase combination. Passing, bidding, request choice, doubling, trick collection, Jacks, round/results, Why and pending commands still need a complete cross-phase interruption matrix. The planned 592×579 pane and additional tablet sizes are not established by the five-size set above.

## Lifecycle observations and open defects

| Observation | Result / evidence |
|---|---|
| Real Free five-minute expiry | **Passed for one observed window.** [Network trace](browser/network.json), label `free-expiry-confirmed-resume`: `pausedAt=2026-10-15T21:53:26.590252-04:00`, `expiresAt=21:58:26.590252-04:00`; return/explicit Resume attempt at `21:58:46.918864-04:00` returned `phase=expired`, `running=false`. No new deadline was granted |
| Expired game after actual server restart | **Passed:** [JPG](browser/free-expiry-after-server-restart.jpg), [JSON](browser/free-expiry-after-server-restart.json), [DOM](browser/free-expiry-after-server-restart.txt); network trace still reports the original pause/expiry at 21:59:54.706062 Toronto |
| Unexpired Hearts game after actual restart | **Passed observed subset:** root observed 3:48 remaining after restart, then 3:41 after opening/closing Settings. [Final countdown JPG](browser/countdown-remount-fixed.jpg) and [DOM](browser/countdown-remount-fixed.txt) record the post-Settings result. This is a real unexpired restart/countdown check; it does not cover BFCache or every mode |
| Countdown remount reset | **Found, fixed, and retested.** [Failure capture](browser/free-deadline-stale-countdown-found.jpg); root observed 3:48 before leaving the pause dialog, then 3:41 on return. [Fixed DOM](browser/countdown-remount-fixed.txt) records 3:41; [JPG](browser/countdown-remount-fixed.jpg), [JSON](browser/countdown-remount-fixed.json). UI regression log includes receipt-clock survival across identical receipts/dialog remount |
| Hearts portrait and landscape return | **Passed for observed browser case:** [portrait](browser/hearts-portrait-paused.jpg), [landscape return](browser/hearts-landscape-return-paused.jpg); explicit Resume retained |
| Hearts blur/away return | **Passed for observed browser case:** [JPG](browser/hearts-away-blur.jpg), [DOM](browser/hearts-away-blur.txt); trace label `hearts-blur-return` includes server pause reason `away` |
| Spades Partners Why hold/release | **Passed for observed case:** [Why JPG](browser/spades-partners-why-open.jpg), [DOM](browser/spades-partners-why-open.txt); trace label `spades-partners-why-hold-release` includes held generation 5 followed by running generation 6 on release |
| Away during Why | **Passed for observed case:** [JPG](browser/spades-partners-away-during-why.jpg), [JSON](browser/spades-partners-away-during-why.json); trace includes held to paused with `away`, requiring explicit Resume |
| Offline wording | **Passed final observed browser case on `BS-kEy9R`:** [JPG](browser/final-offline-loss-message.jpg), [JSON](browser/final-offline-loss-message.json), [DOM](browser/final-offline-loss-message.txt), at 02:16:44.639 UTC, show “Connection lost — play is paused on this device.” The original binding was retired immediately. [Old-bundle DOM](browser/offline-message-fixed-old-se.txt) remains failure/history evidence, despite its filename |
| Rapid offline-online recovery | **Passed bounded retest:** [network trace](browser/network.json), label `final-offline-recovery`, records `connection_lost` pause generation 8 at 22:16:44.762887 Toronto, followed by generation 9 `running` only after explicit Resume. [Live JPG](browser/final-recovery-still-live.jpg)/[JSON](browser/final-recovery-still-live.json) at 02:17:15 UTC show the earlier live checkpoint; root observed it still live at 02:17:55, approximately 70 seconds after recovery. This does not prove the root cause of the earlier unexplained approximately 51-second close, nor certify every recovery/fault case |
| Earlier unexplained disconnect | **Cause unproven:** retain [investigation capture](browser/recovery-repause-investigation.jpg) and trace label `unexpected-close-without-new-offline`. Do not retrospectively assign a confirmed cause from a later successful retest. New opt-in close diagnostics support further observation |
| Real idle automatic pause | **Passed observed timing/behavior:** running generation 9 at 22:16:44.908241 Toronto → paused generation 10 with reason `idle` at 22:19:14.944468, **150.036s** later, [network trace](browser/network.json), label `final-idle-autopause`. Original Free pause deadline is 22:24:14.944468. [JPG](browser/final-idle-auto-paused.jpg), [JSON](browser/final-idle-auto-paused.json), [DOM](browser/final-idle-auto-paused.txt) show explicit Resume and “Paused after inactivity.” Root observed no unexpected socket close during the full active interval |
| Idle warning layout | **Passed after fix:** original [failure JSON](browser/final-idle-warning.json) records 23px vertical overflow. App/Trix now use one fixed floating notice. [Final 568×320 JSON](browser/idle-warning-layout-fixed-old-se.json) records identical table, Jacks and hand geometry before/during the warning, with `scrollHeight=320`; [JPG](browser/idle-warning-layout-fixed-old-se.jpg). The SE, iPhone 12, iPad and desktop captures with the same prefix also retain scroll height equal to viewport height. Meaningful-input dismissal is recorded separately below |
| Paid real-time window and long quiescence | **Not run.** Paid policy is covered by isolated backend tests; no real one-hour browser/resource soak exists in this packet |

The real Free expiry observation proves that original deadline and non-resumption survived the observed wait/restart. It does not by itself prove zero background CPU/requests throughout the wait, resource p99, every expiry race or every entitlement policy.

## Scenario coverage

“Partial” means the named subset passed while other required cases remain open. A unit test or screenshot does not turn the entire scenario into a browser/device pass.

| Scenario | Current evidence and remaining work |
|---|---|
| S01 Manual Pause | **Partial:** seven-mode paused surfaces and selected server fences passed; complete phase/timing matrix remains |
| S02 Unsupported portrait | **Passed observed Hearts browser case:** portrait/landscape links above; physical rotation and every mode/phase not certified |
| S03 Split view / undersized layout | **Not fully run:** five supported landscape sizes captured; actual split view, keyboard/foldable and 592×579 pane not established |
| S04 Tab/minimize away | **Partial:** Hearts browser blur/away and away during Why passed; full native tab/minimize matrix remains |
| S05 Phone app switch | **Not run on physical hardware** |
| S06 Screen lock | **Not run on physical hardware** |
| S07 Calls/system overlays | **Not run on physical hardware;** no claim of reliable phone-call detection |
| S08 Visible game loses focus | **Partial:** browser blur/return passed; multi-window/physical iPad focus matrix remains |
| S09 Freeze/discard/crash/power loss | **Partial:** silent lease/final-fence tests passed; actual OS/browser kill and discard faults not run |
| S10 Reload/BFCache/reopen | **Partial:** actual expired and unexpired Hearts restart observations passed; full BFCache, reopen and other-mode matrix remains |
| S11 Offline/airplane mode | **Passed observed browser subset:** final loss wording and rapid offline/online recovery; physical airplane mode not run |
| S12 Handover/socket close/half-open | **Partial:** final recovered session stayed running until expected idle pause after 150.036s with no unexpected socket close observed; earlier unexplained close cause remains unproven; actual handover/half-open fault coverage remains |
| S13 API/DNS/TLS/captive portal failure | **Not run as live browser faults** |
| S14 Restart/maintenance/overload | **Partial:** real expired-game restart plus backend fences passed; overload/regional outage not tested |
| S15 Healthy HTTP / unavailable WebSocket | **Partial:** deterministic transport/recovery selection and final ordinary offline/online retest passed; isolated WebSocket-only failure with healthy HTTP remains unverified |
| S16 Lost stop acknowledgement/Resume race | **Partial:** focused receipt and stale-intent tests passed; complete live acknowledgement-loss race not run |
| S17 Control takeover | **Partial:** backend control/foreign-replica checks passed; full two-tab/device user flow remains |
| S18 Auth/access/deletion | **Partial:** selected authorization/erasure/control tests passed; complete browser revocation/account deletion matrix remains |
| S19 Settings/Coach/Why hold | **Passed observed subset:** Settings in seven modes, Spades Partners Why hold/release and away interruption; other phases/modes remain |
| S20 Visible idle | **Passed observed browser subset:** real 150.036s automatic pause; warning displacement found, fixed and retested on all five landscape sizes with identical smallest-phone table/hand/Jacks geometry. Legal input dismissed the warning and reset the idle deadline, as recorded below |
| S21 Before/at/after expiry | **Partial:** real Free after-deadline Resume/restart passed, exact boundary isolated checks passed; real Paid window not run |
| S22 Tier/policy/duplicate signals | **Partial:** isolated paid pinning, duplicate renewal/pause and legacy tests passed; full live tier/device matrix remains |
| S23 Drag/queued move/fourth-card/pending command | **Partial:** focused presentation/command regression suite passed; all-mode live interruption matrix remains |

## Requirement disposition

| Functional requirement | Current disposition |
|---|---|
| PL-F01 Shared coordinator | **Partial:** source/focused tests and seven-mode paused captures passed; all phases/scenarios not completed |
| PL-F02 Immediate local block/presentation | **Partial:** observed pause/portrait/away and focused presentation tests; event-to-paint/audio/drag timing not comprehensively measured |
| PL-F03 Honest connection/pause states | **Passed observed final loss/recovery case;** broader reachability/fault classification remains partial |
| PL-F04 Authenticated stop/receipts | **Focused checks passed;** live lost-ack matrix remains |
| PL-F05 Foreground/generation final fences | **Focused SQL/service checks passed;** broad live transport/device faults remain |
| PL-F06 Cancel/release/suspend | **Focused resource/race checks passed;** end-to-end fault/load and long quiescence evidence remains |
| PL-F07 Reconcile and explicit Resume | **Partial:** focused stale-intent/epoch checks and final rapid recovery/explicit Resume passed; broader fault/acknowledgement matrix remains |
| PL-F08 Fixed server pause metadata | **Passed observed Free window and focused duplicate/boundary tests;** real Paid window remains |
| PL-F09 No resume/resurrection after expiry | **Passed observed Free/restart and isolated history/fence checks.** Historical payloads deliberately retained under ADR-006; no generic purge authorized |
| PL-F10 Verified policy/configuration | **Focused checks passed:** defaults Free 300s/Paid 3600s, verified provenance/pinning and legacy handling; hosted commercial integration outside this task |
| PL-F11 Paused Settings/chooser/Why/presentation | **Partial:** seven-mode Settings and Spades Partners Why observed; full fourth-card/all-phase browser matrix remains |
| PL-F12 Retention classes | **Scope preserved:** active expiry leaves historical/financial/Coach receipts intact; new support/history retention programs not implemented |
| PL-F13 Redis authority | **Not applicable to approved delivery:** Redis authority rejected; no Redis dependency tested |
| PL-F14 Redis completion/archive transfer | **Deferred/not run:** no new archive-transfer subsystem; SQL completion/expiry preservation has focused tests |
| PL-F15 Observed diagnostics | **Limited scope:** sanitized lifecycle/network evidence and fixed backend diagnostic categories; no claim of phone-call/network-cause inference or new support-capture system |
| PL-F16 Replay/training boundary | **Deferred intentionally:** no new paid replay library, learning export or training pipeline enabled |

| Nonfunctional requirement | Current disposition |
|---|---|
| PL-N01 Responsiveness | **Not benchmarked:** static geometry and observed behavior do not establish 100ms p95 |
| PL-N02 Stop correctness | **Focused fence/race checks passed;** complete browser/device failure matrix remains |
| PL-N03 Stop latency | **Not measured end to end at pilot load:** records latency excludes HTTP/network/client timing |
| PL-N04 Worker release | **Bounded regression/race checks passed;** callback cancellation/admission and human-wait release tested; production p99/fault-load measurement not run |
| PL-N05 Quiescence | **Partial:** source/resource checks and zero acquired fixture connections; five-minute/one-hour CPU/request quiescence soak not established |
| PL-N06 Expiry | **Logical Free expiry/restart and isolated boundary/sweep checks passed;** physical historical-data purge not authorized; cleanup-lag p99 not measured |
| PL-N07 Recovery | **Partial:** bounded final recovery passed with explicit Resume; two-second p95 pilot-load latency and full fault matrix not measured |
| PL-N08 Bounded memory | **Partial:** finite admission tests and small records measurements; worst full Trix package/slow-consumer budget not measured |
| PL-N09 Privacy/authority | **Selected contract/authorization/erasure tests passed;** no full hosted privacy/export/backup-deletion certification |
| PL-N10 Durability | **Observed expired restart passed;** no hosted crash/failover durability campaign or Redis mode |
| PL-N11 Mobile UX | **Geometry subset passed:** 35 paused captures; physical Safari/Android/iPad, screen-reader and full motion/input matrix not run |
| PL-N12 Operations | **Bounded local packet only:** reconnect storms, sustained SQL/WAL/cleanup and 100K staging capacity remain later work |

## Final idle-warning dismissal check

On the final `B-IIS17u` build at 844×390, explicit Resume occurred at 02:27:37 UTC. The warning was confirmed visible at **02:29:48.159 UTC**. Pressing Enter on the legal Queen of diamonds cleared it and produced an HTTP 200 action response; the next visible state showed the Queen on the Jacks board and subsequent bot plays. [Immediate capture](browser/idle-warning-dismissed-by-play.jpg), [DOM](browser/idle-warning-dismissed-by-play.txt).

At **02:30:29 UTC**, 41 seconds after that input and after the original 150-second idle deadline, the warning remained hidden and the game still ran. The latest presence receipt at 02:30:26.542 UTC was running generation 15 with a fresh foreground deadline. [Reset confirmation JPG](browser/idle-warning-reset-confirmed.jpg), [JSON](browser/idle-warning-reset-confirmed.json), [network trace](browser/network.json), labels `idle-warning-dismissed-by-play` and `idle-warning-reset-confirmed`. Collection labels batch previously uncollected events; use their event/server timestamps to distinguish earlier attempts.

This establishes warning dismissal/reset for one observed Trix Complex Partners input. The shared idle coordinator has focused regression coverage; this does not claim an exhaustive physical-touch or every-mode input matrix. The earlier attempts that passed the warning's 30-second deadline correctly reached automatic pause and were not counted as dismissal passes.

The actual review tab remains open at `http://127.0.0.1:4174/`. Temporary viewport emulation was reset. Its normal 455×547 pane shows the expected portrait gate; widen the pane to landscape to review the game. The server was left manually paused at generation 16, with the original Free expiry at 02:35:37.934 UTC. [Final default-pane capture](browser/final-review-ready.jpg), [context](browser/final-review-ready.json). If reviewing after that deadline, choose a new game.

## Evidence preservation and release follow-ups

1. Preserve the final loaded-build, 137-test and rapid offline/online evidence as a bounded pass. Keep earlier failed/old captures as history; the unexplained approximately 51-second close's cause is not proven by the successful retest.
2. Preserve the failed warning capture and final fixed-layout evidence separately. Automatic pause, its original retention deadline and no table displacement/vertical overflow have passed; meaningful-input dismissal is recorded in the final addendum.
3. Finish unrun local phase/fault cases before marking their scenarios complete, including isolated WebSocket/HTTP failures, half-open channels and lost acknowledgements. The 35 older paused-layout screenshots and 150.036-second recovered active interval are not substitutes for that matrix.
4. Keep physical device interruption tests, real Paid one-hour retention/resource soak and staging capacity tests **not run** until separately performed. Staging must measure API/WS capacity per server, deterministic bot decisions/s/CPU, SQL/WAL/pools, memory and recovery/expiry storms before estimating replicas with headroom; see [capacity plan](capacity/README.md).

These are local implementation results, not production-capacity or physical-device certification.
