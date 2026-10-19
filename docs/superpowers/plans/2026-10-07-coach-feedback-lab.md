# Coach Feedback Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the shared deterministic bot and coach decision system through a browser-free feedback loop that detects faulty facts, weak partnership/solo reasoning, probability assumptions and misleading cues, then validates small code-based improvements.

**Architecture:** Extend the existing M11 TypeScript study coordinator and validation contracts with a native Go runner using the production game/session engine. Store immutable replay/decision artifacts, run actor-safe alternative comparisons and isolated offline judge stages, then evaluate frozen rule candidates on fresh families. Keep lab per-seat policy assignment separate from production session metadata and preserve existing strength gates under the new permanent deterministic-bot boundary. Offline LLM agents review evidence only; they never control a seat.

**Tech Stack:** Existing Go module/toolchain, Node/TypeScript evaluation code, JSON Schema, immutable JSONL/JSON artifacts and existing Windows watchdog scripts. Fixture-only providers initially; no new framework, browser automation, database migration or ML library is required for the first slice.

**Spec:** [Coach Feedback Lab Design](../specs/2026-10-07-coach-feedback-lab-design.md).

**Authority:** [CR-STRAT-011](../../../planning/decisions/CR-STRAT-011-deterministic-feedback-lab.md) records the owner's latest direction and supersedes conflicting historical model-first instructions. Bots always remain deterministic; future model assistance is coach-only and outside this plan. No runtime strategic-model selection, fine-tuning, training, provider comparison or runtime router is a lab deliverable. Choosing and pinning an offline reviewer is only an operational part of the permitted judge pipeline.

**Status:** the owner authorized lab implementation and an executable testing/runbook handoff on 8 October 2026. See the [implementation ledger](../../../planning/implementation/coach-lab/progress.md), [runbook](../../../qa/evaluation/coach-lab/README.md), and [acceptance evidence](../../../qa/evaluation/coach-lab/implementation.md) for delivered mechanics and exact verification. The original detailed checklist remains the full roadmap: its unchecked strategic, human-review, promotion and product-delivery gates are not implied complete by a working headless lab. Proposed pilot numbers are operational limits, not sample-size proof or spending approval.

## Global Constraints

- Use the native Go game/session engine for authoritative lab play; do not implement another scorer or legality engine.
- Policies and decision-time judges receive only the acting seat's permitted information; full state and deal seeds stay private.
- Bots permanently use deterministic math/code only; the current coach shares that system. No runtime AI/learned model, provider call or model fallback may select their actions.
- Every simulated action must equal its saved original coach recommendation. A declared deterministic baseline on optional-analysis failure must already be part of that original preparation; an invalid recommendation stops the trajectory without a substitute move.
- Every suggestion gets an immutable decision record and audit status; unreviewed and uncertain are different states.
- Code owns legality, arithmetic, trick resolution, forced status and terminal results; model output is untrusted evidence.
- Decision quality, explanation quality, realized outcomes and human learning are separate measurements.
- New coach output has two layers: a direct tactical cue, then one Why action revealing its complete material reason from the same frozen decision. Legality-only reminders and unexplained low-card preferences do not satisfy strategic coaching.
- Preserve historical advice, frozen policies, source archives, human submissions and consumed experiment identities.
- Keep Hearts, Spades Solo, Spades Partners, Tarneeb Partners, Trix Solo and Trix Complex Partners objectives, results, phases and acceptance gates separate.
- Offline LLM reviewers receive actor-safe evidence and supply proposals only; their provider/version selection is operationally in scope. Runtime model selection/training/integration/routing is deferred to a separate future coach-only project; no Jev exploration belongs to this lab.
- Deterministic likelihood tables, parameters and bounded search are inspectable versioned code, not trained runtime artifacts; no automatic learning or mutation occurs during play.
- Same permitted observation, policy version and fixed work budget reproduce the same analysis and action. Actual deal seeds, hidden state, wall-clock cutoffs and machine-dependent partial search must not choose a move.
- Paid offline judge dispatch is disabled by default with an authorized USD cap of zero.
- Each owned test or batch invocation must finish or checkpoint within 20 minutes, below the existing 30-minute ceiling.
- New lab evidence does not bypass existing strength, human-label, applicable offline-review readiness or owner-promotion requirements.

## Review Focus

1. Mixed-policy experiments or opening Why must not rewrite a saved policy pin, change the selected action or reveal a reason from another turn: Tasks 02/02A/03/17.
2. A restart between preparation and commit must not duplicate actions, change saved advice or lose the only failed trajectory: Task 03.
3. Later cards, partner private memory, full-state hashes and fixture labels must not reach a blind review through metadata or exports: Tasks 04/07.
4. An alternative that exhausts budget or an unfinished match must not disappear from the denominator and make a candidate look stronger: Tasks 06/09/11.
5. A queen beneath an ace, inferred void or repeated clue must not become a false ownership proof, duplicated evidence or an assumption that a Nil partner should win: Tasks 04/05/07/10. Judge failure/cost tests remain mandatory in 07/08.

## Reading order and relationship to existing work

Read the linked design first, then AGENTS.md, docs/12-multi-game-extensibility.md, docs/02-rules.md, the current-state notes in README.md/docs/03-architecture.md, planning/decisions/CR-STRAT-007-partnership-inference-guide.md, CR-STRAT-009-game-plan-and-strength-gate.md, and the new CR-STRAT-011. Read the existing 60-scenario guide and SP-* case definitions before adding partner coverage. Use planning/implementation/multi-game/cases-and-evaluation.md for M11 interfaces and qa/implementation/multi-game/m11/status.md plus m12/status.md for recorded evidence.

The original specification's partnership-only catalog and TypeScript-only runtime statements are historical; later decisions and current source govern. This plan preserves current game profiles; CR-STRAT-011 replaces the old runtime-model direction. Historical provider artifacts remain evidence only and are not prerequisites for this lab. The old per-hand strength gate is not silently replaced by the proposed full-match protocol.

M11's planned run.ts and report.ts are the coordinator entry points. Implement them once, dispatching to native Go for authoritative play. Preserve manifest.ts and legacy study formats through compatible adapters. Do not expand/rewrite the frozen partnerdevelopment test or rerun its historical output directory.

Concurrent working-tree changes at planning time concern the card-table UI, screenshots, its acceptance notes and CHANGELOG.md. Keep them untouched. At execution, recheck source/branch status and use an isolated managed worktree if needed; do not claim a clean tree or move another task's files.

## Delivery slices and dependency order

| Slice | Tasks | Reviewable deliverable | Can finish with no paid calls or human labels? |
| --- | --- | --- | --- |
| A: reliable collection | 01–04 | Complete headless Partners games, exact advice archive, restart/replay and fact audit | Yes |
| B: inference and review | 05–08 | Conditional card beliefs, counterexample/calibration harness, alternative evidence, safe judge jobs and blank review packets | Mechanics yes; actual strategic/expert calibration remains unmeasured |
| C: first improvement loop | 09–10 | Bounded pilot, reproduced gaps, one justified deterministic candidate or no-change finding | Mechanics yes; strategic acceptance needs independent evidence |
| D: comparative evidence | 11 | Frozen unseen-family comparison, partner robustness and legacy-gate reconciliation | Runner yes; confirmation needs study decisions/eligible labels |
| E: current solo variants | 12 | Separate Spades Solo/Hearts inference, objective and review adapters | After execution approval; no new game engine |
| F: remaining games | 13–15 | Tarneeb Partners, Trix Solo and Complex Partners lab adapters | Only after each game's existing M08/M09 engine/rule gates |
| G: maintainable feedback | 16 | Versioned gap queue, regression corpus, release evidence and repeatable batch protocol | Yes for mechanics; no automatic promotion or model training |
| H: two-layer coach delivery | 02A, 17; audits in 04/07/09 | Tactical recommendation first, one complete saved Why, and separate cue/reason quality evidence | Yes for authored content, fixtures and UI checks; quality claims need their stated evidence |

Tasks 02 and packet work in 04 may proceed after 01 freezes contracts. Task 03 integrates 02. Task 05 consumes valid 04 packets; 06 compares actions independently of the candidate's belief assumptions. Tasks 07/08 can use fixtures while 05/06 mature. Tasks 09–11 are sequential evidence gates. Tasks 12–15 are distinct adapters, not proof that all games already exist. Task 16 consolidates outputs as they arrive. A complete first feedback loop does not wait for future game engines or any model-integration project.

Task 02A prepares both new advice layers before Task 09's coaching-quality pilot; legacy-only runner smoke may proceed sooner with its presentation version identified. Task 17 consumes 02A for product delivery and can proceed alongside lab work. It adds focused UI verification; bulk simulation/review remains headless. A loop can report backend content quality before UI completion, but cannot claim the two-step product experience is delivered until Task 17 passes.

## File ownership map

All paths below are repository-relative. Existing paths are read-only unless explicitly marked Modify in a task.

