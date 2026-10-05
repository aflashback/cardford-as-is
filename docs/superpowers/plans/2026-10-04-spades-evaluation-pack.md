# Spades Evaluation Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Produce an executable offline evaluation pack, pending blind human labels, and a bounded paired-match pilot.

**Architecture:** Reuse the production Spades reducer, seat projector, versioned policies, development styles and deterministic deal streams. A separate evaluation directory supplies blind packet extraction and a full-match wrapper; runtime strategy and defaults remain unchanged. The pilot is development evidence, not the existing promotion gate.

**Tech Stack:** Strict TypeScript, Node 24 built-in test runner, existing engine and evaluation utilities; no new dependencies or network calls.

**Spec:** [Interview prerequisites PRE-02/03/06](../../../planning/research/2026-10-04-card-game-architecture-interview/07-implementation-prerequisites.md) and [CR-STRAT-009](../../../planning/decisions/CR-STRAT-009-game-plan-and-strength-gate.md). Owner authorized starting on 4 October and selected “Prepare it; reviewers later.” This supplies execution approval; no additional design gate is pending for this bounded milestone.

## Global constraints

- Own cards and permitted public history only in reviewer/policy inputs; no selected action, cue or private deal in blind packets.
- Jev off; no credential reads, provider calls or model-generated labels.
- Frozen reference `spades-tactics-2.1.0`, existing candidate `spades-cases-4.0.0`; change one policy seat per pair.
- Use eight open development match seeds 8,000,001–8,000,008, both modes, all four evaluated seats, two frozen environments. No held-out style/seed consumption.
- At most 100 hands per simulated stream and 20 minutes per invocation; unfinished games are censored, never assigned a winner.
- Source/manifest drift rejects resume. Human quality and learning results remain pending.
- Preserve other uncommitted interview documentation. This milestone commits only its owned files.

## Review focus

1. Identical packets copied across arms must not count as independent cases — task 1 deduplication test.
2. Hidden hands/answers accidentally copied into reviewer inputs — task 1 strict projection and private provenance tests.
3. Wrong-seat or illegal selections must not become valid evidence through fallback — task 2 fail-closed tests.
4. Capped games and interrupted pairs must not fabricate complete matches — task 2 censor/checkpoint tests.
5. Modified source/checkpoint or reserved seeds/styles must reject continuation — tasks 2–3 drift/validation tests.

## Task 1 — Blind review cases: EVALPACK-01

**Files:** `web/server/evaluation/spades-pack/review.ts`, `web/server/tests/spades-review-pack.test.ts`, generated `qa/experiments/2026-10-04-spades-evaluation-pack/review/`.

**Interfaces:** `buildReviewPack()` returns versioned cases, coverage and private source hashes; `projectReviewPacket(SeatObservation)` explicitly allowlists fields; `writeReviewPack(outDir)` writes neutral cases and empty labels, with original choices/provenance in a separate private index.

- [x] Test deduplication, allowed fields, complete public history and exact source provenance before accepting generated artifacts.
- [x] Extract approximately 32 decisions across bidding, live Nil, resources, public deductions and score pressure; mark synthetic starts/coverage holes in the maintainer index.
- [x] Run `node --test --test-isolation=none web/server/tests/spades-review-pack.test.ts`.

## Task 2 — Paired full-match runner: EVALPACK-02/03

**Files:** `web/server/evaluation/spades-pack/pilot.ts`, `web/server/tests/spades-match-pilot.test.ts`.

**Interfaces:** `assertPilotManifest(unknown)` narrows validated input; `pilotSourceHashes()` freezes dependencies; `runPilot(manifest,{outDir,maxWallMs,onProgress})` returns completed paired streams and writes guarded checkpoints.

- [x] Test identical-policy controls, one-seat allocation, seed/style rejection, censorship, illegal-action failure and corrupted/stale checkpoints.
- [x] Use `walkSpadesRound` with seat-scoped policies and production `nextHand`; score and terminate under the frozen profile. Retain deal/action hashes and per-hand metrics.
- [x] Persist a pair only after both bounded arms finish; interruption leaves it pending for unchanged-manifest resume.
- [x] Run `node --test --test-isolation=none web/server/tests/spades-match-pilot.test.ts`.

## Task 3 — Runnable preparation, reporting and pilot: EVALPACK-04

**Files:** `web/server/evaluation/spades-pack/cli.ts`, `web/server/evaluation/spades-pack/report.ts`, `web/server/tests/spades-pilot-report.test.ts`, frozen manifest/checkpoint/results under `qa/experiments/2026-10-04-spades-evaluation-pack/pilot/`.

- [x] Test report grouping by family, censor handling and refusal to infer confirmation size from zero changes/tiny pilot data.
- [x] Implement `node web/server/evaluation/spades-pack/cli.ts prepare`, `run`, `report`, and `audit` with strict command handling and protected preparation.
- [x] Freeze source hashes and manifest before running; report descriptive paired results, observed variance, effective family count and omissions without promotion labels.
- [x] Run focused tests and `npm run typecheck`; execute the bounded pilot, retain interruption state if capped, and audit generated outputs.

## Task 4 — Independent review and learning handoff: EVALPACK-05

**Files:** pack `protocol.md`, `human-review.md`, `human-learning.md`, non-executable `confirmation-template.json`, `README.md`, `CHANGELOG.md` and `verification.json`.

- [x] Define independent acceptable-action labels, disagreement/unknown handling, reviewer blinding and exact-information endgame limits.
- [x] Define randomized coached/uncoached practice, novel unaided assessment and delayed retention; recruitment/results remain pending.
- [x] Explain that existing per-hand promotion thresholds cannot certify this single-seat full-match pilot; any new confirmation estimand needs a reviewed change record.
- [x] Review combined artifacts and results, commit this milestone on main, and report passed/failed/blocked/not-run checks separately.

## Execution evidence

Implemented EVALPACK-01–05. Final combined focused command: 27/27 passed; TypeScript, browser boundaries and generated-contract checks passed. Code/preparation commit: 7aee013. Pilot: 128/128 pairs, 256 terminal streams, eight families, zero action differences. Read-only replay and independent saved-record recomputation passed. Supplement: 24,056 unforced observations, CASE-01 never matched; CASE-02/03/04 affected explanations. See the pack's verification.json and findings.md.

The checked tasks are evaluation infrastructure and preparation. Independent human labels, cue quality, learning effects, new tactic changes, Jev comparison and confirmation remain unfinished. Owner deferred reviewers. No runtime/default changes were made.
