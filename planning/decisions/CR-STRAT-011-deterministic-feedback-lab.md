# CR-STRAT-011 — Deterministic bots and coach feedback lab

**Date:** 7 October 2026. **Authority:** explicit owner correction in the coach-feedback-lab planning conversation. **Status:** direction accepted; documentation only; implementation and experiments not started by this change.

**8 October implementation authorization:** the owner subsequently requested implementation of the lab and clear testing/running steps. The original paragraph above records the planning decision's historical status. Current implementation and measured evidence are tracked in the [lab ledger](../implementation/coach-lab/progress.md) and [acceptance record](../../qa/evaluation/coach-lab/implementation.md). This authorization preserves deterministic bots, the USD 0 paid-review default and the separate evidence gates; it does not authorize automatic strategy promotion or model training.

**11 October scoped exception:** [CR-STRAT-012](CR-STRAT-012-offline-trix-scenario-collection.md) authorizes four logical Luna Max players in a separate offline Trix discovery collector. The production bot/coach restriction and promotion gates below continue to apply. The collector preserves external-player provenance and does not register a model as a production bot policy.

## Decision and reason

Bots always use a deterministic decision system implemented in code. No AI/learned decision model, runtime model call or model fallback may choose bot actions. The current coach uses the same deterministic analysis and selected action. The immediate objective is to find and repair gaps in this shared system, including partnership inference, probability-based planning and solo play, through a browser-free feedback lab.

Deterministic arithmetic, exact constraint propagation, explicit behavioral likelihood tables and bounded reproducible search are compatible with this direction. A mathematical belief distribution is not permission to install a trained classifier or neural policy. Any numerical table/parameter revision is an inspectable, versioned candidate subject to the same evidence gates as a rule; no automatic learning or mutation occurs during play. Fixed sampling/search inputs derive only from permitted observation and policy versions, never the actual deal seed or hidden state.

Offline LLM agents may critique actor-safe decisions, explain separate retrospective consequences and propose investigations. They cannot act for a seat, declare game facts, create independent human labels, edit policy defaults automatically or serve as their own validation authority.

Runtime strategic-model selection, fine-tuning, training, inference deployment and routing are outside this lab plan. Choosing/pinning an offline LLM reviewer is operational evaluation work, not runtime model selection. If explored in a future separately defined project, model assistance is for the human coach only and must demonstrate incremental benefit over the then-current deterministic system. It can never become a bot controller. Remove TypeSafe/Jev exploration from the active lab deliverables; no replacement model is selected here.

## Supersession and compatibility

This owner decision supersedes earlier Jev-only/runtime-model directions in AGENTS.md and older README, architecture, integration and strategy plans wherever they conflict with the above boundary. The active [lab design](../../docs/superpowers/specs/2026-10-07-coach-feedback-lab-design.md) and [lab plan](../../docs/superpowers/plans/2026-10-07-coach-feedback-lab.md) implement the new planning direction. Historical provider code, rejected experiments, saved advice, source archives and accepted evidence retain their original identity; this document does not remove code, migrate sessions or claim existing runtime paths have already been audited for compliance.

The multi-game plan remains the source for game implementation dependencies. Tarneeb Partners and Trix receive explicit lab adapter work after their respective rule and native-engine correctness gates. **7 October Trix clarification:** [CR-GAME-001](CR-GAME-001-trix-four-variants.md) resolves TRX-D01/D02 for the four-variant Trix plan; native correctness is still pending. Current implemented variants are evaluated separately. This deterministic-lab decision does not itself change scoring or hidden-information boundaries.

The existing CR-STRAT-009 strength/promotion gate remains applicable. The proposed full-match evaluation does not silently replace it. Human comprehension and unaided learning still require separate evidence.

## Owner addition, 8 October: tactical recommendation then one reason

The coach is for players who already know the rules. New coaching output must present the recommended action directly, with a concise supported tactical purpose. One Why activation/request reveals the complete material reason based on relevant own cards, public play/history, current/previous tricks, bids and score. Include only context that matters to the decision. Follow-suit reminders or unexplained lowest-card choices do not satisfy this coaching requirement; game legality remains ordinary game feedback.

Generate and retain both layers from the same frozen deterministic decision. Why reveals saved content rather than rerunning the policy or consulting a runtime model. Preserve uncertain premises, reasonable alternatives and forced/no-clear-preference cases without invented superiority. This supersedes the active three-stage Notice/Consider/Suggestion presentation for new advice. Introduce versioned projections/envelopes; keep historical advice bytes and exposure meanings unchanged.

