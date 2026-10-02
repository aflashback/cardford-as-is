# Maintaining observed game cases

## One review chain

`saved example → visible facts → case and exceptions → bot choice → authored cue → counterexample tests → measured play`

| Edit / inspect | Current Spades location |
|---|---|
| Why a case exists; what remains uncertain | `qa/experiments/2026-10-02-browser-baseline/case-ledger.md` |
| Own-card/public-history predicates | `web/server/games/spades/cases/proofs.ts` |
| Candidate selection effects and trace IDs | `web/server/games/spades/cases/profile.ts` |
| Short player-facing wording | `web/server/games/spades/cases/cues.ts` |
| Independent factual checker | `web/server/games/spades/evaluation/claims/observed.ts` |
| Reachable examples, exceptions and source hashes | `web/server/tests/spades-observed-cases.test.ts` and `tests/fixtures/spades-observed-sources.json` |
| What actually happened in the browser | `qa/experiments/2026-10-02-browser-baseline/` |

## Change process

1. Identify the information available **before** the decision. Keep the example's full deal in evaluation material only.
2. Write the smallest general condition and the conditions that turn it off. Mark a proof as exact; mark a preference as a heuristic. Never attach an invented probability.
3. Add a reachable example, a negative case, seat/suit variations and an unchanged-observation hidden-card variation. Preserve the original source record.
4. Keep bot and coach on the same analysis. A cue must describe the selected action; a rejected or changed action must invalidate its old cue.
5. Version the policy, case catalog and cue pack. Preserve old profiles and saved advice. Register the candidate explicitly, then compare it with the frozen baseline.
6. Review factual correctness separately from strength. Use fresh paired deals and human judgments before promoting a candidate.

## Later games

Reuse policy registration, safe observations, original-decision storage, templates and the evaluation protocol. Each game supplies its own facts, legal/scoring model, case predicates, partner meanings, cues and counterexamples. A table's teams come from its declared competition; Spades-specific spades, bids and Nil rules stay in Spades modules. The current four additions do not define a universal partnership strategy.

An administrative editor is future scope. Typed, versioned code and reviewable fixtures are the current source of truth; arbitrary uploaded scenario instructions never become runtime rules.
