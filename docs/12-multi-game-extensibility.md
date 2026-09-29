# 12 — Four-player multi-game platform contract

**Authority:** owner update incorporated into specification 0.2.0, updated for the later owner-approved three-mode build ([CR-IMPL-002](../planning/decisions/CR-IMPL-002-contract-freeze.md)) and Spades reasoning contract ([CR-STRAT-005](../planning/12-spades-reasoning.md)). The original partnership-only catalog limit is superseded. This update clarifies supported variants; it does not change either frozen Spades rule profile or establish coaching quality.

## A. Product boundary

All supported games have four seats. A game may support individual competition (four competitors), partnership competition (two teams of two), or both, but must declare and validate each supported variant. The current playable modes are Hearts Solo, Spades Solo and Spades Partners. This does not make both competition modes available for every game. The architecture must be reusable across card games without assuming all of them involve bidding, trump or tricks. The initial executable lifecycle is sequential turns; simultaneous or sealed actions are an explicit later capability, not silently claimed support.

Current practice tables have one human controlling South and three computer-controlled seats. Keep controller, seat geometry, competition membership and information visibility separate: Solo means individual scoring, not one occupied seat; in Spades Partners the opposite computer-controlled seat is South's teammate. Adding other human seats or online multiplayer is later work, not implied by supporting four seats.

## B. Small shared kernel and trusted game modules

| Shared platform | Each game module |
|---|---|
| Session ownership, commands, idempotency, storage, worker leases, retries | Pure game state and transitions, module phases and legal action enumeration |
| Four seat IDs and explicit competitor partitions | Supported variants and their legal deck, dealing, turn direction, bids/tricks/trump only where applicable |
| Generic lifecycle and typed event/replay dispatch | Scoring, objective, round/match completion and tie semantics |
| Jev HTTP transport, validation, deadlines and provenance | Actor-safe projection, exact features, prompt context and candidate descriptions |
| Hint/review/retry framework, assistance-aware progress | Original lessons, skills, predicate-backed templates and drill answer keys |
| Accessible cards, seat badges, public zones and coach panel | Optional status fields, score presentation and special action/board controls |

Modules are trusted TypeScript packages checked into the same repository and registered at build time. A game with both competition modes may share card mechanics, but each supported variant must select a reviewed rule profile, scoring interpretation, objective and coaching context before a decision is made. No user-uploaded executable plugins, runtime code downloads, separate game microservices or universal scripting language. Configuration is not arbitrary executable rules.

Suggested future repository boundaries:

```text
apps/web/                    # app shell, routes, guest session
apps/server/                 # API, worker, persistence, registration
packages/contracts/          # common + registered-module schema generation
packages/game-kernel/        # lifecycle, seats, competition, registry interfaces
packages/observations/       # safe module projection dispatch/validation
packages/decision-policy/    # Jev transport, validated result, explicit demo interface
packages/coaching/           # shared learning lifecycle
packages/content/            # catalogs, localization and skill contracts
packages/ui-table/           # cards, four seats, public zones, action/coach slots
games/spades/engine/         # rules and scoring, no network
games/spades/observations/   # safe facts and provider context
games/spades/content/        # prompts, lessons, drills, templates
games/spades/ui/             # bidding, trick, bid/trick score/status adapters
tests/fixtures/solo-module/  # test-only alternate module; excluded from catalog
```

Do not create packages solely to fill this tree. These are enforceable dependency boundaries; closely related folders may share a package while imports remain controlled.

## C. Normative interface responsibilities

The following is an interface specification, **not implemented application code**. Generic types are module-owned and validated through registry schema IDs. Private state is never assignable to an observation or browser view.

