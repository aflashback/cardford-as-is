# Research findings and design implications

**Research date:** 26 September 2026. Evidence labels: **Documented** means observed in an identified primary source; **Decision** means selected for this project; **Unproven** means an experiment is required. Source IDs resolve in [02-sources.md](02-sources.md).

## 1. Jev is an interface fit, not yet a proven Spades expert

**Documented.** TypeSafe's HTTP interface accepts `model`, `state`, and named `questions`. A Choice question uses `type`, `instructions` and a `criteria` map. Its response has a selected option, option probabilities and confidence. The direct route is `POST /v1/systemone`. [R01, R03]

**Decision.** Use Choice over the server's exact legal bids or cards. Keep one model decision per non-forced turn; avoid a generative planner and avoid asking the model to produce an explanation.

**Unproven.** The inspected sources do not establish Jev's Spades bidding strength, partnership strategy or coaching quality. Targeted searches for Jev + Spades/card games did not locate a reproducible Spades-specific evaluation. This is a research gap, not evidence that the approach will fail. G0 and G4 address it.

## 2. Numeric and structural weaknesses matter especially here

**Documented.** The model's published limitations warn about counting, arithmetic, numeric representations, indirection, irrelevant context and assumed consistency across questions. The page also acknowledges adversarial steering. [R05]

**Decision.** Supply named cards and code-computed facts: suit counts, remaining unseen ranks, void evidence, current trick leader, contract progress and scoring consequences. Never ask Jev to count a hand, resolve a trick, total a bid, infer a guaranteed probability identity, or calculate a score. A legal-output contract still requires defensive validation.

**Unproven.** Feature engineering may improve strategic selection, but that improvement needs an ablation: raw compact observation versus observation plus deterministic features. Sending more text is not automatically better.

## 3. Keep the integration pinned and small

**Documented.** The checked model page lists `jev-1.13.0`, moving aliases, input-token pricing, context limits and adjustable rate limits. It describes request-based customization rather than customer fine-tuning. [R02]

**Decision.** Pin the documented version initially. Recheck availability at kickoff and record the actual returned model. Use direct HTTP from the backend, not a gateway or orchestration library. Prompt/feature changes are evaluated like code changes. No assumed local weights or fine-tuning project is included.

## 4. Confidence is not game value

**Documented.** Confidence summarizes the returned probability distribution; the vendor recommends task-specific threshold evaluation. [R04]

**Decision.** Store raw probabilities for diagnostics. Present “Jev suggests” and uncertainty, not “82% chance to win.” A probability gap is not expected score loss, a centipawn equivalent or proof of a mistake. A narrow distribution can still select a poor move. Acceptable alternatives must be evaluated independently.

## 5. Spades is not chess with a different board

**Documented.** The card-rule sources describe partnership bidding and hidden hands. Imperfect-information research distinguishes a player's information set from the full game state and documents problems with treating sampled hidden states as fully known. [R06, R07, R10, R11]

**Decision.** Use seat-local views, separate coach and bot contexts, observation-scoped caches, pre-action advice, no shared private team scratchpad, and no retrospective use of actual opponent holdings when judging a historical decision. “Reveal cards” is an explicitly separate end-of-hand teaching view.

**Future option, not V1.** Information-set simulation may support an independent reference evaluator. It is not necessary to make the first app playable, and neither a sampled rollout nor a double-dummy solver should be described as a fair-information oracle.

## 6. Borrow the learning loop, not unsupported evaluation claims

**Documented.** Chess.com's Play Coach and Game Review describe guided feedback, hints, reviewing positions and retrying choices. Their chess experience also includes engine-based evaluation features. [R08, R09]

**Decision.** Build progressive hints, a short review and retry branches. Do not transplant its rating/accuracy vocabulary without an independently validated Spades evaluator. V1 measures authored-drill performance and learning activity, not supposed strategic accuracy inferred from Jev agreement.

## 7. Fix one rule profile before implementation

**Documented.** Rule sources differ: Bicycle's introductory page and Pagat's partnership account are not identical, and commercial Spades engines expose variant settings. [R06, R07, R20]

**Decision.** The application's rule profile is authoritative. `docs/02-rules.md` explicitly resolves Nil accounting, bag points, ties, first-trick behavior and permitted bids. No rule is inferred from a source name or a developer's memory. The failed-Nil bag-point convention is an explicit product choice, not a claim that all tables score it that way.

## 8. Use a low-complexity web stack

**Documented.** The checked React version page reports 19.3; Node lists 24 as LTS; TypeScript publishes a 6.0 release page. Official framework/test docs support the selected tool categories. SQLite documents its suitability for local application storage and the limits relevant to concurrent/server deployments. [R12–R19]

**Decision.** A single-process TypeScript backend and React frontend share contracts and deterministic utilities. SQLite and durable in-process work are enough for the private prototype. This is a simplicity choice, not a claim of unlimited scale. Multi-instance hosting requires a subsequent database/job coordination ADR.

## 9. What this research did not establish

No live TypeSafe account, API key, quota or paid call was used. No game was built or benchmarked. No expert strategic labels or human learning study have yet been collected. Exact dependency patches and provider retention commitments must be verified during the build/release process.

A search also surfaced an anecdotal poker-related Jev claim in a social aggregator; its underlying test and reproducible primary evidence could not be established. It is not used as a benchmark, a conclusion about Spades, or a reason to reject Jev. The documented numeric limitations already justify the deterministic safeguards.

## Research-to-work mapping

| Finding | Required implementation consequence | Verification |
|---|---|---|
| Typed bounded choice | Legal `criteria` map and adapter validator | G0, T-JEV-01–08 |
| Arithmetic weaknesses | Engine-derived facts and candidate annotations | T-ENG, ablation E2 |
| Hidden information | Per-seat allowlisted observation and cache | T-FAIR-01–08 |
| Confidence limitations | Honest UI and independent labels | T-COACH, evaluation E3 |
| Coaching experience | Hints, feedback, review, retry, drills | FR-03–08, end-to-end tests |
| Many rule variants | Frozen profile and scoring goldens | T-RULE, T-SCORE |

## Owner requirements incorporated after initial research

The multi-game module boundary, four-individual/two-pair competition and minimal icons/cards interface come from the owner's explicit request, not an external benchmark. They are normative design requirements in document 12. The provider's documented 255-option Choice ceiling (R01) creates a concrete extension constraint for combinatorial multi-card actions.
