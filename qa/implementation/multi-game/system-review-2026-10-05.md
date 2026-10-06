# CardFord functional and system review — 5 October 2026

Reviewed application source: `aa36c85505bcd8f4c42e9967fe1df195e4f55fb9`. This review preserves the existing table design and current rules/policies. It is a source review plus the recorded pure budget probe, not a new application acceptance campaign. No application code, database, provider configuration or historical research archive was changed. Human strategy/cue reviews and learning studies remain deferred.

The native current-game modules are a useful completed foundation. [M02 status](m02/status.md) explicitly leaves V2 persistence, HTTP/client activation and cross-instance prepared-work fencing to M03–M04. Its 449/449 Linux/WSL acceptance, separate Windows contracts/typecheck/build and corpus of 684 commands, ten hands and 33 original analysis summaries are historical evidence for that tested source. They are not tests rerun by this review or evidence of current hosted capacity.

Next execution records: [CR-ARCH-003 — backend stack and system readiness](../../../planning/decisions/CR-ARCH-003-backend-stack-and-system-readiness.md) and [backend readiness packet](../../../planning/implementation/multi-game/backend-readiness.md). Those companion records define the implementation direction; this file identifies the source evidence and required checks.

## Priorities and evidence classification

| Priority | Finding | Classification | Owner/gate |
|---|---|---|---|
| P2 | Terminal root candidates bypass the declared step ceiling | Reproduced current evaluator defect | M02A first corrective slice; carry into M05 |
| High | Portable backend contracts and one Go/PostgreSQL compatibility slice | Pending target-backend gate; no Go implementation claimed | M02A after budget repair, before M03/M04/M05 |
| High | V2 platform metadata and opening replay anchor need an explicit durable contract | Pending M03 activation gap | M03 before new V2 saves |
| High | Preparation replaces the result behind a returned ID and does not retain starting access generation | Current storage/fencing gaps; M03 already owns the replacement boundary | M03 two-instance acceptance |
| High | Accepted-command reconciliation must survive advancement, replacement and access changes | Current recovery gap; M03–M04 work | M03/M04 |
| High | A stalled transport can keep the table busy indefinitely; review retries create fresh identities | Current experience gaps; no new browser reproduction | M04 recovery matrix |
| Medium | Synchronous searched decisions, retained history and whole-document writes need end-to-end bounds | Structural performance risks, not measured capacity failures | Basic bounds in M03–M06; larger load deferred |
| Medium | Unknown/unsupported pins need a usable safe recovery route | Gameplay rejection exists; read-only recovery is pending | M03/M04 |

Priority describes implementation order. A pending milestone is not a defect in M02's deliberately limited completion claim.

## 1. Reproduced step-budget defect

[The evaluator](../../../web/server/strategy/plan/evaluate.ts) applies each root candidate and increments `steps` at lines 62–65 before any budget check. The guard is only inside the continuation loop at lines 66–69. When a root move immediately finishes the round, that loop never runs. World boundaries also do not check the ceiling before another root operation.

The deterministic [probe](system-review/budget-probe.ts) supplies two terminal candidates, two worlds and `maxSteps: 1`. [Actual JSON evidence](system-review/budget-probe.json) records four applied operations, four reported steps, two completed worlds and `status: completed`. The probe exits 1 because the budget invariant is violated; that is a reproduced failure, not a passing test. It hashes the evaluator, its types/random helper and probe source. The synthetic model uses no database, provider, network, clock or live game.

Reproduce from repository root with Node 24:

```powershell
node qa/implementation/multi-game/system-review/budget-probe.ts
```

Required repair: check and reserve work before every counted root or continuation operation, including world boundaries. Never include a partially completed candidate/world in paired terminal arithmetic. Add cases for terminal roots, a cap exactly reached, a new world after cap exhaustion, and an interrupted paired world. Preserve ordinary policy outputs and immutable historical pins; changes to exhausted-case behavior require explicit attribution. M05 already states the before-exceedance invariant, but the existing evaluator needs the same protection.

