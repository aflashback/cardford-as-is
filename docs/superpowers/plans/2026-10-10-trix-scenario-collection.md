# Trix Scenario Collection Implementation Plan

> **Superseded operating policy — owner amendment, 11 October 2026:** The 90-minute active-segment cap and the instruction to stop after the bounded pilot are historical policy and do not govern current continuation. The authorized request budget is 32 Basic Solo (including the completed Diamonds game), 32 Complex Solo, 32 Basic Partners and 64 Complex Partners, in the same phase order. Keep the 300-second invocation limit and two attempts per decision; review every game before moving to the next. Selection/export is deferred, with all raw evidence retained. Use the [continuation note](2026-10-11-trix-campaign-continuation.md) and [current runbook](../../../planning/implementation/coach-lab/trix-scenario-collection/README.md). The 19:23 checkpoint below remains historical; the later continuation stopped at one completed game, 26/52 accepted decision reviews and zero game reviews after an interrupted MCP startup timeout. Narrow recovery is implemented; zero-call frozen recovery admission is pending.

> **Snapshot: 11 October 2026, 19:23 UTC:** One real Diamonds request and 24 decision reviews are accepted; the review worker stopped cleanly before the original deadline. Game reviews and selected cases are zero; the four-request pilot is incomplete. The original task checkboxes remain acceptance/handoff criteria, not proof that implementation is absent or tests passed.

**Goal:** Collect and curate at most 1,000 traceable Trix penalty decisions using four sequential Luna Max logical players, for later deterministic coach development.

**Architecture:** A separate offline Go harness drives current native Trix sessions through actor-safe packets and validated external card choices. A Node operator layer journals prompts/responses and recovery, a verified host bridge invokes players, and independent review/curation exports a versioned casebook. Production policy registration remains unchanged.

**Tech Stack:** Existing Go sessions/Trix reducers; Node ESM and built-in test runner; existing Ajv; repository schema/type generation; Codex local app-server transport with plaintext wire recording, exact configuration and inspected context/activity receipts.

**Spec:** [Trix scenario collection design](../specs/2026-10-10-trix-scenario-collection-design.md). Also read the [prepared pack](../../../planning/implementation/coach-lab/trix-scenario-collection/README.md) and [data contract](../../../planning/implementation/coach-lab/trix-scenario-collection/data-contract.md).

## Global Constraints

- Model is exactly `gpt-6-luna`; reasoning effort is `max`; no silent substitution.
- Only one active player invocation and one active episode; four logical seats; fresh context per turn.
- Collection order is Basic Solo, Complex Solo, Basic Partners, Complex Partners.
- Selected-case caps are 200, 200, 200, 400 and 1,000 overall; retain all raw attempts.
- Exclude request `trix` and non-Trix games; retain J ranks and all suits in the deck.
- Stop each episode at native `round-complete`, after thirteen tricks; do not claim session completion.
- The engine owns legal actions, score, state transitions and exact historical pins.
- No production bot/coach model integration, strategy promotion or training is included.
- Approved work ceilings: 160 completed requests, 180 attempted episodes, 17,920 total player attempts, two attempts per decision, 300 seconds per invocation, 90 minutes per active segment and four-request batches. Retain all raw evidence. No automatic wall-cap resume.

## Implementation ledger

| Area | Present implementation | Remaining acceptance |
|---|---|---|
| Native harness and packets | `server/internal/evaluation/trixcollection/`, `server/cmd/trixcollection/` | Passed gate; preserve frozen-source fidelity |
| Contracts and bindings | `contracts/trix-scenario-collection/`, `generate.mjs`, generated declarations | Passed drift gate; prepared pack schemas stay historical |
| Journal and CLI | `runner.mjs`, `journal.mjs`, manual commands in `scripts/trix-scenario-collection.mjs` | Clean paused checkpoint; future continuation unused |
| Host transport | Subagent journal inspector plus local app-server plaintext recorder; successful synthetic Luna Max transport probe | Preserve per-job admission during bounded recovery |
| Reviews and proof | Actor-first review, native public-ending proof adapter, game review | 24 accepted host reviews; game review/coverage unfinished; manual imports operator-attested |
| Curation and export | Corpus/family limits, immutable exports, `external-reader.mjs` and lab reader | Integrated counts/privacy/replay checks; real reviewed cases |
| Collection | One completed Basic Solo Diamonds request; 24 decision reviews; no game review/cases | Remaining reviews and three pilot requests, then bounded phases |

