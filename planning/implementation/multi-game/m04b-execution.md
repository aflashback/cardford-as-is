# M04B — Original policies and registered sessions

6 October 2026 (Toronto). Owner instruction: “Next M04B”. Starts at `e60324f`, after the accepted M04A Hearts prerequisite. Requirements: original-policy and session-interface prerequisites for MG-02/04/05/06/09 and SYS-03/06/10/12. Full M04 service/client acceptance remains separate.

## Frozen scope

- Execute the exact original defaults in Go: `hearts-baseline-1.0.0` and `spades-tactics-2.1.0`. Compare full facts, candidate ordering, reasons, exceptions, tactical trace, coach text and all three help levels against preserved TypeScript sources.
- Keep game policy and cue rendering game-owned. The explicit `legacydecision` compatibility package preserves the old V1 observation/facts/analysis vocabulary; it is not the generic platform model or a new game's reasoning foundation.
- Supply the Go equivalent of the frozen M02 `BoundSession`: exact registration pins, actor packets and views, candidate resolution, atomic sealed choices, automatic steps, continuation, chance and immutable preparation. Public schemas remain the existing generated closed unions.
- Preserve V1 commands, histories and pins. V2 continuation has a distinct `awaiting-deal` boundary; it must not rewrite a V1 next-hand event into different history. Unsupported saved policies remain read-only and never silently select a default.
- Keep the original TypeScript service and frontend active until later M04 service acceptance. No listener activation, persistence migration, UI redesign, new strategy, provider calls, hosting or human evaluation belongs to this step.

## Parallel ownership and verification

| Work | Ownership | Evidence |
|---|---|---|
| Original Spades policy | `games/spades/reasoning`, explicit V1 compatibility DTOs | Exact analysis including trace; strict actor inputs |
| Original Hearts policy and coaching | `games/hearts/reasoning`, per-game coaching, shared envelope/projection | Same analysis drives bot and advice; full text/ordering/level parity |
| V2 sessions | Generic `gamekernel` facade, game-owned adapters, `sessions` registry | Strict pins/imports; sealed/automatic/chance; immutable actor-safe preparation |
| Independent oracle and integration | `compatibility` tests, M04B QA and plans | Preserved TS cue/policy goldens plus complete multi-hand streams |

The private oracle at `qa/implementation/multi-game/m04b/reference-corpus.json` is generated only from preserved TypeScript. `generate-reference.ts --write` refuses overwrite; `--check` verifies it without changing expectations. It checks the original 56-hand cue hashes and 48-hand frozen-policy hashes before recording new full-output expectations. Full Go output must match; the oracle is never regenerated from the port.

Use `node scripts/windows-env.mjs` for all native Windows checks, with the pinned Node 24.19.0 and Go 1.26.8 tools. Run focused parity/conformance checks, the full Go suite and race/vet, unchanged contract generation, and relevant original Node regressions. Any database checks use only the existing isolated `_test` schemas, serially. Preserve failed attempts alongside passing evidence. Do not resume the closed Go/Node performance comparison.

## Next gate

After this scope passes, M04C connects authenticated session ownership and durable prepared work to the Go service. The existing test-store activation guard stays in place. The platform response/bootstrap contract, online demo, exact-target access resolver, preserved frontend adapters and actual three-mode browser recovery remain required before full M04 completion. Stage-specific database cancellation/cleanup diagnostics from M04A remain an explicit service follow-up.