| Interface operation | Inputs → output | Contract |
|---|---|---|
| `manifest` | Immutable descriptor | Game/version, supported variants and rule profiles, competition for each variant, required capabilities, schema IDs |
| `validateConfiguration` | Rule profile + competition + session mode → accepted config or errors | Reject unsupported combinations; no automatic fallback |
| `create` | Validated config + explicit shuffled deck/random material → private state + events | No hidden clock/network; server persists randomness/deal privately |
| `getTurn` | Private state → lifecycle + module phase + active seat | One active seat in an actionable v1 state; none when round/session complete |
| `legalActions` | Private state + active seat → ordered candidates | Complete legal set; IDs unambiguous; no strategic pruning |
| `apply` | Private state + exact candidate + deterministic inputs → new state + events | Revalidates; immutable deterministic reducer; computes scoring and terminal result |
| `observe` | Private state + actor → typed safe observation | Own cards plus permitted public information only |
| `facts` | Safe observation + candidates → typed exact features | No access to full state; facts carry stable names/semantics |
| `decisionContext` | Observation + facts + rule profile → compact rubric/context | Game-specific objective; arithmetic already computed; no other-seat secrets |
| `toTableView` | Safe observation + generic session status → safe common view + typed game data | No model needed; game-specific display fields optional, not fake/null placeholders |
| `projectEvent` | Private event + viewing seat → safe event or omission | Explicit public/own visibility; never return raw event log |
| `replay` / `migrate` | Versioned private snapshot + events → compatible state | Unsupported old version fails closed/read-only; no silent rescoring |
| `coaching` | Original safe decision context + action → verified facts/templates/skills | No invented model rationale; accepted drill alternatives module-owned |

The engine may share small card utilities, but rank ordering and trick winner functions are parameterized or game-owned. Card `instanceId` and `faceId` are distinct concepts so a later multi-deck game can add duplicate faces without losing identity. Spades may use the same string for both. No generic `52`, `13`, `spadesBroken`, `bid`, `bag` or `partnerSeat` requirement.

## D. Competition is data, not seating inference

`competition` has a mode and a partition of the four seats into competitors.

```json
{"mode":"partnership","competitors":[
  {"id":"NS","seats":["N","S"]},
  {"id":"EW","seats":["E","W"]}
]}
```

```json
{"mode":"individual","competitors":[
  {"id":"north","seats":["N"]},{"id":"east","seats":["E"]},
  {"id":"south","seats":["S"]},{"id":"west","seats":["W"]}
]}
```

Every seat appears exactly once, IDs are unique, group count/size match mode, and the selected variant and rule profile approve the arrangement. The kernel supports both structures; a game is not forced to support both. Changing a teams Boolean is not enough to invent individual-play rules or coaching objectives. Variant, membership and rule profile are immutable for a session.

| Game family | Current catalog mode | Competition | Frozen rule profile |
|---|---|---|---|
| Hearts | `hearts` | Four individuals | `hearts-training-1.0.0` |
| Spades | `spades-solo` | Four individuals | `spades-solo-training-1.0.0` |
| Spades | `spades-partners` | Two teams: South/North and West/East | `spades-training-1.0.0` |

Spades Solo and Partners share card legality and trick resolution under their named profiles. Solo scores each seat's bid, Nil and bags separately; Partners combines positive bids and credited tricks for each team, while Nil remains an individual commitment. The module supplies the matching objective and coaching facts: the opposite seat is an opponent in Solo and a teammate only in Partners. Hearts currently supports individual competition only. A future game may add its second mode only with its own validated rules, scoring, objective, safe observations, coaching and acceptance evidence.

A module supplies the objective and terminal ranking. The platform never assumes higher score is better, winning a trick is good, or a partner exists. Score summaries are display entries with module-computed values and labels. Winners are an explicit set of competitor IDs supplied by the module, not determined by generic UI sorting. Team membership does not share private hands, strategy scratchpads or human hints.

## E. Extensible phases, actions and capabilities

Kernel lifecycle: `awaiting_action`, `round_complete`, `session_complete`. Separately expose a namespaced/registered module phase; Spades has `BIDDING`, `PLAYING`, `HAND_COMPLETE`, `MATCH_COMPLETE`. Worker state is a third, non-game concern.

A candidate is `{id, kind, label, cardIds, payload}`. `kind` and `payload` belong to a registered game schema. The app submits only its candidate ID for the expected state version. Shared Jev transport maps candidate IDs to semantic criteria without inspecting `bid` or `play` syntax. Examples: one card, bid, pass, choose trump or a complete multi-card selection. A plugin-specific UI can assemble a selection, but the server must resolve it to a legal candidate before application.

