# Standard gameplay: preferred references and corrections

Owner update during the interview: use Waraq rules/strategy and corroborate other sources; **standard gameplay only**, excluding Syrian/Egyptian Tarneeb editions. Checked 4 October 2026. Proposals below are plan inputs, not implemented/frozen rule changes.

## Tarneeb

[Waraq rules](https://playwaraq.com/tarneeb/rules) provide the preferred starting point: four players in opposite partnerships, 13 cards each, counterclockwise auction/play, increasing bids of 7–13, permanent auction pass, winner chooses trump, follow suit when possible. They specify a 31-point normal match, next-dealer redeal after all pass, and bid-13 success/failure bonuses.

| Detail | Waraq | Corroboration / proposed resolution |
|---|---|---|
| First trick leader | Dealer's right | Auction winner in Tarneeb Masters, Jawaker and Pagat; recommend auction winner |
| Successful ordinary bid | Both teams score their tricks | Masters/Pagat give opponents zero; recommend bidder's tricks / opponent zero |
| All pass | Next dealer redeals | Pagat's base description keeps the dealer; retain as an explicit review point |
| Unbid 13-trick sweep | Not separately specified | Jawaker/Pagat award 16; recommend 16 |
| Bid 13 | Success 26; failure −16, opponents double tricks | Pagat agrees; Jawaker confirms −16 but does not spell out opponent doubling |

Sources: [Tarneeb Masters](https://www.tarneeb.com/rules), [Jawaker](https://blog.jawaker.com/en/tarneeb-rules-en/), [Pagat base rules](https://www.pagat.com/auctionwhist/tarneeb.html). These are source discrepancies, not a request to implement several editions. Freeze the resulting single profile and match-threshold/tie handling in the main plan.

All references describe partnership play. **Tarneeb Solo still needs a meaning:** one human on that table is already supported by controller configuration; individual scoring would require a distinct rules decision. Do not invent it by copying Spades Solo.

## Trix and Trix Complex Partners

[Waraq rules](https://playwaraq.com/trix/rules) describe four kingdoms, five separate individual contracts and ordinary penalty/finish scores. However, its layout starts at sevens with Ace below 2, and its “Complex” label does not describe combined penalties or partners.

The [Jawaker Arabic Trix original](https://blog.jawaker.com/trix-rules/) and [Pagat](https://www.pagat.com/compendium/trex.html) corroborate **Jack-centered layout toward Ace and 2**, compulsory play when possible and fresh deals between contracts. Recommend this as the standard target. Do not import Waraq's Sevens layout into Trix.

For **Complex Partners**, recommend the [Jawaker Arabic Complex profile](https://blog.jawaker.com/trix-complex-rules/): two contracts per kingdom—combined penalties and layout—with fresh cards between them, ownership passing right after both, opposite-seat scores combined. Its Arabic wording also resolves the English doubling defect: doubled-card taker loses double; revealer receives the original-card bonus. Ordinary Trix has five contracts per kingdom, not this two-contract schedule.

Freeze the remaining details: opening actor, heart-leading/penalty-discard restrictions, whether doubles are enabled, their timing and self-capture cases, and tied final totals. Publisher pages omit some edges; Pagat's extra conventions must not be silently imported. Flexible combined-contract and alternative partnership-ranking editions are excluded.

## Strategy admission tests

Useful [Waraq Tarneeb themes](https://playwaraq.com/tarneeb/strategy): hand strength before bidding, trump length, preserving resources, supporting the bidder and counting public cards. Treat numeric bid examples as unvalidated heuristics. “Partner led this suit” is a hypothesis, not a proof of strength. A remaining high side-suit card can still lose to trump. If partner leads the ace and the trick is secure, spending your king can waste a later winner.

Useful [Waraq Trix themes](https://playwaraq.com/trix/strategy): choose the contract for this hand, dispose of dangerous high cards, track penalties and decide whether opening a sequence helps others. Three counterexamples prevent literal implementation:

- **No queens does not guarantee zero queen penalties.** An actor holding A♠ can win a trick containing another player's Q♠.
- **Lowest legal card is not always safest.** After A♣ is led in a penalty-trick round, both K♣ and 2♣ lose; shedding K♣ can remove a future forced winner.
- **Opening a sequence is conditional.** Releasing a connecting card may unlock an opponent's remaining cards or help a teammate; inspect the permitted board/history and compare alternatives.

These are logical counterexamples, not newly simulated games or validated optimal-action labels. Turn each into a reachable fixture and its opposite case. Store source advice, failed literal interpretation, reviewed tactic and exceptions together. No copied strategy paragraph or arbitrary “confidence” becomes a bot rule.

## Follow-up review

Both interview agents independently read the four owner-supplied pages and reviewed documents 05–07. The architecture reviewer required explicit rank-versus-layout semantics, narrower rule conflicts and threshold/redeal tests. The reasoning reviewer supplied queen-capture, trump-response and partner-resource counterexamples and required opposite cases/overlapping-tactic checks. Those corrections are incorporated here and in 06–07. This follow-up did not simulate new games or validate an optimal policy; initial interview positions remain dated and preserved.
