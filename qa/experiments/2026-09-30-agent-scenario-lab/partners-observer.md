# Partners observer findings

Episode: `partners-nil-race-01`. All scenario candidates below are **discovered, not validated**. Results and explanations do not establish strategic quality. This was one deliberately authored deal, with synthetic carried scores/bags; natural prevalence and prior-match reachability are not established.

## Completed record and checks

The production referee accepted all four bids and 52 plays: **56 accepted, 0 rejected, 13 tricks, 52 unique played cards, 56 packet boundary checks**. Thirteen decisions were forced: seq22, 24, 30, 31, 37, 38, 40, 48, 52, 53, 54, 55, 56. Every forced action was returned by its player with a paragraph justification.

| Seat | Bid | Tricks | Team final score | Team carried bags |
| --- | ---: | ---: | ---: | ---: |
| Maya | 6 | 6 | 590 | 8 |
| Leo | 3 | 5 | 388 | 1 |
| Jason | Nil | 0 | 590 | 8 |
| Sarah | 1 | 2 | 388 | 1 |

Maya/Jason: 430 + 60 contract + 100 Nil = 590. Leo/Sarah: 445 + 40 contract + 3 overtrick points - 100 bag penalty = 388; eight prior bags plus three added leaves one. Maya/Jason are the unique highest team above 500. The hand stopped at match-end.

Actual commands, both passed:

```text
node qa/experiments/2026-09-30-agent-scenario-lab/referee.mjs audit partners-nil-race-01
node qa/experiments/2026-09-30-agent-scenario-lab/partners-counterexample.mjs
```

Evidence: `records/partners-nil-race-01.json`, `.audit.json`, and `.counterexample.json`. Decision IDs below mean the exact `seq` field in that episode. Trick IDs T1–T13 mean the one-based index in recorded history. The audit found 19 disagreements with D0 and 17 with D1; those counts are comparisons, not correctness labels. The boundary checks test the projection's insensitivity to other hands, not feasible-deal calibration or agent cognition.

Provider is `frontier-subagent-research`; observed model ID is **not exposed by the collaboration tool**; Jev calls: **0**. This is offline research evidence, not a live Jev result. The record's source reference is `94a59cb`; this observer made no commit.

## Candidate scenarios

### P1 — Positive bid beside a potential Nil

References: seq1 Maya bids6; seq3 Jason bids0. Public evidence was score430, bags8, Maya's six bid and Leo's three bid. Each player also knew only their own hand: Maya held six high club/heart/spade cards; Jason held no card above eight and S2/S3. The tension is positive-contract reliability versus Nil reward and bag exposure. Feasible alternatives included other positive bids and a positive Jason bid. Partner's six bid suggests cover but does not locate a single covering card. Cue candidate: "Count your own risks; a partner bid does not identify their suits." Require varied voids, trump lengths and expert review before a bidding rule. The full deal's excellent cover and final successful Nil are hindsight.

### P2 — Cover and safe releases

References: seq5/9/13/17 Maya leads CA/CK/HA/HK, T1–T4; seq7/11/15/19 Jason releases C8/C5/H6/H5; seq46 SK and seq49 SA, T11–T12. Current high cards publicly covered Jason's actual legal followers; Maya knew her retained cover, while other holdings were uncertain. Lower followers and alternate leads were feasible. Cue candidate: "When the trick already covers you, consider releasing a card that may become awkward later." Early cashing can consume cover needed later or expose a long suit; this deal did not test those counterexamples. Require counterfactual play across compatible deals, including opponent voids and late Nil traps.

### P3 — Nil probes that never find a forced winner

References: seq25 D7/T6, seq29 H4/T7, seq41 S6/T10, seq45 S4/T11. The public trigger was the opposing Nil and match score. Attackers chose a lower available lead or retained a low card; alternatives included cashing higher winners or other legal suits. No probe forced Jason to win. His actual low followers are hindsight from the full deal until played. Cue candidate: "A low lead tests an unknown holding; it does not prove a Nil break." Coverage includes attempted attacks, not successful attacks or a difficult recovery. Need cases with a genuinely vulnerable Nil holding and realistic cover alternatives.

### P4 — Declining a winner before the bag threshold

