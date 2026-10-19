# Adding a game to CardFord

This is the practical native Go/React checklist. [Document 12](12-multi-game-extensibility.md) remains the module contract; [Trix](rules/trix.md) is the first addition through the compiled installation seam. Historical TypeScript game proposals describe the earlier runtime and are not a second implementation requirement.

## 1. Freeze what the game means

Write a short rules document and a numbered change record before a reducer depends on unresolved rules. Record source links, the exact variant IDs, seat direction, competition, scoring, opening actor, completion/ties, and every source omission the app resolves. Keep explicit owner decisions above third-party examples.

Use distinct profiles when competition or scoring changes. A partner flag is not a complete Solo profile. Keep game, variant, module, rule, state, observation, event and policy versions separate. Never silently upgrade saved sessions or alias an old draft to a new meaning.

Define the full session and the smallest charged/coached unit. For Trix these are four kingdoms and one request on one fresh deal. Do not hard-code `hand`, bids, trump, clockwise direction or NS/EW scoring into shared services.

## 2. Write down the boundaries before parallel work

| Boundary | Owner | Existing extension point |
|---|---|---|
| Private state, legality, scoring, progress | Game package | `server/internal/games/<game>/` |
| Typed immutable session | Game adapter | `gamekernel.SessionModel`, `BindSession` |
| Own cards and public history | Game observation builder | Allowlisted actor packet and public view |
| Deterministic decision | Game policy | `Analyze` / `AnalyzeComplete` |
| Public contract | JSON Schema | `web/shared/games/<game>.schema.json` and registered root unions |
| Storage and startup | Compiled composition | `sessions.Registration`, `records.NewServiceCodecWithRegistry` |
| Access unit/target | Game installation and access policy | `Unit`, `Window`, exact variant target |
| Table/actions | Registered React adapter | Discriminated presentation and server candidates |
| Saved help/review | Authorized service + game projection | Original immutable decision, safe registered projection |

Freeze DTOs jointly before schema/UI/backend consumers proceed. Generate Go/TypeScript artifacts from the public schema; do not hand-edit generated code or duplicate a third manually maintained DTO. Keep private domain types independent of HTTP types. Fail closed on unknown fields and mismatched versions.

## 3. Implement the pure module first

- Reducers receive explicit actions/chance material and return new state. They never read time, network, database or random generators. Validate full deals and retain the actual private cards for replay.
- Enumerate every legal server candidate with a stable ID bound to its exact typed action. A client submits an ID and expected revision, never a newly invented move. Multi-card declarations must include every legal subset within the declared candidate bound.
- Make ownership, next actor and lifecycle explicit. Share card utilities where useful; do not inherit another game's restrictions. Separate layout/drawing/passing phases from trick-taking.
- Represent score components and recipients explicitly. Team-level credits and seat penalties must aggregate exactly once. Keep provenance for rules that depend on prior public events.
- Construct each observation from an allowlist. Opponent/partner cards, private seeds and future deals stay private. Test that swapping indistinguishable hidden holdings leaves the same packet and policy result.
- Build a complete deterministic baseline for all phases, including forced decisions. Every explanation must use the saved analysis and public evidence. Record policy versions; fixture success does not establish strong play.

## 4. Install through the platform

Implement the installation's `Start`, `Open`, `OpenStored`, `ValidateHot`, `Bootstrap`, `NextChance`, `Window`, `Unit` and execution-policy pins. Use a composition package that imports both the registry and game; avoid a dependency cycle from the registry back into its modules.

Extend closed packet/view/action/event/analysis/presentation unions and run both generators. Check serialization against the schema, not just Go compilation. Empty arrays must serialize as arrays where the contract requires them.

Reuse transactions, version checks, receipts, lease validation, access checks and bounded workers. CPU analysis runs outside database transactions. Register the correct historical decision reader as well as the new-game path: restart and saved advice can fail even when a fresh game works.

Validate the full stored archive, then construct review frames and actor packets only for the selected request. Trix's twenty-request regression preserves byte-identical original frames while avoiding discarded later-request projections; both saved Basic games subsequently loaded their earliest original cues in the actual UI.

Catalog modes come from the installation, not string conventions for one existing game. Register real UI capabilities before activation. Add supported access-unit kinds and exact targets, but do not invent paid offers or free trials. A local fixture entitlement is not commercial activation.

## 5. Add the player experience

Use a dedicated discriminated presentation when the phase structure differs. Reuse the actual components and geometry in the [card-table design guide](14-card-table-design-guide.md): semantic cards, hand selection, four seat badges, last-trick/coach rail and dialogs. Keep pause/reload/recovery and existing transport. Keep only legal confirmed choices actionable. Show points and completion supplied by the server; do not recalculate official winners in React.

Test all phases on desktop and phone, including dense boards, declarations, result screens and next-deal confirmation. Reuse UX-42's shared hold/drag and double-activation gestures. An explicit off-turn double activation queues a legal play for the next human turn; phase-specific pass/double selection still needs separate confirmation. Reload clears that transient queue and stays paused; stale or ambiguous responses use the existing reconciliation protocol. A future game's UI must not silently point at the Node reference server.

## 6. Prove the addition within a bounded run

Start with independent scoring goldens, illegal actions, card conservation, termination and full-session schedules. Add deterministic replay, corruption rejection, historical original bytes, hidden-world invariance and exact policy/coach agreement. Then test native database service behavior: stale/duplicate commands, access, resume, next unit and terminal results.

Use the existing watchdog for a cumulative run limit of at most 30 minutes. Trix defaults to bounded core checks through `npm run test:trix` or `node scripts/trix-checks.mjs`. Run `browser-basic` and `browser-complex` separately for full browser sessions; `browser` runs all four, and `all` combines core checks with that full campaign. Its browser harness builds the Go client, launches its own loopback Go listener on the test database and stops that listener after testing.

Trix's core checks passed, but the combined four-variant campaign did not pass the 30-minute resource gate. Late-session runtime increased; the cause remains unprofiled. Record that limit explicitly; do not weaken canonical validation or extend the global deadline to turn incomplete coverage into a pass. A saved session completed after restart proves resumed completion separately from an uninterrupted browser run.

The verified Trix local baseline includes both complete Complex browser sessions and both original Basic sessions completed across restart, with paused reload and earliest saved review checks. The final core run passed in 77.7 seconds; this does not convert the failed combined campaign into a pass or establish strategy strength.

Keep three evidence categories separate: pure engine sessions, real native API sessions, and real browser actions. A synthetic screenshot or imported terminal fixture does not prove full-session gameplay. Preserve failed seeds and logs. A timeout, skip or missing database is unverified, never a pass.

Finally record exact commands, outcomes, durations, policy/profile pins, limitations and startup instructions under `qa/implementation/<game>/`. Update the changelog and current catalog documentation. Record new extension findings beside the game so the next addition repeats fewer mistakes. Human evaluation, code-review campaigns, optimization and hosting can follow without weakening the initial plumbing.
