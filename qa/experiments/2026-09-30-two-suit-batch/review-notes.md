# Decision review

Development cases only. Sequence numbers address the saved record, including its seat packet and exact private justification. Outcomes are not optimal-action labels.

## Solo spread

- **Bidding, seq1–4 (S13, SP-B05):** Maya bids9 from five top trumps plus eight weak hearts; combined bids14 create an unavoidable failed contract somewhere. Do not infer that Maya knew this total when bidding first. The first bid must remain blind to companion holdings.
- **Plan sequence, seq9,13,17,21,28,29 (SP-T06):** Maya ruffs a club, draws two trump rounds, returns to hearts to remove HQ, re-enters with SK and draws again with SA. This is a concrete interleaving of suit development, trump management and entry preservation. It does not establish that this order dominates other legal lines.
- **Competing objectives, seq22–27 (S12, S14):** Leo secures his one-trick contract, then seeks to avoid extras; Jason still needs his first trick. The same rank/position can require different decisions once the contract state changes.
- **Impossible future plan, seq31,35,39 (SP-X01, SP-X02):** Jason initially retains hope of winning with a club/diamond queen. His own packet already proves Maya will lead and sweep the six remaining hearts after the current forced S9. `check-public-proof.mjs` verifies the premises without reading the full deal. Sarah and Leo recognize the sweep at seq32 and34; Jason recognizes it by seq43. A legal discard can have an invalid explanation without changing the outcome.
- **Equivalent actions (SP-X01):** once the sweep is proved, ranking discards as strategic mistakes would be misleading. A concise coach cue could state “No remaining card can interrupt the heart run”; repeated advice should stay quiet. This is a proposed cue, not a runtime change.

## Solo void, decisions collected so far

- **Opening variability:** identical first observation hashes produced bids9 in spread and10 here. Partners similarly produced8 and9. These are fresh model responses, not knowledge of the hidden deal.
- **Preserve honors under a ruff, seq6–8:** Leo ruffs H4 with S2. Jason spends H2 and Sarah H3, retaining HQ/HK and HA. A low ruff need not remove the side-suit honors Maya must later overcome.
- **Inference versus plan, seq21–30 (SP-T06):** Maya correctly places all opposing trumps with Leo after both other players show voids. She continues drawing SK and SA, leaving Leo with the last spade. Her explanation describes reducing trump threats but does not compare keeping an entry against exhausting her own trumps. This is a plan-comparison candidate, not a proved inferior-move label.
- **Control and cashing, seq30,33 (SP-X01):** Leo knows S7 is the last trump, wins the heart lead, then leads DK with DQ retained. With DA and every spade gone, both diamonds are established winners. This supports a concrete multi-trick plan from public facts and his own cards.
- **Contract feasibility, seq37 (S14):** once Leo leads the unbeatable DQ, his fourth trick is assured. Maya has5 tricks and at most4 thereafter, so her bid10 is already unreachable. This is a public arithmetic conclusion; the unfinished hand's final trick counts remain unreported.

## Interpretation and next comparisons

Repeated fresh-agent runs of the same observation measure response variability. Varying hidden deals while holding Maya's first bidding packet fixed measures how a policy performs under uncertainty; it must not let Maya choose bids using the hidden distribution label. Compare candidate bids through fresh complete continuations, including opponents adapting to the changed public bid. Rescoring the observed play sequence alone cannot identify an optimal bid.

The earlier pilot candidate LAB-01 said “Hold card play fixed” for bid comparisons. For strategic evaluation, this batch supersedes that wording with fresh policy continuations. Fixed-trajectory rescoring is only an arithmetic sensitivity check.

Further cases must change positions, scores/bags, honor locations, partner resources and opponent policies. Suit renaming among non-trump suits is a useful generalization check. Keep authored discoveries in development data; hold out fresh deal families for evaluation. No fixed success probabilities follow from this batch.
