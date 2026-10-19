# Next Jacks investigation: who benefits when a suit opens

Owner clarification, 9 October 2026: assess opening and delaying cards by final team points in Partners and by the player's outcome in Solo. Use public placement order, passes, remaining counts and permitted twos announcements to distinguish partner help from opponent help. In particular, investigate partners holding many/all/no twos, releasing their lower paths, and retaining upper blockers against opponents' aces.

Status: cases and investigation requirements recorded. The subsequent owner-approved [CFL-08 ownership slice](trix-ownership.md) implements the first exact-information prerequisite as a separate lab candidate; its [acceptance record](../../../qa/evaluation/coach-lab/trix-ownership-acceptance.md) tracks actual verification. [CFL-09](trix-jacks-endings.md) now implements exact small-ending opening/delay comparisons with complete finish outcomes; its [runbook](../../../qa/evaluation/coach-lab/trix-jacks-endings-acceptance.md) records actual evidence. Numerical behavior weights and a broader team-tempo policy remain planned. The completed frontier experiment remains unchanged and unpromoted. Its outcomes motivate these hypotheses; they do not prove their remedy. This continues CFL-04 case collection and CFL-02/CFL-03 candidate evaluation without changing game rules or the deterministic runtime boundary.

## Objective and verified starting point

Native Jacks finish awards are 200, 150, 100 and 50. Partners add both seat awards. First + fourth and second + third each total 250; first + third totals 300; first + second totals 350. Helping a partner is valuable when it improves the combined result. Equal sharing of points is not an additional objective. Retain both seat finishes and points even when team totals tie.

The existing request evaluator measures Partners own-team minus opposing-team score and Solo own score minus mean opponents. Since Jacks awards a fixed total of 500, maximizing that request margin is equivalent to maximizing team points or own points respectively. A +50 team-point change is +100 team-margin points: reports must label units and never mix them. Maximizing expected request points and maximizing the probability of winning the entire session can differ. Keep session standings/win results separate; do not silently change the objective or claim a request-only comparison resolves match-level risk.

Verified code already provides:

- Public chronological placements/passes, board and counts before each turn, with historical profiles kept separate (`reasoning_layout_history.go`, `history.go`).
- Conservative evidence that an earlier choice was voluntary when another playable card is proved to have been held. Several upper plays do not prove low-card absence or a particular intention.
- Immediate known-partner/opponent opening terms, including a larger last-card term (`reasoning_candidates.go: layoutCandidate`). These are heuristic points, not expected finish points.
- Offline comparison of every legal root on common feasible allocations, using native scoring and each future actor's own observation (`evaluation.go: EvaluateRequest`). Current conditional samples are not calibrated behavior or winning probabilities.

Remaining gaps for this investigation:

- The older policies' runtime `possibleHolders` does not propagate public hidden twos counts or the team deduction from a legitimately suppressed modern Partners announcement. CFL-08 adds that information through the separately selected ownership candidate, preserving old policy behavior. The offline sampler applies fuller observation/replay checks separately. This closes an information input gap, not the longer-term finish comparison.
- Longer dependencies to a known two or possible ace, turn order and the cost of keeping a blocking card are not converted into a supported finish-score preference. Frontier only removed own-card credit across gaps and failed to show consistent benefit.
- Public preference signals are recorded without action weights. Any future likelihoods must be explicit assumptions and independently checked; records of choices alone do not give measured probabilities.

## Information available to the player

All placed cards are visible on the Jacks board. Unplayed hands remain private. The chronology supplies who played each card and in what order; the final board alone does not retain that information. Within a deal, later public play already in the current prefix can prove earlier ownership, but cannot prove why a card was delayed. Never consult play after the decision being evaluated.

For modern Partners, a displayed initial announcement gives original twos counts; exact suits become public after four layout turns. A displayed zero count proves that seat originally held no twos. A nonzero count alone generally does not identify suits; own cards and other exact constraints may narrow them. Repeated play signals cannot override these facts.

When all four twos belong to one team, the announcement is omitted. There can therefore be no displayed count of four. On this rule profile, valid absence establishes one-team ownership but does not name that team. If the actor originally held k > 0 twos, their partner originally held the other 4-k. If the actor originally held zero, partner-all-four and opponents-all-four can both remain possible. A publicly placed two can subsequently identify the owning team. Track initial holdings from the actor's permitted hand/history, not just twos remaining now. Historical profiles without announcements and Solo cannot use this absence deduction.

## Cases to build as reachable native fixtures

Each row requires a full legal prefix, all legal alternatives, saved actor observation, and a contrasting case where the apparent tactic fails. No row declares a universally correct card.