Capabilities are **requirements and registered handlers**, not Boolean claims that features exist. Initial handlers: sequential turns, individual/team competitor views, single-card selection, single-choice selection, public-card/trick area, read-only score breakdown, hints/review/retry. Spades requires bidding, trick area and trump display adapters. Future sealed passing, auction protocols, drawing, discarding, multi-card selection, melds or new deck families require their own reducers, UI handlers, visibility tests and provider evaluation before registration is enabled.

TypeSafe currently permits at most 255 candidates per Choice (R01). The common boundary enforces that budget. Single-card play/bidding fits; combinations may not. A later large action space must introduce an explicit sequential selection protocol or another owner-approved model decision design. Never truncate candidates, privately use heuristic pruning or claim a factored choice is equivalent to a single joint optimal choice.

For future hidden simultaneous decisions, add a pending-action set and atomic reveal barrier with per-seat information isolation. Do not emulate it by publicly committing each player's choice in sequence. This capability is deliberately not implemented for Spades.

## F. Contracts, storage and versioning

Every session and decision carries `gameId`, selected variant/catalog mode, `moduleVersion`, `ruleProfileId`, `observationSchemaVersion`, `featureVersion`, `promptVersion` and competition. Provider transport is shared; prompt objectives and facts are game- and variant-specific. Progress keys include game, variant, skill and content version; do not merge Solo and Partners coaching progress or another game's unrelated score.

The transport uses closed discriminated unions of installed module schemas. A stable common envelope plus `oneOf` module payloads is extensible without allowing unvalidated blobs. Extending the registry regenerates the union, validates examples and adds compatibility tests. Game-specific schema branches may use the same human-readable card identifiers without leaking details across games.

Private state is module-owned JSON validated on save/load; public JSON is independently projected and validated. Existing sessions retain the module/rule interpretation they started with. Adding a new game should not require changing session/job tables, except where an explicitly new kernel capability changes persistence semantics.

## G. Capability gate and second-module proof

At startup, verify manifest/schema presence, required engine/UI handlers, supported variant and competition, deck renderability and compatible contract versions. Exclude incomplete modes from `GET /games`; reject forged or unsupported game/variant combinations server-side. The current catalog exposes `hearts`, `spades-solo` and `spades-partners`; the test-only module is excluded.

Use a tiny test-only individual module without bids, trump or tricks to prove no shared-layer assumption depends on Spades. Test its session → safe observation → generic mocked Jev Choice → action → state → replay → four-score table flow. It does not prove Hearts strategy or rules; it proves modularity. Tests must also prove unsupported modes fail closed.

A production new-game or new-variant pull request includes its rule source research, exact variant, schema branch, reducer, legal actions, visibility projections, prompt and features, score/terminal cases, original coaching content, deterministic and hidden-information tests, UI capability adapters, and its **own** strategic evaluation. Shared mechanics may reuse correctness tests, but Solo and Partners require separate objective, coaching and outcome evidence. Results from one variant or game cannot establish coaching quality in another.

## H. Minimal visual contract

Four seats remain North/East/South/West. Each is one initial/icon with concise status. Central content is cards or a small game-specific public zone; the hand is readable and touchable. The coach is a panel, not an animated character. Team labels and game details are data-driven. No 3D, casino decoration or avatar-production backlog. Responsive behavior follows document 06.

## I. Lifecycle mapping and versions

Spades `BIDDING`/`PLAYING` maps to `awaiting_action`. `HAND_COMPLETE` maps to `round_complete` for a continuing match, but to `session_complete` for a guided/practice single-hand session. `MATCH_COMPLETE` maps to `session_complete`. Neither completed lifecycle has an active seat or legal gameplay candidates. Hand/review endpoints remain available after completion.

The Spades variants retain separately named frozen rule profiles from section D, independently versioned observations, prompts and features, and a versioned module/decision record. New variants must register their private-state and event schemas before persistence. Existing sessions retain their selected variant and original interpretation; no variant switch or silent rescoring occurs on resume or replay. Public manifests may expose schema IDs, never raw private-state schemas or contents.
