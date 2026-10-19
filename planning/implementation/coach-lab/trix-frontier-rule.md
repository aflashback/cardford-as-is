# CFL-07: own-card paths stop at a gap

The owner approved the next deterministic improvement cycle on 9 October 2026. This implementation adds the separately selectable `trix-frontier-1.0.0` candidate, then tests it against frozen `trix-history-1.0.0`. It shares one action and decision-time evidence between bots and coach. The live default, historical policies, game rules and UI remain unchanged.

## Hypothesis fixed before new game results

The inherited Jacks score credits every own card farther out in the same suit, even across a card held by someone else. That distant card cannot be reached by the actor alone. Removing this credit might improve finishing decisions, but may also delay a useful partner opening. This is a testable heuristic change, not an optimality claim or a calibrated ownership model.

For Basic and Complex Partners, in an unforced Jacks card choice only:

- Start with the history candidate's complete score and public teammate/opponent-opening terms.
- On each outward side of the legal root, walk the ranks in order. A Jack has two independently inspected sides. Stop own-path credit at the first rank absent from the actor's hand.
- Subtract the inherited three points for each further own card beyond that gap. Preserve the existing five-point adjacent bonus, three points for contiguous own cards, one-point Jack cost, finish bonus and exact public partner/opponent adjustments. No additional weights are introduced.
- Preserve native legal order for score ties. Other phases, Solo and forced choices inherit history behavior exactly.

Equivalently, the own-path portion is `3 × contiguous downstream own cards + 5 × adjacent own cards − Jack indicator`, with the existing finish and public-opening terms unchanged. Each root inspects at most twelve downstream ranks. The selector reads only the actor observation; there is no sampling, hidden aggregate-state access, model or provider call.

A missing card may be played by its holder before the actor's next turn. A Jack with no own immediate follow-up may still be crucial for the partner. These failure modes are retained explicitly in the saved coach limitations and the team-score study. A higher individual finish is not sufficient evidence of a better team result.

## Saved explanation and feedback

The native trace adds optional `frontierEvidence` only to this new policy and uses trace schema `trix-decision-trace-1.2.0` / cue version `trix-frontier-cues-1.0.0`. It retains inherited history evidence plus the earlier candidate, trigger coverage, changed-choice flag and every legal root's inherited/new score, removed credit, contiguous own cards, first outside card, public possible holders and own cards beyond the gap.

The card paths are exact observations. Their score contribution is labelled policy evidence, never a probability, expected score or proof of team superiority. Saved-trace validation recomputes these fields from the same frozen actor observation; the coach consumes the saved selected action. Later cards cannot rewrite its reason. Earlier policy traces omit the new field and retain their original interpretation.

In the archived J♦ case the new scores are J♦ −1, K♥ 0 and 10♠ 0. Native tie order chooses K♥ with `no-clear-preference`; the implementation must not force 10♠ to fit the earlier numerical comparison. A separate reachable current-profile fixture has J♦ −1 versus 10♠ 8 and changes the action to the contiguous spade path.

## Acceptance and next decision

1. Verify reachable native play, both Jack branches, no-gap/forced/Solo/penalty fallback, exact partner/opponent terms, hidden-hand invariance, saved bot/coach identity, tamper rejection and historical pins. Preserve selected harmful-case diagnostics separately from natural-session evidence.
2. Run the [predeclared full-session protocol](trix-frontier-study.md) on fresh origins with frozen source and worker. Compare team margins in Basic/Complex, one-seat/both-teammate deployments and both declared player environments separately.
3. Keep eligibility, changed decisions, complete/incomplete pairs, observed harm and family-level outcomes visible. The pilot's two origins per cohort cannot meet its twenty-family floor. No automatic promotion or strength claim follows.
4. Use changed decisions in harmful sessions to identify the next concrete gap: for example a blocked own path that another holder opens promptly, or a Jack whose delay blocks the teammate. Record a reproducible actor-safe case and alternative explanations before proposing a separate revision. Do not tune on the reserved validation origins.

Commands, check receipts and measured outcomes are recorded in [the acceptance record](../../../qa/evaluation/coach-lab/trix-frontier-study.md).

## Operational follow-up after collection

The complete 128-session campaign and its four initial final reports used one frozen source/worker. Only after those were retained, the generic strength-summary reader was changed to consume cell inputs lazily and retain compact summaries. Its statistics and output schema are unchanged. This prevents cumulative retention of all full decision archives as later studies add origin families. A single archive still has its own string/heap limits; native sharding remains bounded.

The regression suite compares array and lazy paths against pre-fix canonical and exact JSON hashes, and rejects an eager-loading mutation. Verification also compares the two complete development reports against their preserved originals. This reporting fix is separate from the candidate's frozen gameplay source and does not revise the observed outcomes or the rule under test.
