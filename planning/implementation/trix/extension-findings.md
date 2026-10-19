# Extension findings from Trix

This file collects implementation findings for the next game. It complements the [new-game checklist](../../../docs/13-adding-a-game.md); actual acceptance is recorded [separately](../../../qa/implementation/trix/status.md).

| Finding | Consequence for the next game |
|---|---|
| `sessions.Registration` already supports compiled nonlegacy modules. | Reuse its callbacks; no second runtime, new rules language or database tables are needed merely to add a game. |
| The original platform catalog derived modes using a Spades-specific name rule. | Read the installed `Mode`; test every new target end to end. |
| Legacy help and review expected Hearts/Spades observations. | A registered table alone is insufficient. Add safe game-owned presentation and original-decision projection paths together. |
| A historical-decision reader validates analysis/advice schemas as well as policy identity. | Install readers before relying on restart, later review or original saved hints. |
| Historical review built actor packets and frames for later requests that would be discarded. | Keep full canonical archive validation, but stop frame construction after the selected request. A twenty-request regression preserved original frames; both Basic games' earliest saved cues then passed actual UI checks after restart. |
| Public schema fragments feed more than one generator. | Check both `web/scripts/generate-contracts.mjs` and `scripts/m02a-contracts.mjs`; generated TS compiling does not prove Go/schema parity. |
| Ordinary Playwright configuration launches the Node reference. | A new Go game requires a dedicated exact-loopback native runner and a Go-targeted React build. |
| Existing seats are South, West, North, East while Trix moves in the reverse index direction. | Turn order belongs to the module; never renumber seats or change a global next-seat helper. |
| Basic has five requests per kingdom; Complex has two, with fresh deals before choices. | Persist kingdom owner/pool separately from hand-local state. Do not derive ownership again from H7 after the first deal. |
| Partners doubles credit a team directly; Solo doubles can withhold a bonus. | Use explicit seat-or-team ledger recipients. Do not force constant-sum scores or put a team credit on an arbitrary partner. |
| Solo self-capture depends on who last gave the winner the lead. | Save public provenance with source trick references, preserve through consecutive self-led tricks, and reset per deal. |
| Layout passes constrain a board frontier rather than a suit. | Preserve phase-specific evidence; generic trick-void inference is invalid for layout. |
| Existing local identities retain their original immutable entitlement rows. | Add missing exact local-fixture targets only after validating the original fixture identity; preserve revoked grants and configured launch policies. Test an identity created before the new game existed. |
| Widening a registered review union exposed legacy-only Node readers. | Narrow by the discriminant, or explicitly type a legacy reader as legacy; do not add a second referee just to silence type errors. |
| Full-session browser tracing recorded thousands of request and DOM snapshots and fell behind execution. | Cache stable tab metadata, keep bounded requests, sample saved-hint delivery across phases, and retain screenshots plus public progress receipts. Use focused traces for a reproducible failure instead of tracing an entire long session. |
| Late-session runtime increased in the full browser campaign; its cause remains unprofiled. | Keep full-session coverage and timings distinct from short request smoke tests. Preserve canonical replay/corruption checks; attribute causes only after measurement. Further optimization remains deferred. |
| Core gates passed, but the combined four-variant browser campaign failed after 28m19s; both Basic sessions timed out during request twenty and subsequently completed across restart. | Default to core checks and run Basic/Complex browser families separately. Keep the 30-minute ceiling and record the combined resource gate as unpassed. Resumed completion/reload/original-review checks are separate evidence; broader optimization remains deferred. |
| A source file contained a Windows-encoded separator and dense phone rows clipped high cards. | Validate new text as UTF-8 and inspect the fullest legal board at phone width, not just the opening screen. |

### Automatic hidden-to-public announcements (8 October 2026)

Use a separate closed public union for the permitted information at each stage: holder counts before reveal, exact card/seat pairs afterward. A face-down card is not private if its suit or ID has already reached the browser. Persist the reveal boundary in the pure game state, counting accepted actions rather than wall-clock time, so bots, reload and replay agree. Reuse badge geometry while keeping announcement types distinct from scoring declarations. A rule amendment needs a new executable pin for new games and a historical installation for existing records; do not silently reinterpret old snapshots. See [CR-GAME-002](../../decisions/CR-GAME-002-trix-jacks-twos-announcement.md).

The initial Trix bot is a deterministic baseline. No future developer should treat completion, policy/coach agreement or self-play outcomes as proof that it has mastered Trix. The feedback pipeline, strategy case expansion and independent review remain separately planned work.
