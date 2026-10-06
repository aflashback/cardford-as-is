# Implementation requirements and test specification

**Status:** acceptance targets, 27 September 2026. This registry does not itself claim that a test passed. The [local implementation report](../../qa/implementation/LOCAL-V1-REPORT.md) records implemented checks and remaining gates. Use with the [work packets](../2026-09-27-monorepo-implementation-plan.md) and [agent entry point](../IMPLEMENTATION-START-HERE.md).

This registry assigns stable IDs to behavior currently specified in prose. It does not replace rule semantics or commercial T01–T49. When they conflict, resolve the conflict in a numbered decision before changing tests. P/A/S/BRAND/IMPL/SUB identifiers retain their source definitions.

## Test environment and fixture conventions

W00 defines root scripts and isolated databases; W01 generates public DTOs. The implemented runner uses Node 24 native TypeScript with `--test --test-isolation=none`; `test:all` passes explicit legacy/server test globs from the repository root. Integration suites use isolated schemas in the dedicated test PostgreSQL database, never the development database or customer data. Fail early if the database identity does not match the dedicated test configuration. Helper names below describe required responsibilities; the local report maps consolidated implementation suites to evidence.

Use `node:assert/strict` and the Node test runner already familiar to the repository. Add fast-check for conservation/transition/serialization properties; pin its version and store counterexample seed/path in failure output. Playwright drives the real browser/API when integration is under test; safe fixture views are suitable for isolated UI states only. Inject clocks, randomness and fetch in tests instead of waiting on wall time or causing real outages.

Each scenario fixture in `web/server/tests/fixtures/` contains: mode and frozen profile/version, complete original deal, legal accepted action sequence, actor/viewing seat, pre-action revision, intended assertion, and any separate information-equivalent deal. Do not set arbitrary score/phase fields to make impossible states. Small pure scoring tests may use the published scalar scoring cases; full session tests must derive a reachable state.

Create these support functions as the owning packets need them:

| File / helper | Exact purpose and required outputs |
|---|---|
| `support/fixtures.ts` → `buildScenario(name, seed)` | Return original deal, accepted actions, reconstructed private state and version metadata for a named legal fixture below. Use stored deterministic deals, not production randomness. |
| `support/information-sets.ts` → `equivalentDeals(seat)` | Return `{a,b,seat,status}`: distinct concealed states with identical permitted knowledge and the same public `ViewStatus`. Preserve hand sizes, known holdings, voids and events. |
| `support/database.ts` → `withTestDatabase(testFn)` | Create/migrate isolated database/schema; pass a context with two independent connections/process clients; close connections and remove only verified test resources. |
| `support/session-harness.ts` → `ownedGameHarness()` | Return `command`, `submit`, `acceptedCommandCount` and safe/current state readers for one authenticated owner, active fixture coverage and a legal action. Close resources through test cleanup. |
| `support/job-harness.ts` → `botJobHarness()` | Return `currentRevision`, `prepareAndFinishBot`, `authorizedAdvance`, controllable worker completion and lease/clock hooks. Its fixture starts on an actual bot turn. |
| `support/provider.ts` → `fixtureFetch(scenario)` | Return fetch stub plus captured redacted request and controlled selected/error response. No network request in fixture mode; usage may be absent. |
| `support/billing.ts` → `stripeFixture(scenario)` | Return signed/invalid raw event fixture, provider-state responses, server-bound purchase and expected coverage. Isolate test/live IDs explicitly. |

These are test utilities, not public application APIs. Avoid a universal test framework or large mocking container. Every helper validates fixture legality before testing behavior. Test harness clocks may be controlled; pure game reducers receive no implicit clock.

## Core rules and knowledge: requirement IDs and exact cases

Source: [games/decisions](../02-games-and-decisions.md), compatible original [rules](../../docs/02-rules.md), [multi-game contract](../../docs/12-multi-game-extensibility.md).

