# Typed reasoning implementation — 29 September 2026

**Local candidate:** `spades-tactics-2.1.0`; Jev off, zero provider calls, no observed model ID. Rules, scoring and hidden-information boundaries did not change.

## Delivered

- GR-01: production `analyzeDecision` routes through static Hearts and Spades packs with distinct policy IDs. The pre-change 512-hand evaluator output was identical after extraction.
- GR-02/03: 26 Spades scenario families have linked reachable cases and private candidate-effect traces. Catalog matches and trace scores are separate from strength evidence.
- GR-04: bidding uses public context and exact feasibility checks. A separate objective helper scores complete stated trick projections for Solo or teams, including bags and terminal match results. Double-Nil play now prefers a guaranteed opponent winner, keeping both Nils live for that trick.
- GR-05/06: partner public plays produce fact versus hypothesis records; a high winning card never proves higher-card ownership. The policy includes a two-step possible-ruff entry heuristic. A bounded late-hand continuation comparator uses common sampled worlds, seat-specific actor observations and exact scoring only for completed hands.
- GR-07/08: bots and coach use the same selected analysis. New authored Nil/entry cues, a casebook, a grouped multi-style evaluator and a pinned 2.0-versus-2.1 diagnostic are included.

## Validation

| Check | Result |
|---|---|
| `node --env-file=C:\repos\test-jev\.env.local --test --test-isolation=none web/tests/*.test.ts web/server/tests/*.test.ts` | 208 passed, 0 failed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; existing Vite large-chunk warning |
| `npm run contracts:check` | Passed |
| `npm run lint:boundaries` and `npm run check:artifacts` | Passed |
| `npm run test:ui` | 30 passed, including live full Solo and Partners hands, quiet play, exact recap and saved-advice review |
| Casebook generator and grouped style matrix | 26/26 recognition/rubric/link checks; 12 original deal groups, 180 hands, 108 paired comparisons |
| `node web/server/evaluation/spades-reasoning.ts` | Completed 512 synthetic hands; Solo margin +4.68, Partners one-seat +3.55, both-teammate +0.35 against baseline over 24 deal seeds. Partnership own-score changes were negative (−2.88/−4.60). |

The [matrix report](typed-spades-casebook-and-matrix.md) records baseline-style partnership margins of **−8.67** (one changed seat) and **−17.33** (both teammates) against the local baseline. The [pinned diagnostic](spades-policy-2.0-vs-2.1-diagnostic.json) found zero bid, play or score changes between policy versions across those 180 hands; the losses predate this candidate and this matrix does not exercise its new tactics. Only two matrix hands contain Nil; none reaches a bag penalty or match completion. These are exploratory results, not evidence of partnership mastery.

Independent review found and fixed two evidence-provenance issues: continuing-match outcome preferences now identify score-margin ranking as heuristic, and matrix rows identify the actual selector for each seat. The saved matrix and pinned diagnostic were regenerated after the fix.

## Unfinished promotion work

- GR-02: casebook cue IDs are maintainer anchors; binding every anchor to rendered authored content is unverified.
- GR-04: outcome comparison needs reachable carryover/match cases and a supported way to inform live card choice. Both-Nil sacrifice beyond the exact current trick remains unresolved.
- GR-05: behavioral hints do not affect card choice. Ambiguous, absent and conflicting partner styles need independent action labels before promotion.
- GR-06: the bounded comparator is an evaluation tool, not an active live decision rule. Its policy assumptions and runtime budget need broader tests.
- GR-08: all 26 casebook entries are unlabelled; the style matrix has sparse rare states and a negative partnership slice. No strategic-strength or learning claim is promoted.

The next milestone is independent case review, reachable Nil/bag/match grouped evaluations, cue binding, and new comparisons that actually exercise changed decisions. Existing saved advice remains under its original policy version. Hearts still uses the shared fact shape; a later game needs its own fact/objective implementation behind the pack registry.
