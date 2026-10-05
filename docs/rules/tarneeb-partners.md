# Tarneeb Partners rule dossier

**Dossier version:** `0.1.0`. **Candidate profile:** `tarneeb-partners-standard-1.0.0-draft.1`. **Verified:** 2026-10-05. **Status:** common mechanics frozen; owner lead/scoring choice and narrow completion fields unresolved; M08 implementation/catalog gate closed. This prerelease names the dossier, not a runnable rule profile.

Authority: [owner's preferred Waraq source and discrepancy record](../../planning/research/2026-10-04-card-game-architecture-interview/08-standard-rule-reconciliation.md), [game packet](../../planning/implementation/multi-game/game-packets.md) and [M00/M08 plan](../superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md). Requirements MG-02, MG-06 and MG-12 apply. Pending Tarneeb answers do not block generic M01 or unrelated games.

## Verified source register

Read live on 2026-10-05: official [Waraq Tarneeb rules](https://playwaraq.com/tarneeb/rules) (no publication date displayed), [Tarneeb Masters rules](https://www.tarneeb.com/rules) (no publication date; copyright 2020 is not a revision date), and [Jawaker Tarneeb rules](https://blog.jawaker.com/en/tarneeb-rules-en/) (2020-10-13). [Pagat base Tarneeb](https://www.pagat.com/auctionwhist/tarneeb.html) (updated 2021-04-07) is corroboration, not authority for unrelated editions. No downloaded snapshot/hash is claimed.

## Confirmed common mechanics

Four players form opposite partnerships, N/S and E/W. One normal 52-card deck gives 13 cards each; every suit ranks A/K/Q/J/10/.../2. Bidding/play advance counterclockwise `N → W → S → E → N`; auction starts at dealer's right. Integer trick bids 7–13 strictly increase. Passing permanently exits that auction; the sole remaining bidder chooses one of four trump suits. Four initial passes require a fresh private redeal. Players must follow suit when able; otherwise any card is allowed, without mandatory trump/overtrump. Highest trump wins, otherwise highest led-suit card; winner leads next. These common semantics are supported by [Waraq](https://playwaraq.com/tarneeb/rules) and [Masters](https://www.tarneeb.com/rules).

No Spades Nil, bags, broken-trump rule or combined partner bid is imported. No-trump bidding, Egyptian suit-ranked auction, doubles, forced dealer bid and weak-hand redeals are excluded by the recorded standard-game scope. One human plus a bot teammate is controller configuration; competition still has two teams.

## Conflicts and unselected fields

Rows describe alternatives, not two implemented selectable editions. The owner still needs to settle Waraq exactly versus the corroborated lead/scoring pair.

| Field / gate | Preferred Waraq page | Other source / packet proposal | Current status |
|---|---|---|---|
| TAR-01 first leader | Dealer's right | Masters/Jawaker/Pagat: winning bidder | Owner decision pending. |
| TAR-02 successful bid below 13 | Both teams score tricks | Masters/Pagat: bidder tricks, opponent zero | Owner decision pending. |
| TAR-03 unbid 13-trick sweep | No separate bonus stated | Jawaker/Pagat: bidder 16, opponent zero | Do not infer 16 from the word Kaboot alone; owner profile choice pending. |
| TAR-04 all pass | Next dealer redeals | Pagat base: same dealer | Explicit dealer choice pending; fresh deck confirmed. |
| TAR-05 bid 13 | Win: 26/0; fail: −16/double opponent tricks | Pagat agrees; Jawaker omits opponent doubling | Confirmed Waraq arithmetic, independent of ordinary scoring choice. |
| TAR-06 normal target | Reach 31; 61 is long edition | Masters says passes a terminal score; Jawaker allows 31/41/61 | Proposed normal target 31; freeze inclusive comparison in selected profile. |
| TAR-07 simultaneous threshold/tie | Not specified | Packet requires both teams scored before terminal check | Winner/continuation policy unselected; never apply first-updated-team wins. |
| TAR-08 initial/ordinary dealer progression | No random first dealer or explicit ordinary next-dealer direction | Jawaker/Pagat: random first dealer, rotate right | Document conservative interpretation only with resulting profile, not as Waraq mandate. |

The Waraq lead, ordinary success, all-pass and bid-13 entries above follow its [rules page](https://playwaraq.com/tarneeb/rules). Bidder leadership and opponent-zero success are explicit in [Masters](https://www.tarneeb.com/rules). Sweep 16 and rightward dealing are explicit in [Jawaker](https://blog.jawaker.com/en/tarneeb-rules-en/); [Pagat base scoring/deal](https://www.pagat.com/auctionwhist/tarneeb.html) supplies corroboration and the contrary same-dealer redeal.

`TAR-SOLO`: all selected sources describe teams. The meaning of Tarneeb Solo remains an owner decision; no individual-scoring engine, profile or catalog mode is defined here. If the intended meaning is one human at a partnership table, retain `tarneeb-partners` and express controllers separately. Never copy Spades Solo scoring into Tarneeb.

## Planned arithmetic and transition fixtures

Inputs below are `(bid, bidder-team tricks)`; opponents take `13 − bidder tricks`. These are source-derived expectations/proposed discriminators, **not executed tests**.

| ID | Input | Waraq-exact candidate | Packet's recommended candidate |
|---|---|---|---|
| TAR-S01 | `(7,8)` | `(8,5)` | `(8,0)` |
| TAR-S02 | `(7,6)` | `(−7,7)` | `(−7,7)` |
| TAR-S03 | `(7,13)` | `(13,0)` if literal ordinary scoring | `(16,0)` |
| TAR-S04 | `(13,13)` | `(26,0)` | `(26,0)` |
| TAR-S05 | `(13,12)` | `(−16,2)` | `(−16,2)` |
| TAR-S06 | `(13,0)` | `(−16,26)` | `(−16,26)` |

S03's Waraq value is explicitly a literal interpretation of its omitted bonus, not an already selected gold standard. After owner selection, keep one set of normative fixtures and retain the superseded proposal only as historical rationale.

Planned transition cases: repeated raises/permanent passes; bid 13's remaining actors can only pass; only one trump chooser; dealer and bidder at different seats discriminate TAR-01; four passes discriminate TAR-04; every trump/follow-suit/void case; new private chance input after redeal; no score update for discarded all-pass deals. Before scoring, old totals `(25,27)` plus S01 would yield Waraq `(33,32)` versus recommended `(33,27)`; TAR-07 must specify the resulting winner. Old `(23,26)` plus S01 yields Waraq `(31,31)`, exposing the unresolved tie. No expected winner is claimed yet.

Future `tarneeb-rules.test.ts`, `tarneeb-score.test.ts`, `tarneeb-observation.test.ts` and `tarneeb-service.test.ts` must cover these cases, deterministic replay, persisted profile/version and safe packet exclusion. Partner observations retain only own hand and public auction/tricks; declared support remains uncertain, never proof of teammate holdings.

Actual evidence here is live source review and discrepancy analysis. No Tarneeb reducer, match, test suite, provider or browser session ran. Resolve TAR-01–08 and Solo scope before naming a complete executable profile; then finalize semver and M08 fixtures. Existing Hearts/Spades profiles, historical records and public catalog remain unchanged.
