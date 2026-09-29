# CR-STRAT-007 — Authored partnership inference guide

**Owner request:** 29 September 2026: reason through partnership situations, including A♦–Q♦ and J♦ follow, document the scenarios, then plan their implementation. Approach A (typed game packs) remains approved in [CR-STRAT-006](CR-STRAT-006-typed-game-reasoning.md). This record authorizes the requested design deliverables; the proposed individual tactics are not a claim of owner/expert validation or completed implementation.

## Decision and reason

Use a [60-scenario authored guide](../../docs/superpowers/specs/2026-09-29-spades-partnership-reasoning-guide.md) to make inferences, counterexamples, actions and coach cues reviewable. Separate exact facts, competing hypotheses and objective-based plans. Aggregate hand scores cannot specify what a bot should understand in a particular situation.

Four complete legal diamond deals show why missed covers and high followers are useful conditional clues but not proof of concealed ownership or exhaustion. Next implementation follows the [eight-milestone plan](../../docs/superpowers/plans/2026-09-29-partnership-inference.md).

| ID | Planned requirement | Acceptance evidence |
|---|---|---|
| PI-01 | Exact deductions MUST carry seat-visible evidence; suit bounds/ownership proofs MUST obey uniqueness, capacities and complete public history. | Reachable counterworlds, small-state exhaustive checks, rotations and incomplete-history failures. |
| PI-02 | Behavioral inferences MUST retain alternatives, assumptions, correlated evidence and cancellation/refutation conditions. They MUST NOT remove feasible owners. | Missed-cover/J-follower, forced/optional play, Nil/bag motives, contradiction and expiry tests. |
| PI-03 | A tactic MUST state its objective, competing plans and failure conditions. Conflicts MUST use explicit consequences rather than duplicated hint bonuses. | Accepted-action sets, changed-context siblings, scored reachable continuations and conflict traces. |
| PI-04 | Each implemented subcase MUST link its trigger, counterexample, tactic, rubric and real cue. Evidence stages MUST remain separate. | Validated maintainer report and action/claim assertions; recognition alone cannot mark a tactic proved. |
| PI-05 | Bots and coach MUST share analysis; authored cues MUST match the actor's decision and knowledge then. Quiet analysis and original saved advice MUST remain equivalent and immutable. | Bot/coach parity, turn-specific cues, hidden-mode/replay and version compatibility checks. |
| PI-06 | Shared contracts MUST contain no compulsory Spades/partner semantics. Per-game code owns inference, objectives and conventions. | Individual seam pack, Hearts parity, typed variant rejection and module-boundary checks. |
| PI-07 | Continuation planning MUST use actor-specific information and executable plans across indistinguishable worlds. Truncation MUST NOT produce a proof or calibrated probability. | Later-node invariance, bounded work, legal counterworlds, complete/truncated outcomes and stale-result rejection. |
| PI-08 | Reports MUST distinguish authored reasoning, deterministic correctness, independent strategic review, playing strength and human learning. | Scenario-level diagnostics plus separately labelled fresh comparisons and remaining gaps. |

## Alternatives

- Continue tuning aggregate policy weights: cheap, but does not define intended inference, conflict or explanation for a maintainer.
- Ask Jev to infer scenarios freely: does not supply the deterministic, reviewable knowledge base requested, and does not resolve factual certainty or self-evaluation problems.
- Selected: authored, typed scenarios with executable counterexamples first; bounded continuation only for named unresolved choices. Jev may be evaluated later within the existing provider boundary.

## Compatibility and scope

Rules, scoring, visibility, runtime provider activation, table types and public APIs do not change in this documentation iteration. The scenario recipes refine existing GR requirements. Future implementation versions private inference/tactics/content and reads old saved records without rewriting them. Existing S/P IDs remain; new `SP-*` subcase IDs sit beneath them.

Other games reuse the authoring/evidence workflow and supply their own rules and objectives. Four-seat platform scope is unchanged. No maintainer backend, universal JSON game language, signaling convention or difficulty setting is introduced.

**Current evidence:** [documentation validation](../../qa/implementation/partnership-guide-validation.md). This iteration changes no production strategy; wider runtime tests and game-strength evaluation are not rerun or newly claimed.
