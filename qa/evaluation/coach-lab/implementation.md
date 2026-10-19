# Coach feedback lab implementation and acceptance

Owner authorization: 8 October 2026. Requirement family: LAB-01–LAB-16 and CR-STRAT-011. This record concerns the headless development lab; it does not certify stronger bots, expert labels, paid-provider integration or product UI delivery.

Delivery checkout: `C:\repos\test-jev`, branch `codex/current-game-modules-m02`. The observed base commit was `e60cfb21d706611525197183f16628790025f5ac`; this delivery contains uncommitted files alongside unrelated ongoing game/UI work. Each experiment freezes actual source bytes and its worker binary, rather than claiming the base commit describes the delivered code. No commit or policy promotion was performed by this lab task.

## Delivered workflow

1. Build and freeze a private development manifest with explicit rule, policy, family and work limits.
2. Collect paired full games through the installed native engine. Save each original preparation and complete contextual message before applying its exact selected action.
3. Verify original records, native replay and exact supported facts. Preserve forced, incomplete, failed and semantically unchecked cases.
4. Evaluate bounded batches of play decisions using actor-permitted information and common plausible worlds. Save configuration-specific evidence without changing the original recommendation.
5. Exercise fixture review, or export/import separately obtained offline model and independent human reviews. Keep blind action, cue, complete reason and whole-game retrospective stages separate.
6. Produce readable reports and reproducible gap hypotheses. Independent evidence may support a deterministic rule proposal; it cannot activate that proposal automatically.

The [runbook](README.md) contains executable operator commands. The [reviewer guide](reviewer-guide.md) explains packet assignment, response import and review exposure. The [protocol](protocol.md) documents recovery and evidence identity.

## Acceptance status

This section preserves the original lab delivery receipts. The subsequent first-five-gap Trix extension has its own [acceptance record](trix-gap-acceptance.md), including current rule profiles, a separately executable reasoning candidate and all-phase request comparisons.

`npm run lab:check` passed in **289.1 seconds**, including generated contracts, 25 Node workflow checks, all six selected native packages and both TypeScript projects. Its source graph remained unchanged during execution. Receipt: `.local/evaluation/coach-lab/checks/2026-10-08T22-57-33.235Z.json`; stdout: `checks/operator-check-final-20261008.log` under the same lab directory.

Subsequent changes were limited to Node/TypeScript build preservation and retrospective export. The final focused suite passed **29/29**, both TypeScript projects passed, and generated lab types were current. Log: `.local/evaluation/coach-lab/checks/ts-followups-final-20261008.log`. No native game/collector code changed after the full gate. Real collection, archive evaluation and replay using the frozen build subsequently passed.

The first combined check's native packages passed, but its TypeScript step used a nonexistent root dependency path. The operator now resolves TypeScript from the web workspace; the full command was rerun and passed. An actual C export exposed missing native `winnerIds` support and excessive repeated history. Both were reproduced, fixed and verified against a completed Trix session. Earlier failure receipts remain retained.

## Retained operator examples

All paths below are under `.local/evaluation/coach-lab/`. These are private development examples, not independent strategic trials. The earlier `lab-acceptance-*` and final `lab-handoff-*` runs reuse the same declared seeds for mechanical comparison; do not count them as fresh independent families.

| Final run | Complete episodes | Original decisions | Forced / unforced | Missing contextual reasons |
| --- | --- | ---: | ---: | ---: |
| `lab-handoff-20261008-partners` | Reference and candidate, 10 rounds each | 1,120 | 216 / 904 | 448 |
| `lab-handoff-20261008-trix` | Reference and candidate, 8 deals each | 972 | 386 / 586 | 586 |