## 2. V2 persistence is a platform contract, not only a module snapshot

[Repository reads](../../../web/server/records/repository.ts) still return `query<GameRow>` directly at lines 59–67, and `saveGame` writes the document without decoding at lines 70–75. The strict [legacy reader](../../../web/server/game/legacy/reader.ts) and [V2 decoder](../../../web/server/records/game-document.ts) are not wired into these production reads/writes. This is explicitly pending M03 work.

The closed [V2 document codec](../../../web/server/records/game-document-codec.ts), lines 33–40 and 82–84, represents module/schema/rule pins, competition, controllers, current payload, journal and audits. It does not yet represent the session reasoning-policy pin, control lease, frozen original actor packet/full analysis/advice, exposure, or authoritative admission/grant metadata. Audits at lines 26–32 and 114–130 contain a policy string and digest but no actor/revision/window binding or original packet/advice snapshot. Nonempty unknown historical policy labels are accepted by this foundation decoder; accepting historical data is not sufficient to authorize future execution under that policy.

Before activation, freeze a versioned platform-record representation outside the game-owned payload. It may use a repository envelope or separate records, but the ownership and lossless mapping must be explicit. Link each original decision/audit to session, revision, actor, phase/window, candidate, exact immutable policy, observation schema, permitted input and issued advice. Keep saved advice readable through its supported historical projection even when new work is unavailable. Never infer a future policy from the currently installed default or relabel a missing original result as reconstructed original advice.

[Registration creation](../../../web/server/game/kernel/registry.ts), lines 177–200, consumes initial configuration and chance material, then creates an empty revision-zero journal with the current payload. There is no explicit immutable opening configuration/chance/checkpoint anchor in that closed envelope. V1 records the opening deck at [game-service.ts](../../../web/server/http/game-service.ts), line 256, and later decks at lines 572–575.

Required acceptance: retain actual opening material and initial configuration with their pins, record every later chance result, replay complete logs into a snapshot, and compare state/events/revisions with the saved snapshot. Missing or ambiguous versions fail closed for gameplay; supported original read-only review/export remains separate. Exercise valid V1 resume, corrupt V1/V2 documents, unavailable modules/policies, restart and rollback readers. Verify original observation/analysis/advice bytes or canonical hashes survive without rescoring or backfilling.

## 3. Immutable preparations and starting authorization

[Preparation](../../../web/server/http/game-service.ts), lines 489–506, freezes safe observation, policy, decision ID, seat and revision, and computes outside a transaction. That is the right information boundary. However, lines 510–518 reuse a job by `(game, revision)` and overwrite its result/status/expiry. A previously issued ID can identify a different later preparation. Current deterministic policies largely mask action differences; the storage identity still does not establish an immutable original result.

The starting snapshot also omits `access_generation`. Persistence assigns the current generation at line 518. If another instance changes access during computation, the old result can be persisted under a new generation instead of being discarded. Commit currently checks a stored job's generation at lines 543–548, which protects changes after persistence but does not protect the earlier computation interval.

Required acceptance: freeze the first result of a logical decision or use explicitly fenced attempts whose receipts cannot be repointed. Capture starting access generation and revalidate it, the game/revision/actor/window, policy and control lease before publication/commit. Test two overlapping preparations, access revoke/regrant during calculation, control transfer, game replacement, revision advance, expiry and repeated acceptance. Assert rejected work changes neither revision nor events nor original audit. Preserve the atomic practice-mode Hearts bundle; do not remove `jobs UNIQUE(game_id, revision)` to enable unsupported per-seat work.

The player-row `FOR UPDATE` in [repository.ts](../../../web/server/records/repository.ts), lines 48–51, serializes current single-owner mutations across app instances. Missing a second game-row lock is not by itself a demonstrated lost-update bug. Retain that authority guarantee while changing storage or read paths.

