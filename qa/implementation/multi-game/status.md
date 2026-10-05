# M00–M01 and targeted partnership execution

Scope: the owner's 5 October 2026 build instruction. Source start: `d66a046240a309fe25b6b79da52594d8ead2b5f0`. Working branch: `codex/partner-cases-m00-m01`. Human strategy/cue reviews and learning studies remain deferred.

Focused commits: M00 baseline/rule dossiers `e9abf34`; M01 module contracts `8abda9d`. The partnership code, frozen fresh archive and completed execution records are committed together after those milestones. Verification ran on the uncommitted integrated source; `review.json` identifies its final runtime-source hash and `final.json` retains that checkout's exact inventory.

| Unit | Status | Evidence / remaining work |
|---|---|---|
| M00 current-app baseline | Passed | Unchanged starting-commit checkout: 371/371 tests, contracts, typecheck and build; `baseline.json` |
| M00 decision dossier | Recorded; new-game rules partial | CR-ARCH-001; official-source rule dossiers retain unresolved Tarneeb/Trix transition gates |
| M01 typed contracts/codecs | Passed conformance | Additive V2 foundation; 28/28 module/document tests after independent review repairs. V1 production remains active until M02–M04 |
| Partnership family | Passed targeted correctness | Ten reachable useful/unsafe/unnecessary and exception cases; selectable `spades-partner-resource-4.1.0`; shared bot/coach analysis |
| Fresh development measurement | Completed; observed parity | 64 distinct seeds; 2,890 unforced decisions and 42 secure-partner triggers per reference; zero changed actions |
| Bounded Jev comparison | Not run: change gate unmet | No fresh action difference; zero requests/model/spend. Cap-one harness prepared; old smoke untouched |
| Human review / strategic promotion | Deferred | No acceptable-action labels, strength or learning claims |

## Execution rulings

- Ruling: use the writable primary checkout on a new feature branch for integration. It had no tracked local changes; preserve the existing untracked `.claude/` and other worktrees. A separate detached snapshot under `.local/m00-baseline` verifies the starting commit without concurrent implementation contamination.
- Ruling: initial preflight results are retained separately. They observed unavailable PostgreSQL and new test declarations before implementations. They are not the starting-commit baseline.
- Ruling: the configured database at port 54329 is unavailable and its named container is absent. Start an isolated test-only PostgreSQL container at 54330 from the already installed image, with a distinct `_test` database. Keep `.env.local`, saved-game database settings and saved-game backups unchanged. A private ignored override supplies only `TEST_DATABASE_URL`; no credential is recorded in evidence.
- Ruling: M01 is a contract freeze, not an M02 production migration. Synthetic conformance modules prove the facade and decoder contract; they do not prove current games execute through V2.
- Ruling: source-selected new-game rules and explicit interpretations are separated. Unresolved Tarneeb profile choices and Trix doubling timing/self-capture prevent those new reducers, not the current-game foundation.
- Ruling: preserve the completed fresh archive after review. Three M01 runtime files changed after measurement; partnership policy/harness hashes did not. A future Jev comparison requires a new source manifest and changed fresh decision, not reuse of this archive.

## Delivered contracts and behavior

The kernel exports typed rules/lifecycle, codecs, scoring/objectives, player knowledge, decisions and scenarios. Each registration captures its concrete private state/action types inside a checked facade. Public Hearts/Spades fragments generate closed packets/views/analysis; private V2 documents require exact immutable pins. Duplicate selectors, missing handlers, mixed payloads, concealed extra fields, malformed competitor partitions and invalid saved analysis fail closed. Sealed choices are frozen before one reducer transition; 286 Hearts choices remain complete and exceed the provider's 255-candidate limit explicitly.

Demo/access/coached-unit DTOs and the client platform port are declarations for M03–M04. No V2 module is installed in production yet. Current policies, rules, saved advice and V1 journal operations retain their meaning. The preservation check covers 49 original files and all 61 original V1 schema definitions.

The partnership rule requires public proof of a positive partner's usable trump, a known void, no possible winning opposing ruff, the actor's retained master trump entry, a needed positive contract and no live opposing Nil. It can now offer a safe ruff from more than one side suit. The useful fixture changes `SJ` to `H5`; an unsafe overruff blocks the trigger. A secure partner winner prompts conservation of another winner. Bot and coach use the same selected actor analysis, with optional partner cooperation and future value stated as conditional.

The [partnership report](../../experiments/2026-10-05-partner-resource/README.md) records exact recommendations, cases and fresh results. The 512 paired comparisons share 64 deals and related rotations; they are not 512 independent deals. This sample establishes observed parity, without a strength, equivalence or learning claim. Human labels and learning studies remain deferred.

## Verification and review

- Baseline: contracts/typecheck, 371/371 full tests and build passed on the unchanged start. A missing workspace dependency junction caused the first typecheck failure; its repair and passing rerun are retained in `baseline.json`.
- Initial integrated acceptance: contracts/typecheck, 414/414 tests and build passed, preserved in `pre-review.json`.
- Independent review: two P2 gaps were reproduced, then three new regressions failed before repair. Duplicate selector resolution and saved-analysis invariants now pass shared validation. Independent re-review passed 28/28 module/document tests with no remaining P1/P2 in scope; `review.json` records the findings and source comparison.
- Final acceptance after repairs: contracts/typecheck, 417/417 tests (zero failures/skips) and production build passed; `final.json` records exact commands, versions, hashes and durations.
- Browser source boundary and built-artifact checks passed; all 13 reachable browser modules were checked. No new UI journey or hosted/native/provider campaign was run.
- Jev dry run passed with `not-run-explicit-live-flag-required` and zero requests. Synthetic provider tests validate the harness; they are not model results.

## Required verification

```powershell
# Unchanged starting commit; uses the isolated test database override:
node --env-file=.env.local --env-file=.local/m00-test.env qa/implementation/multi-game/verify.mjs baseline .local/m00-baseline
# Integrated branch:
node --env-file=.env.local --env-file=.local/m00-test.env qa/implementation/multi-game/verify.mjs final
```

The verifier records exact command, exit code, counts, elapsed time, versions and hashes. No previous passing report substitutes for current acceptance. Local fixture identity/billing and synthetic module tests do not prove hosted launch, real payments, native usability, new-game rules or strategy quality.

## Basic first-app checklist for M04

- Correct legal play for Hearts, Spades Solo and Spades Partners with private actor views.
- Durable resume/reload and original advice, unchanged historical policy/rule pins.
- Owner/lease/revision/idempotency/access fences on every command.
- Server-fetched demo frames/choice/replay with disconnected actions unable to advance.
- Configurable exact-variant play/coach/read offers and stable quota usage.
- One React frontend with platform/transport port and reconnect reconciliation.
- Bounded provider/decision work, explicit failure/cutoff, usable keyboard/touch controls.

These are acceptance targets; M00–M01 do not mark them implemented. Next unfinished implementation milestone: M02 current-game module extraction, then M03 persistence and M04 production dispatch/client integration.