Use the [current runbook](../../../planning/implementation/coach-lab/trix-scenario-collection/README.md) for exact implemented commands. `preflight` validates configuration and reports admission requirements; it does not execute tests or prove live readiness. `lab:collect:check` is fixture-only. The automatic `run --run-id ID --requests 4 --context-admission FILE` coordinator is implemented with optional isolated cwd/executable; its player path admitted the first complete request; 24 real decision reviews are accepted and the review worker is stopped. The original collaboration probe failed exact-input admission because dispatch was encrypted; the later app-server synthetic probe captured plaintext and completed with `gpt-6-luna`/`max`, zero recorded tools, and recovered/audited archived context. Neither probe counts as gameplay; the later Diamonds episode is real collection evidence. See the [evidence ledger](../../../qa/evaluation/coach-lab/trix-scenario-collection.md) for recorded check results.

## Clean checkpoint — 11 October 2026, 19:23 UTC

Run `trix-luna-20261011-pilot` has one complete Basic Solo Diamonds request: 52 first-attempt accepted plays, 13 native tricks, scores South −30, West −30, North −10 and East −60. **24 of 52 decision reviews are accepted; game reviews and selected cases are zero.** The four-request pilot remains incomplete. Next work is the remaining 28 decision reviews, one game review, then the other three pilot requests.

The pause was appended at `2026-10-11T19:22:40.531Z`; the final in-flight review was accepted at `19:22:41.963Z`. Worker `90551` exited with code 0 and stop reason `paused`, reporting 24 imported reviews and 23 dispatched calls (one historical review recovered). All 25 review claims are settled, with zero unresolved claims. `activeWorker` is null and `driver.lock` is absent. All 52 player attempts were accepted. All 77 actual invocation receipts (52 player + 25 review) report `stoppedVerified: true`, with zero unverified stops. The run is paused with no active worker or outstanding dispatch.

The first two review attempts had invalid echoed `packetHash` metadata. Both literal proposals/response bytes and rejection receipts remain retained; the two-attempt cap was preserved with no third call for that review. The host-verified normalizer changes only the accepted review's `packetHash` to the immutable job value and audits raw bytes/proposal, host evidence and processing source. Reasoning, grading, evidence and proof claims remain unchanged by normalization and undergo ordinary validation. Saved attempts are considered chronologically; the first usable verified envelope is selected without choosing a preferred rationale.

The reviews-only processor started at 18:48:04 UTC and stopped before the original deadline `2026-10-11T19:29:40.108Z` (segment start `17:59:40.108Z`). No new segment or deadline extension occurred. The baseline remains paused; any later continuation requires explicit owner authorization and the documented host-evidence gates.

Original player source digest: `13bba042d15995c9640aeb8d82a5a7cd7e88a62b61119eaa2aea76ce51570030`. Separately frozen review processor: `ec1fb8be5722bd5b3a7776dba64cac0f2b3cfd0dabdab1987b05044ec13fe617`. Original native binary: `0ed25c6d0535f9eff50044d6f743c0ae7ecf291fb86adf4d7823813d6402ad3b`. These original archives/pins remain unchanged. The full gate passed native/build/schema checks and 180/180 combined checks; the final focused worker/envelope suite passed 41/41, with no remaining independent-review findings. This verifies implementation mechanics, not playing strength or corpus coverage.

A separate derived export succeeded at `exports/5d1453f64934d24c55bde691` with zero cases, original-native replay/compatibility and selection-source digest `20ee5f1d124d041f08f06b22e928b394e5dcb1a8dfa8770f93e1fa4ffebf198c`; selection-audit journal sequence is 398. The original frozen external-case reader accepted this export with zero cases, strategies and game findings. Derived native replay passed `basic-solo-1` with 13 tricks. Selected-case shortfalls remain Basic Solo 200, Complex Solo 200, Basic Partners 200 and Complex Partners 400. A zero-case publication does not establish complete reviews or coverage.

