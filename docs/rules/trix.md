# Trix — Basic and Complex, Solo and Partners

**Status: native local functional baseline implemented and verified across all four variants, 7 October 2026; Basic browser completion verified across restart, combined resource gate unpassed. Doubling decisions TRX-D01/D02 are owner-confirmed.** Authority: [CR-GAME-001](../../planning/decisions/CR-GAME-001-trix-four-variants.md). [Implementation plan](../superpowers/plans/2026-10-07-trix-four-variants.md) · [Actual acceptance status](../../qa/implementation/trix/status.md) · [Strategy cases](../../planning/implementation/trix/scenarios-and-evaluation.md).

**8 October amendment:** Trix Jacks naming and automatic Partners twos announcements are implemented under [CR-GAME-002](../../planning/decisions/CR-GAME-002-trix-jacks-twos-announcement.md). [Focused acceptance](../../qa/implementation/trix/twos-announcement.md) covers both Partners variants, hidden-information boundaries and historical compatibility.

## 1. Four explicit profiles

Installed game ID: `trix`. Solo keeps module `2.0.0`, rules and schemas `1.0.0`. New Partners sessions use module `2.1.0`, rules and state/observation/public schemas `1.1.0` for the automatic twos announcement; event commands retain schema `1.0.0`. The deterministic policy remains `trix-deterministic-1.0.0`, version `1.0.0`, without a strategy change. Historical Partners `2.0.0` installations retain the original `1.0.0` rules and schemas for exact-pin resume/replay, and do not appear as new-game choices. Draft IDs and saved records are unchanged. Module version is independent of rule version.

| Variant ID / display name | Requests per kingdom | Competitors | Rule ID |
|---|---|---|---|
| `basic-solo` / Trix Basic · Solo | Diamonds, Lutoosh, Queens, The King, Trix Jacks | Four individuals | `trix-basic-solo-1.0.0` |
| `basic-partners` / Trix Basic · Partners | Same five | Opposite pairs | `trix-basic-partners-1.1.0` |
| `complex-solo` / Trix Complex · Solo | All combined, Trix Jacks | Four individuals | `trix-complex-solo-1.0.0` |
| `complex-partners` / Trix Complex · Partners | Same two | Opposite pairs | `trix-complex-partners-1.1.0` |

“Kingdom” means one player's round of choosing games. “Request” means one chosen game on one fresh deal. Basic has **four trick-taking requests plus one layout request**, not five trick-taking requests. A full session is four kingdoms: **20 Basic deals or 8 Complex deals**. There is no target-score early finish.

## 2. Cards, ownership and direction — TRX-01/02

- Standard 52-card deck, no jokers, thirteen each. Internal IDs remain `H7`, `HK`, `DQ`, `C10`; tricks rank Ace high. No trump.
- Initial H7 holder owns kingdom one. That owner chooses after seeing their own cards. The public initial ownership therefore establishes H7's holder in that first deal until played. H7 identifies the owner only on the first deal; do not reveal another player's current H7 on later deals.
- Each request is used exactly once per kingdom. Deal fresh cards **before** each choice; keep the owner until their request pool is exhausted. Then move ownership right and restore the full pool.
- Existing seat IDs are `0=South, 1=West, 2=North, 3=East`. Trix advances `0→3→2→1→0`, equivalent to `(seat+3)%4`. Do not reverse global seat IDs or current games. Partners are `{0,2}` and `{1,3}`.
- Kingdom owner opens every request, including layout. A layout owner without a playable Jack passes normally. Trick winner leads the next trick.
- No hand-quality redeal. Deal randomness is private, unbiased server randomness; selected deals are opt-in local test fixtures.

## 3. Penalty requests — TRX-03/04

Follow the led suit if possible; otherwise any held card. Highest led-suit card wins. No obligation to beat a card, no mandatory penalty discard and no hearts-leading restriction in this selected profile. These preserve the earlier documented Jawaker interpretation; do not import Hearts restrictions.

| Request | Capturing seat's ordinary points |
|---|---|
| Diamonds | −10 per diamond |
| Lutoosh | −15 per trick |
| Queens | −25 per queen |
| The King | −75 for K♥ |
| All combined (Complex only) | All four components added together |

Play all thirteen tricks, even after a request's penalty cards have been captured. Display running request points and the completed request ledger; keep the end-of-request review before the next deal. A full deal prevents silent disappearance of cards/history. This is an explicit application interpretation, not a claim about every Trix app.

## 4. Public doubling — TRX-05; owner-confirmed

