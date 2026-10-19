# Trix Complex Partners rule dossier

**Historical research dossier, amended by owner decision on 2026-10-07:** use [the expanded four-variant Trix specification](trix.md) and [native Go implementation plan](../superpowers/plans/2026-10-07-trix-four-variants.md) for new work. Source provenance is retained; TRX-D01/D02 are now resolved as described below.

**Dossier version:** `0.2.0`. **Historical candidate profile:** `trix-complex-partners-jawaker-1.0.0-draft.1`. **Sources verified:** 2026-10-05. **Status:** doubling decisions resolved by owner; implementation/catalog acceptance pending. The historical ID is not installed or silently repinned to the current profile.

Authority: the [owner's Jawaker selection](../../planning/research/2026-10-04-card-game-architecture-interview/08-standard-rule-reconciliation.md), [M00/M09 plan](../superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md), [game packet](../../planning/implementation/multi-game/game-packets.md) and [platform competition contract](../12-multi-game-extensibility.md). Requirements MG-02, MG-06–09 and MG-12 apply. Regular [Trix Solo](trix-solo.md) retains five separate requests per kingdom.

## Sources and corrections

The official [English Complex rules](https://blog.jawaker.com/en/trix-complex-en/) and [Arabic original](https://blog.jawaker.com/trix-complex-rules/) both carry 2020-12-06 page dates and were read live on 2026-10-05. English calls combined penalties Ltoosh and incorrectly describes the doubling loser as the doubler. Arabic identifies the captured-card taker as loser and the revealer as bonus recipient. English omits Ace from its rank list; Arabic includes Ace with a reversed weakest-to-strongest caption. Use Ace-high trick ranking as the documented, corroborated interpretation; layout's Ace endpoint is explicit. No source snapshot/hash is claimed.

[Jawaker Closed Doubling](https://blog.jawaker.com/en/closed-doubling-en/) (2025-11-14) is a later private-declaration mode. The owner-selected public-reveal pages remain pinned here. That update cannot silently change observation semantics or create a sealed-action capability.

## Specified mechanics

Four seats, 52 cards without jokers, 13 each. Opposite seats are partners; under the owner amendment, team totals combine member-seat scores and direct team bonus entries. Initial dealer is random and H7 holder owns kingdom one. Each kingdom contains combined penalties and Jack layout, in owner-selected order with a fresh deal between them; then ownership moves right. Four kingdoms therefore require eight requests. The schedule and partnership mechanics are specified by the [English Complex rules](https://blog.jawaker.com/en/trix-complex-en/); amended bonus routing below is an explicit owner rule.

All combined use the kingdom owner as first trick leader, follow suit, highest led-suit card as winner, and winner as next leader. There is no trump. Each trick contributes −15, every diamond −10, every queen −25, and HK −75; components stack. Layout opens suits at J and extends toward A or 2. One legal card must be played on each turn; pass only when none is available. Finish awards are 200/150/100/50. See the [English rules](https://blog.jawaker.com/en/trix-complex-en/) for trick/layout mechanics and the [Arabic scoring section](https://blog.jawaker.com/trix-complex-rules/) for components.

In combined penalties only HK and queens may be doubled by the holder revealing them. The doubled-card taker pays double its particular card component. **Owner amendment:** +25/+75 goes directly to the team opposite the capturing team, including when the announcer or their partner takes it. Do not credit the announcer's seat or cancel a teammate capture to the ordinary penalty. A queen's diamond cost and its trick cost remain ordinary. The [Arabic source](https://blog.jawaker.com/trix-complex-rules/) informs the underlying amounts; the owner determines these team-recipient semantics. No teammate's other cards are revealed.

## Documented M00 interpretations and gates

Inherit the explicitly labeled [Solo interpretation table](trix-solo.md#documented-m00-interpretations), with eight-request completion replacing 20. Specifically: counterclockwise `N → W → S → E → N`; kingdom owner opens layout; any held card may lead, with no added hearts restriction/mandatory penalty dump; skip finished layout players; complete each deal; all maximum-score teams are co-winners after eight requests. These are recorded application interpretations where the selected pages are silent, not proof of exact live Jawaker app behavior. [Pagat](https://www.pagat.com/compendium/trex.html) corroborates direction/Ace-high ranking but its alternative self-capture, partnership-reveal and combined-contract rules are excluded.

`TRX-D01/D02` are **resolved by owner on 2026-10-07**. Use one public pre-play subset declaration turn per seat, owner then rightward, and the team bonus routing above. The [Solo dossier](trix-solo.md#resolved-branch-gates) separately documents current/prior-leader credit and the no-bonus opening exception; those Solo rules do not apply to Partners. Full engine and catalog acceptance remain pending.

Future public observations may contain only own holdings, public board/tricks, scores, request pool and declared double cards after their reveal events. Declining does not imply absence of HK/queens. Earlier observations remain immutable; fresh deals clear hand-local deductions. Layout pass supplies an adjacency constraint, never a penalty-trick suit void.

## Planned fixtures and evidence boundary

These are **planned expectations, not passing tests or simulated sessions**. Implement them in the native Go scoring/layout/rules and visibility/service suites in the current plan; older TypeScript paths are superseded.

| ID | Input | Expected delta |
|---|---|---|
| TRX-P01 | One trick containing undoubled QD, no other penalty card | Taker −50 = queen −25 + diamond −10 + trick −15. |
| TRX-P02 | Same QD doubled by a distinct opposing seat | Taker's team −75; announcing team +25; net −50. |
| TRX-P03 | Same QD doubled by distinct teammate of taker | Capturing team −75; opposing team +25; net −50 across both teams. |
| TRX-P04 | HK and QD in one trick, both doubled, any announcers | Capturing team −225 = −150 −50 −10 −15; opposing team +100. |
| TRX-P05 | Full combined deal, no doubles | Seat deltas sum −500 = −75 −100 −130 −195. |
| TRX-P06 | N first/E second/S third/W fourth in layout | N/S +300; E/W +200. |
| TRX-P07 | Both final teams score 0 | Winner set NS/EW; no extra request or seat-order tiebreak. |
| TRX-P08 | Queen/king self-capture under own lead and another lead | Doubled card component −50/−150 to capturing team; +25/+75 directly to opposing team regardless of leader. |
| TRX-P09 | Public declaration, resume and prior snapshot | Current reveal visible; earlier packet unchanged; teammate's other cards absent. |
| TRX-P10 | Kingdom/request/deal progression | Eight fresh deals, each pool consumed once, retained owner between its two requests. |

Actual evidence: source verification, discrepancy analysis and the later explicit owner decision. No gameplay code, engine tests, provider results or strategy validation exists for this dossier. The current draft.3 rules resolve doubling; playable `1.0.0` remains reserved for implementation acceptance, with immutable history/version attribution.