| ID / owner | Test file and scenario | Observable acceptance |
|---|---|---|
| RULE-01 / W02 | `rules.test.ts`: `deal-conservation` | Exactly 52 unique card instances, 13 per seat, complete deck conserved through legal plays. Ace high; tens retain the current canonical ID. |
| RULE-02 / W02 | `rules.test.ts`: `follow-suit`, `trump-exception` | Follow suit if held; otherwise any legal card without mandatory trump/overtrump; unbroken restricted suit may lead only when no other suit remains. |
| RULE-03 / W02 | `rules.test.ts`: `hearts-opening` | 2♣ leads after passing; no first-trick heart/Q♠ discard if a non-penalty option exists; all-penalty exception works; Q♠ alone never breaks hearts. |
| RULE-04 / W02 | `rules.test.ts`: `hearts-pass-cycle` | Left/right/across/hold rotation; exactly three unique owned cards; all four bundles computed privately against unchanged pre-pass state; reveal/exchange once. |
| RULE-05 / W02 | `rules.test.ts`: `bids-and-nil` | Four clockwise bids, each integer 0–13, no combined-total restriction; Nil resolves individually in solo/partnership; bids cannot change after acceptance. |
| RULE-06 / W02 | `rules.test.ts`: `spades-scoring` | All SC-01–SC-12 goldens preserved, including multiple bag cycles, failed Nil never contributing contract/+1 points; explicit bags state. Solo cases use one-player competitor. |
| RULE-07 / W02 | `rules.test.ts`: `terminal-ties` | Hearts threshold 100 selects unique lowest; Spades 500 selects unique highest; tied leaders continue; both partnerships counted once; moon gives shooter 0/others 26. |
| RULE-08 / W02/W04 | `replay.test.ts`: `complete-trick-once` | Fourth card resolves trick/scoring once; visible collection cannot score again; state revision/event sequence obey frozen semantics. Invalid action changes nothing. |
| RULE-09 / W02 | `module-seam.test.ts`: `non-trick-individual` | Test-only four-individual game completes safe view → mocked choice → action → replay → four-score flow with no bid/trump/partner assumptions; not in production catalog. |
| KNOW-01 / W03 | `observations.test.ts`: `hidden-permutation` | Equivalent information sets serialize identically for observation/view/provider input; no private aggregate/seed/other hands/future/unrelated IDs. |
| KNOW-02 / W03 | `observations.test.ts`: `private-pass-memory` | Only acting seat's permitted outgoing/incoming knowledge; known recipients preserved until public play; no pre-exchange 2♣ holder exposed via leader/turn. |
| KNOW-03 / W03/W18 | `serialization.test.ts`: `canary-leaks` | Canary hidden cards/secrets absent from ordinary/error/job/replay responses and general logs/exports. Output allowlist, not aggregate deletion. |
| KNOW-04 / W05/W13 | `sampler.test.ts`, `trials.test.ts`: `same-knowledge-same-seed` | Same observation and fixed work/seed produce the same analysis/trial despite actual hidden-deal changes; sampled actors have isolated observations. |

The Spades unit fixture `bids=[4,0], tricks=[3,1], oldBags=9` must produce `delta=-240, bags=0`. A full-game counterpart must also reach and score that condition legally.

## Existing UX: preserve behavior, not just screenshots

Source: [product/views](../01-product-and-views.md), [UI-V1 evidence](../../web/qa/UI-V1.md). Tests here add IDs to the approved experience; they do not authorize a redesign.