## 4. Recover accepted outcomes after an ambiguous response

[prepare](../../../web/server/http/game-service.ts), lines 490–500, checks revision/control before its later idempotency lookup. [change](../../../web/server/http/game-service.ts), lines 480–485, requires the current active game and coverage before consulting an accepted command. A prior accepted request can become inaccessible after advancement, replacement or expiry. Recomputing preparation before looking up a completed request also repeats avoidable work.

Define an owned command-outcome reconciliation path or equivalent receipt behavior. Recovering an accepted outcome must not authorize new work, expose another player's response, or replay an old view as current authority. Retain original ID/body across retries and refetch the current safe view after reconciliation. Test a lost response followed by bot advancement, access expiry/revocation, control transfer, new-session replacement, restart and reconnect. Confirm each command commits once and accepted quota/admission is consumed once.

The ordinary live-move retry already retains the same envelope in [useSession.ts](../../../web/src/api/useSession.ts), lines 56–70 and 136–140. Preserve it. Process-death/reload recovery needs durable pending identity or explicit outcome reconciliation because React refs do not survive relaunch.

## 5. Bounded recovery and review retries

[The API client](../../../web/src/api/client.ts), lines 26–43, accepts an optional signal but provides no default timeout. [useSession.ts](../../../web/src/api/useSession.ts), lines 56–75, keeps `busy`/`inFlight` set until the request settles. A stalled connection can therefore keep the table unavailable without a bounded recovery path. This is source evidence; no new hang/browser measurement was performed.

Add a bounded transport deadline, recoverable error state and ambiguous-outcome handling. Aborting the client request does not prove the server rejected it. After interruption, retry the original identity or reconcile before creating another mutation.

[ReviewPanel](../../../web/src/features/ReviewPanel.tsx), lines 127–132, creates a fresh envelope and trial ID on each continuation attempt. [TrialService](../../../web/server/http/trial-service.ts), lines 79–84, explicitly requires retrying the same queued request; ready results are keyed by command at lines 33–48. Retain the trial's original ID/body through queue, lost response, retry and reload. Do not turn a lost response into a fresh sampled branch or lose its exposure/provenance. Existing hand-unlock deduplication protects allowance; this review does not claim duplicate unlock charges.

Unknown/unsupported policy pins already reject gameplay, but [LiveTable](../../../web/src/App.tsx), lines 251–260, leaves an opening error/reconnect presentation. M03/M04 should provide safe read-only history/advice/export where the installed historical projection supports it, plus a route to start a new game. Unknown private payloads must not be presented as safely decoded merely to provide a recovery screen.

M04 should run one complete recovery matrix across Hearts Solo, Spades Solo and Spades Partners: opening; each decision/automatic/round boundary; lost response; queued review; reload while paused; control transfer; foreground/reconnect; and unavailable historical versions. Preserve existing setup cancellation, same-envelope retry, next-hand confirmation and coach/table interactions. No UI redesign is required.

## 6. Performance findings and limits of present evidence

