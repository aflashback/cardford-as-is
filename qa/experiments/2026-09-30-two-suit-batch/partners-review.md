# Partners observation review

Offline frontier-agent research, not runtime Jev evidence. Eight fresh text-only player contexts were used across the two started hands, with one player active at a time. Players received the invocation template and code-generated seat packets with complete public history; no tactical cues, private coordination, or provider calls were supplied. All accepted choices, including forced cards, have raw responses and 15-100 word explanations saved by the referee. No player tool use was observed; technical tool isolation and internal model reasoning are not claimed. Model ID was not exposed by the collaboration tool. No runtime code changed.

## Observed behavior

- `partners-spread`: complete, bids `[8,0,1,4]`, tricks `[11,0,0,2]`, scores `[92,60,92,60]`, bags `[2,0,2,0]`. Audit passed 56 packet/hash replay and boundary checks, 13 tricks and 52 unique played cards, 56 accepted and zero rejected replies. Sequences 5 and 13 developed hearts before the trump draw at 21/25/29. Sarah's S4 at 16 protected Leo's exposed queen and Nil. Maya then ran the established hearts; Jason explicitly recognized pooled-contract success despite his zero tricks at 47.
- `partners-void`: complete. Bids `[9,5,1,1]`, tricks `[5,5,2,1]`, scores `[-100,60,-100,60]`, zero bags. Audit passed 56 packet/hash replay and boundary checks, 13 tricks and 52 unique played cards, 56 accepted and zero rejected replies. Leo ruffed the first heart at 6, survived Maya's four trump leads with one trump, regained lead at 30, and cashed DK/DQ at 33/37. The ten-trick contract became unreachable, which Jason acknowledged at 38 and Maya at 44. The same long-heart/high-trump holding did not reproduce the first hand's sweep because control and entries differed.
- `partners-concentrated`: not run within the parent-directed time cap. No fresh contexts started for this fixture.

## Explanation issues and limits

At `partners-void` sequence 5, Maya said the initial H4 lead "forces at least one honor" onto the trick. That was false: the realized S2/H2/H3 responses used no heart honor. At `partners-spread` sequence 32, Sarah preserved kings and tens for possible later tricks although the public record already proved Maya had only hearts and all trump was exhausted. Leo's later nil-safety rationales also continued discussing potential future club or diamond leads after the public sweep was established. Legal moves and plausible wording do not establish an accurate explanation.

A recurring choice was low-card conservation under an established winner; the meaning depended on reachability. In the spread hand, retained side-suit honors became unreachable. In the void hand, Leo's surviving trump gave his diamond honors an entry, and Jason's club ace later regained control. These are observed trajectories, not proof of optimal bidding or play. No alternate-action continuation, strategic-quality labels, probabilities, or model agreement as correctness are claimed here. D0/D1 comparison outputs are saved by audits for review only.

Manual transport correction before `partners-void` sequence 27: Sarah's prior D6 was briefly transcribed as S6. The player was interrupted before replying and received the full corrected canonical packet; no action was accepted from the erroneous delivery. The prior message remains in context, so this episode is not pristine. See `transport-incidents.json`; replay audits check stored canonical packets, not independent identity with every manually routed message.

Coverage remains narrow: two authored Partners deals, one trajectory each, zero starting scores/bags, no match-level win, no statistical or expert validation, no live Jev. The third planned Partners fixture is missing.
