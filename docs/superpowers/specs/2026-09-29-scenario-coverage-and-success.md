# Scenario coverage, probabilities and product success

**Status:** design review, 29 September 2026. No strategy implementation or live Jev experiment is authorized by this document. [Owner change record](../../../planning/decisions/CR-STRAT-008-coverage-and-evaluation.md) · [Evaluation plan](../plans/2026-09-29-scenario-and-jev-evaluation.md) · [Spades guide](2026-09-29-spades-partnership-reasoning-guide.md).

## 1. What makes CardFord succeed

The [product](../../../planning/01-product-and-views.md) and [coaching specification](../../../planning/04-coaching-and-evidence.md) remain the authority: experienced players enjoy complete games and learn to make better decisions themselves. Scenario coverage is an engineering means to that outcome.

| Success dimension | Evidence we need | Insufficient substitute |
|---|---|---|
| Better unaided decisions | Fresh, unassisted transfer and delayed retention, independently assessed with reasonable alternatives. | Following a suggested card; winning an assisted hand. |
| Useful, trustworthy coaching | Correct facts, conditional strategy, relevant short cues and selective review that players understand. | A long explanation; agreement with Jev or the local policy. |
| Credible, enjoyable bots | Fair-information full matches, cooperation across partner styles, few inexplicable plays, acceptable pace and player feedback. | Highest win rate against one weak opponent; perfect cooperation in self-play. |
| Sustainable operation | Measured latency, availability and cost at the intended call rate; reliable local play and saved advice. | A single successful provider request or token-price estimate. |

Keep Notice → Consider → Suggestion and the current concise copy budgets. All human decisions still receive saved analysis when cues are off. Coaching never makes the legal choice for the player. A different Jev choice requires an explanation supported for **that action**, not the deterministic policy's discarded rationale.

## 2. Findings from this review

| Finding | Resolution |
|---|---|
| The 60 recipes are a useful foundation, but do not establish completeness. | Treat the catalog as a versioned set of decision mechanisms; discover gaps independently of its own labels. |
| The diamond example was becoming the first implementation's center. | Retain it as one ambiguous-information fixture group. The first acceptance batch now spans ordinary control, discard structure, trump access, Nil, bidding and score context. |
| Six important compound branches were named only generally or omitted. | Add explicit child scenarios to the Spades guide: crossruff, guard-preserving discard, first-trump consequence, opponent Nil cover window, repeated bag cycle and forced-lead endplay. |
| A fixed probability attached to a scenario would hide different hands, objectives and policies. | Define a predicted event, conditioning information and policy assumptions before calculating or calibrating any probability. |
| Existing benchmark plans did not isolate direct Jev from local shortlisting or supplied advice. | Add full-legal-set direct Jev and hybrid arms; retain shortlist loss as a separate experiment. |
| Winning, advice quality and learning were not equally concrete in the plan. | Use separate bot, coaching and human-transfer experiments with separate conclusions. |
| Live Jev integration is not established. | Preserve the failed cap-one smoke; diagnose with fixtures before any separately approved live test. |

The six additions are new **decision branches**, not six more claims of optimal play. Existing rows remain sufficient for our K under partner's Q, an already-met personal bid with unmet team contract, and ordinary illegal spade leads. Renaming these would inflate coverage without adding reasoning.

## 3. Build the foundation once; maintain the evidence

Do the main rule analysis, objective map, scenario authoring and initial casebook once for each game/variant. Runtime play uses the resulting typed modules; it does not regenerate a scenario guide. Subsequently revise only for a rule change, a meaningful counterexample, a new objective/variant, or evidence that an assumption fails. A permanently frozen exhaustive catalog is not a defensible promise.

Shared infrastructure owns evidence records, scenario links, versioning, safe observations, reports and evaluation orchestration. Each game owns legal implications, information visibility, objectives, conventions, scenario predicates and cues. Keep the existing four-seat scope; other seat counts require a separate design change.

### Discovery axes

Generate situations from these axes before matching our authored catalog. Do not enumerate their full Cartesian product; reject unreachable combinations, cover meaningful pairs, and explicitly test three-way conflicts.

