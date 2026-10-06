# Start implementing CardFord

**Audience:** a coding agent returning without the original conversation. **Product:** B2C Hearts/Spades practice and coaching. **Status:** owner-authorized local implementation now exists. Start with [local run instructions](../LOCAL-README.md) and the actual [packet status/evidence](../qa/implementation/status.md), rather than restarting W00. [CR-IMPL-003](decisions/CR-IMPL-003-local-build.md) records the local build scope and no-pipeline/no-push direction.

The owner wants one simple monorepo, the latest CardFord specification, the existing user experience, in-app subscription management and Stripe payments. Do not restart product ideation or request a visual redesign. The current table and interactions are good enough to build on.

**Current architecture work:** the [multi-game reasoning plan](../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md) defines the current milestones and contract/case/game packets. M00–M02 and the targeted partnership slice have recorded acceptance; [M02 evidence](../qa/implementation/multi-game/m02/status.md) records completed game-owned TypeScript extraction and its platform-specific test results. [CR-ARCH-003](decisions/CR-ARCH-003-backend-stack-and-system-readiness.md) now makes Go with PostgreSQL the preferred replacement backend, with TypeScript retained as the working reference. **M02A backend contracts and one compatibility slice passed** under the subsequent owner implementation instruction; [M02A evidence](../qa/implementation/multi-game/m02a/status.md) records the unexposed Go/PostgreSQL slice and its limits. **M03 durable platform records and replay anchors now pass their private-adapter gate** ([evidence](../qa/implementation/multi-game/m03/status.md)), defined by [backend readiness](implementation/multi-game/backend-readiness.md), before M04 activation. The earlier review was planning-only; the later instruction authorized this bounded implementation. Preserve React/Vite, current rules, original saved advice and policy pins. Remaining Tarneeb profile questions gate its branch only.

**Launch/client amendment:** [CR-IMPL-004](decisions/CR-IMPL-004-online-demo-and-launch-readiness.md) adds online demo, configurable free/access-trial/paid grant preparation, frontend reuse readiness and basic first-app quality to the current plan. Final offers and native packaging remain later selections. [CR-FUTURE-001](11-future-play-and-membership.md) still leaves human matching/ratings outside this work.

**Urgent repair amendment:** the owner subsequently authorized [CR-FIX-001](decisions/CR-FIX-001-urgent-system-repairs.md). Its [execution report](../qa/implementation/multi-game/urgent-repairs/status.md) is the latest current-app evidence and supersedes the review's defect status within that repair scope. Carry its regression fixtures into M02A and the later Go port.

## First-run reading order

**M03 is complete within its private-adapter scope; M04A's original Hearts port now passes.** Follow the [M04 execution sequence](implementation/multi-game/m04-execution.md) and [current evidence](../qa/implementation/multi-game/m04/status.md). Continue with M04B: exact original policy execution and V2 session/service contracts before activation. The completed comparison has been closed out; native Windows is the default for all next local steps. Its archived measurements are retained, not rerun as a milestone prerequisite.

**For M04:** read [CR-ARCH-004](decisions/CR-ARCH-004-native-windows-performance.md), the [native performance findings](../qa/implementation/multi-game/performance-windows/report.md), and [Windows setup](implementation/multi-game/windows-development.md). Current development uses native Node 24.19.0, Go 1.26.8 and PostgreSQL 16.15 on the same Windows host. Go + PostgreSQL is the replacement backend; Node supports frontend tooling and the temporary original service/reference. The old WSL timing compared matching outputs through unequal internal work; it cannot decide the backend language. M03–M05 use strict import boundaries and immutable typed state internally, retaining original evidence and the existing UI.

1. Read root [AGENTS.md](../AGENTS.md) and its required original-spec sequence for the preserved engineering safeguards. Its old scope conflicts are resolved by the later explicit owner decision below; do not silently restore the Spades-only product.
2. Read [CR-IMPL-001](decisions/CR-IMPL-001-monorepo-and-stripe.md). This records the owner's current authority, B2C focus, UX preservation and Stripe choice.
3. Read [CR-ARCH-003](decisions/CR-ARCH-003-backend-stack-and-system-readiness.md), the [multi-game plan](../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md), [backend readiness/M02A](implementation/multi-game/backend-readiness.md), and current [multi-game status](../qa/implementation/multi-game/status.md). The earlier [monorepo plan](2026-09-27-monorepo-implementation-plan.md) remains the local-build and release reference; its backend-language assumptions are superseded.
4. Read the full current spec for that packet and the relevant [requirements/tests](implementation/requirements-and-tests.md), [MG requirements](implementation/multi-game/compatibility-and-requirements.md), and SYS acceptance register in the backend packet. `planning/README.md` is the current artifact map. Historical docs, diagrams and synthetic examples are supporting inputs, not proof of implementation.
5. Inspect actual files, local modifications, workspace scripts and prior `qa/implementation/` reports. Recheck completed work rather than relying on a stale checkbox. Inspect the latest UI screenshots and current code before editing UI.