| ID / owner | Browser scenario | Observable acceptance |
|---|---|---|
| UX-01 / W07 | `table.spec.ts`: `visual-baseline` | Four compact seats, readable blue table, hand below/right coach; seat bid/trick counters and recap scores appropriate to mode; public brand CardFord. No decoration or extra onboarding redesign. |
| UX-02 / W07 | `table.spec.ts`: `prepare-then-play` | Single activation selects. Double gesture off-turn prepares only; wait into own turn with zero command, then fresh on-turn double gesture/Enter plays exactly once. |
| UX-03 / W07 | `table.spec.ts`: `legal-choice-parity` | All legal cards remain selectable even if absent from shortlist; illegal prepared card clears/rejects on current revision. Bid/pass require explicit confirmation. |
| UX-04 / W07 | `table.spec.ts`: `three-game-setup` | Correct names/default; solo opposite seat never Partner; new-game flow cancel has no side effects; game-card activation retires former game internally only after successful command. |
| UX-05 / W07 | `pause.spec.ts`: `pause-reasons` | Pause/dialog/review/background/rotation cancel stale timers; prepared result may finish but no accepted advance; resume refetches then starts fresh delay. |
| UX-06 / W07 | `pause.spec.ts`: `game-speed` | 1×=900/2100 ms, 1.2×=750/1750 ms, 1.4×≈643/1500 ms; reading time unchanged; preference survives reload and speed changes preserve pause. |
| UX-07 / W07/W18 | `accessibility.spec.ts`: `responsive-input` | At 667×375 each exposed card target ≥44 CSS px; no clipped key controls; iPad both orientations; <700px portrait table gate only; no artificial page rotation. |
| UX-08 / W07/W18 | `accessibility.spec.ts`: `keyboard-and-reader` | Visible focus, correct modal trap/restore/inert state, select/play semantics, reduced motion and concise announcements. Marks differ beyond color. Record actual screen-reader checks separately. |
| UX-09 / W11 | `coaching.spec.ts`: `progressive-help` | Notice/Consider/Suggestion/direct shortcut, no automatic answer reveal; all legal actions and dismiss remain available; advice never commits or narrows a move. |
| UX-10 / W11 | `coaching.spec.ts`: `notes-and-recap` | Public facts/private pass memory labelled separately; unplayed includes own hand; recap max one supported strength/review/focus; skip/next always works. |
| UX-11 / W13 | `review.spec.ts`: `return-to-live` | Original/Possible continuation labels, prior current-game hands selectable, latest live state restored after another tab/reload; new game ends old review access. |
| UX-12 / W08/W14–W16 | `demo/subscription/family.spec.ts`: `portrait-account` | Login/offer/payment return/subscription/family works in portrait with no table gate; chosen offer and saved table survive redirect; cancellation and billing repair are easy to reach. |
| UX-13 / W07 | `table.spec.ts`: unavailable cards and prepared-card invalidation | Active-seat cues and numeric counts replace repeated visible status copy. Server legal actions alone determine unavailable cards; legal exceptions stay available. Accessible turn/card labels remain. |
| UX-14 / W07 | `table.spec.ts`: inline last trick | Latest public trick sits outside the table on the left, with four seat positions and winner marking, no visible names or dialog, and zero notes/unlock requests. Fits desktop/tablet/landscape phones; clears for a new hand. |
| UX-15 / W07/W13 | `table.spec.ts`: compact copy and keyboard details | Short labels and optional explanations in settings/recap/review dialogs; keyboard expansion, focus trapping/restoration and provenance/usage context are preserved. Historical notes UI is superseded by UX-20. |
| UX-16 / W07 | `table.spec.ts`: hand-end and match-end Play again | Existing next-hand command continues match scores; existing new-game command restarts the same mode after match completion. Each requires explicit activation. |
| UX-17 / W07 | `table.spec.ts`: responsive table geometry | A separate left column reserves last-trick space and the table shrinks to fit. Narrow landscape hands scroll horizontally with keyboard focus reveal; short tablet pages scroll vertically to retain the hand. Phone portrait retains the rotation screen. |

UX-13–17 implement the later owner direction in [CR-UX-004](../decisions/CR-UX-004-table-cues.md). Actual results: [cue and copy verification](../../qa/implementation/ui-cues-acceptance.md) and [external last-trick verification](../../qa/implementation/ui-external-trick-acceptance.md).

UX-18–20 implement [CR-UX-005](../decisions/CR-UX-005-game-entry.md): use supplied CardFord SVGs at entry points, replace the modal game picker with paced full-page setup and card activation, and remove the specified table clutter. Actual results: [minimal UI verification](../../qa/implementation/cardford-minimal-ui-acceptance.md).

Initial explanation budgets: 6-word heading, 18-word cue, 35-word context/suggestion. Expansion may be longer. Test useful meaning and layout, not brittle exact copy except required labels.

## Strategy, coaching and assessment