- Manifests: `manifests/<run-id>.json`. Reports: `runs/<run-id>/report.md` and `report.json`. Each manifest resolves its preserved source/worker bundle under `builds/`.
- All 2,092 original decisions passed their implemented mechanical checks; contextual fact and explanation semantics remain partly unchecked. Strategic review is still pending for every unforced move. Identical arm outcomes in these examples do not establish a policy gain.
- Spades evaluation stored eight completed conditional diagnostics under configuration `c53a77173c370e9e1bcc4e756f47a4bfdaa41cf628a718bd5780a7c24acb364b`; 80 bidding decisions are unsupported and 1,032 decisions remain pending. This uses only two worlds per stage. A second one-decision configuration tested separation: an unselected report was rejected, and explicitly selecting the original configuration succeeded.
- The Spades fixture batch produced 24 abstentions across eight contexts at USD 0. It does not count as strategic review. There are 560 blank deduplicated human packets under its `human-export/cases/`; no human labels were invented or imported.
- Completed Spades resume succeeded after working-source changes. The exported decision byte digest stayed identical and the total remained 1,120 committed actions: no new recommendations or duplicate actions appeared.
- A blind A packet and a Trix C packet are exported and pending. Their placeholder pin is `unassigned-reviewer/no-call-acceptance`; no actual reviewer model was selected or called. The final Trix packet is `runs/lab-handoff-20261008-trix/review-inputs/manual-4e46b70142679b884f9fede835081306ea565b156cfe2af6e7bb296859fe6200.json`.
- The complete Trix C export retains all 470 executed public actions and 139 saved native ledger entries for its episode, plus native scores/winners. It uses scoped append deltas instead of repeated history/board snapshots. Its compact packet is about 202 KB, below the unchanged 524,288-byte limit. Terminal facts not present in saved pre-action observations are not invented; the last action and native final outcome remain explicit.
- Collection/replay invocations took approximately 23–25 seconds in these examples. Eight-decision and one-decision analysis invocations each took approximately 39–40 seconds, including full archive verification. These are observed runs, not capacity or latency benchmarks.

Machine-readable handoff summary: `checks/handoff-summary.json`. Phase, collection and evaluation receipts are retained in each run directory.

To regenerate the final Spades report, explicitly select its evaluator:

```powershell
npm run lab:report -- --manifest .local/evaluation/coach-lab/manifests/lab-handoff-20261008-partners.json --evaluation-config-hash c53a77173c370e9e1bcc4e756f47a4bfdaa41cf628a718bd5780a7c24acb364b
```

Earlier focused evidence, retained without implying it covers later source changes:

| Check | Observed result |
| --- | --- |
| Full native collector and CLI, all seven installed modes | Passed: collector 287.296s, CLI 0.681s; process watchdog 292.932s. Log: `.local/evaluation/coach-lab/checks/native/2026-10-08-core-lifecycles.log`. |
| Final native admission/replay/export regressions | Passed: collector 13.501s, CLI 0.329s. Log: `.local/evaluation/coach-lab/checks/native/2026-10-08-final-followups.log`. |
| Changed-facts contextual coaching regression | Failed before the fix; afterward all `TestCoachMessage` tests passed in 1.086s. |
| Probability normalization/schema and ESS regressions | Reproduced probability 1.0000000000000002 and false ESS rejection; affected belief/archive checks passed after the fix. |
| Public generated contracts | `node web/scripts/generate-contracts.mjs --check` passed. |
| Operator manifest/message tests | Four tests passed, including explicit Trix V2 admission and strict message schema. |

A separate broader command with a 120-second watchdog expired while collecting a Spades Solo match. It is a timed-out attempt, not a full-suite pass. Its completed belief, continuation and rollout packages do not convert the interrupted collector into acceptance evidence.

## Evidence boundaries and remaining work

- **Collection:** complete Hearts, Spades Solo/Partners and four Trix variants are supported. Basic Trix has 20 deals; Complex Trix has eight. Tarneeb requires a native engine and is rejected explicitly.
- **Comparisons:** Spades has conditional card/suit beliefs and play alternatives; Hearts has play alternatives. The Trix extension adds all-phase native request-end comparisons. Hearts passing and Spades bidding remain unsupported. The two-world sample configs test mechanics only. Population sensitivity APIs exist, but competent unfamiliar-player calibration, actual-deal counterfactual trajectories, incremental caching and latency benchmarks are unfinished.
- **Coaching:** lab records contain action-first cues and complete saved reasons. Existing Spades trace support supplies selected purposes; Hearts currently has an exact final-seat penalty-avoidance case. The Trix reasoning candidate adds contextual reasons; historical baseline explanations remain unchanged. Unsupported explanations become visible gaps. Applying the new presentation to the live app is plan Task 17 and has not been delivered here.
- **Judging:** live dispatch is disabled and authorized spend is USD 0. Fixture responses are abstentions. Offline import is available; this task has not established any model's accuracy or obtained independent human expertise. Retrospective commentary cannot become a decision-time accuracy label.
- **Promotion:** confirmation admission, policy activation, automated learning and model training remain unavailable. A development result cannot bypass the existing independent-label, strength and owner gates.
- **Reproducibility:** `init` preserves exact declared source files and the worker in a build bundle. Run/resume/evaluation verify that bundle, so later working-tree changes cannot replace its policies. Bundles omit installed Node dependencies and are not a complete portable application checkout. A missing or modified frozen build is rejected.
- **Measurements:** wall time and actual process outcomes are recorded. CPU, action latency, external model usage and human learning remain unmeasured.

No browser, database migration, running app, API key or paid model call is required for this workflow.