| Area | Proposed files | Responsibility |
| --- | --- | --- |
| Canonical lab interchange | contracts/evaluation-lab/{run,decision,inference,evaluation,review,receipt,gap}.schema.json | Versioned strict shapes, including the unchanged base study manifest |
| M11 coordinator | web/server/evaluation/multi-game/{run,report}.ts and lab/{contracts,freeze,journal,cli}.ts | Freeze/admission, bounded native dispatch, run ownership, stages and final reports |
| Native runner | server/cmd/coachlab/{main,main_test}.go; server/internal/evaluation/coachlab/{contract,policies,run,journal,replay}.go and corresponding tests | Native lifecycle, per-seat execution, immutable journal and deterministic replay |
| Exact audit and comparisons | server/internal/evaluation/coachlab/{audit,spades,beliefs,belief_calibration,compare,populations}.go and tests | Game-owned fact checks and evaluator configuration; no shared Spades semantics |
| Experimental mathematical beliefs | server/internal/games/spades/reasoning/beliefs/{beliefs,likelihood,profiles}.go and tests | Pure observation-only joint-allocation calculations and handwritten assumptions; no baseline activation before Task 10 |
| Offline continuation extension | server/internal/games/cardcontinuation/{evaluation,evaluation_test}.go | Versioned offline horizon/population adapter, preserving the installed default |
| Judge/review pipeline | web/server/evaluation/multi-game/lab/{packets,judge,jobs,calibration,candidates,gaps}.ts; lab/rubrics/{partners,principles}.md | Allowlisted packets, isolated review stages, cost ledger, expert indexing and evidence proposals |
| Later game adapters | coachlab/{spades_solo,hearts,tarneeb,trix_solo,trix_complex}.go and tests; lab/rubrics/{solo,hearts,tarneeb,trix-solo,trix-complex}.md | Game-specific facts, phases, objectives, uncertainty and review; use accepted native modules |
| Native/TS conformance fixtures | qa/evaluation/coach-lab/fixtures/ | Synthetic accepted/rejected contracts, tiny reachable games and privacy canaries; no claimed expert labels |
| Operational instructions | qa/evaluation/coach-lab/{README,protocol,reviewer-guide}.md | Reproduction, interpretation and exposure rules |
| New coach presentation | Native coaching/record projection, source public schemas and existing client advice/review surfaces in Tasks 02A/17 | Versioned action-first cue and complete Why from one saved decision; preserve old three-level envelopes |
| New run evidence | .local/evaluation/coach-lab/<run-id>/, with sanitized reports later retained under qa/experiments/ | Private raw evidence and separately selected shareable summaries; never overwrite old runs |

Do not create every future file immediately. Each task adds only the files needed for its own deliverable. No live application import may point into lab judge/job/provider code.

## Task 01: Freeze the lab contract and admission rules

**Dependencies:** none. **Files:** Create the seven contracts/evaluation-lab schemas; lab/contracts.ts and lab/freeze.ts; server/internal/evaluation/coachlab/contract.go; web/server/tests/coach-lab-contracts.test.ts; contract_test.go; shared conformance fixtures. Read existing manifest.ts and research.ts.

**Interfaces:** Define private RunEnvelope (schemaVersion coach-lab-run-1.0.0, base EvaluationManifest, lab settings), public StudyDescriptor (coach-lab-study-1.0.0), DecisionRecord, InferenceRecord, EvaluationRecord, ReviewRecord, GapRecord and RunReceipt from the design's record table. TypeScript export freezeLabRun(input, labelIndex) returns a validated immutable private envelope/hash. ExportStudyDescriptor(envelope, validationReceipt) returns nonsecret study fields, family commitments, private-envelope byte hash and validator receipt, never raw seeds. Go DecodeRun(data) returns RunEnvelope or an error. Both consume the same schemas/fixtures. Lab settings contain phase, family roles, exact deterministic per-seat pins, belief/behavior assumptions, comparison settings, fixed policy-work budgets, caps, source/binary digests and offline-judge authorization references. Every behavior/parameter version is an explicit research assumption until independently evaluated.

The native registry maps each exact supported variant/profile to a `LabVariantAdapter`: `AuditFacts(actorPacket)`, `BeliefInputs(actorPacket)`, `ContinuationAdapter(policyPins, horizon)`, `ReadTerminalOutcome(session)` and `ReviewContext(actorPacket)`. These methods return the typed fact/inference/evaluation/outcome/allowlisted-rule records above, never a hidden aggregate in a policy input. Existing engine interfaces own transitions and scoring. Current V1 admits only Hearts/Spades; later-game schema dispatch is an explicit Task 13 addition.

DecisionRecord also contains a versioned original CoachMessage/presentation reference and separate exposure references from Task 02A. Distinguish fixture, legacy and new presentation branches; real recommendation/Why exposure is not inferred from headless inspection of saved content.

- [ ] Add failing fixtures for unknown fields, unsupported schema, reused family across roles, mismatched source hash, pending human labels in confirmation, missing practical-effect units, zero/nonfinite limits and an authorized cost absent from live mode.
- [ ] Define the explicit workflow/verdict/evidence enums from the design; pending reviews must have no verdict. Forced status and explanation quality must be independent fields.
- [ ] Implement the wrapper around existing freezeManifest without changing its old interpretation. Validate native dispatch independently and compare Go/TS outcomes over every conformance fixture.
- [ ] Reject any seat pin that names a learned policy, network provider or model fallback. Keep offline judge transport outside policy contracts. Freeze separately named random streams and opaque record IDs. Reject undeclared policy/continuation/horizon IDs before game creation.
- [ ] Preserve literal seed semantics in the private base manifest. For confirmation, freeze that envelope in the custodian context and export a StudyDescriptor; the coordinator sees only the descriptor before reservation. Test that raw seeds never enter the descriptor and that private resolution without a durable reservation is refused.
- [ ] Run the focused contract tests below, fix failures, inspect the schema diff and checkpoint only this task's files.

**Acceptance example:** a development envelope with fixture provider and cap zero is eligible for mechanical work; the same envelope asking for live review returns provider-authorization-required before any HTTP/job attempt. A sealed=true field with pending labels or missing power settings is rejected for confirmation.

**Future verification:** node --test --test-isolation=none web/server/tests/coach-lab-contracts.test.ts; native TestManifestConformance and TestManifestAdmission using the bounded command convention below.

## Task 02: Bind an exact policy to each lab seat

**Dependencies:** 01. **Files:** Create coachlab/policies.go and policies_test.go. Reuse gamekernel/session.go, records/service_codec.go and game-owned session_analysis.go. Any required new production adapter must be additive and separately reviewed; do not change SessionMetadata.Policy semantics.

**Interfaces:** Define SeatPolicyPin as actor + exact policy/component/budget identifiers. Define LabPolicyExecutor.Prepare(ctx, boundSession, seatPin, decisionID) returning gamekernel.CompletePreparation. Resolve only explicitly installed/pinned executors. The initial allowed policy IDs are spades-tactics-2.1.0 and spades-partner-resource-5.0.0.

- [ ] Add a failing four-seat fixture where only seat 0 uses Partners resources and the other three use frozen tactics; verify every preparation reports its assigned policy and exact input digest.
- [ ] Test the deterministic executor dependency boundary: network/model transports are unreachable, repeated same-observation/version/work inputs reproduce action/analysis, hidden-deal substitutions leave them unchanged, and machine/worker order cannot select a partial-search answer. Only a fixed-work/support predicate may choose a declared deterministic baseline, recorded in the preparation. An external timeout returns incomplete/no recommendation and must checkpoint/fail rather than commit a different fallback; invalid recommendations still stop the run.
- [ ] Bind baseline/Partners preparation through BoundSession.PrepareComplete and retain its original Detail/Advice envelopes. Read the selected candidate from that one preparation; never call independent bot and coach selectors.
- [ ] Add wrong actor, stale packet, unsupported policy, changed executor hash and selected-action/advice mismatch tests. All reject before commit.
- [ ] Verify production session metadata/default selection remains byte-for-byte unchanged. Mixed-policy assignments belong only in the lab manifest/archive.
- [ ] Run TestSeatPolicyBindings, TestOriginalAdviceIdentity and existing relevant preparation/fidelity tests; review/checkpoint the adapter.

**Acceptance:** the saved recommendation, analysis, cue and committed candidate refer to one frozen preparation for the correct actor. The coordinator cannot switch runtime new-game defaults to simulate seat placement.

## Task 02A: Prepare a tactical cue and complete reason together

**Dependencies:** 01/02 and the design's section 4.2. **Files:** Create `server/internal/coaching/strategic.go` and `strategic_test.go`; new versioned game-owned `server/internal/games/hearts/coaching/contextual.go` and `server/internal/games/spades/coaching/contextual.go` with tests. Modify source advice contracts in `web/shared/contracts.schema.json` and the relevant source local-service/review schemas; use existing generators for Go/TS bindings. Add explicit envelope/projection dispatch in `server/internal/legacydecision/prepared.go`, `server/internal/coaching/project.go`, `server/internal/records/service_decision.go` and `server/internal/service/platform_review.go`, with focused tests. Integrate through game-owned session_analysis.go without editing frozen legacy renderers. Add future-game renderers only through the corresponding accepted module tasks.

**Interfaces:** Define `CoachMessage` and its exact source-schema branch `coach-advice-2.0.0`, containing `decisionId`, `presentationVersion`, `status` (`tactical`, `only-option`, `no-clear-preference`, `insufficient-reason`), `selectedAction`, `cue`, structured complete `reason` and allowed supporting references. The reason includes the supported consequence and material alternative/limitation when applicable. `BuildCoachMessage(actorPacket, originalAnalysis, cueVersion)` returns both layers or an explicit content-gap status. `ProjectCoachMessage(savedMessage, view)` accepts only `recommendation` or `reason`; the latter contains the same cue/action plus all material rationale. Bind it to a separately versioned original-advice envelope, decision/revision and hashes. Exact discriminated-union fields are frozen in the source schema before parallel consumers; do not redefine V1 `requestedLevel` values or its `[3]AdviceView` envelope.

