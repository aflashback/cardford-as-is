# Reasoning position — initial interview statement

Prepared 4 October 2026 from repository source at `09b4903`. Investigation only; no tests, games or provider calls run for this interview. Variant rules for Tarneeb Solo and Trix Solo/Complex Partners remain open.

## Verified algorithm inventory

- **Current default:** the registered Spades pack is `spades-tactics-2.1.0`; Hearts uses `hearts-baseline-1.0.0`. Spades builds conservative ownership domains, public voids, contract/Nil/bag counters and per-card current versus guaranteed outcomes, then ranks the complete legal set by explicit tactical weights. These weights are neither probabilities nor proof of strength. Partner leads/discards produce hypotheses with counterexamples; only public rule deductions become facts. Sources: `web/server/strategy/registry.ts`, `games/spades/reasoning/{manifest,knowledge,signals,policy}.ts`.
- **Selectable alternatives:** `spades-plan-3.0.0` retains tactical choices and adds a hand plan; 3.1 adds bidding playouts, 3.2 double-Nil, 3.3 partnership leads, 3.4 all unforced plays. `spades-cases-4.0.0` composes inline 3.0 and four observed-case predicates; CASE-01 can change selection. Other additions prove no entry, a forced sweep, or an unbeatable selected lead. These are opt-in profiles, not promoted defaults.
- **Reusable computation:** `PlanningPack` and `decide` are generic over observation/move/world. They compare candidates on common seeded worlds with bounded work, explicitly record unsearched choices, equivalence groups, truncation, effective sample size, comparable choices and tactical fallback. Estimates record their event, population, sampler, continuation policy and versions, and remain uncalibrated/internal. Existing Spades search uses 128 worlds, at most 14 representatives/two stances and 400,000 steps.
- **World models:** the constraint-counting sampler uniformly allocates feasible hidden cards using exact seat knowledge. The Spades playout model first tries rejection sampling, then the exact sampler; optional bid-consistency weighting is a named heuristic with positive support for all feasible holdings. Every continuation actor reads its own holdings and public information. This is flat policy rollout, not an exact solver, ISMCTS or an equilibrium method.
- **Objectives:** Spades scoring is exact, but search utility adds named heuristics: opponent-relative hand margin, ten-point carried-bag liability and a 500-point terminal match term. Exact arithmetic under a hypothetical trick total does not validate that projection or the utility. Solo and Partners need distinct evaluation; Hearts plan profiles prove a reuse seam, not Hearts strength.
- **Coaching/audit:** selected-action predicates govern authored cues; typed claim checkers are evaluation-only, independent of the fact builder and bounded at 256 feasibility checks. They can return not-checkable. Games pin their policy; committed bot moves retain immutable original observation/analysis/action/revision. Human original advice is saved separately. Legacy absence stays explicit. `BotDecisionAudit` and current `DecisionFacts` still contain existing-game types; the algorithmic seam is ahead of the whole application seam.

## Evidence and limits

All three discovery result files and the combined source audit were reviewed: pilot **112**, two-suit **336**, expanded **258** accepted decisions: **706**, across **11 complete, three partial, two unstarted** hands. Agent paragraphs contain demonstrated factual errors and are scenario hypotheses, not independent acceptable-action labels.

The real-browser report, machine audit and case ledger record **12 completed measured hands**, six per mode, with **14 created sessions** including two unused Partners openings. **672** replayed decisions comprise **504 bot / 168 South** decisions, including **101 / 27 forced**. Candidate originals matched CASE-01 **1**, CASE-02 **14**, CASE-03 **0**, CASE-04 **33**. The audit confirms **1,208 typed cue / 5,109 typed analysis claims**, with zero false/unresolved; **336 legacy records have no typed claims**. Typed assertions do not validate untyped wording or strategic preference. Three familiar pairs per mode, with all bots changed and reused identical player packets, cannot establish isolated strength. Only one Partners pair differs: +2 points and +2 bags.

The prior 512-hand comparison is exploratory. The formal gate ledger is empty; independent human labels, fresh grouped confirmations, calibrated forecasts and human transfer evidence remain missing. Jev is off: discovery/browser calls **0**. Separately, one historical authenticated request was rejected; observed `typesafe/jev-1.13-20260917` establishes interface provenance, not validated integration or strategy.

## Recommendation

Retain a small shared deterministic decision/evidence runner with game-owned knowledge constraints, legal actions, utilities, beliefs, continuations and claims. Tarneeb auctions/trump choice, Trix contract choice/negative tricks and sequence layout require distinct phase objectives and public-zone semantics. Do not encode them as Spades tactics. Start comparisons with explicit tactical and flat-rollout policies; consider information-set tree search only where held-out failure cases and budgets justify it. CFR's two-player zero-sum guarantees do not automatically cover decentralized four-seat partnerships. Keep Jev as the only runtime strategic model; a reviewed code policy is an explicit alternative, never confidence-based covert substitution.

## Questions to the architecture interviewer

1. Which production seam will enforce module-owned action, observation and evidence types when `GameService` currently bypasses `GameModule`?
2. How will auctions, contract selection and layout phases declare objectives and horizons without inheriting trick counts or bid/play enums?
3. Where can each game install hard constraints and separately version soft likelihoods without a shared sampler treating bids or signals as certainty?
4. What API makes actor-view isolation testable when a continuation engine internally holds a complete sampled world?
5. Can long-horizon objectives expose a payoff vector and named comparison rule, avoiding one universal scalar or centralized partner knowledge?
6. What concrete incompatibility would justify rewriting the planner/engine, and how would old audits remain interpretable across that rewrite?
