# Observed Spades cases and browser baseline

Status: implementation verified; all 12 measured browser hands completed and independently replayed. Implementation commit: `3a435de`. Decision: [CR-STRAT-010](../../planning/decisions/CR-STRAT-010-observed-cases-and-browser-baseline.md).

## Delivered

| Requirement | Result |
|---|---|
| CASE-01 | Conditional partner-spade preservation, with proven opponent voids and a retained winning entry. Disabled for any Nil or an already fulfilled team promise. |
| CASE-02 | Exact proof that this player cannot regain the lead; suppress an impossible future-control plan. |
| CASE-03 | Exact forced-finish proof; equivalent discards receive no single preferred-card cue. |
| CASE-04 | Accurate wording for a selected unbeatable lead, retaining Nil and forced-choice priorities. |
| CASE-05/06 | Source-linked regressions, shared bot/coach analysis and selected-action cue checks. |
| AUDIT-01–03 | Game policy pin; original private bot analysis committed with its move; explicit legacy attribution; no public audit leakage. |

The selectable candidate is `spades-cases-4.0.0`, with `spades-cases-cues-1.0.0`. It extends the existing inline 3.0 plan layer; that layer preserves 2.1 action selection. CASE-01 can change a move; the other additions primarily improve factual reasoning and cues. Default `spades-tactics-2.1.0` remains unchanged pending the strength gate.

All three text-discovery archives were reviewed without edits: **706 decisions, 11 complete hands, three partial hands and two unstarted setups**. Their explanations are hypotheses. [Case ledger](../experiments/2026-10-02-browser-baseline/case-ledger.md) records admitted, existing and deferred cases; [maintenance guide](../../planning/observed-case-maintenance.md) identifies the files to change.

## Executed checks

| Command | Actual result |
|---|---|
| `npm run test:all` | 348 passed, zero failed/skipped; 152.505 s. |
| `node --test --test-isolation=none web/server/tests/spades-observed-cases.test.ts` | 23 passed; includes reachable examples, exceptions, rotations and concealed-card changes. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed; existing bundle-size warning. |
| `npm run contracts:check` | Passed. |
| `npm run lint:boundaries` | Passed. |
| `npm run check:artifacts` | Passed; 13 reachable browser modules, no forbidden server identifiers/maps. |
| `node qa/experiments/2026-10-02-browser-baseline/prepare.mjs` | 706 archived choices replayed; six opening fixtures and 12 run IDs frozen. |
| `node qa/experiments/2026-10-02-browser-baseline/freeze-code.mjs` | 212 source/build/input hashes verified; recorder-only amendment is explicit. |

The full gate includes policy restarts, stale/duplicate/rejected moves, original advice equality, searched profiles, later hands and Hearts pass retries. Review found and fixed delayed Hearts pass idempotency and a saved-advice lookup defect. Initial database connection failures and the earlier failed check are retained in the experiment logs; the final broad gate above passed. Build/hash commands required execution outside the restrictive process sandbox.

## Real-browser evidence

Executed: **12 measured one-hand games**, six Solo and six Partners, old/candidate pairs on three fixed opening groups. Two unused automatic Partners openings count too: **14 created sessions**, six Solo and eight Partners. No screenshots, mocked actions or replacement games.

South is configured **GPT-6 Luna, extra-high**, using only its own cards and public history. A separate Luna observer gives no feedback. Three ordinary server bots play the other seats. Every South action uses real DOM controls; forced actions and identical-packet reuse are identified. Exact backend model snapshot is not independently exposed by the CLI.

Results and evidence: [browser results](../experiments/2026-10-02-browser-baseline/results.md), [machine audit](../experiments/2026-10-02-browser-baseline/audit.json), [protocol/recovery](../experiments/2026-10-02-browser-baseline/README.md).

| Check | Observed result |
|---|---|
| Original committed decisions | 672: 504 bot decisions and 168 South decisions; all replayed legally against exact opening cards and scores. |
| Paired scores | All three Solo pairs and two Partners pairs were equal. Resource Partners: candidate +84 versus old +82; four versus two bags. |
| Original candidate cases | Partner resources: 1; no way back to the lead: 14; forced finish: 0; unbeatable lead: 33. Offline shadow matches are separate. |
| Structured factual assertions | 1,208 cue claims and 5,109 analysis claims confirmed; zero false/unresolved. The 336 old-policy decisions have no typed claims and are not counted as passing. |
| Saved coach UI | One original response per hand displayed after play and matched its saved text; no changes to history or statistics. |
| Independent Luna observer | 48 packets attempted: 45 accepted, three timed out; none pending. All 12 after-hand reviews completed. Rejected attempts remain saved. |

The forced-finish case passed deterministic positive/counterexample tests but did **not** occur in these browser games. This remains a browser coverage gap. No extra deals were added to force a match.

### Concrete observations

- **Existing Nil play worked in the control deals.** North took zero tricks in both modes; each old/candidate control pair had the same 42 bot actions.
- **Keeping a way back to the lead mattered.** In the Solo sweep deal, North bid five, used S10 to regain the lead, then ran hearts while keeping SJ. It took 12 tricks: a useful example, with seven bags, not proof that a larger bid was justified beforehand.
- **Model explanations need factual checks.** In `sweep-solo-candidate`, South's choice 9 says West may use a spade despite West having already discarded on a spade lead. Choice 12 says all spades were played; its public packet contains only 12, missing SJ. These are memory errors, not evidence that the selected discards were wrong.
- **An actual sweep need not be knowable to every player.** From South's view, SJ could still be with North or East. CASE-03 correctly did not claim a forced finish; North's own CASE-04 cues could prove individual winning leads using its own SJ.
- **The partnership preference changed actual play.** At revision 24, North chose H5 instead of SQ from an identical seat observation. South won with S4 and led diamonds while North kept SJ/SQ. South/North took 12 tricks versus 10 and met its eight-trick promise in both runs; the two extra points also added two bags. Later Luna choices and bot replies changed too. This is not evidence of a better long-game choice. [Original decision](../experiments/2026-10-02-browser-baseline/private/resources-partners-candidate.json).
- **The observer supported the narrow explanation.** Its final review called H5 a plausible offer to the teammate and confirmed the visible spade voids, without declaring it the best move. Further Luna player explanations still misplaced unplayed spades with opponents already proved void. Keep model explanations behind factual checks.

Browser play exposed recorder assumptions about legacy public advice fields, newline formatting and browser-control recovery. Original sources, responses and failed checks remain saved under `provenance/`. Format recovery uses the earliest original valid single-action reply without another call. Two observer packets may be processed concurrently. Runtime, fixtures and model templates are unchanged. One audit connection timeout was recovered on the same game; the rejected new-table request was reconciled against stored game IDs before retrying.

## Provider and remaining work

**Runtime: deterministic code, Jev off; zero Jev/OpenRouter requests in this experiment.** Luna belongs only to the research player/observer. Local coached-hand access uses the fixture billing environment.

These are familiar development openings, with zero starting scores/bags. They do not establish win rate, isolated bot strength, late-match skill or learning by humans. Missed cases remain gaps; agent judgments are not expert labels. Next: independent review of important choices, then seat-safe Jev comparisons and fresh paired deals under CR-STRAT-009, followed by human learning evaluation. Advanced Nil tradeoffs, contextual bidding and score-pressure preferences still need separate evidence.

Next targeted checks: forced-finish browser coverage, the resource preference near a bag penalty, and fresh bidding/Nil examples. Review choices independently before using the archived seat packets for Jev; keep future held-out results separate from these development deals.