- [ ] Add accepted/rejected contract fixtures for both projection states, all four statuses, missing tactical purpose, wrong action/decision identity, unavailable evidence references, oversized content and legacy envelopes. Keep the same schemas authoritative in native and TypeScript validation; regenerate rather than hand-edit generated files.
- [ ] Test a reachable Hearts last-seat J♣/Q♠/K♣ trick with only 3♣/A♣ as the actor's legal clubs under normal penalty avoidance. The supported example is cue **Play 3♣—avoid taking the queen's 13 points**, with a reason explaining the current K♣ winner, last position and 3♣ versus A♣ consequence. Validate the full deal and Q♠ discard's legality before using it. Add moon/objective/history/score-sensitive siblings instead of treating the example as a universal low-card rule.
- [ ] Render the actual selected action and its trace-supported purpose immediately. Replace generic follow-suit/lowest-card text for new records with contextual deterministic templates. Avoid meaningless score/history mentions; include the facts that change the choice, and qualify behavioral estimates. A missing strategic premise creates `insufficient-reason` plus a gap, not invented prose or a different card chosen for easier explanation.
- [ ] Cover forced actions, supported multiple reasonable choices, uncertainty and ties. Do not convert the policy's stable tie-break into a unique-best claim or equate a score tie at one analysis horizon with global equivalence. Forced status uses quiet only-option wording; ordinary rules remain normal UI feedback.
- [ ] Generate cue and complete reason once from the same analysis/observation and save both before disclosure/commit. Tests must show that later tricks, changed scores, reload, another cue version and hidden-world changes cannot rewrite Why. No network/model path is reachable during generation or reveal.
- [ ] Add a new reader/validator branch for new envelopes while retaining old `ProjectAdvice` and saved three-projection verification byte-for-byte. Historical records remain explicitly legacy; do not regenerate missing reasons, overwrite delivered levels or imply they meet the new content standard. Review endpoints return saved content under existing access/exposure rules.
- [ ] Keep material reasons complete within the frozen contract's content limits through authored templates and compact wording. If generation exceeds limits, record a visible content gap or select a validated shorter template; never silently truncate an essential uncertainty/tradeoff or require a third disclosure layer.
- [ ] Run future focused tests `TestCoachMessageActionPurpose`, `TestCoachMessageHeartsQueenAvoidance`, `TestCoachMessageForcedAndTied`, `TestCoachMessageReasonIdentity`, `TestAdviceProjectionVersionCompatibility` and matching schema/record conformance tests. Record pipeline fidelity separately from strategic validation; no implementation is started by this checklist.

**Acceptance:** every new original advice record carries a direct supported cue and complete material reason or an honest exception/gap status. Both are inspectable without a browser, follow the same deterministic action, and preserve historical advice semantics. The UI's one-step delivery is Task 17.

## Task 03: Complete matches, journal them and resume exactly

**Dependencies:** 02. **Files:** Create coachlab/run.go, journal.go, replay.go and corresponding tests; server/cmd/coachlab/main.go and main_test.go; existing planned multi-game/run.ts; lab/journal.ts.

**Interfaces:** Define Journal.Append(record), Checkpoint(state) and Close(receipt) with durable error returns. Define Run(ctx, envelope, journal) returning RunReceipt. Native CLI accepts --manifest, --out and optional --resume. The existing TypeScript entry point retains --manifest, --mode development|confirmation and --out, verifies/compiles the native worker, launches it without shell interpolation and owns its watchdog. A resume uses the same frozen manifest and explicit resume metadata, not a new random run.

- [ ] Write lifecycle fixtures for the exact native kinds actor, sealed, automatic, chance, round-complete and session-complete; include tied Spades scores at/above 500 that require another hand. Do not confuse the rollout adapter's terminal/round-end names with native kinds. Add sealed-window handling using a tiny fixture now and real Hearts later.
- [ ] Implement the lifecycle switch with production commits/advance/chance/ContinueRound operations. Never infer a terminal winner from a hand cap or current score alone.
- [ ] Add an append-only hash-chained journal: pre-action prepared record, applied command/events, post-state digest and checkpoint. Persist original advice before commit. On restart, reconcile an interrupted pair of records by replay; do not regenerate completed advice or duplicate an action.
- [ ] Archive Task 02A's complete cue/reason bundle even when no reason is requested. Keep headless inspection separate from real recommendation/Why exposure. Resume verifies both layers' version/hash identity and records an explicit missing-content gap rather than silently substituting a legacy or newly generated reason.
- [ ] Derive future deal material by family and round index independently of policy/search random consumption. Rotate declared dealer/seats without exposing seeds to policies.
- [ ] Refuse an existing output directory unless an exact verified resume is requested. Use exclusive ownership and a recorded stale-lock recovery procedure; never silently remove another active run's lock.
- [ ] Interrupt after preparation, after commit and during a round transition. Verify resumed actions, events, scores, original advice and completed outcome equal uninterrupted execution. Changed source/binary/policy/manifest bytes reject resume.
- [ ] Run the focused lifecycle/replay tests, then the two-family zero-provider smoke within the watchdog. Record actual completion/censoring and runtime; checkpoint the implementation and receipt.

**Acceptance:** zero action fallbacks; every committed action has one original decision record; all full matches end by module rules or carry an explicit incomplete status. No browser, application DB reset or live service is involved.

## Task 04: Build the safe decision corpus and exact audit

**Dependencies:** 01 for packet work; 03 for full replay integration. **Files:** Create coachlab/audit.go, spades.go, audit_test.go; lab/packets.ts; web/server/tests/coach-lab-packets.test.ts; synthetic audit fixtures.

**Interfaces:** AuditDecision(record, replayedActorPacket) returns exact checks and typed claim statuses. ExportBlindPacket(decisionRef) returns only an allowlisted actor packet, rule summary, complete legal set and opaque case ID. ExposureRecord stores case/family/stage/recipient and what was supplied. Original archive and judge packet have different schemas and storage roots.

- [ ] Derive every decision from the independently replayed pre-action position. Verify actor/revision/legal set/input hash and actual recommendation-following equality.
- [ ] Independently check bids, played cards, current versus final trick winner, scores, hand sizes and publicly proven voids. Include failed-Nil tricks not contributing to the partner's positive contract under our profile.
- [ ] Add forced-good-cue, forced-false-cue, sensible-card-false-cue and missing-typed-claim cases. Missing claims remain partially-checkable; false claims block that cue's acceptance.
- [ ] Audit cue and reason separately for action identity, typed facts and chronology. Add legality-only boilerplate despite a meaningful choice, true-but-irrelevant reasoning, missing low-card purpose, unsupported superiority from a tie-break, and a material limitation omitted from the cue. Mechanical checks cannot certify semantic usefulness; preserve that dimension for offline/independent review.
- [ ] Attach exact and conditional inference traces separately. Test that Q under A does not prove lower-card absence, Nil Q does not prove K absence, and a later partner play cannot justify an earlier suggestion. Preserve competing owners and reject clues falsely promoted to proven voids.
- [ ] Build safe objects by allowlist. Inject hidden hands, private hashes, seeds, other-seat memory, later tricks, source answers, family filenames and policy names into the source fixture; none may appear in blind output.
- [ ] Keep every decision occurrence while deduplicating only identical permitted input + legal set + rule/profile/objective/stage identity. Stage B also keys on original action/cue/evidence; C keys on the actual retrospective input. Deduplication never adds independent samples.
- [ ] Run exact-audit, hidden-world-swap and export tests. Review the actual serialized fixtures and checkpoint the corpus contract.

**Acceptance:** every occurrence is traceable to its original bytes; safe packets are identical when only concealed state changes; a later public reveal never becomes an earlier fact.

## Task 05: Test deterministic card and partnership inference

**Dependencies:** 04 actor-safe packets and exact audit. **Files:** Create game-owned `server/internal/games/spades/reasoning/beliefs/{beliefs,likelihood,profiles}.go` and corresponding tests, plus `coachlab/beliefs.go`, `belief_calibration.go` and their tests. Extend `contracts/evaluation-lab/inference.schema.json` and lab/contracts.ts from 01. Reuse strategy/knowledge's positive-support distinction, the existing constrained sampler through an explicit internal adapter, and PI-01–08/SP-* cases. No baseline imports the new candidate package until Task 10.

**Interfaces:** `BuildBeliefs(actorObservation, BeliefConfig)` returns `BeliefResult`: exact proof references, conditional card-owner/suit-count estimates, evidence event IDs, behavioral-hypothesis and parameter versions, proposal/weight diagnostics, sensitivity/support status, fixed work used and fallback reason. `BeliefConfig` declares the prior, nonempty handwritten preferred-action sets, error allowances, player-style mixture weights, proposal method and deterministic work limit. `ScoreBeliefCalibration(frozenInferenceRefs, closedPrivateReplayRefs, partition)` produces a private truth-scored receipt and sanitized aggregate metrics; its result is never a player observation or judge answer key.