Only a holder may announce a queen in Queens, K♥ in The King, or either in All combined. A doubled queen costs the capturing seat −50 and has a +25 bonus; doubled K♥ costs −150 and has a +75 bonus. The recipient is determined below. Do not add another −25/−75 debit. In Complex, a doubled Q♦ retains its separate −10 diamond component and the trick still costs −15. No doubling in Diamonds, Lutoosh or layout.

### Declaration procedure — TRX-D01 resolved

1. After request selection and before first play, every seat gets one public declaration turn, starting with the owner and moving right. No timing-dependent deadline or automatic decline.
2. One action declares any subset of that player's eligible held cards, including the empty subset (decline). Enumerate all legal subsets: at most 32 in Complex. Then advance; no second declaration turn, redouble or later announcement.
3. Reveal only declared cards at that event. Decline does not establish that the player lacks queens/K♥. Even seats with none take the same public turn; their only legal choice is forced decline.
Declarations close before the first card is played. This is the owner's accepted public, sequential procedure, not closed or simultaneous doubling.

### Bonus recipient — TRX-D02 resolved

| Competition / capture | Recipient of +25/+75 |
|---|---|
| Partners: announcer or their teammate captures | Opposing team |
| Partners: opponent captures | Announcing team |
| Solo: another player captures | Announcer |
| Solo: announcer captures on another player's lead | Leader of this trick |
| Solo: announcer leads and captures | Player who last handed the announcer the lead in this deal |
| Solo: announcer has led continuously from the opening; nobody handed them the lead | Nobody; record a withheld bonus |

In Partners this is always the team opposite the capturing team; write the credit directly to that competitor, not an arbitrary member. The capture penalty belongs to the taker's seat and is included once in their team's total. In Solo, another player's capture credits the announcer regardless of who led.

**Lead history for Solo:** initialize `lastExternalLeader[4]` to null on each fresh deal. When a trick ends with `leader != winner`, set `lastExternalLeader[winner] = leader` before scoring; preserve the other entries. Consecutive self-led wins retain the value. If an announcer captures their own doubled card, use the current leader if different from the announcer, otherwise their saved last external leader. A null recipient means no bonus. Losing and later regaining the lead from a different player replaces the saved value.

Example: Leo leads, Maya wins, then Maya wins two of her own leads and takes her doubled queen. Maya loses 50; Leo receives 25. These are public-history facts. Persist/replay the leader and source trick reference, reset them on every new deal, and expose the relevant provenance to policy and coach. Never carry a giver across requests.

Resolve each doubled card independently, including several in one trick with different announcers. A no-prior-leader capture is legal and must score even if sensible play normally avoids it. Record `{card, bonusValue, reason: no_previous_external_leader}` when withholding a bonus; do not invent a recipient or an extra penalty. Self/partner capture no longer cancels back to the ordinary penalty.

## 5. Trix Jacks — TRX-06/13

Four initially empty suit rows. Each opens with its Jack. Extend one adjacent card upward `Q,K,A` or downward `10,9,…,2`. Exactly one card per turn; if any placement is legal, passing is illegal. When none is legal, pass is the sole choice and is labeled forced.

The name **Trix Jacks** identifies this request in all four variants; the internal request ID stays `trix`. The Trix family name is unchanged.

Skip finished seats. Continue until all four finish, awarding **200, 150, 100, 50** once each. Partners add their individual finish awards; no early team finish or alternative 400/100 scoring. A pass is evidence about the cards playable **on that board at that time**, not proof of lacking a suit. Record the board frontier with the pass.

### Automatic Partners twos announcement — TRX-14

Owner-confirmed amendment, 8 October 2026: [CR-GAME-002](../../planning/decisions/CR-GAME-002-trix-jacks-twos-announcement.md). Implementation status: [focused acceptance](../../qa/implementation/trix/twos-announcement.md).

For Basic Partners and Complex Partners, selecting Trix Jacks automatically checks who holds C2, D2, H2 and S2. If both teams hold at least one, show all four face-down beside their owners in the doubled-card area, exposing only each holder's count. If all four belong to one team, omit the announcement entirely without naming the team. Neither Solo variant announces twos.

Reveal all four original suits/owners immediately after the first four layout turns, including passes, before the kingdom owner's second turn. Normal placements remain legal during those turns: 10 or Queen may follow an already placed Jack. Twos remain held cards and are played normally later; points and finishing are unchanged. Remove each displayed face when its two is played, retaining the public historical ownership fact. All announcement/reveal state comes from the server and survives reload. There is no announcement popup, confirmation, extra turn or delay.