| Axis | Spades examples | Transfer to another game |
|---|---|---|
| Decision phase | Bid, lead, follow, void/discard, late hand, match boundary. | Its actual phases, including pass/draw/meld if applicable. |
| Position | Leader; second/third/fourth; partner or opponent still to act. | Legal order and which actors still have choices. |
| Objective | Need credit, live/failed Nil, bags, set attempt, terminal win/tie. | Its scoring and competing obligations. |
| Resources | Winners, guards, trump length, voids, entries, safe exits. | Resources that can be spent, protected or transferred. |
| Knowledge | Exact, bounded, ambiguous, misleading, contradicted, incomplete. | Its permitted knowledge and invalidation events. |
| Relationship | Individual; teammate; unfamiliar partner; different styles. | Declared teams and legally permitted coordination. |
| Horizon | Current trick, two-way transfer, remaining hand, carryover match. | The horizon over which the consequence occurs. |
| Conflict | Cover Nil versus contract; draw trump versus ruffs; bags versus set. | At least two plausible plans with different beneficiaries or costs. |

**Required compound tests:** later opponent × possible ruff × need to cover Nil; failed Nil × contract credit × bags; losing an entry × long suit × turn order; unfamiliar partner × ambiguous signal × match risk. These cannot be inferred from testing each axis separately.

### Discovery workflow

1. **Start from rules and objectives.** List what a player can observe, legally do, win/lose and preserve. Classify exact implications before tactical preferences.
2. **Observe complete legal games from several frozen policies.** Include conservative bidding, aggressive setting, Nil protection/attack, bag avoidance and unfamiliar partners. Include a seeded random-legal policy as a diagnostic, never the only opponent.
3. **Sample positions independently of catalog matches.** Include ordinary decisions, no-match positions, conflicting tactics, abstentions, surprising choices and good decisions with bad outcomes. Keep a random sample; selecting only losses creates another bias.
4. **Review blind.** Reviewers see the actor's original observation, not the producing policy, proposed answer, hidden deal or later outcome. Permit “no useful cue”, multiple acceptable actions and “no existing scenario fits”.
5. **Investigate disagreements.** Jev/code disagreement, human disagreement and changed actions nominate cases; none defines the correct answer. Explain the competing plans using the same information.
6. **Minimize the case without breaking legality.** Reconstruct from a full legal deal and action prefix. Add a changed-public-context sibling and, where relevant, an indistinguishable hidden-world sibling.
7. **Classify the novelty.** New fixture if the existing rule/exception/cue suffices; child scenario if a new interaction changes the action or explanation; new family only if a new decision mechanism is needed.
8. **Record evidence and affected consumers.** Preserve author, assumptions, statuses and the motivating failure. Cases used to change the guide belong to development, including all descendants.

Ordinary mixed-policy replays estimate **frequency under that generator**. Authored rare-state fixtures measure robustness. Only suitable player data can support claims about human frequency. Do not blend an oversampled Nil/endgame stress set into “common play” rates without known population weights.

### Stop criteria for initial authoring

The foundation is ready for implementation when every game phase/objective has a decision map; the planned axes/conflicts have reachable cases or named gaps; two independent development discovery batches of 100 source groups have been reviewed with unmatched cases recorded; and no unresolved exact-rule/information contradiction remains. The batch size is an authoring checkpoint, not a completeness or statistical guarantee. Strategic ambiguity can remain explicit.

Human frequency and strategic superiority may still be unknown. Implement sound facts and proposed tactics with their honest statuses; later evidence governs stronger claims. New important failures reopen the relevant family rather than restarting the whole game's authoring.

## 4. Probabilities: define the question first

Deterministic execution and uncertain information are compatible. Fixed code, inputs and evaluation seeds can produce reproducible estimates. That does not make those estimates certain or calibrated.

| Quantity | Meaning and source | Allowed interpretation |
|---|---|---|
| Exact fact / proof | Consequence of all relevant legal holdings/responses, or analytical proof. | A fact with its scope; no sampling confidence needed. |
| Allocation frequency | Fraction of feasible deals satisfying an event under a named allocation model. | Exact-under-assumption if exhaustively counted; otherwise a sampling estimate. Not automatically the real posterior after strategic play. |
| Ownership/length forecast | For example, probability East is now club-void, using permitted information and a specified model of prior actions. | Test offline against concealed holdings withheld from the selector; retain population/policy provenance. |
| Action-conditioned outcome forecast | Probability of team contract, Nil survival, a bag penalty or match win after action A, under named continuation policies and horizon. | A model-dependent forecast requiring outcome validation; one forecast for each event, not one universal move confidence. |
| Jev Choice probabilities/confidence | Distribution over supplied action options and a statistic of its concentration. | Preference diagnostics; not ownership, correctness, or match-win probability. |
| Heuristic weight / rubric label | Internal preference score or a reviewer's acceptable action set. | Neither is a probability target by itself. |

