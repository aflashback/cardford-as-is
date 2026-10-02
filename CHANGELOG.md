# Changelog

## Unreleased — 2026-10-01

Added RD-01–RD-04 selected opening deals for local training and repeatable tests: server-only versioned JSON fixtures, an opt-in practice picker, saved-deal replay and strict validation/visibility checks. Normal games retain cryptographic Fisher–Yates shuffling. Hosted fixture overrides remain blocked. [CR-DEV-001](planning/decisions/CR-DEV-001-selected-deals.md) · [usage](planning/dev-deals.md) · [acceptance](qa/implementation/selected-deals-acceptance.md).

Repaired a pre-existing missing Hearts plan trace field so the combined branch typechecks; live Hearts choices are unchanged.

## Unreleased — 2026-09-30

Added [automated authored-hand research collection](qa/experiments/2026-09-30-expanded-batch/results.md), exact prompt/response evidence, an owner-directed Sol-to-Luna model switch, preserved historical choices, and checks of specific public-card explanations. Completion is reported per hand; runtime rules, bots and coaching policies are unchanged.

## Unreleased — 2026-09-29

Owner-directed [CR-STRAT-009](planning/decisions/CR-STRAT-009-game-plan-and-strength-gate.md): generic game plan layer, frozen Spades baseline, selectable Spades plan profiles, case store and strength gate. Default policies, rules, scoring and the Jev boundary are unchanged.

## 0.2.0 — 2026-09-26

Incorporates the owner's additional requirements before implementation: future four-player card games, individual or two-pair competition, new capabilities, and minimal visuals. Adds normative multi-game module interfaces, generic envelopes, explicit competition, capability negotiation, extension conformance, UI seams, version isolation and a next-game work packet. Spades remains the only first-release production game.

## 0.1.0 — 2026-09-26

Initial researched planning baseline: Jev-only bounded strategy; deterministic partnership Spades; exact failed-Nil/bag conventions; fair-information coaching; responsive TypeScript app; server-authoritative state; source research, evaluation and agent handoff.

Neither version is an implementation, live model evaluation, deployment or completed user study.
