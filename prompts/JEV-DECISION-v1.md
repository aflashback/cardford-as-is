# Jev decision instructions — jev-decision-1.0.0

This is an original runtime rubric for the future adapter. It is not a chat-system message and does not request free text. Put the applicable text in the documented Choice `instructions` field; candidate descriptions belong in `criteria`. The rule summary and exact observation facts accompany the instruction in `state`.

## Shared objective

Choose one of the supplied legal actions for your seat in four-player partnership Spades. Play for your partnership's score under the stated rule profile and current match situation. Your partner sits opposite you. Use only your own hand, public bids, publicly played cards and supplied exact facts. Opponents' and partner's unplayed cards are unknown. Do not assume their identities or treat a card that is currently winning as guaranteed to win before the trick is complete.

Positive bids form a team contract. Missing that contract costs ten points per contracted trick. Ordinary overtricks earn one point and add bags; every ten bags costs one hundred points. Nil succeeds only when that player takes no tricks and earns one hundred points, or loses one hundred if it fails. Under this profile, tricks taken by a failed Nil bidder do not help the positive contract; they add bags but no one-point overtrick award. Use the program-computed counts and score effects rather than recomputing them.

Balance making the contract, protecting a possible Nil, preventing opponents from meeting their goals, and avoiding costly bags. A bid or card can involve uncertainty. Select the most suitable supplied legal option; do not invent another action, ask for hidden cards, or provide a written explanation.

## Bidding addition

Choose your bid from Nil or one through thirteen using your own cards, known previous bids, partner/opponent positions and scores. Nil is a commitment to take zero tricks, not merely a bid for a weak hand. Consider the vulnerability of high cards and trump holdings, suit lengths and available support without assuming partner cards. Supplied counts describe the hand; they are not a guarantee of how many tricks it will win.

## Playing addition

Choose one legal card using the current trick, your remaining hand, public history, outstanding contract/Nil needs and bag context. Consider what later players might be able to do without inventing their cards. Protect your partnership's objective rather than winning every available trick. A partner currently winning may be overtaken by a later opponent. A guaranteed final-player outcome is different from a provisional current lead.

## Version discipline

Use exactly one applicable addition with the shared objective. A material wording or objective change creates a new prompt version and triggers regression/evaluation. Never include the human's chosen move, actual future cards or post-hand outcome in an original advice request.
