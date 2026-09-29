# Scenario discovery and Jev evaluation plan

> **For agentic workers:** use `superpowers:executing-plans`, or bounded subagents after shared interfaces are frozen. This is a plan for later execution; unchecked steps are not completed evidence.

**Goal:** determine whether the scenario system, Jev or their combination improves fair-information play and useful coaching, then whether the coach improves later unaided decisions.

**Architecture:** one frozen protocol connects independently discovered positions, blind action rubrics, optional event forecasts, complete policy matches and a separate player study. The evaluator owns hidden truth; selectors and reviewers receive only their permitted projections.

**Tech Stack:** existing Node 24/TypeScript rules, observation and record modules; offline evaluation runners; the existing server-only OpenRouter Choice adapter. No new runtime model or generated coach prose.

**Spec:** [Coverage and success review](../specs/2026-09-29-scenario-coverage-and-success.md), [Spades guide](../specs/2026-09-29-spades-partnership-reasoning-guide.md), [CR-STRAT-008](../../../planning/decisions/CR-STRAT-008-coverage-and-evaluation.md). Complements the [reasoning implementation plan](2026-09-29-partnership-inference.md).

**Status:** planned, no live requests or strength/learning results. Inspected baseline `eebe51e`; normal server config keeps Jev off. The first deliverable is the offline corpus/protocol, before new strategy implementation.

## Global constraints

- Rules, legal actions, arithmetic and public facts are code. Same permitted knowledge for every arm; no actual hidden deal or future event in selector inputs.
- For Spades, primary comparisons expose the complete legal set: at most 14 bids or 13 plays. Forced moves bypass Jev and are excluded from strategic denominators.
- Jev Choice probabilities are not event probabilities or ground truth. Jev cannot grade its own answer into passing.
- Full-reference local search is an imperfect comparator. Exact proof requires information-consistent plans and exhaustive relevant holdings/responses or an analytical derivation.
- Preserve original advice; render supported predicates for the action actually selected. Do not claim to know why Jev chose it.
- Develop on original/synthetic cases and lawfully available data. Keep raw player identities, hidden hands, seed-derived IDs and evaluator labels out of provider payloads.
- Freeze experiment, model/policy/prompt/feature/rule versions, data partitions, candidate encoding, budgets, outcomes and stopping rules before confirmatory runs.
- No live execution without a separately approved finite experiment budget and provider-readiness checks. Never reset the exhausted smoke ledger.

**Initial game scope:** Spades Partners, with separately reported Solo regression. The review dataset and proposed sample sizes below apply to this Spades experiment. Another game repeats the method with its own phases, objectives, symmetry rules and sizing; results are never pooled into a universal card-game strength score.

## Review focus

1. Can a non-diamond, unknown-style or no-cue position expose a gap the authored catalog missed?
2. Does a forecast predict a defined event, or only restate a heuristic/preference score?
3. Are counterworlds, rotations, repeated calls and carryover hands incorrectly counted as independent samples?
4. Does Jev receive the local answer, fewer choices or concealed information that makes the comparison misleading?
5. Are provider failures, truncated matches or uncertain human assessments being selectively omitted?
6. Does a Jev-selected card receive an unsupported local rationale, or does assisted success become a learning claim?

## 1. Three questions, three experiments

| Experiment | Primary question | Primary measure |
|---|---|---|
| Frozen positions and rendered advice | Is the action defensible and the cue accurate/useful from the information then? | Blind acceptable-set and serious-harm rates; factual-claim correctness; assessment/cue coverage. |
| Complete policy matches | Does the policy win more across the declared opposition and partner mix? | Full-match win rate; paired score/contract/Nil/bag outcomes explain it. |
| Experienced-player transfer | Does coaching improve later independent decisions? | Baseline-adjusted delayed unaided decision quality on fresh comparable opportunities. |

Shadow decisions alone answer neither the second nor the third question. A coach's suggestion applied automatically to a seat tests its policy as a bot; it does not measure teaching.

## 2. Freeze the comparison arms

