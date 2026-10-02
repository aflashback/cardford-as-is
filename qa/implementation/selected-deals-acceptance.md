# RD-01–RD-04 selected opening deals — implementation evidence

Verified locally on 2 October 2026 in `C:\repos\test-jev`, from starting `main` commit `1c07cbe`. The implementation branch is `codex/selected-deal-scenarios`; the owner requested build, testing and merge to `main`.

Implemented the [approved selected-deal change](../../planning/decisions/CR-DEV-001-selected-deals.md): private versioned fixtures for Hearts Solo, Spades Solo and Spades Partners, metadata-only catalog, optional selection during normal new-game setup and saved-opening replay. The existing engine deals the literal cards, validates rules and recomputes bot/coach decisions. Fresh replay resets actions, scores and assistance statistics; the original completed game remains stored. Normal new games and next hands still use the existing cryptographic Fisher–Yates shuffle.

## Executed checks

Commands below ran from the repository root with Node 24.19.0, installed dependencies, Chrome and the existing PostgreSQL container. Service tests use the separate `_test` database; browser tests use local fixture identities and billing.

| Exact command | Observed result |
|---|---|
| `npm run build` | Passed: TypeScript build and Vite production assets. Vite reports a large-chunk warning; it does not fail the build. |
| `npm run contracts:check` | Passed: generated TypeScript, validators and OpenAPI match the canonical public schema. |
| `npm run typecheck` | Passed: client and server strict TypeScript checks. |
| `npm run lint:boundaries` | Passed: 13 reachable browser modules; no server-only source dependencies. |
| `npm run check:artifacts` | Passed: rebuilt assets contain no forbidden server identifiers or source maps. |
| `node --test --test-isolation=none web/server/tests/dev-scenarios.test.ts web/server/tests/config.test.ts web/server/tests/contracts.test.ts` | Passed: 17 tests, zero failed/skipped. |
| `node --env-file=.env.local --test --test-isolation=none web/server/tests/dev-scenarios-integration.test.ts` | Passed: 9 tests, zero failed/skipped, 20.01 seconds. |
| `npm run test:all` | Passed: 310 tests, zero failed/skipped, 96.74 seconds. |
| `npm exec -- playwright test -c web/playwright.config.ts web/e2e/table.spec.ts --grep 'late refresh\|selected\|Replay this deal'` | Passed: 4 affected browser regressions, 6.9 seconds. |
| `$env:TRICKS_LIVE_URL='http://127.0.0.1:4184'; npm exec -- playwright test -c web/e2e/scenarios.config.ts` | Passed: 4 real-service browser journeys on rebuilt assets, 12.4 seconds in the final run. Server started with `PORT=4184`, `APP_ORIGIN=http://127.0.0.1:4184`, `npm run start:scenarios`. |
| `npm run test:ui` | Passed: 33 tests, zero failures, 3.0 minutes. Includes 10 real HTTP/PostgreSQL journeys and 23 response-fixture cases. |

The loader checks all three modes across all four dealer positions and preserves input. Invalid JSON, unsupported schemas/modes, unknown fields, duplicate/incomplete/malformed cards and duplicate IDs fail closed. HTTP checks cover disabled/hosted overrides, authentication, origin, raw-card rejection, unknown IDs/mode mismatch, ownership/control, cross-instance idempotent retry, persistence, three complete legal hands and replay. A changed fixture file uses the old saved material for replay and the new material for a new selection. Normal continuation removes the selected marker and rejects opening-scenario replay in hand two. Browser checks cover staged/cancelled selection, mode restrictions, labels, replay and normal continuation after disabling the catalog.

## Repairs and execution limitations

The starting tree had TS2741 in the non-default Hearts plan adapter because it omitted required `tiedActionIds`. Forwarding its existing `decision.tiedIds` matches the Spades adapter; live policy choices are unchanged. The aggregate includes the existing Hearts policy parity and frozen Spades hash checks.

Build repair commit: `d64c81d` (`Fix required Hearts plan tie trace field`).

An initial sandboxed build failed to spawn esbuild with `EPERM`; the authorized build succeeded with process permission. The first full UI run passed 31 tests and failed its late-refresh fixture: it counted the new catalog GET as a delayed game request. The fixture now handles the metadata route separately, and the affected race regression passes. No app race or production validation was relaxed.

An additional development-launcher smoke passed two cases and exposed an insufficient test wait when selecting the same scenario twice; the helper now waits for a new game ID and setup completion. That smoke also encountered a watcher restart followed by PostgreSQL startup timeouts, despite successful direct database checks. An attempted rerun was stopped after the same startup failure. One later direct startup encountered the same timeout in the execution environment. The final startup succeeded with process permission, and all four live tests passed with the corrected wait. The delivered `start:scenarios` alias uses the ordinary server entry point with rebuilt assets; the original `npm run dev` launcher is unchanged.

Runtime strategic source is **code**, with `JEV_MODE=off`. No live provider request was made and no model ID was observed. Identity/billing are local fixtures. No strategic-strength, real-payment, hosted-security or physical-device claim follows from these checks.

This delivers the requested local/test option. Hosted staging remains blocked by the existing managed-identity gate, and production rejects selected-deal overrides. Arbitrary mid-hand checkpoints, partial authored hands and retrieving an old inactive game as a new training scenario are outside this change; import its original deal into a private fixture to select it. The next unfinished deployment milestone remains hosted identity/staging activation.

Run instructions and editable examples: [selected-deal guide](../../planning/dev-deals.md), [private sample deals](../../examples/dev-deals.json). Reviewed screenshots: [picker](selected-deals/picker.png), [rebuilt saved-deal replay](selected-deals/built-replay.png). The merge commit is recorded in Git history and the delivery response. Unrelated in-progress research-plan/experiment files were left out of this change; pre-existing screenshots regenerated by the regression suite were restored.