For example, “third club lead is ruffed” depends on remaining club length, trump, order, legal obligation, Nil/contract/bag goals and the policy choosing whether to ruff. The same scenario ID cannot supply a reusable `70%` constant. Estimating a void is also different from estimating a voluntary ruff.

### Learning and checking numerical estimates

- Define `event`, observation/policy/rule versions, forecast horizon, data source, allocation assumptions and population before fitting anything. Begin with contract/Nil/void events whose truth is well defined.
- Separate development, calibration and untouched test groups. Use casebooks for logical coverage, not a manufactured population prior. If data are resampled, keep strata separate or use known sampling weights.
- Small complete enumerations test the sampler and arithmetic. Natural synthetic play tests forecasts under those generating policies; evaluation against unfamiliar policies tests robustness. Neither certifies human calibration.
- Report reliability curves with bin counts/intervals, Brier score, log loss, coverage and subgroup failures. Proper scores also measure discrimination; a lower score alone does not establish better calibration. [Calibration guidance](https://scikit-learn.org/stable/modules/calibration.html).
- Never convert the actual result of the chosen card into an observed result for unplayed alternatives. Alternative outcomes require fresh legal branches, with uncertainty and continuation policy recorded. Information-safe simulation is evidence about that model, not a replay of what necessarily would have happened.
- Keep percentages internal initially. Showing numerical player-facing probabilities requires separate evidence and a product decision. Ordinal hypotheses in the existing guide remain the initial implementation; numeric forecasts are a later, separately validated component.

## 5. Avoid fitting the system to its own examples

| Risk | Required control |
|---|---|
| Diamond-example dependence | Include other non-trump suits, trump itself, all positions and changed objectives. Diamonds have no special strategic branch. |
| Cosmetic variation counted as new evidence | Group suit/seat/rank-derived siblings by template/deal lineage. Rank changes are only invariances when all relevant order relationships are preserved. |
| Incorrect symmetry | Rotate dealer, seats, teams, scores and history together. In Spades, permute non-trump suits with their entire context; never exchange trump with a side suit. Other games define their own valid transformations. |
| Exact card matching teaches brittle rules | Compare acceptable action sets and information-normalized plans. Arbitrary tie-breaking among equivalent cards is not strategic superiority. |
| Policies manufacture their own truth labels | Use blinded review and tractable proofs, plus alternate continuations. Another seed with the same evaluator does not remove shared evaluator bias. |
| Local advice anchors Jev | Direct arm omits local rankings/recommendation. Hybrid labels supplied hypotheses/estimates; an added local recommendation is a separate ablation. |
| All tests originate from catalog rows | Keep independently sampled unclassified/no-cue positions, out-of-style partners and conflict discovery. Report unmatched frequency as well as named coverage. |
| Repeatedly tuning on the final set | Freeze hashes, comparisons and stopping rules. An examined failure and its descendants become development data; obtain a new holdout for the next tuned candidate. |

A rare squeeze may be useful as a stress test; ordinary follow/discard/Nil decisions deserve the first authoring and usability effort. Frequency, strategic consequence and uncertainty guide priority. They are measured dimensions, not invented “mastery” percentages.

## 6. Concept review disposition

**Retain:** typed game packs; exact facts versus hypotheses; scenario/tactic separation; seat-safe bot/coach analysis; concise authored text; versioned original advice.

**Refine:** initial coverage batch, compound scenarios, probability semantics, independent discovery, direct versus hybrid Jev comparison, action-to-cue fidelity and a concrete unaided-transfer study.

**Defer:** runtime changes, calibrated percentages in the UI, live Jev activation, maintainer backend, difficulty controls, additional game implementations and any claim that every possible play is covered.

Sources checked on 29 September 2026: [TypeSafe confidence](https://docs.typesafe.ai/confidence) defines distribution-derived confidence; [Bidding in Spades](https://arxiv.org/html/1912.11323v2) studies contextual bidding and Nil calibration rather than universal hand coefficients; [commercial Spades research](https://edpowley.com/academic/papers/aiide13.pdf) separates measured strength from perceived play quality; [information-set search](https://eprints.whiterose.ac.uk/id/eprint/75048/1/CowlingPowleyWhitehouse2012.pdf) motivates plans that respect hidden information. None provides measured evidence for our new scenarios or Jev integration.
