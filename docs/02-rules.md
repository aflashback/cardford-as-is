# 02 — Normative game rules and deterministic semantics

**Rule profile:** `spades-training-1.0.0`. This is the application's explicit partnership-Spades variant. External references inform it but do not substitute for these semantics. Background references: [R06/R07/R20](../research/02-sources.md). The selected failed-Nil point convention below is intentional and must be disclosed.

The shared kernel does not contain these phases, scoring formulas, fixed trump or partner assignments. They belong to `games/spades`. A generic lifecycle wraps module phases as described in document 12.

## R-01 Cards, seats and dealing

Use exactly 52 distinct cards: Clubs, Diamonds, Hearts, Spades; ranks 2–10, Jack, Queen, King, Ace, with Ace high. Card IDs are `C2`…`CA`, `D2`…`DA`, `H2`…`HA`, `S2`…`SA`. `10`, not `T`, is the ten representation. Suits have no comparative rank except that Spades are trump.

Seats advance clockwise `N → E → S → W → N`; partners are N/S and E/W. The human is S. Select the initial dealer using server randomness, then rotate clockwise after every completed deal. The seat clockwise after the dealer both bids first and leads the first trick. Deal singly clockwise from that seat until everyone has thirteen cards. No passing or weak-hand redeal.

Production randomness uses a cryptographically secure source and unbiased shuffle indices. Tests use an injected versioned seeded random source. Persist the actual deal server-side. Never expose shuffle material or a full-deal hash in a player view or provider request.

## R-02 Bidding

Every seat bids exactly once in clockwise order. The action set is `bid:0` (ordinary Nil) and `bid:1` through `bid:13`. No passing, blind Nil, renegotiation, combined-bid limit, or requirement that all bids total thirteen. Individual bids are legal even if their combination makes a team contract impossible; the coach may explain that consequence, but the engine must not invent a prohibition.

Bids already made are public. Future bids are unknown and represented as null. Jev cannot see a future precomputed bid or another seat's hand. Nil is an individual commitment to take zero tricks; it is not a zero bid without consequences. Both partners may choose Nil; these are two independent Nil commitments with no special double-Nil bonus.

## R-03 Legal card actions

If following a lead and the actor has that suit, only cards in that suit are legal. Otherwise any held card is legal: there is no mandatory trump, mandatory overtrump or obligation to win.

If leading and Spades are unbroken, a non-Spade must be led unless the actor holds only Spades. This exception applies even to the first trick. If Spades are broken, any card may be led. A Spade may be played to the first trick when the actor cannot follow suit. The first Spade played makes `spadesBroken=true`, including a forced all-Spades lead.

The server rejects an invalid action without advancing turn, removing a card or applying a penalty. UI prevention is a convenience; server validation is authoritative. There is no human reneging penalty because an illegal play cannot enter the committed game.

## R-04 Trick resolution

A trick has four plays, exactly one from each seat in clockwise order from its leader. The highest Spade wins if any Spade is present; otherwise the highest card of the led suit wins. Off-suit non-Spades cannot win. The winner becomes the next leader.

Before the fourth play, distinguish `currentWinningSeat` from a final winner. Candidate annotations may say “would currently be winning,” never “will win,” unless code can establish the stronger claim from the information available. On the fourth play the result is exact.

Thirteen completed tricks ends a hand. Every initial card is played exactly once. Sum of tricks won is thirteen. Resolve the last trick, score both teams and determine match outcome atomically.

## R-05 Scoring — explicit arithmetic contract

For a team define:

- `B`: sum of its positive bids; Nil contributes zero. Range 0…26.
- `C`: tricks won by the team's non-Nil players only.
- `F`: tricks won by the team's Nil players (zero for a successful Nil).
- `O = max(0, C - B)` when `C >= B`, otherwise zero.
- `contractPoints = 10*B` when `C >= B`, otherwise `-10*B`.
- `nilPoints`: +100 for each Nil player with zero tricks, −100 for each Nil player with at least one trick.
- `bagPoints = O`. **Failed-Nil tricks do not earn +1 points in this profile.**
- `bagsAdded = O + F`. Failed-Nil tricks add bags but never help the partner's positive contract.
- `bagPenalties = 100 * floor((oldBags + bagsAdded) / 10)`.
- `newBags = (oldBags + bagsAdded) mod 10`.
- `delta = contractPoints + nilPoints + bagPoints - bagPenalties`.
- `newScore = oldScore + delta`.