Historical Partners games keep their original pinned rules without this announcement. Only newly started Partners sessions use the amended rule version.

## 6. Ledger, completion and examples — TRX-07

Keep ledger entries `{request, trick/finish, recipient, component, card?, delta, declarationRef?, leadSourceRef?}`, where recipient is a seat or a competitor. Capture penalties and layout awards target seats; Solo bonuses target seats; Partners bonuses target teams directly. Team totals sum member-seat entries plus direct team entries exactly once. A withheld-bonus record is evidence of a missing credit, not an extra score debit. Request points settle after each deal; show kingdom subtotal and cumulative session totals after its last request. After kingdom four, every competitor tied for highest total is a co-winner; no extra kingdom or arbitrary seat tiebreak.

Planned arithmetic expectations, **not executed tests**:

| Case | Expected result |
|---|---|
| Ordinary Basic queen capture | Taker −25 |
| Doubled Basic queen, Solo, another player captures | Taker −50; announcer +25 |
| Doubled queen self-capture, Solo, current/prior external leader known | Announcer −50; qualifying leader +25 |
| Doubled queen self-capture, Solo, no prior external leader | Announcer −50; no bonus |
| Doubled K♥ self-capture, Solo, no prior external leader | Announcer −150; no bonus |
| Doubled queen taken by announcer or teammate, Partners | Capturing team −50; opposing team +25 |
| Complex trick containing Q♦ only | Taker −25 −10 −15 = −50 |
| Same trick, doubled Q♦ | Taker −50 −10 −15 = −75; +25 to recipient above, or withheld in the Solo opening exception |
| Same trick taken by announcer's partner | Capturing team −75; opposing team +25; combined −50 |
| Complex trick with doubled K♥ and doubled Q♦, Solo, two distinct non-taker announcers | Taker −150 −50 −10 −15 = −225; announcers +75/+25 |
| Same cards, Partners, any announcers | Capturing team −225; opposing team +100 |
| Solo opening streak: own doubled Q♦ and own doubled K♥ captured in separate Complex tricks, no other penalty cards in those tricks | Announcer −75 and −165; bonuses 25+75 withheld; combined −240. A seat cannot play both held cards into one trick. |
| All penalty requests in one Basic kingdom / one Complex penalty deal, Partners | Sum of all seat and team ledger deltas −500 |
| Same total, Solo | −500 − W, where W is the sum of withheld bonus values in those requests |
| Complete layout | Sum +500; team first+fourth =250, second+third =250 |
| Complete kingdom / session, Partners | Sum across both teams 0 |
| Complete kingdom / session, Solo | Sum across all players −W for that kingdom/session |

## 7. Fair observations and decisions — TRX-08/09

Policies and coach see only own hand, public turn/request pool/kingdom context, score ledger, plays, public declarations, board, finish order and card counts. Clear deal-local deductions on each fresh deal. Remember public history for the current deal; no partner private state, authoritative deal seed, future cards or omniscient scoring advice.

Same observation, policy and fixed work budget produce the same candidate analysis for bot and coach. Human cue settings control exposure, not computation; keep original advice for later authorized review. All turns, including request choice/doubling/layout/pass, need saved analysis and concise original teaching text. No live AI/provider call or displayed invented certainty.

## 8. Source reconciliation

Read live on 2026-10-07: [Jawaker Basic English](https://blog.jawaker.com/en/trix-rules-en/), [Basic Arabic](https://blog.jawaker.com/trix-rules/), [Complex English](https://blog.jawaker.com/en/trix-complex-en/), [Complex Arabic](https://blog.jawaker.com/trix-complex-rules/). These support Basic and Complex in both competition formats. Their English rank list omits Ace; Complex English also misidentifies the doubled-card loser. The Arabic descriptions and owner's arithmetic resolve those text defects. [Pagat](https://www.pagat.com/compendium/trex.html) corroborates counterclockwise play/Ace-high order but describes alternative restrictions and partnership rules; those alternatives are not silently adopted.

The earlier [Solo dossier](trix-solo.md) and [Complex Partners dossier](trix-complex-partners.md) retain source provenance and carry the owner amendment. The owner explicitly resolved TRX-D01/D02 on 7 October 2026, including partner capture, earlier-leader credit and the no-bonus opening exception. These application semantics supersede source omissions and the draft.2 proposal; they are not claimed to be verified behavior of another app. Later closed/hidden doubling remains outside this profile. The native module and catalog are implemented; [acceptance evidence](../../qa/implementation/trix/status.md) records verified local behavior and the remaining resource and strategy limits.
