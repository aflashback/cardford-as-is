# Trix Solo rule dossier

**Historical research dossier, amended by owner decision on 2026-10-07:** the active four-variant plan calls this **Trix Basic Solo**. Use [the expanded Trix specification](trix.md) and [native Go implementation plan](../superpowers/plans/2026-10-07-trix-four-variants.md) for new work. Source provenance is retained; TRX-D01/D02 are now resolved as described below.

**Dossier version:** `0.2.0`. **Historical candidate profile:** `trix-solo-jawaker-1.0.0-draft.1`. **Sources verified:** 2026-10-05. **Status:** doubling decisions resolved by owner; implementation/catalog acceptance pending. The historical ID remains research provenance; new work uses the explicit Basic Solo profile in the current specification, not an alias or silent repin.

Authority: the [owner's Jawaker selection](../../planning/research/2026-10-04-card-game-architecture-interview/08-standard-rule-reconciliation.md), [M00/M09 plan](../superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md) and [game packet](../../planning/implementation/multi-game/game-packets.md). Requirements MG-02, MG-06–09 and MG-12 apply. The [Complex Partners dossier](trix-complex-partners.md) has a different request schedule and objective.

## Sources and corrections

The official [English Trix rules](https://blog.jawaker.com/en/trix-rules-en/) (page date 2020-11-02) establish the requests, trick opener and penalties. The [Arabic original](https://blog.jawaker.com/trix-rules/) (2020-11-19) clarifies the fresh-deal schedule and mandatory layout play. Both were read live on the verification date; no downloaded snapshot or content hash is claimed.

English's rank list omits Ace; Arabic includes Ace but labels a descending list as weakest-to-strongest. These are source defects. Ace-high trick ranking is the documented interpretation, corroborated by [Pagat's Trix description](https://www.pagat.com/compendium/trex.html) (updated 2022-04-18). Layout order is independently specified in Jawaker and must never be inferred from that defective caption.

Jawaker's [Closed Doubling update](https://blog.jawaker.com/en/closed-doubling-en/) (2025-11-14) introduces private declarations until round start. The recorded owner selection specifically uses the linked public-reveal rule pages. This dossier pins those pages; it does not silently adopt the later app mode. Adopting closed declarations would require a separate visibility/protocol decision.

## Specified mechanics

Four independent competitors use 52 distinct cards, no jokers, 13 each. Initial dealer is random; the initial H7 holder owns kingdom one. Each owner chooses all five different requests, one per fresh deal: King of Hearts, Queens, Diamonds, Ltoosh (tricks), and Jack layout. The owner sees the deal before choosing. Ownership moves right only after all five requests; four kingdoms give 20 deals. These schedule details follow the [Arabic rules](https://blog.jawaker.com/trix-rules/).

In penalty requests the kingdom owner opens. Everyone follows suit if able; otherwise any held card is allowed. Highest led-suit card wins and leads next; no trump. Capture costs are HK −75, each queen −25, each diamond −10, or each trick −15, only in its selected request. Layout finishes award 200/150/100/50. These mechanics follow the [English rules](https://blog.jawaker.com/en/trix-rules-en/).

The board begins empty. An unopened suit accepts its Jack only. Open suits extend by exactly one adjacent rank: J upward through Q/K/A or downward through 10/9/.../2. Play exactly one legal card if any exists; pass only if none exists. Finishing seats are skipped; later players continue to establish their own finish positions. Mandatory play follows the [Arabic layout paragraph](https://blog.jawaker.com/trix-rules/).

Only HK in King of Hearts and queens in Queens may be doubled by their current holders through public reveal. For a doubled card taken by a distinct seat, the taker loses twice its ordinary penalty and the declarer receives the original value as a positive bonus. This is specified in both [English](https://blog.jawaker.com/en/trix-rules-en/) and [Arabic](https://blog.jawaker.com/trix-rules/) rules. Doubling is part of the selected profile, not a dropped optional capability.

## Documented M00 interpretations

These are application interpretations of omissions, not quotations or separately approved house rules. They are recorded under M00's instruction to resolve narrow omissions with explicit interpretation/fixtures.

| Field | Selected interpretation and rationale | Planned discriminator |
|---|---|---|
| Direction | Counterclockwise `N → W → S → E → N`, matching rightward kingdom succession and Pagat's corroboration. | South's next actor is East. |
| Layout opening actor | Kingdom owner, inherited from request ownership and the explicit penalty opener; the chosen sources do not separately name a layout opener. | Owner without a Jack passes; no forced Jack-holder start. |
| Lead restrictions | Any held card may lead. Do not import Pagat's hearts-lead restriction or compulsory penalty discard, which Jawaker's selected pages do not specify. | HK/hearts lead legal with another suit present; void actor may discard a non-penalty card. |
| Final tied totals | After exactly 20 requests, return every maximum-score competitor as a co-winner. No extra deal, suit rank or seat-order tiebreak is supplied. | Totals `[50,50,-25,-75]` yield the first two competitor IDs. |
| Request completion | Play the full deal, including penalty requests after all scoring cards have appeared; this preserves the packet's card-conservation model. | King capture does not erase unplayed cards or history. |
| Dealer after initial deal | Remains a non-gameplay role: fresh private deal material is explicit; opener/owner are never derived from dealer. Any UI dealer progression needs its own documented choice. | Initial dealer distinct from owner does not change opener. |

## Resolved branch gates

`TRX-D01` — **resolved by owner, 2026-10-07:** before first play, one public declaration turn per seat, kingdom owner then rightward. Declare a subset of eligible held cards together or decline; reveal immediately. No repeat turn, deadline-dependent decline or late announcement. The native plan uses one `declare-doubles` action with an empty subset for decline; historical separate-action proposals below do not govern new code.

`TRX-D02` — **resolved by owner, 2026-10-07:** Solo self-capture costs −50/−150 and credits +25/+75 to the current external trick leader, or the last player who handed the announcer the lead in this deal. Keep that giver across consecutive self-led wins; update when another player hands over the lead; reset on every deal. If the announcer has led continuously from the opening, there is no bonus. Another player's capture still credits the announcer. This owner decision supersedes the earlier literal self-credit proposal; it is not attributed to the source pages. Persist public lead provenance and withheld-bonus records as specified in [the current rules](trix.md#4-public-doubling--trx-05-owner-confirmed).

## Planned fixtures and evidence boundary

All following cases are **planned arithmetic/legality expectations, not executed engine tests**. Implement in the native Go suites from the current Trix plan; the original TypeScript paths are superseded.

| ID | Expected result |
|---|---|
| TRX-S01 | Undoubled Q capture: taker −25, other seats 0. |
| TRX-S02 | Distinct declarer/taker doubled Q: taker −50, declarer +25. |
| TRX-S03 | Distinct declarer/taker doubled HK: taker −150, declarer +75. |
| TRX-S04 | Penalty requests total −500−W and layout +500 per kingdom; W is withheld Solo bonuses. Whole kingdom totals −W, including the no-bonus opening exception. |
| TRX-S05 | Self-captured doubled Q/HK: announcer −50/−150; qualifying current/prior external leader +25/+75, otherwise no bonus. See TX-D05–TX-D11 in the current scenario packet. |
| TRX-L01 | Empty C suit accepts CJ; C bounds J/J and hand C10/CQ/CA yield C10/CQ only. |
| TRX-L02 | A legal extension excludes pass; no extension forces pass. Pass proves no current adjacency card, not a generic suit void. |
| TRX-H01 | 20 distinct deals, owner retained for five requests, consumed pool/reveal history survive resume, old packets stay unchanged. |
| TRX-C01 | Packet's queen-free South deal: South chooses Queens and leads CA; East S2, North H2, West CQ; South captures −25 despite owning no queen. This now has a source-supported penalty opener; full engine reachability remains not run. |

Actual evidence here: source-page review and the later explicit owner decision. No reducer, scoring suite, replay, provider, browser session or strategic-strength experiment ran for this dossier. New work uses the current draft.3 semantics; playable `1.0.0` still requires implementation acceptance. Historical records retain their original versions.