| ID / owner | Suite/scenario | Observable acceptance |
|---|---|---|
| STRAT-01 / W05A | `strategy.test.ts`: `complete-action-space` | 286 distinct full Hearts triples at 13-card pass, 14 bids, complete legal plays; stable action IDs; human legal set never reduced. |
| STRAT-02 / W05A | `strategy.test.ts`: `forced-vs-shortlist` | One legal choice gives forced provenance/zero provider calls. More than one legal choice but one shortlisted gives local policy bypass, never forced. |
| STRAT-03 / W05A | `strategy.test.ts`: `nil-cover-and-solo` | Protect live Nil partner even after contract made; correct H2/HA regression; opposite seat remains opponent in solo; unfinished trick never labelled certainly safe. |
| STRAT-04 / W05B | `sampler.test.ts`: `uniform-small-states` | Frequencies match exact feasible-world enumeration within predeclared statistical tolerance; no card-count/known-holding/void violations; bias tests separate from mere feasibility. |
| STRAT-05 / W05B | `bidding.test.ts` plus evaluation | Current heuristic remains named/unvalidated; compare A/B on grouped held-out deals and multiple policies with frozen downstream versions; C only after separate value evidence. |
| STRAT-06 / W05B/W17 | offline manifests | Same-world candidate comparisons, per-action coverage/truncation, horizon/policy versions, exact/estimated labels; three arms separate shortlist loss and Jev selection value. |
| COACH-01 / W11 | `coaching.test.ts`: `predicate-only` | Teaching text cites verified facts/labelled estimates; no invented Jev rationale, raw heuristic probability, win-odds/confidence label or mental-cause diagnosis. |
| COACH-02 / W10–W11 | `assistance.test.ts`: `issued-vs-reported` | Requested but unready, saved/issued delivery-unknown and display-reported states distinct. Suppressing callback never creates independent evidence. |
| COACH-03 / W11 | `coaching.test.ts`: `nudge-budget` | Only nudge mode allows live marker; one cue per decision and ≥3 completed tricks; no auto escalation, forced/weak nudge or locked-hand spend. |
| COACH-04 / W12 | `assessment.test.ts`: `abstain` | Omitted human action evaluated; material disagreement/missing coverage abstains; outcome/shortlist/Jev agreement alone never proves error. |
| COACH-05 / W12 | `progress.test.ts`: `fresh-hand-transfer` | Only fresh eligible hands/assessor/context count independently; notes or issued help affect later choices, not retroactively the accepted source action. Trials/forced cases excluded; coverage includes abstentions. |
| COACH-06 / W12 | progress audit | Factual counts/Building evidence until validated cluster-aware trend; 20/20 opportunities across ≥3 hands each are descriptive defaults, not statistical proof. |
| COACH-07 / W13 | `review.test.ts`: `original-reconstruction` | Complete accepted actions rebuild original choices/facts through pause boundary; no provider call or hidden reveal; missing trail says replay unavailable. |
| COACH-08 / W13 | `trials.test.ts`: `isolated-alternative` | Alternative samples original knowledge through one trick; recompute actors, dedupe trial ID, no live snapshot/revision/score/action-count changes or progress credit. |

Name the eight end-to-end teaching fixtures explicitly: `hearts-incoming-card-breaks-planned-void`, `solo-opposite-seat-is-opponent`, `partner-control-and-live-nil`, `reasonable-choice-loses-to-unseen-trump`, `help-then-fresh-transfer`, `pause-dismiss-reload-next-game`, `review-after-further-live-play`, `alternative-then-match-review`. They implement the eight scenarios in planning/04. Their accepted assertions must be independently reviewed before evaluating a policy against them.

## Service, access and payment failure matrix

These are precise implementation targets for existing T cases. Assert safe HTTP outcome **and** durable rows/state; do not pass a test merely because a mock function was called.

