# Multi-game implementation plan review

4 October 2026 · documentation work only.

## Scope and source

- Main plan: [M00–M12](../../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md); four [implementation packets](../../planning/implementation/multi-game/contracts.md).
- Initial source `c5980b9` on main plus existing owner-selection edits for Jawaker Trix. Concurrent `7aee013` added the Spades evaluation pack; inspected and incorporated as reusable input. Active pilot files were left to that work.
- Read production engine/service/storage, active schemas/generator, policy pins, current case/provider/gate code, token fixture, source archives and required specifications. No whole-app rewrite or new infrastructure planned.

## Independent review and corrections

Architecture reviewer: GPT-6 Astra, extra-high. Reasoning reviewer: GPT-6.1 Sol, extra-high. Both inspected source and the draft; their work was read-only.

| Concern found | Plan correction |
|---|---|
| Production service bypasses the generic seam | Real service/storage/replay/UI migration and token conformance gate |
| Persisted typed SQL rows are not runtime validation | Unknown JSON decoded against private versioned codecs on load/save |
| Atomic Hearts pass / 286 legal choices | Frozen sealed bundle; no choice truncation for Jev's 255-option limit |
| Candidate IDs / initial registration / asynchronous advice | Explicit adapter IDs, new-session factory and async frozen-input preparation |
| Future actors, sealed choices and multi-round horizons | Own-input projection, atomic sealed commit, explicit round continuation |
| Incomplete weighted sampling / drifting labels | Typed provenance, coverage, cutoff results, immutable labels/corpus hashes |
| Queen fixture assumes an opening actor | Explicit profile prerequisite or reachable legal prefix |
| Concurrent Spades review/pilot added | Reuse adapters and immutable references; no duplicate editable labels or confirmation claim |

## Checks performed

Planned implementation test commands remain unchecked tasks.

| Actual command/check | Result |
|---|---|
| `git diff --check` | Passed, exit 0 |
| Ad hoc here-string piped to `node --input-type=module` | Passed, exit 0; 18 documents, 167 local links, zero missing targets |
| Existing Modify-path inventory, same Node check | 25 paths exist; zero missing |
| Fixture inventory, same Node check | 52 unique standard cards; 13 per seat |
| Requirement/task inventory, same Node check | 14 proposed MG requirements; M00–M12 all present |

The first documentation-validator run exited 1 because the report had not been created and its parser treated `:line` file-link suffixes as part of paths. After creating this report and fixing suffix handling, the final run above passed. This was not a product defect or gameplay test. Fixture validation is structural, not engine play or strategic proof. External sources were already researched in the interview; this pass checked local links, not remote-site availability.

**Not run in this planning pass:** application tests/typecheck/build, database acceptance, browser play, simulations, human evaluations or provider calls. Provider activation/defaults unchanged; live Jev requests 0, observed model none. Other work's reported tests/pilot are separate evidence.

## Execution handoff

Start M00 baseline/decision dossier, then M01 contract freeze. Current Hearts/Spades rules, original advice and default policy pins are preserved. Pending Tarneeb Solo meaning and lead/scoring choices gate its branch; selected Jawaker Trix layout/doubles remain part of the target. Human labels, fresh confirmation and learning results remain unproven.