References: seq28 D8/T6, seq36 D3/T8, seq44 S8/T10. Maya passed available winning options while her partner was already safely below another card. At seq44 she knew her own S5/S8/SK/SA, four secured tricks, a six contract, eight bags and four tricks remaining. Ducking S10 capped her own final total at seven and kept both top trumps; SK/SA were feasible winning alternatives. Cue candidate: "Check remaining tricks and the next bag penalty before taking an optional winner." This arithmetic is checkable; superiority of the entire plan is not established by winning this deal. Need comparable positions where retained winners are not secure or Nil cover requires an extra trick.

### P5 — Partner already winning, but what can the next player beat?

Reference: seq35 Sarah D5/T8, retaining DJ/DK under Leo's D10. Team contract still needed one trick; Jason was already below D10 and Maya had yet to act. D5/DJ/DK were legal. Sarah's claim that spending an honor "would not prevent" a higher diamond win is too broad: DK would prevent a DQ win, although DA would still beat it. Maya actually held DQ, a hindsight fact Sarah could not know. Cue candidate: "Separate which higher cards each alternative stops." Require expert evaluation of the full contract/Nil tradeoff; this logical correction does not label D5 strategically wrong.

### P6 — Correct hidden ownership asserted without sufficient evidence

Reference: seq45 Sarah S4/T11. She claimed public count left Jason with C2, H2 and one spade. Her own hand was DJ/S4/S7. Leo's legal spade lead before breaking showed he held only spades at that time, but no public void located both C2 and H2 with Jason instead of Maya. Capacity does establish that Jason holds at least one spade: his three cards cannot all be drawn from the two remaining non-spades outside Sarah's hand. Exact ownership and exactly one spade do not follow. The actual deal happened to match Sarah's stronger claim.

Executable counterexample: exchange Jason's C2 and Maya's S5 in the initial deal, then replay seq1–44 through the production reducer. All 44 actions remain legal and Sarah's entire seq45 packet is identical to the saved packet. The alternate remaining hands are Maya C2/SK/SA and Jason H2/S2/S5. The original and alternate packet SHA-256 hashes both equal `431dd4ad6214c5ac40ac48fe9bc731e0c0b8388e342ee7eb0b22a99b394675eb`. See `partners-counterexample.mjs` and its actual saved output. This disproves exact ownership from Sarah's information, without establishing another preferred lead. Cue candidate: "Track unplayed cards separately from proved owners." Require compatible-deal checks for any future certainty label.

### P7 — Score routes and impossible remaining chances

References: seq33/T8 and seq50/T12. Seq33 says breaking Nil or setting Maya is necessary to stop the match win, overlooking the possible arithmetic route of giving Maya at least eight tricks: 430 + 60 + 2 + 100 - 100 = 492 at exactly eight. Whether that route was attainable from Leo's information was not established. At seq50 Leo retains SQ for the final trick but says a final Jason win remains a chance. With SA being played, SK already gone and SQ his only remaining card, Leo can already deduce Jason cannot win that final trick. These are explanation defects, not strategic action grades. Cue candidate: "Recalculate every scoring route, then eliminate outcomes contradicted by your remaining cards." Require code-checked arithmetic and compatible continuations before promoting such statements.

## Abandoned or unrealized plans

Sarah saved C3 at seq8/12 to attack Nil, then had to follow with it at seq24 under CQ; the planned low-club lead never occurred. Her H4 attack at seq29 was covered by H8 and forced HQ, and Jason had a lower escape. Her retained S4 did get led at seq45, but SK covered it and Jason followed S2. Leo's early queen-club/queen-heart winner plans materialized at T5/T7, without proving that preserving those cards was optimal. The opponents' intended Nil attack never succeeded; Sarah's bag avoidance at seq39 did not prevent the eventual penalty. Maya's preserved top-spade plan completed her contract, while the alternative continuation quality remains untested.

## Missing coverage and limits

No failed Nil, failed-Nil scoring exclusion, positive-contract set, double Nil, forced Nil win, successful opponent attack, overtrump/ruff decision, tie at match end or continuing match occurred. Partner cover occurred mostly through secure high cards, so emergency cover and sacrifice remain unknown. There were no invalid-response recovery examples because no response was rejected. Hidden-deal alternatives were tested only for the specific seq45 counterexample, not exhaustively for strategic value. Independent human review is still required. No observer notes or review cues were sent to players, and no player debrief altered recorded decisions.