The current root CLI also implements `derive-export --run-id ID`. It freezes a new selection evaluator with an audit, requires a quiescent run and zero native source drift, and preserves original raw evidence/manifest/build and prior publications. The new settled-scoring-card/stage-balanced policy is included in the recorded full gate; the zero-case derived publication above succeeded, with original frozen external-reader validation and 13-trick replay passed.

The implemented `review-completed --run-id ID --context-admission FILE --original-deadline UTC` route freezes a separate full review-processing graph and finishes completed-request reviews without player work or a deadline reset. Fresh initialization includes the host-only metadata normalizer automatically. Its literal raw review fidelity, chronological first-usable selection, two-attempt cap and ordinary proof checks remain mandatory.

The future `--new-segment true` route is implemented, tested and independently reviewed. Require explicit owner continuation and complete inspectable/stopped evidence for every prior call. Keep the baseline paused so a worker crash cannot permit player dispatch. No new segment or extension was invoked today.

## Review Focus

1. Display seat E is native 3 and W is native 1; render/round-trip every card and seat without swapping private hands (Tasks 1–2).
2. A same-looking response from an old revision or another seat must never commit, including crash after commit before acknowledgement (Task 3).
3. `fork_turns=none` does not remove ambient instructions or ensure no file reads; missing trusted isolation/configuration evidence blocks model admission (Task 4).
4. Complex doubled-card components and Solo withheld bonuses can make a margin evaluator unsuitable for own-points correction labels (Tasks 1 and 5).
5. Related hands, forced moves, failed runs and repeated exports must not inflate solid-case counts or contaminate future validation families (Tasks 5–6).

## File layout and boundaries

New Go code: `server/internal/evaluation/trixcollection/{session.go,packet.go,rules.go,replay.go,proof.go}` and focused `_test.go` companions; `server/cmd/trixcollection/main.go` with CLI test. These are offline imports of existing native modules, never runtime policy registrations.

New operator code: `scripts/trix-scenario-collection.mjs`; focused `scripts/trix-scenario-collection/{contracts.mjs,journal.mjs,bridge.mjs,review.mjs,curate.mjs,export.mjs}` and declarations where TS imports require them. Tests: `web/tests/trix-scenario-{contracts,operator,bridge,review,curation}.test.ts`.

Canonical contract source: `contracts/trix-scenario-collection/{campaign,packet,play-response,declaration-response,decision-review,game-review,game-findings,case,strategy,export}.schema.json`; bindings are generated by `scripts/trix-scenario-collection/generate.mjs`. Prepared response schemas in the pack are historical references. Runtime job/receipt checks also live in the operator/bridge; the original proposed schema names below describe design targets, not existing files.

New lab reader: `web/server/evaluation/multi-game/lab/external-cases.ts` and `web/server/tests/coach-lab-external-cases.test.ts`. It accepts the new schema and never synthesizes existing deterministic decision records.

Existing files may be touched only for targeted integration: package commands in `package.json`, a scoped offline exception link in `AGENTS.md` and CR-STRAT-011, and implementation evidence in `qa/evaluation/coach-lab/trix-scenario-collection.md` plus `CHANGELOG.md`. Preserve other uncommitted work and historical decisions. Current source map lists the engine files to read, not rewrite.

## Task 1: Freeze contracts and native isolated-request harness

**Files:** new schemas/generator; `session.go`, `rules.go`, `session_test.go`, `rules_test.go`; native CLI entry point/test. **Requirements:** TSC-01/04/06/09/12.

**Interfaces:** New Go `StartRequest(variant, request, id string, deck []string) (gamekernel.BoundSession, error)` chooses a current exact-pin registration, calls its existing Start and commits the legal scheduled request. `CurrentPacket(session gamekernel.BoundSession) (json.RawMessage, error)` returns the current actor's full native packet. `FinishRequest(session gamekernel.BoundSession) (Outcome, error)` accepts only round-complete and returns the Outcome shape defined in the data contract. `RulesDescriptor(pin gamekernel.Pin, request string) (Rules, error)` returns the frozen source-backed descriptor defined by packet schema; it contains no actor hand. Bind CLI operations `start`, `packet`, `commit`, `finish`, `replay` to these interfaces through strict JSON stdin/stdout.

