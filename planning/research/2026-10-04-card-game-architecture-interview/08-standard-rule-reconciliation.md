# Standard gameplay: preferred references and corrections

Owner rule decision: use Waraq for Tarneeb and Jawaker for Trix. For Trix, Jawaker is the authority for standard and Complex Partners rules; its Jack-centered layout is the only planned layout. Checked 4 October 2026. These are implementation-plan inputs, not implemented game code. Standard gameplay only; Syrian/Egyptian Tarneeb editions are excluded.

The earlier interview files retain their original chronology. This later rule choice supersedes their Trix questions and any earlier recommendation to choose between layout variants.

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

Waraq's [Trix rules](https://playwaraq.com/trix/rules) describe four kingdoms, five separate individual contracts and ordinary penalty/finish scores, but use a seven-centered layout and do not specify the selected Complex Partners rules. This layout is rejected for CardFord; there will be no seven-centered compatibility mode.

The owner-selected [Jawaker English Trix rules](https://blog.jawaker.com/en/trix-rules-en/) specify **Jack-centered layout toward Ace and 2**, mandatory play when a legal card is available, and pass otherwise. The [Arabic original](https://blog.jawaker.com/trix-rules/) and [Pagat](https://www.pagat.com/compendium/trex.html) corroborate this layout. Each suit sequence starts at Jack; Queens through Ace extend upward, 10 through 2 downward. This is the sole planned layout for standard and Complex Trix.

For **Complex Partners**, use the [Jawaker Complex rules](https://blog.jawaker.com/en/trix-complex-en/): two requests per kingdom—combined penalties and layout—with fresh cards between them, ownership passing after both, and opposite-seat scores combined. The [Arabic original](https://blog.jawaker.com/trix-complex-rules/) confirms Ace in the layout and resolves the English doubling wording: the doubled-card taker loses double; the revealer receives the original-card bonus. Ordinary Trix has five requests per kingdom, not this two-request Complex schedule.

Implement the Jawaker profile as stated and resolve only details its rules do not specify, including the first actor for each sequence, any lead restrictions, and tied final totals. Do not import conflicting Waraq layout rules or unrelated variations. Preserve Jawaker's double actions and point effects in Complex; verify timing and self-capture behavior against the selected rules before encoding those edge cases.

## Strategy admission tests

Useful [Waraq Tarneeb themes](https://playwaraq.com/tarneeb/strategy): hand strength before bidding, trump length, preserving resources, supporting the bidder and counting public cards. Treat numeric bid examples as unvalidated heuristics. “Partner led this suit” is a hypothesis, not a proof of strength. A remaining high side-suit card can still lose to trump. If partner leads the ace and the trick is secure, spending your king can waste a later winner.

Useful [Waraq Trix themes](https://playwaraq.com/trix/strategy): choose the contract for this hand, dispose of dangerous high cards, track penalties and decide whether opening a sequence helps others. Three counterexamples prevent literal implementation:

- **No queens does not guarantee zero queen penalties.** An actor holding A♠ can win a trick containing another player's Q♠.
- **Lowest legal card is not always safest.** After A♣ is led in a penalty-trick round, both K♣ and 2♣ lose; shedding K♣ can remove a future forced winner.
- **Opening a sequence is conditional.** Releasing a connecting card may unlock an opponent's remaining cards or help a teammate; inspect the permitted board/history and compare alternatives.

These are logical counterexamples, not newly simulated games or validated optimal-action labels. Turn each into a reachable fixture and its opposite case. Store source advice, failed literal interpretation, reviewed tactic and exceptions together. No copied strategy paragraph or arbitrary “confidence” becomes a bot rule.

## Follow-up review

Both interview agents independently read the four owner-supplied pages and reviewed documents 05–07. The architecture reviewer required explicit rank-versus-layout semantics, narrower rule conflicts and threshold/redeal tests. The reasoning reviewer supplied queen-capture, trump-response and partner-resource counterexamples and required opposite cases/overlapping-tactic checks. Those corrections are incorporated here and in 06–07. This follow-up did not simulate new games or validate an optimal policy; initial interview positions remain dated and preserved.