| Case / test file | Setup → action | Required result / T mapping |
|---|---|---|
| `commands.test.ts` duplicate | Accept legal command; discard response; submit exact envelope again. | Original accepted revision/result recovered; one accepted command; T09. |
| Conflicting reuse | Same owner/route/command ID, different action or revision. | Conflict, zero second mutation; digest evidence retained; T09. |
| Competing writers | Two independently authenticated clients submit different actions at one revision. | At most one accepted; loser sees authorized safe current view; T09. |
| `journal.test.ts` atomicity | Fail essential journal/outbox insertion within acceptance transaction. | No accepted move/unlock acknowledgement; snapshot/events/usage unchanged; T27. |
| Exporter outage | Stop optional analytics/metrics delivery after a successful essential transaction. | Play continues; durable outbox backlog/recovery visible; storage-safe threshold eventually blocks new mutation safely; T26/T28. |
| `access.test.ts` ownership | Two players, two families; payer requests member game/result/export by known ID. | Denied without leaking existence/detail beyond approved error policy; own allowed reads still work; T06/T23/T43. |
| `route-policy.test.ts` deny | Add an unclassified route or remove its authorization wrapper in a controlled test. | Registration/build or authorization suite fails; T36/T43. |
| `revocation.test.ts` stale cache | Warm result/access cache on replica A; revoke on B; read/publish via A. | Current generation denies/fences; no cached bypass; T14/T22/T43. |
| Sign-out vs disconnect | Close HTTP request after valid job admitted, then separately revoke session/security. | Disconnect may recover a committed authorized result; revoked session cannot retrieve; security-revoked job cannot publish; T13/T14. |
| `usage.test.ts` first-use race | One remaining unit; absent usage rows; 50 different eligible-hand requests from ≥2 API processes. | Exactly one reserve; no negative/free/over-limit counters; T12. |
| Midnight | Reserve at 23:59:59 UTC, finish after midnight, restart and retry. | Original allowance period charged/released once, new period unaffected by old completion; T15. |
| First answer stale | Advance original decision before first result; delayed worker finishes. | Release if no usable result was ready; no charge or highlight on new decision; T16. |
| Saved answer/expiry | Commit usable result, lose response, expire coverage. | Owner with valid session can read saved result/current-game material; no new work or extra unit; T11/T13/T20. |
| Exhausted recap | Active member with zero coaching units completes another ordinary hand. | Score recap and Next hand remain available; no automatic unlock/generated review advice; T17, UX-10. |
| `account-data.test.ts` privacy | Owner requests export/deletion; payer tries member export; late job completes during deletion. | Owned safe export only, sessions/access revoked and jobs fenced; approved record-class retention preserves only permitted minimum accounting; T29. |
| Family removal race | Remove grant while result publication/bot advance reaches commit. | Serialized permission boundary; no post-revocation acceptance unless independent valid grant; no allowance reset; T22. |
| `billing.test.ts` forged success | Visit success URL or submit client subscription/price/role flag. | No entitlement without bound verified Stripe coverage; SUB-03, T18–T20. |
| Stripe event disorder | Duplicate, old, same-second or invalid-signed event; wrong customer/environment/beneficiary. | Deduplicate/reject/reconcile current bound state; no resurrection or miscredit; T19. |
| Pending upgrade | Preview/confirm upgrade; require authentication, decline or delayed paid event. | Show pending/failed state; old paid tier/usage retained until verified successful change; T18. |
| Cancel/downgrade/resume | Confirm in app; repeated request and interrupted Stripe response. | One recoverable billing operation, documented renewal/effective date; paid-through retained; no duplicate charge; SUB-01–03, T18/T20. |
| `family.test.ts` capacity | Race last seat; accept expired/reused/wrong-account invites; remove accepted member. | ≤3 unlimited/2 limited/5 total under proposed plan; period-held slot not reusable, removed member no grant; T21/T24. |
| `openrouter.test.ts` deadline | Queue consumes most of 8 seconds; 429/503 retry tries to use remaining budget. | No renewed full deadline; capped attempts; no timeout retry, no second model; T49. |
| `shadow.test.ts` isolation | Identical play with off, shadow success/failure and mode change with a warm cache. | Same visible/applicable local results/grades; no foreground wait on shadow and no shadow-to-recommend cache reuse; foreground latency meets declared budget; STRAT-06/T30/T49. |

Additional required negative-input matrix: unexpected nested sensitive fields; coerced numeric strings; oversized bodies/arrays; user-defined schema; spoofed forwarded addresses; forged identity issuer/subject; CSRF; invalid origin; denied/rejected-request floods. Reject before expensive work; bound responses/logging and shared budgets; T44–T45.

## Integration, release and evidence

