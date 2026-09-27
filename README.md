# Card Coach — multi-game software specification pack

**Version:** 0.2.0 · **Prepared:** 26 September 2026 · **Status:** proposed implementation baseline

## The decision

Build a coaching-first, responsive web application for four-player card games, starting with partnership Spades. The shared platform supports individual competition or two teams of two through explicit competition configuration; only Spades is implemented in the first release. One person plays South; Jev controls North, East and West. Code owns the game. Jev owns bounded strategic choices. Original, evidence-backed templates explain the situation without a generative model at runtime.

The central learning loop is **try → receive feedback → understand the relevant facts → retry → practise a related skill**. Winning is secondary to learning. The experience takes inspiration from Chess.com's guided play and review, not its branding, layouts, proprietary evaluation formula, or content. See [research findings](research/01-findings.md).

This package specifies the future software. It does **not** contain an application, a running server, live Jev results, completed game-engine tests, or a deployment. JSON examples are synthetic contract illustrations, not observed model responses.

## Scope selected for the first working release

| Area | Decision |
|---|---|
| First game | Four-player partnership Spades; one frozen training rule profile; ordinary Nil; no jokers or blind bids |
| Extensibility | Shared four-seat kernel and table; separately registered rules, actions, observations, scoring, coaching content and UI capabilities per game; individual or two-pair competition |
| Visual scope | Readable cards, four compact seats with simple icons/initials, flat table, concise coaching; no 3D, illustrated characters or elaborate animation |
| User experience | Guided hand, independent practice, full match, hints, short feedback, hand review, retry branches, twelve drills, local-browser guest progress |
| Devices | Responsive web; phone portrait first, then tablet and desktop; no native application |
| Runtime intelligence | TypeSafe Jev only; ordinary frontend/backend code and authored teaching content elsewhere |
| Stack | TypeScript 6, React 19.3, Vite, Node.js 24 LTS, Fastify 5, SQLite; Vitest, fast-check and Playwright |
| Architecture | One TypeScript workspace, one API process, one embedded job worker, one local database; server-authoritative state |
| Hosting reference | Single Linux host/container with persistent local storage and TLS; local development first |
| Excluded | Monetization, payments, real-money play, multiplayer, voice/chat coaching, other playable game modules in the first release, model fine-tuning, live search engine |

Version choices are a starting baseline, not a dependency lockfile. The implementing agent must resolve compatible current patch versions, check advisories, run a compatibility smoke test, and commit the exact lockfile. Node/React/TypeScript/Fastify source references are in [the source register](research/02-sources.md).

## Three non-negotiable distinctions

**Legal versus intelligent.** The server computes legal actions and validates every returned choice. Restricting the output space prevents an illegal move from being applied; it does not prove that the selected move is strategically good.

**Player knowledge versus the full deal.** Each Jev request sees only that seat's own cards and public history. The human coach sees the human's information only. Historical advice is based on what was knowable at the time, not on cards exposed later.

**Recommendation versus objective evaluation.** A Jev probability is not a chance of winning. A different legal move is not automatically a mistake. V1 uses “Jev suggests,” “different choice,” and exact rule facts—not invented chess-like accuracy percentages or blunder labels.

## Where to start

For a short review before the detailed specifications, read [PLAN-OVERVIEW.md](PLAN-OVERVIEW.md).

For a product/architecture review, read [01 Product](docs/01-product.md), [03 Architecture](docs/03-architecture.md), [04 Jev](docs/04-jev-integration.md), and [11 Decisions](docs/11-decisions-risks.md).

For implementation, place the whole directory in a new repository, read [AGENTS.md](AGENTS.md), then give the coding agent [START-HERE.md](prompts/START-HERE.md). The agent must begin with the capability spike and the deterministic engine, not with a decorative frontend. Parallel work starts only after the contracts are accepted.

For exact boundaries, read [02 Rules](docs/02-rules.md), [05 Coaching](docs/05-coaching.md), and [07 Data/API](docs/07-data-api.md). Machine-readable contracts and example fixtures live in `contracts/` and `examples/`. Read [12 Multi-game extension contract](docs/12-multi-game-extensibility.md) before implementing any shared type or UI component.

## Delivery gates

| Gate | Evidence required before progressing |
|---|---|
| G0 — provider fit | Authenticated documented request/response; model/version confirmed; small Spades decision trial; limitations recorded |
| G1 — game correctness | Individual/team extension seam test, exact rule/scoring fixtures, property tests, replay identity, state-machine tests, hidden-information tests |
| G2 — playable vertical slice | Human plus three bots completes a hand; restart/resume; transparent real-Jev versus demo mode |
| G3 — coaching release | Hints, pre-move advice, review, retry, drills, progress; advice/fact separation verified |
| G4 — release candidate | Mobile/desktop/accessibility tests; outage/recovery/security tests; measured evaluation report; reproducible container run |

A missing API key does not block writing or testing deterministic modules. It **does** block declaring G0, live Jev integration, or Jev coaching quality complete. Demo mode must always identify itself as a basic bot, never as Jev.

## Open evidence, not open architecture

No architecture decisions are being pushed back to the owner. The unknowns are empirical: Jev's actual Spades strength, observed latency and token usage, reliable coaching thresholds, and expert acceptance of strategic suggestions. These have explicit experiments and gates in [09 Testing](docs/09-testing-evaluation.md).

Rule and feature changes go through [the change process](docs/11-decisions-risks.md). The shared/game boundary is required now, not postponed. A test-only individual-play module proves it before release. Shipping Hearts or another complete game follows a later iteration; see [12 Multi-game extension contract](docs/12-multi-game-extensibility.md).

## Package map

- `docs/`: product, normative rules, architecture, Jev, coaching, UX, data/API, security/operations, testing, delivery, decisions.
- `research/`: source-grounded findings, checked sources, uncertainties and excluded claims.
- `contracts/`: JSON Schema, OpenAPI and the frozen rules profile.
- `examples/`: synthetic provider examples, local observations/decisions, rule-unit fixtures and scoring goldens.
- `prompts/`: build kickoff, agent assignments and versioned runtime decision instructions.
- `qa/`: checks actually performed on this specification package, separated from tests the future app must pass.
