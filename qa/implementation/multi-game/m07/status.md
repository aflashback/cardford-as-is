# M07 maintained cases and research provenance

**Status:** offline MG-10 / MG-11 maintenance gate passed; integrated milestone partial pending the concurrent M06 runtime gate and later game/runtime adapters. **Source revision:** `b822d0db8948ff99b8092762f7f0e056b32f2b1e` plus the current shared working tree. No commit created by this packet. Native Windows Node `v24.19.0`; no database, provider or benchmark invocation.

Implemented typed CASE-01–04 catalog around the retained TypeScript predicates/profile/cues and independent checker; deterministic generated `docs/generated/game-cases.md`; pure offline conflict resolution with named prerequisites, legal-set validation, alternatives, versioned objective rules and selected-action claim filtering. Existing runtime registries, service, engine, frozen policies and source archives are unchanged by this packet. The Go experimental `spades-partner-resource-5.0.0` adapter is owned by the runtime packet and explicitly distinct from the retained TS 4.0 profile/tactics 2.1 baseline.

Imported exactly **706 text + 672 browser decisions** from original files, retaining actual byte hashes, original packet hashes and source pointers. The inventory records **14 text episodes (11 complete, 3 partial) + 2 unstarted**, and **12 measured browser hands + 2 unused starts**. Browser committed actions match the private audit sequence. Explicit source ancestry groups matched modes/arms, rotations, related stress counterworlds and duplicate actor packets; no family assignment comes from filename guessing. All splits remain discovery/regression and all decisions unreviewed. Partial episodes are excluded from completed outcomes; complete hands are not full-match strategy evidence.

The derived label index preserves the original **32 blank entries as pending**, not reviewed unknown or new independent samples. The original label validator checks packet/legal-set integrity. Content-addressed snapshot IDs, label hashes, original source hashes and pointers prevent silent identity reuse; qualification/independence, objective/horizon, human acceptance and confirmation remain unestablished. Existing reviewer copies and pilot artifacts remain untouched. **336 browser choices without typed cue claims** and **CASE-03 zero browser occurrence** stay visible.

## Actual verification

Initial `node --test --test-isolation=none web/server/tests/research-ledger.test.ts web/server/tests/case-catalog.test.ts` failed with two missing-module errors before implementation. A later strict schema test exposed a missing array type on `maxItems`; corrected before the final run. The first server typecheck also found a new completeness narrowing error, corrected; a concurrent M06 union error was reported to its owner and was absent from the final check.

Final commands and actual results:

```powershell
node web/scripts/build-research-ledger.ts
node web/scripts/render-case-catalog.ts
node --test --test-isolation=none web/server/tests/research-ledger.test.ts web/server/tests/case-catalog.test.ts web/server/tests/case-counterexamples.test.ts web/server/tests/spades-observed-cases.test.ts web/server/tests/reasoning-catalog.test.ts
node web/scripts/build-research-ledger.ts --check
node web/scripts/render-case-catalog.ts --check
node web/node_modules/typescript/bin/tsc -p web/tsconfig.server.json
git diff --check
```

**Passed:** 37/37 focused tests, zero skipped/failed (2.622 seconds); both generators and `--check`; strict ledger/label schema validation of every generated row; actual source hashes; reachable positive/opposite/seat-rotated cases; selected-action reason removal; named objective reversal; retained Spades tests; server typecheck; tracked working-tree whitespace check. The tool invocation containing final generation/tests/checks/typecheck finished in about 15 seconds including patch application; no test run approached the owner’s 30-minute ceiling. `git diff --check` does not validate untracked files; deterministic checks and tests cover the newly added artifacts.

**Not run / not claimed:** full suite, live Jev/Stripe, database/browser sessions, Go generic-runtime acceptance, strategy pilot, human review, statistical independence, strategy/learning promotion. Future Nil/bidding/score-pressure and new-game families remain absent until independently authored and checked; the catalog does not enable the 66 historical recipes. M10/runtime consumers can reuse the pure module through typed adapters after their own parity/information gates. No confirming manifest or automatic pilot resume was created.

Evidence: `qa/research/multi-game/source-hashes.json`, `families.json`, `episodes.json`, `decision-ledger.jsonl`; `qa/evaluation/multi-game/labels.schema.json` and `labels.jsonl`; `docs/generated/game-cases.md`; the three new focused test files.
