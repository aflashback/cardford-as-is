# CR-STRAT-006 — Typed game reasoning packs

**Owner decision:** 29 September 2026, approach A approved with instruction to plan and implement. **Scope:** local code strategy and its evidence; four-seat Hearts and Spades catalog. Rules, scoring, visibility, provider activation and paid access are unchanged.

## Decision

Each game owns a reviewed, typed reasoning pack: exact knowledge, optional soft beliefs, scenario descriptors, tactic evaluators, variant objectives, authored teaching text and reachable cases. A small shared registry, trace format and evaluation runner connect packs to the existing service. A scenario is a recognizable situation; matching it does not certify the quality of a tactic. Packs are trusted source code registered at build time.

| ID | Requirement | Acceptance |
|---|---|---|
| GR-01 | Production decision routing MUST use typed, game-owned packs. Unsupported modes fail closed; Hearts and both Spades variants have explicit identities. | Registry and actual service/coaching path tests; current frozen-corpus parity before strategic changes. |
| GR-02 | Each Spades scenario family MUST have one catalog entry with a stable ID, variants, evidence status and linked cases. Tactic evaluators and content references MUST resolve. | Catalog validation and generated maintainer report; all S01–S14/P01–P12 represented. |
| GR-03 | Decisions MUST retain the complete legal set and a private, versioned candidate/selection trace. Exact facts and soft interpretations MUST remain distinguishable. | Invariance, trace, replay, review and sensitive-field tests. |
| GR-04 | Spades Solo and Partners MUST evaluate contextual bids, actual score/bag/match consequences, opposing contracts and both-Nil states through their proper individual/team objective. | Reachable positive, negative and conflicting-obligation cases, followed by grouped full-hand and match comparisons. |
| GR-05 | Partner hints MUST be conditional on public behavior and declared assumptions. They MUST NOT turn behavior into certain concealed-card ownership or create secret bot signals. | Same-observation hidden-hand permutations, ambiguous/contradictory play cases, unfamiliar partner cross-play. |
| GR-06 | Lead transfer and entry planning MUST use bounded continuations in which simulated actors receive only their own observations. Truncation MUST be disclosed. | Reachable multi-trick cases, actor-information invariance and deterministic seed/work-budget tests. |
| GR-07 | Bots and coach MUST share analysis while coach output remains authored, concise and tied to supported trace claims; quiet settings do not change analysis. | Saved-advice/access and cue-fidelity tests, plus local UI play/review. |
| GR-08 | Strength claims MUST use independent case labels and fresh grouped deal families against multiple teammate/opponent policies. Passing scenario tags or Jev agreement alone is insufficient. | Versioned casebook, evaluator manifest, separate Solo/Partners and rare-state results with limitations. |

## Reason and alternatives

The current tactical foundation is legal and seat-safe, but `spades.ts` combines recognition, prose and selection; the module seam test does not exercise production routing. The saved comparison has 24 independent deal seeds and no double-Nil team outcomes. Typed packs fit the existing TypeScript monorepo and keep complex tactics debuggable.

A restricted decision-table compiler was considered. It adds schema/operator versioning and debugging work without adding strategic strength. A general runtime game scripting language remains out of scope. Jev remains the only remote strategic model and stays under the existing off/shadow/promotion gate.

## Compatibility and change control

Preserve historical policy IDs, analysis/advice snapshots, legal-action behavior, rule-profile IDs, scoring and hidden-information projection. Give each new pack and trace its own version. Behavior-preserving extraction is checked separately from strategy changes. New strategy cases can choose differently only under a bumped policy version. This change does not rewrite old advice.

Affected checks: `web/server/tests/{module-seam,strategy,spades-reasoning,coaching-analysis,saved-analysis,observations,sampler,trials}.test.ts`, generated contract/boundary checks, seeded evaluation and browser play/review. Accepted design and research: [approach comparison](../proposals/2026-09-29-game-reasoning-options.md).

**Changelog entry:** Owner selected typed reasoning packs; implementation adds auditable per-game scenarios and evaluates the six remaining Spades families. Evidence and promotion status are recorded in a separate implementation report.
