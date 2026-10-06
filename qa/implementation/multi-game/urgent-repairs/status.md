# Urgent current-system repairs

Starting source: `5ddebc5d9b113cb381c16d7f7c406ab732db8d08`, branch `codex/current-game-modules-m02`. Authority: [CR-FIX-001](../../../../planning/decisions/CR-FIX-001-urgent-system-repairs.md). **Passed: UR-01–06 urgent repair acceptance.** This repairs the current TypeScript app before the remaining M02A Go/PostgreSQL compatibility slice. It does not complete M03–M06 or activate V2, hosting, human evaluation or live Jev.

| Unit | Implemented behavior | Evidence |
|---|---|---|
| UR-01 search work | Count before root/continuation applies; stop at world/candidate boundaries; exclude incomplete paired worlds and report exhaustion truthfully. Identify new summaries as `plan-evaluator-1.1.0`. | [Budget](budget.json): 47 focused checks; default/policy pins unchanged |
| UR-02 active saved state | Strict V1 state/rule decoding and row binding before gameplay/save. Reject corrupt reads/writes atomically without rewriting history or attribution. | Four PostgreSQL regressions; [independent review](state-review.json) accepted 687 original checkpoints across all three modes without changing bytes |
| UR-03 prepared decisions | Claim before computing, reuse ready work, retain immutable issued results, and fence original access/control/revision/expiry after lock waits. Preserve atomic Hearts passing and legacy forced-move attribution. | [Service](service.json), [independent review](service-review.json); real PostgreSQL concurrency/expiry regressions |
| UR-04 accepted outcomes | Recover owned command status and original completed trials before new-work preconditions. Identity-only reads do not depend on readable active state; live session/owner checks remain mandatory. | [Service](service.json); generated identity/status/result routes and owner/session regressions |
| UR-05 client recovery | Bound fetch/body waits at 15 seconds. Preserve validated pending identity for explicit retry/reload, with owner/game/tab binding and a lease fingerprint instead of the token. Clear previous-owner data and fence late responses; preserve anonymous startup and same-command reconnect. | [Client](client.json), [independent review](client-review.json): 8 unit tests; final **35/35** complete table browser suite |
| UR-06 provider deadline | Inner timer expiry ends the whole attempt even before the outer timer/clock observes it. Keep unknown-cost reservations pending and block later accounting/dispatch. | [Deadline evidence](provider-deadline.json), [independent review](provider-review.json): **16/16** fixture tests; zero real calls |

## Final verification

- Full Node/PostgreSQL regression: **493/493 passed**, zero failures/skips/cancellations, 239.3 seconds; [full-tests.json](full-tests.json). All original and new tests ran with unchanged assertions/policy budgets on Node 24.19.0, the existing isolated `_test` database and a private VM-native snapshot. Original/copied source bytes matched before and after. [Source manifest](native-source-manifest.json), SHA-256 `70964dab2d2c6fb6c53acb748a4aa08f5919a70689764887d993573247b6174f`.
- Final Windows frontend/server typecheck, generated-contract check and production build pass. The existing Vite warning for a JavaScript chunk above 500 kB remains; no bundle-size or capacity improvement is claimed.
- Final browser run: **35/35**, 51.1 seconds, Chrome/local Vite, one worker. [Client evidence](client.json) records the command; output is `browser-final-verified`. These are mocked-API browser journeys plus separate real PostgreSQL service tests, not a new live full-browser/service campaign.
- [Preservation](preservation.json): **923 original files** and **85 existing public definitions** unchanged. Two additive closed definitions: `CommandStatusView` and `IdentityView`. Original rules, default/frozen policies, archives, first five migrations, assets and lockfile remain preserved. Repeat with `node qa/implementation/multi-game/urgent-repairs/verify-preservation.mjs`.
- [Integration checks](integration.json) bind final commands to source; [documentation links](doc-links.json) check local targets. Independent reviews retain initial findings and their fixes.

## Retained failures and limits

The first integrated run passed **490/491**, with an existing timeout test reporting `transport-failure` instead of `deadline`. Its [report](full-tests-initial.json) and [manifest](initial-native-source-manifest.json) remain saved. A controlled-clock test reproduced the race; UR-06 fixes it without relaxing deadlines/assertions. Red/green checks also caught budget overshoot, invalid persistence, lock-wait expiry, stale owner data, anonymous startup and a hidden pending request after reconnect.

Earlier Windows PostgreSQL checks had connection timeouts, retained in `service.json`; Linux acceptance cannot establish Windows connectivity/latency. One interrupted browser run had a finite-demo click timeout whose cause was not established. The unchanged demo subsequently passed a focused rerun and the final suite. Interrupted runs are not acceptance. Early test-harness import/setup errors and a restricted esbuild spawn failure were resolved separately from application defects.

Forward migration **006-preparation-attempts.sql** uses the existing startup migration runner. This turn applied it only in isolated test schemas; saved-app database configuration/data were not migrated. No new hosting infrastructure or providers were enabled.

Active V1 validation still scans retained history under the owner lock. Complete platform/history schemas, V2 activation, compact snapshots/append-only history and safe historical read-only journeys remain M03–M04. Durable admission does not forcibly stop CPU work; general worker isolation, whole-pipeline sampling/memory/cancellation and resource evidence remain M04–M06. If browser storage is unavailable, pending requests survive only in memory until tab close. No production-capacity, strategy-strength, learning or hosted-launch claim follows from this slice.

## Next implementation

Resume the remaining [M02A checklist](../../../../planning/implementation/multi-game/backend-readiness.md#m02a--backend-contract-and-compatibility-slice): freeze portable contracts/tooling and prove one bounded Go/PostgreSQL slice against original TypeScript fixtures plus these regressions. Preserve React/Vite and policy/evidence attribution. Human evaluation, live Jev, hosting and native packaging retain separate later gates.