## How to start and resume

Use the current M00–M02 evidence; do not restart W00/W01 or regenerate frozen expectations. The subsequent [CR-FIX-001 urgent repair slice](decisions/CR-FIX-001-urgent-system-repairs.md) corrects the charged-rollout cap, validates active V1 state, fences preparation and preserves accepted-command/review retries in the current app. Read its [execution report](../qa/implementation/multi-game/urgent-repairs/status.md) before starting work. The subsequent [M02A report](../qa/implementation/multi-game/m02a/status.md) passes the bounded portable-contract and Go/PostgreSQL gate. The [M03 durable-record gate](../qa/implementation/multi-game/m03/status.md) now passes; start **M04 service/client integration** next; M04 integration and M05 bounded reasoning retain their own acceptance. No backend port is included in the repair slice.

Track current milestones in `qa/implementation/multi-game/status.md`, with M02A evidence under `qa/implementation/multi-game/m02a/`. Keep the existing `qa/implementation/status.md` as local-build/release evidence. Use `not-started`, `in-progress`, `passed`, `blocked` or `partial`; record source revision/hashes and evidence links. A checkbox alone is not evidence. A packet whose live test lacks credentials may be partial with fixtures passed; do not mark live integration complete. Existing Node commands remain TypeScript regression/oracle checks; the replacement path requires its own pinned Go/schema/differential checks before acceptance.

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

Keep the existing `web/` React/Vite project and JavaScript lockfile in one repository. M02A freezes one Go module and backend package boundaries; Go tooling does not replace the npm lockfile. Server owns engine, private state, strategy, access and payment records; public JSON Schema remains the sole wire-contract source for generated Go and TypeScript bindings. Use PostgreSQL integration tests from the first durable slice. TypeScript remains the reference until replacement paths pass their gates; no dual authoritative writers or permanent hybrid is assumed. Local mock identity/grants are explicit and prohibited in hosted startup.

Build ordinary local-code play first. Jev is optional and off by default; shadow cannot affect users or grades. Keep the complete legal set, observation-only strategy, independent assessment and honest provenance. No runtime generative coach or alternative model.

Stripe collects payments and handles billing integration. Build ordinary plan/status/change/cancel/resume management in the app. Server-bound purchase records, verified Stripe events and reconciliation grant coverage; success URLs and client flags do not. Proposed prices/currency are not approved live offers.

Separate functional delivery from operations growth: implement bounded service work and durable recovery under the backend packet. Hosting vendors, deployment, fleet, message broker, sharding, production SLOs and larger capacity campaigns remain deferred. W19 retains the existing paid-launch safeguards; native packaging and human evaluation have their own later gates.

## Known starting facts

- The current TypeScript service owns rules, private state and PostgreSQL records; React receives the human hand and public information. Ordinary code coaching, replay and isolated review continuations exist. Identity and billing remain local fixtures; Jev is off.
- M02 reports 449/449 Linux/WSL acceptance and separate passing Windows contracts/typecheck/build. Earlier Windows connectivity and mounted-source timing failures remain recorded; the Linux result does not establish Windows latency.
- M03 private versioned persistence, replay and durable-work tests pass. HTTP/client activation, online demo, configurable offers and full recovery acceptance remain unfinished in M04-M06; current TypeScript authority stays active.
- The [system review](../qa/implementation/multi-game/system-review-2026-10-05.md) separates inspected defects from planned activation gaps; the later [urgent repair report](../qa/implementation/multi-game/urgent-repairs/status.md) records their focused current-system corrections and remaining limits. Forward migration 006 adds preparation attempts; all six migrations and original archives remain preserved. [M02A](../qa/implementation/multi-game/m02a/status.md) now supplies the unexposed Go slice and bounded Node/Go measurements; no production Go/Rust service has been activated.
- The 38-test browser-local prototype baseline and original pack are historical evidence, not current service architecture. Hosted identity/Stripe, production capacity, physical devices and independent strategy/learning claims retain separate gates.

## Copyable implementation kickoff

> Continue M04B from `planning/implementation/multi-game/m04-execution.md` after reading the passed M04A evidence. Port exact original policy behavior and freeze V2 session/platform boundaries before authenticated service/client activation. Preserve React/Vite, original TypeScript behavior, saved advice/policy pins, completed M00–M04A evidence and canonical migrations. Use native Windows and typed immutable operations under CR-ARCH-003/004; the language comparison is closed. Record exact checks and mismatches, retaining the native database timeout follow-up. Do not switch normal play until the real Go service journey passes, activate hosting/live charges, silently replace policies, invent tests or expose credentials.

The Go kickoff is for the next implementation slice. The current TypeScript app includes the separately authorized urgent repairs under CR-FIX-001. Real identity, Stripe service acceptance, validated strategic grading, devices/pilot and paid launch are distinct from a working local fixture build.
