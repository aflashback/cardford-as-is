# M04C — Authenticated durable Go service

6 October 2026 (Toronto). Owner instruction: “Proceed with the next step.” Starting commit `bbca6fe`. Implements the local service portions of MG-02/04/05/06/09 and SYS-03/04/05/06/07/08/09/10. Full M04 frontend, demo/access and journey acceptance remains separate.

## Scope and interfaces

- One explicit loopback Go listener with PostgreSQL in the separate `cardford_go_local` schema. Native Windows remains the local environment. The current React/TypeScript startup remains active until its later cutover.
- Server-issued local fixture credentials, stored as token hashes, identify the owner. A tab control lease is separately fenced. Requests never supply an owner or an actor. Identity and unlimited fixture grants are visibly local; hosted identity and commercial offer resolution remain later gates.
- Register the exact M04B V2 sessions with compact M03 persistence. Preserve original V1 readers, journals and policies separately. Record continuation and actual chance as distinct V2 operations; keep all drawn cards private.
- Prepare complete original policy analysis and all three original coach levels once, outside database connections. Freeze them with the registered result, input digest, exact components/budget, actor/revision/window and durable attempt receipt. Stored advice reads use saved bytes rather than executing a policy.
- Reserve finite worker capacity before queuing new work. Two workers and sixteen queued reservations serve live practice; this API does not execute review continuations. HTTP and work deadlines are separate; process restart recovers queued/expired attempts through explicit retry.
- Reconcile the authenticated public command intent before considering new work. Bind operation, tab and complete validated body, including the previous lease and selected candidate. Opening/replacement, control takeover and accepted transitions record their original response in the same transaction as their effects.
- Add only forward migration 008. Erasure derives its owner from authentication and deletes only that owner's records through a transaction-scoped exception to immutable-history triggers. Ordinary history writes remain forbidden.

## Bounded acceptance

Run real local HTTP/PostgreSQL flows for Hearts Solo, Spades Solo and Spades Partners: complete hands, sealed passing, continuation/chance, replay, replacement and old reads. Exercise original advice, cross-owner denial, tab takeover, stale preparation, command reuse with changed input, two service instances, lost-response recovery, queued-work restart, expiration/cancellation and account erasure.

Verify strict public schemas from the existing generation pipeline, preserve old schema fragments and archived goldens, and compare complete prepared outputs to the original independent reference. Run the full Go suite, native race detector, vet, contract generation and relevant unchanged Node regressions. Keep failure evidence and distinguish intentional short-mode skips.

The known native database follow-up requires observable pool/begin/SQL/publication stages, forced lock/pool cancellation tests and post-cancellation cleanup. Do not lengthen timeouts to hide a failure or infer a capacity claim from test-suite duration. Run final database suites serially.

## Remaining M04 gates

The local API envelope is deliberately small and separately versioned. It does not supply the final existing-UI bootstrap/access/preferences/result envelope. The next slice is server-driven authored demo and exact-target offers/access resolution; platform/client integration and actual preserved-UI three-mode recovery follow. Hosting, live payments/providers, human review and strategy-strength claims remain deferred.

Actual results belong in [M04C evidence](../../../qa/implementation/multi-game/m04c/status.md), not this execution plan.

Carry into M06's actual service conformance: the M04C bootstrap/chance factory supports only the installed 52-card modes. Game-owned initialization/chance adapters must replace those current-catalog deck/dealer conventions before a different deck or the non-card fixture is registered. Preserve opaque module-owned chance and actual material in the durable record; a generic lifecycle interface alone does not establish this service-level capability.