- [ ] Encode every record/union in the data contract as closed schemas, including nullability, enums, safe references, original model provenance and per-variant request restrictions. Generate Go/TS shapes and validators. Make generator `--check` fail on stale outputs.
- [ ] Add native fixtures for all ten variant/request combinations (4+1+4+1), each with valid 52-card decks and a deterministic legal test continuation. Fixtures are mechanics tests, not Luna data. Assert each start uses native H7 owner and preserves the native request pool, while the operator never chooses Jacks.
- [ ] Add literal scoring fixtures: Diamonds −130; Lutoosh −195; Queens −100; King −75; Complex −500 with all credited double bonuses; Solo additional withheld bonus cost; doubled Q♦ in Complex costs the taker −75 and routes +25 once. Test current/prior external-leader cases and Partners own-team capture.
- [ ] Implement only the thin native wrapper and source-backed rule renderer, using existing reducers/score functions. Native commit must resolve candidates from the stored state, never trust an action body emitted by a model.

```go
// Native test assertions to place around fixture-driven sessions.
if got.CompletedTricks != 13 || got.AcceptedPlays != 52 {
    t.Fatalf("not a complete request: %+v", got)
}
if got.NativeTerminalPhase != "round-complete" {
    t.Fatalf("wrong boundary: %s", got.NativeTerminalPhase)
}
```

- [ ] Run `node scripts/windows-env.mjs go test ./server/internal/evaluation/trixcollection ./server/cmd/trixcollection -count=1 -timeout=120s`. Save the command/result with source hashes. Reject all non-Trix and unsupported pin/request pairs before any session starts.

## Task 2: Build and verify actor packets and prompts

**Files:** `packet.go`, `packet_test.go`; `contracts.mjs`; contracts tests; prepared prompts promoted/versioned as input assets. **Requirements:** TSC-02/03/04/05/06.

**Interfaces:** `projectPlayerPacket(nativePacket, pin, revision, invocationId, sharedRules) -> PlayerPacket`; `renderPrompt(playerPacket, phase) -> {bytes, sha256}`; `resolveResponse(nativePacket, parsedResponse) -> candidateId`. Input/output types come from Task 1 schemas. No helper accepts authoritative State or a filesystem path to a private run.

- [ ] Add table tests for all 52 native/display card round trips, 0=S/1=W/2=N/3=E mapping, turn order S→E→N→W, four Solo competitors and two Partners teams.
- [ ] Use paired private allocations with identical actor observation to assert byte-identical PlayerPacket except a separately excluded opaque invocation identity. Verify full chronological public trick history, public H7 owner, sequential declarations and bonus provenance. Assert opponent hands/seeds/family labels/other rationales never render.
- [ ] Verify all seats share exactly the same descriptor/rules hash for a request. A mismatched request/variant/profile/descriptor hash must fail. Phase-specific hand/legal fields remain different by design.
- [ ] Validate strict three-field play responses and the separate declaration schema. Resolve displayed cards to the original candidate; compare declaration subsets as sets, then use the candidate's canonical order. Reject duplicate cards, Unicode variants not explicitly supported, whitespace-only rationale, extra keys, illegal card, noninteger/out-of-range confidence and a declaration in play phase.

```javascript
// Known legal packet fixture supplies the canonical candidate public values.
assert.equal(resolveResponse(legalKingPacket, {
  card: '|♥|K|', reasoning: 'Only legal card.', confidence: 100
}), 'play:HK');
assert.throws(() => resolveResponse(legalKingPacket, {
  card: '|♥|A|', reasoning: 'I prefer this.', confidence: 60
}), /legal/);
```

- [ ] Run `node --test web/tests/trix-scenario-contracts.test.ts` and Task 1's native checks. Inspect one synthetic rendered packet per variant and both model response phases; label these fixtures, never collected games.

## Task 3: Journal, safe imports and exact recovery

