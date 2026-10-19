# Pause/session lifecycle implementation ledger

Plan: `docs/superpowers/plans/2026-10-15-pause-session-lifecycle.md`
Authority: `planning/decisions/CR-ARCH-006-pause-presence-and-expiry.md`
Started: 15 October 2026, Toronto. Current checkout `C:\repos\test-jev`; preserve unrelated dirty work. No commit, push or deployment requested.

## Scope and rulings

- Free 300s / Paid 3600s paused expiry, PostgreSQL authority. Redis is future transient caching only; active-authority migration withdrawn.
- Future target: 100,000 concurrent one-human/three-bot games. Staging capacity testing is later work; local tests are not production proof.
- Extend playback request/view with intent/reason and presence endpoint. Backend owns canonical schemas/generated artifacts; frontend consumes the frozen contract.
- Preserve history, creation/financial/coach receipts and coach artifacts. Expiry invalidates resumability and active resources; no historical purge.
- Use current checkout as explicitly requested; no alternate worktree/build or blanket revert. Root integrates, documents and performs visible browser verification.

## Batches

| Batch | Owner | State | Evidence |
|---|---|---|---|
| Backend contracts, fences, cancellation, expiry | pause_backend_impl | Implemented; focused checks passed | [24 passing top-level selected tests](../../../../.local/pause-lifecycle-go-tests.jsonl), [package output](../../../../.local/pause-lifecycle-go-tests.log), [resource race check, 4.406s](../../../../.local/pause-lifecycle-race-tests.log) |
| Frontend lifecycle, suspension, expiry UX | pause_frontend_impl / Root | Implemented; focused checks, recovery, idle autopause and warning layout passed within observed scope | [137 passing focused tests, 1.068s](../../../../.local/pause-lifecycle-final-ui-tests.log), zero failures/cancellations/skips; warning placement checked on all five landscape sizes |
| Distributed assumptions/capacity plan | pause_capacity | Completed within bounded local scope | [Capacity packet](capacity/README.md), [128-game/eight-client evidence](capacity/evidence/2026-10-16T01-48-47-422Z-g128-c8.json); no production sizing claim |
| Integration/build/latest actual server | Root | Latest rebuild loaded; warning layout passed | PID 44092, `.local/cardford.exe`, `index-B-IIS17u.js`, CSS `index-B8-fOB3W.css`; [updated manifest](build-manifest.json), diagnostics off. Recovery/idle-autopause evidence used PID 39256 / `BS-kEy9R`; earlier geometry uses `Ctizdknu` |
| Seven games and built-in phone/tablet/desktop review | Root | Paused geometry and Settings subset passed | [35-capture matrix and links](VERIFICATION.md#seven-mode-paused-layout-captures); broader lifecycle acceptance remains open |
| Independent review and verification report | Root / pause_capacity | Backend review fixes integrated; bounded verification recorded | [Verification report](VERIFICATION.md); final meaningful-input dismissal/reset passed. Broader faults/phases, physical devices, Paid soak and staging remain open. Earlier unexplained close root cause remains unproven |

## Verification boundaries

- Actual local Go service is at port 4174. [Updated manifest](build-manifest.json) identifies PID 44092, binary/asset/source SHA-256 hashes, `B-IIS17u`/`B8-fOB3W` assets and diagnostics off. The successful offline/recovery and idle-autopause captures identify the earlier loaded `BS-kEy9R` bundle; final warning-layout captures identify `B-IIS17u`.
- Prior pause audit is historical baseline only.
- Chromium emulation does not certify physical calls, OS kill/suspension or Safari. Record unavailable hardware tests as not run.
- Database tests use isolated test schemas; never purge the manual-review game or whole account.
- Runtime is deterministic local play with local-test identity, fixture billing/access and Jev off. No runtime model/provider evaluation, hosted identity, live payment, deployment or 100K load is claimed.
- Local `.local/` test logs are linked as existing working-checkout evidence; they are not asserted to be committed artifacts.

## Review checkpoints

- Root reviewed the frontend coordinator and requested fixes for late paused/expired Resume replies, explicit Resume against an old running snapshot, stale unaccepted Resume replay during stop reconciliation, and reopening a suspended transport. Regression cases pass in the focused suite.
- Independent backend review led to fixes for NULL-safe expired reads, completion versus expiry, legacy Resume-only adoption, fresh final deadline checks, foreign-instance renewal rejection, stale generation cleanup, canceled queue admission release and Coach preservation across temporary holds. Manager reaping now cancels preparation work; independent work reaping owns Coach authorization. Selected backend/resource checks passed, including `-race`; this does not establish production latency or capacity.
- [Generated contracts](../../../../.local/pause-final-contracts.log) and [M02A checks](../../../../.local/pause-final-m02a-contracts.log) passed: 212 definitions, 489 actual Ajv fixtures, nine RNG vectors.
- Opt-in WebSocket close diagnostics (`CARDFORD_REALTIME_DIAGNOSTICS=1`) were enabled for the earlier recovery review and are off in the current runtime. They log fixed close stage/class/elapsed-age categories, not credentials or game payloads. A separate focused HTTP `TestRealtime` selection passed in 0.423s as reported by the backend implementation agent; this is not the full HTTP suite.
- Browser coverage is specified in [BROWSER-MATRIX.md](BROWSER-MATRIX.md). Seven-mode paused geometry uses the earlier `Ctizdknu` asset; layout was unchanged in the later recovery fix. Final offline/recovery evidence uses `BS-kEy9R` and is distinguished below.

## Observed browser results

- All seven modes have paused captures at 568×320, 667×375, 844×390, 1024×768 and 1440×900. The 35 JSON records report no horizontal page overflow, dialogs/controls inside the viewport and no broken images. Trix Complex Partners uses the `-final` captures. Settings was opened from pause in all seven modes; the smallest Trix Settings controls were reached by scrolling and the original coaching preference restored.
- A real Free window was observed: server `pausedAt` 21:53:26.590252 and `expiresAt` 21:58:26.590252 Toronto. A return/explicit Resume attempt at 21:58:46.918864 produced `expired`; an actual server restart still displayed the expired outcome. See [sanitized network trace](browser/network.json), label `free-expiry-confirmed-resume`, and [restart capture](browser/free-expiry-after-server-restart.jpg).
- Countdown remount reset was found, fixed and browser-checked: the root observed 3:48 before leaving the dialog and 3:41 on return. [Final capture/text](browser/countdown-remount-fixed.txt) records 3:41; the focused UI log includes the lifecycle receipt-clock regression.
- Root also observed an unexpired Hearts game retain 3:48 after an actual restart and 3:41 after the Settings round trip; the retained countdown did not reset. The [same final countdown capture](browser/countdown-remount-fixed.jpg) records the post-Settings result.
- Hearts portrait-to-landscape and blur/return retained explicit Resume. Spades Partners Why used held state, then released to running only without an interruption; leaving during Why produced persistent away pause. Evidence links are in [VERIFICATION.md](VERIFICATION.md).
- Final rapid offline/online retest on `BS-kEy9R`: [loss capture](browser/final-offline-loss-message.jpg) at 02:16:44 UTC correctly says “Connection lost — play is paused on this device”; the original socket binding was retired immediately. [Network trace](browser/network.json), label `final-offline-recovery`, records paused generation 8 with `connection_lost`, then running generation 9 only after explicit Resume. [Live capture](browser/final-recovery-still-live.jpg) is at 02:17:15; root observed it still live at 02:17:55, about 70 seconds after recovery. This is a bounded successful retest; it does not prove the root cause of the earlier unexplained approximately 51-second close.
- The recovered session then remained running until server idle autopause: generation 9 at 22:16:44.908241 Toronto → generation 10, reason `idle`, at 22:19:14.944468, **150.036 seconds** later. Root observed no unexpected socket close during that interval. [Idle paused capture](browser/final-idle-auto-paused.jpg), [DOM](browser/final-idle-auto-paused.txt), and network label `final-idle-autopause` record the pause and original Free deadline 22:24:14.944468.
- The original idle warning caused 23px vertical overflow at 568×320, preserved in [failure JSON](browser/final-idle-warning.json). The shared fixed floating notice now leaves table, hand and Jacks geometry identical before/during the warning: [fixed smallest-phone evidence](browser/idle-warning-layout-fixed-old-se.json). The four other landscape sizes also have no vertical page overflow; links and remaining scenario boundaries are in [VERIFICATION.md](VERIFICATION.md).
- Final idle-input check passed on `B-IIS17u`: the warning was visible at 02:29:48.159 UTC, Enter played the legal Queen of diamonds, the notice disappeared and the action returned HTTP 200. At 02:30:29, beyond the original idle deadline, the game was still running with a fresh presence lease. [Reset evidence](browser/idle-warning-reset-confirmed.json), [detailed observation](VERIFICATION.md#final-idle-warning-dismissal-check).

## Open acceptance work

1. Retain the unexplained earlier close as an unresolved cause rather than retroactively assigning it to the fixed binding issue. The recovered session stayed running until the expected idle pause after 150.036s; broader handover/half-open/HTTP-only faults and recovery latency targets remain unverified.
2. Keep `offline-message-fixed-old-se` as old-bundle failure/history evidence; its name is not a pass. Use `final-offline-loss-message` for the latest wording check.
3. Record physical iOS Safari/Android Chrome/iPad interruptions, a real Paid one-hour retention/quiescence soak, broader phase/fault coverage and later staging capacity work as not run until actually completed.

This is an implementation/verification checkpoint. No overall acceptance, release-readiness or production-capacity pass is declared.
