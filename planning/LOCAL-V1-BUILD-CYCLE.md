# Local V1 implementation and review cycle

> **For agentic workers:** Use the owner-authorized architect-led worktree and agent-review workflow. Read the owning W packet before implementation; use the execution-plan skill as appropriate. The master architect integrates and verifies each milestone.

**Goal:** Finish a locally runnable Tricks Coach V1 using the accepted table, three game modes and real PostgreSQL, with explicit fixtures for unavailable external services.

**Architecture:** Keep one npm workspace and the existing `web/` app. Public schemas generate transport types; the server owns rules, hidden state, jobs, access and billing records. Local strategy and authored factual coaching work with Jev off.

**Tech stack:** Existing React/TypeScript/Vite, Node/Fastify and PostgreSQL. Podman may supply the local database. Resolve and lock compatible dependencies during W00.

**Spec:** [Implementation entry point](IMPLEMENTATION-START-HERE.md), [W00–W19 packets](2026-09-27-monorepo-implementation-plan.md), [requirements/tests](implementation/requirements-and-tests.md), [local authorization](decisions/CR-IMPL-003-local-build.md).

**Execution update:** The local application and command contract now exist. Use [LOCAL-README](../LOCAL-README.md) to run it and [the acceptance report](../qa/implementation/LOCAL-V1-REPORT.md) for actual results and unfinished gates. The steps below remain the dependency map; they are not blanket acceptance of every W packet. The schema source is `web/shared/contracts.schema.json`; Node 24 runs TypeScript tests directly. The Podman launcher uses the CLI without requiring a compose plugin.

## Scope and source authority

The owner has initiated local implementation. Preserve Hearts Solo, Spades Solo and Spades Partners, default Spades Partners and When I ask coaching. Preserve the blue table, four small seats, hand below, right coach panel, selection/play gestures, explicit bid/pass confirmation and portrait account screens. There is no redesign, enterprise administration, new game archive, new drill catalog, live deployment or live payment activation in this cycle. Do not create a CI/CD pipeline or push to GitHub.

Keep the original specification pack intact. CR-IMPL-001 and CR-IMPL-003 resolve its superseded scope; all compatible legality, observation, provenance and persistence safeguards survive. Rules and public contract changes require a recorded semantic decision before consumers depend on them.

The detailed packet file remains the source for exact interfaces, file paths and test assertions. This guide changes delivery order and acceptance labels where needed for local execution; it does not waive a test or assert that a planned command exists.

## Ownership and review

The master architect owns `web/shared/schemas/`, generated contract integration, rule/version decisions, root workspace scripts and combined evidence. Freeze schemas in W01 before independent frontend/backend consumers begin. Domain work owns `web/server/game/`, `observations/` and `strategy/`; service work owns `records/`, `http/`, `jobs/` and `access/`; UI work owns existing `web/src/`; billing owns `web/server/billing/` and its migrations. Assign one writer to any file/migration number at a time.

Use a separate Git worktree/branch for each bounded packet. Dispatch an explicit file list, requirement IDs, frozen schema revision and dependency evidence. A reviewer reads the resulting diff plus tests and reports concrete defects; the implementer fixes them and reruns affected checks. The architect integrates commits in dependency order, runs combined checks, records the integrated commit and only then starts dependent work. Contract changes return to the architect and regenerate all consumers together. No Git push is part of this workflow.

## Review focus

- Identical player knowledge across different hidden deals must produce identical safe views and fixed-seed analysis; cover W03/W05/W13.
- Lost responses, simultaneous tabs and late jobs must not duplicate actions, units or coverage; cover W04/W06/W10/W15.
- Revocation and family removal must beat cached access and late publication; cover W09/W10/W16.
- Pause, review, backgrounding and rotation must cancel automated progress; cover W06/W07/W13.
- Uncertain assistance, incomplete analysis and unfortunate outcomes must not invent independence or mistakes; cover W10–W13/W17.

## Dependency-ordered delivery

Every row ends with a runnable consumer or engineering checkpoint. Packet substeps and named test fixtures are defined in the linked master plan; do not implement independent approximations of them.

