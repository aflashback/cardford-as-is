# 05 — Coaching and learning design

## A. Teaching contract

The coach must help a person understand Spades without pretending that an unproven decision model is a chess engine. Use three independent evidence classes:

| Class | Source | Allowed wording |
|---|---|---|
| Rule fact | Engine or validated fact predicate | “You have hearts, so you must follow hearts.” |
| Original exercise answer | Versioned authored scenario and tested acceptable-action set | “In this exercise, the lowest winning card completes the stated objective.” |
| Strategic suggestion | Jev's legal-action selection using the original information set | “Jev suggests the queen of hearts. Other legal choices may also be reasonable.” |

Do not label a different legal action “wrong,” “blunder,” or “inaccuracy” merely because Jev chose differently. Do not convert its distribution into a chess-style accuracy score. R04 supports the confidence distinction; research R08–R09 inform the interaction loop, not a scoring formula.

## B. User journey

Start with a short choice: **Learn while playing**, **Practise independently**, **Full match**, or **Exercises**. Explain that spades are trump, players must follow suit, and partners combine positive bids. Link the exact scoring profile before the first hand. No account or payment wall.

A guided turn presents the hand, current trick, bidding/contract context and a quiet coach panel. The user may select and confirm without opening a hint. Hints have three deliberate steps: name the relevant concept; show the exact situational facts; reveal Jev's suggested legal action. Each reveal records assistance level, not a change in strategic ground truth.

After a move, show at most one short observation, with optional expansion. Never block the flow with a modal after every card. At hand completion, show a transparent score breakdown, a small selection of teachable decisions, and a recommended original drill. Review allows previous/next decision and retry from before the selected move.

Independent practice suppresses unsolicited advice during play, but permits an explicit hint and records that assistance. It still records pre-move observations so later feedback does not cheat by using later cards. Full match uses the same coaching controls and the 500-point rule profile.

## C. Template engine, not generated rationales

Templates have `templateId`, `version`, `skillId`, a predicate over named facts, a permitted set of scalar bindings, `evidenceClass` and authored text. Store original content as JSON. Rendering must fail closed when a predicate or binding is absent. Never interpolate HTML or accept arbitrary user-authored templates.

Examples of original content:

| Template | Required predicate | Text |
|---|---|---|
| `follow-suit` | Actor holds at least one card in the led suit | “Hearts were led and you still have hearts. Choose a heart.” |
| `current-lead` | Candidate takes the lead but trick has fewer than four plays | “The queen would lead the trick for now; later players can still overtake it.” |
| `partner-ahead` | Public current winner is actor's partner | “Your partner is currently winning. Consider whether spending a higher card helps your team.” |
| `nil-danger` | Actor bid Nil and selected card would currently win | “You bid Nil. This card takes the lead for now, which may put your Nil at risk.” |
| `bag-threshold` | Exact projected bag arithmetic available for the stated scenario | “Two more bags would reach ten and trigger the 100-point penalty.” |

The third example is explicitly a consideration, not proof that playing low is best. Use headings **“Jev suggests”** and **“What to notice”**. Do not say “Jev chose this because…”: the selection endpoint did not establish a causal explanation. Facts may accompany a recommendation, but must not be fabricated to justify it.

The fact selector uses deterministic priorities: immediate rule restriction, Nil context, current trick status, contract needs, bags, then a relevant hand feature. Limit each message to one main concept and two factual sentences. Do not ask Jev to generate a second rationalization after observing the user's move.

## D. Review and counterfactuals

Review renders the selected pre-action human observation, the action played, recorded advice and factual context. Reveal of all hands is optional only after the hand is finished and is visually labelled hindsight. That reveal must never update the original advice or increase its certainty.

A retry is a new branch, not an edit. Preserve original outcome and progress. Mark retries after future information exposure as assisted/exposed practice. A better score on one retry does not prove its first move was better: opponents can choose differently and the comparison is not an optimal counterfactual evaluator.

Choose up to three highlighted review moments per hand using a deterministic selection policy: one bidding decision, one relevant Nil or contract/bag decision, and one other non-forced decision. Every human decision remains navigable. A Jev disagreement can make a moment worth discussing, not automatically a mistake. Deduplicate the same skill and avoid overwhelming the learner.

## E. Initial twelve original drills

Each scenario has a legal partial or full position, an objective, accepted action set, rule/skill references, expected facts and a tested explanation. Partial unit fixtures cannot be used as production hands. Interactive drills need complete, internally consistent scenario state. Authored deals must not look like random live games.

| ID | Skill / learning objective | Assessment authority |
|---|---|---|
| D01 | Identify the led suit and follow it | Exact legality |
| D02 | Understand freedom to discard or trump when void | Exact legality; multiple accepted cards |
| D03 | Understand an unbroken-spade lead restriction | Exact legality |
| D04 | Lead a spade when only spades remain | Exact legality exception |
| D05 | Resolve trump versus led suit | Exact trick comparison |
| D06 | Resolve rank when nobody trumps | Exact trick comparison |
| D07 | Add a made contract and ordinary overtricks | Exact scoring |
| D08 | Score successful/failed Nil and a bag rollover | Exact scoring under this profile |
| D09 | Use the lowest card that is certain to win as fourth player, under that explicit objective | Engine proof plus authored objective |
| D10 | Avoid taking a trick while protecting own Nil, when fourth to play and a losing card exists | Engine proof plus authored objective |
| D11 | Leave partner's winning trick intact as fourth player, under an explicit conserve-high-cards objective | Engine proof plus authored objective |
| D12 | Choose a final-trick action to satisfy a stated contract/bag scoring objective | Exhaustively computed immediate score outcomes |

D09–D12 are narrow tactical exercises, not claims that a locally attractive play is globally optimal in every game. The implementation agent must author complete fixtures and prove each accepted set in tests. These drill ideas are specified here; complete tested lesson content has not yet been produced.

## F. Progress model

Track skill attempts, first-try unaided completions, assisted completions, retries and recency separately. Use labels such as **Introduced**, **Practising**, and **Consistent in exercises**. An initial rule for the last label is at least three unaided correct attempts across at least two distinct authored scenarios; this is a product heuristic, not validated learning science. Repeated identical puzzles cannot alone raise the skill label.

Recommendations select a least-practised relevant skill from the last hand, with an option to dismiss. Random free-play outcomes and matching Jev do not raise skill mastery. Sessions with revealed future information cannot contribute to unaided assessment.

Guest progress is scoped to this browser's server-issued identity. Clearing the cookie can lose access. No cross-device synchronization is promised. Provide clear progress/session deletion controls and a privacy note.

## G. Acceptance boundaries

Every factual sentence must have a passing predicate test. Test impossible or missing bindings, nil/contract edge cases and stale advice. UI tests must demonstrate that a different legal move gets neutral language, a low-confidence suggestion is not a verdict, and unavailable advice does not turn into a fabricated explanation. Learning effectiveness requires a later user study; an app that runs is not evidence that it teaches well.
