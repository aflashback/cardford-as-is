# Card Coach — plan overview

**Specification 0.2.0 · 26 September 2026 · Planning only**

## The product

A responsive coaching-first card-game web app, not a graphical casino. One human plays with three Jev-controlled players. The first production game is partnership Spades. The architecture supports later four-player games with four individual competitors or two teams of two. Cards, four simple icons/initials, concise status and a coaching panel are sufficient. No monetization, real-money play, native app or multiplayer infrastructure is included initially.

The learning loop is try, receive a short fact or suggestion, review, retry and practise an original skill exercise. The release includes guided hands, independent practice, full matches, progressive hints, hand review, retry branches, twelve original drills and browser-guest progress. Content fixtures and all runtime software are future implementation work.

## Ownership of intelligence

The game module computes legality, state transitions, tricks, scores, counts, information permissions and deterministic facts. Jev receives only one player's allowed information and selects among the complete legal candidates. Code validates and applies the choice. Only-one-option decisions bypass the model and are labelled forced. Coaching prose comes from original, predicate-tested templates, not a runtime language model.

The research supports this interface pattern, but does not establish Jev as an expert Spades player. The first gate is an authenticated capability and strategy trial. The detailed provider contract, source links and limits are in documents 04 and research/02-sources.md. The model's probabilities must not be called win odds, player accuracy or proof that another legal move is a mistake.

## Extensibility

The shared platform owns four seats, competition partitions, sessions, persistence, jobs, provider transport, review/retry, progress and the minimal table. Each trusted game module owns its rule variant, phases, actions, score objective, safe observations, exact features, decision rubric, original coaching content and any special controls. Spades-specific bid/trump/bag fields are not shared requirements.

A module declares capabilities; the registry enables it only when those capabilities have working handlers and tests. Future passing, drawing, multi-card choices or sealed simultaneous actions require explicit implementation and visibility checks. They are not made to work by adding a flag. A small test-only individual module with no bidding/trump/tricks proves the separation during the first build. Only Spades appears in the initial production catalog.

## Technology decisions

Use a strict TypeScript workspace, React 19.3 with Vite, Node.js 24 LTS, Fastify 5 and local SQLite. Use semantic HTML/CSS cards and system fonts. Vitest, fast-check and Playwright cover unit/property/integration/device testing. The implementing agent resolves compatible patch versions and commits the lockfile.

Run one server process with a bounded durable-job loop and persistent local storage. Use server-authoritative state, REST with bounded polling, short database transactions and versioned/idempotent commands. No Redis, graph database, agent framework, message broker or game-engine renderer is necessary. Provider keys remain server-side.

## Implementation sequence

| Stage | Deliverable | Exit evidence |
|---|---|---|
| 0 | Freeze module/API contracts; Jev trial; deterministic Spades engine | Authenticated provider facts or explicit blocker; exact scoring/visibility tests; individual-module seam test |
| 1 | Complete playable hand, persistence and minimal phone/desktop table | One human and three bots finish; reload/restart safely resume; honest demo/live modes |
| 2 | Coaching loop, review/retry, original drills and progress | Verified teaching predicates, complete exercises, assistance/exposure tracking |
| 3 | Strategy evaluation and release hardening | Independent reviewed positions, fair baselines, race/security/accessibility tests and actual evidence |

There is no calendar promise or claim that these tests already passed. The pack includes synthetic contract examples and original rule/scoring fixtures, not a working application or benchmark.

## What the build agent receives

Keep the complete folder together. Start with README.md and AGENTS.md, then prompts/START-HERE.md. The twelve numbered specifications cover product, exact rules, architecture, Jev, coaching, responsive UX, APIs/data, security/operations, testing, delivery, decisions and multi-game extension. Contracts and examples are machine-readable. Bounded agent work packets define ownership and evidence. ADD-A-GAME.md is reserved for a later owner-approved game.

Changes to rules, observations, prompts, features and module schemas are versioned independently. Existing sessions keep their original interpretation. A new game must earn its own Jev quality evidence; it cannot inherit Spades benchmark results.

See qa/spec-validation.md for checks actually performed on the planning package.
