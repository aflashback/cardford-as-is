# Browser Spades rules v1

Four seats act clockwise: South 0, West 1, North 2, East 3. Standard 52-card deck. Card IDs are suit C/D/H/S followed by 2..10,J,Q,K,A; ace high. Each seat starts with 13 cards. Spades are always trump. No jokers, blind Nil, passing, table talk or agreed signals. The seat after the dealer bids first and leads the first trick. Each seat bids once, clockwise, an integer 0..13. Zero is Nil: a promise to win no tricks. All bids remain legal even when the table's bids exceed 13.

Follow the led suit if you hold it. Otherwise play any card; playing a spade is optional. You can lead spades only after a spade has been played, unless your hand contains only spades. Highest spade wins a trick containing spades; otherwise highest card of the led suit wins. Other suits cannot win. Winner leads next. Play all 13 tricks before scoring or checking victory.

SOLO: four independent scores; all other seats are opponents. PARTNERS: South+North versus West+East. Positive bids and tricks of positive bidders pool for each team. Teammates never see each other's hands. Nil is individual, including when both teammates bid Nil.

For a scoring competitor, let B be its positive bids and C the tricks of its positive bidders. If C >= B, score 10*B plus max(0,C-B); otherwise score -10*B. A Nil bidder adds +100 for zero tricks or -100 otherwise. Failed-Nil tricks NEVER help a positive contract; they add bags but no overtrick points. Bags added are max(0,C-B) plus all failed-Nil tricks. Every accumulated 10 bags costs 100 points, leaving the remainder. With no positive bids, positive-contract points are zero. Existing bags remain when a contract fails.

Add hand points to public scores. After the complete hand, if someone has at least 500, the unique highest-scoring competitor wins the match. A tie for highest continues play. If nobody reaches 500, continue. Try to maximize your prospect of winning under these rules; in Partners this means your team. Future deals are unknown. This experiment records one hand per game; the scoring goal and match-end rules still apply.