**Files:** `journal.mjs`, operator CLI, `replay.go`, `replay_test.go`, operator tests. **Requirements:** TSC-06/07/11.

**Interfaces:** `prepareJob(runId) -> PendingJob | StopReceipt`; `claimDispatch(job) -> {dispatchToken,attemptId,claimedAt}`; `settleAttempt(job, hostReceipt) -> RunStatus`; `acceptResponse(job, rawBytes, hostReceipt) -> CommitReceipt`; `recoverRun(runId) -> RunStatus`; `replayRun(runId) -> ReplayReceipt`. Task 1 schemas define the records. `StopReceipt` is `{reason, checkpointRef, resumable}`; `RunStatus` is `{runId,phase,status,pendingJobId,counters,checkpointRef}`. Bind actual runbook commands without adding provider dispatch to `next`. `claim` is implemented; failure settlement is currently `Collector.settle`, not a `settle-attempt` CLI command. The coordinator must reconcile verified host termination before retries.

- [ ] Add failure-injection tests at each durable boundary: prepared, dispatch claimed, host invoked before receipt arrives, response persisted, commit intent persisted, native commit applied, commit journaled, checkpoint published and export published. Persist/count a dispatch claim before any player invocation. On recovery reconcile uncertain calls against host events rather than automatically relaunching them; unresolved reservations stay counted and pause. The resumed history must apply each action once and preserve accepted response bytes.
- [ ] Add tests for stale revision, wrong seat/job/hash, duplicate identical versus conflicting import, corrupted/torn journal, changed source/binary/prompt/model pin, second owner lock, relative-path escape and symlink escape. None may silently repair or switch rules.
- [ ] Implement content-addressed immutable blobs and fsynced hash-chain journal patterned after `coachlab/journal.go`. Use an atomic pointer only for derived latest checkpoint/export references; retain immutable prior versions. Never store a private aggregate in outbox.
- [ ] Preserve the complete allowlisted source/build archive, including dirty relevant files, new operator submodules/schemas/templates, dependency lockfiles and native binary, using `scripts/coach-lab-builds.mjs` patterns. Store archive/binary references in the manifest and verify bytes on resume. Test replay after the live checkout changes using archived artifacts; never copy secrets or unrelated files into the archive.
- [ ] Count every dispatch attempt globally, including failures/retries/incomplete episodes. At the manifest attempt or time limit, checkpoint and return a stop receipt. Two failed attempts stop the episode. Model identity/tool/context failures stop immediately. Do not substitute a deterministic card.

```javascript
const first = await acceptResponse(job, rawResponse, receipt);
const duplicate = await acceptResponse(job, rawResponse, receipt);
assert.equal(first.commitRef, duplicate.commitRef);
assert.equal((await recoverRun(job.runId)).counters.acceptedPlays, 1);
```

- [ ] Run `node --test web/tests/trix-scenario-operator.test.ts` and native replay tests. Reconstruct a complete fixture request from saved accepted choices without invoking a model and compare all scores/state digests.

## Task 4: Prove the player bridge before collecting

**Files:** `bridge.mjs`, bridge tests, host invocation protocol in the runbook, acceptance evidence. **Requirements:** TSC-02/03/07/11.

**Interfaces:** `verifyHostReceipt(job, receipt, trustedHostEvents, baseContextManifest) -> AdmissionReceipt`; `AdmissionReceipt` = `{admitted, requestedModel, requestedEffort, effectiveConfigurationRef, resolvedModelId, limitations, errors}`. This code verifies evidence from the host; it does not trust model-provided identity or self-reported lack of tools.

- [ ] Determine whether a trusted host event journal/export is obtainable for the returned subagent ID, including effective configuration, task input, full tool activity and inherited base context. Preserve its documented receipt source. The collaboration function's final text alone is insufficient. If unavailable, record `bridge-unavailable` and finish offline fixture checks; do not pretend a live collector is ready.
- [ ] Enforce no inherited parent/seat conversation, no episode-specific ambient memory, zero tools and exact model/effort. Generic system/safety context may exist and is recorded. Prefer a transport with tools disabled; otherwise any observed tool call disqualifies the attempt/episode. Inspectable host activity is mandatory.
- [ ] Test forged model-written receipts, missing/truncated host events, mismatched agent/job/prompt hash, ambient hidden fixture data, inherited other-seat context, one tool call, fallback model and lower effort. Every case must return `admitted=false`.

