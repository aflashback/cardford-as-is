# Future coding-agent work packet — add one game

Execute only after the owner names/approves the next game and exact rule variant. Read `AGENTS.md` and document 12. Research the primary rule references and decide any ambiguous variants explicitly; do not infer rules from Spades or from the model. Identify competition mode, deck, action phases, visibility, objective, scoring and terminal/tie rules.

Inventory required capabilities. Separate already implemented handlers from new work such as simultaneous sealed passing, multi-card choices or draw/discard. Write a small ADR and tests for each new kernel capability. Do not fake support using flags or publish incomplete games in the catalog.

Add one trusted `games/<game-id>` module: manifest, typed schemas, pure reducer/legal moves/scoring, actor projection, deterministic facts, game-specific Jev rubric, original coaching/templates/drills and minimal UI adapters. Use the existing session/job/provider/review system, not a fork. Enforce the 255-candidate provider ceiling and define an approved alternative when needed.

Run module conformance, visibility-invariance, replay, score/terminal, individual/team and phone/accessibility tests. Create game-specific strategy evaluation with independent accepted choices; record uncertainty rather than inheriting the Spades model confidence or pass results. Preserve old sessions and add catalog/migration/version tests. Finish with actual tests, evidence, run instructions and explicitly unimplemented capabilities.
