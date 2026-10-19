# Tactical categories and conditional strategy cards

Version: `trix-penalty-taxonomy-1.0.0`. These are initial discovery categories and **hypotheses to test**, not proven optimal rules or instructions fed to players. They apply only to the named native request/variant. Every eventual strategy card requires actual case IDs and counterexamples; empty categories remain explicitly uncovered.

## Category strategies

| ID | Observable trigger | Strategy to investigate | Necessary qualification / counterexample |
|---|---|---|---|
| DIA | Diamonds remain; own diamond lengths/ranks and public suit failures are known | Shed a dangerous diamond when void; compare short-suit preparation against taking control to choose a safer exit | In Complex, a diamond escape can surrender a king/queen/trick advantage. A low diamond may retain a useful exit. |
| HK | Own/public K♥, own heart cover, known heart plays and available exits | Preserve sufficient cover or prepare a safe off-suit discard; compare losing a heart cheaply with taking a lead to escape later | Many hearts do not guarantee safe doubling. Unknown A♥ location, exhausted cover and forced later leads can reverse the apparent benefit. No mandatory K♥ discard exists. |
| Q | One or more queens are still at risk; relevant ranks/declarations are public | Compare unloading a queen, retaining cover and consuming an exposed high card to create a later exit | Do not assume a higher card is held by a particular opponent. In Partners, dumping onto a teammate may damage the team, especially when doubled. |
| LUT | Lutoosh/Complex trick cost and remaining control cards matter | Avoid unwanted consecutive tricks; spend a high card while it can lose and preserve a low exit | Taking a cheap trick may improve the total remaining request. Losing this trick alone is not the full objective. |
| VOID | Own short suit/void or a proved public void changes access | Compare creating a void, preserving a safe suit exit, and choosing a suit that changes who can discard | A void also lets opponents discard. Leading a long suit can trap its leader; public failure proves a void then, not a hidden plan. |
| COMB | A Complex decision trades at least two penalty components | Compare total own/team consequences of king, queens, diamonds, trick cost and bonuses | King-only success can lose more elsewhere. Never add ordinary and doubled debit twice. |
| DBL | A legal optional queen/K♥ declaration is available | Compare expected own/team request consequences of doubling/declining using cover, exits and native bonus routing | Confidence and cover length are not a doubling rule. Solo self-capture can withhold bonuses; Partners routes bonus to the opposite capturing team. |
| INFER | Public actions/declarations/history suggest a plan beyond exact void/rank facts | Record competing explanations and consider robust choices that do not depend on one speculative holding | Voluntary-looking play does not prove alternatives were available or that the actor was competent. Later outcomes cannot make an earlier inference certain. |
| END | Few cards remain and public history sharply constrains holdings | Enumerate feasible remaining ownership and compare the consequences of lead/control order | Preserve information-set consistency; perfect-information answers that vary with an unseen allocation are not an executable actor strategy. |
| TEAM | Partners team score changes the preferred action | Investigate losing to partner, taking a cheap trick to protect partner, returning a useful suit, or sacrificing personal score for better combined points | North's private insight is not South's fact. Partner capture is not automatically safe; opponents can exploit a return, and doubles may make it costly. |

All Basic contracts can carry VOID/INFER/END tags. TEAM is Partners-only; COMB is Complex-only; DBL is Queens/King/Complex-only. A single case may have several tags but only one primary category. Model/rule confusion is a diagnostic label, not a tactical family used to fill quotas.

## Allocation and coverage

Basic Solo and Basic Partners each have exactly four request targets of 50. Split the request cases across applicable categories without requiring every possible cross-product. These are maximum target allocations, not permission to label repeated trivial moves as distinct.

Complex has one request, so use this primary-category allocation as a coverage guide. Rows sum to the phase target; underfilled rows are reported. A frozen supplemental manifest may rebalance category targets within the unchanged phase/corpus cap, with a stated reason.

| Primary category | Complex Solo | Complex Partners |
|---|---:|---:|
| DIA | 20 | 30 |
| HK | 30 | 45 |
| Q | 25 | 35 |
| LUT | 20 | 25 |
| VOID | 20 | 35 |
| COMB | 35 | 60 |
| DBL | 15 | 30 |
| INFER | 15 | 35 |
| END | 20 | 30 |
| TEAM | 0 | 75 |
| Total | 200 | 400 |

Report secondary coverage axes without pretending to fill every combination:

- Stage: declaration; opening (0–3 completed tricks); middle (4–8); late (9–12).
- Actor position in the trick: lead, second, third, last; identity S/E/N/W.
- Evidence: exact public fact, qualified inference, or unresolved uncertainty; natural versus authored/intervened deal.
- Doubles: undeclared, queen, king, multiple; own/opponent/partner capture and Solo withheld bonus where it occurs.
- Decision issue: sound explained choice, proved correction, explicit ambiguity, counterexample, or diagnostic-only rationale failure.
- Partners: own-team control versus opponent control; team protection versus personal relief.

Seek both positive and counterexample evidence for each proposed strategy. A counterexample reference is mandatory before a category strategy can be marked `supported-for-testing`; a strategy with none remains `hypothesis`. Rarity or absence is a finding, not a reason to fabricate a case.

## Strategy-card record

Each entry in `category-strategies.jsonl` records:

```text
schemaVersion: trix-category-strategy-1.0.0
id: stable category + strategy revision
categoryId, variants, requests, objective
observableTrigger: facts available to the actor
actionPrinciple: conditional candidate behavior to investigate
supportingCaseIds: actual curated evidence only
counterexampleCaseIds: actual curated adverse/twin evidence
assumptions: unproved ownership, behavior or continuation premises
doNotApplyWhen: concrete observable exclusions
evidenceLevel: hypothesis | supported-for-testing | disputed
coachCueDraft: concise suggested action/purpose with uncertain premises preserved
whyDraft: saved supporting facts, alternative and limitation
validationNeeded: independent tests required before deterministic implementation
```

No empty draft is represented as an observed finding. Category drafts are allowed before data; populated evidence records appear only after collection.

## Deduplication and sampling

Use a stable decision key `(runId, episodeId, nativeRevision, actor)` for identity. Compute exact-observation/action duplicates before taxonomy selection. Also cluster related tactical states by variant, request, own hand, public history/declares, actor trick position, scoring/bonus context and public legal options. Never drop bonus provenance or team identity to obtain a convenient hash.

Manual semantic clustering can mark two nonidentical states as the same learning problem; retain the original IDs and rationale for grouping. Do not apply suit symmetry freely: diamonds and hearts have distinct penalty meaning, and K♥ is special. Related deals, rotations, authored twins and different model draws share a physical-deal family. At most eight curated decisions per family across all variants/runs in the corpus. At selection time apply phase/request/category limits, then evidence eligibility, diversity and deterministic ID tie-breaking.

More related moves may be retained as supporting raw references without consuming additional cases. If a reference is promoted to a standalone teaching case, it must obtain a corpus slot. Do not inflate the case count by treating every alternative card or review as a new scenario.
