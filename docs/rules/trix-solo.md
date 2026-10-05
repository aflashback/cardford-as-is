# Trix Solo rule dossier

**Dossier version:** `0.1.0`. **Candidate profile:** `trix-solo-jawaker-1.0.0-draft.1`. **Verified:** 2026-10-05. **Status:** specified mechanics frozen; doubling protocol incomplete; M09 implementation/catalog gate closed. This prerelease ID is a research identifier, not an installed manifest or runnable profile.

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

## Unresolved branch gates

`TRX-D01`: exact doubling window, actor order, deadline/decline semantics and whether multiple held queens are declared together or separately. Selected pages do not supply the protocol. A future `double-card`/`decline-double` schema must preserve public reveal chronology without assuming hidden simultaneous support. Illegal/out-of-window declarations must reject without mutation.

`TRX-D02`: self-capture. Literal declarer bonus would offset the doubled penalty, but selected Jawaker text gives no explicit self-capture exception. Pagat instead sometimes transfers the bonus to the trick leader; those rules must not be silently imported. Both self-led and another-seat-led self-capture need an explicit profile choice. Until D01/D02 are resolved, do not instantiate a complete reducer or advertise this mode; M01 generic contracts remain independent.

## Planned fixtures and evidence boundary

All following cases are **planned arithmetic/legality expectations, not executed engine tests**. Implement later in the game packet's `trix-*.test.ts` suites:

| ID | Expected result |
|---|---|
| TRX-S01 | Undoubled Q capture: taker −25, other seats 0. |
| TRX-S02 | Distinct declarer/taker doubled Q: taker −50, declarer +25. |
| TRX-S03 | Distinct declarer/taker doubled HK: taker −150, declarer +75. |
| TRX-S04 | All ordinary penalty requests total −500; layout total +500 per kingdom; doubling with distinct taker/declarer preserves the ordinary net total. |
| TRX-L01 | Empty C suit accepts CJ; C bounds J/J and hand C10/CQ/CA yield C10/CQ only. |
| TRX-L02 | A legal extension excludes pass; no extension forces pass. Pass proves no current adjacency card, not a generic suit void. |
| TRX-H01 | 20 distinct deals, owner retained for five requests, consumed pool/reveal history survive resume, old packets stay unchanged. |
| TRX-C01 | Packet's queen-free South deal: South chooses Queens and leads CA; East S2, North H2, West CQ; South captures −25 despite owning no queen. This now has a source-supported penalty opener; full engine reachability remains not run. |

Actual evidence here: live rule-page review and discrepancy analysis. No reducer, scoring suite, replay, provider, browser session or strategic-strength experiment ran for this dossier. Resolving blocked meanings produces a new prerelease revision; `1.0.0` requires complete semantics and corresponding M09 acceptance evidence. Historical records retain their original eventual profile version.
