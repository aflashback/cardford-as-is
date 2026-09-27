# Initial acceptance matrix — future implementation tests

These identifiers define planned evidence; they are not passing test results. Expand to executable test paths in the implementation.

| Test group | Requirements / work | Mandatory coverage |
|---|---|---|
| T-RULE / T-SCORE | FR-01/02/09; W02 | Frozen variant, follow suit, trump restriction, Nil, bags, ties, all original goldens |
| T-ENG | FR-02/12; W02 | 10,000 seeded legal hands, conservation, pure transitions, deterministic recorded replay |
| T-JEV-01–08 | FR-11/13; W01/03 | Documented request; accepted shape; illegal choice; probability domain; probability keys/sum/argmax; model drift; timeout/retry; no silent fallback |
| T-FAIR-01–08 | FR-14; W03/04 | Own-hand-only view; feasible hidden-hand permutations; partner isolation; coach isolation; pre-action snapshot; historical review; reveal authorization; provider/cache/log redaction |
| T-COACH | FR-03–08/16; W06 | Predicate-backed facts, neutral disagreement, real/exercise/suggestion distinction, hints, immutable retry and progress exposure |
| T-API | FR-12/15; W04 | Owned lists/resume, command idempotency, versions, job races, restart, CSRF, delete/expiry |
| T-UI | FR-10/19; W05/07 | Readable cards/four icons, no 3D, phone/tablet/desktop, keyboard, zoom, reduced motion, errors and recovery |
| T-MODULE | FR-17/18; W00/02/03/05 | Individual/two-pair partitions, test-only non-Spades flow, unsupported modes/capabilities rejected, no shared bid/trump assumption |
| E1 / G0 | W01 | Real provider capability and 40-position pilot with an explicit blocked state when no credentials exist |
| E2 | W01/07 | Sparse versus exact-feature ablation and candidate-order sensitivity |
| E3 / G4 | W07 | Independent accepted-set labels, held-out evaluation, grouped confidence intervals and honest uncertainty |
| E4 | W07 | Fair baseline duplicate-board comparison and all-Jev integration |
| E5 | W07 | Exploratory learner usability study; not a broad efficacy claim |

Release evidence must state pass, fail, blocked or not run for each group, with actual commands, environment, versions and artifact paths.
