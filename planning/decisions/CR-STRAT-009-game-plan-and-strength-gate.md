# CR-STRAT-009 — Generic game plan and strength gate

**Date:** 29 September 2026. **Design:** [game plan and strength gate](../../docs/superpowers/specs/2026-09-29-game-plan-and-strength-gate.md). **Builds on:** [CR-STRAT-005](../12-spades-reasoning.md), [CR-STRAT-006](CR-STRAT-006-typed-game-reasoning.md), [CR-STRAT-007](CR-STRAT-007-partnership-inference-guide.md), [CR-STRAT-008](CR-STRAT-008-coverage-and-evaluation.md).

## Owner authority

Owner request of 29 September 2026, quoted:

> we need to work on the bots and coaching quality of our cards game (cardford) … I recommend keeping the shared Spades rules and facts, while measuring Solo and Partners separately. … 1. Freeze today’s policy as the comparison baseline. 2. Build reachable, independently reviewed cases for the six partial scenario families, including the same position evaluated under Solo and Partners. 3. Improve one family at a time, starting with contextual bidding in both modes, then the partner-specific double-Nil and lead-planning cases. 4. Compare each change on fresh grouped deals against several opponent styles. Report Solo and Partners separately: score margin, contract and Nil outcomes, bag penalties, factual cue accuracy and cases where the coach abstains. … maybe after that we use Jev model to test in game bot and coaching decisions against current design … game plan by bots is crucial to our game design, and this should be generic not only for spades but works for any other partnership/solo cards game. design and implement this fully and test the app locally

**Covered by that request:** the design, the frozen baseline, the case store, the three family changes as selectable policy profiles, the strength gate, the generic plan layer and local testing.

**Not covered; each needs a recorded owner decision:**

| Decision | State after this change |
|---|---|
| Changing the live default Spades policy | Not changed. `spades-tactics-2.1.0` stays the default. |
| A competent human reviewer's labels, or a written waiver | Missing. Agent reviews are recorded as authored evidence only. |
| Any live Jev request or budget | Not authorized. Offline harness only. |
| Any change to Hearts bot or coach behaviour | Not changed. `hearts-baseline-1.0.0` stays the default. |

## Reason

The 2.1.0 policy ranks each decision by additive weights. It has no hand-level plan, its contextual bidder moves a bid by at most one step, and versions 2.0.0 and 2.1.0 chose identical actions on all 180 matrix hands. Earlier comparisons used 12 to 24 deal seeds and could not separate partnership results from zero.

## Decision

1. Add a game-agnostic plan layer: competition as data, a plan contract, bounded information-set playouts on common sampled worlds, and one decision orchestrator that every game pack passes through.
2. Freeze `spades-tactics-2.1.0` as comparison baseline D0 inside the repository.
3. Add Spades policy profiles, each with its own version. They are selectable by name for evaluation and local trial.

| Policy version | Adds | Analysis cost |
|---|---|---|
| `spades-plan-3.0.0` | Plan and cue version 2; action selection equal to D0 | inline |
| `spades-plan-3.1.0` | S13 bidding by objective-aware playouts, both modes | bounded search |
| `spades-plan-3.2.0` | P04 both-Nil tradeoffs across the remaining hand | bounded search |
| `spades-plan-3.3.0` | P11 lead and entry planning in Partners | bounded search |
| `spades-plan-3.4.0` | Playouts on every unforced play (S12, S14 mechanisms) | bounded search |

4. Add a strength gate with separate Solo and Partners reports.
5. Add a case store for the six partial families with Solo and Partners twins and blind review packets.
6. Add an offline comparison harness for a later Jev experiment. It sends nothing.

## Supersedes and amends

| Item | Change |
|---|---|
| ADR-012 “No runtime search/simulation engine in v1” | Already superseded for local code by CR-IMPL-001 line 35. This record confirms it for bounded local playouts only. ADR-002 and the Jev boundary are unchanged. |
| CR-STRAT-008 “Ordinal versus numeric evidence” | Amended: internal sampled estimates now inform selection in the new profiles. They stay internal, uncalibrated and unseen by players. |
| Coverage review §6 deferral of runtime changes | Amended for selectable profiles only. The live default is unchanged. |
| planning/12 line 70 and CR-IMPL-002 | Amended: `AdviceView` gains optional fields. Saved advice under the old shape stays valid. |
| planning/12 line 96 promotion rule | Kept. This record adds a measurable decision rule and does not weaken it. |
| Evaluation plan primary estimand (match win indicator) | Amended for this milestone: primary is paired margin per hand on in-match hands, for power. Match wins are a guard. A pass supports a per-hand scoring claim only. |
| STRAT-08, STRAT-09 objective | Refined by SG-03 for ranking candidates: opponent-relative margin with a named bag liability and match term. The scorer is unchanged. |

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Tune the additive weights only | Cannot express a plan over the remaining hand; 2.0 to 2.1 changed no action. |
| Lightweight calibrated bidder (planning/02 option A) | D0’s contextual bidder stands in for it as the reference arm. |
| Jev as selector | Blocked by the provider-readiness gate; no live request is authorized. |
| Full information-set tree search | More machinery and cost than flat playouts; revisit only if the gate shows a need. |
| Perfect-information solver on sampled deals | Would select plans that depend on knowing concealed cards. |

## Requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| GP-01 | Competition MUST be declared data; new code MUST NOT infer a teammate from seat arithmetic. | `competition.test.ts`: accessor partition equals engine scoring groups for every catalog mode. |
| GP-02 | A plan MUST be a pure function of the seat observation, with stance, goals, competing stances and revisions derived from exact facts. | `spades-plan.test.ts`, `plan-determinism.test.ts`. |
| GP-03 | Every numerical estimate MUST record event, kind, unit, horizon, allocation model, continuation policy, assumed population, worlds and seed, and MUST be marked uncalibrated. | `spades-playout-model.test.ts` event-schema and exact-reference checks. Calibration and reliability reports stay open under EV-02. |
| GP-04 | Playouts MUST be deterministic, budgeted by work counts, run on common worlds, and continue with policies that read only the acting seat’s own view. | `plan-evaluator.test.ts`, `spades-playout-kernel.test.ts`. |
| GP-05 | Every game MUST reach selection through the shared planning contract and orchestrator. | `plan-genericity.test.ts`. |
| GP-06 | Shared plan and gate code MUST stay free of any game’s vocabulary and imports. A non-card hidden-information test module with an individual and a non-opposite partnership variant MUST pass through the same orchestrator. | `plan-genericity.test.ts` vocabulary and import-boundary scans. |
| SG-01 | The 2.1.0 policy and the local benchmark MUST be pinned by source hash and golden decisions. | `frozen-baseline.test.ts`. |
| SG-02 | The playout kernel MUST match production legality, trick winners and scoring. | `spades-playout-kernel.test.ts`. |
| SG-03 | The ranking objective MUST be versioned with its constants and be specific to the variant. | `spades-playout-model.test.ts`. |
| SG-04 | Cases for S12, S13, S14, P04, P08 and P11 MUST replay through the production engine in both modes and record origin mode, generating policies and partition. | `spades-cases.test.ts`. |
| SG-05 | The gate MUST use fresh grouped deals, several styles, paired arms, seed-clustered intervals, a committed manifest and the ordered decision rule below. | `gate-*.test.ts`, gate reports. |
| SG-06 | The Jev comparison harness MUST build J0 and J1 payloads without leaking the local rank, selected action or cue, and MUST send nothing. | `jev-offline.test.ts`. |
| STRAT-12 | Bounded-search analysis MUST be computed outside any database transaction. | `analysis-outside-transaction.test.ts`. |
| COACH-12 | Every shown sentence MUST come from a cue whose predicate holds for the selected action. | `coach-fidelity.test.ts` swap test. |
| COACH-13 | Goal progress MAY appear at Notice. A stance appears from Consider onward, worded as one plan among others. Solo cues MUST contain no teammate wording. | `coach-copy-budget.test.ts` lexical scan. |
| COACH-14 | The coach MUST record `several-reasonable` when the evidence cannot separate distinct choices, and `facts-only` when no supported explanation holds for the selected action. | `coach-abstention.test.ts`. |
| COACH-15 | Factual sentences MUST carry typed claims from a closed vocabulary. Checkers MUST be evaluation-only and independent of the fact builder. | `fact-checkers.test.ts`. |
| UX-21 | The advice panel MUST show the abstention outcome and considered choices without new stage labels. | `table.spec.ts` route fixtures. |

## Gate decision rule

Evaluated in this order; the first match decides. One primary estimand per mode.

| Status | Rule |
|---|---|
| Blocked | Any illegal action, hidden-information breach, score mismatch, or false fact claim. |
| Unchanged | The profile changes no decision in this mode, proven by decision parity. |
| Worse | Interval upper bound below 0. |
| Improved | Interval lower bound above 0. |
| Non-inferior | Lower bound above −δ and the interval contains 0. δ is 5 points per hand in Partners and 2.5 in Solo. |
| Inconclusive | Anything else, fewer than 200 seeds with a changed decision, or fewer than 500 changed decisions. |

- **Primary estimand.** Solo: rotation-averaged paired difference in own hand points minus the mean of the other three seats. Partners: both-teammates configuration, team minus opposing team. Equal weights over non-diagnostic styles. The maximum-opponent Solo margin is reported as secondary because earlier reports used it.
- **Guards.** Own or team score must not be Worse. No style subgroup may be Worse under a Bonferroni-adjusted interval. The harm floor of −5 points per hand against `local-baseline-1.0.0` is reported for D0 and the candidate.
- **Sequence.** Profiles are tested in version order, each against D0 and against the previously accepted profile. Each confirmation uses its own unread seed range.
- **Promotion of a live default** needs all of: targeted mode Improved; other mode Improved, Non-inferior or Unchanged; guards met; zero false facts; labels from a competent human reviewer or a written owner waiver; recorded owner approval. With agent labels only, promotion is reported as blocked.

## Compatibility

Rules, scoring, visibility and the Jev runtime boundary are unchanged. Analyses saved under schema 1.0.0 stay readable through one reader that fails closed on unknown versions. Advice saved earlier keeps its wording; cue version 2 applies only to analyses produced by the new profiles. Hearts behaviour is unchanged.

## Affected tests

New: `frozen-baseline`, `spades-playout-kernel`, `spades-playout-model`, `world-sampler-parity`, `plan-evaluator`, `plan-determinism`, `plan-genericity`, `competition`, `profile-registry`, `spades-plan`, `hearts-plan`, `gate-deals`, `gate-inference`, `gate-rule`, `gate-runner`, `gate-styles`, `spades-cases`, `coach-fidelity`, `coach-abstention`, `coach-copy-budget`, `fact-checkers`, `jev-offline`, `analysis-outside-transaction`. Existing strategy, coaching, saved-analysis and browser tests keep passing under the unchanged default.

**Changelog entry:** Owner-directed game plan layer, frozen baseline, selectable Spades plan profiles, case store and strength gate. No default policy change, no Hearts change, no live Jev request.