```javascript
assert.equal(verifyHostReceipt(job, receiptWithToolCall,
  hostEventsWithToolCall, baseContext).admitted, false);
assert.equal(verifyHostReceipt(job, receiptWithLowerEffort,
  hostEventsWithLowerEffort, baseContext).admitted, false);
```

- [ ] Only after implementation/run approval, invoke one **synthetic**, non-dataset capability probe using `spawn_agent` with `fork_turns="none"`, `model="gpt-6-luna"`, `reasoning_effort="max"`; supply only its packet and no tools. Record actual latency/usage/configuration limits. This is not a strategic-quality test. If the tool/receipt interface cannot meet the gate, design an isolated adapter with available supported transport; do not silently switch model, effort or identity requirements.
- [ ] Run `node --test web/tests/trix-scenario-bridge.test.ts`; record fixture and live-probe results separately. User-selected sequential load does not require four simultaneous agent slots.

## Task 5: Independent review and conservative corrections

**Files:** `review.mjs`, `proof.go`, `proof_test.go`, review tests, decision/game review schemas. **Requirements:** TSC-08/09/10.

**Interfaces:** `makeDecisionReviewJob(decision) -> ReviewJob`; `admitDecisionReview(job, proposal, proofRegistry) -> DecisionReview`; `makeGameReviewJob(outcome, frozenReviews) -> ReviewJob`. `ReviewJob` = `{id, stage, inputRef, inputHash, promptRef, promptHash}`. Records follow the data contract. `VerifyTerminalDominance(certificate) -> ProofReceipt` binds packet/pin/legal alternatives/objective and exact native replay; `ProofReceipt` = `{verified,proofRef,reason}`.

- [ ] Review stated rationale, not inferred internal effort; hide player confidence initially. Freeze actor review before exposing outcomes. Categorize explanation issues even if no action error is established. Every recorded decision, including forced ones, has an audit/review status; lazy review queues may be pending but cannot masquerade as completed review.
- [ ] Permit `missedOpportunity` only for a verified exact terminal dominance certificate whose remaining ownership/actions are publicly determined and whose own/team request points strictly improve. Verify all legal relevant continuations in that bounded public ending, or refuse the certificate. Do not implement a general imperfect-information solver to satisfy this collection. Reject `information-set-exhaustive` until an independent correct verifier exists.
- [ ] Add paired tests: bad final result with sound actor rationale gives no correction; positive sampled rollout gives hypothesis only; omission gives explanation issue only; exact positive public-ending comparison can create correction; margin improvement with worse own points cannot; forced action has no alternative recommendation.

```javascript
const reviewed = admitDecisionReview(job, sampledPreferenceProposal, proofRegistry);
assert.equal(reviewed.missedOpportunity, null);
assert.equal(reviewed.hypotheses.length, 1);
assert.equal(reviewed.provenance, 'llm-proposal');
```

- [ ] Produce terminal native component totals and separate retrospective summaries for every completed request. Report review coverage and rationale quality as supported/mixed/insufficient-evidence, with no absolute best-effort claim.
- [ ] Run `node --test web/tests/trix-scenario-review.test.ts` and native proof/scoring tests. Preserve existing evaluator margin units; using it conditionally requires no production evaluation change.

## Task 6: Curate, export and integrate a separate lab input

**Files:** `curate.mjs`, `export.mjs`, curation tests, external lab reader/test; taxonomy contracts. **Requirements:** TSC-10/12.

**Interfaces:** `selectCases(decisions, reviews, outcomes, corpusIndex, campaign) -> SelectionResult`; `SelectionResult` = `{selectedCaseIds,rejections,coverage,shortfalls}`. `exportCases(selection, run) -> ExportReceipt`; `readExternalCases(directory) -> ExternalCase[]` validates version/hashes and actor-safe evidence, without fabricating deterministic records.

