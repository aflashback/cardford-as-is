# Trix implementation ledger

Plan: [7 October four-variant plan](../../../docs/superpowers/plans/2026-10-07-trix-four-variants.md). Rules: [owner-approved specification](../../../docs/rules/trix.md).

Owner authorization, 7 October 2026: complete native Trix Basic Solo, Basic Partners, Complex Solo and Complex Partners; make it work before later review/optimization; maintain proper core architecture; executable checks capped at 30 minutes; record reusable new-game instructions. Coach feedback-pipeline planning is explicitly outside this implementation.

Installed pins: four `trix-<variant>-1.0.0` rule profiles, module `2.0.0`, state/observation/public/event schemas `1.0.0`, and deterministic policy `trix-deterministic-1.0.0` version `1.0.0`. Historical draft IDs and saved records retain their original meanings.

## Scope rulings

- Use the existing `codex/current-game-modules-m02` delivery checkout. The plan and latest table work are uncommitted there; a new worktree from HEAD would omit the owner's current inputs. Preserve those edits and do not merge/push or commit unrelated work.
- Deliver the complete rules, deterministic baseline bots, basic saved advice, native storage/service, and usable table first. Improved rollout policy, feedback-lab adapters, 48 strategic contrast cases, comparative strength studies and independent human labels remain subsequent work. Functional acceptance never implies strategic strength.
- Keep the public Trix presentation and actions as their own registered types. Reuse the platform command, identity, lease, access, persistence and worker paths. Do not force Trix into legacy Spades/Hearts views or introduce a second Node referee.
- Share one compiled Go Trix module across four pinned profiles. One request/deal is the access unit; Basic sessions contain 20 requests and Complex sessions 8. No new database service or schema migration is expected.
- Use the existing process-tree watchdog with one cumulative deadline of at most 1,800 seconds per acceptance invocation. Timed-out, skipped or missing checks are unverified. Narrow checks run during implementation; final acceptance records exact commands and durations.
- Default `npm run test:trix` and the runner without arguments use core checks: contracts, UI units, full-session engine rules, native service, current-game regression, Go-targeted client build and artifact scanning. Run `browser-basic` and `browser-complex` separately for the two variants in each family. `browser` runs all four; `all` combines core checks with that full resource campaign under the unchanged 1,800-second ceiling.
- The combined run failed after 28m19s with core gates passed. Both Complex browser sessions completed all eight requests in about seven minutes each. Both Basic sessions completed nineteen requests and part of the twentieth before the 1,620-second per-test timeout. The same original Basic games subsequently passed twenty-request/four-kingdom terminal results, winners, card conservation, paused reload, earliest original saved cues and responsive screenshots in an 18.355-second corrective probe. This verifies Basic completion across restart, not uninterrupted new full-session browser passes. Late-session runtime increased, but its cause remains unprofiled. The combined 30-minute resource gate remains unpassed; further optimization and feedback-pipeline work remain deferred, with validation preserved.
- A selected-request historical-review defect was fixed and verified: full canonical archive replay remains intact, while actor packets and frames for later discarded requests are omitted. The twenty-request regression preserves byte-identical original frames. The final unchanged-source core run passed in 77.654 seconds; the normal app on 4174 runs that binary with the preserved Partners resource policy and providers off.
- The plan's second fixture browser session per variant remains a reproducible follow-up; private fixture sequence/restart/isolation has separate engine and native-startup tests. Engine full 20/8-request pure and bound sessions passed independently of browser evidence.
- Follow the subagent-driven-development and adaptive-subagents workflows for independent implementation, integration and evidence. The owner's explicit instruction defers the separate code-review/optimization campaign; correctness checks and integration fixes remain part of this build.

## Inputs checked

Root `AGENTS.md`, README, architecture/decisions/rules/integration/work packets; current multi-game contracts and backend readiness; current Trix rules/change record/native plan/scenario packet; historical Solo/Complex dossiers and game packet; standard-rule reconciliation; deterministic bot direction CR-STRAT-011. Reopened all four Jawaker Basic/Complex English/Arabic source pages during implementation. Their omissions and translation defects do not override the recorded owner decisions.

## Work allocation

| Work | Owner | State |
|---|---|---|
| Private engine, all four profiles, scoring, observations, deterministic baseline, session adapter | Trix engine agent | Implemented; focused checks passed |
| Closed schemas and generated contracts; catalog/access/storage/advice/review/startup integration | Native integration agent | Implemented; focused checks passed |
| Typed Trix renderer, controls, transport and focused UI cases | Trix UI agent | Local baseline verified across all four; Basic completed across restart |
| Bounded test harness, native acceptance, startup, reusable documentation and integration fixes | Coordinator | Core and local handoff verified; combined resource gate unpassed |

Pre-flight: engine callbacks and public DTOs are frozen together before dependent UI/schema writes. Only native integration owns generated schemas/unions; engine owns module files; UI owns React. Coordinator owns runners/docs. The existing session adapter is sufficient; phases, turn direction, penalties, finish ranking and team routing remain game-owned.

Actual results are recorded in [acceptance status](../../../qa/implementation/trix/status.md), not inferred from these work items.