When both players bid Nil, `B=C=O=0`; resolve the two Nil adjustments independently and add any failed-Nil tricks to bags. Negative scores are allowed. Bags are explicit state; **do not reconstruct bags from the last digit of the score**. Carry existing bags when the positive contract fails. Deduct every ten-bag cycle, including multiple cycles in one scoring operation.

### Golden scoring cases

Each row is a single team's scoring input; bid/trick arrays align to its two seats. These are original specification fixtures, not observed game results. Machine-readable copies are in `examples/scoring-golden.json`.

| ID | Bids | Tricks | Old score/bags | Delta | New score/bags |
|---|---|---|---|---:|---|
| SC-01 | 3,2 | 3,2 | 0 / 0 | 50 | 50 / 0 |
| SC-02 | 3,2 | 4,3 | 100 / 4 | 52 | 152 / 6 |
| SC-03 | 3,2 | 2,2 | 100 / 4 | -50 | 50 / 4 |
| SC-04 | 3,2 | 4,3 | 100 / 9 | -48 | 52 / 1 |
| SC-05 | 0,4 | 0,4 | 0 / 0 | 140 | 140 / 0 |
| SC-06 | 0,4 | 0,3 | 0 / 0 | 60 | 60 / 0 |
| SC-07 | 0,4 | 2,4 | 0 / 0 | -60 | -60 / 2 |
| SC-08 | 0,4 | 2,3 | 150 / 9 | -240 | -90 / 1 |
| SC-09 | 0,4 | 1,6 | 100 / 8 | -158 | -58 / 1 |
| SC-10 | 0,0 | 2,0 | 0 / 0 | 0 | 0 / 2 |
| SC-11 | 0,0 | 6,7 | 100 / 9 | -400 | -300 / 2 |
| SC-12 | 13,13 | 6,7 | 100 / 3 | -260 | -160 / 3 |

SC-09: contract +40, Nil −100, normal overtrick points +2, ten-bag penalty −100 = −158. SC-11 deliberately exercises two bag-penalty cycles. The opponent's score is not included in these unit cases.

## R-06 Session and match completion

A guided/practice hand completes after one scored deal; display both teams' result and learning summary. A full match checks only after both teams have been scored. If at least one team has 500 or more and scores differ, the higher-scoring team wins. If both are tied at or above 500, continue with another deal. If neither reaches 500, continue. There is no mercy-loss threshold, mid-trick victory, maximum hand count or timed winner.

The next hand requires the human's explicit confirmation so review is never skipped. Leaving a session keeps it resumable until deleted or expired. A quit does not fabricate a terminal game score.

## R-07 State transitions

The Spades module phase is `BIDDING → PLAYING → HAND_COMPLETE`; a nonterminal match advances to `BIDDING`, while a terminal match moves directly from the last play to `MATCH_COMPLETE`. Single-hand play stops at `HAND_COMPLETE`. Execution/job status is separate from the rule phase.

Creation starts a dealt `BIDDING` state at version 1. Each accepted bid/card/next-hand command increments `stateVersion` once. A card command can append several events, such as CardPlayed, TrickCompleted and HandScored, all under that new version and one transaction. A rejected command increments nothing. Advice completion and worker retries do not change game stateVersion.

## R-08 Invariants and separation

The authoritative state preserves card uniqueness/conservation, legal transitions, immutable accepted bids, one current actor, monotonic broken-Spades flag within a hand and reproducible scoring. Reset hand-local counters/void evidence on a new deal; retain match scores/bags. Timestamps and rendering delays never affect outcomes.

Engine functions accept explicit state/actions/random inputs and return new state/events without HTTP, files, prompts or hidden global memory. A seed only reproduces the deal/engine path when the action log is fixed; re-querying a model is not guaranteed to reproduce its previous choices.