- [ ] Implement evidence eligibility, exact and semantic-family grouping, at most eight cases per physical deal family, Basic 50-case request targets, Complex category targets and the four phase/corpus caps. Enforce global corpus limits across repeated campaigns/exports. All category counts count unique primary cases; secondary tags never inflate totals.
- [ ] Add fixtures for 1,001 qualifying inputs, one overfull phase, duplicate decisions across exports, related seat rotations/twins, forced-only games, incomplete games and low-quality explanations with no verified correction. Each should yield correct rejection/shortfall receipts, never filler.
- [ ] Generate versioned casebook/JSONL/coverage/category strategies, including assumptions and counterexamples. Keep private reconstruction references inaccessible in actor-facing exports. No strategy becomes supported-for-testing without actual supporting and counterexample case IDs.

```javascript
const result = selectCases(decisions, reviews, outcomes, corpusIndex, campaign);
assert.ok(result.selectedCaseIds.length <= 1000);
assert.ok(Object.values(result.coverage.byFamily).every(n => n <= 8));
assert.ok(result.selectedCaseIds.every(id => !forcedDecisionIds.has(id)));
```

- [ ] Implement the explicit `external-cases` reader; test that it rejects old deterministic-record impersonation and never sets promotionEligible/runtimeActivated. A current deterministic comparison is a separate properly pinned record linked by actor observation, not a rewrite of the Luna response.
- [ ] Run `node --test web/tests/trix-scenario-curation.test.ts web/server/tests/coach-lab-external-cases.test.ts`. Check schema generation and links. If integrated shared lab code changed, run its focused affected checks; do not rerun expensive unrelated browser suites.

## Task 7: Pilot, bounded collection and completion receipt

**Files:** private run artifacts only plus `qa/evaluation/coach-lab/trix-scenario-collection.md`, prepared runbook status, scoped change records and changelog. **Requirements:** all TSC requirements.

- [ ] Re-read the approved campaign and verify actual pins/source bytes have not drifted. Freeze a run/build/prompt/taxonomy receipt. Preserve dirty files; do not commit unrelated work.
- [ ] Run preflight and the four-request Basic Solo pilot with sequential Luna Max invocations. Audit every raw packet/response, native replay and score. Pilot observations are real only when host receipts and all gates pass. A corrected protocol creates a new version and excludes incompatible pilot cases from the main corpus.
- [ ] Continue four-request batches within each phase cap; record undercovered categories and bounded adaptations before the next batch. Run phases in order. Review every completed episode and keep pending/failed work explicit. Stop on work/attempt limits without extending them automatically.
- [ ] Curate/export, then independently validate per-phase/request/category/family and overall counts, privacy, original-response fidelity, score components, immutable source identity and replay completion. Save raw count versus selected count, quality mix and shortfall separately.
- [ ] Publish actual commands, observed model/settings, verification results, any blocked transport gates, complete/incomplete counts, casebook location and deferred coaching work. No strength, optimality or exhaustiveness claim.

## Historical planning verification and handoff — 19:23 UTC checkpoint

The following handoff records the original bounded checkpoint. The owner has since authorized full continuation; its later startup failure and current recovery commands are documented in the [current runbook](../../../planning/implementation/coach-lab/trix-scenario-collection/README.md). Its instruction to obtain later authorization and its 24-review count do not describe the current operating state.

This plan covers TSC-01 through TSC-12. Native harness, packets, journal, schemas, review/curation/export and external-case reader are implemented; their pre-live integrated gate passed. A successful synthetic app-server transport probe is recorded separately from the rejected subagent admission probe. The first real Diamonds request and 24 decision reviews are complete; 28 decision reviews, one game review and three pilot requests are unfinished; the zero-case derived publication passed original frozen external-reader validation and replay. The continuation option passed final focused checks and independent review but has not been invoked today. No complete pilot, full coverage or coaching improvement is claimed.

The original bounded segment is stopped. Report this partial checkpoint and require explicit owner authorization before a later continuation. The four-request pilot still requires its other requests and review/replay receipts. Continue only within the approved phase order and work caps, reporting actual raw/selected/shortfall counts. Routine implementation within this approved scope does not require repeated permission.
