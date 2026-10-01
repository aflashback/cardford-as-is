# Expanded batch results

**3 of 8 hands complete; 258 accepted decisions (39 forced).** Per owner request, play switched from GPT-6.1 Sol to GPT-6 Luna, both at extra-high reasoning. Accepted decisions: Sol 49, Luna 209. Seat order: Maya / Leo / Jason / Sarah. Partners scores repeat each team's value across its seats.

## Solo

| Hand | Status | Decisions | Bids | Tricks | Final scores | Points this hand |
|---|---|---|---|---|---|---|
| solo-void-partner-leads | complete | 56/56 | 9/4/2/2 | 5/6/0/2 | -90/42/-20/20 | -90/42/-20/20 |
| solo-void-trumps-at-jason | complete | 56/56 | 10/2/3/1 | 5/3/4/1 | -100/21/31/10 | -100/21/31/10 |
| solo-spread-late-score-bags | partial | 27/56 | 6/1/1/3 | 1/0/1/3 | not final | — |
| solo-spread-honor-gap | not-run | 0/56 | —/—/—/— | 0/0/0/0 | not final | — |

## Partners

| Hand | Status | Decisions | Bids | Tricks | Final scores | Points this hand |
|---|---|---|---|---|---|---|
| partners-void-partner-leads | complete | 56/56 | 8/4/2/2 | 5/6/1/1 | -100/61/-100/61 | -100/61/-100/61 |
| partners-void-trumps-at-jason | partial | 44/56 | 8/3/4/3 | 5/0/4/1 | not final | — |
| partners-spread-late-score-bags | partial | 19/56 | 5/0/1/5 | 2/0/0/1 | not final | — |
| partners-spread-honor-gap | not-run | 0/56 | —/—/—/— | 0/0/0/0 | not final | — |

## Checks and limits

Recorded 262 player invocations, 0 rejected replies, 4 transport failures and 0 reported tool events. Every accepted action is replayed through the production rules. Complete hands have 56 decisions, 13 tricks and 52 unique played cards. Audits check exact delivered prompts and responses, hashes, public-information projections and scoring. Reported token usage is retained in [integrity.json](records/integrity.json); usage is unavailable for 4 attempt(s), and setup transport probes are excluded.

Each choice used a fresh player context, unlike the first batch's persistent chats. Three hands contain a Sol prefix followed by Luna; the remaining hands use Luna throughout. The switch and context changes prevent a clean model comparison. The cases are authored development samples, one path each. They cannot establish optimal moves, general strength, probabilities or improved teaching. Late scores/bags are synthetic starting states. Three in-flight Sol requests were cancelled for the owner-directed switch without accepting a response; their usage is unavailable and excluded from the reported invocation total.

No Jev or OpenRouter calls; no runtime bot, coach or rules changes. The CLI model setting is recorded, but the exact backend snapshot is not independently exposed.

See [decision findings](review-notes.md), [protocol and commands](README.md), and [raw records and audits](records/integrity.json). The earlier six-hand batch remains separate at [its saved results](../2026-09-30-two-suit-batch/results.md).