The master plan maps every T01–T49 to work packets. T35 is later PvP and stays not-applicable/deferred, never passed. CG1/CG2/CG3 are current commercial gates; old G0–G4 have different definitions.

Minimum report per run: source revision or hashes, command, timestamp/runtime/DB/browser versions, fixture/deal/policy/schema versions, seed/work budget, result counts, failure counterexample, provider mode and observed model if actually called, Stripe test/live environment and redacted IDs, artifact links and limitations. Test reports containing credentials, complete unrelated private hands or sensitive account information are not acceptable evidence.

Separate four evidence classes:

1. **Correctness:** pure rules/contracts/observation/replay plus real-DB concurrency and failure invariants.
2. **Usability:** current UX journeys, accessibility and separately labelled physical-device/player observations.
3. **Strategic/coaching value:** held-out analysis/evaluator/Jev comparisons with uncertainty and abstentions; neither passing code tests nor user agreement proves skill improvement.
4. **Commercial/operations readiness:** Stripe lifecycle, support/privacy/country/offer decisions, restore/failover, cost and declared-load evidence.

Pilot targets from current specs: in-region non-analysis API p95 <300 ms at declared load; code advice p95 <1 second where budget permits; Jev total deadline 8 seconds. Initial candidate/world/time settings are experiments. Do not claim a capacity tier from server count, registered accounts or an unloaded benchmark.

Use evidence filenames such as `qa/implementation/W04-commands-<run-id>.md` and a small linked status table. Screenshots prove appearance, not private-data safety; mocks prove application handling, not live provider/payment availability; a process crash test does not establish regional disaster RPO.

## CR-STRAT-005 reasoning extension

| IDs | Evidence target |
|---|---|
| TABLE-01/02 | Internal practice table metadata; future human-only remains separately gated; setup copy reads three trained players. |
| KNOW-05, STRAT-07–10 | `spades-reasoning.test.ts`: reachable solo then partnership facts/tactics, hidden-hand invariance and bot/coach agreement; `evaluation/spades-reasoning.ts`: seeded full hands and frozen baseline. |
| COACH-09/10 | `saved-analysis.test.ts`: analysis exists with hints off/quota exhausted, no automatic charge/exposure, stable original review and explicit legacy absence. `spades-full-hand.spec.ts`: quiet complete hands, saved-advice reveal and switching decisions without stale advice. |
| COACH-11 | `table.spec.ts`: game-end final-hand trick results, no live Table notes. |

Scenario family definitions and limits are in [CR-STRAT-005](../12-spades-reasoning.md). Passing these cases is scoped correctness evidence, not all-deal optimality or player-learning proof.

## CR-STRAT-006 to CR-STRAT-008 registration

These IDs were defined in their change records and are registered here by reference.

| IDs | Source | Evidence target |
|---|---|---|
| GR-01–GR-08 | [CR-STRAT-006](../decisions/CR-STRAT-006-typed-game-reasoning.md) | Typed packs, catalog, trace and grouped evaluation as listed in that record. |
| PI-01–PI-08 | [CR-STRAT-007](../decisions/CR-STRAT-007-partnership-inference-guide.md) | Documentation only; runtime implementation of the recipes has not started. |
| EV-01–EV-08 | [CR-STRAT-008](../decisions/CR-STRAT-008-coverage-and-evaluation.md) | Discovery, event definitions, separated experiments, provider gate and reporting rules. |

## CR-STRAT-009 game plan and strength gate