- [ ] Map the owner's J♦ -> A♦ -> 6♦ -> Q♦ example to existing SP-* scenarios, preserving turn order and the earliest event at which each clue is available. Do not invent a second case taxonomy or mark the authored guide as validated.
- [ ] Build complete legal deals/reachable prefixes for the fixture matrix below. Check deck conservation and full history with the native engine before using a fixture as evidence. Expected outputs identify admissible holdings and conditional-versus-proven status; they do not assert an invented probability or preferred move without supporting assumptions.
- [ ] Implement the design's joint-allocation likelihood calculation with explicit code-defined behavior hypotheses, positive legal-action support, log weights, stable normalization and canonical ordering. Preserve capacity/card correlations. Validate nonempty preferred sets and parameter ranges. Define the constraint-only control by omitting behavioral likelihood factors (constant 1 over hard-feasible worlds). Uniform choice among legal actions is a separate behavioral hypothesis, not an uninformative control: its legal-set size can itself change card beliefs.
- [ ] Reconstruct each hypothesized player's own hand and public information at each historical action. Never expose other private hands, later public events, actual policy identity unavailable to the observer, or the real deal seed. Exclude the observer's own choices as new evidence. Track each source event once, including bids, and place the persistent player-style mixture outside that player's history product.
- [ ] Use exact small-ending enumeration to test normalization and marginals independently. For larger positions, reuse bounded feasible-world proposals with a reproducible observation/configuration-derived sequence; account for nonuniform proposals. A sample with no owner occurrences must not remove that owner from the logical domain. Distinguish logical inconsistency, poor sampling support and numerical underflow.
- [ ] Add constraint-only, single-assumption and conservative multiple-assumption versions. Include an equivalent-honors Nil hypothesis and a separate no-behavior-evidence control; test conclusion reversals and record them as policy-sensitive. An inapplicable/unsupported event contributes no behavioral factor across any world, with the public applicability rule recorded. These are handwritten mathematical assumptions, with no neural policy, fitted runtime classifier or live parameter learning.
- [ ] Use the closed private calibration scorer to assess previously frozen card/suit predictions, not action optimality. Report Brier/log scores, reliability bands, erroneous near-certainties, sample support and family-level uncertainty separately for natural deals, targeted cases and unfamiliar deterministic styles. Choose any revised constants on development; reserve separate validation families for the frozen revision.
- [ ] Benchmark fixed-work incremental updates, cache invalidation and full-history reconstruction on a named backend/machine. Proposed additional-analysis targets are p95 <= 50 ms and p99 <= 100 ms; record actual work, memory and latency. These are targets to test. Retain the deterministic baseline or freeze a cheaper candidate if missed; no machine-dependent partial-search choice. Wall-time termination remains incomplete evidence.
- [ ] Run `TestBeliefExactEnumeration`, `TestQueenUnderAceCounterworlds`, `TestNilEquivalentHonors`, `TestLikelihoodActorBoundary`, `TestEvidenceAppliedOnce`, `TestBeliefReplayDeterminism`, `TestBeliefInsufficientSupport` and `TestPrivateCalibrationIsolation`; checkpoint actual results, assumptions and unresolved strategic claims.

| Fixture family | Required assertion |
| --- | --- |
| Q alone / Q+K / Q+low diamonds | Playing Q does not prove the partner's remaining suit count or remove lower-card ownership without exact evidence |
| Nil Q+K with different safe tie-breaks | Q is possible with K retained; neither tie-break is automatically a mistake or an ownership proof |
| Constraint-only versus uniform-choice behavior | With two equal-prior feasible allocations having Q-only versus Q+K legal diamonds, no behavioral factor preserves 1/2 each; observing Q under uniform legal choice yields 2/3 versus 1/3. These are mathematical fixture values, not claimed real-player probabilities. |
| K in observer's hand / previously played | Exact known ownership/history dominates a behavioral guess about left |
| Right K+J lead / left K+6 duck | Both locations remain feasible; likelihood uses what each player knew at their own turn |
| Preserve honors / unblock / avoid bags / legal mistake | A clue carries conditions and alternatives, not an assumed universal convention |
| Changed seat order / trump already winning | Do not reuse a certain-partner-winner premise when another player can still win |
| Probable void, no trump / weak trump / overruff | A potential ruff is not automatically a team-winning plan |
| Partner Nil / contract already safe / bag risk | Partner trick count is not the objective by itself |
| Duplicate clue recognition / stale cache / new deal | One event supplies one likelihood factor; redeal clears holdings while retaining lawful match context |
| Same actor packet, different actual hidden deals | Belief calculation, selected action and cue bytes remain identical under the same version/work settings |

**Acceptance:** exact constraints remain exact; behavior-dependent estimates preserve legal alternatives; inference is reproducible, measurable and isolated from concealed truth. Improved calibration or a plausible explanation alone does not authorize an action-rule change.

## Task 06: Produce useful alternative-action evidence

**Dependencies:** 04; 05 for behavioral-belief sensitivity. **Files:** Create coachlab/compare.go and compare_test.go; cardcontinuation/evaluation.go and evaluation_test.go; later coachlab/populations.go and populations_test.go. Keep installed cardcontinuation.Evaluate defaults intact.

**Interfaces:** Define EvaluationConfig containing exact belief/continuation/objective/horizon pins, screening and confirmation streams, practical-effect threshold/unit and charged budgets. EvaluateOffline(ctx, actorObservation, EvaluationConfig) returns EvaluationRecord. A new offline-only continuation entry accepts explicit actor policy bindings and supports terminal-match-v1; its runtime wrapper is not changed. ReplayActualBranch(ctx, privateArchiveRef, decisionRef, alternateID, seatPins) returns a separately tagged retrospective branch receipt, never an actor-quality answer key.

- [ ] Add tiny exact reachable fixtures where an action is dominated, several actions tie, hidden worlds reverse the best action, a candidate exhausts budget, and a two-round leader later loses. Include public-information indistinguishability checks at future turns.
- [ ] Reuse sampled-world and rollout primitives. Screen the entire legal root set on 32 shared worlds; always retain the original played action. Select up to three alternatives and compare on 128 fresh worlds with the simultaneous paired interval rule in the spec.
- [ ] Record screening coverage, every omitted/unconfirmed candidate, paired completed-world counts and all work/cutoff failures. Unequal or selectively completed coverage cannot produce an unqualified supported-improvement label.
- [ ] Add the true terminal-match horizon using module transitions, chance and terminal winners. Preserve current-round/two-round estimates as separate diagnostics with their actual units; no heuristic score is renamed win probability.
- [ ] Implement actual-deal branches by replaying to the pre-action snapshot, validating and committing the alternate action, then asking every subsequent actor to choose again through the lab executor. Preserve the declared future deal stream, while allowing actions and terminal time to diverge. Test that the original future action suffix is not replayed blindly and that actual hidden-deal results cannot enter stages A/B or become an earlier-action oracle label.
- [ ] Add a second independently specified continuation policy and optional belief sensitivity profile as explicitly versioned research adapters. If unavailable, mark robustness untested. Do not count several reweightings of one policy as independent expertise.
- [ ] Compare the candidate under independent constraint-only and alternative behavioral assumptions as well as its own belief configuration. Future simulated actors must use their own information and fixed code policies. Add a fixture where a candidate wins only when the evaluator shares its mistaken partner convention; report the lack of robustness. Distinguish better card inference from a better team/solo action.
- [ ] Benchmark 8 preselected unforced packets before a batch. Proposed per-decision wall cap is 30 seconds; charged screening/confirmation budgets initially allow 250,000/1,000,000 steps with 256 MiB memory and 2,000,000/8,000,000 sampler/setup operations respectively. A cap stop returns uncertain evidence, not silently fewer successful samples. Pin any revised profile in a new run before execution.
- [ ] Run paired-world, horizon, candidate-coverage, cancellation and retained-default regression tests. Independently recompute fixture estimates from saved values and checkpoint the evaluator.

**Acceptance:** a result states what was compared, under which assumptions, with what coverage and horizon. Its quality claim never exceeds those facts. Actual-deal hindsight remains a separate exported diagnostic.

## Task 07: Implement isolated LLM review and accountable jobs

**Dependencies:** 04; 05/06 for real inference and numerical evidence. **Files:** Create lab/judge.ts, jobs.ts, rubrics/partners.md, rubrics/principles.md, lab/cli.ts; web/server/tests/coach-lab-judge.test.ts and coach-lab-jobs.test.ts. Extend packets.ts and review schema compatibly.

**Interfaces:** Define JudgeTransport.submit(validatedPacket, requestPin, attemptID) returning an untrusted response/usage envelope. BuildReviewJob(stage, decisionRef, evidenceRefs) returns an immutable input hash; ValidateReview checks schema, legal IDs, allowed event/evidence references and unavailable-information claims. Job states are queued, reserved, dispatched, succeeded, rejected, failed and unknown-outcome.

