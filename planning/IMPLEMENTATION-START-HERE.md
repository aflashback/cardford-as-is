# Start implementing CardFord

**Audience:** a coding agent returning without the original conversation. **Product:** B2C Hearts/Spades practice and coaching. **Status:** owner-authorized local implementation now exists. Start with [local run instructions](../LOCAL-README.md) and the actual [packet status/evidence](../qa/implementation/status.md), rather than restarting W00. [CR-IMPL-003](decisions/CR-IMPL-003-local-build.md) records the local build scope and no-pipeline/no-push direction.

The owner wants one simple monorepo, the latest CardFord specification, the existing user experience, in-app subscription management and Stripe payments. Do not restart product ideation or request a visual redesign. The current table and interactions are good enough to build on.

**Current architecture work:** the [multi-game reasoning plan](../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md) defines M00–M12 and its contract/case/game packets. It is a plan, not completed implementation. For that work, start M00 → M01 against the existing application; do not restart the original W00 build. Preserve current rules, original saved advice and policy pins. Remaining Tarneeb profile questions gate its branch only.

**Future scope boundary:** [CR-FUTURE-001](11-future-play-and-membership.md) considers free/play-only membership and human matching. It authorizes planning only. Continue the existing packets without adding free grants, matchmaking, ratings or new subscription products; any activation needs a separate approved specification.

## First-run reading order

1. Read root [AGENTS.md](../AGENTS.md) and its required original-spec sequence for the preserved engineering safeguards. Its old scope conflicts are resolved by the later explicit owner decision below; do not silently restore the Spades-only product.
2. Read [CR-IMPL-001](decisions/CR-IMPL-001-monorepo-and-stripe.md). This records the owner's current authority, B2C focus, UX preservation and Stripe choice.
3. Read sections 1–5 of the [monorepo implementation plan](2026-09-27-monorepo-implementation-plan.md), then the work packet you will execute and its prerequisites.
4. Read the full current spec for that packet and the relevant [requirements/tests](implementation/requirements-and-tests.md). `planning/README.md` is the current artifact map. Historical docs, diagrams and synthetic examples are supporting inputs, not proof of implementation.
5. Inspect actual files, local modifications, workspace scripts and prior `qa/implementation/` reports. Recheck completed work rather than relying on a stale checkbox. Inspect the latest UI screenshots and current code before editing UI.

## How to start and resume

When the owner initiates implementation, start **W00**, then **W01**. If work already exists, select the earliest unfinished packet whose dependencies have executable evidence. Do not redo completed packets or replace existing work without inspection. W01 contract freeze is required before independent frontend/backend implementations diverge.

Track packet status in `qa/implementation/status.md` when W00 creates that file. Use `not-started`, `in-progress`, `passed`, `blocked` or `partial`; record source revision/hashes and evidence links. A checkbox alone is not evidence. W05A and W05B are separate checkpoints. A packet whose live test lacks credentials may be partial with fixtures passed; do not mark live integration complete.

For each packet:

1. State the packet, requirement IDs, file ownership and dependency evidence.
2. Add the specified failing behavioral tests and record the real initial failure; do not fabricate a red test that was never run.
3. Implement the smallest reviewable slice in its assigned directories. Generated types come from schemas; no browser imports from server code.
4. Run targeted tests, then relevant integration/build checks. Keep failure seeds and redacted diagnostics. Tests must examine resulting state, permissions and records, not only mock invocation counts.
5. Review the combined consumer flow, not just isolated units. Update status/evidence/changelog and commit a focused change if Git is available.
6. Continue with the next ready packet inside the owner's authorized scope. A blocked live provider experiment does not block deterministic rules, code-only coaching or fixture work.

Use the master plan's completion report format. Public behavior needs a requirement ID from the test registry or a recorded addition. Any rule, information-policy, runtime-model, scoring or scope change needs a numbered decision with reason, alternatives, compatibility, affected tests and owner authorization where the change exceeds confirmed scope.

