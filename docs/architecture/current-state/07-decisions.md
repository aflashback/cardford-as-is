# 07 — Architecture decision register

[Index](README.md) · [Review findings](08-review-and-evidence.md)

This register summarizes existing decisions and their implementation consequences. It does not approve new architecture, convert a proposal into an accepted decision, or rewrite historical ADRs. Where the source is an implementation plan or guide rather than a numbered decision, that distinction is explicit.

## Decisions reflected in current source

| Decision / authority | Description and rationale | Current consequence / tradeoff |
|---|---|---|
| [CR-ARCH-001](../../../planning/decisions/CR-ARCH-001-multi-game-production-boundary.md) | Registered game contracts, shared platform responsibilities and preserved historical interpretation; folder-only rearrangement would leave semantic coupling | Compiled installations and version pins; shared services do not own game-specific rules |
| [CR-ARCH-002](../../../planning/decisions/CR-ARCH-002-current-game-module-extraction.md) | Extract current games behind explicit module boundaries | Game-owned mechanics and observation/analysis adapters; new capabilities require typed implementations |
| [CR-ARCH-003](../../../planning/decisions/CR-ARCH-003-backend-stack-and-system-readiness.md) | Go/PostgreSQL target with preserved UI, protocols and history; Rust considered, Node retained as reference | Go gameplay authority and SQL persistence; compatibility readers and cross-language contracts add maintenance cost |
| [CR-ARCH-004](../../../planning/decisions/CR-ARCH-004-native-windows-performance.md) | Native Windows baseline for meaningful local performance work | Native Go/Node/PostgreSQL tools with pinned versions; measurements remain environment-specific |
| [CR-ARCH-005](../../../planning/decisions/CR-ARCH-005-local-realtime-and-server-bots.md) | HTTP authority plus local receive-only WebSocket; Go owns bot progression | Transactional projections/outbox, sequenced snapshot recovery, server runners; browser animation no longer drives bots |
| [CR-ARCH-006](../../../planning/decisions/CR-ARCH-006-pause-presence-and-expiry.md) | Separate pause, presence, connection and retention; SQL stays authoritative | Playback generations, foreground leases, fixed Free/Paid paused deadlines, indexed sweeping; Redis authority proposal withdrawn |
| [CR-ARCH-007](../../../planning/decisions/CR-ARCH-007-postgresql-only-game-authority.md) | Owner confirmed PostgreSQL-only authority and no Redis on 18 October | Retains current SQL authority for gameplay/history/archive; retention deferred; three-node SQL HA and Go affinity are planned, not implemented |
| [CR-STRAT-011](../../../planning/decisions/CR-STRAT-011-deterministic-feedback-lab.md) | Production bot decisions remain deterministic; offline model review is evidence only | No runtime model dependency for bots; deterministic advice and separate preview Coach must be described accurately |
| [CR-STRAT-012](../../../planning/decisions/CR-STRAT-012-offline-trix-scenario-collection.md) | Separately governed offline model-assisted Trix discovery | Collector is a separate toolchain; no automatic production promotion or collection-resume authority |
| [CR-GAME-001](../../../planning/decisions/CR-GAME-001-trix-four-variants.md) | Four Trix variants with explicit rules and competition | Seven current catalog variants overall; historical rules remain pinned |
| [16 October Keycloak implementation plan](../../superpowers/plans/2026-10-16-keycloak-local-auth.md), [AGENTS owner update](../../../AGENTS.md) and [setup guide](../../development/local-auth.md) | Separate real-auth local profile, preserving native gameplay services and existing fixture data | Dedicated Go entrypoint, Keycloak container, HTTPS gateways, isolated SQL; production identity lifecycle remains incomplete |

The local authentication implementation supersedes older statements that all identity is fixture-only. It does not make the earlier hosted-release plan complete. Likewise, the implemented realtime and lifecycle paths supersede earlier HTTP-only/browser-driven descriptions without implying a managed cloud channel exists.

## Architectural choices visible in code

These are descriptive implementation choices, not newly approved ADRs:

| Choice | Benefit | Cost or constraint |
|---|---|---|
| One modular Go process per local profile | Direct transactions and fewer deployed runtime components | Workers and connection subscriptions are process-local; multi-instance routing is not established |
| Checkpoint plus verified private journal and original decisions | Exact recovery/review and attribution | History verification and growing records can incur cost; benchmark representative long sessions |
| Closed generated public schemas | Shared validation across Go and TypeScript; explicit safe outputs | Generators and schema composition must evolve together |
| PostgreSQL outbox plus current safe projection | Commit and notification source remain consistent | Delivery requires bounded recovery and authorization; it is not a managed fanout service |
| Durable exact command intent and receipts | Safe retry after uncertain transport | Browser storage and original control material are required for some recovery paths |
| Distinct gameplay advice and Coach mock provider | UI can be developed while preserving original deterministic advice | Product presentation must not imply trained coaching or calibrated ratings |
| Auth orchestration partly in HTTP adapter | Reuses shared game service behind explicit auth restrictions | Session invalidation/identity-event responsibilities cross layers and need explicit future review |

See [components](02-components.md), [data](03-data-and-state.md), [gameplay](05-gameplay-sequences.md) and [identity](06-identity-sequences.md) for source links and diagrams supporting these observations.

## Decisions reserved for later architecture review

- **Hosted billing:** Paddle remains the selected planning direction. Checkout, verified provider lifecycle, webhook inbox/reconciliation and commercial entitlements are not implemented here. [Release design](../../superpowers/specs/2026-10-14-paddle-identity-release-design.md), [manual checklist](../../../planning/implementation/hosted-release/manual-setup-checklist.md).
- **Distributed hosting:** the [planned specification and implementation guide](../planned/README.md) consolidate three-node regional PostgreSQL HA and Go affinity. Multi-instance ownership, socket delivery, worker placement, deployment recovery and measured capacity remain unimplemented. The 100,000-player target is a target, not an observed capability.
- **Regional routing:** [CR-ARCH-008](../../../planning/decisions/CR-ARCH-008-stable-player-home-region.md) selects a stable home region across logins and confirms that affected players wait during whole-region outage. Regional provisioning/routing and asynchronous global reporting are planned, not current runtime capability; no automatic cross-region game failover or whole-region zero-loss claim is selected.
- **Redis:** excluded by CR-ARCH-007, superseding CR-ARCH-006's earlier transient-cache investigation allowance. History and score-retention policy remains deferred.
- **Production identity:** local Keycloak proves a development integration path, not a final worldwide identity topology. Social connections, MFA/recovery acceptance, linking, provider events, erasure and regional isolation remain distinct work.
- **Staff administration:** no separate staff portal or independent staff identity system is established by the runtime reviewed here. Consumer Paid status does not confer administration privileges.
- **Strategy and coaching quality:** code correctness and reproducible evidence do not establish stronger play, optimal recommendations or learning outcomes.

Future proposals should link to a specific current component, state owner or sequence in this folder and identify what would change. Existing historical decisions should remain readable with clear supersession notes.