- [ ] Write fixture responses for correct reasoning, unsupported certainty, fabricated event references, illegal acceptable actions, malformed JSON, model-version drift and response text containing instructions to alter the experiment. Treat all response content as data. Validate structured exact claims against cited facts/results; retain uncheckable prose as unverified rather than claiming a complete semantic truth detector.
- [ ] Implement stage A without selected action/cue/outcome, B without future actual play, and C with a separately allowlisted full public retrospective. Use fresh request contexts, no shared model session and no archive tools. Retain A/B originals when later adjudication disagrees.
- [ ] Within B, freeze a cue-only assessment before providing the complete saved reason to its explanation assessment. Use dimensions `strategic-purpose`, `context-grounding`, `action-fidelity`, `uncertainty-honesty` and `reason-completeness`, each with `pass|fail|uncertain|not-applicable`, cited evidence and reviewer provenance. The reason cannot repair a misleading initial cue retroactively; a concise honest cue does not fail merely because its details appear in Why. Stage A remains blind to both layers.
- [ ] Add an optional independent critic role to stage B using the same allowlisted facts/action evidence and a fresh context, with the first judge's labels withheld until the critic's independent submission is frozen. Require cited counterexamples, missing alternatives and unsupported premises; retain disagreement without majority-vote truth. A summarizer cannot create facts, accepted human labels or automatic code changes. Count critic calls in the same durable cost ledger.
- [ ] Verify all unforced choices in the declared initial block are queued; forced choices get code audits. Cache only exact stage-specific inputs/pins and disclose reuse. A completed review cannot be inferred from an empty response or abstention.
- [ ] Add a token/work/call estimator and explicit live admission: exact model/transport version, finite input/output/request/USD limits, recorded authorization and available credentials. Default fixture mode must work without credentials and make zero network calls.
- [ ] Reserve worst-case cost before dispatch, then settle measured usage while retaining a conservative reservation for unknown outcomes. A crash after send must not automatically resubmit or free its budget. Read-only status reconciliation is allowed; another charged attempt needs available authorized budget and a new attempt record.
- [ ] Reject oversized context before dispatch. Do not silently truncate the history or candidate set. If a retrospective is split into complete-hand chunks, retain all chunk coverage and a final cross-hand review; missing chunks mean partial retrospective coverage, not full-game review.
- [ ] Run leakage/order/failure/zero-cap/restart tests, inspect exported inputs, and checkpoint fixture-ready review machinery. A real model trial is a later separately authorized run, not an acceptance shortcut.

**Acceptance:** reproducible stage inputs and validation; auditable costs and unknown attempts; model opinions remain model opinions. Synthetic responses establish plumbing only.

## Task 08: Prepare expert calibration and adjudication

**Dependencies:** 07 packet contract. **Files:** Create lab/calibration.ts; qa/evaluation/coach-lab/reviewer-guide.md; web/server/tests/coach-lab-calibration.test.ts. Reuse original Spades review/label validators and the existing multi-game derived label index.

**Interfaces:** ImportIndependentReview(submission, exposure, qualifications) returns a new immutable label reference or a reason for ineligibility. CalibrateJudge(frozenModelReviews, independentLabelRefs, partition) returns class metrics, coverage and uncertainty; it never fills missing human fields from model output.

- [ ] Prepare 16 fit and 16 audit cases from distinct original families; preserve related variants together. Include forced explanation errors, ambiguous alternatives, Nil/contract conflicts and short correct versus fluent wrong cues.
- [ ] Include the owner's diamond sequence and changed-context siblings: Nil equivalent honors, K with the leader, possible versus proven void, and overruff after partner. A review that asserts K must be left from this trick alone fails the factual-certainty rubric. Assess strategic conclusions separately from recognizing that the inference is not a proof.
- [ ] Calibrate explanation reviewers on paired cue/reason examples: generic but legal, short and useful, fluent but false, factually true but irrelevant, omitted overruff uncertainty, wrong-context low-card advice and honest forced/tied status. Keep purpose/factuality agreement separate from accepted-action labels and human-learning evidence.
- [ ] Create blank submissions for two independent qualified reviewers per case; record variant experience and information exposure. Give at most one case per family to a reviewer unless chronological exposure isolation is demonstrably maintained. Do not contact anyone during software work.
- [ ] Test pending, unknown, contested, model-authored, same-reviewer duplicate and exposed-future submissions. None may masquerade as independent accepted labels. Preserve the earlier 32 pending records unchanged.
- [ ] Implement append-only adjudication retaining both original submissions, exact reasons and accepted-set changes. A future-information argument cannot alone justify relabeling an earlier action.
- [ ] Report class precision/recall, false inferior accusations, factuality, abstention, order sensitivity and family-level intervals. Tune only on fit; keep audit results out of prompt editing. If audit is used for tuning, record it as consumed and prepare new audit families.
- [ ] Run fixture-based import/calibration tests and checkpoint the prepared review packet. Until actual labels arrive, output uncalibrated with missing denominators rather than a numerical reliability claim.

**Acceptance:** reviewer-ready packets and honest status can be complete without recruited reviewers. Real judge calibration remains a separately identified empirical deliverable.

## Task 09: Run the bounded Partners discovery pilot and report costs

**Dependencies:** 02A and 03–08 mechanics accepted; paid portions require their own authorization. **Files:** Create multi-game/report.ts; qa/evaluation/coach-lab/README.md and protocol.md; web/server/tests/coach-lab-report.test.ts. Create each run's actual manifest and evidence only at execution time.

**Interfaces:** BuildLabReport(runRefs) emits report.json and report.md with separate mechanics, review coverage, evaluator assumptions, outcomes, cost and eligibility sections. A report must account for every generated decision and every admitted/unknown provider attempt.

- [ ] Freeze a source/binary-pinned, non-promoting manifest for one development family and two full matches. Candidate seat uses the existing explicit Partners resource policy; all other seats use frozen tactics. An unchanged result is expected to be possible.
- [ ] Execute one family at a time through the bounded coordinator. Audit every decision; numerically evaluate unforced choices within their caps and queue every distinct unforced packet for review in the initial block. Export size/cost estimates before any real model request.
- [ ] If a concrete judge model and spending cap are authorized, execute that block's review queue and record failures/abstentions. If no such authorization exists, finish the fixture/export report and leave live judgments explicitly pending.
- [ ] Scale to at most 8 fresh development families / 16 matches only after measured CPU/memory/storage/token cost fits a frozen batch budget. Do not add rotations or populations and still call it the same initial budget.
- [ ] Report completed/censored/failed matches; total/forced/unforced decisions; code-audited, numerically evaluated and A/B/C-reviewed coverage; changed actions; rule activations; exact/partial/false claims; evaluator instability; actual usage and unknown-cost reservations. Keep natural and targeted samples separate.
- [ ] Add an inference scorecard and a separate supported-choice scorecard. Show supported/inferior/uncertain/unreviewed counts, independently assessable denominators, wrong certainty, partner-help/Nil/bag/overruff harms, and compute costs. Never use forced moves to inflate choice quality, or describe LLM agreement as verified coach accuracy.
- [ ] Produce a two-layer coaching scorecard: every cue/reason artifact or gap, generic-legality-only rate, missing/unsupported tactical purpose, true-but-irrelevant reason, action/reason mismatch, uncertainty fidelity and material completeness. Show per-variant/phase denominators and separate forced/no-preference cases. Mark one-step UI delivery not-run until Task 17; headless success cannot prove the client interaction. Why clicks or reading time cannot establish playing strength or learning.
- [ ] Add report tests for zero changes, zero activations, all-uncertain evidence, invalid provider response, a partially reviewed full match and an unfinished paired arm. Denominators must remain visible.
- [ ] Independently audit one whole saved match and a stratified set of decisions directly from the archive. Record passed/failed/not-run checks and checkpoint the reproducible report.

**Acceptance:** the report answers what happened, what was tested, what remains uncertain, how much it cost and which failure pattern deserves investigation. No positive strategy finding is required to pass pipeline acceptance.

## Task 10: Convert one validated pattern into a rule candidate

**Dependencies:** 09 discovery evidence; valid independent review or a suitable executable proof for the proposed strategic claim. **Files:** Create lab/candidates.ts and web/server/tests/coach-lab-candidates.test.ts. Only after the specific candidate is justified, add a new versioned game-owned policy/cue file beside the relevant Spades reasoning/coaching modules and its positive/negative tests; do not edit the frozen baseline.

**Interfaces:** ProposeCandidate(evidenceRefs) returns a CandidateRecord containing failure mechanism, observable trigger, exceptions, preferred/acceptable alternatives, conflict behavior, cue, affected variants and regression references. Admission rejects proposals based solely on model agreement, hindsight or an unsupported evaluator ranking.

- [ ] Group findings by observable cause and rule activation, retaining natural occurrence and severity separately. Keep a random routine audit stream to expose missed failure categories.
- [ ] For the highest justified pattern, create a reachable positive case, a harmful counterexample, an unnecessary-help case, seat rotations and hidden-world variations. Determine whether the fix belongs to facts, cue wording, policy, belief model or evaluator; change only that layer.
- [ ] Define the intended team or individual consequence before changing a preference. Compare exact-facts-only, a named conditional rule, and optional bounded numerical inference at the same positions. Prefer the simplest code change supported by evidence; do not install the entire authored guide or every probability feature at once.
- [ ] Route a missing-purpose or misleading-reason finding to its correct layer. A supported action with poor text may need only a new cue version; an absent strategic premise may require policy research. Do not retrofit persuasive prose, change a card to suit a template, or count wording improvements as stronger play. Recheck both product layers for every candidate.
- [ ] Independently review the premise and acceptable alternatives. If review is absent or disputed, keep the candidate as a hypothesis and continue corpus/tooling work; do not invent a reviewer or force a tactic change.
- [ ] Implement at most one narrow rule or cue change under a new policy/cue version after implementation is authorized. Validate action/cue agreement and the absence of effect outside declared preconditions. A wording-only fix need not change selected actions.
- [ ] Register the new exact candidate pin and preparation executor in the lab allowlist, with source/component/budget hashes and full analysis/advice binding tests. The current production Spades preparation rejects unknown policy IDs: use an additive lab executor for the new candidate and do not assume a new file is automatically executable. Verify one complete prepared/committed/replayed trajectory before fresh validation matches.
- [ ] Freeze the candidate and test full trajectories on fresh validation families; collect positions newly reached by the candidate. Keep development and validation distinct and record any validation reuse for tuning.
- [ ] Run candidate tests, relevant frozen-policy/fidelity checks and comparison report checks; checkpoint the candidate with positive/negative evidence and a no-promotion status.
- [ ] Prove current bot and coach use the same selected action and trace, with concise authored wording that distinguishes known from estimated. Audit imports/executors for zero runtime model/network dependency. Insufficient support or fixed-work exhaustion may select only a declared observation-deterministic baseline, visible in the saved preparation. An external timeout produces incomplete/no advice; retry/resume identical work rather than selecting an action according to machine speed.

