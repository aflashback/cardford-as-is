# Scenario coverage review — 29 September 2026

**Scope:** concept/design review only, baseline `eebe51e`. No application implementation, provider request or new strength/learning result.

## Changes

- [Concept review](../../docs/superpowers/specs/2026-09-29-scenario-coverage-and-success.md): success criteria, scenario discovery, probability definitions, anti-overfitting controls and initial-authoring stop criteria.
- [Guide revision](../../docs/superpowers/specs/2026-09-29-spades-partnership-reasoning-guide.md): six explicit compound children beneath the 60 foundation recipes; first acceptance batch broadened beyond diamonds.
- [Evaluation plan](../../docs/superpowers/plans/2026-09-29-scenario-and-jev-evaluation.md): D0/D1/J0/J1 arms, blind positions, full matches, event calibration, failures, sizing, budgets and delayed unaided transfer.
- [CR-STRAT-008](../../planning/decisions/CR-STRAT-008-coverage-and-evaluation.md): EV-01–08, compatibility and reconciled historical evaluation/provider assumptions.

## Checks and limits

| Check run from the attached `codex/spades-reasoning` worktree | Result |
|---|---|
| `node --test --test-isolation=none qa/implementation/verify-partnership-guide.mjs` | **Passed: 5/5.** Four existing legal deals, information invariance, third-trick alternatives, score anchors and existing guide/link checks. |
| Read-only stdin audit via `node --input-type=module` | **Passed:** 12 changed Markdown files, 137 local links, 60 unique foundation IDs, six unique children with valid parents, eight EV requirements. |
| `git diff --check` | **Passed.** |
| Agent design review and targeted re-review | Corrected primary learning assessment mix, explicit paired-match estimand and the Nil-cover cue's feasibility condition. No remaining defect in those targeted corrections. |

No new compound fixture is claimed executable. The existing diamond verifier does not validate the new strategic recipes or evaluation protocol statistically. Agent review is not independent human strategic validation. The EV requirements are specified; their future runtime/experimental acceptance remains open.

Read-only reviews covered missing mechanisms, evaluation design and the actual Jev adapter/ledger evidence. Current code keeps Jev off. The previously recorded live response from `typesafe/jev-1.13-20260917` failed validation; no new model ID was observed and this review made zero provider calls. The old cap-one experiment remains exhausted.

Full application/browser tests, new games, probability fitting/calibration, live Jev trials and human studies were not run. Future work starts with the offline discovery corpus, reachable compound cases and frozen review protocol, before new strategy logic.
