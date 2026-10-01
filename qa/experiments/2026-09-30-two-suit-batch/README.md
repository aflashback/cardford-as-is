# Two-suit scenario batch

Owner-authorized follow-up to the [initial pilot](../2026-09-30-agent-scenario-lab/README.md). Six planned complete hands: three authored distributions, paired across Solo and Partners. Maya's thirteen cards, opening seat and zero starting scores/bags are fixed. See [design](design.md) for full fixtures and limitations; players never receive it.

**Actual completion and findings:** [results](results.md). The owner resumed the separate [eight-hand proposal](next-batch-proposal.md); see [expanded collection results](../2026-09-30-expanded-batch/results.md) for its actual status. This original six-hand batch remains frozen.

## Frozen protocol

- Each hand uses four fresh player contexts: Maya, Leo, Jason and Sarah. Tool task names use opaque numbers, without distribution labels. Each seat sees its own cards, rules, public history and full legal set. No player sees another player's justification or a reference recommendation.
- `templates/invocation.txt` is the intended initial template. Later messages contain a compact seat packet plus “Choose one action under the same protocol.” Compact history preserves every public play and winner. `templates/player.md` and `spades-rules.md` retain the readable protocol/rules. Manual delivery and context reconstruction mean exact per-player prompt delivery is not independently proved.
- Players respond with one action and one paragraph, including forced actions. Code rejects malformed/illegal replies without changing the game. No automatic player or reference-policy fallback is permitted.
- Solo and Partners were routed one decision at a time. Completed player tasks free concurrency slots; no same-hand simultaneous choices occur.
- Raw replies, structured observations, compact delivery text and their hashes are saved. The invocation template hash is frozen with the deal. Manual transport is documented, not independently audited by the replay check. Text-only/tool restrictions are instructions; a hard per-player tool sandbox is unavailable here.
- All cases are development material. Runtime rules, bot/coach policy and provider activation are unchanged. Frontier subagents participate only offline; no Jev call is part of this batch. Exact model snapshots are not exposed by the collaboration API.

## Interpretation

Maya's first bidding input is identical across the three deals within each variant. Different initial bids therefore reflect agent variability, not legitimate knowledge of the hidden distribution. Keep this distinction in every comparison. The same configured model supplies the named roles; they are not four independent expert sources.

One observed trajectory does not determine the optimal bid, action or success probability. Changing a bid can also change subsequent play, so rescoring an unchanged trajectory cannot establish the value of that alternate bid. Matched Solo/Partners deals expose decision differences; individual and team scores have different objectives. Across distributions the C/D holdings change too, so the experiment does not isolate trump length as the only causal factor.

## Repeat and audit

From repository root:

```text
node qa/experiments/2026-09-30-two-suit-batch/referee.mjs validate
node qa/experiments/2026-09-30-two-suit-batch/referee.mjs text EPISODE_ID
node qa/experiments/2026-09-30-two-suit-batch/referee.mjs accept EPISODE_ID CANONICAL_AGENT
node qa/experiments/2026-09-30-two-suit-batch/referee.mjs audit EPISODE_ID
```

Pipe the exact player response into `accept` using literal quoting. Never execute player text. Audits replay production reducers, compare saved packets/hashes, check that changing other hands does not alter the projection, and obtain D0/D1 shadow choices after the actual decisions. Disagreement is a review signal, never an error label. Replays are deterministic; newly generated agent replies need not repeat.

The observer review will separate successful plans, failed plans, claims contradicted by public facts and untested inferences. Existing casebook IDs remain the strategy vocabulary. New findings require counterexamples and review before becoming runtime predicates or coach cues.
