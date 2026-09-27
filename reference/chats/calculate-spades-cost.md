# Calculate Spades Cost

Source chat: https://chatgpt.com/c/6ab7aa09-1728-83e9-8475-3bd9b4079f7a

Exported: 2026-09-26. Historical reference, not current implementation instructions. All turns returned by the chat reader are included. Original citation markers were preserved, but their target URLs were not exposed by the chat reader. Linked sandbox files are not embedded in this export.

## User

Calculate the cost od running a full spades game with Jev inference via open router 
3ai players and one user

## Assistant

OpenRouter currently prices **TypeSafe Jev 1.13 at $0.042 per 1 million input tokens, with output free**. :chatgpt-content-reference{index="0"}

For our Spades design, with **3 AI players + 1 human**:

| Operation per hand | Jev calls |
|---|---:|
| AI bidding | 3 |
| AI card plays: 13 × 3 | 39 |
| **Total** | **42 calls/hand** |

The exact cost therefore depends almost entirely on how large we make the game-state input.

| Avg input / Jev call | Cost / 13-trick hand | 10-hand match |
|---:|---:|---:|
| 300 tokens | $0.00053 | $0.0053 |
| **500 tokens** | **$0.00088** | **$0.0088** |
| 1,000 tokens | $0.00176 | $0.0176 |
| 2,000 tokens | $0.00353 | $0.0353 |

So a reasonable target for our architecture is roughly **$0.01–$0.02 USD for a complete 10-hand Spades game** if we keep each Jev decision around **500–1,000 input tokens**.

### If Jev also coaches the human

If after every human bid/play we ask Jev to evaluate the decision, that adds:

- 1 human bid
- 13 human plays
- **14 additional calls/hand**
- total becomes **56 calls/hand**

At 1,000 tokens/call:

**10 hands × 56 × 1,000 × $0.042 / 1M = $0.0235 per full game.**

So even with continuous coaching, we're still around **2–3 cents per full match**.

The key architectural decision should be to **not resend verbose Spades rules every turn**. Encode deterministic rules in our game engine and send Jev compact state such as:

```text
hand: AS,QS,10S,7S,AH,8H,4D,...
position: south
partner: north
bid: 4
partner_bid: 3
tricks_won_team: 4
trick: west=9H,north=KH,east=2H
legal: AH,8H
spades_broken: true
```

Then ask it to choose/rank only the legal actions. That should make **500–1,000 tokens/call quite achievable**, and potentially considerably less.

At **$0.042/M tokens**, Jev inference cost is low enough that **1,000 complete games would likely be only about $10–$25** for our intended setup, depending on coaching depth. :chatgpt-content-reference{index="1"}


