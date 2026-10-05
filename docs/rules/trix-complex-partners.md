# Trix Complex Partners rule dossier

**Dossier version:** `0.1.0`. **Candidate profile:** `trix-complex-partners-jawaker-1.0.0-draft.1`. **Verified:** 2026-10-05. **Status:** specified mechanics frozen; doubling protocol incomplete; M09 implementation/catalog gate closed. This is not an installed or executable profile.

Authority: the [owner's Jawaker selection](../../planning/research/2026-10-04-card-game-architecture-interview/08-standard-rule-reconciliation.md), [M00/M09 plan](../superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md), [game packet](../../planning/implementation/multi-game/game-packets.md) and [platform competition contract](../12-multi-game-extensibility.md). Requirements MG-02, MG-06–09 and MG-12 apply. Regular [Trix Solo](trix-solo.md) retains five separate requests per kingdom.

## Sources and corrections

The official [English Complex rules](https://blog.jawaker.com/en/trix-complex-en/) and [Arabic original](https://blog.jawaker.com/trix-complex-rules/) both carry 2020-12-06 page dates and were read live on 2026-10-05. English calls combined penalties Ltoosh and incorrectly describes the doubling loser as the doubler. Arabic identifies the captured-card taker as loser and the revealer as bonus recipient. English omits Ace from its rank list; Arabic includes Ace with a reversed weakest-to-strongest caption. Use Ace-high trick ranking as the documented, corroborated interpretation; layout's Ace endpoint is explicit. No source snapshot/hash is claimed.

[Jawaker Closed Doubling](https://blog.jawaker.com/en/closed-doubling-en/) (2025-11-14) is a later private-declaration mode. The owner-selected public-reveal pages remain pinned here. That update cannot silently change observation semantics or create a sealed-action capability.

## Specified mechanics

Four seats, 52 cards without jokers, 13 each. Opposite seats are partners; keep seat scores and sum N/S versus E/W for the objective. Initial dealer is random and H7 holder owns kingdom one. Each kingdom contains combined penalties and Jack layout, in owner-selected order with a fresh deal between them; then ownership moves right. Four kingdoms therefore require eight requests. These schedule and partnership mechanics are specified by the [English Complex rules](https://blog.jawaker.com/en/trix-complex-en/).

Combined penalties use the kingdom owner as first trick leader, follow suit, highest led-suit card as winner, and winner as next leader. There is no trump. Each trick contributes −15, every diamond −10, every queen −25, and HK −75; components stack. Layout opens suits at J and extends toward A or 2. One legal card must be played on each turn; pass only when none is available. Finish awards are 200/150/100/50. See the [English rules](https://blog.jawaker.com/en/trix-complex-en/) for trick/layout mechanics and the [Arabic scoring section](https://blog.jawaker.com/trix-complex-rules/) for components.

In combined penalties only HK and queens may be doubled by the holder revealing them. The doubled-card taker pays double its particular card component; the declarer earns that component's original value. A queen's diamond cost and its trick cost are independent and remain ordinary. The corrected recipient semantics come from the [Arabic doubling paragraph](https://blog.jawaker.com/trix-complex-rules/). Resolve seat credits before summing teams; partner membership does not erase a visible card or transfer a private hand.

## Documented M00 interpretations and gates

Inherit the explicitly labeled [Solo interpretation table](trix-solo.md#documented-m00-interpretations), with eight-request completion replacing 20. Specifically: counterclockwise `N → W → S → E → N`; kingdom owner opens layout; any held card may lead, with no added hearts restriction/mandatory penalty dump; skip finished layout players; complete each deal; all maximum-score teams are co-winners after eight requests. These are recorded application interpretations where the selected pages are silent, not proof of exact live Jawaker app behavior. [Pagat](https://www.pagat.com/compendium/trex.html) corroborates direction/Ace-high ranking but its alternative self-capture, partnership-reveal and combined-contract rules are excluded.

The shared `TRX-D01` timing/actor-order/multiple-declaration gate and `TRX-D02` self-capture/bonus-recipient gate in the [Solo dossier](trix-solo.md#unresolved-branch-gates) remain unresolved here. Teammate capture by a distinct seat is arithmetic below; it does not settle self-capture. Doubles must stay in the eventual profile. Neither omission authorizes removing double actions or enabling a no-double fallback.

Future public observations may contain only own holdings, public board/tricks, scores, request pool and declared double cards after their reveal events. Declining does not imply absence of HK/queens. Earlier observations remain immutable; fresh deals clear hand-local deductions. Layout pass supplies an adjacency constraint, never a penalty-trick suit void.

## Planned fixtures and evidence boundary

These are **planned expectations, not passing tests or simulated sessions**. IDs support later `trix-score.test.ts`, `trix-layout.test.ts`, `trix-rules.test.ts` and visibility/service suites named in the game packet.

| ID | Input | Expected delta |
|---|---|---|
| TRX-P01 | One trick containing undoubled QD, no other penalty card | Taker −50 = queen −25 + diamond −10 + trick −15. |
| TRX-P02 | Same QD doubled by a distinct opposing seat | Taker −75; declarer +25; net −50. |
| TRX-P03 | Same QD doubled by distinct teammate of taker | Capturing seat −75, declarer +25; their team −50. |
| TRX-P04 | HK and QD in one trick, both doubled by distinct non-taker seats | Taker −225 = −150 −50 −10 −15; declarers +75/+25. |
| TRX-P05 | Full combined deal, no doubles | Seat deltas sum −500 = −75 −100 −130 −195. |
| TRX-P06 | N first/E second/S third/W fourth in layout | N/S +300; E/W +200. |
| TRX-P07 | Both final teams score 0 | Winner set NS/EW; no extra request or seat-order tiebreak. |
| TRX-P08 | Queen/king self-capture under own lead and another lead | Blocked expected recipient pending TRX-D02; never turn a hypothesis into a golden. |
| TRX-P09 | Public declaration, resume and prior snapshot | Current reveal visible; earlier packet unchanged; teammate's other cards absent. |
| TRX-P10 | Kingdom/request/deal progression | Eight fresh deals, each pool consumed once, retained owner between its two requests. |

Actual evidence: official English/Arabic page verification and narrow discrepancy analysis only. No gameplay code, engine tests, provider results or strategy validation exists for this dossier. A complete named profile is required before M09; generic M01 work is independent. `1.0.0` remains reserved for complete reviewed semantics and later correctness evidence, with immutable history/version attribution.
