# Observed Spades Cases Implementation Plan

**Goal:** implement reviewable bot/coach cases and collect an auditable browser baseline against programmed bots.
**Architecture:** add one selectable Spades policy and cue pack, retaining the existing seat-safe facts and plan interfaces. Pin game policy and persist private committed bot analyses. Evaluate through real browser controls.
**Stack:** existing TypeScript, Node, PostgreSQL, React and Playwright; offline Codex Luna research agents.
**Spec:** [CR-STRAT-010](../../../planning/decisions/CR-STRAT-010-observed-cases-and-browser-baseline.md).
**Execution:** owner requested plan followed by implementation. Coordinator integrates; independent agents own case rules and persistence. No additional approval stage.

## Constraints and review focus

- Wait for selected-deal work to pass checks and merge before runtime edits or browser runs.
- Keep frozen sources, default policy, scoring, hidden-information rules and Jev-off boundary intact.
- Never turn agent agreement, one outcome or a high card into a probability or exact owner claim.
- Counterexamples must remove certainty; a changed selected action must invalidate its old cue.
- Resuming a searched game under an inline server default must still compute outside transactions.
- Duplicate/stale bot commands must never duplicate or attach analysis to another action.
- Source samples are development cases; browser games are a distinct dataset, not human evaluation.

## 1. Dependency and source ledger

- [x] Verify selected-deal commit is on `main`, working tree is clean and its build/test report names real results. `21cf9df`, 310 server/engine tests, 33 UI tests and four rebuilt selected-deal journeys.
- [x] Preserve all original archives; replay all 706 accepted source decisions and verify legal prefixes and seat packets. `node qa/experiments/2026-10-02-browser-baseline/prepare.mjs` passed.
- [x] Add a concise source-to-case ledger covering admitted, already-covered and deferred cases. Source archive hashes saved; reachable case fixtures are part of Task 3.

Files: `qa/experiments/2026-10-02-browser-baseline/`, new case fixtures/tests under `web/server/tests/`; original experiment folders are read-only.

## 2. Policy pin and original bot evidence

Files: `web/server/http/game-service.ts`, `web/server/records/types.ts`, `web/server/tests/policy-pinning.test.ts`.

- [x] Add a private resolved policy pin to new documents; all human/bot analysis and inline/search decisions read it.
- [x] Define a versioned prepared-job envelope carrying action, policy, observation and original analysis. Retain a reader for old action-only jobs.
- [x] At advance, verify original revision/seat/policy/action and append the audit atomically with the move; leave human analysis storage semantics intact.
- [x] Test restart under another default, searched-profile restart, original advice equality, legacy attribution, duplicate/stale/rejected commits and private-view exclusion. Also fixed source-advice lookup and delayed Hearts pass retries found during review.
- [x] Complete one API test hand per mode: exactly 42 bot audit entries, 14 human analyses, 56 accepted actions, 13 tricks. These are deterministic integration tests, not browser evaluation games.

Commands: `node --env-file=.env.local --test --test-isolation=none web/server/tests/policy-pinning.test.ts web/server/tests/analysis-outside-transaction.test.ts web/server/tests/spades-policy-integration.test.ts`.

## 3. Shared case rules and honest cues

Files: new `web/server/games/spades/cases/` module, `web/server/strategy/registry.ts`, `web/server/coaching/cue-registry.ts`, Spades claim vocabulary/checkers, new case-policy and case-coaching tests.

- [x] Write reachable positive/counterexample tests before the behavior changes; retain the current failure for each actual gap.
- [x] Implement CASE-01–04 as typed, pure observation predicates and a versioned inline profile. Existing bidding stays unchanged.
- [x] Carry matched case/reason IDs and per-candidate effects in the analysis trace. Mark the partner-resource preference heuristic.
- [x] Implement a distinct cue pack with selected-action predicates. CASE-02/03 suppress unsupported future-control plans; proven equivalent plays receive `several-reasonable` without naming one card. Forced remains forced.
- [x] Add independent public-fact checks; test suit/seat rotations, compatible concealed-hand changes, missing history, Nil, fulfilled contract, outside trump and absent re-entry.
- [x] Run source-ledger replay, frozen baseline goldens, strategy/coaching regressions and typecheck. Final `npm run test:all`: 348 passed, zero failed/skipped; focused case suite: 23 passed.

The case API consumes only `SeatObservation`; returns `DecisionAnalysisV11`; its cue pack returns existing `Advice`. No raw game state enters runtime case predicates.

## 4. Build and browser experiment

Files: `qa/experiments/2026-10-02-browser-baseline/{manifest.json,dev-deals.json,run-browser.mjs,results.md}`, player/observer templates and raw records.

- [x] Freeze six opening fixtures and 12 paired run IDs before play; separate model/transport provenance from runtime policy provenance. `manifest.json` and `dev-deals.json` were frozen before the first browser hand.
- [x] Build with both registered policies. Start two loopback servers using the existing database and `.env.local`, explicit old/candidate `SPADES_POLICY`, and the same selected-deal catalog. Ports 4191/4192; source/build/input hashes saved. No `db:up` or secret output.
- [x] Use browser DOM and network inspection; no screenshots. Player actions must click the real bid/card controls. All other seats are normal server bots.
- [x] Run Luna player and independent Luna observer with isolated inputs. Save every accepted response, invalid/failed attempt and actual browser commit. No substitute action if an agent call fails.
- [x] Save complete original bot/human analysis privately after each hand. Verify authoritative replay agrees with browser actions, final scores, scenario and policy pin.
- [x] Report three paired outcomes per mode, case coverage and factual cue checks. Mark missed case families and every partial/aborted game.
- [x] Keep Jev calls at zero. Archive safe decision packets for its later comparison; retain separate private replay material.

## 5. Delivery

- [x] Run relevant unit/integration checks, build, contract/source-boundary checks and `git diff --check`.
- [x] Update concise results, change records, changelog and the existing visual review site.
- [x] Commit only this task's changes, merge to `main` if a task branch was used, and verify clean status.
- [x] Report actual implementation, exact checks, browser counts, limitations, commit and next unfinished evaluation gate. Do not promote the default on this small sample.

Acceptance: [implementation and browser report](../../../qa/implementation/OBSERVED-SPADES-CASES-REPORT.md). All 12 measured hands are verified; 14 total sessions, 672 decisions, 45 accepted observer reviews and three recorded timeouts. Candidate remains opt-in.
