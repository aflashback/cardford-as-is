# CR-ARCH-001 — Registered game contracts and preserved V1 execution

Recorded 5 October 2026. Authority: the owner's instruction to build targeted partnership cases alongside M00–M01, with permission to rewrite the app where useful. Human reviews remain deferred. This adopts the architecture direction of the 4 October implementation plan; it does not activate its later milestones.

Each game supplies its rules, scoring/objectives, safe player knowledge, decisions, scenarios and presentation. The shared kernel supplies four-seat identity, competition/controller separation, lifecycle operations and versioned binding. Storage, access, revision/idempotency fencing and the React frontend retain their existing responsibilities. Game-specific tactics and card semantics stay inside the game module.

M01 defines an additive V2 contract and validated facade. Existing V1 HTTP bodies, reducers, journal entries (`action`, `collect`, `next-hand`), default policy pins and issued advice retain their current meaning. A V2 module is installed only by an exhaustive typed registration; an unknown or missing version cannot resolve to the newest module. Closed public fragments generate types from the active public schema root; private state is validated independently. Production dispatch and persisted V2 activation follow in M02–M04, after parity and durable-command tests.

Alternatives considered: folder-only rearrangement would leave production bypasses; an unchecked universal state would import Spades concepts into other games and weaken information boundaries. A whole-app rewrite is permitted by the owner, but no demonstrated need requires replacing correct reducers, persistence or UI during this foundation slice. A later replacement must preserve attributable history or provide an explicit compatible reader.

Bots and the human coach consume the same actor-safe analysis. The partnership family is an explicitly selectable successor policy with checked triggers, exceptions and uncertain strategic preferences. The frozen/default policies and prior 4.0 profile are preserved. Scenario occurrence, action changes, self-play and Jev agreement do not establish strength or teaching benefit. Fresh development comparisons precede any separately bounded Jev work; independent human judgments and promotion remain deferred.

CR-IMPL-004's online demo, exact-variant access offers, stable coached units and client platform port are frozen as contracts in M01. Their executable service/frontend behavior belongs to M03–M04. No prices, free grants, native packages or new game catalog entries are activated here.

The selected rules are documented under [rule dossiers](../../docs/rules/trix-solo.md). Tarneeb lead/scoring/Solo decisions and unresolved Trix doubling transitions gate only those new-game branches. Current Hearts and Spades rules remain unchanged.

Affected requirements: MG-01–03, MG-07, MG-09–12, MG-15–17 and the partnership family's PR-01–05. Evidence and runnable commands: [milestone status](../../qa/implementation/multi-game/status.md). Rollback disables new registrations/policies; it never rewrites saved pins or historical advice.