**Acceptance:** one reviewable, reproducible proposal with actual scope and limits, or an explicit no-justified-change report. This task does not promise a stronger policy or activate a default.

## Task 11: Prepare and execute a valid comparative study

**Dependencies:** 10 frozen deterministic candidate, available independent policy populations, eligible labels and completed study decisions. **Files:** Extend lab/freeze.ts, multi-game/run.ts/report.ts, coachlab/populations.go; add web/server/tests/coach-lab-confirmation.test.ts and native population/bounds tests. Add a new decision record at execution time to reconcile the proposed full-match study with CR-STRAT-009; assign its next available number then.

**Interfaces:** ReserveConfirmation(publicStudyDescriptor, eligibleLabels, authorityRef) reserves the immutable run before execution seed access. ResolvePrivateRun(reservation, descriptor) obtains custodian-controlled bytes, checks the committed hash, reruns freezeLabRun and yields the original literal-seed RunEnvelope. FreezeAnalysis specifies family-weighted paired outcome, rotations/environments, sample size, useful gain, maximum harm, intervals/multiplicity, resource limits and missing-data treatment. Execution seed access creates an irreversible consumption event, including canceled runs; custodian generation/validation access is logged separately.

- [ ] Preserve the old gate exactly. Document whether the new protocol is supplemental or an owner-approved amendment; reject promotion eligibility when this relationship is unresolved.
- [ ] Pin at least two genuinely distinct opponent populations and unfamiliar teammate policies. Primary placement changes one seat; both-teammate placement is reported independently. If only related baseline variants are available, state that limitation and keep the broader robustness claim ineligible.
- [ ] Use only deterministic code policies in every match arm. Include unfamiliar legal partner styles and different honor-discard conventions so the candidate cannot pass by reading only its own bot convention. Prespecify tactical harm checks for Nil, unnecessary overtaking, overruff and team-contract failure; do not pool away a harmful subgroup with a positive mean.
- [ ] Use development variance/cost to propose sample size and power for a declared useful gain/harm level. Have these study choices recorded before dispatch; do not use the discovery count as a universal answer.
- [ ] Seal untouched original family streams in a privately validated seed-bearing envelope and export its public descriptor/validation receipt. Reserve using the descriptor, then resolve and revalidate the exact private bytes only for execution. Record both descriptor/envelope hashes for resume. Public raw seeds, reference strings substituted into literal seed fields, mismatched commitments and pre-reservation resolver access are failing tests. If actual custodian/developer access separation is unavailable, keep confirmation ineligible.
- [ ] Test paired complete outcomes, divergent match lengths, ties continuing under Spades rules, source drift, seed reuse and one/both censored arms. Report best/worst feasible missing-outcome bounds and mark inconclusive whenever they can reverse the decision.
- [ ] Run the frozen study in resumable bounded batches without inspecting results to extend its sample. Preserve all failures and final uncertainty. Report unchanged, regression, inconclusive or supported scoped benefit against the declared test, with tactical/subgroup harm separately.
- [ ] Produce a reviewable acceptance report. Default activation requires its existing independent-label/strength gates and a recorded owner decision; do not set application defaults as part of a report command.

**Acceptance:** the study is reproducible, its claim matches its objective and independent evidence, and missing outcomes/labels cannot yield a pass.

## Task 12: Evaluate Spades Solo and Hearts independently

**Dependencies:** accepted Partners mechanics and a deliberate scope decision to execute this expansion. **Files:** Create coachlab/spades_solo.go, hearts.go and corresponding tests; lab/rubrics/solo.md and hearts.md; add fixtures/spades-solo/ and fixtures/hearts/. Extend existing runner registration through its declared interfaces. Reference qa/evaluation/multi-game/human-study.md rather than creating another human-study protocol.

- [ ] Add Spades Solo with its own objective/scoring/competition and no partner assumptions. Give its runs, corpus, rubric and reports separate identities.
- [ ] Add Hearts with legal pass combinations, same-prestate sealed passing, permitted passed-card knowledge, penalty/moon behavior and module-owned terminal outcomes. Preserve full 286-choice pass sets; evaluator/provider limits yield explicit unsupported/uncertain states.
- [ ] Prove the generic coordinator has no embedded Spades scoring or seat arithmetic. Run module-specific replay/forced/factuality/terminal tests and cross-mode leakage/label tests.
- [ ] Evaluate deterministic behavioral assumptions separately for each mode, with constraint-only ablation and uncertainty reports. No teammate objective or Spades clue may silently carry into Hearts or Solo. Test both ordinary and moon-seeking opponent behavior without treating either as certain.
- [ ] Hand the existing human-study protocol exact accepted cases/cues, assistance tracking and retained exposure records. Recruitment, consent, useful learning gain, sample size and delayed unaided-transfer measurements remain a separately authorized study.

**Acceptance:** separate trustworthy evaluation in each implemented mode. Bot improvement does not become a human-learning claim; no new game catalog entry or runtime model is implied.

## Task 13: Add the Tarneeb Partners lab adapter

**Dependencies:** Tasks 01–11 mechanics for gameplay; the shared V2 schema portion can proceed after Task 01. The Tarneeb adapter requires existing M08 native module acceptance and resolution of the [Tarneeb rule dossier](../../rules/tarneeb-partners.md). This task does not implement a substitute Tarneeb engine or silently choose among conflicting rules. **Files:** Create coachlab/tarneeb.go and tarneeb_test.go; lab/rubrics/tarneeb.md; qa/evaluation/coach-lab/fixtures/tarneeb/; `web/server/evaluation/multi-game/manifest-v2.ts` and its version-dispatch tests; versioned run/study schemas and native conformance fixtures. Modify lab/freeze.ts and coachlab/contract.go only for explicit version dispatch when the native module is ready.

**Interfaces:** Register a game-owned Tarneeb audit/observation/belief/continuation/objective adapter through the contracts from Tasks 01/04/05/06. Decisions retain distinct auction bid/pass, choose-trump and play-card kinds, complete legal sets and the exact rule-profile ID. The adapter returns team outcomes from the native module, not a Spades scoring approximation.

- [ ] Confirm the executable profile resolves first leader, ordinary scoring, sweep/bid-13 arithmetic, all-pass dealer progression, threshold and simultaneous/tied terminal handling. Reject prerelease dossiers as runnable rules; retain the recorded unresolved items until settled.
- [ ] Introduce `multi-game-evaluation-2.0.0`, `coach-lab-run-2.0.0` and a correspondingly versioned StudyDescriptor for accepted later-game modules. Preserve `freezeManifest` V1's exact three-variant acceptance and all historical seed/label semantics. Dispatch by declared schema version, never latest or guessed game ID; reject an uninstalled module even under V2. Carry forward full-match gates, private literal seeds, reservation-before-resolution and Go/TS conformance. Test old bytes against the unchanged V1 validator and new variants rejected by V1.
- [ ] Verify every phase's original coach preparation can be executed, audited, resumed and compared without a browser. An all-pass redeal contributes no invented score or card-memory carryover.
- [ ] Evaluate bidding jointly with subsequent trump selection and play. Add cases for overbidding, conservative bidding when match score warrants risk, plausible partner support, trump length/control, entry preservation and contract defence. Retain uncertainty about teammate holdings from bids; no Nil, bags or broken-Spades assumptions.
- [ ] Test all four trump choices, mandatory follow-suit versus free void play, safe partner winner, partner void with weak trump, opponent overruff and suit-entry tradeoffs. Give behavioral hypotheses their own Tarneeb applicability and versions.
- [ ] Produce a full-match mechanics receipt, a phase/condition coverage report and blank independent review packets. Pin Tarneeb-specific deterministic populations and gain/harm units before a later comparative study. Include rule-profile drift, fresh-deal reset and hidden-state invariance tests.
- [ ] Run native `TestTarneebLabPhases`, `TestTarneebBidTrumpContinuation`, `TestTarneebTeamObjective`, `TestTarneebLabRedealReplay` and corresponding manifest/packet fixtures after the engine exists; checkpoint actual evidence.

**Acceptance:** every selected Tarneeb phase participates in the same feedback loop under its own rules and team objective. No strength, public catalog activation or individual-scoring Tarneeb variant is implied.

## Task 14: Add Trix Solo across all requests and kingdoms

