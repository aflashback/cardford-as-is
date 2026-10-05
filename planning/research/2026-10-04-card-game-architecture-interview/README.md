# Card-game architecture interview

4 October 2026 · inspected source `09b4903` on `main` · **prerequisites for a later implementation plan**.

**Implementation handoff:** the subsequent [M00–M12 plan](../../../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md) now turns this research into contracts, owned tasks and future acceptance gates. The interview and its original verification retain their historical status.

## Conclusion

Keep the ownership, persistence, information protection and original-decision records. Connect real game modules through the production service, then replace the coupled state, action and presentation boundaries. Preserve shared search budgets and evidence arithmetic; reassess the planner API before supporting decisions spanning several rounds. A whole-app rewrite is not justified by the evidence collected.

Strong play is still unproven. We have **706 text-agent decisions** and **672 replayed browser decisions**, useful for finding situations and factual failures. They are not independent strategy labels or proof that the coach improves human play.

## Actual interview

Two agents inspected source and exchanged their six questions directly:

- Architecture interviewer: **GPT-6 Astra, extra-high**.
- Reasoning interviewer: **GPT-6.1 Sol, extra-high**.

The reasoning interviewer challenged retaining the whole round-based planner for Trix. The architect accepted and narrowed its recommendation. Their initial positions, answers and closing revision remain separate from the coordinator's synthesis.

| Read | Purpose |
|---|---|
| [01 — Architecture position](01-architecture-position.md) | Current production boundaries and six questions |
| [02 — Reasoning position](02-reasoning-position.md) | Implemented algorithms, evidence and six counterquestions |
| [03 — Architecture answers](03-architecture-answers.md) | Responses, failure examples and revised conclusion |
| [04 — Reasoning answers](04-reasoning-answers.md) | Responses and actual challenge/acceptance |
| [05 — Evidence and variants](05-evidence-and-variant-research.md) | Implemented versus collected; researched Tarneeb/Trix differences |
| [06 — Architecture and algorithms](06-architecture-and-algorithm-decisions.md) | Recommended boundaries, alternatives and search choices |
| [07 — Implementation prerequisites](07-implementation-prerequisites.md) | Required plan inputs, proof cases, dependencies and unresolved decisions |
| [08 — Standard-rule reconciliation](08-standard-rule-reconciliation.md) | Owner's selected Jawaker Trix rules, Tarneeb source reconciliation and strategy counterexamples |
| [Verification](verification.json) | Exact checks and limits from this investigation |

Documents 05–08 are research and plan inputs, not a task-by-task implementation plan. The owner selected **Jawaker as the Trix rule authority**, including its Jack-centered layout; this supersedes the earlier source comparison and unresolved-profile notes preserved in interview documents 01–04. Waraq remains the preferred Tarneeb reference, standard play only; Syrian/Egyptian Tarneeb editions are excluded. Tarneeb Solo's meaning and other narrowly listed rules gaps remain in 08. The packet preserves [the existing platform contract](../../../docs/12-multi-game-extensibility.md). No game code, dependencies, provider activation or defaults changed.
