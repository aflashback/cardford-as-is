# Follow-up evaluation plan

Proposed work, not implemented or passed. This refines the existing [scenario/Jev evaluation plan](../../../docs/superpowers/plans/2026-09-29-scenario-and-jev-evaluation.md) and [strength gate](../../../planning/decisions/CR-STRAT-009-game-plan-and-strength-gate.md); it does not replace their promotion requirements. The pilot's two authored deals belong permanently to development. Their paragraphs and outcomes provide candidate cases, not accepted strategic labels.

## 1. Build a small, varied case collection

Use the existing versioned casebook families and add reachable replay prefixes. Start with the required S12/S13/S14/P04/P08/P11 families. Review the following dimensions independently; do not try to encode every complete deal.

| Dimension | Deliberate contrasts |
|---|---|
| Bid | Strong honors/weak distribution; long weak trump/short strong trump; Nil with escape cards/Nil with trapped winners; early/late bidder |
| Contract | Need one trick/contract already made; safe winner/risky extra trick; one bag from penalty |
| Partnership | Partner currently winning but vulnerable/safe; partner needs entry; partner void with/without usable trump; unfamiliar partner |
| Nil | Cover Nil/finish positive contract; attack Nil/attack coverer's resources; two Nils in conflict; failed Nil's changed objective |
| Information | Forced follow/voluntary discard; proved void/suspected shortness; withheld honor under different score incentives |
| Planning | Establish suit/preserve entry; draw trump/retain ruffs; sacrifice now for later control; revise plan after new evidence |
| Endgame | Last few tricks; impossible contract; score race; bag threshold; complete-match finish/tie |

For each useful case, change one relevant condition and demand a reasoned change or preservation of the recommendation. Rotate seats and non-trump suits; vary unseen deals consistent with the same seat observation. Add Solo/Partners twins only where both situations are meaningful. Use pairwise combinations to discover interactions, then add failures seen in fresh play. One diamond sequence must not define all honor inference.

## 2. Label before tuning

Have a reviewer inspect the seat observation without seeing the agent, D0, D1 or Jev action. Save acceptable alternatives, factual claims, unresolved tradeoffs and abstention conditions. Full-deal hindsight is a separate analysis. Exact endgame results can label positions where remaining holdings are publicly deducible; otherwise an all-hands solver is a hindsight diagnostic under declared assumptions, not a correctness label or proven value bound. Keep disputed cases exploratory.

Every accepted case needs its rule/profile version, source record, replay prefix, predicates, counterexample and coach claim. Store case data beside the existing typed game strategy pack. Changes should produce readable case diffs and affected-case reports. Do not load model-authored prose as runtime strategy.

## 3. Measure bots and bidding separately

Reconcile the documented tuning seed range with the evaluation ledger; never reclassify used seeds as fresh. Finish the missing case store and planning genericity test. Add an independently designed opponent and a required unfamiliar-partner guard.

Freeze bids to compare card play, and freeze card play to compare bidders. Compare uniform versus bid-weighted worlds, Nil-specific assumptions and continuation policies under equal work budgets. Use paired fresh deals, seat rotations and seed-clustered intervals. Report contract/Nil success, score margin, bags and subgroup harm separately for Solo and Partners. Complete-match evaluation is needed for match-winning claims. Prespecify minimum useful effects, regression limits and stopping rules before opening the sealed run.

## 4. Compare Jev fairly

After its strict response-validation issue is reproduced and fixed in fixtures, run a separately authorized, capped live evaluation using the provisioned server key. Record actual model ID, token/cost usage, failures, latency and fallback use. The same seat packet and legal choices go to every policy; no observer knowledge or stored private justifications enter Jev prompts.

Use the reviewed case set for explanation/factual checks, then fresh paired games for performance. Separate Jev alone, deterministic policy alone, and any proposed bounded hybrid. Jev disagreement is a review signal. Jev winning a small sample does not validate its explanation or establish superiority. Report budget exhaustion and invalid responses rather than silently excluding them.

## 5. Promote only measured changes

Implement one reviewed scenario family at a time with bot action and coach explanation checks. Require the existing strength gate plus the added partner guard. Verify that cue visibility does not affect advice computation, that replay retains original versioned advice, and that coach text expresses uncertainty honestly. Human testing of later unaided decisions is the final check for coaching value. Keep the current runtime default until the promotion requirements are met.