**Dependencies:** Tasks 01–11 mechanics, Task 13's versioned manifest-dispatch portion, and completion of the M09 Trix Solo native module. The [owner-confirmed rules](../../rules/trix.md) resolve public doubling and self-capture (TRX-D01/D02); engine acceptance remains pending. Trix need not wait for Tarneeb gameplay; the schema portion can be delivered first. The native module is not currently installed. **Files:** Create coachlab/trix_solo.go and trix_solo_test.go; lab/rubrics/trix-solo.md; fixtures/trix-solo/; register only in the explicitly versioned later-game manifest/coordinator branch, preserving V1.

**Interfaces:** Trix Solo uses request selection, double/decline, penalty-card play, layout-card and forced-layout-pass decision kinds. The observation includes the permitted hand, current request, public reveals/board, remaining request pool, kingdom ownership, public lead-giver provenance, withheld bonuses and scores. Its terminal objective follows the selected four kingdoms / 20 fresh deals and module tie rules; current-request scores are diagnostics. Full-session Solo totals equal minus withheld bonuses, not necessarily zero.

- [ ] Validate the confirmed pre-play declaration turns and exact reveal timing. Earlier packets cannot acquire later doubled-card information. A decline does not prove the player lacks a penalty card. Include current/prior leader credit, consecutive own leads, losing/regaining lead, fresh-deal reset and opening self-capture without a bonus; retain original coach-recipient arithmetic and provenance.
- [ ] Cover request selection after seeing the current deal, remaining-request opportunity cost and score-aware risk. Include the existing queen-free-hand counterexample: owning no queens does not guarantee avoiding their capture. Do not hard-code that any request is best from a single hand feature.
- [ ] Evaluate King of Hearts, Queens, Diamonds and trick-avoidance separately, with request-specific capture/disposal and lead consequences. Audit legal moves and score arithmetic through the native engine.
- [ ] Add layout examples for opening a Jack, extending either end, releasing useful cards, blocking an opponent, exposing one's own long sequence, and mandatory play versus forced pass. A layout pass supplies adjacency constraints only; it must never update generic suit-void memory. Skip finished seats as the module specifies.
- [ ] Validate 20-deal completion, kingdom/request-pool persistence, fresh-deal memory reset, restart and co-winner semantics. Use a full-game terminal comparison for policy acceptance; local penalty/layout ranks are separate diagnostics with their own units.
- [ ] Run `TestTrixSoloLabRequests`, `TestTrixDoubleVisibility`, `TestTrixLayoutPassKnowledge`, `TestTrixSoloKingdomReplay` and strict variant/schema tests. Export phase-complete review packets and an honest pending/assessed coverage matrix.

**Acceptance:** all Trix Solo decision types and the complete selected schedule are evaluable. A trick-taking-only runner or review rubric cannot satisfy this task.

## Task 15: Add Trix Complex Partners with team-aware play

**Dependencies:** Task 14 reusable Trix mechanics; accepted M09 Complex Partners module and its completed [rule profile](../../rules/trix-complex-partners.md). **Files:** Create coachlab/trix_complex.go and trix_complex_test.go; lab/rubrics/trix-complex.md; fixtures/trix-complex/; explicit registration in the later-game manifest version, preserving V1. Shared layout legality stays in the native module, not duplicated in the lab.

**Interfaces:** A separately identified Complex Partners adapter evaluates combined penalties and layout, public double/decline and request choice. It combines member-seat penalties/layout awards with direct team bonus entries exactly once and uses the selected four kingdoms / eight fresh deals. It must not inherit Solo's objective or lead-credit exception by a boolean switch.

- [ ] Audit stacked trick/diamond/queen/king components and double bonuses independently, including self/partner/opponent capture under the confirmed profile. Ordinary Q♦ combined capture costs the team -50; doubled Q♦ costs the capturing team -75 and gives the other team +25 regardless of announcer. Never assign a team credit to an arbitrary player. Require new rule-version expectations and original coach output to match each recipient.
- [ ] Add partner-help and harmful-help siblings for discarding penalties, taking a trick to protect partner, doubled-card incentives and score-aware request choice. Require a team consequence rather than rewarding one seat's apparent gain.
- [ ] Evaluate layout unblocking, holding/releasing connecting cards, partner finish order and opponent opportunities. Include a case where helping partner finish first worsens combined finish awards and a case where a personal sacrifice improves the team outcome; obtain independent strategic review rather than prescribing winners from the scenario name.
- [ ] Run one-seat candidate and both-teammate experiments separately, with unfamiliar deterministic partners and opponents. Keep all related Solo/Partners twins in the same original-family partition while reporting objectives independently.
- [ ] Verify eight-deal lifecycle/replay, visibility, fresh-deal reset, exact team totals and ties. Run `TestTrixComplexPenaltyComponents`, `TestTrixComplexTeamLayout`, `TestTrixComplexFullGameReplay` and distinct rubric/manifest tests; publish scoped evidence and missing labels.

**Acceptance:** the lab evaluates actual partnership consequences across every Complex request; Solo strength or Spades partnership results do not count as its evidence.

## Task 16: Close the recurring deterministic improvement loop

**Dependencies:** Tasks 09–10 for the first gap/report loop; Task 11 supplies later comparative/release evidence. Tasks 12–15 add variant evidence as those branches become ready. **Files:** Create lab/gaps.ts and web/server/tests/coach-lab-gaps.test.ts; extend multi-game/report.ts, lab/candidates.ts and qa/evaluation/coach-lab/protocol.md. Keep the existing case catalog and human-label index authoritative.

**Interfaces:** `BuildGapQueue(runRefs, caseIndex)` creates append-only GapRecords with variant/phase/case IDs, failure layer, natural frequency, severity, evidence status, counterexamples and candidate references. `BuildLabReport` additionally links reproducible fixtures, original reviews, candidate/regression receipts and release status. A dataset manifest here is an evidence index, not a fine-tuning export or authorization to train.

- [ ] Classify gaps as facts, behavioral assumptions, team/solo objective, action preference, evaluator, explanation or missing coverage. Keep discovered hypotheses, independently supported findings, disputed findings and fixed regressions distinct.
- [ ] Produce readable report.md plus machine-readable report.json, gap records, exact replay instructions and minimal retained positive/negative fixtures. Every conclusion links original evidence and its actual version; retrospective stories cannot overwrite the earlier decision assessment.
- [ ] Include the original two-layer message and explanation defect class in each coaching gap. Preserve original exposure and context so a later cue repair cannot retroactively improve the recorded advice. Maintain regression families for strategic purpose, contextual relevance and one-step delivery alongside game outcomes.
- [ ] Prioritize recurrent consequential failures without discarding rare severe cases. Maintain both targeted discovery and a random routine audit stream; show the selection scheme and natural-play denominator so targeted cases do not masquerade as population frequency.
- [ ] Freeze one proposed deterministic revision at a time, run its relevant regression families and fresh comparison, then issue a reviewable retain/reject/inconclusive/release recommendation. Promotion uses existing owner/strength gates; no agent or report command edits defaults automatically.
- [ ] After an accepted change, collect its newly reached positions and rerun relevant counterexample families with original history retained. Failures reopen a gap with a new version rather than overwriting a prior successful receipt. Recalibrate conditional estimates when policy populations or rules change.
- [ ] Keep current bot/coach fidelity, no-model dependency, inference calibration, team/solo outcomes and latency in each release packet. Separate human-learning study handoff from playing-strength evidence. Preserve unresolved deterministic cases without starting model selection, training or integration.
- [ ] Test zero justified changes, duplicate discoveries, one event counted twice, an apparent cue-only improvement, stale evidence, a regression after an earlier pass and cross-variant objective mixing. Checkpoint a reproducible end-to-end fixture report; actual empirical claims remain tied to executed runs.

**Acceptance:** a maintainer can reproduce a gap, inspect why it matters, review a narrow deterministic change and assess its measured consequences. Pipeline completion is possible without claiming perfect coaching, recruiting experts, paid reviews, future game availability or runtime model work.

## Task 17: Deliver recommendation first and one complete Why

**Dependencies:** Task 02A's accepted public/envelope contract and saved-content endpoint behavior. Task 04 supplies fidelity fixtures; Task 09 records lab content findings. UI work can proceed without paid reviews or a full simulation campaign. **Files:** Modify `web/src/App.tsx`, `web/src/api/progressiveAdvice.ts`, `web/src/api/useGoSession.ts`, `web/src/features/ReviewPanel.tsx` and only necessary styles; extend their request/projection adapters through the authoritative schemas. Add `web/e2e/coach-two-step.spec.ts`, focused request-state tests and `qa/evaluation/coach-lab/coach-presentation-acceptance.md`. Recheck current source before implementation because other game/UI work is concurrent.

**Interfaces:** The new client presentation has `recommendation` and `reason` states bound to a decision ID and `coach-advice-2.0.0`. Initial access obtains the selected action/cue directly; `ShowReason(decisionId)` reveals the complete saved reason and does not request another strategic analysis. Reuse existing unlock, stale-result, concurrency and idempotency guards. Preserve legacy projection requests only in an explicit compatibility branch.