| ID | Suite | Observable acceptance |
|---|---|---|
| GP-01 | `competition.test.ts` | Accessor partition equals the engine's scoring groups for every catalog mode; unknown mode throws. |
| GP-02 | `spades-plan.test.ts`, `plan-determinism.test.ts` | Stance, goals and revisions follow exact facts; identical plan when concealed cards are permuted. |
| GP-03 | `spades-playout-model.test.ts` | Event schema; sampled frequencies within the stated multiple of standard error of an exact enumeration on small endings. |
| GP-04 | `plan-evaluator.test.ts`, `spades-playout-kernel.test.ts` | Common worlds, paired differences, work-count budgets, reported truncation, seat-view continuation. |
| GP-05 | `plan-genericity.test.ts` | Spades, Hearts and the test module reach selection through one orchestrator. |
| GP-06 | `plan-genericity.test.ts`, `hearts-plan.test.ts` | Vocabulary and import-boundary scans pass; non-opposite partnership variant works. |
| SG-01 | `frozen-baseline.test.ts` | Snapshot hashes pinned; 48 golden hands reproduced; benchmark pinned. |
| SG-02 | `spades-playout-kernel.test.ts` | Legal sets, trick winners and scores equal the production engine on random legal hands. |
| SG-03 | `spades-playout-model.test.ts` | Objective identity recorded; team utility in Partners, seat utility in Solo. |
| SG-04 | `spades-cases.test.ts` | Every case replays in both modes; twins share cards, history and legal set; no case claims independent review. |
| SG-05 | `gate-seeds`, `gate-inference`, `gate-rule`, `gate-runner`, `gate-styles`, `spades-gate-adapter` tests | Seed ledger disjoint; intervals deterministic; ordered decision rule; identical rows with 1 and 4 workers. |
| SG-06 | `jev-offline.test.ts` | No leakage in J0 or J1 payloads; nothing is sent; J0 and J1 outcomes read blocked. |
| STRAT-12 | `analysis-outside-transaction.test.ts` | No bounded-search analysis call while a transaction is open; every human decision still has saved analysis. |
| COACH-12 | `coach-fidelity.test.ts` | Swap test: forcing each legal action yields zero contradicting sentences. |
| COACH-13 | `coach-copy-budget.test.ts` | Word budgets met; Solo cues contain no teammate wording. |
| COACH-14 | `coach-abstention.test.ts` | `several-reasonable` carries no single card; considered choices appear only at level 3. |
| COACH-15 | `fact-checkers.test.ts` | Every predicate has a checker; wrong claims are reported false; guarantee claims are never confirmed from one deal. |
| UX-21 | `table.spec.ts` | Advice panel renders both outcomes at each level with unchanged stage labels. |

Evidence for this record is written under `qa/evaluation/`. Passing these suites is scoped correctness evidence. The strength gate reports are the only source for any statement about playing results.

## CR-ARCH-001 foundation and partnership slice

The owner initiated M00–M01 and targeted partnership cases on 5 October 2026. The [adopted MG map](multi-game/compatibility-and-requirements.md) remains the requirement definition; this index does not replace current rules or claim later milestone acceptance.

| IDs | Current slice / evidence | Later gate |
|---|---|---|
| MG-01–03 | Versioned module/facade, competition, public fragments and private-document conformance; `module-contract.test.ts`, `game-document.test.ts` | M03 validated persistence; M04 service/client activation |
| MG-15–17 | Online demo/access/coached-unit/client-port contract freeze | M03–M04 durable access, server demo and client integration |
| MG-07, MG-09–12; PR-01–03, PR-05 | Reachable partner-resource cases, exceptions, actor invariance, shared bot/coach choices and checked cues; `spades-partner-resource.test.ts` | Human acceptable-action/cue review remains deferred |
| MG-13–14; PR-04 | Fresh bounded development run and conditional cap-one Jev shadow diagnostic | Independent strength/learning confirmation and promotion remain separate |

PR-01–05 are recorded by [CR-ARCH-001](../decisions/CR-ARCH-001-multi-game-production-boundary.md) and the [slice change log](../../qa/implementation/multi-game/CHANGELOG.md). Actual statuses, commands/counts and limitations belong to [milestone evidence](../../qa/implementation/multi-game/status.md).

## CR-ARCH-002 current-game extraction

The owner's next-item instruction authorizes M02. Hearts Solo, Spades Solo and Spades Partners now have independent native state, rules, reducers, safe projections and strict private codecs. Explicit registrations supply the frozen module interfaces; the V1 service facade uses game-owned reducers and retains original pins, journals and policy analysis.