| Arm | Selector and supplied material | Purpose |
|---|---|---|
| D0 | Frozen current local policy, initially `spades-tactics-2.1.0`. | Baseline/regression reference; no expert status. |
| D1 | New deterministic scenario policy; exact facts, conditional hypotheses, explicit conflicts and its declared planning budget. | Does the authored reasoning itself add value? |
| J0 | Jev; original own/public information, rule/objective summary, exact code facts and all legal actions. No D1 rank, selected action, cue, soft hypothesis or estimated outcome. | Direct Jev versus D1, with arithmetic/legality held in code. |
| J1 | Jev; J0 material plus D1's explicitly labelled hypotheses and per-candidate evidence/estimates/limitations, without D1's selected-action recommendation. | Does combining local reasoning with Jev help? |
| R | Higher-budget, fair-information local comparator using alternative continuation policies. | Diagnostic reference only, not truth or a shipped requirement. |

The permitted knowledge is identical; J1 receives additional **derived analysis**, which is the intervention. Record its provenance. R's scores cannot provide independent labels if R shares the assumptions under test.

Use D1−D0 to assess the scenario work; **J0 versus D1** is the primary model-strength contrast. J1 versus D1 is a predeclared secondary comparison; use multiplicity-adjusted inference if making several superiority claims. Never choose the winning configuration after viewing the final set and present it as preselected.

The older full-reference code → shortlisted code → same-shortlist Jev experiment remains useful **only as a separate shortlist-loss study**. It does not substitute for J0. No primary Spades candidate is silently removed. Future games with larger action sets need their own approved comparison design; do not silently truncate Hearts pass triples.

## 3. Corpus, partitions and blind review

### Discovery before the catalog

- [ ] Freeze several genuinely distinct legal generating policies: baseline, conservative contract play, aggressive setting, Nil cover/attack, bag avoidance and seeded random-legal diagnostics. Verify that style choices actually differ; names alone do not provide diversity.
- [ ] Review two development batches of 100 independent source groups. Sample without requiring a scenario tag; include no-match/no-useful-cue cases. Record source, style, phase, turn, objective/resource axes, current coverage and new interactions.
- [ ] Build the six new child scenarios and the representative acceptance batch in the guide through complete legal deals and prefixes. The diamond group is one development lineage. Do not label a hypothetical partial holding as an already reached fixture.

### Dataset groups

Retain the earlier 400-position authoring baseline: **120 bid / 280 play**, split **200 development / 100 calibration / 100 final test**, with stratification. These are primary positions from independent source groups; related additional views do not increase that count. They are an initial review dataset, not sufficient evidence for every subgroup or a guaranteed effect size.

| Material | Grouping / use |
|---|---|
| Natural synthetic decisions | Source deal; use the originating match-stream group when carryover links hands. Save generator/policy versions. |
| Authored situations | Template lineage plus all deals, suit/rank variants, seat rotations, counterworlds and changed-context siblings derived from it. |
| Rare stress situations | Separate labelled set for both-Nil, repeated bags, terminal ties, endplays and resource conflicts; no natural-frequency claim. |
| Jev repeat/order trials | Same original position group; measure variability, not more independent positions. |
| Human assessments | Separate fresh families and participants from bot development, training and pilot material. |

Each connected group belongs to one partition. Broad mechanisms can occur naturally in several partitions; derivatives of the same authored template cannot. Hold out some partner styles and compound contexts as a declared robustness slice. All examples inspected during authoring are development data.

### Review form

| Field | Required content |
|---|---|
| Observation | Original acting-seat input, rule version, all legal actions; no hidden truth or future play. |
| Acceptable actions | A set with concise conditions; equivalence and competing reasonable plans allowed. |
| Serious errors | Precisely stated prohibited action/claim and why; separate exact violation from strategic judgment. |
| Teaching value | Relevant fact/tradeoff, suitable help level, or no useful cue. |
| Uncertainty | Alternatives, unsupported assumptions, reviewer disagreement and unassessed status. |
| Provenance | Reviewer, rubric version, blind-review timestamp, source-group ID. |