- [ ] Replace the active new-message Notice -> Consider -> Suggestion ladder with the recommended action/highlight and a single `Why?` control. The initial cue must not hide the card behind an extra hint. Keep coach access, pending state, dismissal, explicit player action and turn-reset behavior; no autoplay or unrelated table redesign.
- [ ] On one Why activation, render the complete material rationale, with relevant tradeoff/uncertainty in the same panel. No additional hint level, essential tooltip, “more” button or repeated request is needed. Support keyboard activation and accessible expanded state, readable mobile/desktop wrapping and normal scrolling. Do not implement a voice/chat subsystem; any existing supported reason-request surface may call this same action.
- [ ] Test stale responses, turn changes, double activation, slow delivery, error/retry and reload. Reject content bound to another decision. A delivery retry can retrieve the same saved message but cannot rerun analysis, consume another coach-unit unlock or silently reveal later-state advice.
- [ ] Record recommendation exposure and reason exposure separately at actual display, deduplicating first exposure on retry/reopen. Render both in headless fixtures without pretending a human viewed them. An opened reason may be closed/reopened without a new coaching level or billing event.
- [ ] Display only-option, no-clear-preference and insufficient-reason states honestly. Normal legal-card disabling/error text remains available, but “follow suit” alone does not occupy a strategic recommendation. Never manufacture a benefit for a forced action or an arbitrary tie-break.
- [ ] Update original-advice review to show the saved recommendation and one Why under its presentation version. Preserve historical three-level records and their delivered-content/access rules; identify legacy explanations without rebuilding them from the current policy or claiming completeness they never had.
- [ ] Run focused component/request-state tests and fixture-backed desktop/phone interaction checks: initial tactical cue, one-click full reason, action/highlight identity, no third reveal, forced/uncertain state, old-record compatibility, stale-request rejection and no duplicate unlock. Use selected snapshots only to verify rendering; do not run bulk browser gameplay or claim tactical strength from UI tests.

**Acceptance:** a player receives the recommendation immediately within the coaching surface and can read all material reasoning with one additional action. Lab reports link to the focused UI receipt while continuing to run games and evaluate content without a browser. Record actual implementation results later; this task is planning only.

## Commands and verification discipline

Commands here are future execution instructions. New packages/scripts must exist before use. Run from C:/repos/test-jev or the attached execution worktree. The Go module is at the repository root.

```powershell
# Contract/runner iteration: one focused package and named test family.
node scripts/bounded-native-run.mjs --seconds=120 -- node scripts/windows-env.mjs go test ./server/internal/evaluation/coachlab -run TestManifest -count=1 -timeout=110s
node scripts/bounded-native-run.mjs --seconds=120 -- node --test --test-isolation=none web/server/tests/coach-lab-contracts.test.ts

# After Tasks 01-08 exist: bounded integrated lab mechanics, no provider calls.
node scripts/bounded-native-run.mjs --seconds=600 -- node scripts/windows-env.mjs go test ./server/internal/evaluation/coachlab/... ./server/internal/games/cardcontinuation -count=1 -timeout=570s

# Inspect existing risk-based lanes; run relevant lanes only after shared changes.
node scripts/m04-focused-checks.mjs --list
node scripts/m04-focused-checks.mjs parity --fresh
node scripts/m04-focused-checks.mjs history --fresh
```

The coordinator's required flags remain --manifest, --mode and --out. Lab phase commands are provided by the new lab/cli.ts with subcommands estimate, audit, infer, evaluate, review, calibrate, candidate, gaps and verify; each requires --manifest and --out, and rejects unknown arguments. Inputs and phase selection come from the frozen manifest. All spawned work inherits the remaining invocation deadline. Model calls are never part of ordinary unit tests.

No full browser suite is required for an offline-only lab change. Task 17 requires its targeted fixture-backed UI checks for the new coaching presentation; this does not turn bulk lab play into browser automation. A later promoted policy must run the applicable shared compatibility, saved-advice and focused browser fidelity checks. Use a small service check where a change actually touches codec/executor behavior. Do not run unrelated full suites or alter runtime defaults to obtain an evaluation receipt.

Every task finishes with: relevant tests actually run and their output; source/manifest hashes; passed/failed/not-run status; provider mode and observed model only when actually called; unresolved evidence; a scoped diff review; and an explicit checkpoint. Git commits, when made during execution, stage only owned files and never absorb unrelated work.

## Resource and cost controls

| Resource | Proposed initial control | Meaning |
| --- | --- | --- |
| Native concurrency | 1 simulation/evaluation worker | Measure contention and memory before increasing |
| Model concurrency | 1 job after authorization | Prevent cap races and establish actual usage first |
| Invocation | 20 minutes maximum, checkpoint earlier | Hard resource limit, below existing 30-minute ceiling |
| Match | 100 rounds / 10,000 actions | Censoring safeguards; never a synthetic winner |
| Decision comparison | 32 screening / 128 independent confirmation worlds; finite work and 30-second cap | Proposed discovery settings; partial work remains uncertain |
| Initial full review | 1 original family / 2 paired complete matches | Every unforced packet in the block queued; no quality proof |
| Expanded discovery | Up to 8 families / 16 matches, before rotations | Coverage/cost evidence, not confirmatory sample size |
| Expert workflow pilot | 16 fit + 16 audit cases, two reviewers each | 64 proposed reviews; no people contacted or reliability threshold asserted |
| Paid inference | Authorized USD cap 0 until a concrete run is approved | Neither model selection nor numeric case counts grant spending |

Estimate request cost from measured input tokens, allowed output tokens and verified provider rates at execution time; add repeat/order-audit/retry reservations and record currency. Include stage-C calls and any unknown dispatched attempts. Publish CPU seconds, transitions/worlds, peak memory, archive bytes and unique/reused packets alongside money. Provider rates apply only to separately authorized offline review jobs; no runtime model cost is part of the bot/coach algorithm.

A partial-cost pilot may inform a smaller next manifest; it cannot retroactively remove difficult or incomplete cases from the current run. Choose confirmation size from variance and the desired effect/precision, not from convenient remaining budget.

## Decisions needed only before dependent work

| Decision | Recommended treatment | Work that can proceed without it |
| --- | --- | --- |
| Execution authorization/method | Review this plan; use narrow implementation/review slices | Planning is complete; no implementation started |
| Offline judge provider/model and spend | Select using small authorized calibration trials; pin actual returned version | Schemas, runner, evaluator, fixtures, export and estimates |
| Independent reviewer availability | Two qualified blind reviewers plus adjudication; prepare blank packets first | All mechanical tooling and provisional model discovery |
| Practical gain/harm, precision and population | Derive study proposal from development variance; record before confirmation | Discovery and calibration, without strength claims |
| Existing gate versus new full-match estimand | Explicit amendment or independently satisfy both applicable protocols | Supplemental full-match development reports |
| Tarneeb/Trix rule completion and native module readiness | Use the existing dossiers and M08/M09; settle only their recorded unresolved meanings | Current-game pipeline and phase/rubric specifications |

There are no invented reviewer identities, unapproved budgets, synthetic human labels or fabricated confirming manifests. Missing external inputs stop only their dependent evidence claim, not unrelated deterministic work.

## Requirements and completion traceability

| ID | Required outcome | Owner tasks |
| --- | --- | --- |
| LAB-01 | Native headless complete games using exact coach actions | 02–03 |
| LAB-02 | Immutable decision/replay/provenance and recovery | 01, 03–04 |
| LAB-03 | Code fact/legality/forced checks for every suggestion | 04 |
| LAB-04 | Information-safe alternatives with uncertainty and complete coverage accounting | 06 |
| LAB-05 | Isolated blind/evidence/retrospective judge stages and optional critic | 07 |
| LAB-06 | Distinct model/human/adjudicated labels and calibrated-review workflow | 08 |
| LAB-07 | Family-safe splits, paired deterministic policies and honest missing outcomes | 01, 09, 11 |
| LAB-08 | Small evidence-backed deterministic inference/rule/cue changes | 05, 10 |
| LAB-09 | Cost/usage/cancellation/unknown-attempt accounting | 03, 06–07, 09 |
| LAB-10 | Conditional joint-card beliefs, counterexamples and separate calibration | 04–06, 08–11 |
| LAB-11 | Separate variant objectives, phase-complete coverage and learning evidence | 11–15 |
| LAB-12 | Historical gates/defaults/results preserved | All tasks; explicit checks in 01–03, 08, 11 |
| LAB-13 | Permanent deterministic bots and faithful shared current coach | 01–03, 05, 10–11, 16 |
| LAB-14 | Usable gap queue, regression corpus and release evidence | 09–10, 16 |
| LAB-15 | Direct tactical cue and complete contextual Why from the same frozen analysis | 01, 02A, 03–04, 07–10, 16 |
| LAB-16 | One-step reason delivery, versioned legacy compatibility and honest exposure accounting | 02A, 17; reporting in 09/16 |

The first useful stopping point is Slice A: trustworthy browser-free collection. The first complete feedback-loop milestone is Slices A–C plus Task 16's gap/report handoff, with actual evidence and a justified candidate or no-change finding. Slice D determines whether a frozen change has supported comparative benefit. Stronger play and default promotion are not completion criteria for the mechanics milestone and cannot be substituted with a successful fixture run. Later game adapters do not hold up the initial Partners loop.

## Execution handoff

Recommended method: subagent-driven implementation with root-owned contracts, separate runner/evaluator/review tasks after interfaces freeze, and independent review at each evidence boundary. Keep experiments serial when they share a ledger or sealed data. This is a recommendation, not authorization to start.

Before executing, reread the current source and this design/plan together, confirm the chosen slice and recorded authority, identify the exact changed files, and preserve all unrelated work. Complete each slice's artifact and report before asking for any genuinely new provider, reviewer, confirmation or promotion decision.