The lab must collect both layers even if no player opens Why, audit facts/action identity, review the cue independently before its reason, classify contextual/strategic explanation gaps and test repairs separately from playing strength. Focused UI checks establish one-step disclosure; bulk game simulation and review remain headless. Clicks or reading time do not prove learning. The [design section 4.2](../../docs/superpowers/specs/2026-10-07-coach-feedback-lab-design.md#42-action-first-coaching-with-one-step-reasons) and plan Tasks 02A/17 plus the audit/review/report tasks specify implementation. This addition authorizes the requested planning updates, not a runtime build or experiment.

## Alternatives considered

- Use a model as the bot or full-time coach: rejected by the owner.
- Keep Jev/model comparison as an active lab milestone: removed at the owner's request.
- Rely only on final wins or LLM verdicts: insufficient for finding which inference, action or explanation needs repair.
- Selected: exact evidence, conditional probabilities, counterexamples, independent review and frozen complete-game comparisons leading to small deterministic changes.

## Acceptance implications for future implementation

- Same actor observation, policy version and deterministic work budget must reproduce the same selected action and saved analysis; no network/provider path can be invoked by a bot or current coach selector.
- High-card followers and Nil discards are conditional evidence; only hard card/count/legality constraints remove possible holdings. Public facts and probability estimates remain separate in cues.
- Validate partner help by team objective, Nil/contract/bag context, seat order and overruff risk; do not reward a partner's trick count irrespective of team consequences.
- Add runtime dependency/no-network checks, hidden-world invariance, replay tests, probability calibration, counterexample suites and independent full-game comparisons as specified in the plan.

**Current verification:** this iteration edits planning/instruction documents only. No runtime tests, gameplay, model requests, training or default promotion are represented as completed.

## Owner continuation, 9 October 2026: usable deterministic improvement loop

The earlier verification paragraph describes the design iteration. Subsequent lab and Trix implementations are recorded in `qa/evaluation/coach-lab/implementation.md` and `trix-gap-acceptance.md`. The owner now authorizes checking those closures, connecting remaining feedback, implementing narrow evidence-backed deterministic candidates and running bounded paired full-session development/validation experiments.

Bots and coach use the same strategic action algorithm. Bots do not need explanation text; the coach can expose the saved facts, calculations and conditional interpretations supporting that action. A possible future LLM is a plain-English renderer of that evidence, not a game selector. Model integration and the product UI remain outside this continuation.

Game history and public announcements inform exact deductions and conditional beliefs. A doubling declaration or voluntary-looking action does not prove a hidden holding, competence or a unique plan. Forced actions provide no evidence of preference. Unknown alternatives, mistakes and competing sensible plans remain possible. More public information narrows constraints, but does not guarantee certainty about the best action.

Requirements for this continuation: CFL-01 distinct human/model/numerical feedback and pending coverage; CFL-02 a separately versioned deterministic candidate with saved action/evidence parity and counterexamples; CFL-03 frozen paired session comparison with family-level accounting and fresh validation isolation; CFL-04 retained partnership case definitions and uncertainty boundaries. No new default promotion or fabricated independent labels are authorized by these implementation requirements. See `planning/implementation/coach-lab/trix-feedback-loop.md`.

## Owner continuation, 9 October: Jacks history and first case investigation

The owner approved the next two steps: CFL-05 versioned public chronological Jacks history with provable-choice evidence, and CFL-06 reproduction and bounded investigation of the saved J♦/10♠ comparison. This authorizes native capture, shared deterministic evidence, lab export/replay integration and the named experiment. It does not authorize a model, UI work, speculative strategy weights or default promotion. New module/public schema versions preserve existing scoring/legality rule IDs and historical pins. See [the implementation scope](../implementation/coach-lab/trix-layout-history.md).

## Owner continuation, 9 October: first Jacks frontier candidate

The owner's subsequent “start” authorizes CFL-07: implement and test one separately versioned own-card bottleneck correction, retain its saved action/explanation evidence, and compare it against frozen history policy in predeclared development and fresh-validation sessions. `trix-frontier-1.0.0` removes existing distant-card credit across missing ranks in unforced Partners Jacks choices; its team benefit remains a hypothesis. This does not promote a default, add a model or change rules. See [the precise rule](../implementation/coach-lab/trix-frontier-rule.md) and [fixed study protocol](../implementation/coach-lab/trix-frontier-study.md).

## Owner clarification, 9 October: suit timing and the scoring objective

The next investigation must assess opening/delaying suits against combined team finishing points in Partners and the individual outcome in Solo. Include partners holding several/all/no twos, releasing their lower paths, and delaying high cards that may block opponents' aces. Public chronology supports facts and conditional suit-priority interpretations; concealed hands and intention remain unknown. “Best distributed” means the best combined team score, with each seat's outcome retained, not a new equal-sharing objective or scoring rule. The [case and investigation record](../implementation/coach-lab/trix-jacks-team-tempo.md) documents exact information gaps, counterexamples and the next ordered work. This entry records requirements; it introduces no implemented candidate, calibrated probability, live promotion or additional completed experiment.

## Owner continuation, 9 October: exact twos information first

The owner's “lets do the next step” initiates CFL-08: implement the exact public twos ownership prerequisite as the separately selected `trix-ownership-1.0.0` lab candidate, inheriting history policy and preserving earlier candidate behavior. Propagate only actor-safe deductions into existing immediate opening terms; retain supported uncertainty, original/remaining ownership and shared bot/coach evidence. Verify the implementation and headless archive path before undertaking longer-term suit-timing comparisons. See [the bounded implementation scope](../implementation/coach-lab/trix-ownership.md). This does not alter scoring, add behavioral weights/models, promote a live default or establish stronger play.

## Owner continuation, 9 October: compare complete Jacks endings

The owner's “lets start the next steps now” initiates CFL-09: enumerate feasible small-ending allocations from current public chronology, compare every legal opening/delay through native finishes under declared actor-only continuation policies, and retain per-seat/team outcomes and opening/placement timing. Build fixed reachable cases and counterexamples before selecting another narrow deterministic rule. This authorizes the bounded diagnostic pipeline and case run; it adds no runtime model, speculative weight, changed scoring rule or live promotion. See [the comparison scope](../implementation/coach-lab/trix-jacks-endings.md).

## Owner continuation, 9 October: validate Ownership in complete sessions

The subsequent owner approval after CFL-09 authorizes CFL-10: compare the unchanged Ownership candidate against frozen History in predeclared complete Partners sessions, retaining separate Ownership activation, team-point outcomes, adverse cases and fresh validation. This is an evidence-gathering stage; it does not promote a runtime default or tune policy from validation results. See [the fixed Ownership protocol](../implementation/coach-lab/trix-ownership-study.md).

## Owner continuation, 10 October: partner-release timing and comparative advice

The owner's next approval initiates CFL-11. Investigate the adverse release case against the consumed neutral position and protected successful endings using actor-only common feasible worlds, native team finish points and separate availability/placement timing. Add a bounded offline diagnostic for larger remaining hands; preserve the exhaustive small-ending evaluator. Correct the zero-own-opening explanation with an opt-in version that inherits Ownership's actions and values exactly. Do not invent a timing threshold, promote a policy or rerun a large strength campaign without a justified action-changing candidate. See [the protocol and fixed cases](../implementation/coach-lab/trix-release-timing.md).

## Owner direction, 10 October: authored King of Hearts patterns

CFL-12 implements the owner's scenario-based dataset approach, beginning with South holding K♥ and five other hearts in Basic/Complex Solo, followed by Partners. Fix eight complete distributions and ten legal witness prefixes, including concealed-ace twins, short-suit escapes, a public partner-return opportunity and a reachable forced-heart trap. Compare two unchanged deterministic profiles under natural declarations and controlled double/decline arms; retain actor-only suggestions separately from imposed actions and full request scores separately from the king component. These selected examples support narrow rule development, not a universal doubling rule, calibrated probability or runtime promotion. See [scope and limits](../implementation/coach-lab/trix-king-scenarios.md) and [results and running instructions](../../qa/evaluation/coach-lab/trix-king-scenarios.md).

## Owner continuation, 10 October: compare the partner return from North's information

CFL-13 follows the owner's “now the next step”: compare every legal lead at the saved Basic/Complex Partners position across common feasible allocations and four fixed actor-only continuation environments. Separate North's knowledge from South's response, full team points from king-only relief, and the historical Baseline choice from each profile's current choice. Freeze this bounded diagnostic before inspecting results. Develop an action-changing rule only if supported; retain reversals and coordination gaps without forced promotion. [Protocol](../implementation/coach-lab/trix-king-return.md).

## Owner continuation, 10 October: isolate South's discard and identify the inference gap

CFL-14 follows “ok lets do that step”: compare South's eleven legal discards from South's own observation after the partner return, and execute the observation-identical adverse twin before considering a coordinated rule. Preserve common-world full-team comparisons, Basic/Complex separation and frozen source receipts. North's private deduction is never a fact for South. See [protocol](../implementation/coach-lab/trix-king-discard.md) and [results](../../qa/evaluation/coach-lab/trix-king-discard.md).

The owner clarified that the intended coach must use inferred hints from partner/opponent choices, beyond hard constraints derived from previous tricks. Current conditional history signals do not yet weight action scores or sampled allocations. This milestone explicitly retains that facts-only allocation reference; the next experiment must test versioned deterministic behavioral inference, voluntary-versus-forced alternatives, competing intentions, positive support for mistakes, and full-team benefit against the reference. No untested likelihood table or runtime model is introduced implicitly.