Use two independent competent Spades reviewers where available; at least one is required for an independently reviewed strategic label. Model/agent agreement alone stays authored evidence. Reviewers label before seeing arm outputs, confidence or actual outcomes; adjudicate disagreements afterward and retain both original labels. When a newly selected action was not considered, review it blind without rewriting earlier labels to favor its source.

Assessable coverage is always reported. Forced or non-discriminating equivalent choices cannot inflate a learning denominator. Jev probability mass on the acceptable set can be a preference-alignment diagnostic; it is not probability calibration when several choices are acceptable.

## 4. Probability evaluation

- [ ] Define event schemas separately from action rubrics: hidden ownership/void at a particular observation; contract/Nil/bag event after a specified action; or match victory under a specified continuation policy. Record horizon and policy population.
- [ ] Test uniform-feasible allocation estimates against exact tiny-state counts. For action-history weighting, test on held-out legal trajectories from varied policies. Failing to model how the history was selected can bias an apparently uniform allocation estimate.
- [ ] Keep concealed truth in evaluator-only records. It may label an ownership forecast; it may not tell a selector what to play or make a hindsight action label correct.
- [ ] Fit any calibration mapping on the calibration partition only; freeze it before test. Report reliability curves, bin/event counts, Brier score, log loss, interval/coverage and per-style results. Separate trivial exact events and rare stressed events so they cannot hide poor forecasts elsewhere.
- [ ] For alternative actions, branch legally from the same feasible worlds with common seeds and actor-specific observations. Recompute later choices after divergence. Label the outcomes as model-dependent simulations, not observations of unplayed actions.
- [ ] Compare raw versus calibrated forecasts with a population base-rate and uniform-feasible reference. Bootstrap by source group; extra worlds reduce simulation noise but not incorrect policy assumptions.

Keep Jev's `Choice` distribution and concentration in separate fields. Do not compare them numerically with local heuristic scores, or compare “probability of selecting A” with “probability A wins the match”. This plan does not add Jev Score/Noul self-grading or a new probability UI.

## 5. Frozen-position experiment

- [ ] Give D0/D1/J0/J1 the same saved pre-action observation. Snapshot each submitted candidate set and derived-feature version. Hide rubric, generator identity, source seed and future outcomes from the selectors.
- [ ] Record actual action, validity/bypass/unavailable status, candidate probabilities if returned, assumptions, compute work, latency and cost. No provider response is normalized into a valid answer merely to complete the dataset.
- [ ] Render coach content for the chosen action from verified predicates. If no supported strategic explanation exists, record explanation abstention and show factual context only; never reuse D1's preferred-action reason for another card or invent Jev rationale.
- [ ] Score acceptable-set selection, serious strategy errors, false factual claims, ambiguity and review coverage. Report action agreement as a diagnostic, plus where D1/Jev differ and whether both are reasonable.
- [ ] Test valid seat rotations and non-trump suit permutations, candidate-order perturbations and repeated requests on a fixed development subset. Compare normalized plans/acceptable sets where exact tie-breaking is arbitrary.

This tests the same positions. In the complete-match experiment below, histories legitimately diverge; do not describe later inputs as identical.

## 6. Complete-hand and complete-match experiments

Retain the earlier **200 original deal seeds × four evaluated-seat rotations = 800 hands/configuration** as an initial controlled hand comparison. Rotations are paired replicates, not 800 independent deals. Add full matches because hand-score gain can damage bags or the 500-point objective.

| Configuration | What it isolates |
|---|---|
| One evaluated seat, fixed teammate and opponents | Individual policy contribution without changing cooperation on both sides. |
| Two evaluated teammates, fixed opponents | Joint partnership behavior. |
| One evaluated seat with an unfamiliar partner policy | Dependence on assumed signals or cooperation. |
| J0/J1 team versus D1 team, then team/dealer swaps | Direct head-to-head answer with paired deal streams. |
| All same policy | Interaction/pathology diagnostic; not comparative strength. |
| Spades Solo, evaluated seat rotated | Regression and individual-objective evidence; never pool with Partners. |