| Case | Question to compare | Required contrast |
| --- | --- | --- |
| JT-01 Partner depends on several/all four twos | Does releasing a lower path improve the partner's finish enough to outweigh own delay and opponent access? Include a provably known all-four ending and an early ambiguous suppressed announcement. | A missing middle rank is controlled by an opponent; opening another suit helps both opponents first; helping the partner makes no team-score gain. |
| JT-02 Partner has no twos | Which actual remaining dependencies determine the partner's finish? Zero twos alone must not produce a high-card-only plan. | Partner still holds a low card, a blocked intermediate card or an ace; a lower opening still helps the partner. |
| JT-03 Release low while retaining an upper blocker | With a known partner two and a legal lower opening, compare advancing that suit against releasing an upper card that could enable an opponent's ace. | The ace is actor/partner/unknown; an opponent also benefits from the lower opening; the opponent has other bottlenecks; the blocker later traps the actor. |
| JT-04 Repeated voluntary upper play | Do proven choices support a conditional suit-priority hypothesis that survives alternative explanations? | Same visible pattern with forced/unknown alternatives, lower cards still held, or a different sensible plan. Preserve correlation between repeated observations. |
| JT-05 Exchange individual finish for team points | Compare own faster finish with a move that changes both teammates' finish order; retain the full four-seat order. | First + fourth versus second + third is an exact team tie; a proposed sacrifice can also lower combined points. |
| JT-06 Solo counterpart | Use the same types of board/dependency positions with Solo observations and individual score objective. | No teammate, no twos announcement, no borrowed Partners deductions or labels; a useful team sacrifice can be harmful in Solo. |
| JT-07 Early and late uncertainty | Compare sparse early information with a later public prefix that establishes more owners/alternatives. | More information need not produce a unique best action. Different plausible hands or continuation styles still prefer different cards. |

Holding means choosing another legal card. A player cannot pass while a legal placement exists. A remaining high card can block its owner's finish as well as an opponent, so delay duration, compulsory releases, skipped finished seats and intervening turns must come from native continuations.

## Ordered work for the next candidate

1. **Exact information first.** Add reachable positive/negative fixtures for announced zero counts, revealed owners, suppressed one-team ownership and initial-versus-current counts. For every claimed deduction, verify it across all feasible allocations in small fixtures. Use a new policy/evidence version if this changes a decision or saved explanation. Preserve existing candidate and archive identities.
2. **Compare opening and delaying through the finish.** Starting with small Jacks endings, enumerate feasible allocations when tractable; otherwise retain bounded common-world estimates and uncertainty. For every legal root save each seat's finish/points, team total, margin, passes and relevant card release times. Use several declared deterministic partner/opponent continuations, including one-seat and both-teammate deployment. All future actors receive only their own observation. A fully specified hidden deal is diagnostic, not a decision-time oracle.
3. **Separate structure from preference.** Compute exact rank dependencies on the board and what a legal placement immediately enables. Label missing-card owners as known, excluded or uncertain. Rank distance is a minimum number of required placements, not turns-to-finish or a probability. Prefer an exact small ending as the first tactical fixture over an arbitrary new bonus for helping a two.
4. **Treat probabilities as conditional estimates.** Begin with the existing constraint-only allocation control. Later compare explicit, versioned behavioral assumptions that account for legal options, retain possible mistakes and avoid treating correlated choices as independent. Measure predictions against held-out outcomes before describing them as calibrated. Report expected points, downside and assumption sensitivity; the chance of a best-case finish alone is not the selection objective. Insufficient support retains the declared control/fallback.
5. **Freeze one narrow action rule only after diagnosis.** Keep the frozen history control as the main comparison so that beating the unsuccessful frontier candidate is not mistaken for progress. Preserve frontier as a separate diagnostic reference. Do not combine a new ownership deduction, several behavioral weights and a new planner into one unexplained treatment. Save exactly the selected action's evidence for the coach.
6. **Validate the complete policy on fresh origins.** Separate Basic/Complex, Partners/Solo, partner/opponent styles and deployment modes. Development/counterexample data can shape the next hypothesis; the old fresh-validation set is now used evidence and cannot confirm it. Keep missing pairs, score harms, own/partner tradeoffs and neutral choices visible. A larger campaign needs a declared resource/sample plan; no new numerical allocation or promotion is authorized by this case note itself.

## Generalization and explanation

The reusable method is to compare legal actions from the player's information against the correct individual/team score through a declared horizon. Each game owns its mechanics: Jacks uses rank dependencies and finish order; trick-taking uses follow-suit constraints, lead/control, trump where applicable, contract/penalty scoring and partner access. Do not copy a Jacks two/ace heuristic into another game or assume each game rewards taking more tricks.

Example explanation target, only when supported: “Play the 3 of hearts to release your partner's known 2. Keeping the king of clubs blocks the ace for now. The remaining risk is who benefits before your partner's next turn.” The saved reason must distinguish the exact newly legal card from an estimated finish advantage, and explain the chosen alternative when helping the partner costs the actor points. No model selects the action or invents its justification.

Research context: [Policy Based Inference in Trick-Taking Card Games](https://arxiv.org/abs/1905.10911) demonstrates that observed actions can inform hidden-state estimates in Skat. This motivates investigating behavioral evidence, but validates neither these Trix cases nor any proposed weights. [Information Set Monte Carlo Tree Search](https://eprints.whiterose.ac.uk/id/eprint/75048/1/CowlingPowleyWhitehouse2012.pdf) motivates keeping decisions tied to information available to each actor instead of letting simulated players exploit a sampled hidden deal. These are methodological references, not a selection of a learned runtime model.

Related evidence: [completed frontier results](../../../qa/evaluation/coach-lab/trix-frontier-study.md), [existing partnership cases](trix-partnership-cases.md), [current chronology scope](trix-layout-history.md), [twos rule](../../decisions/CR-GAME-002-trix-jacks-twos-announcement.md).
