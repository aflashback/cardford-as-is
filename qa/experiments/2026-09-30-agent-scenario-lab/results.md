# Pilot results

**The approach is useful for discovering and auditing scenarios. Playing strength remains unmeasured.** Current rule isolation, shared bot/coach analysis and bounded simulation are a sound foundation; the missing evidence pipeline remains the priority. [Research](research-and-evaluation.md) · [Next steps](follow-up-plan.md).

## Actual play

Two complete authored hands used Maya, Leo, Jason and Sarah with separate seat contexts, plus observer/dealer routing. Partners used fresh players. Every bid/card, including forced cards, came from its player with a saved paragraph. No strategic player received other hands, private explanations or observer cues. The [protocol](README.md) documents the instruction-only tool restriction and manual transport limits.

| Result | Solo | Partners |
|---|---|---|
| Bids, seat order | 8 / 2 / Nil / 2 | 6 / 3 / Nil / 1 |
| Tricks, seat order | 9 / 3 / 0 / 1 | 6 / 5 / 0 / 2 |
| Final score | 81 / 21 / 100 / -20 | Maya+Jason 590; Leo+Sarah 388 |
| End state | Hand complete; no match winner | Maya+Jason win from synthetic carried state |
| Accepted / rejected | 56 / 0 | 56 / 0 |
| Forced decisions | 12 | 13 |
| Agent differs from D0 / D1 | 11 / 13 | 19 / 17 |

D0 and D1 were evaluated afterward on the saved observations. These disagreement counts identify review candidates; they are not errors, win rates or evidence that agents beat either policy.

## Useful findings

- **Planning:** Solo Maya preserved top trump, used S3 for a safe last-seat ruff, then conceded a later trick while retaining contract control. LAB-03/06.
- **Context changes interpretation:** Leo withheld DK after making his contract. Failure to spend an honor did not establish its owner. LAB-04.
- **Partnership:** Maya preserved later Nil cover and top-trump winners; the opponents tried several Nil attacks and crossed their bag threshold. No attack succeeded. LAB-07/08.
- **Explanations need tests:** Four Partners claims failed review: an omitted score route, an overbroad honor-cover statement, unsupported exact ownership, and an impossible final Nil-break hope. An executable alternative deal disproves the ownership certainty while preserving the entire player-visible packet. LAB-09; [observer evidence](partners-observer.md).

[Nine case candidates](scenario-candidates.json) link exact decisions to existing scenario families, coach concepts and required mutations. Their strategic labels remain unvalidated. Coverage still needs difficult emergency cover, double Nil, failed Nil, entry sacrifices, successful attacks, score ties and varied partner behavior. The current Nil hands were easy enough that safe high-card cover and low escapes dominated.

## Verification and scope

Passed commands from repository root:

```text
node qa/experiments/2026-09-30-agent-scenario-lab/referee.mjs validate
node qa/experiments/2026-09-30-agent-scenario-lab/referee.mjs audit solo-control-01
node qa/experiments/2026-09-30-agent-scenario-lab/referee.mjs audit partners-nil-race-01
node qa/experiments/2026-09-30-agent-scenario-lab/partners-counterexample.mjs
node qa/experiments/2026-09-30-agent-scenario-lab/verify-records.mjs
```

Each hand replayed 13 tricks and 52 unique cards. All 112 seat-packet projection checks passed; stored response hashes, action/paragraph correspondence and player identity checks passed. No rejected response occurred, so rejection recovery was not exercised. Independent strategic labeling, fresh-deal strength gates, live Jev comparison and human coaching-transfer tests were not run.

Provider: offline frontier subagents; exact model ID unavailable from the collaboration tool. **Jev calls: 0.** Source baseline `94a59cb`. No runtime behavior changed. The next milestone is reviewed, mutated replay cases followed by independently designed opponents and an unfamiliar-partner acceptance guard. Do not promote generated paragraphs directly into the game.
