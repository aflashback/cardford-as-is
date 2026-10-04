# Architecture interview: initial position

2026-10-04 · source baseline `09b4903` · architecture interviewer · investigation only. This is the opening position and questions; an interview outcome requires the other agent's response. No implementation or dependency changes are proposed for execution here.

## Verified current state

The documented destination is a small four-seat platform with game-owned state, actions, observations, phases, scoring and presentation. Production has useful separation, but does not implement that complete boundary. The later [contract freeze](../../decisions/CR-IMPL-002-contract-freeze.md) deliberately retained the flat UX view; the finding is an extension constraint, not proof that this compromise was accidental.

- `Mode`, `Phase`, `GameAction` and `PrivateGame` still combine Hearts and Spades. Every state has bids, bags, both broken-suit flags and Hearts passing. [Types, line 2](C:/repos/test-jev/web/server/game/kernel/types.ts:2)
- The apparent generic `GameModule<State, Observation, Action>` has no production implementation/dispatch. Its only implementing object is the test counter. The test directly calls that object and labels selecting `candidates[1]` a mock choice; it never traverses HTTP, persistence, real provider transport or table rendering. [Interface, line 8](C:/repos/test-jev/web/server/game/kernel/registry.ts:8); [test, line 18](C:/repos/test-jev/web/server/tests/module-seam.test.ts:18)
- Production `GameService` imports `createGame/apply/collectTrick/nextHand` directly and allows prepared bot decisions only in `bid/play`. The shared engine chooses Hearts versus Spades rules and fixes team scoring groups. [Service, line 3](C:/repos/test-jev/web/server/http/game-service.ts:3), [phase guard, line 495](C:/repos/test-jev/web/server/http/game-service.ts:495), [scoring, line 117](C:/repos/test-jev/web/server/game/index.ts:117)
- `SeatObservation`, HTTP `GameView`, and `App.tsx` mirror those assumptions. Team identity is still inferred from Spades mode and seat position in UI. [Observation, line 16](C:/repos/test-jev/web/server/observations/types.ts:16), [view, line 15](C:/repos/test-jev/web/server/http/views.ts:15), [UI, line 174](C:/repos/test-jev/web/src/App.tsx:174)
- PostgreSQL stores a JSON document, but TypeScript fixes its state to `PrivateGame`, actions to the existing union, and deal records to card strings. Repository load/save does not perform module-schema validation. [Document, line 72](C:/repos/test-jev/web/server/records/types.ts:72), [repository, line 59](C:/repos/test-jev/web/server/records/repository.ts:59)

## Reusable foundations

Keep ownership/idempotency/revision checks, independent domain/public contracts, explicit allowlist projections, closed observation validation, immutable original advice and policy attribution. They already address real problems. [Transactions, line 478](C:/repos/test-jev/web/server/http/game-service.ts:478), [projection, line 40](C:/repos/test-jev/web/server/observations/index.ts:40), [validation, line 89](C:/repos/test-jev/web/server/observations/index.ts:89), [schema generation, line 10](C:/repos/test-jev/web/scripts/generate-contracts.mjs:10)

The newer `PlanningPack<Obs, Move, World>` is a genuine generic boundary: common budgets/comparisons with game-owned candidates, objectives and continuations. Hearts and Spades profiles call `decide`; a concealed-token fixture defines additional objects and competition partitions, but has no importing test and remains scaffolding. Retain the boundary provisionally, while separating reuse from strategy quality. [Contract, line 13](C:/repos/test-jev/web/server/strategy/plan/contract.ts:13), [Spades call, line 137](C:/repos/test-jev/web/server/games/spades/plan/profiles.ts:137), [Hearts call, line 119](C:/repos/test-jev/web/server/games/hearts/plan/profiles.ts:119), [token pack, line 572](C:/repos/test-jev/web/server/tests/support/token-module.ts:572)

The [observed-cases report](../../../qa/implementation/OBSERVED-SPADES-CASES-REPORT.md) and three discovery archives establish reproducible examples and factual regressions, not general strategic superiority. Preserve their private/public evidence distinction. Jev was off; research agents were external experiment participants.

## Recommended boundary changes to investigate

Use a real registry to connect module-owned reducers, legal candidates, information projections, private-state schemas and UI adapters to the production service. Keep the shared shell responsible for commands, revisions, jobs and access. A common envelope should identify game, variant, rule/schema versions, lifecycle, actor and competition; payloads should be generated closed unions of installed module schemas.

Separate actor eligibility and automatic transitions from visible table phases. Auction, trump/contract selection, evolving public card reveals, sequence-layout play and forced pass must be representable without masquerading as Spades bids or trick collection. Exact Tarneeb Solo rules remain unresolved; no reducer or objective can be specified yet. Contracts should support game-owned score breakdowns and terminal rankings, without globally requiring bags or higher-is-better.

Preserve old snapshots and original advice through explicit version dispatch or read-only legacy support. Prove the replacement boundary through the actual service → storage → observation → policy → command → replay → UI-adapter route using a non-trick fixture. The existing isolated seam test is insufficient evidence.

## Alternatives

**Prefer targeted migration:** extract current Hearts/Spades behind the production registry, retain tested orchestration and replace coupled types/views at that boundary. **Selective engine/planner rewrite:** justified if measured incompatibilities make adapters preserve accidental semantics or duplicated reducers undermine correctness. **Whole-app rewrite:** currently unsupported; would discard working access, persistence and provenance without evidence that they prevent the new games. Owner permission makes rewriting available, not automatically economical.

## Questions to the reasoning interviewer

1. What minimum typed decision/evidence protocol must every game provide without assuming tricks or bids?
2. Which exact, probabilistic and heuristic conclusions should share machinery, and which remain game-owned—especially auction inference and contract selection?
3. Which sampled-world and continuation gates prevent hidden-information leakage and strategy fusion?
4. What independent benchmarks and objective definitions must precede choosing search versus a learned policy for each variant?
5. How should long-horizon plan memory survive transitions/replay without becoming private partner communication or rewriting historical advice?
6. What concrete evidence would justify rejecting staged extraction for an engine/planner rewrite or whole-app rewrite?

## Checks performed

Source/import inspection completed. `node --test web/server/tests/module-seam.test.ts` was blocked by sandbox child-process `spawn EPERM`; `node --test --test-isolation=none web/server/tests/module-seam.test.ts` passed 2/2. This verifies the isolated test's execution only. Full suite, browser, database and live providers not run; observed live model ID: none.