Use fixed initial contexts and complete ordered deal streams, all produced by legal engine transitions. Each arm replays its own choices after divergence; a score/bag carryover cannot be patched into a claimed reachable scenario. Zero-start full matches are the primary population; special near-target/bag contexts are a separate stress set.

**Primary unit:** complete match seed stream, with all arms, seat/team placements and repeats inside that cluster. Report per-opponent-style results; freeze the style mixture/weights in advance. An unweighted synthetic mix is a benchmark distribution, not human population prevalence.

**Outcomes:** full-match wins; completion/technical failures; paired score margin; contract, Nil and bag outcomes; serious cue errors; p50/p95 latency; requests, retries, bypasses and actual cost. Record how often new rules/search/Jev were eligible and actually changed the action. A configuration with no changed decisions does not validate a tactical improvement.

The primary direct matchup is **two J0 teammates versus two D1 teammates**, with N/S and E/W assignments swapped on each frozen stream and starting dealer balanced across streams. For stream i, `Y_i = (J0-win in placement A + J0-win in placement B) / 2`; the primary estimate is the mean of these stream outcomes. A tied target continues under the rules; an unfinished match has an unknown indicator. Single-seat, unfamiliar-partner, Solo and other style matchups are prespecified secondary robustness analyses; they do not silently redefine the primary result.

**Failures and stopping:** pure J0/J1 have no silent local substitution. Stop an affected match on an invalid/unavailable response after its declared bounded retry policy; record an unresolved outcome, not an engine loss or a discarded sample. Show attempted/completed denominators and win bounds with unresolved outcomes counted as neither/all possible wins. Completed-only win rates are descriptive. A future explicit `Jev + D1 fallback` arm may finish matches, but its outcomes belong to that combined deployment policy. Budget/deadline exhaustion stops the experiment; it is not permission to reset a ledger or keep only favorable results.

**Administrative match cap:** 100 hands per assigned match for the initial experiment; unresolved at the cap is censored, never scored as a win from the current lead. Preserve it for completion in a separately budgeted continuation. Any material censoring prevents a definitive strength claim.

### Sample size and promotion rules

1. Use a separate **64-match-stream development pilot** to estimate paired variability, completion and cost. This is a sizing/feasibility pilot, not final evidence.
2. Before the final set is opened, choose the fixed number of independent streams from the pilot for **80% power at a two-sided 5% error rate for J0's paired-placement win probability of 0.55 versus the neutral 0.50**. This is five percentage points above parity, not a five-point J0-minus-D1 difference. Document the cluster-level calculation or simulation. The effect size is proposed, not measured benefit or an accuracy target. If cost prevents the planned size, call the result exploratory/inconclusive.
3. Freeze the primary contrast and final run length. Use paired cluster intervals; adjust declared secondary superiority tests for multiplicity. No repeated significance peeking or extending a run only until a result passes.
4. Any hidden-information breach, illegal applied action, fabricated exact claim or score error blocks promotion. Fix it and rerun the affected safety gates.
5. Preserve the earlier provisional hand gate: no worse than the frozen basic baseline by more than five team points per hand, with uncertainty reported. Retain the provisional 5% serious-strategic-harm ceiling on independently reviewed unambiguous positions, using an upper interval bound; this is distinct from the zero-tolerance factual/information gate. Sparse category coverage remains inconclusive.
6. Claim improved match strength only when the predeclared comparison supports a positive gain, important style/Nil/bag subgroups show no unresolved material harm, and missing-outcome bounds do not reverse the conclusion. Do not promote solely for beating random legal or for Jev agreement.
7. Select a runtime role only after availability, p95 latency, compute/cost and explanation coverage meet the separately frozen product budget. If no acceptable operating envelope has been approved, the result supports research only. No new model price or service SLA is asserted here.

## 7. Component ablations

Run these on development/calibration data; choose the final candidate before the final comparison:

- Exact facts only versus facts plus soft hypotheses.
- Hypotheses alone versus explicit conflict resolution; then bounded continuation added.
- J0 versus hypotheses-only hybrid versus estimates-enabled J1.
- J1 with versus without the local selected-action recommendation to expose anchoring; the default J1 omits it.
- Old/new bidding crossed with old/new card play; keep downstream policies responsive to each candidate bid.
- Full legal reference versus local shortlist versus Jev on that same shortlist, only when shortlisting itself is evaluated.

Do not multiply all combinations into an unrestricted tournament. Record which component improved which scenario and which cost it added. A seed change is not an independent evaluator.

## 8. Coaching and human-transfer study

**Usability first:** a proposed 12 experienced-player formative pilot checks cue comprehension, partner credibility, intervention burden, pace, trust and whether a player can explain the tradeoff in their own words. It does not establish learning. Correct misunderstood cues before freezing a trial.

**Learning design:** parallel randomized player groups; avoid crossover because learned tactics carry into the next condition. Use the same frozen bot population, game mode, interface, assistance limits and practice time in all groups.

| Group | Purpose |
|---|---|
| Practice only, ordinary public game information | Active control for improvement from simply playing. |
| D1 coach | Test the scenario coach's added teaching value. |
| Evaluated Jev/hybrid coach | Test incremental model value after its strategy/explanation gates pass. |

If the three-group trial cannot be adequately sized, first test D1 versus practice; later test the model coach versus D1 in a fresh cohort. Do not reuse the first trial's exposed assessment families.

**Schedule:** fresh unaided baseline; two matched practice sessions; immediate fresh transfer; delayed transfer seven days later (± two days). Use a participant-level sizing pilot to set session length and the final participant count for the declared minimum useful improvement before confirmatory recruitment. The 12-person formative pilot is not that powered trial.

**Primary outcome:** delayed independent acceptable-decision rate on a frozen, blinded decision bank with balanced parallel forms at baseline, immediate and delayed assessment. Prespecify phase/objective/difficulty weights and randomize form assignment; no player sees the same source/template family twice. Credit reasonable alternatives and freeze assessability before assignment. Analyze at player level, adjusting for baseline/form and reporting assessment coverage, assigned players, missing follow-up and attrition sensitivity. Freeze the assessor version before trial.

Fresh full-hand transfer is a secondary ecological test, analyzed with decisions nested within hands/players. Coaching can change which situations a player reaches; do not treat a higher rate on an easier or more assessable opportunity mix as improvement. The common primary assessment distribution prevents that bias; report opportunity mix and standardized secondary results using weights fixed before outcomes.

Assessment hands have no optional memory aids, strategic cues, suggestions, retries or prior exposure to those deal/template families. Standard bids, score, visible tricks and legality remain normal game information. Unknown delivery is potentially assisted. A later quiet move in an assisted hand is not independent. Immediate transfer, retention, wins, cue usage, enjoyment, return intent and trust are secondary; none alone proves mastery. Study assessments do not add a mandatory drill catalog to the product.

## 9. Provider-readiness gate

Current [adapter](../../../web/server/providers/openrouter.ts) uses OpenRouter Choice, supports off/shadow, and marks results `shadow-only`. [Server config](../../../web/server/config.ts) rejects runtime activation. The [recorded smoke](../../../web/server/evaluation/evidence/jev-interface.md) observed `typesafe/jev-1.13-20260917` but rejected the response; the failed field is unknown and the cap-one ledger is exhausted.

Before any new live evaluation:

- [ ] Add redacted field-category diagnostics and reproduce validator failure classes with fixtures. Reconcile the historical direct-TypeSafe/four-second description with current OpenRouter/eight-second behavior, and the historical `0.000001` distribution-total tolerance with the current `0.02`. Use current official contract evidence; do not guess the rejected field or loosen checks to pass it.
- [ ] Verify the requested/resolved model pin and response/usage contract. Record unexpected model or routing changes as unavailable for the frozen experiment. Current official references: [Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request), [Choice confidence](https://docs.typesafe.ai/confidence).
- [ ] Use a new explicitly approved experiment ID with durable request/cost limits, deadline, unknown-cost stop, and server-only credentials. Preserve the old ledger. A proposed first diagnostic probe is one synthetic request, cap one, recorded-spend limit USD 0.01 and eight-second deadline; it is not permission to execute now or proof of hard per-request price.
- [ ] After the diagnostic gate, freeze a schema/representation pilot of 40 original synthetic positions plus eight prespecified order/repeat checks, no automatic retries. Its separate cap/cost budget must be approved; do not reuse the one-request manifest. It is interface evidence, not a strategy-strength sample.
- [ ] Review permitted provider route, retention/training settings and redaction before any player-derived data. Start with synthetic observations. [Provider logging policies vary](https://openrouter.ai/docs/guides/privacy/provider-logging); safe input projection does not itself establish zero retention.
- [ ] Keep the experiment runner isolated from normal game configuration. A future head-to-head runner may apply a validated shadow choice only to its private experimental game state; this does not activate Jev for ordinary bots, suggestions or grades.

## 10. Future implementation packets

All paths below are proposed unless already present; no listed command is a result from this design review.

| Packet | Files and interface | Executable acceptance after implementation |
|---|---|---|
| E1 Corpus and rubric | New `web/server/evaluation/scenario-discovery.ts`, `review-corpus.ts`, `protocols/partnership-jev-v1.json`; extend existing casebook. `buildCorpus(protocol)` emits seat-safe review rows and separate evaluator truth; `validateGroups` rejects partition overlap. | `node --test --test-isolation=none web/server/tests/scenario-discovery.test.ts`: legal replay, no-match sampling, all sibling types kept together, blind projection, six child scenarios. |
| E2 Probability evidence | New `web/server/evaluation/probability-evidence.ts`; `scoreForecasts(eventSpec, predictions, truth)` requires matching event/horizon/population and calibration partition. | `node --test --test-isolation=none web/server/tests/probability-evidence.test.ts`: exact tiny counts, distinct void/ruff events, no q-to-win conversion, group-level metrics, unknown/unplayed outcomes rejected. |
| E3 Safe provider experiment | Modify `web/server/providers/openrouter.ts` diagnostics and new `web/server/evaluation/jev-comparison.ts`; reuse secrets/durable ledger; no change to normal config activation. `selectExperimentAction` returns selected/unavailable with provenance. | Existing `openrouter.test.ts`/`provider-ledger.test.ts` plus new `jev-comparison.test.ts`: raw versus derived payloads, no label/rank leakage in J0, distinct-action cue support, model drift, invalid response, exhausted/unknown-cost caps and no silent fallback. |
| E4 Policy matches and reporting | New `web/server/evaluation/policy-matches.ts`, `evaluation-report.ts`; reuse `reasoning-matrix.ts`. `runPairedMatches(protocol, selectors)` records complete streams and unresolved outcomes. | `node --test --test-isolation=none web/server/tests/policy-matches.test.ts`: divergence replay, four-seat transforms, match carryover, 100-hand censor, provider failure denominator, repeat clustering and independent style behavior. |
| E5 Human study assets | Versioned blind rubric, consent/data protocol and fresh assessment manifest in `qa/evaluation/`; reuse assistance records and existing coach UI. | Dry-run baseline/practice/immediate/delayed flow; verify no training-family leakage, no quiet-hand assistance reset, no Jev-rationale fabrication and participant-level reporting. |

**Manifest required fields:** experiment ID/status; owner-approved live limits; requested/resolved model pins; source and policy hashes; rule/observation/content/evaluator versions; arms and candidate policy; event definitions; dataset group partitions; seat/style configuration; work/deadline/retry/fallback rules; primary/secondary outcomes; pilot-sizing report and final sample size; uncertainty method; harm/operating criteria; stop/censor rules; output/retention locations. Missing required fields disable dispatch and confirmatory status.

Build E1 and the scenario fixtures first. E2 follows only when introducing genuine numerical forecasts. E3 must pass offline fixtures before the provider gate; E4 first runs entirely local/mocked, then separately bounded live experiments. E5 follows strategy and explanation safety. Every packet records actual commands, results, source hashes and remaining gaps; no runtime or paid experiment begins as part of this planning request.