- **Synchronous searched work:** `Strategy.analyze` at [game-service.ts](../../../web/server/http/game-service.ts), lines 113–114, is synchronous, with calls at lines 297, 416–419 and 503. The registered module adapters also invoke code analysis synchronously despite an async facade. Default Hearts baseline and Spades 2.1 remain inexpensive inline policies; searched profiles are opt-in. Moving work outside a transaction does not move it off the Node event loop. Bound/admit searched work and measure decision latency and interference with another player's ordinary request before expanding default execution.
- **Existing workers:** [TrialPool](../../../web/server/coaching/trial-pool.ts), lines 29–53, already limits review to two workers, a six-item queue and an eight-second deadline. There is no evidence that the application has no workers. A general durable claimant for searched bot/human work is separate future work.
- **Retained history/write amplification:** repository reads select the whole game and saves replace its JSON. Human action calls `persistAdvance` at game-service line 460, whose line 225 writes the document, then appends the decision and saves again at line 470. Hearts/Spades new deals reset hand history but retain cumulative events: [Hearts engine](../../../web/server/games/hearts/engine.ts), lines 64–84; [Spades engine](../../../web/server/games/spades/engine.ts), lines 25–46. Observations include events and bot audits embed observations. Repeated retained snapshots can grow faster than the primary event history. Measure serialized bytes, repeated writes and per-hand growth over long matches before choosing compaction/append records; preserve replay and original advice.
- **Per-player read serialization:** the same player lock also covers review/account reads. It is a valid current authority safeguard and a potential contention point, not permission to remove locking blindly. [Database pool](../../../web/server/records/database.ts), lines 2–3, is eight connections with a three-second connection timeout. Measure cross-player and same-player tails separately before changing it.
- **Work accounting:** the exact sampler already has memoization and a 250,000-operation count bound in [sampler.ts](../../../web/server/strategy/sampler.ts), lines 179 and 257. Rollout steps alone omit sampling, fact construction, cloning and serialization. The system bound must account for all work and queue/wall deadlines without implying that a step count is a latency guarantee.

[The old local load artifact](../local-load.json) belongs to a dirty `c79dabb` source from 27 September: 100-table/273-request smoke, p95 about 516.67 ms and no errors, with 111 recorded transitions under two seconds. It is historical development evidence, not current capacity. Kernel microbenchmarks repeating the same base state, even with mean below one millisecond, do not measure whole decisions, contention, long retained histories, recovery or hosted latency. M02's Linux acceptance does not verify Windows latency.

The basic web gate needs bounded execution, recoverable stalls and a measured ordinary complete journey. Larger concurrent-load campaigns, hosting capacity, native packaging, real identity/Stripe integration and human strategy/learning evidence remain deferred and must not be inferred from this review.

## Sequencing and completion evidence

1. Execute **M02A first**, as defined by the [backend packet](../../../planning/implementation/multi-game/backend-readiness.md#m02a--backend-contract-and-compatibility-slice): repair the step ceiling with version-aware deterministic regression evidence, then freeze portable backend semantics and prove one bounded Go/PostgreSQL compatibility slice against the independent TypeScript reference. Record its go/no-go decision before M03/M04/M05 backend implementation. This review introduces no separate schedule or completed port claim.
2. After M02A passes, freeze the durable V2 platform metadata and replay-anchor contract before M03 activates new records.
3. Complete M03 validation, immutable attempts, starting authorization fences and owned outcome reconciliation with two-instance/restart tests. M05 can progress independently after M02A against the same frozen contracts.
4. Complete M04 after M02A/M03, on the existing table, with online demo, exact-variant access and the three-mode recovery matrix. The local demo graph and paid/four-hands access remain MG-15/MG-16 pending work, not new discoveries or completed runtime features.
5. Carry M02A's budget correction into M05, then use M06 after M04/M05 to prove the actual replacement service/storage/restart/client path. The world-consuming continuation interface is an architectural weakness; inspected current Hearts/Spades policies use acting-seat own holdings/public state, so this review establishes no concealed-hand leak.
6. Keep new-game rule freeze, maintained cases, comparative evidence and promotion in their existing M07–M12 sequence. Human reviews and strength/learning claims remain deferred.

Each implementation unit should identify source/commit, requirements, exact checks, passed/failed/blocked/not-run results and remaining scope. This review adds no new full-suite, browser, provider, hosted capacity, security or strategic-quality acceptance claim.

The [documentation/evidence integrity report](system-review/verification.json) records checked local file/heading links, reviewed document hashes, the unchanged 173-file M02 runtime hash and matching defect-probe source hashes. Independent reviews found no remaining blocking plan inconsistency. These checks validate this review package; the reproduced runtime defect remains open for M02A.
