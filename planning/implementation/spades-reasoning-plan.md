# Spades reasoning implementation plan

**Goal:** shared information-safe solo/partner reasoning and retained human analysis.
**Spec:** [CR-STRAT-005](../12-spades-reasoning.md). **Method:** owner-authorized subagents, independent review and local play. **Deadline:** 2026-09-29 04:18:41 UTC.

- [x] Research rules, solo/partner strategy and confidence; freeze design before implementation.
- [x] Strategy: preserve baseline; add typed analysis/public facts; apply solo tactics then partner exceptions; regression tests. Owns server/strategy.
- [x] Coach storage: consume same analysis, retain original advice for every human turn, reveal through existing access gates; test no hidden-analysis exposure or charges. Owns templates/game-service/records.
- [x] QA: reachable fixtures, solo then partnership hands, baseline comparisons, hidden/seat invariance and honest coverage. Owns new scenario tests/evaluation.
- [x] Integration: table metadata, exact setup copy, end-game trick results, contract/type/build checks and browser solo/partners play.
- [x] Independent review; fix observed defects; concise evidence with remaining gaps.

Review focus: false higher-card certainty; later opponent overtrump; own/partner live or failed Nil conflicts; hints-off analysis charging/exposure; historical advice drift. Complete legal actions remain available and probabilities are never invented. Tests use seeds and legal complete deals. Public DTOs remain generated from schemas; internal persisted records are backward compatible. No network Jev experiment.