## Product experience that must survive the migration

- Blue table, four compact avatars, hand below, right coach panel and existing game/dialog layout. Keep semantic accessible cards and original assets/copy.
- Three modes; default Spades Partners and **When I ask**. Partner labels/objectives appear only in partnership mode.
- One activation selects; off-turn double gesture prepares without autoplay; on-turn double gesture/Enter plays once. Keep explicit bid/pass confirmation and all legal options.
- Pause/dialog/background/review/phone rotation cancels automated progression; resume refetches the live position and starts a fresh delay.
- Coaching remains Notice → Consider → A suggestion, with a direct shortcut and optional explanation. It never commits a move. Keep short text and the current panel.
- Review preserves live play. Original replay and Possible continuation are visibly distinct; no old-game archive or new drill catalog.
- Account, subscription and family management work in portrait; the table-only landscape gate does not block them.
- B2C means useful help and easy practice, not enterprise organizations, SSO, corporate roles or administration dashboards.

Latest visual references: [desktop](../web/qa/ui-v1-desktop.png), [phone](../web/qa/ui-v1-phone.png), [iPad](../web/qa/ui-v1-ipad.png), [settings](../web/qa/ui-v1-settings-phone.png), [interaction evidence](../web/qa/UI-V1.md). Do not copy historical branding into new public copy; use CardFord.

## Implementation boundaries

Keep the existing `web/` project; one root workspace and lockfile. Server owns engine, private state, strategy, access and payment records; shared folders contain public schemas/generated types/display utilities only. Use PostgreSQL integration tests from the first durable slice. Local mock identity/grants are explicit and prohibited in hosted startup.

Build ordinary local-code play first. Jev is optional and off by default; shadow cannot affect users or grades. Keep the complete legal set, observation-only strategy, independent assessment and honest provenance. No runtime generative coach or alternative model.

Stripe collects payments and handles billing integration. Build ordinary plan/status/change/cancel/resume management in the app. Server-bound purchase records, verified Stripe events and reconciliation grant coverage; success URLs and client flags do not. Proposed prices/currency are not approved live offers.

Separate initial product delivery from operations growth: no fleet, message broker, sharding or multi-region infrastructure during W00–W08. Use small SQL-backed jobs and one application with optional worker entrypoints. W19 owns the existing paid-launch reliability/capacity gates; larger tiers are future evidence gates.

## Known starting facts

- Historical baseline: 38 prototype tests passed on 26 September 2026; this planning task did not rerun them. Rerun at W00.
- The original 56-file pack and 7 recorded prototype source/test hashes matched during planning review.
- `web/src/App.tsx` still imports the engine/coach and stores authoritative state in the browser; that is precisely the migration target.
- Structured events are insufficient for full bid/pass replay; add them before claiming historical review.
- No Git repository was present when the plan was written. W00 establishes version control when build begins; do not invent commit IDs.
- No hosted identity/Stripe/Jev/load/physical-device/pilot acceptance is complete. All proposed scripts and test files need to be implemented by their owning packet.

## Copyable implementation kickoff

> Implement the next ready work packet from `planning/IMPLEMENTATION-START-HERE.md` and `planning/2026-09-27-monorepo-implementation-plan.md`, starting W00/W01 if no implementation evidence exists. Preserve the current B2C table/coaching UX. Use `planning/implementation/requirements-and-tests.md` for requirement IDs, fixtures and acceptance. Keep one simple monorepo, server-owned state and Stripe payments with in-app subscription management. Complete the packet's implementation and meaningful tests, update its evidence/status, then continue within the authorized scope. Do not activate live charges/deployment, change approved rule/safety semantics, invent test results, or expose credentials.

The kickoff is a handoff prompt. The owner has since authorized local implementation; use current evidence to find unfinished work. Real identity, Stripe service acceptance, validated strategic grading, devices/pilot and paid launch are distinct from a working local fixture build.