| Step | Packets and dependency | Deliverable and review gate |
|---|---|---|
| 1. Baseline and contracts | W00 → W01 | One workspace/lockfile; actual baseline report; PostgreSQL startup/test isolation; schema generation and strict validation; rule/phase/revision semantics recorded in CR-IMPL-002. Review schemas before parallel consumers. |
| 2. Pure rules and knowledge | W02 → W03; after W01 | All three deterministic rule profiles, structured bid/pass/play events, score-once collection, replay identity, individual non-trick seam and allowlisted observations. Run RULE/KNOW cases and original regressions without network/clock in reducers. |
| 3. Durable local game | W04 plus W05A after W03, then W06 | Owned commands, revision/idempotency checks, event journal/outbox and leases on PostgreSQL. Named observation-only local policy drives bots. Explicit local identity/fixture grants still enforce ownership; retry/restart/pause races use real database connections. |
| 4. Existing UI and finite demo | W07 after W04/W06; W08 after W01 | Play a full hand in each mode through server views, recover after restart, preserve gestures and pause timing, and finish the finite authored demo. Check browser imports/chunks/maps contain no private rules/state/credentials. Review screenshots against accepted UX. |
| 5. Access and useful coaching | W09/W09A → W10 → W11 | Implement identity adapter boundary, account data controls, default-deny routes, revocation/control fences, coached-hand accounting and progressive factual help. Local fixture identities/coverage are allowed; real managed identity acceptance remains separate. Advice never plays a card. |
| 6. Review and evidence | W05B → W12/W13; original W13 replay can precede sampled trials | Compare strategy with recorded seeds and held-out manifests. Current-game Original replay preserves decision-time knowledge; Possible continuation never mutates live play. Unsupported categorical assessment abstains; descriptive evidence remains usable. |
| 7. Account and subscriptions | W14 after W09/W10; W15 after W14; W16 after access/billing contracts | In-app plan/status/change/cancel/resume and family management with a fixture BillingPort, plus actual Stripe adapter implementation and signed-event/reconciliation tests. Preserve payer/player privacy. Local prices and grants are explicitly fixtures, never public offers. |
| 8. Integrated local acceptance | Local portions of W18, after steps 1–7 | Run all available rules/property/PostgreSQL/UI/build/artifact checks and eight named teaching journeys. Test duplicate commands, revocation, loss/restart, quota races and review isolation. Save redacted evidence, screenshots and a defect list; restore a local backup. |
| 9. External evidence | Real identity/Stripe staging, then optional W17 experiment | Real sandbox billing and hosted identity need provisioned test services. Jev begins only after the local implementation and mocked transport tests; follow the bounded experiment gate below. Missing services leave their checks blocked, without blocking unrelated local work. |
| 10. Paid launch | W18 pilot/device gates and W19 | Separate owner-approved hosting, commercial decisions, real service evidence, recovery and measured capacity. Use the deployment guide. Local acceptance alone does not authorize this step. |

W05A is enough for the first playable slice. W05B must precede rollout-based trials and assessment that depend on it. Real identity is not replaced by a local development resolver for hosted acceptance. Family code/tests are local scope, but its commercial policy and offer activation remain gated. Implement external adapters and fixture coverage even when credentials are missing; never mark their real integrations passed.

## Commands and evidence

At the starting prototype revision, executable commands from `web/` are:

```powershell
node --test --test-isolation=none tests/*.test.ts
npm run build
```

The coordinating agent reported 38 tests passed and a successful Vite build at the build baseline. This documentation task did not rerun them. Record the actual source revision, runtime, command output and execution context in `qa/implementation/baseline.md`; do not carry that count forward as evidence for new code.

W00 and the owning packets must implement the following root command contract. These commands are planned until present in `package.json`; record a missing command as not-run, not passed:

```powershell
npm ci
npm run db:up
npm run db:migrate
npm run contracts:generate
npm run contracts:check
npm run typecheck
npm run lint:boundaries
npm run test:all
npm run test:integration
npm run test:ui
npm run build
npm run check:artifacts
npm run dev
```

`db:up` starts the chosen local PostgreSQL service and waits for health; document its Podman prerequisite and pinned database image. `test:integration` must verify a dedicated test database before destructive fixture setup; it must never reset the development database. Root scripts forward to `web` and preserve failure exit codes. Fixture tests make no paid calls. `test:stripe` must distinguish signed local fixtures from an explicit real sandbox run; `evaluate:jev` requires its own manifest and caps. W00 should retain a focused legacy test command through extraction.

For each packet:

- [ ] Confirm dependency evidence, source revision, assigned files and acceptance IDs.
- [ ] Write and run the meaningful behavioral regression first; preserve actual failure output and property-test seeds.
- [ ] Implement the smallest complete slice with no unchecked boundary types or duplicate DTO sources.
- [ ] Run targeted checks and the affected integrated journey; review failures before broadening tests.
- [ ] Obtain agent review, fix defects, rerun affected checks and commit locally.
- [ ] Update `qa/implementation/status.md`, requirement evidence and changelog with integrated commit, exact commands, counts, seeds, versions and limitations.

Packet progress uses `not-started`, `in-progress`, `partial`, `blocked`, `passed`. Every check separately uses **passed**, **failed**, **blocked** or **not-run**. An unavailable service is blocked; an unexecuted physical-device/pilot check is not-run. Redact identifiers where needed and never record a secret or complete hidden deal in general logs.

## Jev after implementation

Normal play and coaching remain local. Default `JEV_MODE=off` and `JEV_MAX_REQUESTS=0` produce zero requests. The existing OpenRouter credential file must remain outside build artifacts and Git; use the server-only file-loader convention in the deployment guide. Do not inspect, print, copy or commit its contents.

First pass mocked response, observation-isolation, retry/deadline, unknown-model and off/zero-cap tests. Only then run a specifically bounded experiment with durable attempt/cost caps and a recorded manifest. Record requested and observed model IDs separately; configuration is not an observed result. Shadow output cannot change live advice, bots or grades. Promotion requires the three-arm comparison in W17 and evidence for each enabled mode/phase. No alternate model or runtime generative coach is allowed.

## What local completion means

A local release report lists implemented requirement IDs and commits, exact successful and unsuccessful checks, evidence paths, known defects, and the next unfinished gate. State the actual identity/payment/provider modes and observed model ID, or `none — no live request`. All intended local journeys must pass against PostgreSQL; remaining external gates are listed individually.

Local completion is not CG2 hosted acceptance, real Stripe integration, verified physical-device access, completed user pilot or CG3 paid-launch readiness. Keep the inherited paid-launch floor of 1,000 active tables and recovery/failover evidence at W19; do not build a fleet during the local cycle. See [deployment guide](DEPLOYMENT-GUIDE.md).