| Requirement | M02 acceptance | Remaining work |
|---|---|---|
| MG-02 | Native current-game modules; ten-hand original corpus and frozen policy goldens in `module-parity.test.ts` | New-game modules remain M08–M09 |
| MG-03 | Strict native/V1 private-state validation; corruption regressions in `hearts-module-validation.test.ts` and `spades-module-validation.test.ts` | Persisted unknown-data load/save and durable V2 documents in M03 |
| MG-04 | Exact typed registrations and game-owned V1 reducer dispatch | Bound V2 service/persistence/replay integration in M03–M04 |
| MG-09 | Original reducer/observation oracles, policy attribution, journal boundaries, unsupported-version read-only reader and immutable artifact checks | Durable original saved-document/advice integration in M03–M04 |

[CR-ARCH-002](../decisions/CR-ARCH-002-current-game-module-extraction.md), [M02 change log](../../qa/implementation/multi-game/m02/CHANGELOG.md) and [M02 acceptance](../../qa/implementation/multi-game/m02/status.md) define the scoped result. These entries do not mark the full MG requirements or later milestones complete.

## CR-ARCH-003 system readiness and backend target

The [system review](../../qa/implementation/multi-game/system-review-2026-10-05.md) inspects the existing implementation. [CR-ARCH-003](../decisions/CR-ARCH-003-backend-stack-and-system-readiness.md) adds M02A before further backend implementation, targets Go/PostgreSQL while preserving React/Vite, and overrides the older TypeScript-only backend prescription. Rust remains the evidence-backed alternative; no language performance winner has been measured.

The authoritative [SYS-01–12 acceptance register](multi-game/backend-readiness.md#acceptance-register) extends MG requirements: portable parity, exact work caps, strict platform records, immutable prepared results, accepted-command reconciliation, replay/compact history, short transactions, bounded execution, recoverable transport/trials, safe historical reading and preserved full journeys. Complete replacement-system acceptance remains pending. CR-FIX-001 below corrects urgent defects in the current TypeScript reference; M02A still owns Go compatibility and M03–M06 own the remaining durable and end-to-end gates.

## CR-FIX-001 urgent current-system repairs

[Decision and compatibility scope](../decisions/CR-FIX-001-urgent-system-repairs.md); [execution evidence](../../qa/implementation/multi-game/urgent-repairs/status.md). These regression fixtures must survive the Go port. They do not accept an unimplemented replacement path.

| ID / related requirement | Required repair and primary tests | Remaining boundary |
|---|---|---|
| UR-01 / SYS-02 | Count before root/continuation operations, truthful exhaustion, exclude incomplete paired worlds; `plan-evaluator-budget.test.ts` | Whole-pipeline sampler/memory/cancellation and admission limits |
| UR-02 / SYS-03 | Strict active V1 state and row binding before use/save; atomically reject corruption without rewriting history; `stored-state-boundary.test.ts` | Complete platform/history schema and V2 persistence |
| UR-03 / SYS-04 | Durable pre-compute claim, immutable issued results, reuse, original generation/control/expiry fences; `preparation-recovery.test.ts` | General analysis execution isolation and replacement service |
| UR-04 / SYS-05 | Live-owner accepted-command status and original completed-trial recovery after state/access changes; `preparation-recovery.test.ts` | Complete safe historical read-only journey |
| UR-05 / SYS-09 | Bounded fetch/body wait, original pending identity through explicit retry/reload, owner and lease checks; `client-recovery.test.ts`, `table.spec.ts` | Full replacement-service/browser acceptance; storage-disabled reload cannot retain pending requests |
| UR-06 / SYS-02, SYS-08 | Inner provider deadline fences later accounting and dispatch even before the outer clock/timer expires; `openrouter.test.ts` | Provider remains off; this is fixture-only deadline evidence, not live provider acceptance |

Hosting, operational infrastructure, native packaging and large capacity campaigns remain deferred with owners/triggers in that packet. Basic functional correctness, privacy, bounded failure and recovery remain first-app requirements. Existing M00–M02 acceptance is retained as scoped historical evidence.

**M02A update:** the [bounded Go/PostgreSQL gate passed](../../qa/implementation/multi-game/m02a/status.md), with 388 passing test/subtest events, 422 exact supported checkpoints, one complete persisted Partners hand and declared local resource limits met. This supplies scoped SYS-01/02/12 evidence; it does not complete the full replacement SYS register or replace the UR fixtures above. M03 platform records and replay anchors are next.
