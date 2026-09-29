# Partnership guide validation — 29 September 2026

**Scope:** authored guide, implementation plan and executable examples. Production baseline inspected: `751ebc9`, `spades-tactics-2.1.0`.

## Deliverables

- [Guide](../../docs/superpowers/specs/2026-09-29-spades-partnership-reasoning-guide.md): 60 scenario recipes in nine groups, a worked A♦–Q♦ example, candidate decisions, exceptions, cues and reuse boundaries.
- [Plan](../../docs/superpowers/plans/2026-09-29-partnership-inference.md): eight milestones, concrete files/contracts and acceptance checks.
- [Change record](../../planning/decisions/CR-STRAT-007-partnership-inference-guide.md): PI-01–08 and compatibility.
- [Verifier](verify-partnership-guide.mjs): four complete legal diamond deals, their identical South observations, different possible continuations and score anchors.

## Checks

**Passed:** 5 tests, 0 failures with the command below. Four complete 52-card deals replay the two diamond tricks legally; South's observations and derived facts are identical. Third-diamond continuations demonstrate a ruff, retained K and forced follow. Exact Nil/bag arithmetic, 60 unique subcase IDs and local links also pass.

```powershell
node --test --test-isolation=none qa/implementation/verify-partnership-guide.mjs
git diff --check
```

The initial isolated test command could not spawn a child process in the sandbox (`EPERM`). Re-running without test isolation executed all five checks successfully. This was a runner restriction, not a failed example assertion. Final whitespace/diff validation passed with `git diff --check` (including the staged new files).

Focused reasoning review corrected total-bid overcommitment versus individual contract impossibility, the meaning of a suit master, possible versus guaranteed Nil rescue, and the exhaustive-coverage requirement for a search proof. These corrections are included in the guide and planned assertions.

## Boundaries and next work

The four diamond deals test legality, information ambiguity and exact arithmetic. They do not establish a preferred strategy. The 60 recipes are authored proposals, not 60 passing tactical fixtures. Sub-agent reasoning reviews checked counterexamples; they are not independent expert strategy validation.

No production code changed. Full application tests, browser play, strategy matrices and human-learning checks were not rerun for this documentation iteration. Provider mode: code-only documentation checks; Jev off, zero provider calls, no observed model ID.

Next unfinished milestone: plan Milestone 1, typed records and scenario authoring, followed by the diamond inference slice.
