# Trix lab gap closure — 8 October 2026

The owner authorized closing the first five reviewed Trix gaps: current-engine rule alignment, Trix alternatives evaluation, separately executable policies, deterministic partnership reasoning, and contextual tactical explanations. Feedback automation, strategic strength validation, default promotion, live model calls and further investigations are explicitly deferred.

## Delivery contract

- Reuse the native Trix engine's legal actions, transitions, current/historical profile registrations, rightward seat order and scoring. Cover Basic/Complex Solo/Partners, with current Partners public-twos rules and historical replay preserved.
- Keep `trix-deterministic-1.0.0` as the baseline and live default. Add `trix-reasoning-1.0.0` as a selectable lab candidate for all four variants. Bot selection and coach explanation consume the same saved decision trace.
- Use only own cards and information public at that decision. Distinguish exact constraints from conditional estimates and heuristic preferences; no model calls, concealed-hand shortcuts or strength claims.
- Add bounded Trix action comparison for request choice, doubling, penalty play and layout, using common feasible worlds and native continuations restricted to each future actor's observation. Record incomplete work instead of presenting a partial choice as complete. Request-end evaluation is a declared local objective, not a full-session optimality claim.
- Save concise action/purpose cues plus one complete reason with concrete facts, alternatives and limitations. Preserve original preparation and historical evidence, and retain explicit gaps where support is insufficient.
- Keep the current lab review/import/report workflow; do not connect feedback automation or implement confirmation/promotion studies. No product UI redesign.

## Work packages and ownership

1. Policy and reasoning: `server/internal/games/trix/policy.go`, new `reasoning*.go` and focused tests. Public additions: `ReasoningPolicyID`, `SupportsPolicy`, `DecideWithPolicy`, typed saved trace and a message builder consuming that trace. Leave engine rules and scoring unchanged.
2. Alternatives evaluation: new `server/internal/games/trix/evaluation*.go`, new `server/internal/evaluation/coachlab/trix_evaluation*.go`, and narrow dispatch/config changes in `coachlab/beliefs.go`. Own feasible allocations, phase continuations, bounded comparison and configuration fixtures.
3. Pipeline integration: lab native Trix adapter/audits/policy admission, TS admission/packets/evidence, operator initialization and focused integration tests. Use exact module/profile version dispatch and the new policy/trace interfaces. Preserve old runs.
4. Coordinator: interface decisions, documentation, task-scoped review and bounded end-to-end checks. Source baseline saved at `.local/evaluation/coach-lab/trix-gap-work/before/` because unrelated uncommitted work must be preserved.

## Acceptance

- Focused regressions establish current/historical profile isolation, announcement timing, actor-only evidence, policy replay/parity, partnership penalty and layout cases, solo separation, deterministic outputs and contextual explanations.
- Evaluator tests use full legal native fixtures; verify native score parity, observation-compatible constraints, all phases and variants, fixed work/cancellation, and preserved unsupported/incomplete accounting.
- Run the lab's focused integration gate once interfaces settle, then retained current-rule headless examples for all four Trix variants and bounded evaluations/reports. Re-run only failed or newly affected checks.
- Record exact passing/failed/not-run results, commands and limitations. Mechanics and conditional evaluation are not proof of improved playing strength.

## Progress

- Preflight: current working source inspected; unrelated changes preserved; task baseline snapshot saved. Prior review and the owner's first-five-gap instruction supply the approved scope and design direction.
- Interface clarification: current Trix doubling is public and sequential. Each simulated declarer must observe earlier published declarations. An initial worker brief incorrectly called these sealed; corrected before implementation, using `engine.Apply` and TRX-D01 as authority.
- Evaluator objective: Partners compares own-team minus opposing-team request score deltas; Solo compares own minus mean-other-player request score deltas. Native scoring supplies all values, including withheld bonuses. This avoids comparing raw positive layout awards directly against raw negative penalty totals. Remaining-pool opportunity cost remains explicitly outside the local request-end horizon. Sampled paired extrema are ranges of observed scenarios, not confidence intervals.
- Trace interface: `BuildDecisionTrace` selects once; `BuildCoachMessage` consumes the saved trace; `ValidateDecisionTraceWithPin` binds parsed actor observations to the exact current/historical profile without reselecting the original action.
- Implementation complete: all three source work packages are delivered. The integrated operator gate passed in 314.157 seconds, including native collection, policy/evaluation tests, 36 Node checks and both TypeScript projects. A later TS-only retrospective announcement-clearing fix passed 13 affected Node checks, server type checking and independent review. No review findings remain.
- Handoff: eight complete sessions across all four variants retained 6,469 original decisions, 807 candidate coaching bundles and 32 completed bounded comparisons. Exact resume preserved original decision bytes. Four complete retrospective exports fit the existing cap. All results and limits are recorded in the [acceptance record](../../../qa/evaluation/coach-lab/trix-gap-acceptance.md); use the [runbook](../../../qa/evaluation/coach-lab/README.md) to start a fresh run.
